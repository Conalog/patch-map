import {
  type PatchMapComponentVisualTarget,
  type PatchMapDirectBarHeightUpdate,
  type PatchMapPresentationLifecycleResult,
  type PatchMapTextProductProbe,
  type PatchMapTextTarget,
  normalizePatchMapTextTarget,
} from './core/contracts';
import {
  PatchMapFrameLoop,
  type PatchMapFrameLoopOptions,
} from './scheduler';
import type {
  PatchMapPresentationPolicyInput,
  PatchMapPresentationPolicyProductProbe,
} from './presentation-policy';
import {
  PATCH_MAP_VIEWPORT_REVISION,
  patchMapBoundsCenter,
  patchMapViewportFitScale,
  normalizePatchMapViewportPadding,
  resolvePatchMapViewportContributors,
  type PatchMapViewportContributorResult,
  type PatchMapViewportGeometry,
} from './viewport';
import type { SlotRange } from './dense/contracts';
import type {
  PatchMapComponentRenderRole,
} from './contracts';
import type {
  PatchMapPixiRendererLossProbe,
  PatchMapRenderLaneRole,
} from './renderers/types';
import { PatchMapPixiRuntimeError } from './renderers/pixi-renderer';
import type { PatchMapSceneImageRetryResult } from './scene-images';
import {
  PATCH_MAP_ASSET_RUNTIME,
  PATCH_MAP_BUILTIN_ASSETS,
  PatchMapAssetError,
  type PatchMapAssetAcquisition,
  type PatchMapAssetPolicy,
  type PatchMapAssetRegistration,
  type PatchMapAssetRegistrationResult,
  type PatchMapAssetRuntime,
  type PatchMapAssetRuntimeProbe,
  type PatchMapAssetSession,
  type PatchMapAssetSessionProbe,
} from './assets';
import {
  PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
  PatchMapHostAssetIngestionAuthority,
  type PatchMapHostAssetIngestionInput,
  type PatchMapHostAssetIngestionProbe,
} from './host-asset-ingestion';
import {
  PATCH_MAP_EDITOR_MUTATION_KINDS,
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
  PatchMapEditorWorkflowAuthority,
  planPatchMapEditorMatrixMutation,
  type PatchMapEditorMutationKind,
  type PatchMapEditorWorkflowAction,
  type PatchMapEditorWorkflowProbe,
} from './editor-workflow';
import {
  PATCH_MAP_PAGE_LIFECYCLE_REVISION,
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
} from './accessibility';
import {
  PatchMapDatasetError,
  materializePatchMapDataset,
  ownedPatchMapElementIds,
  ownedPatchMapExactPatchIndices,
  ownedPatchMapMaterialization,
  ownedPatchMapPreviewPatchIndices,
  releasePatchMapSemanticHashScratch,
  validatePatchMapDatasetReferences,
  type MaterializedPatchMapDataset,
  type PatchMapComponent,
  type NormalizedPatchMapElement,
} from './semantic/dataset';
import {
  createPatchMapSemanticProbe,
  type PatchMapSemanticProductProbe,
  type PatchMapSemanticTarget,
} from './semantic/probe';
import {
  applyPatchMapSemanticPatch,
  removePatchMapSemanticTarget,
  type PatchMapSemanticMutationDiagnostic,
} from './semantic/mutation';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  detachPatchMapMutationJsonValue,
  planPatchMapBarHeightBatch,
  planPatchMapBulkPatch,
  planPatchMapMutationTransaction,
  planPatchMapPreviewMutationTransaction,
  planPatchMapTextBatch,
  promotePatchMapPreviewMutationTransaction,
  type PatchMapBarHeightBatchRequest,
  type PatchMapBulkPatchRequest,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapPlannedBarHeightUpdate,
  type PatchMapTextBatchRequest,
  type PatchMapMutationTarget,
  type PatchMapMutationTransactionDiagnostic,
  type PatchMapMutationTransactionPlan,
  type PatchMapMutationTransactionRequest,
} from './semantic/transaction';
import {
  applyPatchMapRelativeGeometryUpdate,
  resizePatchMapGeometryAroundOrigin,
  type PatchMapRelativeGeometryChanges,
  type PatchMapVisibleCenterResize,
} from './semantic/geometry-update';
import type { PatchMapScreenRegionBounds } from './semantic/screen-region-index';
import type {
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitOptions,
  PatchMapSurfaceGeometrySnapshot,
} from './engine/surface-contract';
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
} from './engine/surface-contract';
import type {
  PatchMapEngineSceneImagesProbe,
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapInteractionOwnershipProbe,
  PatchMapSurfaceDebug,
  PatchMapSurfaceOptions,
  PatchMapSurfacePointerInput,
  PatchMapSurfaceReconcileResult,
  PatchMapSurfaceViewportInput,
} from './engine/contracts';
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
} from './engine/contracts';
import { createPixiSurface } from './engine/pixi-surface';
export { PixiEngineSurface } from './engine/pixi-surface';
export {
  buildPatchMapRelationHitIndex,
  createPatchMapSurfaceGeometrySnapshot,
  createPatchMapSurfaceWorldGeometrySnapshot,
  hitTestPatchMapSurfaceRelations,
  queryPatchMapRelationHitIndex,
} from './engine/surface-geometry';
import {
  cloneDetachedEngineRecord,
  componentSemanticKey,
  engineTextTargetKey,
  indexComponentSemantics,
  indexTextSemantics,
  ownedStructuralRootDelta,
  reconcileDirectBarHeightComponentSemantics,
  reconcileFlatComponentSemantics,
  reconcileFlatTextSemantics,
  reconcilePlannedBarHeightComponentSemantics,
  reconcileStructuralComponentSemantics,
  reconcileStructuralTextSemantics,
  type IndexedEngineTextSemantic,
  type PatchMapEngineComponentSemanticProbe,
  type PatchMapOwnedStructuralRootDelta,
} from './engine/semantic-index';
import {
  PatchMapViewportAuthority,
  type PatchMapViewportViewEffect,
} from './engine/viewport-authority';
import {
  PatchMapTransformerEditAuthority,
  type PatchMapTransformerEditSession,
} from './engine/transformer-edit-authority';
export type {
  PatchMapEngineComponentSemanticProbe,
  PatchMapEngineTextSemanticProbe,
} from './engine/semantic-index';
import type {
  PatchMapAggregateRenderOwnerProbe,
  PatchMapCommandTargetStatusResult,
  PatchMapDatasetSubmission,
  PatchMapDatasetSubmissionResult,
  PatchMapDiagnosticCategory,
  PatchMapEngineAuthoringResult,
  PatchMapEngineBarPresentationProbe,
  PatchMapEngineCanvasHandle,
  PatchMapEngineComponentVisualProbe,
  PatchMapEngineDestroyTargetResult,
  PatchMapEngineDiagnostic,
  PatchMapEngineDocumentVisibilityInput,
  PatchMapEngineDocumentVisibilityResult,
  PatchMapEngineEditorMutationMatrixInput,
  PatchMapEngineEditorMutationMatrixResult,
  PatchMapEngineEditorWorkflowResult,
  PatchMapEngineExtractionRequest,
  PatchMapEngineExtractionResult,
  PatchMapEngineGeometryProbe,
  PatchMapEngineHistoryCapacityResult,
  PatchMapEngineHistoryClearResult,
  PatchMapEngineHistoryCompanionState,
  PatchMapEngineHistoryRestoredEvent,
  PatchMapEngineHistoryResult,
  PatchMapEngineHistoryVisibleEvent,
  PatchMapEngineHostAssetIngestionResult,
  PatchMapEngineLoadResult,
  PatchMapEnginePageLifecycleProbe,
  PatchMapEnginePageLifecycleWorkInput,
  PatchMapEnginePaintOrderProbe,
  PatchMapEnginePatchResult,
  PatchMapEnginePixiPublicSurfaceProbe,
  PatchMapEnginePointSelectionResult,
  PatchMapEnginePointerInput,
  PatchMapEnginePrepareResult,
  PatchMapEnginePresentationResult,
  PatchMapEngineQueryResult,
  PatchMapEngineQueryReuseResult,
  PatchMapEngineRegionSelectionOptions,
  PatchMapEngineRegionSelectionResult,
  PatchMapEngineRelationEndpointSelectionResult,
  PatchMapEngineRelationProbe,
  PatchMapEngineRendererLossProbe,
  PatchMapEngineSelectionHit,
  PatchMapEngineSemanticRefreshResult,
  PatchMapEngineSnapshot,
  PatchMapEngineTextProbe,
  PatchMapEngineTextPublicationStatus,
  PatchMapEngineTextRevisionTuple,
  PatchMapEngineTransactionHistory,
  PatchMapEngineTransactionPerformanceProbe,
  PatchMapEngineTransactionResult,
  PatchMapEngineTransformerCancelResult,
  PatchMapEngineTransformerCompletionResult,
  PatchMapEngineTransformerEdgePanResult,
  PatchMapEngineTransformerEditOptions,
  PatchMapEngineTransformerEditResult,
  PatchMapEngineTransformerPreviewResult,
  PatchMapEngineTransformerSessionBeginInput,
  PatchMapEngineTransformerSessionProbe,
  PatchMapExternalDependencyResult,
  PatchMapExternalSelectionResult,
  PatchMapGeometryRevisionTuple,
  PatchMapHistoryShortcutInput,
  PatchMapHistoryShortcutResult,
  PatchMapHostLifecycleRebindResult,
  PatchMapInitializeOptions,
  PatchMapInitializeResult,
  PatchMapLifecycle,
  PatchMapLiveOverlayInput,
  PatchMapLiveOverlayProbe,
  PatchMapLiveOverlayPublishedTuple,
  PatchMapLiveOverlayResult,
  PatchMapLiveOverlayTuple,
  PatchMapLoadOptions,
  PatchMapOptions,
  PatchMapPublishedTuple,
  PatchMapResolvedTargetSnapshot,
  PatchMapRevisionStamp,
  PatchMapSemanticRefreshInput,
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
} from './engine/public-contracts';
export type * from './engine/public-contracts';
import type { PatchMapReconcileDiagnostic } from './semantic/reconcile';
import { PatchMapPresentationError } from './presentation';
import {
  PatchMapSemanticHistory,
  type PatchMapHistoryDirection,
  type PatchMapHistoryInspection,
  type PatchMapHistoryPreparedRecord,
  type PatchMapHistoryState,
  type PatchMapHistoryTransition,
  type PatchMapSemanticHistorySnapshotInput,
} from './history';
import {
  PATCH_MAP_QUERY_SELECTION_REVISION,
  PatchMapLogicalSceneIndex,
  applyPatchMapSelectionOperation,
  patchMapLogicalTargetKey,
  type PatchMapLogicalTargetSnapshot,
  type PatchMapQueryReuseOperation,
  type PatchMapSceneQuery,
  type PatchMapSelectionChange,
  type PatchMapSelectionEligibilityOptions,
  type PatchMapSelectionHitOptions,
  type PatchMapSelectionInteraction,
  type PatchMapSelectionInteractionOptions,
  type PatchMapSelectionSetOperation,
} from './query-selection';
import {
  PATCH_MAP_POINTER_GESTURE_REVISION,
  PatchMapPointerGestureAuthority,
  hitPatchMapBoxRegion,
  hitPatchMapPaintRegion,
  type PatchMapGestureCancelReason,
  type PatchMapGestureTerminationReason,
  type PatchMapOwnedGestureKind,
  type PatchMapOwnedGestureTermination,
  type PatchMapPointerDispatchResult,
  type PatchMapPointerGestureProbe,
  type PatchMapRegionHitResult,
  type PatchMapSemanticPointerEvent,
} from './pointer-gesture';
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
  type PatchMapInteractionMode,
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
} from './host-interaction';
import {
  PatchMapTransformerGestureAuthority,
  createPatchMapSelectionVisualProbe,
  createPatchMapTransformerHandleProbe,
  evaluatePatchMapTransformableSubset,
  hitPatchMapTransformerHandle,
  resolvePatchMapRelationEndpoints,
  type PatchMapSelectionVisualOptions,
  type PatchMapSelectionVisualProbe,
  type PatchMapTransformableSubsetProbe,
  type PatchMapTransformerGestureProbe,
  type PatchMapTransformerHandle,
  type PatchMapTransformerHandleProbe,
  type PatchMapTransformerInputFamily,
} from './selection-transformer';
import {
  PATCH_MAP_TRANSFORMER_EDIT_REVISION,
  planPatchMapTransformerEdit,
  resolvePatchMapEdgeAutoPan,
  resolvePatchMapRotationSnap,
  type PatchMapRotationSnapResult,
  type PatchMapTransformerEditKind,
  type PatchMapTransformerEditRequest,
} from './transformer-edit';
import {
  PATCH_MAP_AUTHORING_REVISION,
  planPatchMapAuthoringAction,
} from './authoring';
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
} from './operations';

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
  readonly overlayAccepted: PatchMapLiveOverlayTuple;
  readonly overlayPublished: PatchMapLiveOverlayPublishedTuple;
  readonly semanticRefreshed: Extract<
    PatchMapEngineSemanticRefreshResult,
    { readonly status: 'committed' }
  >;
  readonly pointerEvent: PatchMapSemanticPointerEvent;
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
  'transform',
  'select',
] as const satisfies readonly PatchMapQueryReuseOperation[]);
const FACILITIES = Object.freeze([
  'renderer',
  'viewport',
  'world',
  'state',
  'history',
  'resize',
  'assets',
] as const);

interface PatchMapResolvedTargetAuthority {
  readonly target: PatchMapMutationTarget;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
}

interface PatchMapQueryResultAuthority {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
}

type PatchMapEngineHistoryCompanion = PatchMapEngineHistoryCompanionState;
type PatchMapEngineHistoryTransition = PatchMapHistoryTransition<
  readonly NormalizedPatchMapElement[],
  PatchMapEngineHistoryCompanion
>;

interface PreparedPatchMapEngineLoad {
  readonly materialized: MaterializedPatchMapDataset;
  readonly componentSemantics: Map<string, PatchMapEngineComponentSemanticProbe>;
  readonly textSemantics: Map<string, IndexedEngineTextSemantic>;
}

export class PatchMap {
  private readonly surfaceFactory: PatchMapEngineSurfaceFactory;
  private readonly assetRuntime: PatchMapAssetRuntime;
  private readonly assetPolicy: PatchMapAssetPolicy | undefined;
  private readonly operations: PatchMapOperationsAuthority;
  private readonly extractionSecurity: PatchMapExtractionSecurityAuthority;
  private readonly history: PatchMapSemanticHistory<
    readonly NormalizedPatchMapElement[],
    PatchMapEngineHistoryCompanion
  >;
  private readonly hostInteractions: PatchMapHostInteractionAuthority;
  private readonly hostAssetIngestion = new PatchMapHostAssetIngestionAuthority();
  private readonly editorWorkflows = new PatchMapEditorWorkflowAuthority();
  private readonly pageLifecycle = new PatchMapPageLifecycleAuthority();
  private readonly accessibility = new PatchMapAccessibilityAuthority();
  private readonly transformerGestures = new PatchMapTransformerGestureAuthority();
  private readonly transformerEdits = new PatchMapTransformerEditAuthority();
  private readonly viewportAuthority = new PatchMapViewportAuthority();
  private pendingTransactionPlanMs = 0;
  private lastTransactionPerformance: PatchMapEngineTransactionPerformanceProbe | null = null;
  private readonly listeners = new Map<PatchMapEngineEvent, Set<(event: unknown) => void>>();
  private lifecycle: PatchMapLifecycle = 'new';
  private surface: PatchMapEngineSurface | null = null;
  private frameLoop: PatchMapFrameLoop | null = null;
  private frameLoopPausedForVisibility = false;
  private frameClockMs = 0;
  private retainedCleanupSurface: PatchMapEngineSurface | null = null;
  private authoritativeCanvas: HTMLCanvasElement | null = null;
  private terminalRendererLossProbe: PatchMapPixiRendererLossProbe | null = null;
  private initializePromise: Promise<PatchMapInitializeResult> | null = null;
  private instanceId: string | null = null;
  private materialized: MaterializedPatchMapDataset | null = null;
  private readonly resolvedTargetAuthorities = new WeakMap<
    PatchMapResolvedTargetSnapshot,
    PatchMapResolvedTargetAuthority
  >();
  private readonly queryResultAuthorities = new WeakMap<
    PatchMapEngineQueryResult,
    PatchMapQueryResultAuthority
  >();
  private readonly commandTargetAuthorities = new WeakMap<
    PatchMapCommandTargetState,
    Readonly<{
      readonly lifecycleGeneration: number;
      readonly targetIds: readonly string[];
    }>
  >();
  private logicalSceneIndexCache: Readonly<{
    readonly materialized: MaterializedPatchMapDataset;
    readonly index: PatchMapLogicalSceneIndex;
  }> | null = null;
  private defaultViewportContributorsCache: Readonly<{
    readonly dataset: readonly NormalizedPatchMapElement[];
    readonly geometry: PatchMapViewportGeometry;
    readonly result: PatchMapViewportContributorResult;
  }> | null = null;
  private readonly logicalSceneIndexesByMaterialized =
    new WeakMap<MaterializedPatchMapDataset, PatchMapLogicalSceneIndex>();
  private readonly logicalSelectionIndexesByMaterialized =
    new WeakMap<MaterializedPatchMapDataset, PatchMapLogicalSceneIndex>();
  private componentSemantics = new Map<string, PatchMapEngineComponentSemanticProbe>();
  private textSemantics = new Map<string, IndexedEngineTextSemantic>();
  private logicalSelectionIds: readonly string[] = Object.freeze([]);
  private historyHostCompanion: PatchMapMutationJsonValue | null = null;
  private pendingHistoryPublications: readonly Readonly<{
    readonly direction: PatchMapHistoryDirection;
    readonly sceneRevision: number;
  }>[] = Object.freeze([]);
  private datasetRef: string | null = null;
  private lifecycleGeneration = 0;
  private targetLifecycleGeneration = 0;
  private sceneRevision = 0;
  private viewRevision = 0;
  private interactionRevision = 0;
  private frameRevision = 0;
  private publishedTuple: PatchMapPublishedTuple = Object.freeze({ scene: 0, view: 0, interaction: 0 });
  private geometryRevisionCorrelation: Readonly<{
    readonly surfaceRevision: number;
    readonly representedRevisions: PatchMapGeometryRevisionTuple;
  }> | null = null;
  private rendererConfiguration: Readonly<{
    resolution: number;
    antialias: boolean;
    background: string;
    backend: 'webgl' | 'webgpu';
  }> | null = null;
  private submissionSequence = 0;
  private loadSequence = 0;
  private pendingWork = 0;
  private latestOverlayAccepted: PatchMapLiveOverlayTuple | null = null;
  private latestOverlayPublished: PatchMapLiveOverlayPublishedTuple | null = null;
  private pendingOverlayPublication: PatchMapLiveOverlayTuple | null = null;
  private overlayAcceptedCount = 0;
  private overlayPublicationCount = 0;
  private readonly externalDependencyRevisions = new Map<string, string>();
  private surfaceViewportInputUnbind: (() => void) | null = null;
  private surfacePointerInputUnbind: (() => void) | null = null;
  private surfaceAccessibilityActivationUnbind: (() => void) | null = null;
  private pointerGestureAuthority: PatchMapPointerGestureAuthority | null = null;
  private assetSession: PatchMapAssetSession | null = null;
  private requiredAssetAcquisitions: PatchMapAssetAcquisition[] = [];

  public constructor(options: PatchMapOptions = {}) {
    this.surfaceFactory = options.surfaceFactory ?? createPixiSurface;
    this.assetRuntime = options.assetRuntime ?? PATCH_MAP_ASSET_RUNTIME;
    this.assetPolicy = options.assetPolicy;
    this.operations = options.operations ?? new PatchMapOperationsAuthority();
    this.extractionSecurity = options.extractionSecurity
      ?? new PatchMapExtractionSecurityAuthority();
    this.history = new PatchMapSemanticHistory({
      ...(options.historyLimit === undefined ? {} : { capacity: options.historyLimit }),
    });
    this.hostInteractions = new PatchMapHostInteractionAuthority({
      queryTargets: (query) => {
        const evaluated = this.logicalSceneIndex().query(query);
        return evaluated.status === 'rejected' ? Object.freeze([]) : evaluated.targets;
      },
    });
  }

  public on<K extends PatchMapEngineEvent>(event: K, listener: PatchMapEngineListener<K>): () => void {
    const listeners = this.listeners.get(event) ?? new Set<(event: unknown) => void>();
    listeners.add(listener as (event: unknown) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as (event: unknown) => void);
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
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
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
    if (!this.assetSession) {
      return Promise.reject(this.operationError('NOT_READY', 'NOT_READY', 'acquireAsset', true));
    }
    return this.assetSession.acquire(alias);
  }

  public assetProbe(alias?: string): Readonly<{
    session: PatchMapAssetSessionProbe | null;
    runtime: PatchMapAssetRuntimeProbe;
  }> {
    return Object.freeze({
      session: this.assetSession?.probe() ?? null,
      runtime: this.assetRuntime.probe(alias),
    });
  }

  /** O(1) frame-loop seam shared by browser hosts and the PatchMap Labs. */
  public get activeAnimations(): number {
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
    return this.frameRevision;
  }

  /** O(1) source workload shared with the package frame-loop policy. */
  public get frameWorkloadSize(): number {
    return this.surface?.frameLoopWorkloadSize?.()
      ?? this.materialized?.rootIds.length
      ?? 0;
  }

  /** Current monotonic product presentation clock for late frame-loop ownership. */
  public get frameTimeMs(): number {
    return this.frameClockMs;
  }

