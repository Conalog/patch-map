import {
  createCoreV2,
  type CoreV2,
  type CoreV2BarPresentationProductProbe,
  type CoreV2ComponentVisualGeometryProbe,
  type CoreV2ComponentVisualProductProbe,
  type CoreV2ComponentVisualTarget,
  type CoreV2Options,
  type CoreV2RootViewportChangeSource,
  type CoreV2SemanticRefreshResult,
  type CoreV2TextGeometryProbe,
  type CoreV2TextProductProbe,
  type CoreV2TextRendererProductProbe,
  type CoreV2TextStateProbe,
  type CoreV2TextTarget,
  type CoreV2TextTransformProbe,
  normalizeCoreV2TextTarget,
} from './core';
import type {
  CoreV2PresentationPolicyInput,
  CoreV2PresentationPolicyProductProbe,
} from './presentation-policy';
import {
  CORE_V2_DEFAULT_VIEWPORT_POLICIES,
  CORE_V2_VIEWPORT_POLICIES,
  CORE_V2_VIEWPORT_REVISION,
  coreV2BoundsCenter,
  coreV2ViewportFitScale,
  normalizeCoreV2ViewportPadding,
  resolveCoreV2ViewportContributors,
  type CoreV2ViewportContributorResult,
  type CoreV2ViewportPolicy,
} from './viewport';
import type { CoreV2PaintOrderProductProbe } from './paint-order-product';
import type { SceneSnapshot, SlotRange } from '../core-v1/contracts';
import type {
  CoreV2ImageSourceKind,
  CoreV2ProjectionIndex,
  CoreV2TextProjection,
} from './contracts';
import type {
  CoreV2EntityPaintProbe,
  CoreV2RenderLaneSnapshot,
} from './renderers/types';
import type {
  CoreV2SceneImageAttemptProbe,
  CoreV2SceneImageProductProbe,
  CoreV2SceneImagesProbe,
} from './scene-images';
import {
  CORE_V2_ASSET_RUNTIME,
  CORE_V2_BUILTIN_ASSETS,
  CoreV2AssetError,
  type CoreV2AssetAcquisition,
  type CoreV2AssetPolicy,
  type CoreV2AssetRegistration,
  type CoreV2AssetRegistrationResult,
  type CoreV2AssetRuntime,
  type CoreV2AssetRuntimeProbe,
  type CoreV2AssetSession,
  type CoreV2AssetSessionProbe,
} from './assets';
import {
  coreV2AffineBasis,
  coreV2AffineCorners,
  createCoreV2Affine,
  invertCoreV2Affine,
  multiplyCoreV2Affine,
  type CoreV2AffineBasis,
} from './semantic/geometry';
import {
  relationPathHitScreen,
  resolveCoreV2RelationPath,
} from './semantic/relations';
import {
  CoreV2DatasetError,
  materializeCoreV2Dataset,
  type MaterializedCoreV2Dataset,
  type CoreV2AssetSource,
  type CoreV2BackgroundSource,
  type CoreV2Component,
  type CoreV2ComponentSize,
  type CoreV2ComponentType,
  type CoreV2TextStyle,
  type NormalizedCoreV2Element,
} from './semantic/dataset';
import {
  createCoreV2SemanticProbe,
  type CoreV2SemanticProductProbe,
  type CoreV2SemanticTarget,
} from './semantic/probe';
import {
  applyCoreV2SemanticPatch,
  removeCoreV2SemanticTarget,
  type CoreV2SemanticMutationDiagnostic,
} from './semantic/mutation';
import {
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  planCoreV2BulkPatch,
  planCoreV2MutationTransaction,
  type CoreV2BulkPatchRequest,
  type CoreV2MutationOperation,
  type CoreV2MutationTarget,
  type CoreV2MutationTransactionDiagnostic,
  type CoreV2MutationTransactionPlan,
  type CoreV2MutationTransactionRequest,
} from './semantic/transaction';
import {
  applyCoreV2RelativeGeometryUpdate,
  resizeCoreV2GeometryAroundOrigin,
  type CoreV2RelativeGeometryChanges,
  type CoreV2VisibleCenterResize,
} from './semantic/geometry-update';
import type { CoreV2ReconcileDiagnostic } from './semantic/reconcile';
import { CoreV2PresentationError } from './presentation';
import {
  CoreV2SemanticHistory,
  type CoreV2HistoryDirection,
  type CoreV2HistoryPreparedRecord,
  type CoreV2HistoryState,
  type CoreV2SemanticHistorySnapshotInput,
} from './history';

export type CoreV2Lifecycle =
  | 'new'
  | 'initializing'
  | 'ready-empty'
  | 'scene-ready'
  | 'destroying'
  | 'destroyed';

export type CoreV2DiagnosticCategory =
  | 'INVALID_INPUT'
  | 'MISSING_TARGET'
  | 'STALE_TARGET'
  | 'NOT_READY'
  | 'DESTROYED'
  | 'CANCELLED'
  | 'SUPERSEDED'
  | 'CONFLICT'
  | 'ASSET_FAILURE'
  | 'EXTRACTION_FAILURE'
  | 'UNSUPPORTED_RUNTIME'
  | 'RENDERER_LOST'
  | 'HOST_CALLBACK_FAILURE'
  | 'INTERNAL_FAILURE';

export interface CoreV2EngineDiagnostic {
  readonly code: string;
  readonly category: CoreV2DiagnosticCategory;
  readonly operation: string;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly revisionStamp: CoreV2RevisionStamp;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly unchangedCount: number;
  readonly datasetPath?: string;
}

export interface CoreV2RevisionStamp {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly viewRevision: number;
  readonly interactionRevision: number;
}

export interface CoreV2PublishedTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export interface CoreV2SurfaceOptions {
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly antialias: boolean;
  readonly background: number;
  readonly strategy: 'mesh' | 'particle';
  readonly preference: 'webgl' | 'webgpu';
  readonly powerPreference: 'high-performance' | 'low-power';
  readonly assetSession?: CoreV2AssetSession;
}

export interface CoreV2Point {
  readonly x: number;
  readonly y: number;
}

export interface CoreV2ViewportState {
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
  readonly screenBounds: readonly [number, number, number, number];
}

export type CoreV2ViewportChangeSource =
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

export interface CoreV2ViewportChangeResult {
  readonly changed: boolean;
  readonly blocked: boolean;
  readonly source: CoreV2ViewportChangeSource;
  readonly previous: CoreV2ViewportState;
  readonly viewport: CoreV2ViewportState;
  readonly previousRevisions: CoreV2RevisionStamp;
  readonly revisions: CoreV2RevisionStamp;
}

export interface CoreV2SurfaceViewportInput {
  readonly source: CoreV2RootViewportChangeSource;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
}

export interface CoreV2SerializedViewportState {
  readonly schemaRevision: typeof CORE_V2_VIEWPORT_REVISION;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
}

export interface CoreV2ViewportPersistenceProbe {
  readonly settledPublicationCount: number;
  readonly persistenceWriteCount: number;
  readonly equivalentSaveCount: 0;
  readonly suppressedEquivalentSaveCount: number;
  readonly settled: boolean;
  readonly serialized: CoreV2SerializedViewportState | null;
}

export interface CoreV2HostLifecycleRebindResult {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly canvasCount: number;
  readonly selectionIds: readonly string[];
  readonly revisions: CoreV2RevisionStamp;
}

export interface CoreV2ViewportSettleResult {
  readonly changed: boolean;
  readonly viewport: CoreV2ViewportState;
  readonly publicationCount: number;
  readonly persistence: CoreV2ViewportPersistenceProbe;
}

export interface CoreV2ViewportRestoreResult {
  readonly status: 'restored' | 'fallback:auto-fit';
  readonly changed: boolean;
  readonly viewport: CoreV2ViewportState;
  readonly fit: CoreV2ViewportFitResult | null;
}

export interface CoreV2ViewportTargetOptions {
  readonly targets?: readonly string[] | null;
  readonly rejectIds?: readonly string[];
  readonly relationEndpointsAvailable?: boolean;
}

export interface CoreV2ViewportFocusResult extends CoreV2ViewportContributorResult {
  readonly status: 'applied' | 'empty';
  readonly changed: boolean;
  readonly viewport: CoreV2ViewportState;
}

export interface CoreV2ViewportFitOptions extends CoreV2ViewportTargetOptions {
  readonly paddingCssPx?: number | readonly [number, number];
}

export interface CoreV2ViewportFitResult extends CoreV2ViewportContributorResult {
  readonly status: 'applied' | 'empty';
  readonly changed: boolean;
  readonly paddingCssPx: readonly [number, number];
  readonly viewport: CoreV2ViewportState;
}

export type CoreV2ViewportPolicyOperation =
  | Readonly<{ readonly op: 'add' | 'start' | 'stop' | 'remove'; readonly policy: CoreV2ViewportPolicy }>
  | Readonly<{ readonly op: 'temporary'; readonly policy: CoreV2ViewportPolicy }>
  | Readonly<{ readonly op: 'restore-temporary' | 'cancel-all' | 'redraw' }>;

export interface CoreV2ViewportPolicyProbe {
  readonly schemaRevision: typeof CORE_V2_VIEWPORT_REVISION;
  readonly policies: readonly CoreV2ViewportPolicy[];
  readonly enabledPolicies: readonly CoreV2ViewportPolicy[];
  readonly temporary: boolean;
  readonly callbacksByPolicy: Readonly<Record<CoreV2ViewportPolicy, 0 | 1>>;
  readonly resources: Readonly<{
    readonly tickers: 0;
    readonly listeners: 0;
    readonly captures: 0;
    readonly motions: 0 | 1;
    readonly cursors: 0;
  }>;
  readonly destroyed: boolean;
}

export interface CoreV2WorldTransformInput {
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export type CoreV2WorldTransformState = CoreV2WorldTransformInput;

export interface CoreV2SurfaceView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
}

export interface CoreV2SurfaceDebug {
  readonly cssSize: readonly [number, number];
  readonly backingSize: readonly [number, number];
  readonly selectionIds: readonly string[];
  readonly activeAnimationCount: number;
  /** Public aggregate renderer facts. Injected legacy surfaces may omit them. */
  readonly activeGestureCount?: number;
  readonly renderCommandCount?: number;
  readonly visiblePrimitiveCount?: number;
}

export interface CoreV2InteractionOwnershipProbe {
  readonly rootBindingCount: number;
  readonly entityCallbackCount: number;
}

export interface CoreV2SurfaceEntityGeometry {
  readonly id: string;
  readonly kind: string;
  readonly localBounds?: readonly [number, number, number, number];
  readonly worldBounds: readonly [number, number, number, number];
  readonly screenBounds: readonly [number, number, number, number];
  readonly visibleBounds?: readonly [number, number, number, number] | null;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly componentType?: string;
  readonly contentOrientation?: 'follow-item' | 'upright';
  readonly screenBasis?: CoreV2AffineBasis;
  readonly visibleCenter?: readonly [number, number];
  readonly screenAngle?: number;
}

export interface CoreV2SurfaceRelationGeometry {
  readonly id: string;
  readonly relationId?: string;
  readonly key?: string;
  readonly identityKey?: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind?: 'segment' | 'polyline';
  readonly localPoints?: readonly (readonly [number, number])[];
  readonly worldPoints?: readonly (readonly [number, number])[];
  readonly screenPoints?: readonly (readonly [number, number])[];
  readonly worldBounds?: readonly [number, number, number, number];
  readonly screenBounds?: readonly [number, number, number, number];
  readonly visible?: boolean;
  readonly style?: Readonly<{
    readonly color: number;
    readonly colorHex: string;
    readonly width: number;
    readonly opacity: number;
    readonly zIndex: number;
  }>;
  readonly visibleStrokeWidthsCssPx?: readonly number[];
  readonly worldEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  readonly screenEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
}

export interface CoreV2SurfaceOmittedRelationGeometry {
  readonly id: string;
  readonly relationId: string;
  readonly key: string;
  readonly identityKey: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly authoredIndex: number;
  readonly reason: 'missing-source' | 'missing-target' | 'missing-source-and-target';
}

export interface CoreV2SurfaceGeometrySnapshot {
  /** Surface geometry generation; legacy injected surfaces may use the dense scene revision. */
  readonly revision?: number;
  /** Dense scene revision used to derive the snapshot, when independently available. */
  readonly sceneRevision?: number;
  readonly entities: readonly CoreV2SurfaceEntityGeometry[];
  readonly relations: readonly CoreV2SurfaceRelationGeometry[];
  readonly omittedRelations?: readonly CoreV2SurfaceOmittedRelationGeometry[];
  readonly selectionOverlay: Readonly<{
    screenBounds: readonly [number, number, number, number];
  }> | null;
}

export interface CoreV2GeometryRevisionTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export type CoreV2EngineGeometryProbe = Readonly<
  Omit<CoreV2SurfaceGeometrySnapshot, 'revision' | 'sceneRevision'> & {
    /** Engine scene revision represented by the correlated surface generation. */
    readonly revision: number | null;
    /** Independent surface geometry generation, when published. */
    readonly surfaceRevision: number | null;
    /** Engine revision tuple represented by the correlated surface generation. */
    readonly representedRevisions: CoreV2GeometryRevisionTuple | null;
    /** Per-domain lag from the current Engine tuple. */
    readonly revisionLags: CoreV2GeometryRevisionTuple | null;
    /** Scene-domain compatibility projection of `revisionLags.scene`. */
    readonly revisionLag: number | null;
  }
>;

export interface CoreV2EngineRelationProbe {
  readonly revision: number | null;
  readonly surfaceRevision: number | null;
  readonly representedRevisions: CoreV2GeometryRevisionTuple | null;
  readonly revisionLags: CoreV2GeometryRevisionTuple | null;
  readonly revisionLag: number | null;
  readonly relations: readonly CoreV2SurfaceRelationGeometry[];
  readonly omittedRelations: readonly CoreV2SurfaceOmittedRelationGeometry[];
}

export interface CoreV2RelationHitOptions {
  readonly toleranceCssPx?: number;
}

