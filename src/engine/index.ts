import {
  type PatchMapComponentVisualTarget,
  type PatchMapTextTarget,
} from '../core/contracts';
import {
  type PatchMapFrameLoop,
  type PatchMapFrameLoopOptions,
} from '../scheduler';
import type {
  PatchMapPointerHoverEvent,
  PatchMapPointerPolicy,
  PatchMapPointerSelectionChange,
  PatchMapPointerTooltipEvent,
  PatchMapSelectionPolicy,
  PatchMapViewportSnapshot,
} from '../public/contracts';
import type {
  PatchMapPresentationPolicyInput,
  PatchMapPresentationPolicyProductProbe,
} from '../presentation/policy';
import type {
  PatchMapLogicalPresentationLayerInput,
  PatchMapPresentationLayerChange,
} from '../core/presentation-layers';
import type { SlotRange } from '../dense/contracts';
import type {
  PatchMapRendererLossProbe,
} from '../rendering-port';
import type { PatchMapSceneImageRetryResult } from '../scene-images';
import { sameStringArray } from '../shared/string-array-values';
import {
  PATCH_MAP_BUILTIN_ASSETS,
  PatchMapAssetError,
  type PatchMapAssetAcquisition,
  type PatchMapAssetRegistration,
  type PatchMapAssetRegistrationResult,
  type PatchMapAssetRuntimeProbe,
  type PatchMapAssetSession,
  type PatchMapAssetSessionProbe,
} from '../assets';
import {
  PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
  PatchMapHostAssetIngestionAuthority,
  type PatchMapHostAssetIngestionInput,
  type PatchMapHostAssetIngestionProbe,
} from '../assets/host-ingestion';
import {
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
  PatchMapEditorWorkflowAuthority,
  type PatchMapEditorWorkflowAction,
  type PatchMapEditorWorkflowProbe,
} from '../editor-workflow';
import {
  PatchMapPageLifecycleAuthority,
  type PatchMapPageLifecycleWorkCompletion,
  type PatchMapPageLifecycleWorkToken,
} from './page-lifecycle';
import {
  PatchMapAccessibilityAuthority,
  derivePatchMapAccessibilityTargets,
  type PatchMapAccessibilityActivationInput,
  type PatchMapAccessibilityActivationResult,
  type PatchMapAccessibilityProbe,
} from '../accessibility';
import {
  materializePatchMapDataset,
  releasePatchMapSemanticHashScratch,
  type MaterializedPatchMapDataset,
  type NormalizedPatchMapElement,
} from '../semantic/dataset';
import {
  type PatchMapSemanticProductProbe,
  type PatchMapSemanticTarget,
} from '../semantic/probe';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  planPatchMapBarHeightBatch,
  planPatchMapBulkPatch,
  planPatchMapMutationTransaction,
  planPatchMapTextBatch,
  type PatchMapBarHeightBatchRequest,
  type PatchMapBulkPatchRequest,
  type PatchMapMutationJsonValue,
  type PatchMapTextBatchRequest,
  type PatchMapMutationTarget,
  type PatchMapMutationTransactionPlan,
  type PatchMapMutationTransactionRequest,
} from '../semantic/transaction';
import { runPatchMapEditorMutationMatrix } from './editor-mutation-matrix';
import {
  applyPatchMapRelativeGeometryUpdate,
  resizePatchMapGeometryAroundOrigin,
  type PatchMapRelativeGeometryChanges,
  type PatchMapVisibleCenterResize,
} from '../semantic/geometry-update';
import type {
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitOptions,
} from './surface-contract';
export type {
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitIndex,
  PatchMapRelationHitOptions,
  PatchMapSurfaceEntityGeometry,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceOmittedRelationGeometry,
  PatchMapSurfaceRegionGeometryCandidates,
  PatchMapSurfaceRelationGeometry,
  PatchMapSurfaceView,
} from './surface-contract';
import type {
  PatchMapEngineSceneImagesProbe,
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapInteractionOwnershipProbe,
  PatchMapSurfaceOptions,
  PatchMapSurfaceContextMenuInput,
  PatchMapSurfacePointerInput,
  PatchMapSurfaceViewportInput,
} from './contracts';
export type {
  PatchMapEngineSceneImageAttemptProbe,
  PatchMapEngineSceneImageRecord,
  PatchMapEngineSceneImagesProbe,
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapInteractionOwnershipProbe,
  PatchMapSurfaceComponentVisualProbe,
  PatchMapSurfaceDebug,
  PatchMapSurfaceOptions,
  PatchMapSurfacePointerInput,
  PatchMapSurfacePrepareResult,
  PatchMapSurfaceReconcileOptions,
  PatchMapSurfaceReconcileResult,
  PatchMapSurfaceViewportInput,
} from './contracts';
import { normalizePatchMapColorTheme } from '../semantic/color';
export {
  buildPatchMapRelationHitIndex,
  createPatchMapSurfaceGeometrySnapshot,
  createPatchMapSurfaceWorldGeometrySnapshot,
  hitTestPatchMapSurfaceRelations,
  queryPatchMapRelationHitIndex,
} from './surface-geometry';
import {
  cloneDetachedEngineRecord,
  componentSemanticKey,
  engineTextTargetKey,
  type IndexedEngineTextSemantic,
  type PatchMapEngineComponentSemanticProbe,
} from './semantic-index';
import { PatchMapViewportAuthority } from './viewport-authority';
import { PatchMapViewportRuntimeCoordinator } from './viewport-runtime-coordinator';
import { PatchMapTransformerSessionCoordinator } from './transformer-session-coordinator';
import { PatchMapTransactionCommitCoordinator } from './transaction-commit-coordinator';
import { PatchMapDatasetReplacementCoordinator } from './dataset-replacement-coordinator';
import { PatchMapHistoryApplicationCoordinator } from './history-application-coordinator';
import { PatchMapDirectMutationCoordinator } from './direct-mutation-coordinator';
import { PatchMapPublicationAuthority } from './publication-authority';
import { PatchMapSurfaceMutationGuard } from './surface-mutation-guard';
import { PatchMapSceneStateAuthority } from './scene-state-authority';
import { PatchMapSurfaceLifecycleAuthority } from './surface-lifecycle-authority';
import { PatchMapAssetSessionAuthority } from './asset-session-authority';
import { PatchMapManagedFrameLoopAuthority } from './managed-frame-loop-authority';
import { PatchMapCaptureExtractionAuthority } from './capture-extraction-authority';
import { PatchMapPointerInteractionCoordinator } from './pointer-interaction-coordinator';
import { PatchMapSelectionRuntimeCoordinator } from './selection-runtime-coordinator';
import { PatchMapEventHub } from './event-hub';
import { PatchMapPageLifecycleCoordinator } from './page-lifecycle-coordinator';
import { readPatchMapEngineRuntimeDiagnostics } from './runtime-diagnostics-reader';
import {
  PATCH_MAP_ENGINE_FACILITIES as FACILITIES,
  readPatchMapEngineAggregateRenderOwnerProbe,
  readPatchMapEngineBarPresentationProbe,
  readPatchMapEngineComponentVisualProbe,
  readPatchMapEngineInteractionOwnershipProbe,
  readPatchMapEnginePaintOrderProbe,
  readPatchMapEngineRendererPublicSurfaceProbe,
  readPatchMapEngineRendererLossProbe,
  readPatchMapEngineSceneImageProbe,
  readPatchMapEngineSemanticProbe,
  readPatchMapEngineSnapshot,
  readPatchMapEngineTextProbe,
  type PatchMapEngineProductProbeReadPort,
} from './product-probe-reader';
import {
  nonEmptyValue,
  normalizeBackground,
  normalizeEngineMutationTarget,
  normalizeSnapshotTarget,
  positiveSafeInteger,
  validateInitializeOptions,
  validateNonNegativeFinite,
  validatePoint,
} from './input-contracts';
import {
  type PatchMapEngineHistoryCompanion,
} from './history-planning';
import {
  EMPTY_PATCH_MAP_TARGETS as EMPTY_TARGETS,
  PatchMapError,
  createPatchMapAssetInitializationError,
  createPatchMapDiagnosticFromError,
  createPatchMapOperationDiagnostic,
  createPatchMapOperationError,
  createPatchMapRejectedPatchResult,
} from './operation-outcomes';
export { PatchMapError } from './operation-outcomes';
export type {
  PatchMapEngineComponentSemanticProbe,
  PatchMapEngineTextSemanticProbe,
} from './semantic-index';
import type {
  PatchMapAggregateRenderOwnerProbe,
  PatchMapEngineBarPresentationProbe,
  PatchMapEngineComponentVisualProbe,
  PatchMapEngineGeometryProbe,
  PatchMapEnginePaintOrderProbe,
  PatchMapEngineRendererPublicSurfaceProbe,
  PatchMapEnginePointerInput,
  PatchMapEngineRelationProbe,
  PatchMapEngineRendererLossProbe,
  PatchMapEngineTextProbe,
  PatchMapGeometryRevisionTuple,
} from './contracts/rendering';
import type {
  PatchMapCommandTargetStatusResult,
  PatchMapEnginePointSelectionResult,
  PatchMapEngineQueryResult,
  PatchMapEngineQueryReuseResult,
  PatchMapEngineRegionSelectionOptions,
  PatchMapEngineRegionSelectionResult,
  PatchMapEngineRelationEndpointSelectionResult,
  PatchMapEngineSelectionHit,
  PatchMapExternalSelectionResult,
  PatchMapResolvedTargetSnapshot,
} from './contracts/query-selection';
import type {
  PatchMapDatasetSubmission,
  PatchMapDatasetSubmissionResult,
  PatchMapEngineLoadResult,
  PatchMapEnginePrepareResult,
  PatchMapEnginePresentationResult,
  PatchMapEngineSnapshot,
  PatchMapExternalDependencyResult,
  PatchMapInitializeOptions,
  PatchMapInitializeResult,
  PatchMapLoadOptions,
  PatchMapEngineOptions,
} from './contracts/product';
import type {
  PatchMapDiagnosticCategory,
  PatchMapEngineDiagnostic,
  PatchMapEngineDocumentVisibilityInput,
  PatchMapEngineDocumentVisibilityResult,
  PatchMapEnginePageLifecycleProbe,
  PatchMapEnginePageLifecycleWorkInput,
  PatchMapHostLifecycleRebindResult,
  PatchMapLifecycle,
  PatchMapPublishedTuple,
  PatchMapRevisionStamp,
} from './contracts/lifecycle';
import type {
  PatchMapEngineAuthoringResult,
  PatchMapEngineEditorMutationMatrixInput,
  PatchMapEngineEditorMutationMatrixResult,
  PatchMapEngineEditorWorkflowResult,
  PatchMapEngineHostAssetIngestionResult,
} from './contracts/editor';
import type {
  PatchMapEngineCanvasHandle,
  PatchMapEngineExtractionRequest,
  PatchMapEngineExtractionResult,
} from './contracts/extraction';
import type {
  PatchMapEngineDestroyTargetResult,
  PatchMapEngineInstanceBarHeightResult,
  PatchMapEnginePatchResult,
  PatchMapEngineSemanticRefreshResult,
  PatchMapEngineTransactionPerformanceProbe,
  PatchMapEngineTransactionResult,
  PatchMapInstanceBarHeightRequest,
  PatchMapLiveOverlayInput,
  PatchMapLiveOverlayProbe,
  PatchMapLiveOverlayPublishedTuple,
  PatchMapLiveOverlayResult,
  PatchMapLiveOverlayTuple,
  PatchMapSemanticRefreshInput,
} from './contracts/mutation';
import type {
  PatchMapEngineHistoryCapacityResult,
  PatchMapEngineHistoryClearResult,
  PatchMapEngineHistoryCompanionState,
  PatchMapEngineHistoryRestoredEvent,
  PatchMapEngineHistoryResult,
  PatchMapEngineHistoryVisibleEvent,
  PatchMapEngineTransformerCancelResult,
  PatchMapEngineTransformerCompletionResult,
  PatchMapEngineTransformerEdgePanResult,
  PatchMapEngineTransformerEditOptions,
  PatchMapEngineTransformerEditResult,
  PatchMapEngineTransformerPreviewResult,
  PatchMapEngineTransformerSessionBeginInput,
  PatchMapEngineTransformerSessionProbe,
  PatchMapHistoryShortcutInput,
  PatchMapHistoryShortcutResult,
} from './contracts/history-transformer';
import type {
  PatchMapSerializedViewportState,
  PatchMapViewportChangeResult,
  PatchMapViewportChangeSource,
  PatchMapViewportFitOptions,
  PatchMapViewportFitResult,
  PatchMapViewportFocusResult,
  PatchMapViewportPersistenceProbe,
  PatchMapViewportPolicyOperation,
  PatchMapViewportPolicyProbe,
  PatchMapViewportRestoreResult,
  PatchMapViewportSettleResult,
  PatchMapViewportState,
  PatchMapViewportTargetOptions,
  PatchMapViewportTransformProbe,
  PatchMapWorldTransformInput,
  PatchMapWorldTransformState,
} from './contracts/viewport';
export type * from './contracts/editor';
export type * from './contracts/extraction';
export type * from './contracts/history-transformer';
export type * from './contracts/lifecycle';
export type * from './contracts/mutation';
export type * from './contracts/product';
export type * from './contracts/query-selection';
export type * from './contracts/rendering';
export type * from './contracts/viewport';
import {
  PatchMapSemanticHistory,
  type PatchMapHistoryInspection,
  type PatchMapHistoryState,
} from '../history';
import {
  PATCH_MAP_QUERY_SELECTION_REVISION,
  patchMapLogicalTargetKey,
  type PatchMapLogicalSceneIndex,
  type PatchMapLogicalTargetSnapshot,
  type PatchMapQueryReuseOperation,
  type PatchMapSceneQuery,
  type PatchMapSelectionChange,
  type PatchMapSelectionEligibilityOptions,
  type PatchMapSelectionHitOptions,
  type PatchMapSelectionInteraction,
  type PatchMapSelectionInteractionOptions,
  type PatchMapSelectionSetOperation,
} from '../query-selection';
import {
  type PatchMapGestureCancelReason,
  type PatchMapGestureTerminationReason,
  type PatchMapOwnedGestureKind,
  type PatchMapOwnedGestureTermination,
  type PatchMapPointerDispatchResult,
  type PatchMapPointerGestureProbe,
  type PatchMapSemanticPointerEvent,
} from '../pointer-gesture';
import {
  PatchMapHostInteractionAuthority,
  advancePatchMapCommandTargetState,
  patchMapOwnsKeyboardInput,
  patchMapTransformerHandlePropagationProbe,
  createPatchMapCommandTargetState,
  createPatchMapLogicalPropagationTrace,
  type PatchMapCommandTargetState,
  type PatchMapCommandTargetStatus,
  type PatchMapHostEventSubscription,
  type PatchMapHostInteractionProbe,
  type PatchMapHostObservedEvent,
  type PatchMapHostTooltipPublication,
  type PatchMapHostTooltipState,
  type PatchMapHostTooltipSubscription,
  type PatchMapInteractionModeOperation,
  type PatchMapInteractionModeProbe,
  type PatchMapInteractionModeResult,
  type PatchMapLogicalEventBindingDescriptor,
  type PatchMapLogicalEventDelivery,
  type PatchMapLogicalEventBindingHandle,
  type PatchMapLogicalPropagationOptions,
  type PatchMapLogicalPropagationTrace,
  type PatchMapSelectionHostPublication,
  type PatchMapTooltipClearReason,
} from '../host-interaction';
import {
  createPatchMapTransformerHandleProbe,
  hitPatchMapTransformerHandle,
  type PatchMapTransformerGestureAuthority,
  type PatchMapSelectionVisualOptions,
  type PatchMapSelectionVisualProbe,
  type PatchMapTransformableSubsetProbe,
  type PatchMapTransformerGestureProbe,
  type PatchMapTransformerHandle,
  type PatchMapTransformerHandleProbe,
  type PatchMapTransformerInputFamily,
} from '../selection-transformer';
import {
  PATCH_MAP_TRANSFORMER_EDIT_REVISION,
  planPatchMapTransformerEdit,
  resolvePatchMapEdgeAutoPan,
  resolvePatchMapRotationSnap,
  type PatchMapRotationSnapResult,
  type PatchMapTransformerEditRequest,
} from '../selection-transformer/edit';
import {
  PATCH_MAP_AUTHORING_REVISION,
  planPatchMapAuthoringAction,
} from '../authoring';
import {
  PatchMapExtractionSecurityAuthority,
  PatchMapOperationsAuthority,
  type PatchMapOperationalCallback,
  type PatchMapOperationalDiagnosticInput,
  type PatchMapOperationalDispatchResult,
  type PatchMapOperationalEventInput,
  type PatchMapOperationalSubscription,
  type PatchMapOperationsProbe,
  type PatchMapRuntimeDiagnosticsSnapshot,
  type PatchMapSanitizedDiagnostic,
} from '../operations';

