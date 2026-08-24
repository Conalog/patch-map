import { PatchMap } from '../../../src/patch-map';
import {
  PATCH_MAP_SYNTHETIC_ASSET_ALIAS,
  PATCH_MAP_SYNTHETIC_ASSET_DATA_URL,
} from '../workloads';
import type { BenchmarkSpec, ExtractionTrial } from './contracts';

export const EXTRACTIONS_PER_TRIAL = 10;

export async function runExtractionTrial(
  source: unknown,
  spec: BenchmarkSpec,
  trial: number,
  seed: number,
  target: HTMLDivElement,
  waitForAnimationFrame: () => Promise<void>,
): Promise<Omit<ExtractionTrial, 'retainedJsHeapBytes'>> {
  const input = structuredClone(source);
  const serializedBefore = JSON.stringify(input);
  const engine = new PatchMap({
    assetPolicy: ({ descriptor, packageOwned }) => {
      if (
        !packageOwned
        && descriptor.src !== PATCH_MAP_SYNTHETIC_ASSET_DATA_URL
      ) {
        throw new Error('PatchMap extraction benchmark rejected a non-fixture asset');
      }
    },
  });
  let destroyed = false;
  try {
    await engine.initialize({
      instanceId: `core-v2-extraction-${String(spec.scale)}-${trial}-${seed}`,
      target,
      width: 960,
      height: 540,
      pixelRatio: 1,
      strategy: spec.strategy,
      preference: 'webgl',
      antialias: false,
      requiredAssets: [{
        alias: PATCH_MAP_SYNTHETIC_ASSET_ALIAS,
        descriptor: PATCH_MAP_SYNTHETIC_ASSET_DATA_URL,
        kind: 'image',
      }],
    });
    engine.loadDataset(input, {
      datasetRef: `performance:${String(spec.scale)}:${seed}`,
    });
    if (JSON.stringify(input) !== serializedBefore) {
      throw new Error('PatchMap extraction benchmark mutated its input');
    }
    engine.publishFrame(0);
    await waitForAnimationFrame();

    const requestedTuple = engine.snapshot().publishedTuple;
    const beforeCanvas = engine.canvasHandle();
    const extractionSamplesMs: number[] = [];
    const dataUrlLengths: number[] = [];
    let capturedTuple = requestedTuple;
    let cssSize = beforeCanvas.cssSize;
    let backingSize = beforeCanvas.backingSize;
    let authoritativeCanvasRetained = true;
    let temporaryImageCount = 0;
    let renderTextureCount = 0;
    const totalStarted = performance.now();
    for (let index = 0; index < EXTRACTIONS_PER_TRIAL; index += 1) {
      const started = performance.now();
      const extracted = await engine.extractPublishedScene({
        targetTuple: requestedTuple,
        cssSize: [960, 540],
        mime: 'image/png',
      });
      extractionSamplesMs.push(performance.now() - started);
      if (!extracted.dataUrl.startsWith('data:image/png;base64,')) {
        throw new Error('PatchMap extraction benchmark received non-PNG data');
      }
      dataUrlLengths.push(extracted.dataUrl.length);
      capturedTuple = extracted.capturedTuple;
      cssSize = extracted.cssSize;
      backingSize = extracted.backingSize;
      authoritativeCanvasRetained &&= extracted.authoritativeCanvasRetained;
      temporaryImageCount += extracted.temporaryImageCount;
      renderTextureCount += extracted.renderTextureCount;
    }
    const totalMs = performance.now() - totalStarted;
    const afterCanvas = engine.canvasHandle();
    const activeSnapshot = engine.snapshot();
    const destroyReturned = await engine.destroy();
    destroyed = true;
    const destroyedSnapshot = engine.snapshot();

    return Object.freeze({
      trial,
      seed,
      extractionSamplesMs: Object.freeze(extractionSamplesMs),
      totalMs,
      diagnostics: Object.freeze({
        sourceRootCount: Array.isArray(input) ? input.length : 0,
        requestedTuple,
        capturedTuple,
        cssSize,
        backingSize,
        dataUrlLengths: Object.freeze(dataUrlLengths),
        sameCanvasObject: beforeCanvas.element === afterCanvas.element,
        authoritativeCanvasRetained,
        temporaryImageCount,
        renderTextureCount,
        pendingWorkAfter: activeSnapshot.pendingWork,
        inputUnchanged: JSON.stringify(input) === serializedBefore,
        backend: activeSnapshot.resources.renderer?.backend ?? null,
        destroyReturned,
        lifecycleAfterDestroy: destroyedSnapshot.lifecycle,
        canvasCountAfterDestroy: destroyedSnapshot.resources.canvasCount,
      }),
    });
  } finally {
    if (!destroyed) await engine.destroy().catch(() => undefined);
  }
}
