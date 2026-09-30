import type {
  PatchMapBarPresentationProductProbe,
  PatchMapComponentVisualGeometryProbe,
  PatchMapComponentVisualProductProbe,
  PatchMapComponentVisualTarget,
  PatchMapDirectBarHeightUpdate,
  PatchMapDirectElementAngleUpdate,
  PatchMapDirectTextUpdate,
  PatchMapInstanceBarHeightBatchRequest,
  PatchMapInstanceBarHeightBatchResult,
  PatchMapPresentationLifecycleResult,
  PatchMapReconcileTimings,
  PatchMapRootViewportChangeSource,
  PatchMapSelectionMarqueeInput,
  PatchMapSelectionOverlayPolicyInput,
  PatchMapSemanticRefreshResult,
  PatchMapTextProductProbe,
  PatchMapTextTarget,
  PatchMapTransientProjectionResult,
} from '../core/contracts';
import type {
  PatchMapPresentationPolicyInput,
  PatchMapPresentationPolicyProductProbe,
} from '../presentation/policy';
import type {
  PatchMapLogicalPresentationLayerInput,
  PatchMapPresentationLayerChange,
  PatchMapPresentationLayerSnapshot,
} from '../core/presentation-layers';
import type { PatchMapPaintOrderProductProbe } from '../core/paint-order-product';
import type { PatchMapPointerInput, PatchMapPointerModifiers } from '../pointer-gesture';
import type {
  PatchMapViewportGeometry,
  PatchMapViewportPolicy,
} from '../viewport';
import type {
  PatchMapAccessibilityActivationInput,
  PatchMapAccessibilityRenderNode,
  PatchMapAccessibilitySurfaceProbe,
} from '../accessibility';
import type { PatchMapAssetSession } from '../assets';
import type {
  PatchMapImageSourceKind,
  ParsePatchMapOptions,
} from '../parsing/contracts';
import type {
  PatchMapEntityPaintProbe,
  PatchMapRendererPublicSurfaceProbe,
  PatchMapRendererLossProbe,
  PatchMapRenderLaneSnapshot,
} from '../rendering-port';
import type {
  PatchMapSceneImageAttemptProbe,
  PatchMapSceneImageProductProbe,
  PatchMapSceneImageRetryResult,
  PatchMapSceneImagesProbe,
} from '../scene-images';
import type { PatchMapAssetSource } from '../semantic/dataset';
import type { PatchMapSemanticTarget } from '../semantic/probe';
import type { PatchMapReconcileDiagnostic } from '../core/reconcile';
import type { PatchMapScreenRegionBounds } from '../semantic/screen-region-index';
import type {
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitOptions,
  PatchMapSurfaceEntityGeometry,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceRegionGeometryCandidates,
  PatchMapSurfaceView,
} from './surface-contract';

export interface PatchMapSurfaceOptions {
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly antialias: boolean;
  readonly background: number;
  readonly strategy: 'mesh' | 'particle';
  readonly preference: 'webgl' | 'webgpu';
  readonly backend?: 'webgl2' | 'webgpu';
  readonly requireWebGL2?: boolean;
  readonly devtools?: boolean;
  readonly powerPreference: 'high-performance' | 'low-power';
  readonly wheelActivationModifier?: 'none' | 'control';
  readonly parse?: ParsePatchMapOptions;
  readonly assetSession?: PatchMapAssetSession;
  /** Internal bridge from async Pixi/Core invalidation to the product frame owner. */
  readonly requestFrame?: () => void;
  /** Quiesces the product frame owner when the surface cannot prove coherent publication. */
  readonly onTerminalFailure?: (error: Error) => void;
}

export interface PatchMapSurfaceViewportInput {
  readonly source: PatchMapRootViewportChangeSource;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
}

export type PatchMapSurfacePointerInput = Readonly<
  Omit<PatchMapPointerInput, 'viewRevision'>
>;

