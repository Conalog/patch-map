import type {
  AdvanceResult,
  CommitResult,
  CorePoint,
  CoreSceneOptions,
  CoreTarget,
  CoreView,
  EntityPatch,
  EntityRef,
  EntitySnapshot,
  FrameReport,
  HitTestOptions,
  LoadResult,
  QueryFilter,
  SceneSnapshot,
  SelectionSnapshot,
  SlotRange,
  TransactionBatch,
} from '../core-v1/contracts';
import type {
  CoreRenderer,
  RendererFlushResult,
  RenderStoreView,
} from '../core-v1/renderer/types';
import type {
  ParseDiagnostic,
  ParseIdentityIndex,
  ParsePatchMapOptions,
  ParsePatchMapResult,
  CoreV2BarProjection,
  CoreV2ComponentVisualProjection,
  CoreV2ComponentRenderRole,
  CoreV2EntityProjection,
  CoreV2ProjectionIndex,
  CoreV2TextProjection,
} from './contracts';
import {
  CoreV2PresentationController,
  type CoreV2PresentationFrame,
  type CoreV2PresentationSnapshot,
} from './presentation';
import {
  CORE_V2_PRESENTATION_POLICY_REVISION,
  type CoreV2PresentationFillOverride,
  type CoreV2PresentationPolicyInput,
  type CoreV2PresentationPolicyProductProbe,
  type CoreV2ResolvedPresentationPolicy,
} from './presentation-policy';
import { CoreV2PresentationProjectionStore } from './presentation-projection';
import {
  createCoreV2PaintOrderProductProbe,
  type CoreV2PaintOrderProductProbe,
} from './paint-order-product';
import {
  inheritPatchMapV010DirectParseIndexes,
  type CoreV2DirectTextParseTargetIndex,
  parsePatchMapV010,
  parsePatchMapV010Async,
  parsePatchMapV010DirectTextBatch,
  parsePatchMapV010SelectedRoots,
  projectCoreV2IntrinsicImageAffine,
} from './parser';
import {
  inheritPatchMapV010IncrementalParserCaches,
  parsePatchMapV010DirectElementAngleBatch,
  parsePatchMapV010IncrementalFlat,
  parsePatchMapV010IncrementalStructure,
  patchMapV010StructuralChangedEntityIds,
  primePatchMapV010IncrementalFlat,
  type CoreV2DirectElementAngleParseUpdate,
} from './incremental-parser';
import {
  isOwnedCoreV2Dataset,
  ownedCoreV2ExactPatchIndices,
  ownedCoreV2PreviewPatchIndices,
} from './semantic/dataset';
import {
  inheritRendererDegradationDiagnostics,
  inheritRendererDegradationDiagnosticsIncremental,
  withRendererDegradationDiagnostics,
} from './renderers/degradation';
import {
  CoreV2AdaptiveFrameBudget,
  CoreV2FrameLoop,
  InvalidationScheduler,
  type CoreV2FrameLoopOptions,
  type FrameSchedulerDebug,
} from './scheduler';
import {
  planCoreV2ParsedSceneReconcile,
  planCoreV2ParsedSceneReconcileIncremental,
  planCoreV2ParsedSceneReconcileStructuralWindow,
  primeCoreV2ParsedSceneReconcileIncremental,
  type CoreV2DenseReconcilePlan,
  type CoreV2ReconcileOptions as CoreV2DenseReconcileOptions,
} from './semantic/reconcile';
import {
  PixiCoreV2Renderer,
  type PixiCoreV2InitializationMetrics,
  type PixiCoreV2RendererOptions,
} from './renderers/pixi-renderer';
import type {
  CoreV2EntityPaintProbe,
  CoreV2InteractionOverlayPolicy,
  CoreV2RenderLaneSnapshot,
  CoreV2TextAttachedSignatures,
  CoreV2TextRendererKind,
  CoreV2TextRendererProbe,
  CoreV2TextSemanticSignatures,
  CoreV2WorldOrientation,
  PixiCoreV2RendererDebug,
  RootPointerInput,
} from './renderers/types';
import {
  CoreV2EntityHitIndex,
  coreV2EntityContainsWorldPoint,
  coreV2EntityWorldAabb,
  hitTestCoreV2EntityIndex,
} from './semantic/entity-hit-index';
import type { CoreV2SemanticTarget } from './semantic/probe';
import {
  CoreV2SceneImageController,
  type CoreV2SceneImageIntrinsicSize,
  type CoreV2SceneImageProductProbe,
  type CoreV2SceneImageRetryResult,
  type CoreV2SceneImagesProbe,
} from './scene-images';
import {
  coreV2AffineCenter,
  coreV2AffineBasis,
  freezeCoreV2Bounds,
  freezeCoreV2Affine,
  projectCoreV2SignedRect,
  type CoreV2BoundsTuple,
} from './semantic/geometry';
import {
  compactCoreV2StableRecord,
  patchCoreV2StableRecord,
  rollbackCoreV2StableRecord,
  type CoreV2StableRecordStrategy,
} from './semantic/stable-record-overlay';
import {
  boundsFor,
  fitView,
  panView,
  zoomViewAt,
} from './view';
import {
  CORE_V2_DEFAULT_VIEWPORT_POLICIES,
  CORE_V2_VIEWPORT_POLICIES,
  type CoreV2ViewportPolicy,
} from './viewport';
import { CoreV2Scene } from './scene';

export interface CoreV2Options extends PixiCoreV2RendererOptions, CoreSceneOptions {
  readonly parse?: ParsePatchMapOptions;
  /** Schedule one invalidation frame after mutations. Defaults to true. */
  readonly autoRender?: boolean;
  /** Defer semantic selection to an Engine-owned click authority. */
  readonly rootSelectionMode?: 'immediate' | 'deferred';
  /**
   * Engine-owned surface optimization. Public Core/parser callers retain
   * deeply frozen plain projection records.
   */
  readonly internalStableRecordOverlays?: boolean;
}

export type CoreV2RootViewportChangeSource =
  | 'pointer'
  | 'middle-pointer'
  | 'wheel';

export interface CoreV2RootViewportChange {
  readonly source: CoreV2RootViewportChangeSource;
  readonly view: CoreView;
}

export type CoreV2RootPointerInput = RootPointerInput;

export interface CoreV2SemanticRefreshResult {
  readonly changed: boolean;
  readonly recomputedTargets: readonly string[];
  readonly missingTargets: readonly string[];
  readonly dirtyRanges: readonly SlotRange[];
  readonly dataDiffCount: 0;
}

export interface CoreV2SemanticRefreshOptions {
  readonly strict?: boolean;
}

export interface CoreV2TransientProjectionResult {
  readonly changed: boolean;
  readonly entityIds: readonly string[];
  readonly dirtyRanges: readonly SlotRange[];
}

export interface CoreV2SelectionOverlayPolicyInput {
  readonly visibleIds: readonly string[] | null;
  readonly transformableIds: readonly string[] | null;
  readonly resizableIds: readonly string[] | null;
  readonly hidden: boolean;
  readonly handleCssPx: number;
  readonly strokeCssPx: number;
}

export interface CoreV2LoadResult {
  readonly parse: ParsePatchMapResult;
  readonly store: LoadResult;
  readonly normalizeMs: number;
  readonly storeLoadMs: number;
}

interface CoreV2CooperativeLoadHooks {
  /**
   * Called after every cooperative boundary and immediately before the
   * authoritative scene swap. A superseded Engine load throws here while the
   * currently published Core state is still untouched.
   */
  readonly assertCurrent?: () => void;
}

export interface CoreV2PrepareResult {
  readonly storeSyncMs: number;
  readonly gpuPrepareMs: number;
  readonly frame: FrameReport;
}

export interface CoreV2WorldTransform extends CoreV2WorldOrientation {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface CoreV2ReconcileOptions extends CoreV2DenseReconcileOptions {
  /** Parser/color options for the candidate input. Defaults to the Core options. */
  readonly parse?: ParsePatchMapOptions;
  /**
   * Animate changed bar destinations. Engine callers disable this for
   * ancestor/layout transactions so dependent geometry publishes atomically.
   * Direct Core callers retain the animated default.
   */
  readonly animateBarChanges?: boolean;
  /** Limit animation to direct owner-qualified bar mutations. */
  readonly animatedBarTargets?: readonly CoreV2ComponentVisualTarget[];
  /** Permit authoritative component order changes for these semantic item owners. */
  readonly allowedComponentOrderOwners?: readonly string[];
  /** Permit explicit hierarchy operations to reorder these semantic element subtrees. */
  readonly allowedElementOrderIds?: readonly string[];
  /**
   * Engine-owned flat top-level roots changed by one already-staged immutable
   * transaction. Unsupported shapes fall back to the canonical full parser.
   */
  readonly incrementalRootIds?: readonly string[];
  /**
   * The Engine has staged an owned top-level structural edit whose unchanged
   * roots retain identity. The guarded parser may reuse those roots; any
   * hierarchy, relation, diagnostic, or ownership ambiguity falls back to the
   * canonical full parser.
   */
  readonly structuralSharing?: boolean;
  /**
   * Engine-validated numeric height-only bar mutations. This is an internal
   * parse acceleration hint; unsupported ownership or geometry falls back to
   * the canonical parser before any dense state is published.
   */
  readonly directBarHeightUpdates?: readonly CoreV2DirectBarHeightUpdate[];
  /**
   * Engine-validated component text replacements. The guarded parser updates
   * only those text entities and falls back whenever exact diagnostics or
   * identity cannot be preserved.
   */
  readonly directTextUpdates?: readonly CoreV2DirectTextUpdate[];
  /**
   * Engine-validated absolute angles on flat top-level roots. The guarded
   * projection path applies one affine delta to already canonical component
   * geometry and falls back before publication on any ambiguity.
   */
  readonly directElementAngleUpdates?: readonly CoreV2DirectElementAngleUpdate[];
}

export interface CoreV2DirectBarHeightUpdate extends CoreV2ComponentVisualTarget {
  readonly height: number;
}

export interface CoreV2DirectTextUpdate extends CoreV2ComponentVisualTarget {
  readonly text: string;
}

export type CoreV2DirectElementAngleUpdate =
  CoreV2DirectElementAngleParseUpdate;

export interface CoreV2ReconcileTimings {
  readonly parseMs: number;
  readonly planMs: number;
  readonly commitMs: number;
  readonly totalMs: number;
}

export interface CoreV2ReconcileFacts {
  /** The parser-visible PATCH MAP authority changed, including retained-only identity data. */
  readonly semanticChanged: boolean;
  /** At least one dense entity, visibility, or view operation was planned. */
  readonly denseChanged: boolean;
  readonly structuralChanged: boolean;
  readonly structuralReplacement: boolean;
  /** The current aggregate renderer consumes structural changed ranges without a full rebuild. */
  readonly fullRebuild: false;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly entityCountBefore: number;
  readonly entityCountAfter: number;
  readonly selectionCountBefore: number;
  readonly selectionCountAfter: number;
}

interface CoreV2ReconcileResultBase {
  readonly parse: ParsePatchMapResult;
  readonly plan: CoreV2DenseReconcilePlan;
  readonly timings: CoreV2ReconcileTimings;
  readonly facts: CoreV2ReconcileFacts;
}

export type CoreV2ReconcileResult =
  | Readonly<CoreV2ReconcileResultBase & {
      readonly status: 'committed';
      readonly commit: CommitResult;
    }>
  | Readonly<CoreV2ReconcileResultBase & {
      readonly status: 'refused';
      readonly commit: null;
    }>;

export interface CoreV2RuntimeDebug {
  readonly destroyed: boolean;
  readonly suspended: boolean;
  readonly entityCount: number;
  readonly activeAnimations: number;
  readonly activeGestureCount: number;
  readonly selectionCount: number;
  readonly diagnostics: number;
  readonly renderer: PixiCoreV2RendererDebug;
  readonly scheduler: FrameSchedulerDebug;
}

export interface CoreV2PresentationLifecycleResult {
  readonly state: 'suspended' | 'running';
  readonly timeMs: number;
  readonly settledCount: number;
  readonly activeAnimationCount: number;
}

export interface CoreV2ComponentVisualTarget {
  readonly ownerId: string;
  readonly componentId: string;
}

export interface CoreV2ComponentVisualGeometryProbe {
  readonly localBounds: CoreV2BoundsTuple;
  readonly worldBounds: CoreV2BoundsTuple;
  readonly visibleBounds: CoreV2BoundsTuple | null;
  readonly visible: boolean;
  readonly interactive: boolean;
}

/**
 * O(1), Pixi-object-free component observation assembled from the parser,
 * dense store, scene-image controller, and fixed renderer probe indexes.
 */
export interface CoreV2ComponentVisualProductProbe {
  readonly target: CoreV2ComponentVisualTarget;
  /** Semantic owner in the detached PATCH MAP graph (differs for expanded grids). */
  readonly semanticOwnerId: string;
  readonly entityId: string;
  readonly logicalIdentity: string;
  readonly componentType: string;
  readonly renderRole: CoreV2ComponentRenderRole;
  readonly entityKind: string;
  readonly geometry: CoreV2ComponentVisualGeometryProbe;
  readonly publication: Readonly<{
    /** Renderer/image facts are withheld until one successful aggregate flush. */
    readonly rendererFacts: 'current' | 'pending';
  }>;
  readonly image: CoreV2SceneImageProductProbe | null;
  readonly rendererPaint: CoreV2EntityPaintProbe | null;
  readonly renderLanes: CoreV2RenderLaneSnapshot | null;
}

export interface CoreV2BarPresentationProductProbe {
  readonly target: CoreV2ComponentVisualTarget;
  readonly entityId: string;
  readonly policy: Readonly<{
    readonly enabled: boolean;
    readonly durationMs: number;
  }>;
  readonly semanticHeight: number;
  readonly presentationHeight: number;
  readonly active: boolean;
  readonly startHeight: number;
  readonly destinationHeight: number;
  readonly startTimeMs: number | null;
  readonly controller: CoreV2PresentationSnapshot;
  readonly ghostPublicationCount: number;
}

export type CoreV2TextTarget =
  | Readonly<{ readonly kind: 'element'; readonly id: string }>
  | Readonly<{
      readonly kind: 'component';
      readonly ownerId: string;
      readonly id: string;
    }>;

export interface CoreV2TextGeometryProbe {
  readonly localBounds: CoreV2BoundsTuple;
  readonly ownerLocalBounds: CoreV2BoundsTuple;
  readonly worldBounds: CoreV2BoundsTuple;
  /** Same affine geometry authority consumed by transformed hit testing. */
  readonly hitBounds: CoreV2BoundsTuple;
  readonly visibleBounds: CoreV2BoundsTuple | null;
}

export interface CoreV2TextStateProbe {
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly zIndex: number;
  readonly opacity: number;
}

export interface CoreV2TextTransformProbe {
  readonly affine: CoreV2EntityProjection['affine'];
  readonly worldBasis: CoreV2EntityProjection['worldBasis'];
  readonly visibleCenter: CoreV2EntityProjection['visibleCenter'];
  readonly rotationDegrees: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly contentOrientation: CoreV2EntityProjection['contentOrientation'];
}

export type CoreV2TextProductPublicationStatus = 'absent' | 'pending' | 'current';

/** Pixi-object-free renderer facts correlated against the current text sidecar. */
export interface CoreV2TextRendererProductProbe {
  readonly semanticRoute: CoreV2TextProjection['rendererRoute'];
  readonly route: CoreV2TextRendererProbe['route'] | null;
  readonly rendererKind: CoreV2TextRendererKind;
  readonly routeReason: CoreV2TextRendererProbe['routeReason'];
  readonly objectCount: 0 | 1;
  readonly semanticSignatures: CoreV2TextSemanticSignatures;
  readonly attachedSignatures: CoreV2TextAttachedSignatures | null;
  readonly lastRenderedSignatures: CoreV2TextAttachedSignatures | null;
  readonly lastRenderedFrame: number | null;
  readonly staleGlyphCount: number;
}

/**
 * Constant-time text observation assembled from immutable parser projections,
 * the dense ID index, and the renderer's detached entity probe index.
 */
export interface CoreV2TextProductProbe {
  readonly target: CoreV2TextTarget;
  /** Source item/grid owner; differs from an expanded grid instance target. */
  readonly semanticOwnerId: string;
  readonly entityId: string;
  readonly semantic: CoreV2TextProjection;
  readonly geometry: CoreV2TextGeometryProbe;
  readonly state: CoreV2TextStateProbe;
  readonly transform: CoreV2TextTransformProbe;
  readonly renderer: CoreV2TextRendererProductProbe;
  readonly rendererPaint: CoreV2EntityPaintProbe | null;
  readonly renderLanes: CoreV2RenderLaneSnapshot | null;
  readonly publication: Readonly<{
    readonly status: CoreV2TextProductPublicationStatus;
    readonly sceneRevision: number;
    readonly renderedSceneRevision: number | null;
    readonly rendererFrame: number | null;
  }>;
}

interface IndexedComponentTarget {
  readonly entityId: string;
  readonly entityIndex: number;
  readonly semanticOwnerId: string;
  /**
   * Direct component batches only accept top-level item owners. Retaining
   * their immutable source slots avoids rebuilding two 5,000-entry lookup
   * maps on every all-bar animation command.
   */
  readonly rootIndex: number | null;
  readonly componentIndex: number | null;
  readonly componentPath: string | null;
}

interface IndexedTextTarget {
  readonly entityId: string;
  readonly semanticOwnerId: string;
}

interface CoreV2LogicalPresentationPolicy {
  readonly revision: number;
  readonly highlightIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenLayerIds: readonly string[];
  readonly fillOverrides: readonly CoreV2PresentationFillOverride[];
}

export interface AnimateBarsOptions {
  readonly seed?: number;
  readonly fraction?: number;
  readonly durationMs?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
  /**
   * Absolute authored percentage range, resolved against each bar's own
   * parser-owned percentage reference. Cannot be mixed with scale options.
   */
  readonly minPercent?: number;
  readonly maxPercent?: number;
}

interface PanState {
  readonly pointerId: number;
  readonly source: Extract<CoreV2RootViewportChangeSource, 'pointer' | 'middle-pointer'>;
  x: number;
  y: number;
}

interface CoreV2TransientIncrementalParse {
  readonly base: ParsePatchMapResult;
  readonly optionsKey: string;
  readonly dirtyRootIds: readonly string[];
  readonly dirtyIndices: readonly number[];
  readonly dirtyRoots: readonly object[];
  readonly selected: ParsePatchMapResult;
}

const ANIMATED_BAR_HIT_PRIME_THRESHOLD = 1_024;

export class CoreV2 {
  public readonly renderer: PixiCoreV2Renderer;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics;

