import type {
  PatchMapAuthoringActionType,
  PatchMapAuthoringDiagnostic,
  PatchMapAuthoringFacts,
  PatchMapAuthoringPlan,
  PATCH_MAP_AUTHORING_REVISION,
} from '../authoring';
import type {
  PatchMapAssetPolicy,
  PatchMapAssetRegistration,
  PatchMapAssetRuntime,
  PatchMapAssetSessionProbe,
} from '../assets';
import type {
  PatchMapBarPresentationProductProbe,
  PatchMapComponentVisualGeometryProbe,
  PatchMapComponentVisualProductProbe,
  PatchMapComponentVisualTarget,
  PatchMapReconcileTimings,
  PatchMapTextGeometryProbe,
  PatchMapTextRendererProductProbe,
  PatchMapTextStateProbe,
  PatchMapTextTarget,
  PatchMapTextTransformProbe,
} from '../core/contracts';
import type { PatchMapTextProjection } from '../contracts';
import type { SlotRange } from '../dense/contracts';
import type {
  PatchMapEditorMutationKind,
  PatchMapEditorWorkflowAction,
  PatchMapEditorWorkflowDiagnostic,
  PatchMapEditorWorkflowFacts,
  PatchMapEditorWorkflowPlan,
  PatchMapEditorWorkflowProbe,
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
} from '../editor-workflow';
import type {
  PatchMapHistoryCapacityChange,
  PatchMapHistoryDirection,
  PatchMapHistoryState,
} from '../history';
import type {
  PatchMapHostAssetIngestionPlan,
  PatchMapHostAssetIngestionProbe,
  PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
} from '../host-asset-ingestion';
import type {
  PatchMapCommandTargetState,
  PatchMapInteractionMode,
} from '../host-interaction';
import type {
  PatchMapExtractionSecurityAuthority,
  PatchMapOperationsAuthority,
} from '../operations';
import type { PatchMapPaintOrderProductProbe } from '../paint-order-product';
import type { PatchMapPresentationPolicyProductProbe } from '../presentation-policy';
import type {
  PatchMapGestureCancelReason,
  PatchMapOwnedGestureTermination,
  PATCH_MAP_POINTER_GESTURE_REVISION,
} from '../pointer-gesture';
import type {
  PatchMapLogicalTargetSnapshot,
  PatchMapQueryReuseOperation,
  PatchMapSelectionChange,
  PatchMapSelectionEligibilityOptions,
  PatchMapSelectionHit,
  PATCH_MAP_QUERY_SELECTION_REVISION,
} from '../query-selection';
import type {
  PatchMapEntityPaintProbe,
  PatchMapPixiPublicSurfaceProbe,
  PatchMapPixiRendererLossProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
} from '../renderers/types';
import type { PatchMapSemanticMutationDiagnostic } from '../semantic/mutation';
import type { PatchMapSemanticTarget } from '../semantic/probe';
import type { PatchMapReconcileDiagnostic } from '../semantic/reconcile';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationTarget,
  PatchMapMutationTransactionDiagnostic,
  PatchMapMutationTransactionRequest,
} from '../semantic/transaction';
import type {
  PatchMapRelationEndpointResolution,
  PatchMapTransformerGestureProbe,
  PatchMapTransformerHandle,
} from '../selection-transformer';
import type {
  PatchMapEdgeAutoPanResult,
  PatchMapTransformerEditKind,
  PatchMapTransformerEditPlan,
  PATCH_MAP_TRANSFORMER_EDIT_REVISION,
} from '../transformer-edit';
import type {
  PatchMapViewportContributorResult,
  PatchMapViewportPolicy,
  PATCH_MAP_VIEWPORT_REVISION,
} from '../viewport';
import type {
  PatchMapEngineSceneImageRecord,
  PatchMapEngineSurfaceFactory,
  PatchMapSurfacePointerInput,
} from './contracts';
import type {
  PatchMapEngineComponentSemanticProbe,
  PatchMapEngineTextSemanticProbe,
} from './semantic-index';
import type {
  PatchMapPoint,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceOmittedRelationGeometry,
  PatchMapSurfaceRelationGeometry,
} from './surface-contract';
import type {
  PatchMapEngineDiagnostic,
  PatchMapLifecycle,
  PatchMapPublishedTuple,
  PatchMapRevisionStamp,
} from './contracts/lifecycle';

