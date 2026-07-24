#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const RESULTS = path.join(ROOT, 'performance/core-v2/results');
const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local?.[0];
if (!baseUrl) throw new Error('Core v2 memory Vite server has no URL');
const browser = await chromium.launch({
  headless: true,
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
const context = await browser.newContext({ viewport: { width: 1_280, height: 720 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = { console: [], page: [], network: [] };
page.on('console', (message) => {
  if (message.type() === 'error') errors.console.push(message.text());
});
page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
page.on('requestfailed', (request) => errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => {
  if (response.status() >= 400) errors.network.push(`${response.url()} HTTP ${response.status()}`);
});

try {
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await page.goto(new URL('performance/core-v2/index.html', baseUrl).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__PATCH_MAP_CORE_V2_BENCHMARK__?.run === 'function');
  await cdp.send('HeapProfiler.collectGarbage');
  const before = metric(await cdp.send('Performance.getMetrics'), 'JSHeapUsedSize');
  const run = await page.evaluate(async () => window.__PATCH_MAP_CORE_V2_BENCHMARK__.run({
    strategy: 'mesh',
    scale: 1_000,
    seed: 0x4d454d,
    warmups: 2,
    measured: 7,
  }));
  const hostInteractionLifecycle = await page.evaluate(async () => {
    const { CoreV2Engine } = await import('/src/core-v2/index.ts');
    const trials = [];
    for (let index = 0; index < 9; index += 1) {
      const host = document.createElement('div');
      host.style.width = '320px';
      host.style.height = '180px';
      document.body.append(host);
      const engine = new CoreV2Engine();
      let error = null;
      let beforeDestroy = null;
      let afterDestroy = null;
      let transformerBeforeDestroy = null;
      let transformerAfterDestroy = null;
      let historyBeforeDestroy = null;
      let snapshot = null;
      let observedEventCount = 0;
      let hostPublicationCount = 0;
      try {
        await engine.initialize({
          instanceId: `memory-host-interaction-${index}`,
          target: host,
          width: 320,
          height: 180,
          pixelRatio: 1,
          strategy: 'mesh',
          preference: 'webgl',
        });
        engine.loadDataset([
          {
            type: 'item',
            id: 'item-a',
            size: { width: 100, height: 80 },
            components: [{ type: 'text', id: 'label', text: 'Alpha' }],
            attrs: { x: 10, y: 20 },
          },
          {
            type: 'rect',
            id: 'rect-b',
            size: { width: 40, height: 30 },
            fill: '#ff8800',
            attrs: { x: 160, y: 40 },
          },
        ]);
        engine.bindLogicalEvents([
          {
            id: 'memory-rect',
            event: 'click',
            target: { kind: 'element', id: 'rect-b' },
          },
        ], () => {}).enable();
        engine.subscribeHostEvent('selection', 'changed', () => {
          observedEventCount += 1;
        });
        engine.bindSelectionHost(() => {
          hostPublicationCount += 1;
        });
        engine.setHistoryCompanion({
          selectedIds: ['item-a'],
          mode: 'select',
          dirty: false,
          owner: 'memory-lifecycle',
        });
        engine.transact({
          strict: true,
          actionId: 'memory-drag',
          operations: [{
            op: 'merge',
            target: { kind: 'element', id: 'rect-b' },
            changes: [{ path: ['attrs', 'x'], value: 170 }],
          }],
          history: {
            selectedIds: ['item-a'],
            mode: 'transform',
            dirty: true,
            owner: 'memory-lifecycle',
          },
        });
        engine.transact({
          strict: true,
          actionId: 'memory-drag',
          operations: [{
            op: 'merge',
            target: { kind: 'element', id: 'rect-b' },
            changes: [{ path: ['attrs', 'x'], value: 180 }],
          }],
          history: {
            selectedIds: ['item-a'],
            mode: 'transform',
            dirty: true,
            owner: 'memory-lifecycle',
          },
        });
        engine.transact({
          strict: true,
          actionId: 'memory-label',
          operations: [{
            op: 'merge',
            target: { kind: 'component', ownerId: 'item-a', id: 'label' },
            changes: [{ path: ['text'], value: 'Beta' }],
          }],
          history: {
            selectedIds: ['item-a'],
            mode: 'select',
            dirty: true,
            owner: 'memory-lifecycle',
          },
        });
        const historyInspection = engine.historyInspection();
        const historyCompanion = engine.historyCompanionState();
        historyBeforeDestroy = {
          state: historyInspection.state,
          commandIds: historyInspection.commands.map(({ id }) => id),
          recordCounts: historyInspection.commands.map(({ records }) => records.length),
          companionMode: historyCompanion.mode,
          companionSelectionIds: historyCompanion.selectionIds,
          hostCompanionFrozen: Object.isFrozen(historyCompanion.hostCompanion),
        };
        engine.applyInteractionModeOperation({ op: 'replace', state: 'select' });
        engine.applyInteractionModeOperation({ op: 'push', state: 'pan' });
        engine.applySelection({
          op: 'replace',
          ids: ['rect-b'],
          source: 'canvas',
        });
        engine.beginTransformerHandleGesture(100 + index, 'se');
        transformerBeforeDestroy = engine.transformerGestureProbe();
        beforeDestroy = engine.hostInteractionProbe();
        await engine.destroy();
        afterDestroy = engine.hostInteractionProbe();
        transformerAfterDestroy = engine.transformerGestureProbe();
        snapshot = engine.snapshot();
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        await engine.destroy().catch(() => undefined);
      } finally {
        host.remove();
      }
      trials.push({
        index,
        phase: index < 2 ? 'warmup' : 'measured',
        error,
        observedEventCount,
        hostPublicationCount,
        beforeDestroy,
        afterDestroy,
        transformerBeforeDestroy,
        transformerAfterDestroy,
        historyBeforeDestroy,
        snapshot,
        retainedCanvasCount: host.querySelectorAll('canvas').length,
      });
    }
    return trials;
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const after = metric(await cdp.send('Performance.getMetrics'), 'JSHeapUsedSize');
  const dom = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('#surface canvas').length,
    surfaceChildren: document.querySelector('#surface')?.childElementCount ?? -1,
  }));
  const samples = run.measuredRaw.map((trial) => trial.phases.retainedJsHeapBytes);
  const sorted = [...samples].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const maximum = Math.max(...samples);
  const trend = samples.at(-1) - samples[0];
  const lifecycleFailures = [];
  for (const [index, trial] of run.measuredRaw.entries()) {
    const diagnostics = trial.diagnostics;
    if (
      diagnostics.runtimeDestroyed !== true ||
      diagnostics.rendererDestroyed !== true ||
      diagnostics.schedulerDestroyed !== true ||
      diagnostics.lifecycleCanvasCount !== 0
    ) {
      lifecycleFailures.push(`measured trial ${index} did not release runtime/renderer/scheduler/canvas`);
    }
  }
  for (const trial of hostInteractionLifecycle) {
    if (
      trial.error !== null ||
      trial.observedEventCount !== 1 ||
      trial.hostPublicationCount !== 1 ||
      trial.beforeDestroy?.bindings !== 1 ||
      trial.beforeDestroy?.bindingListeners !== 1 ||
      trial.beforeDestroy?.eventSubscriptions !== 1 ||
      trial.beforeDestroy?.selectionHostListeners !== 1 ||
      trial.afterDestroy?.bindings !== 0 ||
      trial.afterDestroy?.bindingListeners !== 0 ||
      trial.afterDestroy?.eventSubscriptions !== 0 ||
      trial.afterDestroy?.selectionHostListeners !== 0 ||
      trial.afterDestroy?.mode?.activeOwnerCount !== 0 ||
      trial.afterDestroy?.destroyed !== true ||
      trial.transformerBeforeDestroy?.activeGestureCount !== 1 ||
      trial.transformerBeforeDestroy?.pointerCaptureCount !== 1 ||
      trial.transformerAfterDestroy?.activeGestureCount !== 0 ||
      trial.transformerAfterDestroy?.pointerCaptureCount !== 0 ||
      trial.transformerAfterDestroy?.destroyed !== true ||
      trial.historyBeforeDestroy?.state?.depth !== 2 ||
      trial.historyBeforeDestroy?.state?.undoDepth !== 2 ||
      JSON.stringify(trial.historyBeforeDestroy?.commandIds) !==
        JSON.stringify(['memory-drag', 'memory-label']) ||
      JSON.stringify(trial.historyBeforeDestroy?.recordCounts) !==
        JSON.stringify([2, 1]) ||
      trial.historyBeforeDestroy?.companionMode !== 'select' ||
      JSON.stringify(trial.historyBeforeDestroy?.companionSelectionIds) !==
        JSON.stringify(['item-a']) ||
      trial.historyBeforeDestroy?.hostCompanionFrozen !== true ||
      trial.snapshot?.historyDepth !== 0 ||
      trial.snapshot?.resources?.canvasCount !== 0 ||
      trial.snapshot?.resources?.subscriptions?.active !== 0 ||
      trial.retainedCanvasCount !== 0
    ) {
      lifecycleFailures.push(
        `host interaction ${trial.phase} trial ${trial.index} did not release callbacks/renderer/canvas`,
      );
    }
  }
  const failures = [
    ...(errors.console.length || errors.page.length || errors.network.length ? ['browser errors are not empty'] : []),
    ...(dom.canvasCount !== 0 || dom.surfaceChildren !== 0 ? ['surface retains a lifecycle DOM node'] : []),
    ...lifecycleFailures,
    ...(!samples.every((value) => Number.isFinite(value) && value >= 0) ? ['retained heap samples are invalid'] : []),
    ...(median > 20 * 1024 * 1024 ? [`retained heap median ${median} exceeds 20 MiB`] : []),
    ...(maximum > 50 * 1024 * 1024 ? [`retained heap max ${maximum} exceeds 50 MiB`] : []),
    ...(trend > 10 * 1024 * 1024 ? [`retained heap trend ${trend} exceeds 10 MiB`] : []),
    ...(after - before > 20 * 1024 * 1024 ? [`post-GC process delta ${after - before} exceeds 20 MiB`] : []),
  ];
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workload: { sourceItems: 1_000, expandedEntities: run.measuredRaw[0]?.diagnostics.expandedEntityCount },
    protocol: { warmups: 2, measured: 7 },
    hostInteractionLifecycle,
    jsHeap: { before, after, processDelta: after - before, samples, median, p95, maximum, trend },
    dom,
    lifecycleFailures,
    errors,
    limits: {
      retainedHeap: 'Post-GC JS heap after each trial has returned and runtime/input clone references have left lexical scope; DOM, browser-native, texture, and GPU allocations are not included',
      gpu: 'No portable browser GPU retained-memory counter is exposed',
    },
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
  await mkdir(RESULTS, { recursive: true });
  await writeFile(path.join(RESULTS, 'memory-lifecycle.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (failures.length) throw new Error(failures.join('; '));
  process.stdout.write(
    `PASS: Core v2 2+7 lifecycle, ${evidence.workload.expandedEntities} entities, retained heap median ${Math.round(median)} bytes, DOM/scheduler/renderer released\n`,
  );
} finally {
  await browser.close();
  await server.close();
}

function metric(result, name) {
  return result.metrics.find((entry) => entry.name === name)?.value ?? 0;
}

function percentile(sorted, quantile) {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
