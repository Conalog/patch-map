#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SMOKE = process.argv.includes('--smoke');
const SIZE = 5_000;
const SEED = 319;
const UPDATE_COUNT = 6;
const UPDATE_INTERVAL_MS = 75;
const WARMUPS = SMOKE ? 0 : 2;
const MEASURED = SMOKE ? 1 : 7;
const PROFILES = Object.freeze(
  (SMOKE
    ? [{ id: 'chromium-headless-1x', cpuThrottleRate: 1 }]
    : [
        { id: 'chromium-headless-1x', cpuThrottleRate: 1 },
        { id: 'chromium-headless-4x', cpuThrottleRate: 4 },
      ]).map((profile) => Object.freeze(profile)),
);
const OUTPUT_PATH = path.resolve(
  process.env.PATCH_MAP_BAR_RETARGET_PERF_OUTPUT
    ?? path.join(
      ROOT,
      'performance/patch-map/results/bar-retarget-latest.json',
    ),
);

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function stats(values, label) {
  if (
    values.length === 0 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`${label} must contain finite non-negative samples`);
  }
  return Object.freeze({
    samples: Object.freeze([...values]),
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}

async function configure(page, trial) {
  await page.goto(
    `lab/patch-map/?scenario=REN-009&size=${SIZE}&seed=${SEED + trial}`,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await page.waitForFunction(
    () => window.__PATCH_MAP_MANUAL_LAB__?.state().status === 'ready',
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('[data-manual-animation-duration]').fill('2000');
  await page.locator('[data-manual-command="animation-duration"]').click();
  await page.waitForFunction(
    () => window.__PATCH_MAP_MANUAL_LAB__?.state().status === 'ready',
    undefined,
    { timeout: 60_000 },
  );
}

async function runTrial(page, trial) {
  await configure(page, trial);
  await page.locator('[data-manual-mode="pan"]').click();
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error(`trial ${trial} canvas has no bounds`);
  const startX = box.x + box.width * 0.55;
  const startY = box.y + box.height * 0.55;
  const viewportBefore = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.engine().viewportProbe());
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.evaluate(() => {
    const sample = {
      stopped: false,
      raf: [],
      longTasks: [],
      observer: null,
    };
    const observer = new PerformanceObserver((list) => {
      sample.longTasks.push(...list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration,
      })));
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
      sample.observer = observer;
    } catch {
      // Long-task observation is diagnostic; rAF gaps remain normative.
    }
    const tick = (time) => {
      sample.raf.push(time);
      if (!sample.stopped) requestAnimationFrame(tick);
    };
    window.__PATCH_MAP_BAR_RETARGET_SAMPLE__ = sample;
    requestAnimationFrame(tick);
  });

  const actions = [];
  for (let iteration = 0; iteration < UPDATE_COUNT; iteration += 1) {
    actions.push(await page.evaluate(async (iteration) => {
      const bridge = window.__PATCH_MAP_MANUAL_LAB__;
      const engine = bridge.engine();
      const started = performance.now();
      const result = await bridge.run('animate-all');
      const wallMs = performance.now() - started;
      return {
        wallMs,
        status: result.status,
        appliedCount: result.applied.length,
        activeAnimations: engine.activeAnimations,
        transaction: engine.transactionPerformanceProbe(),
      };
    }, iteration));
    await page.mouse.move(
      startX + (iteration + 1) * 12,
      startY + (iteration + 1) * 7,
      { steps: 2 },
    );
    await page.waitForTimeout(UPDATE_INTERVAL_MS);
  }

  await page.waitForTimeout(400);
  const sample = await page.evaluate(() => {
    const current = window.__PATCH_MAP_BAR_RETARGET_SAMPLE__;
    current.stopped = true;
    current.observer?.disconnect();
    delete window.__PATCH_MAP_BAR_RETARGET_SAMPLE__;
    return {
      raf: current.raf,
      longTasks: current.longTasks,
      activeAnimations: window.__PATCH_MAP_MANUAL_LAB__.engine().activeAnimations,
    };
  });
  await page.mouse.up();
  const viewportAfter = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.engine().viewportProbe());
  await page.waitForFunction(
    () => window.__PATCH_MAP_MANUAL_LAB__?.state().activeAnimations === 0,
    undefined,
    { timeout: 20_000 },
  );
  const settled = await page.evaluate(() => {
    const bridge = window.__PATCH_MAP_MANUAL_LAB__;
    const engine = bridge.engine();
    const started = performance.now();
    const snapshot = engine.snapshot();
    return {
      semanticHash: snapshot.semanticHash,
      digestObservationMs: performance.now() - started,
      history: engine.historyState(),
      state: bridge.state(),
    };
  });
  const gaps = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
  const cleanup = await page.evaluate(async () => {
    await window.__PATCH_MAP_MANUAL_LAB__.destroy();
    return {
      canvasCount: document.querySelectorAll(
        '[data-testid="manual-canvas-host"] canvas',
      ).length,
      bridgeRemoved: window.__PATCH_MAP_MANUAL_LAB__ === undefined,
    };
  });
  return Object.freeze({
    trial,
    actions: Object.freeze(actions),
    actionMs: Object.freeze(actions.map(({ wallMs }) => wallMs)),
    repeatedActionMs: Object.freeze(actions.slice(1).map(({ wallMs }) => wallMs)),
    rafGapsMs: Object.freeze(gaps),
    longTasks: Object.freeze(sample.longTasks),
    activeAnimationsDuringSample: sample.activeAnimations,
    viewportDelta: Object.freeze([
      viewportAfter.centerWorld[0] - viewportBefore.centerWorld[0],
      viewportAfter.centerWorld[1] - viewportBefore.centerWorld[1],
    ]),
    settled: Object.freeze(settled),
    cleanup: Object.freeze(cleanup),
  });
}