export * from './contracts/extraction';
export * from './contracts/lifecycle';

export interface PatchMapViewportState {
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
  readonly screenBounds: readonly [number, number, number, number];
}

export type PatchMapViewportChangeSource =
  | 'programmatic'
  | 'pointer'
  | 'middle-pointer'
  | 'modifier-wheel'
  | 'wheel'
  | 'pinch'
  | 'deceleration'
  | 'focus'
  | 'fit'
  | 'restore'
  | 'fallback-fit';

export interface PatchMapViewportChangeResult {
  readonly changed: boolean;
  readonly blocked: boolean;
  readonly source: PatchMapViewportChangeSource;
  readonly previous: PatchMapViewportState;
  readonly viewport: PatchMapViewportState;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
}

export type PatchMapEnginePointerInput = Readonly<
  PatchMapSurfacePointerInput & {
    readonly viewRevision?: number;
  }
>;

export interface PatchMapSerializedViewportState {
  readonly schemaRevision: typeof PATCH_MAP_VIEWPORT_REVISION;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
}

export interface PatchMapViewportPersistenceProbe {
  readonly settledPublicationCount: number;
  readonly persistenceWriteCount: number;
  readonly equivalentSaveCount: 0;
  readonly suppressedEquivalentSaveCount: number;
  readonly settled: boolean;
  readonly serialized: PatchMapSerializedViewportState | null;
}

export interface PatchMapHostLifecycleRebindResult {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly canvasCount: number;
  readonly selectionIds: readonly string[];
  readonly revisions: PatchMapRevisionStamp;
}

export interface PatchMapViewportSettleResult {
  readonly changed: boolean;
  readonly viewport: PatchMapViewportState;
  readonly publicationCount: number;
  readonly persistence: PatchMapViewportPersistenceProbe;
}

export interface PatchMapViewportRestoreResult {
  readonly status: 'restored' | 'fallback:auto-fit';
  readonly changed: boolean;
  readonly viewport: PatchMapViewportState;
  readonly fit: PatchMapViewportFitResult | null;
}

export interface PatchMapViewportTargetOptions {
  readonly targets?: readonly string[] | null;
  readonly rejectIds?: readonly string[];
  readonly relationEndpointsAvailable?: boolean;
}

export interface PatchMapViewportFocusResult extends PatchMapViewportContributorResult {
  readonly status: 'applied' | 'empty';
  readonly changed: boolean;
  readonly viewport: PatchMapViewportState;
}

export interface PatchMapViewportFitOptions extends PatchMapViewportTargetOptions {
  readonly paddingCssPx?: number | readonly [number, number];
}

export interface PatchMapViewportFitResult extends PatchMapViewportContributorResult {
  readonly status: 'applied' | 'empty';
  readonly changed: boolean;
  readonly paddingCssPx: readonly [number, number];
  readonly viewport: PatchMapViewportState;
}

export type PatchMapViewportPolicyOperation =
  | Readonly<{
      readonly op: 'add' | 'start' | 'stop' | 'remove';
      readonly policy: PatchMapViewportPolicy;
    }>
  | Readonly<{ readonly op: 'temporary'; readonly policy: PatchMapViewportPolicy }>
  | Readonly<{ readonly op: 'restore-temporary' | 'cancel-all' | 'redraw' }>;

export interface PatchMapViewportPolicyProbe {
  readonly schemaRevision: typeof PATCH_MAP_VIEWPORT_REVISION;
  readonly policies: readonly PatchMapViewportPolicy[];
  readonly enabledPolicies: readonly PatchMapViewportPolicy[];
  readonly temporary: boolean;
  readonly callbacksByPolicy: Readonly<Record<PatchMapViewportPolicy, 0 | 1>>;
  readonly resources: Readonly<{
    readonly tickers: 0;
    readonly listeners: 0;
    readonly captures: 0;
    readonly motions: 0 | 1;
    readonly cursors: 0;
  }>;
  readonly destroyed: boolean;
}

