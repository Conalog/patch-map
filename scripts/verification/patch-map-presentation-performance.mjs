#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SIZES = [5_000, 10_000];
const WARMUPS = Number.parseInt(process.env.PATCH_MAP_PRESENTATION_WARMUPS ?? '2', 10);
const MEASURED = Number.parseInt(process.env.PATCH_MAP_PRESENTATION_MEASURED ?? '7', 10);
const OUTPUT = path.resolve(process.env.PATCH_MAP_PRESENTATION_OUTPUT
  ?? path.join(ROOT, '.perf-results/patch-map/presentation-latest.json'));
const BUDGETS = Object.freeze({
  5_000: Object.freeze({ sparseSyncMs: 5, fullSyncMs: 25, sparseVisibleMs: 50 }),
  10_000: Object.freeze({ sparseSyncMs: 10, fullSyncMs: 50, sparseVisibleMs: 100 }),
  sparseRatio: 4,
  fourLayerSyncMs: 20,
  fourLayerVisibleMs: 100,
});

if (!Number.isSafeInteger(WARMUPS) || WARMUPS < 0) {
  throw new TypeError('PATCH_MAP_PRESENTATION_WARMUPS must be a nonnegative integer');
}
if (!Number.isSafeInteger(MEASURED) || MEASURED < 1) {
  throw new TypeError('PATCH_MAP_PRESENTATION_MEASURED must be a positive integer');
}

