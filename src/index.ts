/** Intentional public entry for `@conalog/patch-map`. */
import { PatchMap as PatchMapImplementation } from './patch-map/engine';
import type {
  PatchMapInstance,
  PatchMapStatic,
} from './patch-map/developer-api';

/** Mounts the aggregate PixiJS PatchMap product. */
export const PatchMap: PatchMapStatic = PatchMapImplementation;
export type PatchMap = PatchMapInstance;

export { PatchMapError } from './patch-map/engine/operation-outcomes';
export {
  PATCH_MAP_BUILTIN_ASSETS,
  PatchMapAssetError,
  PatchMapAssetRuntime,
  createPatchMapAssetIngestionPolicy,
  createPatchMapPixiAssetBackend,
} from './patch-map/assets';
export {
  PatchMapMigrationError,
  assertPatchMapSemanticRoundtrip,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
} from './patch-map/migration';

export type {
  PatchMapAssetPolicy,
  PatchMapAssetPolicyContext,
  PatchMapAssetBackend,
  PatchMapAssetBackendRequest,
  PatchMapAssetIngestionPolicyProfile,
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetResourceProbe,
  PatchMapAssetRuntimeProbe,
  PatchMapAssetSessionProbe,
  PatchMapPixiAssetBackendOptions,
} from './patch-map/assets';
export type {
  PatchMapCompatibilityMaterialization,
  PatchMapPersistenceExport,
} from './patch-map/migration';
export type { PatchMapHistoryState } from './patch-map/history';
export type {
  PatchMapViewportChangeResult,
  PatchMapViewportFitResult,
  PatchMapViewportRestoreResult,
  PatchMapViewportState,
} from './patch-map/engine/public-contracts';
export type {
  PatchMapAssetStatus,
  PatchMapAssetsApi,
  PatchMapBarUpdate,
  PatchMapBarUpdateColumns,
  PatchMapCaptureApi,
  PatchMapCaptureResult,
  PatchMapComponentUpdate,
  PatchMapComponentUpdateColumns,
  PatchMapDataApi,
  PatchMapDataReplaceOptions,
  PatchMapDataReplaceResult,
  PatchMapDebugApi,
  PatchMapDebugSnapshot,
  PatchMapDiagnostic,
  PatchMapFitOptions,
  PatchMapHistoryApi,
  PatchMapHistoryClearResult,
  PatchMapHistoryResult,
  PatchMapMutationOptions,
  PatchMapOptions,
  PatchMapResizeByOptions,
  PatchMapSelectionApi,
  PatchMapSelectionInput,
  PatchMapTarget,
  PatchMapTargetMatch,
  PatchMapTargetQuery,
  PatchMapTargetScope,
  PatchMapTargetSet,
  PatchMapTargetsApi,
  PatchMapTargetsInput,
  PatchMapTextUpdate,
  PatchMapTextUpdateColumns,
  PatchMapTransactionOperation,
  PatchMapTransactionOptions,
  PatchMapTransformApi,
  PatchMapTransformOptions,
  PatchMapTransformResult,
  PatchMapUpdate,
  PatchMapUpdateBatch,
  PatchMapUpdateColumn,
  PatchMapUpdateOptions,
  PatchMapUpdateRecord,
  PatchMapUpdateResult,
  PatchMapUpdateStatus,
  PatchMapUpdateTargetsInput,
  PatchMapViewportApi,
} from './patch-map/developer-api/contracts';
export type * from './patch-map/input';