export interface PatchMapWorldTransformInput {
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export type PatchMapWorldTransformState = PatchMapWorldTransformInput;

export interface PatchMapViewportTransformProbe {
  readonly schemaRevision: typeof PATCH_MAP_VIEWPORT_REVISION;
  readonly world: PatchMapWorldTransformState;
  readonly pointerTransformRevision: number;
  readonly resizePolicyApplicationCount: number;
  readonly blackFrameCount: number;
  readonly pendingResizeFrame: boolean;
  readonly surface: Readonly<{
    readonly canvasCount: number;
    readonly cssSize: readonly [number, number];
    readonly backingSize: readonly [number, number];
  }>;
}

export interface PatchMapGeometryRevisionTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export type PatchMapEngineGeometryProbe = Readonly<
  Omit<PatchMapSurfaceGeometrySnapshot, 'revision' | 'sceneRevision'> & {
    /** Engine scene revision represented by the correlated surface generation. */
    readonly revision: number | null;
    /** Independent surface geometry generation, when published. */
    readonly surfaceRevision: number | null;
    /** Engine revision tuple represented by the correlated surface generation. */
    readonly representedRevisions: PatchMapGeometryRevisionTuple | null;
    /** Per-domain lag from the current Engine tuple. */
    readonly revisionLags: PatchMapGeometryRevisionTuple | null;
    /** Scene-domain compatibility projection of `revisionLags.scene`. */
    readonly revisionLag: number | null;
  }
>;

export interface PatchMapEngineRelationProbe {
  readonly revision: number | null;
  readonly surfaceRevision: number | null;
  readonly representedRevisions: PatchMapGeometryRevisionTuple | null;
  readonly revisionLags: PatchMapGeometryRevisionTuple | null;
  readonly revisionLag: number | null;
  readonly relations: readonly PatchMapSurfaceRelationGeometry[];
  readonly omittedRelations: readonly PatchMapSurfaceOmittedRelationGeometry[];
}

export interface PatchMapEngineComponentVisualProbe {
  readonly target: PatchMapComponentVisualTarget;
  readonly semantic: PatchMapEngineComponentSemanticProbe | null;
  readonly entityId: string | null;
  readonly logicalIdentity: string | null;
  readonly componentType: string | null;
  readonly renderRole: PatchMapComponentVisualProductProbe['renderRole'] | null;
  readonly entityKind: string | null;
  readonly geometry: PatchMapComponentVisualGeometryProbe | null;
  readonly publication: PatchMapComponentVisualProductProbe['publication'] | null;
  readonly sceneImage: PatchMapEngineSceneImageRecord | null;
  readonly rendererPaint: PatchMapEntityPaintProbe | null;
  readonly renderLanes: PatchMapRenderLaneSnapshot | null;
  readonly revisions: PatchMapRevisionStamp;
  readonly availability: Readonly<{
    readonly semantic: boolean;
    readonly surface: boolean;
    readonly rendererPaint: boolean;
    readonly renderLanes: boolean;
  }>;
}

export interface PatchMapEngineBarPresentationProbe extends PatchMapBarPresentationProductProbe {
  readonly revisions: PatchMapRevisionStamp;
  readonly publishedTuple: PatchMapPublishedTuple;
  readonly frameRevision: number;
}

export type PatchMapEngineTextPublicationStatus =
  | 'unavailable'
  | 'absent'
  | 'pending'
  | 'current';

export interface PatchMapEngineTextRevisionTuple {
  readonly current: PatchMapRevisionStamp;
  readonly published: PatchMapPublishedTuple;
  readonly frameRevision: number;
  readonly surfaceSceneRevision: number | null;
  readonly surfaceRenderedSceneRevision: number | null;
  readonly rendererFrame: number | null;
}

export interface PatchMapEngineTextProbe {
  readonly target: PatchMapTextTarget;
  readonly semantic: PatchMapEngineTextSemanticProbe | null;
  readonly semanticOwnerId: string | null;
  readonly entityId: string | null;
  readonly projection: PatchMapTextProjection | null;
  readonly geometry: PatchMapTextGeometryProbe | null;
  readonly state: PatchMapTextStateProbe | null;
  readonly transform: PatchMapTextTransformProbe | null;
  readonly renderer: PatchMapTextRendererProductProbe | null;
  readonly rendererPaint: PatchMapEntityPaintProbe | null;
  readonly renderLanes: PatchMapRenderLaneSnapshot | null;
  readonly publication: Readonly<{
    readonly status: PatchMapEngineTextPublicationStatus;
    readonly revisions: PatchMapEngineTextRevisionTuple;
  }>;
  readonly availability: Readonly<{
    readonly semantic: boolean;
    readonly surface: boolean;
    readonly renderer: boolean;
    readonly rendererPaint: boolean;
    readonly renderLanes: boolean;
  }>;
}

export type PatchMapEnginePaintOrderProbe = Readonly<
  PatchMapPaintOrderProductProbe & {
    readonly revisions: PatchMapRevisionStamp;
    readonly publishedTuple: PatchMapPublishedTuple;
    readonly frameRevision: number;
    readonly history: PatchMapHistoryState;
  }
>;

export interface PatchMapOptions {
  readonly surfaceFactory?: PatchMapEngineSurfaceFactory;
  readonly assetRuntime?: PatchMapAssetRuntime;
  readonly assetPolicy?: PatchMapAssetPolicy;
  readonly historyLimit?: number;
  readonly operations?: PatchMapOperationsAuthority;
  readonly extractionSecurity?: PatchMapExtractionSecurityAuthority;
}

export interface PatchMapInitializeOptions {
  readonly instanceId: string;
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio?: number;
  readonly antialias?: boolean;
  readonly background?: number | string;
  readonly zoomLimits?: readonly [number, number];
  readonly strategy?: 'mesh' | 'particle';
  readonly preference?: 'webgl' | 'webgpu';
  /** Normative backend request. WebGL1 is an explicit unsupported fixture. */
  readonly backend?: 'webgl2' | 'webgpu' | 'webgl1';
  /** Opt-in official PixiJS DevTools Application registration. */
  readonly devtools?: boolean;
  readonly powerPreference?: 'high-performance' | 'low-power';
  readonly requiredAssets?: readonly PatchMapAssetRegistration[];
}

export interface PatchMapInitializeResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly instanceId: string;
  readonly revisions: PatchMapRevisionStamp;
  readonly facilities: readonly string[];
}