  private scene: CoreV2Scene;
  private readonly sceneOptions: CoreSceneOptions;
  private readonly scheduler: InvalidationScheduler;
  private readonly adaptiveFrameBudget = new CoreV2AdaptiveFrameBudget();
  private externalFrameLoop: CoreV2FrameLoop | null = null;
  private automaticAnimationFramesActive = false;
  private readonly sceneImages: CoreV2SceneImageController;
  private readonly presentationProjection = new CoreV2PresentationProjectionStore();
  private readonly parseOptions: ParsePatchMapOptions;
  private readonly autoRender: boolean;
  private readonly rootSelectionMode: 'immediate' | 'deferred';
  private readonly stableRecordStrategy: CoreV2StableRecordStrategy;
  private readonly unbindInteractions: () => void;
  private logicalPresentationPolicy: CoreV2LogicalPresentationPolicy | null = null;
  private presentationPolicyRevision = 0;
  private parseResultValue: ParsePatchMapResult | null = null;
  private projectionValue: CoreV2ProjectionIndex | null = null;
  private ownedInputDataset: readonly unknown[] | null = null;
  private ownedParseOptionsKey: string | null = null;
  private transientIncrementalParse: CoreV2TransientIncrementalParse | null = null;
  private presentationController: CoreV2PresentationController;
  private presentationGeneration = 1;
  private sceneImageReconcileSuspended = false;
  private currentView: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private worldFlipX = false;
  private worldFlipY = false;
  private animationClockMs = 0;
  private lastFrameReport: FrameReport | null = null;
  private suspended = false;
  private pan: PanState | null = null;
  private viewportPolicies = new Set<CoreV2ViewportPolicy>(
    CORE_V2_DEFAULT_VIEWPORT_POLICIES,
  );
  private viewportZoomLimits: readonly [number, number] = Object.freeze([
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  ]);
  private readonly rootViewportListeners = new Set<
    (change: CoreV2RootViewportChange) => void
  >();
  private readonly rootPointerListeners = new Set<
    (input: CoreV2RootPointerInput) => void
  >();
  private pointerSequence = 0;
  private entityCountValue = 0;
  private destroyedValue = false;
  private entityHitIndexValue: CoreV2EntityHitIndex | null = null;
  private animatedBarHitIndexValue: CoreV2EntityHitIndex | null = null;
  private presentationHitIndexActive = false;
  private denseHitGeometryCompatible = true;
  private readonly staleHitProjectionIds = new Set<string>();
  private readonly spatialHitAnimationEnds = new Map<string, number>();
  private readonly pendingIntrinsicImageSizes = new Map<string, CoreV2SceneImageIntrinsicSize>();
  private componentTargets = new Map<string, IndexedComponentTarget | null>();
  private componentRendererFactsPublished = false;
  private textTargets = new Map<string, IndexedTextTarget | null>();
  private textRendererFactsPublished = false;
  private renderedSceneRevision: number | null = null;
  private presentationGhostPublicationCount = 0;
  private presentationEntityEpoch = 0;
  private presentationValidatedEntityEpoch = 0;
  private readonly invalidPresentationEntityIds = new Set<string>();
  private loadSequence = 0;
  private reducedMotionValue = false;

  private constructor(renderer: PixiCoreV2Renderer, options: CoreV2Options) {
    this.renderer = renderer;
    this.initializationMetrics = renderer.initializationMetrics;
    this.parseOptions = options.parse ?? {};
    this.autoRender = options.autoRender ?? true;
    this.rootSelectionMode = options.rootSelectionMode ?? 'immediate';
    this.stableRecordStrategy = options.internalStableRecordOverlays === true
      ? 'internal-overlay'
      : 'frozen-copy';
    this.sceneOptions = Object.freeze({
      ...(options.initialCapacity === undefined ? {} : { initialCapacity: options.initialCapacity }),
      ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
      ...(options.eventLimit === undefined ? {} : { eventLimit: options.eventLimit }),
    });
    this.presentationController = new CoreV2PresentationController({
      lifecycleGeneration: this.presentationGeneration,
    });
    this.scene = this.createScene();
    this.scheduler = new InvalidationScheduler((timeMs) => this.renderScheduledFrame(timeMs));
    this.sceneImages = new CoreV2SceneImageController(renderer, {
      onInvalidate: (reason) => this.invalidate(reason),
      onIntrinsicSize: (resolution) => this.queueIntrinsicImageSize(resolution),
    });
    this.unbindInteractions = renderer.bindRootInteractions({
      pointer: (input) => {
        this.publishRootPointerInput(input);
        if (input.type === 'down') {
          this.onPointerDown(input.screenX, input.screenY, input.pointerId, input.button);
        } else if (input.type === 'move') {
          this.onPointerMove(input.screenX, input.screenY, input.pointerId);
        } else {
          this.onPointerUp(input.pointerId);
        }
      },
      wheel: (x, y, deltaY) => {
        if (this.viewportPolicies.has('wheel')) {
          const before = this.currentView;
          const nextScale = Math.min(
            this.viewportZoomLimits[1],
            Math.max(
              this.viewportZoomLimits[0],
              before.scale * Math.exp(-deltaY * 0.001),
            ),
          );
          this.zoomAt({ x, y }, nextScale / before.scale);
          this.publishRootViewportChange('wheel', before);
        }
      },
      contextMenu: (x, y) => this.hitTestScreen(
        { x, y },
        { interactiveOnly: true },
      ) !== null,
    });
  }

  public static async create(options: CoreV2Options = {}): Promise<CoreV2> {
    const renderer = await PixiCoreV2Renderer.create(options);
    try {
      return new CoreV2(renderer, options);
    } catch (error) {
      renderer.destroy();
      await renderer.whenDestroyed();
      throw error;
    }
  }

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  public get entityCount(): number {
    return this.entityCountValue;
  }

  public get activeAnimations(): number {
    return this.destroyedValue
      ? 0
      : this.scene.activeAnimations + this.presentationController.activeCount;
  }

  /** Source-level workload size used by the shared adaptive frame policy. */
  public get frameWorkloadSize(): number {
    return this.parseResultValue?.identity.counts.sourceElements ?? 0;
  }

  /** Current monotonic presentation clock used by a package-owned frame loop. */
  public get frameTimeMs(): number {
    return this.animationClockMs;
  }

  /** Root-owned gesture state used by automatic and host-driven frame loops. */
  public get viewportGestureActive(): boolean {
    return !this.destroyedValue && this.pan !== null;
  }

  public get presentationRevision(): number {
    return this.presentationController.presentationRevision;
  }

  public get reducedMotion(): boolean {
    return this.reducedMotionValue;
  }

  public get view(): CoreView {
    return this.currentView;
  }

  public get diagnostics(): readonly ParseDiagnostic[] {
    return this.parseResultValue?.diagnostics ?? [];
  }

  public get identity(): ParseIdentityIndex | null {
    return this.parseResultValue?.identity ?? null;
  }

  public get projection(): CoreV2ProjectionIndex | null {
    return this.projectionValue;
  }

  /** Renderer-visible projection. Semantic consumers should use `projection`. */
  public get visibleProjection(): CoreV2ProjectionIndex | null {
    return this.presentationProjection.presentation;
  }

  public load(input: unknown, options: ParsePatchMapOptions = this.parseOptions): CoreV2LoadResult {
    this.assertAlive();
    this.loadSequence += 1;
    const normalizeStarted = now();
    const parse = withRendererDegradationDiagnostics(
      parsePatchMapV010(input, options),
      this.renderer.strategy,
    );
    const normalizeMs = now() - normalizeStarted;
    this.pendingIntrinsicImageSizes.clear();
    const storeStarted = now();
    const store = this.scene.load(parse.document);
    const storeLoadMs = now() - storeStarted;
    this.applyLoadedProjection(parse, store);
    this.finishLoadedProjection(parse, store);
    this.retainOwnedInputDataset(input, options);
    return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
  }

  /**
   * Cooperative first-load path for large browser scenes. Parsing, dense-store
   * construction, aggregate projection binding, and final indexing each occupy
   * a separate main-thread task while the Engine keeps the candidate private.
   */
  public async loadAsync(
    input: unknown,
    options: ParsePatchMapOptions = this.parseOptions,
    hooks: CoreV2CooperativeLoadHooks = {},
  ): Promise<CoreV2LoadResult> {
    this.assertAlive();
    const sequence = ++this.loadSequence;
    const sceneRevision = this.scene.revision;
    const assertCurrent = (): void => {
      this.assertAlive();
      if (this.loadSequence !== sequence || this.scene.revision !== sceneRevision) {
        throw new Error('CoreV2 cooperative load was superseded');
      }
      hooks.assertCurrent?.();
    };
    assertCurrent();
    const normalizeStarted = now();
    const parse = withRendererDegradationDiagnostics(
      await parsePatchMapV010Async(input, options),
      this.renderer.strategy,
    );
    const normalizeMs = now() - normalizeStarted;
    await yieldCoreV2MainTask();
    assertCurrent();

    if (sceneRevision === 0 && this.entityCountValue === 0) {
      let candidate: CoreV2Scene | null = this.createScene(parse.document.entities.length);
      try {
        const storeStarted = now();
        const store = await candidate.loadCooperatively(parse.document, assertCurrent);
        const storeLoadMs = now() - storeStarted;
        await yieldCoreV2MainTask();
        assertCurrent();

        const previous = this.scene;
        const next = candidate;
        candidate = null;
        this.pendingIntrinsicImageSizes.clear();
        this.scene = next;
        try {
          this.applyLoadedProjection(parse, store);
          this.finishLoadedProjection(parse, store);
        } catch (error) {
          this.scene = previous;
          next.destroy();
          throw error;
        }
        previous.destroy();
        this.retainOwnedInputDataset(input, options);
        return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
      } finally {
        candidate?.destroy();
      }
    }

    // The parser and caller-side Engine indexes may yield, but the scene,
    // projection, image ownership, and invalidation authorities publish as one
    // synchronous commit. No host callback can observe a half-loaded Core.
    this.pendingIntrinsicImageSizes.clear();
    const storeStarted = now();
    const store = this.scene.load(parse.document);
    const storeLoadMs = now() - storeStarted;
    this.applyLoadedProjection(parse, store);
    this.finishLoadedProjection(parse, store);
    this.retainOwnedInputDataset(input, options);
    return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
  }

  private createScene(minimumCapacity = 0): CoreV2Scene {
    return new CoreV2Scene({
      renderer: new CoreV2RendererLease(this.renderer),
      ...this.sceneOptions,
      initialCapacity: Math.max(
        this.sceneOptions.initialCapacity ?? 0,
        minimumCapacity,
        1,
      ),
    });
  }

  private applyLoadedProjection(parse: ParsePatchMapResult, store: LoadResult): void {
    this.transientIncrementalParse = null;
    this.parseResultValue = parse;
    primePatchMapV010IncrementalFlat(parse);
    primeCoreV2ParsedSceneReconcileIncremental(parse.document);
    this.projectionValue = parse.projection;
    this.denseHitGeometryCompatible = true;
    this.resetPresentationController();
    const presentation = this.presentationProjection.replace(parse.projection);
    this.entityCountValue = store.entityCount;
    this.currentView = parse.document.view ?? { x: 0, y: 0, scale: 1, rotation: 0 };
    this.presentationEntityEpoch += 1;
    this.presentationValidatedEntityEpoch = this.presentationEntityEpoch;
    this.invalidPresentationEntityIds.clear();
    this.animationClockMs = 0;
    this.automaticAnimationFramesActive = false;
    this.adaptiveFrameBudget.reset();
    this.staleHitProjectionIds.clear();
    this.renderer.setProjection(presentation, undefined, this.staleHitProjectionIds);
  }

  private finishLoadedProjection(parse: ParsePatchMapResult, store: LoadResult): void {
    this.sceneImages.reconcile(parse.projection, {
      activeEntityIds: this.activeSceneImageIds(),
    });
    this.reapplyResolvedIntrinsicSizes();
    this.componentTargets = indexComponentTargets(parse);
    this.textTargets = indexTextTargets(parse);
    this.applyPresentationPolicyToRenderer();
    this.spatialHitAnimationEnds.clear();
    this.invalidateEntityHitIndex();
    this.renderer.markChanges(store.changedRanges, 'load', { fullRebuild: true });
    this.invalidate('load');
  }

  private retainOwnedInputDataset(
    input: unknown,
    options: ParsePatchMapOptions,
  ): void {
    const optionsKey = incrementalParseOptionsKey(options);
    this.ownedInputDataset =
      isOwnedCoreV2Dataset(input) && optionsKey !== null
        ? input
        : null;
    this.ownedParseOptionsKey = this.ownedInputDataset === null
      ? null
      : optionsKey;
  }

  private matchesOwnedIncrementalInput(
    input: unknown,
    dirtyRootIds: readonly string[],
    options: ParsePatchMapOptions,
  ): boolean {
    const optionsKey = incrementalParseOptionsKey(options);
    if (
      !isOwnedCoreV2Dataset(input) ||
      this.ownedInputDataset === null ||
      optionsKey === null ||
      optionsKey !== this.ownedParseOptionsKey ||
      input.length !== this.ownedInputDataset.length
    ) {
      return false;
    }
    const dirty = new Set(dirtyRootIds);
    const exactDirtyIndices = ownedCoreV2ExactPatchIndices(
      input,
      this.ownedInputDataset,
    );
    if (exactDirtyIndices !== null) {
      for (const index of exactDirtyIndices) {
        const rootId = input[index]?.id;
        if (typeof rootId !== 'string' || !dirty.has(rootId)) return false;
      }
      return true;
    }
    for (let index = 0; index < input.length; index += 1) {
      const root = input[index];
      const rootId = root?.id;
      if (typeof rootId !== 'string') return false;
      if (!dirty.has(rootId) && root !== this.ownedInputDataset[index]) return false;
    }
    return true;
  }

  private matchesOwnedStructuralInput(
    input: unknown,
    options: ParsePatchMapOptions,
  ): input is readonly unknown[] {
    const optionsKey = incrementalParseOptionsKey(options);
    return (
      isOwnedCoreV2Dataset(input) &&
      this.ownedInputDataset !== null &&
      optionsKey !== null &&
      optionsKey === this.ownedParseOptionsKey
    );
  }

  private cachedTransientSelectedParse(
    input: unknown,
    base: ParsePatchMapResult,
    dirtyRootIds: readonly string[],
    options: ParsePatchMapOptions,
  ): ParsePatchMapResult | null {
    const cached = this.transientIncrementalParse;
    if (
      cached === null ||
      cached.base !== base ||
      !Array.isArray(input) ||
      incrementalParseOptionsKey(options) !== cached.optionsKey ||
      !sameStringArray(dirtyRootIds, cached.dirtyRootIds) ||
      cached.dirtyIndices.length !== cached.dirtyRoots.length
    ) {
      return null;
    }
    for (let index = 0; index < cached.dirtyIndices.length; index += 1) {
      const rootIndex = cached.dirtyIndices[index];
      if (
        rootIndex === undefined ||
        input[rootIndex] !== cached.dirtyRoots[index]
      ) {
        return null;
      }
    }
    return cached.selected;
  }

  /**
   * Incrementally reconcile a direct PATCH MAP v0.10 input into the current
   * dense store. Safe candidates commit exactly one batch; this method never
   * substitutes a scene load for a partial update.
   */
  public reconcile(
    input: unknown,
    options: CoreV2ReconcileOptions = {},
  ): CoreV2ReconcileResult {
    this.assertAlive();
    const currentParse = this.parseResultValue;
    if (currentParse === null) {
      throw new Error('CoreV2.reconcile requires a loaded PATCH MAP dataset');
    }

    const totalStarted = now();
    const before = reconcileFactStamp(this.scene);
    const parseStarted = now();
    const parseOptions = options.parse ?? this.parseOptions;
    const directBarParse = options.directBarHeightUpdates === undefined ||
      !this.matchesOwnedIncrementalInput(
        input,
        options.directBarHeightUpdates.map(({ ownerId }) => ownerId),
        parseOptions,
      )
      ? null
      : reconcileDirectBarHeightParse(
          input,
          currentParse,
          options.directBarHeightUpdates,
          this.componentTargets,
          this.stableRecordStrategy,
        );
    const directTextParse =
      directBarParse !== null ||
      options.directTextUpdates === undefined ||
      !this.matchesOwnedIncrementalInput(
        input,
        options.directTextUpdates.map(({ ownerId }) => ownerId),
        parseOptions,
      )
        ? null
        : parsePatchMapV010DirectTextBatch(
            input,
            currentParse,
            options.directTextUpdates,
            parseOptions,
            directTextParseTargetHints(
              options.directTextUpdates,
              this.componentTargets,
            ),
            this.stableRecordStrategy,
          );
    const directElementAngleParse =
      directBarParse !== null ||
      directTextParse !== null ||
      options.directElementAngleUpdates === undefined ||
      this.ownedInputDataset === null ||
      !this.matchesOwnedIncrementalInput(
        input,
        options.directElementAngleUpdates.map(({ id }) => id),
        parseOptions,
      )
        ? null
        : parsePatchMapV010DirectElementAngleBatch(
            input,
            this.ownedInputDataset,
            currentParse,
            options.directElementAngleUpdates,
            this.stableRecordStrategy,
          );
    const structuralParse =
      directBarParse !== null ||
      directTextParse !== null ||
      directElementAngleParse !== null ||
      options.structuralSharing !== true ||
      !this.matchesOwnedStructuralInput(input, parseOptions)
        ? null
        : parsePatchMapV010IncrementalStructure(
            input,
            this.ownedInputDataset,
            currentParse,
            parseOptions,
          );
    const incrementalInputMatches =
      directBarParse === null &&
      directTextParse === null &&
      directElementAngleParse === null &&
      structuralParse === null &&
      options.incrementalRootIds !== undefined &&
      this.matchesOwnedIncrementalInput(
        input,
        options.incrementalRootIds,
        parseOptions,
      );
    const cachedSelectedParse = !incrementalInputMatches
      ? null
      : this.cachedTransientSelectedParse(
          input,
          currentParse,
          options.incrementalRootIds ?? [],
          parseOptions,
        );
    const incrementalParse = !incrementalInputMatches
      ? null
      : parsePatchMapV010IncrementalFlat(
          input,
          currentParse,
          options.incrementalRootIds ?? [],
          parseOptions,
          cachedSelectedParse ?? undefined,
          this.stableRecordStrategy,
        );
    const parserResult =
      directBarParse ??
        directTextParse ??
        directElementAngleParse ??
        structuralParse ??
        incrementalParse ??
        parsePatchMapV010(input, parseOptions);
    const incrementalEntityIds = directBarParse !== null
      ? directBarEntityIds(
          options.directBarHeightUpdates ?? [],
          this.componentTargets,
        )
      : directTextParse !== null
        ? directTextEntityIds(options.directTextUpdates ?? [], this.textTargets)
        : directElementAngleParse !== null
          ? directElementAngleEntityIds(
              currentParse,
              options.directElementAngleUpdates ?? [],
            )
          : incrementalParse === null
            ? undefined
            : incrementalDenseEntityIds(
                parserResult,
                options.incrementalRootIds ?? [],
              );
    const hierarchyOnlyTargetMapping =
      structuralParse !== null &&
      structuralTargetMappingsReusable(currentParse, parserResult, options);
    const structuralPresentationEntityIds = structuralParse === null
      ? undefined
      : patchMapV010StructuralChangedEntityIds(parserResult) ??
        changedProjectionEntityIds(
          currentParse.projection,
          parserResult.projection,
        );
    if (
      directBarParse !== null ||
      directTextParse !== null ||
      directElementAngleParse !== null ||
      hierarchyOnlyTargetMapping
    ) {
      inheritRendererDegradationDiagnostics(currentParse, parserResult);
    } else if (
      incrementalParse !== null &&
      incrementalEntityIds !== undefined
    ) {
      inheritRendererDegradationDiagnosticsIncremental(
        currentParse,
        parserResult,
        incrementalEntityIds,
      );
    }
    const parse = withRendererDegradationDiagnostics(
      parserResult,
      this.renderer.strategy,
    );
    inheritPatchMapV010DirectParseIndexes(parserResult, parse);
    inheritPatchMapV010IncrementalParserCaches(parserResult, parse);
    const parseMs = now() - parseStarted;

    const planStarted = now();
    const reconcileOptions = denseReconcileOptions(
      options,
      currentParse,
      parse,
      this.scene.selection().refs.flatMap((ref) => {
        const entity = this.scene.get(ref);
        return entity === null ? [] : [entity.id];
      }),
    );
    const plan = (
      incrementalEntityIds === undefined
        ? null
        : planCoreV2ParsedSceneReconcileIncremental(
            currentParse.document,
            parse.document,
            incrementalEntityIds,
            reconcileOptions,
            true,
          )
    ) ?? (
      structuralParse === null
        ? null
        : planCoreV2ParsedSceneReconcileStructuralWindow(
            currentParse.document,
            parse.document,
            reconcileOptions,
          )
    ) ?? planCoreV2ParsedSceneReconcile(
      currentParse.document,
      parse.document,
      reconcileOptions,
    );
    const semanticChanged = directBarParse !== null ||
      directTextParse !== null ||
      directElementAngleParse !== null ||
      structuralParse !== null ||
      incrementalParse !== null ||
      !jsonEquivalent(currentParse, parse);
    const planMs = now() - planStarted;

    if (!plan.safeToCommit) {
      if (this.stableRecordStrategy === 'internal-overlay') {
        rollbackCoreV2ProjectionStableRecords(
          parse.projection,
          currentParse.projection,
        );
      }
      const after = reconcileFactStamp(this.scene);
      return freezeReconcileResult({
        status: 'refused',
        parse,
        plan,
        commit: null,
        timings: {
          parseMs,
          planMs,
          commitMs: 0,
          totalMs: now() - totalStarted,
        },
        facts: reconcileFacts(plan, semanticChanged, before, after),
      });
    }

    const commitStarted = now();
    this.sceneImageReconcileSuspended = true;
    let commit: CommitResult;
    try {
      commit = this.commitWithRendererDomain(
        plan.batch,
        directTextParse !== null
          ? 'text-only'
          : directBarParse !== null
            ? 'bar-only'
            : undefined,
      );
    } catch (error) {
      if (this.stableRecordStrategy === 'internal-overlay') {
        rollbackCoreV2ProjectionStableRecords(
          parse.projection,
          currentParse.projection,
        );
      }
      throw error;
    } finally {
      this.sceneImageReconcileSuspended = false;
    }
    const commitMs = now() - commitStarted;
    const presentation = this.reconcileBarPresentation(
      parse.projection,
      !this.reducedMotionValue && options.animateBarChanges !== false,
      options.animatedBarTargets,
      incrementalEntityIds ??
        (
          hierarchyOnlyTargetMapping
            ? Object.freeze([])
            : structuralPresentationEntityIds
        ),
    );
    this.parseResultValue = parse;
    this.transientIncrementalParse = null;
    this.projectionValue = parse.projection;
    this.denseHitGeometryCompatible = true;
    this.retainOwnedInputDataset(input, parseOptions);
    this.staleHitProjectionIds.clear();
    this.renderer.setProjection(
      presentation,
      commit.changedRanges,
      this.staleHitProjectionIds,
      directTextParse !== null
        ? 'text'
        : directBarParse !== null
          ? 'bar-presentation'
          : undefined,
    );
    if (
      this.presentationController.activeCount >= ANIMATED_BAR_HIT_PRIME_THRESHOLD
    ) {
      this.renderer.setAggregateCullPrecision(false);
    }
    if (
      directBarParse === null &&
      directTextParse === null &&
      directElementAngleParse === null
    ) {
      this.sceneImages.reconcile(parse.projection, {
        activeEntityIds: this.activeSceneImageIds(),
      });
      this.reapplyResolvedIntrinsicSizes();
      if (incrementalParse === null && !hierarchyOnlyTargetMapping) {
        this.componentTargets = indexComponentTargets(parse);
        this.textTargets = indexTextTargets(parse);
      }
      this.applyPresentationPolicyToRenderer();
    }
    this.spatialHitAnimationEnds.clear();
    this.invalidateEntityHitIndex();
    if (
      this.presentationController.activeCount >= ANIMATED_BAR_HIT_PRIME_THRESHOLD &&
      this.rootPointerListeners.size > 0
    ) {
      // Large animated batches must not make the first pointer event pay for
      // the presentation envelope. Non-interactive consumers retain the lean
      // update path and build no auxiliary index.
      this.animatedBarHitIndex();
    }
    if (this.presentationController.activeCount > 0) this.invalidate('presentation');
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactCoreV2ProjectionStableRecords(parse.projection);
    }
    const after = reconcileFactStamp(this.scene);
    return freezeReconcileResult({
      status: 'committed',
      parse,
      plan,
      commit,
      timings: {
        parseMs,
        planMs,
        commitMs,
        totalMs: now() - totalStarted,
      },
      facts: reconcileFacts(plan, semanticChanged, before, after),
    });
  }

