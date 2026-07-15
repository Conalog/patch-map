export const CORE_V2_SCALE_MATRIX = Object.freeze([100, 500, 1_000, 2_000, 5_000] as const);
export const CORE_V2_WARMUP_RUNS = 2;
export const CORE_V2_MEASURED_RUNS = 7;
export const CORE_V2_CPU_THROTTLE_RATE = 4;

export type CoreV2Scale = (typeof CORE_V2_SCALE_MATRIX)[number] | 'production';

export interface SummaryStats {
  readonly samples: readonly number[];
  readonly min: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

export interface FramePhaseSample {
  readonly framesMs: readonly number[];
  readonly p95Ms: number;
}

export interface AnimationPhaseSample extends FramePhaseSample {
  readonly scheduleMs: number;
  readonly scheduledCount: number;
}

export interface SplitPhaseSample {
  readonly commitMs: number;
  readonly renderMs: number;
  readonly totalMs: number;
}

export interface CoreV2TrialPhases {
  readonly applicationInitMs: number;
  readonly normalizeMs: number;
  readonly storeLoadMs: number;
  readonly rendererBuildMs: number;
  readonly gpuPrepareMs: number;
  readonly firstVisibleFrameMs: number;
  readonly panZoom: FramePhaseSample;
  readonly fullBarAnimation: AnimationPhaseSample;
  readonly partialBarAnimation: AnimationPhaseSample;
  readonly cjkFallbackFirstRender: SplitPhaseSample;
  readonly randomTextChange: SplitPhaseSample;
  readonly hitTestBatchMs: number;
  readonly hitTestPerOperationMs: number;
  readonly selection: SplitPhaseSample;
  readonly resizeMs: number;
  readonly destroyMs: number;
  readonly reinitializeMs: number;
  readonly retainedJsHeapBytes: number | null;
}

export interface CoreV2TrialDiagnostics {
  readonly sourceRecordCount: number;
  readonly expandedEntityCount: number;
  readonly componentCount: number;
  readonly relationCount: number;
  readonly aggregateRenderObjects: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
  readonly dynamicFullUploadCount: number;
  readonly staticInvalidatedUploadCount: number;
  readonly particleFullUploadCount: number;
  readonly backend: string;
  readonly strategy: 'mesh' | 'particle';
  readonly checksum: string;
  readonly hitCount: number;
  readonly selectedCount: number;
  readonly cjkFallbackFirstRenderCount: number;
  readonly randomTextChangeCount: number;
  readonly initialBitmapTextCount: number;
  readonly initialFallbackTextCount: number;
}

export interface CoreV2Trial {
  readonly trial: number;
  readonly seed: number;
  readonly phases: CoreV2TrialPhases;
  readonly diagnostics: CoreV2TrialDiagnostics;
}

export function summarize(samples: readonly number[]): SummaryStats {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new TypeError('performance samples must contain finite non-negative values');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    samples: Object.freeze([...samples]),
    min: sorted[0]!,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1)!,
  });
}

export function percentile(samples: readonly number[], quantile: number): number {
  if (samples.length === 0) throw new RangeError('percentile requires at least one sample');
  if (!(quantile >= 0 && quantile <= 1)) throw new RangeError('quantile must be between zero and one');
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, rank)]!;
}

export function assertProtocolTrials(
  warmupRaw: readonly CoreV2Trial[],
  measuredRaw: readonly CoreV2Trial[],
): void {
  if (warmupRaw.length !== CORE_V2_WARMUP_RUNS) {
    throw new Error(`expected ${CORE_V2_WARMUP_RUNS} warmup trials, received ${warmupRaw.length}`);
  }
  if (measuredRaw.length !== CORE_V2_MEASURED_RUNS) {
    throw new Error(`expected ${CORE_V2_MEASURED_RUNS} measured trials, received ${measuredRaw.length}`);
  }
}