export type PatchMapEnginePixiPublicSurfaceProbe = Readonly<
  PatchMapPixiPublicSurfaceProbe & {
    readonly lifecycle: PatchMapLifecycle;
    readonly revisions: PatchMapRevisionStamp;
    readonly canvasCount: number;
  }
>;

export type PatchMapEngineRendererLossProbe = Readonly<
  PatchMapPixiRendererLossProbe & {
    readonly revisions: PatchMapRevisionStamp;
    readonly publishedTuple: PatchMapPublishedTuple;
    readonly canvasCount: number;
  }
>;

export interface PatchMapAggregateRenderOwnerProbe {
  readonly target: PatchMapComponentVisualTarget;
  readonly logicalTarget: PatchMapLogicalTargetSnapshot;
  readonly entityId: string;
  readonly aggregateRenderOwnerId: `render-owner:${string}/${string}`;
  readonly rendererKind: PatchMapEntityPaintProbe['rendererKind'] | null;
  readonly renderLane: PatchMapRenderLaneSnapshot[PatchMapRenderLaneRole] | null;
  readonly worldBounds: readonly [number, number, number, number];
  readonly visible: boolean;
  readonly revisions: PatchMapRevisionStamp;
  readonly publishedTuple: PatchMapPublishedTuple;
  readonly frameRevision: number;
}

export interface PatchMapLoadOptions {
  readonly datasetRef?: string;
  /**
   * Reject dangling relation endpoints before publication. Omitted/false keeps
   * compatibility projection behavior and reports dangling paths as omitted.
   */
  readonly strict?: boolean;
}

export interface PatchMapEngineLoadResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly sceneRevision: number;
  readonly semanticHash: string;
  readonly rootIds: readonly string[];
}

export type PatchMapEnginePrepareResult = Readonly<
  | {
      readonly status: 'prepared';
      readonly storeSyncMs: number;
      readonly gpuPrepareMs: number;
      readonly revisions: PatchMapRevisionStamp;
      readonly publishedTuple: PatchMapPublishedTuple;
    }
  | {
      readonly status: 'unsupported';
      readonly storeSyncMs: null;
      readonly gpuPrepareMs: null;
      readonly revisions: PatchMapRevisionStamp;
      readonly publishedTuple: PatchMapPublishedTuple;
    }
>;

/**
 * Detached immutable query result. The private Engine registry, not these
 * public fields, authorizes later mutation use.
 */
