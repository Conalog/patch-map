import { CoreScene } from '../core-v1/scene';
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
  ParseDiagnostic,
  ParseIdentityIndex,
  ParsePatchMapOptions,
  ParsePatchMapResult,
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
import { CoreV2PresentationProjectionStore } from './presentation-projection';
import {
  createCoreV2PaintOrderProductProbe,
  type CoreV2PaintOrderProductProbe,
} from './paint-order-product';
import { parsePatchMapV010, projectCoreV2IntrinsicImageAffine } from './parser';
import { withRendererDegradationDiagnostics } from './renderers/degradation';
import { InvalidationScheduler, type FrameSchedulerDebug } from './scheduler';
import {
  planCoreV2SceneReconcile,
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
  CoreV2RenderLaneSnapshot,
  CoreV2TextAttachedSignatures,
  CoreV2TextRendererKind,
  CoreV2TextRendererProbe,
  CoreV2TextSemanticSignatures,
  CoreV2WorldOrientation,
  PixiCoreV2RendererDebug,
} from './renderers/types';
import {
  CoreV2EntityHitIndex,
  coreV2EntityWorldAabb,
  hitTestCoreV2EntityIndex,
} from './semantic/entity-hit-index';
import {
  CoreV2SceneImageController,
  type CoreV2SceneImageIntrinsicSize,
  type CoreV2SceneImageProductProbe,
  type CoreV2SceneImagesProbe,
} from './scene-images';
import {
  coreV2AffineCenter,
  coreV2AffineBasis,
  freezeCoreV2Bounds,
  type CoreV2BoundsTuple,
} from './semantic/geometry';
import {
  boundsFor,
  fitView,
  panView,
  zoomViewAt,
} from './view';

export interface CoreV2Options extends PixiCoreV2RendererOptions, CoreSceneOptions {
  readonly parse?: ParsePatchMapOptions;
  /** Schedule one invalidation frame after mutations. Defaults to true. */
  readonly autoRender?: boolean;
}

export interface CoreV2LoadResult {
  readonly parse: ParsePatchMapResult;
  readonly store: LoadResult;
  readonly normalizeMs: number;
  readonly storeLoadMs: number;
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
}

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
  readonly entityCount: number;
  readonly activeAnimations: number;
  readonly activeGestureCount: number;
  readonly selectionCount: number;
  readonly diagnostics: number;
  readonly renderer: PixiCoreV2RendererDebug;
  readonly scheduler: FrameSchedulerDebug;
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
  readonly semanticOwnerId: string;
}

interface IndexedTextTarget {
  readonly entityId: string;
  readonly semanticOwnerId: string;
}

export interface AnimateBarsOptions {
  readonly seed?: number;
  readonly fraction?: number;
  readonly durationMs?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
}

interface PanState {
  readonly pointerId: number;
  x: number;
  y: number;
}

export class CoreV2 {
  public readonly renderer: PixiCoreV2Renderer;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics;

  private readonly scene: CoreScene;
  private readonly scheduler: InvalidationScheduler;
  private readonly sceneImages: CoreV2SceneImageController;
  private readonly presentationProjection = new CoreV2PresentationProjectionStore();
  private readonly parseOptions: ParsePatchMapOptions;
  private readonly autoRender: boolean;
  private readonly unbindInteractions: () => void;
  private parseResultValue: ParsePatchMapResult | null = null;
  private projectionValue: CoreV2ProjectionIndex | null = null;
  private presentationController: CoreV2PresentationController;
  private presentationGeneration = 1;
  private sceneImageReconcileSuspended = false;
  private currentView: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private worldFlipX = false;
  private worldFlipY = false;
  private animationClockMs = 0;
  private lastAnimationFrameTime: number | null = null;
  private lastFrameReport: FrameReport | null = null;
  private pan: PanState | null = null;
  private pointerSequence = 0;
  private entityCountValue = 0;
  private destroyedValue = false;
  private entityHitIndexValue: CoreV2EntityHitIndex | null = null;
  private readonly staleHitProjectionIds = new Set<string>();
  private readonly spatialHitAnimationEnds = new Map<string, number>();
  private readonly pendingIntrinsicImageSizes = new Map<string, CoreV2SceneImageIntrinsicSize>();
  private componentTargets = new Map<string, IndexedComponentTarget | null>();
  private componentRendererFactsPublished = false;
  private textTargets = new Map<string, IndexedTextTarget | null>();
  private textRendererFactsPublished = false;
  private renderedSceneRevision: number | null = null;
  private presentationGhostPublicationCount = 0;

