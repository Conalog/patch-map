#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  parsePatchMapBrowserLaunch,
  parsePatchMapNativeWindowsCell,
} from '../../verification/browser-launch.mjs';

const ROOT = process.cwd();
const CODE_COMMIT = process.env.PATCH_MAP_CODE_COMMIT ?? 'uncommitted';
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2), {
  extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
const nativeWindows = parsePatchMapNativeWindowsCell(
  process.argv.slice(2),
  browserLaunch,
);
const HOST_LIFECYCLE_CYCLES = nativeWindows.requested ? 10 : 9;
const RESULTS = path.resolve(
  process.env.PATCH_MAP_MEMORY_ARTIFACT_DIR
    ?? path.join(ROOT, '.artifacts/performance/memory'),
);
const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser = null;
let context = null;
let page = null;
const errors = { console: [], page: [], network: [] };

try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap memory Vite server has no URL');
  browser = await chromium.launch(browserLaunch.launchOptions);
  context = await browser.newContext({
    viewport: { width: 1_280, height: 720 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => {
    errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.network.push(`${response.url()} HTTP ${response.status()}`);
    }
  });
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await page.goto(new URL('performance/index.html', baseUrl).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__PATCH_MAP_BENCHMARK__?.run === 'function');
  const gpu = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { context: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      context: 'webgl2',
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      unmaskedVendor: debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : null,
      unmaskedRenderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : null,
    };
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const before = metric(await cdp.send('Performance.getMetrics'), 'JSHeapUsedSize');
  const run = await page.evaluate(async () => window.__PATCH_MAP_BENCHMARK__.run({
    strategy: 'mesh',
    scale: 1_000,
    seed: 0x4d454d,
    warmups: 2,
    measured: 7,
  }));
  await cdp.send('HeapProfiler.collectGarbage');
  const lifecycleBefore = metric(
    await cdp.send('Performance.getMetrics'),
    'JSHeapUsedSize',
  );
  const hostInteractionLifecycle = await page.evaluate(async (spec) => {
    const {
      PatchMap,
      PatchMapOperationsAuthority,
    } = await import('/src/patch-map/index.ts');
    const trials = [];
    for (let index = 0; index < spec.cycles; index += 1) {
      const host = document.createElement('div');
      host.style.width = '320px';
      host.style.height = '180px';
      document.body.append(host);
      const instanceId = `memory-host-interaction-${index}`;
      const engine = new PatchMap({
        operations: new PatchMapOperationsAuthority({
          collectionEnabled: true,
          capacity: 16,
          instanceId,
        }),
      });
      let error = null;
      let beforeDestroy = null;
      let afterDestroy = null;
      let transformerBeforeDestroy = null;
      let transformerAfterDestroy = null;
      let transformerEditBeforeDestroy = null;
      let transformerEditAfterDestroy = null;
      let historyBeforeDestroy = null;
      let instanceBarBeforeDestroy = null;
      let extractionBeforeDestroy = null;
      let pageLifecycleBeforeDestroy = null;
      let pageLifecycleAfterDestroy = null;
      let accessibilityBeforeDestroy = null;
      let accessibilityAfterDestroy = null;
      let runtimeDiagnosticsBeforeDestroy = null;
      let runtimeDiagnosticsAfterDestroy = null;
      let snapshot = null;
      let observedEventCount = 0;
      let hostPublicationCount = 0;
      const tooltipPublicationReasons = [];
      let tooltipSubscription = null;
      let tooltipSubscriptionDisposeAfterDestroy = null;
      try {
        await engine.initialize({
          instanceId,
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
            components: [
              { type: 'text', id: 'label', text: 'Alpha' },
              {
                type: 'bar',
                id: 'level',
                source: { type: 'rect', fill: '#2563eb' },
                size: { width: 60, height: 8 },
                placement: 'bottom',
                animation: true,
              },
            ],
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
        const instanceBarResult = engine.updateInstanceBarHeights({
          bar: {
            targets: [{ id: 'item-a', componentId: 'level' }],
            height: new Float64Array([42]),
          },
          animate: false,
        });
        instanceBarBeforeDestroy = {
          status: instanceBarResult.status,
          appliedCount: instanceBarResult.appliedTargets.length,
          overlayCount: instanceBarResult.overlayCount,
        };
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
        tooltipSubscription = engine.bindTooltipHost(({ reason }) => {
          tooltipPublicationReasons.push(reason);
        });
        engine.hoverTooltipAtScreen({ x: 20, y: 30 }, [120, 60]);
        engine.toggleTooltipPinAtScreen({ x: 20, y: 30 }, [120, 60]);
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
        engine.beginTransformerEdit({
          pointerId: 100 + index,
          actionId: `memory-transform-preview-${index}`,
          kind: 'resize',
          handle: 'se',
          selectionIds: ['rect-b'],
        });
        engine.previewTransformerEdit(100 + index, {
          kind: 'resize',
          selectionIds: ['rect-b'],
          handle: 'se',
          deltaWorld: [10, 10],
        });
        transformerBeforeDestroy = engine.transformerGestureProbe();
        transformerEditBeforeDestroy = engine.transformerEditProbe();
        engine.publishFrame(index + 1);
        engine.accessibilityTree('scene');
        engine.focusAccessibilityTarget('rect-b');
        engine.publishFrame(index + 2);
        extractionBeforeDestroy = await (async () => {
          const requestedTuple = engine.snapshot().publishedTuple;
          const beforeCanvas = engine.canvasHandle();
          const extracted = await engine.extractPublishedScene({
            targetTuple: requestedTuple,
            cssSize: [320, 180],
            mime: 'image/png',
          });
          const afterCanvas = engine.canvasHandle();
          return {
            requestedTuple,
            capturedTuple: extracted.capturedTuple,
            dataUrlPrefix: extracted.dataUrl.slice(0, 22),
            dataUrlLength: extracted.dataUrl.length,
            sameCanvasObject: beforeCanvas.element === afterCanvas.element,
            authoritativeCanvasRetained: extracted.authoritativeCanvasRetained,
            temporaryImageCount: extracted.temporaryImageCount,
            renderTextureCount: extracted.renderTextureCount,
            pendingWorkAfter: engine.snapshot().pendingWork,
          };
        })();
        beforeDestroy = engine.hostInteractionProbe();
        const pageAsset = engine.registerPageLifecycleWork({
          kind: 'asset',
          requestId: `memory-page-asset-${index}`,
        });
        engine.registerPageLifecycleWork({
          kind: 'extraction',
          requestId: `memory-page-extraction-${index}`,
        });
        const hidden = engine.setDocumentVisibility({
          state: 'hidden',
          timeMs: 100 + index,
        });
        const obsolete = engine.completePageLifecycleWork(pageAsset);
        const visible = engine.setDocumentVisibility({
          state: 'visible',
          timeMs: 10_100 + index,
        });
        engine.publishFrame(10_116.666667 + index);
        engine.publishFrame(10_133.333334 + index);
        pageLifecycleBeforeDestroy = {
          hiddenCancelledAssetCount: hidden.transition.cancelledAssetCount,
          hiddenCancelledExtractionCount:
            hidden.transition.cancelledExtractionCount,
          obsoleteStatus: obsolete.status,
          resumeFramePendingBeforePublication:
            visible.probe.resumeFramePending,
          ...engine.pageLifecycleProbe(),
        };
        accessibilityBeforeDestroy = engine.accessibilityProbe();
        runtimeDiagnosticsBeforeDestroy = engine.runtimeDiagnostics().current;
        await engine.destroy();
        tooltipSubscriptionDisposeAfterDestroy = tooltipSubscription.dispose();
        afterDestroy = engine.hostInteractionProbe();
        transformerAfterDestroy = engine.transformerGestureProbe();
        transformerEditAfterDestroy = engine.transformerEditProbe();
        snapshot = engine.snapshot();
        pageLifecycleAfterDestroy = engine.pageLifecycleProbe();
        accessibilityAfterDestroy = engine.accessibilityProbe();
        runtimeDiagnosticsAfterDestroy = engine.runtimeDiagnostics().current;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        await engine.destroy().catch(() => undefined);
      } finally {
        host.remove();
      }
      trials.push({
        index,
        phase: spec.native ? 'cycle' : index < 2 ? 'warmup' : 'measured',
        error,
        observedEventCount,
        hostPublicationCount,
        tooltipPublicationReasons,
        tooltipSubscriptionDisposeAfterDestroy,
        beforeDestroy,
        afterDestroy,
        transformerBeforeDestroy,
        transformerAfterDestroy,
        transformerEditBeforeDestroy,
        transformerEditAfterDestroy,
        historyBeforeDestroy,
        instanceBarBeforeDestroy,
        extractionBeforeDestroy,
        pageLifecycleBeforeDestroy,
        pageLifecycleAfterDestroy,
        accessibilityBeforeDestroy,
        accessibilityAfterDestroy,
        runtimeDiagnosticsBeforeDestroy,
        runtimeDiagnosticsAfterDestroy,
        snapshot,
        retainedCanvasCount: host.querySelectorAll('canvas').length,
        retainedHostChildCount: host.childElementCount,
      });
    }
    return trials;
  }, {
    cycles: HOST_LIFECYCLE_CYCLES,
    native: nativeWindows.requested,
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const lifecycleAfter = metric(
    await cdp.send('Performance.getMetrics'),
    'JSHeapUsedSize',
  );
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
  const postDestroyForcedGcGrowthBytes = Math.max(
    0,
    lifecycleAfter - lifecycleBefore,
  );
  const postDestroyForcedGcGrowthMiB =
    postDestroyForcedGcGrowthBytes / (1024 * 1024);
  const gpuRendererIdentity = [
    gpu.renderer,
    gpu.unmaskedRenderer,
  ].filter((value) => typeof value === 'string').join(' ');
  const softwareGpu = /swiftshader|llvmpipe|software raster/iu.test(
    gpuRendererIdentity,
  );
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
      trial.beforeDestroy?.tooltipHostListeners !== 1 ||
      JSON.stringify(trial.beforeDestroy?.tooltip?.clearTrace) !==
        JSON.stringify(['drag']) ||
      trial.afterDestroy?.bindings !== 0 ||
      trial.afterDestroy?.bindingListeners !== 0 ||
      trial.afterDestroy?.eventSubscriptions !== 0 ||
      trial.afterDestroy?.selectionHostListeners !== 0 ||
      trial.afterDestroy?.tooltipHostListeners !== 0 ||
      JSON.stringify(trial.afterDestroy?.tooltip?.clearTrace) !==
        JSON.stringify(['drag', 'redraw', 'destroy']) ||
      trial.afterDestroy?.tooltip?.targetId !== null ||
      trial.afterDestroy?.tooltip?.destroyed !== true ||
      JSON.stringify(trial.tooltipPublicationReasons) !==
        JSON.stringify(['hover', 'pin', 'drag', 'redraw', 'destroy']) ||
      trial.tooltipSubscriptionDisposeAfterDestroy !== 'disposed' ||
      trial.afterDestroy?.mode?.activeOwnerCount !== 0 ||
      trial.afterDestroy?.destroyed !== true ||
      trial.transformerBeforeDestroy?.activeGestureCount !== 1 ||
      trial.transformerBeforeDestroy?.pointerCaptureCount !== 1 ||
      trial.transformerAfterDestroy?.activeGestureCount !== 0 ||
      trial.transformerAfterDestroy?.pointerCaptureCount !== 0 ||
      trial.transformerAfterDestroy?.destroyed !== true ||
      trial.transformerEditBeforeDestroy?.activeSessionCount !== 1 ||
      trial.transformerEditBeforeDestroy?.previewOverlayCount !== 1 ||
      trial.transformerEditAfterDestroy?.activeSessionCount !== 0 ||
      trial.transformerEditAfterDestroy?.previewOverlayCount !== 0 ||
      trial.transformerEditAfterDestroy?.edgePanActiveCount !== 0 ||
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
      trial.instanceBarBeforeDestroy?.status !== 'committed' ||
      trial.instanceBarBeforeDestroy?.appliedCount !== 1 ||
      trial.instanceBarBeforeDestroy?.overlayCount !== 1 ||
      JSON.stringify(trial.extractionBeforeDestroy?.capturedTuple) !==
        JSON.stringify(trial.extractionBeforeDestroy?.requestedTuple) ||
      !String(trial.extractionBeforeDestroy?.dataUrlPrefix).startsWith('data:image/png') ||
      !(trial.extractionBeforeDestroy?.dataUrlLength > 100) ||
      trial.extractionBeforeDestroy?.sameCanvasObject !== true ||
      trial.extractionBeforeDestroy?.authoritativeCanvasRetained !== true ||
      trial.extractionBeforeDestroy?.temporaryImageCount !== 0 ||
      trial.extractionBeforeDestroy?.renderTextureCount !== 0 ||
      trial.extractionBeforeDestroy?.pendingWorkAfter !== 0 ||
      trial.pageLifecycleBeforeDestroy?.hiddenCancelledAssetCount !== 1 ||
      trial.pageLifecycleBeforeDestroy?.hiddenCancelledExtractionCount !== 1 ||
      trial.pageLifecycleBeforeDestroy?.obsoleteStatus !== 'obsolete' ||
      trial.pageLifecycleBeforeDestroy?.state !== 'visible' ||
      trial.pageLifecycleBeforeDestroy?.pendingWorkCount !== 0 ||
      trial.pageLifecycleBeforeDestroy?.cancelledAssetCount !== 1 ||
      trial.pageLifecycleBeforeDestroy?.cancelledExtractionCount !== 1 ||
      trial.pageLifecycleBeforeDestroy?.obsoleteCompletionCount !== 1 ||
      trial.pageLifecycleBeforeDestroy
        ?.resumeFramePendingBeforePublication !== true ||
      trial.pageLifecycleBeforeDestroy?.resumeFramePending !== false ||
      trial.pageLifecycleBeforeDestroy?.resumePublishedFrameCount !== 1 ||
      trial.pageLifecycleAfterDestroy?.destroyed !== true ||
      trial.pageLifecycleAfterDestroy?.pendingWorkCount !== 0 ||
      trial.pageLifecycleAfterDestroy?.resumeFramePending !== false ||
      JSON.stringify(trial.accessibilityBeforeDestroy?.orderedIds) !==
        JSON.stringify(['item-a', 'rect-b']) ||
      trial.accessibilityBeforeDestroy?.focusedId !== 'rect-b' ||
      trial.accessibilityBeforeDestroy?.surface?.active !== true ||
      trial.accessibilityBeforeDestroy?.surface?.shadowDomActive !== true ||
      trial.accessibilityBeforeDestroy?.surface?.overlayNodeCount !== 2 ||
      trial.accessibilityBeforeDestroy?.surface?.shadowDomNodeCount !== 2 ||
      trial.accessibilityBeforeDestroy?.surface?.rootListenerCount !== 1 ||
      trial.accessibilityBeforeDestroy?.surface?.entityListenerCount !== 0 ||
      trial.accessibilityAfterDestroy?.destroyed !== true ||
      trial.accessibilityAfterDestroy?.focusedId !== null ||
      trial.accessibilityAfterDestroy?.surface !== null ||
      JSON.stringify(trial.accessibilityAfterDestroy?.orderedIds) !==
        JSON.stringify([]) ||
      trial.runtimeDiagnosticsAfterDestroy?.activeWork?.gestures !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.activeWork?.animations !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.activeWork?.pendingAssets !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.activeWork?.pendingWork !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.resources?.canvases !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.resources?.listeners !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.resources?.observers !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.resources?.tickers !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.resources?.textureLeases !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.resources?.callbackRegistrations !== 0 ||
      trial.runtimeDiagnosticsAfterDestroy?.cleanup?.destroyed !== true ||
      trial.runtimeDiagnosticsAfterDestroy?.cleanup?.released !== true ||
      trial.snapshot?.historyDepth !== 0 ||
      trial.snapshot?.resources?.canvasCount !== 0 ||
      trial.snapshot?.resources?.subscriptions?.active !== 0 ||
      trial.retainedCanvasCount !== 0 ||
      trial.retainedHostChildCount !== 0
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
    ...(nativeWindows.requested && hostInteractionLifecycle.length !== 10
      ? [`native lifecycle cycle count ${hostInteractionLifecycle.length} is not 10`]
      : []),
    ...(nativeWindows.requested && postDestroyForcedGcGrowthMiB > 2
      ? [`native forced-GC growth ${postDestroyForcedGcGrowthMiB} MiB exceeds 2 MiB`]
      : []),
    ...(nativeWindows.requested && gpu.context !== 'webgl2'
      ? ['native memory run did not acquire WebGL2']
      : []),
    ...(nativeWindows.requested && softwareGpu
      ? [`native memory run used a software GPU: ${gpuRendererIdentity}`]
      : []),
  ];
  const canvasListenerTickerTextureDelta =
    lifecycleFailures.length === 0
      && dom.canvasCount === 0
      && dom.surfaceChildren === 0
      ? 0
      : 1;
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    codeCommit: CODE_COMMIT,
    workload: { sourceItems: 1_000, expandedEntities: run.measuredRaw[0]?.diagnostics.expandedEntityCount },
    protocol: {
      warmups: 2,
      measured: 7,
      lifecycleCycles: HOST_LIFECYCLE_CYCLES,
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      headed: browserLaunch.headed,
      browserTarget: browserLaunch.target,
      browserVersion: browser.version(),
      windowsNative: nativeWindows.evidenceStatus,
      nativeCellId: nativeWindows.cellId,
      viewport: { width: 1_280, height: 720, deviceScaleFactor: 1 },
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      gpu,
      hardwareAcceleratedCandidate: gpu.context === 'webgl2' && !softwareGpu,
    },
    hostInteractionLifecycle,
    jsHeap: { before, after, processDelta: after - before, samples, median, p95, maximum, trend },
    nativeRelease: {
      lifecycleCycles: HOST_LIFECYCLE_CYCLES,
      forcedGcMeasurementWindow: {
        beforeBytes: lifecycleBefore,
        afterBytes: lifecycleAfter,
      },
      postDestroyForcedGcGrowthBytes,
      postDestroyForcedGcGrowthMiB,
      canvasListenerTickerTextureDelta,
      qualification:
        nativeWindows.requested
          ? failures.length === 0 ? 'measured-candidate-unreviewed' : 'failed'
          : 'not-run',
    },
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
    `PASS: PatchMap 2+7 lifecycle + ${HOST_LIFECYCLE_CYCLES} ownership cycles, `
      + `${evidence.workload.expandedEntities} entities, retained heap median `
      + `${Math.round(median)} bytes, DOM/scheduler/renderer released\n`,
  );
} finally {
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

function metric(result, name) {
  return result.metrics.find((entry) => entry.name === name)?.value ?? 0;
}

function percentile(sorted, quantile) {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