export interface PatchMapSurfaceContextMenuInput {
  readonly screen: readonly [number, number];
  readonly modifiers: PatchMapPointerModifiers;
}

export interface PatchMapSurfaceDebug {
  readonly cssSize: readonly [number, number];
  readonly backingSize: readonly [number, number];
  readonly selectionIds: readonly string[];
  readonly activeAnimationCount: number;
  /** Public aggregate renderer facts available when the surface publishes them. */
  readonly activeGestureCount?: number;
  readonly renderCommandCount?: number;
  readonly visiblePrimitiveCount?: number;
}

export interface PatchMapInteractionOwnershipProbe {
  readonly rootBindingCount: number;
  readonly rootListenerCount?: number;
  readonly entityCallbackCount: number;
}

export interface PatchMapSurfaceReconcileResult {
  readonly status: 'committed' | 'refused';
  readonly operationCount: number;
  readonly denseChanged: boolean;
  readonly diagnostics: readonly PatchMapReconcileDiagnostic[];
  readonly timings?: PatchMapReconcileTimings;
}

export interface PatchMapSurfaceReconcileOptions {
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
  /** Engine-owned dirty flat roots eligible for guarded incremental parsing. */
  readonly incrementalRootIds?: readonly string[];
  /** Engine-owned top-level structural sharing eligible for guarded parsing. */
  readonly structuralSharing?: boolean;
  /** Validated numeric height-only bar mutations eligible for direct projection. */
  readonly directBarHeightUpdates?: readonly PatchMapDirectBarHeightUpdate[];
  /** Validated component text replacements eligible for direct projection. */
  readonly directTextUpdates?: readonly PatchMapDirectTextUpdate[];
  /** Validated flat-root absolute angles eligible for affine-delta projection. */
  readonly directElementAngleUpdates?: readonly PatchMapDirectElementAngleUpdate[];
}

export interface PatchMapEngineSceneImageAttemptProbe extends Omit<
  PatchMapSceneImageAttemptProbe,
  'authoredSource' | 'sourceKind' | 'resourceState'
> {
  readonly authoredSource?: PatchMapAssetSource;
  readonly authoredSourceKind?: PatchMapImageSourceKind;
  readonly state: PatchMapSceneImageAttemptProbe['resourceState'];
}

export interface PatchMapEngineSceneImageRecord extends Omit<
  PatchMapSceneImageProductProbe,
  'authoredSource' | 'attempts'
> {
  readonly authoredSource?: PatchMapAssetSource;
  readonly authoredSourceKind?: PatchMapImageSourceKind;
  readonly opacity: number;
  readonly zIndex: number;
  readonly hitBounds: readonly [number, number, number, number] | null;
  readonly initial: PatchMapEngineSceneImageAttemptProbe | null;
  readonly attempts: readonly PatchMapEngineSceneImageAttemptProbe[];
}

export type PatchMapEngineSceneImagesProbe = Readonly<
  Omit<PatchMapSceneImagesProbe, 'images'> & {
    readonly images: Readonly<Record<string, PatchMapEngineSceneImageRecord>>;
  }
>;

export interface PatchMapSurfaceComponentVisualProbe {
  readonly target: PatchMapComponentVisualTarget;
  readonly semanticOwnerId: string;
  readonly entityId: string;
  readonly logicalIdentity: string;
  readonly componentType: string;
  readonly renderRole: PatchMapComponentVisualProductProbe['renderRole'];
  readonly entityKind: string;
  readonly geometry: PatchMapComponentVisualGeometryProbe;
  readonly publication: PatchMapComponentVisualProductProbe['publication'];
  readonly sceneImage: PatchMapEngineSceneImageRecord | null;
  readonly rendererPaint: PatchMapEntityPaintProbe | null;
  readonly renderLanes: PatchMapRenderLaneSnapshot | null;
}