  /** Build aggregate CPU/GPU resources without presenting a visible frame. */
  public async prepare(): Promise<CoreV2PrepareResult> {
    this.assertAlive();
    this.applyPendingIntrinsicImageSizes();
    this.renderer.synchronizeNextFlush();
    this.scheduler.cancelPending();
    const syncStarted = now();
    this.lastFrameReport = this.flushScene();
    const storeSyncMs = now() - syncStarted;
    const frame = this.requireFrameReport();
    const prepareStarted = now();
    await this.renderer.prepareGpu();
    const gpuPrepareMs = now() - prepareStarted;
    return Object.freeze({ storeSyncMs, gpuPrepareMs, frame });
  }

  public flush(reason = 'manual'): FrameReport {
    this.assertAlive();
    this.applyPendingIntrinsicImageSizes();
    this.scheduler.cancelPending();
    this.lastFrameReport = this.flushScene();
    if (this.lastFrameReport.rendered) void this.sceneImages.finalizeAfterRenderedFrame();
    if (this.autoRender && this.activeAnimations > 0) this.scheduler.invalidate(reason);
    return this.requireFrameReport();
  }

  /** Advance the deterministic presentation clock and publish one manual frame. */
  public publishFrame(timeMs: number): FrameReport {
    this.assertAlive();
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs must be finite');
    this.applyPendingIntrinsicImageSizes();
    this.scheduler.cancelPending();
    if (timeMs !== this.animationClockMs) {
      if (this.scene.activeAnimations > 0) {
        this.advance(timeMs);
      } else {
        // Renderer-side bar presentation is the common Engine path. Preserve
        // its aggregate dirty-range fast path without entering the dense
        // transaction animation table when that table is idle.
        this.advancePresentation(timeMs);
      }
    }
    this.animationClockMs = timeMs;
    this.adaptiveFrameBudget.reset(now());
    this.automaticAnimationFramesActive = false;
    this.lastFrameReport = this.flushScene();
    if (this.lastFrameReport.rendered) void this.sceneImages.finalizeAfterRenderedFrame();
    if (this.autoRender && this.activeAnimations > 0) this.scheduler.invalidate('presentation');
    return this.requireFrameReport();
  }

  /**
   * Reduced motion is a presentation policy, not a semantic mutation. Enabling
   * it settles current bar sidecars at their committed destinations and keeps
   * later reconciles from scheduling interpolation.
   */
  public setReducedMotion(enabled: boolean): boolean {
    this.assertAlive();
    if (typeof enabled !== 'boolean') {
      throw new TypeError('reduced motion must be a boolean');
    }
    if (this.reducedMotionValue === enabled) return false;
    this.reducedMotionValue = enabled;
    if (enabled && this.projectionValue !== null) {
      const presentation = this.reconcileBarPresentation(
        this.projectionValue,
        false,
      );
      this.renderer.setProjection(presentation);
      this.spatialHitAnimationEnds.clear();
      this.invalidateEntityHitIndex();
      this.invalidate('reduced-motion');
    }
    return true;
  }

  /**
   * Gate the manual scheduler and settle renderer-visible values at their
   * already-committed semantic destinations. The supplied time is recorded,
   * but no elapsed wall-clock delta is integrated.
   */
  public suspendPresentation(timeMs: number): CoreV2PresentationLifecycleResult {
    this.assertAlive();
    if (!Number.isFinite(timeMs) || timeMs < this.animationClockMs) {
      throw new RangeError('suspend timeMs must be finite and monotonic');
    }
    this.scheduler.cancelPending();
    this.scheduler.setContinuous(false, 'page-suspend');
    this.pan = null;
    const frame = this.applyPresentationFrame(
      this.presentationController.settle(timeMs),
    );
    this.animationClockMs = timeMs;
    this.adaptiveFrameBudget.reset(now());
    this.automaticAnimationFramesActive = false;
    this.suspended = true;
    return Object.freeze({
      state: 'suspended',
      timeMs,
      settledCount: frame.settledCount,
      activeAnimationCount: this.activeAnimations,
    });
  }

  /**
   * Resume from a deterministic time origin. Rendering remains manual and the
   * caller chooses the single coherent publication frame.
   */
  public resumePresentation(timeMs: number): CoreV2PresentationLifecycleResult {
    this.assertAlive();
    if (!Number.isFinite(timeMs) || timeMs < this.animationClockMs) {
      throw new RangeError('resume timeMs must be finite and monotonic');
    }
    const frame = this.applyPresentationFrame(
      this.presentationController.settle(timeMs),
    );
    this.animationClockMs = timeMs;
    this.adaptiveFrameBudget.reset(now());
    this.automaticAnimationFramesActive = false;
    this.suspended = false;
    return Object.freeze({
      state: 'running',
      timeMs,
      settledCount: frame.settledCount,
      activeAnimationCount: this.activeAnimations,
    });
  }

  public commit(batch: TransactionBatch): CommitResult {
    return this.commitWithRendererDomain(batch);
  }

  private commitWithRendererDomain(
    batch: TransactionBatch,
    rendererDomain?: 'bar-only' | 'text-only',
  ): CommitResult {
    this.assertAlive();
    if (!this.sceneImageReconcileSuspended) this.assertDirectImageProjectionMutationSafe(batch);
    const directImageVisibilityIds = this.sceneImageReconcileSuspended
      ? new Set<string>()
      : this.directImageVisibilityIds(batch);
    const hitImpact = this.entityHitCommitImpact(batch);
    const result = this.scene.commit(batch);
    if (
      !this.sceneImageReconcileSuspended &&
      batch.operations.some((operation) =>
        operation.type !== 'view' && operation.type !== 'selection')
    ) {
      this.ownedInputDataset = null;
      this.ownedParseOptionsKey = null;
    }
    if (directImageVisibilityIds.size > 0) {
      this.synchronizeParsedImageVisibility(directImageVisibilityIds);
    }
    const hasGeometryChange = batch.operations.some(
      (operation) => operation.type !== 'view' && operation.type !== 'selection',
    );
    if (hasGeometryChange) this.presentationEntityEpoch += 1;
    const hasSelection = batch.operations.some((operation) => operation.type === 'selection');
    const lastView = [...batch.operations].reverse().find((operation) => operation.type === 'view');
    if (lastView?.type === 'view') this.currentView = Object.freeze({ ...lastView.view });
    this.renderer.markChanges(
      hasGeometryChange ? result.changedRanges : [],
      'commit',
      rendererDomain === undefined ? {} : { domain: rendererDomain },
    );
    if (hasSelection) this.renderer.markOverlayChanges(result.changedRanges, 'selection');
    if (hitImpact.invalidate) this.invalidateEntityHitIndex();
    let projectionStalenessChanged = false;
    for (const id of hitImpact.removedIds) {
      projectionStalenessChanged = this.staleHitProjectionIds.delete(id) ||
        projectionStalenessChanged;
      this.deleteSpatialHitAnimations(id);
    }
    for (const id of hitImpact.staleProjectionIds) {
      if (this.scene.ref(id) !== null && !this.staleHitProjectionIds.has(id)) {
        this.staleHitProjectionIds.add(id);
        projectionStalenessChanged = true;
      }
    }
    if (projectionStalenessChanged) {
      const projection = this.presentationProjection.presentation;
      if (projection !== null) {
        this.renderer.setProjection(
          projection,
          result.changedRanges,
          this.staleHitProjectionIds,
          rendererDomain === 'text-only'
            ? 'text'
            : rendererDomain === 'bar-only'
              ? 'bar-presentation'
              : undefined,
        );
      }
    }
    for (const animation of hitImpact.spatialAnimations) {
      this.spatialHitAnimationEnds.set(animation.key, animation.endTimeMs);
    }
    if (directImageVisibilityIds.size > 0) {
      const projection = this.parseResultValue?.projection;
      if (projection) {
        this.sceneImages.reconcile(projection, {
          activeEntityIds: this.activeSceneImageIds(),
        });
        this.reapplyResolvedIntrinsicSizes();
      }
    }
    this.invalidate(this.scene.activeAnimations > 0 ? 'animation' : 'commit');
    this.entityCountValue += result.added - result.removed;
    return result;
  }

  public advance(timeMs: number): AdvanceResult {
    this.assertAlive();
    // Validate and advance the presentation authority first. Its structured
    // monotonic-clock error is part of the public Core/Engine contract, and a
    // rejected frame must not partially advance dense transaction animations.
    const presentation = this.advancePresentation(timeMs);
    const result = this.scene.advance(timeMs);
    this.animationClockMs = timeMs;
    if (result.changed > 0) {
      this.componentRendererFactsPublished = false;
      this.textRendererFactsPublished = false;
    }
    if (result.changed > 0 && this.spatialHitAnimationEnds.size > 0) {
      this.invalidateEntityHitIndex();
    }
    this.pruneCompletedSpatialHitAnimations(timeMs);
    this.renderer.markChanges(result.changedRanges, 'animation');
    if (presentation.changedCount === 0 && presentation.activeCount === 0) return result;
    return Object.freeze({
      ...result,
      activeAnimations: result.activeAnimations + presentation.activeCount,
      changed: result.changed + presentation.changedCount,
      changedRanges: mergeSlotRanges(result.changedRanges, presentation.dirtyRanges),
    });
  }

  public setView(view: CoreView): CommitResult {
    return this.commit({ operations: [{ type: 'view', view }] });
  }

  public setWorldTransform(view: CoreV2WorldTransform): CommitResult {
    this.assertAlive();
    validateWorldTransform(view);
    this.worldFlipX = view.flipX;
    this.worldFlipY = view.flipY;
    this.renderer.setWorldOrientation({
      rotationDegrees: view.rotationDegrees,
      flipX: view.flipX,
      flipY: view.flipY,
    });
    return this.setView({
      x: view.x,
      y: view.y,
      scale: view.scale,
      rotation: view.rotationDegrees,
    });
  }

  public panBy(delta: CorePoint): CommitResult {
    return this.setView(panView(this.currentView, delta));
  }

  public zoomAt(screenPoint: CorePoint, factor: number): CommitResult {
    if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError('zoom factor must be positive');
    return this.setView(zoomViewAt(
      this.currentView,
      screenPoint,
      this.currentView.scale * factor,
      { min: this.viewportZoomLimits[0], max: this.viewportZoomLimits[1] },
    ));
  }

  public resetView(): CommitResult {
    return this.setView({ x: 0, y: 0, scale: 1, rotation: 0 });
  }

  public fit(padding = 24): CommitResult | null {
    this.assertAlive();
    const snapshot = this.scene.snapshot();
    const bounds = boundsFor(snapshot.entities);
    if (!bounds) return null;
    return this.setView(fitView(
      bounds,
      { width: this.renderer.width, height: this.renderer.height },
      padding,
      { min: this.viewportZoomLimits[0], max: this.viewportZoomLimits[1] },
    ));
  }

  public screenToWorld(point: CorePoint): CorePoint {
    this.assertAlive();
    return screenToWorldWithFlips(point, this.currentView, this.worldFlipX, this.worldFlipY);
  }

  public hitTestScreen(point: CorePoint, options: HitTestOptions = {}): EntityRef | null {
    this.assertAlive();
    const worldPoint = screenToWorldWithFlips(
      point,
      this.currentView,
      this.worldFlipX,
      this.worldFlipY,
    );
    if (this.denseHitGeometryCompatible && this.staleHitProjectionIds.size === 0) {
      // Orthogonal parser projections describe the same rotated rectangle as
      // the dense store. Reuse its incrementally maintained spatial buckets
      // instead of snapshotting and re-indexing the complete scene.
      if (
        this.presentationController.activeCount === 0 ||
        (options.kinds !== undefined && !options.kinds.includes('bar'))
      ) {
        return this.scene.hitTest(worldPoint, options);
      }
      return this.hitTestWithAnimatedBars(worldPoint, options);
    }
    return hitTestCoreV2EntityIndex(
      this.entityHitIndex(),
      worldPoint,
      options,
      (ref) => this.scene.get(ref),
      this.presentationProjection.presentation,
      this.staleHitProjectionIds,
    );
  }

  /** World AABB used by the same narrow-phase projection authority as hit testing. */
  public hitBounds(target: string | EntityRef): CoreV2BoundsTuple | null {
    this.assertAlive();
    const entity = this.scene.get(target);
    if (!entity || entity.kind === 'relation') return null;
    const projection = this.staleHitProjectionIds.has(entity.id)
      ? undefined
      : this.presentationProjection.presentation?.byEntityId[entity.id];
    return coreV2EntityWorldAabb(entity, projection);
  }

  public sceneImageProbe(): CoreV2SceneImagesProbe {
    this.assertAlive();
    return this.sceneImages.probe(this.componentRendererFactsPublished);
  }

  public retrySceneImage(entityId: string): CoreV2SceneImageRetryResult {
    this.assertAlive();
    return this.sceneImages.retry(entityId);
  }

  public componentVisualProbe(
    target: CoreV2ComponentVisualTarget,
  ): CoreV2ComponentVisualProductProbe | null {
    this.assertAlive();
    const normalizedTarget = normalizeComponentVisualTarget(target);
    const indexed = this.componentTargets.get(componentTargetKey(normalizedTarget));
    if (!indexed) return null;
    const component = componentVisualProjection(this.projectionValue, indexed.entityId);
    const projection = this.presentationProjection.presentation?.byEntityId[indexed.entityId];
    const entity = this.scene.get(indexed.entityId);
    if (
      !component ||
      !projection ||
      !entity ||
      (component.ownerId !== normalizedTarget.ownerId &&
        indexed.semanticOwnerId !== normalizedTarget.ownerId) ||
      component.componentId !== normalizedTarget.componentId
    ) {
      return null;
    }
    const worldBounds = coreV2EntityWorldAabb(entity, projection);
    if (worldBounds === null) return null;
    const rendererFactsPublished = this.componentRendererFactsPublished;
    return Object.freeze({
      target: normalizedTarget,
      semanticOwnerId: indexed.semanticOwnerId,
      entityId: component.entityId,
      logicalIdentity: component.logicalIdentity,
      componentType: component.componentType,
      renderRole: component.renderRole,
      entityKind: entity.kind,
      geometry: Object.freeze({
        localBounds: projection.localBounds,
        worldBounds,
        visibleBounds: entity.visible ? worldBounds : null,
        visible: entity.visible,
        interactive: entity.interactive,
      }),
      publication: Object.freeze({
        rendererFacts: rendererFactsPublished ? 'current' : 'pending',
      }),
      image: rendererFactsPublished
        ? this.sceneImages.imageProbe(indexed.entityId, true)
        : null,
      rendererPaint: rendererFactsPublished
        ? this.renderer.entityPaintProbe(indexed.entityId)
        : null,
      renderLanes: rendererFactsPublished ? this.renderer.renderLaneProbe() : null,
    });
  }

  public barPresentationProbe(
    target: CoreV2ComponentVisualTarget,
  ): CoreV2BarPresentationProductProbe | null {
    this.assertAlive();
    const normalizedTarget = normalizeComponentVisualTarget(target);
    const indexed = this.componentTargets.get(componentTargetKey(normalizedTarget));
    if (!indexed) return null;
    const bar = this.projectionValue?.barsByEntityId?.[indexed.entityId];
    if (
      bar === undefined ||
      (bar.ownerId !== normalizedTarget.ownerId &&
        indexed.semanticOwnerId !== normalizedTarget.ownerId) ||
      bar.componentId !== normalizedTarget.componentId
    ) {
      return null;
    }
    const controller = this.presentationController.snapshot();
    const active = this.presentationController.probe(indexed.entityId);
    const presentationHeight = this.presentationProjection.visibleHeight(indexed.entityId) ??
      bar.destinationHeight;
    return Object.freeze({
      target: normalizedTarget,
      entityId: indexed.entityId,
      policy: Object.freeze({
        enabled: bar.animation,
        durationMs: bar.animationDuration,
      }),
      semanticHeight: bar.destinationHeight,
      presentationHeight,
      active: active !== null,
      startHeight: active?.startValue ?? presentationHeight,
      destinationHeight: active?.destinationValue ?? bar.destinationHeight,
      startTimeMs: active?.startTimeMs ?? null,
      controller,
      ghostPublicationCount: this.presentationGhostPublicationCount,
    });
  }

