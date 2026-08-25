#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SMOKE = process.argv.includes('--smoke');
const PROFILE = process.env.PATCH_MAP_INSTANCE_BAR_PROFILE === '1';
const WORKLOAD = process.env.PATCH_MAP_INSTANCE_BAR_WORKLOAD ?? 'presentation';
if (WORKLOAD !== 'height' && WORKLOAD !== 'presentation') {
  throw new Error('PATCH_MAP_INSTANCE_BAR_WORKLOAD must be height or presentation');
}
const SIZES = (process.env.PATCH_MAP_INSTANCE_BAR_SIZES ?? '5000,10000')
  .split(',')
  .map((value) => Number.parseInt(value, 10));
if (SIZES.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
  throw new Error('PATCH_MAP_INSTANCE_BAR_SIZES must contain positive integers');
}
const ANIMATION_POLICIES = (
  process.env.PATCH_MAP_INSTANCE_BAR_ANIMATION_POLICIES ?? 'uniform'
).split(',');
if (
  ANIMATION_POLICIES.length === 0 ||
  ANIMATION_POLICIES.some((value) => value !== 'uniform' && value !== 'mixed')
) {
  throw new Error(
    'PATCH_MAP_INSTANCE_BAR_ANIMATION_POLICIES must contain uniform or mixed',
  );
}
const WARMUPS = SMOKE
  ? 0
  : Number.parseInt(process.env.PATCH_MAP_INSTANCE_BAR_WARMUPS ?? '2', 10);
const MEASURED = SMOKE
  ? 1
  : Number.parseInt(process.env.PATCH_MAP_INSTANCE_BAR_MEASURED ?? '7', 10);
if (
  !Number.isSafeInteger(WARMUPS) || WARMUPS < 0 ||
  !Number.isSafeInteger(MEASURED) || MEASURED <= 0
) {
  throw new Error('performance warmups/measured counts must be non-negative/positive integers');
}
const UPDATE_COUNT = 6;
const UPDATE_INTERVAL_MS = 75;
const OUTPUT_PATH = path.resolve(
  process.env.PATCH_MAP_INSTANCE_BAR_OUTPUT
    ?? path.join(
      ROOT,
      `.perf-results/patch-map/instance-${WORKLOAD}-latest.json`,
    ),
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

function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfUsByNode = new Map();
  for (let index = 0; index < profile.samples.length; index += 1) {
    const nodeId = profile.samples[index];
    selfUsByNode.set(
      nodeId,
      (selfUsByNode.get(nodeId) ?? 0) + (profile.timeDeltas[index] ?? 0),
    );
  }
  return Object.freeze([...selfUsByNode]
    .map(([nodeId, selfUs]) => {
      const frame = nodes.get(nodeId)?.callFrame;
      return frame === undefined ? null : Object.freeze({
        functionName: frame.functionName || '(anonymous)',
        url: frame.url,
        lineNumber: frame.lineNumber + 1,
        selfMs: selfUs / 1_000,
      });
    })
    .filter((entry) => entry !== null && entry.functionName !== '(idle)')
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, 30));
}

async function configure(page, size, trial) {
  await page.goto(
    `lab/patch-map?scenario=REN-009&size=100&seed=${319 + trial}`,
    { waitUntil: 'networkidle', timeout: 120_000 },
  );
  await page.waitForFunction(
    () => window.__PATCH_MAP_MANUAL_LAB__?.state().status === 'ready',
    undefined,
    { timeout: 120_000 },
  );
  const configured = await page.evaluate(({ recordCount, workload }) => {
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
        components: [
          {
            type: 'bar',
            id: 'level',
            source: { type: 'rect', fill: '#ffffff', radius: 3 },
            tint: '#4f46e5',
            size: { width: 24, height: 8 },
            placement: 'bottom',
            animation: true,
            animationDuration: 2_000,
          },
          ...(workload === 'presentation' ? [{
            type: 'icon',
            id: 'status',
            source: 'wifi',
            tint: '#ffffff',
            size: { width: 12, height: 12 },
            placement: 'center',
            show: false,
          }] : []),
        ],
      },
    }];
    const mountStarted = performance.now();
    const loaded = engine.loadDataset(dataset);
    const mountMs = performance.now() - mountStarted;
    engine.fitViewport({ paddingCssPx: 24 });
    const targets = engine.targets.query({
      within: 'perf-grid',
      type: 'grid-cell',
      scope: 'instances',
    });
    window.__PATCH_MAP_INSTANCE_BAR_PERF__ = { targets };
    return {
      rootIds: loaded.rootIds,
      targetCount: targets.count,
      semanticHash: engine.snapshot().semanticHash,
      sceneRevision: engine.snapshot().revisions.sceneRevision,
      mountMs,
    };
  }, { recordCount: size, workload: WORKLOAD });
  if (configured.targetCount !== size || configured.rootIds[0] !== 'perf-grid') {
    throw new Error(
      `failed to configure ${size} grid instances: ${JSON.stringify(configured)}`,
    );
  }
  await page.locator('[data-manual-mode="pan"]').click();
  await page.waitForTimeout(100);
  return configured;
}