  /** Product-owned pointer/motion state; Lab hosts do not mirror it. */
  public get viewportGestureActive(): boolean {
    if (this.viewportAuthority.motionActive) return true;
    if (this.surface?.viewportGestureActive?.() === true) return true;
    return (this.pointerGestureAuthority?.probe().activeGestureCount ?? 0) > 0;
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
    if (this.frameLoop !== null && !this.frameLoop.isDestroyed) {
      throw this.operationError('CONFLICT', 'CONFLICT', 'createFrameLoop', false);
    }
    this.frameLoop = new PatchMapFrameLoop(this, options);
    if (this.pageLifecycle.probe().state === 'hidden') {
      this.frameLoop.pause();
      this.frameLoopPausedForVisibility = true;
    }
    return this.frameLoop;
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
      assetSession,
      requestFrame: () => this.requestManagedFrameLoop(),
      ...(options.target ? { target: options.target } : {}),
      ...(options.canvas ? { canvas: options.canvas } : {}),
    };
    this.viewportAuthority.initialize({
      width: surfaceOptions.width,
      height: surfaceOptions.height,
      pixelRatio: surfaceOptions.pixelRatio,
      zoomLimits: options.zoomLimits ?? DEFAULT_ZOOM_LIMITS,
      viewRevision: this.viewRevision,
    });
    const requiredAliases = options.requiredAssets?.map(({ alias }) => alias) ?? [];
    this.initializePromise = (async (): Promise<PatchMapInitializeResult> => {
      const attemptAcquisitions: PatchMapAssetAcquisition[] = [];
      let pendingSurface: PatchMapEngineSurface | null = null;
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
        pendingSurface = await this.surfaceFactory(surfaceOptions);
        pendingSurface.setViewportGesturePolicies?.(
          this.viewportAuthority.orderedEnabledPolicies(),
        );
        pendingSurface.setViewportZoomLimits?.(
          this.viewportAuthority.snapshot().zoomLimits,
        );
        if (this.isDestroyingOrDestroyed()) {
          this.retainedCleanupSurface = pendingSurface;
          pendingSurface = null;
          throw this.operationError('DESTROYED', 'DESTROYED', 'initialize', false);
        }
        const readySurface = pendingSurface;
        const viewportInputUnbind = readySurface.bindViewportInput?.((input) => {
          this.acceptSurfaceViewportInput(readySurface, input);
        }) ?? null;
        const pointerAuthority = new PatchMapPointerGestureAuthority({
          hitTest: (point) => readySurface.hitTestScreen(point),
        });
        const pointerInputUnbind = readySurface.bindPointerInput?.((input) => {
          this.acceptSurfacePointerInput(readySurface, input);
        }) ?? null;
        const accessibilityActivationUnbind =
          readySurface.bindAccessibilityActivation?.((targetId, input) => {
            if (this.surface !== readySurface || this.isDestroyingOrDestroyed()) {
              return;
            }
            this.activateAccessibilityTarget(targetId, input);
          }) ?? null;
        this.surface = readySurface;
        this.authoritativeCanvas = readySurface.canvasElement?.() ?? null;
        this.surfaceViewportInputUnbind = viewportInputUnbind;
        this.surfacePointerInputUnbind = pointerInputUnbind;
        this.surfaceAccessibilityActivationUnbind =
          accessibilityActivationUnbind;
        this.pointerGestureAuthority = pointerAuthority;
        this.geometryRevisionCorrelation = null;
        pendingSurface = null;
        this.requiredAssetAcquisitions.push(...attemptAcquisitions);
        this.lifecycleGeneration += 1;
        this.lifecycle = this.materialized?.rootIds.length ? 'scene-ready' : 'ready-empty';
        const result = this.initializeResult();
        this.emit('ready', result);
        return result;
      } catch (error) {
        const cleanupFailures: unknown[] = [];
        if (pendingSurface) {
          const cleanup = await this.cleanupSurface(pendingSurface);
          if (cleanup.error) cleanupFailures.push(cleanup.error);
        }
        const acquisitionSettlements = await Promise.allSettled(
          attemptAcquisitions.map(async (acquisition) => acquisition.release()),
        );
        cleanupFailures.push(...rejectedReasons(acquisitionSettlements));
        this.surface = null;
        this.authoritativeCanvas = null;
        this.initializePromise = null;
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
    return this.initializePromise;
  }

  public loadDataset(input: unknown, options: PatchMapLoadOptions = {}): PatchMapEngineLoadResult {
    const surface = this.requireSurface('loadDataset');
    const prepared = this.prepareDatasetLoad(input, options);
    return this.publishPreparedDatasetLoad(surface, prepared, options);
  }

  /**
   * Synchronize aggregate resources and ask PixiJS PrepareSystem to upload
   * them without publishing a visible frame. Legacy injected surfaces report
   * explicit unsupported status instead of fabricated upload timing.
   */
  public async prepareScene(): Promise<PatchMapEnginePrepareResult> {
    const surface = this.requireSurface('prepareScene');
    const revisions = this.revisionStamp();
    const publishedTuple = this.publishedTuple;
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

  private publishPreparedDatasetLoad(
    surface: PatchMapEngineSurface,
    prepared: PreparedPatchMapEngineLoad,
    options: PatchMapLoadOptions,
  ): PatchMapEngineLoadResult {
    this.cancelActiveTransformerEdit('replace', true);
    this.loadSequence += 1;
    surface.load(prepared.materialized.dataset);
    this.pointerGestureAuthority?.interrupt('replace');
    this.transformerGestures.interrupt();
    return this.commitPreparedDatasetLoad(prepared, options);
  }

  public async loadDatasetAsync(
    input: unknown,
    options: PatchMapLoadOptions = {},
  ): Promise<PatchMapEngineLoadResult> {
    const surface = this.requireSurface('loadDatasetAsync');
    this.cancelActiveTransformerEdit('replace', true);
    const sequence = ++this.loadSequence;
    const lifecycleGeneration = this.lifecycleGeneration;
    const sceneRevision = this.sceneRevision;
    this.pendingWork += 1;
    try {
      const materialized = materializePatchMapDataset(input);
      this.validateStrictDatasetLoad(materialized, options);
      await yieldPatchMapEngineTask();
      this.assertCooperativeLoadCurrent(
        surface,
        sequence,
        lifecycleGeneration,
        sceneRevision,
      );
      const componentSemantics = indexComponentSemantics(materialized.dataset);
      await yieldPatchMapEngineTask();
      this.assertCooperativeLoadCurrent(
        surface,
        sequence,
        lifecycleGeneration,
        sceneRevision,
      );
      const textSemantics = indexTextSemantics(materialized.dataset);
      const prepared = Object.freeze({
        materialized,
        componentSemantics,
        textSemantics,
      });
      await yieldPatchMapEngineTask();
      this.assertCooperativeLoadCurrent(
        surface,
        sequence,
        lifecycleGeneration,
        sceneRevision,
      );
      const assertCurrent = (): void => {
        this.assertCooperativeLoadCurrent(
          surface,
          sequence,
          lifecycleGeneration,
          sceneRevision,
        );
      };
      if (surface.loadAsync) await surface.loadAsync(materialized.dataset, assertCurrent);
      else surface.load(materialized.dataset);
      assertCurrent();
      this.pointerGestureAuthority?.interrupt('replace');
      this.transformerGestures.interrupt();
      return this.commitPreparedDatasetLoad(prepared, options);
    } finally {
      this.pendingWork -= 1;
    }
  }

  private prepareDatasetLoad(
    input: unknown,
    options: PatchMapLoadOptions = {},
  ): PreparedPatchMapEngineLoad {
    const materialized = materializePatchMapDataset(input);
    this.validateStrictDatasetLoad(materialized, options);
    return Object.freeze({
      materialized,
      componentSemantics: indexComponentSemantics(materialized.dataset),
      textSemantics: indexTextSemantics(materialized.dataset),
    });
  }

  private validateStrictDatasetLoad(
    materialized: MaterializedPatchMapDataset,
    options: PatchMapLoadOptions,
  ): void {
    if (options.strict !== undefined && typeof options.strict !== 'boolean') {
      throw new PatchMapDatasetError(
        'INVALID_VALUE',
        '$.options.strict',
        'strict must be a boolean',
      );
    }
    if (options.strict === true) {
      validatePatchMapDatasetReferences(materialized.dataset);
    }
  }

  private commitPreparedDatasetLoad(
    prepared: PreparedPatchMapEngineLoad,
    options: PatchMapLoadOptions,
  ): PatchMapEngineLoadResult {
    const { componentSemantics, materialized, textSemantics } = prepared;
    const selectionBefore = this.logicalSelectionIds;
    const modeBefore = this.hostInteractions.modeProbe().activeState;
    this.logicalSelectionIds = Object.freeze([]);
    this.historyHostCompanion = null;
    if (modeBefore !== 'select') {
      this.hostInteractions.applyModeOperation({ op: 'replace', state: 'select' });
    }
    if (selectionBefore.length > 0 || modeBefore !== 'select') this.interactionRevision += 1;
    this.hostInteractions.clearTooltip('redraw');
    this.hostInteractions.clearLogicalBindings();
    this.accessibility.replaceScene();
    this.materialized = materialized;
    this.defaultViewportContributorsCache = null;
    this.logicalSceneIndexCache = null;
    this.targetLifecycleGeneration += 1;
    this.clearHistoryAuthority('replace');
    this.componentSemantics = componentSemantics;
    this.textSemantics = textSemantics;
    this.resetLiveOverlayState();
    this.datasetRef = options.datasetRef ?? null;
    this.sceneRevision += 1;
    this.lifecycle = materialized.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    this.editorWorkflows.onSceneReplaced();
    const result: PatchMapEngineLoadResult = Object.freeze({
      lifecycle: this.lifecycle,
      sceneRevision: this.sceneRevision,
      semanticHash: materialized.semanticHash,
      rootIds: materialized.rootIds,
    });
    this.emit('sceneCommitted', result);
    return result;
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
    this.cancelActiveTransformerEdit('redraw', true);
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.history.state();
    const planStarted = enginePerformanceNow();
    const plan = this.planMutationRequest(request, schemaRevision);
    this.pendingTransactionPlanMs = enginePerformanceNow() - planStarted;
    return this.applyPlannedTransaction(
      surface,
      plan,
      'transact',
      previousRevisions,
      previousHistory,
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
    this.cancelActiveTransformerEdit('redraw', true);
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.history.state();
    const planStarted = enginePerformanceNow();
    const plan = planPatchMapBarHeightBatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
    );
    this.pendingTransactionPlanMs = enginePerformanceNow() - planStarted;
    return this.applyPlannedTransaction(
      surface,
      plan,
      'transact',
      previousRevisions,
      previousHistory,
    );
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
    this.cancelActiveTransformerEdit('redraw', true);
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.history.state();
    const planStarted = enginePerformanceNow();
    const plan = planPatchMapTextBatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
    );
    this.pendingTransactionPlanMs = enginePerformanceNow() - planStarted;
    return this.applyPlannedTransaction(
      surface,
      plan,
      'transact',
      previousRevisions,
      previousHistory,
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
    this.cancelActiveTransformerEdit('redraw', true);
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.history.state();
    const planStarted = enginePerformanceNow();
    const plan = this.planBulkPatchRequest(request, schemaRevision);
    this.pendingTransactionPlanMs = enginePerformanceNow() - planStarted;
    return this.applyPlannedTransaction(
      surface,
      plan,
      'bulkPatch',
      previousRevisions,
      previousHistory,
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
        history: this.history.state(),
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
        history: this.history.state(),
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
        history: this.history.state(),
        selectionIds: Object.freeze([...this.logicalSelectionIds]),
        probe: this.editorWorkflows.probe(),
      });
    }

    if (plan.transaction === null) {
      if (plan.selectionIds !== undefined) this.select(plan.selectionIds);
      this.editorWorkflows.commit(plan);
      if (plan.closeHistoryGroup) this.history.closeActionGroup();
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
        history: this.history.state(),
        selectionIds: Object.freeze([...this.logicalSelectionIds]),
        probe: this.editorWorkflows.probe(),
      });
    }

    const transaction = this.transact(plan.transaction);
    const accepted = transaction.status === 'committed' || transaction.status === 'unchanged';
    if (accepted) {
      if (plan.selectionIds !== undefined) this.select(plan.selectionIds);
      this.editorWorkflows.commit(plan);
      if (plan.closeHistoryGroup) this.history.closeActionGroup();
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
   * Run the approved editor mutation taxonomy as twelve real, separately
   * reversible semantic transactions. This is deliberately not a synthetic
   * counter: every entry publishes through the current aggregate surface.
   */
  public runEditorMutationMatrix(
    input: PatchMapEngineEditorMutationMatrixInput,
  ): PatchMapEngineEditorMutationMatrixResult {
    this.requireSurface('runEditorMutationMatrix');
    const requested: readonly PatchMapEditorMutationKind[] = Object.freeze(
      input.mutationKinds.map((kind) => kind),
    );
    const valid =
      input.oneActionEach === true &&
      requested.length === PATCH_MAP_EDITOR_MUTATION_KINDS.length &&
      requested.every((kind, index) => kind === PATCH_MAP_EDITOR_MUTATION_KINDS[index]);
    if (!valid) {
      return Object.freeze({
        schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
        status: 'rejected',
        changed: false,
        code: 'INVALID_VALUE',
        requestedCount: requested.length,
        executedCount: 0,
        transactions: Object.freeze([]),
        history: this.history.state(),
        companionRestored: false,
      });
    }
    const companion = detachPatchMapMutationJsonValue(
      input.companion,
      '$.editorMutationMatrix.companion',
    );
    this.setHistoryCompanion(companion);
    const transactions: PatchMapEngineTransactionResult[] = [];
    for (const kind of requested) {
      const materialized = this.materialized;
      if (materialized === null) {
        return Object.freeze({
          schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
          status: 'rejected',
          changed: transactions.length > 0,
          code: 'INVALID_MUTATION',
          requestedCount: requested.length,
          executedCount: transactions.length,
          transactions: Object.freeze([...transactions]),
          history: this.history.state(),
          companionRestored: false,
        });
      }
      let request: PatchMapMutationTransactionRequest;
      try {
        request = planPatchMapEditorMatrixMutation(materialized, kind, companion);
      } catch {
        return Object.freeze({
          schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
          status: 'rejected',
          changed: transactions.length > 0,
          code: 'INVALID_MUTATION',
          requestedCount: requested.length,
          executedCount: transactions.length,
          transactions: Object.freeze([...transactions]),
          history: this.history.state(),
          companionRestored: false,
        });
      }
      const result = this.transact(request);
      transactions.push(result);
      if (result.status !== 'committed') {
        const code =
          result.status === 'rejected' || result.status === 'refused'
            ? result.diagnostic.code
            : 'INVALID_MUTATION';
        return Object.freeze({
          schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
          status: result.status === 'refused' ? 'refused' : 'rejected',
          changed: transactions.some((entry) => entry.changed),
          code,
          requestedCount: requested.length,
          executedCount: transactions.filter((entry) => entry.status === 'committed').length,
          transactions: Object.freeze([...transactions]),
          history: this.history.state(),
          companionRestored: false,
        });
      }
    }
    this.history.closeActionGroup();
    const currentCompanion = this.historyCompanionState().hostCompanion;
    return Object.freeze({
      schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
      status: 'committed',
      changed: true,
      code: null,
      requestedCount: requested.length,
      executedCount: transactions.length,
      transactions: Object.freeze([...transactions]),
      history: this.history.state(),
      companionRestored:
        JSON.stringify(currentCompanion) === JSON.stringify(companion),
    });
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

  private applyPlannedTransaction(
    surface: PatchMapEngineSurface,
    plan: PatchMapMutationTransactionPlan,
    operation: 'transact' | 'bulkPatch',
    previousRevisions: PatchMapRevisionStamp,
    previousHistory: PatchMapHistoryState,
  ): PatchMapEngineTransactionResult {
    const applyStarted = enginePerformanceNow();
    if (plan.status === 'rejected') {
      const diagnostic = this.engineTransactionDiagnostic(plan.diagnostic, operation);
      const result = this.rejectedTransactionResult(
        plan.actionId ?? null,
        previousRevisions,
        diagnostic,
        plan.diagnostic,
        previousHistory,
      );
      this.emit('diagnostic', diagnostic);
      return result;
    }

    const actionId = plan.actionId ?? null;
    if (plan.conflictPolicy !== 'reject') {
      const diagnostic = this.operationDiagnostic(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        operation,
        true,
      );
      const result = this.rejectedTransactionResult(
        actionId,
        previousRevisions,
        diagnostic,
        undefined,
        previousHistory,
      );
      this.emit('diagnostic', diagnostic);
      return result;
    }
    if (!plan.changed) {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        actionId,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: freezeMutationTargets(plan.applied),
        missing: freezeMutationTargets(plan.missing),
        unchanged: freezeMutationTargets(plan.unchanged),
        history: freezeTransactionHistory(false, null, previousHistory, previousHistory),
      } satisfies PatchMapEngineTransactionResult);
    }

    if (!surface.reconcile) {
      const diagnostic = this.operationDiagnostic(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        operation,
        false,
      );
      const result = this.refusedTransactionResult(
        actionId,
        previousRevisions,
        diagnostic,
        plan,
        previousHistory,
        EMPTY_RECONCILE_DIAGNOSTICS,
      );
      this.emit('diagnostic', diagnostic);
      return result;
    }

    const currentDataset =
      this.materialized?.dataset ?? EMPTY_MATERIALIZED_DATASET.dataset;
    const plannedBarHeightUpdates = plan.directBarHeightUpdates;
    const plannedTextUpdates = plan.directTextUpdates;
    const plannedElementAngleUpdates = plan.directElementAngleUpdates;
    const incrementalRootIds = plannedBarHeightUpdates !== undefined
      ? incrementalBarHeightRootIds(
          currentDataset,
          plan.candidate.dataset,
          plannedBarHeightUpdates,
        )
      : plannedTextUpdates !== undefined
        ? incrementalOwnedRootIds(currentDataset, plan.candidate.dataset)
        : plannedElementAngleUpdates !== undefined
          ? Object.freeze(plannedElementAngleUpdates.map(({ id }) => id))
          : incrementalFlatRootIds(
              currentDataset,
              plan.candidate.dataset,
              plan.operations,
            );
    const directSemanticProjection =
      plannedBarHeightUpdates !== undefined ||
      plannedTextUpdates !== undefined ||
      plannedElementAngleUpdates !== undefined;
    const elementGeometryOnly = operationsOnlyUpdateElementGeometry(plan.operations);
    const structuralSharing = !directSemanticProjection &&
      operationsMayChangeElementStructure(plan.operations);
    const structuralRootDelta = structuralSharing
      ? ownedStructuralRootDelta(currentDataset, plan.candidate.dataset)
      : null;
    const directBarComponentSemantics =
      plannedElementAngleUpdates !== undefined || elementGeometryOnly
      ? null
      : plannedBarHeightUpdates === undefined
      ? reconcileDirectBarHeightComponentSemantics(
          this.componentSemantics,
          plan.candidate.dataset,
          plan.operations,
        )
      : reconcilePlannedBarHeightComponentSemantics(
          this.componentSemantics,
          plan.candidate.dataset,
          plannedBarHeightUpdates,
        );
    const componentSemantics =
      plannedTextUpdates !== undefined ||
      plannedElementAngleUpdates !== undefined ||
      elementGeometryOnly
      ? this.componentSemantics
      : directBarComponentSemantics ??
        (incrementalRootIds === undefined
          ? structuralRootDelta === null
            ? indexComponentSemantics(plan.candidate.dataset)
            : reconcileStructuralComponentSemantics(
                this.componentSemantics,
                structuralRootDelta,
              )
          : reconcileFlatComponentSemantics(
              this.componentSemantics,
              currentDataset,
              plan.candidate.dataset,
              incrementalRootIds,
            ));
    const textSemantics =
      plannedElementAngleUpdates !== undefined || elementGeometryOnly
      ? this.textSemantics
      : plannedTextUpdates === undefined &&
      (
        directBarComponentSemantics !== null ||
        operationsOnlyUpdateBarSize(plan.operations, componentSemantics)
      )
        ? this.textSemantics
        : incrementalRootIds === undefined
          ? structuralRootDelta === null
            ? indexTextSemantics(plan.candidate.dataset)
            : reconcileStructuralTextSemantics(
                this.textSemantics,
                structuralRootDelta,
              )
          : reconcileFlatTextSemantics(
              this.textSemantics,
              currentDataset,
              plan.candidate.dataset,
              incrementalRootIds,
            );
    const selectionBefore = this.logicalSelectionIds;
    const modeBefore = this.hostInteractions.modeProbe().activeState;
    const requestedSelectionAfter = plan.selectionIds ??
      (!directSemanticProjection
        ? transactionSelectionAfter(selectionBefore, plan.operations)
        : selectionBefore);
    let companionAfter: PatchMapEngineHistoryCompanion;
    try {
      companionAfter = this.nextHistoryCompanion(
        plan.history,
        requestedSelectionAfter,
        plan.candidate,
        incrementalRootIds !== undefined,
        structuralRootDelta !== null,
      );
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, operation);
      const result = this.rejectedTransactionResult(
        actionId,
        previousRevisions,
        diagnostic,
        undefined,
        previousHistory,
      );
      this.emit('diagnostic', diagnostic);
      return result;
    }
    const selectionAfter = companionAfter.selectionIds;
    const commandId = actionId ?? `transaction:${this.sceneRevision + 1}`;
    let preparedHistory: PatchMapHistoryPreparedRecord | null = null;
    try {
      if (plan.recordHistory !== false) {
        preparedHistory = this.history.prepareOwnedChangedRecord({
          id: commandId,
          before: this.historySnapshot(),
          after: historySnapshotForDataset(plan.candidate.dataset, companionAfter),
        });
      }
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, operation);
      const result = this.rejectedTransactionResult(
        actionId,
        previousRevisions,
        diagnostic,
        undefined,
        previousHistory,
      );
      this.emit('diagnostic', diagnostic);
      return result;
    }

    const animatedBarTargets = plannedElementAngleUpdates !== undefined
      ? EMPTY_COMPONENT_VISUAL_TARGETS
      : plannedBarHeightUpdates ??
        directAnimatedBarTargets(plan.operations, componentSemantics);
    const directBarHeightUpdates = plannedElementAngleUpdates !== undefined
      ? undefined
      : plannedBarHeightUpdates ??
        directBarHeightUpdatesFor(plan.operations, componentSemantics);
    const allowedComponentOrderOwners =
      !directSemanticProjection
      ? componentOrderOwners(plan.operations)
      : EMPTY_HISTORY_ORDER_IDS;
    let reconcile: PatchMapSurfaceReconcileResult;
    const reconcileStarted = enginePerformanceNow();
    try {
      reconcile = surface.reconcile(plan.candidate.dataset, {
        animateBarChanges:
          !this.accessibility.reducedMotion &&
          animatedBarTargets.length > 0,
        animatedBarTargets,
        allowedComponentOrderOwners,
        ...(incrementalRootIds === undefined
          ? {}
          : { incrementalRootIds }),
        ...(structuralSharing ? { structuralSharing: true } : {}),
        ...(directBarHeightUpdates === undefined
          ? {}
          : { directBarHeightUpdates }),
        ...(plannedTextUpdates === undefined
          ? {}
          : { directTextUpdates: plannedTextUpdates }),
        ...(plannedElementAngleUpdates === undefined
          ? {}
          : { directElementAngleUpdates: plannedElementAngleUpdates }),
        ...(plan.allowedElementOrderIds === undefined
          ? {}
          : { allowedElementOrderIds: plan.allowedElementOrderIds }),
        ...(!sameStringArray(selectionBefore, selectionAfter)
          ? { selectionIds: selectionAfter }
          : {}),
      });
    } catch (error) {
      if (preparedHistory !== null) this.history.cancelPrepared(preparedHistory);
      const diagnostic = this.diagnosticFrom(error, operation);
      const result = this.refusedTransactionResult(
        actionId,
        previousRevisions,
        diagnostic,
        plan,
        previousHistory,
        EMPTY_RECONCILE_DIAGNOSTICS,
      );
      this.emit('diagnostic', diagnostic);
      return result;
    }
    const reconcileCompleted = enginePerformanceNow();

    const reconcileDiagnostics = freezeReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      if (preparedHistory !== null) this.history.cancelPrepared(preparedHistory);
      const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
      const diagnostic = this.operationDiagnostic(
        'CONFLICT',
        'CONFLICT',
        operation,
        true,
        datasetPath,
      );
      const result = this.refusedTransactionResult(
        actionId,
        previousRevisions,
        diagnostic,
        plan,
        previousHistory,
        reconcileDiagnostics,
      );
      this.emit('diagnostic', diagnostic);
      return result;
    }

    this.materialized = plan.candidate;
    this.defaultViewportContributorsCache = null;
    this.logicalSceneIndexCache = null;
    this.componentSemantics = componentSemantics;
    this.textSemantics = textSemantics;
    this.logicalSelectionIds = selectionAfter;
    this.historyHostCompanion = companionAfter.hostCompanion;
    this.hostInteractions.applyModeOperation({
      op: 'replace',
      state: companionAfter.mode,
    });
    this.sceneRevision += 1;
    this.lifecycle = plan.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    if (
      !sameStringArray(selectionBefore, selectionAfter) ||
      modeBefore !== companionAfter.mode ||
      plan.history !== undefined
    ) {
      this.interactionRevision += 1;
    }
    let historyRecorded = false;
    if (preparedHistory !== null) {
      const historyStatus = this.history.commitPrepared(preparedHistory);
      if (historyStatus === 'stale' || historyStatus === 'invalid' || historyStatus === 'cancelled') {
        throw new Error(`${operation} history preflight became ${historyStatus} after surface commit`);
      }
      historyRecorded = historyStatus === 'recorded';
    } else {
      this.history.closeActionGroup();
    }
    const currentHistory = this.history.state();
    const result = freezeCommittedTransactionResult(plan.candidate, {
      status: 'committed',
      changed: true,
      actionId,
      previousRevisions,
      revisions: this.revisionStamp(),
      applied: freezeMutationTargets(plan.applied),
      missing: freezeMutationTargets(plan.missing),
      unchanged: freezeMutationTargets(plan.unchanged),
      history: freezeTransactionHistory(
        historyRecorded,
        historyRecorded ? commandId : null,
        previousHistory,
        currentHistory,
      ),
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    });
    const completed = enginePerformanceNow();
    this.lastTransactionPerformance = Object.freeze({
      transactionPlanMs: this.pendingTransactionPlanMs,
      preReconcileMs: reconcileStarted - applyStarted,
      reconcileMs: reconcileCompleted - reconcileStarted,
      postReconcileMs: completed - reconcileCompleted,
      totalMs:
        this.pendingTransactionPlanMs +
        (completed - applyStarted),
      surfaceTimings: reconcile.timings ?? null,
    });
    this.pendingTransactionPlanMs = 0;
    this.emit('change', result);
    return result;
  }

  public transactionPerformanceProbe(): PatchMapEngineTransactionPerformanceProbe | null {
    return this.lastTransactionPerformance;
  }

  public relativePatch(
    targetInput: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
    changes: PatchMapRelativeGeometryChanges,
  ): PatchMapEnginePatchResult {
    this.requireSurface('relativePatch');
    const target = normalizeEngineMutationTarget(targetInput);
    if (target.kind !== 'element') throw new TypeError('relativePatch requires an element target');
    const current = this.materialized === null
      ? null
      : findEngineSemanticTarget(this.materialized.dataset, target);
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
    const current = this.materialized === null
      ? null
      : findEngineSemanticTarget(this.materialized.dataset, target);
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
    const surface = this.requireSurface('patch');
    this.cancelActiveTransformerEdit('redraw', true);
    const previousRevisions = this.revisionStamp();
    const mutation = applyPatchMapSemanticPatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      target,
      patch,
    );

    if (mutation.status === 'rejected') {
      const diagnostic = this.semanticMutationDiagnostic(mutation.diagnostic, mutation.target);
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: mutation.diagnostic.reason === 'missing-target' && mutation.target
          ? freezeTargets([mutation.target])
          : EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        mutationDiagnostic: mutation.diagnostic,
      } satisfies PatchMapEnginePatchResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    if (mutation.status === 'unchanged') {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: freezeTargets([mutation.target]),
      } satisfies PatchMapEnginePatchResult);
    }

    if (!surface.reconcile) {
      return this.refusedPatchResult(
        mutation.target,
        previousRevisions,
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        false,
        EMPTY_RECONCILE_DIAGNOSTICS,
      );
    }

    const currentDataset =
      this.materialized?.dataset ?? EMPTY_MATERIALIZED_DATASET.dataset;
    const incrementalRootIds = incrementalOwnedRootIds(
      currentDataset,
      mutation.candidate.dataset,
    );
    const componentSemantics = incrementalRootIds === undefined
      ? indexComponentSemantics(mutation.candidate.dataset)
      : reconcileFlatComponentSemantics(
          this.componentSemantics,
          currentDataset,
          mutation.candidate.dataset,
          incrementalRootIds,
        );
    const textSemantics = incrementalRootIds === undefined
      ? indexTextSemantics(mutation.candidate.dataset)
      : reconcileFlatTextSemantics(
          this.textSemantics,
          currentDataset,
          mutation.candidate.dataset,
          incrementalRootIds,
        );
    const selectionBefore = this.logicalSelectionIds;
    let preparedHistory: PatchMapHistoryPreparedRecord;
    try {
      preparedHistory = this.history.prepareOwnedChangedRecord({
        id: `patch:${this.sceneRevision + 1}:${semanticTargetIdentity(mutation.target)}`,
        before: this.historySnapshot(),
        after: historySnapshotForDataset(
          mutation.candidate.dataset,
          this.historyCompanionForSelection(selectionBefore),
        ),
      });
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'patch');
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
      } satisfies PatchMapEnginePatchResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }
    let reconcile: PatchMapSurfaceReconcileResult;
    try {
      reconcile = surface.reconcile(mutation.candidate.dataset, {
        animateBarChanges:
          !this.accessibility.reducedMotion &&
          mutation.target.kind === 'component',
        ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
      });
    } catch (error) {
      this.history.cancelPrepared(preparedHistory);
      const diagnostic = this.diagnosticFrom(error, 'patch');
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
      } satisfies PatchMapEnginePatchResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    const reconcileDiagnostics = freezeReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      this.history.cancelPrepared(preparedHistory);
      return this.refusedPatchResult(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        reconcileDiagnostics,
      );
    }

    this.materialized = mutation.candidate;
    this.defaultViewportContributorsCache = null;
    this.logicalSceneIndexCache = null;
    this.componentSemantics = componentSemantics;
    this.textSemantics = textSemantics;
    this.sceneRevision += 1;
    this.lifecycle = mutation.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    const historyStatus = this.history.commitPrepared(preparedHistory);
    if (historyStatus === 'stale' || historyStatus === 'invalid' || historyStatus === 'cancelled') {
      throw new Error(`patch history preflight became ${historyStatus} after surface commit`);
    }
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      target: mutation.target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: mutation.candidate.semanticHash,
      applied: freezeTargets([mutation.target]),
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    } satisfies PatchMapEnginePatchResult);
    this.emit('change', result);
    return result;
  }

  /**
   * Remove one stable logical element through the same incremental reconcile
   * authority as patch(). A missing reconcile seam or refused dense plan leaves
   * semantic authority, revisions, selection, and the current surface unchanged.
   */
  public destroyTarget(target: PatchMapSemanticTarget): PatchMapEngineDestroyTargetResult {
    const surface = this.requireSurface('destroyTarget');
    this.cancelActiveTransformerEdit('redraw', true);
    const previousRevisions = this.revisionStamp();
    const mutation = removePatchMapSemanticTarget(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      target,
    );

    if (mutation.status === 'rejected') {
      const diagnostic = this.semanticMutationDiagnostic(
        mutation.diagnostic,
        mutation.target,
        'destroyTarget',
      );
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: mutation.diagnostic.reason === 'missing-target' && mutation.target
          ? freezeTargets([mutation.target])
          : EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        mutationDiagnostic: mutation.diagnostic,
      } satisfies PatchMapEngineDestroyTargetResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    if (!surface.reconcile) {
      return this.refusedDestroyTargetResult(
        mutation.target,
        previousRevisions,
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        false,
        EMPTY_RECONCILE_DIAGNOSTICS,
      );
    }

    const structuralRootDelta = ownedStructuralRootDelta(
      this.materialized?.dataset ?? EMPTY_MATERIALIZED_DATASET.dataset,
      mutation.candidate.dataset,
    );
    const componentSemantics = structuralRootDelta === null
      ? indexComponentSemantics(mutation.candidate.dataset)
      : reconcileStructuralComponentSemantics(
          this.componentSemantics,
          structuralRootDelta,
        );
    const textSemantics = structuralRootDelta === null
      ? indexTextSemantics(mutation.candidate.dataset)
      : reconcileStructuralTextSemantics(
          this.textSemantics,
          structuralRootDelta,
        );
    const selectionBefore = this.logicalSelectionIds;
    const selectionAfter = structuralRootDelta === null
      ? this.validLogicalSelection(selectionBefore, mutation.candidate)
      : this.validOwnedStructuralSelection(selectionBefore, mutation.candidate);
    let preparedHistory: PatchMapHistoryPreparedRecord;
    try {
      preparedHistory = this.history.prepareOwnedChangedRecord({
        id: `destroy:${this.sceneRevision + 1}:${semanticTargetIdentity(mutation.target)}`,
        before: this.historySnapshot(),
        after: historySnapshotForDataset(
          mutation.candidate.dataset,
          this.historyCompanionForSelection(selectionAfter),
        ),
      });
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'destroyTarget');
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
      } satisfies PatchMapEngineDestroyTargetResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }
    let reconcile: PatchMapSurfaceReconcileResult;
    try {
      reconcile = surface.reconcile(mutation.candidate.dataset, {
        animateBarChanges: false,
        ...(mutation.target.kind === 'element'
          ? { structuralSharing: true }
          : {}),
        ...(!sameStringArray(selectionBefore, selectionAfter)
          ? { selectionIds: selectionAfter }
          : {}),
      });
    } catch (error) {
      this.history.cancelPrepared(preparedHistory);
      const diagnostic = this.diagnosticFrom(error, 'destroyTarget');
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
      } satisfies PatchMapEngineDestroyTargetResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    const reconcileDiagnostics = freezeReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      this.history.cancelPrepared(preparedHistory);
      return this.refusedDestroyTargetResult(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        reconcileDiagnostics,
      );
    }

    this.materialized = mutation.candidate;
    this.defaultViewportContributorsCache = null;
    this.logicalSceneIndexCache = null;
    this.componentSemantics = componentSemantics;
    this.textSemantics = textSemantics;
    this.logicalSelectionIds = selectionAfter;
    this.sceneRevision += 1;
    this.lifecycle = mutation.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    if (!sameStringArray(selectionBefore, selectionAfter)) this.interactionRevision += 1;
    const historyStatus = this.history.commitPrepared(preparedHistory);
    if (historyStatus === 'stale' || historyStatus === 'invalid' || historyStatus === 'cancelled') {
      throw new Error(`destroy history preflight became ${historyStatus} after surface commit`);
    }
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      target: mutation.target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: mutation.candidate.semanticHash,
      applied: freezeTargets([mutation.target]),
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    } satisfies PatchMapEngineDestroyTargetResult);
    this.emit('targetDestroyed', result);
    return result;
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
    if (changed) this.interactionRevision += 1;
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
    if (changed) this.interactionRevision += 1;
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

  public applyLiveOverlay(input: PatchMapLiveOverlayInput): PatchMapLiveOverlayResult {
    this.requireSurface('applyLiveOverlay');
    const sourceRevision = positiveSafeInteger(input.sourceRevision, 'sourceRevision');
    const payloadHash = nonEmptyValue(input.payloadHash, 'payloadHash');
    const latest = this.latestOverlayAccepted;
    if (latest !== null && sourceRevision <= latest.sourceRevision) {
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
    const tuple = Object.freeze({
      sourceRevision,
      payloadHash,
      sceneRevision: this.sceneRevision,
    });
    this.latestOverlayAccepted = tuple;
    this.pendingOverlayPublication = tuple;
    this.overlayAcceptedCount += 1;
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
    return Object.freeze({
      latestAccepted: this.latestOverlayAccepted,
      latestPublished: this.latestOverlayPublished,
      pendingPublicationCount: this.pendingOverlayPublication === null ? 0 : 1,
      acceptedCount: this.overlayAcceptedCount,
      publicationCount: this.overlayPublicationCount,
    });
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
    const history = this.history.state();
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
    this.sceneRevision += 1;
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
    let sourceFields: Readonly<{ readonly sourceRevision?: number }> = Object.freeze({});
    let sequence = 0;
    let inputResolved = false;
    let outcome: PatchMapDatasetSubmissionResult | null = null;
    this.pendingWork += 1;
    try {
      const sourceRevision = normalizeOptionalSourceRevision(submission.sourceRevision);
      sourceFields = sourceRevision === undefined
        ? Object.freeze({})
        : Object.freeze({ sourceRevision });
      if (!this.surface) {
        outcome = Object.freeze({
          status: 'rejected',
          requestId: submission.requestId,
          ...sourceFields,
          diagnostic: this.operationDiagnostic('NOT_READY', 'NOT_READY', 'loadDataset', true),
        } satisfies PatchMapDatasetSubmissionResult);
        return outcome;
      }
      sequence = ++this.submissionSequence;
      const input = await submission.input;
      inputResolved = true;
      const prepared = this.prepareDatasetLoad(input);
      if (sequence !== this.submissionSequence || this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
        outcome = Object.freeze({
          status: 'superseded',
          requestId: submission.requestId,
          ...sourceFields,
          diagnostic: this.operationDiagnostic('SUPERSEDED', 'SUPERSEDED', 'loadDataset', true),
        } satisfies PatchMapDatasetSubmissionResult);
        return outcome;
      }
      const surface = this.requireSurface('loadDataset');
      const result = this.publishPreparedDatasetLoad(surface, prepared, {
        ...(submission.datasetRef ? { datasetRef: submission.datasetRef } : {}),
      });
      this.emit('drawComplete', Object.freeze({
        requestId: submission.requestId,
        ...sourceFields,
        sceneRevision: result.sceneRevision,
        semanticHash: result.semanticHash,
        datasetRef: submission.datasetRef ?? null,
      }));
      outcome = Object.freeze({
        status: 'committed',
        requestId: submission.requestId,
        ...sourceFields,
        sceneRevision: result.sceneRevision,
        semanticHash: result.semanticHash,
      } satisfies PatchMapDatasetSubmissionResult);
      return outcome;
    } catch (error) {
      if (
        !inputResolved &&
        sequence !== 0 &&
        (
          sequence !== this.submissionSequence ||
          this.lifecycle === 'destroyed' ||
          this.lifecycle === 'destroying'
        )
      ) {
        outcome = Object.freeze({
          status: 'superseded',
          requestId: submission.requestId,
          ...sourceFields,
          diagnostic: this.operationDiagnostic(
            'SUPERSEDED',
            'SUPERSEDED',
            'loadDataset',
            true,
          ),
        } satisfies PatchMapDatasetSubmissionResult);
        return outcome;
      }
      const diagnostic = this.diagnosticFrom(error, 'loadDataset');
      if (!this.isDestroyingOrDestroyed()) this.emit('diagnostic', diagnostic);
      outcome = Object.freeze({
        status: 'rejected',
        requestId: submission.requestId,
        ...sourceFields,
        diagnostic,
      } satisfies PatchMapDatasetSubmissionResult);
      return outcome;
    } finally {
      try {
        if (outcome !== null) await releaseDatasetSubmission(submission, outcome);
      } finally {
        this.pendingWork -= 1;
      }
    }
  }

  public registerPageLifecycleWork(
    input: PatchMapEnginePageLifecycleWorkInput,
  ): PatchMapPageLifecycleWorkToken {
    this.requireSurface('registerPageLifecycleWork');
    return this.pageLifecycle.register(input.kind, input.requestId);
  }

  public completePageLifecycleWork(
    token: PatchMapPageLifecycleWorkToken,
  ): PatchMapPageLifecycleWorkCompletion {
    return this.pageLifecycle.complete(token);
  }

  public setDocumentVisibility(
    input: PatchMapEngineDocumentVisibilityInput,
  ): PatchMapEngineDocumentVisibilityResult {
    const surface = this.requireSurface('setDocumentVisibility');
    const before = this.pageLifecycle.probe();
    if (input.state !== 'visible' && input.state !== 'hidden') {
      throw new TypeError('document visibility state must be visible or hidden');
    }
    if (
      !Number.isFinite(input.timeMs) ||
      input.timeMs < before.clockMs
    ) {
      throw new RangeError('page lifecycle time must be finite and monotonic');
    }
    const pointerBefore = this.pointerGestureAuthority?.probe() ?? destroyedPointerGestureProbe();
    const motionBefore = this.viewportAuthority.motionActive;
    let presentation: PatchMapPresentationLifecycleResult | null = null;
    const changed = input.state !== before.state;
    if (this.frameLoop?.isDestroyed) {
      this.frameLoop = null;
      this.frameLoopPausedForVisibility = false;
    }
    if (changed && input.state === 'hidden') {
      if (
        this.frameLoop !== null &&
        !this.frameLoop.isPaused
      ) {
        this.frameLoop.pause();
        this.frameLoopPausedForVisibility = true;
      }
      presentation = surface.suspendPresentation?.(input.timeMs) ?? null;
    } else if (changed) {
      presentation = surface.resumePresentation?.(input.timeMs) ?? null;
    }
    const transition = this.pageLifecycle.transition(input.state, input.timeMs);
    if (changed) this.frameClockMs = input.timeMs;
    if (transition.changed && transition.state === 'hidden') {
      this.viewportAuthority.cancelMotion();
      surface.cancelViewportGestures?.();
      if (this.cancelActiveTransformerEdit('blur', true) === null) {
        this.transformerGestures.interrupt();
      }
      this.pointerGestureAuthority?.interrupt('blur');
      this.hostInteractions.clearTooltip('redraw');
      if (
        motionBefore ||
        pointerBefore.activePointerCount > 0 ||
        pointerBefore.activeGestureCount > 0
      ) {
        this.interactionRevision += 1;
      }
    }
    const result = Object.freeze({
      schemaRevision: PATCH_MAP_PAGE_LIFECYCLE_REVISION,
      transition,
      presentation,
      probe: this.pageLifecycleProbe(),
    } satisfies PatchMapEngineDocumentVisibilityResult);
    if (
      transition.changed &&
      transition.state === 'visible' &&
      this.frameLoop !== null
    ) {
      this.frameLoop.synchronizeLogicalTime(input.timeMs);
      if (this.frameLoopPausedForVisibility) this.frameLoop.resume();
      this.frameLoopPausedForVisibility = false;
    }
    if (transition.changed) this.emit('documentVisibilityChanged', result);
    return result;
  }

  public pageLifecycleProbe(): PatchMapEnginePageLifecycleProbe {
    const lifecycle = this.pageLifecycle.probe();
    const pointer = this.pointerGestureAuthority?.probe() ?? destroyedPointerGestureProbe();
    return Object.freeze({
      ...lifecycle,
      activeAnimationCount: this.activeAnimations,
      decelerationActive: this.viewportAuthority.motionActive,
      activeGestureCount: pointer.activeGestureCount,
      pointerCaptureCount: pointer.pointerCaptureCount,
    });
  }

  public publishFrame(timeMs = globalThis.performance?.now() ?? Date.now()): void {
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs must be finite');
    if (this.pageLifecycle.probe().state === 'hidden') return;
    const surface = this.requireSurface('publishFrame');
    try {
      this.refreshAccessibilitySurfaceIfActive('publishFrame');
      surface.publishFrame(timeMs);
      this.frameClockMs = timeMs;
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'publishFrame');
      this.emit('diagnostic', diagnostic);
      throw new PatchMapError(diagnostic);
    }
    if (this.viewportAuthority.resizeFramePending) {
      this.viewportAuthority.completeResizeFrame(
        (this.materialized?.rootIds.length ?? 0) > 0,
        surface.debugSnapshot().visiblePrimitiveCount,
      );
    }
    this.frameRevision += 1;
    this.publishedTuple = Object.freeze({
      scene: this.sceneRevision,
      view: this.viewRevision,
      interaction: this.interactionRevision,
    });
    this.emit('frame', Object.freeze({ frameRevision: this.frameRevision, publishedTuple: this.publishedTuple }));
    if (this.pendingHistoryPublications.length > 0) {
      const pending = this.pendingHistoryPublications;
      this.pendingHistoryPublications = Object.freeze([]);
      for (const entry of pending) {
        if (entry.sceneRevision !== this.publishedTuple.scene) continue;
        this.emit('historyVisible', Object.freeze({
          direction: entry.direction,
          sceneRevision: entry.sceneRevision,
          frameRevision: this.frameRevision,
          publication: 'published',
        }));
      }
    }
    if (this.pendingOverlayPublication !== null) {
      const published = Object.freeze({
        ...this.pendingOverlayPublication,
        frameRevision: this.frameRevision,
      });
      this.latestOverlayPublished = published;
      this.pendingOverlayPublication = null;
      this.overlayPublicationCount += 1;
      this.emit('overlayPublished', published);
    }
    this.pageLifecycle.publishedFrame();
  }

  public resize(width: number, height: number, pixelRatio = globalThis.devicePixelRatio ?? 1): boolean {
    validatePositiveFinite('width', width);
    validatePositiveFinite('height', height);
    validatePositiveFinite('pixelRatio', pixelRatio);
    const surface = this.requireSurface('resize');
    const effect = this.viewportAuthority.planResize(width, height, pixelRatio);
    const changed = surface.resize(width, height, pixelRatio);
    if (!changed) return false;
    surface.setView(effect.surfaceView);
    const nextViewRevision = this.viewRevision + 1;
    this.viewportAuthority.commitResize(effect, nextViewRevision);
    this.viewRevision = nextViewRevision;
    return true;
  }

  public viewportProbe(): PatchMapViewportState {
    return this.viewportAuthority.snapshot().viewport;
  }

  public viewportTransformProbe(): PatchMapViewportTransformProbe {
    const surface = this.requireSurface('viewportTransformProbe');
    const debug = surface.debugSnapshot();
    const viewport = this.viewportAuthority.snapshot();
    const resize = this.viewportAuthority.resizeProbe();
    return Object.freeze({
      schemaRevision: PATCH_MAP_VIEWPORT_REVISION,
      world: viewport.world,
      ...resize,
      surface: Object.freeze({
        canvasCount: surface.canvasCount,
        cssSize: debug.cssSize,
        backingSize: debug.backingSize,
      }),
    });
  }

  public panViewport(
    deltaCss: readonly [number, number],
    source: PatchMapViewportChangeSource = 'pointer',
  ): PatchMapViewportChangeResult {
    const delta = finiteTuple(deltaCss, 'deltaCss');
    const surface = this.requireSurface('panViewport');
    const viewport = this.viewportAuthority.snapshot();
    if (
      (source === 'pointer' || source === 'middle-pointer') &&
      !this.viewportAuthority.hasPolicy('pan')
    ) {
      return this.blockedViewportResult(source);
    }
    if (
      source === 'deceleration' &&
      !this.viewportAuthority.hasPolicy('deceleration')
    ) {
      return this.blockedViewportResult(source);
    }
    const center = surface.screenToWorld({
      x: viewport.width / 2 - delta[0],
      y: viewport.height / 2 - delta[1],
    });
    return this.commitViewport([center.x, center.y], viewport.scale, source);
  }

  public zoomViewportAt(input: Readonly<{
    readonly factor: number;
    readonly anchorCss: readonly [number, number];
    readonly source?: 'wheel' | 'modifier-wheel' | 'pinch' | 'programmatic';
  }>): PatchMapViewportChangeResult {
    if (!Number.isFinite(input.factor) || !(input.factor > 0)) {
      throw new RangeError('zoom factor must be positive and finite');
    }
    const anchor = finiteTuple(input.anchorCss, 'anchorCss');
    const source = input.source ?? 'wheel';
    const policy = source === 'pinch' ? 'pinch' : source === 'programmatic' ? null : 'wheel';
    const surface = this.requireSurface('zoomViewportAt');
    if (policy !== null && !this.viewportAuthority.hasPolicy(policy)) {
      return this.blockedViewportResult(source);
    }
    const viewport = this.viewportAuthority.snapshot();
    const worldUnderAnchor = surface.screenToWorld({ x: anchor[0], y: anchor[1] });
    const nextScale = Math.min(
      viewport.zoomLimits[1],
      Math.max(viewport.zoomLimits[0], viewport.scale * input.factor),
    );
    const ratio = viewport.scale / nextScale;
    const center: readonly [number, number] = Object.freeze([
      worldUnderAnchor.x -
        (worldUnderAnchor.x - viewport.centerWorld[0]) * ratio,
      worldUnderAnchor.y -
        (worldUnderAnchor.y - viewport.centerWorld[1]) * ratio,
    ]);
    return this.commitViewport(center, nextScale, source);
  }

  public startViewportDeceleration(
    velocityCssPxPerMs: readonly [number, number],
  ): boolean {
    const velocity = finiteTuple(velocityCssPxPerMs, 'velocityCssPxPerMs');
    this.requireSurface('startViewportDeceleration');
    return this.viewportAuthority.startMotion(velocity);
  }

  public advanceViewportMotion(deltaMs: number): PatchMapViewportChangeResult {
    const effect = this.viewportAuthority.planMotionAdvance(deltaMs);
    if (effect.blocked) {
      this.viewportAuthority.commitMotion(effect);
      return this.blockedViewportResult('deceleration');
    }
    const result = this.panViewport(effect.displacementCss, 'deceleration');
    this.viewportAuthority.commitMotion(effect);
    return result;
  }

  public cancelViewportMotion(): boolean {
    const changed = this.viewportAuthority.cancelMotion();
    this.surface?.cancelViewportGestures?.();
    return changed;
  }

  public settleViewport(): PatchMapViewportSettleResult {
    this.requireSurface('settleViewport');
    this.cancelViewportMotion();
    const result = this.viewportAuthority.settle();
    if (result.changed) this.emit('viewSettled', result);
    return result;
  }

  public serializeViewport(): PatchMapSerializedViewportState {
    this.requireSurface('serializeViewport');
    return this.viewportAuthority.serialize();
  }

  public viewportPersistenceProbe(): PatchMapViewportPersistenceProbe {
    return this.viewportAuthority.persistenceProbe();
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
    if (
      !Number.isSafeInteger(requestedGeneration) ||
      requestedGeneration !== this.lifecycleGeneration + 1
    ) {
      throw new RangeError('host lifecycle generation must advance by exactly one');
    }
    const surface = this.requireSurface('rebindHostLifecycle');
    this.hostInteractions.clearTooltip('redraw');
    this.submissionSequence += 1;
    this.loadSequence += 1;
    this.viewportAuthority.cancelMotion();
    surface.cancelViewportGestures?.();
    if (this.cancelActiveTransformerEdit('redraw', true) === null) {
      this.transformerGestures.interrupt();
    }
    if (this.logicalSelectionIds.length > 0) {
      surface.select([]);
      this.logicalSelectionIds = Object.freeze([]);
      this.interactionRevision += 1;
    }
    this.lifecycleGeneration = requestedGeneration;
    this.targetLifecycleGeneration += 1;
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
      canvasCount: surface.canvasCount,
      selectionIds: this.logicalSelectionIds,
      revisions: this.revisionStamp(),
    });
  }

  public restoreViewport(
    input: unknown,
    fallback: PatchMapViewportFitOptions = {},
  ): PatchMapViewportRestoreResult {
    const restored = this.viewportAuthority.normalizeSerialized(input);
    if (restored !== null) {
      const result = this.commitViewport(
        restored.centerWorld,
        restored.scale,
        'restore',
      );
      return Object.freeze({
        status: 'restored',
        changed: result.changed,
        viewport: result.viewport,
        fit: null,
      });
    }
    const fit = this.fitViewport(fallback, 'fallback-fit');
    return Object.freeze({
      status: 'fallback:auto-fit',
      changed: fit.changed,
      viewport: fit.viewport,
      fit,
    });
  }

  public focusViewport(
    options: PatchMapViewportTargetOptions = {},
  ): PatchMapViewportFocusResult {
    const contributors = this.resolveViewportContributors(options);
    const viewport = this.viewportAuthority.snapshot();
    if (contributors.worldBounds === null) {
      return Object.freeze({
        ...contributors,
        status: 'empty',
        changed: false,
        viewport: viewport.viewport,
      });
    }
    const center = patchMapBoundsCenter(contributors.worldBounds);
    const change = this.commitViewport(center, viewport.scale, 'focus');
    return Object.freeze({
      ...contributors,
      status: 'applied',
      changed: change.changed,
      viewport: change.viewport,
    });
  }

  public fitViewport(
    options: PatchMapViewportFitOptions = {},
    source: 'fit' | 'fallback-fit' = 'fit',
  ): PatchMapViewportFitResult {
    const padding = normalizePatchMapViewportPadding(options.paddingCssPx);
    const contributors = this.resolveViewportContributors(options);
    const viewport = this.viewportAuthority.snapshot();
    const paddingCssPx = Object.freeze([padding.x, padding.y] as const);
    if (contributors.worldBounds === null) {
      return Object.freeze({
        ...contributors,
        status: 'empty',
        changed: false,
        paddingCssPx,
        viewport: viewport.viewport,
      });
    }
    const scale = patchMapViewportFitScale(
      contributors.worldBounds,
      [viewport.width, viewport.height],
      padding,
      viewport.world.rotationDegrees,
      viewport.zoomLimits,
    );
    const center = patchMapBoundsCenter(contributors.worldBounds);
    const change = this.commitViewport(center, scale, source);
    return Object.freeze({
      ...contributors,
      status: 'applied',
      changed: change.changed,
      paddingCssPx,
      viewport: change.viewport,
    });
  }

  public configureViewportPolicy(
    operation: PatchMapViewportPolicyOperation,
  ): PatchMapViewportPolicyProbe {
    const surface = this.requireSurface('configureViewportPolicy');
    const effect = this.viewportAuthority.planPolicy(operation);
    if (effect.cancelGestures) surface.cancelViewportGestures?.();
    surface.setViewportGesturePolicies?.(effect.enabledPolicies);
    this.viewportAuthority.commitPolicy(effect);
    const probe = this.viewportPolicyProbe();
    this.emit('viewportPolicyChanged', probe);
    return probe;
  }

  public viewportPolicyProbe(): PatchMapViewportPolicyProbe {
    return this.viewportAuthority.policyProbe(this.isDestroyingOrDestroyed());
  }

  public setViewport(input: Readonly<{
    centerWorld: readonly [number, number];
    scale: number;
  }>): PatchMapViewportState {
    return this.commitViewport(
      input.centerWorld,
      input.scale,
      'programmatic',
    ).viewport;
  }

  public setWorldTransform(input: PatchMapWorldTransformInput): PatchMapWorldTransformState {
    const effect = this.viewportAuthority.planWorldTransform(input);
    const surface = this.requireSurface('setWorldTransform');
    if (!effect.changed) return effect.world;
    surface.setView(effect.surfaceView);
    const nextViewRevision = this.viewRevision + 1;
    this.viewportAuthority.commitWorldTransform(effect, nextViewRevision);
    this.viewRevision = nextViewRevision;
    return effect.world;
  }

  public queryScene(input: PatchMapSceneQuery = {}): PatchMapEngineQueryResult {
    this.requireSurface('queryScene');
    const evaluated = this.logicalSceneIndex().query(input);
    const result = Object.freeze({
      schemaRevision: PATCH_MAP_QUERY_SELECTION_REVISION,
      status: evaluated.status,
      code: evaluated.code,
      lifecycleGeneration: this.targetLifecycleGeneration,
      sceneRevision: this.sceneRevision,
      targets: evaluated.targets,
    } satisfies PatchMapEngineQueryResult);
    if (result.status !== 'rejected') {
      this.queryResultAuthorities.set(result, Object.freeze({
        lifecycleGeneration: this.targetLifecycleGeneration,
        sceneRevision: this.sceneRevision,
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
    const authority = this.queryResultAuthorities.get(result);
    if (
      authority === undefined ||
      authority.lifecycleGeneration !== this.targetLifecycleGeneration ||
      authority.sceneRevision !== this.sceneRevision
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
    return this.applySelection({
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
      : createPatchMapLogicalPropagationTrace(target, this.sceneRevision, options);
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
          this.sceneRevision,
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
    const viewport = this.viewportAuthority.snapshot();
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
    if (state.revision !== beforeRevision) this.interactionRevision += 1;
    return state;
  }

  public setExternalSelection(ids: readonly string[]): PatchMapExternalSelectionResult {
    const change = this.applySelection({
      op: 'replace',
      ids,
      source: 'external',
    });
    const requestedIds = Object.freeze([...new Set(ids)]);
    const currentIds = new Set(change.current);
    return Object.freeze({
      requestedIds,
      missingIds: Object.freeze(requestedIds.filter((id) => !currentIds.has(id))),
      change,
    });
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
      authority.lifecycleGeneration !== this.lifecycleGeneration
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
    this.requireSurface('transformableSubset');
    return evaluatePatchMapTransformableSubset(
      this.logicalSceneSelectionIndex(),
      selectionIds,
      lockedIds,
    );
  }

  public selectionVisualProbe(
    options: Omit<PatchMapSelectionVisualOptions, 'selectionIds'> & Readonly<{
      readonly selectionIds?: readonly string[];
    }> = {},
  ): PatchMapSelectionVisualProbe | null {
    const surface = this.requireSurface('selectionVisualProbe');
    const selectionIds = options.selectionIds ?? this.logicalSelectionIds;
    const geometries = surface.selectionGeometries?.(selectionIds) ??
      surface.geometrySnapshot?.().entities ??
      null;
    if (geometries === null) return null;
    const viewport = this.viewportAuthority.snapshot();
    return createPatchMapSelectionVisualProbe(
      this.logicalSceneSelectionIndex(),
      geometries,
      {
        ...options,
        selectionIds,
        viewportScale: options.viewportScale ?? viewport.scale,
      },
    );
  }

  public setSelectionVisualPolicy(
    options: Omit<PatchMapSelectionVisualOptions, 'selectionIds'> & Readonly<{
      readonly selectionIds?: readonly string[];
    }> = {},
  ): PatchMapSelectionVisualProbe | null {
    const surface = this.requireSurface('setSelectionVisualPolicy');
    const visual = this.selectionVisualProbe(options);
    if (visual === null) return null;
    const subset = evaluatePatchMapTransformableSubset(
      this.logicalSceneSelectionIndex(),
      visual.overlayTargets.map((target) => target.selectionId),
      options.lockedIds ?? [],
    );
    const changed = surface.setSelectionOverlayPolicy?.({
      visibleIds: visual.overlayTargets.map((target) => target.selectionId),
      transformableIds: subset.transformableTargets.map((target) => target.selectionId),
      resizableIds: subset.resizableTargets.map((target) => target.selectionId),
      hidden: visual.mode === 'hidden',
      handleCssPx: visual.handleCssPx,
      strokeCssPx: visual.strokeCssPx,
    }) ?? false;
    if (changed) this.interactionRevision += 1;
    return visual;
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
    this.requireSurface('selectRelationEndpoints');
    const materialized = this.materialized;
    if (materialized === null) {
      throw this.operationError('NOT_READY', 'NOT_READY', 'selectRelationEndpoints', true);
    }
    const resolution = resolvePatchMapRelationEndpoints(
      materialized.dataset,
      this.logicalSceneIndex(),
      relationIds,
    );
    const change = this.applySelection({
      op: mode,
      ids: resolution.targets.map((target) => target.selectionId),
      source,
    });
    return Object.freeze({ ...resolution, change });
  }

  public beginTransformerHandleGesture(
    pointerId: number,
    handle: PatchMapTransformerHandle,
  ): PatchMapTransformerGestureProbe {
    this.requireSurface('beginTransformerHandleGesture');
    this.hostInteractions.clearTooltip('drag');
    this.transformerGestures.begin(pointerId, handle);
    try {
      this.requirePointerGestureAuthority('beginTransformerHandleGesture')
        .beginOwnedGesture(
          handle === 'rotate' ? 'rotate' : handle === 'frame' ? 'move' : 'resize',
          pointerId,
        );
    } catch (error) {
      this.transformerGestures.cancel(pointerId);
      throw error;
    }
    return this.transformerGestures.probe();
  }

  public routeTransformerInput(
    pointerId: number,
    family: PatchMapTransformerInputFamily,
  ): ReturnType<PatchMapTransformerGestureAuthority['route']> {
    this.requireSurface('routeTransformerInput');
    return this.transformerGestures.route(pointerId, family);
  }

  public completeTransformerHandleGesture(
    pointerId: number,
  ): NonNullable<PatchMapEngineTransformerCompletionResult['gesture']> {
    this.requireSurface('completeTransformerHandleGesture');
    const completed = this.transformerGestures.complete(pointerId);
    const pointer = completed
      ? this.requirePointerGestureAuthority('completeTransformerHandleGesture')
          .terminateOwnedGesture('pointer-up-outside')
      : null;
    return Object.freeze({
      completed,
      pointer,
      probe: this.transformerGestures.probe(),
    });
  }

  public cancelTransformerHandleGesture(
    pointerId: number,
    reason: PatchMapGestureCancelReason = 'pointer-cancel',
  ): NonNullable<PatchMapEngineTransformerCancelResult['gesture']> {
    this.requireSurface('cancelTransformerHandleGesture');
    const cancelled = this.transformerGestures.cancel(pointerId);
    const pointer = cancelled
      ? this.requirePointerGestureAuthority('cancelTransformerHandleGesture')
          .cancelOwnedGesture(reason)
      : null;
    return Object.freeze({
      cancelled,
      pointer,
      probe: this.transformerGestures.probe(),
    });
  }

  public transformerGestureProbe(): PatchMapTransformerGestureProbe {
    return this.transformerGestures.probe();
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
    const before = this.history.state();
    const transaction = this.transact({
      strict: true,
      operations: plan.operations,
      ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
      ...(options.recordHistory === undefined
        ? {}
        : { recordHistory: options.recordHistory }),
    });
    const after = this.history.state();
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
    this.requireSurface('beginTransformerEdit');
    this.transformerEdits.assertIdle();
    const materialized = this.materialized;
    if (materialized === null) {
      throw this.operationError('NOT_READY', 'NOT_READY', 'beginTransformerEdit', true);
    }
    assertTransformerHandleKind(input.handle, input.kind);
    const actionId = nonEmptyValue(input.actionId, 'transformer actionId');
    const selectionIds = Object.freeze([
      ...(input.selectionIds ?? this.logicalSelectionIds),
    ]);
    if (input.selectionIds !== undefined) {
      this.applySelection({
        op: 'replace',
        ids: selectionIds,
        source: 'programmatic',
      });
    }
    this.beginTransformerHandleGesture(input.pointerId, input.handle);
    this.transformerEdits.begin({
      pointerId: input.pointerId,
      actionId,
      kind: input.kind,
      handle: input.handle,
      selectionIds,
      startMaterialized: materialized,
      startSelectionIds: Object.freeze([...this.logicalSelectionIds]),
      historyDepthBefore: this.history.state().undoDepth,
    });
    return this.transformerEditProbe();
  }

  public previewTransformerEdit(
    pointerId: number,
    request: PatchMapTransformerEditRequest,
  ): PatchMapEngineTransformerPreviewResult {
    const surface = this.requireSurface('previewTransformerEdit');
    const active = this.transformerEdits.require(pointerId, 'previewTransformerEdit');
    if (request.kind !== active.kind) {
      throw new TypeError('transformer preview kind must match the active session');
    }
    if (!sameStringArray(request.selectionIds, active.selectionIds)) {
      throw new TypeError('transformer preview selection must match the active session');
    }
    const plan = planPatchMapTransformerEdit(active.startMaterialized.dataset, request);
    if (plan.status === 'rejected') {
      return Object.freeze({
        status: 'rejected',
        changed: false,
        plan,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
        probe: this.transformerEditProbe(),
      });
    }
    if (!surface.reconcile) {
      return Object.freeze({
        status: 'refused',
        changed: false,
        plan,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
        probe: this.transformerEditProbe(),
      });
    }

    let previewMaterialized = active.startMaterialized;
    let mutationPlan: PatchMapMutationTransactionPlan | null = null;
    if (plan.status === 'planned') {
      const preview = planPatchMapPreviewMutationTransaction(active.startMaterialized, {
        strict: true,
        recordHistory: false,
        operations: plan.operations,
      });
      if (preview.status !== 'planned') {
        throw new Error(`transformer preview transaction became ${preview.status}`);
      }
      mutationPlan = preview;
      previewMaterialized = preview.candidate;
    }
    const incrementalRootIds = plan.status === 'planned'
      ? incrementalFlatRootIds(
          active.startMaterialized.dataset,
          previewMaterialized.dataset,
          plan.operations,
        )
      : undefined;
    const transient = incrementalRootIds === undefined
      ? null
      : surface.previewIncrementalRoots?.(
          previewMaterialized.dataset,
          incrementalRootIds,
        ) ?? null;
    const reconcile: PatchMapSurfaceReconcileResult = transient === null
      ? surface.reconcile(previewMaterialized.dataset, {
          animateBarChanges: false,
          ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
        })
      : Object.freeze({
          status: 'committed',
          operationCount: plan.operations.length,
          denseChanged: false,
          diagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
        });
    const diagnostics = freezeReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      return Object.freeze({
        status: 'refused',
        changed: false,
        plan,
        reconcileDiagnostics: diagnostics,
        probe: this.transformerEditProbe(),
      });
    }

    this.interactionRevision += 1;
    this.transformerEdits.recordPreview(active, {
      latestPlan: plan,
      latestMutationPlan: mutationPlan,
      previewMaterialized,
      transientPreview: transient !== null,
    });
    return Object.freeze({
      status: plan.status === 'planned' ? 'previewed' : 'unchanged',
      changed: plan.changed,
      plan,
      reconcileDiagnostics: diagnostics,
      probe: this.transformerEditProbe(),
    });
  }

  public completeTransformerEdit(
    pointerId: number,
  ): PatchMapEngineTransformerCompletionResult {
    const completion = this.transformerEdits.prepareCompletion(pointerId);
    if (completion.status === 'stale') {
      return Object.freeze({
        status: 'stale',
        changed: false,
        mutationCount: 0,
        historyDepthDelta: 0,
        transaction: null,
        gesture: null,
        probe: this.transformerEditProbe(),
      });
    }
    const active = completion.session;
    if (completion.status === 'unchanged') {
      const gesture = this.completeTransformerHandleGesture(pointerId);
      this.transformerEdits.settle(active, 'unchanged');
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        mutationCount: 0,
        historyDepthDelta: 0,
        transaction: null,
        gesture,
        probe: this.transformerEditProbe(),
      });
    }

    const surface = this.requireSurface('completeTransformerEdit');
    const previewPlan = active.latestMutationPlan;
    if (previewPlan === null || previewPlan.status !== 'planned') {
      throw new Error('planned transformer completion lost its preview transaction');
    }
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.history.state();
    const promoted = promotePatchMapPreviewMutationTransaction(
      active.startMaterialized,
      Object.freeze({
        ...previewPlan,
        actionId: active.actionId,
        recordHistory: true,
      }),
    );
    const transaction = this.applyPlannedTransaction(
      surface,
      promoted,
      'transact',
      previousRevisions,
      previousHistory,
    );
    if (transaction.status !== 'committed') {
      this.restoreTransformerPreview(active);
      const gesture = this.cancelTransformerHandleGesture(pointerId, 'redraw');
      this.transformerEdits.settle(active, 'cancelled');
      return Object.freeze({
        status: 'refused',
        changed: false,
        mutationCount: 0,
        historyDepthDelta: 0,
        transaction,
        gesture: Object.freeze({
          completed: gesture.cancelled,
          pointer: gesture.pointer,
          probe: gesture.probe,
        }),
        probe: this.transformerEditProbe(),
      });
    }
    const depthDelta = this.history.state().undoDepth - active.historyDepthBefore;
    this.transformerEdits.settle(active, 'committed');
    const gesture = this.completeTransformerHandleGesture(pointerId);
    return Object.freeze({
      status: 'committed',
      changed: true,
      mutationCount: 1,
      historyDepthDelta: depthDelta === 1 ? 1 : 0,
      transaction,
      gesture,
      probe: this.transformerEditProbe(),
    });
  }

  public cancelTransformerEdit(
    pointerId: number,
    reason: PatchMapGestureCancelReason,
  ): PatchMapEngineTransformerCancelResult {
    const active = this.transformerEdits.current();
    if (active === null || active.pointerId !== pointerId) {
      return Object.freeze({
        status: 'stale',
        cancelled: false,
        reason,
        historyDepthDelta: 0,
        gesture: null,
        probe: this.transformerEditProbe(),
      });
    }
    const gesture = this.cancelActiveTransformerEdit(reason, true);
    if (gesture === null) throw new Error('active transformer cancellation was lost');
    return Object.freeze({
      status: 'cancelled',
      cancelled: true,
      reason,
      historyDepthDelta: 0,
      gesture,
      probe: this.transformerEditProbe(),
    });
  }

  public transformerEditProbe(): PatchMapEngineTransformerSessionProbe {
    return this.transformerEdits.probe();
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
    const viewport = this.viewportAuthority.snapshot();
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

  public applySelection(input: PatchMapSelectionSetOperation): PatchMapSelectionChange {
    const surface = this.requireSurface('select');
    const materialized = this.materialized;
    const change = applyPatchMapSelectionOperation(
      this.logicalSelectionIds,
      input,
      (id) => {
        if (materialized === null) return false;
        const owned = this.ownedSelectionTargetExists(id, materialized);
        return owned ?? this.logicalSceneIndex().target(id) !== null;
      },
    );
    if (change.changed) {
      if (this.cancelActiveTransformerEdit('selection-change', true) === null) {
        this.transformerGestures.interrupt();
      }
    }
    surface.select(change.current);
    this.logicalSelectionIds = change.current;
    if (change.changed) {
      if (change.source !== 'canvas') {
        this.pointerGestureAuthority?.interrupt('selection-change');
      }
      this.interactionRevision += 1;
      this.emit('selectionChanged', change);
      const source = change.source === 'canvas' ? 'pointer' : change.source;
      this.hostInteractions.publish(
        'selection',
        'changed',
        Object.freeze({
          source,
          target: change.current.at(-1) ?? null,
          selectedIds: change.current,
        }),
        this.interactionRevision,
      );
      if (change.source === 'canvas') {
        this.hostInteractions.publishSelectionToHost(
          change.current,
          this.interactionRevision,
        );
      }
    }
    return change;
  }

  public filterSelectionTargets(
    targetIds: readonly string[],
    options: PatchMapSelectionEligibilityOptions = {},
  ): readonly PatchMapLogicalTargetSnapshot[] {
    this.requireSurface('filterSelectionTargets');
    return this.logicalSceneIndex().filterSelection(targetIds, options);
  }

  public selectionHitTestScreen(
    point: PatchMapPoint,
    options: PatchMapSelectionHitOptions = {},
  ): PatchMapEngineSelectionHit {
    validatePoint(point, 'selectionHitTestScreen');
    const surface = this.requireSurface('selectionHitTestScreen');
    const worldPoint = surface.screenToWorld(point);
    if (selectionHitUsesSpatialFastPath(options)) {
      const logicalIndex = this.logicalSceneSelectionIndex();
      const id = surface.hitTestScreen(point);
      const hit = id === null
        ? Object.freeze({ target: null, candidates: Object.freeze([]) })
        : logicalIndex.hitFromTarget(id);
      return Object.freeze({ ...hit, worldPoint });
    }
    const logicalIndex = this.logicalSceneIndex();
    const geometry = surface.geometrySnapshot?.();
    if (geometry === undefined) {
      const id = surface.hitTestScreen(point);
      const target = id === null
        ? null
        : logicalIndex.filterSelection([id], options)[0] ?? null;
      return Object.freeze({
        target,
        candidates: Object.freeze(target === null ? [] : [target]),
        worldPoint,
      });
    }
    const hit = logicalIndex.hitTest(
      geometry.entities.map((entity) => Object.freeze({
        id: entity.id,
        ...(entity.ownerItemId === undefined ? {} : { ownerItemId: entity.ownerItemId }),
        ...(entity.componentId === undefined ? {} : { componentId: entity.componentId }),
        screenBounds: entity.screenBounds,
        visible: entity.visible,
      })),
      point,
      options,
    );
    return Object.freeze({
      ...hit,
      worldPoint,
    });
  }

  public selectPoint(
    point: PatchMapPoint,
    options: PatchMapSelectionHitOptions & Readonly<{
      readonly mode?: 'replace' | 'add' | 'toggle';
    }> = {},
  ): PatchMapEnginePointSelectionResult {
    const hit = this.selectionHitTestScreen(point, options);
    const ids = hit.target === null
      ? Object.freeze([] as string[])
      : Object.freeze([hit.target.selectionId]);
    const mode = options.mode ?? 'replace';
    const change = this.applySelection({
      op: mode,
      ids,
      source: 'canvas',
    });
    return Object.freeze({ ...hit, change });
  }

  public dispatchPointerInput(input: PatchMapEnginePointerInput): PatchMapPointerDispatchResult {
    this.requireSurface('dispatchPointerInput');
    const authority = this.requirePointerGestureAuthority('dispatchPointerInput');
    const transformerOwned = this.transformerGestures.owns(input.pointerId);
    if (transformerOwned) {
      this.transformerGestures.route(input.pointerId, 'transform');
    }
    const result = authority.dispatch(Object.freeze({
      ...input,
      viewRevision: input.viewRevision ?? this.viewRevision,
    }));
    if (transformerOwned) {
      if (input.type === 'up' || input.type === 'up-outside') {
        this.completeTransformerEdit(input.pointerId);
      } else if (input.type === 'cancel' || input.type === 'leave') {
        this.cancelTransformerEdit(input.pointerId, 'pointer-cancel');
      }
    }
    if (result.events.length > 0) this.interactionRevision += 1;
    for (const event of result.events) {
      this.emit('pointerEvent', event);
      this.hostInteractions.dispatchPointerEvent(event);
    }
    const click = result.events.find((event) => event.type === 'click');
    if (
      click !== undefined &&
      click.payload.button === 0 &&
      this.hostInteractions.modeProbe().activeState === 'select'
    ) {
      this.applySelection({
        op: click.payload.modifiers.shift ? 'toggle' : 'replace',
        ids: click.payload.target === null ? [] : [click.payload.target.id],
        source: 'canvas',
      });
    }
    return result;
  }

  public pointerGestureProbe(): PatchMapPointerGestureProbe {
    return this.pointerGestureAuthority?.probe() ?? destroyedPointerGestureProbe();
  }

  public ownsContextMenu(point: PatchMapPoint): boolean {
    validatePoint(point, 'ownsContextMenu');
    return this.requireSurface('ownsContextMenu').hitTestScreen(point) !== null;
  }

  public interruptPointerGestures(
    reason: PatchMapGestureCancelReason,
  ): PatchMapOwnedGestureTermination | null {
    this.requireSurface('interruptPointerGestures');
    return this.requirePointerGestureAuthority('interruptPointerGestures').interrupt(reason);
  }

  public beginOwnedPointerGesture(kind: PatchMapOwnedGestureKind, pointerId: number): void {
    this.requireSurface('beginOwnedPointerGesture');
    this.hostInteractions.clearTooltip('drag');
    this.requirePointerGestureAuthority('beginOwnedPointerGesture')
      .beginOwnedGesture(kind, pointerId);
  }

  public terminateOwnedPointerGesture(
    reason: PatchMapGestureTerminationReason,
  ): PatchMapOwnedGestureTermination | null {
    this.requireSurface('terminateOwnedPointerGesture');
    return this.requirePointerGestureAuthority('terminateOwnedPointerGesture')
      .terminateOwnedGesture(reason);
  }

  public cancelOwnedPointerGesture(
    reason: PatchMapGestureCancelReason,
  ): PatchMapOwnedGestureTermination | null {
    this.requireSurface('cancelOwnedPointerGesture');
    return this.requirePointerGestureAuthority('cancelOwnedPointerGesture')
      .cancelOwnedGesture(reason);
  }

  public selectBox(
    start: readonly [number, number],
    end: readonly [number, number],
    options: PatchMapEngineRegionSelectionOptions = {},
  ): PatchMapEngineRegionSelectionResult {
    const surface = this.requireSurface('selectBox');
    const geometry = requireRegionGeometry(surface, 'selectBox');
    const queryBounds = boxRegionQueryBounds(start, end);
    const candidates = queryBounds === null
      ? geometry
      : surface.queryRegionGeometry?.(queryBounds) ?? geometry;
    const hit = hitPatchMapBoxRegion(
      candidates.entities,
      candidates.relations,
      start,
      end,
      options.partialIntersection === undefined
        ? {}
        : { partialIntersection: options.partialIntersection },
    );
    return this.applyRegionSelection(hit, options, 1);
  }

  public selectPaint(
    segments: readonly (readonly [
      readonly [number, number],
      readonly [number, number],
    ])[],
    options: PatchMapEngineRegionSelectionOptions = {},
  ): PatchMapEngineRegionSelectionResult {
    const surface = this.requireSurface('selectPaint');
    const geometry = requireRegionGeometry(surface, 'selectPaint');
    const queryBounds = paintRegionQueryBounds(
      segments,
      options.toleranceCssPx ?? 0,
    );
    const candidates = queryBounds === null
      ? geometry
      : surface.queryRegionGeometry?.(queryBounds) ?? geometry;
    const hit = hitPatchMapPaintRegion(
      candidates.entities,
      candidates.relations,
      segments,
      options.toleranceCssPx === undefined
        ? {}
        : { toleranceCssPx: options.toleranceCssPx },
    );
    return this.applyRegionSelection(hit, options, segments.length);
  }

  public resolveSelectionInteraction(
    targetOrId: string,
    options: PatchMapSelectionInteractionOptions,
  ): PatchMapSelectionInteraction | null {
    this.requireSurface('resolveSelectionInteraction');
    return this.logicalSceneIndex().resolveSelectionInteraction(targetOrId, options);
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
    const value = this.materialized === null
      ? null
      : findEngineSemanticTarget(this.materialized.dataset, target);
    if (value === null) return null;
    const snapshot = Object.freeze({
      target,
      lifecycleGeneration: this.targetLifecycleGeneration,
      sceneRevision: this.sceneRevision,
      value: cloneDetachedEngineRecord(value),
    });
    this.resolvedTargetAuthorities.set(snapshot, Object.freeze({
      target,
      lifecycleGeneration: this.targetLifecycleGeneration,
      sceneRevision: this.sceneRevision,
    }));
    return snapshot;
  }

  public patchResolved(
    snapshot: PatchMapResolvedTargetSnapshot,
    patch: unknown,
  ): PatchMapEnginePatchResult {
    this.requireSurface('patch');
    const authority = this.resolvedTargetAuthorities.get(snapshot);
    if (
      authority === undefined ||
      authority.lifecycleGeneration !== this.targetLifecycleGeneration ||
      authority.sceneRevision !== this.sceneRevision
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
    const value = this.materialized ? findElement(this.materialized.dataset, target.id) : null;
    return value;
  }

  public snapshot(): PatchMapEngineSnapshot {
    const viewport = this.viewportAuthority.snapshot();
    const surfaceDebug = this.surface?.debugSnapshot() ?? emptySurfaceDebug(
      viewport.width,
      viewport.height,
      viewport.pixelRatio,
    );
    return Object.freeze({
      lifecycle: this.lifecycle,
      instanceId: this.instanceId,
      revisions: this.revisionStamp(),
      publishedTuple: this.publishedTuple,
      frameRevision: this.frameRevision,
      datasetRef: this.datasetRef,
      semanticHash: this.materialized?.semanticHash ?? null,
      rootIds: this.materialized?.rootIds ?? Object.freeze([]),
      historyDepth: this.history.state().undoDepth,
      pendingWork: this.pendingWork,
      zoomLimits: viewport.zoomLimits,
      viewport: viewport.viewport,
      selectionIds: this.logicalSelectionIds,
      facilities: FACILITIES,
      resources: Object.freeze({
        canvasCount:
          (this.surface?.canvasCount ?? 0) + (this.retainedCleanupSurface?.canvasCount ?? 0),
        canvas: Object.freeze({
          cssSize: surfaceDebug.cssSize,
          backingSize: surfaceDebug.backingSize,
        }),
        renderer: this.rendererConfiguration,
        rendering: Object.freeze({
          commandCount: surfaceDebug.renderCommandCount ?? null,
          visiblePrimitiveCount: surfaceDebug.visiblePrimitiveCount ?? null,
        }),
        assets: this.assetSession?.probe() ?? null,
        subscriptions: Object.freeze({ active: this.subscriptionCount(), duplicates: 0 }),
      }),
    });
  }

  public runtimeDiagnostics(): PatchMapRuntimeDiagnosticsSnapshot {
    if (!this.operations.isCollectionEnabled) {
      return this.operations.captureRuntimeDiagnostics({
        instanceId: this.instanceId,
        lifecycle: this.lifecycle,
        backend: { kind: null, lossState: 'uncollected' },
        revisions: this.revisionStamp(),
        counts: {
          roots: 0,
          elements: 0,
          components: 0,
          materialized: 0,
          text: 0,
          relations: 0,
        },
        activeWork: {
          gestures: 0,
          animations: 0,
          pendingAssets: 0,
          pendingWork: 0,
        },
        resources: {
          canvases: 0,
          listeners: 0,
          observers: 0,
          tickers: 0,
          textureLeases: 0,
          callbackRegistrations: 0,
        },
        cleanup: {
          destroyed: this.lifecycle === 'destroyed',
          released: this.lifecycle === 'destroyed',
        },
      });
    }
    const semantic = this.semanticProbe();
    const viewport = this.viewportAuthority.snapshot();
    const surfaceDebug = this.surface?.debugSnapshot() ?? emptySurfaceDebug(
      viewport.width,
      viewport.height,
      viewport.pixelRatio,
    );
    const assetProbe = this.assetSession?.probe() ?? null;
    const operationsProbe = this.operations.probe();
    const rendererLoss = this.surface?.rendererLossProbe?.()
      ?? this.terminalRendererLossProbe;
    const elements = semantic.scene.counts.elements;
    const components = semantic.scene.counts.components;
    const canvasCount =
      (this.surface?.canvasCount ?? 0) + (this.retainedCleanupSurface?.canvasCount ?? 0);
    return this.operations.captureRuntimeDiagnostics({
      instanceId: this.instanceId,
      lifecycle: this.lifecycle,
      backend: {
        kind: this.rendererConfiguration?.backend ?? rendererLoss?.backend ?? null,
        lossState: rendererLoss?.state ?? 'unavailable',
      },
      revisions: this.revisionStamp(),
      counts: {
        roots: semantic.scene.counts.rootElements,
        elements,
        components,
        materialized: elements + components,
        text: semantic.text.sourceCount,
        relations: countPatchMapRelationLinks(this.materialized?.dataset ?? []),
      },
      activeWork: {
        gestures: surfaceDebug.activeGestureCount ?? 0,
        animations: surfaceDebug.activeAnimationCount,
        pendingAssets: assetProbe?.pendingCount ?? 0,
        pendingWork: this.pendingWork,
      },
      resources: {
        canvases: canvasCount,
        listeners: this.subscriptionCount(),
        observers:
          operationsProbe.diagnosticObserverCount + operationsProbe.telemetryObserverCount,
        tickers: 0,
        textureLeases: assetProbe?.leaseCount ?? 0,
        callbackRegistrations: operationsProbe.callbackRegistrations,
      },
      cleanup: {
        destroyed: this.lifecycle === 'destroyed',
        released:
          this.lifecycle === 'destroyed'
          && canvasCount === 0
          && this.pendingWork === 0
          && operationsProbe.callbackRegistrations === 0,
      },
    });
  }

  public semanticProbe(): PatchMapSemanticProductProbe {
    const viewport = this.viewportAuthority.snapshot();
    const surfaceDebug = this.surface?.debugSnapshot() ?? emptySurfaceDebug(
      viewport.width,
      viewport.height,
      viewport.pixelRatio,
    );
    return createPatchMapSemanticProbe(this.materialized, {
      lifecycle: this.lifecycle,
      datasetRef: this.datasetRef,
      interactionMode: this.hostInteractions.modeProbe().activeState,
      selectionIds: this.logicalSelectionIds,
      activeAnimationCount: surfaceDebug.activeAnimationCount,
      ...(surfaceDebug.activeGestureCount === undefined
        ? {}
        : { activeGestureCount: surfaceDebug.activeGestureCount }),
      historyDepth: this.history.state().undoDepth,
    });
  }

  public sceneImageProbe(): PatchMapEngineSceneImagesProbe | null {
    return this.requireSurface('sceneImageProbe').sceneImageProbe?.() ?? null;
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

  /**
   * Join the detached semantic component index with an optional renderer
   * surface probe. Legacy/injected surfaces stay observable as unavailable;
   * no fixture values or scene-wide scans are used as fallbacks.
   */
  public componentVisualProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapEngineComponentVisualProbe | null {
    const normalizedTarget = normalizeEngineComponentVisualTarget(target);
    const surface = this.requireSurface('componentVisualProbe');
    const visual = surface.componentVisualProbe?.(normalizedTarget) ?? null;
    const semanticOwnerId = visual?.semanticOwnerId ?? normalizedTarget.ownerId;
    const semantic = this.componentSemantics.get(componentSemanticKey(
      semanticOwnerId,
      normalizedTarget.componentId,
    )) ?? null;
    if (semantic === null && visual === null) return null;
    return Object.freeze({
      target: normalizedTarget,
      semantic,
      entityId: visual?.entityId ?? null,
      logicalIdentity: visual?.logicalIdentity ?? null,
      componentType: visual?.componentType ?? semantic?.componentType ?? null,
      renderRole: visual?.renderRole ?? null,
      entityKind: visual?.entityKind ?? null,
      geometry: visual?.geometry ?? null,
      publication: visual?.publication ?? null,
      sceneImage: visual?.sceneImage ?? null,
      rendererPaint: visual?.rendererPaint ?? null,
      renderLanes: visual?.renderLanes ?? null,
      revisions: this.revisionStamp(),
      availability: Object.freeze({
        semantic: semantic !== null,
        surface: visual !== null,
        rendererPaint: visual?.rendererPaint !== null && visual?.rendererPaint !== undefined,
        renderLanes: visual?.renderLanes !== null && visual?.renderLanes !== undefined,
      }),
    });
  }

  public barPresentationProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapEngineBarPresentationProbe | null {
    const normalizedTarget = normalizeEngineComponentVisualTarget(target);
    const probe = this.requireSurface('barPresentationProbe')
      .barPresentationProbe?.(normalizedTarget) ?? null;
    if (probe === null) return null;
    return Object.freeze({
      ...probe,
      revisions: this.revisionStamp(),
      publishedTuple: this.publishedTuple,
      frameRevision: this.frameRevision,
    });
  }

  public paintOrderProbe(): PatchMapEnginePaintOrderProbe | null {
    const probe = this.requireSurface('paintOrderProbe').paintOrderProbe?.() ?? null;
    if (probe === null) return null;
    return Object.freeze({
      ...probe,
      revisions: this.revisionStamp(),
      publishedTuple: this.publishedTuple,
      frameRevision: this.frameRevision,
      history: this.history.state(),
    });
  }

  /**
   * Resolve text through prebuilt semantic and surface indexes. No probe-time
   * traversal of materialized datasets, dense snapshots, or Pixi children is
   * permitted on this path.
   */
  public textProbe(target: PatchMapTextTarget): PatchMapEngineTextProbe | null {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') return null;
    const normalizedTarget = normalizePatchMapTextTarget(target);
    const surface = this.requireSurface('textProbe');
    const requestedSemantic = this.textSemantics.get(engineTextTargetKey(normalizedTarget)) ?? null;
    const visual = surface.textProbe?.(normalizedTarget) ?? null;
    if (visual === null && requestedSemantic?.gridTemplate) return null;

    const semantic = visual?.semanticOwnerId && normalizedTarget.kind === 'component'
      ? this.textSemantics.get(engineTextTargetKey({
          kind: 'component',
          ownerId: visual.semanticOwnerId,
          id: normalizedTarget.id,
        })) ?? requestedSemantic
      : requestedSemantic;
    if (semantic === null && visual === null) return null;

    const currentRevisions = this.revisionStamp();
    const publishedCurrent = this.publishedTuple.scene === this.sceneRevision &&
      this.publishedTuple.view === this.viewRevision &&
      this.publishedTuple.interaction === this.interactionRevision;
    const status: PatchMapEngineTextPublicationStatus = surfaceTextProbeIsAbsent(visual)
      ? 'absent'
      : surfaceTextProbeIsCurrent(visual) && publishedCurrent
        ? 'current'
        : visual === null
          ? 'unavailable'
          : 'pending';
    const revisionTuple: PatchMapEngineTextRevisionTuple = Object.freeze({
      current: currentRevisions,
      published: this.publishedTuple,
      frameRevision: this.frameRevision,
      surfaceSceneRevision: visual?.publication.sceneRevision ?? null,
      surfaceRenderedSceneRevision: visual?.publication.renderedSceneRevision ?? null,
      rendererFrame: visual?.publication.rendererFrame ?? null,
    });
    const rendererAvailable = visual !== null &&
      visual.renderer.route !== null &&
      visual.renderer.route !== 'none' &&
      visual.renderer.rendererKind !== 'none' &&
      visual.renderer.route === visual.renderer.rendererKind;
    return Object.freeze({
      target: normalizedTarget,
      semantic: semantic?.probe ?? null,
      semanticOwnerId: visual?.semanticOwnerId ?? semantic?.probe.semanticOwnerId ?? null,
      entityId: visual?.entityId ?? null,
      projection: visual?.semantic ?? null,
      geometry: visual?.geometry ?? null,
      state: visual?.state ?? null,
      transform: visual?.transform ?? null,
      renderer: visual?.renderer ?? null,
      rendererPaint: visual?.rendererPaint ?? null,
      renderLanes: visual?.renderLanes ?? null,
      publication: Object.freeze({ status, revisions: revisionTuple }),
      availability: Object.freeze({
        semantic: semantic !== null,
        surface: visual !== null,
        renderer: rendererAvailable,
        rendererPaint: visual?.rendererPaint !== null && visual?.rendererPaint !== undefined,
        renderLanes: visual?.renderLanes !== null && visual?.renderLanes !== undefined,
      }),
    });
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
    const { revision: _surfaceRevision, sceneRevision: _denseRevision, ...facts } = geometry;
    const correlation = this.correlateGeometryRevision(geometry.revision ?? null);
    return Object.freeze({
      ...facts,
      ...correlation,
    });
  }

  public relationProbe(): PatchMapEngineRelationProbe | null {
    const surface = this.requireSurface('relationProbe');
    const geometry = surface.geometrySnapshot?.() ?? null;
    if (geometry === null) return null;
    const correlation = this.correlateGeometryRevision(geometry.revision ?? null);
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
    return this.requireSurface('interactionOwnershipProbe').interactionOwnershipProbe?.() ?? null;
  }

  public pixiPublicSurfaceProbe(): PatchMapEnginePixiPublicSurfaceProbe | null {
    const surface = this.requireSurface('pixiPublicSurfaceProbe');
    const probe = surface.pixiPublicSurfaceProbe?.() ?? null;
    if (probe === null) return null;
    return Object.freeze({
      ...probe,
      lifecycle: this.lifecycle,
      revisions: this.revisionStamp(),
      canvasCount: surface.canvasCount,
    });
  }

  public aggregateRenderOwnerProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapAggregateRenderOwnerProbe | null {
    const normalized = normalizeEngineComponentVisualTarget(target);
    const logicalTarget = this.logicalSceneIndex().target({
      kind: 'component',
      ownerId: normalized.ownerId,
      id: normalized.componentId,
    });
    const visual = this.componentVisualProbe(normalized);
    if (
      logicalTarget === null ||
      visual === null ||
      visual.entityId === null ||
      visual.geometry === null
    ) {
      return null;
    }
    const laneRole = visual.rendererPaint?.lane ?? componentRenderLane(visual.renderRole);
    return Object.freeze({
      target: normalized,
      logicalTarget,
      entityId: visual.entityId,
      aggregateRenderOwnerId:
        `render-owner:${normalized.ownerId}/${normalized.componentId}`,
      rendererKind: visual.rendererPaint?.rendererKind ?? null,
      renderLane: laneRole === null ? null : visual.renderLanes?.[laneRole] ?? null,
      worldBounds: visual.geometry.worldBounds,
      visible: visual.geometry.visible,
      revisions: this.revisionStamp(),
      publishedTuple: this.publishedTuple,
      frameRevision: this.frameRevision,
    });
  }

  public rendererLossProbe(): PatchMapEngineRendererLossProbe | null {
    if (
      (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') &&
      this.terminalRendererLossProbe !== null
    ) {
      return Object.freeze({
        ...this.terminalRendererLossProbe,
        revisions: this.revisionStamp(),
        publishedTuple: this.publishedTuple,
        canvasCount: 0,
      });
    }
    const surface = this.requireSurface('rendererLossProbe');
    const probe = surface.rendererLossProbe?.() ?? null;
    if (probe === null) return null;
    return Object.freeze({
      ...probe,
      revisions: this.revisionStamp(),
      publishedTuple: this.publishedTuple,
      canvasCount: surface.canvasCount,
    });
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
    const surface = this.requireSurface('canvasHandle');
    return this.canvasHandleForSurface(surface, 'canvasHandle');
  }

  private canvasHandleForSurface(
    surface: PatchMapEngineSurface,
    operation: string,
  ): PatchMapEngineCanvasHandle {
    const canvas = surface.canvasElement?.() ?? null;
    if (canvas === null || this.authoritativeCanvas === null) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        operation,
        false,
      );
    }
    if (canvas !== this.authoritativeCanvas) {
      throw this.operationError(
        'RENDERER_LOST',
        'RENDERER_LOST',
        operation,
        true,
      );
    }
    const debug = surface.debugSnapshot();
    return Object.freeze({
      element: canvas,
      identity: 'initial-canvas',
      cssSize: Object.freeze([...debug.cssSize] as [number, number]),
      backingSize: Object.freeze([...debug.backingSize] as [number, number]),
    });
  }

  public async extractPublishedScene(
    request: PatchMapEngineExtractionRequest,
  ): Promise<PatchMapEngineExtractionResult> {
    validateExtractionRequest(request);
    const surface = this.requireSurface('extractPublishedScene');
    if (surface.captureBase64 === undefined) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'extractPublishedScene',
        false,
      );
    }
    const rendererLoss = surface.rendererLossProbe?.() ?? null;
    if (rendererLoss?.contextLost === true || rendererLoss?.state === 'lost') {
      throw this.operationError(
        'RENDERER_LOST',
        'RENDERER_LOST',
        'extractPublishedScene',
        true,
      );
    }
    const extractionPreflight = this.extractionSecurity.preflight();
    if (extractionPreflight.code !== null) {
      const diagnostic = Object.freeze({
        ...this.operationDiagnostic(
          extractionPreflight.code,
          'EXTRACTION_FAILURE',
          'extractPublishedScene',
          true,
        ),
        ...(extractionPreflight.sanitizedAssetId === null
          ? {}
          : { sanitizedAssetId: extractionPreflight.sanitizedAssetId }),
      });
      const failure = new PatchMapError(diagnostic);
      this.emit('diagnostic', diagnostic);
      throw failure;
    }
    if (!samePublishedTuple(this.publishedTuple, request.targetTuple)) {
      throw this.operationError(
        'STALE_TARGET',
        'STALE_TARGET',
        'extractPublishedScene',
        true,
      );
    }
    const before = this.canvasHandleForSurface(surface, 'extractPublishedScene');
    if (
      before.cssSize[0] !== request.cssSize[0] ||
      before.cssSize[1] !== request.cssSize[1]
    ) {
      throw this.operationError(
        'INVALID_VALUE',
        'INVALID_INPUT',
        'extractPublishedScene',
        true,
      );
    }

    this.pendingWork += 1;
    try {
      const dataUrl = await surface.captureBase64();
      if (this.surface !== surface || this.isDestroyingOrDestroyed()) {
        throw this.operationError(
          'DESTROYED',
          'DESTROYED',
          'extractPublishedScene',
          false,
        );
      }
      if (!samePublishedTuple(this.publishedTuple, request.targetTuple)) {
        throw this.operationError(
          'SUPERSEDED',
          'SUPERSEDED',
          'extractPublishedScene',
          true,
        );
      }
      const after = this.canvasHandleForSurface(surface, 'extractPublishedScene');
      if (before.element !== after.element) {
        throw this.operationError(
          'RENDERER_LOST',
          'RENDERER_LOST',
          'extractPublishedScene',
          true,
        );
      }
      if (!dataUrl.startsWith('data:image/png;base64,')) {
        throw this.operationError(
          'EXTRACTION_READBACK_FAILED',
          'EXTRACTION_FAILURE',
          'extractPublishedScene',
          true,
        );
      }
      return Object.freeze({
        capturedTuple: Object.freeze({ ...request.targetTuple }),
        cssSize: after.cssSize,
        backingSize: after.backingSize,
        mime: 'image/png',
        dataUrl,
        canvasIdentity: after.identity,
        authoritativeCanvasRetained: true,
        temporaryImageCount: 0,
        renderTextureCount: 0,
      });
    } catch (error) {
      const rendererLoss = surface.rendererLossProbe?.() ?? null;
      const failure = error instanceof PatchMapError
        ? error
        : rendererLoss?.contextLost === true || rendererLoss?.state === 'lost'
          ? this.operationError(
              'RENDERER_LOST',
              'RENDERER_LOST',
              'extractPublishedScene',
              true,
            )
        : this.operationError(
            extractionFailureCode(error),
            'EXTRACTION_FAILURE',
            'extractPublishedScene',
            true,
          );
      if (!this.isDestroyingOrDestroyed()) {
        this.emit('diagnostic', failure.diagnostic);
      }
      throw failure;
    } finally {
      this.pendingWork -= 1;
    }
  }

  public historyState(): PatchMapHistoryState {
    this.requireSurface('historyState');
    return this.history.state();
  }

  public historyInspection(): PatchMapHistoryInspection<
    readonly NormalizedPatchMapElement[],
    PatchMapEngineHistoryCompanion
  > {
    this.requireSurface('historyInspection');
    return this.history.inspect();
  }

  public historyCompanionState(): PatchMapEngineHistoryCompanionState {
    this.requireSurface('historyCompanionState');
    return this.historyCompanionForSelection(this.logicalSelectionIds);
  }

  /**
   * Stage detached host editor state before a compound transaction. Recognized
   * `selectedIds` and `mode` fields join Engine interaction authority; all JSON
   * fields remain available as the opaque reversible host companion.
   */
  public setHistoryCompanion(
    value: PatchMapMutationJsonValue,
  ): PatchMapEngineHistoryCompanionState {
    const surface = this.requireSurface('setHistoryCompanion');
    const detached = detachPatchMapMutationJsonValue(value, '$.historyCompanion');
    const previousSelection = this.logicalSelectionIds;
    const previousMode = this.hostInteractions.modeProbe().activeState;
    const next = this.nextHistoryCompanion(
      detached,
      previousSelection,
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
    );
    surface.select(next.selectionIds);
    this.logicalSelectionIds = next.selectionIds;
    this.hostInteractions.applyModeOperation({ op: 'replace', state: next.mode });
    this.historyHostCompanion = next.hostCompanion;
    if (
      !sameStringArray(previousSelection, next.selectionIds) ||
      previousMode !== next.mode ||
      next.hostCompanion !== null
    ) {
      this.interactionRevision += 1;
    }
    return this.historyCompanionForSelection(this.logicalSelectionIds);
  }

  public setHistoryCapacity(capacity: number): PatchMapEngineHistoryCapacityResult {
    this.requireSurface('setHistoryCapacity');
    try {
      const change = this.history.setCapacity(capacity);
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
        history: this.history.state(),
      });
    }
  }

  public clearHistory(): PatchMapEngineHistoryClearResult {
    this.requireSurface('clearHistory');
    return this.clearHistoryAuthority('host', true);
  }

  public handleHistoryShortcut(
    input: PatchMapHistoryShortcutInput,
  ): PatchMapHistoryShortcutResult {
    this.requireSurface('handleHistoryShortcut');
    const action = resolvePatchMapHistoryShortcut(input);
    if (action === null || !patchMapOwnsKeyboardInput(input.pathKind)) {
      return Object.freeze({
        action,
        handled: false,
        preventDefault: false,
        result: null,
      });
    }
    const result = action === 'undo' ? this.undo() : this.redo();
    return Object.freeze({
      action,
      handled: true,
      preventDefault: true,
      result,
    });
  }

  public undo(): PatchMapEngineHistoryResult {
    this.cancelActiveTransformerEdit('redraw', true);
    return this.applyHistory('undo');
  }

  public redo(): PatchMapEngineHistoryResult {
    this.cancelActiveTransformerEdit('redraw', true);
    return this.applyHistory('redo');
  }

  public async destroy(): Promise<boolean> {
    if (this.lifecycle === 'destroying') return false;
    if (this.lifecycle === 'destroyed') return this.retryDestroyedCleanup();
    this.frameLoop?.destroy();
    this.frameLoop = null;
    this.frameLoopPausedForVisibility = false;
    this.cancelActiveTransformerEdit('destroy', false);
    this.lifecycle = 'destroying';
    this.submissionSequence += 1;
    this.loadSequence += 1;
    const surface = this.surface;
    this.viewportAuthority.cancelMotion();
    surface?.cancelViewportGestures?.();
    this.pointerGestureAuthority?.destroy();
    this.pointerGestureAuthority = null;
    this.transformerGestures.destroy();
    this.editorWorkflows.destroy();
    this.pageLifecycle.destroy();
    this.hostInteractions.destroy();
    this.accessibility.destroy();
    this.operations.disposeCallbacks();
    const pendingInitialization = this.initializePromise;
    const assetSession = this.assetSession;
    const cleanupFailures: unknown[] = [];
    const requiredAcquisitions = this.requiredAssetAcquisitions.splice(0);
    let assetCleanup: Promise<void>;
    if (surface) {
      const cleanup = await this.cleanupSurface(surface);
      if (cleanup.error) cleanupFailures.push(cleanup.error);
      assetCleanup = this.destroyAssetSession(assetSession, requiredAcquisitions);
    } else {
      // Starting asset teardown cancels a required acquisition that may be
      // holding initialization open. The late surface, if any, is retained by
      // the initialization continuation until this destroy owns it below.
      assetCleanup = this.destroyAssetSession(assetSession, requiredAcquisitions);
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
    let assetCleanupSucceeded = assetSession === null;
    try {
      await assetCleanup;
      assetCleanupSucceeded = true;
    } catch (error) {
      cleanupFailures.push(error);
    }
    this.surface = null;
    this.authoritativeCanvas = null;
    if (this.materialized !== null) {
      releasePatchMapSemanticHashScratch(this.materialized.dataset);
    }
    this.materialized = null;
    this.defaultViewportContributorsCache = null;
    this.logicalSceneIndexCache = null;
    this.logicalSelectionIds = Object.freeze([]);
    this.resetLiveOverlayState();
    this.viewportAuthority.destroy();
    this.externalDependencyRevisions.clear();
    this.clearHistoryAuthority('destroy', true);
    this.history.destroy();
    this.historyHostCompanion = null;
    this.pendingHistoryPublications = Object.freeze([]);
    this.componentSemantics.clear();
    this.textSemantics.clear();
    this.pendingTransactionPlanMs = 0;
    this.lastTransactionPerformance = null;
    this.datasetRef = null;
    this.rendererConfiguration = null;
    this.initializePromise = null;
    this.assetSession = assetCleanupSucceeded ? null : assetSession;
    this.lifecycle = 'destroyed';
    this.emit('destroyed', Object.freeze({ lifecycleGeneration: this.lifecycleGeneration }));
    this.listeners.clear();
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
    if (this.assetSession && !this.assetSession.probe().destroyed) {
      try {
        await this.assetSession.destroy();
        this.assetSession = null;
      } catch (error) {
        cleanupFailures.push(error);
      }
    } else if (this.assetSession?.probe().destroyed) {
      try {
        await this.assetSession.retryCleanup();
        this.assetSession = null;
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (cleanupFailures.length > 0) {
      throw this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'destroy', false);
    }
    return false;
  }

  private resetLiveOverlayState(): void {
    this.latestOverlayAccepted = null;
    this.latestOverlayPublished = null;
    this.pendingOverlayPublication = null;
    this.overlayAcceptedCount = 0;
    this.overlayPublicationCount = 0;
  }

  private restoreTransformerPreview(active: PatchMapTransformerEditSession): void {
    if (active.previewMaterialized === null) return;
    const surface = this.requireSurface('restoreTransformerPreview');
    if (!surface.reconcile) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'restoreTransformerPreview',
        false,
      );
    }
    if (active.transientPreview && surface.clearIncrementalPreview !== undefined) {
      surface.clearIncrementalPreview();
      if (!sameStringArray(this.logicalSelectionIds, active.startSelectionIds)) {
        surface.select(active.startSelectionIds);
        this.logicalSelectionIds = active.startSelectionIds;
      }
      this.interactionRevision += 1;
      return;
    }
    const incrementalRootIds = active.latestPlan?.status === 'planned'
      ? incrementalFlatRootIds(
          active.previewMaterialized.dataset,
          active.startMaterialized.dataset,
          active.latestPlan.operations,
        )
      : undefined;
    const reconcile = surface.reconcile(active.startMaterialized.dataset, {
      animateBarChanges: false,
      ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
      ...(!sameStringArray(this.logicalSelectionIds, active.startSelectionIds)
        ? { selectionIds: active.startSelectionIds }
        : {}),
    });
    if (reconcile.status === 'refused') {
      throw this.operationError(
        'CONFLICT',
        'CONFLICT',
        'restoreTransformerPreview',
        false,
      );
    }
    if (!sameStringArray(this.logicalSelectionIds, active.startSelectionIds)) {
      this.logicalSelectionIds = active.startSelectionIds;
    }
    this.interactionRevision += 1;
  }

  private cancelActiveTransformerEdit(
    reason: PatchMapGestureCancelReason,
    restoreSurface: boolean,
  ): NonNullable<PatchMapEngineTransformerCancelResult['gesture']> | null {
    const active = this.transformerEdits.current();
    if (active === null) return null;
    if (restoreSurface) this.restoreTransformerPreview(active);
    const gesture = this.cancelTransformerHandleGesture(active.pointerId, reason);
    this.transformerEdits.settle(active, 'cancelled');
    return gesture;
  }

  private applyHistory(direction: PatchMapHistoryDirection): PatchMapEngineHistoryResult {
    const surface = this.requireSurface(direction);
    const previousRevisions = this.revisionStamp();
    if (!surface.reconcile) {
      const diagnostic = this.operationDiagnostic(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        direction,
        false,
      );
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        direction,
        previousRevisions,
        revisions: this.revisionStamp(),
        sceneRevision: this.sceneRevision,
        semanticHash: this.materialized?.semanticHash ?? null,
        diagnostic,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
        history: this.history.state(),
      } satisfies PatchMapEngineHistoryResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    let failure: PatchMapEngineDiagnostic | null = null;
    let reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[] = EMPTY_RECONCILE_DIAGNOSTICS;
    const modeBefore = this.hostInteractions.modeProbe().activeState;
    const hostCompanionBefore = this.historyHostCompanion;
    const currentMaterialized = this.materialized ?? EMPTY_MATERIALIZED_DATASET;
    const apply = (transition: PatchMapEngineHistoryTransition): boolean => {
      let materialized: MaterializedPatchMapDataset;
      let componentSemantics: Map<string, PatchMapEngineComponentSemanticProbe>;
      let textSemantics: Map<string, IndexedEngineTextSemantic>;
      let incrementalRootIds: readonly string[] | undefined;
      let structuralRootDelta: PatchMapOwnedStructuralRootDelta | null;
      const selectionBefore = this.logicalSelectionIds;
      try {
        materialized = ownedPatchMapMaterialization(transition.snapshot.dataset) ??
          materializePatchMapDataset(transition.snapshot.dataset);
        incrementalRootIds = incrementalOwnedRootIds(
          currentMaterialized.dataset,
          materialized.dataset,
        );
        const orderScope = historyReconcileOrderScope(transition.command);
        structuralRootDelta =
          incrementalRootIds === undefined &&
          orderScope.allowedElementOrderIds.length > 0
            ? ownedStructuralRootDelta(
                currentMaterialized.dataset,
                materialized.dataset,
              )
            : null;
        componentSemantics = incrementalRootIds === undefined
          ? structuralRootDelta === null
            ? indexComponentSemantics(materialized.dataset)
            : reconcileStructuralComponentSemantics(
                this.componentSemantics,
                structuralRootDelta,
              )
          : reconcileFlatComponentSemantics(
              this.componentSemantics,
              currentMaterialized.dataset,
              materialized.dataset,
              incrementalRootIds,
            );
        textSemantics = incrementalRootIds === undefined
          ? structuralRootDelta === null
            ? indexTextSemantics(materialized.dataset)
            : reconcileStructuralTextSemantics(
                this.textSemantics,
                structuralRootDelta,
              )
          : reconcileFlatTextSemantics(
              this.textSemantics,
              currentMaterialized.dataset,
              materialized.dataset,
              incrementalRootIds,
            );
        const companion = transition.snapshot.companion;
        const mode = companion?.mode ?? 'select';
        if (!isPatchMapInteractionMode(mode)) {
          throw new TypeError('history companion mode is unsupported');
        }
        const requestedSelection = companion?.selectionIds ?? Object.freeze([]);
        const selection = incrementalRootIds === undefined
          ? structuralRootDelta === null
            ? this.validLogicalSelection(requestedSelection, materialized)
            : this.validOwnedStructuralSelection(requestedSelection, materialized)
          : this.validOwnedStableSelection(requestedSelection, materialized);
        const reconcile = surface.reconcile?.(materialized.dataset, {
          animateBarChanges: false,
          ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
          ...(orderScope.allowedElementOrderIds.length === 0
            ? {}
            : { structuralSharing: true }),
          ...(orderScope.allowedElementOrderIds.length === 0
            ? {}
            : { allowedElementOrderIds: orderScope.allowedElementOrderIds }),
          ...(orderScope.allowedComponentOrderOwners.length === 0
            ? {}
            : { allowedComponentOrderOwners: orderScope.allowedComponentOrderOwners }),
          ...(!sameStringArray(selectionBefore, selection)
            ? { selectionIds: selection }
            : {}),
        });
        if (reconcile === undefined) return false;
        reconcileDiagnostics = freezeReconcileDiagnostics(reconcile.diagnostics);
        if (reconcile.status === 'refused') {
          const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
          failure = this.operationDiagnostic('CONFLICT', 'CONFLICT', direction, true, datasetPath);
          return false;
        }
        this.logicalSelectionIds = selection;
        this.hostInteractions.applyModeOperation({ op: 'replace', state: mode });
        this.historyHostCompanion = companion?.hostCompanion ?? null;
      } catch (error) {
        failure = this.diagnosticFrom(error, direction);
        return false;
      }

      this.materialized = materialized;
      this.defaultViewportContributorsCache = null;
      this.logicalSceneIndexCache = null;
      this.componentSemantics = componentSemantics;
      this.textSemantics = textSemantics;
      this.sceneRevision += 1;
      this.lifecycle = materialized.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
      if (
        !sameStringArray(selectionBefore, this.logicalSelectionIds) ||
        modeBefore !== this.hostInteractions.modeProbe().activeState ||
        hostCompanionBefore !== this.historyHostCompanion
      ) {
        this.interactionRevision += 1;
      }
      return true;
    };

    const transition = direction === 'undo'
      ? this.history.undo(apply)
      : this.history.redo(apply);
    if (transition === null && failure !== null) {
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        direction,
        previousRevisions,
        revisions: this.revisionStamp(),
        sceneRevision: this.sceneRevision,
        semanticHash: this.materialized?.semanticHash ?? null,
        diagnostic: failure,
        reconcileDiagnostics,
        history: this.history.state(),
      } satisfies PatchMapEngineHistoryResult);
      this.emit('diagnostic', failure);
      return result;
    }
    if (transition === null) {
      return Object.freeze({
        status: 'unavailable',
        changed: false,
        direction,
        previousRevisions,
        revisions: this.revisionStamp(),
        sceneRevision: this.sceneRevision,
        semanticHash: this.materialized?.semanticHash ?? null,
        history: this.history.state(),
      } satisfies PatchMapEngineHistoryResult);
    }

    const materialized = this.materialized;
    if (materialized === null) throw new Error('history transition lost semantic authority');
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      direction,
      actionId: transition.command.id,
      recordCount: transition.command.recordCount,
      previousRevisions,
      revisions: this.revisionStamp(),
      sceneRevision: this.sceneRevision,
      semanticHash: materialized.semanticHash,
      publication: 'pending',
      history: this.history.state(),
    } satisfies PatchMapEngineHistoryResult);
    const restored = Object.freeze({
      direction,
      sceneRevision: this.sceneRevision,
      selectionIds: Object.freeze([...this.logicalSelectionIds]),
      mode: this.hostInteractions.modeProbe().activeState,
      publication: 'pending',
    } satisfies PatchMapEngineHistoryRestoredEvent);
    this.emit('semanticRestored', restored);
    this.emit('selectionReconciled', restored);
    this.emit(direction === 'undo' ? 'historyUndone' : 'historyRedone', result);
    this.pendingHistoryPublications = Object.freeze([
      ...this.pendingHistoryPublications,
      Object.freeze({ direction, sceneRevision: this.sceneRevision }),
    ]);
    return result;
  }

  private historySnapshot(): PatchMapSemanticHistorySnapshotInput<
    readonly NormalizedPatchMapElement[],
    PatchMapEngineHistoryCompanion
  > {
    return Object.freeze({
      dataset: this.materialized?.dataset ?? Object.freeze([]),
      companion: Object.freeze({
        selectionIds: Object.freeze([...this.logicalSelectionIds]),
        mode: this.hostInteractions.modeProbe().activeState,
        hostCompanion: this.historyHostCompanion,
      }),
    });
  }

  private rememberCommandTargetState(state: PatchMapCommandTargetState): void {
    this.commandTargetAuthorities.set(state, Object.freeze({
      lifecycleGeneration: this.lifecycleGeneration,
      targetIds: state.targetIds,
    }));
  }

  private historyCompanionForSelection(
    selectionIds: readonly string[],
  ): PatchMapEngineHistoryCompanion {
    return Object.freeze({
      selectionIds: Object.freeze([...selectionIds]),
      mode: this.hostInteractions.modeProbe().activeState,
      hostCompanion: this.historyHostCompanion,
    });
  }

  private nextHistoryCompanion(
    value: PatchMapMutationJsonValue | undefined,
    fallbackSelectionIds: readonly string[],
    materialized: MaterializedPatchMapDataset,
    stableIdentity = false,
    structuralIdentity = false,
  ): PatchMapEngineHistoryCompanion {
    const record = isPatchMapHistoryCompanionRecord(value) ? value : null;
    const selectedValue = record?.selectedIds;
    if (
      selectedValue !== undefined &&
      (
        !Array.isArray(selectedValue) ||
        selectedValue.some((entry) => typeof entry !== 'string')
      )
    ) {
      throw new TypeError('history companion selectedIds must be an array of strings');
    }
    const modeValue = record?.mode;
    if (modeValue !== undefined && !isPatchMapInteractionMode(modeValue)) {
      throw new TypeError('history companion mode is unsupported');
    }
    const requestedIds = selectedValue === undefined
      ? fallbackSelectionIds
      : selectedValue as readonly string[];
    const selectedIds = stableIdentity
      ? this.validOwnedStableSelection(requestedIds, materialized)
      : structuralIdentity
        ? this.validOwnedStructuralSelection(requestedIds, materialized)
        : this.validLogicalSelection(requestedIds, materialized);
    return Object.freeze({
      selectionIds: selectedIds,
      mode: modeValue === undefined
        ? this.hostInteractions.modeProbe().activeState
        : modeValue,
      hostCompanion: value === undefined ? this.historyHostCompanion : value,
    });
  }

  private clearHistoryAuthority(
    reason: PatchMapEngineHistoryClearResult['reason'],
    emitEvenIfUnchanged = false,
  ): PatchMapEngineHistoryClearResult {
    const changed = this.history.clear();
    this.pendingHistoryPublications = Object.freeze([]);
    const result = Object.freeze({
      changed,
      reason,
      history: this.history.state(),
    });
    if (changed || emitEvenIfUnchanged) this.emit('historyCleared', result);
    return result;
  }

  private validLogicalSelection(
    ids: readonly string[],
    materialized: MaterializedPatchMapDataset | null,
  ): readonly string[] {
    if (materialized === null || ids.length === 0) return Object.freeze([]);
    const index = materialized === this.materialized
      ? this.logicalSceneIndex()
      : new PatchMapLogicalSceneIndex(materialized.dataset);
    return Object.freeze(
      [...new Set(ids)].filter((id) => index.target(id) !== null),
    );
  }

  private validOwnedStructuralSelection(
    ids: readonly string[],
    materialized: MaterializedPatchMapDataset,
  ): readonly string[] {
    if (ids.length === 0) return Object.freeze([]);
    const elementIds = ownedPatchMapElementIds(materialized.dataset);
    if (elementIds === null) return this.validLogicalSelection(ids, materialized);
    const previousElementIds = this.materialized === null
      ? null
      : ownedPatchMapElementIds(this.materialized.dataset);
    const currentIndex = this.logicalSceneIndexCache?.index ?? null;
    const selected: string[] = [];
    for (const id of new Set(ids)) {
      if (elementIds.has(id)) {
        selected.push(id);
        continue;
      }
      const previousElementId = id.startsWith('element:')
        ? id.slice('element:'.length)
        : id;
      // A structural command removed this exact previously-owned element.
      // Its selection is deterministically dropped; building a 5,000-target
      // logical query snapshot cannot change that result.
      if (previousElementIds?.has(previousElementId)) continue;
      if (currentIndex === null) {
        return this.validLogicalSelection(ids, materialized);
      }
      const target = currentIndex.target(id);
      if (
        target !== null &&
        (
          elementIds.has(target.id) ||
          (target.ownerId !== null && elementIds.has(target.ownerId))
        )
      ) {
        selected.push(id);
      }
    }
    return Object.freeze(selected);
  }

  private validOwnedStableSelection(
    ids: readonly string[],
    materialized: MaterializedPatchMapDataset,
  ): readonly string[] {
    return Object.freeze(
      [...new Set(ids)].filter((id) => {
        const owned = this.ownedSelectionTargetExists(id, materialized);
        return owned ?? this.logicalSceneIdentityIndex().target(id) !== null;
      }),
    );
  }

  /**
   * Validate the stable element/component selection forms without rebuilding
   * the full logical query snapshot after an otherwise small structural edit.
   * Grid instance aliases remain on the canonical index fallback because they
   * are expanded query identities rather than owned dataset element IDs.
   */
  private ownedSelectionTargetExists(
    id: string,
    materialized: MaterializedPatchMapDataset,
  ): boolean | null {
    const elementIds = ownedPatchMapElementIds(materialized.dataset);
    if (elementIds === null) return null;
    if (elementIds.has(id)) return true;
    if (id.startsWith('element:')) {
      return elementIds.has(id.slice('element:'.length));
    }
    const componentKey = (ownerId: string, componentId: string): boolean =>
      this.componentSemantics.has(componentSemanticKey(ownerId, componentId));
    if (id.startsWith('component:')) {
      const body = id.slice('component:'.length);
      const separator = body.indexOf('/');
      return separator > 0 && separator < body.length - 1
        ? componentKey(body.slice(0, separator), body.slice(separator + 1))
        : false;
    }
    const ownerSeparator = id.indexOf('/');
    if (ownerSeparator > 0 && ownerSeparator < id.length - 1) {
      return componentKey(
        id.slice(0, ownerSeparator),
        id.slice(ownerSeparator + 1),
      );
    }
    const selectionSeparator = id.indexOf('::');
    const typeSeparator = selectionSeparator < 0
      ? -1
      : id.indexOf(':', selectionSeparator + 2);
    if (
      selectionSeparator > 0 &&
      typeSeparator > selectionSeparator + 2 &&
      typeSeparator < id.length - 1
    ) {
      const ownerId = id.slice(0, selectionSeparator);
      const componentType = id.slice(selectionSeparator + 2, typeSeparator);
      const componentId = id.slice(typeSeparator + 1);
      const semantic = this.componentSemantics.get(componentSemanticKey(
        ownerId,
        componentId,
      ));
      return semantic !== undefined && semantic.componentType === componentType;
    }
    return null;
  }

  private logicalSceneIndex(): PatchMapLogicalSceneIndex {
    const materialized = this.materialized ?? EMPTY_MATERIALIZED_DATASET;
    if (this.logicalSceneIndexCache?.materialized !== materialized) {
      let index = this.logicalSceneIndexesByMaterialized.get(materialized);
      if (index === undefined) {
        index = new PatchMapLogicalSceneIndex(materialized.dataset);
        this.logicalSceneIndexesByMaterialized.set(materialized, index);
      }
      this.logicalSceneIndexCache = Object.freeze({
        materialized,
        index,
      });
      this.logicalSelectionIndexesByMaterialized.set(materialized, index);
    }
    return this.logicalSceneIndexCache.index;
  }

  /**
   * Stable-identity transactions only need target membership validation.
   * Reuse an older value snapshot while IDs/hierarchy are proven unchanged;
   * ordinary query callers still rebuild through logicalSceneIndex() so
   * labels, values, order, and locks can never be stale.
   */
  private logicalSceneIdentityIndex(): PatchMapLogicalSceneIndex {
    return this.logicalSceneIndexCache?.index ?? this.logicalSceneIndex();
  }

  private logicalSceneSelectionIndex(): PatchMapLogicalSceneIndex {
    const materialized = this.materialized ?? EMPTY_MATERIALIZED_DATASET;
    let index = this.logicalSelectionIndexesByMaterialized.get(materialized);
    if (index === undefined) {
      index = new PatchMapLogicalSceneIndex(materialized.dataset);
      this.logicalSelectionIndexesByMaterialized.set(materialized, index);
    }
    return index;
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

  private requirePointerGestureAuthority(operation: string): PatchMapPointerGestureAuthority {
    const authority = this.pointerGestureAuthority;
    if (authority === null) {
      throw this.operationError('NOT_READY', 'NOT_READY', operation, true);
    }
    return authority;
  }

  private applyRegionSelection(
    hit: PatchMapRegionHitResult,
    options: PatchMapEngineRegionSelectionOptions,
    liveChangeCount: number,
  ): PatchMapEngineRegionSelectionResult {
    const index = this.logicalSceneIndex();
    const rejected = new Set(options.rejectIds ?? []);
    const locked = new Set(options.lockedIds ?? []);
    const filteredIds: string[] = [];
    const lockedIds: string[] = [];
    for (const id of hit.candidateIds) {
      const target = index.target(id);
      if (target === null) continue;
      if (
        target.locked ||
        target.ancestorLocked ||
        targetAliasesMatch(target, locked)
      ) {
        lockedIds.push(target.id);
      } else if (
        targetAliasesMatch(target, rejected) ||
        (options.predicate !== undefined && !options.predicate(target))
      ) {
        filteredIds.push(target.id);
      }
    }
    const targets = index.filterSelection(hit.candidateIds, {
      ...(options.rejectIds === undefined ? {} : { rejectIds: options.rejectIds }),
      ...(options.lockedIds === undefined ? {} : { lockedIds: options.lockedIds }),
      ...(options.predicate === undefined ? {} : { predicate: options.predicate }),
    });
    const change = options.commit === false
      ? null
      : this.applySelection({
          op: options.mode ?? 'replace',
          ids: targets.map((target) => target.selectionId),
          source: 'canvas',
        });
    return Object.freeze({
      schemaRevision: PATCH_MAP_POINTER_GESTURE_REVISION,
      targets,
      candidateIds: hit.candidateIds,
      filteredIds: Object.freeze(filteredIds),
      lockedIds: Object.freeze(lockedIds),
      relationIds: hit.relationIds,
      duplicateCount: hit.duplicateCount,
      nonFiniteCount: hit.nonFiniteCount,
      liveChangeCount,
      strokeCssPx: 1,
      change,
    });
  }

  private async cleanupSurface(
    surface: PatchMapEngineSurface,
  ): Promise<Readonly<{ released: boolean; error: Error | null }>> {
    let lastError: Error | null = null;
    let viewportCleanupFailed = false;
    if (this.surface === surface && this.surfaceViewportInputUnbind !== null) {
      try {
        this.surfaceViewportInputUnbind();
      } catch {
        lastError = new Error('PatchMap viewport input cleanup failed');
        viewportCleanupFailed = true;
      } finally {
        this.surfaceViewportInputUnbind = null;
      }
    }
    if (this.surface === surface && this.surfacePointerInputUnbind !== null) {
      try {
        this.surfacePointerInputUnbind();
      } catch {
        lastError = new Error('PatchMap pointer input cleanup failed');
        viewportCleanupFailed = true;
      } finally {
        this.surfacePointerInputUnbind = null;
      }
    }
    if (
      this.surface === surface &&
      this.surfaceAccessibilityActivationUnbind !== null
    ) {
      try {
        this.surfaceAccessibilityActivationUnbind();
      } catch {
        lastError = new Error(
          'PatchMap accessibility activation cleanup failed',
        );
        viewportCleanupFailed = true;
      } finally {
        this.surfaceAccessibilityActivationUnbind = null;
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let attemptFailed = false;
      try {
        await surface.destroy();
        const rendererLoss = surface.rendererLossProbe?.() ?? null;
        if (rendererLoss?.destroyed === true) {
          this.terminalRendererLossProbe = rendererLoss;
        }
      } catch {
        lastError = new Error('PatchMap surface cleanup failed');
        attemptFailed = true;
      }
      if (surface.canvasCount === 0) {
        if (this.surface === surface) this.surface = null;
        if (this.retainedCleanupSurface === surface) this.retainedCleanupSurface = null;
        return Object.freeze({
          released: true,
          error: attemptFailed || viewportCleanupFailed ? lastError : null,
        });
      }
      if (!attemptFailed) lastError = new Error('PatchMap surface retained a canvas after destroy');
    }
    this.surface = this.surface === surface ? null : this.surface;
    this.retainedCleanupSurface = surface;
    return Object.freeze({ released: false, error: lastError });
  }

  private destroyAssetSession(
    assetSession: PatchMapAssetSession | null,
    requiredAcquisitions: readonly PatchMapAssetAcquisition[],
  ): Promise<void> {
    if (assetSession) return assetSession.destroy();
    return Promise.allSettled(
      requiredAcquisitions.map(async (acquisition) => acquisition.release()),
    ).then((settlements) => {
      if (rejectedReasons(settlements).length > 0) throw assetInternalEngineCleanupFailure();
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
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
      viewRevision: this.viewRevision,
      interactionRevision: this.interactionRevision,
    });
  }

  private correlateGeometryRevision(surfaceRevision: number | null): Readonly<{
    readonly revision: number | null;
    readonly surfaceRevision: number | null;
    readonly representedRevisions: PatchMapGeometryRevisionTuple | null;
    readonly revisionLags: PatchMapGeometryRevisionTuple | null;
    readonly revisionLag: number | null;
  }> {
    if (surfaceRevision === null || !Number.isFinite(surfaceRevision)) {
      return Object.freeze({
        revision: null,
        surfaceRevision: null,
        representedRevisions: null,
        revisionLags: null,
        revisionLag: null,
      });
    }
    if (this.geometryRevisionCorrelation?.surfaceRevision !== surfaceRevision) {
      this.geometryRevisionCorrelation = Object.freeze({
        surfaceRevision,
        representedRevisions: Object.freeze({
          scene: this.sceneRevision,
          view: this.viewRevision,
          interaction: this.interactionRevision,
        }),
      });
    }
    const representedRevisions = this.geometryRevisionCorrelation.representedRevisions;
    const revisionLags = Object.freeze({
      scene: this.sceneRevision - representedRevisions.scene,
      view: this.viewRevision - representedRevisions.view,
      interaction: this.interactionRevision - representedRevisions.interaction,
    });
    return Object.freeze({
      revision: representedRevisions.scene,
      surfaceRevision,
      representedRevisions,
      revisionLags,
      revisionLag: revisionLags.scene,
    });
  }

  private assertCooperativeLoadCurrent(
    surface: PatchMapEngineSurface,
    sequence: number,
    lifecycleGeneration: number,
    sceneRevision: number,
  ): void {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      throw this.operationError('DESTROYED', 'DESTROYED', 'loadDatasetAsync', false);
    }
    if (
      this.surface !== surface ||
      this.loadSequence !== sequence ||
      this.lifecycleGeneration !== lifecycleGeneration ||
      this.sceneRevision !== sceneRevision
    ) {
      throw this.operationError('SUPERSEDED', 'SUPERSEDED', 'loadDatasetAsync', true);
    }
  }

  private acceptSurfaceViewportInput(
    surface: PatchMapEngineSurface,
    input: PatchMapSurfaceViewportInput,
  ): void {
    if (
      this.surface !== surface ||
      this.lifecycle === 'destroyed' ||
      this.lifecycle === 'destroying'
    ) {
      return;
    }
    const effect = this.viewportAuthority.planSurfaceAppliedView(
      input.centerWorld,
      input.scale,
    );
    this.commitViewportEffect(surface, effect, input.source);
  }

  private acceptSurfacePointerInput(
    surface: PatchMapEngineSurface,
    input: PatchMapSurfacePointerInput,
  ): void {
    if (
      this.surface !== surface ||
      this.lifecycle === 'destroyed' ||
      this.lifecycle === 'destroying'
    ) {
      return;
    }
    this.dispatchPointerInput(input);
  }

  private requireSurface(operation: string): PatchMapEngineSurface {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      throw this.operationError('DESTROYED', 'DESTROYED', operation, false);
    }
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
    if (this.assetSession) {
      if (this.assetSession.instanceId !== instanceId) {
        throw new PatchMapAssetError('CONFLICT', 'CONFLICT', false);
      }
      return this.assetSession;
    }
    if (this.instanceId !== null && this.instanceId !== instanceId) {
      throw new PatchMapAssetError('CONFLICT', 'CONFLICT', false);
    }
    this.assetSession = this.assetRuntime.createSession({
      instanceId,
      ...(this.assetPolicy ? { policy: this.assetPolicy } : {}),
    });
    return this.assetSession;
  }

  private assetInitializationError(error: unknown): PatchMapError {
    if (error instanceof PatchMapError) return error;
    if (error instanceof PatchMapPixiRuntimeError) {
      return this.operationError(error.code, error.code, 'initialize', false);
    }
    if (error instanceof PatchMapAssetError) {
      return this.operationError(
        error.code,
        error.category,
        'initialize',
        error.retryable,
      );
    }
    return this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'initialize', false);
  }

  private diagnosticFrom(error: unknown, operation: string): PatchMapEngineDiagnostic {
    if (error instanceof PatchMapDatasetError) {
      return this.operationDiagnostic(error.code, error.category, operation, true, error.datasetPath);
    }
    if (error instanceof PatchMapError) return error.diagnostic;
    if (error instanceof PatchMapPixiRuntimeError) {
      return this.operationDiagnostic(error.code, error.code, operation, false);
    }
    if (error instanceof PatchMapPresentationError) {
      return this.operationDiagnostic('CONFLICT', 'CONFLICT', operation, true);
    }
    if (error instanceof PatchMapAssetError) {
      return this.operationDiagnostic(error.code, error.category, operation, error.retryable);
    }
    return this.operationDiagnostic('INTERNAL_FAILURE', 'INTERNAL_FAILURE', operation, false);
  }

  private semanticMutationDiagnostic(
    diagnostic: PatchMapSemanticMutationDiagnostic,
    target: PatchMapSemanticTarget | null,
    operation = 'patch',
  ): PatchMapEngineDiagnostic {
    const mapping = mutationDiagnosticMapping(diagnostic);
    const base = this.operationDiagnostic(
      mapping.code,
      mapping.category,
      operation,
      mapping.recoverable,
      diagnostic.path,
    );
    return Object.freeze({
      ...base,
      missingCount: diagnostic.reason === 'missing-target' && target ? 1 : 0,
    });
  }

  private engineTransactionDiagnostic(
    diagnostic: PatchMapMutationTransactionDiagnostic,
    operation: string,
  ): PatchMapEngineDiagnostic {
    const category: PatchMapDiagnosticCategory = diagnostic.category === 'MISSING_TARGET'
      ? 'MISSING_TARGET'
      : diagnostic.category === 'CONFLICT'
        ? 'CONFLICT'
      : diagnostic.category === 'UNSUPPORTED_RUNTIME'
        ? 'UNSUPPORTED_RUNTIME'
        : 'INVALID_INPUT';
    const base = this.operationDiagnostic(
      diagnostic.code,
      category,
      operation,
      true,
      diagnostic.path,
    );
    return Object.freeze({
      ...base,
      missingCount: diagnostic.category === 'MISSING_TARGET' ? 1 : 0,
    });
  }

  private rejectedTransactionResult(
    actionId: string | null,
    previousRevisions: PatchMapRevisionStamp,
    diagnostic: PatchMapEngineDiagnostic,
    transactionDiagnostic: PatchMapMutationTransactionDiagnostic | undefined,
    history: PatchMapHistoryState,
  ): Extract<PatchMapEngineTransactionResult, { readonly status: 'rejected' }> {
    return Object.freeze({
      status: 'rejected',
      changed: false,
      actionId,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.materialized?.semanticHash ?? null,
      applied: freezeMutationTargets([]),
      missing: freezeMutationTargets([]),
      unchanged: freezeMutationTargets([]),
      history: freezeTransactionHistory(false, null, history, history),
      diagnostic,
      ...(transactionDiagnostic === undefined ? {} : { transactionDiagnostic }),
    });
  }

  private refusedTransactionResult(
    actionId: string | null,
    previousRevisions: PatchMapRevisionStamp,
    diagnostic: PatchMapEngineDiagnostic,
    _plan: Extract<
      ReturnType<typeof planPatchMapMutationTransaction>,
      { readonly status: 'planned' }
    >,
    history: PatchMapHistoryState,
    reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
  ): Extract<PatchMapEngineTransactionResult, { readonly status: 'refused' }> {
    return Object.freeze({
      status: 'refused',
      changed: false,
      actionId,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.materialized?.semanticHash ?? null,
      applied: freezeMutationTargets([]),
      missing: freezeMutationTargets([]),
      unchanged: freezeMutationTargets([]),
      history: freezeTransactionHistory(false, null, history, history),
      diagnostic,
      reconcileDiagnostics,
    });
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

  private refusedPatchResult(
    target: PatchMapSemanticTarget,
    previousRevisions: PatchMapRevisionStamp,
    code: string,
    category: PatchMapDiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
  ): Extract<PatchMapEnginePatchResult, { readonly status: 'refused' }> {
    const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
    const diagnostic = this.operationDiagnostic(
      code,
      category,
      'patch',
      recoverable,
      datasetPath,
    );
    const result = Object.freeze({
      status: 'refused',
      changed: false,
      target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.materialized?.semanticHash ?? null,
      applied: EMPTY_TARGETS,
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      diagnostic,
      reconcileDiagnostics,
    } satisfies PatchMapEnginePatchResult);
    this.emit('diagnostic', diagnostic);
    return result;
  }

  private refusedDestroyTargetResult(
    target: Extract<PatchMapSemanticTarget, { readonly kind: 'element' }>,
    previousRevisions: PatchMapRevisionStamp,
    code: string,
    category: PatchMapDiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
  ): Extract<PatchMapEngineDestroyTargetResult, { readonly status: 'refused' }> {
    const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
    const diagnostic = this.operationDiagnostic(
      code,
      category,
      'destroyTarget',
      recoverable,
      datasetPath,
    );
    const result = Object.freeze({
      status: 'refused',
      changed: false,
      target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.materialized?.semanticHash ?? null,
      applied: EMPTY_TARGETS,
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      diagnostic,
      reconcileDiagnostics,
    } satisfies PatchMapEngineDestroyTargetResult);
    this.emit('diagnostic', diagnostic);
    return result;
  }

  private subscriptionCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) count += listeners.size;
    return count;
  }

  private commitViewport(
    centerWorldValue: readonly [number, number],
    scale: number,
    source: PatchMapViewportChangeSource,
  ): PatchMapViewportChangeResult {
    const effect = this.viewportAuthority.planView(centerWorldValue, scale);
    const surface = this.requireSurface('setViewport');
    return this.commitViewportEffect(surface, effect, source);
  }

  private commitViewportEffect(
    surface: PatchMapEngineSurface,
    effect: PatchMapViewportViewEffect,
    source: PatchMapViewportChangeSource,
  ): PatchMapViewportChangeResult {
    const previousRevisions = this.revisionStamp();
    if (effect.changed) {
      if (!effect.surfaceAlreadyApplied) surface.setView(effect.surfaceView);
      const nextViewRevision = this.viewRevision + 1;
      this.viewportAuthority.commitView(effect, nextViewRevision);
      this.viewRevision = nextViewRevision;
      this.refreshAccessibilitySurfaceIfActive('setViewport');
    }
    const result = Object.freeze({
      changed: effect.changed,
      blocked: false,
      source,
      previous: effect.previous,
      viewport: effect.viewport,
      previousRevisions,
      revisions: this.revisionStamp(),
    } satisfies PatchMapViewportChangeResult);
    if (effect.changed) this.emit('viewChanged', result);
    return result;
  }

  private blockedViewportResult(
    source: PatchMapViewportChangeSource,
  ): PatchMapViewportChangeResult {
    const viewport = this.viewportAuthority.snapshot().viewport;
    const revisions = this.revisionStamp();
    return Object.freeze({
      changed: false,
      blocked: true,
      source,
      previous: viewport,
      viewport,
      previousRevisions: revisions,
      revisions,
    });
  }

  private resolveViewportContributors(
    options: PatchMapViewportTargetOptions,
  ): PatchMapViewportContributorResult {
    const surface = this.requireSurface('resolveViewportContributors');
    const materialized = this.materialized;
    if (materialized === null) {
      return Object.freeze({
        contributors: Object.freeze([]),
        applied: Object.freeze([]),
        missing: Object.freeze([...(options.targets ?? [])]),
        excluded: Object.freeze([]),
        duplicateCount: 0,
        worldBounds: null,
      });
    }
    const geometry = surface.worldGeometrySnapshot?.() ?? surface.geometrySnapshot?.();
    if (!geometry) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'resolveViewportContributors',
        false,
      );
    }
    const defaultRequest =
      (options.targets === undefined || options.targets === null) &&
      options.rejectIds === undefined &&
      options.relationEndpointsAvailable === undefined;
    const cached = this.defaultViewportContributorsCache;
    if (
      defaultRequest &&
      cached !== null &&
      cached.dataset === materialized.dataset &&
      cached.geometry === geometry
    ) {
      return cached.result;
    }
    const result = resolvePatchMapViewportContributors(materialized.dataset, geometry, {
      targets: options.targets ?? null,
      ...(options.rejectIds === undefined ? {} : { rejectIds: options.rejectIds }),
      ...(options.relationEndpointsAvailable === undefined
        ? {}
        : { relationEndpointsAvailable: options.relationEndpointsAvailable }),
    });
    if (defaultRequest) {
      this.defaultViewportContributorsCache = Object.freeze({
        dataset: materialized.dataset,
        geometry,
        result,
      });
    }
    return result;
  }

  private operationError(
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
  ): PatchMapError {
    return new PatchMapError(this.operationDiagnostic(code, category, operation, recoverable));
  }

  private operationDiagnostic(
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
    datasetPath?: string,
  ): PatchMapEngineDiagnostic {
    return Object.freeze({
      code,
      category,
      operation,
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
      revisionStamp: this.revisionStamp(),
      recoverable,
      retryable: recoverable,
      appliedCount: 0,
      missingCount: 0,
      unchangedCount: 0,
      ...(datasetPath === undefined ? {} : { datasetPath }),
    });
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
    if (this.frameLoop === null || this.pageLifecycle.probe().state === 'hidden') return;
    if (this.frameLoop.isDestroyed) {
      this.frameLoop = null;
      return;
    }
    this.frameLoop.request();
  }

  private deliverEngineEvent<K extends PatchMapEngineEvent>(
    event: K,
    value: PatchMapEngineEventMap[K],
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners === undefined) return;
    const callbackFailures: PatchMapSanitizedDiagnostic[] = [];
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener(value);
      } catch (error) {
        if (event === 'diagnostic') continue;
        callbackFailures.push(this.operations.reportDiagnostic({
          code: 'HOST_CALLBACK_FAILURE',
          category: 'HOST_CALLBACK_FAILURE',
          operation: `event:${event}`,
          lifecycleGeneration: this.lifecycleGeneration,
          sceneRevision: this.sceneRevision,
          revisionStamp: this.revisionStamp(),
          recoverable: true,
          retryable: false,
          details: error,
        }));
      }
    }
    for (const failure of callbackFailures) {
      this.deliverEngineEvent(
        'diagnostic',
        failure as PatchMapSanitizedDiagnostic & PatchMapEngineDiagnostic,
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

function normalizeOptionalSourceRevision(value: unknown): number | undefined {
  return value === undefined ? undefined : positiveSafeInteger(value, 'sourceRevision');
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function nonEmptyValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

async function releaseDatasetSubmission(
  submission: PatchMapDatasetSubmission,
  result: PatchMapDatasetSubmissionResult,
): Promise<void> {
  await submission.release?.(result);
}

function yieldPatchMapEngineTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function assetInternalEngineCleanupFailure(): Error {
  return new Error('PatchMap required asset cleanup failed');
}

export class PatchMapError extends Error {
  public readonly diagnostic: PatchMapEngineDiagnostic;

  public constructor(diagnostic: PatchMapEngineDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.operation}`);
    this.name = 'PatchMapError';
    this.diagnostic = diagnostic;
  }
}

function normalizeEngineComponentVisualTarget(
  target: PatchMapComponentVisualTarget,
): PatchMapComponentVisualTarget {
  if (target === null || typeof target !== 'object') {
    throw new TypeError('component visual target must be an object');
  }
  if (typeof target.ownerId !== 'string' || target.ownerId.length === 0) {
    throw new TypeError('component visual target ownerId must be a non-empty string');
  }
  if (typeof target.componentId !== 'string' || target.componentId.length === 0) {
    throw new TypeError('component visual target componentId must be a non-empty string');
  }
  return Object.freeze({ ownerId: target.ownerId, componentId: target.componentId });
}

function componentRenderLane(
  role: PatchMapComponentRenderRole | null,
): PatchMapRenderLaneRole | null {
  if (role === null) return null;
  if (role === 'background-asset') return 'background-assets';
  if (role === 'content-asset') return 'content-assets';
  return role;
}

function surfaceTextProbeIsCurrent(probe: PatchMapTextProductProbe | null): boolean {
  if (
    probe === null ||
    !probe.state.visible ||
    probe.publication.status !== 'current' ||
    probe.publication.sceneRevision !== probe.publication.renderedSceneRevision ||
    probe.publication.rendererFrame === null ||
    probe.renderer.route === null ||
    probe.renderer.route === 'none' ||
    probe.renderer.rendererKind === 'none' ||
    probe.renderer.route !== probe.renderer.rendererKind ||
    probe.renderer.objectCount !== 1 ||
    probe.renderer.staleGlyphCount !== 0 ||
    probe.renderer.lastRenderedFrame !== probe.publication.rendererFrame ||
    probe.renderer.attachedSignatures === null ||
    probe.renderer.lastRenderedSignatures === null ||
    probe.rendererPaint === null ||
    probe.renderLanes === null
  ) {
    return false;
  }
  const expected = {
    content: probe.semantic.contentSignature,
    style: probe.semantic.styleSignature,
    layout: probe.semantic.layoutSignature,
  };
  const semantic = probe.renderer.semanticSignatures;
  const attached = probe.renderer.attachedSignatures;
  const rendered = probe.renderer.lastRenderedSignatures;
  return semantic.content === expected.content &&
    semantic.style === expected.style &&
    semantic.layout === expected.layout &&
    attached.content === semantic.content &&
    attached.style === semantic.style &&
    attached.layout === semantic.layout &&
    rendered.content === attached.content &&
    rendered.style === attached.style &&
    rendered.layout === attached.layout &&
    rendered.renderer === attached.renderer &&
    probe.rendererPaint.entityId === probe.entityId &&
    probe.rendererPaint.lane === 'text' &&
    probe.rendererPaint.rendererKind === 'text' &&
    probe.rendererPaint.primitiveCount === 1 &&
    probe.rendererPaint.renderObjectCount === 1 &&
    probe.rendererPaint.packedTint === (probe.semantic.color >>> 0) &&
    probe.rendererPaint.rgbTint === (probe.semantic.color >>> 8) &&
    probe.rendererPaint.alpha ===
      (((probe.semantic.color >>> 0) & 0xff) / 255) * probe.state.opacity &&
    probe.renderLanes.text.role === 'text' &&
    probe.renderLanes.text.renderObjectCount >= 1 &&
    probe.renderLanes.text.visiblePrimitiveCount >= 1;
}

function surfaceTextProbeIsAbsent(probe: PatchMapTextProductProbe | null): boolean {
  return probe !== null &&
    !probe.state.visible &&
    probe.geometry.visibleBounds === null &&
    probe.publication.status === 'absent' &&
    probe.renderer.route === null &&
    probe.renderer.rendererKind === 'none' &&
    probe.renderer.objectCount === 0 &&
    probe.renderer.staleGlyphCount === 0 &&
    probe.renderer.attachedSignatures === null &&
    probe.renderer.lastRenderedSignatures === null &&
    probe.renderer.lastRenderedFrame === null &&
    probe.rendererPaint === null &&
    probe.renderLanes === null;
}

function requireRegionGeometry(
  surface: PatchMapEngineSurface,
  operation: string,
): PatchMapSurfaceGeometrySnapshot {
  const geometry = surface.geometrySnapshot?.();
  if (geometry === undefined) {
    throw new Error(`${operation} requires aggregate surface geometry`);
  }
  return geometry;
}

function boxRegionQueryBounds(
  start: readonly [number, number],
  end: readonly [number, number],
): PatchMapScreenRegionBounds | null {
  if (![...start, ...end].every(Number.isFinite)) return null;
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  return Object.freeze([
    x,
    y,
    Math.max(start[0], end[0]) - x,
    Math.max(start[1], end[1]) - y,
  ]);
}

function paintRegionQueryBounds(
  segments: readonly (readonly [
    readonly [number, number],
    readonly [number, number],
  ])[],
  toleranceCssPx: number,
): PatchMapScreenRegionBounds | null {
  if (!Number.isFinite(toleranceCssPx) || toleranceCssPx < 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    if (![...segment[0], ...segment[1]].every(Number.isFinite)) continue;
    minX = Math.min(minX, segment[0][0], segment[1][0]);
    minY = Math.min(minY, segment[0][1], segment[1][1]);
    maxX = Math.max(maxX, segment[0][0], segment[1][0]);
    maxY = Math.max(maxY, segment[0][1], segment[1][1]);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return Object.freeze([
    minX - toleranceCssPx,
    minY - toleranceCssPx,
    maxX - minX + toleranceCssPx * 2,
    maxY - minY + toleranceCssPx * 2,
  ]);
}

function targetAliasesMatch(
  target: PatchMapLogicalTargetSnapshot,
  values: ReadonlySet<string>,
): boolean {
  return values.has(target.key) ||
    values.has(target.id) ||
    values.has(target.selectionId) ||
    (target.ownerId !== null && values.has(target.ownerId));
}

function destroyedPointerGestureProbe(): PatchMapPointerGestureProbe {
  return Object.freeze({
    activePointerCount: 0,
    pointerCaptureCount: 0,
    activeGestureCount: 0,
    hoverTarget: null,
    hoverListenerCount: 0,
    staleGestureCount: 0,
    destroyed: true,
  });
}

function validateInitializeOptions(options: PatchMapInitializeOptions): void {
  if (!options.instanceId) throw new TypeError('instanceId must be a non-empty string');
  for (const [name, value] of [['width', options.width], ['height', options.height]] as const) {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
  }
  if (options.pixelRatio !== undefined && (!(options.pixelRatio > 0) || !Number.isFinite(options.pixelRatio))) {
    throw new RangeError('pixelRatio must be positive and finite');
  }
}

function validateExtractionRequest(request: PatchMapEngineExtractionRequest): void {
  if (request.mime !== 'image/png') {
    throw new TypeError('extractPublishedScene mime must be image/png');
  }
  if (
    !Array.isArray(request.cssSize) ||
    request.cssSize.length !== 2 ||
    !request.cssSize.every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new RangeError('extractPublishedScene cssSize must contain two positive finite values');
  }
  for (const key of ['scene', 'view', 'interaction'] as const) {
    const value = request.targetTuple[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`extractPublishedScene targetTuple.${key} must be non-negative`);
    }
  }
}

function extractionFailureCode(
  error: unknown,
): 'EXTRACTION_TAINTED' | 'EXTRACTION_READBACK_FAILED' {
  if (
    error instanceof DOMException
    && (error.name === 'SecurityError' || error.name === 'InvalidStateError')
  ) {
    return error.name === 'SecurityError'
      ? 'EXTRACTION_TAINTED'
      : 'EXTRACTION_READBACK_FAILED';
  }
  return 'EXTRACTION_READBACK_FAILED';
}

function samePublishedTuple(
  left: PatchMapPublishedTuple,
  right: PatchMapPublishedTuple,
): boolean {
  return left.scene === right.scene &&
    left.view === right.view &&
    left.interaction === right.interaction;
}

function validatePositiveFinite(name: string, value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
}

function validateNonNegativeFinite(name: string, value: number): void {
  if (value < 0 || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be non-negative and finite`);
  }
}

function validatePoint(point: PatchMapPoint, operation: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${operation} point must contain finite coordinates`);
  }
}

function finiteTuple(
  value: readonly [number, number],
  label: string,
): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    throw new RangeError(`${label} must contain two finite coordinates`);
  }
  return Object.freeze([value[0], value[1]]);
}

function resolvePatchMapHistoryShortcut(
  input: PatchMapHistoryShortcutInput,
): PatchMapHistoryDirection | null {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('history shortcut input must be an object');
  }
  if (typeof input.key !== 'string') {
    throw new TypeError('history shortcut key must be a string');
  }
  if (
    typeof input.ctrlKey !== 'boolean' ||
    typeof input.metaKey !== 'boolean' ||
    typeof input.shiftKey !== 'boolean'
  ) {
    throw new TypeError('history shortcut modifiers must be booleans');
  }
  if (input.ctrlKey === input.metaKey) return null;
  const key = input.key.toLowerCase();
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !input.shiftKey) return 'redo';
  return null;
}

function assertTransformerHandleKind(
  handle: PatchMapTransformerHandle,
  kind: PatchMapTransformerEditKind,
): void {
  const resolved = handle === 'frame'
    ? 'move'
    : handle === 'rotate'
      ? 'rotate'
      : 'resize';
  if (resolved !== kind) {
    throw new TypeError(`transformer ${handle} handle cannot begin a ${kind} edit`);
  }
}

function isPatchMapInteractionMode(value: unknown): value is PatchMapInteractionMode {
  return value === 'select' ||
    value === 'pan' ||
    value === 'transform' ||
    value === 'relation-paint' ||
    value === 'text-edit';
}

function isPatchMapHistoryCompanionRecord(
  value: unknown,
): value is Readonly<Record<string, PatchMapMutationJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function emptySurfaceDebug(width: number, height: number, pixelRatio: number): PatchMapSurfaceDebug {
  return Object.freeze({
    cssSize: Object.freeze([width, height] as [number, number]),
    backingSize: Object.freeze([
      Math.round(width * pixelRatio),
      Math.round(height * pixelRatio),
    ] as [number, number]),
    selectionIds: Object.freeze([] as string[]),
    activeAnimationCount: 0,
    activeGestureCount: 0,
    renderCommandCount: 0,
    visiblePrimitiveCount: 0,
  });
}

function normalizeBackground(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new TypeError('invalid background color');
    return value >>> 0;
  }
  const match = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (!match) throw new TypeError('background must be #rrggbb or #rrggbbaa');
  const body = match[1]!;
  return Number.parseInt(body.length === 6 ? `${body}ff` : body, 16) >>> 0;
}

const EMPTY_TARGETS = Object.freeze([] as PatchMapSemanticTarget[]);
const EMPTY_COMPONENT_VISUAL_TARGETS = Object.freeze(
  [] as PatchMapComponentVisualTarget[],
);
const EMPTY_RECONCILE_DIAGNOSTICS = Object.freeze([] as PatchMapReconcileDiagnostic[]);

function freezeMutationTargets(
  values: readonly PatchMapMutationTarget[],
): readonly PatchMapMutationTarget[] {
  if (
    Object.isFrozen(values) &&
    values.every((target) => Object.isFrozen(target))
  ) {
    return values;
  }
  return Object.freeze(values.map((target) => Object.freeze({ ...target })));
}

function freezeCommittedTransactionResult(
  candidate: MaterializedPatchMapDataset,
  value: Omit<
    Extract<PatchMapEngineTransactionResult, { readonly status: 'committed' }>,
    'semanticHash'
  >,
): Extract<PatchMapEngineTransactionResult, { readonly status: 'committed' }> {
  const result = value as Extract<
    PatchMapEngineTransactionResult,
    { readonly status: 'committed' }
  >;
  Object.defineProperty(result, 'semanticHash', {
    enumerable: true,
    configurable: false,
    get: () => candidate.semanticHash,
  });
  return Object.freeze(result);
}

function freezeTransactionHistory(
  recorded: boolean,
  commandId: string | null,
  previous: PatchMapHistoryState,
  current: PatchMapHistoryState,
): PatchMapEngineTransactionHistory {
  return Object.freeze({
    recorded,
    commandId,
    depthDelta: current.undoDepth - previous.undoDepth,
    state: current,
  });
}

function historySnapshotForDataset(
  dataset: readonly NormalizedPatchMapElement[],
  companion: PatchMapEngineHistoryCompanion,
): PatchMapSemanticHistorySnapshotInput<
  readonly NormalizedPatchMapElement[],
  PatchMapEngineHistoryCompanion
> {
  return Object.freeze({
    dataset,
    companion,
  });
}

interface PatchMapHistoryOrderIndex {
  readonly elementIdsByParent: ReadonlyMap<string | null, readonly string[]>;
  readonly componentIdsByOwner: ReadonlyMap<string, readonly string[]>;
}

interface PatchMapHistoryReconcileOrderScope {
  readonly allowedElementOrderIds: readonly string[];
  readonly allowedComponentOrderOwners: readonly string[];
}

const EMPTY_HISTORY_ORDER_IDS = Object.freeze([] as string[]);

function historyReconcileOrderScope(
  command: PatchMapEngineHistoryTransition['command'],
): PatchMapHistoryReconcileOrderScope {
  const allowedElementOrderIds = new Set<string>();
  const allowedComponentOrderOwners = new Set<string>();

  // History reconciles directly between grouped command boundaries rather than
  // replaying each accepted record. Comparing those two boundaries once keeps
  // the authorization exact without multiplying work by a gesture's record count.
  const before = indexHistoryOrders(command.before.dataset);
  const after = indexHistoryOrders(command.after.dataset);
  const parentIds = new Set([
    ...before.elementIdsByParent.keys(),
    ...after.elementIdsByParent.keys(),
  ]);
  for (const parentId of parentIds) {
    const beforeIds = before.elementIdsByParent.get(parentId) ?? EMPTY_HISTORY_ORDER_IDS;
    const afterIds = after.elementIdsByParent.get(parentId) ?? EMPTY_HISTORY_ORDER_IDS;
    if (sameStringArray(beforeIds, afterIds)) continue;
    beforeIds.forEach((id) => allowedElementOrderIds.add(id));
    afterIds.forEach((id) => allowedElementOrderIds.add(id));
  }

  const ownerIds = new Set([
    ...before.componentIdsByOwner.keys(),
    ...after.componentIdsByOwner.keys(),
  ]);
  for (const ownerId of ownerIds) {
    const beforeIds = before.componentIdsByOwner.get(ownerId) ?? EMPTY_HISTORY_ORDER_IDS;
    const afterIds = after.componentIdsByOwner.get(ownerId) ?? EMPTY_HISTORY_ORDER_IDS;
    if (!sameStringArray(beforeIds, afterIds)) {
      allowedComponentOrderOwners.add(ownerId);
    }
  }

  return Object.freeze({
    allowedElementOrderIds: Object.freeze([...allowedElementOrderIds].sort()),
    allowedComponentOrderOwners: Object.freeze([...allowedComponentOrderOwners].sort()),
  });
}

function indexHistoryOrders(
  dataset: readonly NormalizedPatchMapElement[],
): PatchMapHistoryOrderIndex {
  const elementIdsByParent = new Map<string | null, readonly string[]>();
  const componentIdsByOwner = new Map<string, readonly string[]>();
  const visit = (
    elements: readonly NormalizedPatchMapElement[],
    parentId: string | null,
  ): void => {
    elementIdsByParent.set(
      parentId,
      Object.freeze(elements.map((element) => element.id)),
    );
    for (const element of elements) {
      if (element.type === 'group') visit(element.children, element.id);
      if (element.type === 'item') {
        componentIdsByOwner.set(
          element.id,
          Object.freeze(element.components.map((component) => component.id)),
        );
      } else if (element.type === 'grid') {
        componentIdsByOwner.set(
          element.id,
          Object.freeze(element.item.components.map((component) => component.id)),
        );
      }
    }
  };
  visit(dataset, null);
  return Object.freeze({ elementIdsByParent, componentIdsByOwner });
}

function transactionSelectionAfter(
  selectionIds: readonly string[],
  operations: readonly PatchMapMutationOperation[],
): readonly string[] {
  const removed = new Set(
    operations.flatMap((operation) =>
      operation.op === 'remove' && operation.target.kind === 'element'
        ? [operation.target.id]
        : []),
  );
  return Object.freeze(selectionIds.filter((id) => !removed.has(id)));
}

function directAnimatedBarTargets(
  operations: readonly PatchMapMutationOperation[],
  componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
): readonly Readonly<{ readonly ownerId: string; readonly componentId: string }>[] {
  const targets = new Map<string, Readonly<{ ownerId: string; componentId: string }>>();
  for (const operation of operations) {
    if (operation.op !== 'merge' || operation.target.kind !== 'component') continue;
    if (!operation.changes.some((change) => change.path[0] === 'size')) continue;
    const key = componentSemanticKey(operation.target.ownerId, operation.target.id);
    if (componentSemantics.get(key)?.componentType !== 'bar') continue;
    const target = Object.freeze({
      ownerId: operation.target.ownerId,
      componentId: operation.target.id,
    });
    targets.set(key, target);
  }
  return Object.freeze([...targets.values()]);
}

function operationsOnlyUpdateBarSize(
  operations: readonly PatchMapMutationOperation[],
  componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
): boolean {
  return operations.length > 0 && operations.every((operation) => {
    if (
      operation.op !== 'merge' ||
      operation.target.kind !== 'component' ||
      operation.changes.length === 0 ||
      operation.changes.some((change) => change.path[0] !== 'size')
    ) {
      return false;
    }
    return componentSemantics.get(
      componentSemanticKey(operation.target.ownerId, operation.target.id),
    )?.componentType === 'bar';
  });
}

function directBarHeightUpdatesFor(
  operations: readonly PatchMapMutationOperation[],
  componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
): readonly PatchMapDirectBarHeightUpdate[] | undefined {
  if (operations.length === 0) return undefined;
  const updates = new Map<string, PatchMapDirectBarHeightUpdate>();
  for (const operation of operations) {
    if (
      operation.op !== 'merge' ||
      operation.target.kind !== 'component' ||
      operation.changes.length !== 1
    ) {
      return undefined;
    }
    const [change] = operation.changes;
    if (
      change === undefined ||
      change.path.length !== 2 ||
      change.path[0] !== 'size' ||
      change.path[1] !== 'height'
    ) {
      return undefined;
    }
    const key = componentSemanticKey(operation.target.ownerId, operation.target.id);
    const semantic = componentSemantics.get(key);
    const size = semantic?.authoredSize;
    const height = typeof size === 'object' &&
      size !== null &&
      'height' in size
      ? size.height
      : undefined;
    if (
      semantic?.componentType !== 'bar' ||
      typeof height !== 'number' ||
      !Number.isFinite(height) ||
      height < 0
    ) {
      return undefined;
    }
    updates.set(key, Object.freeze({
      ownerId: operation.target.ownerId,
      componentId: operation.target.id,
      height,
    }));
  }
  return Object.freeze([...updates.values()]);
}

function componentOrderOwners(
  operations: readonly PatchMapMutationOperation[],
): readonly string[] {
  return Object.freeze([...new Set(
    operations
      .filter((operation) => operation.op === 'reconcile-components')
      .map((operation) => operation.target.id),
  )]);
}

function operationsMayChangeElementStructure(
  operations: readonly PatchMapMutationOperation[],
): boolean {
  return operations.some((operation) => {
    switch (operation.op) {
      case 'add':
      case 'move':
      case 'group':
      case 'ungroup':
        return true;
      case 'remove':
        return operation.target.kind === 'element';
      default:
        return false;
    }
  });
}

function operationsOnlyUpdateElementGeometry(
  operations: readonly PatchMapMutationOperation[],
): boolean {
  if (operations.length === 0) return false;
  return operations.every((operation) => (
    operation.op === 'merge' &&
    operation.target.kind === 'element' &&
    operation.changes.length > 0 &&
    operation.changes.every((change) => {
      if (change.path.length !== 2) return false;
      const [domain, field] = change.path;
      return (
        domain === 'attrs' &&
        (field === 'x' || field === 'y' || field === 'angle' || field === 'rotation')
      ) || (
        domain === 'size' &&
        (field === 'width' || field === 'height')
      );
    })
  ));
}

const INCREMENTAL_FLAT_ROOT_TYPES = new Set([
  'item',
  'rect',
  'image',
  'text',
]);

/**
 * History retains Engine-owned immutable datasets, so unchanged root identity
 * is an exact dirty-set signal. This avoids reparsing/reindexing all 5,000
 * roots during undo/redo while still falling back for reorder, hierarchy, and
 * relation changes.
 */
function incrementalOwnedRootIds(
  current: readonly NormalizedPatchMapElement[],
  candidate: readonly NormalizedPatchMapElement[],
): readonly string[] | undefined {
  if (current.length === 0 || current.length !== candidate.length) {
    return undefined;
  }
  const exactDirtyIndices = ownedPatchMapExactPatchIndices(candidate, current);
  if (exactDirtyIndices !== null) {
    if (exactDirtyIndices.length === 0) return undefined;
    const dirty: string[] = [];
    for (const index of exactDirtyIndices) {
      const before = current[index];
      const after = candidate[index];
      if (
        before === undefined ||
        after === undefined ||
        before.id !== after.id ||
        before.type !== after.type ||
        !INCREMENTAL_FLAT_ROOT_TYPES.has(after.type)
      ) {
        return undefined;
      }
      dirty.push(after.id);
    }
    return Object.freeze(dirty);
  }
  const dirty: string[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < candidate.length; index += 1) {
    const before = current[index];
    const after = candidate[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.type !== after.type ||
      ids.has(after.id)
    ) {
      return undefined;
    }
    ids.add(after.id);
    if (before === after) continue;
    if (!INCREMENTAL_FLAT_ROOT_TYPES.has(after.type)) return undefined;
    dirty.push(after.id);
  }
  return dirty.length === 0 ? undefined : Object.freeze(dirty);
}

function incrementalFlatRootIds(
  current: readonly NormalizedPatchMapElement[],
  candidate: readonly NormalizedPatchMapElement[],
  operations: readonly PatchMapMutationOperation[],
): readonly string[] | undefined {
  if (
    current.length === 0 ||
    current.length !== candidate.length ||
      operations.length === 0
  ) {
    return undefined;
  }
  const sparseDirtyIndices =
    ownedPatchMapExactPatchIndices(candidate, current) ??
    ownedPatchMapPreviewPatchIndices(candidate, current);
  if (sparseDirtyIndices !== null) {
    const dirty = new Set<string>();
    for (const operation of operations) {
      if (operation.op !== 'merge') return undefined;
      dirty.add(
        operation.target.kind === 'element'
          ? operation.target.id
          : operation.target.ownerId,
      );
    }
    const ordered: string[] = [];
    for (const index of sparseDirtyIndices) {
      const before = current[index];
      const after = candidate[index];
      if (
        before === undefined ||
        after === undefined ||
        before.id !== after.id ||
        before.type !== after.type ||
        !dirty.delete(after.id) ||
        !INCREMENTAL_FLAT_ROOT_TYPES.has(after.type)
      ) {
        return undefined;
      }
      ordered.push(after.id);
    }
    return dirty.size === 0 && ordered.length > 0
      ? Object.freeze(ordered)
      : undefined;
  }
  const rootOrder = new Map<string, number>();
  for (let index = 0; index < candidate.length; index += 1) {
    const before = current[index];
    const after = candidate[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.type !== after.type ||
      rootOrder.has(after.id)
    ) {
      return undefined;
    }
    rootOrder.set(after.id, index);
  }

  const dirty = new Set<string>();
  for (const operation of operations) {
    if (operation.op !== 'merge') return undefined;
    const rootId = operation.target.kind === 'element'
      ? operation.target.id
      : operation.target.ownerId;
    if (!rootOrder.has(rootId)) return undefined;
    dirty.add(rootId);
  }
  if (dirty.size === 0) return undefined;
  for (const rootId of dirty) {
    const index = rootOrder.get(rootId);
    const root = index === undefined ? undefined : candidate[index];
    if (root === undefined || !INCREMENTAL_FLAT_ROOT_TYPES.has(root.type)) {
      return undefined;
    }
  }
  return Object.freeze(
    [...dirty].sort((left, right) => rootOrder.get(left)! - rootOrder.get(right)!),
  );
}

function incrementalBarHeightRootIds(
  current: readonly NormalizedPatchMapElement[],
  candidate: readonly NormalizedPatchMapElement[],
  updates: readonly PatchMapPlannedBarHeightUpdate[],
): readonly string[] | undefined {
  if (
    current.length === 0 ||
    current.length !== candidate.length ||
    updates.length === 0
  ) {
    return undefined;
  }
  const exactDirtyIndices = ownedPatchMapExactPatchIndices(candidate, current);
  if (exactDirtyIndices !== null) {
    const updateOwnerIds = new Set(updates.map(({ ownerId }) => ownerId));
    const dirty: string[] = [];
    for (const index of exactDirtyIndices) {
      const before = current[index];
      const after = candidate[index];
      if (
        before === undefined ||
        after?.type !== 'item' ||
        before.id !== after.id ||
        before.type !== after.type ||
        !updateOwnerIds.delete(after.id)
      ) {
        return undefined;
      }
      dirty.push(after.id);
    }
    if (updateOwnerIds.size === 0) return Object.freeze(dirty);
  }
  const rootOrder = new Map<string, number>();
  for (let index = 0; index < candidate.length; index += 1) {
    const before = current[index];
    const after = candidate[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.type !== after.type ||
      rootOrder.has(after.id)
    ) {
      return undefined;
    }
    rootOrder.set(after.id, index);
  }
  const dirty = new Set<string>();
  for (const update of updates) {
    const index = rootOrder.get(update.ownerId);
    const root = index === undefined ? undefined : candidate[index];
    if (root?.type !== 'item') return undefined;
    dirty.add(update.ownerId);
  }
  return Object.freeze(
    [...dirty].sort((left, right) => rootOrder.get(left)! - rootOrder.get(right)!),
  );
}

function normalizeEngineMutationTarget(value: unknown): PatchMapMutationTarget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('target must be an object');
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.kind === 'element' && typeof record.id === 'string' && record.id.length > 0) {
    if (Object.keys(record).some((key) => key !== 'kind' && key !== 'id')) {
      throw new TypeError('element target contains an unknown field');
    }
    return Object.freeze({ kind: 'element', id: record.id });
  }
  if (
    record.kind === 'component' &&
    typeof record.ownerId === 'string' &&
    record.ownerId.length > 0 &&
    typeof record.id === 'string' &&
    record.id.length > 0
  ) {
    if (Object.keys(record).some((key) => !['kind', 'ownerId', 'id'].includes(key))) {
      throw new TypeError('component target contains an unknown field');
    }
    return Object.freeze({ kind: 'component', ownerId: record.ownerId, id: record.id });
  }
  throw new TypeError('target must be an element or owner-qualified component');
}

function normalizeSnapshotTarget(value: unknown): PatchMapMutationTarget | null {
  if (value === null || typeof value !== 'object') return null;
  try {
    return normalizeEngineMutationTarget(Reflect.get(value, 'target'));
  } catch {
    return null;
  }
}

function findEngineSemanticTarget(
  dataset: readonly NormalizedPatchMapElement[],
  target: PatchMapMutationTarget,
): NormalizedPatchMapElement | PatchMapComponent | null {
  let result: NormalizedPatchMapElement | PatchMapComponent | null = null;
  const visit = (elements: readonly NormalizedPatchMapElement[]): void => {
    for (const element of elements) {
      if (target.kind === 'element' && element.id === target.id) {
        result = element;
      }
      if (target.kind === 'component' && element.id === target.ownerId) {
        const components = element.type === 'item'
          ? element.components
          : element.type === 'grid'
            ? element.item.components
            : Object.freeze([] as PatchMapComponent[]);
        const component = components.find((entry) => entry.id === target.id);
        if (component !== undefined) {
          result = component;
        }
      }
      if (element.type === 'group') visit(element.children);
    }
  };
  visit(dataset);
  return result;
}

function semanticTargetIdentity(target: PatchMapSemanticTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

function freezeTargets(values: readonly PatchMapSemanticTarget[]): readonly PatchMapSemanticTarget[] {
  return Object.freeze([...values]);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function freezeReconcileDiagnostics(
  values: readonly PatchMapReconcileDiagnostic[],
): readonly PatchMapReconcileDiagnostic[] {
  return Object.freeze(values.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

function mutationDiagnosticMapping(
  diagnostic: PatchMapSemanticMutationDiagnostic,
): Readonly<{
  code: string;
  category: PatchMapDiagnosticCategory;
  recoverable: boolean;
}> {
  switch (diagnostic.reason) {
    case 'missing-target':
      return { code: 'MISSING_TARGET', category: 'MISSING_TARGET', recoverable: true };
    case 'ambiguous-target':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'unsupported-structure':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'invalid-candidate':
      return {
        code: diagnostic.datasetCode ?? 'INVALID_MUTATION',
        category: 'INVALID_INPUT',
        recoverable: true,
      };
    case 'invalid-target':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'invalid-value':
      return { code: 'INVALID_VALUE', category: 'INVALID_INPUT', recoverable: true };
  }
}

function countPatchMapRelationLinks(
  dataset: readonly NormalizedPatchMapElement[],
): number {
  let count = 0;
  const visit = (elements: readonly NormalizedPatchMapElement[]): void => {
    for (const element of elements) {
      if (element.type === 'relations') count += element.links.length;
      if (element.type === 'group') visit(element.children);
    }
  };
  visit(dataset);
  return count;
}

export type { PatchMapComponentVisualTarget } from './core/contracts';

function findElement(
  values: readonly NormalizedPatchMapElement[],
  id: string,
): Readonly<Record<string, unknown>> | null {
  for (const value of values) {
    if (value.id === id) return value;
    if (value.type === 'group') {
      const nested = findElement(value.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function selectionHitUsesSpatialFastPath(options: PatchMapSelectionHitOptions): boolean {
  return options.candidateIds === undefined &&
    options.rejectIds === undefined &&
    options.lockedIds === undefined &&
    options.predicate === undefined;
}

function enginePerformanceNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