type PatchMapEngineEventMap = {
  readonly ready: PatchMapInitializeResult;
  readonly sceneCommitted: PatchMapEngineLoadResult;
  readonly drawComplete: Readonly<{
    requestId: string;
    sourceRevision?: number;
    sceneRevision: number;
    semanticHash: string;
    datasetRef: string | null;
  }>;
  readonly frame: Readonly<{
    frameRevision: number;
    publishedTuple: PatchMapPublishedTuple;
  }>;
  readonly viewChanged: PatchMapViewportChangeResult;
  readonly viewSettled: PatchMapViewportSettleResult;
  readonly viewportPolicyChanged: PatchMapViewportPolicyProbe;
  readonly documentVisibilityChanged: PatchMapEngineDocumentVisibilityResult;
  readonly presentationChanged: PatchMapEnginePresentationResult;
  readonly instanceBarHeightsChanged: Extract<
    PatchMapEngineInstanceBarHeightResult,
    { readonly status: 'committed' }
  >;
  readonly overlayAccepted: PatchMapLiveOverlayTuple;
  readonly overlayPublished: PatchMapLiveOverlayPublishedTuple;
  readonly semanticRefreshed: Extract<
    PatchMapEngineSemanticRefreshResult,
    { readonly status: 'committed' }
  >;
  readonly pointerEvent: PatchMapSemanticPointerEvent;
  readonly pointerHover: PatchMapPointerHoverEvent;
  readonly pointerTooltip: PatchMapPointerTooltipEvent;
  readonly pointerSelectionChanged: PatchMapPointerSelectionChange;
  readonly selectionChanged: PatchMapSelectionChange;
  readonly change:
    | Extract<PatchMapEnginePatchResult, { readonly status: 'committed' }>
    | Extract<PatchMapEngineTransactionResult, { readonly status: 'committed' }>;
  readonly targetDestroyed: Extract<
    PatchMapEngineDestroyTargetResult,
    { readonly status: 'committed' }
  >;
  readonly historyUndone: Extract<PatchMapEngineHistoryResult, { readonly status: 'committed' }>;
  readonly historyRedone: Extract<PatchMapEngineHistoryResult, { readonly status: 'committed' }>;
  readonly semanticRestored: PatchMapEngineHistoryRestoredEvent;
  readonly selectionReconciled: PatchMapEngineHistoryRestoredEvent;
  readonly historyVisible: PatchMapEngineHistoryVisibleEvent;
  readonly historyCleared: PatchMapEngineHistoryClearResult;
  readonly diagnostic: PatchMapEngineDiagnostic;
  readonly destroyed: Readonly<{ lifecycleGeneration: number }>;
};

type PatchMapEngineEvent = keyof PatchMapEngineEventMap;
type PatchMapEngineListener<K extends PatchMapEngineEvent> = (event: PatchMapEngineEventMap[K]) => void;

const DEFAULT_ZOOM_LIMITS = Object.freeze([0.5, 30] as const);
const EMPTY_MATERIALIZED_DATASET = materializePatchMapDataset([]);
const PATCH_MAP_QUERY_REUSE_OPERATIONS = Object.freeze([
  'update',
  'event-bind',
  'focus',
  'presentation',
  'transform',
  'select',
] as const satisfies readonly PatchMapQueryReuseOperation[]);
const unavailableSurfaceFactory: PatchMapEngineSurfaceFactory = () => Promise.reject(
  new Error('PatchMap Engine requires an injected surface factory'),
);
export class PatchMap {
  private readonly assetSessions: PatchMapAssetSessionAuthority;
  private readonly operations: PatchMapOperationsAuthority;
  private readonly extractionSecurity: PatchMapExtractionSecurityAuthority;
  private readonly historyAuthority: PatchMapSemanticHistory<
    readonly NormalizedPatchMapElement[],
    PatchMapEngineHistoryCompanion
  >;
  private readonly hostInteractions: PatchMapHostInteractionAuthority;
  private readonly hostAssetIngestion = new PatchMapHostAssetIngestionAuthority();
  private readonly editorWorkflows = new PatchMapEditorWorkflowAuthority();
  private readonly pageLifecycle: PatchMapPageLifecycleCoordinator;
  private readonly managedFrameLoop = new PatchMapManagedFrameLoopAuthority();
  private readonly captureExtraction: PatchMapCaptureExtractionAuthority;
  private readonly pointerInteractions: PatchMapPointerInteractionCoordinator;
  private readonly selectionRuntime: PatchMapSelectionRuntimeCoordinator;
  private readonly accessibility = new PatchMapAccessibilityAuthority();
  private readonly transactionCommit: PatchMapTransactionCommitCoordinator;
  private readonly transformerSessions: PatchMapTransformerSessionCoordinator;
  private readonly datasetReplacement: PatchMapDatasetReplacementCoordinator;
  private readonly historyApplication: PatchMapHistoryApplicationCoordinator;
  private readonly directMutation: PatchMapDirectMutationCoordinator;
  private readonly viewportRuntime: PatchMapViewportRuntimeCoordinator;
  private readonly publication = new PatchMapPublicationAuthority();
  private readonly surfaceMutationGuard: PatchMapSurfaceMutationGuard;
  private readonly sceneState = new PatchMapSceneStateAuthority(
    EMPTY_MATERIALIZED_DATASET,
  );
  private readonly surfaceLifecycle: PatchMapSurfaceLifecycleAuthority<
    PatchMapInitializeResult
  >;
  private readonly productProbeReadPort: PatchMapEngineProductProbeReadPort;
  private readonly events = new PatchMapEventHub<PatchMapEngineEventMap>();
  private lifecycle: PatchMapLifecycle = 'new';
  private initializationBootstrapInProgress = false;
  private initializationMustCleanLateSurface = false;
  private terminalRendererLossProbe: PatchMapRendererLossProbe | null = null;
  private instanceId: string | null = null;
  private readonly commandTargetAuthorities = new WeakMap<
    PatchMapCommandTargetState,
    Readonly<{
      readonly lifecycleGeneration: number;
      readonly targetIds: readonly string[];
    }>
  >();
  private rendererConfiguration: Readonly<{
    resolution: number;
    antialias: boolean;
    background: string;
    backend: 'webgl' | 'webgpu';
  }> | null = null;
  private pendingWork = 0;
  private destroySettlement: Promise<boolean> | null = null;
  private readonly externalDependencyRevisions = new Map<string, string>();
  private readonly cancelActiveTransformerBeforeSurfaceReconcile = (): void => {
    this.transformerSessions.cancelActive('redraw', true);
  };

  private get materialized(): MaterializedPatchMapDataset | null {
    return this.sceneState.materialized;
  }

  private get componentSemantics(): ReadonlyMap<
    string,
    PatchMapEngineComponentSemanticProbe
  > {
    return this.sceneState.componentSemantics;
  }

  private get textSemantics(): ReadonlyMap<string, IndexedEngineTextSemantic> {
    return this.sceneState.textSemantics;
  }

  private get logicalSelectionIds(): readonly string[] {
    return this.sceneState.selectionIds;
  }

  private get datasetRef(): string | null {
    return this.sceneState.datasetRef;
  }

  private get targetLifecycleGeneration(): number {
    return this.sceneState.targetLifecycleGeneration;
  }

  private get surface(): PatchMapEngineSurface | null {
    return this.surfaceLifecycle.liveSurface;
  }

  private get retainedCleanupSurface(): PatchMapEngineSurface | null {
    return this.surfaceLifecycle.cleanupSurface;
  }

  private get authoritativeCanvas(): HTMLCanvasElement | null {
    return this.surfaceLifecycle.authoritativeCanvas;
  }

  private get initializePromise(): Promise<PatchMapInitializeResult> | null {
    return this.surfaceLifecycle.initialization;
  }

  private get terminalSurfaceFailure(): Error | null {
    return this.surfaceLifecycle.terminalFailure;
  }

  public constructor(options: PatchMapEngineOptions = {}) {
    this.surfaceLifecycle = new PatchMapSurfaceLifecycleAuthority(
      options.surfaceFactory ?? unavailableSurfaceFactory,
    );
    this.surfaceMutationGuard = new PatchMapSurfaceMutationGuard(
      this.publication,
      {
        lifecycle: () => this.lifecycle,
        liveSurface: () => this.surface,
      },
    );
    this.assetSessions = new PatchMapAssetSessionAuthority(
      options.assetRuntime,
      options.assetPolicy,
    );
    this.operations = options.operations ?? new PatchMapOperationsAuthority();
    this.viewportRuntime = new PatchMapViewportRuntimeCoordinator(
      new PatchMapViewportAuthority(),
      {
        requireSurface: (operation) => this.requireSurface(operation),
        liveSurface: () => this.surface,
        isSurfaceInputCurrent: (surface) =>
          this.surface === surface &&
          this.terminalSurfaceFailure === null &&
          !this.isDestroyingOrDestroyed(),
        materialized: () => this.materialized,
        revisionStamp: () => this.revisionStamp(),
        viewRevision: () => this.publication.viewRevision,
        advanceView: () => {
          this.publication.advanceView();
        },
        refreshAccessibilitySurface: (operation) => {
          this.refreshAccessibilitySurfaceIfActive(operation);
        },
        emitViewChanged: (result) => {
          this.emit('viewChanged', result);
        },
        emitViewSettled: (result) => {
          this.emit('viewSettled', result);
        },
        emitViewportPolicyChanged: (probe) => {
          this.emit('viewportPolicyChanged', probe);
        },
        isDestroyingOrDestroyed: () => this.isDestroyingOrDestroyed(),
        unsupportedRuntimeError: (operation) => this.operationError(
          'UNSUPPORTED_RUNTIME',
          'UNSUPPORTED_RUNTIME',
          operation,
          false,
        ),
      },
    );
    this.extractionSecurity = options.extractionSecurity
      ?? new PatchMapExtractionSecurityAuthority();
    this.captureExtraction = new PatchMapCaptureExtractionAuthority(
      this.extractionSecurity,
      this.managedFrameLoop,
      this.publication,
      {
        requireSurface: (operation) => this.requireSurface(operation),
        liveSurface: () => this.surface,
        authoritativeCanvas: () => this.authoritativeCanvas,
        isDestroyingOrDestroyed: () => this.isDestroyingOrDestroyed(),
        resize: (width, height, pixelRatio) => {
          this.resize(width, height, pixelRatio);
        },
        adjustPendingWork: (delta) => {
          this.pendingWork += delta;
        },
        operationError: (code, category, operation, recoverable) =>
          this.operationError(code, category, operation, recoverable),
        operationDiagnostic: (code, category, operation, recoverable) =>
          this.operationDiagnostic(code, category, operation, recoverable),
        emitDiagnostic: (diagnostic) => {
          this.emit('diagnostic', diagnostic);
        },
      },
    );
    this.historyAuthority = new PatchMapSemanticHistory({
      ...(options.historyLimit === undefined ? {} : { capacity: options.historyLimit }),
    });
    this.hostInteractions = new PatchMapHostInteractionAuthority({
      queryTargets: (query) => {
        const evaluated = this.logicalSceneIndex().query(query);
        return evaluated.status === 'rejected' ? Object.freeze([]) : evaluated.targets;
      },
    });
    this.selectionRuntime = new PatchMapSelectionRuntimeCoordinator(
      this.sceneState,
      this.publication,
      this.hostInteractions,
      {
        requireSurface: (operation) => this.requireSurface(operation),
        viewportScale: () => this.viewportRuntime.snapshot().scale,
        cancelActiveTransformer: (reason, restorePreview) =>
          this.transformerSessions.cancelActive(reason, restorePreview) !== null,
        interruptTransformerGestures: () => {
          this.transformerSessions.interruptGestures();
        },
        syncPointerOverlay: () => {
          this.pointerInteractions.syncSelectionVisualPolicy();
        },
        interruptPointerSelection: (reason) => {
          this.pointerInteractions.interruptAndResetIfPresent(reason);
        },
        pointerSelectionPublication: (change) =>
          this.pointerInteractions.selectionPublication(change),
        emitSelectionChanged: (change) => {
          this.emit('selectionChanged', change);
        },
        emitPointerSelectionChanged: (publication) => {
          this.emit('pointerSelectionChanged', publication);
        },
        notReadyError: (operation) =>
          this.operationError('NOT_READY', 'NOT_READY', operation, true),
      },
    );
    this.transactionCommit = new PatchMapTransactionCommitCoordinator(
      this.sceneState,
      this.historyAuthority,
      this.hostInteractions,
      this.publication,
      this.surfaceMutationGuard,
      {
        reducedMotion: () => this.accessibility.reducedMotion,
        terminalSurfaceFailure: () => this.terminalSurfaceFailure,
        historySnapshot: () => this.historyApplication.snapshot(),
        planHistoryCompanion: (
          value,
          fallbackSelectionIds,
          materialized,
          fallbackMode,
          stableIdentity,
          structuralIdentity,
        ) => this.historyApplication.planCompanion(
          value,
          fallbackSelectionIds,
          materialized,
          fallbackMode,
          stableIdentity,
          structuralIdentity,
        ),
        commitSceneMetadata: (hostCompanion) => {
          this.viewportRuntime.invalidateContributors();
          this.historyApplication.replaceHostCompanion(hostCompanion);
          this.pointerInteractions.syncSelectionVisualPolicy();
        },
        commitLifecycle: (lifecycle) => {
          this.lifecycle = lifecycle;
        },
        restoreAuthoritativeSurfaceScene: (surface, operation) => {
          this.restoreAuthoritativeSurfaceScene(surface, operation);
        },
        revisionStamp: () => this.revisionStamp(),
        diagnosticFrom: (error, operation) => this.diagnosticFrom(error, operation),
        operationDiagnostic: (code, category, operation, recoverable, datasetPath) =>
          this.operationDiagnostic(code, category, operation, recoverable, datasetPath),
        emitDiagnostic: (diagnostic) => {
          this.emit('diagnostic', diagnostic);
        },
        emitChange: (result) => {
          this.emit('change', result);
        },
        now: enginePerformanceNow,
      },
    );
    this.transformerSessions = new PatchMapTransformerSessionCoordinator({
      requireSurface: (operation) => this.requireSurface(operation),
      requirePointerGestures: (operation) => this.pointerInteractions.requireAuthority(operation),
      materialized: () => this.materialized,
      selectionIds: () => this.logicalSelectionIds,
      historyState: () => this.historyAuthority.state(),
      clearTooltipForDrag: () => {
        this.hostInteractions.clearTooltip('drag');
      },
      applySelectionForTransformerStart: (operation) => {
        this.selectionRuntime.apply(operation, true);
      },
      replaceSelectionForRollback: (selectionIds) => {
        this.sceneState.replaceSelection(selectionIds);
        this.pointerInteractions.syncSelectionVisualPolicy();
      },
      revisionStamp: () => this.revisionStamp(),
      applyPlannedTransaction: ({
        surface,
        plan,
        previousRevisions,
        previousHistory,
        beforeChangeEvent,
      }) =>
        this.transactionCommit.commit(
          surface,
          plan,
          'transact',
          previousRevisions,
          previousHistory,
          0,
          undefined,
          beforeChangeEvent,
        ),
      advanceInteraction: () => {
        this.publication.advanceInteraction();
      },
      operationFailure: (code, operation, recoverable) =>
        this.operationError(code, code, operation, recoverable),
      sameSelection: sameStringArray,
    });
    this.pointerInteractions = new PatchMapPointerInteractionCoordinator({
      requireSurface: (operation) => this.requireSurface(operation),
      liveSurface: () => this.surface,
      hasMaterialized: () => this.materialized !== null,
      logicalSelectionIndex: () => this.logicalSceneSelectionIndex(),
      selectionIds: () => this.logicalSelectionIds,
      transformerOwnsPointer: (pointerId) => this.transformerSessions.ownsPointer(pointerId),
      routeTransformerInput: (pointerId) => {
        this.transformerSessions.routeInput(pointerId, 'transform');
      },
      completeTransformerEdit: (pointerId) => {
        this.completeTransformerEdit(pointerId);
      },
      cancelTransformerEdit: (pointerId) => {
        this.cancelTransformerEdit(pointerId, 'pointer-cancel');
      },
      selectBox: (start, end, options) => this.selectBox(start, end, options),
      applySelection: (input) => this.applySelection(input),
      viewRevision: () => this.publication.viewRevision,
      interactionRevision: () => this.publication.interactionRevision,
      advanceInteraction: () => {
        this.publication.advanceInteraction();
      },
      interactionMode: () => this.hostInteractions.modeProbe().activeState,
      dispatchHostPointerEvent: (event) => {
        this.hostInteractions.dispatchPointerEvent(event);
      },
      clearHostTooltip: (reason) => {
        this.hostInteractions.clearTooltip(reason);
      },
      emitPointerEvent: (event) => {
        this.emit('pointerEvent', event);
      },
      emitPointerHover: (event) => {
        this.emit('pointerHover', event);
      },
      emitPointerTooltip: (event) => {
        this.emit('pointerTooltip', event);
      },
      emitHostCallbackFailure: (operation) => {
        this.emit('diagnostic', this.operationDiagnostic(
          'HOST_CALLBACK_FAILURE',
          'HOST_CALLBACK_FAILURE',
          operation,
          true,
        ));
      },
      notReadyError: (operation) =>
        this.operationError('NOT_READY', 'NOT_READY', operation, true),
    });
    this.historyApplication = new PatchMapHistoryApplicationCoordinator(
      this.historyAuthority,
      this.sceneState,
      this.publication,
      this.hostInteractions,
      this.transformerSessions,
      EMPTY_MATERIALIZED_DATASET,
      {
        requireSurface: (operation) => this.requireSurface(operation),
        terminalSurfaceFailure: () => this.terminalSurfaceFailure,
        setLifecycle: (lifecycle) => {
          this.lifecycle = lifecycle;
        },
        isSurfaceMutationCurrent: (surface, revisions) =>
          this.surfaceMutationGuard.mutationCurrent(surface, revisions),
        restoreAuthoritativeSurfaceScene: (surface, operation) => {
          this.restoreAuthoritativeSurfaceScene(surface, operation);
        },
        syncSelectionVisualPolicy: () => {
          this.pointerInteractions.syncSelectionVisualPolicy();
        },
        invalidateViewportContributors: () => {
          this.viewportRuntime.invalidateContributors();
        },
        diagnosticFrom: (error, operation) => this.diagnosticFrom(error, operation),
        operationDiagnostic: (code, category, operation, recoverable, datasetPath) =>
          this.operationDiagnostic(code, category, operation, recoverable, datasetPath),
        revisionStamp: () => this.revisionStamp(),
        emitDiagnostic: (diagnostic) => {
          this.emit('diagnostic', diagnostic);
        },
        emitSemanticRestored: (event) => {
          this.emit('semanticRestored', event);
        },
        emitSelectionReconciled: (event) => {
          this.emit('selectionReconciled', event);
        },
        emitHistoryResult: (direction, result) => {
          this.emit(direction === 'undo' ? 'historyUndone' : 'historyRedone', result);
        },
        emitHistoryCleared: (result) => {
          this.emit('historyCleared', result);
        },
      },
    );
    this.directMutation = new PatchMapDirectMutationCoordinator(
      this.sceneState,
      this.historyAuthority,
      this.publication,
      EMPTY_MATERIALIZED_DATASET,
      {
        requireSurface: (operation) => this.requireSurface(operation),
        reducedMotion: () => this.accessibility.reducedMotion,
        terminalSurfaceFailure: () => this.terminalSurfaceFailure,
        historySnapshot: () => this.historyApplication.snapshot(),
        historyCompanionForSelection: (selectionIds) =>
          this.historyApplication.companionForSelection(selectionIds),
        cancelActiveTransformer: () => {
          this.transformerSessions.cancelActive('redraw', true);
        },
        isSurfaceSceneCurrent: (surface, revisions) =>
          this.surfaceMutationGuard.sceneCurrent(surface, revisions),
        isSurfaceMutationCurrent: (surface, revisions) =>
          this.surfaceMutationGuard.mutationCurrent(surface, revisions),
        restoreAuthoritativeSurfaceScene: (surface, operation) => {
          this.restoreAuthoritativeSurfaceScene(surface, operation);
        },
        invalidateViewportContributors: () => {
          this.viewportRuntime.invalidateContributors();
        },
        commitLifecycle: (lifecycle) => {
          this.lifecycle = lifecycle;
        },
        emitDiagnostic: (diagnostic) => {
          this.emit('diagnostic', diagnostic);
        },
        emitChange: (result) => {
          this.emit('change', result);
        },
        emitTargetDestroyed: (result) => {
          this.emit('targetDestroyed', result);
        },
      },
    );
    this.datasetReplacement = new PatchMapDatasetReplacementCoordinator(
      this.sceneState,
      this.publication,
      this.hostInteractions,
      this.accessibility,
      this.editorWorkflows,
      this.transformerSessions,
      {
        lifecycle: () => this.lifecycle,
        setLifecycle: (lifecycle) => {
          this.lifecycle = lifecycle;
        },
        liveSurface: () => this.surface,
        requireSurface: (operation) => this.requireSurface(operation),
        adjustPendingWork: (delta) => {
          this.pendingWork += delta;
        },
        resetHistoryHostCompanion: () => {
          this.historyApplication.resetHostCompanion();
        },
        interruptPointerReplacement: () => {
          this.pointerInteractions.interruptIfPresent('replace');
        },
        resetPointerProjectionState: () => {
          this.pointerInteractions.resetProjectionState();
        },
        syncSelectionVisualPolicy: () => {
          this.pointerInteractions.syncSelectionVisualPolicy();
        },
        invalidateViewportContributors: () => {
          this.viewportRuntime.invalidateContributors();
        },
        clearHistoryForReplacement: () => {
          this.historyApplication.clear('replace');
        },
        resetLiveOverlay: () => {
          this.resetLiveOverlayState();
        },
        restoreAuthoritativeSurfaceScene: (surface, operation) => {
          this.restoreAuthoritativeSurfaceScene(surface, operation);
        },
        operationError: (code, operation, recoverable) =>
          this.operationError(code, code, operation, recoverable),
        operationDiagnostic: (code, operation, recoverable) =>
          this.operationDiagnostic(code, code, operation, recoverable),
        diagnosticFrom: (error, operation) => this.diagnosticFrom(error, operation),
        emitDiagnostic: (diagnostic) => {
          this.emit('diagnostic', diagnostic);
        },
        emitSceneCommitted: (result) => {
          this.emit('sceneCommitted', result);
        },
        emitDrawComplete: (event) => {
          this.emit('drawComplete', event);
        },
      },
    );
    this.productProbeReadPort = Object.freeze({
      lifecycle: () => this.lifecycle,
      instanceId: () => this.instanceId,
      viewportSnapshot: () => this.viewportRuntime.snapshot(),
      surfaceDebug: () => this.surface?.debugSnapshot() ?? null,
      revisionStamp: () => this.revisionStamp(),
      publishedTuple: () => this.publication.publishedTuple,
      frameRevision: () => this.publication.frameRevision,
      sceneRevision: () => this.publication.sceneRevision,
      viewRevision: () => this.publication.viewRevision,
      interactionRevision: () => this.publication.interactionRevision,
      materialized: () => this.materialized,
      datasetRef: () => this.datasetRef,
      selectionIds: () => this.logicalSelectionIds,
      presentationSnapshot: () => this.surface?.presentationLayersSnapshot?.() ?? Object.freeze({
        revision: 0,
        layerCount: 0,
      }),
      componentSemantic: (ownerId, componentId) => this.componentSemantics.get(
        componentSemanticKey(ownerId, componentId),
      ) ?? null,
      textSemantic: (target) => this.textSemantics.get(engineTextTargetKey(target)) ?? null,
      historyState: () => this.historyAuthority.state(),
      interactionMode: () => this.hostInteractions.modeProbe().activeState,
      staleGestureCount: () => this.pointerInteractions.staleGestureCount,
      pendingWork: () => this.pendingWork,
      rendererConfiguration: () => this.rendererConfiguration,
      assetProbe: () => this.assetSessions.sessionProbe(),
      canvasCount: () => this.surfaceLifecycle.canvasCount,
      subscriptionCount: () => this.subscriptionCount(),
      sceneImageProbe: () => this.requireSurface('sceneImageProbe').sceneImageProbe?.() ?? null,
      componentVisualProbe: (target) => this.requireSurface('componentVisualProbe')
        .componentVisualProbe?.(target) ?? null,
      barPresentationProbe: (target) => this.requireSurface('barPresentationProbe')
        .barPresentationProbe?.(target) ?? null,
      paintOrderProbe: () => this.requireSurface('paintOrderProbe').paintOrderProbe?.() ?? null,
      textProbe: (target) => this.requireSurface('textProbe').textProbe?.(target) ?? null,
      interactionOwnershipProbe: () => this.requireSurface('interactionOwnershipProbe')
        .interactionOwnershipProbe?.() ?? null,
      pixiPublicSurfaceRead: () => {
        const surface = this.requireSurface('rendererPublicSurfaceProbe');
        return Object.freeze({
          probe: surface.rendererPublicSurfaceProbe?.() ?? null,
          canvasCount: surface.canvasCount,
        });
      },
      rendererLossSurfaceRead: () => {
        const surface = this.requireSurface('rendererLossProbe');
        return Object.freeze({
          probe: surface.rendererLossProbe?.() ?? null,
          canvasCount: surface.canvasCount,
        });
      },
      terminalRendererLossProbe: () => this.terminalRendererLossProbe,
      logicalComponentTarget: (ownerId, componentId) => this.logicalSceneIndex().target({
        kind: 'component',
        ownerId,
        id: componentId,
      }),
    } satisfies PatchMapEngineProductProbeReadPort);
    this.pageLifecycle = new PatchMapPageLifecycleCoordinator(
      new PatchMapPageLifecycleAuthority(),
      this.managedFrameLoop,
      this.publication,
      {
        requireSurface: (operation) => this.requireSurface(operation),
        activeAnimationCount: () => this.activeAnimations,
        motionActive: () => this.viewportRuntime.motionActive,
        pointerProbe: () => this.pointerInteractions.probe(),
        cancelMotion: () => {
          this.viewportRuntime.cancelMotion();
        },
        cancelTransformerForBlur: () => {
          if (this.transformerSessions.cancelActive('blur', true) === null) {
            this.transformerSessions.interruptGestures();
          }
        },
        interruptPointerForBlur: () => {
          this.pointerInteractions.interruptAndResetIfPresent('blur');
        },
        clearTooltipForRedraw: () => {
          this.hostInteractions.clearTooltip('redraw');
        },
        emitDocumentVisibilityChanged: (result) => {
          this.emit('documentVisibilityChanged', result);
        },
      },
    );
  }