export interface PatchMapResolvedTargetSnapshot {
  readonly target: PatchMapMutationTarget;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface PatchMapEngineQueryResult {
  readonly schemaRevision: typeof PATCH_MAP_QUERY_SELECTION_REVISION;
  readonly status: 'matched' | 'empty' | 'rejected';
  readonly code: 'CONFLICT' | null;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
}

export type PatchMapEngineQueryReuseResult =
  | Readonly<{
      readonly status: 'accepted';
      readonly code: null;
      readonly operation: PatchMapQueryReuseOperation;
      readonly appliedCount: number;
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly code: 'STALE_TARGET';
      readonly operation: PatchMapQueryReuseOperation;
      readonly appliedCount: 0;
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>;

export interface PatchMapEngineSelectionHit extends PatchMapSelectionHit {
  readonly worldPoint: PatchMapPoint;
}

export interface PatchMapEnginePointSelectionResult extends PatchMapEngineSelectionHit {
  readonly change: PatchMapSelectionChange;
}

export interface PatchMapExternalSelectionResult {
  readonly requestedIds: readonly string[];
  readonly missingIds: readonly string[];
  readonly change: PatchMapSelectionChange;
}

export type PatchMapCommandTargetStatusResult =
  | Readonly<{
      readonly status: 'applied';
      readonly code: null;
      readonly state: PatchMapCommandTargetState;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly code: 'MISSING_TARGET' | 'STALE_TARGET';
      readonly state: PatchMapCommandTargetState;
    }>;

export interface PatchMapEngineRelationEndpointSelectionResult
  extends PatchMapRelationEndpointResolution {
  readonly change: PatchMapSelectionChange;
}

export interface PatchMapEngineRegionSelectionOptions
  extends PatchMapSelectionEligibilityOptions {
  readonly mode?: 'replace' | 'add' | 'toggle';
  readonly commit?: boolean;
  readonly partialIntersection?: boolean;
  readonly toleranceCssPx?: number;
}

export interface PatchMapEngineRegionSelectionResult {
  readonly schemaRevision: typeof PATCH_MAP_POINTER_GESTURE_REVISION;
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
  readonly candidateIds: readonly string[];
  readonly filteredIds: readonly string[];
  readonly lockedIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly duplicateCount: number;
  readonly nonFiniteCount: number;
  readonly liveChangeCount: number;
  readonly strokeCssPx: 1;
  readonly change: PatchMapSelectionChange | null;
}

export interface PatchMapEngineTransactionHistory {
  readonly recorded: boolean;
  readonly commandId: string | null;
  readonly depthDelta: number;
  readonly state: PatchMapHistoryState;
}

export interface PatchMapEngineTransactionPerformanceProbe {
  readonly transactionPlanMs: number;
  readonly preReconcileMs: number;
  readonly reconcileMs: number;
  readonly postReconcileMs: number;
  readonly totalMs: number;
  readonly surfaceTimings: PatchMapReconcileTimings | null;
}

interface PatchMapEngineTransactionResultBase {
  readonly changed: boolean;
  readonly actionId: string | null;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly PatchMapMutationTarget[];
  readonly missing: readonly PatchMapMutationTarget[];
  readonly unchanged: readonly PatchMapMutationTarget[];
  readonly history: PatchMapEngineTransactionHistory;
}

export type PatchMapEngineTransactionResult =
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'unchanged';
      readonly changed: false;
    }>
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly transactionDiagnostic?: PatchMapMutationTransactionDiagnostic;
    }>
  | Readonly<PatchMapEngineTransactionResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>;

export interface PatchMapEngineAuthoringResult {
  readonly schemaRevision: typeof PATCH_MAP_AUTHORING_REVISION;
  readonly actionType: PatchMapAuthoringActionType | null;
  readonly status: 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly plan: PatchMapAuthoringPlan;
  readonly facts: PatchMapAuthoringFacts;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly diagnostic: PatchMapAuthoringDiagnostic | PatchMapEngineDiagnostic | null;
  readonly history: PatchMapHistoryState;
}

export interface PatchMapEngineHostAssetIngestionResult {
  readonly schemaRevision: typeof PATCH_MAP_HOST_ASSET_INGESTION_REVISION;
  readonly status:
    | 'committed'
    | 'unchanged'
    | 'ignored'
    | 'failed'
    | 'rejected'
    | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly createdTextId: string | null;
  readonly createdImageIds: readonly string[];
  readonly plan: PatchMapHostAssetIngestionPlan;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly probe: PatchMapHostAssetIngestionProbe;
}