function percentile(values, quantile) {
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

async function runTrial(page, size, sequence) {
  await page.goto('/scripts/verification/patch-map-presentation-performance.html', {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => window.__PATCH_MAP_PRESENTATION_MODULE__?.PatchMap !== undefined,
    undefined,
    { timeout: 120_000 },
  );
  return page.evaluate(async ({ recordCount, trialSequence }) => {
    const { PatchMap } = window.__PATCH_MAP_PRESENTATION_MODULE__;
    const host = document.querySelector('#patch-map-presentation-performance-host');
    Object.assign(host.style, { width: '800px', height: '600px', overflow: 'hidden' });
    const columns = Math.min(100, Math.ceil(Math.sqrt(recordCount)));
    const rows = Math.ceil(recordCount / columns);
    const cells = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) =>
        row * columns + column < recordCount ? 1 : 0));
    const map = await PatchMap.mount({
      instanceId: `presentation-performance-${recordCount}-${trialSequence}`,
      container: host,
      width: 800,
      height: 600,
      pixelRatio: 1,
      antialias: false,
      backend: 'webgl',
      powerPreference: 'high-performance',
      resizeMode: 'manual',
      data: [{
        type: 'grid',
        id: 'presentation-grid',
        cells,
        gap: 1,
        item: {
          size: { width: 12, height: 12 },
          components: [{
            type: 'background',
            id: 'surface',
            source: { type: 'rect', fill: '#2563eb' },
          }],
        },
      }],
      fit: { padding: 8 },
    });
    const scope = map.targets.query({
      within: 'presentation-grid',
      type: 'grid-cell',
      scope: 'instances',
    });
    if (scope.count !== recordCount) {
      throw new Error(`expected ${recordCount} targets, received ${scope.count}`);
    }
    const ids = scope.matches.map(({ id }) => id);
    const baseline = map.debug.snapshot();
    const waitVisible = async (frameRevision) => {
      for (let frame = 0; frame < 120; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (map.debug.snapshot().frameRevision > frameRevision) return;
      }
      throw new Error('presentation frame did not become visible');
    };
    const measureSet = async (key, layer) => {
      const before = map.debug.snapshot().frameRevision;
      const started = performance.now();
      const result = map.presentation.set(key, layer);
      const syncMs = performance.now() - started;
      await waitVisible(before);
      return { syncMs, visibleMs: performance.now() - started, result };
    };

    const initial = await measureSet('benchmark:focus', {
      scope,
      targets: [ids[0]],
      unmatched: { alphaMultiplier: 0.32 },
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const frameSample = { stopped: false, raf: [], longTasks: [], observer: null };
    const observer = new PerformanceObserver((list) => {
      frameSample.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
      frameSample.observer = observer;
    } catch {
      // rAF gaps remain normative when Long Task observation is unavailable.
    }
    const tick = (time) => {
      frameSample.raf.push(time);
      if (!frameSample.stopped) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const sparse = [];
    for (let index = 0; index < 30; index += 1) {
      sparse.push(await measureSet('benchmark:focus', {
        scope,
        targets: [ids[(index + 1) % ids.length]],
        unmatched: { alphaMultiplier: 0.32 },
      }));
    }

    const full = [];
    for (let index = 0; index < 4; index += 1) {
      full.push(await measureSet('benchmark:full', {
        scope,
        targets: [ids[101 % ids.length]],
        matched: { alphaMultiplier: 1 },
        unmatched: { alphaMultiplier: index % 2 === 0 ? 0.32 : 0.31 },
      }));
    }

    map.presentation.clear('benchmark:full');
    map.presentation.clear('benchmark:focus');
    const layerPaint = [0.91, 0.83, 0.77, 0.69];
    for (let index = 0; index < 4; index += 1) {
      await measureSet(`benchmark:layer:${index}`, {
        scope,
        targets: [ids[index]],
        unmatched: { alphaMultiplier: layerPaint[index] },
      });
    }
    const fourLayer = [];
    for (let action = 0; action < 30; action += 1) {
      fourLayer.push(await measureSet('benchmark:layer:0', {
        scope,
        targets: [ids[(action + 11) % ids.length]],
        unmatched: { alphaMultiplier: layerPaint[0] },
      }));
    }

    await measureSet('benchmark:burst', {
      scope,
      targets: [ids[0]],
      unmatched: { alphaMultiplier: 0.41 },
    });
    const burstRevisionBefore = map.debug.snapshot().presentation.revision;
    const burstStarted = performance.now();
    let burstResult = null;
    for (let action = 0; action < 30; action += 1) {
      burstResult = map.presentation.set('benchmark:burst', {
        scope,
        targets: [ids[(action + 1) % ids.length]],
        unmatched: { alphaMultiplier: 0.41 },
      });
    }
    const burstSyncMs = performance.now() - burstStarted;
    const burstCapture = await map.capture.png();
    const burstRevisionAfter = map.debug.snapshot().presentation.revision;

    const clearStarted = performance.now();
    map.presentation.clear('benchmark:focus');
    map.presentation.clear('benchmark:burst');
    for (let index = 0; index < 4; index += 1) {
      map.presentation.clear(`benchmark:layer:${index}`);
    }
    const clearSyncMs = performance.now() - clearStarted;
    const after = map.debug.snapshot();
    frameSample.stopped = true;
    frameSample.observer?.disconnect();
    const rafGapsMs = frameSample.raf.slice(1)
      .map((time, index) => time - frameSample.raf[index]);
    map.presentation.set('benchmark:destroy', {
      scope,
      targets: [ids[0]],
      unmatched: { alphaMultiplier: 0.5 },
    });
    await map.destroy();
    await map.destroy();
    return {
      renderer: baseline.resources.renderer,
      semanticHashStable: baseline.semanticHash === after.semanticHash,
      sceneRevisionStable: baseline.revisions.sceneRevision === after.revisions.sceneRevision,
      initial,
      sparse,
      full,
      fourLayer,
      burst: {
        syncMs: burstSyncMs,
        revisionDelta: burstRevisionAfter - burstRevisionBefore,
        matchedCount: burstResult?.matchedCount ?? null,
        capturePrefix: burstCapture.dataUrl.slice(0, 22),
      },
      rafGapsMs,
      longTasks: frameSample.longTasks,
      clearSyncMs,
      finalPresentation: after.presentation,
      cleanupCanvasCount: host.querySelectorAll('canvas').length,
    };
  }, { recordCount: size, trialSequence: sequence });
}

function summarize(trials) {
  return Object.freeze({
    initialSetMs: stats(trials.map(({ initial }) => initial.syncMs)),
    sparseSetMs: stats(trials.flatMap(({ sparse }) => sparse.map(({ syncMs }) => syncMs))),
    sparseVisibleMs: stats(trials.flatMap(({ sparse }) => sparse.map(({ visibleMs }) => visibleMs))),
    fullOperationMs: stats(trials.flatMap(({ full }) => full.map(({ syncMs }) => syncMs))),
    fourLayerRetargetMs: stats(trials.flatMap(({ fourLayer }) =>
      fourLayer.map(({ syncMs }) => syncMs))),
    fourLayerVisibleMs: stats(trials.flatMap(({ fourLayer }) =>
      fourLayer.map(({ visibleMs }) => visibleMs))),
    burstSyncMs: stats(trials.map(({ burst }) => burst.syncMs)),
    rafGapMs: stats(trials.flatMap(({ rafGapsMs }) => rafGapsMs)),
    longTaskDurationMs: stats(trials.flatMap(({ longTasks }) => longTasks)),
    longTaskCount: trials.reduce((count, { longTasks }) => count + longTasks.length, 0),
    clearMs: stats(trials.map(({ clearSyncMs }) => clearSyncMs)),
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
  const failures = [];
  const runs = [];
  for (const size of SIZES) {
    const warmups = [];
    const measured = [];
    for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
      const page = await browser.newPage({ baseURL, viewport: { width: 900, height: 700 } });
      const consoleErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(error.stack ?? error.message));
      const value = await runTrial(page, size, trial);
      if (consoleErrors.length > 0) failures.push(`${size}: browser errors: ${consoleErrors.join('; ')}`);
      if (value.renderer?.backend !== 'webgl') failures.push(`${size}: backend is not WebGL`);
      if (!value.semanticHashStable || !value.sceneRevisionStable) {
        failures.push(`${size}: presentation changed semantic state`);
      }
      if (value.finalPresentation.layerCount !== 0) failures.push(`${size}: clear left active layers`);
      if (
        value.burst.revisionDelta !== 30 ||
        value.burst.matchedCount !== 1 ||
        !value.burst.capturePrefix.startsWith('data:image/png')
      ) failures.push(`${size}: burst final-state/capture validation failed`);
      if (value.cleanupCanvasCount !== 0) failures.push(`${size}: destroy left a canvas`);
      (trial < WARMUPS ? warmups : measured).push(value);
      await page.close();
    }
    const lifecyclePage = await browser.newPage({
      baseURL,
      viewport: { width: 900, height: 700 },
    });
    const lifecycle = await runTrial(lifecyclePage, size, WARMUPS + MEASURED);
    if (lifecycle.cleanupCanvasCount !== 0) {
      failures.push(`${size}: tenth lifecycle cycle left a canvas`);
    }
    await lifecyclePage.close();
    const summary = summarize(measured);
    const budget = BUDGETS[size];
    if (summary.sparseSetMs.p95 > budget.sparseSyncMs) {
      failures.push(`${size}: sparse set p95 ${summary.sparseSetMs.p95}ms > ${budget.sparseSyncMs}ms`);
    }
    if (Math.max(summary.initialSetMs.p95, summary.fullOperationMs.p95, summary.clearMs.p95)
      > budget.fullSyncMs) {
      failures.push(`${size}: full-scope operation exceeded ${budget.fullSyncMs}ms`);
    }
    if (summary.sparseVisibleMs.p95 > budget.sparseVisibleMs) {
      failures.push(`${size}: sparse visible p95 exceeded ${budget.sparseVisibleMs}ms`);
    }
    if (summary.rafGapMs.p95 > (size === 5_000 ? 75 : 150)) {
      failures.push(`${size}: rAF-gap p95 exceeded its presentation budget`);
    }
    if (size === 10_000 && measured.some((trial) =>
      percentile(trial.full.map(({ syncMs }) => syncMs), 0.95) /
        percentile(trial.sparse.map(({ syncMs }) => syncMs), 0.95) < BUDGETS.sparseRatio)) {
      failures.push('10000: one or more trials missed the paired 4x sparse/full ratio');
    }
    if (size === 10_000 && summary.fourLayerRetargetMs.p95 > BUDGETS.fourLayerSyncMs) {
      failures.push('10000: four-layer sync p95 exceeded 20ms');
    }
    if (size === 10_000 && summary.fourLayerVisibleMs.p95 > BUDGETS.fourLayerVisibleMs) {
      failures.push('10000: four-layer visible p95 exceeded 100ms');
    }
    runs.push(Object.freeze({ size, warmups, measured, summary }));
  }
  const diagnosticPage = await browser.newPage({
    baseURL,
    viewport: { width: 900, height: 700 },
  });
  const diagnosticCdp = await diagnosticPage.context().newCDPSession(diagnosticPage);
  await diagnosticCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const diagnosticTrial = await runTrial(diagnosticPage, 5_000, 'cpu-4x');
  await diagnosticCdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await diagnosticCdp.detach();
  await diagnosticPage.close();
  if (diagnosticTrial.cleanupCanvasCount !== 0) {
    failures.push('5000 4x diagnostic: destroy left a canvas');
  }
  const cpu4xDiagnostic = summarize([diagnosticTrial]);
  const result = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-keyed-presentation-layers',
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      sizes: SIZES,
      warmups: WARMUPS,
      measured: MEASURED,
      lifecycleCyclesPerSize: WARMUPS + MEASURED + 1,
      backend: 'webgl',
      publicApi: 'PatchMap.mount + targets.query + presentation.set/clear',
      budgets: BUDGETS,
      cpu4xDiagnosticSize: 5_000,
      windowsNative: 'pending',
    }),
    environment: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      browser: 'playwright chromium',
    }),
    runs,
    cpu4xDiagnostic,
    failures,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
  });
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output: OUTPUT,
    status: result.status,
    runs: runs.map(({ size, summary }) => ({ size, summary })),
    cpu4xDiagnostic,
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}
