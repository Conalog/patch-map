import type { PatchMapRendererStrategy } from '../src/rendering-port';
import {
  createSyntheticPatchMap,
} from './workloads';
import type { PatchMapScale, PatchMapTrial } from './protocol';
import {
  type BenchmarkResult,
  type BenchmarkSpec,
  type ExtractionBenchmarkResult,
  type ExtractionTrial,
  validateSpec,
} from './harness/contracts';
import {
  EXTRACTIONS_PER_TRIAL,
  runExtractionTrial,
} from './harness/extraction-trial';
import { runRendererTrial } from './harness/renderer-trial';

declare global {
  interface Window {
    __PATCH_MAP_BENCHMARK__: {
      readonly selectedStrategy: PatchMapRendererStrategy;
      run(spec: BenchmarkSpec): Promise<BenchmarkResult>;
      runExtraction(spec: BenchmarkSpec): Promise<ExtractionBenchmarkResult>;
    };
    gc?: () => void;
  }
}

const surface = requiredElement<HTMLDivElement>('surface');
const status = requiredElement<HTMLPreElement>('status');
let productionInputPromise: Promise<unknown> | null = null;

window.__PATCH_MAP_BENCHMARK__ = {
  selectedStrategy: 'mesh',
  async run(spec): Promise<BenchmarkResult> {
    validateSpec(spec);
    status.textContent = `${spec.strategy}/${spec.scale}: preparing input`;
    const source = await sourceFor(spec.scale, spec.seed);
    const warmupRaw: PatchMapTrial[] = [];
    const measuredRaw: PatchMapTrial[] = [];

    for (let index = 0; index < spec.warmups; index += 1) {
      status.textContent = `${spec.strategy}/${spec.scale}: warmup ${index + 1}/${spec.warmups}`;
      warmupRaw.push(await runMeasuredTrial(source, spec, index, spec.seed + index));
    }
    for (let index = 0; index < spec.measured; index += 1) {
      status.textContent = `${spec.strategy}/${spec.scale}: measured ${index + 1}/${spec.measured}`;
      measuredRaw.push(
        await runMeasuredTrial(source, spec, index, spec.seed + spec.warmups + index),
      );
    }
    status.textContent = `${spec.strategy}/${spec.scale}: complete`;
    return Object.freeze({
      warmupRaw: Object.freeze(warmupRaw),
      measuredRaw: Object.freeze(measuredRaw),
      environment: Object.freeze({
        userAgent: navigator.userAgent,
        devicePixelRatio,
        heapMethod: heapMethod(),
        gpuPrepare: 'Pixi PrepareSystem public upload wall time',
        presentation: 'manual Application.render followed by requestAnimationFrame',
      }),
    });
  },
  async runExtraction(spec): Promise<ExtractionBenchmarkResult> {
    validateSpec(spec);
    status.textContent = `${spec.strategy}/${spec.scale}: preparing extraction input`;
    const source = await sourceFor(spec.scale, spec.seed);
    const warmupRaw: ExtractionTrial[] = [];
    const measuredRaw: ExtractionTrial[] = [];

    for (let index = 0; index < spec.warmups; index += 1) {
      status.textContent =
        `${spec.strategy}/${spec.scale}: extraction warmup ${index + 1}/${spec.warmups}`;
      warmupRaw.push(
        await runMeasuredExtractionTrial(source, spec, index, spec.seed + index),
      );
    }
    for (let index = 0; index < spec.measured; index += 1) {
      status.textContent =
        `${spec.strategy}/${spec.scale}: extraction measured ${index + 1}/${spec.measured}`;
      measuredRaw.push(
        await runMeasuredExtractionTrial(
          source,
          spec,
          index,
          spec.seed + spec.warmups + index,
        ),
      );
    }
    status.textContent = `${spec.strategy}/${spec.scale}: extraction complete`;
    return Object.freeze({
      warmupRaw: Object.freeze(warmupRaw),
      measuredRaw: Object.freeze(measuredRaw),
      environment: Object.freeze({
        userAgent: navigator.userAgent,
        devicePixelRatio,
        heapMethod: heapMethod(),
        backend: 'webgl',
        canvasCssSize: Object.freeze([960, 540]),
        extractionsPerTrial: EXTRACTIONS_PER_TRIAL,
      }),
    });
  },
};

async function runMeasuredExtractionTrial(
  source: unknown,
  spec: BenchmarkSpec,
  trial: number,
  seed: number,
): Promise<ExtractionTrial> {
  await forceGc();
  const heapBefore = usedHeap();
  surface.replaceChildren();
  let result: Omit<ExtractionTrial, 'retainedJsHeapBytes'>;
  try {
    result = await runExtractionTrial(
      source,
      spec,
      trial,
      seed,
      surface,
      nextAnimationFrame,
    );
  } finally {
    surface.replaceChildren();
  }
  await forceGc();
  return Object.freeze({
    ...result,
    retainedJsHeapBytes: Math.max(0, usedHeap() - heapBefore),
  });
}

async function runMeasuredTrial(
  source: unknown,
  spec: BenchmarkSpec,
  trial: number,
  seed: number,
): Promise<PatchMapTrial> {
  await forceGc();
  const heapBefore = usedHeap();
  surface.replaceChildren();
  let result: PatchMapTrial;
  try {
    result = await runRendererTrial(
      source,
      spec,
      trial,
      seed,
      surface,
      nextAnimationFrame,
      countSurfaceCanvases,
    );
  } finally {
    surface.replaceChildren();
  }

  // Measure only after runRendererTrial's input clone, serialized fingerprint,
  // PatchMapRuntime instance, and Pixi application have left their lexical scope.
  // The returned numeric/raw evidence remains live by design and is included in this delta.
  await forceGc();
  const retainedJsHeapBytes = Math.max(0, usedHeap() - heapBefore);
  return Object.freeze({
    ...result,
    phases: Object.freeze({ ...result.phases, retainedJsHeapBytes }),
  });
}

async function sourceFor(scale: PatchMapScale, seed: number): Promise<unknown> {
  if (scale !== 'production') return createSyntheticPatchMap(scale, seed);
  productionInputPromise ??= fetch('/lab/fixtures/production-like.json').then(async (response) => {
    if (!response.ok) throw new Error(`production fixture failed with HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  });
  return productionInputPromise;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}

function countSurfaceCanvases(): number {
  return surface.querySelectorAll('canvas').length;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function forceGc(): Promise<void> {
  window.gc?.();
  await Promise.resolve();
  window.gc?.();
}

function usedHeap(): number {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return Number(memory?.usedJSHeapSize ?? 0);
}

function heapMethod(): string {
  return window.gc && usedHeap() > 0
    ? 'window.gc + performance.memory.usedJSHeapSize'
    : 'unavailable-zero';
}
