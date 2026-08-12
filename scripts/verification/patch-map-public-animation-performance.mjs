#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SIZES = parsePositiveIntegers(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_SIZES ?? '349,5000,10000',
  'PATCH_MAP_PUBLIC_ANIMATION_SIZES',
);
const WARMUPS = positiveInteger(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_WARMUPS ?? '2',
  'PATCH_MAP_PUBLIC_ANIMATION_WARMUPS',
  true,
);
const MEASURED = positiveInteger(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_MEASURED ?? '7',
  'PATCH_MAP_PUBLIC_ANIMATION_MEASURED',
);
const UPDATE_COUNT = positiveInteger(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_UPDATES ?? '6',
  'PATCH_MAP_PUBLIC_ANIMATION_UPDATES',
);
const UPDATE_INTERVAL_MS = positiveInteger(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_INTERVAL_MS ?? '35',
  'PATCH_MAP_PUBLIC_ANIMATION_INTERVAL_MS',
  true,
);
const ANIMATION_DURATION_MS = positiveInteger(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_DURATION_MS ?? '200',
  'PATCH_MAP_PUBLIC_ANIMATION_DURATION_MS',
  true,
);
const PIXEL_RATIO = positiveFinite(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_PIXEL_RATIO ?? '1.5',
  'PATCH_MAP_PUBLIC_ANIMATION_PIXEL_RATIO',
);
const ANTIALIAS = process.env.PATCH_MAP_PUBLIC_ANIMATION_ANTIALIAS !== '0';
const PROFILE = process.env.PATCH_MAP_PUBLIC_ANIMATION_PROFILE === '1';
const OUTPUT_PATH = path.resolve(
  process.env.PATCH_MAP_PUBLIC_ANIMATION_OUTPUT
    ?? path.join(ROOT, '.perf-results/patch-map/public-animation-latest.json'),
);

function positiveInteger(value, name, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new TypeError(`${name} must be ${allowZero ? 'nonnegative' : 'positive'} integer`);
  }
  return parsed;
}

function positiveFinite(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError(`${name} must be positive and finite`);
  }
  return parsed;
}

function parsePositiveIntegers(value, name) {
  const parsed = value.split(',').map((entry) => positiveInteger(entry.trim(), name));
  if (parsed.length === 0) throw new TypeError(`${name} must not be empty`);
  return parsed;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function stats(values) {
  return Object.freeze({
    samples: values.length,
    min: values.length === 0 ? 0 : Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length === 0 ? 0 : Math.max(...values),
  });
}

function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parents.set(child, node.id);
  }
  const timings = new Map();
  const add = (nodeId, field, deltaUs) => {
    const current = timings.get(nodeId) ?? { selfUs: 0, inclusiveUs: 0 };
    current[field] += deltaUs;
    timings.set(nodeId, current);
  };
  for (let index = 0; index < profile.samples.length; index += 1) {
    const nodeId = profile.samples[index];
    const deltaUs = profile.timeDeltas[index] ?? 0;
    add(nodeId, 'selfUs', deltaUs);
    let ancestor = nodeId;
    while (ancestor !== undefined) {
      add(ancestor, 'inclusiveUs', deltaUs);
      ancestor = parents.get(ancestor);
    }
  }
  return Object.freeze([...timings]
    .map(([nodeId, timing]) => {
      const frame = nodes.get(nodeId)?.callFrame;
      return frame === undefined ? null : Object.freeze({
        functionName: frame.functionName || '(anonymous)',
        url: frame.url,
        lineNumber: frame.lineNumber + 1,
        selfMs: timing.selfUs / 1_000,
        inclusiveMs: timing.inclusiveUs / 1_000,
      });
    })
    .filter((entry) => entry !== null && entry.functionName !== '(idle)')
    .sort((left, right) => right.inclusiveMs - left.inclusiveMs)
    .slice(0, 40));
}

