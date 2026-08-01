import { createPatchMapRuntime } from '../../../src/patch-map/core';
import type { PatchMapTrial } from '../protocol';
import {
  PATCH_MAP_SYNTHETIC_ASSET_ALIAS,
  PATCH_MAP_SYNTHETIC_ASSET_DATA_URL,
  resolveSyntheticBitmapTextCapability,
} from '../workloads';
import type { BenchmarkSpec } from './contracts';
import { fnv1a } from './contracts';
import {
  animationPhase,
  ensureBarsVisible,
  framePhase,
  measureBarAnimation,
  measureFirstText,
  measureHits,
  measurePanZoom,
  measureRandomText,
  measureSelection,
} from './phase-measurements';

export async function runRendererTrial(
  source: unknown,
  spec: BenchmarkSpec,
  trial: number,
  seed: number,
  target: HTMLDivElement,
  waitForAnimationFrame: () => Promise<void>,
  countCanvases: () => number,
): Promise<PatchMapTrial> {
  const input = structuredClone(source);
  const serializedBefore = JSON.stringify(input);
  const core = await createPatchMapRuntime({
    target,
    width: 960,
    height: 540,
    pixelRatio: 1,
    strategy: spec.strategy,
    preference: 'webgl',
    autoRender: false,
    antialias: false,
    resolveBitmapTextCapability: resolveSyntheticBitmapTextCapability,
    assetPolicy: ({ descriptor }) => {
      if (descriptor.src !== PATCH_MAP_SYNTHETIC_ASSET_DATA_URL) {
        throw new Error('PatchMap benchmark asset policy rejected a non-fixture source');
      }
    },
  });
  let destroyed = false;
  try {
    await core.loadAsset(PATCH_MAP_SYNTHETIC_ASSET_ALIAS, PATCH_MAP_SYNTHETIC_ASSET_DATA_URL);
    await core.loadAsset('inverter', PATCH_MAP_SYNTHETIC_ASSET_DATA_URL);
    const load = core.load(input);
    if (JSON.stringify(input) !== serializedBefore) {
      throw new Error('PatchMap mutated benchmark input');
    }

    const prepared = await core.prepare();
    const firstVisibleStarted = performance.now();
    core.flush('first-visible-frame');
    await waitForAnimationFrame();
    const firstVisibleFrameMs = performance.now() - firstVisibleStarted;
    const initialTextDebug = core.renderer.debugSnapshot();
    let uploadChunks = core.renderer.debugSnapshot().uploadedChunks;
    let uploadBytes = core.renderer.debugSnapshot().uploadedBytes;

    const panZoom = measurePanZoom(core);
    const barVisibility = ensureBarsVisible(core);
    uploadChunks += barVisibility.uploadedChunks;
    uploadBytes += barVisibility.uploadedBytes;
    const fullAnimation = measureBarAnimation(core, seed ^ 0xba11, 1, 0);
    uploadChunks += fullAnimation.uploadedChunks;
    uploadBytes += fullAnimation.uploadedBytes;
    const partialAnimation = measureBarAnimation(
      core,
      seed ^ 0x10ba,
      0.1,
      fullAnimation.clockMs,
    );
    uploadChunks += partialAnimation.uploadedChunks;
    uploadBytes += partialAnimation.uploadedBytes;

    const firstText = measureFirstText(core, seed);
    const randomText = measureRandomText(core, seed ^ 0x7e57, firstText.entityId);
    const hit = measureHits(core);
    const selection = measureSelection(core, hit.target);
    const resizeStarted = performance.now();
    core.resize(1_024, 576, 1);
    core.flush('resize');
    const resizeMs = performance.now() - resizeStarted;
    const finalDebug = core.debugSnapshot();
    uploadChunks += finalDebug.renderer.uploadedChunks;
    uploadBytes += finalDebug.renderer.uploadedBytes;

    await core.unloadAsset(PATCH_MAP_SYNTHETIC_ASSET_ALIAS);
    await core.unloadAsset('inverter');
    const destroyStarted = performance.now();
    await core.destroy();
    destroyed = true;
    const destroyMs = performance.now() - destroyStarted;
    const destroyedDebug = core.debugSnapshot();

    const reinitializeStarted = performance.now();
    const reinitialized = await createPatchMapRuntime({
      target,
      width: 320,
      height: 180,
      pixelRatio: 1,
      strategy: spec.strategy,
      preference: 'webgl',
      autoRender: false,
    });
    await reinitialized.destroy();
    const reinitializeMs = performance.now() - reinitializeStarted;
    const lifecycleCanvasCount = countCanvases();

    return Object.freeze({
      trial,
      seed,
      phases: Object.freeze({
        applicationInitMs: core.initializationMetrics.applicationInitMs,
        normalizeMs: load.normalizeMs,
        storeLoadMs: load.storeLoadMs,
        rendererBuildMs: core.initializationMetrics.rendererBuildMs + prepared.storeSyncMs,
        gpuPrepareMs: prepared.gpuPrepareMs,
        firstVisibleFrameMs,
        panZoom: framePhase(panZoom),
        barVisibilitySetup: barVisibility.phase,
        fullBarAnimation: animationPhase(fullAnimation),
        partialBarAnimation: animationPhase(partialAnimation),
        cjkFallbackFirstRender: firstText.phase,
        randomTextChange: randomText.phase,
        hitTestBatchMs: hit.batchMs,
        hitTestPerOperationMs: hit.batchMs / hit.operations,
        selection,
        resizeMs,
        destroyMs,
        reinitializeMs,
        retainedJsHeapBytes: null,
      }),
      diagnostics: Object.freeze({
        sourceRecordCount: load.parse.identity.counts.sourceElements,
        expandedEntityCount: load.parse.identity.counts.entities,
        componentCount: load.parse.identity.counts.sourceComponents,
        relationCount: load.parse.identity.counts.relationLinks,
        aggregateRenderObjects: finalDebug.renderer.aggregateRenderObjects,
        uploadedChunks: Math.max(0, Math.round(uploadChunks)),
        uploadedBytes: Math.max(0, Math.round(uploadBytes)),
        dynamicFullUploadCount: finalDebug.renderer.dynamicFullUploadCount,
        staticInvalidatedUploadCount: finalDebug.renderer.staticInvalidatedUploadCount,
        particleFullUploadCount: finalDebug.renderer.particleFullUploadCount,
        sourceVisibleBarCount: barVisibility.sourceVisibleCount,
        barVisibilitySetupCount: barVisibility.revealedCount,
        animatedVisibleBarCount: barVisibility.animatedVisibleCount,
        fullBarAnimationUploadedChunks: fullAnimation.uploadedChunks,
        fullBarAnimationUploadedBytes: fullAnimation.uploadedBytes,
        partialBarAnimationUploadedChunks: partialAnimation.uploadedChunks,
        partialBarAnimationUploadedBytes: partialAnimation.uploadedBytes,
        uploadObservation: finalDebug.renderer.uploadObservation,
        backend: finalDebug.renderer.backend,
        strategy: spec.strategy,
        checksum: fnv1a(serializedBefore),
        hitCount: hit.hitCount,
        selectedCount: selection.selectedCount,
        diagnosticsCount: load.parse.diagnostics.length,
        bitmapTextCount: finalDebug.renderer.bitmapTextCount,
        fallbackTextCount: finalDebug.renderer.fallbackTextCount,
        cjkFallbackFirstRenderCount: firstText.renderedCount,
        randomTextChangeCount: randomText.changedCount,
        initialBitmapTextCount: initialTextDebug.bitmapTextCount,
        initialFallbackTextCount: initialTextDebug.fallbackTextCount,
        runtimeDestroyed: destroyedDebug.destroyed,
        rendererDestroyed: destroyedDebug.renderer.destroyed,
        schedulerDestroyed: destroyedDebug.scheduler.destroyed,
        lifecycleCanvasCount,
      }),
    });
  } finally {
    if (!destroyed) await core.destroy();
  }
}