export interface CoreV2RelationHit {
  readonly id: string;
  readonly relationId: string;
  readonly key: string;
  readonly identityKey: string;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface CoreV2RelationHitIndex {
  /** Screen-grid candidates in ascending scene order. */
  readonly cells: ReadonlyMap<string, readonly number[]>;
  /** Oversized paths tested for every query, also in ascending scene order. */
  readonly overflow: readonly number[];
}

export interface CoreV2SurfaceReconcileResult {
  readonly status: 'committed' | 'refused';
  readonly operationCount: number;
  readonly denseChanged: boolean;
  readonly diagnostics: readonly CoreV2ReconcileDiagnostic[];
}

export interface CoreV2SurfaceReconcileOptions {
  /** Animate direct component bar changes; snap ancestor/layout reconciliation. */
  readonly animateBarChanges?: boolean;
  /** Owner-qualified direct bar destinations permitted to animate. */
  readonly animatedBarTargets?: readonly Readonly<{
    readonly ownerId: string;
    readonly componentId: string;
  }>[];
  /** Semantic item owners whose supplied component order is authoritative. */
  readonly allowedComponentOrderOwners?: readonly string[];
  /** Semantic hierarchy IDs whose retained aggregate order may change. */
  readonly allowedElementOrderIds?: readonly string[];
  /** Logical selection replacement committed with the candidate scene. */
  readonly selectionIds?: readonly string[];
}

export interface CoreV2EngineSceneImageAttemptProbe extends Omit<
  CoreV2SceneImageAttemptProbe,
  'authoredSource' | 'sourceKind' | 'resourceState'
> {
  readonly authoredSource?: CoreV2AssetSource;
  readonly authoredSourceKind?: CoreV2ImageSourceKind;
  readonly state: CoreV2SceneImageAttemptProbe['resourceState'];
}

export interface CoreV2EngineSceneImageRecord extends Omit<
  CoreV2SceneImageProductProbe,
  'authoredSource' | 'attempts'
> {
  readonly authoredSource?: CoreV2AssetSource;
  readonly authoredSourceKind?: CoreV2ImageSourceKind;
  readonly opacity: number;
  readonly zIndex: number;
  readonly hitBounds: readonly [number, number, number, number] | null;
  readonly initial: CoreV2EngineSceneImageAttemptProbe | null;
  readonly attempts: readonly CoreV2EngineSceneImageAttemptProbe[];
}

export type CoreV2EngineSceneImagesProbe = Readonly<
  Omit<CoreV2SceneImagesProbe, 'images'> & {
    readonly images: Readonly<Record<string, CoreV2EngineSceneImageRecord>>;
  }
>;

export interface CoreV2SurfaceComponentVisualProbe {
  readonly target: CoreV2ComponentVisualTarget;
  readonly semanticOwnerId: string;
  readonly entityId: string;
  readonly logicalIdentity: string;
  readonly componentType: string;
  readonly renderRole: CoreV2ComponentVisualProductProbe['renderRole'];
  readonly entityKind: string;
  readonly geometry: CoreV2ComponentVisualGeometryProbe;
  readonly publication: CoreV2ComponentVisualProductProbe['publication'];
  readonly sceneImage: CoreV2EngineSceneImageRecord | null;
  readonly rendererPaint: CoreV2EntityPaintProbe | null;
  readonly renderLanes: CoreV2RenderLaneSnapshot | null;
}

export interface CoreV2EngineComponentSemanticProbe {
  readonly target: Readonly<{
    readonly kind: 'component';
    readonly ownerId: string;
    readonly id: string;
  }>;
  readonly ownerId: string;
  readonly componentId: string;
  readonly componentType: CoreV2ComponentType;
  readonly authoredSize: CoreV2ComponentSize | null;
  readonly source: CoreV2BackgroundSource | null;
  readonly tint: unknown;
  readonly show: boolean;
}

export interface CoreV2EngineComponentVisualProbe {
  readonly target: CoreV2ComponentVisualTarget;
  readonly semantic: CoreV2EngineComponentSemanticProbe | null;
  readonly entityId: string | null;
  readonly logicalIdentity: string | null;
  readonly componentType: string | null;
  readonly renderRole: CoreV2ComponentVisualProductProbe['renderRole'] | null;
  readonly entityKind: string | null;
  readonly geometry: CoreV2ComponentVisualGeometryProbe | null;
  readonly publication: CoreV2ComponentVisualProductProbe['publication'] | null;
  readonly sceneImage: CoreV2EngineSceneImageRecord | null;
  readonly rendererPaint: CoreV2EntityPaintProbe | null;
  readonly renderLanes: CoreV2RenderLaneSnapshot | null;
  readonly revisions: CoreV2RevisionStamp;
  readonly availability: Readonly<{
    readonly semantic: boolean;
    readonly surface: boolean;
    readonly rendererPaint: boolean;
    readonly renderLanes: boolean;
  }>;
}

export interface CoreV2EngineBarPresentationProbe extends CoreV2BarPresentationProductProbe {
  readonly revisions: CoreV2RevisionStamp;
  readonly publishedTuple: CoreV2PublishedTuple;
  readonly frameRevision: number;
}

export interface CoreV2EngineTextSemanticProbe {
  readonly target: CoreV2TextTarget;
  readonly semanticOwnerId: string;
  readonly source: string;
  readonly authoredStyle: CoreV2TextStyle;
  readonly placement: CoreV2TextProjection['placement'];
  readonly margin: CoreV2TextProjection['margin'];
  readonly tint: unknown;
  readonly split: number;
  readonly show: boolean;
  readonly locked: boolean;
  readonly contentOrientation: CoreV2TextProjection['contentOrientation'];
}

export type CoreV2EngineTextPublicationStatus =
  | 'unavailable'
  | 'absent'
  | 'pending'
  | 'current';

export interface CoreV2EngineTextRevisionTuple {
  readonly current: CoreV2RevisionStamp;
  readonly published: CoreV2PublishedTuple;
  readonly frameRevision: number;
  readonly surfaceSceneRevision: number | null;
  readonly surfaceRenderedSceneRevision: number | null;
  readonly rendererFrame: number | null;
}

export interface CoreV2EngineTextProbe {
  readonly target: CoreV2TextTarget;
  readonly semantic: CoreV2EngineTextSemanticProbe | null;
  readonly semanticOwnerId: string | null;
  readonly entityId: string | null;
  readonly projection: CoreV2TextProjection | null;
  readonly geometry: CoreV2TextGeometryProbe | null;
  readonly state: CoreV2TextStateProbe | null;
  readonly transform: CoreV2TextTransformProbe | null;
  readonly renderer: CoreV2TextRendererProductProbe | null;
  readonly rendererPaint: CoreV2EntityPaintProbe | null;
  readonly renderLanes: CoreV2RenderLaneSnapshot | null;
  readonly publication: Readonly<{
    readonly status: CoreV2EngineTextPublicationStatus;
    readonly revisions: CoreV2EngineTextRevisionTuple;
  }>;
  readonly availability: Readonly<{
    readonly semantic: boolean;
    readonly surface: boolean;
    readonly renderer: boolean;
    readonly rendererPaint: boolean;
    readonly renderLanes: boolean;
  }>;
}

export type CoreV2EnginePaintOrderProbe = Readonly<
  CoreV2PaintOrderProductProbe & {
    readonly revisions: CoreV2RevisionStamp;
    readonly publishedTuple: CoreV2PublishedTuple;
    readonly frameRevision: number;
    readonly history: CoreV2HistoryState;
  }
>;

export interface CoreV2EngineSurface {
  readonly canvasCount: number;
  readonly destroyed: boolean;
  load(input: unknown): void;
  loadAsync?(input: unknown, assertCurrent?: () => void): Promise<void>;
  /**
   * Atomically reconcile a detached PATCH MAP candidate without replacing the
   * whole dense scene. Older injected surfaces may omit this capability; the
   * Engine then refuses partial mutation instead of falling back to `load`.
   */
  reconcile?(
    input: unknown,
    options?: CoreV2SurfaceReconcileOptions,
  ): CoreV2SurfaceReconcileResult;
  publishFrame(timeMs: number): void;
  resize(width: number, height: number, pixelRatio: number): boolean;
  setView(view: CoreV2SurfaceView): void;
  setViewportGesturePolicies?(policies: readonly CoreV2ViewportPolicy[]): void;
  setViewportZoomLimits?(limits: readonly [number, number]): void;
  bindViewportInput?(
    listener: (input: CoreV2SurfaceViewportInput) => void,
  ): () => void;
  cancelViewportGestures?(): void;
  select(ids: readonly string[]): void;
  setPresentationPolicy?(
    input: CoreV2PresentationPolicyInput,
  ): CoreV2PresentationPolicyProductProbe;
  clearPresentationPolicy?(): CoreV2PresentationPolicyProductProbe;
  presentationPolicyProbe?(): CoreV2PresentationPolicyProductProbe;
  refreshSemanticTargets?(
    targets: readonly CoreV2SemanticTarget[],
    options?: Readonly<{ readonly strict?: boolean }>,
  ): CoreV2SemanticRefreshResult;
  hitTestScreen(point: CoreV2Point): string | null;
  screenToWorld(point: CoreV2Point): CoreV2Point;
  debugSnapshot(): CoreV2SurfaceDebug;
  geometrySnapshot?(): CoreV2SurfaceGeometrySnapshot;
  sceneImageProbe?(): CoreV2EngineSceneImagesProbe;
  componentVisualProbe?(
    target: CoreV2ComponentVisualTarget,
  ): CoreV2SurfaceComponentVisualProbe | null;
  barPresentationProbe?(
    target: CoreV2ComponentVisualTarget,
  ): CoreV2BarPresentationProductProbe | null;
  paintOrderProbe?(): CoreV2PaintOrderProductProbe;
  textProbe?(target: CoreV2TextTarget): CoreV2TextProductProbe | null;
  settleSceneImages?(): Promise<void>;
  settleSceneImageBindings?(bindingKeys: readonly string[]): Promise<void>;
  relationHitTestScreen?(
    point: CoreV2Point,
    options?: CoreV2RelationHitOptions,
  ): CoreV2RelationHit | null;
  interactionOwnershipProbe?(): CoreV2InteractionOwnershipProbe;
  destroy(): Promise<boolean>;
}

export type CoreV2EngineSurfaceFactory = (
  options: CoreV2SurfaceOptions,
) => Promise<CoreV2EngineSurface>;

export interface CoreV2EngineOptions {
  readonly surfaceFactory?: CoreV2EngineSurfaceFactory;
  readonly assetRuntime?: CoreV2AssetRuntime;
  readonly assetPolicy?: CoreV2AssetPolicy;
  readonly historyLimit?: number;
}

export interface CoreV2InitializeOptions {
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
  readonly powerPreference?: 'high-performance' | 'low-power';
  readonly requiredAssets?: readonly CoreV2AssetRegistration[];
}

export interface CoreV2InitializeResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly instanceId: string;
  readonly revisions: CoreV2RevisionStamp;
  readonly facilities: readonly string[];
}

export interface CoreV2LoadOptions {
  readonly datasetRef?: string;
}

export interface CoreV2EngineLoadResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly sceneRevision: number;
  readonly semanticHash: string;
  readonly rootIds: readonly string[];
}

/**
 * Detached immutable query result. The private Engine registry, not these
 * public fields, authorizes later mutation use.
 */
export interface CoreV2ResolvedTargetSnapshot {
  readonly target: CoreV2MutationTarget;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface CoreV2EngineTransactionHistory {
  readonly recorded: boolean;
  readonly commandId: string | null;
  readonly depthDelta: number;
  readonly state: CoreV2HistoryState;
}

interface CoreV2EngineTransactionResultBase {
  readonly changed: boolean;
  readonly actionId: string | null;
  readonly previousRevisions: CoreV2RevisionStamp;
  readonly revisions: CoreV2RevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly CoreV2MutationTarget[];
  readonly missing: readonly CoreV2MutationTarget[];
  readonly unchanged: readonly CoreV2MutationTarget[];
  readonly history: CoreV2EngineTransactionHistory;
}

export type CoreV2EngineTransactionResult =
  | Readonly<CoreV2EngineTransactionResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>
  | Readonly<CoreV2EngineTransactionResultBase & {
      readonly status: 'unchanged';
      readonly changed: false;
    }>
  | Readonly<CoreV2EngineTransactionResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly transactionDiagnostic?: CoreV2MutationTransactionDiagnostic;
    }>
  | Readonly<CoreV2EngineTransactionResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>;

interface CoreV2EnginePatchResultBase {
  readonly changed: boolean;
  readonly target: CoreV2SemanticTarget | null;
  readonly previousRevisions: CoreV2RevisionStamp;
  readonly revisions: CoreV2RevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly CoreV2SemanticTarget[];
  readonly missing: readonly CoreV2SemanticTarget[];
  readonly unchanged: readonly CoreV2SemanticTarget[];
}

export type CoreV2EnginePatchResult =
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: CoreV2SemanticTarget;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'unchanged';
      readonly changed: false;
      readonly target: CoreV2SemanticTarget;
    }>
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly mutationDiagnostic?: CoreV2SemanticMutationDiagnostic;
    }>
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: CoreV2SemanticTarget;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>;

interface CoreV2EngineDestroyTargetResultBase {
  readonly changed: boolean;
  readonly target: CoreV2SemanticTarget | null;
  readonly previousRevisions: CoreV2RevisionStamp;
  readonly revisions: CoreV2RevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly CoreV2SemanticTarget[];
  readonly missing: readonly CoreV2SemanticTarget[];
  readonly unchanged: readonly CoreV2SemanticTarget[];
}

export type CoreV2EngineDestroyTargetResult =
  | Readonly<CoreV2EngineDestroyTargetResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: Extract<CoreV2SemanticTarget, { readonly kind: 'element' }>;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>
  | Readonly<CoreV2EngineDestroyTargetResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly mutationDiagnostic: CoreV2SemanticMutationDiagnostic;
    }>
  | Readonly<CoreV2EngineDestroyTargetResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: Extract<CoreV2SemanticTarget, { readonly kind: 'element' }>;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>;

export interface CoreV2DatasetSubmission {
  readonly requestId: string;
  readonly datasetRef?: string;
  readonly sourceRevision?: number;
  readonly input: Promise<unknown>;
  /** Per-request temporary-resource disposer; invoked exactly once. */
  readonly release?: (
    result: CoreV2DatasetSubmissionResult,
  ) => void | Promise<void>;
}

export type CoreV2DatasetSubmissionResult =
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
      diagnostic: CoreV2EngineDiagnostic;
    }>
  | Readonly<{
      status: 'rejected';
      requestId: string;
      sourceRevision?: number;
      diagnostic: CoreV2EngineDiagnostic;
    }>;

export interface CoreV2EnginePresentationResult {
  readonly changed: boolean;
  readonly publication: 'pending' | 'current';
  readonly previousRevisions: CoreV2RevisionStamp;
  readonly revisions: CoreV2RevisionStamp;
  readonly policy: CoreV2PresentationPolicyProductProbe;
}

export interface CoreV2LiveOverlayTuple {
  readonly sourceRevision: number;
  readonly payloadHash: string;
  readonly sceneRevision: number;
}

export interface CoreV2LiveOverlayPublishedTuple extends CoreV2LiveOverlayTuple {
  readonly frameRevision: number;
}

export interface CoreV2LiveOverlayInput {
  readonly sourceRevision: number;
  readonly payloadHash: string;
  readonly transaction: CoreV2MutationTransactionRequest;
}

export type CoreV2LiveOverlayResult =
  | Readonly<{
      readonly status: 'accepted';
      readonly changed: boolean;
      readonly publication: 'pending';
      readonly tuple: CoreV2LiveOverlayTuple;
      readonly transaction: CoreV2EngineTransactionResult;
    }>
  | Readonly<{
      readonly status: 'superseded' | 'rejected';
      readonly changed: false;
      readonly sourceRevision: number;
      readonly payloadHash: string;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly transaction?: CoreV2EngineTransactionResult;
    }>;

export interface CoreV2LiveOverlayProbe {
  readonly latestAccepted: CoreV2LiveOverlayTuple | null;
  readonly latestPublished: CoreV2LiveOverlayPublishedTuple | null;
  readonly pendingPublicationCount: 0 | 1;
  readonly acceptedCount: number;
  readonly publicationCount: number;
}

export interface CoreV2SemanticRefreshInput {
  readonly targets: readonly CoreV2SemanticTarget[];
  readonly strict?: boolean;
  readonly recordHistory?: boolean;
}

export type CoreV2EngineSemanticRefreshResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: true;
      readonly publication: 'pending';
      readonly previousRevisions: CoreV2RevisionStamp;
      readonly revisions: CoreV2RevisionStamp;
      readonly recomputedTargets: readonly string[];
      readonly missingTargets: readonly string[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly dataDiffCount: 0;
      readonly history: CoreV2HistoryState;
      readonly selectionIds: readonly string[];
    }>
  | Readonly<{
      readonly status: 'unchanged' | 'rejected';
      readonly changed: false;
      readonly previousRevisions: CoreV2RevisionStamp;
      readonly revisions: CoreV2RevisionStamp;
      readonly recomputedTargets: readonly string[];
      readonly missingTargets: readonly string[];
      readonly dirtyRanges: readonly SlotRange[];
      readonly dataDiffCount: 0;
      readonly history: CoreV2HistoryState;
      readonly selectionIds: readonly string[];
      readonly diagnostic?: CoreV2EngineDiagnostic;
    }>;

export interface CoreV2ExternalDependencyResult {
  readonly changed: boolean;
  readonly dependencyId: string;
  readonly previousRevision: string | null;
  readonly revision: string;
}

export interface CoreV2EngineSnapshot {
  readonly lifecycle: CoreV2Lifecycle;
  readonly instanceId: string | null;
  readonly revisions: CoreV2RevisionStamp;
  readonly publishedTuple: CoreV2PublishedTuple;
  readonly frameRevision: number;
  readonly datasetRef: string | null;
  readonly semanticHash: string | null;
  readonly rootIds: readonly string[];
  readonly historyDepth: number;
  readonly pendingWork: number;
  readonly zoomLimits: readonly [number, number];
  readonly viewport: CoreV2ViewportState;
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
    assets: CoreV2AssetSessionProbe | null;
    subscriptions: Readonly<{ active: number; duplicates: 0 }>;
  }>;
}

export type CoreV2EngineHistoryResult =
  | Readonly<{
      readonly status: 'committed';
      readonly changed: true;
      readonly direction: CoreV2HistoryDirection;
      readonly previousRevisions: CoreV2RevisionStamp;
      readonly revisions: CoreV2RevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string;
      readonly publication: 'pending';
      readonly history: CoreV2HistoryState;
    }>
  | Readonly<{
      readonly status: 'unavailable';
      readonly changed: false;
      readonly direction: CoreV2HistoryDirection;
      readonly previousRevisions: CoreV2RevisionStamp;
      readonly revisions: CoreV2RevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string | null;
      readonly history: CoreV2HistoryState;
    }>
  | Readonly<{
      readonly status: 'refused';
      readonly changed: false;
      readonly direction: CoreV2HistoryDirection;
      readonly previousRevisions: CoreV2RevisionStamp;
      readonly revisions: CoreV2RevisionStamp;
      readonly sceneRevision: number;
      readonly semanticHash: string | null;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
      readonly history: CoreV2HistoryState;
    }>;

type CoreV2EngineEventMap = {
  readonly ready: CoreV2InitializeResult;
  readonly sceneCommitted: CoreV2EngineLoadResult;
  readonly drawComplete: Readonly<{
    requestId: string;
    sourceRevision?: number;
    sceneRevision: number;
    semanticHash: string;
    datasetRef: string | null;
  }>;
  readonly frame: Readonly<{
    frameRevision: number;
    publishedTuple: CoreV2PublishedTuple;
  }>;
  readonly viewChanged: CoreV2ViewportChangeResult;
  readonly viewSettled: CoreV2ViewportSettleResult;
  readonly viewportPolicyChanged: CoreV2ViewportPolicyProbe;
  readonly presentationChanged: CoreV2EnginePresentationResult;
  readonly overlayAccepted: CoreV2LiveOverlayTuple;
  readonly overlayPublished: CoreV2LiveOverlayPublishedTuple;
  readonly semanticRefreshed: Extract<
    CoreV2EngineSemanticRefreshResult,
    { readonly status: 'committed' }
  >;
  readonly change:
    | Extract<CoreV2EnginePatchResult, { readonly status: 'committed' }>
    | Extract<CoreV2EngineTransactionResult, { readonly status: 'committed' }>;
  readonly targetDestroyed: Extract<
    CoreV2EngineDestroyTargetResult,
    { readonly status: 'committed' }
  >;
  readonly historyUndone: Extract<CoreV2EngineHistoryResult, { readonly status: 'committed' }>;
  readonly historyRedone: Extract<CoreV2EngineHistoryResult, { readonly status: 'committed' }>;
  readonly diagnostic: CoreV2EngineDiagnostic;
  readonly destroyed: Readonly<{ lifecycleGeneration: number }>;
};

type CoreV2EngineEvent = keyof CoreV2EngineEventMap;
type CoreV2EngineListener<K extends CoreV2EngineEvent> = (event: CoreV2EngineEventMap[K]) => void;