async function mountFixture(page, size, trial) {
  await page.goto('/scripts/verification/patch-map-public-animation-performance.html', {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__?.PatchMap !== undefined,
    undefined,
    { timeout: 120_000 },
  );
  return page.evaluate(async ({
    recordCount,
    durationMs,
    pixelRatio,
    antialias,
    sequence,
  }) => {
    const { PatchMap } = window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__;
    const host = document.querySelector('#patch-map-performance-host');
    Object.assign(host.style, {
      width: '800px',
      height: '600px',
      overflow: 'hidden',
    });
    const columns = Math.min(100, Math.ceil(Math.sqrt(recordCount)));
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
          source: { type: 'rect', fill: '#ffffff', radius: 3 },
          tint: '#4f46e5',
          size: { width: 24, height: 8 },
          placement: 'bottom',
          animation: true,
          animationDuration: durationMs,
        }],
      },
    }];
    const mountStarted = performance.now();
    const map = await PatchMap.mount({
      instanceId: `public-animation-${recordCount}-${sequence}`,
      container: host,
      width: 800,
      height: 600,
      pixelRatio,
      antialias,
      backend: 'webgl',
      powerPreference: 'high-performance',
      resizeMode: 'manual',
      data: dataset,
      fit: { padding: 24 },
    });
    const mountMs = performance.now() - mountStarted;
    const targets = map.targets.query({
      within: 'perf-grid',
      type: 'grid-cell',
      scope: 'instances',
    });
    const snapshot = map.debug.snapshot();
    window.__PATCH_MAP_PUBLIC_ANIMATION_PERF__ = { map, targets };
    return {
      mountMs,
      targetCount: targets.count,
      semanticHash: snapshot.semanticHash,
      sceneRevision: snapshot.revisions.sceneRevision,
      frameRevision: snapshot.frameRevision,
      renderer: snapshot.resources.renderer,
      visiblePrimitiveCount: snapshot.resources.rendering.visiblePrimitiveCount,
    };
  }, {
    recordCount: size,
    durationMs: ANIMATION_DURATION_MS,
    pixelRatio: PIXEL_RATIO,
    antialias: ANTIALIAS,
    sequence: trial,
  });
}