  /** Exact dense semantic order joined to current aggregate renderer facts. */
  public paintOrderProbe(): CoreV2PaintOrderProductProbe {
    this.assertAlive();
    const snapshot = this.scene.snapshot();
    const renderer = this.renderer.debugSnapshot();
    return createCoreV2PaintOrderProductProbe({
      snapshot,
      projection: this.presentationProjection.presentation,
      overlays: this.renderer.overlayPaintProbe(),
      renderer,
      renderedSceneRevision: this.renderedSceneRevision,
      paintForEntity: (entityId) => this.renderer.entityPaintProbe(entityId),
    });
  }

  public textProbe(target: CoreV2TextTarget): CoreV2TextProductProbe | null {
    if (this.destroyedValue) return null;
    const normalizedTarget = normalizeCoreV2TextTarget(target);
    const indexed = this.textTargets.get(coreV2TextTargetKey(normalizedTarget));
    if (!indexed) return null;
    const semantic = this.projectionValue?.textsByEntityId?.[indexed.entityId];
    const projection = this.presentationProjection.presentation?.byEntityId[indexed.entityId];
    const entity = this.scene.get(indexed.entityId);
    if (
      !semantic ||
      !projection ||
      !entity ||
      entity.kind !== 'text' ||
      !textProjectionMatchesTarget(semantic, normalizedTarget, indexed.semanticOwnerId)
    ) {
      return null;
    }
    const worldBounds = coreV2EntityWorldAabb(entity, projection);
    if (worldBounds === null) return null;
    const rendererProbe = this.renderer.textRendererProbe(indexed.entityId);
    const rendererPaint = this.renderer.entityPaintProbe(indexed.entityId);
    const renderLanes = this.renderer.renderLaneProbe();
    const semanticSignatures = freezeTextSemanticSignatures(semantic);
    const rendererCorrelated = rendererTextProbeCorrelates(
      rendererProbe,
      indexed.entityId,
      semanticSignatures,
    );
    const current = entity.visible &&
      this.textRendererFactsPublished &&
      rendererCorrelated &&
      rendererTextPaintCorrelates(
        rendererPaint,
        indexed.entityId,
        semantic.color,
        entity.opacity,
      ) &&
      rendererTextLaneCorrelates(renderLanes) &&
      this.renderedSceneRevision === this.scene.revision;
    const absent = !entity.visible &&
      this.textRendererFactsPublished &&
      rendererTextAbsenceCorrelates(
        rendererProbe,
        indexed.entityId,
        semanticSignatures,
      ) &&
      this.renderedSceneRevision === this.scene.revision;
    const status: CoreV2TextProductPublicationStatus = absent
      ? 'absent'
      : current
        ? 'current'
        : 'pending';
    const retainedHiddenRenderer = !entity.visible &&
      !absent &&
      rendererProbe !== null &&
      rendererProbe.route !== 'none' &&
      rendererProbe.rendererKind !== 'none' &&
      rendererProbe.lastRenderedSignatures !== null &&
      rendererProbe.lastRenderedFrame !== null;
    const productRendererProbe = absent
      ? null
      : entity.visible || retainedHiddenRenderer
        ? rendererProbe
        : null;
    const renderer = freezeTextRendererProductProbe(
      semantic,
      semanticSignatures,
      productRendererProbe,
    );
    return Object.freeze({
      target: normalizedTarget,
      semanticOwnerId: indexed.semanticOwnerId,
      entityId: indexed.entityId,
      semantic,
      geometry: Object.freeze({
        localBounds: projection.localBounds,
        ownerLocalBounds: freezeCoreV2Bounds(
          semantic.ownerLocalBounds.x,
          semantic.ownerLocalBounds.y,
          semantic.ownerLocalBounds.width,
          semantic.ownerLocalBounds.height,
        ),
        worldBounds,
        hitBounds: worldBounds,
        visibleBounds: entity.visible ? worldBounds : null,
      }),
      state: Object.freeze({
        visible: entity.visible,
        interactive: entity.interactive,
        zIndex: entity.zIndex,
        opacity: entity.opacity,
      }),
      transform: Object.freeze({
        affine: projection.affine,
        worldBasis: projection.worldBasis,
        visibleCenter: projection.visibleCenter,
        rotationDegrees: projection.rotationDegrees,
        scaleX: projection.scaleX,
        scaleY: projection.scaleY,
        contentOrientation: projection.contentOrientation,
      }),
      renderer,
      rendererPaint: current || retainedHiddenRenderer ? rendererPaint : null,
      renderLanes: current || retainedHiddenRenderer ? renderLanes : null,
      publication: Object.freeze({
        status,
        sceneRevision: this.scene.revision,
        renderedSceneRevision: this.renderedSceneRevision,
        rendererFrame: renderer.lastRenderedFrame,
      }),
    });
  }

  public async settleSceneImages(): Promise<void> {
    this.assertAlive();
    await this.sceneImages.settle();
    this.applyPendingIntrinsicImageSizes();
  }

  public async settleSceneImageBindings(bindingKeys: readonly string[]): Promise<void> {
    this.assertAlive();
    await this.sceneImages.settleBindings(bindingKeys);
    this.applyPendingIntrinsicImageSizes();
  }

  public selectAtScreen(point: CorePoint): EntityRef | null {
    this.assertAlive();
    const target = this.hitTestScreen(point, { interactiveOnly: true });
    const result = this.scene.commit({
      operations: [{ type: 'selection', targets: target ? [target] : [], mode: 'replace' }],
    });
    this.renderer.markChanges([], 'selection');
    this.renderer.markOverlayChanges(result.changedRanges, 'selection');
    this.invalidate('selection');
    return target;
  }

  /**
   * Project authored semantic selection identities onto the aggregate dense
   * entities that currently represent them. Groups and grids intentionally do
   * not require one DisplayObject/entity per authored node.
   */
  public selectSemantic(ids: readonly string[]): void {
    this.assertAlive();
    const parse = this.parseResultValue;
    if (parse === null) throw new Error('CoreV2.selectSemantic requires a loaded dataset');
    this.commit({
      operations: [{
        type: 'selection',
        targets: semanticSelectionDenseIds(parse, ids, this.componentTargets),
        mode: 'replace',
      }],
    });
  }

  public semanticSelectionEntityIds(ids: readonly string[]): readonly string[] {
    this.assertAlive();
    const parse = this.parseResultValue;
    if (parse === null) {
      throw new Error('CoreV2 semantic selection requires a loaded dataset');
    }
    return semanticSelectionDenseIds(parse, ids, this.componentTargets);
  }

  public setSelectionOverlayPolicy(
    input: CoreV2SelectionOverlayPolicyInput,
  ): boolean {
    this.assertAlive();
    const parse = this.parseResultValue;
    if (parse === null) {
      throw new Error('CoreV2.setSelectionOverlayPolicy requires a loaded dataset');
    }
    const policy: CoreV2InteractionOverlayPolicy = Object.freeze({
      visibleEntityIds: input.visibleIds === null
        ? null
        : semanticSelectionDenseIds(parse, input.visibleIds, this.componentTargets),
      transformableEntityIds: input.transformableIds === null
        ? null
        : semanticSelectionDenseIds(parse, input.transformableIds, this.componentTargets),
      resizableEntityIds: input.resizableIds === null
        ? null
        : semanticSelectionDenseIds(parse, input.resizableIds, this.componentTargets),
      hidden: input.hidden,
      handleCssPx: input.handleCssPx,
      strokeCssPx: input.strokeCssPx,
    });
    const changed = this.renderer.setInteractionOverlayPolicy(policy);
    if (changed) this.invalidate('interaction-overlay-policy');
    return changed;
  }

  public setPresentationPolicy(
    input: CoreV2PresentationPolicyInput,
  ): CoreV2PresentationPolicyProductProbe {
    this.assertAlive();
    const candidate = normalizeLogicalPresentationPolicy(
      input,
      this.presentationPolicyRevision + 1,
    );
    if (sameLogicalPresentationPolicy(this.logicalPresentationPolicy, candidate)) {
      return this.presentationPolicyProbe();
    }
    this.presentationPolicyRevision += 1;
    this.logicalPresentationPolicy = Object.freeze({
      ...candidate,
      revision: this.presentationPolicyRevision,
    });
    this.applyPresentationPolicyToRenderer();
    this.invalidateEntityHitIndex();
    this.invalidate('presentation-policy');
    return this.presentationPolicyProbe();
  }

  public clearPresentationPolicy(): CoreV2PresentationPolicyProductProbe {
    this.assertAlive();
    if (this.logicalPresentationPolicy === null) return this.presentationPolicyProbe();
    this.presentationPolicyRevision += 1;
    this.logicalPresentationPolicy = null;
    this.renderer.setPresentationPolicy(null);
    this.invalidateEntityHitIndex();
    this.invalidate('presentation-policy:clear');
    return this.presentationPolicyProbe();
  }

  public presentationPolicyProbe(): CoreV2PresentationPolicyProductProbe {
    this.assertAlive();
    const parse = this.parseResultValue;
    const policy = this.logicalPresentationPolicy;
    const sourceIds = parse === null
      ? []
      : [...new Set([
          ...Object.keys(parse.identity.entityIdsBySourceId),
          ...parse.document.entities.map(({ id }) => id),
        ])].sort();
    const highlightSet = new Set(policy?.highlightIds ?? []);
    const hiddenSet = new Set(policy?.hiddenLayerIds ?? []);
    const entities = sourceIds.map((id) => {
      const denseEntityIds = parse === null
        ? Object.freeze([] as string[])
        : semanticSelectionDenseIds(parse, [id]);
      const rendererFacts = denseEntityIds.flatMap((entityId) => {
        const probe = this.renderer.presentationEntityProbe(entityId);
        return probe === null ? [] : [probe];
      });
      const fillOverride = policy?.fillOverrides.find((entry) => entry.id === id);
      const packedFillFacts = fillOverride === undefined || parse === null
        ? rendererFacts
        : semanticPresentationFillDenseIds(parse, id).flatMap((entityId) => {
            const probe = this.renderer.presentationEntityProbe(entityId);
            return probe === null ? [] : [probe];
          });
      return Object.freeze({
        id,
        denseEntityIds,
        emphasis: policy?.highlightIds === null || policy === null || highlightSet.has(id)
          ? 1
          : policy.deEmphasisAlpha,
        visible: !hiddenSet.has(id) && rendererFacts.some(({ visible }) => visible),
        renderObjectCount: rendererFacts.reduce(
          (count, { renderObjectCount }) => count + renderObjectCount,
          0,
        ),
        packedFills: Object.freeze(
          [...new Set(packedFillFacts.map(({ packedFill }) => packedFill >>> 0))],
        ),
      });
    });
    return Object.freeze({
      schemaRevision: CORE_V2_PRESENTATION_POLICY_REVISION,
      revision: this.presentationPolicyRevision,
      status: policy === null ? 'normal' : 'active',
      highlightIds: policy?.highlightIds ?? null,
      deEmphasisAlpha: policy?.deEmphasisAlpha ?? 1,
      hiddenLayerIds: policy?.hiddenLayerIds ?? Object.freeze([]),
      fillOverrides: policy?.fillOverrides ?? Object.freeze([]),
      entities: Object.freeze(entities),
    });
  }

  public previewIncrementalRoots(
    input: unknown,
    dirtyRootIds: readonly string[],
  ): CoreV2TransientProjectionResult | null {
    this.assertAlive();
    this.transientIncrementalParse = null;
    const current = this.parseResultValue;
    const sparseDirtyIndices = this.ownedInputDataset === null
      ? null
      : ownedCoreV2PreviewPatchIndices(input, this.ownedInputDataset);
    const optionsKey = incrementalParseOptionsKey(this.parseOptions);
    const sparseInputMatches =
      sparseDirtyIndices !== null &&
      optionsKey !== null &&
      optionsKey === this.ownedParseOptionsKey;
    if (
      current === null ||
      (
        !sparseInputMatches &&
        !this.matchesOwnedIncrementalInput(input, dirtyRootIds, this.parseOptions)
      )
    ) {
      return null;
    }
    const roots = input as readonly Readonly<{ readonly id: string }>[];
    const dirty = new Set(dirtyRootIds);
    if (dirty.size !== dirtyRootIds.length) return null;
    const dirtyIndices: number[] = [];
    if (sparseInputMatches) {
      for (const index of sparseDirtyIndices) {
        const root = roots[index];
        if (root === undefined || !dirty.delete(root.id)) return null;
        dirtyIndices.push(index);
      }
    } else {
      for (let index = 0; index < roots.length; index += 1) {
        if (dirty.delete(roots[index]!.id)) dirtyIndices.push(index);
      }
    }
    if (dirty.size !== 0) return null;
    const selected = parsePatchMapV010SelectedRoots(
      roots,
      dirtyIndices,
      this.parseOptions,
    );
    if (selected.diagnostics.some(({ level }) => level === 'error')) return null;

    const entityIds: string[] = [];
    for (const rootId of dirtyRootIds) {
      const expected = current.identity.entityIdsBySourceId[rootId] ?? [];
      const actual = selected.identity.entityIdsBySourceId[rootId] ?? [];
      if (!sameStringArray(expected, actual)) return null;
      for (const entityId of actual) {
        if (selected.projection.byEntityId[entityId] === undefined) return null;
        entityIds.push(entityId);
      }
    }
    const uniqueEntityIds = Object.freeze([...new Set(entityIds)]);
    if (optionsKey === null) return null;
    this.transientIncrementalParse = Object.freeze({
      base: current,
      optionsKey,
      dirtyRootIds: Object.freeze([...dirtyRootIds]),
      dirtyIndices: Object.freeze(dirtyIndices),
      dirtyRoots: Object.freeze(dirtyIndices.map((index) => roots[index] as object)),
      selected,
    });
    const presentation = this.presentationProjection.applyTransientEntityProjections(
      selected.projection.byEntityId,
      uniqueEntityIds,
    );
    if (presentation === null) return null;
    const dirtyRanges = contiguousSlotRanges(uniqueEntityIds.flatMap((entityId) => {
      const ref = this.scene.ref(entityId);
      return ref === null ? [] : [ref.slot];
    }));
    this.renderer.setProjection(
      presentation,
      dirtyRanges,
      this.staleHitProjectionIds,
    );
    this.componentRendererFactsPublished = false;
    this.textRendererFactsPublished = false;
    this.renderedSceneRevision = null;
    this.invalidateEntityHitIndex();
    this.invalidate('transformer-preview');
    return Object.freeze({
      changed: dirtyRanges.length > 0,
      entityIds: uniqueEntityIds,
      dirtyRanges,
    });
  }

  public clearIncrementalPreview(): CoreV2TransientProjectionResult {
    this.assertAlive();
    this.transientIncrementalParse = null;
    const entityIds = this.presentationProjection.clearTransientEntityProjections();
    const dirtyRanges = contiguousSlotRanges(entityIds.flatMap((entityId) => {
      const ref = this.scene.ref(entityId);
      return ref === null ? [] : [ref.slot];
    }));
    const presentation = this.presentationProjection.presentation;
    if (presentation !== null && dirtyRanges.length > 0) {
      this.renderer.setProjection(
        presentation,
        dirtyRanges,
        this.staleHitProjectionIds,
      );
      this.componentRendererFactsPublished = false;
      this.textRendererFactsPublished = false;
      this.renderedSceneRevision = null;
      this.invalidateEntityHitIndex();
      this.invalidate('transformer-preview-clear');
    }
    return Object.freeze({
      changed: dirtyRanges.length > 0,
      entityIds,
      dirtyRanges,
    });
  }

  public refreshSemanticTargets(
    targets: readonly CoreV2SemanticTarget[],
    options: CoreV2SemanticRefreshOptions = {},
  ): CoreV2SemanticRefreshResult {
    this.assertAlive();
    if (!Array.isArray(targets)) throw new TypeError('refresh targets must be an array');
    const parse = this.parseResultValue;
    if (parse === null) throw new Error('CoreV2.refreshSemanticTargets requires a loaded dataset');
    const recomputedTargets: string[] = [];
    const missingTargets: string[] = [];
    const denseEntityIds = new Set<string>();
    for (const [index, target] of targets.entries()) {
      const normalized = normalizeRefreshTarget(target, index);
      const label = normalized.kind === 'component'
        ? `${normalized.ownerId}/${normalized.id}`
        : normalized.id;
      const resolved = normalized.kind === 'component'
        ? componentRefreshEntityIds(this.componentTargets, normalized)
        : semanticSelectionDenseIds(parse, [normalized.id]);
      if (resolved.length === 0) {
        missingTargets.push(label);
        continue;
      }
      recomputedTargets.push(label);
      for (const entityId of resolved) denseEntityIds.add(entityId);
    }
    if (options.strict === true && missingTargets.length > 0) {
      return Object.freeze({
        changed: false,
        recomputedTargets: Object.freeze([]),
        missingTargets: Object.freeze(missingTargets),
        dirtyRanges: Object.freeze([]),
        dataDiffCount: 0,
      });
    }
    const slots = [...denseEntityIds].flatMap((entityId) => {
      const ref = this.scene.ref(entityId);
      return ref === null ? [] : [ref.slot];
    }).sort((left, right) => left - right);
    const dirtyRanges = contiguousSlotRanges(slots);
    const projection = this.presentationProjection.presentation;
    if (dirtyRanges.length > 0 && projection !== null) {
      this.renderer.setProjection(projection, dirtyRanges);
      this.componentRendererFactsPublished = false;
      this.textRendererFactsPublished = false;
      this.renderedSceneRevision = null;
      this.invalidateEntityHitIndex();
      this.invalidate('semantic-refresh');
    }
    return Object.freeze({
      changed: dirtyRanges.length > 0,
      recomputedTargets: Object.freeze(recomputedTargets),
      missingTargets: Object.freeze(missingTargets),
      dirtyRanges,
      dataDiffCount: 0,
    });
  }

  public animateBarHeights(options: AnimateBarsOptions = {}): CommitResult {
    this.assertAlive();
    const fraction = clampFraction(options.fraction ?? 1);
    const usesPercentRange =
      options.minPercent !== undefined ||
      options.maxPercent !== undefined;
    if (
      usesPercentRange &&
      (options.minScale !== undefined || options.maxScale !== undefined)
    ) {
      throw new RangeError('bar percent and scale ranges cannot be combined');
    }
    const minScale = options.minScale ?? 0.25;
    const maxScale = options.maxScale ?? 1.1;
    if (!usesPercentRange && (!(minScale > 0) || !(maxScale >= minScale))) {
      throw new RangeError('invalid bar scale range');
    }
    const minPercent = options.minPercent ?? 0;
    const maxPercent = options.maxPercent ?? 100;
    if (
      usesPercentRange &&
      (
        !Number.isFinite(minPercent) ||
        !Number.isFinite(maxPercent) ||
        minPercent < 0 ||
        maxPercent > 100 ||
        maxPercent < minPercent
      )
    ) {
      throw new RangeError('bar percent range must be between zero and one hundred');
    }
    const random = seededRandom(options.seed ?? 0x5eedc0de);
    const bars = this.scene.query({ kinds: ['bar'] });
    const operations: TransactionBatch['operations'][number][] = [];
    for (const ref of bars) {
      if (random() > fraction) continue;
      const bar = this.scene.get(ref);
      if (!bar) continue;
      const randomUnit = random();
      const destinationHeight = usesPercentRange
        ? barPercentageHeight(
            this.projectionValue?.barsByEntityId?.[bar.id],
            minPercent + randomUnit * (maxPercent - minPercent),
          )
        : Math.max(1, bar.bounds.height * (
            minScale + randomUnit * (maxScale - minScale)
          ));
      operations.push({
        type: 'animate',
        target: ref,
        property: 'height',
        to: destinationHeight,
        durationMs: options.durationMs ?? 240,
        easing: 'easeInOut',
      });
    }
    return this.commit({ operations });
  }

