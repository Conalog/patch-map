import productionShapedWorkload from '../../fixtures/production-shaped.json';
import { buildPatchMapSeededScenarioScene } from '../../fixtures/seeded-scene';
import { runExtractionTrial } from './trial';
import type { ExtractionResult, ExtractionSpec, ExtractionTrial } from './types';

declare global {
  interface Window {
    __PATCH_MAP_EXTRACTION__: { run(spec: ExtractionSpec): Promise<ExtractionResult> };
    gc?: () => void;
  }
}

const surface = document.getElementById('surface');
if (!(surface instanceof HTMLDivElement)) throw new Error('extraction probe requires #surface');

window.__PATCH_MAP_EXTRACTION__ = Object.freeze({
  async run(spec) {
    const source = spec.scale === 'production'
      ? productionShapedWorkload
      : buildPatchMapSeededScenarioScene(spec.scale, spec.seed);
    const warmupRaw: ExtractionTrial[] = [];
    const measuredRaw: ExtractionTrial[] = [];
    for (let index = 0; index < spec.warmups + spec.measured; index += 1) {
      window.gc?.();
      const heapBefore = usedHeap();
      surface.replaceChildren();
      const raw = await runExtractionTrial(
        source,
        spec,
        index,
        spec.seed + index,
        surface,
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      surface.replaceChildren();
      window.gc?.();
      await Promise.resolve();
      window.gc?.();
      const trial = Object.freeze({
        ...raw,
        retainedJsHeapBytes: Math.max(0, usedHeap() - heapBefore),
      });
      (index < spec.warmups ? warmupRaw : measuredRaw).push(trial);
    }
    return Object.freeze({
      warmupRaw: Object.freeze(warmupRaw),
      measuredRaw: Object.freeze(measuredRaw),
    });
  },
});

function usedHeap(): number {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return Number(memory?.usedJSHeapSize ?? 0);
}