async function runTrial(page, size, trial, cdp) {
  const mounted = await mountFixture(page, size, trial);
  if (mounted.targetCount !== size) {
    throw new Error(`expected ${size} targets, received ${mounted.targetCount}`);
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  if (cdp !== null) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
  }
  await page.evaluate(() => {
    const sample = { stopped: false, raf: [], longTasks: [], observer: null };
    const observer = new PerformanceObserver((list) => {
      sample.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
      sample.observer = observer;
    } catch {
      // rAF gaps remain authoritative when Long Task observation is unavailable.
    }
    const tick = (time) => {
      sample.raf.push(time);
      if (!sample.stopped) requestAnimationFrame(tick);
    };
    window.__PATCH_MAP_PUBLIC_ANIMATION_SAMPLE__ = sample;
    requestAnimationFrame(tick);
  });

  const actions = [];
  for (let sequence = 0; sequence < UPDATE_COUNT; sequence += 1) {
    actions.push(await page.evaluate(({ actionSequence }) => {
      const { map, targets } = window.__PATCH_MAP_PUBLIC_ANIMATION_PERF__;
      const heights = new Float64Array(targets.count);
      for (let index = 0; index < heights.length; index += 1) {
        heights[index] = 5 + ((index * 17 + actionSequence * 23) % 37);
      }
      const updateStarted = performance.now();
      const result = map.updateBatch({
        targets,
        bar: { componentId: 'level', height: heights },
      }, { animate: true });
      const updateMs = performance.now() - updateStarted;
      const viewportStarted = performance.now();
      map.viewport.panBy([actionSequence % 2 === 0 ? 5 : -4, 3]);
      map.viewport.zoomBy(
        actionSequence % 2 === 0 ? 1.004 : 1 / 1.004,
        [400, 300],
      );
      const viewportMs = performance.now() - viewportStarted;
      return {
        status: result.status,
        changed: result.changed,
        appliedCount: result.appliedCount,
        updateMs,
        viewportMs,
      };
    }, { actionSequence: sequence + 1 }));
    if (UPDATE_INTERVAL_MS > 0) await page.waitForTimeout(UPDATE_INTERVAL_MS);
  }
  await page.waitForTimeout(ANIMATION_DURATION_MS + 120);
  const sample = await page.evaluate(() => {
    const current = window.__PATCH_MAP_PUBLIC_ANIMATION_SAMPLE__;
    current.stopped = true;
    current.observer?.disconnect();
    delete window.__PATCH_MAP_PUBLIC_ANIMATION_SAMPLE__;
    const { map } = window.__PATCH_MAP_PUBLIC_ANIMATION_PERF__;
    const snapshot = map.debug.snapshot();
    return {
      raf: current.raf,
      longTasks: current.longTasks,
      semanticHash: snapshot.semanticHash,
      sceneRevision: snapshot.revisions.sceneRevision,
      frameRevision: snapshot.frameRevision,
      viewport: snapshot.viewport,
    };
  });
  const cpuProfile = cdp === null
    ? null
    : summarizeCpuProfile((await cdp.send('Profiler.stop')).profile);
  const cleanup = await page.evaluate(async () => {
    const { map } = window.__PATCH_MAP_PUBLIC_ANIMATION_PERF__;
    await map.destroy();
    await map.destroy();
    delete window.__PATCH_MAP_PUBLIC_ANIMATION_PERF__;
    return document.querySelectorAll('#patch-map-performance-host canvas').length;
  });
  const rafGapsMs = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
  return Object.freeze({
    trial,
    mounted,
    actions: Object.freeze(actions),
    rafGapsMs: Object.freeze(rafGapsMs),
    longTasks: Object.freeze(sample.longTasks),
    semanticHash: sample.semanticHash,
    sceneRevision: sample.sceneRevision,
    frameRevision: sample.frameRevision,
    viewport: sample.viewport,
    cleanupCanvasCount: cleanup,
    cpuProfile,
  });
}

function validateTrial(trial, size) {
  const failures = [];
  if (trial.mounted.renderer?.backend !== 'webgl') failures.push(`${size}: backend is not WebGL`);
  if (trial.mounted.renderer?.resolution !== PIXEL_RATIO) {
    failures.push(`${size}: renderer resolution mismatch`);
  }
  if (trial.mounted.renderer?.antialias !== ANTIALIAS) {
    failures.push(`${size}: renderer antialias mismatch`);
  }
  for (const action of trial.actions) {
    if (action.status !== 'committed' || action.appliedCount !== size) {
      failures.push(`${size}: height-only batch did not commit every target`);
    }
  }
  if (trial.semanticHash !== trial.mounted.semanticHash) {
    failures.push(`${size}: semantic hash changed`);
  }
  if (trial.sceneRevision !== trial.mounted.sceneRevision) {
    failures.push(`${size}: scene revision changed`);
  }
  if (trial.frameRevision <= trial.mounted.frameRevision) {
    failures.push(`${size}: animation frames were not published`);
  }
  if (trial.cleanupCanvasCount !== 0) failures.push(`${size}: canvas cleanup failed`);
  return failures;
}

function summarizeTrials(trials) {
  const actionMs = trials.flatMap((trial) => trial.actions.map(({ updateMs }) => updateMs));
  const viewportMs = trials.flatMap((trial) => trial.actions.map((action) => action.viewportMs));
  const frameGaps = trials.flatMap((trial) => trial.rafGapsMs);
  const longTasks = trials.flatMap((trial) => trial.longTasks);
  return Object.freeze({
    loadMs: stats(trials.map((trial) => trial.mounted.mountMs)),
    heightRetargetMs: stats(actionMs),
    viewportMutationMs: stats(viewportMs),
    animationPanZoomFrameGapMs: stats(frameGaps),
    longTasks: Object.freeze({
      count: longTasks.length,
      durationMs: stats(longTasks),
      trialsWithLongTasks: trials.filter((trial) => trial.longTasks.length > 0).length,
    }),
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
  if (!baseURL) throw new Error('missing local Vite URL');
  browser = await chromium.launch({ headless: true });
  const runs = [];
  const failures = [];
  for (const size of SIZES) {
    const warmups = [];
    const measured = [];
    for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
      const page = await browser.newPage({
        baseURL,
        viewport: { width: 900, height: 700 },
        deviceScaleFactor: PIXEL_RATIO,
      });
      const cdp = PROFILE && trial === WARMUPS
        ? await page.context().newCDPSession(page)
        : null;
      const value = await runTrial(page, size, trial, cdp);
      await cdp?.detach();
      failures.push(...validateTrial(value, size));
      (trial < WARMUPS ? warmups : measured).push(value);
      await page.close();
    }
    runs.push(Object.freeze({
      size,
      warmups: Object.freeze(warmups),
      measured: Object.freeze(measured),
      summary: summarizeTrials(measured),
    }));
  }
  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-public-height-animation-pan-zoom',
    generatedAt: new Date().toISOString(),
    commit: process.env.PATCH_MAP_PUBLIC_ANIMATION_COMMIT ?? null,
    protocol: Object.freeze({
      sizes: Object.freeze(SIZES),
      warmups: WARMUPS,
      measured: MEASURED,
      updateCount: UPDATE_COUNT,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      animationDurationMs: ANIMATION_DURATION_MS,
      pixelRatio: PIXEL_RATIO,
      antialias: ANTIALIAS,
      backend: 'webgl',
      publicApi: 'PatchMap.mount + targets.query + updateBatch + viewport',
      headless: true,
      cpuProfile: PROFILE,
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
    profiles: runs.map(({ size, measured }) => ({
      size,
      cpuProfile: measured.find((trial) => trial.cpuProfile !== null)?.cpuProfile ?? null,
    })),
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}
