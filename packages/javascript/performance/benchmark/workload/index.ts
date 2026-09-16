export const PATCH_MAP_BENCHMARK_WORKLOAD_REVISION =
  'patch-map-benchmark-workload/1' as const;
export const PATCH_MAP_BENCHMARK_WARMUPS = 2;
export const PATCH_MAP_BENCHMARK_SAMPLES = 7;

export {
  buildPatchMapBenchmarkDataset,
  canonicalPatchMapDatasetSha256,
  PATCH_MAP_BENCHMARK_SEED,
  PATCH_MAP_BENCHMARK_SIZES,
  validatePatchMapBenchmarkDataset,
} from './dataset';
export type { PatchMapBenchmarkSize } from './dataset';
export {
  initializePatchMapBenchmarkEngine,
  measurePatchMapVisibleAction,
} from './measurement';
export type { PatchMapVisibleMeasurement } from './measurement';
export {
  applyPatchMapPerformanceBulkPatch,
  classifyPatchMapTextUpdatePublication,
  panZoomAndSettlePatchMapBarAnimation,
  startPatchMapBarAnimation,
  updatePatchMapRandomText,
} from './mutations';
export type {
  PatchMapPerformanceBarState,
  PatchMapPerformanceBulkObservation,
  PatchMapPerformanceTextObservation,
  PatchMapTextUpdatePublicationClassification,
} from './mutations';
export { runPatchMapContinuousInteraction } from './interaction';
export type { PatchMapPerformanceInteractionObservation } from './interaction';
export {
  countPatchMapLongTasksAtLeast,
  patchMapPerformancePercentile,
  projectPatchMapPerformanceSemantics,
} from './semantics';
export type { PatchMapPerformanceSemanticProjection } from './semantics';