const DEFAULT_ZOOM_LIMITS = Object.freeze([0.5, 30] as const);
const EMPTY_MATERIALIZED_DATASET = materializeCoreV2Dataset([]);
const FACILITIES = Object.freeze([
  'renderer',
  'viewport',
  'world',
  'state',
  'history',
  'resize',
  'assets',
] as const);

interface IndexedEngineTextSemantic {
  readonly probe: CoreV2EngineTextSemanticProbe;
  readonly gridTemplate: boolean;
}

interface CoreV2ResolvedTargetAuthority {
  readonly target: CoreV2MutationTarget;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
}

interface CoreV2EngineHistoryCompanion {
  readonly selectionIds: readonly string[];
}

interface PreparedCoreV2EngineLoad {
  readonly materialized: MaterializedCoreV2Dataset;
  readonly componentSemantics: Map<string, CoreV2EngineComponentSemanticProbe>;
  readonly textSemantics: Map<string, IndexedEngineTextSemantic>;
}

export class CoreV2Engine {
  private readonly surfaceFactory: CoreV2EngineSurfaceFactory;
  private readonly assetRuntime: CoreV2AssetRuntime;
  private readonly assetPolicy: CoreV2AssetPolicy | undefined;
  private readonly history: CoreV2SemanticHistory<
    readonly NormalizedCoreV2Element[],
    CoreV2EngineHistoryCompanion
  >;
  private readonly listeners = new Map<CoreV2EngineEvent, Set<(event: unknown) => void>>();
  private lifecycle: CoreV2Lifecycle = 'new';
  private surface: CoreV2EngineSurface | null = null;
  private retainedCleanupSurface: CoreV2EngineSurface | null = null;
  private initializePromise: Promise<CoreV2InitializeResult> | null = null;
  private instanceId: string | null = null;
  private materialized: MaterializedCoreV2Dataset | null = null;
  private readonly resolvedTargetAuthorities = new WeakMap<
    CoreV2ResolvedTargetSnapshot,
    CoreV2ResolvedTargetAuthority
  >();
  private componentSemantics = new Map<string, CoreV2EngineComponentSemanticProbe>();
  private textSemantics = new Map<string, IndexedEngineTextSemantic>();
  private logicalSelectionIds: readonly string[] = Object.freeze([]);
  private datasetRef: string | null = null;
  private lifecycleGeneration = 0;
  private targetLifecycleGeneration = 0;
  private sceneRevision = 0;
  private viewRevision = 0;
  private interactionRevision = 0;
  private frameRevision = 0;
  private publishedTuple: CoreV2PublishedTuple = Object.freeze({ scene: 0, view: 0, interaction: 0 });
  private geometryRevisionCorrelation: Readonly<{
    readonly surfaceRevision: number;
    readonly representedRevisions: CoreV2GeometryRevisionTuple;
  }> | null = null;
  private zoomLimits: readonly [number, number] = DEFAULT_ZOOM_LIMITS;
  private rendererConfiguration: Readonly<{
    resolution: number;
    antialias: boolean;
    background: string;
    backend: 'webgl' | 'webgpu';
  }> | null = null;
  private submissionSequence = 0;
  private loadSequence = 0;
  private pendingWork = 0;
  private latestOverlayAccepted: CoreV2LiveOverlayTuple | null = null;
  private latestOverlayPublished: CoreV2LiveOverlayPublishedTuple | null = null;
  private pendingOverlayPublication: CoreV2LiveOverlayTuple | null = null;
  private overlayAcceptedCount = 0;
  private overlayPublicationCount = 0;
  private readonly externalDependencyRevisions = new Map<string, string>();
  private viewportWidth = 0;
  private viewportHeight = 0;
  private viewportPixelRatio = 1;
  private viewportCenterWorld: readonly [number, number] = Object.freeze([0, 0]);
  private viewportScale = 1;
  private viewportPolicyRegistry = new Set<CoreV2ViewportPolicy>(
    CORE_V2_DEFAULT_VIEWPORT_POLICIES,
  );
  private viewportPolicyEnabled = new Set<CoreV2ViewportPolicy>(
    CORE_V2_DEFAULT_VIEWPORT_POLICIES,
  );
  private viewportTemporaryPolicies: Readonly<{
    readonly registry: readonly CoreV2ViewportPolicy[];
    readonly enabled: readonly CoreV2ViewportPolicy[];
  }> | null = null;
  private viewportMotion: Readonly<{
    readonly velocityX: number;
    readonly velocityY: number;
  }> | null = null;
  private lastSettledViewportKey: string | null = null;
  private lastSerializedViewportKey: string | null = null;
  private lastSerializedViewport: CoreV2SerializedViewportState | null = null;
  private viewportSettledPublicationCount = 0;
  private viewportPersistenceWriteCount = 0;
  private viewportSuppressedEquivalentSaveCount = 0;
  private surfaceViewportInputUnbind: (() => void) | null = null;
  private worldRotationDegrees = 0;
  private worldFlipX = false;
  private worldFlipY = false;
  private assetSession: CoreV2AssetSession | null = null;
  private requiredAssetAcquisitions: CoreV2AssetAcquisition[] = [];

  public constructor(options: CoreV2EngineOptions = {}) {
    this.surfaceFactory = options.surfaceFactory ?? createPixiSurface;
    this.assetRuntime = options.assetRuntime ?? CORE_V2_ASSET_RUNTIME;
    this.assetPolicy = options.assetPolicy;
    this.history = new CoreV2SemanticHistory({
      ...(options.historyLimit === undefined ? {} : { capacity: options.historyLimit }),
    });
  }

  public on<K extends CoreV2EngineEvent>(event: K, listener: CoreV2EngineListener<K>): () => void {
    const listeners = this.listeners.get(event) ?? new Set<(event: unknown) => void>();
    listeners.add(listener as (event: unknown) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as (event: unknown) => void);
  }

  public registerAssets(
    instanceId: string,
    registrations: readonly CoreV2AssetRegistration[] = CORE_V2_BUILTIN_ASSETS,
  ): CoreV2AssetRegistrationResult {
    this.assertAssetLifecycle('registerAssets');
    return this.ensureAssetSession(instanceId).registerAssets(registrations);
  }

  public acquireAsset(alias: string): Promise<CoreV2AssetAcquisition> {
    this.assertAssetLifecycle('acquireAsset');
    if (!this.assetSession) {
      return Promise.reject(this.operationError('NOT_READY', 'NOT_READY', 'acquireAsset', true));
    }
    return this.assetSession.acquire(alias);
  }

  public assetProbe(alias?: string): Readonly<{
    session: CoreV2AssetSessionProbe | null;
    runtime: CoreV2AssetRuntimeProbe;
  }> {
    return Object.freeze({
      session: this.assetSession?.probe() ?? null,
      runtime: this.assetRuntime.probe(alias),
    });
  }