function validateTrial(trial, label) {
  const failures = [];
  if (trial.actions.length !== UPDATE_COUNT) {
    failures.push(`${label} did not execute ${UPDATE_COUNT} updates`);
  }
  for (const action of trial.actions) {
    if (action.status !== 'committed') failures.push(`${label} update did not commit`);
    if (action.appliedCount <= 0) failures.push(`${label} update applied no bars`);
    if (action.activeAnimations <= 0) failures.push(`${label} update did not animate`);
  }
  if (Math.hypot(...trial.viewportDelta) < 10) {
    failures.push(`${label} viewport did not move during repeated updates`);
  }
  if (trial.rafGapsMs.length < 3) failures.push(`${label} rAF sample was too short`);
  if (trial.activeAnimationsDuringSample <= 0) {
    failures.push(`${label} animation settled before repeated-update sampling ended`);
  }
  if (!trial.settled.semanticHash?.startsWith('fnv1a64:')) {
    failures.push(`${label} exact semantic hash was not observable after settle`);
  }
  if (trial.settled.state.activeAnimations !== 0) {
    failures.push(`${label} animation did not settle`);
  }
  if (trial.cleanup.canvasCount !== 0 || !trial.cleanup.bridgeRemoved) {
    failures.push(`${label} Lab lifecycle cleanup failed`);
  }
  return failures;
}

function summarize(trials, label) {
  return Object.freeze({
    firstActionMs: stats(
      trials.map(({ actionMs }) => actionMs[0]),
      `${label}/firstActionMs`,
    ),
    repeatedActionMedianMs: stats(
      trials.map(({ repeatedActionMs }) => percentile(repeatedActionMs, 0.5)),
      `${label}/repeatedActionMedianMs`,
    ),
    repeatedActionP95Ms: stats(
      trials.map(({ repeatedActionMs }) => percentile(repeatedActionMs, 0.95)),
      `${label}/repeatedActionP95Ms`,
    ),
    rafGapP95Ms: stats(
      trials.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.95)),
      `${label}/rafGapP95Ms`,
    ),
    rafGapMaxMs: stats(
      trials.map(({ rafGapsMs }) => Math.max(0, ...rafGapsMs)),
      `${label}/rafGapMaxMs`,
    ),
    longTaskCount: stats(
      trials.map(({ longTasks }) => longTasks.length),
      `${label}/longTaskCount`,
    ),
    digestObservationMs: stats(
      trials.map(({ settled }) => settled.digestObservationMs),
      `${label}/digestObservationMs`,
    ),
  });
}

const server = await createServer({
  root: ROOT,
  configFile: path.join(ROOT, 'vite.patch-map-lab.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;
try {
  await server.listen();
  const baseURL = server.resolvedUrls?.local?.[0];
  if (!baseURL) throw new Error('missing local Lab URL');
  browser = await chromium.launch({ headless: true });
  const profiles = [];
  const failures = [];
  for (const profile of PROFILES) {
    const page = await browser.newPage({
      baseURL,
      viewport: { width: 1_440, height: 1_000 },
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: profile.cpuThrottleRate,
    });
    const warmupRaw = [];
    const measuredRaw = [];
    for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
      const result = await runTrial(page, trial);
      if (trial < WARMUPS) warmupRaw.push(result);
      else measuredRaw.push(result);
      failures.push(...validateTrial(result, `${profile.id}/trial-${trial}`));
    }
    const summary = summarize(measuredRaw, profile.id);
    const actionBudget = profile.cpuThrottleRate === 1 ? 250 : 900;
    const rafBudget = profile.cpuThrottleRate === 1 ? 400 : 1_200;
    if (summary.repeatedActionP95Ms.p95 > actionBudget) {
      failures.push(
        `${profile.id} repeated action p95 ${summary.repeatedActionP95Ms.p95}`
        + ` exceeded ${actionBudget}`,
      );
    }
    if (summary.rafGapP95Ms.p95 > rafBudget) {
      failures.push(
        `${profile.id} rAF gap p95 ${summary.rafGapP95Ms.p95}`
        + ` exceeded ${rafBudget}`,
      );
    }
    profiles.push(Object.freeze({
      ...profile,
      warmupRaw: Object.freeze(warmupRaw),
      measuredRaw: Object.freeze(measuredRaw),
      summary,
    }));
    await page.close();
  }

  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-repeated-bar-retarget',
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      size: SIZE,
      seed: SEED,
      updateCount: UPDATE_COUNT,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      animationDurationMs: 2_000,
      warmups: WARMUPS,
      measured: MEASURED,
      headless: true,
      windowsNative: 'pending',
    }),
    environment: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: os.cpus().length,
      browser: 'playwright chromium',
    }),
    profiles: Object.freeze(profiles),
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures: Object.freeze(failures),
  });
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output: OUTPUT_PATH,
    status: output.status,
    profiles: profiles.map(({ id, summary }) => ({ id, summary })),
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}