async function runTrial(page, size, trial, cdp, animationPolicy) {
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
  if (cdp !== null) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
  }

  const actions = [];
  for (let iteration = 0; iteration < UPDATE_COUNT; iteration += 1) {
    actions.push(await page.evaluate(({ sequence, workload, policy }) => {
      const engine = window.__PATCH_MAP_MANUAL_LAB__.engine();
      const targets = window.__PATCH_MAP_INSTANCE_BAR_PERF__.targets;
      const heights = new Float64Array(targets.count);
      const barTints = workload === 'presentation' ? new Array(targets.count) : null;
      const iconShows = workload === 'presentation' ? new Array(targets.count) : null;
      const iconSources = workload === 'presentation' ? new Array(targets.count) : null;
      const iconTints = workload === 'presentation' ? new Array(targets.count) : null;
      for (let index = 0; index < heights.length; index += 1) {
        heights[index] = 5 + ((index * 17 + sequence * 23) % 37);
        if (workload === 'presentation') {
          barTints[index] = (index + sequence) % 2 === 0 ? '#2563eb' : '#7c3aed';
          iconShows[index] = false;
          iconSources[index] = 'wifi';
          iconTints[index] = (index + sequence) % 2 === 0 ? '#ef4444' : '#f97316';
        }
      }
      const animate = policy === 'uniform'
        ? true
        : Array.from({ length: targets.count }, (_value, index) =>
            (index + sequence) % 2 === 0);
      const before = engine.snapshot().revisions;
      const started = performance.now();
      const result = workload === 'height'
        ? engine.updateBatch({
            targets,
            bar: { componentId: 'level', height: heights },
          }, { animate })
        : engine.updateBatch({
            targets,
            bar: {
              componentId: 'level',
              height: heights,
              changes: { tint: barTints },
            },
            icon: {
              componentId: 'status',
              changes: {
                show: iconShows,
                source: iconSources,
                tint: iconTints,
              },
            },
          }, { animate });
      const after = engine.snapshot().revisions;
      return {
        wallMs: performance.now() - started,
        status: result.status,
        appliedCount: result.appliedCount,
        activeAnimations: engine.activeAnimations,
        sceneRevisionDelta:
          after.sceneRevision - before.sceneRevision,
        requestedAnimationCount: policy === 'uniform'
          ? targets.count
          : Math.floor(targets.count / 2),
      };
    }, { sequence: iteration + 1, workload: WORKLOAD, policy: animationPolicy }));
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
  const cpuProfile = cdp === null
    ? null
    : summarizeCpuProfile((await cdp.send('Profiler.stop')).profile);
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
    animationPolicy,
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
    cpuProfile,
  });
}

function validateTrial(value, size, animationPolicy) {
  const failures = [];
  for (const action of value.actions) {
    if (action.status !== 'committed') failures.push(`${size}: update was not committed`);
    const expectedApplied = WORKLOAD === 'height' ? size : size * 2;
    if (action.appliedCount !== expectedApplied) failures.push(`${size}: applied count mismatch`);
    const minimumActive = animationPolicy === 'uniform'
      ? Math.floor(size * 0.95)
      : Math.floor(size * 0.45);
    const maximumActive = animationPolicy === 'uniform'
      ? size
      : Math.ceil(size * 0.55);
    if (action.activeAnimations < minimumActive || action.activeAnimations > maximumActive) {
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
  for (const [sizeIndex, size] of SIZES.entries()) {
    const policies = sizeIndex % 2 === 0
      ? ANIMATION_POLICIES
      : [...ANIMATION_POLICIES].reverse();
    for (const animationPolicy of policies) {
      const warmupRaw = [];
      const measuredRaw = [];
      for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
        const page = await browser.newPage({
          baseURL,
          viewport: { width: 1_440, height: 1_000 },
        });
        const cdp = PROFILE && trial >= WARMUPS
          ? await page.context().newCDPSession(page)
          : null;
        const value = await runTrial(page, size, trial, cdp, animationPolicy);
        await cdp?.detach();
        failures.push(...validateTrial(value, size, animationPolicy));
        (trial < WARMUPS ? warmupRaw : measuredRaw).push(value);
        await page.close();
      }
      const summary = Object.freeze({
        mountMs: stats(measuredRaw.map(({ configured }) => configured.mountMs)),
        firstActionMs: stats(measuredRaw.map(({ actionMs }) => actionMs[0])),
        repeatedActionP95Ms: stats(measuredRaw.map(({ repeatedActionMs }) =>
          percentile(repeatedActionMs, 0.95))),
        rafGapP50Ms: stats(measuredRaw.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.5))),
        rafGapP95Ms: stats(measuredRaw.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.95))),
        rafGapMaxMs: stats(measuredRaw.map(({ rafGapsMs }) => Math.max(0, ...rafGapsMs))),
        longTaskCount: stats(measuredRaw.map(({ longTasks }) => longTasks.length)),
        longTaskMaxMs: stats(measuredRaw.map(({ longTasks }) => Math.max(0, ...longTasks))),
      });
      runs.push(Object.freeze({ size, animationPolicy, warmupRaw, measuredRaw, summary }));
    }
  }
  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: `patch-map-grid-instance-${WORKLOAD}-overlay`,
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      sizes: SIZES,
      workload: WORKLOAD,
      animationPolicies: ANIMATION_POLICIES,
      updateCount: UPDATE_COUNT,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      animationDurationMs: 2_000,
      warmups: WARMUPS,
      measured: MEASURED,
      headless: true,
      cpuProfile: PROFILE,
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
    runs: runs.map(({ size, animationPolicy, summary }) => ({
      size,
      animationPolicy,
      summary,
    })),
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}