/** Renderer capabilities consumed by the Pixi-backed Engine surface. */
export interface PatchMapSurfaceRendererPort {
  bindAccessibilityActivation?(
    listener: (
      targetId: string,
      input: PatchMapAccessibilityActivationInput,
    ) => void,
  ): () => void;
  setAccessibilityTree?(
    nodes: readonly PatchMapAccessibilityRenderNode[],
  ): PatchMapAccessibilitySurfaceProbe;
  focusAccessibilityTarget?(targetId: string): boolean;
  accessibilitySurfaceProbe?(): PatchMapAccessibilitySurfaceProbe;
  rendererLossProbe?(): PatchMapRendererLossProbe;
  forceRendererLoss?(): boolean;
}

/** Surface allocation, publication, resize, and teardown lifecycle. */
export interface PatchMapSurfaceLifecyclePort {
  readonly canvasCount: number;
  readonly destroyed: boolean;
  canvasElement?(): HTMLCanvasElement | null;
  captureBase64?(): Promise<string>;
  prepare?(): Promise<PatchMapSurfacePrepareResult>;
  load(input: unknown): void;
  loadAsync?(input: unknown, assertCurrent?: () => void): Promise<void>;
  publishFrame(timeMs: number): void;
  suspendPresentation?(
    timeMs: number,
  ): PatchMapPresentationLifecycleResult;
  resumePresentation?(
    timeMs: number,
  ): PatchMapPresentationLifecycleResult;
  resize(width: number, height: number, pixelRatio: number): boolean;
  destroy(): Promise<boolean>;
}

/** Atomic mutation and renderer-only presentation capabilities. */
export interface PatchMapSurfaceMutationPresentationPort {
  /** Atomically reconcile a detached PatchMap candidate. */
  reconcile(
    input: unknown,
    options?: PatchMapSurfaceReconcileOptions,
  ): PatchMapSurfaceReconcileResult;
  select(ids: readonly string[]): void;
  setReducedMotion?(enabled: boolean): boolean;
  setSelectionOverlayPolicy?(input: PatchMapSelectionOverlayPolicyInput): boolean;
  setSelectionMarquee?(input: PatchMapSelectionMarqueeInput | null): boolean;
  setPresentationPolicy?(
    input: PatchMapPresentationPolicyInput,
  ): PatchMapPresentationPolicyProductProbe;
  clearPresentationPolicy?(): PatchMapPresentationPolicyProductProbe;
  presentationPolicyProbe?(): PatchMapPresentationPolicyProductProbe;
  setPresentationLayer?(
    input: PatchMapLogicalPresentationLayerInput,
  ): PatchMapPresentationLayerChange;
  clearPresentationLayer?(key: string): PatchMapPresentationLayerChange;
  presentationLayersSnapshot?(): PatchMapPresentationLayerSnapshot;
  refreshSemanticTargets?(
    targets: readonly PatchMapSemanticTarget[],
    options?: Readonly<{ readonly strict?: boolean }>,
  ): PatchMapSemanticRefreshResult;
  updateInstanceBarHeights?(
    request: PatchMapInstanceBarHeightBatchRequest,
  ): PatchMapInstanceBarHeightBatchResult;
}

/** Root input, viewport, selection interaction, and accessibility bridge. */
export interface PatchMapSurfaceViewportInputPort {
  setView(view: PatchMapSurfaceView): void;
  setViewportGesturePolicies?(policies: readonly PatchMapViewportPolicy[]): void;
  setViewportZoomLimits?(limits: readonly [number, number]): void;
  bindViewportInput?(
    listener: (input: PatchMapSurfaceViewportInput) => void,
  ): () => void;
  bindPointerInput?(
    listener: (input: PatchMapSurfacePointerInput) => void,
  ): () => void;
  bindContextMenuInput?(
    listener: (input: PatchMapSurfaceContextMenuInput) => boolean,
  ): () => void;
  bindAccessibilityActivation?(
    listener: (
      targetId: string,
      input: PatchMapAccessibilityActivationInput,
    ) => void,
  ): () => void;
  cancelViewportGestures?(): void;
  setAccessibilityTree?(
    nodes: readonly PatchMapAccessibilityRenderNode[],
  ): PatchMapAccessibilitySurfaceProbe | undefined;
  focusAccessibilityTarget?(targetId: string): boolean;
  accessibilitySurfaceProbe?(): PatchMapAccessibilitySurfaceProbe | undefined;
  hitTestScreen(point: PatchMapPoint): string | null;
  screenToWorld(point: PatchMapPoint): PatchMapPoint;
}