  public updateTexts(updates: Readonly<Record<string, string>>): CommitResult {
    const operations: TransactionBatch['operations'][number][] = [];
    for (const [id, text] of Object.entries(updates)) {
      operations.push({ type: 'patch', target: id, changes: { text } });
    }
    return this.commit({ operations });
  }

  public randomizeTexts(seed = 0x7e57, fraction = 0.1): CommitResult {
    this.assertAlive();
    const resolvedFraction = clampFraction(fraction);
    const random = seededRandom(seed);
    const updates: Record<string, string> = {};
    for (const ref of this.scene.query({ kinds: ['text'] })) {
      if (random() > resolvedFraction) continue;
      const entity = this.scene.get(ref);
      if (!entity) continue;
      updates[entity.id] = String(Math.floor(random() * 100_000));
    }
    return this.updateTexts(updates);
  }

  public resize(width: number, height: number, pixelRatio = this.renderer.pixelRatio): boolean {
    this.assertAlive();
    const changed = this.scene.resize(width, height, pixelRatio);
    if (changed) {
      this.renderer.markChanges([], 'resize');
      this.invalidate('resize');
    }
    return changed;
  }

  public async loadAsset(alias: string, url: string): Promise<void> {
    this.assertAlive();
    await this.renderer.loadAsset(alias, url);
    this.flush('asset-load-bind');
    await this.renderer.finalizeAssetUnloads();
  }

  public async unloadAsset(alias: string): Promise<boolean> {
    this.assertAlive();
    const unloaded = await this.renderer.unloadAsset(alias);
    if (unloaded) {
      // Render the fallback binding before releasing the prior texture source;
      // cached Pixi render instructions must never point at a destroyed source.
      this.flush('asset-unload-detach');
      await this.renderer.finalizeAssetUnloads();
    }
    return unloaded;
  }

  public async captureBase64(): Promise<string> {
    this.assertAlive();
    this.flush('capture');
    return this.renderer.captureBase64();
  }

  public ref(id: string): EntityRef | null {
    return this.scene.ref(id);
  }

  public get(target: string | EntityRef): EntitySnapshot | null {
    return this.scene.get(target);
  }

  public query(filter: QueryFilter = {}): readonly EntityRef[] {
    return this.scene.query(filter);
  }

  public selection(): SelectionSnapshot {
    return this.scene.selection();
  }

  public snapshot(): SceneSnapshot {
    return this.scene.snapshot();
  }

  public debugSnapshot(): CoreV2RuntimeDebug {
    const selectionCount = this.destroyedValue ? 0 : this.scene.selection().refs.length;
    return Object.freeze({
      destroyed: this.destroyedValue,
      suspended: this.suspended,
      entityCount: this.entityCountValue,
      activeAnimations: this.activeAnimations,
      activeGestureCount: this.destroyedValue || this.pan === null ? 0 : 1,
      selectionCount,
      diagnostics: this.diagnostics.length,
      renderer: this.renderer.debugSnapshot(),
      scheduler: this.scheduler.debugSnapshot(),
    });
  }

  public interactionOwnershipProbe(): Readonly<{
    readonly rootBindingCount: number;
    readonly rootListenerCount?: number;
    readonly entityCallbackCount: number;
  }> {
    this.assertAlive();
    return this.renderer.interactionOwnershipProbe();
  }

  public setViewportGesturePolicies(
    policies: readonly CoreV2ViewportPolicy[],
  ): readonly CoreV2ViewportPolicy[] {
    this.assertAlive();
    if (!Array.isArray(policies)) throw new TypeError('viewport policies must be an array');
    const supported = new Set<CoreV2ViewportPolicy>(CORE_V2_VIEWPORT_POLICIES);
    const next = new Set<CoreV2ViewportPolicy>();
    const requested = policies as readonly unknown[];
    for (const [index, value] of requested.entries()) {
      if (typeof value !== 'string' || !supported.has(value as CoreV2ViewportPolicy)) {
        throw new TypeError(`viewport policies[${index}] is unsupported`);
      }
      const policy = value as CoreV2ViewportPolicy;
      next.add(policy);
    }
    this.viewportPolicies = next;
    if (!next.has('pan')) this.cancelViewportGestures();
    return Object.freeze(CORE_V2_VIEWPORT_POLICIES.filter((policy) => next.has(policy)));
  }

  public setViewportZoomLimits(
    limits: readonly [number, number],
  ): readonly [number, number] {
    this.assertAlive();
    if (
      !Array.isArray(limits) ||
      limits.length !== 2 ||
      !Number.isFinite(limits[0]) ||
      !Number.isFinite(limits[1]) ||
      !(limits[0] > 0) ||
      limits[1] < limits[0]
    ) {
      throw new RangeError('viewport zoom limits must be finite, positive, and ordered');
    }
    this.viewportZoomLimits = Object.freeze([limits[0], limits[1]]);
    return this.viewportZoomLimits;
  }

