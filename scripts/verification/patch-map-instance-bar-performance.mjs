#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SMOKE = process.argv.includes('--smoke');
const SIZES = (process.env.PATCH_MAP_INSTANCE_BAR_SIZES ?? '5000,10000')
  .split(',')
  .map((value) => Number.parseInt(value, 10));
if (SIZES.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
  throw new Error('PATCH_MAP_INSTANCE_BAR_SIZES must contain positive integers');
}
const WARMUPS = SMOKE ? 0 : 2;
const MEASURED = SMOKE ? 1 : 7;
const UPDATE_COUNT = 6;
const UPDATE_INTERVAL_MS = 75;
const OUTPUT_PATH = path.resolve(
  process.env.PATCH_MAP_INSTANCE_BAR_OUTPUT
    ?? path.join(ROOT, '.perf-results/patch-map/instance-bar-latest.json'),
);

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function stats(values) {
  return Object.freeze({
    samples: Object.freeze([...values]),
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}

async function configure(page, size, trial) {
  await page.goto(
    `lab/patch-map/?scenario=REN-009&size=100&seed=${319 + trial}`,
    { waitUntil: 'networkidle', timeout: 120_000 },
  );
  await page.waitForFunction(
    () => window.__PATCH_MAP_MANUAL_LAB__?.state().status === 'ready',
    undefined,
    { timeout: 120_000 },
  );
  const configured = await page.evaluate((recordCount) => {
    const bridge = window.__PATCH_MAP_MANUAL_LAB__;
    const engine = bridge.engine();
    const columns = 100;
    const rows = Math.ceil(recordCount / columns);
    const cells = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) =>
        row * columns + column < recordCount ? 1 : 0));
    const dataset = [{
      type: 'grid',
      id: 'perf-grid',
      cells,
      gap: 2,
      item: {
        size: { width: 34, height: 46 },
        components: [{
          type: 'bar',
          id: 'level',
          source: { type: 'rect', fill: '#4f46e5' },
          size: { width: 24, height: 8 },
          placement: 'bottom',
          animation: true,
          animationDuration: 2_000,
        }],
      },
    }];
    const targets = Array.from({ length: recordCount }, (_, index) => ({
      id: `perf-grid.${Math.floor(index / columns)}.${index % columns}`,
      componentId: 'level',
    }));
    const loaded = engine.loadDataset(dataset);
    engine.fitViewport({ paddingCssPx: 24 });
    window.__PATCH_MAP_INSTANCE_BAR_PERF__ = { targets };
    return {
      rootIds: loaded.rootIds,
      targetCount: targets.length,
      semanticHash: engine.snapshot().semanticHash,
      sceneRevision: engine.snapshot().revisions.sceneRevision,
    };
  }, size);
  if (configured.targetCount !== size || configured.rootIds[0] !== 'perf-grid') {
    throw new Error(`failed to configure ${size} grid instances`);
  }
  await page.locator('[data-manual-mode="pan"]').click();
  await page.waitForTimeout(100);
  return configured;
}