  private constructor(renderer: PixiCoreV2Renderer, options: CoreV2Options) {
    this.renderer = renderer;
    this.initializationMetrics = renderer.initializationMetrics;
    this.parseOptions = options.parse ?? {};
    this.autoRender = options.autoRender ?? true;
    this.presentationController = new CoreV2PresentationController({
      lifecycleGeneration: this.presentationGeneration,
    });
    this.scene = new CoreScene({
      renderer,
      ...(options.initialCapacity === undefined ? {} : { initialCapacity: options.initialCapacity }),
      ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
      ...(options.eventLimit === undefined ? {} : { eventLimit: options.eventLimit }),
    });
    this.scheduler = new InvalidationScheduler((timeMs) => this.renderScheduledFrame(timeMs));
    this.sceneImages = new CoreV2SceneImageController(renderer, {
      onInvalidate: (reason) => this.invalidate(reason),
      onIntrinsicSize: (resolution) => this.queueIntrinsicImageSize(resolution),
    });
    this.unbindInteractions = renderer.bindRootInteractions({
      pointerDown: (x, y, pointerId, button) => this.onPointerDown(x, y, pointerId, button),
      pointerMove: (x, y, pointerId) => this.onPointerMove(x, y, pointerId),
      pointerUp: (_x, _y, pointerId) => this.onPointerUp(pointerId),
      pointerCancel: (pointerId) => this.onPointerUp(pointerId),
      wheel: (x, y, deltaY) => this.zoomAt({ x, y }, Math.exp(-deltaY * 0.0015)),
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
    this.pendingIntrinsicImageSizes.clear();
    const normalizeStarted = now();
    const parse = withRendererDegradationDiagnostics(
      parsePatchMapV010(input, options),
      this.renderer.strategy,
    );
    const normalizeMs = now() - normalizeStarted;
    const storeStarted = now();
    const store = this.scene.load(parse.document);
    const storeLoadMs = now() - storeStarted;
    this.parseResultValue = parse;
    this.projectionValue = parse.projection;
    this.resetPresentationController();
    const presentation = this.presentationProjection.replace(parse.projection);
    this.entityCountValue = store.entityCount;
    this.currentView = parse.document.view ?? { x: 0, y: 0, scale: 1, rotation: 0 };
    this.animationClockMs = 0;
    this.lastAnimationFrameTime = null;
    this.staleHitProjectionIds.clear();
    this.renderer.setProjection(presentation, undefined, this.staleHitProjectionIds);
    this.sceneImages.reconcile(parse.projection, {
      activeEntityIds: this.activeSceneImageIds(),
    });
    this.reapplyResolvedIntrinsicSizes();
    this.componentTargets = indexComponentTargets(parse);
    this.textTargets = indexTextTargets(parse);
    this.spatialHitAnimationEnds.clear();
    this.invalidateEntityHitIndex();
    this.renderer.markChanges(store.changedRanges, 'load', { fullRebuild: true });
    this.invalidate('load');
    return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
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
    const before = this.scene.snapshot();
    const parseStarted = now();
    const parse = withRendererDegradationDiagnostics(
      parsePatchMapV010(input, options.parse ?? this.parseOptions),
      this.renderer.strategy,
    );
    const parseMs = now() - parseStarted;

    const planStarted = now();
    const plan = planCoreV2SceneReconcile(
      currentParse.document,
      parse.document,
      denseReconcileOptions(
        options,
        currentParse,
        parse,
        this.scene.selection().refs.flatMap((ref) => {
          const entity = this.scene.get(ref);
          return entity === null ? [] : [entity.id];
        }),
      ),
    );
    const semanticChanged = !jsonEquivalent(currentParse, parse);
    const planMs = now() - planStarted;

    if (!plan.safeToCommit) {
      const after = this.scene.snapshot();
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
      commit = this.commit(plan.batch);
    } finally {
      this.sceneImageReconcileSuspended = false;
    }
    const commitMs = now() - commitStarted;
    const presentation = this.reconcileBarPresentation(
      parse.projection,
      options.animateBarChanges !== false,
      options.animatedBarTargets,
    );
    this.parseResultValue = parse;
    this.projectionValue = parse.projection;
    this.staleHitProjectionIds.clear();
    this.renderer.setProjection(presentation, undefined, this.staleHitProjectionIds);
    this.sceneImages.reconcile(parse.projection, {
      activeEntityIds: this.activeSceneImageIds(),
    });
    this.reapplyResolvedIntrinsicSizes();
    this.componentTargets = indexComponentTargets(parse);
    this.textTargets = indexTextTargets(parse);
    this.spatialHitAnimationEnds.clear();
    this.invalidateEntityHitIndex();
    if (this.presentationController.activeCount > 0) this.invalidate('presentation');
    const after = this.scene.snapshot();
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
    this.advancePresentation(timeMs);
    this.animationClockMs = timeMs;
    this.lastAnimationFrameTime = null;
    this.lastFrameReport = this.flushScene();
    if (this.lastFrameReport.rendered) void this.sceneImages.finalizeAfterRenderedFrame();
    if (this.autoRender && this.activeAnimations > 0) this.scheduler.invalidate('presentation');
    return this.requireFrameReport();
  }

  public commit(batch: TransactionBatch): CommitResult {
    this.assertAlive();
    if (!this.sceneImageReconcileSuspended) this.assertDirectImageProjectionMutationSafe(batch);
    const directImageVisibilityIds = this.sceneImageReconcileSuspended
      ? new Set<string>()
      : this.directImageVisibilityIds(batch);
    const hitImpact = this.entityHitCommitImpact(batch);
    const result = this.scene.commit(batch);
    if (directImageVisibilityIds.size > 0) {
      this.synchronizeParsedImageVisibility(directImageVisibilityIds);
    }
    const hasGeometryChange = batch.operations.some(
      (operation) => operation.type !== 'view' && operation.type !== 'selection',
    );
    const hasSelection = batch.operations.some((operation) => operation.type === 'selection');
    const lastView = [...batch.operations].reverse().find((operation) => operation.type === 'view');
    if (lastView?.type === 'view') this.currentView = Object.freeze({ ...lastView.view });
    this.renderer.markChanges(hasGeometryChange ? result.changedRanges : [], 'commit');
    if (hasSelection) this.renderer.markOverlayChanges(result.changedRanges, 'selection');
    if (this.scene.activeAnimations > 0) this.lastAnimationFrameTime = null;
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
    const presentation = this.advancePresentation(timeMs);
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
    return this.setView(zoomViewAt(this.currentView, screenPoint, this.currentView.scale * factor));
  }

  public resetView(): CommitResult {
    return this.setView({ x: 0, y: 0, scale: 1, rotation: 0 });
  }

  public fit(padding = 24): CommitResult | null {
    this.assertAlive();
    const snapshot = this.scene.snapshot();
    const bounds = boundsFor(snapshot.entities);
    if (!bounds) return null;
    return this.setView(fitView(bounds, { width: this.renderer.width, height: this.renderer.height }, padding));
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
        targets: semanticSelectionDenseIds(parse, ids),
        mode: 'replace',
      }],
    });
  }

  public animateBarHeights(options: AnimateBarsOptions = {}): CommitResult {
    this.assertAlive();
    const fraction = clampFraction(options.fraction ?? 1);
    const minScale = options.minScale ?? 0.25;
    const maxScale = options.maxScale ?? 1.1;
    if (!(minScale > 0) || !(maxScale >= minScale)) throw new RangeError('invalid bar scale range');
    const random = seededRandom(options.seed ?? 0x5eedc0de);
    const bars = this.scene.query({ kinds: ['bar'] });
    const operations: TransactionBatch['operations'][number][] = [];
    for (const ref of bars) {
      if (random() > fraction) continue;
      const bar = this.scene.get(ref);
      if (!bar) continue;
      operations.push({
        type: 'animate',
        target: ref,
        property: 'height',
        to: Math.max(1, bar.bounds.height * (minScale + random() * (maxScale - minScale))),
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
      entityCount: this.entityCountValue,
      activeAnimations: this.destroyedValue ? 0 : this.scene.activeAnimations,
      activeGestureCount: this.destroyedValue || this.pan === null ? 0 : 1,
      selectionCount,
      diagnostics: this.diagnostics.length,
      renderer: this.renderer.debugSnapshot(),
      scheduler: this.scheduler.debugSnapshot(),
    });
  }

  public interactionOwnershipProbe(): Readonly<{
    readonly rootBindingCount: number;
    readonly entityCallbackCount: number;
  }> {
    this.assertAlive();
    return this.renderer.interactionOwnershipProbe();
  }

  public async destroy(): Promise<boolean> {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.pan = null;
    this.scheduler.destroy();
    this.unbindInteractions();
    this.entityHitIndexValue = null;
    this.staleHitProjectionIds.clear();
    this.spatialHitAnimationEnds.clear();
    this.presentationController.destroy();
    this.presentationProjection.clear();
    const cleanupFailures: Error[] = [];
    try {
      await this.sceneImages.destroy();
    } catch (error) {
      cleanupFailures.push(normalizeCleanupFailure(error));
    }
    this.projectionValue = null;
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
    if (this.destroyedValue) return false;
    this.applyPendingIntrinsicImageSizes();
    if (this.activeAnimations > 0) {
      if (this.lastAnimationFrameTime === null) this.lastAnimationFrameTime = timeMs;
      const delta = Math.max(0, timeMs - this.lastAnimationFrameTime);
      this.lastAnimationFrameTime = timeMs;
      this.animationClockMs += delta;
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
    if (this.lastFrameReport.rendered) void this.sceneImages.finalizeAfterRenderedFrame();
    const active = this.activeAnimations > 0;
    if (!active) this.lastAnimationFrameTime = null;
    return active;
  }

  private invalidate(reason: string): void {
    this.componentRendererFactsPublished = false;
    this.textRendererFactsPublished = false;
    if (this.autoRender) this.scheduler.invalidate(reason);
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

  private entityHitIndex(): CoreV2EntityHitIndex {
    this.entityHitIndexValue ??= CoreV2EntityHitIndex.build(
      this.scene.snapshot(),
      this.presentationProjection.presentation,
      this.staleHitProjectionIds,
    );
    return this.entityHitIndexValue;
  }

  private invalidateEntityHitIndex(): void {
    this.entityHitIndexValue = null;
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
  ): CoreV2ProjectionIndex {
    const previousBars = this.projectionValue?.barsByEntityId ?? {};
    const nextBars = next.barsByEntityId ?? {};
    const visibleHeights = new Map<string, number>();
    const timeMs = this.animationClockMs;
    const animatedTargetKeys = animatedBarTargets === undefined
      ? null
      : new Set(animatedBarTargets.map(componentTargetKey));

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

    return this.presentationProjection.replace(next, visibleHeights);
  }

  private advancePresentation(timeMs: number): CoreV2PresentationFrame {
    const frame = this.presentationController.advance(timeMs);
    if (frame.updates.length === 0) return frame;
    const changedSlots: number[] = [];
    for (const update of frame.updates) {
      const ref = this.scene.ref(update.entityId);
      const entity = ref === null ? null : this.scene.get(ref);
      const bar = this.projectionValue?.barsByEntityId?.[update.entityId];
      if (
        ref === null ||
        ref.slot !== update.slot ||
        ref.generation !== update.generation ||
        entity?.kind !== 'bar' ||
        !entity.visible ||
        bar === undefined
      ) {
        this.presentationGhostPublicationCount += 1;
        continue;
      }
      if (this.presentationProjection.applyBarHeight(update.entityId, update.value)) {
        changedSlots.push(update.slot);
      }
    }
    if (changedSlots.length === 0) return frame;
    const projection = this.presentationProjection.presentation;
    if (projection === null) return frame;
    const ranges = contiguousSlotRanges(changedSlots);
    this.renderer.setProjection(projection, ranges);
    this.componentRendererFactsPublished = false;
    this.invalidateEntityHitIndex();
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
    const target = this.selectAtScreen({ x, y });
    if (!target && (button === 0 || button === 1)) {
      this.pan = { pointerId, x, y };
      this.scheduler.setContinuous(true, 'gesture');
    }
  }

  private onPointerMove(x: number, y: number, pointerId: number): void {
    const pan = this.pan;
    if (!pan || pan.pointerId !== pointerId || this.destroyedValue) return;
    const delta = { x: x - pan.x, y: y - pan.y };
    pan.x = x;
    pan.y = y;
    this.panBy(delta);
  }

  private onPointerUp(pointerId: number): void {
    if (this.pan?.pointerId !== pointerId) return;
    this.pan = null;
    this.scheduler.setContinuous(false, 'gesture-end');
  }

  private requireFrameReport(): FrameReport {
    const report = this.lastFrameReport;
    if (!report) throw new Error('Core v2 has not produced a frame report');
    return report;
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('CoreV2 is destroyed');
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
): readonly string[] {
  if (!Array.isArray(semanticIds)) throw new TypeError('selectionIds must be an array');
  const documentIds = new Set(parse.document.entities.map(({ id }) => id));
  const denseIds = new Set<string>();
  semanticIds.forEach((semanticId, index) => {
    if (typeof semanticId !== 'string' || semanticId.length === 0) {
      throw new TypeError(`selectionIds[${index}] must be a non-empty string`);
    }
    if (documentIds.has(semanticId)) {
      denseIds.add(semanticId);
      return;
    }
    for (const entityId of parse.identity.entityIdsBySourceId[semanticId] ?? []) {
      if (documentIds.has(entityId)) denseIds.add(entityId);
    }
  });
  return Object.freeze([...denseIds]);
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
  before: SceneSnapshot,
  after: SceneSnapshot,
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
    selectionCountBefore: before.selection.refs.length,
    selectionCountAfter: after.selection.refs.length,
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
  const components = parse.projection.componentsByEntityId ?? {};
  for (const entityId of Object.keys(components).sort()) {
    const component = components[entityId];
    if (!component) continue;
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      component.ownerId;
    const indexed = Object.freeze({ entityId, semanticOwnerId });
    indexComponentTarget(targets, component.ownerId, component.componentId, indexed);
    if (semanticOwnerId !== component.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, component.componentId, indexed);
    }
  }
  const bars = parse.projection.barsByEntityId ?? {};
  for (const entityId of Object.keys(bars).sort()) {
    const bar = bars[entityId];
    if (!bar) continue;
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      bar.ownerId;
    const indexed = Object.freeze({ entityId, semanticOwnerId });
    indexComponentTarget(targets, bar.ownerId, bar.componentId, indexed);
    if (semanticOwnerId !== bar.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, bar.componentId, indexed);
    }
  }
  const texts = parse.projection.textsByEntityId ?? {};
  for (const entityId of Object.keys(texts).sort()) {
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
    const indexed = Object.freeze({ entityId, semanticOwnerId });
    indexComponentTarget(targets, text.ownerId, text.componentId, indexed);
    if (semanticOwnerId !== text.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, text.componentId, indexed);
    }
  }
  return targets;
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
  for (const entityId of Object.keys(texts).sort()) {
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