  public bindRootViewportChanges(
    listener: (change: CoreV2RootViewportChange) => void,
  ): () => void {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new TypeError('root viewport listener must be a function');
    }
    this.rootViewportListeners.add(listener);
    return () => {
      this.rootViewportListeners.delete(listener);
    };
  }

  public bindRootPointerInputs(
    listener: (input: CoreV2RootPointerInput) => void,
  ): () => void {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new TypeError('root pointer input listener must be a function');
    }
    this.rootPointerListeners.add(listener);
    return () => {
      this.rootPointerListeners.delete(listener);
    };
  }

  public cancelViewportGestures(): void {
    this.assertAlive();
    this.pan = null;
    this.scheduler.setContinuous(false, 'gesture-cancel');
  }

  /**
   * Creates the one package-owned manual frame loop for this Core instance.
   * Automatic Core instances already own their scheduler and reject a second
   * frame owner.
   */
  public createFrameLoop(options: CoreV2FrameLoopOptions = {}): CoreV2FrameLoop {
    this.assertAlive();
    if (this.autoRender) {
      throw new Error('createFrameLoop requires autoRender: false');
    }
    if (
      this.externalFrameLoop !== null &&
      !this.externalFrameLoop.isDestroyed
    ) {
      throw new Error('CoreV2 already owns an active frame loop');
    }
    this.externalFrameLoop = new CoreV2FrameLoop(this, options);
    return this.externalFrameLoop;
  }

  public async destroy(): Promise<boolean> {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.suspended = false;
    this.pan = null;
    this.viewportPolicies.clear();
    this.rootViewportListeners.clear();
    this.rootPointerListeners.clear();
    this.externalFrameLoop?.destroy();
    this.externalFrameLoop = null;
    this.scheduler.destroy();
    this.adaptiveFrameBudget.destroy();
    this.unbindInteractions();
    this.entityHitIndexValue = null;
    this.staleHitProjectionIds.clear();
    this.spatialHitAnimationEnds.clear();
    this.presentationController.destroy();
    this.presentationProjection.clear();
    this.logicalPresentationPolicy = null;
    const cleanupFailures: Error[] = [];
    try {
      await this.sceneImages.destroy();
    } catch (error) {
      cleanupFailures.push(normalizeCleanupFailure(error));
    }
    this.projectionValue = null;
    this.denseHitGeometryCompatible = true;
    this.ownedInputDataset = null;
    this.ownedParseOptionsKey = null;
    this.transientIncrementalParse = null;
    this.componentTargets.clear();
    this.componentRendererFactsPublished = false;
    this.textTargets.clear();
    this.textRendererFactsPublished = false;
    this.renderedSceneRevision = null;
    this.pendingIntrinsicImageSizes.clear();
    try {
      this.scene.destroy();
    } catch (error) {
      cleanupFailures.push(normalizeCleanupFailure(error));
    }
    try {
      this.renderer.destroy();
    } catch (error) {
      cleanupFailures.push(normalizeCleanupFailure(error));
    }
    try {
      await this.renderer.whenDestroyed();
    } catch (error) {
      cleanupFailures.push(normalizeCleanupFailure(error));
    }
    if (cleanupFailures.length === 1) {
      const [failure] = cleanupFailures;
      if (failure) throw failure;
    }
    if (cleanupFailures.length > 1) {
      throw new AggregateError(cleanupFailures, 'Core v2 cleanup failed');
    }
    return true;
  }

  private renderScheduledFrame(timeMs: number): boolean {
    if (this.destroyedValue || this.suspended) return false;
    this.applyPendingIntrinsicImageSizes();
    const activeAnimationsBefore = this.activeAnimations;
    if (activeAnimationsBefore > 0) {
      if (!this.automaticAnimationFramesActive) {
        this.adaptiveFrameBudget.reset(timeMs);
        this.automaticAnimationFramesActive = true;
      }
      const plan = this.adaptiveFrameBudget.plan({
        wallTimeMs: timeMs,
        activeAnimationCount: activeAnimationsBefore,
        workloadSize: this.frameWorkloadSize,
        viewportGestureActive: this.viewportGestureActive,
      });
      if (plan.presentationAdvanced) {
        this.animationClockMs += plan.presentationDeltaMs;
        if (this.scene.activeAnimations > 0) {
          const spatialAnimationActive = this.spatialHitAnimationEnds.size > 0;
          const advanced = this.scene.advance(this.animationClockMs);
          if (advanced.changed > 0 && spatialAnimationActive) this.invalidateEntityHitIndex();
          this.renderer.markChanges(advanced.changedRanges, 'animation');
        }
        this.advancePresentation(this.animationClockMs);
        this.pruneCompletedSpatialHitAnimations(this.animationClockMs);
      }
      this.lastFrameReport = this.flushScene();
      this.adaptiveFrameBudget.complete(plan, now());
    } else {
      this.adaptiveFrameBudget.reset(timeMs);
      this.lastFrameReport = this.flushScene();
    }
    if (this.lastFrameReport.rendered) void this.sceneImages.finalizeAfterRenderedFrame();
    const active = this.activeAnimations > 0;
    if (!active) this.automaticAnimationFramesActive = false;
    return active;
  }

  private invalidate(reason: string): void {
    this.componentRendererFactsPublished = false;
    this.textRendererFactsPublished = false;
    this.requestExternalFrameLoop();
    if (this.autoRender && !this.suspended) this.scheduler.invalidate(reason);
  }

  private flushScene(): FrameReport {
    const report = this.scene.flush();
    this.componentRendererFactsPublished = true;
    if (report.rendered) {
      this.textRendererFactsPublished = true;
      this.renderedSceneRevision = report.revision;
    }
    return report;
  }

  private requestExternalFrameLoop(): void {
    if (this.externalFrameLoop === null) return;
    if (this.externalFrameLoop.isDestroyed) {
      this.externalFrameLoop = null;
      return;
    }
    this.externalFrameLoop.request();
  }

  private entityHitIndex(): CoreV2EntityHitIndex {
    if (this.entityHitIndexValue === null) {
      this.entityHitIndexValue = CoreV2EntityHitIndex.build(
        this.scene.snapshot(),
        this.presentationProjection.presentation,
        this.staleHitProjectionIds,
        { envelopeProjection: this.projectionValue },
      );
      if (this.presentationController.activeCount > 0) {
        this.presentationHitIndexActive = true;
      }
    }
    return this.entityHitIndexValue;
  }

  private animatedBarHitIndex(): CoreV2EntityHitIndex {
    if (this.animatedBarHitIndexValue !== null) return this.animatedBarHitIndexValue;
    const bars = this.projectionValue?.barsByEntityId ?? {};
    const activeBars = Object.keys(bars).flatMap((entityId) => {
      if (this.presentationController.probe(entityId) === null) return [];
      const entity = this.scene.get(entityId);
      return entity?.kind === 'bar' ? [entity] : [];
    });
    activeBars.sort((left, right) =>
      left.zIndex - right.zIndex ||
      left.ref.slot - right.ref.slot);
    this.animatedBarHitIndexValue = CoreV2EntityHitIndex.buildEntities(
      activeBars,
      this.presentationProjection.presentation,
      this.staleHitProjectionIds,
      { envelopeProjection: this.projectionValue },
    );
    this.presentationHitIndexActive = true;
    return this.animatedBarHitIndexValue;
  }

  private hitTestWithAnimatedBars(
    point: CorePoint,
    options: HitTestOptions,
  ): EntityRef | null {
    const denseHit = this.scene.hitTest(point, options);
    const animatedHit = hitTestCoreV2EntityIndex(
      this.animatedBarHitIndex(),
      point,
      options,
      (ref) => this.scene.get(ref),
      this.presentationProjection.presentation,
      this.staleHitProjectionIds,
    );
    if (denseHit === null) return animatedHit;
    const denseEntity = this.scene.get(denseHit);
    if (denseEntity === null) return animatedHit;
    if (
      this.presentationController.probe(denseEntity.id) !== null &&
      !coreV2EntityContainsWorldPoint(
        denseEntity,
        point,
        this.presentationProjection.presentation?.byEntityId[denseEntity.id],
      )
    ) {
      // A growing bar can occupy its destination dense bounds before the
      // presentation reaches that point. Resolve the uncommon ambiguous case
      // through the exact full index; its interpolation envelope remains
      // reusable for the rest of this animation.
      return hitTestCoreV2EntityIndex(
        this.entityHitIndex(),
        point,
        options,
        (ref) => this.scene.get(ref),
        this.presentationProjection.presentation,
        this.staleHitProjectionIds,
      );
    }
    return this.topmostHit(denseHit, animatedHit);
  }

  private topmostHit(
    left: EntityRef,
    right: EntityRef | null,
  ): EntityRef {
    if (right === null || (
      left.slot === right.slot &&
      left.generation === right.generation
    )) {
      return left;
    }
    const leftEntity = this.scene.get(left);
    const rightEntity = this.scene.get(right);
    if (leftEntity === null) return right;
    if (rightEntity === null) return left;
    return rightEntity.zIndex > leftEntity.zIndex ||
      (rightEntity.zIndex === leftEntity.zIndex && right.slot > left.slot)
      ? right
      : left;
  }

  private invalidateEntityHitIndex(): void {
    this.entityHitIndexValue = null;
    this.animatedBarHitIndexValue = null;
    this.presentationHitIndexActive = false;
  }

  private applyPresentationPolicyToRenderer(): void {
    const policy = this.logicalPresentationPolicy;
    if (policy === null) {
      if (typeof this.renderer.setPresentationPolicy === 'function') {
        this.renderer.setPresentationPolicy(null);
      }
      return;
    }
    if (typeof this.renderer.setPresentationPolicy !== 'function') {
      throw new Error('CoreV2 presentation policy requires renderer support');
    }
    const parse = this.parseResultValue;
    const resolved: CoreV2ResolvedPresentationPolicy = Object.freeze({
      revision: policy.revision,
      highlightedEntityIds: policy.highlightIds === null || parse === null
        ? policy.highlightIds
        : semanticSelectionDenseIds(parse, policy.highlightIds, this.componentTargets),
      deEmphasisAlpha: policy.deEmphasisAlpha,
      hiddenEntityIds: parse === null
        ? Object.freeze([])
        : semanticSelectionDenseIds(parse, policy.hiddenLayerIds, this.componentTargets),
      fillOverrides: parse === null
        ? Object.freeze([])
        : resolvePresentationFillOverrides(parse, policy.fillOverrides),
    });
    this.renderer.setPresentationPolicy(resolved);
  }

  private resetPresentationController(): void {
    this.presentationController.destroy();
    this.presentationGeneration += 1;
    this.presentationController = new CoreV2PresentationController({
      lifecycleGeneration: this.presentationGeneration,
    });
    this.presentationProjection.clear();
    this.presentationGhostPublicationCount = 0;
  }

  /**
   * Commit semantic bar destinations immediately while retaining only active
   * renderer-visible heights in the transient projection sidecar.
   */
  private reconcileBarPresentation(
    next: CoreV2ProjectionIndex,
    animateBarChanges: boolean,
    animatedBarTargets?: readonly CoreV2ComponentVisualTarget[],
    incrementalEntityIds?: readonly string[],
  ): CoreV2ProjectionIndex {
    const previousBars = this.projectionValue?.barsByEntityId ?? {};
    const nextBars = next.barsByEntityId ?? {};
    const visibleHeights = new Map<string, number>();
    const timeMs = this.animationClockMs;
    const animatedTargetKeys = animatedBarTargets === undefined
      ? null
      : new Set(animatedBarTargets.map(componentTargetKey));

    if (
      incrementalEntityIds !== undefined &&
      incrementalBarPresentationCompatible(
        previousBars,
        nextBars,
        incrementalEntityIds,
      )
    ) {
      for (const entityId of incrementalEntityIds) {
        const bar = nextBars[entityId];
        const previous = previousBars[entityId];
        const active = this.presentationController.probe(entityId);
        if (bar === undefined) {
          if (active !== null) {
            this.presentationController.cancel({
              entityId,
              generation: active.generation,
              timeMs,
              reason: 'remove',
            });
          }
          continue;
        }
        const entity = this.scene.get(entityId);
        const ref = entity?.ref ?? null;
        const currentHeight = this.presentationProjection.visibleHeight(entityId) ??
          previous?.destinationHeight ??
          bar.destinationHeight;
        const canAnimate = animateBarChanges &&
          (
            animatedTargetKeys === null ||
            animatedTargetKeys.has(componentTargetKey({
              ownerId: bar.ownerId,
              componentId: bar.componentId,
            }))
          ) &&
          previous !== undefined &&
          entity?.kind === 'bar' &&
          entity.visible &&
          ref !== null &&
          bar.animation;
        const destinationChanged =
          previous?.destinationHeight !== bar.destinationHeight;
        if (!canAnimate) {
          if (active !== null) {
            this.presentationController.cancel({
              entityId,
              generation: active.generation,
              timeMs,
              reason: entity === null ? 'remove' : entity.visible ? 'replacement' : 'hide',
            });
          }
          continue;
        }
        if (destinationChanged) {
          const retargeted = this.presentationController.retarget({
            entityId,
            slot: ref.slot,
            generation: ref.generation,
            currentVisibleValue: currentHeight,
            destinationValue: bar.destinationHeight,
            timeMs,
            durationMs: bar.animationDuration,
            enabled: bar.animation,
          });
          if (retargeted.scheduled) {
            visibleHeights.set(entityId, retargeted.startValue);
          }
          continue;
        }
        if (
          active !== null &&
          active.slot === ref.slot &&
          active.generation === ref.generation
        ) {
          visibleHeights.set(entityId, active.currentValue);
        } else if (active !== null) {
          this.presentationController.cancel({
            entityId,
            generation: active.generation,
            timeMs,
            reason: 'replacement',
          });
        }
      }
      const incremental = this.presentationProjection.replaceIncremental(
        next,
        incrementalEntityIds,
        visibleHeights,
      );
      if (incremental !== null) {
        this.presentationValidatedEntityEpoch = this.presentationEntityEpoch;
        this.invalidPresentationEntityIds.clear();
        return incremental;
      }
    }

    for (const entityId of Object.keys(previousBars).sort()) {
      if (nextBars[entityId] !== undefined) continue;
      const active = this.presentationController.probe(entityId);
      if (active !== null) {
        this.presentationController.cancel({
          entityId,
          generation: active.generation,
          timeMs,
          reason: 'remove',
        });
      }
    }

    for (const entityId of Object.keys(nextBars).sort()) {
      const bar = nextBars[entityId];
      if (bar === undefined) continue;
      const previous = previousBars[entityId];
      const entity = this.scene.get(entityId);
      const ref = entity?.ref ?? null;
      const active = this.presentationController.probe(entityId);
      const currentHeight = this.presentationProjection.visibleHeight(entityId) ??
        previous?.destinationHeight ??
        bar.destinationHeight;
      const canAnimate = animateBarChanges &&
        (animatedTargetKeys === null || animatedTargetKeys.has(componentTargetKey({
          ownerId: bar.ownerId,
          componentId: bar.componentId,
        }))) &&
        previous !== undefined &&
        entity?.kind === 'bar' &&
        entity.visible &&
        ref !== null &&
        bar.animation;
      const destinationChanged = previous?.destinationHeight !== bar.destinationHeight;

      if (!canAnimate) {
        if (active !== null) {
          this.presentationController.cancel({
            entityId,
            generation: active.generation,
            timeMs,
            reason: entity === null ? 'remove' : entity.visible ? 'replacement' : 'hide',
          });
        }
        continue;
      }

      if (destinationChanged) {
        const retargeted = this.presentationController.retarget({
          entityId,
          slot: ref.slot,
          generation: ref.generation,
          currentVisibleValue: currentHeight,
          destinationValue: bar.destinationHeight,
          timeMs,
          durationMs: bar.animationDuration,
          enabled: bar.animation,
        });
        if (retargeted.scheduled) visibleHeights.set(entityId, retargeted.startValue);
        continue;
      }

      if (
        active !== null &&
        active.slot === ref.slot &&
        active.generation === ref.generation
      ) {
        visibleHeights.set(entityId, active.currentValue);
      } else if (active !== null) {
        this.presentationController.cancel({
          entityId,
          generation: active.generation,
          timeMs,
          reason: 'replacement',
        });
      }
    }

    this.presentationValidatedEntityEpoch = this.presentationEntityEpoch;
    this.invalidPresentationEntityIds.clear();
    return this.presentationProjection.replace(next, visibleHeights);
  }

  private advancePresentation(timeMs: number): CoreV2PresentationFrame {
    return this.applyPresentationFrame(this.presentationController.advance(timeMs));
  }

  private applyPresentationFrame(
    frame: CoreV2PresentationFrame,
  ): CoreV2PresentationFrame {
    if (frame.updates.length === 0) {
      if (frame.activeCount === 0 && this.presentationHitIndexActive) {
        this.invalidateEntityHitIndex();
      }
      return frame;
    }
    const validateEntities =
      this.presentationValidatedEntityEpoch !== this.presentationEntityEpoch;
    if (validateEntities) this.invalidPresentationEntityIds.clear();
    let changedCount = 0;
    let filteredRanges = false;
    for (const update of frame.updates) {
      const ref = this.scene.ref(update.entityId);
      const bar = this.projectionValue?.barsByEntityId?.[update.entityId];
      let invalid =
        ref === null ||
        ref.slot !== update.slot ||
        ref.generation !== update.generation ||
        bar === undefined ||
        this.invalidPresentationEntityIds.has(update.entityId);
      if (!invalid && validateEntities) {
        const entity = ref === null ? null : this.scene.get(ref);
        invalid = entity?.kind !== 'bar' || !entity.visible;
      }
      if (invalid) {
        this.invalidPresentationEntityIds.add(update.entityId);
        this.presentationGhostPublicationCount += 1;
        filteredRanges = true;
        continue;
      }
      if (this.presentationProjection.applyBarHeight(update.entityId, update.value)) {
        changedCount += 1;
      }
    }
    if (validateEntities) {
      this.presentationValidatedEntityEpoch = this.presentationEntityEpoch;
    }
    if (changedCount === 0) {
      if (frame.activeCount === 0 && this.presentationHitIndexActive) {
        this.invalidateEntityHitIndex();
      }
      return frame;
    }
    const projection = this.presentationProjection.presentation;
    if (projection === null) return frame;
    const ranges = filteredRanges
      ? contiguousSlotRanges(frame.updates.flatMap((update) =>
          this.invalidPresentationEntityIds.has(update.entityId)
            ? []
            : [update.slot]))
      : frame.dirtyRanges;
    this.renderer.setProjection(
      projection,
      ranges,
      undefined,
      'bar-presentation',
    );
    this.componentRendererFactsPublished = false;
    if (frame.activeCount === 0 && this.presentationHitIndexActive) {
      this.invalidateEntityHitIndex();
    }
    return frame;
  }

  private visibleBarHeights(): ReadonlyMap<string, number> {
    const heights = new Map<string, number>();
    const bars = this.projectionValue?.barsByEntityId ?? {};
    for (const entityId of Object.keys(bars).sort()) {
      if (this.presentationController.probe(entityId) === null) continue;
      const height = this.presentationProjection.visibleHeight(entityId);
      if (height !== null) heights.set(entityId, height);
    }
    return heights;
  }

  private activeSceneImageIds(): ReadonlySet<string> {
    const active = new Set<string>();
    const images = this.parseResultValue?.projection.imagesByEntityId ?? {};
    for (const entityId of Object.keys(images)) {
      const entity = this.scene.get(entityId);
      if (entity?.kind === 'image' && entity.visible) active.add(entityId);
    }
    return active;
  }

  private queueIntrinsicImageSize(resolution: CoreV2SceneImageIntrinsicSize): void {
    if (!this.destroyedValue) this.pendingIntrinsicImageSizes.set(resolution.entityId, resolution);
  }

  /** Publish every decoded size in one immutable projection replacement per frame/settlement. */
  private applyPendingIntrinsicImageSizes(): void {
    if (this.destroyedValue || this.pendingIntrinsicImageSizes.size === 0) return;
    const resolutions = [...this.pendingIntrinsicImageSizes.values()]
      .sort((left, right) => left.entityId.localeCompare(right.entityId));
    this.pendingIntrinsicImageSizes.clear();
    this.applyIntrinsicImageSizes(resolutions);
  }

  private applyIntrinsicImageSizes(
    resolutions: readonly CoreV2SceneImageIntrinsicSize[],
  ): void {
    if (this.destroyedValue || resolutions.length === 0) return;
    const base = this.parseResultValue?.projection;
    const currentIndex = this.projectionValue ?? base;
    if (!base || !currentIndex) return;
    const replacements: Record<string, CoreV2EntityProjection> = Object.create(null) as Record<
      string,
      CoreV2EntityProjection
    >;

    for (const resolution of resolutions) {
      const image = base.imagesByEntityId?.[resolution.entityId];
      const current = this.sceneImages.imageProbe(resolution.entityId);
      if (
        !image ||
        image.dimensionMode !== 'intrinsic' ||
        image.intrinsicTransform === undefined ||
        image.bindingKey !== resolution.bindingKey ||
        current?.generation !== resolution.generation ||
        current.bindingKey !== resolution.bindingKey ||
        current.attachmentState !== 'current'
      ) {
        continue;
      }
      const sourceProjection = base.byEntityId[resolution.entityId];
      if (!sourceProjection) continue;
      const [width, height] = resolution.naturalSize;
      if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
        continue;
      }
      const affine = projectCoreV2IntrinsicImageAffine(image.intrinsicTransform, width, height);
      const localBounds = freezeCoreV2Bounds(0, 0, width, height);
      const projection = Object.freeze({
        ...sourceProjection,
        affine,
        localBounds,
        worldBasis: coreV2AffineBasis(affine),
        visibleCenter: coreV2AffineCenter(affine, localBounds),
      } satisfies CoreV2EntityProjection);
      if (jsonEquivalent(currentIndex.byEntityId[resolution.entityId], projection)) continue;
      replacements[resolution.entityId] = projection;
    }

    const changedIds = Object.keys(replacements).sort();
    if (changedIds.length === 0) return;
    const next = freezeProjectionReplacements(currentIndex, replacements);
    this.projectionValue = next;
    this.denseHitGeometryCompatible = false;
    const presentation = this.presentationProjection.replace(next, this.visibleBarHeights());
    for (const entityId of changedIds) this.staleHitProjectionIds.delete(entityId);
    this.renderer.setProjection(presentation, undefined, this.staleHitProjectionIds);
    this.invalidateEntityHitIndex();
  }

  private reapplyResolvedIntrinsicSizes(): void {
    const images = this.parseResultValue?.projection.imagesByEntityId ?? {};
    const resolutions: CoreV2SceneImageIntrinsicSize[] = [];
    for (const entityId of Object.keys(images).sort()) {
      const image = images[entityId];
      if (image?.dimensionMode !== 'intrinsic') continue;
      const probe = this.sceneImages.imageProbe(entityId);
      if (!probe?.naturalSize || probe.attachmentState !== 'current') continue;
      resolutions.push({
        entityId,
        bindingKey: probe.bindingKey,
        generation: probe.generation,
        naturalSize: probe.naturalSize,
      });
    }
    this.pendingIntrinsicImageSizes.clear();
    this.applyIntrinsicImageSizes(resolutions);
  }

  /**
   * Parser projections are authoritative for image source and affine geometry.
   * Direct dense mutations cannot update that sidecar atomically, so fail before
   * the scene transaction and direct callers to the JSON reconciliation path.
   */
  private assertDirectImageProjectionMutationSafe(batch: TransactionBatch): void {
    for (const [index, operation] of batch.operations.entries()) {
      if (operation.type === 'add' && operation.entity.kind === 'image') {
        throw unsupportedDirectImageMutation(index, 'add');
      }
      if (operation.type === 'remove' && this.scene.get(operation.target)?.kind === 'image') {
        throw unsupportedDirectImageMutation(index, 'remove');
      }
      if (
        operation.type === 'patch' &&
        this.scene.get(operation.target)?.kind === 'image' &&
        IMAGE_PROJECTION_PATCH_FIELDS.some((field) => operation.changes[field] !== undefined)
      ) {
        throw unsupportedDirectImageMutation(index, 'projection patch');
      }
      if (
        operation.type === 'animate' &&
        this.scene.get(operation.target)?.kind === 'image' &&
        IMAGE_PROJECTION_ANIMATION_FIELDS.has(operation.property)
      ) {
        throw unsupportedDirectImageMutation(index, 'projection animation');
      }
    }
  }

  private directImageVisibilityIds(batch: TransactionBatch): Set<string> {
    const ids = new Set<string>();
    for (const operation of batch.operations) {
      if (operation.type === 'visibility') {
        const entity = this.scene.get(operation.target);
        if (entity?.kind === 'image') ids.add(entity.id);
        continue;
      }
      if (
        operation.type === 'patch' &&
        operation.changes.visible !== undefined &&
        this.scene.get(operation.target)?.kind === 'image'
      ) {
        const entity = this.scene.get(operation.target);
        if (entity) ids.add(entity.id);
      }
    }
    return ids;
  }

  /** Keep direct visibility commits in the immutable normalized reconcile authority. */
  private synchronizeParsedImageVisibility(entityIds: ReadonlySet<string>): void {
    const parse = this.parseResultValue;
    if (!parse || entityIds.size === 0) return;
    let changed = false;
    const entities = parse.document.entities.map((entity) => {
      if (entity.kind !== 'image' || !entityIds.has(entity.id)) return entity;
      const current = this.scene.get(entity.id);
      if (!current || current.visible === (entity.visible ?? true)) return entity;
      changed = true;
      return Object.freeze({ ...entity, visible: current.visible });
    });
    if (!changed) return;
    const document = Object.freeze({
      ...parse.document,
      entities: Object.freeze(entities),
    });
    this.parseResultValue = Object.freeze({ ...parse, document });
  }

  private entityHitCommitImpact(batch: TransactionBatch): Readonly<{
    invalidate: boolean;
    staleProjectionIds: ReadonlySet<string>;
    removedIds: ReadonlySet<string>;
    spatialAnimations: readonly Readonly<{ key: string; endTimeMs: number }>[];
  }> {
    let invalidate = false;
    const staleProjectionIds = new Set<string>();
    const removedIds = new Set<string>();
    const spatialAnimations: Readonly<{ key: string; endTimeMs: number }>[] = [];
    const targetId = (target: CoreTarget): string | null => {
      const id = typeof target === 'string' ? target : this.scene.get(target)?.id;
      return id || null;
    };
    const markTargetStale = (target: CoreTarget): string | null => {
      const id = targetId(target);
      if (id) staleProjectionIds.add(id);
      return id;
    };
    for (const operation of batch.operations) {
      if (operation.type === 'add') {
        invalidate = true;
        staleProjectionIds.add(operation.entity.id);
        continue;
      }
      if (operation.type === 'remove') {
        invalidate = true;
        const id = targetId(operation.target);
        if (id) removedIds.add(id);
        continue;
      }
      if (operation.type === 'patch') {
        const geometryChanged = operation.changes.x !== undefined ||
          operation.changes.y !== undefined ||
          operation.changes.width !== undefined ||
          operation.changes.height !== undefined ||
          operation.changes.rotation !== undefined;
        if (geometryChanged || operation.changes.zIndex !== undefined) invalidate = true;
        if (geometryChanged) markTargetStale(operation.target);
        continue;
      }
      if (
        operation.type === 'animate' &&
        (operation.property === 'x' ||
          operation.property === 'y' ||
          operation.property === 'width' ||
          operation.property === 'height' ||
          operation.property === 'rotation')
      ) {
        invalidate = true;
        const id = markTargetStale(operation.target);
        if (id) {
          spatialAnimations.push(Object.freeze({
            key: `${id.length}:${id}:${operation.property}`,
            endTimeMs: this.animationClockMs + operation.durationMs,
          }));
        }
      }
    }
    return Object.freeze({
      invalidate,
      staleProjectionIds,
      removedIds,
      spatialAnimations: Object.freeze(spatialAnimations),
    });
  }

  private deleteSpatialHitAnimations(id: string): void {
    const prefix = `${id.length}:${id}:`;
    for (const key of this.spatialHitAnimationEnds.keys()) {
      if (key.startsWith(prefix)) this.spatialHitAnimationEnds.delete(key);
    }
  }

  private pruneCompletedSpatialHitAnimations(timeMs: number): void {
    for (const [key, endTimeMs] of this.spatialHitAnimationEnds) {
      if (endTimeMs <= timeMs) this.spatialHitAnimationEnds.delete(key);
    }
  }

  private onPointerDown(x: number, y: number, pointerId: number, button: number): void {
    if (this.destroyedValue) return;
    if (button === 0 && this.rootSelectionMode === 'immediate') {
      this.selectAtScreen({ x, y });
    }
    if (
      this.viewportPolicies.has('pan') &&
      (button === 0 || button === 1)
    ) {
      this.pan = {
        pointerId,
        source: button === 1 ? 'middle-pointer' : 'pointer',
        x,
        y,
      };
      this.requestExternalFrameLoop();
      if (this.autoRender) this.scheduler.setContinuous(true, 'gesture');
    }
  }

  private onPointerMove(x: number, y: number, pointerId: number): void {
    const pan = this.pan;
    if (!pan || pan.pointerId !== pointerId || this.destroyedValue) return;
    const delta = { x: x - pan.x, y: y - pan.y };
    pan.x = x;
    pan.y = y;
    const before = this.currentView;
    this.panBy(delta);
    this.publishRootViewportChange(pan.source, before);
  }

  private onPointerUp(pointerId: number): void {
    if (this.pan?.pointerId !== pointerId) return;
    this.pan = null;
    this.requestExternalFrameLoop();
    if (this.autoRender) this.scheduler.setContinuous(false, 'gesture-end');
  }

  private requireFrameReport(): FrameReport {
    const report = this.lastFrameReport;
    if (!report) throw new Error('Core v2 has not produced a frame report');
    return report;
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('CoreV2 is destroyed');
  }

  private publishRootViewportChange(
    source: CoreV2RootViewportChangeSource,
    before: CoreView,
  ): void {
    const view = this.currentView;
    if (
      before.x === view.x &&
      before.y === view.y &&
      before.scale === view.scale &&
      before.rotation === view.rotation
    ) {
      return;
    }
    const change = Object.freeze({ source, view } satisfies CoreV2RootViewportChange);
    for (const listener of [...this.rootViewportListeners]) listener(change);
  }

  private publishRootPointerInput(input: CoreV2RootPointerInput): void {
    if (this.destroyedValue) return;
    for (const listener of [...this.rootPointerListeners]) listener(input);
  }
}

/**
 * CoreScene owns the lifecycle of the renderer it receives. Core v2 instead
 * owns one Pixi renderer across private candidate scenes, so each scene gets a
 * revocable forwarding lease whose destroy never tears down the shared GPU
 * Application.
 */
class CoreV2RendererLease implements CoreRenderer {
  private destroyedValue = false;

  public constructor(private readonly renderer: PixiCoreV2Renderer) {}

  public get width(): number {
    return this.destroyedValue ? 0 : this.renderer.width;
  }

  public get height(): number {
    return this.destroyedValue ? 0 : this.renderer.height;
  }

  public get pixelRatio(): number {
    return this.destroyedValue ? 1 : this.renderer.pixelRatio;
  }

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  public resize(width: number, height: number, pixelRatio?: number): boolean {
    this.assertAlive();
    return this.renderer.resize(width, height, pixelRatio);
  }

  public setView(view: CoreView): boolean {
    this.assertAlive();
    return this.renderer.setView(view);
  }

  public flush(store: RenderStoreView): RendererFlushResult {
    this.assertAlive();
    return this.renderer.flush(store);
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    return true;
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('CoreV2 renderer lease is destroyed');
  }
}

export function createCoreV2(options: CoreV2Options = {}): Promise<CoreV2> {
  return CoreV2.create(options);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('fraction must be between zero and one');
  }
  return value;
}

function barPercentageHeight(
  projection: CoreV2BarProjection | undefined,
  percent: number,
): number {
  const reference = projection?.percentageReferenceHeight;
  if (
    typeof reference !== 'number' ||
    !Number.isFinite(reference) ||
    reference < 0
  ) {
    throw new Error('bar percentage animation requires a parser-owned height reference');
  }
  return reference * percent / 100;
}

function mergeSlotRanges(
  left: readonly SlotRange[],
  right: readonly SlotRange[],
): readonly SlotRange[] {
  const slots: number[] = [];
  for (const range of [...left, ...right]) {
    for (let slot = range.start; slot < range.end; slot += 1) slots.push(slot);
  }
  return contiguousSlotRanges(slots);
}

function contiguousSlotRanges(slots: readonly number[]): readonly SlotRange[] {
  const ordered = [...new Set(slots)].sort((left, right) => left - right);
  const ranges: SlotRange[] = [];
  for (const slot of ordered) {
    const previous = ranges.at(-1);
    if (previous?.end === slot) {
      ranges[ranges.length - 1] = Object.freeze({ start: previous.start, end: slot + 1 });
    } else {
      ranges.push(Object.freeze({ start: slot, end: slot + 1 }));
    }
  }
  return Object.freeze(ranges);
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function yieldCoreV2MainTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function screenToWorldWithFlips(
  point: CorePoint,
  view: CoreView,
  flipX: boolean,
  flipY: boolean,
): CorePoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('screen point must contain finite coordinates');
  }
  const scale = view.scale;
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new RangeError('view scale must be positive and finite');
  }
  const dx = point.x - view.x;
  const dy = point.y - view.y;
  const unflippedX = dx * (flipX ? -1 : 1);
  const unflippedY = dy * (flipY ? -1 : 1);
  const radians = -(view.rotation ?? 0) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotatedX = unflippedX * cosine - unflippedY * sine;
  const rotatedY = unflippedX * sine + unflippedY * cosine;
  return Object.freeze({
    x: rotatedX / scale,
    y: rotatedY / scale,
  });
}