  /** @internal Browser composition owns host-size observation policy. */
  public observeMountSize(
    target: HTMLElement,
    pixelRatio: number | undefined,
  ): void {
    this.captureExtraction.observeMountSize(target, pixelRatio);
  }

  /** @internal Root `PatchMap.mount()` owns this policy boundary. */
  public configurePointerPolicy(policy: PatchMapPointerPolicy | undefined): void {
    this.pointerInteractions.configurePointerPolicy(policy);
  }

  /** @internal Root `PatchMap.mount()` owns this policy boundary. */
  public configurePointerSelectionPolicy(policy: PatchMapSelectionPolicy | undefined): void {
    this.pointerInteractions.configureSelectionPolicy(policy);
  }

  public on<K extends PatchMapEngineEvent>(event: K, listener: PatchMapEngineListener<K>): () => void {
    return this.events.on(event, listener);
  }

  public onPointerHover(listener: (event: PatchMapPointerHoverEvent) => void): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('pointer hover listener must be a function');
    }
    this.requireSurface('onPointerHover');
    return this.on('pointerHover', listener);
  }

  public onPointerTooltip(listener: (event: PatchMapPointerTooltipEvent) => void): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('pointer tooltip listener must be a function');
    }
    this.requireSurface('onPointerTooltip');
    return this.on('pointerTooltip', listener);
  }

  public onPointerSelectionChange(
    listener: (change: PatchMapPointerSelectionChange) => void,
  ): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('pointer selection listener must be a function');
    }
    this.requireSurface('onPointerSelectionChange');
    return this.on('pointerSelectionChanged', listener);
  }

  public onViewportChange(
    listener: (change: PatchMapViewportChangeResult) => void,
  ): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('viewport change listener must be a function');
    }
    this.requireSurface('onViewportChange');
    return this.on('viewChanged', listener);
  }

  public onDestroyed(listener: () => void): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('destroyed listener must be a function');
    }
    return this.on('destroyed', () => listener());
  }

  /** @internal Public facade observes stack changes without exposing Engine events. */
  public onHistoryChange(listener: (state: PatchMapHistoryState) => void): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('history change listener must be a function');
    }
    this.requireSurface('onHistoryChange');
    const releases = [
      this.on('change', (result) => {
        if ('history' in result) listener(result.history.state);
      }),
      this.on('historyUndone', (result) => listener(result.history)),
      this.on('historyRedone', (result) => listener(result.history)),
      this.on('historyCleared', (result) => listener(result.history)),
    ];
    return () => {
      for (const release of releases) release();
    };
  }

  public subscribeOperationalEvent(
    id: string,
    callback: PatchMapOperationalCallback,
  ): PatchMapOperationalSubscription {
    return this.operations.subscribeTelemetry(id, callback);
  }

  public subscribeOperationalDiagnostics(
    id: string,
    callback: (diagnostic: PatchMapSanitizedDiagnostic) => void,
  ): PatchMapOperationalSubscription {
    return this.operations.subscribeDiagnostics(id, callback);
  }

  public emitOperationalEvent(
    input: PatchMapOperationalEventInput,
  ): PatchMapOperationalDispatchResult {
    return this.operations.emitTelemetry(input);
  }

  public reportOperationalFailure(
    input: Omit<
      PatchMapOperationalDiagnosticInput,
      'category' | 'lifecycleGeneration' | 'revisionStamp' | 'sceneRevision'
    > & Readonly<{ readonly category: PatchMapDiagnosticCategory }>,
  ): PatchMapSanitizedDiagnostic & PatchMapEngineDiagnostic {
    const diagnostic = this.operations.reportDiagnostic({
      ...input,
      lifecycleGeneration: this.publication.lifecycleGeneration,
      sceneRevision: this.publication.sceneRevision,
      revisionStamp: this.revisionStamp(),
    }) as PatchMapSanitizedDiagnostic & PatchMapEngineDiagnostic;
    this.deliverEngineEvent('diagnostic', diagnostic);
    return diagnostic;
  }

  public setRuntimeDiagnosticsEnabled(enabled: boolean): boolean {
    return this.operations.setCollectionEnabled(enabled);
  }

  public setOperationalTelemetryEnabled(enabled: boolean): boolean {
    return this.operations.setTelemetryEnabled(enabled);
  }

  public operationsProbe(): PatchMapOperationsProbe {
    return this.operations.probe();
  }

  public extractionSecurityProbe(): ReturnType<PatchMapExtractionSecurityAuthority['preflight']> {
    return this.extractionSecurity.preflight();
  }

  public setExtractionAssetReadability(
    logicalAssetId: string,
    readability: Parameters<PatchMapExtractionSecurityAuthority['setAssetReadability']>[1],
  ): void {
    this.extractionSecurity.setAssetReadability(logicalAssetId, readability);
  }

  public deleteExtractionAssetReadability(logicalAssetId: string): boolean {
    return this.extractionSecurity.deleteAsset(logicalAssetId);
  }

  public clearExtractionAssetReadability(): void {
    this.extractionSecurity.clear();
  }

  public registerAssets(
    instanceId: string,
    registrations: readonly PatchMapAssetRegistration[] = PATCH_MAP_BUILTIN_ASSETS,
  ): PatchMapAssetRegistrationResult {
    this.assertAssetLifecycle('registerAssets');
    return this.ensureAssetSession(instanceId).registerAssets(registrations);
  }

  public acquireAsset(alias: string): Promise<PatchMapAssetAcquisition> {
    this.assertAssetLifecycle('acquireAsset');
    const acquisition = this.assetSessions.acquire(alias);
    if (acquisition === null) {
      return Promise.reject(this.operationError('NOT_READY', 'NOT_READY', 'acquireAsset', true));
    }
    return acquisition;
  }

  public assetProbe(alias?: string): Readonly<{
    session: PatchMapAssetSessionProbe | null;
    runtime: PatchMapAssetRuntimeProbe;
  }> {
    return this.assetSessions.probe(alias);
  }

  /** O(1) frame-loop seam shared by browser hosts and performance probes. */
  public get activeAnimations(): number {
    if (this.terminalSurfaceFailure !== null) return 0;
    const surface = this.surface;
    if (surface === null) return 0;
    return surface.frameLoopActiveAnimations?.()
      ?? surface.debugSnapshot().activeAnimationCount;
  }

  /** Lightweight live selection state that does not materialize a semantic digest. */
  public get selectionIds(): readonly string[] {
    return this.logicalSelectionIds;
  }

  /** Lightweight published-frame counter for animation HUDs and host diagnostics. */
  public get publishedFrameRevision(): number {
    return this.publication.frameRevision;
  }

  /** O(1) source workload shared with the package frame-loop policy. */
  public get frameWorkloadSize(): number {
    return this.surface?.frameLoopWorkloadSize?.()
      ?? this.materialized?.rootIds.length
      ?? 0;
  }

  /** Current monotonic product presentation clock for late frame-loop ownership. */
  public get frameTimeMs(): number {
    return this.publication.frameClockMs;
  }

  /** Product-owned pointer/motion state; hosts must not mirror it. */
  public get viewportGestureActive(): boolean {
    if (this.viewportRuntime.motionActive) return true;
    if (this.surface?.viewportGestureActive?.() === true) return true;
    return this.pointerInteractions.active;
  }

  /** Structural PatchMapFrameLoop target state without allocating a snapshot. */
  public get destroyed(): boolean {
    return this.lifecycle === 'destroyed' || this.lifecycle === 'destroying';
  }

  /**
   * Creates the one Engine-owned manual frame loop. Engine destroy always
   * cancels it before releasing the Pixi surface.
   */
  public createFrameLoop(options: PatchMapFrameLoopOptions = {}): PatchMapFrameLoop {
    this.requireSurface('createFrameLoop');
    if (this.terminalSurfaceFailure !== null) throw this.terminalSurfaceFailure;
    const frameLoop = this.managedFrameLoop.create(this, options);
    if (frameLoop === null) {
      throw this.operationError('CONFLICT', 'CONFLICT', 'createFrameLoop', false);
    }
    if (this.pageLifecycle.hidden) {
      this.managedFrameLoop.pauseForVisibility();
    }
    return frameLoop;
  }

  /** Internal bridge used by high-level capture to keep one publication clock. */
  public publishManagedFrameNow(): void {
    this.captureExtraction.publishManagedFrameNow();
  }

  public captureManagedPng(): Promise<PatchMapEngineExtractionResult> {
    return this.captureExtraction.captureManagedPng();
  }

  public initialize(options: PatchMapInitializeOptions): Promise<PatchMapInitializeResult> {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      return Promise.reject(this.operationError('DESTROYED', 'DESTROYED', 'initialize', false));
    }
    if (this.retainedCleanupSurface) {
      return Promise.reject(
        this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'initialize', false),
      );
    }
    if (options.backend === 'webgl1') {
      return Promise.reject(
        this.operationError(
          'UNSUPPORTED_RUNTIME',
          'UNSUPPORTED_RUNTIME',
          'initialize',
          false,
        ),
      );
    }
    const backend = options.backend ??
      (options.preference === 'webgpu' ? 'webgpu' : 'webgl2');
    const preference = backend === 'webgpu' ? 'webgpu' : 'webgl';
    if (options.preference !== undefined && options.preference !== preference) {
      return Promise.reject(
        this.operationError('INVALID_VALUE', 'INVALID_INPUT', 'initialize', true),
      );
    }
    validateInitializeOptions(options);
    const parseOptions = options.theme === undefined
      ? undefined
      : Object.freeze({ colors: normalizePatchMapColorTheme(options.theme) });
    if (!this.operations.isInstanceCompatible(options.instanceId)) {
      return Promise.reject(
        this.operationError('CONFLICT', 'CONFLICT', 'initialize', false),
      );
    }
    let assetSession: PatchMapAssetSession;
    try {
      assetSession = this.ensureAssetSession(options.instanceId);
    } catch (error) {
      return Promise.reject(this.assetInitializationError(error));
    }
    this.operations.configureInstance(options.instanceId);
    if (this.initializePromise) return this.initializePromise;
    if (this.surface) return Promise.resolve(this.initializeResult());
    try {
      if (options.requiredAssets) assetSession.registerAssets(options.requiredAssets);
    } catch (error) {
      return Promise.reject(this.assetInitializationError(error));
    }
    this.lifecycle = 'initializing';
    this.terminalRendererLossProbe = null;
    this.instanceId = options.instanceId;
    const surfaceOptions: PatchMapSurfaceOptions = {
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio ?? globalThis.devicePixelRatio ?? 1,
      antialias: options.antialias ?? true,
      background: normalizeBackground(options.background ?? '#FAFAFA'),
      strategy: options.strategy ?? 'mesh',
      preference,
      backend,
      requireWebGL2: backend === 'webgl2',
      devtools: options.devtools ?? false,
      powerPreference: options.powerPreference ?? 'high-performance',
      wheelActivationModifier: options.wheelActivationModifier ?? 'none',
      ...(parseOptions === undefined ? {} : { parse: parseOptions }),
      assetSession,
      requestFrame: () => this.requestManagedFrameLoop(),
      onTerminalFailure: (error) => this.handleSurfaceTerminalFailure(error),
      ...(options.target ? { target: options.target } : {}),
      ...(options.canvas ? { canvas: options.canvas } : {}),
    };
    this.viewportRuntime.initialize({
      width: surfaceOptions.width,
      height: surfaceOptions.height,
      pixelRatio: surfaceOptions.pixelRatio,
      zoomLimits: options.zoomLimits ?? DEFAULT_ZOOM_LIMITS,
      viewRevision: this.publication.viewRevision,
    });
    const requiredAliases = options.requiredAssets?.map(({ alias }) => alias) ?? [];
    // Register the public initialization promise before entering any
    // host-provided asset or surface callback. A synchronous reentrant
    // initialize() must observe and reuse this promise instead of starting a
    // second renderer allocation before ownership is published.
    let resolveInitialization!: (result: PatchMapInitializeResult) => void;
    let rejectInitialization!: (reason?: unknown) => void;
    const initialization = new Promise<PatchMapInitializeResult>((resolve, reject) => {
      resolveInitialization = resolve;
      rejectInitialization = reject;
    });
    this.surfaceLifecycle.setInitialization(initialization);
    this.initializationBootstrapInProgress = true;
    const initializationWork = (async (): Promise<PatchMapInitializeResult> => {
      const attemptAcquisitions: PatchMapAssetAcquisition[] = [];
      let candidateSurface: PatchMapEngineSurface | null = null;
      try {
        for (const alias of requiredAliases) {
          attemptAcquisitions.push(await assetSession.acquire(alias));
        }
        if (this.isDestroyingOrDestroyed()) {
          throw this.operationError('DESTROYED', 'DESTROYED', 'initialize', false);
        }
        this.rendererConfiguration = Object.freeze({
          resolution: surfaceOptions.pixelRatio,
          antialias: surfaceOptions.antialias,
          background: `#${(surfaceOptions.background >>> 0)
            .toString(16)
            .padStart(8, '0')}`,
          backend: surfaceOptions.preference,
        });
        candidateSurface = await this.surfaceLifecycle.allocateCandidate(surfaceOptions);
        candidateSurface.setViewportGesturePolicies?.(
          this.viewportRuntime.orderedEnabledPolicies(),
        );
        candidateSurface.setViewportZoomLimits?.(
          this.viewportRuntime.snapshot().zoomLimits,
        );
        if (this.isDestroyingOrDestroyed()) {
          if (this.initializationMustCleanLateSurface) {
            const cleanup = await this.surfaceLifecycle.cleanup(candidateSurface);
            if (cleanup.rendererLoss?.destroyed === true) {
              this.terminalRendererLossProbe = cleanup.rendererLoss;
            }
            if (cleanup.error !== null) {
              candidateSurface = null;
              throw this.operationError(
                'INTERNAL_FAILURE',
                'INTERNAL_FAILURE',
                'initialize',
                false,
              );
            }
          } else {
            this.surfaceLifecycle.retainCandidateForCleanup(candidateSurface);
          }
          candidateSurface = null;
          throw this.operationError('DESTROYED', 'DESTROYED', 'initialize', false);
        }
        const readySurface = candidateSurface;
        const pointerAuthority = this.pointerInteractions.createCandidateAuthority(readySurface);
        try {
          this.surfaceLifecycle.installCandidate(readySurface, {
            viewport: (input: PatchMapSurfaceViewportInput) =>
              this.viewportRuntime.acceptSurfaceInput(readySurface, input),
            pointer: (input: PatchMapSurfacePointerInput) =>
              this.acceptSurfacePointerInput(readySurface, input),
            contextMenu: (input) =>
              this.acceptSurfaceContextMenuInput(readySurface, input),
            accessibility: (targetId, input) => {
              if (
                !this.surfaceLifecycle.isCurrent(readySurface) ||
                this.terminalSurfaceFailure !== null ||
                this.isDestroyingOrDestroyed()
              ) {
                return;
              }
              this.activateAccessibilityTarget(targetId, input);
            },
          });
        } catch (error) {
          this.pointerInteractions.discardCandidateAuthority(pointerAuthority);
          throw error;
        }
        this.pointerInteractions.adoptCandidateAuthority(pointerAuthority);
        this.publication.resetGeometryCorrelation();
        candidateSurface = null;
        this.assetSessions.adoptRequiredAcquisitions(attemptAcquisitions);
        this.publication.advanceLifecycle();
        this.lifecycle = this.materialized?.rootIds.length ? 'scene-ready' : 'ready-empty';
        const result = this.initializeResult();
        this.emit('ready', result);
        return result;
      } catch (error) {
        const cleanupFailures: unknown[] = [];
        if (candidateSurface) {
          const cleanup = await this.surfaceLifecycle.cleanup(candidateSurface);
          if (cleanup.rendererLoss?.destroyed === true) {
            this.terminalRendererLossProbe = cleanup.rendererLoss;
          }
          if (cleanup.error) cleanupFailures.push(cleanup.error);
        }
        const acquisitionSettlements = await this.assetSessions
          .releaseInitializationAcquisitions(
            attemptAcquisitions,
          );
        cleanupFailures.push(...rejectedReasons(acquisitionSettlements));
        this.surfaceLifecycle.clearInitialization(initialization);
        this.rendererConfiguration = null;
        if (this.lifecycle !== 'destroyed' && this.lifecycle !== 'destroying') {
          this.lifecycle = 'new';
        }
        if (cleanupFailures.length > 0) {
          throw this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'initialize', false);
        }
        throw this.assetInitializationError(error);
      }
    })();
    this.initializationBootstrapInProgress = false;
    void initializationWork.then(resolveInitialization, rejectInitialization);
    return initialization;
  }

  public loadDataset(input: unknown, options: PatchMapLoadOptions = {}): PatchMapEngineLoadResult {
    return this.datasetReplacement.load(input, options);
  }

  /**
   * Synchronize aggregate resources and ask PixiJS PrepareSystem to upload
   * them without publishing a visible frame. Surfaces without a prepare phase
   * report explicit unsupported status instead of fabricated upload timing.
   */
  public async prepareScene(): Promise<PatchMapEnginePrepareResult> {
    const surface = this.requireSurface('prepareScene');
    const revisions = this.revisionStamp();
    const publishedTuple = this.publication.publishedTuple;
    if (surface.prepare === undefined) {
      return Object.freeze({
        status: 'unsupported',
        storeSyncMs: null,
        gpuPrepareMs: null,
        revisions,
        publishedTuple,
      });
    }
    try {
      const prepared = await surface.prepare();
      validateNonNegativeFinite('storeSyncMs', prepared.storeSyncMs);
      validateNonNegativeFinite('gpuPrepareMs', prepared.gpuPrepareMs);
      return Object.freeze({
        status: 'prepared',
        storeSyncMs: prepared.storeSyncMs,
        gpuPrepareMs: prepared.gpuPrepareMs,
        revisions,
        publishedTuple,
      });
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'prepareScene');
      this.emit('diagnostic', diagnostic);
      throw new PatchMapError(diagnostic);
    }
  }

  public async loadDatasetAsync(
    input: unknown,
    options: PatchMapLoadOptions = {},
  ): Promise<PatchMapEngineLoadResult> {
    return this.datasetReplacement.loadAsync(input, options);
  }

  /**
   * Apply one versioned, ordered semantic transaction. Candidate validation,
   * index construction, and history detachment finish before the aggregate
   * surface is allowed to publish the candidate.
   */
  public transact(
    request: PatchMapMutationTransactionRequest,
    schemaRevision = PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  ): PatchMapEngineTransactionResult {
    const surface = this.requireSurface('transact');
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.historyAuthority.state();
    const planStarted = enginePerformanceNow();
    const plan = this.planMutationRequest(request, schemaRevision);
    const transactionPlanMs = enginePerformanceNow() - planStarted;
    return this.transactionCommit.commit(
      surface,
      plan,
      'transact',
      previousRevisions,
      previousHistory,
      transactionPlanMs,
      this.cancelActiveTransformerBeforeSurfaceReconcile,
    );
  }

  /**
   * Commit one ordered exact-height batch without allocating the equivalent
   * merge/change/path graph for every bar. It intentionally shares the same
   * atomic reconcile, history, animation, and publication authorities as
   * transact().
   */
  public updateBarHeights(
    request: PatchMapBarHeightBatchRequest,
  ): PatchMapEngineTransactionResult {
    const surface = this.requireSurface('updateBarHeights');
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.historyAuthority.state();
    const planStarted = enginePerformanceNow();
    const plan = planPatchMapBarHeightBatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
    );
    const transactionPlanMs = enginePerformanceNow() - planStarted;
    return this.transactionCommit.commit(
      surface,
      plan,
      'transact',
      previousRevisions,
      previousHistory,
      transactionPlanMs,
      this.cancelActiveTransformerBeforeSurfaceReconcile,
    );
  }

  /**
   * Update concrete item/grid-instance bar destinations without rewriting the
   * authored PATCH MAP dataset or recording semantic history.
   */
  public updateInstanceBarHeights(
    request: PatchMapInstanceBarHeightRequest,
  ): PatchMapEngineInstanceBarHeightResult {
    const surface = this.requireSurface('updateInstanceBarHeights');
    const previousRevisions = this.revisionStamp();
    if (!surface.updateInstanceBarHeights) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'updateInstanceBarHeights',
        false,
      );
    }
    this.cancelActiveTransformerBeforeSurfaceReconcile();
    const updated = surface.updateInstanceBarHeights(request);
    if (updated.missingTargets.length > 0) {
      const diagnostic = this.operationDiagnostic(
        'MISSING_TARGET',
        'MISSING_TARGET',
        'updateInstanceBarHeights',
        true,
      );
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        previousRevisions,
        revisions: this.revisionStamp(),
        appliedTargets: Object.freeze([]),
        missingTargets: updated.missingTargets,
        dirtyRanges: Object.freeze([]),
        activeAnimationCount: updated.activeAnimationCount,
        overlayCount: updated.overlayCount,
        diagnostic,
      } satisfies PatchMapEngineInstanceBarHeightResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }
    if (!updated.changed) {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        previousRevisions,
        revisions: this.revisionStamp(),
        appliedTargets: updated.appliedTargets,
        missingTargets: Object.freeze([]),
        dirtyRanges: updated.dirtyRanges,
        activeAnimationCount: updated.activeAnimationCount,
        overlayCount: updated.overlayCount,
      });
    }
    this.publication.advanceInteraction();
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      publication: 'pending',
      previousRevisions,
      revisions: this.revisionStamp(),
      appliedTargets: updated.appliedTargets,
      missingTargets: Object.freeze([]),
      dirtyRanges: updated.dirtyRanges,
      activeAnimationCount: updated.activeAnimationCount,
      overlayCount: updated.overlayCount,
    } satisfies PatchMapEngineInstanceBarHeightResult);
    this.emit('instanceBarHeightsChanged', result);
    return result;
  }

  /**
   * Commit one owner-qualified text batch without allocating a generic
   * operation/path graph for every label. Text layout and renderer
   * reconciliation remain exact and history uses the same atomic boundary.
   */
  public updateTexts(
    request: PatchMapTextBatchRequest,
  ): PatchMapEngineTransactionResult {
    const surface = this.requireSurface('updateTexts');
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.historyAuthority.state();
    const planStarted = enginePerformanceNow();
    const plan = planPatchMapTextBatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
    );
    const transactionPlanMs = enginePerformanceNow() - planStarted;
    return this.transactionCommit.commit(
      surface,
      plan,
      'transact',
      previousRevisions,
      previousHistory,
      transactionPlanMs,
      this.cancelActiveTransformerBeforeSurfaceReconcile,
    );
  }

  /**
   * Merge one change list over an explicit target set. Unlike a raw staged
   * transaction, an empty target set is a validated no-op with no publication,
   * revision, history, or event side effects.
   */
  public bulkPatch(
    request: PatchMapBulkPatchRequest,
    schemaRevision = PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  ): PatchMapEngineTransactionResult {
    const surface = this.requireSurface('bulkPatch');
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.historyAuthority.state();
    const planStarted = enginePerformanceNow();
    const plan = this.planBulkPatchRequest(request, schemaRevision);
    const transactionPlanMs = enginePerformanceNow() - planStarted;
    return this.transactionCommit.commit(
      surface,
      plan,
      'bulkPatch',
      previousRevisions,
      previousHistory,
      transactionPlanMs,
      this.cancelActiveTransformerBeforeSurfaceReconcile,
    );
  }

  /**
   * Plan and commit one pinned editor action through the same immutable
   * transaction, aggregate reconcile, selection, and history authority as
   * lower-level semantic updates.
   */
  public author(action: unknown): PatchMapEngineAuthoringResult {
    this.requireSurface('author');
    const plan = planPatchMapAuthoringAction(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      action,
      { selectionIds: this.logicalSelectionIds },
    );
    if (plan.status === 'rejected') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_AUTHORING_REVISION,
        actionType: plan.actionType,
        status: 'rejected',
        changed: false,
        code: plan.diagnostic.code,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: plan.diagnostic,
        history: this.historyAuthority.state(),
      });
    }
    if (plan.status === 'unchanged') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_AUTHORING_REVISION,
        actionType: plan.actionType,
        status: 'unchanged',
        changed: false,
        code: null,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: null,
        history: this.historyAuthority.state(),
      });
    }

    const transaction = this.transact(plan.transaction);
    const diagnostic =
      transaction.status === 'rejected' || transaction.status === 'refused'
        ? transaction.diagnostic
        : null;
    return Object.freeze({
      schemaRevision: PATCH_MAP_AUTHORING_REVISION,
      actionType: plan.actionType,
      status: transaction.status,
      changed: transaction.changed,
      code: diagnostic?.code ?? null,
      plan,
      facts: plan.facts,
      transaction,
      diagnostic,
      history: transaction.history.state,
    });
  }

  /**
   * Commit host-prepared text/images without accepting DOM/File ownership.
   * Multi-image intake, selection, and history publish as one transaction.
   */
  public ingestHostAsset(
    input: PatchMapHostAssetIngestionInput,
  ): PatchMapEngineHostAssetIngestionResult {
    this.requireSurface('ingestHostAsset');
    const plan = this.hostAssetIngestion.plan(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      input,
    );
    if (plan.status === 'ignored') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
        status: 'ignored',
        changed: false,
        code: null,
        createdTextId: null,
        createdImageIds: Object.freeze([]),
        plan,
        transaction: null,
        probe: this.hostAssetIngestion.probe(),
      });
    }
    if (plan.status === 'failed') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
        status: 'failed',
        changed: false,
        code: plan.code,
        createdTextId: null,
        createdImageIds: Object.freeze([]),
        plan,
        transaction: null,
        probe: this.hostAssetIngestion.probe(),
      });
    }
    const transaction = this.transact(plan.transaction);
    if (transaction.status === 'committed') this.hostAssetIngestion.commit(plan);
    const code =
      transaction.status === 'rejected' || transaction.status === 'refused'
        ? transaction.diagnostic.code
        : null;
    return Object.freeze({
      schemaRevision: PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
      status: transaction.status,
      changed: transaction.changed,
      code,
      createdTextId: transaction.status === 'committed' ? plan.createdTextId : null,
      createdImageIds: transaction.status === 'committed'
        ? plan.createdImageIds
        : Object.freeze([]),
      plan,
      transaction,
      probe: this.hostAssetIngestion.probe(),
    });
  }

  public hostAssetIngestionProbe(): PatchMapHostAssetIngestionProbe {
    this.requireSurface('hostAssetIngestionProbe');
    return this.hostAssetIngestion.probe();
  }

  /**
   * Execute one host/editor action against logical session authority. Every
   * semantic change still enters through transact(); session-only actions only
   * update selection and detached companion state.
   */
  public editorWorkflow(
    action: PatchMapEditorWorkflowAction,
  ): PatchMapEngineEditorWorkflowResult {
    this.requireSurface('editorWorkflow');
    const plan = this.editorWorkflows.plan(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      action,
    );
    if (plan.status === 'rejected') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
        actionType: plan.actionType,
        status: 'rejected',
        changed: false,
        code: plan.diagnostic.code,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: plan.diagnostic,
        history: this.historyAuthority.state(),
        selectionIds: Object.freeze([...this.logicalSelectionIds]),
        probe: this.editorWorkflows.probe(),
      });
    }

    if (plan.transaction === null) {
      if (plan.selectionIds !== undefined) this.select(plan.selectionIds);
      this.editorWorkflows.commit(plan);
      if (plan.closeHistoryGroup) this.historyAuthority.closeActionGroup();
      return Object.freeze({
        schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
        actionType: plan.actionType,
        status: plan.status === 'unchanged' ? 'unchanged' : 'committed',
        changed: plan.changed,
        code: null,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: null,
        history: this.historyAuthority.state(),
        selectionIds: Object.freeze([...this.logicalSelectionIds]),
        probe: this.editorWorkflows.probe(),
      });
    }

    const transaction = this.transact(plan.transaction);
    const accepted = transaction.status === 'committed' || transaction.status === 'unchanged';
    if (accepted) {
      if (plan.selectionIds !== undefined) this.select(plan.selectionIds);
      this.editorWorkflows.commit(plan);
      if (plan.closeHistoryGroup) this.historyAuthority.closeActionGroup();
    } else {
      this.editorWorkflows.discard(plan);
    }
    const diagnostic =
      transaction.status === 'rejected' || transaction.status === 'refused'
        ? transaction.diagnostic
        : null;
    return Object.freeze({
      schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
      actionType: plan.actionType,
      status: transaction.status,
      changed: transaction.changed,
      code: diagnostic?.code ?? null,
      plan,
      facts: plan.facts,
      transaction,
      diagnostic,
      history: transaction.history.state,
      selectionIds: Object.freeze([...this.logicalSelectionIds]),
      probe: this.editorWorkflows.probe(),
    });
  }

  public editorWorkflowProbe(): PatchMapEditorWorkflowProbe {
    this.requireSurface('editorWorkflowProbe');
    return this.editorWorkflows.probe();
  }

  /**
   * Run the supported editor mutation set as twelve real, separately
   * reversible semantic transactions. This is deliberately not a synthetic
   * counter: every entry publishes through the current aggregate surface.
   */
  public runEditorMutationMatrix(
    input: PatchMapEngineEditorMutationMatrixInput,
  ): PatchMapEngineEditorMutationMatrixResult {
    this.requireSurface('runEditorMutationMatrix');
    return runPatchMapEditorMutationMatrix({
      materialized: () => this.materialized,
      transact: (request) => this.transact(request),
      historyState: () => this.historyAuthority.state(),
      closeHistoryGroup: () => this.historyAuthority.closeActionGroup(),
      setHistoryCompanion: (value) => {
        this.setHistoryCompanion(value);
      },
      historyCompanion: () => this.historyCompanionState().hostCompanion,
    }, input);
  }

  private planMutationRequest(
    request: PatchMapMutationTransactionRequest,
    schemaRevision: string,
  ): PatchMapMutationTransactionPlan {
    return planPatchMapMutationTransaction(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
      schemaRevision,
    );
  }

  private planBulkPatchRequest(
    request: PatchMapBulkPatchRequest,
    schemaRevision: string,
  ): PatchMapMutationTransactionPlan {
    return planPatchMapBulkPatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
      schemaRevision,
    );
  }

  public transactionPerformanceProbe(): PatchMapEngineTransactionPerformanceProbe | null {
    return this.transactionCommit.performanceProbe();
  }

  public relativePatch(
    targetInput: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
    changes: PatchMapRelativeGeometryChanges,
  ): PatchMapEnginePatchResult {
    this.requireSurface('relativePatch');
    const target = normalizeEngineMutationTarget(targetInput);
    if (target.kind !== 'element') throw new TypeError('relativePatch requires an element target');
    const current = this.sceneState.findTarget(target);
    if (current === null) return this.patch(target, {});
    const geometry = applyPatchMapRelativeGeometryUpdate(
      current as unknown as NormalizedPatchMapElement,
      changes,
    );
    if (geometry.candidate === null) {
      return this.rejectedGeometryPatchResult(target, geometry, 'relativePatch');
    }
    if (geometry.status === 'unchanged') return this.patch(target, {});
    return this.patch(target, { attrs: geometry.candidate.attrs });
  }

  public resizeAroundOrigin(
    targetInput: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
    resize: Omit<PatchMapVisibleCenterResize, 'parentAffine'>,
  ): PatchMapEnginePatchResult {
    this.requireSurface('resizeAroundOrigin');
    const target = normalizeEngineMutationTarget(targetInput);
    if (target.kind !== 'element') throw new TypeError('resizeAroundOrigin requires an element target');
    const current = this.sceneState.findTarget(target);
    if (current === null) return this.patch(target, {});
    const geometry = resizePatchMapGeometryAroundOrigin(
      current as unknown as NormalizedPatchMapElement,
      resize,
    );
    if (geometry.candidate === null) {
      return this.rejectedGeometryPatchResult(target, geometry, 'resizeAroundOrigin');
    }
    if (geometry.status === 'unchanged') return this.patch(target, {});
    return this.patch(target, {
      attrs: geometry.candidate.attrs,
      size: geometry.candidate.size,
    });
  }

  /**
   * Apply one strict partial merge against the current stable logical target.
   * Semantic authority advances only after the dense surface reports one
   * successful incremental reconcile; no failure path substitutes a full load.
   */
  public patch(target: PatchMapSemanticTarget, patch: unknown): PatchMapEnginePatchResult {
    return this.directMutation.patch(target, patch);
  }

  /**
   * Remove one stable logical element through the same incremental reconcile
   * authority as patch(). A refused dense plan leaves
   * semantic authority, revisions, selection, and the current surface unchanged.
   */
  public destroyTarget(target: PatchMapSemanticTarget): PatchMapEngineDestroyTargetResult {
    return this.directMutation.destroyTarget(target);
  }

  public setPresentationPolicy(
    input: PatchMapPresentationPolicyInput,
  ): PatchMapEnginePresentationResult {
    const surface = this.requireSurface('setPresentationPolicy');
    if (!surface.setPresentationPolicy || !surface.presentationPolicyProbe) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'setPresentationPolicy',
        false,
      );
    }
    const previousRevisions = this.revisionStamp();
    const before = surface.presentationPolicyProbe();
    const policy = surface.setPresentationPolicy(input);
    const changed = policy.revision !== before.revision;
    if (changed) this.publication.advanceInteraction();
    const result = Object.freeze({
      changed,
      publication: changed ? 'pending' : 'current',
      previousRevisions,
      revisions: this.revisionStamp(),
      policy,
    } satisfies PatchMapEnginePresentationResult);
    if (changed) this.emit('presentationChanged', result);
    return result;
  }

  public clearPresentationPolicy(): PatchMapEnginePresentationResult {
    const surface = this.requireSurface('clearPresentationPolicy');
    if (!surface.clearPresentationPolicy || !surface.presentationPolicyProbe) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'clearPresentationPolicy',
        false,
      );
    }
    const previousRevisions = this.revisionStamp();
    const before = surface.presentationPolicyProbe();
    const policy = surface.clearPresentationPolicy();
    const changed = policy.revision !== before.revision;
    if (changed) this.publication.advanceInteraction();
    const result = Object.freeze({
      changed,
      publication: changed ? 'pending' : 'current',
      previousRevisions,
      revisions: this.revisionStamp(),
      policy,
    } satisfies PatchMapEnginePresentationResult);
    if (changed) this.emit('presentationChanged', result);
    return result;
  }

  public presentationPolicyProbe(): PatchMapPresentationPolicyProductProbe {
    const surface = this.requireSurface('presentationPolicyProbe');
    if (!surface.presentationPolicyProbe) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'presentationPolicyProbe',
        false,
      );
    }
    return surface.presentationPolicyProbe();
  }

  public setPresentationLayer(
    input: PatchMapLogicalPresentationLayerInput,
  ): PatchMapPresentationLayerChange {
    const surface = this.requireSurface('setPresentationLayer');
    if (!surface.setPresentationLayer) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'setPresentationLayer',
        false,
      );
    }
    return surface.setPresentationLayer(input);
  }

  public clearPresentationLayer(key: string): PatchMapPresentationLayerChange {
    const surface = this.requireSurface('clearPresentationLayer');
    if (!surface.clearPresentationLayer) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'clearPresentationLayer',
        false,
      );
    }
    return surface.clearPresentationLayer(key);
  }

  public applyLiveOverlay(input: PatchMapLiveOverlayInput): PatchMapLiveOverlayResult {
    this.requireSurface('applyLiveOverlay');
    const sourceRevision = positiveSafeInteger(input.sourceRevision, 'sourceRevision');
    const payloadHash = nonEmptyValue(input.payloadHash, 'payloadHash');
    const acceptance = this.publication.planOverlayAcceptance(
      sourceRevision,
      payloadHash,
    );
    if (acceptance.status === 'superseded') {
      const diagnostic = this.operationDiagnostic(
        'SUPERSEDED',
        'SUPERSEDED',
        'applyLiveOverlay',
        true,
      );
      return Object.freeze({
        status: 'superseded',
        changed: false,
        sourceRevision,
        payloadHash,
        diagnostic,
      });
    }
    if (input.transaction.recordHistory === true) {
      const diagnostic = this.operationDiagnostic(
        'INVALID_VALUE',
        'INVALID_INPUT',
        'applyLiveOverlay',
        true,
      );
      this.emit('diagnostic', diagnostic);
      return Object.freeze({
        status: 'rejected',
        changed: false,
        sourceRevision,
        payloadHash,
        diagnostic,
      });
    }
    const transaction = this.transact({
      ...input.transaction,
      recordHistory: false,
    });
    if (transaction.status === 'rejected' || transaction.status === 'refused') {
      return Object.freeze({
        status: 'rejected',
        changed: false,
        sourceRevision,
        payloadHash,
        diagnostic: transaction.diagnostic,
        transaction,
      });
    }
    const tuple = this.publication.commitOverlayAcceptance(acceptance);
    this.emit('overlayAccepted', tuple);
    return Object.freeze({
      status: 'accepted',
      changed: transaction.changed,
      publication: 'pending',
      tuple,
      transaction,
    });
  }

  public liveOverlayProbe(): PatchMapLiveOverlayProbe {
    this.requireSurface('liveOverlayProbe');
    return this.publication.overlayProbe();
  }

  public replaceExternalDependency(
    dependencyIdValue: string,
    revisionValue: string,
  ): PatchMapExternalDependencyResult {
    this.requireSurface('replaceExternalDependency');
    const dependencyId = nonEmptyValue(dependencyIdValue, 'dependencyId');
    const revision = nonEmptyValue(revisionValue, 'revision');
    const previousRevision = this.externalDependencyRevisions.get(dependencyId) ?? null;
    const changed = previousRevision !== revision;
    if (changed) this.externalDependencyRevisions.set(dependencyId, revision);
    return Object.freeze({
      changed,
      dependencyId,
      previousRevision,
      revision,
    });
  }

  public externalDependencyProbe(): Readonly<Record<string, string>> {
    this.requireSurface('externalDependencyProbe');
    return Object.freeze(Object.fromEntries(
      [...this.externalDependencyRevisions].sort(([left], [right]) => left.localeCompare(right)),
    ));
  }

  public refreshSemantic(
    input: PatchMapSemanticRefreshInput,
  ): PatchMapEngineSemanticRefreshResult {
    const surface = this.requireSurface('refreshSemantic');
    const previousRevisions = this.revisionStamp();
    const history = this.historyAuthority.state();
    const selectionIds = this.logicalSelectionIds;
    const rejectedBase = {
      changed: false as const,
      previousRevisions,
      revisions: this.revisionStamp(),
      recomputedTargets: Object.freeze([] as string[]),
      missingTargets: Object.freeze([] as string[]),
      dirtyRanges: Object.freeze([] as SlotRange[]),
      dataDiffCount: 0 as const,
      history,
      selectionIds,
    };
    if (input.recordHistory === true) {
      const diagnostic = this.operationDiagnostic(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'refreshSemantic',
        true,
      );
      this.emit('diagnostic', diagnostic);
      return Object.freeze({ status: 'rejected', ...rejectedBase, diagnostic });
    }
    if (!surface.refreshSemanticTargets) {
      const diagnostic = this.operationDiagnostic(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'refreshSemantic',
        false,
      );
      this.emit('diagnostic', diagnostic);
      return Object.freeze({ status: 'rejected', ...rejectedBase, diagnostic });
    }
    const refreshed = surface.refreshSemanticTargets(input.targets, {
      strict: input.strict ?? true,
    });
    if ((input.strict ?? true) && refreshed.missingTargets.length > 0) {
      const diagnostic = this.operationDiagnostic(
        'MISSING_TARGET',
        'MISSING_TARGET',
        'refreshSemantic',
        true,
      );
      const result = Object.freeze({
        status: 'rejected' as const,
        changed: false as const,
        previousRevisions,
        revisions: this.revisionStamp(),
        recomputedTargets: refreshed.recomputedTargets,
        missingTargets: refreshed.missingTargets,
        dirtyRanges: refreshed.dirtyRanges,
        dataDiffCount: 0 as const,
        history,
        selectionIds,
        diagnostic,
      });
      this.emit('diagnostic', diagnostic);
      return result;
    }
    if (!refreshed.changed) {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        previousRevisions,
        revisions: this.revisionStamp(),
        recomputedTargets: refreshed.recomputedTargets,
        missingTargets: refreshed.missingTargets,
        dirtyRanges: refreshed.dirtyRanges,
        dataDiffCount: 0,
        history,
        selectionIds,
      });
    }
    this.publication.advanceScene();
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      publication: 'pending',
      previousRevisions,
      revisions: this.revisionStamp(),
      recomputedTargets: refreshed.recomputedTargets,
      missingTargets: refreshed.missingTargets,
      dirtyRanges: refreshed.dirtyRanges,
      dataDiffCount: 0,
      history,
      selectionIds,
    } satisfies PatchMapEngineSemanticRefreshResult);
    this.emit('semanticRefreshed', result);
    return result;
  }

  public async submitDataset(submission: PatchMapDatasetSubmission): Promise<PatchMapDatasetSubmissionResult> {
    return this.datasetReplacement.submit(submission);
  }

  public registerPageLifecycleWork(
    input: PatchMapEnginePageLifecycleWorkInput,
  ): PatchMapPageLifecycleWorkToken {
    return this.pageLifecycle.register(input);
  }

  public completePageLifecycleWork(
    token: PatchMapPageLifecycleWorkToken,
  ): PatchMapPageLifecycleWorkCompletion {
    return this.pageLifecycle.complete(token);
  }

  public setDocumentVisibility(
    input: PatchMapEngineDocumentVisibilityInput,
  ): PatchMapEngineDocumentVisibilityResult {
    return this.pageLifecycle.setDocumentVisibility(input);
  }

  public pageLifecycleProbe(): PatchMapEnginePageLifecycleProbe {
    return this.pageLifecycle.probe();
  }

  public publishFrame(timeMs = globalThis.performance?.now() ?? Date.now()): void {
    if (this.terminalSurfaceFailure !== null) throw this.terminalSurfaceFailure;
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs must be finite');
    if (this.pageLifecycle.hidden) return;
    const surface = this.requireSurface('publishFrame');
    try {
      this.refreshAccessibilitySurfaceIfActive('publishFrame');
      surface.publishFrame(timeMs);
      this.publication.setFrameClock(timeMs);
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'publishFrame');
      this.emit('diagnostic', diagnostic);
      throw new PatchMapError(diagnostic);
    }
    this.viewportRuntime.completePendingResizeFrame(surface);
    const publication = this.publication.commitFrame();
    this.emit('frame', publication);
    for (const visible of this.publication.publishPendingHistory()) {
      this.emit('historyVisible', visible);
    }
    const overlayPublished = this.publication.publishPendingOverlay();
    if (overlayPublished !== null) {
      this.emit('overlayPublished', overlayPublished);
    }
    this.pageLifecycle.publishedFrame();
  }

  public resize(
    width: number,
    height: number,
    pixelRatio = globalThis.devicePixelRatio ?? 1,
  ): boolean {
    return this.viewportRuntime.resize(width, height, pixelRatio);
  }

  public viewportProbe(): PatchMapViewportState {
    return this.viewportRuntime.viewportProbe();
  }

  public viewportTransformProbe(): PatchMapViewportTransformProbe {
    return this.viewportRuntime.viewportTransformProbe();
  }

  public panViewport(
    deltaCss: readonly [number, number],
    source: PatchMapViewportChangeSource = 'pointer',
  ): PatchMapViewportChangeResult {
    return this.viewportRuntime.panViewport(deltaCss, source);
  }

  public zoomViewportAt(input: Readonly<{
    readonly factor: number;
    readonly anchorCss: readonly [number, number];
    readonly source?: 'wheel' | 'modifier-wheel' | 'pinch' | 'programmatic';
  }>): PatchMapViewportChangeResult {
    return this.viewportRuntime.zoomViewportAt(input);
  }

  public startViewportDeceleration(
    velocityCssPxPerMs: readonly [number, number],
  ): boolean {
    return this.viewportRuntime.startDeceleration(velocityCssPxPerMs);
  }

  public advanceViewportMotion(deltaMs: number): PatchMapViewportChangeResult {
    return this.viewportRuntime.advanceMotion(deltaMs);
  }

  public cancelViewportMotion(): boolean {
    return this.viewportRuntime.cancelMotion();
  }

  public settleViewport(): PatchMapViewportSettleResult {
    return this.viewportRuntime.settle();
  }

  public serializeViewport(): PatchMapSerializedViewportState {
    return this.viewportRuntime.serialize();
  }

  public viewportPersistenceProbe(): PatchMapViewportPersistenceProbe {
    return this.viewportRuntime.persistenceProbe();
  }

  /**
   * Rebind a long-lived GPU Engine to a new host UI generation. The aggregate
   * renderer and canvas stay owned by the Engine, while gesture captures,
   * pending loads, selection, and resolved-target authority cannot cross the
   * host lifecycle boundary.
   */
  public rebindHostLifecycle(
    requestedGeneration: number,
  ): PatchMapHostLifecycleRebindResult {
    const rebind = this.publication.planLifecycleRebind(requestedGeneration);
    const surface = this.requireSurface('rebindHostLifecycle');
    this.hostInteractions.clearTooltip('redraw');
    this.datasetReplacement.invalidate();
    this.viewportRuntime.cancelMotion();
    if (this.transformerSessions.cancelActive('redraw', true) === null) {
      this.transformerSessions.interruptGestures();
    }
    this.pointerInteractions.interruptAndResetIfPresent('redraw');
    if (this.logicalSelectionIds.length > 0) {
      surface.select([]);
      this.publication.advanceInteraction();
    }
    this.sceneState.rebindHostSelection(Object.freeze([]));
    this.pointerInteractions.syncSelectionVisualPolicy();
    this.publication.commitLifecycleRebind(rebind);
    return Object.freeze({
      lifecycleGeneration: this.publication.lifecycleGeneration,
      sceneRevision: this.publication.sceneRevision,
      canvasCount: surface.canvasCount,
      selectionIds: this.logicalSelectionIds,
      revisions: this.revisionStamp(),
    });
  }

  public restoreViewport(
    input: unknown,
    fallback: PatchMapViewportFitOptions = {},
  ): PatchMapViewportRestoreResult {
    return this.viewportRuntime.restore(input, fallback);
  }

  public focusViewport(
    options: PatchMapViewportTargetOptions = {},
  ): PatchMapViewportFocusResult {
    return this.viewportRuntime.focus(options);
  }

  public fitViewport(
    options: PatchMapViewportFitOptions = {},
    source: 'fit' | 'fallback-fit' = 'fit',
  ): PatchMapViewportFitResult {
    return this.viewportRuntime.fit(options, source);
  }

  public configureViewportPolicy(
    operation: PatchMapViewportPolicyOperation,
  ): PatchMapViewportPolicyProbe {
    return this.viewportRuntime.configurePolicy(operation);
  }

  public viewportPolicyProbe(): PatchMapViewportPolicyProbe {
    return this.viewportRuntime.policyProbe();
  }

  public setViewport(input: Readonly<{
    centerWorld: readonly [number, number];
    scale: number;
  }>): PatchMapViewportState {
    return this.viewportRuntime.setViewport(input);
  }

  /** @internal Root public facade uses the full change result for absolute restore. */
  public setViewportAbsolute(input: PatchMapViewportSnapshot): PatchMapViewportChangeResult {
    return this.viewportRuntime.setViewportAbsolute(input);
  }

  public setWorldTransform(input: PatchMapWorldTransformInput): PatchMapWorldTransformState {
    return this.viewportRuntime.setWorldTransform(input);
  }

  public queryScene(input: PatchMapSceneQuery = {}): PatchMapEngineQueryResult {
    this.requireSurface('queryScene');
    const evaluated = this.logicalSceneIndex().query(input);
    const result = Object.freeze({
      schemaRevision: PATCH_MAP_QUERY_SELECTION_REVISION,
      status: evaluated.status,
      code: evaluated.code,
      lifecycleGeneration: this.targetLifecycleGeneration,
      sceneRevision: this.publication.sceneRevision,
      targets: evaluated.targets,
    } satisfies PatchMapEngineQueryResult);
    if (result.status !== 'rejected') {
      this.sceneState.rememberQueryResult(result, Object.freeze({
        lifecycleGeneration: this.targetLifecycleGeneration,
        sceneRevision: this.publication.sceneRevision,
        targets: result.targets,
      }));
    }
    return result;
  }

  /**
   * Validate and unwrap a revision-bound query handle for another product
   * subsystem. The returned logical targets are the same immutable snapshots;
   * a copied, foreign, lifecycle-old, or scene-old result never authorizes a
   * reused dense slot.
   */
  public reuseQueryResult(
    result: PatchMapEngineQueryResult,
    operation: PatchMapQueryReuseOperation,
  ): PatchMapEngineQueryReuseResult {
    this.requireSurface('reuseQueryResult');
    if (!PATCH_MAP_QUERY_REUSE_OPERATIONS.includes(operation)) {
      throw new TypeError('query reuse operation is unsupported');
    }
    const authority = this.sceneState.queryResultAuthority(result);
    if (
      authority === undefined ||
      authority.lifecycleGeneration !== this.targetLifecycleGeneration ||
      authority.sceneRevision !== this.publication.sceneRevision
    ) {
      return Object.freeze({
        status: 'rejected',
        code: 'STALE_TARGET',
        operation,
        appliedCount: 0,
        targets: Object.freeze([]),
      });
    }
    return Object.freeze({
      status: 'accepted',
      code: null,
      operation,
      appliedCount: authority.targets.length,
      targets: authority.targets,
    });
  }

  public select(ids: readonly string[]): readonly string[] {
    return this.selectionRuntime.apply({
      op: 'replace',
      ids,
      source: 'programmatic',
    }).current;
  }

  public accessibilityTree(root: 'scene' = 'scene'): PatchMapAccessibilityProbe {
    if (root !== 'scene') {
      throw new TypeError('PatchMap accessibility root must be scene');
    }
    this.refreshAccessibilityAuthority('accessibilityTree');
    return this.accessibility.probe(
      this.logicalSelectionIds,
      this.surface?.accessibilitySurfaceProbe?.() ?? null,
    );
  }

  public accessibilityProbe(): PatchMapAccessibilityProbe {
    if (this.accessibility.enabled && !this.isDestroyingOrDestroyed()) {
      this.refreshAccessibilityAuthority('accessibilityProbe');
    }
    return this.accessibility.probe(
      this.logicalSelectionIds,
      this.surface?.accessibilitySurfaceProbe?.() ?? null,
    );
  }

  public focusAccessibilityTarget(targetId: string): PatchMapAccessibilityProbe {
    const surface = this.requireSurface('focusAccessibilityTarget');
    this.refreshAccessibilityAuthority('focusAccessibilityTarget');
    this.accessibility.focus(targetId, true);
    surface.focusAccessibilityTarget?.(targetId);
    return this.accessibility.probe(
      this.logicalSelectionIds,
      surface.accessibilitySurfaceProbe?.() ?? null,
    );
  }

  public activateAccessibilityTarget(
    targetId: string,
    input: PatchMapAccessibilityActivationInput,
  ): PatchMapAccessibilityActivationResult {
    this.requireSurface('activateAccessibilityTarget');
    this.refreshAccessibilityAuthority('activateAccessibilityTarget');
    const result = this.accessibility.activate(targetId, input);
    if (result.selectRequested) this.select([targetId]);
    return result;
  }

  public setReducedMotion(
    enabled: boolean,
  ): Readonly<{
    readonly changed: boolean;
    readonly enabled: boolean;
    readonly activeAnimationCount: number;
  }> {
    const surface = this.requireSurface('setReducedMotion');
    if (typeof enabled !== 'boolean') {
      throw new TypeError('reduced motion must be a boolean');
    }
    surface.setReducedMotion?.(enabled);
    const changed = this.accessibility.setReducedMotion(enabled);
    if (this.accessibility.enabled) {
      this.refreshAccessibilityAuthority('setReducedMotion');
    }
    return Object.freeze({
      changed,
      enabled: this.accessibility.reducedMotion,
      activeAnimationCount: this.activeAnimations,
    });
  }

  public bindLogicalEvents(
    descriptors: readonly PatchMapLogicalEventBindingDescriptor[],
    listener: (delivery: PatchMapLogicalEventDelivery) => void,
  ): PatchMapLogicalEventBindingHandle {
    this.requireSurface('bindLogicalEvents');
    return this.hostInteractions.bindLogicalEvents(descriptors, listener);
  }

  public redrawLogicalEventBindings(): number {
    this.requireSurface('redrawLogicalEventBindings');
    return this.hostInteractions.redrawBindings();
  }

  public dispatchLogicalPropagation(
    targetOrId: PatchMapMutationTarget | string,
    options: PatchMapLogicalPropagationOptions = {},
  ): PatchMapLogicalPropagationTrace | null {
    this.requireSurface('dispatchLogicalPropagation');
    const target = this.logicalSceneIndex().target(
      typeof targetOrId === 'string'
        ? targetOrId
        : patchMapLogicalTargetKey(targetOrId),
    );
    return target === null
      ? null
      : createPatchMapLogicalPropagationTrace(
          target,
          this.publication.sceneRevision,
          options,
        );
  }

  public dispatchLogicalPropagationAtScreen(
    point: PatchMapPoint,
    options: PatchMapLogicalPropagationOptions = {},
  ): PatchMapLogicalPropagationTrace | null {
    const hit = this.selectionHitTestScreen(point, {
      predicate: () => true,
    });
    return hit.target === null
      ? null
      : createPatchMapLogicalPropagationTrace(
          hit.target,
          this.publication.sceneRevision,
          options,
        );
  }

  public ownsKeyboardInput(pathKind: string): boolean {
    this.requireSurface('ownsKeyboardInput');
    return patchMapOwnsKeyboardInput(pathKind);
  }

  public transformerHandlePropagationProbe(): ReturnType<
    typeof patchMapTransformerHandlePropagationProbe
  > {
    this.requireSurface('transformerHandlePropagationProbe');
    return patchMapTransformerHandlePropagationProbe();
  }

  public subscribeHostEvent(
    family: string,
    type: string | null,
    listener: (event: PatchMapHostObservedEvent) => void,
  ): PatchMapHostEventSubscription {
    this.requireSurface('subscribeHostEvent');
    return this.hostInteractions.subscribe(family, type, listener);
  }

  public applyInteractionModeOperation(
    operation: PatchMapInteractionModeOperation,
  ): PatchMapInteractionModeResult {
    this.requireSurface('applyInteractionModeOperation');
    return this.hostInteractions.applyModeOperation(operation);
  }

  public interactionModeProbe(): PatchMapInteractionModeProbe {
    this.requireSurface('interactionModeProbe');
    return this.hostInteractions.modeProbe();
  }

  public interactionInputOwner(state: string, input: string): string | null {
    this.requireSurface('interactionInputOwner');
    return this.hostInteractions.inputOwner(state, input);
  }

  public bindSelectionHost(
    listener: (publication: PatchMapSelectionHostPublication) => void,
  ): () => void {
    this.requireSurface('bindSelectionHost');
    return this.hostInteractions.bindSelectionHost(listener);
  }

  public bindTooltipHost(
    listener: (publication: PatchMapHostTooltipPublication) => void,
  ): PatchMapHostTooltipSubscription {
    this.requireSurface('bindTooltipHost');
    return this.hostInteractions.bindTooltipHost(listener);
  }

  public hoverTooltipAtScreen(
    point: PatchMapPoint,
    tooltipSizeCssPx: readonly [number, number],
  ): PatchMapHostTooltipState {
    return this.updateTooltipAtScreen('hover', point, tooltipSizeCssPx);
  }

  public toggleTooltipPinAtScreen(
    point: PatchMapPoint,
    tooltipSizeCssPx: readonly [number, number],
  ): PatchMapHostTooltipState {
    return this.updateTooltipAtScreen('pin', point, tooltipSizeCssPx);
  }

  public clearHostTooltip(reason: PatchMapTooltipClearReason): PatchMapHostTooltipState {
    this.requireSurface('clearHostTooltip');
    return this.hostInteractions.clearTooltip(reason);
  }

  public hostTooltipProbe(): PatchMapHostTooltipState {
    return this.hostInteractions.tooltipProbe();
  }

  private updateTooltipAtScreen(
    operation: 'hover' | 'pin',
    point: PatchMapPoint,
    tooltipSizeCssPx: readonly [number, number],
  ): PatchMapHostTooltipState {
    validatePoint(point, `${operation}TooltipAtScreen`);
    const hit = this.selectionHitTestScreen(point);
    if (hit.target === null) {
      return this.hostInteractions.clearTooltip('empty-target');
    }
    const viewport = this.viewportRuntime.snapshot();
    const input = Object.freeze({
      targetId: hit.target.ownerId ?? hit.target.selectionId,
      anchorCss: Object.freeze([point.x, point.y] as const),
      viewportCssPx: Object.freeze([
        viewport.width,
        viewport.height,
      ] as const),
      tooltipSizeCssPx,
    });
    const beforeRevision = this.hostInteractions.tooltipProbe().revision;
    const state = operation === 'hover'
      ? this.hostInteractions.hoverTooltip(input)
      : this.hostInteractions.toggleTooltipPin(input);
    if (state.revision !== beforeRevision) this.publication.advanceInteraction();
    return state;
  }

  public setExternalSelection(ids: readonly string[]): PatchMapExternalSelectionResult {
    return this.selectionRuntime.external(ids);
  }

  /**
   * Freeze the current logical selection for one host command. Later canvas or
   * host selection changes cannot retarget the returned immutable state.
   */
  public snapshotCommandTargets(commandId: string): PatchMapCommandTargetState {
    this.requireSurface('snapshotCommandTargets');
    const state = createPatchMapCommandTargetState(commandId, this.logicalSelectionIds);
    this.rememberCommandTargetState(state);
    return state;
  }

  /**
   * Advance a host-computed command status only while every frozen target is
   * still present. An explicit target outside the open command is rejected
   * without changing the immutable state.
   */
  public applyCommandTargetStatus(
    current: PatchMapCommandTargetState,
    status: PatchMapCommandTargetStatus,
    targetId?: string,
  ): PatchMapCommandTargetStatusResult {
    this.requireSurface('applyCommandTargetStatus');
    const authority = this.commandTargetAuthorities.get(current);
    if (
      authority === undefined ||
      authority.lifecycleGeneration !== this.publication.lifecycleGeneration
    ) {
      return Object.freeze({ status: 'rejected', code: 'STALE_TARGET', state: current });
    }
    const targetIds = authority.targetIds;
    const missingTarget = (
      targetId !== undefined &&
      (!targetIds.includes(targetId) || this.logicalSceneIndex().target(targetId) === null)
    ) || targetIds.some((id) => this.logicalSceneIndex().target(id) === null);
    if (missingTarget) {
      return Object.freeze({ status: 'rejected', code: 'MISSING_TARGET', state: current });
    }
    const state = advancePatchMapCommandTargetState(current, status);
    this.rememberCommandTargetState(state);
    return Object.freeze({ status: 'applied', code: null, state });
  }

  public hostInteractionProbe(): PatchMapHostInteractionProbe {
    return this.hostInteractions.probe();
  }

  public transformableSubset(
    selectionIds: readonly string[] = this.logicalSelectionIds,
    lockedIds: readonly string[] = [],
  ): PatchMapTransformableSubsetProbe {
    return this.selectionRuntime.transformableSubset(selectionIds, lockedIds);
  }

  public selectionVisualProbe(
    options: Omit<PatchMapSelectionVisualOptions, 'selectionIds'> & Readonly<{
      readonly selectionIds?: readonly string[];
    }> = {},
  ): PatchMapSelectionVisualProbe | null {
    return this.selectionRuntime.visualProbe(options);
  }

  public setSelectionVisualPolicy(
    options: Omit<PatchMapSelectionVisualOptions, 'selectionIds'> & Readonly<{
      readonly selectionIds?: readonly string[];
    }> = {},
  ): PatchMapSelectionVisualProbe | null {
    return this.selectionRuntime.setVisualPolicy(options);
  }

  public transformerHandleProbe(
    options: Omit<PatchMapSelectionVisualOptions, 'selectionIds'> & Readonly<{
      readonly selectionIds?: readonly string[];
      readonly cornerCssPx?: number;
      readonly edgeStripCssPx?: number;
      readonly rotateZoneCssPx?: number;
    }> = {},
  ): PatchMapTransformerHandleProbe | null {
    const visual = this.selectionVisualProbe(options);
    if (visual === null || visual.frame === null) return null;
    return createPatchMapTransformerHandleProbe(visual.frame, {
      ...(options.cornerCssPx === undefined
        ? {}
        : { cornerCssPx: options.cornerCssPx }),
      ...(options.edgeStripCssPx === undefined
        ? {}
        : { edgeStripCssPx: options.edgeStripCssPx }),
      ...(options.rotateZoneCssPx === undefined
        ? {}
        : { rotateZoneCssPx: options.rotateZoneCssPx }),
    });
  }

  public hitTransformerHandle(
    point: readonly [number, number],
    options: Parameters<PatchMap['transformerHandleProbe']>[0] = {},
  ): PatchMapTransformerHandle | null {
    const probe = this.transformerHandleProbe(options);
    return probe === null ? null : hitPatchMapTransformerHandle(probe, point);
  }

  public selectRelationEndpoints(
    relationIds: readonly string[],
    mode: 'replace' | 'add' | 'toggle' = 'replace',
    source: 'canvas' | 'external' | 'programmatic' = 'programmatic',
  ): PatchMapEngineRelationEndpointSelectionResult {
    return this.selectionRuntime.selectRelationEndpoints(relationIds, mode, source);
  }

  public beginTransformerHandleGesture(
    pointerId: number,
    handle: PatchMapTransformerHandle,
  ): PatchMapTransformerGestureProbe {
    return this.transformerSessions.beginHandleGesture(pointerId, handle);
  }

  public routeTransformerInput(
    pointerId: number,
    family: PatchMapTransformerInputFamily,
  ): ReturnType<PatchMapTransformerGestureAuthority['route']> {
    return this.transformerSessions.routeInput(pointerId, family);
  }

  public completeTransformerHandleGesture(
    pointerId: number,
  ): NonNullable<PatchMapEngineTransformerCompletionResult['gesture']> {
    return this.transformerSessions.completeHandleGesture(pointerId);
  }

  public cancelTransformerHandleGesture(
    pointerId: number,
    reason: PatchMapGestureCancelReason = 'pointer-cancel',
  ): NonNullable<PatchMapEngineTransformerCancelResult['gesture']> {
    return this.transformerSessions.cancelHandleGesture(pointerId, reason);
  }

  public transformerGestureProbe(): PatchMapTransformerGestureProbe {
    return this.transformerSessions.gestureProbe();
  }

  public applyTransformerEdit(
    request: PatchMapTransformerEditRequest,
    options: PatchMapEngineTransformerEditOptions = {},
  ): PatchMapEngineTransformerEditResult {
    this.requireSurface('applyTransformerEdit');
    const materialized = this.materialized;
    if (materialized === null) {
      throw this.operationError('NOT_READY', 'NOT_READY', 'applyTransformerEdit', true);
    }
    const plan = planPatchMapTransformerEdit(materialized.dataset, request);
    if (plan.status !== 'planned') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_TRANSFORMER_EDIT_REVISION,
        status: plan.status,
        changed: false,
        plan,
        transaction: null,
        historyDepthDelta: 0,
      });
    }
    const before = this.historyAuthority.state();
    const transaction = this.transact({
      strict: true,
      operations: plan.operations,
      ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
      ...(options.recordHistory === undefined
        ? {}
        : { recordHistory: options.recordHistory }),
    });
    const after = this.historyAuthority.state();
    return Object.freeze({
      schemaRevision: PATCH_MAP_TRANSFORMER_EDIT_REVISION,
      status: transaction.status,
      changed: transaction.changed,
      plan,
      transaction,
      historyDepthDelta: after.undoDepth - before.undoDepth,
    });
  }

  public beginTransformerEdit(
    input: PatchMapEngineTransformerSessionBeginInput,
  ): PatchMapEngineTransformerSessionProbe {
    return this.transformerSessions.beginEdit(input);
  }

  /** @internal Public facade receives an opaque token; Engine owns gesture identity. */
  public beginPublicTransformerEdit(
    input: Omit<PatchMapEngineTransformerSessionBeginInput, 'pointerId'>,
  ): object {
    return this.transformerSessions.beginPublicEdit(input);
  }

  public previewTransformerEdit(
    pointerId: number,
    request: PatchMapTransformerEditRequest,
  ): PatchMapEngineTransformerPreviewResult {
    return this.transformerSessions.previewEdit(pointerId, request);
  }

  /** @internal Public facade preview bound to one Engine-owned session token. */
  public previewPublicTransformerEdit(
    token: object,
    request: PatchMapTransformerEditRequest,
  ): PatchMapEngineTransformerPreviewResult {
    return this.transformerSessions.previewPublicEdit(token, request);
  }

  public completeTransformerEdit(
    pointerId: number,
  ): PatchMapEngineTransformerCompletionResult {
    return this.transformerSessions.completeEdit(pointerId);
  }

  /** @internal Complete and invalidate one public transformer token. */
  public completePublicTransformerEdit(
    token: object,
  ): PatchMapEngineTransformerCompletionResult {
    return this.transformerSessions.completePublicEdit(token);
  }

  public cancelTransformerEdit(
    pointerId: number,
    reason: PatchMapGestureCancelReason,
  ): PatchMapEngineTransformerCancelResult {
    return this.transformerSessions.cancelEdit(pointerId, reason);
  }

  /** @internal Cancel and invalidate one public transformer token. */
  public cancelPublicTransformerEdit(token: object): PatchMapEngineTransformerCancelResult {
    return this.transformerSessions.cancelPublicEdit(token);
  }

  public transformerEditProbe(): PatchMapEngineTransformerSessionProbe {
    return this.transformerSessions.editProbe();
  }

  public resolveTransformerRotationSnap(
    startDegrees: number,
    pointerDegrees: number,
    snap: boolean,
    incrementDegrees = 15,
  ): PatchMapRotationSnapResult {
    this.requireSurface('resolveTransformerRotationSnap');
    return resolvePatchMapRotationSnap(
      startDegrees,
      pointerDegrees,
      snap,
      incrementDegrees,
    );
  }

  public edgeAutoPanTransformer(
    pointerScreen: readonly [number, number],
    deltaCss: readonly [number, number],
  ): PatchMapEngineTransformerEdgePanResult {
    this.requireSurface('edgeAutoPanTransformer');
    const viewport = this.viewportRuntime.snapshot();
    const resolved = resolvePatchMapEdgeAutoPan(
      pointerScreen,
      deltaCss,
      viewport.centerWorld,
      viewport.scale,
      [viewport.width, viewport.height],
    );
    this.setViewport({
      centerWorld: resolved.centerWorld,
      scale: viewport.scale,
    });
    return Object.freeze({
      ...resolved,
      policyRestored: true,
      edgePanActiveCount: 0,
    });
  }

  /** @internal Refuse viewport mutation after the owning public session is cancelled. */
  public edgeAutoPanPublicTransformer(
    token: object,
    pointerScreen: readonly [number, number],
    deltaCss: readonly [number, number],
  ): PatchMapEngineTransformerEdgePanResult {
    this.transformerSessions.requirePublicPointer(token, 'edgeAutoPanPublicTransformer');
    return this.edgeAutoPanTransformer(pointerScreen, deltaCss);
  }

  public applySelection(input: PatchMapSelectionSetOperation): PatchMapSelectionChange {
    return this.selectionRuntime.apply(input);
  }

  public filterSelectionTargets(
    targetIds: readonly string[],
    options: PatchMapSelectionEligibilityOptions = {},
  ): readonly PatchMapLogicalTargetSnapshot[] {
    return this.selectionRuntime.filterTargets(targetIds, options);
  }

  public selectionHitTestScreen(
    point: PatchMapPoint,
    options: PatchMapSelectionHitOptions = {},
  ): PatchMapEngineSelectionHit {
    return this.selectionRuntime.hitTestScreen(point, options);
  }

  public selectPoint(
    point: PatchMapPoint,
    options: PatchMapSelectionHitOptions & Readonly<{
      readonly mode?: 'replace' | 'add' | 'toggle';
    }> = {},
  ): PatchMapEnginePointSelectionResult {
    return this.selectionRuntime.selectPoint(point, options);
  }

  public dispatchPointerInput(input: PatchMapEnginePointerInput): PatchMapPointerDispatchResult {
    return this.pointerInteractions.dispatch(input);
  }

  public dispatchPointerContextMenu(input: PatchMapSurfaceContextMenuInput): boolean {
    return this.pointerInteractions.dispatchContextMenu(input);
  }

  public pointerGestureProbe(): PatchMapPointerGestureProbe {
    return this.pointerInteractions.probe();
  }

  public ownsContextMenu(point: PatchMapPoint): boolean {
    return this.pointerInteractions.ownsContextMenu(point);
  }

  public interruptPointerGestures(
    reason: PatchMapGestureCancelReason,
  ): PatchMapOwnedGestureTermination | null {
    return this.pointerInteractions.interrupt(reason);
  }

  public beginOwnedPointerGesture(kind: PatchMapOwnedGestureKind, pointerId: number): void {
    this.pointerInteractions.beginOwnedGesture(kind, pointerId);
  }

  public terminateOwnedPointerGesture(
    reason: PatchMapGestureTerminationReason,
  ): PatchMapOwnedGestureTermination | null {
    return this.pointerInteractions.terminateOwnedGesture(reason);
  }

  public cancelOwnedPointerGesture(
    reason: PatchMapGestureCancelReason,
  ): PatchMapOwnedGestureTermination | null {
    return this.pointerInteractions.cancelOwnedGesture(reason);
  }

  public selectBox(
    start: readonly [number, number],
    end: readonly [number, number],
    options: PatchMapEngineRegionSelectionOptions = {},
  ): PatchMapEngineRegionSelectionResult {
    return this.selectionRuntime.selectBox(start, end, options);
  }

  public selectPaint(
    segments: readonly (readonly [
      readonly [number, number],
      readonly [number, number],
    ])[],
    options: PatchMapEngineRegionSelectionOptions = {},
  ): PatchMapEngineRegionSelectionResult {
    return this.selectionRuntime.selectPaint(segments, options);
  }

  public resolveSelectionInteraction(
    targetOrId: string,
    options: PatchMapSelectionInteractionOptions,
  ): PatchMapSelectionInteraction | null {
    return this.selectionRuntime.resolveInteraction(targetOrId, options);
  }

  public hitTest(point: PatchMapPoint): string | null {
    validatePoint(point, 'hitTest');
    return this.requireSurface('hitTest').hitTestScreen(point);
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    validatePoint(point, 'screenToWorld');
    return this.requireSurface('screenToWorld').screenToWorld(point);
  }

  public resolveTarget(targetInput: PatchMapMutationTarget): PatchMapResolvedTargetSnapshot | null {
    this.requireSurface('resolveTarget');
    const target = normalizeEngineMutationTarget(targetInput);
    const value = this.sceneState.findTarget(target);
    if (value === null) return null;
    const snapshot = Object.freeze({
      target,
      lifecycleGeneration: this.targetLifecycleGeneration,
      sceneRevision: this.publication.sceneRevision,
      value: cloneDetachedEngineRecord(value),
    });
    this.sceneState.rememberResolvedTarget(snapshot, Object.freeze({
      target,
      lifecycleGeneration: this.targetLifecycleGeneration,
      sceneRevision: this.publication.sceneRevision,
    }));
    return snapshot;
  }

  public patchResolved(
    snapshot: PatchMapResolvedTargetSnapshot,
    patch: unknown,
  ): PatchMapEnginePatchResult {
    this.requireSurface('patch');
    const authority = this.sceneState.resolvedTargetAuthority(snapshot);
    if (
      authority === undefined ||
      authority.lifecycleGeneration !== this.targetLifecycleGeneration ||
      authority.sceneRevision !== this.publication.sceneRevision
    ) {
      const previousRevisions = this.revisionStamp();
      const target = authority?.target ?? normalizeSnapshotTarget(snapshot);
      const diagnostic = this.operationDiagnostic(
        'STALE_TARGET',
        'STALE_TARGET',
        'patch',
        true,
      );
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
      } satisfies PatchMapEnginePatchResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }
    return this.patch(authority.target, patch);
  }

  public query(target: { readonly id: string }): Readonly<Record<string, unknown>> | null {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      throw this.operationError('DESTROYED', 'DESTROYED', 'query', false);
    }
    if (!this.surface) throw this.operationError('NOT_READY', 'NOT_READY', 'query', true);
    return this.sceneState.findElement(target.id);
  }

  public snapshot(): PatchMapEngineSnapshot {
    return readPatchMapEngineSnapshot(this.productProbeReadPort);
  }

  public runtimeDiagnostics(): PatchMapRuntimeDiagnosticsSnapshot {
    return readPatchMapEngineRuntimeDiagnostics(
      this.productProbeReadPort,
      this.operations,
      () => this.surface?.rendererLossProbe?.() ?? null,
    );
  }

  public semanticProbe(): PatchMapSemanticProductProbe {
    return readPatchMapEngineSemanticProbe(this.productProbeReadPort);
  }

  public sceneImageProbe(): PatchMapEngineSceneImagesProbe | null {
    return readPatchMapEngineSceneImageProbe(this.productProbeReadPort);
  }

  public retryAsset(
    target: PatchMapComponentVisualTarget | string,
  ): PatchMapSceneImageRetryResult {
    const surface = this.requireSurface('retryAsset');
    if (!surface.retrySceneImage) {
      return Object.freeze({
        status: 'unavailable',
        entityId: typeof target === 'string' ? target : '',
        bindingKey: null,
        generation: 0,
      });
    }
    let entityId: string;
    if (typeof target === 'string') {
      entityId = target;
    } else {
      const visual = this.componentVisualProbe(target);
      entityId = visual?.entityId ?? '';
    }
    if (entityId.length === 0) {
      return Object.freeze({
        status: 'unavailable',
        entityId,
        bindingKey: null,
        generation: 0,
      });
    }
    return surface.retrySceneImage(entityId);
  }

  /** Join the detached semantic component index with the renderer surface probe. */
  public componentVisualProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapEngineComponentVisualProbe | null {
    return readPatchMapEngineComponentVisualProbe(this.productProbeReadPort, target);
  }

  public barPresentationProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapEngineBarPresentationProbe | null {
    return readPatchMapEngineBarPresentationProbe(this.productProbeReadPort, target);
  }

  public paintOrderProbe(): PatchMapEnginePaintOrderProbe | null {
    return readPatchMapEnginePaintOrderProbe(this.productProbeReadPort);
  }

  /**
   * Resolve text through prebuilt semantic and surface indexes. No probe-time
   * traversal of materialized datasets, dense snapshots, or Pixi children is
   * permitted on this path.
   */
  public textProbe(target: PatchMapTextTarget): PatchMapEngineTextProbe | null {
    return readPatchMapEngineTextProbe(this.productProbeReadPort, target);
  }

  public settleSceneImages(): Promise<void> {
    const surface = this.requireSurface('settleSceneImages');
    return surface.settleSceneImages ? surface.settleSceneImages() : Promise.resolve();
  }

  public settleSceneImageBindings(bindingKeys: readonly string[]): Promise<void> {
    const surface = this.requireSurface('settleSceneImageBindings');
    return surface.settleSceneImageBindings
      ? surface.settleSceneImageBindings(bindingKeys)
      : Promise.resolve();
  }

  /**
   * Read renderer-aligned geometry without exposing the Pixi scene graph. The
   * aggregate renderer remains free to use a handful of display objects while
   * callers can still verify entity, relation, and selection alignment.
   */
  public geometryProbe(): PatchMapEngineGeometryProbe | null {
    const surface = this.requireSurface('geometryProbe');
    const geometry = surface.geometrySnapshot?.() ?? null;
    if (geometry === null) return null;
    const { revision: _surfaceRevision, sceneRevision: _sceneRevision, ...facts } = geometry;
    const correlation = this.correlateGeometryRevision(geometry.revision);
    return Object.freeze({
      ...facts,
      ...correlation,
    });
  }

  public relationProbe(): PatchMapEngineRelationProbe | null {
    const surface = this.requireSurface('relationProbe');
    const geometry = surface.geometrySnapshot?.() ?? null;
    if (geometry === null) return null;
    const correlation = this.correlateGeometryRevision(geometry.revision);
    return Object.freeze({
      ...correlation,
      relations: geometry.relations,
      omittedRelations: geometry.omittedRelations ?? Object.freeze([]),
    });
  }

  public relationHitTestScreen(
    point: PatchMapPoint,
    options: PatchMapRelationHitOptions = {},
  ): PatchMapRelationHit | null {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError('relation hit point must contain finite coordinates');
    }
    if (
      options.toleranceCssPx !== undefined &&
      (!Number.isFinite(options.toleranceCssPx) || options.toleranceCssPx < 0)
    ) {
      throw new RangeError('toleranceCssPx must be finite and non-negative');
    }
    const surface = this.requireSurface('relationHitTestScreen');
    return surface.relationHitTestScreen?.(point, options) ?? null;
  }

  public interactionOwnershipProbe(): PatchMapInteractionOwnershipProbe | null {
    return readPatchMapEngineInteractionOwnershipProbe(this.productProbeReadPort);
  }

  public rendererPublicSurfaceProbe(): PatchMapEngineRendererPublicSurfaceProbe | null {
    return readPatchMapEngineRendererPublicSurfaceProbe(this.productProbeReadPort);
  }

  public aggregateRenderOwnerProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapAggregateRenderOwnerProbe | null {
    return readPatchMapEngineAggregateRenderOwnerProbe(this.productProbeReadPort, target);
  }

  public rendererLossProbe(): PatchMapEngineRendererLossProbe | null {
    return readPatchMapEngineRendererLossProbe(this.productProbeReadPort);
  }

  public forceRendererLoss(): boolean {
    const surface = this.requireSurface('forceRendererLoss');
    if (surface.forceRendererLoss === undefined) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'forceRendererLoss',
        false,
      );
    }
    return surface.forceRendererLoss();
  }

  public exportDataset(): readonly NormalizedPatchMapElement[] {
    this.requireSurface('exportDataset');
    return this.materialized?.dataset ?? [];
  }

  public canvasHandle(): PatchMapEngineCanvasHandle {
    return this.captureExtraction.canvasHandle();
  }

  public async extractPublishedScene(
    request: PatchMapEngineExtractionRequest,
  ): Promise<PatchMapEngineExtractionResult> {
    return this.captureExtraction.extractPublishedScene(request);
  }

  public historyState(): PatchMapHistoryState {
    this.requireSurface('historyState');
    return this.historyAuthority.state();
  }

  public historyInspection(): PatchMapHistoryInspection<
    readonly NormalizedPatchMapElement[],
    PatchMapEngineHistoryCompanion
  > {
    this.requireSurface('historyInspection');
    return this.historyAuthority.inspect();
  }

  public historyCompanionState(): PatchMapEngineHistoryCompanionState {
    return this.historyApplication.companionState();
  }

  /**
   * Stage detached host editor state before a compound transaction. Recognized
   * `selectedIds` and `mode` fields join Engine interaction authority; all JSON
   * fields remain available as the opaque reversible host companion.
   */
  public setHistoryCompanion(
    value: PatchMapMutationJsonValue,
  ): PatchMapEngineHistoryCompanionState {
    return this.historyApplication.setCompanion(value);
  }

  public setHistoryCapacity(capacity: number): PatchMapEngineHistoryCapacityResult {
    this.requireSurface('setHistoryCapacity');
    try {
      const change = this.historyAuthority.setCapacity(capacity);
      return Object.freeze({
        status: 'committed',
        changed: change.changed,
        code: null,
        change,
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return Object.freeze({
        status: 'rejected',
        changed: false,
        code: 'INVALID_VALUE',
        capacity,
        history: this.historyAuthority.state(),
      });
    }
  }

  public clearHistory(): PatchMapEngineHistoryClearResult {
    this.requireSurface('clearHistory');
    return this.historyApplication.clear('host', true);
  }

  public handleHistoryShortcut(
    input: PatchMapHistoryShortcutInput,
  ): PatchMapHistoryShortcutResult {
    return this.historyApplication.handleShortcut(input);
  }

  public undo(): PatchMapEngineHistoryResult {
    return this.historyApplication.undo();
  }

  public redo(): PatchMapEngineHistoryResult {
    return this.historyApplication.redo();
  }

  public destroy(): Promise<boolean> {
    if (this.destroySettlement !== null) {
      return this.destroySettlement.then(() => false);
    }
    if (this.lifecycle === 'destroyed') return this.beginDestroyedCleanupRetry();
    let resolveSettlement!: (result: boolean) => void;
    let rejectSettlement!: (error: unknown) => void;
    const settlement = new Promise<boolean>((resolve, reject) => {
      resolveSettlement = resolve;
      rejectSettlement = reject;
    });
    this.destroySettlement = settlement;
    void this.performDestroy().then((result) => {
      this.destroySettlement = null;
      resolveSettlement(result);
    }, (error) => {
      this.destroySettlement = null;
      rejectSettlement(error);
    });
    return settlement;
  }

  private beginDestroyedCleanupRetry(): Promise<boolean> {
    let resolveSettlement!: (result: boolean) => void;
    let rejectSettlement!: (error: unknown) => void;
    const settlement = new Promise<boolean>((resolve, reject) => {
      resolveSettlement = resolve;
      rejectSettlement = reject;
    });
    this.destroySettlement = settlement;
    void this.retryDestroyedCleanup().then((result) => {
      this.destroySettlement = null;
      resolveSettlement(result);
    }, (error) => {
      this.destroySettlement = null;
      rejectSettlement(error);
    });
    return settlement;
  }

  private async performDestroy(): Promise<boolean> {
    this.captureExtraction.destroy();
    this.managedFrameLoop.destroy();
    this.transformerSessions.cancelActive('destroy', false);
    this.lifecycle = 'destroying';
    this.datasetReplacement.invalidate();
    const surface = this.surface;
    this.viewportRuntime.cancelMotion();
    this.pointerInteractions.destroy();
    this.transformerSessions.destroy();
    this.editorWorkflows.destroy();
    this.pageLifecycle.destroy();
    this.hostInteractions.destroy();
    this.accessibility.destroy();
    this.operations.disposeCallbacks();
    // A host callback may synchronously reenter destroy before the async
    // initialization task has returned control to initialize(). Waiting on
    // the public promise in that narrow bootstrap window would await the
    // callback that is itself awaiting destroy. The initialization owner
    // cleans any surface that arrives after this destroy completes.
    if (this.initializationBootstrapInProgress) {
      this.initializationMustCleanLateSurface = true;
    }
    const pendingInitialization = this.initializationBootstrapInProgress
      ? null
      : this.initializePromise;
    const cleanupFailures: unknown[] = [];
    let assetCleanup: Promise<void>;
    if (surface) {
      const cleanup = await this.cleanupSurface(surface);
      if (cleanup.error) cleanupFailures.push(cleanup.error);
      assetCleanup = this.assetSessions.destroy();
    } else {
      // Starting asset teardown cancels a required acquisition that may be
      // holding initialization open. The late surface, if any, is retained by
      // the initialization continuation until this destroy owns it below.
      assetCleanup = this.assetSessions.destroy();
    }
    if (pendingInitialization) {
      // Initialization owns a renderer allocation that may not exist yet. Its
      // continuation observes `destroying`, transfers the late surface to the
      // cleanup-only owner, and rejects. Waiting here makes destroy the physical
      // resource boundary instead of losing the renderer reference.
      await pendingInitialization.catch(() => undefined);
    }
    const retainedSurface = this.retainedCleanupSurface;
    if (retainedSurface && retainedSurface !== surface) {
      const cleanup = await this.cleanupSurface(retainedSurface);
      if (cleanup.error) cleanupFailures.push(cleanup.error);
    }
    let assetCleanupSucceeded = false;
    try {
      await assetCleanup;
      assetCleanupSucceeded = true;
    } catch (error) {
      cleanupFailures.push(error);
    }
    if (this.materialized !== null) {
      releasePatchMapSemanticHashScratch(this.materialized.dataset);
    }
    this.sceneState.destroy();
    this.resetLiveOverlayState();
    this.viewportRuntime.destroy();
    this.externalDependencyRevisions.clear();
    this.historyApplication.clear('destroy', true);
    this.historyAuthority.destroy();
    this.historyApplication.resetHostCompanion();
    this.publication.clearHistoryPublications();
    this.transactionCommit.reset();
    this.rendererConfiguration = null;
    this.surfaceLifecycle.clearInitialization();
    this.assetSessions.completeDestroy(assetCleanupSucceeded);
    this.lifecycle = 'destroyed';
    this.emit('destroyed', Object.freeze({
      lifecycleGeneration: this.publication.lifecycleGeneration,
    }));
    this.events.clear();
    if (cleanupFailures.length > 0) {
      throw this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'destroy', false);
    }
    return true;
  }

  private async retryDestroyedCleanup(): Promise<boolean> {
    const cleanupFailures: unknown[] = [];
    if (this.retainedCleanupSurface) {
      const cleanup = await this.cleanupSurface(this.retainedCleanupSurface);
      if (cleanup.error) cleanupFailures.push(cleanup.error);
    }
    try {
      await this.assetSessions.retryCleanup();
    } catch (error) {
      cleanupFailures.push(error);
    }
    if (cleanupFailures.length > 0) {
      throw this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'destroy', false);
    }
    return false;
  }

  private resetLiveOverlayState(): void {
    this.publication.resetOverlay();
  }

  private rememberCommandTargetState(state: PatchMapCommandTargetState): void {
    this.commandTargetAuthorities.set(state, Object.freeze({
      lifecycleGeneration: this.publication.lifecycleGeneration,
      targetIds: state.targetIds,
    }));
  }

  private logicalSceneIndex(): PatchMapLogicalSceneIndex {
    return this.sceneState.logicalSceneIndex();
  }

  /**
   * Stable-identity transactions only need target membership validation.
   * Reuse an older value snapshot while IDs/hierarchy are proven unchanged;
   * ordinary query callers still rebuild through logicalSceneIndex() so
   * labels, values, order, and locks can never be stale.
   */
  private logicalSceneIdentityIndex(): PatchMapLogicalSceneIndex {
    return this.sceneState.logicalSceneIdentityIndex();
  }

  private logicalSceneSelectionIndex(): PatchMapLogicalSceneIndex {
    return this.sceneState.logicalSceneSelectionIndex();
  }

  private refreshAccessibilityAuthority(operation: string): void {
    const surface = this.requireSurface(operation);
    const geometry = surface.geometrySnapshot?.();
    if (geometry === undefined) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        operation,
        false,
      );
    }
    this.accessibility.reconcile(derivePatchMapAccessibilityTargets(
      this.logicalSceneIndex().targets(),
      geometry.entities,
    ));
    surface.setAccessibilityTree?.(this.accessibility.renderNodes());
  }

  private refreshAccessibilitySurfaceIfActive(operation: string): void {
    if (!this.accessibility.enabled || this.isDestroyingOrDestroyed()) return;
    this.refreshAccessibilityAuthority(operation);
  }

  private async cleanupSurface(
    surface: PatchMapEngineSurface,
  ): Promise<Readonly<{ released: boolean; error: Error | null }>> {
    const cleanup = await this.surfaceLifecycle.cleanup(surface);
    if (cleanup.rendererLoss?.destroyed === true) {
      this.terminalRendererLossProbe = cleanup.rendererLoss;
    }
    return Object.freeze({
      released: cleanup.released,
      error: cleanup.error,
    });
  }

  private initializeResult(): PatchMapInitializeResult {
    const lifecycle = this.lifecycle === 'scene-ready' ? 'scene-ready' : 'ready-empty';
    return Object.freeze({
      lifecycle,
      instanceId: this.instanceId ?? '',
      revisions: this.revisionStamp(),
      facilities: FACILITIES,
    });
  }

  private revisionStamp(): PatchMapRevisionStamp {
    return this.publication.revisionStamp();
  }

  private correlateGeometryRevision(surfaceRevision: number | null): Readonly<{
    readonly revision: number | null;
    readonly surfaceRevision: number | null;
    readonly representedRevisions: PatchMapGeometryRevisionTuple | null;
    readonly revisionLags: PatchMapGeometryRevisionTuple | null;
  }> {
    return this.publication.correlateGeometryRevision(surfaceRevision);
  }

  private restoreAuthoritativeSurfaceScene(
    surface: PatchMapEngineSurface,
    operation: string,
  ): void {
    if (
      this.lifecycle === 'destroyed' ||
      this.lifecycle === 'destroying' ||
      this.surface !== surface
    ) {
      return;
    }
    try {
      surface.load(this.materialized?.dataset ?? EMPTY_MATERIALIZED_DATASET.dataset);
      surface.select(this.logicalSelectionIds);
      this.pointerInteractions.syncSelectionVisualPolicy();
    } catch (cause) {
      const terminal = this.operationError(
        'INTERNAL_FAILURE',
        'INTERNAL_FAILURE',
        operation,
        false,
      );
      terminal.cause = cause;
      this.handleSurfaceTerminalFailure(terminal);
      throw terminal;
    }
  }

  private acceptSurfacePointerInput(
    surface: PatchMapEngineSurface,
    input: PatchMapSurfacePointerInput,
  ): void {
    if (
      this.surface !== surface ||
      this.terminalSurfaceFailure !== null ||
      this.lifecycle === 'destroyed' ||
      this.lifecycle === 'destroying'
    ) {
      return;
    }
    this.dispatchPointerInput(input);
  }

  private acceptSurfaceContextMenuInput(
    surface: PatchMapEngineSurface,
    input: PatchMapSurfaceContextMenuInput,
  ): boolean {
    if (
      this.surface !== surface ||
      this.terminalSurfaceFailure !== null ||
      this.lifecycle === 'destroyed' ||
      this.lifecycle === 'destroying'
    ) {
      return false;
    }
    return this.dispatchPointerContextMenu(input);
  }

  private requireSurface(operation: string): PatchMapEngineSurface {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      throw this.operationError('DESTROYED', 'DESTROYED', operation, false);
    }
    if (this.terminalSurfaceFailure !== null) throw this.terminalSurfaceFailure;
    if (!this.surface) throw this.operationError('NOT_READY', 'NOT_READY', operation, true);
    return this.surface;
  }

  private assertAssetLifecycle(operation: string): void {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      throw this.operationError('DESTROYED', 'DESTROYED', operation, false);
    }
  }

  private isDestroyingOrDestroyed(): boolean {
    return this.lifecycle === 'destroying' || this.lifecycle === 'destroyed';
  }

  private ensureAssetSession(instanceId: string): PatchMapAssetSession {
    const session = this.assetSessions.ensureSession(instanceId, this.instanceId);
    if (session === null) {
      throw new PatchMapAssetError('CONFLICT', 'CONFLICT', false);
    }
    return session;
  }

  private assetInitializationError(error: unknown): PatchMapError {
    if (error instanceof PatchMapError) return error;
    return createPatchMapAssetInitializationError(error, this.revisionStamp());
  }

  private diagnosticFrom(error: unknown, operation: string): PatchMapEngineDiagnostic {
    if (error instanceof PatchMapError) return error.diagnostic;
    return createPatchMapDiagnosticFromError(error, operation, this.revisionStamp());
  }

  private rejectedGeometryPatchResult(
    target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
    failure: Readonly<{
      readonly status: 'rejected' | 'unsupported';
      readonly diagnostic: Readonly<{ readonly path: string }>;
    }>,
    operation: string,
  ): Extract<PatchMapEnginePatchResult, { readonly status: 'rejected' }> {
    const previousRevisions = this.revisionStamp();
    const diagnostic = this.operationDiagnostic(
      failure.status === 'unsupported' ? 'UNSUPPORTED_RUNTIME' : 'INVALID_VALUE',
      failure.status === 'unsupported' ? 'UNSUPPORTED_RUNTIME' : 'INVALID_INPUT',
      operation,
      true,
      failure.diagnostic.path,
    );
    const result = createPatchMapRejectedPatchResult(
      target,
      previousRevisions,
      this.revisionStamp(),
      this.materialized?.semanticHash ?? null,
      diagnostic,
    );
    this.emit('diagnostic', diagnostic);
    return result;
  }

  private subscriptionCount(): number {
    return this.events.listenerCount;
  }

  private operationError(
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
  ): PatchMapError {
    return createPatchMapOperationError(
      this.revisionStamp(),
      code,
      category,
      operation,
      recoverable,
    );
  }

  private operationDiagnostic(
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
    datasetPath?: string,
  ): PatchMapEngineDiagnostic {
    return createPatchMapOperationDiagnostic(
      this.revisionStamp(),
      code,
      category,
      operation,
      recoverable,
      datasetPath,
    );
  }

  private emit<K extends PatchMapEngineEvent>(event: K, value: PatchMapEngineEventMap[K]): void {
    if (event === 'diagnostic') {
      this.operations.reportDiagnostic(value as PatchMapEngineDiagnostic);
    } else {
      this.operations.noteAction(event);
    }
    if (
      event !== 'frame' &&
      event !== 'historyVisible' &&
      event !== 'overlayPublished' &&
      event !== 'diagnostic' &&
      event !== 'destroyed'
    ) {
      this.requestManagedFrameLoop();
    }
    this.deliverEngineEvent(event, value);
  }

  private requestManagedFrameLoop(): void {
    if (
      this.terminalSurfaceFailure !== null ||
      !this.managedFrameLoop.hasFrameLoop ||
      this.pageLifecycle.hidden
    ) {
      return;
    }
    this.managedFrameLoop.request();
  }

  private handleSurfaceTerminalFailure(error: Error): void {
    if (!this.surfaceLifecycle.recordTerminalFailure(error)) return;
    this.managedFrameLoop.destroy();
  }

  private deliverEngineEvent<K extends PatchMapEngineEvent>(
    event: K,
    value: PatchMapEngineEventMap[K],
  ): void {
    const callbackFailures: PatchMapSanitizedDiagnostic[] = [];
    this.events.deliver(event, value, (error) => {
        if (event === 'diagnostic') return;
        callbackFailures.push(this.operations.reportDiagnostic({
          code: 'HOST_CALLBACK_FAILURE',
          category: 'HOST_CALLBACK_FAILURE',
          operation: `event:${event}`,
          lifecycleGeneration: this.publication.lifecycleGeneration,
          sceneRevision: this.publication.sceneRevision,
          revisionStamp: this.revisionStamp(),
          recoverable: true,
          retryable: false,
          details: error,
        }));
    });
    for (const failure of callbackFailures) {
      this.events.deliver(
        'diagnostic',
        failure as PatchMapSanitizedDiagnostic & PatchMapEngineDiagnostic,
        () => undefined,
      );
    }
  }
}

function rejectedReasons(
  settlements: readonly PromiseSettledResult<unknown>[],
): unknown[] {
  const reasons: unknown[] = [];
  for (const settlement of settlements) {
    if (settlement.status === 'rejected') reasons.push(settlement.reason as unknown);
  }
  return reasons;
}

export type { PatchMapComponentVisualTarget } from '../core/contracts';

function enginePerformanceNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
