/** Intentional public entry for `@conalog/patch-map`. */
import { PatchMap as PatchMapImplementation } from './patch-map/engine';
import type {
  PatchMapInstance,
  PatchMapOptions,
  PatchMapStatic,
} from './patch-map/developer-api';

const PublicPatchMap = class PatchMap {
  private constructor() {
    throw new TypeError('PatchMap cannot be constructed directly; use PatchMap.mount(...)');
  }

  public static mount(options: PatchMapOptions): Promise<PatchMapInstance> {
    return PatchMapImplementation.mount(options);
  }
};

/** Mounts the aggregate PixiJS PatchMap product. */
export const PatchMap: PatchMapStatic = Object.freeze(PublicPatchMap);
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
  PatchMapBackgroundPresentationChanges,
  PatchMapBackgroundPresentationColumns,
  PatchMapBackgroundUpdate,
  PatchMapBackgroundUpdateColumns,
  PatchMapBarUpdate,
  PatchMapBarUpdateColumns,
  PatchMapBlankClickClearMode,
  PatchMapBoxSelectionOptions,
  PatchMapBoxSelectionVisualPolicy,
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
  PatchMapIconUpdate,
  PatchMapIconUpdateColumns,
  PatchMapInstancePresentationChanges,
  PatchMapMutationOptions,
  PatchMapOptions,
  PatchMapPointerApi,
  PatchMapPointerHoverEvent,
  PatchMapPointerPolicy,
  PatchMapPointerEventModifiers,
  PatchMapPointerSelectionChange,
  PatchMapPresentationPatch,
  PatchMapResizeByOptions,
  PatchMapSelectionApi,
  PatchMapSelectionDisplayMode,
  PatchMapSelectionInput,
  PatchMapSelectionPolicy,
  PatchMapSelectionStrokeAlignment,
  PatchMapSelectionStrokeScale,
  PatchMapSelectionVisualPolicy,
  PatchMapTarget,
  PatchMapTargetMatch,
  PatchMapTargetQuery,
  PatchMapTargetScope,
  PatchMapTargetSet,
  PatchMapTargetsApi,
  PatchMapTargetsInput,
  PatchMapTheme,
  PatchMapTextUpdate,
  PatchMapTextUpdateColumns,
  PatchMapTextPresentationChanges,
  PatchMapTextPresentationColumns,
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
  PatchMapViewportOptions,
  PatchMapWheelActivationModifier,
  PatchMapWheelOptions,
} from './patch-map/developer-api/contracts';
export type * from './patch-map/input';
