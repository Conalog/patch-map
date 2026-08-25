import {
  PATCH_MAP_CONTRACT_PERFORMANCE_SAMPLES,
  PATCH_MAP_CONTRACT_PERFORMANCE_SEED,
  PATCH_MAP_CONTRACT_PERFORMANCE_WARMUPS,
  type PatchMapContractPerformanceSize,
} from '../contract-workload';

export interface ContractHarnessSpec {
  readonly size: PatchMapContractPerformanceSize;
  readonly seed: number;
  readonly warmups: number;
  readonly measured: number;
  readonly mode?: 'contract' | 'smoke';
}

export interface ContractHarnessResult {
  readonly warmupRaw: readonly Readonly<Record<string, unknown>>[];
  readonly measuredRaw: readonly Readonly<Record<string, unknown>>[];
  readonly environment: Readonly<Record<string, unknown>>;
}

export function validateContractHarnessSpec(spec: ContractHarnessSpec): void {
  if (
    ![100, 500, 1_000, 2_000, 5_000, 'production-shaped-workload-v1']
      .includes(spec.size)
  ) {
    throw new Error(`unsupported contract performance size ${String(spec.size)}`);
  }
  const validCounts = spec.mode === 'smoke'
    ? spec.warmups === 0 && spec.measured === 1
    : (
        spec.warmups === PATCH_MAP_CONTRACT_PERFORMANCE_WARMUPS
        && spec.measured === PATCH_MAP_CONTRACT_PERFORMANCE_SAMPLES
      );
  if (spec.seed !== PATCH_MAP_CONTRACT_PERFORMANCE_SEED || !validCounts) {
    throw new Error('contract performance protocol drift');
  }
}
