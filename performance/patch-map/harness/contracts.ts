import type { PatchMapRendererStrategy } from '../../../src/patch-map';
import type { PatchMapScale, PatchMapTrial } from '../protocol';

export interface BenchmarkSpec {
  readonly strategy: PatchMapRendererStrategy;
  readonly scale: PatchMapScale;
  readonly seed: number;
  readonly warmups: number;
  readonly measured: number;
}

export interface BenchmarkResult {
  readonly warmupRaw: readonly PatchMapTrial[];
  readonly measuredRaw: readonly PatchMapTrial[];
  readonly environment: Readonly<Record<string, unknown>>;
}

export interface ExtractionTrial {
  readonly trial: number;
  readonly seed: number;
  readonly extractionSamplesMs: readonly number[];
  readonly totalMs: number;
  readonly retainedJsHeapBytes: number;
  readonly diagnostics: Readonly<{
    sourceRootCount: number;
    requestedTuple: Readonly<{ scene: number; view: number; interaction: number }>;
    capturedTuple: Readonly<{ scene: number; view: number; interaction: number }>;
    cssSize: readonly [number, number];
    backingSize: readonly [number, number];
    dataUrlLengths: readonly number[];
    sameCanvasObject: boolean;
    authoritativeCanvasRetained: boolean;
    temporaryImageCount: number;
    renderTextureCount: number;
    pendingWorkAfter: number;
    inputUnchanged: boolean;
    backend: 'webgl' | 'webgpu' | null;
    destroyReturned: boolean;
    lifecycleAfterDestroy: string;
    canvasCountAfterDestroy: number;
  }>;
}

export interface ExtractionBenchmarkResult {
  readonly warmupRaw: readonly ExtractionTrial[];
  readonly measuredRaw: readonly ExtractionTrial[];
  readonly environment: Readonly<Record<string, unknown>>;
}

export function validateSpec(spec: BenchmarkSpec): void {
  if (spec.strategy !== 'mesh' && spec.strategy !== 'particle') {
    throw new Error('invalid renderer strategy');
  }
  if (!Number.isInteger(spec.seed)) throw new Error('benchmark seed must be an integer');
  if (spec.warmups !== 2 || spec.measured !== 7) {
    throw new Error('benchmark protocol requires 2 warmups and 7 measured trials');
  }
  if (spec.scale !== 'production' && ![100, 500, 1_000, 2_000, 5_000].includes(spec.scale)) {
    throw new Error('invalid benchmark scale');
  }
}

export function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
