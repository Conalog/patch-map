export const PATCH_MAP_CONTRACT_PERFORMANCE_WORKLOAD_REVISION =
  'patch-map-contract-performance-workload/1' as const;
export const PATCH_MAP_CONTRACT_PERFORMANCE_WARMUPS = 2;
export const PATCH_MAP_CONTRACT_PERFORMANCE_SAMPLES = 7;

export {
  buildPatchMapContractPerformanceDataset,
  canonicalPatchMapDatasetSha256,
  PATCH_MAP_CONTRACT_PERFORMANCE_SEED,
  PATCH_MAP_CONTRACT_PERFORMANCE_SIZES,
  validatePatchMapContractPerformanceDataset,
} from './contract-workload/dataset';
export type { PatchMapContractPerformanceSize } from './contract-workload/dataset';
export {
  initializePatchMapContractPerformanceEngine,
  measurePatchMapVisibleAction,
} from './contract-workload/measurement';
export type { PatchMapVisibleMeasurement } from './contract-workload/measurement';
export {
  applyPatchMapPerformanceBulkPatch,
  classifyPatchMapTextUpdatePublication,
  panZoomAndSettlePatchMapBarAnimation,
  startPatchMapBarAnimation,
  updatePatchMapRandomText,
} from './contract-workload/mutations';
export type {
  PatchMapPerformanceBarState,
  PatchMapPerformanceBulkObservation,
  PatchMapPerformanceTextObservation,
  PatchMapTextUpdatePublicationClassification,
} from './contract-workload/mutations';
export { runPatchMapContinuousInteraction } from './contract-workload/interaction';
export type { PatchMapPerformanceInteractionObservation } from './contract-workload/interaction';
export {
  countPatchMapLongTasksAtLeast,
  patchMapPerformancePercentile,
  projectPatchMapPerformanceSemantics,
} from './contract-workload/semantics';
export type { PatchMapPerformanceSemanticProjection } from './contract-workload/semantics';