async function runTrial(page, size, trial) {
  const configured = await configure(page, size, trial);
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('manual canvas has no bounds');
  const startX = box.x + box.width * 0.55;
  const startY = box.y + box.height * 0.55;
  const viewportBefore = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.engine().viewportProbe());
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.evaluate(() => {
    const sample = { stopped: false, raf: [], longTasks: [], observer: null };
    const observer = new PerformanceObserver((list) => {
      sample.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
      sample.observer = observer;
    } catch {
      // rAF gaps remain available when long-task observation is unsupported.
    }
    const tick = (time) => {
      sample.raf.push(time);
      if (!sample.stopped) requestAnimationFrame(tick);
    };
    window.__PATCH_MAP_INSTANCE_BAR_SAMPLE__ = sample;
    requestAnimationFrame(tick);
  });

  const actions = [];
  for (let iteration = 0; iteration < UPDATE_COUNT; iteration += 1) {
    actions.push(await page.evaluate((sequence) => {
      const engine = window.__PATCH_MAP_MANUAL_LAB__.engine();
      const targets = window.__PATCH_MAP_INSTANCE_BAR_PERF__.targets;
      const heights = new Float64Array(targets.length);
      for (let index = 0; index < heights.length; index += 1) {
        heights[index] = 5 + ((index * 17 + sequence * 23) % 37);
      }
      const before = engine.snapshot().revisions;
      const started = performance.now();
      const result = engine.updateInstanceBarHeights({ targets, heights });
      return {
        wallMs: performance.now() - started,
        status: result.status,
        appliedCount: result.appliedTargets.length,
        overlayCount: result.overlayCount,
        activeAnimations: result.activeAnimationCount,
        sceneRevisionDelta:
          result.revisions.sceneRevision - before.sceneRevision,
      };
    }, iteration + 1));
    await page.mouse.move(
      startX + (iteration + 1) * 12,
      startY + (iteration + 1) * 7,
      { steps: 2 },
    );
    await page.waitForTimeout(UPDATE_INTERVAL_MS);
  }
  await page.waitForTimeout(400);
  const sample = await page.evaluate(() => {
    const current = window.__PATCH_MAP_INSTANCE_BAR_SAMPLE__;
    current.stopped = true;
    current.observer?.disconnect();
    delete window.__PATCH_MAP_INSTANCE_BAR_SAMPLE__;
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
    () => window.__PATCH_MAP_MANUAL_LAB__.engine().activeAnimations === 0,
    undefined,
    { timeout: 60_000 },
  );
  const settled = await page.evaluate(() => {
    const engine = window.__PATCH_MAP_MANUAL_LAB__.engine();
    return {
      semanticHash: engine.snapshot().semanticHash,
      sceneRevision: engine.snapshot().revisions.sceneRevision,
    };
  });
  const gaps = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
  const cleanup = await page.evaluate(async () => {
    delete window.__PATCH_MAP_INSTANCE_BAR_PERF__;
    await window.__PATCH_MAP_MANUAL_LAB__.destroy();
    return document.querySelectorAll('[data-testid="manual-canvas-host"] canvas').length;
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
    configured,
    settled,
    cleanupCanvasCount: cleanup,
  });
}

function validateTrial(value, size) {
  const failures = [];
  for (const action of value.actions) {
    if (action.status !== 'committed') failures.push(`${size}: update was not committed`);
    if (action.appliedCount !== size) failures.push(`${size}: applied count mismatch`);
    if (action.overlayCount !== size) failures.push(`${size}: overlay count mismatch`);
    if (action.activeAnimations < Math.floor(size * 0.95)) {
      failures.push(`${size}: animation count mismatch`);
    }
    if (action.sceneRevisionDelta !== 0) failures.push(`${size}: authored scene revision changed`);
  }
  if (value.configured.semanticHash !== value.settled.semanticHash) {
    failures.push(`${size}: authored semantic hash changed`);
  }
  if (value.configured.sceneRevision !== value.settled.sceneRevision) {
    failures.push(`${size}: authored scene revision changed after settle`);
  }
  if (Math.hypot(...value.viewportDelta) < 10) failures.push(`${size}: viewport did not move`);
  if (value.activeAnimationsDuringSample <= 0) failures.push(`${size}: animation settled early`);
  if (value.cleanupCanvasCount !== 0) failures.push(`${size}: canvas cleanup failed`);
  return failures;
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
  const runs = [];
  const failures = [];
  for (const size of SIZES) {
    const warmupRaw = [];
    const measuredRaw = [];
    for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
      const page = await browser.newPage({
        baseURL,
        viewport: { width: 1_440, height: 1_000 },
      });
      const value = await runTrial(page, size, trial);
      failures.push(...validateTrial(value, size));
      (trial < WARMUPS ? warmupRaw : measuredRaw).push(value);
      await page.close();
    }
    const summary = Object.freeze({
      firstActionMs: stats(measuredRaw.map(({ actionMs }) => actionMs[0])),
      repeatedActionP95Ms: stats(measuredRaw.map(({ repeatedActionMs }) =>
        percentile(repeatedActionMs, 0.95))),
      rafGapP95Ms: stats(measuredRaw.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.95))),
      rafGapMaxMs: stats(measuredRaw.map(({ rafGapsMs }) => Math.max(0, ...rafGapsMs))),
      longTaskCount: stats(measuredRaw.map(({ longTasks }) => longTasks.length)),
    });
    runs.push(Object.freeze({ size, warmupRaw, measuredRaw, summary }));
  }
  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-grid-instance-bar-overlay',
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      sizes: SIZES,
      updateCount: UPDATE_COUNT,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      animationDurationMs: 2_000,
      warmups: WARMUPS,
      measured: MEASURED,
      headless: true,
      backend: 'webgl2',
      windowsNative: 'pending',
    }),
    environment: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      browser: 'playwright chromium',
    }),
    runs: Object.freeze(runs),
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures: Object.freeze(failures),
  });
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output: OUTPUT_PATH,
    status: output.status,
    runs: runs.map(({ size, summary }) => ({ size, summary })),
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}