function validateWorldTransform(view: CoreV2WorldTransform): void {
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.rotationDegrees)
  ) {
    throw new RangeError('world transform position and rotation must be finite');
  }
  if (!(view.scale > 0) || !Number.isFinite(view.scale)) {
    throw new RangeError('world transform scale must be positive and finite');
  }
  if (typeof view.flipX !== 'boolean' || typeof view.flipY !== 'boolean') {
    throw new TypeError('world transform flips must be booleans');
  }
}

function denseReconcileOptions(
  options: CoreV2ReconcileOptions,
  current: ParsePatchMapResult,
  candidate: ParsePatchMapResult,
  currentSelectionIds: readonly string[],
): CoreV2DenseReconcileOptions {
  const allowedRetainedOrderIds = Object.freeze([
    ...(options.allowedRetainedOrderIds ?? []),
    ...elementOrderDenseIds(current, options.allowedElementOrderIds),
    ...elementOrderDenseIds(candidate, options.allowedElementOrderIds),
    ...componentOrderDenseIds(current, options.allowedComponentOrderOwners),
    ...componentOrderDenseIds(candidate, options.allowedComponentOrderOwners),
  ]);
  return Object.freeze({
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
    ...(options.selectionIds === undefined
      ? {}
      : selectionReconcileOption(candidate, options.selectionIds, currentSelectionIds)),
    ...(allowedRetainedOrderIds.length === 0 ? {} : { allowedRetainedOrderIds }),
  });
}

function selectionReconcileOption(
  candidate: ParsePatchMapResult,
  semanticIds: readonly string[],
  currentSelectionIds: readonly string[],
): Readonly<{ readonly selectionIds?: readonly string[] }> {
  const selectionIds = semanticSelectionDenseIds(candidate, semanticIds);
  return sameStringArray(selectionIds, currentSelectionIds)
    ? Object.freeze({})
    : Object.freeze({ selectionIds });
}

function semanticSelectionDenseIds(
  parse: ParsePatchMapResult,
  semanticIds: readonly string[],
  componentTargets?: ReadonlyMap<string, IndexedComponentTarget | null>,
): readonly string[] {
  if (!Array.isArray(semanticIds)) throw new TypeError('selectionIds must be an array');
  const denseIds = new Set<string>();
  semanticIds.forEach((semanticId, index) => {
    if (typeof semanticId !== 'string' || semanticId.length === 0) {
      throw new TypeError(`selectionIds[${index}] must be a non-empty string`);
    }
    if (Object.hasOwn(parse.identity.entitySourceById, semanticId)) {
      denseIds.add(semanticId);
      return;
    }
    const components = parse.projection.componentsByEntityId ?? {};
    const separator = semanticId.indexOf('/');
    if (
      separator > 0 &&
      separator < semanticId.length - 1 &&
      componentTargets !== undefined
    ) {
      const indexed = componentTargets.get(componentTargetKey({
        ownerId: semanticId.slice(0, separator),
        componentId: semanticId.slice(separator + 1),
      }));
      if (indexed) denseIds.add(indexed.entityId);
    }
    for (const component of Object.values(components)) {
      const semanticOwnerId =
        parse.identity.entitySourceById[component.entityId]?.sourceElementId ??
        component.ownerId;
      if (
        component.logicalIdentity === semanticId ||
        (
          separator > 0 &&
          (
            component.ownerId === semanticId.slice(0, separator) ||
            semanticOwnerId === semanticId.slice(0, separator)
          ) &&
          component.componentId === semanticId.slice(separator + 1)
        )
      ) {
        denseIds.add(component.entityId);
      }
    }
    for (const entityId of parse.identity.entityIdsBySourceId[semanticId] ?? []) {
      if (Object.hasOwn(parse.identity.entitySourceById, entityId)) denseIds.add(entityId);
    }
  });
  return Object.freeze([...denseIds]);
}

function resolvePresentationFillOverrides(
  parse: ParsePatchMapResult,
  overrides: readonly CoreV2PresentationFillOverride[],
): readonly CoreV2PresentationFillOverride[] {
  const resolved = new Map<string, number>();
  for (const { id, packedColor } of overrides) {
    for (const entityId of semanticPresentationFillDenseIds(parse, id)) {
      resolved.set(entityId, packedColor);
    }
  }
  return Object.freeze([...resolved].map(([id, packedColor]) =>
    Object.freeze({ id, packedColor }),
  ).sort((left, right) => left.id.localeCompare(right.id)));
}

function semanticPresentationFillDenseIds(
  parse: ParsePatchMapResult,
  semanticId: string,
): readonly string[] {
  const backgroundIds = Object.values(parse.projection.componentsByEntityId ?? {})
    .filter((component) =>
      component.ownerId === semanticId &&
      component.renderRole === 'background-geometry'
    )
    .map(({ entityId }) => entityId)
    .sort();
  return backgroundIds.length > 0
    ? Object.freeze(backgroundIds)
    : semanticSelectionDenseIds(parse, [semanticId]);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function elementOrderDenseIds(
  parse: ParsePatchMapResult,
  elementIds: readonly string[] | undefined,
): readonly string[] {
  if (elementIds === undefined || elementIds.length === 0) return Object.freeze([]);
  const ids = new Set<string>();
  elementIds.forEach((elementId, index) => {
    if (typeof elementId !== 'string' || elementId.length === 0) {
      throw new TypeError(`allowedElementOrderIds[${index}] must be a non-empty string`);
    }
    for (const entityId of parse.identity.entityIdsBySourceId[elementId] ?? []) {
      ids.add(entityId);
    }
  });
  return Object.freeze([...ids].sort());
}

function componentOrderDenseIds(
  parse: ParsePatchMapResult,
  owners: readonly string[] | undefined,
): readonly string[] {
  if (owners === undefined || owners.length === 0) return Object.freeze([]);
  const ownerSet = new Set(owners.map((owner, index) => {
    if (typeof owner !== 'string' || owner.length === 0) {
      throw new TypeError(`allowedComponentOrderOwners[${index}] must be a non-empty string`);
    }
    return owner;
  }));
  const ids = new Set<string>();
  for (const component of parse.identity.components) {
    if (!ownerSet.has(component.sourceElementId)) continue;
    for (const entityId of component.entityIds) ids.add(entityId);
  }
  const components = parse.projection.componentsByEntityId ?? {};
  for (const entityId of Object.keys(components).sort()) {
    const component = components[entityId];
    if (component === undefined) continue;
    const semanticOwner = parse.identity.entitySourceById[entityId]?.sourceElementId;
    if (ownerSet.has(component.ownerId) || (semanticOwner !== undefined && ownerSet.has(semanticOwner))) {
      ids.add(entityId);
    }
  }
  return Object.freeze([...ids].sort());
}

function reconcileFacts(
  plan: CoreV2DenseReconcilePlan,
  semanticChanged: boolean,
  before: CoreV2ReconcileFactStamp,
  after: CoreV2ReconcileFactStamp,
): CoreV2ReconcileFacts {
  return Object.freeze({
    semanticChanged,
    denseChanged: plan.batch.operations.length > 0,
    structuralChanged: plan.summary.added > 0 || plan.summary.removed > 0,
    structuralReplacement: plan.summary.replaced > 0,
    fullRebuild: false,
    revisionBefore: before.revision,
    revisionAfter: after.revision,
    entityCountBefore: before.entityCount,
    entityCountAfter: after.entityCount,
    selectionCountBefore: before.selectionCount,
    selectionCountAfter: after.selectionCount,
  });
}

function incrementalDenseEntityIds(
  parse: ParsePatchMapResult,
  rootIds: readonly string[],
): readonly string[] {
  const ids = new Set<string>();
  for (const rootId of rootIds) {
    for (const entityId of parse.identity.entityIdsBySourceId[rootId] ?? []) {
      ids.add(entityId);
    }
  }
  return Object.freeze([...ids]);
}

function directElementAngleEntityIds(
  parse: ParsePatchMapResult,
  updates: readonly CoreV2DirectElementAngleUpdate[],
): readonly string[] | undefined {
  const ids = new Set<string>();
  for (const update of updates) {
    const entityIds = parse.identity.entityIdsBySourceId[update.id];
    if (entityIds === undefined || entityIds.length === 0) return undefined;
    for (const entityId of entityIds) ids.add(entityId);
  }
  return ids.size === 0 ? undefined : Object.freeze([...ids]);
}

function directTextEntityIds(
  updates: readonly CoreV2DirectTextUpdate[],
  targets: ReadonlyMap<string, IndexedTextTarget | null>,
): readonly string[] | undefined {
  const ids = new Set<string>();
  for (const update of updates) {
    const indexed = targets.get(coreV2TextTargetKey({
      kind: 'component',
      ownerId: update.ownerId,
      id: update.componentId,
    }));
    if (indexed === undefined || indexed === null) return undefined;
    ids.add(indexed.entityId);
  }
  return ids.size === 0 ? undefined : Object.freeze([...ids]);
}

function directTextParseTargetHints(
  updates: readonly CoreV2DirectTextUpdate[],
  targets: ReadonlyMap<string, IndexedComponentTarget | null>,
): readonly CoreV2DirectTextParseTargetIndex[] | undefined {
  const hints: CoreV2DirectTextParseTargetIndex[] = [];
  for (const update of updates) {
    const indexed = targets.get(componentTargetKey(update));
    if (
      indexed === undefined ||
      indexed === null ||
      indexed.rootIndex === null ||
      indexed.componentIndex === null ||
      indexed.componentPath === null
    ) {
      return undefined;
    }
    hints.push(indexed as CoreV2DirectTextParseTargetIndex);
  }
  return hints.length === 0 ? undefined : Object.freeze(hints);
}

function directBarEntityIds(
  updates: readonly CoreV2DirectBarHeightUpdate[],
  targets: ReadonlyMap<string, IndexedComponentTarget | null>,
): readonly string[] | undefined {
  const ids = new Set<string>();
  for (const update of updates) {
    const indexed = targets.get(componentTargetKey(update));
    if (indexed === undefined || indexed === null) return undefined;
    ids.add(indexed.entityId);
  }
  return ids.size === 0 ? undefined : Object.freeze([...ids]);
}

function incrementalBarPresentationCompatible(
  previous: Readonly<Record<string, CoreV2BarProjection>>,
  next: Readonly<Record<string, CoreV2BarProjection>>,
  entityIds: readonly string[],
): boolean {
  for (const entityId of entityIds) {
    const before = previous[entityId];
    const after = next[entityId];
    if (before === undefined || after === undefined) {
      continue;
    }
    if (
      before.ownerId !== after.ownerId ||
      before.componentId !== after.componentId ||
      before.animation !== after.animation ||
      before.animationDuration !== after.animationDuration
    ) {
      return false;
    }
  }
  return true;
}

function changedProjectionEntityIds(
  previous: CoreV2ProjectionIndex,
  next: CoreV2ProjectionIndex,
): readonly string[] {
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const entityId of Object.keys(previous.byEntityId)) {
    seen.add(entityId);
    if (previous.byEntityId[entityId] !== next.byEntityId[entityId]) {
      changed.push(entityId);
    }
  }
  for (const entityId of Object.keys(next.byEntityId)) {
    if (!seen.has(entityId)) changed.push(entityId);
  }
  return Object.freeze(changed);
}

function reconcileDirectBarHeightParse(
  input: unknown,
  previous: ParsePatchMapResult,
  updates: readonly CoreV2DirectBarHeightUpdate[],
  componentTargets: ReadonlyMap<string, IndexedComponentTarget | null>,
  recordStrategy: CoreV2StableRecordStrategy,
): ParsePatchMapResult | null {
  if (!isOwnedCoreV2Dataset(input) || updates.length === 0) return null;
  const entities = [...previous.document.entities];
  const selectedEntityProjections = Object.create(null) as Record<
    string,
    CoreV2EntityProjection
  >;
  const selectedBarProjections = Object.create(null) as Record<
    string,
    CoreV2BarProjection
  >;
  const selectedComponentProjections = Object.create(null) as Record<
    string,
    CoreV2ComponentVisualProjection
  >;
  const entityIds: string[] = [];
  const seenTargets = new Set<string>();

  for (const update of updates) {
    if (!Number.isFinite(update.height) || update.height < 0) return null;
    const targetKey = componentTargetKey(update);
    if (seenTargets.has(targetKey)) return null;
    seenTargets.add(targetKey);
    const indexed = componentTargets.get(targetKey);
    if (
      indexed === undefined ||
      indexed === null ||
      indexed.rootIndex === null ||
      indexed.componentIndex === null
    ) {
      return null;
    }
    const root = input[indexed.rootIndex];
    if (root?.type !== 'item' || root.id !== update.ownerId) return null;
    const component = root.components[indexed.componentIndex];
    if (
      component?.type !== 'bar' ||
      component.id !== update.componentId ||
      typeof component.size !== 'object' ||
      component.size === null ||
      !('height' in component.size) ||
      typeof component.size.height !== 'number' ||
      component.size.height !== update.height
    ) {
      return null;
    }

    const entityIndex = indexed.entityIndex;
    const entity = previous.document.entities[entityIndex];
    const bar = previous.projection.barsByEntityId?.[indexed.entityId];
    const projection = previous.projection.byEntityId[indexed.entityId];
    const ownerProjection = bar === undefined
      ? undefined
      : previous.projection.byEntityId[bar.ownerId];
    if (
      entity?.id !== indexed.entityId ||
      entity.kind !== 'bar' ||
      bar === undefined ||
      projection === undefined ||
      ownerProjection === undefined
    ) {
      return null;
    }

    const oldHeight = projection.localBounds[3];
    const deltaHeight = update.height - oldHeight;
    const localDeltaY = directBarPlacementDeltaY(bar.placement, deltaHeight);
    const ownerAffine = ownerProjection.affine;
    const affine = freezeCoreV2Affine(
      projection.affine[0],
      projection.affine[1],
      projection.affine[2],
      projection.affine[3],
      projection.affine[4] + ownerAffine[2] * localDeltaY,
      projection.affine[5] + ownerAffine[3] * localDeltaY,
    );
    const dense = projectCoreV2SignedRect(
      {
        x: affine[4],
        y: affine[5],
        rotation: projection.rotationDegrees,
        scaleX: projection.scaleX,
        scaleY: projection.scaleY,
      },
      projection.localBounds[2],
      update.height,
    );
    const localBounds = freezeCoreV2Bounds(
      projection.localBounds[0],
      projection.localBounds[1],
      projection.localBounds[2],
      update.height,
    );
    entities[entityIndex] = Object.freeze({
      ...entity,
      x: dense.x,
      y: dense.y,
      width: dense.width,
      height: dense.height,
    });
    selectedEntityProjections[indexed.entityId] = Object.freeze({
      ...projection,
      localBounds,
      affine,
      worldBasis: coreV2AffineBasis(affine),
      visibleCenter: coreV2AffineCenter(affine, localBounds),
    });
    selectedBarProjections[indexed.entityId] = Object.freeze({
      ...bar,
      destinationHeight: update.height,
    });
    const componentProjection =
      previous.projection.componentsByEntityId?.[indexed.entityId];
    if (componentProjection !== undefined) {
      selectedComponentProjections[indexed.entityId] = Object.freeze({
        ...componentProjection,
        authoredSize: component.size,
      });
    }
    entityIds.push(indexed.entityId);
  }

  const entityProjections = patchCoreV2StableRecord(
    previous.projection.byEntityId,
    selectedEntityProjections,
    entityIds,
    recordStrategy,
    true,
  );
  const barProjections = patchCoreV2StableRecord(
    previous.projection.barsByEntityId,
    selectedBarProjections,
    entityIds,
    recordStrategy,
    true,
  );
  const componentProjections = patchCoreV2StableRecord(
    previous.projection.componentsByEntityId,
    selectedComponentProjections,
    entityIds,
    recordStrategy,
    true,
  );
  if (
    entityProjections === null ||
    barProjections === null ||
    componentProjections === null
  ) {
    return null;
  }
  const document = Object.freeze({
    ...previous.document,
    entities: Object.freeze(entities),
  });
  const projection = Object.freeze({
    ...previous.projection,
    byEntityId: entityProjections,
    componentsByEntityId: componentProjections,
    barsByEntityId: barProjections,
  });
  return Object.freeze({
    ...previous,
    document,
    projection,
  });
}

function directBarPlacementDeltaY(
  placement: NonNullable<CoreV2ProjectionIndex['barsByEntityId']>[string]['placement'],
  deltaHeight: number,
): number {
  if (
    placement === 'bottom' ||
    placement === 'left-bottom' ||
    placement === 'right-bottom'
  ) {
    return -deltaHeight;
  }
  if (placement === 'left' || placement === 'right' || placement === 'center') {
    return -deltaHeight / 2;
  }
  return 0;
}

function compactCoreV2ProjectionStableRecords(
  projection: CoreV2ProjectionIndex,
): void {
  for (const record of coreV2ProjectionStableRecords(projection)) {
    compactCoreV2StableRecord(record);
  }
}

function rollbackCoreV2ProjectionStableRecords(
  candidate: CoreV2ProjectionIndex,
  previous: CoreV2ProjectionIndex,
): void {
  const candidateRecords = coreV2ProjectionStableRecords(candidate);
  const previousRecords = coreV2ProjectionStableRecords(previous);
  for (let index = 0; index < candidateRecords.length; index += 1) {
    rollbackCoreV2StableRecord(
      candidateRecords[index],
      previousRecords[index],
    );
  }
}

function coreV2ProjectionStableRecords(
  projection: CoreV2ProjectionIndex,
): readonly (Readonly<Record<string, unknown>> | undefined)[] {
  return [
    projection.byEntityId,
    projection.componentsByEntityId,
    projection.backgroundsByEntityId,
    projection.imagesByEntityId,
    projection.textsByEntityId,
    projection.barsByEntityId,
    projection.relationsByEntityId,
  ];
}

function structuralTargetMappingsReusable(
  current: ParsePatchMapResult,
  candidate: ParsePatchMapResult,
  options: CoreV2ReconcileOptions,
): boolean {
  if (
    (options.allowedElementOrderIds?.length ?? 0) === 0 ||
    current.identity.counts.entities !== candidate.identity.counts.entities ||
    current.identity.counts.sourceComponents !==
      candidate.identity.counts.sourceComponents
  ) {
    return false;
  }
  for (const entityId of candidate.identity.entityIds) {
    const before = current.identity.entitySourceById[entityId];
    const after = candidate.identity.entitySourceById[entityId];
    if (
      before === undefined ||
      after === undefined ||
      before.sourceElementId !== after.sourceElementId ||
      before.instanceId !== after.instanceId ||
      before.componentId !== after.componentId
    ) {
      return false;
    }
  }
  return true;
}

interface CoreV2ReconcileFactStamp {
  readonly revision: number;
  readonly entityCount: number;
  readonly selectionCount: number;
}

function reconcileFactStamp(scene: CoreV2Scene): CoreV2ReconcileFactStamp {
  return Object.freeze({
    revision: scene.revision,
    entityCount: scene.entityCount,
    selectionCount: scene.selection().refs.length,
  });
}