/** View-independent and screen-space geometry query capabilities. */
export interface PatchMapSurfaceGeometryQueryPort {
  /**
   * View-independent geometry for fit/focus. Implementations may retain this
   * across pan, zoom, and resize while invalidating screen-space geometry.
   */
  worldGeometrySnapshot?(): PatchMapViewportGeometry;
  geometrySnapshot?(): PatchMapSurfaceGeometrySnapshot;
  selectionGeometries?(
    selectionIds: readonly string[],
  ): readonly PatchMapSurfaceEntityGeometry[];
  previewIncrementalRoots?(
    input: unknown,
    dirtyRootIds: readonly string[],
  ): PatchMapTransientProjectionResult | null;
  clearIncrementalPreview?(): PatchMapTransientProjectionResult;
  queryRegionGeometry?(
    bounds: PatchMapScreenRegionBounds,
  ): PatchMapSurfaceRegionGeometryCandidates;
  relationHitTestScreen?(
    point: PatchMapPoint,
    options?: PatchMapRelationHitOptions,
  ): PatchMapRelationHit | null;
}

/** Asset settlement and detached product observation capabilities. */
export interface PatchMapSurfaceProductObservationPort {
  sceneImageProbe?(): PatchMapEngineSceneImagesProbe;
  retrySceneImage?(entityId: string): PatchMapSceneImageRetryResult;
  componentVisualProbe?(
    target: PatchMapComponentVisualTarget,
  ): PatchMapSurfaceComponentVisualProbe | null;
  barPresentationProbe?(
    target: PatchMapComponentVisualTarget,
  ): PatchMapBarPresentationProductProbe | null;
  paintOrderProbe?(): PatchMapPaintOrderProductProbe;
  textProbe?(target: PatchMapTextTarget): PatchMapTextProductProbe | null;
  settleSceneImages?(): Promise<void>;
  settleSceneImageBindings?(bindingKeys: readonly string[]): Promise<void>;
}

/** Allocation-free runtime and renderer diagnostics. */
export interface PatchMapSurfaceDiagnosticsPort {
  /** Optional allocation-free frame facts for current aggregate surfaces. */
  frameLoopActiveAnimations?(): number;
  frameLoopWorkloadSize?(): number;
  viewportGestureActive?(): boolean;
  debugSnapshot(): PatchMapSurfaceDebug;
  interactionOwnershipProbe?(): PatchMapInteractionOwnershipProbe;
  rendererPublicSurfaceProbe?(): PatchMapRendererPublicSurfaceProbe;
  rendererLossProbe?(): PatchMapRendererLossProbe;
  forceRendererLoss?(): boolean;
}

/**
 * Compatibility composite for injected surfaces and the single Pixi adapter.
 * Consumers should depend on the narrow capability port they actually use.
 */
export interface PatchMapEngineSurface
  extends PatchMapSurfaceLifecyclePort,
    PatchMapSurfaceMutationPresentationPort,
    PatchMapSurfaceViewportInputPort,
    PatchMapSurfaceGeometryQueryPort,
    PatchMapSurfaceProductObservationPort,
    PatchMapSurfaceDiagnosticsPort {}

export interface PatchMapSurfacePrepareResult {
  readonly storeSyncMs: number;
  readonly gpuPrepareMs: number;
}

export type PatchMapEngineSurfaceFactory = (
  options: PatchMapSurfaceOptions,
) => Promise<PatchMapEngineSurface>;