export interface PatchMapEngineEditorWorkflowResult {
  readonly schemaRevision: typeof PATCH_MAP_EDITOR_WORKFLOW_REVISION;
  readonly actionType: PatchMapEditorWorkflowAction['type'];
  readonly status: 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly plan: PatchMapEditorWorkflowPlan;
  readonly facts: PatchMapEditorWorkflowFacts;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly diagnostic: PatchMapEditorWorkflowDiagnostic | PatchMapEngineDiagnostic | null;
  readonly history: PatchMapHistoryState;
  readonly selectionIds: readonly string[];
  readonly probe: PatchMapEditorWorkflowProbe;
}

export interface PatchMapEngineEditorMutationMatrixInput {
  readonly mutationKinds: readonly PatchMapEditorMutationKind[];
  readonly oneActionEach: true;
  readonly companion: PatchMapMutationJsonValue;
}

export interface PatchMapEngineEditorMutationMatrixResult {
  readonly schemaRevision: typeof PATCH_MAP_EDITOR_WORKFLOW_REVISION;
  readonly status: 'committed' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly requestedCount: number;
  readonly executedCount: number;
  readonly transactions: readonly PatchMapEngineTransactionResult[];
  readonly history: PatchMapHistoryState;
  readonly companionRestored: boolean;
}

interface PatchMapEnginePatchResultBase {
  readonly changed: boolean;
  readonly target: PatchMapSemanticTarget | null;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly PatchMapSemanticTarget[];
  readonly missing: readonly PatchMapSemanticTarget[];
  readonly unchanged: readonly PatchMapSemanticTarget[];
}

export type PatchMapEnginePatchResult =
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: PatchMapSemanticTarget;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'unchanged';
      readonly changed: false;
      readonly target: PatchMapSemanticTarget;
    }>
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly mutationDiagnostic?: PatchMapSemanticMutationDiagnostic;
    }>
  | Readonly<PatchMapEnginePatchResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: PatchMapSemanticTarget;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>;

interface PatchMapEngineDestroyTargetResultBase {
  readonly changed: boolean;
  readonly target: PatchMapSemanticTarget | null;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly PatchMapSemanticTarget[];
  readonly missing: readonly PatchMapSemanticTarget[];
  readonly unchanged: readonly PatchMapSemanticTarget[];
}

export type PatchMapEngineDestroyTargetResult =
  | Readonly<PatchMapEngineDestroyTargetResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: Extract<PatchMapSemanticTarget, { readonly kind: 'element' }>;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>
  | Readonly<PatchMapEngineDestroyTargetResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly mutationDiagnostic: PatchMapSemanticMutationDiagnostic;
    }>
  | Readonly<PatchMapEngineDestroyTargetResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: Extract<PatchMapSemanticTarget, { readonly kind: 'element' }>;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
    }>;

export interface PatchMapDatasetSubmission {
  readonly requestId: string;
  readonly datasetRef?: string;
  readonly sourceRevision?: number;
  readonly input: Promise<unknown>;
  /** Per-request temporary-resource disposer; invoked exactly once. */
  readonly release?: (
    result: PatchMapDatasetSubmissionResult,
  ) => void | Promise<void>;
}

export type PatchMapDatasetSubmissionResult =
  | Readonly<{
      status: 'committed';
      requestId: string;
      sourceRevision?: number;
      sceneRevision: number;
      semanticHash: string;
    }>
  | Readonly<{
      status: 'superseded';
      requestId: string;
      sourceRevision?: number;
      diagnostic: PatchMapEngineDiagnostic;
    }>
  | Readonly<{
      status: 'rejected';
      requestId: string;
      sourceRevision?: number;
      diagnostic: PatchMapEngineDiagnostic;
    }>;

export interface PatchMapEnginePresentationResult {
  readonly changed: boolean;
  readonly publication: 'pending' | 'current';
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly policy: PatchMapPresentationPolicyProductProbe;
}

export interface PatchMapLiveOverlayTuple {
  readonly sourceRevision: number;
  readonly payloadHash: string;
  readonly sceneRevision: number;
}

export interface PatchMapLiveOverlayPublishedTuple extends PatchMapLiveOverlayTuple {
  readonly frameRevision: number;
}

