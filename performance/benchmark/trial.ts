import { PatchMap } from '../../src/engine';
import { createPixiSurface } from '../../src/composition/pixi-engine-surface';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import {
  buildPatchMapBenchmarkDataset,
  canonicalPatchMapDatasetSha256,
  initializePatchMapBenchmarkEngine,
  projectPatchMapPerformanceSemantics,
  validatePatchMapBenchmarkDataset,
} from './workload';
import {
  createLongTaskObserver,
  deepFreeze,
  forceGc,
  nextAnimationFrame,
  usedHeap,
} from './browser-boundary';
import type { BenchmarkSpec } from './types';
import {
  createVisibleMetrics,
  measureVisibleMetrics,
} from './visible-metrics';

export async function runMeasuredBenchmarkTrial(
  spec: BenchmarkSpec,
  trial: number,
  warmup: boolean,
  surface: HTMLDivElement,
): Promise<Readonly<Record<string, unknown>>> {
  await forceGc();
  const heapBefore = usedHeap();
  const trialResult = await runBenchmarkTrial(spec, trial, warmup, surface);
  await forceGc();
  return deepFreeze({
    ...trialResult,
    retainedJsHeapBytes: Math.max(0, usedHeap() - heapBefore),
  });
}

async function runBenchmarkTrial(
  spec: BenchmarkSpec,
  trial: number,
  warmup: boolean,
  surface: HTMLDivElement,
): Promise<Readonly<Record<string, unknown>>> {
  surface.replaceChildren();
  const source = buildPatchMapBenchmarkDataset(spec.size, spec.seed);
  const input = structuredClone(source);
  const serializedBefore = JSON.stringify(input);
  const longTaskDurationsMs: number[] = [];
  const observer = createLongTaskObserver(longTaskDurationsMs);
  const engine = new PatchMap({ surfaceFactory: createPixiSurface });
  let destroyed = false;
  const visible = createVisibleMetrics();

  try {
    const validateStarted = performance.now();
    const validation = validatePatchMapBenchmarkDataset(input);
    const validateMs = performance.now() - validateStarted;

    const materializeStarted = performance.now();
    const materialized = materializePatchMapDataset(input);
    const materializeMs = performance.now() - materializeStarted;
    const canonicalDatasetSha256 = await canonicalPatchMapDatasetSha256(input);

    const assetStarted = performance.now();
    await initializePatchMapBenchmarkEngine(engine, {
      instanceId:
        `benchmark-${String(spec.size)}-${warmup ? 'warmup' : 'measured'}-${trial}`,
      target: surface,
    });
    const assetMs = performance.now() - assetStarted;

    const storeStarted = performance.now();
    const load = engine.loadDataset(input, {
      datasetRef: `benchmark:${String(spec.size)}:${spec.seed}`,
    });
    const storeLoadMs = performance.now() - storeStarted;

    const prepareStarted = performance.now();
    const prepare = await engine.prepareScene();
    const uploadPrepareMs = performance.now() - prepareStarted;

    const firstFrameStarted = performance.now();
    engine.publishFrame(0);
    await nextAnimationFrame();
    const firstUsefulFrameMs = performance.now() - firstFrameStarted;

    await measureVisibleMetrics(engine, spec, visible);

    const projection = projectPatchMapPerformanceSemantics(engine);
    const active = engine.snapshot();
    const destroyStarted = performance.now();
    const destroyReturned = await engine.destroy();
    destroyed = true;
    const destroyMs = performance.now() - destroyStarted;
    await nextAnimationFrame();
    if (observer !== null) {
      for (const entry of observer.takeRecords()) {
        longTaskDurationsMs.push(entry.duration);
      }
    }
    const terminal = engine.snapshot();

    return deepFreeze({
      trial,
      warmup,
      seed: spec.seed,
      size: spec.size,
      phases: {
        validateMs,
        materializeMs,
        assetMs,
        storeLoadMs,
        uploadPrepareMs,
        firstUsefulFrameMs,
        destroyMs,
      },
      visible,
      longTaskDurationsMs,
      diagnostics: {
        inputUnchanged: JSON.stringify(input) === serializedBefore,
        canonicalDatasetSha256,
        validation,
        materializedSemanticHash: materialized.semanticHash,
        load,
        prepare,
        projection,
        requestedBackend: 'webgl2',
        rendererBackend: active.resources.renderer?.backend ?? null,
        lifecycleBeforeDestroy: active.lifecycle,
        destroyReturned,
        lifecycleAfterDestroy: terminal.lifecycle,
        canvasCountAfterDestroy: terminal.resources.canvasCount,
        pendingWorkAfterDestroy: terminal.pendingWork,
        subscriptionCountAfterDestroy: terminal.resources.subscriptions.active,
        surfaceChildCountAfterDestroy: surface.childElementCount,
        revisionValuesFinite: Object.values(active.revisions).every(Number.isFinite)
          && Number.isFinite(active.frameRevision),
      },
    });
  } finally {
    observer?.disconnect();
    if (!destroyed) await engine.destroy().catch(() => undefined);
    surface.replaceChildren();
  }
}