function freezeReconcileResult<T extends CoreV2ReconcileResult>(result: T): T {
  return Object.freeze({
    ...result,
    timings: Object.freeze(result.timings),
    facts: Object.freeze(result.facts),
  }) as T;
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquivalent(value, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && jsonEquivalent(left[key], right[key]),
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object') return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Conservative key for parser configuration reused by the incremental path.
 * Unsupported runtime shapes deliberately disable reuse; the canonical parser
 * remains authoritative for them.
 */
function incrementalParseOptionsKey(options: ParsePatchMapOptions): string | null {
  const colors = options.colors;
  if (colors === undefined) return 'colors:default';
  if (!isPlainRecord(colors)) return null;
  const entries: string[] = [];
  for (const key of Object.keys(colors).sort()) {
    const value = colors[key];
    if (typeof value === 'string') {
      entries.push(JSON.stringify([key, 'string', value]));
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      entries.push(JSON.stringify([key, 'number', Object.is(value, -0) ? 0 : value]));
    } else if (value === undefined) {
      entries.push(JSON.stringify([key, 'undefined']));
    } else {
      return null;
    }
  }
  return `colors:${entries.join('|')}`;
}

const IMAGE_PROJECTION_PATCH_FIELDS = Object.freeze([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'source',
] as const satisfies readonly (keyof EntityPatch)[]);

const IMAGE_PROJECTION_ANIMATION_FIELDS: ReadonlySet<string> = new Set([
  'x',
  'y',
  'width',
  'height',
  'rotation',
]);

function unsupportedDirectImageMutation(index: number, operation: string): TypeError {
  return new TypeError(
    `CoreV2.commit operation ${index} (${operation}) cannot update the image projection sidecar; ` +
    'submit PATCH MAP JSON through CoreV2.reconcile instead',
  );
}

function normalizeCleanupFailure(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function freezeProjectionReplacements(
  source: CoreV2ProjectionIndex,
  replacements: Readonly<Record<string, CoreV2EntityProjection>>,
): CoreV2ProjectionIndex {
  const byEntityId = Object.freeze({
    ...source.byEntityId,
    ...replacements,
  });
  return Object.freeze({
    ...source,
    byEntityId,
  });
}

function indexComponentTargets(
  parse: ParsePatchMapResult,
): Map<string, IndexedComponentTarget | null> {
  const targets = new Map<string, IndexedComponentTarget | null>();
  const entityIndices = new Map<string, number>();
  for (let index = 0; index < parse.document.entities.length; index += 1) {
    const entity = parse.document.entities[index];
    if (entity !== undefined) entityIndices.set(entity.id, index);
  }
  const indexedByEntityId = new Map<string, IndexedComponentTarget | null>();
  const resolveIndexed = (
    entityId: string,
    semanticOwnerId: string,
  ): IndexedComponentTarget | null => {
    const cached = indexedByEntityId.get(entityId);
    if (cached !== undefined) return cached;
    const indexed = indexedComponentTarget(
      parse,
      entityId,
      semanticOwnerId,
      entityIndices,
    );
    indexedByEntityId.set(entityId, indexed);
    return indexed;
  };
  const components = parse.projection.componentsByEntityId ?? {};
  for (const entityId of Object.keys(components)) {
    const component = components[entityId];
    if (!component) continue;
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      component.ownerId;
    const indexed = resolveIndexed(entityId, semanticOwnerId);
    if (indexed === null) continue;
    indexComponentTarget(targets, component.ownerId, component.componentId, indexed);
    if (semanticOwnerId !== component.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, component.componentId, indexed);
    }
  }
  const bars = parse.projection.barsByEntityId ?? {};
  for (const entityId of Object.keys(bars)) {
    if (components[entityId] !== undefined) continue;
    const bar = bars[entityId];
    if (!bar) continue;
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      bar.ownerId;
    const indexed = resolveIndexed(entityId, semanticOwnerId);
    if (indexed === null) continue;
    indexComponentTarget(targets, bar.ownerId, bar.componentId, indexed);
    if (semanticOwnerId !== bar.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, bar.componentId, indexed);
    }
  }
  const texts = parse.projection.textsByEntityId ?? {};
  for (const entityId of Object.keys(texts)) {
    if (components[entityId] !== undefined) continue;
    const text = texts[entityId];
    if (
      text?.targetKind !== 'component' ||
      text.ownerId === undefined ||
      text.componentId === undefined
    ) {
      continue;
    }
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      text.ownerId;
    const indexed = resolveIndexed(entityId, semanticOwnerId);
    if (indexed === null) continue;
    indexComponentTarget(targets, text.ownerId, text.componentId, indexed);
    if (semanticOwnerId !== text.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, text.componentId, indexed);
    }
  }
  return targets;
}

function indexedComponentTarget(
  parse: ParsePatchMapResult,
  entityId: string,
  semanticOwnerId: string,
  entityIndices: ReadonlyMap<string, number>,
): IndexedComponentTarget | null {
  const entityIndex = entityIndices.get(entityId);
  if (entityIndex === undefined) return null;
  const source = parse.identity.entitySourceById[entityId];
  const rootIndex = directTopLevelSourceIndex(source?.sourceElementPath);
  const componentSlots = directTopLevelComponentSourceSlots(source?.componentPath);
  return Object.freeze({
    entityId,
    entityIndex,
    semanticOwnerId,
    rootIndex:
      rootIndex !== null && rootIndex === componentSlots?.rootIndex
        ? rootIndex
        : null,
    componentIndex: componentSlots?.componentIndex ?? null,
    componentPath: source?.componentPath ?? null,
  });
}

function directTopLevelSourceIndex(path: string | undefined): number | null {
  if (
    path === undefined ||
    !path.startsWith('$[') ||
    !path.endsWith(']') ||
    path.indexOf(']', 2) !== path.length - 1
  ) {
    return null;
  }
  const index = Number(path.slice(2, -1));
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function directTopLevelComponentSourceSlots(
  path: string | undefined,
): Readonly<{ readonly rootIndex: number; readonly componentIndex: number }> | null {
  if (path === undefined || !path.startsWith('$[') || !path.endsWith(']')) return null;
  const rootEnd = path.indexOf(']', 2);
  const componentPrefix = '].components[';
  if (
    rootEnd < 3 ||
    path.slice(rootEnd, rootEnd + componentPrefix.length) !== componentPrefix
  ) {
    return null;
  }
  const rootIndex = Number(path.slice(2, rootEnd));
  const componentIndex = Number(path.slice(rootEnd + componentPrefix.length, -1));
  if (
    !Number.isSafeInteger(rootIndex) ||
    rootIndex < 0 ||
    !Number.isSafeInteger(componentIndex) ||
    componentIndex < 0
  ) {
    return null;
  }
  return Object.freeze({ rootIndex, componentIndex });
}

function componentVisualProjection(
  projection: CoreV2ProjectionIndex | null,
  entityId: string,
): CoreV2ComponentVisualProjection | null {
  if (projection === null) return null;
  const component = projection.componentsByEntityId?.[entityId];
  if (component !== undefined) return component;

  const bar = projection.barsByEntityId?.[entityId];
  if (bar !== undefined) {
    return Object.freeze({
      entityId,
      ownerId: bar.ownerId,
      componentId: bar.componentId,
      componentType: 'bar',
      logicalIdentity: entityId,
      renderRole: 'ordinary-geometry',
    });
  }

  const text = projection.textsByEntityId?.[entityId];
  if (
    text?.targetKind === 'component' &&
    text.ownerId !== undefined &&
    text.componentId !== undefined
  ) {
    return Object.freeze({
      entityId,
      ownerId: text.ownerId,
      componentId: text.componentId,
      componentType: 'text',
      logicalIdentity: entityId,
      renderRole: 'text',
    });
  }
  return null;
}

function indexComponentTarget(
  targets: Map<string, IndexedComponentTarget | null>,
  ownerId: string,
  componentId: string,
  indexed: IndexedComponentTarget,
): void {
  const key = componentTargetKey({ ownerId, componentId });
  const previous = targets.get(key);
  if (previous === undefined || previous?.entityId === indexed.entityId) {
    targets.set(key, indexed);
    return;
  }
  // A semantic grid template may expand to many component entities. The
  // source-owner target is deliberately unavailable instead of selecting an
  // arbitrary instance; callers can query an instance-qualified owner.
  targets.set(key, null);
}

function normalizeLogicalPresentationPolicy(
  input: CoreV2PresentationPolicyInput,
  revision: number,
): CoreV2LogicalPresentationPolicy {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('presentation policy must be an object');
  }
  const deEmphasisAlpha = input.deEmphasisAlpha ?? 0.2;
  if (
    !Number.isFinite(deEmphasisAlpha) ||
    deEmphasisAlpha < 0 ||
    deEmphasisAlpha > 1
  ) {
    throw new RangeError('deEmphasisAlpha must be between zero and one');
  }
  return Object.freeze({
    revision,
    highlightIds: input.highlightIds === undefined || input.highlightIds === null
      ? null
      : freezeLogicalIds(input.highlightIds, 'highlightIds'),
    deEmphasisAlpha,
    hiddenLayerIds: freezeLogicalIds(input.hiddenLayerIds ?? [], 'hiddenLayerIds'),
    fillOverrides: freezePresentationFillOverrides(input.fillOverrides ?? []),
  });
}

function freezePresentationFillOverrides(
  values: readonly CoreV2PresentationFillOverride[],
): readonly CoreV2PresentationFillOverride[] {
  if (!Array.isArray(values)) throw new TypeError('fillOverrides must be an array');
  const byId = new Map<string, CoreV2PresentationFillOverride>();
  for (const [index, value] of values.entries()) {
    if (!isPlainRecord(value)) {
      throw new TypeError(`fillOverrides[${index}] must be an object`);
    }
    const { id, packedColor } = value;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError(`fillOverrides[${index}].id must be a non-empty string`);
    }
    if (
      typeof packedColor !== 'number' ||
      !Number.isSafeInteger(packedColor) ||
      packedColor < 0 ||
      packedColor > 0xffffffff
    ) {
      throw new RangeError(`fillOverrides[${index}].packedColor must be a packed RGBA integer`);
    }
    if (byId.has(id)) throw new RangeError(`fillOverrides contains duplicate id ${id}`);
    byId.set(id, Object.freeze({ id, packedColor: packedColor >>> 0 }));
  }
  return Object.freeze([...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  ));
}

function freezeLogicalIds(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return Object.freeze([...new Set(values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  }))].sort());
}

function sameLogicalPresentationPolicy(
  left: CoreV2LogicalPresentationPolicy | null,
  right: CoreV2LogicalPresentationPolicy,
): boolean {
  return left !== null &&
    left.deEmphasisAlpha === right.deEmphasisAlpha &&
    sameNullableStringArray(left.highlightIds, right.highlightIds) &&
    sameStringArray(left.hiddenLayerIds, right.hiddenLayerIds) &&
    samePresentationFillOverrides(left.fillOverrides, right.fillOverrides);
}

function samePresentationFillOverrides(
  left: readonly CoreV2PresentationFillOverride[],
  right: readonly CoreV2PresentationFillOverride[],
): boolean {
  return left.length === right.length && left.every((value, index) =>
    value.id === right[index]?.id && value.packedColor === right[index]?.packedColor
  );
}

function sameNullableStringArray(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  return left === null || right === null ? left === right : sameStringArray(left, right);
}

function normalizeRefreshTarget(
  target: unknown,
  index: number,
): CoreV2SemanticTarget {
  if (!isPlainRecord(target)) {
    throw new TypeError(`refresh targets[${index}] must be an object`);
  }
  if (target.kind !== 'element' && target.kind !== 'component') {
    throw new TypeError(`refresh targets[${index}].kind is unsupported`);
  }
  if (typeof target.id !== 'string' || target.id.length === 0) {
    throw new TypeError(`refresh targets[${index}].id must be a non-empty string`);
  }
  if (target.kind === 'component') {
    if (typeof target.ownerId !== 'string' || target.ownerId.length === 0) {
      throw new TypeError(`refresh targets[${index}].ownerId must be a non-empty string`);
    }
    return Object.freeze({ kind: 'component', ownerId: target.ownerId, id: target.id });
  }
  return Object.freeze({ kind: 'element', id: target.id });
}

function componentRefreshEntityIds(
  targets: ReadonlyMap<string, IndexedComponentTarget | null>,
  target: Extract<CoreV2SemanticTarget, { readonly kind: 'component' }>,
): readonly string[] {
  const indexed = targets.get(componentTargetKey({
    ownerId: target.ownerId,
    componentId: target.id,
  }));
  return indexed === undefined || indexed === null
    ? Object.freeze([])
    : Object.freeze([indexed.entityId]);
}

function normalizeComponentVisualTarget(
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

function componentTargetKey(target: CoreV2ComponentVisualTarget): string {
  return `${target.ownerId.length}:${target.ownerId}:${target.componentId}`;
}

function indexTextTargets(
  parse: ParsePatchMapResult,
): Map<string, IndexedTextTarget | null> {
  const targets = new Map<string, IndexedTextTarget | null>();
  const texts = parse.projection.textsByEntityId ?? {};
  for (const entityId of Object.keys(texts)) {
    const text = texts[entityId];
    if (!text) continue;
    const source = parse.identity.entitySourceById[entityId];
    if (text.targetKind === 'element') {
      const sourceId = source?.sourceElementId ?? entityId;
      indexTextTarget(
        targets,
        { kind: 'element', id: sourceId },
        Object.freeze({ entityId, semanticOwnerId: sourceId }),
      );
      continue;
    }
    if (!text.ownerId || !text.componentId) continue;
    const semanticOwnerId = source?.sourceElementId ?? text.ownerId;
    const indexed = Object.freeze({ entityId, semanticOwnerId });
    indexTextTarget(
      targets,
      { kind: 'component', ownerId: text.ownerId, id: text.componentId },
      indexed,
    );
    if (semanticOwnerId !== text.ownerId) {
      indexTextTarget(
        targets,
        { kind: 'component', ownerId: semanticOwnerId, id: text.componentId },
        indexed,
      );
    }
  }
  return targets;
}

function indexTextTarget(
  targets: Map<string, IndexedTextTarget | null>,
  target: CoreV2TextTarget,
  indexed: IndexedTextTarget,
): void {
  const key = coreV2TextTargetKey(target);
  const previous = targets.get(key);
  if (previous === undefined || previous?.entityId === indexed.entityId) {
    targets.set(key, indexed);
    return;
  }
  // A source grid template can expand to many instance-qualified text leaves.
  // Keep the template target explicitly ambiguous instead of selecting one.
  targets.set(key, null);
}

export function normalizeCoreV2TextTarget(target: CoreV2TextTarget): CoreV2TextTarget {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('text target must be an object');
  }
  if (target.kind === 'element') {
    assertExactTextTargetKeys(target, ['kind', 'id']);
    assertTextTargetId(target.id, 'text target id');
    return Object.freeze({ kind: 'element', id: target.id });
  }
  if (target.kind === 'component') {
    assertExactTextTargetKeys(target, ['kind', 'ownerId', 'id']);
    assertTextTargetId(target.ownerId, 'text target ownerId');
    assertTextTargetId(target.id, 'text target id');
    return Object.freeze({ kind: 'component', ownerId: target.ownerId, id: target.id });
  }
  throw new TypeError('text target kind must be "element" or "component"');
}

function assertExactTextTargetKeys(
  target: object,
  expected: readonly string[],
): void {
  const keys = Reflect.ownKeys(target);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string' || !expected.includes(key))
  ) {
    throw new TypeError(`text target must contain exactly ${expected.join(', ')}`);
  }
}

function assertTextTargetId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function coreV2TextTargetKey(target: CoreV2TextTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

function textProjectionMatchesTarget(
  projection: CoreV2TextProjection,
  target: CoreV2TextTarget,
  semanticOwnerId: string,
): boolean {
  if (target.kind === 'element') {
    return projection.targetKind === 'element' && semanticOwnerId === target.id;
  }
  return projection.targetKind === 'component' &&
    projection.componentId === target.id &&
    (projection.ownerId === target.ownerId || semanticOwnerId === target.ownerId);
}

function freezeTextSemanticSignatures(
  semantic: CoreV2TextProjection,
): CoreV2TextSemanticSignatures {
  return Object.freeze({
    content: semantic.contentSignature,
    style: semantic.styleSignature,
    layout: semantic.layoutSignature,
  });
}

function rendererTextProbeCorrelates(
  renderer: CoreV2TextRendererProbe | null,
  entityId: string,
  semantic: CoreV2TextSemanticSignatures,
): renderer is CoreV2TextRendererProbe {
  return renderer !== null &&
    renderer.entityId === entityId &&
    renderer.publicationStatus === 'current' &&
    renderer.objectCount === 1 &&
    renderer.staleGlyphCount === 0 &&
    renderer.route !== 'none' &&
    renderer.rendererKind !== 'none' &&
    renderer.route === renderer.rendererKind &&
    sameTextSemanticSignatures(renderer.semanticSignatures, semantic) &&
    sameTextAttachedSemantic(renderer.attachedSignatures, semantic) &&
    sameTextAttachedSemantic(renderer.lastRenderedSignatures, semantic) &&
    renderer.attachedSignatures?.renderer === renderer.lastRenderedSignatures?.renderer &&
    renderer.lastRenderedFrame !== null;
}

function rendererTextAbsenceCorrelates(
  renderer: CoreV2TextRendererProbe | null,
  entityId: string,
  semantic: CoreV2TextSemanticSignatures,
): renderer is CoreV2TextRendererProbe {
  return renderer !== null &&
    renderer.entityId === entityId &&
    renderer.publicationStatus === 'current' &&
    renderer.route === 'none' &&
    renderer.rendererKind === 'none' &&
    renderer.routeReason === 'not-attached' &&
    renderer.objectCount === 0 &&
    renderer.staleGlyphCount === 0 &&
    sameTextSemanticSignatures(renderer.semanticSignatures, semantic) &&
    renderer.attachedSignatures === null &&
    renderer.lastRenderedSignatures === null &&
    renderer.lastRenderedFrame !== null;
}

function sameTextSemanticSignatures(
  left: CoreV2TextSemanticSignatures,
  right: CoreV2TextSemanticSignatures,
): boolean {
  return left.content === right.content &&
    left.style === right.style &&
    left.layout === right.layout;
}

function sameTextAttachedSemantic(
  attached: CoreV2TextAttachedSignatures | null,
  semantic: CoreV2TextSemanticSignatures,
): boolean {
  return attached !== null && sameTextSemanticSignatures(attached, semantic);
}

function rendererTextPaintCorrelates(
  paint: CoreV2EntityPaintProbe | null,
  entityId: string,
  packedColor: number,
  opacity: number,
): paint is CoreV2EntityPaintProbe {
  const color = packedColor >>> 0;
  return paint !== null &&
    paint.entityId === entityId &&
    paint.lane === 'text' &&
    paint.rendererKind === 'text' &&
    paint.primitiveCount === 1 &&
    paint.renderObjectCount === 1 &&
    paint.packedTint === color &&
    paint.rgbTint === color >>> 8 &&
    paint.alpha === ((color & 0xff) / 255) * opacity;
}

function rendererTextLaneCorrelates(
  lanes: CoreV2RenderLaneSnapshot | null,
): lanes is CoreV2RenderLaneSnapshot {
  return lanes !== null &&
    lanes.text.role === 'text' &&
    lanes.text.renderObjectCount >= 1 &&
    lanes.text.visiblePrimitiveCount >= 1;
}

function freezeTextRendererProductProbe(
  semantic: CoreV2TextProjection,
  semanticSignatures: CoreV2TextSemanticSignatures,
  renderer: CoreV2TextRendererProbe | null,
): CoreV2TextRendererProductProbe {
  return Object.freeze({
    semanticRoute: semantic.rendererRoute,
    route: renderer?.route ?? null,
    rendererKind: renderer?.rendererKind ?? 'none',
    routeReason: renderer?.routeReason ?? 'not-attached',
    objectCount: renderer?.objectCount ?? 0,
    semanticSignatures,
    attachedSignatures: renderer?.attachedSignatures ?? null,
    lastRenderedSignatures: renderer?.lastRenderedSignatures ?? null,
    lastRenderedFrame: renderer?.lastRenderedFrame ?? null,
    staleGlyphCount: renderer?.staleGlyphCount ?? 0,
  });
}

export type { EntityPatch };