  public initialize(options: CoreV2InitializeOptions): Promise<CoreV2InitializeResult> {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      return Promise.reject(this.operationError('DESTROYED', 'DESTROYED', 'initialize', false));
    }
    if (this.retainedCleanupSurface) {
      return Promise.reject(
        this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'initialize', false),
      );
    }
    validateInitializeOptions(options);
    let assetSession: CoreV2AssetSession;
    try {
      assetSession = this.ensureAssetSession(options.instanceId);
    } catch (error) {
      return Promise.reject(this.assetInitializationError(error));
    }
    if (this.initializePromise) return this.initializePromise;
    if (this.surface) return Promise.resolve(this.initializeResult());
    try {
      if (options.requiredAssets) assetSession.registerAssets(options.requiredAssets);
    } catch (error) {
      return Promise.reject(this.assetInitializationError(error));
    }
    this.lifecycle = 'initializing';
    this.instanceId = options.instanceId;
    this.zoomLimits = normalizeZoomLimits(options.zoomLimits ?? DEFAULT_ZOOM_LIMITS);
    const surfaceOptions: CoreV2SurfaceOptions = {
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio ?? globalThis.devicePixelRatio ?? 1,
      antialias: options.antialias ?? true,
      background: normalizeBackground(options.background ?? '#FAFAFA'),
      strategy: options.strategy ?? 'mesh',
      preference: options.preference ?? 'webgl',
      powerPreference: options.powerPreference ?? 'high-performance',
      assetSession,
      ...(options.target ? { target: options.target } : {}),
      ...(options.canvas ? { canvas: options.canvas } : {}),
    };
    this.viewportWidth = surfaceOptions.width;
    this.viewportHeight = surfaceOptions.height;
    this.viewportPixelRatio = surfaceOptions.pixelRatio;
    this.viewportCenterWorld = Object.freeze([surfaceOptions.width / 2, surfaceOptions.height / 2]);
    this.viewportScale = 1;
    this.worldRotationDegrees = 0;
    this.worldFlipX = false;
    this.worldFlipY = false;
    this.resetViewportRuntime();
    const requiredAliases = options.requiredAssets?.map(({ alias }) => alias) ?? [];
    this.initializePromise = (async (): Promise<CoreV2InitializeResult> => {
      const attemptAcquisitions: CoreV2AssetAcquisition[] = [];
      let pendingSurface: CoreV2EngineSurface | null = null;
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
          background: packedColorToHex(surfaceOptions.background),
          backend: surfaceOptions.preference,
        });
        pendingSurface = await this.surfaceFactory(surfaceOptions);
        pendingSurface.setViewportGesturePolicies?.(this.orderedEnabledViewportPolicies());
        pendingSurface.setViewportZoomLimits?.(this.zoomLimits);
        if (this.isDestroyingOrDestroyed()) {
          this.retainedCleanupSurface = pendingSurface;
          pendingSurface = null;
          throw this.operationError('DESTROYED', 'DESTROYED', 'initialize', false);
        }
        const readySurface = pendingSurface;
        const viewportInputUnbind = readySurface.bindViewportInput?.((input) => {
          this.acceptSurfaceViewportInput(readySurface, input);
        }) ?? null;
        this.surface = readySurface;
        this.surfaceViewportInputUnbind = viewportInputUnbind;
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

  public loadDataset(input: unknown, options: CoreV2LoadOptions = {}): CoreV2EngineLoadResult {
    const surface = this.requireSurface('loadDataset');
    this.loadSequence += 1;
    const prepared = this.prepareDatasetLoad(input);
    surface.load(prepared.materialized.dataset);
    return this.commitPreparedDatasetLoad(prepared, options);
  }

  public async loadDatasetAsync(
    input: unknown,
    options: CoreV2LoadOptions = {},
  ): Promise<CoreV2EngineLoadResult> {
    const surface = this.requireSurface('loadDatasetAsync');
    const sequence = ++this.loadSequence;
    const lifecycleGeneration = this.lifecycleGeneration;
    const sceneRevision = this.sceneRevision;
    this.pendingWork += 1;
    try {
      const materialized = materializeCoreV2Dataset(input);
      await yieldCoreV2EngineTask();
      this.assertCooperativeLoadCurrent(
        surface,
        sequence,
        lifecycleGeneration,
        sceneRevision,
      );
      const componentSemantics = indexComponentSemantics(materialized.dataset);
      await yieldCoreV2EngineTask();
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
      await yieldCoreV2EngineTask();
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
      return this.commitPreparedDatasetLoad(prepared, options);
    } finally {
      this.pendingWork -= 1;
    }
  }

  private prepareDatasetLoad(input: unknown): PreparedCoreV2EngineLoad {
    const materialized = materializeCoreV2Dataset(input);
    return Object.freeze({
      materialized,
      componentSemantics: indexComponentSemantics(materialized.dataset),
      textSemantics: indexTextSemantics(materialized.dataset),
    });
  }

  private commitPreparedDatasetLoad(
    prepared: PreparedCoreV2EngineLoad,
    options: CoreV2LoadOptions,
  ): CoreV2EngineLoadResult {
    const { componentSemantics, materialized, textSemantics } = prepared;
    const selectionBefore = this.logicalSelectionIds;
    this.logicalSelectionIds = Object.freeze([]);
    if (selectionBefore.length > 0) this.interactionRevision += 1;
    this.materialized = materialized;
    this.targetLifecycleGeneration += 1;
    this.history.clear();
    this.componentSemantics = componentSemantics;
    this.textSemantics = textSemantics;
    this.resetLiveOverlayState();
    this.datasetRef = options.datasetRef ?? null;
    this.sceneRevision += 1;
    this.lifecycle = materialized.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    const result: CoreV2EngineLoadResult = Object.freeze({
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
    request: CoreV2MutationTransactionRequest,
    schemaRevision = CORE_V2_MUTATION_TRANSACTION_REVISION,
  ): CoreV2EngineTransactionResult {
    const surface = this.requireSurface('transact');
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.history.state();
    const plan = this.planMutationRequest(request, schemaRevision);
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
    request: CoreV2BulkPatchRequest,
    schemaRevision = CORE_V2_MUTATION_TRANSACTION_REVISION,
  ): CoreV2EngineTransactionResult {
    const surface = this.requireSurface('bulkPatch');
    const previousRevisions = this.revisionStamp();
    const previousHistory = this.history.state();
    const plan = this.planBulkPatchRequest(request, schemaRevision);
    return this.applyPlannedTransaction(
      surface,
      plan,
      'bulkPatch',
      previousRevisions,
      previousHistory,
    );
  }

  private planMutationRequest(
    request: CoreV2MutationTransactionRequest,
    schemaRevision: string,
  ): CoreV2MutationTransactionPlan {
    return planCoreV2MutationTransaction(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
      schemaRevision,
    );
  }

  private planBulkPatchRequest(
    request: CoreV2BulkPatchRequest,
    schemaRevision: string,
  ): CoreV2MutationTransactionPlan {
    return planCoreV2BulkPatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      request,
      schemaRevision,
    );
  }

  private applyPlannedTransaction(
    surface: CoreV2EngineSurface,
    plan: CoreV2MutationTransactionPlan,
    operation: 'transact' | 'bulkPatch',
    previousRevisions: CoreV2RevisionStamp,
    previousHistory: CoreV2HistoryState,
  ): CoreV2EngineTransactionResult {
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
    if (plan.history !== undefined) {
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
      } satisfies CoreV2EngineTransactionResult);
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

    const componentSemantics = indexComponentSemantics(plan.candidate.dataset);
    const textSemantics = indexTextSemantics(plan.candidate.dataset);
    const selectionBefore = this.logicalSelectionIds;
    const requestedSelectionAfter = plan.selectionIds ??
      transactionSelectionAfter(selectionBefore, plan.operations);
    const selectionAfter = this.validLogicalSelection(requestedSelectionAfter, plan.candidate);
    const commandId = actionId ?? `transaction:${this.sceneRevision + 1}`;
    let preparedHistory: CoreV2HistoryPreparedRecord | null = null;
    try {
      if (plan.recordHistory !== false) {
        preparedHistory = this.history.prepareRecord({
          id: commandId,
          before: this.historySnapshot(),
          after: historySnapshotForDataset(plan.candidate.dataset, selectionAfter),
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

    const animatedBarTargets = directAnimatedBarTargets(plan.operations, plan.candidate.dataset);
    const allowedComponentOrderOwners = componentOrderOwners(plan.operations);
    let reconcile: CoreV2SurfaceReconcileResult;
    try {
      reconcile = surface.reconcile(plan.candidate.dataset, {
        animateBarChanges: animatedBarTargets.length > 0,
        animatedBarTargets,
        allowedComponentOrderOwners,
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
    this.componentSemantics = componentSemantics;
    this.textSemantics = textSemantics;
    this.logicalSelectionIds = selectionAfter;
    this.sceneRevision += 1;
    this.lifecycle = plan.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    if (!sameStringArray(selectionBefore, selectionAfter)) this.interactionRevision += 1;
    let historyRecorded = false;
    if (preparedHistory !== null) {
      const historyStatus = this.history.commitPrepared(preparedHistory);
      if (historyStatus === 'stale' || historyStatus === 'invalid' || historyStatus === 'cancelled') {
        throw new Error(`${operation} history preflight became ${historyStatus} after surface commit`);
      }
      historyRecorded = historyStatus === 'recorded';
    }
    const currentHistory = this.history.state();
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      actionId,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: plan.candidate.semanticHash,
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
    } satisfies CoreV2EngineTransactionResult);
    this.emit('change', result);
    return result;
  }

  public relativePatch(
    targetInput: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>,
    changes: CoreV2RelativeGeometryChanges,
  ): CoreV2EnginePatchResult {
    this.requireSurface('relativePatch');
    const target = normalizeEngineMutationTarget(targetInput);
    if (target.kind !== 'element') throw new TypeError('relativePatch requires an element target');
    const current = this.materialized === null
      ? null
      : findEngineSemanticTarget(this.materialized.dataset, target);
    if (current === null) return this.patch(target, {});
    const geometry = applyCoreV2RelativeGeometryUpdate(
      current as unknown as NormalizedCoreV2Element,
      changes,
    );
    if (geometry.candidate === null) {
      return this.rejectedGeometryPatchResult(target, geometry, 'relativePatch');
    }
    if (geometry.status === 'unchanged') return this.patch(target, {});
    return this.patch(target, { attrs: geometry.candidate.attrs });
  }

  public resizeAroundOrigin(
    targetInput: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>,
    resize: Omit<CoreV2VisibleCenterResize, 'parentAffine'>,
  ): CoreV2EnginePatchResult {
    this.requireSurface('resizeAroundOrigin');
    const target = normalizeEngineMutationTarget(targetInput);
    if (target.kind !== 'element') throw new TypeError('resizeAroundOrigin requires an element target');
    const current = this.materialized === null
      ? null
      : findEngineSemanticTarget(this.materialized.dataset, target);
    if (current === null) return this.patch(target, {});
    const geometry = resizeCoreV2GeometryAroundOrigin(
      current as unknown as NormalizedCoreV2Element,
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
  public patch(target: CoreV2SemanticTarget, patch: unknown): CoreV2EnginePatchResult {
    const surface = this.requireSurface('patch');
    const previousRevisions = this.revisionStamp();
    const mutation = applyCoreV2SemanticPatch(
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
      } satisfies CoreV2EnginePatchResult);
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
      } satisfies CoreV2EnginePatchResult);
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

    const componentSemantics = indexComponentSemantics(mutation.candidate.dataset);
    const textSemantics = indexTextSemantics(mutation.candidate.dataset);
    const selectionBefore = this.logicalSelectionIds;
    let preparedHistory: CoreV2HistoryPreparedRecord;
    try {
      preparedHistory = this.history.prepareRecord({
        id: `patch:${this.sceneRevision + 1}:${semanticTargetIdentity(mutation.target)}`,
        before: this.historySnapshot(),
        after: historySnapshotForDataset(mutation.candidate.dataset, selectionBefore),
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
      } satisfies CoreV2EnginePatchResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }
    let reconcile: CoreV2SurfaceReconcileResult;
    try {
      reconcile = surface.reconcile(mutation.candidate.dataset, {
        animateBarChanges: mutation.target.kind === 'component',
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
      } satisfies CoreV2EnginePatchResult);
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
    } satisfies CoreV2EnginePatchResult);
    this.emit('change', result);
    return result;
  }

  /**
   * Remove one stable logical element through the same incremental reconcile
   * authority as patch(). A missing reconcile seam or refused dense plan leaves
   * semantic authority, revisions, selection, and the current surface unchanged.
   */
  public destroyTarget(target: CoreV2SemanticTarget): CoreV2EngineDestroyTargetResult {
    const surface = this.requireSurface('destroyTarget');
    const previousRevisions = this.revisionStamp();
    const mutation = removeCoreV2SemanticTarget(
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
      } satisfies CoreV2EngineDestroyTargetResult);
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

    const componentSemantics = indexComponentSemantics(mutation.candidate.dataset);
    const textSemantics = indexTextSemantics(mutation.candidate.dataset);
    const selectionBefore = this.logicalSelectionIds;
    const selectionAfter = this.validLogicalSelection(selectionBefore, mutation.candidate);
    let preparedHistory: CoreV2HistoryPreparedRecord;
    try {
      preparedHistory = this.history.prepareRecord({
        id: `destroy:${this.sceneRevision + 1}:${semanticTargetIdentity(mutation.target)}`,
        before: this.historySnapshot(),
        after: historySnapshotForDataset(mutation.candidate.dataset, selectionAfter),
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
      } satisfies CoreV2EngineDestroyTargetResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }
    let reconcile: CoreV2SurfaceReconcileResult;
    try {
      reconcile = surface.reconcile(mutation.candidate.dataset, {
        animateBarChanges: false,
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
      } satisfies CoreV2EngineDestroyTargetResult);
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
    } satisfies CoreV2EngineDestroyTargetResult);
    this.emit('targetDestroyed', result);
    return result;
  }

  public setPresentationPolicy(
    input: CoreV2PresentationPolicyInput,
  ): CoreV2EnginePresentationResult {
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
    } satisfies CoreV2EnginePresentationResult);
    if (changed) this.emit('presentationChanged', result);
    return result;
  }

  public clearPresentationPolicy(): CoreV2EnginePresentationResult {
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
    } satisfies CoreV2EnginePresentationResult);
    if (changed) this.emit('presentationChanged', result);
    return result;
  }

  public presentationPolicyProbe(): CoreV2PresentationPolicyProductProbe {
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

  public applyLiveOverlay(input: CoreV2LiveOverlayInput): CoreV2LiveOverlayResult {
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

  public liveOverlayProbe(): CoreV2LiveOverlayProbe {
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
  ): CoreV2ExternalDependencyResult {
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
    input: CoreV2SemanticRefreshInput,
  ): CoreV2EngineSemanticRefreshResult {
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
    } satisfies CoreV2EngineSemanticRefreshResult);
    this.emit('semanticRefreshed', result);
    return result;
  }

  public async submitDataset(submission: CoreV2DatasetSubmission): Promise<CoreV2DatasetSubmissionResult> {
    let sourceFields: Readonly<{ readonly sourceRevision?: number }> = Object.freeze({});
    let sequence = 0;
    let outcome: CoreV2DatasetSubmissionResult | null = null;
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
        } satisfies CoreV2DatasetSubmissionResult);
        return outcome;
      }
      sequence = ++this.submissionSequence;
      const input = await submission.input;
      if (sequence !== this.submissionSequence || this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
        outcome = Object.freeze({
          status: 'superseded',
          requestId: submission.requestId,
          ...sourceFields,
          diagnostic: this.operationDiagnostic('SUPERSEDED', 'SUPERSEDED', 'loadDataset', true),
        } satisfies CoreV2DatasetSubmissionResult);
        return outcome;
      }
      const result = this.loadDataset(input, {
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
      } satisfies CoreV2DatasetSubmissionResult);
      return outcome;
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'loadDataset');
      if (!this.isDestroyingOrDestroyed()) this.emit('diagnostic', diagnostic);
      outcome = Object.freeze({
        status: 'rejected',
        requestId: submission.requestId,
        ...sourceFields,
        diagnostic,
      } satisfies CoreV2DatasetSubmissionResult);
      return outcome;
    } finally {
      try {
        if (outcome !== null) await releaseDatasetSubmission(submission, outcome);
      } finally {
        this.pendingWork -= 1;
      }
    }
  }

  public publishFrame(timeMs = globalThis.performance?.now() ?? Date.now()): void {
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs must be finite');
    const surface = this.requireSurface('publishFrame');
    try {
      surface.publishFrame(timeMs);
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'publishFrame');
      this.emit('diagnostic', diagnostic);
      throw new CoreV2EngineError(diagnostic);
    }
    this.frameRevision += 1;
    this.publishedTuple = Object.freeze({
      scene: this.sceneRevision,
      view: this.viewRevision,
      interaction: this.interactionRevision,
    });
    this.emit('frame', Object.freeze({ frameRevision: this.frameRevision, publishedTuple: this.publishedTuple }));
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
  }

  public resize(width: number, height: number, pixelRatio = globalThis.devicePixelRatio ?? 1): boolean {
    validatePositiveFinite('width', width);
    validatePositiveFinite('height', height);
    validatePositiveFinite('pixelRatio', pixelRatio);
    const surface = this.requireSurface('resize');
    const changed = surface.resize(width, height, pixelRatio);
    if (!changed) return false;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.viewportPixelRatio = pixelRatio;
    surface.setView(this.resolvedSurfaceView());
    this.viewRevision += 1;
    return true;
  }

  public viewportProbe(): CoreV2ViewportState {
    return this.viewportState();
  }

  public panViewport(
    deltaCss: readonly [number, number],
    source: CoreV2ViewportChangeSource = 'pointer',
  ): CoreV2ViewportChangeResult {
    const delta = finiteTuple(deltaCss, 'deltaCss');
    const surface = this.requireSurface('panViewport');
    if (
      (source === 'pointer' || source === 'middle-pointer') &&
      !this.viewportPolicyEnabled.has('pan')
    ) {
      return this.blockedViewportResult(source);
    }
    if (source === 'deceleration' && !this.viewportPolicyEnabled.has('deceleration')) {
      return this.blockedViewportResult(source);
    }
    const center = surface.screenToWorld({
      x: this.viewportWidth / 2 - delta[0],
      y: this.viewportHeight / 2 - delta[1],
    });
    return this.commitViewport([center.x, center.y], this.viewportScale, source);
  }

  public zoomViewportAt(input: Readonly<{
    readonly factor: number;
    readonly anchorCss: readonly [number, number];
    readonly source?: 'wheel' | 'modifier-wheel' | 'pinch' | 'programmatic';
  }>): CoreV2ViewportChangeResult {
    if (!Number.isFinite(input.factor) || !(input.factor > 0)) {
      throw new RangeError('zoom factor must be positive and finite');
    }
    const anchor = finiteTuple(input.anchorCss, 'anchorCss');
    const source = input.source ?? 'wheel';
    const policy = source === 'pinch' ? 'pinch' : source === 'programmatic' ? null : 'wheel';
    const surface = this.requireSurface('zoomViewportAt');
    if (policy !== null && !this.viewportPolicyEnabled.has(policy)) {
      return this.blockedViewportResult(source);
    }
    const worldUnderAnchor = surface.screenToWorld({ x: anchor[0], y: anchor[1] });
    const nextScale = Math.min(
      this.zoomLimits[1],
      Math.max(this.zoomLimits[0], this.viewportScale * input.factor),
    );
    const ratio = this.viewportScale / nextScale;
    const center: readonly [number, number] = Object.freeze([
      worldUnderAnchor.x -
        (worldUnderAnchor.x - this.viewportCenterWorld[0]) * ratio,
      worldUnderAnchor.y -
        (worldUnderAnchor.y - this.viewportCenterWorld[1]) * ratio,
    ]);
    return this.commitViewport(center, nextScale, source);
  }

  public startViewportDeceleration(
    velocityCssPxPerMs: readonly [number, number],
  ): boolean {
    const velocity = finiteTuple(velocityCssPxPerMs, 'velocityCssPxPerMs');
    this.requireSurface('startViewportDeceleration');
    if (!this.viewportPolicyEnabled.has('deceleration')) return false;
    this.viewportMotion = Object.freeze({
      velocityX: velocity[0],
      velocityY: velocity[1],
    });
    return true;
  }

  public advanceViewportMotion(deltaMs: number): CoreV2ViewportChangeResult {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('viewport motion deltaMs must be finite and non-negative');
    }
    const motion = this.viewportMotion;
    if (motion === null || !this.viewportPolicyEnabled.has('deceleration')) {
      this.viewportMotion = null;
      return this.blockedViewportResult('deceleration');
    }
    const decay = Math.exp(-deltaMs / 120);
    const displacementScale = 120 * (1 - decay);
    const result = this.panViewport(
      [
        motion.velocityX * displacementScale,
        motion.velocityY * displacementScale,
      ],
      'deceleration',
    );
    const velocityX = motion.velocityX * decay;
    const velocityY = motion.velocityY * decay;
    this.viewportMotion = Math.hypot(velocityX, velocityY) < 0.001
      ? null
      : Object.freeze({ velocityX, velocityY });
    return result;
  }

  public cancelViewportMotion(): boolean {
    const changed = this.viewportMotion !== null;
    this.viewportMotion = null;
    this.surface?.cancelViewportGestures?.();
    return changed;
  }

  public settleViewport(): CoreV2ViewportSettleResult {
    this.requireSurface('settleViewport');
    this.cancelViewportMotion();
    const key = viewportStateKey(this.viewportCenterWorld, this.viewportScale);
    const changed = key !== this.lastSettledViewportKey;
    if (changed) {
      this.lastSettledViewportKey = key;
      this.viewportSettledPublicationCount += 1;
    }
    const result = Object.freeze({
      changed,
      viewport: this.viewportState(),
      publicationCount: this.viewportSettledPublicationCount,
      persistence: this.viewportPersistenceProbe(),
    } satisfies CoreV2ViewportSettleResult);
    if (changed) this.emit('viewSettled', result);
    return result;
  }

  public serializeViewport(): CoreV2SerializedViewportState {
    this.requireSurface('serializeViewport');
    const serialized = serializedViewport(this.viewportCenterWorld, this.viewportScale);
    const key = viewportStateKey(serialized.centerWorld, serialized.scale);
    if (key === this.lastSerializedViewportKey) {
      this.viewportSuppressedEquivalentSaveCount += 1;
      return this.lastSerializedViewport ?? serialized;
    }
    this.lastSerializedViewportKey = key;
    this.lastSerializedViewport = serialized;
    this.viewportPersistenceWriteCount += 1;
    return serialized;
  }

  public viewportPersistenceProbe(): CoreV2ViewportPersistenceProbe {
    return Object.freeze({
      settledPublicationCount: this.viewportSettledPublicationCount,
      persistenceWriteCount: this.viewportPersistenceWriteCount,
      equivalentSaveCount: 0,
      suppressedEquivalentSaveCount: this.viewportSuppressedEquivalentSaveCount,
      settled:
        this.lastSettledViewportKey ===
        viewportStateKey(this.viewportCenterWorld, this.viewportScale),
      serialized: this.lastSerializedViewport,
    });
  }

  /**
   * Rebind a long-lived GPU Engine to a new host UI generation. The aggregate
   * renderer and canvas stay owned by the Engine, while gesture captures,
   * pending loads, selection, and resolved-target authority cannot cross the
   * host lifecycle boundary.
   */
  public rebindHostLifecycle(
    requestedGeneration: number,
  ): CoreV2HostLifecycleRebindResult {
    if (
      !Number.isSafeInteger(requestedGeneration) ||
      requestedGeneration !== this.lifecycleGeneration + 1
    ) {
      throw new RangeError('host lifecycle generation must advance by exactly one');
    }
    const surface = this.requireSurface('rebindHostLifecycle');
    this.submissionSequence += 1;
    this.loadSequence += 1;
    this.viewportMotion = null;
    surface.cancelViewportGestures?.();
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
    fallback: CoreV2ViewportFitOptions = {},
  ): CoreV2ViewportRestoreResult {
    const restored = normalizeSerializedViewport(input, this.zoomLimits);
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
    options: CoreV2ViewportTargetOptions = {},
  ): CoreV2ViewportFocusResult {
    const contributors = this.resolveViewportContributors(options);
    if (contributors.worldBounds === null) {
      return Object.freeze({
        ...contributors,
        status: 'empty',
        changed: false,
        viewport: this.viewportState(),
      });
    }
    const center = coreV2BoundsCenter(contributors.worldBounds);
    const change = this.commitViewport(center, this.viewportScale, 'focus');
    return Object.freeze({
      ...contributors,
      status: 'applied',
      changed: change.changed,
      viewport: change.viewport,
    });
  }

  public fitViewport(
    options: CoreV2ViewportFitOptions = {},
    source: 'fit' | 'fallback-fit' = 'fit',
  ): CoreV2ViewportFitResult {
    const padding = normalizeCoreV2ViewportPadding(options.paddingCssPx);
    const contributors = this.resolveViewportContributors(options);
    const paddingCssPx = Object.freeze([padding.x, padding.y] as const);
    if (contributors.worldBounds === null) {
      return Object.freeze({
        ...contributors,
        status: 'empty',
        changed: false,
        paddingCssPx,
        viewport: this.viewportState(),
      });
    }
    const scale = coreV2ViewportFitScale(
      contributors.worldBounds,
      [this.viewportWidth, this.viewportHeight],
      padding,
      this.worldRotationDegrees,
      this.zoomLimits,
    );
    const center = coreV2BoundsCenter(contributors.worldBounds);
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
    operation: CoreV2ViewportPolicyOperation,
  ): CoreV2ViewportPolicyProbe {
    const surface = this.requireSurface('configureViewportPolicy');
    const registry = new Set(this.viewportPolicyRegistry);
    const enabled = new Set(this.viewportPolicyEnabled);
    let temporary = this.viewportTemporaryPolicies;
    switch (operation.op) {
      case 'add':
        registry.add(normalizeViewportPolicy(operation.policy));
        enabled.add(operation.policy);
        break;
      case 'start': {
        const policy = normalizeViewportPolicy(operation.policy);
        if (!registry.has(policy)) registry.add(policy);
        enabled.add(policy);
        break;
      }
      case 'stop':
        enabled.delete(normalizeViewportPolicy(operation.policy));
        break;
      case 'remove': {
        const policy = normalizeViewportPolicy(operation.policy);
        registry.delete(policy);
        enabled.delete(policy);
        break;
      }
      case 'temporary': {
        const policy = normalizeViewportPolicy(operation.policy);
        if (temporary !== null) {
          throw new Error('a temporary viewport policy is already active');
        }
        temporary = Object.freeze({
          registry: orderedViewportPolicies(registry),
          enabled: orderedViewportPolicies(enabled),
        });
        registry.add(policy);
        enabled.add(policy);
        break;
      }
      case 'restore-temporary':
        if (temporary !== null) {
          replacePolicySet(registry, temporary.registry);
          replacePolicySet(enabled, temporary.enabled);
          temporary = null;
        }
        break;
      case 'cancel-all':
        this.viewportMotion = null;
        surface.cancelViewportGestures?.();
        break;
      case 'redraw':
        break;
    }
    const orderedEnabled = orderedViewportPolicies(enabled);
    surface.setViewportGesturePolicies?.(orderedEnabled);
    this.viewportPolicyRegistry = registry;
    this.viewportPolicyEnabled = enabled;
    this.viewportTemporaryPolicies = temporary;
    const probe = this.viewportPolicyProbe();
    this.emit('viewportPolicyChanged', probe);
    return probe;
  }

  public viewportPolicyProbe(): CoreV2ViewportPolicyProbe {
    const destroyed = this.lifecycle === 'destroyed' || this.lifecycle === 'destroying';
    const registry = destroyed
      ? Object.freeze([] as CoreV2ViewportPolicy[])
      : orderedViewportPolicies(this.viewportPolicyRegistry);
    const enabled = destroyed
      ? Object.freeze([] as CoreV2ViewportPolicy[])
      : orderedViewportPolicies(this.viewportPolicyEnabled);
    const callbacks = Object.fromEntries(
      CORE_V2_VIEWPORT_POLICIES.map((policy) => [
        policy,
        registry.includes(policy) ? 1 : 0,
      ]),
    ) as Record<CoreV2ViewportPolicy, 0 | 1>;
    return Object.freeze({
      schemaRevision: CORE_V2_VIEWPORT_REVISION,
      policies: registry,
      enabledPolicies: enabled,
      temporary: !destroyed && this.viewportTemporaryPolicies !== null,
      callbacksByPolicy: Object.freeze(callbacks),
      resources: Object.freeze({
        tickers: 0,
        listeners: 0,
        captures: 0,
        motions: destroyed || this.viewportMotion === null ? 0 : 1,
        cursors: 0,
      }),
      destroyed,
    });
  }

  public setViewport(input: Readonly<{
    centerWorld: readonly [number, number];
    scale: number;
  }>): CoreV2ViewportState {
    return this.commitViewport(
      input.centerWorld,
      input.scale,
      'programmatic',
    ).viewport;
  }

  public setWorldTransform(input: CoreV2WorldTransformInput): CoreV2WorldTransformState {
    if (!Number.isFinite(input.rotationDegrees)) {
      throw new RangeError('rotationDegrees must be finite');
    }
    if (typeof input.flipX !== 'boolean' || typeof input.flipY !== 'boolean') {
      throw new TypeError('flipX and flipY must be booleans');
    }
    const surface = this.requireSurface('setWorldTransform');
    const normalizedRotation = normalizeDegrees(input.rotationDegrees);
    if (
      normalizedRotation === this.worldRotationDegrees &&
      input.flipX === this.worldFlipX &&
      input.flipY === this.worldFlipY
    ) {
      return this.worldTransformState();
    }
    const next = Object.freeze({
      rotationDegrees: normalizedRotation,
      flipX: input.flipX,
      flipY: input.flipY,
    });
    surface.setView(this.resolvedSurfaceView(next));
    this.worldRotationDegrees = next.rotationDegrees;
    this.worldFlipX = next.flipX;
    this.worldFlipY = next.flipY;
    this.viewRevision += 1;
    return this.worldTransformState();
  }

  public select(ids: readonly string[]): readonly string[] {
    const unique = Object.freeze([...new Set(ids.map((id) => {
      if (typeof id !== 'string' || id.length === 0) throw new TypeError('selection IDs must be non-empty strings');
      return id;
    }))]);
    const surface = this.requireSurface('select');
    const logical = this.validLogicalSelection(unique, this.materialized);
    surface.select(logical);
    if (!sameStringArray(this.logicalSelectionIds, logical)) this.interactionRevision += 1;
    this.logicalSelectionIds = logical;
    return logical;
  }

  public hitTest(point: CoreV2Point): string | null {
    validatePoint(point, 'hitTest');
    return this.requireSurface('hitTest').hitTestScreen(point);
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    validatePoint(point, 'screenToWorld');
    return this.requireSurface('screenToWorld').screenToWorld(point);
  }

  public resolveTarget(targetInput: CoreV2MutationTarget): CoreV2ResolvedTargetSnapshot | null {
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
    snapshot: CoreV2ResolvedTargetSnapshot,
    patch: unknown,
  ): CoreV2EnginePatchResult {
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
      } satisfies CoreV2EnginePatchResult);
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

  public snapshot(): CoreV2EngineSnapshot {
    const surfaceDebug = this.surface?.debugSnapshot() ?? emptySurfaceDebug(
      this.viewportWidth,
      this.viewportHeight,
      this.viewportPixelRatio,
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
      zoomLimits: this.zoomLimits,
      viewport: this.viewportState(),
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

  public semanticProbe(): CoreV2SemanticProductProbe {
    const surfaceDebug = this.surface?.debugSnapshot() ?? emptySurfaceDebug(
      this.viewportWidth,
      this.viewportHeight,
      this.viewportPixelRatio,
    );
    return createCoreV2SemanticProbe(this.materialized, {
      lifecycle: this.lifecycle,
      datasetRef: this.datasetRef,
      interactionMode: 'select',
      selectionIds: this.logicalSelectionIds,
      activeAnimationCount: surfaceDebug.activeAnimationCount,
      ...(surfaceDebug.activeGestureCount === undefined
        ? {}
        : { activeGestureCount: surfaceDebug.activeGestureCount }),
      historyDepth: this.history.state().undoDepth,
    });
  }

  public sceneImageProbe(): CoreV2EngineSceneImagesProbe | null {
    return this.requireSurface('sceneImageProbe').sceneImageProbe?.() ?? null;
  }

  /**
   * Join the detached semantic component index with an optional renderer
   * surface probe. Legacy/injected surfaces stay observable as unavailable;
   * no fixture values or scene-wide scans are used as fallbacks.
   */
  public componentVisualProbe(
    target: CoreV2ComponentVisualTarget,
  ): CoreV2EngineComponentVisualProbe | null {
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
    target: CoreV2ComponentVisualTarget,
  ): CoreV2EngineBarPresentationProbe | null {
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

  public paintOrderProbe(): CoreV2EnginePaintOrderProbe | null {
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
  public textProbe(target: CoreV2TextTarget): CoreV2EngineTextProbe | null {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') return null;
    const normalizedTarget = normalizeCoreV2TextTarget(target);
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
    const status: CoreV2EngineTextPublicationStatus = surfaceTextProbeIsAbsent(visual)
      ? 'absent'
      : surfaceTextProbeIsCurrent(visual) && publishedCurrent
        ? 'current'
        : visual === null
          ? 'unavailable'
          : 'pending';
    const revisionTuple: CoreV2EngineTextRevisionTuple = Object.freeze({
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
  public geometryProbe(): CoreV2EngineGeometryProbe | null {
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

  public relationProbe(): CoreV2EngineRelationProbe | null {
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
    point: CoreV2Point,
    options: CoreV2RelationHitOptions = {},
  ): CoreV2RelationHit | null {
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

  public interactionOwnershipProbe(): CoreV2InteractionOwnershipProbe | null {
    return this.requireSurface('interactionOwnershipProbe').interactionOwnershipProbe?.() ?? null;
  }

  public exportDataset(): readonly NormalizedCoreV2Element[] {
    this.requireSurface('exportDataset');
    return this.materialized?.dataset ?? [];
  }

  public historyState(): CoreV2HistoryState {
    this.requireSurface('historyState');
    return this.history.state();
  }

  public undo(): CoreV2EngineHistoryResult {
    return this.applyHistory('undo');
  }

  public redo(): CoreV2EngineHistoryResult {
    return this.applyHistory('redo');
  }

  public async destroy(): Promise<boolean> {
    if (this.lifecycle === 'destroying') return false;
    if (this.lifecycle === 'destroyed') return this.retryDestroyedCleanup();
    this.lifecycle = 'destroying';
    this.submissionSequence += 1;
    this.loadSequence += 1;
    const surface = this.surface;
    this.viewportMotion = null;
    surface?.cancelViewportGestures?.();
    const pendingInitialization = this.initializePromise;
    const assetSession = this.assetSession;
    const cleanupFailures: unknown[] = [];
    const requiredAcquisitions = this.requiredAssetAcquisitions.splice(0);
    let assetCleanup: Promise<void> | null = null;
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
    this.materialized = null;
    this.logicalSelectionIds = Object.freeze([]);
    this.resetLiveOverlayState();
    this.viewportPolicyRegistry.clear();
    this.viewportPolicyEnabled.clear();
    this.viewportTemporaryPolicies = null;
    this.externalDependencyRevisions.clear();
    this.history.destroy();
    this.componentSemantics.clear();
    this.textSemantics.clear();
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

  private applyHistory(direction: CoreV2HistoryDirection): CoreV2EngineHistoryResult {
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
      } satisfies CoreV2EngineHistoryResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    let failure: CoreV2EngineDiagnostic | null = null;
    let reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[] = EMPTY_RECONCILE_DIAGNOSTICS;
    const apply = (transition: Readonly<{
      readonly snapshot: Readonly<{
        readonly dataset: readonly NormalizedCoreV2Element[];
        readonly companion: CoreV2EngineHistoryCompanion | null;
      }>;
    }>): boolean => {
      let materialized: MaterializedCoreV2Dataset;
      const selectionBefore = this.logicalSelectionIds;
      try {
        materialized = materializeCoreV2Dataset(transition.snapshot.dataset);
        const selection = this.validLogicalSelection(
          transition.snapshot.companion?.selectionIds ?? Object.freeze([]),
          materialized,
        );
        const reconcile = surface.reconcile?.(materialized.dataset, {
          animateBarChanges: false,
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
      } catch (error) {
        failure = this.diagnosticFrom(error, direction);
        return false;
      }

      this.materialized = materialized;
      this.componentSemantics = indexComponentSemantics(materialized.dataset);
      this.textSemantics = indexTextSemantics(materialized.dataset);
      this.sceneRevision += 1;
      this.lifecycle = materialized.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
      if (!sameStringArray(selectionBefore, this.logicalSelectionIds)) this.interactionRevision += 1;
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
      } satisfies CoreV2EngineHistoryResult);
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
      } satisfies CoreV2EngineHistoryResult);
    }

    const materialized = this.materialized;
    if (materialized === null) throw new Error('history transition lost semantic authority');
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      direction,
      previousRevisions,
      revisions: this.revisionStamp(),
      sceneRevision: this.sceneRevision,
      semanticHash: materialized.semanticHash,
      publication: 'pending',
      history: this.history.state(),
    } satisfies CoreV2EngineHistoryResult);
    this.emit(direction === 'undo' ? 'historyUndone' : 'historyRedone', result);
    return result;
  }

  private historySnapshot(): CoreV2SemanticHistorySnapshotInput<
    readonly NormalizedCoreV2Element[],
    CoreV2EngineHistoryCompanion
  > {
    return Object.freeze({
      dataset: this.materialized?.dataset ?? Object.freeze([]),
      companion: Object.freeze({
        selectionIds: Object.freeze([...this.logicalSelectionIds]),
      }),
    });
  }

  private validLogicalSelection(
    ids: readonly string[],
    materialized: MaterializedCoreV2Dataset | null,
  ): readonly string[] {
    if (materialized === null) return Object.freeze([]);
    return Object.freeze([...new Set(ids)].filter((id) =>
      logicalElementIdExists(materialized.dataset, id)));
  }

  private async cleanupSurface(
    surface: CoreV2EngineSurface,
  ): Promise<Readonly<{ released: boolean; error: Error | null }>> {
    let lastError: Error | null = null;
    let viewportCleanupFailed = false;
    if (this.surface === surface && this.surfaceViewportInputUnbind !== null) {
      try {
        this.surfaceViewportInputUnbind();
      } catch {
        lastError = new Error('Core v2 viewport input cleanup failed');
        viewportCleanupFailed = true;
      } finally {
        this.surfaceViewportInputUnbind = null;
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let attemptFailed = false;
      try {
        await surface.destroy();
      } catch {
        lastError = new Error('Core v2 surface cleanup failed');
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
      if (!attemptFailed) lastError = new Error('Core v2 surface retained a canvas after destroy');
    }
    this.surface = this.surface === surface ? null : this.surface;
    this.retainedCleanupSurface = surface;
    return Object.freeze({ released: false, error: lastError });
  }

  private destroyAssetSession(
    assetSession: CoreV2AssetSession | null,
    requiredAcquisitions: readonly CoreV2AssetAcquisition[],
  ): Promise<void> {
    if (assetSession) return assetSession.destroy();
    return Promise.allSettled(
      requiredAcquisitions.map(async (acquisition) => acquisition.release()),
    ).then((settlements) => {
      if (rejectedReasons(settlements).length > 0) throw assetInternalEngineCleanupFailure();
    });
  }

  private initializeResult(): CoreV2InitializeResult {
    const lifecycle = this.lifecycle === 'scene-ready' ? 'scene-ready' : 'ready-empty';
    return Object.freeze({
      lifecycle,
      instanceId: this.instanceId ?? '',
      revisions: this.revisionStamp(),
      facilities: FACILITIES,
    });
  }

  private revisionStamp(): CoreV2RevisionStamp {
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
    readonly representedRevisions: CoreV2GeometryRevisionTuple | null;
    readonly revisionLags: CoreV2GeometryRevisionTuple | null;
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
    surface: CoreV2EngineSurface,
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
    surface: CoreV2EngineSurface,
    input: CoreV2SurfaceViewportInput,
  ): void {
    if (
      this.surface !== surface ||
      this.lifecycle === 'destroyed' ||
      this.lifecycle === 'destroying'
    ) {
      return;
    }
    const centerWorld = finiteTuple(input.centerWorld, 'surface viewport centerWorld');
    if (
      !Number.isFinite(input.scale) ||
      input.scale < this.zoomLimits[0] ||
      input.scale > this.zoomLimits[1]
    ) {
      throw new RangeError('surface viewport scale must be within the configured zoom limits');
    }
    const previous = this.viewportState();
    if (
      centerWorld[0] === this.viewportCenterWorld[0] &&
      centerWorld[1] === this.viewportCenterWorld[1] &&
      input.scale === this.viewportScale
    ) {
      return;
    }
    const previousRevisions = this.revisionStamp();
    this.viewportCenterWorld = centerWorld;
    this.viewportScale = input.scale;
    this.viewRevision += 1;
    const result = Object.freeze({
      changed: true,
      blocked: false,
      source: input.source,
      previous,
      viewport: this.viewportState(),
      previousRevisions,
      revisions: this.revisionStamp(),
    } satisfies CoreV2ViewportChangeResult);
    this.emit('viewChanged', result);
  }

  private requireSurface(operation: string): CoreV2EngineSurface {
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

  private ensureAssetSession(instanceId: string): CoreV2AssetSession {
    if (this.assetSession) {
      if (this.assetSession.instanceId !== instanceId) {
        throw new CoreV2AssetError('CONFLICT', 'CONFLICT', false);
      }
      return this.assetSession;
    }
    if (this.instanceId !== null && this.instanceId !== instanceId) {
      throw new CoreV2AssetError('CONFLICT', 'CONFLICT', false);
    }
    this.assetSession = this.assetRuntime.createSession({
      instanceId,
      ...(this.assetPolicy ? { policy: this.assetPolicy } : {}),
    });
    return this.assetSession;
  }

  private assetInitializationError(error: unknown): CoreV2EngineError {
    if (error instanceof CoreV2EngineError) return error;
    if (error instanceof CoreV2AssetError) {
      return this.operationError(
        error.code,
        error.category,
        'initialize',
        error.retryable,
      );
    }
    return this.operationError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', 'initialize', false);
  }

  private diagnosticFrom(error: unknown, operation: string): CoreV2EngineDiagnostic {
    if (error instanceof CoreV2DatasetError) {
      return this.operationDiagnostic(error.code, error.category, operation, true, error.datasetPath);
    }
    if (error instanceof CoreV2EngineError) return error.diagnostic;
    if (error instanceof CoreV2PresentationError) {
      return this.operationDiagnostic('CONFLICT', 'CONFLICT', operation, true);
    }
    if (error instanceof CoreV2AssetError) {
      return this.operationDiagnostic(error.code, error.category, operation, error.retryable);
    }
    return this.operationDiagnostic('INTERNAL_FAILURE', 'INTERNAL_FAILURE', operation, false);
  }

  private semanticMutationDiagnostic(
    diagnostic: CoreV2SemanticMutationDiagnostic,
    target: CoreV2SemanticTarget | null,
    operation = 'patch',
  ): CoreV2EngineDiagnostic {
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
    diagnostic: CoreV2MutationTransactionDiagnostic,
    operation: string,
  ): CoreV2EngineDiagnostic {
    const category: CoreV2DiagnosticCategory = diagnostic.category === 'MISSING_TARGET'
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
    previousRevisions: CoreV2RevisionStamp,
    diagnostic: CoreV2EngineDiagnostic,
    transactionDiagnostic: CoreV2MutationTransactionDiagnostic | undefined,
    history: CoreV2HistoryState,
  ): Extract<CoreV2EngineTransactionResult, { readonly status: 'rejected' }> {
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
    previousRevisions: CoreV2RevisionStamp,
    diagnostic: CoreV2EngineDiagnostic,
    _plan: Extract<
      ReturnType<typeof planCoreV2MutationTransaction>,
      { readonly status: 'planned' }
    >,
    history: CoreV2HistoryState,
    reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[],
  ): Extract<CoreV2EngineTransactionResult, { readonly status: 'refused' }> {
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
    target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>,
    failure: Readonly<{
      readonly status: 'rejected' | 'unsupported';
      readonly diagnostic: Readonly<{ readonly path: string }>;
    }>,
    operation: string,
  ): Extract<CoreV2EnginePatchResult, { readonly status: 'rejected' }> {
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
    } satisfies CoreV2EnginePatchResult);
    this.emit('diagnostic', diagnostic);
    return result;
  }

  private refusedPatchResult(
    target: CoreV2SemanticTarget,
    previousRevisions: CoreV2RevisionStamp,
    code: string,
    category: CoreV2DiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[],
  ): Extract<CoreV2EnginePatchResult, { readonly status: 'refused' }> {
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
    } satisfies CoreV2EnginePatchResult);
    this.emit('diagnostic', diagnostic);
    return result;
  }

  private refusedDestroyTargetResult(
    target: Extract<CoreV2SemanticTarget, { readonly kind: 'element' }>,
    previousRevisions: CoreV2RevisionStamp,
    code: string,
    category: CoreV2DiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[],
  ): Extract<CoreV2EngineDestroyTargetResult, { readonly status: 'refused' }> {
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
    } satisfies CoreV2EngineDestroyTargetResult);
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
    source: CoreV2ViewportChangeSource,
  ): CoreV2ViewportChangeResult {
    const centerWorld = finiteTuple(centerWorldValue, 'centerWorld');
    if (
      !Number.isFinite(scale) ||
      scale < this.zoomLimits[0] ||
      scale > this.zoomLimits[1]
    ) {
      throw new RangeError('scale must be within the configured zoom limits');
    }
    const surface = this.requireSurface('setViewport');
    const previous = this.viewportState();
    const previousRevisions = this.revisionStamp();
    const changed =
      centerWorld[0] !== this.viewportCenterWorld[0] ||
      centerWorld[1] !== this.viewportCenterWorld[1] ||
      scale !== this.viewportScale;
    if (changed) {
      surface.setView(this.resolvedSurfaceView(
        this.worldTransformState(),
        centerWorld,
        scale,
      ));
      this.viewportCenterWorld = centerWorld;
      this.viewportScale = scale;
      this.viewRevision += 1;
    }
    const result = Object.freeze({
      changed,
      blocked: false,
      source,
      previous,
      viewport: this.viewportState(),
      previousRevisions,
      revisions: this.revisionStamp(),
    } satisfies CoreV2ViewportChangeResult);
    if (changed) this.emit('viewChanged', result);
    return result;
  }

  private blockedViewportResult(
    source: CoreV2ViewportChangeSource,
  ): CoreV2ViewportChangeResult {
    const viewport = this.viewportState();
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
    options: CoreV2ViewportTargetOptions,
  ): CoreV2ViewportContributorResult {
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
    const geometry = surface.geometrySnapshot?.();
    if (!geometry) {
      throw this.operationError(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        'resolveViewportContributors',
        false,
      );
    }
    return resolveCoreV2ViewportContributors(materialized.dataset, geometry, {
      targets: options.targets ?? null,
      ...(options.rejectIds === undefined ? {} : { rejectIds: options.rejectIds }),
      ...(options.relationEndpointsAvailable === undefined
        ? {}
        : { relationEndpointsAvailable: options.relationEndpointsAvailable }),
    });
  }

  private resetViewportRuntime(): void {
    this.viewportPolicyRegistry = new Set(CORE_V2_DEFAULT_VIEWPORT_POLICIES);
    this.viewportPolicyEnabled = new Set(CORE_V2_DEFAULT_VIEWPORT_POLICIES);
    this.viewportTemporaryPolicies = null;
    this.viewportMotion = null;
    this.lastSettledViewportKey = null;
    this.lastSerializedViewportKey = null;
    this.lastSerializedViewport = null;
    this.viewportSettledPublicationCount = 0;
    this.viewportPersistenceWriteCount = 0;
    this.viewportSuppressedEquivalentSaveCount = 0;
  }

  private orderedEnabledViewportPolicies(): readonly CoreV2ViewportPolicy[] {
    return orderedViewportPolicies(this.viewportPolicyEnabled);
  }

  private resolvedSurfaceView(
    world: CoreV2WorldTransformInput = this.worldTransformState(),
    centerWorld: readonly [number, number] = this.viewportCenterWorld,
    scale: number = this.viewportScale,
  ): CoreV2SurfaceView {
    const radians = world.rotationDegrees * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const scaledX = centerWorld[0] * scale;
    const scaledY = centerWorld[1] * scale;
    const transformedCenterX = (scaledX * cosine - scaledY * sine) * (world.flipX ? -1 : 1);
    const transformedCenterY = (scaledX * sine + scaledY * cosine) * (world.flipY ? -1 : 1);
    return Object.freeze({
      x: this.viewportWidth / 2 - transformedCenterX,
      y: this.viewportHeight / 2 - transformedCenterY,
      scale,
      rotation: world.rotationDegrees,
      ...(world.flipX ? { flipX: true } : {}),
      ...(world.flipY ? { flipY: true } : {}),
    });
  }

  private worldTransformState(): CoreV2WorldTransformState {
    return Object.freeze({
      rotationDegrees: this.worldRotationDegrees,
      flipX: this.worldFlipX,
      flipY: this.worldFlipY,
    });
  }

  private viewportState(): CoreV2ViewportState {
    return Object.freeze({
      centerWorld: this.viewportCenterWorld,
      scale: this.viewportScale,
      screenBounds: Object.freeze([
        0,
        0,
        this.viewportWidth,
        this.viewportHeight,
      ] as [number, number, number, number]),
    });
  }

  private operationError(
    code: string,
    category: CoreV2DiagnosticCategory,
    operation: string,
    recoverable: boolean,
  ): CoreV2EngineError {
    return new CoreV2EngineError(this.operationDiagnostic(code, category, operation, recoverable));
  }

  private operationDiagnostic(
    code: string,
    category: CoreV2DiagnosticCategory,
    operation: string,
    recoverable: boolean,
    datasetPath?: string,
  ): CoreV2EngineDiagnostic {
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

  private emit<K extends CoreV2EngineEvent>(event: K, value: CoreV2EngineEventMap[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        listener(value);
      } catch {
        // Host callback isolation is observable through the later diagnostics tranche;
        // a callback must never unwind an already committed engine transition.
      }
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
  submission: CoreV2DatasetSubmission,
  result: CoreV2DatasetSubmissionResult,
): Promise<void> {
  await submission.release?.(result);
}

function yieldCoreV2EngineTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function assetInternalEngineCleanupFailure(): Error {
  return new Error('Core v2 required asset cleanup failed');
}

export class CoreV2EngineError extends Error {
  public readonly diagnostic: CoreV2EngineDiagnostic;

  public constructor(diagnostic: CoreV2EngineDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.operation}`);
    this.name = 'CoreV2EngineError';
    this.diagnostic = diagnostic;
  }
}

export class PixiEngineSurface implements CoreV2EngineSurface {
  private readonly core: CoreV2;
  private readonly unbindCoreViewportChanges: () => void;
  private viewportInputListener:
    | ((input: CoreV2SurfaceViewportInput) => void)
    | null = null;
  private canvasPresent = true;
  private geometryRevision = 0;
  private geometryCache: CoreV2SurfaceGeometrySnapshot | null = null;
  private geometryProjection: CoreV2ProjectionIndex | null = null;
  private geometryRevisionProjection: CoreV2ProjectionIndex | null = null;
  private relationHitIndex = emptyCoreV2RelationHitIndex();
  private surfaceView: CoreV2SurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(core: CoreV2) {
    this.core = core;
    this.unbindCoreViewportChanges = typeof core.bindRootViewportChanges === 'function'
      ? core.bindRootViewportChanges(({ source, view }) => {
          this.surfaceView = Object.freeze({
            ...this.surfaceView,
            x: view.x,
            y: view.y,
            scale: view.scale,
            rotation: view.rotation ?? this.surfaceView.rotation,
          });
          this.geometryRevision += 1;
          this.invalidateGeometryCache();
          const center = core.screenToWorld({
            x: core.renderer.width / 2,
            y: core.renderer.height / 2,
          });
          this.viewportInputListener?.(Object.freeze({
            source,
            centerWorld: Object.freeze([center.x, center.y] as const),
            scale: view.scale,
          }));
        })
      : () => {};
  }

  public get canvasCount(): number {
    return this.canvasPresent ? 1 : 0;
  }

  public get destroyed(): boolean {
    return this.core.destroyed;
  }

  public load(input: unknown): void {
    this.core.load(input);
    this.geometryRevision += 1;
    this.geometryRevisionProjection = this.core.visibleProjection;
    this.invalidateGeometryCache();
  }

  public async loadAsync(input: unknown, assertCurrent?: () => void): Promise<void> {
    await this.core.loadAsync(
      input,
      undefined,
      assertCurrent === undefined ? {} : { assertCurrent },
    );
    this.geometryRevision += 1;
    this.geometryRevisionProjection = this.core.visibleProjection;
    this.invalidateGeometryCache();
  }

  public reconcile(
    input: unknown,
    options: CoreV2SurfaceReconcileOptions = {},
  ): CoreV2SurfaceReconcileResult {
    const result = this.core.reconcile(input, {
      ...(options.animateBarChanges === undefined
        ? {}
        : { animateBarChanges: options.animateBarChanges }),
      ...(options.animatedBarTargets === undefined
        ? {}
        : { animatedBarTargets: options.animatedBarTargets }),
      ...(options.allowedComponentOrderOwners === undefined
        ? {}
        : { allowedComponentOrderOwners: options.allowedComponentOrderOwners }),
      ...(options.allowedElementOrderIds === undefined
        ? {}
        : { allowedElementOrderIds: options.allowedElementOrderIds }),
      ...(options.selectionIds === undefined
        ? {}
        : { selectionIds: options.selectionIds }),
    });
    if (result.status === 'committed') {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = this.core.visibleProjection;
      this.invalidateGeometryCache();
    }
    return Object.freeze({
      status: result.status,
      operationCount: result.plan.summary.operationCount,
      denseChanged: result.facts.denseChanged,
      diagnostics: freezeReconcileDiagnostics(result.plan.diagnostics),
    });
  }

  public publishFrame(timeMs: number): void {
    this.core.publishFrame(timeMs);
    this.geometryRevision += 1;
    this.geometryRevisionProjection = this.core.visibleProjection;
    this.invalidateGeometryCache();
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = this.core.resize(width, height, pixelRatio);
    if (changed) {
      this.geometryRevision += 1;
      this.invalidateGeometryCache();
    }
    return changed;
  }

  public setView(view: CoreV2SurfaceView): void {
    const nextView = Object.freeze({
      ...view,
      flipX: view.flipX ?? false,
      flipY: view.flipY ?? false,
    });
    this.core.setWorldTransform({
      x: nextView.x,
      y: nextView.y,
      scale: nextView.scale,
      rotationDegrees: nextView.rotation,
      flipX: nextView.flipX,
      flipY: nextView.flipY,
    });
    this.surfaceView = nextView;
    this.geometryRevision += 1;
    this.invalidateGeometryCache();
  }

  public setViewportGesturePolicies(
    policies: readonly CoreV2ViewportPolicy[],
  ): void {
    this.core.setViewportGesturePolicies(policies);
  }

  public setViewportZoomLimits(limits: readonly [number, number]): void {
    this.core.setViewportZoomLimits(limits);
  }

  public bindViewportInput(
    listener: (input: CoreV2SurfaceViewportInput) => void,
  ): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('viewport input listener must be a function');
    }
    if (this.viewportInputListener !== null) {
      throw new Error('viewport input listener is already bound');
    }
    this.viewportInputListener = listener;
    return () => {
      if (this.viewportInputListener === listener) this.viewportInputListener = null;
    };
  }

  public cancelViewportGestures(): void {
    this.core.cancelViewportGestures();
  }

  public select(ids: readonly string[]): void {
    this.core.selectSemantic(ids);
    this.geometryRevision += 1;
    this.invalidateGeometryCache();
  }

  public setPresentationPolicy(
    input: CoreV2PresentationPolicyInput,
  ): CoreV2PresentationPolicyProductProbe {
    return this.core.setPresentationPolicy(input);
  }

  public clearPresentationPolicy(): CoreV2PresentationPolicyProductProbe {
    return this.core.clearPresentationPolicy();
  }

  public presentationPolicyProbe(): CoreV2PresentationPolicyProductProbe {
    return this.core.presentationPolicyProbe();
  }

  public refreshSemanticTargets(
    targets: readonly CoreV2SemanticTarget[],
    options: Readonly<{ readonly strict?: boolean }> = {},
  ): CoreV2SemanticRefreshResult {
    const result = this.core.refreshSemanticTargets(targets, options);
    if (result.changed) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = this.core.visibleProjection;
      this.invalidateGeometryCache();
    }
    return result;
  }

  public hitTestScreen(point: CoreV2Point): string | null {
    const ref = this.core.hitTestScreen(point, { interactiveOnly: true });
    return ref ? this.core.get(ref)?.id ?? null : null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return this.core.screenToWorld(point);
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    const renderer = this.core.renderer;
    const runtime = this.core.debugSnapshot();
    const selectionIds = Object.freeze(
      this.core.selection().refs.flatMap((ref) => {
        const entity = this.core.get(ref);
        return entity ? [entity.id] : [];
      }),
    );
    return Object.freeze({
      cssSize: Object.freeze([renderer.width, renderer.height] as [number, number]),
      backingSize: Object.freeze([
        Math.round(renderer.width * renderer.pixelRatio),
        Math.round(renderer.height * renderer.pixelRatio),
      ] as [number, number]),
      selectionIds,
      activeAnimationCount: this.core.activeAnimations,
      activeGestureCount: runtime.activeGestureCount,
      renderCommandCount: runtime.renderer.aggregateRenderObjects,
      visiblePrimitiveCount: runtime.renderer.visiblePrimitives,
    });
  }

  public geometrySnapshot(): CoreV2SurfaceGeometrySnapshot {
    const projection = this.core.visibleProjection;
    if (this.geometryCache && this.geometryProjection === projection) return this.geometryCache;
    if (this.geometryRevisionProjection !== projection) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = projection;
    }
    const geometry = Object.freeze({
      ...createCoreV2SurfaceGeometrySnapshot(
        this.core.snapshot(),
        projection,
        this.surfaceView,
      ),
      revision: this.geometryRevision,
    });
    this.geometryCache = geometry;
    this.geometryProjection = projection;
    this.relationHitIndex = buildCoreV2RelationHitIndex(geometry.relations);
    return geometry;
  }

  public sceneImageProbe(): CoreV2EngineSceneImagesProbe {
    const controller = this.core.sceneImageProbe();
    const entities = new Map(
      this.core.snapshot().entities.map((entity) => [entity.id, entity] as const),
    );
    const images: Record<string, CoreV2EngineSceneImageRecord> = Object.create(null) as Record<
      string,
      CoreV2EngineSceneImageRecord
    >;
    for (const entityId of Object.keys(controller.images).sort()) {
      const image = controller.images[entityId]!;
      const entity = entities.get(entityId);
      const attempts = Object.freeze(image.attempts.map(projectEngineImageAttempt));
      images[entityId] = Object.freeze({
        ...withoutImageAuthoredSource(image),
        ...safeEngineImageSource(image.authoredSource, image.sourceKind),
        opacity: entity?.opacity ?? 0,
        zIndex: entity?.zIndex ?? 0,
        hitBounds: this.core.hitBounds(entityId),
        initial: attempts[0] ?? null,
        attempts,
      });
    }
    return Object.freeze({
      ...controller,
      images: Object.freeze(images),
    });
  }

  public componentVisualProbe(
    target: CoreV2ComponentVisualTarget,
  ): CoreV2SurfaceComponentVisualProbe | null {
    const visual = this.core.componentVisualProbe(target);
    if (!visual) return null;
    const entity = this.core.get(visual.entityId);
    return Object.freeze({
      target: visual.target,
      semanticOwnerId: visual.semanticOwnerId,
      entityId: visual.entityId,
      logicalIdentity: visual.logicalIdentity,
      componentType: visual.componentType,
      renderRole: visual.renderRole,
      entityKind: visual.entityKind,
      geometry: visual.geometry,
      publication: visual.publication,
      sceneImage: visual.image
        ? projectEngineSceneImageRecord(visual.image, entity, visual.geometry.worldBounds)
        : null,
      rendererPaint: visual.rendererPaint,
      renderLanes: visual.renderLanes,
    });
  }

  public barPresentationProbe(
    target: CoreV2ComponentVisualTarget,
  ): CoreV2BarPresentationProductProbe | null {
    return this.core.barPresentationProbe(target);
  }

  public paintOrderProbe(): CoreV2PaintOrderProductProbe {
    return this.core.paintOrderProbe();
  }

  public textProbe(target: CoreV2TextTarget): CoreV2TextProductProbe | null {
    return this.core.textProbe(target);
  }

  public settleSceneImages(): Promise<void> {
    return this.core.settleSceneImages();
  }

  public settleSceneImageBindings(bindingKeys: readonly string[]): Promise<void> {
    return this.core.settleSceneImageBindings(bindingKeys);
  }

  public relationHitTestScreen(
    point: CoreV2Point,
    options: CoreV2RelationHitOptions = {},
  ): CoreV2RelationHit | null {
    const geometry = this.geometrySnapshot();
    const tolerance = options.toleranceCssPx ?? 4;
    const candidateIndices = tolerance <= 4
      ? queryCoreV2RelationHitIndex(this.relationHitIndex, point)
      : geometry.relations.map((_relation, index) => index);
    const candidates = candidateIndices.flatMap((index) => {
      const relation = geometry.relations[index];
      return relation ? [relation] : [];
    });
    return hitTestCoreV2SurfaceRelations(candidates, point, options);
  }

  public interactionOwnershipProbe(): CoreV2InteractionOwnershipProbe {
    return this.core.interactionOwnershipProbe();
  }

  public async destroy(): Promise<boolean> {
    this.viewportInputListener = null;
    this.unbindCoreViewportChanges();
    try {
      return await this.core.destroy();
    } finally {
      this.canvasPresent = false;
      this.geometryRevisionProjection = null;
      this.invalidateGeometryCache();
    }
  }

  private invalidateGeometryCache(): void {
    this.geometryCache = null;
    this.geometryProjection = null;
    this.relationHitIndex = emptyCoreV2RelationHitIndex();
  }
}

function withoutImageAuthoredSource(
  image: CoreV2SceneImageProductProbe,
): Omit<CoreV2SceneImageProductProbe, 'authoredSource' | 'attempts'> {
  const { authoredSource: _authoredSource, attempts: _attempts, ...rest } = image;
  return rest;
}

function safeEngineImageSource(
  authoredSource: CoreV2AssetSource,
  sourceKind: CoreV2ImageSourceKind,
): Readonly<{
  authoredSource?: CoreV2AssetSource;
  authoredSourceKind?: CoreV2ImageSourceKind;
}> {
  return sourceKind === 'data-uri'
    ? Object.freeze({ authoredSourceKind: sourceKind })
    : Object.freeze({ authoredSource });
}

function projectEngineImageAttempt(
  attempt: CoreV2SceneImageAttemptProbe,
): CoreV2EngineSceneImageAttemptProbe {
  const {
    authoredSource,
    sourceKind,
    resourceState,
    ...rest
  } = attempt;
  return Object.freeze({
    ...rest,
    ...safeEngineImageSource(authoredSource, sourceKind),
    state: resourceState,
  });
}

function projectEngineSceneImageRecord(
  image: CoreV2SceneImageProductProbe,
  entity: SceneSnapshot['entities'][number] | null,
  hitBounds: readonly [number, number, number, number] | null,
): CoreV2EngineSceneImageRecord {
  const attempts = Object.freeze(image.attempts.map(projectEngineImageAttempt));
  return Object.freeze({
    ...withoutImageAuthoredSource(image),
    ...safeEngineImageSource(image.authoredSource, image.sourceKind),
    opacity: entity?.opacity ?? 0,
    zIndex: entity?.zIndex ?? 0,
    hitBounds,
    initial: attempts[0] ?? null,
    attempts,
  });
}

function indexComponentSemantics(
  dataset: readonly NormalizedCoreV2Element[],
): Map<string, CoreV2EngineComponentSemanticProbe> {
  const index = new Map<string, CoreV2EngineComponentSemanticProbe>();
  const visit = (elements: readonly NormalizedCoreV2Element[]): void => {
    for (const element of elements) {
      if (element.type === 'item') {
        for (const component of element.components) {
          addComponentSemantic(index, element.id, component);
        }
      } else if (element.type === 'grid') {
        for (const component of element.item.components) {
          addComponentSemantic(index, element.id, component);
        }
      } else if (element.type === 'group') {
        visit(element.children);
      }
    }
  };
  visit(dataset);
  return index;
}

function addComponentSemantic(
  index: Map<string, CoreV2EngineComponentSemanticProbe>,
  ownerId: string,
  component: CoreV2Component,
): void {
  const target = Object.freeze({ kind: 'component' as const, ownerId, id: component.id });
  index.set(componentSemanticKey(ownerId, component.id), Object.freeze({
    target,
    ownerId,
    componentId: component.id,
    componentType: component.type,
    authoredSize: 'size' in component
      ? cloneDetachedComponentValue(component.size) as CoreV2ComponentSize
      : null,
    source: component.type === 'text'
      ? null
      : cloneDetachedComponentValue(component.source) as CoreV2BackgroundSource,
    tint: cloneDetachedComponentValue(component.tint),
    show: component.show,
  }));
}

function cloneDetachedComponentValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneDetachedComponentValue(entry)));
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(result, key, {
      value: cloneDetachedComponentValue(Reflect.get(value, key)),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(result);
}

function normalizeEngineComponentVisualTarget(
  target: CoreV2ComponentVisualTarget,
): CoreV2ComponentVisualTarget {
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

function componentSemanticKey(ownerId: string, componentId: string): string {
  return `${ownerId.length}:${ownerId}:${componentId}`;
}

function indexTextSemantics(
  dataset: readonly NormalizedCoreV2Element[],
): Map<string, IndexedEngineTextSemantic> {
  const index = new Map<string, IndexedEngineTextSemantic>();
  const visit = (
    elements: readonly NormalizedCoreV2Element[],
    ancestorVisible: boolean,
    ancestorLocked: boolean,
  ): void => {
    for (const element of elements) {
      const visible = ancestorVisible && element.show;
      const locked = ancestorLocked || element.locked;
      if (element.type === 'text') {
        const target = Object.freeze({ kind: 'element' as const, id: element.id });
        index.set(engineTextTargetKey(target), Object.freeze({
          gridTemplate: false,
          probe: freezeEngineTextSemantic({
            target,
            semanticOwnerId: element.id,
            source: element.text,
            authoredStyle: element.style,
            placement: null,
            margin: EMPTY_TEXT_MARGIN,
            tint: null,
            split: 0,
            show: visible,
            locked,
            contentOrientation: 'follow-item',
          }),
        }));
        continue;
      }
      if (element.type === 'item') {
        for (const component of element.components) {
          if (component.type !== 'text') continue;
          addEngineTextComponentSemantic(index, {
            ownerId: element.id,
            component,
            show: visible && component.show,
            locked,
            contentOrientation: element.contentOrientation,
            gridTemplate: false,
          });
        }
        continue;
      }
      if (element.type === 'grid') {
        for (const component of element.item.components) {
          if (component.type !== 'text') continue;
          addEngineTextComponentSemantic(index, {
            ownerId: element.id,
            component,
            show: visible && component.show,
            locked,
            contentOrientation: element.item.contentOrientation,
            gridTemplate: true,
          });
        }
        continue;
      }
      if (element.type === 'group') visit(element.children, visible, locked);
    }
  };
  visit(dataset, true, false);
  return index;
}

function addEngineTextComponentSemantic(
  index: Map<string, IndexedEngineTextSemantic>,
  input: Readonly<{
    ownerId: string;
    component: Extract<CoreV2Component, { readonly type: 'text' }>;
    show: boolean;
    locked: boolean;
    contentOrientation: CoreV2TextProjection['contentOrientation'];
    gridTemplate: boolean;
  }>,
): void {
  const target = Object.freeze({
    kind: 'component' as const,
    ownerId: input.ownerId,
    id: input.component.id,
  });
  index.set(engineTextTargetKey(target), Object.freeze({
    gridTemplate: input.gridTemplate,
    probe: freezeEngineTextSemantic({
      target,
      semanticOwnerId: input.ownerId,
      source: input.component.text,
      authoredStyle: input.component.style,
      placement: input.component.placement,
      margin: input.component.margin,
      tint: input.component.tint,
      split: input.component.split,
      show: input.show,
      locked: input.locked,
      contentOrientation: input.contentOrientation,
    }),
  }));
}

function freezeEngineTextSemantic(
  probe: CoreV2EngineTextSemanticProbe,
): CoreV2EngineTextSemanticProbe {
  return Object.freeze({
    ...probe,
    target: normalizeCoreV2TextTarget(probe.target),
    authoredStyle: cloneDetachedComponentValue(probe.authoredStyle) as CoreV2TextStyle,
    margin: cloneDetachedComponentValue(probe.margin) as CoreV2TextProjection['margin'],
    tint: cloneDetachedComponentValue(probe.tint),
  });
}

function engineTextTargetKey(target: CoreV2TextTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

function surfaceTextProbeIsCurrent(probe: CoreV2TextProductProbe | null): boolean {
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

function surfaceTextProbeIsAbsent(probe: CoreV2TextProductProbe | null): boolean {
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

const EMPTY_TEXT_MARGIN = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

async function createPixiSurface(options: CoreV2SurfaceOptions): Promise<CoreV2EngineSurface> {
  const coreOptions: CoreV2Options = {
    width: options.width,
    height: options.height,
    pixelRatio: options.pixelRatio,
    antialias: options.antialias,
    background: options.background,
    strategy: options.strategy,
    preference: options.preference,
    powerPreference: options.powerPreference,
    autoRender: false,
    ...(options.assetSession ? { assetSession: options.assetSession } : {}),
    ...(options.target ? { target: options.target } : {}),
    ...(options.canvas ? { canvas: options.canvas } : {}),
  };
  return new PixiEngineSurface(await createCoreV2(coreOptions));
}

function validateInitializeOptions(options: CoreV2InitializeOptions): void {
  if (!options.instanceId) throw new TypeError('instanceId must be a non-empty string');
  for (const [name, value] of [['width', options.width], ['height', options.height]] as const) {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
  }
  if (options.pixelRatio !== undefined && (!(options.pixelRatio > 0) || !Number.isFinite(options.pixelRatio))) {
    throw new RangeError('pixelRatio must be positive and finite');
  }
}

function validatePositiveFinite(name: string, value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
}

function validatePoint(point: CoreV2Point, operation: string): void {
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

function serializedViewport(
  centerWorld: readonly [number, number],
  scale: number,
): CoreV2SerializedViewportState {
  return Object.freeze({
    schemaRevision: CORE_V2_VIEWPORT_REVISION,
    centerWorld: Object.freeze([centerWorld[0], centerWorld[1]] as const),
    scale,
  });
}

function normalizeSerializedViewport(
  value: unknown,
  limits: readonly [number, number],
): CoreV2SerializedViewportState | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  const center = record.centerWorld;
  const scale = record.scale;
  if (
    !Array.isArray(center) ||
    center.length !== 2 ||
    !Number.isFinite(center[0]) ||
    !Number.isFinite(center[1]) ||
    !Number.isFinite(scale) ||
    (scale as number) < limits[0] ||
    (scale as number) > limits[1]
  ) {
    return null;
  }
  return serializedViewport(
    [center[0] as number, center[1] as number],
    scale as number,
  );
}

function viewportStateKey(
  centerWorld: readonly [number, number],
  scale: number,
): string {
  return `${canonicalViewportScalar(centerWorld[0])},${canonicalViewportScalar(centerWorld[1])},${canonicalViewportScalar(scale)}`;
}

function canonicalViewportScalar(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeViewportPolicy(value: unknown): CoreV2ViewportPolicy {
  if (
    typeof value !== 'string' ||
    !CORE_V2_VIEWPORT_POLICIES.includes(value as CoreV2ViewportPolicy)
  ) {
    throw new TypeError('unsupported viewport policy');
  }
  return value as CoreV2ViewportPolicy;
}

function orderedViewportPolicies(
  values: ReadonlySet<CoreV2ViewportPolicy>,
): readonly CoreV2ViewportPolicy[] {
  return Object.freeze(CORE_V2_VIEWPORT_POLICIES.filter((policy) => values.has(policy)));
}

function replacePolicySet(
  target: Set<CoreV2ViewportPolicy>,
  values: readonly CoreV2ViewportPolicy[],
): void {
  target.clear();
  for (const value of values) target.add(value);
}

function normalizeDegrees(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function emptySurfaceDebug(width: number, height: number, pixelRatio: number): CoreV2SurfaceDebug {
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

function normalizeZoomLimits(value: readonly [number, number]): readonly [number, number] {
  const [min, max] = value;
  if (!(min > 0) || !(max >= min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError('zoomLimits must contain positive finite min/max values');
  }
  return Object.freeze([min, max]);
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

function packedColorToHex(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(8, '0')}`;
}

const EMPTY_TARGETS = Object.freeze([] as CoreV2SemanticTarget[]);
const EMPTY_RECONCILE_DIAGNOSTICS = Object.freeze([] as CoreV2ReconcileDiagnostic[]);

function freezeMutationTargets(
  values: readonly CoreV2MutationTarget[],
): readonly CoreV2MutationTarget[] {
  return Object.freeze(values.map((target) => Object.freeze({ ...target })));
}

function freezeTransactionHistory(
  recorded: boolean,
  commandId: string | null,
  previous: CoreV2HistoryState,
  current: CoreV2HistoryState,
): CoreV2EngineTransactionHistory {
  return Object.freeze({
    recorded,
    commandId,
    depthDelta: current.undoDepth - previous.undoDepth,
    state: current,
  });
}

function historySnapshotForDataset(
  dataset: readonly NormalizedCoreV2Element[],
  selectionIds: readonly string[],
): CoreV2SemanticHistorySnapshotInput<
  readonly NormalizedCoreV2Element[],
  CoreV2EngineHistoryCompanion
> {
  return Object.freeze({
    dataset,
    companion: Object.freeze({ selectionIds: Object.freeze([...selectionIds]) }),
  });
}

function transactionSelectionAfter(
  selectionIds: readonly string[],
  operations: readonly CoreV2MutationOperation[],
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
  operations: readonly CoreV2MutationOperation[],
  dataset: readonly NormalizedCoreV2Element[],
): readonly Readonly<{ readonly ownerId: string; readonly componentId: string }>[] {
  const targets = new Map<string, Readonly<{ ownerId: string; componentId: string }>>();
  for (const operation of operations) {
    if (operation.op !== 'merge' || operation.target.kind !== 'component') continue;
    if (!operation.changes.some((change) => change.path[0] === 'size')) continue;
    const record = findEngineSemanticTarget(dataset, operation.target);
    if (record?.type !== 'bar') continue;
    const target = Object.freeze({
      ownerId: operation.target.ownerId,
      componentId: operation.target.id,
    });
    targets.set(componentSemanticKey(target.ownerId, target.componentId), target);
  }
  return Object.freeze([...targets.values()]);
}

function componentOrderOwners(
  operations: readonly CoreV2MutationOperation[],
): readonly string[] {
  return Object.freeze([...new Set(
    operations
      .filter((operation) => operation.op === 'reconcile-components')
      .map((operation) => operation.target.id),
  )]);
}

function normalizeEngineMutationTarget(value: unknown): CoreV2MutationTarget {
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

function normalizeSnapshotTarget(value: unknown): CoreV2MutationTarget | null {
  if (value === null || typeof value !== 'object') return null;
  try {
    return normalizeEngineMutationTarget(Reflect.get(value, 'target'));
  } catch {
    return null;
  }
}

function findEngineSemanticTarget(
  dataset: readonly NormalizedCoreV2Element[],
  target: CoreV2MutationTarget,
): Readonly<Record<string, unknown>> | null {
  let result: Readonly<Record<string, unknown>> | null = null;
  const visit = (elements: readonly NormalizedCoreV2Element[]): void => {
    for (const element of elements) {
      if (target.kind === 'element' && element.id === target.id) {
        result = element as Readonly<Record<string, unknown>>;
      }
      if (target.kind === 'component' && element.id === target.ownerId) {
        const components = element.type === 'item'
          ? element.components
          : element.type === 'grid'
            ? element.item.components
            : Object.freeze([] as CoreV2Component[]);
        const component = components.find((entry) => entry.id === target.id);
        if (component !== undefined) {
          result = component as unknown as Readonly<Record<string, unknown>>;
        }
      }
      if (element.type === 'group') visit(element.children);
    }
  };
  visit(dataset);
  return result;
}

function cloneDetachedEngineRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const clone = cloneDetachedComponentValue(value);
  if (clone === null || typeof clone !== 'object' || Array.isArray(clone)) {
    throw new Error('target snapshot clone lost record shape');
  }
  return clone as Readonly<Record<string, unknown>>;
}

function semanticTargetIdentity(target: CoreV2SemanticTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

function freezeTargets(values: readonly CoreV2SemanticTarget[]): readonly CoreV2SemanticTarget[] {
  return Object.freeze([...values]);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function freezeReconcileDiagnostics(
  values: readonly CoreV2ReconcileDiagnostic[],
): readonly CoreV2ReconcileDiagnostic[] {
  return Object.freeze(values.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

function mutationDiagnosticMapping(
  diagnostic: CoreV2SemanticMutationDiagnostic,
): Readonly<{
  code: string;
  category: CoreV2DiagnosticCategory;
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

export function createCoreV2SurfaceGeometrySnapshot(
  snapshot: SceneSnapshot,
  projection: CoreV2ProjectionIndex | null = null,
  surfaceView: CoreV2SurfaceView = Object.freeze({
    ...snapshot.view,
    rotation: snapshot.view.rotation ?? 0,
  }),
): CoreV2SurfaceGeometrySnapshot {
  const entityGeometries = snapshot.entities
    .filter((entity) => entity.kind !== 'relation')
    .map((entity) => {
      const entityProjection = projection?.byEntityId[entity.id];
      const geometry = entityProjection
        ? resolveProjectedEntityGeometry(entityProjection, surfaceView)
        : resolveDenseEntityGeometry(entity.bounds, entity.rotation, surfaceView);
      return Object.freeze<CoreV2SurfaceEntityGeometry>({
        id: entity.id,
        kind: entity.kind,
        localBounds: entityProjection?.localBounds ?? freezeBounds(
          0,
          0,
          entity.bounds.width,
          entity.bounds.height,
        ),
        worldBounds: geometry.worldBounds,
        screenBounds: geometry.screenBounds,
        visibleBounds: entity.visible ? geometry.worldBounds : null,
        visible: entity.visible,
        interactive: entity.interactive,
        scaleX: entityProjection?.scaleX ?? 1,
        scaleY: entityProjection?.scaleY ?? 1,
        ...(entityProjection?.ownerItemId ? { ownerItemId: entityProjection.ownerItemId } : {}),
        ...(entityProjection?.componentId ? { componentId: entityProjection.componentId } : {}),
        ...(entityProjection?.componentType ? { componentType: entityProjection.componentType } : {}),
        ...(entityProjection
          ? {
              contentOrientation: entityProjection.contentOrientation,
              screenBasis: geometry.screenBasis,
              visibleCenter: entityProjection.visibleCenter,
              screenAngle: entityProjection.contentOrientation === 'upright'
                ? 0
                : normalizeDegrees(entityProjection.rotationDegrees + surfaceView.rotation),
            }
          : {}),
      });
    });
  const geometryById = new Map(entityGeometries.map((entity) => [entity.id, entity]));
  const relations = snapshot.entities.flatMap((entity) => {
    if (entity.kind !== 'relation') return [];
    const sourceId = entity.data.from;
    const targetId = entity.data.to;
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') return [];
    const source = geometryById.get(sourceId);
    const target = geometryById.get(targetId);
    if (!source || !target) return [];
    const relationProjection = projection?.relationsByEntityId?.[entity.id];
    const fallbackProjection = Object.freeze({
      entityId: entity.id,
      relationId: relationSourceId(entity),
      sourceId,
      targetId,
      key: `${sourceId}>${targetId}`,
      identityKey: `${sourceId.length}:${sourceId}${targetId.length}:${targetId}`,
      authoredIndex: 0,
      affine: createCoreV2Affine(),
    });
    const resolved = resolveCoreV2RelationPath(
      relationProjection ?? fallbackProjection,
      {
        id: sourceId,
        center: source.visibleCenter ?? boundsCenter(source.worldBounds),
        worldBounds: source.worldBounds,
        visible: source.visible,
      },
      {
        id: targetId,
        center: target.visibleCenter ?? boundsCenter(target.worldBounds),
        worldBounds: target.worldBounds,
        visible: target.visible,
      },
      {
        color: typeof entity.data.color === 'number' ? entity.data.color : 0x000000ff,
        width: typeof entity.data.lineWidth === 'number' ? entity.data.lineWidth : 1,
        opacity: entity.opacity,
        zIndex: entity.zIndex,
        visible: entity.visible,
      },
    );
    const screenPoints = Object.freeze(
      resolved.worldPoints.map((point) => surfacePointToScreen(point, surfaceView)),
    );
    const sourceWorld = resolved.worldPoints[0] ?? source.visibleCenter ?? boundsCenter(source.worldBounds);
    const targetWorld = resolved.worldPoints[resolved.worldPoints.length - 1] ?? target.visibleCenter ?? boundsCenter(target.worldBounds);
    const sourceScreen = screenPoints[0] ?? surfacePointToScreen(sourceWorld, surfaceView);
    const targetScreen = screenPoints[screenPoints.length - 1] ?? surfacePointToScreen(targetWorld, surfaceView);
    return [Object.freeze<CoreV2SurfaceRelationGeometry>({
      id: entity.id,
      relationId: resolved.relationId,
      key: resolved.key,
      identityKey: (relationProjection ?? fallbackProjection).identityKey,
      sourceId,
      targetId,
      kind: resolved.kind,
      localPoints: resolved.localPoints,
      worldPoints: resolved.worldPoints,
      screenPoints,
      worldBounds: resolved.worldBounds,
      screenBounds: boundsForTuplePoints(screenPoints),
      visible: resolved.visible,
      style: Object.freeze({
        color: resolved.style.color,
        colorHex: packedColorToHex(resolved.style.color),
        width: resolved.style.width,
        opacity: resolved.style.opacity,
        zIndex: resolved.style.zIndex,
      }),
      visibleStrokeWidthsCssPx: Object.freeze(
        resolved.worldStrokeWidths.map((width) => width * surfaceView.scale),
      ),
      worldEndpoints: Object.freeze([sourceWorld, targetWorld] as const),
      screenEndpoints: Object.freeze([
        sourceScreen,
        targetScreen,
      ] as const),
    })];
  });
  const selectedRefs = new Set(snapshot.selection.refs.map((ref) => `${ref.slot}:${ref.generation}`));
  const selectedBounds = snapshot.entities.flatMap((entity) => {
    if (entity.kind === 'relation' || !selectedRefs.has(`${entity.ref.slot}:${entity.ref.generation}`)) return [];
    const geometry = geometryById.get(entity.id);
    return geometry ? [geometry.screenBounds] : [];
  });
  const selectionOverlay = unionBounds(selectedBounds);

  return Object.freeze({
    revision: snapshot.revision,
    sceneRevision: snapshot.revision,
    entities: Object.freeze(entityGeometries),
    relations: Object.freeze(relations),
    omittedRelations: Object.freeze((projection?.omittedRelations ?? []).map((relation) =>
      Object.freeze({
        id: relation.entityId,
        relationId: relation.relationId,
        key: relation.key,
        identityKey: relation.identityKey,
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        authoredIndex: relation.authoredIndex,
        reason: relation.reason,
      }))),
    selectionOverlay: selectionOverlay === null
      ? null
      : Object.freeze({ screenBounds: selectionOverlay }),
  });
}

export function hitTestCoreV2SurfaceRelations(
  relations: readonly CoreV2SurfaceRelationGeometry[],
  point: CoreV2Point,
  options: CoreV2RelationHitOptions = {},
): CoreV2RelationHit | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('relation hit point must contain finite coordinates');
  }
  const tolerance = options.toleranceCssPx ?? 4;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('toleranceCssPx must be finite and non-negative');
  }
  const screenPoint = Object.freeze([point.x, point.y] as const);
  for (let relationIndex = relations.length - 1; relationIndex >= 0; relationIndex -= 1) {
    const relation = relations[relationIndex];
    if (!relation?.visible || !relation.screenPoints || !relation.style) continue;
    for (let segmentIndex = relation.screenPoints.length - 1; segmentIndex >= 1; segmentIndex -= 1) {
      const from = relation.screenPoints[segmentIndex - 1];
      const to = relation.screenPoints[segmentIndex];
      if (!from || !to) continue;
      if (relationPathHitScreen(
        Object.freeze([from, to]),
        screenPoint,
        relation.visibleStrokeWidthsCssPx?.[segmentIndex - 1] ?? relation.style.width,
        tolerance,
      )) {
        return Object.freeze({
          id: relation.id,
          relationId: relation.relationId ?? relation.id,
          key: relation.key ?? `${relation.sourceId}>${relation.targetId}`,
          identityKey: relation.identityKey ??
            `${relation.sourceId.length}:${relation.sourceId}${relation.targetId.length}:${relation.targetId}`,
          sourceId: relation.sourceId,
          targetId: relation.targetId,
        });
      }
    }
  }
  return null;
}

const CORE_V2_RELATION_HIT_CELL_SIZE = 64;
const CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH = 1_024;

export function buildCoreV2RelationHitIndex(
  relations: readonly CoreV2SurfaceRelationGeometry[],
): CoreV2RelationHitIndex {
  const mutable = new Map<string, number[]>();
  const overflow: number[] = [];
  relations.forEach((relation, index) => {
    if (
      !relation.visible || !relation.style ||
      !relation.screenPoints || relation.screenPoints.length < 2
    ) return;
    const strokeRadius = Math.max(
      4,
      ...(relation.visibleStrokeWidthsCssPx ?? [relation.style?.width ?? 0]).map(
        (width) => width / 2,
      ),
    );
    const cellKeys = relationHitPathCellKeys(relation.screenPoints, strokeRadius);
    if (cellKeys === null) {
      overflow.push(index);
      return;
    }
    for (const key of cellKeys) {
      const indices = mutable.get(key) ?? [];
      indices.push(index);
      mutable.set(key, indices);
    }
  });
  return Object.freeze({
    cells: new Map(
      [...mutable].map(([key, indices]) => [key, Object.freeze(indices)] as const),
    ),
    overflow: Object.freeze(overflow),
  });
}

export function queryCoreV2RelationHitIndex(
  index: CoreV2RelationHitIndex,
  point: CoreV2Point,
): readonly number[] {
  const local = index.cells.get(relationHitCellKey(point.x, point.y)) ?? [];
  return mergeOrderedRelationIndices(local, index.overflow);
}

function relationHitCellKey(x: number, y: number): string {
  return `${Math.floor(x / CORE_V2_RELATION_HIT_CELL_SIZE)}:${Math.floor(y / CORE_V2_RELATION_HIT_CELL_SIZE)}`;
}

function relationHitPathCellKeys(
  points: readonly (readonly [number, number])[],
  radius: number,
): ReadonlySet<string> | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  const halo = Math.ceil(radius / CORE_V2_RELATION_HIT_CELL_SIZE);
  const haloWidth = halo * 2 + 1;
  const cellsPerStep = haloWidth * haloWidth;
  if (
    !Number.isSafeInteger(halo) ||
    !Number.isSafeInteger(cellsPerStep) ||
    cellsPerStep > CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH
  ) {
    return null;
  }

  const keys = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    const startColumn = relationHitCellCoordinate(from[0]);
    const startRow = relationHitCellCoordinate(from[1]);
    const endColumn = relationHitCellCoordinate(to[0]);
    const endRow = relationHitCellCoordinate(to[1]);
    if (
      startColumn === null || startRow === null ||
      endColumn === null || endRow === null
    ) {
      return null;
    }
    const stepBudget = Math.abs(endColumn - startColumn) +
      Math.abs(endRow - startRow) + 1;
    if (
      !Number.isSafeInteger(stepBudget) ||
      stepBudget > CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH
    ) {
      return null;
    }
    if (!addRelationSegmentCells(
      keys,
      from,
      to,
      startColumn,
      startRow,
      endColumn,
      endRow,
      halo,
    )) {
      return null;
    }
  }
  return keys;
}

function addRelationSegmentCells(
  keys: Set<string>,
  from: readonly [number, number],
  to: readonly [number, number],
  startColumn: number,
  startRow: number,
  endColumn: number,
  endRow: number,
  halo: number,
): boolean {
  let column = startColumn;
  let row = startRow;
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const stepX = Math.sign(deltaX);
  const stepY = Math.sign(deltaY);
  const tDeltaX = stepX === 0
    ? Number.POSITIVE_INFINITY
    : CORE_V2_RELATION_HIT_CELL_SIZE / Math.abs(deltaX);
  const tDeltaY = stepY === 0
    ? Number.POSITIVE_INFINITY
    : CORE_V2_RELATION_HIT_CELL_SIZE / Math.abs(deltaY);
  let tMaxX = stepX === 0
    ? Number.POSITIVE_INFINITY
    : ((stepX > 0 ? column + 1 : column) * CORE_V2_RELATION_HIT_CELL_SIZE - from[0]) /
      deltaX;
  let tMaxY = stepY === 0
    ? Number.POSITIVE_INFINITY
    : ((stepY > 0 ? row + 1 : row) * CORE_V2_RELATION_HIT_CELL_SIZE - from[1]) /
      deltaY;

  while (true) {
    for (let rowOffset = -halo; rowOffset <= halo; rowOffset += 1) {
      for (let columnOffset = -halo; columnOffset <= halo; columnOffset += 1) {
        const candidateColumn = column + columnOffset;
        const candidateRow = row + rowOffset;
        if (!Number.isSafeInteger(candidateColumn) || !Number.isSafeInteger(candidateRow)) {
          return false;
        }
        keys.add(`${candidateColumn}:${candidateRow}`);
        if (keys.size > CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH) return false;
      }
    }
    if (column === endColumn && row === endRow) return true;
    if (tMaxX < tMaxY) {
      column += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      row += stepY;
      tMaxY += tDeltaY;
    } else {
      column += stepX;
      row += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
  }
}

function relationHitCellCoordinate(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const coordinate = Math.floor(value / CORE_V2_RELATION_HIT_CELL_SIZE);
  return Number.isSafeInteger(coordinate) ? coordinate : null;
}

function mergeOrderedRelationIndices(
  local: readonly number[],
  overflow: readonly number[],
): readonly number[] {
  if (local.length === 0) return overflow;
  if (overflow.length === 0) return local;
  const merged: number[] = [];
  let localIndex = 0;
  let overflowIndex = 0;
  while (localIndex < local.length || overflowIndex < overflow.length) {
    const localValue = local[localIndex];
    const overflowValue = overflow[overflowIndex];
    if (overflowValue === undefined || (localValue !== undefined && localValue < overflowValue)) {
      merged.push(localValue as number);
      localIndex += 1;
    } else if (localValue === undefined || overflowValue < localValue) {
      merged.push(overflowValue);
      overflowIndex += 1;
    } else {
      merged.push(localValue);
      localIndex += 1;
      overflowIndex += 1;
    }
  }
  return Object.freeze(merged);
}

function emptyCoreV2RelationHitIndex(): CoreV2RelationHitIndex {
  return Object.freeze({ cells: new Map(), overflow: Object.freeze([]) });
}

function relationSourceId(entity: SceneSnapshot['entities'][number]): string {
  const tag = entity.tags.find((entry) => entry.startsWith('source:'));
  return tag?.slice('source:'.length) || entity.id;
}

interface ResolvedEntityGeometry {
  readonly worldBounds: readonly [number, number, number, number];
  readonly screenBounds: readonly [number, number, number, number];
  readonly screenBasis: CoreV2AffineBasis;
}

function resolveProjectedEntityGeometry(
  projection: NonNullable<CoreV2ProjectionIndex['byEntityId'][string]>,
  view: CoreV2SurfaceView,
): ResolvedEntityGeometry {
  const orientedWorldAffine = multiplyCoreV2Affine(
    createCoreV2Affine(0, 0, 0, view.flipX ? -1 : 1, view.flipY ? -1 : 1),
    createCoreV2Affine(0, 0, view.rotation),
  );
  let worldCorners: readonly (readonly [number, number])[];
  let screenBasis: CoreV2AffineBasis;
  if (projection.contentOrientation === 'upright') {
    const inverseWorld = invertCoreV2Affine(orientedWorldAffine);
    const width = projection.localBounds[2] * Math.hypot(
      projection.affine[0],
      projection.affine[1],
    );
    const height = projection.localBounds[3] * Math.hypot(
      projection.affine[2],
      projection.affine[3],
    );
    const xAxis = Object.freeze([inverseWorld[0], inverseWorld[1]] as const);
    const yAxis = Object.freeze([inverseWorld[2], inverseWorld[3]] as const);
    const [centerX, centerY] = projection.visibleCenter;
    worldCorners = Object.freeze([
      Object.freeze([centerX - xAxis[0] * width / 2 - yAxis[0] * height / 2, centerY - xAxis[1] * width / 2 - yAxis[1] * height / 2] as const),
      Object.freeze([centerX + xAxis[0] * width / 2 - yAxis[0] * height / 2, centerY + xAxis[1] * width / 2 - yAxis[1] * height / 2] as const),
      Object.freeze([centerX + xAxis[0] * width / 2 + yAxis[0] * height / 2, centerY + xAxis[1] * width / 2 + yAxis[1] * height / 2] as const),
      Object.freeze([centerX - xAxis[0] * width / 2 + yAxis[0] * height / 2, centerY - xAxis[1] * width / 2 + yAxis[1] * height / 2] as const),
    ]);
    screenBasis = Object.freeze([1, 0, 0, 1] as const);
  } else {
    worldCorners = coreV2AffineCorners(projection.affine, projection.localBounds);
    screenBasis = coreV2AffineBasis(multiplyCoreV2Affine(orientedWorldAffine, projection.affine));
  }
  const screenCorners = worldCorners.map((point) => surfacePointToScreen(point, view));
  return Object.freeze({
    worldBounds: boundsForTuplePoints(worldCorners),
    screenBounds: boundsForTuplePoints(screenCorners),
    screenBasis,
  });
}

function resolveDenseEntityGeometry(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
  view: CoreV2SurfaceView,
): ResolvedEntityGeometry {
  const worldCorners = rotatedWorldCorners(bounds, rotation).map((point) => freezePoint(point.x, point.y));
  const screenCorners = worldCorners.map((point) => surfacePointToScreen(point, view));
  const worldAffine = multiplyCoreV2Affine(
    createCoreV2Affine(0, 0, 0, view.flipX ? -1 : 1, view.flipY ? -1 : 1),
    createCoreV2Affine(0, 0, view.rotation + rotation),
  );
  return Object.freeze({
    worldBounds: boundsForTuplePoints(worldCorners),
    screenBounds: boundsForTuplePoints(screenCorners),
    screenBasis: coreV2AffineBasis(worldAffine),
  });
}

function surfacePointToScreen(
  point: readonly [number, number],
  view: CoreV2SurfaceView,
): readonly [number, number] {
  const scaledX = point[0] * view.scale;
  const scaledY = point[1] * view.scale;
  const radians = view.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return freezePoint(
    view.x + (scaledX * cosine - scaledY * sine) * (view.flipX ? -1 : 1),
    view.y + (scaledX * sine + scaledY * cosine) * (view.flipY ? -1 : 1),
  );
}

function boundsForTuplePoints(
  points: readonly (readonly [number, number])[],
): readonly [number, number, number, number] {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return freezeBounds(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY);
}

function rotatedWorldCorners(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
): readonly CoreV2Point[] {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radians = rotation * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [-bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, bounds.height / 2],
    [-bounds.width / 2, bounds.height / 2],
  ] as const;
  return corners.map(([localX, localY]) => Object.freeze({
    x: centerX + localX * cosine - localY * sine,
    y: centerY + localX * sine + localY * cosine,
  }));
}

function unionBounds(
  bounds: readonly (readonly [number, number, number, number])[],
): readonly [number, number, number, number] | null {
  if (bounds.length === 0) return null;
  const minX = Math.min(...bounds.map((entry) => entry[0]));
  const minY = Math.min(...bounds.map((entry) => entry[1]));
  const maxX = Math.max(...bounds.map((entry) => entry[0] + entry[2]));
  const maxY = Math.max(...bounds.map((entry) => entry[1] + entry[3]));
  return freezeBounds(minX, minY, maxX - minX, maxY - minY);
}

function boundsCenter(
  bounds: readonly [number, number, number, number],
): readonly [number, number] {
  return freezePoint(bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2);
}

export type { CoreV2ComponentVisualTarget } from './core';

function freezeBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  return Object.freeze([
    snapGeometryScalar(x),
    snapGeometryScalar(y),
    snapGeometryScalar(width),
    snapGeometryScalar(height),
  ] as const);
}

function freezePoint(x: number, y: number): readonly [number, number] {
  return Object.freeze([snapGeometryScalar(x), snapGeometryScalar(y)] as const);
}

function snapGeometryScalar(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= 1e-12 ? integer : value;
}

function findElement(
  values: readonly NormalizedCoreV2Element[],
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

function logicalElementIdExists(
  values: readonly NormalizedCoreV2Element[],
  id: string,
): boolean {
  for (const value of values) {
    if (value.id === id && value.type !== 'relations') return true;
    if (
      value.type === 'item' &&
      componentSelectionIdExists(value.id, value.components, id)
    ) return true;
    if (value.type === 'group' && logicalElementIdExists(value.children, id)) return true;
    if (value.type !== 'grid') continue;
    for (let row = 0; row < value.cells.length; row += 1) {
      const cells = value.cells[row] ?? [];
      for (let column = 0; column < cells.length; column += 1) {
        const instanceId = `${value.id}.${row}.${column}`;
        const active = value.inactiveCellStrategy === 'hide' || cells[column] !== 0;
        if (!active) continue;
        if (id === instanceId) return true;
        if (componentSelectionIdExists(instanceId, value.item.components, id)) return true;
      }
    }
  }
  return false;
}

function componentSelectionIdExists(
  ownerId: string,
  components: readonly Readonly<{ readonly type: string; readonly id: string }>[],
  id: string,
): boolean {
  return components.some((component) =>
    id === `${ownerId}::${component.type}:${component.id}`);
}
