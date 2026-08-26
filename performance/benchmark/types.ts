import {
  PATCH_MAP_BENCHMARK_SAMPLES,
  PATCH_MAP_BENCHMARK_SEED,
  PATCH_MAP_BENCHMARK_WARMUPS,
  type PatchMapBenchmarkSize,
} from './workload';

export interface BenchmarkSpec {
  readonly size: PatchMapBenchmarkSize;
  readonly seed: number;
  readonly warmups: number;
  readonly measured: number;
  readonly mode?: 'benchmark' | 'smoke';
}

export interface BenchmarkResult {
  readonly warmupRaw: readonly Readonly<Record<string, unknown>>[];
  readonly measuredRaw: readonly Readonly<Record<string, unknown>>[];
  readonly environment: Readonly<Record<string, unknown>>;
}

export function validateBenchmarkSpec(spec: BenchmarkSpec): void {
  if (
    ![100, 500, 1_000, 2_000, 5_000, 'production-shaped-workload-v1']
      .includes(spec.size)
  ) {
    throw new Error(`unsupported benchmark size ${String(spec.size)}`);
  }
  const validCounts = spec.mode === 'smoke'
    ? spec.warmups === 0 && spec.measured === 1
    : (
        spec.warmups === PATCH_MAP_BENCHMARK_WARMUPS
        && spec.measured === PATCH_MAP_BENCHMARK_SAMPLES
      );
  if (spec.seed !== PATCH_MAP_BENCHMARK_SEED || !validCounts) {
    throw new Error('benchmark protocol drift');
  }
}
