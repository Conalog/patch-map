import { createPixiSurface } from '../../../src/composition/pixi-engine-surface';
import { PatchMap } from '../../../src/engine';
import { buildPatchMapSeededScene } from '../../fixtures/seeded-scene';

declare global {
  interface Window {
    __PATCH_MAP_MEMORY__: {
      run(spec: Readonly<{ warmups: number; measured: number; size: number; seed: number }>):
        Promise<Readonly<{ warmupRaw: readonly MemoryTrial[]; measuredRaw: readonly MemoryTrial[] }>>;
    };
    gc?: () => void;
  }
}

interface MemoryTrial {
  readonly retainedJsHeapBytes: number;
  readonly sourceItems: number;
  readonly inputUnchanged: boolean;
  readonly backend: string | null;
  readonly destroyed: boolean;
  readonly lifecycleAfterDestroy: string;
  readonly canvasCountAfterDestroy: number;
  readonly pendingWorkAfterDestroy: number;
  readonly subscriptionCountAfterDestroy: number;
  readonly hostChildCountAfterDestroy: number;
}

const surfaceElement = document.getElementById('surface');
if (!(surfaceElement instanceof HTMLDivElement)) {
  throw new Error('memory probe requires #surface');
}
const surface: HTMLDivElement = surfaceElement;

window.__PATCH_MAP_MEMORY__ = Object.freeze({
  async run(spec) {
    const warmupRaw: MemoryTrial[] = [];
    const measuredRaw: MemoryTrial[] = [];
    for (let index = 0; index < spec.warmups + spec.measured; index += 1) {
      window.gc?.();
      const heapBefore = usedHeap();
      const raw = await runTrial(spec.size, spec.seed + index);
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

async function runTrial(
  size: number,
  seed: number,
): Promise<Omit<MemoryTrial, 'retainedJsHeapBytes'>> {
  surface.replaceChildren();
  const input = structuredClone(buildPatchMapSeededScene(size, seed));
  const serializedBefore = JSON.stringify(input);
  const engine = new PatchMap({ surfaceFactory: createPixiSurface });
  try {
    await engine.initialize({
      instanceId: `memory-${size}-${seed}`,
      target: surface,
      width: 960,
      height: 540,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      antialias: false,
    });
    engine.loadDataset(input, { datasetRef: `memory:${size}:${seed}` });
    engine.publishFrame(0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const active = engine.snapshot();
    await engine.destroy();
    const destroyed = engine.snapshot();
    surface.replaceChildren();
    return Object.freeze({
      sourceItems: input.length,
      inputUnchanged: JSON.stringify(input) === serializedBefore,
      backend: active.resources.renderer?.backend ?? null,
      destroyed: destroyed.lifecycle === 'destroyed',
      lifecycleAfterDestroy: destroyed.lifecycle,
      canvasCountAfterDestroy: destroyed.resources.canvasCount,
      pendingWorkAfterDestroy: destroyed.pendingWork,
      subscriptionCountAfterDestroy: destroyed.resources.subscriptions.active,
      hostChildCountAfterDestroy: surface.childElementCount,
    });
  } finally {
    await engine.destroy().catch(() => undefined);
    surface.replaceChildren();
  }
}

function usedHeap(): number {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return Number(memory?.usedJSHeapSize ?? 0);
}