export interface PatchMapLiveOverlayInput {
  readonly sourceRevision: number;
  readonly payloadHash: string;
  readonly transaction: PatchMapMutationTransactionRequest;
}

export type PatchMapLiveOverlayResult =
  | Readonly<{
      readonly status: 'accepted';
      readonly changed: boolean;
      readonly publication: 'pending';
      readonly tuple: PatchMapLiveOverlayTuple;
      readonly transaction: PatchMapEngineTransactionResult;
    }>
  | Readonly<{
      readonly status: 'superseded' | 'rejected';
      readonly changed: false;
      readonly sourceRevision: number;
      readonly payloadHash: string;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly transaction?: PatchMapEngineTransactionResult;
    }>;

export interface PatchMapLiveOverlayProbe {
  readonly latestAccepted: PatchMapLiveOverlayTuple | null;
  readonly latestPublished: PatchMapLiveOverlayPublishedTuple | null;
  readonly pendingPublicationCount: 0 | 1;
  readonly acceptedCount: number;
  readonly publicationCount: number;
}

export interface PatchMapSemanticRefreshInput {
  readonly targets: readonly PatchMapSemanticTarget[];
  readonly strict?: boolean;
  readonly recordHistory?: boolean;
}

export type PatchMapEngineSemanticRefreshResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: true;
      readonly publication: 'pending';
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly recomputedTargets: readonly string[];
      readonly missingTargets: readonly string[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly dataDiffCount: 0;
      readonly history: PatchMapHistoryState;
      readonly selectionIds: readonly string[];
    }>
  | Readonly<{
      readonly status: 'unchanged' | 'rejected';
      readonly changed: false;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly recomputedTargets: readonly string[];
      readonly missingTargets: readonly string[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly dataDiffCount: 0;
      readonly history: PatchMapHistoryState;
      readonly selectionIds: readonly string[];
      readonly diagnostic?: PatchMapEngineDiagnostic;
    }>;

export interface PatchMapExternalDependencyResult {
  readonly changed: boolean;
  readonly dependencyId: string;
  readonly previousRevision: string | null;
  readonly revision: string;
}

export interface PatchMapEngineSnapshot {
  readonly lifecycle: PatchMapLifecycle;
  readonly instanceId: string | null;
  readonly revisions: PatchMapRevisionStamp;
  readonly publishedTuple: PatchMapPublishedTuple;
  readonly frameRevision: number;
  readonly datasetRef: string | null;
  readonly semanticHash: string | null;
  readonly rootIds: readonly string[];
  readonly historyDepth: number;
  readonly pendingWork: number;
  readonly zoomLimits: readonly [number, number];
  readonly viewport: PatchMapViewportState;
  readonly selectionIds: readonly string[];
  readonly facilities: readonly string[];
  readonly resources: Readonly<{
    canvasCount: number;
    canvas: Readonly<{
      cssSize: readonly [number, number];
      backingSize: readonly [number, number];
    }>;
    renderer: Readonly<{
      resolution: number;
      antialias: boolean;
      background: string;
      backend: 'webgl' | 'webgpu';
    }> | null;
    rendering: Readonly<{
      commandCount: number | null;
      visiblePrimitiveCount: number | null;
    }>;
    assets: PatchMapAssetSessionProbe | null;
    subscriptions: Readonly<{ active: number; duplicates: 0 }>;
  }>;
}

export type PatchMapEngineHistoryResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: true;
      readonly direction: PatchMapHistoryDirection;
      readonly actionId: string;
      readonly recordCount: number;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string;
      readonly publication: 'pending';
      readonly history: PatchMapHistoryState;
    }>
  | Readonly<{
      readonly status: 'unavailable';
      readonly changed: false;
      readonly direction: PatchMapHistoryDirection;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string | null;
      readonly history: PatchMapHistoryState;
    }>
  | Readonly<{
      readonly status: 'refused';
      readonly changed: false;
      readonly direction: PatchMapHistoryDirection;
      readonly previousRevisions: PatchMapRevisionStamp;
      readonly revisions: PatchMapRevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string | null;
      readonly diagnostic: PatchMapEngineDiagnostic;
      readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
      readonly history: PatchMapHistoryState;
    }>;

export interface PatchMapEngineHistoryCompanionState {
  readonly selectionIds: readonly string[];
  readonly mode: PatchMapInteractionMode;
  /** Detached host-authored JSON restored atomically with Engine state. */
  readonly hostCompanion: PatchMapMutationJsonValue | null;
}

export type PatchMapEngineHistoryCapacityResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: boolean;
      readonly code: null;
      readonly change: PatchMapHistoryCapacityChange;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly changed: false;
      readonly code: 'INVALID_VALUE';
      readonly capacity: number;
      readonly history: PatchMapHistoryState;
    }>;

export interface PatchMapEngineHistoryClearResult {
  readonly changed: boolean;
  readonly reason: 'host' | 'replace' | 'destroy';
  readonly history: PatchMapHistoryState;
}

export interface PatchMapHistoryShortcutInput {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly pathKind: string;
}

export interface PatchMapHistoryShortcutResult {
  readonly action: PatchMapHistoryDirection | null;
  readonly handled: boolean;
  readonly preventDefault: boolean;
  readonly result: PatchMapEngineHistoryResult | null;
}

export interface PatchMapEngineHistoryRestoredEvent {
  readonly direction: PatchMapHistoryDirection;
  readonly sceneRevision: number;
  readonly selectionIds: readonly string[];
  readonly mode: PatchMapInteractionMode;
  readonly publication: 'pending';
}

export interface PatchMapEngineHistoryVisibleEvent {
  readonly direction: PatchMapHistoryDirection;
  readonly sceneRevision: number;
  readonly frameRevision: number;
  readonly publication: 'published';
}

export interface PatchMapEngineTransformerEditOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapEngineTransformerEditResult {
  readonly schemaRevision: typeof PATCH_MAP_TRANSFORMER_EDIT_REVISION;
  readonly status: PatchMapTransformerEditPlan['status'] | PatchMapEngineTransactionResult['status'];
  readonly changed: boolean;
  readonly plan: PatchMapTransformerEditPlan;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly historyDepthDelta: number;
}

export interface PatchMapEngineTransformerSessionBeginInput {
  readonly pointerId: number;
  readonly actionId: string;
  readonly kind: PatchMapTransformerEditKind;
  readonly handle: PatchMapTransformerHandle;
  readonly selectionIds?: readonly string[];
}

export interface PatchMapEngineTransformerSessionProbe {
  readonly schemaRevision: typeof PATCH_MAP_TRANSFORMER_EDIT_REVISION;
  readonly activeSessionCount: 0 | 1;
  readonly activePointerId: number | null;
  readonly activeKind: PatchMapTransformerEditKind | null;
  readonly activeActionId: string | null;
  readonly previewCount: number;
  readonly committedMutationCount: number;
  readonly cancelledSessionCount: number;
  readonly staleCompletionCount: number;
  readonly previewOverlayCount: 0 | 1;
  readonly edgePanActiveCount: 0;
}

export interface PatchMapEngineTransformerPreviewResult {
  readonly status: 'previewed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly plan: PatchMapTransformerEditPlan;
  readonly reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[];
  readonly probe: PatchMapEngineTransformerSessionProbe;
}

export interface PatchMapEngineTransformerCompletionResult {
  readonly status: 'committed' | 'unchanged' | 'refused' | 'stale';
  readonly changed: boolean;
  readonly mutationCount: 0 | 1;
  readonly historyDepthDelta: 0 | 1;
  readonly transaction: PatchMapEngineTransactionResult | null;
  readonly gesture: Readonly<{
    readonly completed: boolean;
    readonly pointer: PatchMapOwnedGestureTermination | null;
    readonly probe: PatchMapTransformerGestureProbe;
  }> | null;
  readonly probe: PatchMapEngineTransformerSessionProbe;
}

export interface PatchMapEngineTransformerCancelResult {
  readonly status: 'cancelled' | 'stale';
  readonly cancelled: boolean;
  readonly reason: PatchMapGestureCancelReason;
  readonly historyDepthDelta: 0;
  readonly gesture: Readonly<{
    readonly cancelled: boolean;
    readonly pointer: PatchMapOwnedGestureTermination | null;
    readonly probe: PatchMapTransformerGestureProbe;
  }> | null;
  readonly probe: PatchMapEngineTransformerSessionProbe;
}

export interface PatchMapEngineTransformerEdgePanResult extends PatchMapEdgeAutoPanResult {
  readonly policyRestored: true;
  readonly edgePanActiveCount: 0;
}
