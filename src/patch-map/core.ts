import type {
  AdvanceResult,
  CommitResult,
  CorePoint,
  CoreSceneOptions,
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
} from './dense/contracts';
import type {
  ParseDiagnostic,
  ParseIdentityIndex,
  ParsePatchMapOptions,
  ParsePatchMapResult,
  PatchMapBarProjection,
  PatchMapComponentVisualProjection,
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from './contracts';
import type { PatchMapPresentationFrame } from './presentation';
import {
  PATCH_MAP_PRESENTATION_POLICY_REVISION,
  type PatchMapPresentationPolicyInput,
  type PatchMapPresentationPolicyProductProbe,
  type PatchMapResolvedPresentationPolicy,
} from './presentation-policy';
import type { PatchMapPaintOrderProductProbe } from './paint-order-product';
import {
  inheritPatchMapV010DirectParseIndexes,
  type PatchMapDirectTextParseTargetIndex,
  parsePatchMapV010,
  parsePatchMapV010Async,
  parsePatchMapV010DirectTextBatch,
  parsePatchMapV010SelectedRoots,
  projectPatchMapIntrinsicImageAffine,
} from './parser';
import {
  inheritPatchMapV010IncrementalParserCaches,
  parsePatchMapV010DirectElementAngleBatch,
  parsePatchMapV010IncrementalFlat,
  parsePatchMapV010IncrementalStructure,
  patchMapV010StructuralChangedEntityIds,
  primePatchMapV010IncrementalFlat,
} from './incremental-parser';
import {
  isOwnedPatchMapDataset,
  ownedPatchMapExactPatchIndices,
  ownedPatchMapPreviewPatchIndices,
} from './semantic/dataset';
import {
  inheritRendererDegradationDiagnostics,
  inheritRendererDegradationDiagnosticsIncremental,
  withRendererDegradationDiagnostics,
} from './renderers/degradation';
import {
  PatchMapAdaptiveFrameBudget,
  PatchMapFrameLoop,
  InvalidationScheduler,
  type PatchMapFrameLoopOptions,
} from './scheduler';
import {
  planPatchMapParsedSceneReconcile,
  planPatchMapParsedSceneReconcileIncremental,
  planPatchMapParsedSceneReconcileStructuralWindow,
  primePatchMapParsedSceneReconcileIncremental,
  type PatchMapDenseReconcilePlan,
} from './semantic/reconcile';
import {
  PatchMapPixiRenderer,
  restorePatchMapPixiRendererPublication,
  type PatchMapPixiInitializationMetrics,
} from './renderers/pixi-renderer';
import type { PatchMapInteractionOverlayPolicy } from './renderers/types';
import type { PatchMapSemanticTarget } from './semantic/probe';
import {
  PatchMapSceneImageController,
  type PatchMapSceneImageIntrinsicSize,
  type PatchMapSceneImageRetryResult,
  type PatchMapSceneImagesProbe,
} from './scene-images';
import {
  patchMapAffineCenter,
  patchMapAffineBasis,
  freezePatchMapBounds,
  freezePatchMapAffine,
  projectPatchMapSignedRect,
  type PatchMapBoundsTuple,
} from './semantic/geometry';
import {
  compactPatchMapStableRecord,
  patchPatchMapStableRecord,
  rollbackPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from './semantic/stable-record-overlay';
import {
  boundsFor,
  fitView,
  panView,
  zoomViewAt,
} from './view';
import type { PatchMapViewportPolicy } from './viewport';
import { PatchMapScene } from './scene';
import {
  type AnimateBarsOptions,
  type PatchMapBarPresentationProductProbe,
  type PatchMapComponentVisualProductProbe,
  type PatchMapComponentVisualTarget,
  type PatchMapDirectBarHeightUpdate,
  type PatchMapDirectElementAngleUpdate,
  type PatchMapDirectTextUpdate,
  type PatchMapLoadResult,
  type PatchMapPrepareResult,
  type PatchMapPresentationLifecycleResult,
  type PatchMapReconcileFacts,
  type PatchMapReconcileOptions,
  type PatchMapReconcileResult,
  type PatchMapRootPointerInput,
  type PatchMapRootViewportChange,
  type PatchMapRuntimeDebug,
  type PatchMapRuntimeOptions,
  type PatchMapSelectionOverlayPolicyInput,
  type PatchMapSemanticRefreshOptions,
  type PatchMapSemanticRefreshResult,
  type PatchMapTextProductProbe,
  type PatchMapTextTarget,
  type PatchMapTransientProjectionResult,
  type PatchMapWorldTransform,
} from './core/contracts';
import {
  PatchMapPublishedSceneAuthority,
  type PatchMapIndexedComponentTarget as IndexedComponentTarget,
  type PatchMapIndexedTextTarget as IndexedTextTarget,
  type PatchMapPublishedSceneCandidate,
  type PatchMapPublishedScenePrevious,
  type PatchMapPublishedSceneState,
  type PatchMapPublishedSceneStateUpdate,
  type PatchMapTransientIncrementalParse,
} from './core/published-scene-state';
import {
  PatchMapSpatialHitAuthority,
  isLargePatchMapAnimatedBarBatch,
} from './core/spatial-hit-authority';
import {
  createPatchMapBarPresentationProductProbe,
  createPatchMapComponentVisualProductProbe,
  createPatchMapRuntimePaintOrderProbe,
  createPatchMapTextProductProbe,
  indexPatchMapComponentProbeTargets as indexComponentTargets,
  indexPatchMapTextProbeTargets as indexTextTargets,
  patchMapComponentProbeTargetKey as componentTargetKey,
  patchMapTextProbeTargetKey as patchMapTextTargetKey,
} from './core/product-probe-reader';
import { PatchMapRootInteractionAuthority } from './core/root-interaction-authority';
import { PatchMapBarPresentationAuthority } from './core/bar-presentation-authority';
import { PatchMapRendererLease } from './core/renderer-lease';
import {
  PatchMapLoadAuthority,
  type PatchMapLoadRendererCheckpoint,
  type PatchMapLoadRuntimeState,
} from './core/load-authority';
import {
  denseReconcileOptions,
  resolvePresentationFillOverrides,
  semanticPresentationFillDenseIds,
  semanticSelectionDenseIds,
} from './core/semantic-dense-planning';

export { normalizePatchMapTextTarget } from './core/contracts';
export type * from './core/contracts';

interface PatchMapCooperativeLoadHooks {
  /**
   * Called after every cooperative boundary and immediately before the
   * authoritative scene swap. A superseded Engine load throws here while the
   * currently published Core state is still untouched.
   */
  readonly assertCurrent?: () => void;
}

interface PatchMapIntrinsicImageGeometry {
  readonly entityId: string;
  readonly bindingKey: string;
  readonly generation: number | null;
  readonly naturalSize: readonly [number, number];
}

export class PatchMapRuntime {
  public readonly renderer: PatchMapPixiRenderer;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics;

  private readonly publishedScene: PatchMapPublishedSceneAuthority;
  private readonly sceneOptions: CoreSceneOptions;
  private readonly scheduler: InvalidationScheduler;
  private readonly adaptiveFrameBudget = new PatchMapAdaptiveFrameBudget();
  private externalFrameLoop: PatchMapFrameLoop | null = null;
  private automaticAnimationFramesActive = false;
  private readonly sceneImages: PatchMapSceneImageController;
  private readonly loadAuthority: PatchMapLoadAuthority;
  private readonly barPresentation = new PatchMapBarPresentationAuthority();
  private readonly parseOptions: ParsePatchMapOptions;
  private readonly autoRender: boolean;
  private readonly requestFrame: (() => void) | undefined;
  private readonly onTerminalFailure: ((error: Error) => void) | undefined;
  private readonly stableRecordStrategy: PatchMapStableRecordStrategy;
  private readonly rootInteraction: PatchMapRootInteractionAuthority;
  private spatialHit = new PatchMapSpatialHitAuthority();
  private sceneImageReconcileSuspended = false;
  private currentView: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private worldFlipX = false;
  private worldFlipY = false;
  private lastFrameReport: FrameReport | null = null;
  private suspended = false;
  private destroyedValue = false;
  private pendingIntrinsicImageSizes = new Map<string, PatchMapSceneImageIntrinsicSize>();
  private componentRendererFactsPublished = false;
  private textRendererFactsPublished = false;
  private renderedSceneRevision: number | null = null;
  private terminalLoadFailure: Error | null = null;

  private constructor(renderer: PatchMapPixiRenderer, options: PatchMapRuntimeOptions) {
    this.renderer = renderer;
    this.initializationMetrics = renderer.initializationMetrics;
    this.parseOptions = options.parse ?? {};
    this.autoRender = options.autoRender ?? true;
    this.requestFrame = options.requestFrame;
    this.onTerminalFailure = options.onTerminalFailure;
    this.stableRecordStrategy = options.internalStableRecordOverlays === true
      ? 'internal-overlay'
      : 'frozen-copy';
    this.sceneOptions = Object.freeze({
      ...(options.initialCapacity === undefined ? {} : { initialCapacity: options.initialCapacity }),
      ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
      ...(options.eventLimit === undefined ? {} : { eventLimit: options.eventLimit }),
    });
    this.publishedScene = new PatchMapPublishedSceneAuthority({
      scene: this.createScene(),
      parse: null,
      projection: null,
      ownedInputDataset: null,
      ownedParseOptionsKey: null,
      transientIncrementalParse: null,
      componentTargets: new Map(),
      textTargets: new Map(),
      entityCount: 0,
    });
    this.scheduler = new InvalidationScheduler((timeMs) => this.renderScheduledFrame(timeMs));
    this.sceneImages = new PatchMapSceneImageController(renderer, {
      onInvalidate: (reason) => {
        if (this.loadAuthority.publicationSideEffectsInProgress) return;
        this.invalidate(reason);
      },
      onIntrinsicSize: (resolution) => this.queueIntrinsicImageSize(resolution),
    });
    this.loadAuthority = new PatchMapLoadAuthority(
      this.publishedScene,
      this.barPresentation,
      this.sceneImages,
      this.renderer,
    );
    this.rootInteraction = new PatchMapRootInteractionAuthority(
      renderer,
      {
        readView: () => this.currentView,
        selectAtScreen: (point) => {
          this.selectAtScreen(point);
        },
        panBy: (delta) => {
          this.panBy(delta);
        },
        zoomAt: (point, factor) => {
          this.zoomAt(point, factor);
        },
        hitTestInteractive: (point) => this.hitTestScreen(
          point,
          { interactiveOnly: true },
        ) !== null,
        requestGestureFrame: () => this.requestExternalFrameLoop(),
        setGestureContinuous: (enabled, reason) => {
          this.scheduler.setContinuous(enabled, reason);
        },
      },
      {
        selectionMode: options.rootSelectionMode ?? 'immediate',
        autoRender: this.autoRender,
      },
    );
  }

  private get scene(): PatchMapScene {
    return this.publishedScene.current().scene;
  }

  private get parseResultValue(): ParsePatchMapResult | null {
    return this.publishedScene.current().parse;
  }

  private get projectionValue(): PatchMapProjectionIndex | null {
    return this.publishedScene.current().projection;
  }

  private get ownedInputDataset(): readonly unknown[] | null {
    return this.publishedScene.current().ownedInputDataset;
  }

  private get ownedParseOptionsKey(): string | null {
    return this.publishedScene.current().ownedParseOptionsKey;
  }

  private get transientIncrementalParse(): PatchMapTransientIncrementalParse | null {
    return this.publishedScene.current().transientIncrementalParse;
  }

  private get componentTargets(): ReadonlyMap<string, IndexedComponentTarget | null> {
    return this.publishedScene.current().componentTargets;
  }

  private get textTargets(): ReadonlyMap<string, IndexedTextTarget | null> {
    return this.publishedScene.current().textTargets;
  }

  private get entityCountValue(): number {
    return this.publishedScene.current().entityCount;
  }

  private updatePublishedScene(patch: PatchMapPublishedSceneStateUpdate): void {
    this.publishedScene.update(patch);
  }

  public static async create(options: PatchMapRuntimeOptions = {}): Promise<PatchMapRuntime> {
    const renderer = await PatchMapPixiRenderer.create(options);
    try {
      return new PatchMapRuntime(renderer, options);
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
    return this.destroyedValue || this.terminalLoadFailure !== null
      ? 0
      : this.scene.activeAnimations + this.barPresentation.activeCount;
  }

  /** Source-level workload size used by the shared adaptive frame policy. */
  public get frameWorkloadSize(): number {
    return this.parseResultValue?.identity.counts.sourceElements ?? 0;
  }

  /** Current monotonic presentation clock used by a package-owned frame loop. */
  public get frameTimeMs(): number {
    return this.barPresentation.clockMs;
  }

  /** Root-owned gesture state used by automatic and host-driven frame loops. */
  public get viewportGestureActive(): boolean {
    return !this.destroyedValue &&
      this.terminalLoadFailure === null &&
      this.rootInteraction.activeGesture;
  }

  public get presentationRevision(): number {
    return this.barPresentation.presentationRevision;
  }

  public get reducedMotion(): boolean {
    return this.barPresentation.reducedMotion;
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

  public get projection(): PatchMapProjectionIndex | null {
    return this.projectionValue;
  }

  /** Renderer-visible projection. Semantic consumers should use `projection`. */
  public get visibleProjection(): PatchMapProjectionIndex | null {
    this.assertLoadPublicationHealthy();
    return this.barPresentation.visibleProjection;
  }

  public load(input: unknown, options: ParsePatchMapOptions = this.parseOptions): PatchMapLoadResult {
    this.assertAlive();
    this.loadAuthority.beginLoad();
    const normalizeStarted = now();
    const parse = withRendererDegradationDiagnostics(
      parsePatchMapV010(input, options),
      this.renderer.strategy,
    );
    const normalizeMs = now() - normalizeStarted;
    let candidateScene: PatchMapScene | null = this.createScene(parse.document.entities.length);
    try {
      candidateScene.seedReplacementFrom(this.scene);
      const storeStarted = now();
      const store = candidateScene.load(parse.document);
      const storeLoadMs = now() - storeStarted;
      primePatchMapV010IncrementalFlat(parse);
      primePatchMapParsedSceneReconcileIncremental(parse.document);
      const retainedInput = retainedOwnedInputDataset(input, options);
      const candidate = this.loadAuthority.prepareCandidate({
        scene: candidateScene,
        parse,
        projection: this.projectionWithResolvedIntrinsicSizes(parse.projection),
        ownedInputDataset: retainedInput.dataset,
        ownedParseOptionsKey: retainedInput.optionsKey,
        entityCount: store.entityCount,
      });
      this.commitLoadedProjection(candidate, parse, store);
      candidateScene = null;
      return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
    } finally {
      candidateScene?.destroy();
    }
  }

  /**
   * Cooperative first-load path for large browser scenes. Parsing, dense-store
   * construction, aggregate projection binding, and final indexing each occupy
   * a separate main-thread task while the Engine keeps the candidate private.
   */
  public async loadAsync(
    input: unknown,
    options: ParsePatchMapOptions = this.parseOptions,
    hooks: PatchMapCooperativeLoadHooks = {},
  ): Promise<PatchMapLoadResult> {
    this.assertAlive();
    const sequence = this.loadAuthority.beginLoad();
    const sceneRevision = this.scene.revision;
    const assertCurrent = (): void => {
      this.assertAlive();
      this.loadAuthority.assertCurrent(sequence, sceneRevision, this.scene.revision);
      hooks.assertCurrent?.();
    };
    assertCurrent();
    const normalizeStarted = now();
    const parse = withRendererDegradationDiagnostics(
      await parsePatchMapV010Async(input, options),
      this.renderer.strategy,
    );
    const normalizeMs = now() - normalizeStarted;
    await yieldPatchMapMainTask();
    assertCurrent();

    let candidateScene: PatchMapScene | null = this.createScene(parse.document.entities.length);
    try {
      candidateScene.seedReplacementFrom(this.scene);
      const storeStarted = now();
      const cooperativeFirstLoad = sceneRevision === 0 && this.entityCountValue === 0;
      const store = cooperativeFirstLoad
        ? await candidateScene.loadCooperatively(parse.document, assertCurrent)
        : candidateScene.load(parse.document);
      const storeLoadMs = now() - storeStarted;
      if (cooperativeFirstLoad) {
        await yieldPatchMapMainTask();
        assertCurrent();
      }

      primePatchMapV010IncrementalFlat(parse);
      primePatchMapParsedSceneReconcileIncremental(parse.document);
      const retainedInput = retainedOwnedInputDataset(input, options);
      const candidate = this.loadAuthority.prepareCandidate({
        scene: candidateScene,
        parse,
        projection: this.projectionWithResolvedIntrinsicSizes(parse.projection),
        ownedInputDataset: retainedInput.dataset,
        ownedParseOptionsKey: retainedInput.optionsKey,
        entityCount: store.entityCount,
      });
      assertCurrent();
      this.commitLoadedProjection(candidate, parse, store);
      candidateScene = null;
      return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
    } finally {
      candidateScene?.destroy();
    }
  }

  private createScene(minimumCapacity = 0): PatchMapScene {
    return new PatchMapScene({
      renderer: new PatchMapRendererLease(this.renderer),
      ...this.sceneOptions,
      initialCapacity: Math.max(
        this.sceneOptions.initialCapacity ?? 0,
        minimumCapacity,
        1,
      ),
    });
  }

  private commitLoadedProjection(
    candidate: PatchMapPublishedSceneCandidate,
    parse: ParsePatchMapResult,
    store: LoadResult,
  ): void {
    const prepared = this.loadAuthority.preparePublication({
      candidate,
      sourceProjection: parse.projection,
      view: parse.document.view,
      activeImageEntityIds: activeSceneImageIds(candidate.state),
      currentRuntime: {
        spatialHit: this.spatialHit,
        currentView: this.currentView,
        pendingIntrinsicImageSizes: this.pendingIntrinsicImageSizes,
        automaticAnimationFramesActive: this.automaticAnimationFramesActive,
      },
    });
    const {
      previousRuntime,
      nextRuntime,
      imagePlan,
      rendererCheckpoint,
    } = prepared;
    let previousPublished: PatchMapPublishedScenePrevious;
    try {
      previousPublished = this.publishedScene.publish(candidate);
    } catch (error) {
      this.loadAuthority.disposeRuntimeState(nextRuntime);
      throw error;
    }

    this.installLoadedRuntimeState(nextRuntime);
    this.loadAuthority.beginPublicationSideEffects();
    try {
      const presentation = this.barPresentation.visibleProjection;
      if (presentation === null) {
        throw new Error('PatchMap load candidate has no presentation projection');
      }
      this.renderer.setProjection(
        presentation,
        undefined,
        nextRuntime.spatialHit.staleProjectionIds,
      );
      this.applyPresentationPolicyToRenderer();
      nextRuntime.spatialHit.clearSpatialAnimations();
      nextRuntime.spatialHit.invalidate();
      this.renderer.markChanges(store.changedRanges, 'load', { fullRebuild: true });
    } catch (error) {
      const restored = this.rollbackLoadedProjection(
        previousPublished,
        previousRuntime,
        nextRuntime,
        candidate.state,
        rendererCheckpoint,
      );
      if (!restored) this.markTerminalLoadFailure(error);
      throw error;
    }

    try {
      this.sceneImages.commitReconcile(imagePlan);
    } catch (error) {
      this.rollbackLoadedProjection(
        previousPublished,
        previousRuntime,
        nextRuntime,
        candidate.state,
        rendererCheckpoint,
      );
      // A valid prepared image plan is specified not to throw after mutation
      // begins. If that invariant is violated, controller state is no longer
      // provably reversible even when semantic and renderer state restore.
      this.markTerminalLoadFailure(error);
      throw error;
    }

    this.loadAuthority.endPublicationSideEffects();
    this.loadAuthority.disposeRuntimeState(previousRuntime);
    this.publishedScene.discard(previousPublished.previous);
    this.adaptiveFrameBudget.reset();
    this.invalidate('load');
  }

  private installLoadedRuntimeState(state: PatchMapLoadRuntimeState): void {
    this.barPresentation.installLoadedState(state.barPresentation);
    this.spatialHit = state.spatialHit;
    this.currentView = state.currentView;
    this.pendingIntrinsicImageSizes = state.pendingIntrinsicImageSizes;
    this.automaticAnimationFramesActive = state.automaticAnimationFramesActive;
  }

  private rollbackLoadedProjection(
    previousPublished: PatchMapPublishedScenePrevious,
    previousRuntime: PatchMapLoadRuntimeState,
    nextRuntime: PatchMapLoadRuntimeState,
    failedState: PatchMapPublishedSceneState,
    rendererCheckpoint: PatchMapLoadRendererCheckpoint,
  ): boolean {
    let restored = true;
    try {
      this.publishedScene.restore(previousPublished);
    } catch {
      restored = false;
    }
    this.installLoadedRuntimeState(previousRuntime);
    restored = this.restoreLoadedRendererCheckpoint(rendererCheckpoint) && restored;
    this.loadAuthority.endPublicationSideEffects();
    try {
      this.loadAuthority.disposeRuntimeState(nextRuntime);
    } catch {
      restored = false;
    }
    try {
      this.publishedScene.discard(failedState);
    } catch {
      restored = false;
    }
    return restored;
  }

  private restoreLoadedRendererCheckpoint(
    checkpoint: PatchMapLoadRendererCheckpoint,
  ): boolean {
    if (checkpoint.kind === 'pixi') {
      restorePatchMapPixiRendererPublication(this.renderer, checkpoint.state);
      return true;
    }
    if (checkpoint.presentation === null) return false;
    try {
      this.renderer.setProjection(
        checkpoint.presentation,
        undefined,
        checkpoint.staleProjectionIds,
      );
      this.applyPresentationPolicyToRenderer();
      return true;
    } catch {
      return false;
    }
  }

  private markTerminalLoadFailure(cause: unknown): void {
    if (this.terminalLoadFailure !== null) return;
    const failure = new Error(
      'PatchMapRuntime entered a terminal state after load rollback failed',
      { cause },
    );
    this.terminalLoadFailure = failure;
    this.suspended = true;
    this.rootInteraction.cancelGesture();
    this.automaticAnimationFramesActive = false;
    this.scheduler.setContinuous(false, 'load-rollback-terminal');
    this.scheduler.cancelPending();
    try {
      if (this.externalFrameLoop !== null && !this.externalFrameLoop.isDestroyed) {
        this.externalFrameLoop.pause();
      }
    } catch {
      // Terminal state already prevents any later publication.
    }
    try {
      this.rootInteraction.destroy();
    } catch {
      // Preserve the original load error; destroy still owns final cleanup.
    }
    try {
      this.onTerminalFailure?.(failure);
    } catch {
      // Terminal state is already sealed; owner notification is best-effort.
    }
  }

  private matchesOwnedIncrementalInput(
    input: unknown,
    dirtyRootIds: readonly string[],
    options: ParsePatchMapOptions,
  ): boolean {
    const optionsKey = incrementalParseOptionsKey(options);
    if (
      !isOwnedPatchMapDataset(input) ||
      this.ownedInputDataset === null ||
      optionsKey === null ||
      optionsKey !== this.ownedParseOptionsKey ||
      input.length !== this.ownedInputDataset.length
    ) {
      return false;
    }
    const dirty = new Set(dirtyRootIds);
    const exactDirtyIndices = ownedPatchMapExactPatchIndices(
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
      isOwnedPatchMapDataset(input) &&
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
    options: PatchMapReconcileOptions = {},
  ): PatchMapReconcileResult {
    this.assertAlive();
    const currentParse = this.parseResultValue;
    if (currentParse === null) {
      throw new Error('PatchMapRuntime.reconcile requires a loaded PATCH MAP dataset');
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
        : planPatchMapParsedSceneReconcileIncremental(
            currentParse.document,
            parse.document,
            incrementalEntityIds,
            reconcileOptions,
            true,
          )
    ) ?? (
      structuralParse === null
        ? null
        : planPatchMapParsedSceneReconcileStructuralWindow(
            currentParse.document,
            parse.document,
            reconcileOptions,
          )
    ) ?? planPatchMapParsedSceneReconcile(
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
        rollbackPatchMapProjectionStableRecords(
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
        rollbackPatchMapProjectionStableRecords(
          parse.projection,
          currentParse.projection,
        );
      }
      throw error;
    } finally {
      this.sceneImageReconcileSuspended = false;
    }
    const commitMs = now() - commitStarted;
    const presentation = this.barPresentation.reconcile(
      this.projectionValue,
      parse.projection,
      this.scene,
      !this.barPresentation.reducedMotion && options.animateBarChanges !== false,
      directBarParse === null ? options.animatedBarTargets : undefined,
      incrementalEntityIds ??
        (
          hierarchyOnlyTargetMapping
            ? Object.freeze([])
            : structuralPresentationEntityIds
        ),
    );
    const retainedInput = retainedOwnedInputDataset(input, parseOptions);
    this.updatePublishedScene({
      parse,
      transientIncrementalParse: null,
      projection: parse.projection,
      ownedInputDataset: retainedInput.dataset,
      ownedParseOptionsKey: retainedInput.optionsKey,
    });
    this.spatialHit.setDenseGeometryCompatible(true);
    this.spatialHit.clearStaleProjectionIds();
    this.renderer.setProjection(
      presentation,
      commit.changedRanges,
      this.spatialHit.staleProjectionIds,
      directTextParse !== null
        ? 'text'
        : directBarParse !== null
          ? 'bar-presentation'
          : undefined,
    );
    if (
      isLargePatchMapAnimatedBarBatch(this.barPresentation.activeCount)
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
        this.updatePublishedScene({
          componentTargets: indexComponentTargets(parse),
          textTargets: indexTextTargets(parse),
        });
      }
      this.applyPresentationPolicyToRenderer();
    }
    this.spatialHit.clearSpatialAnimations();
    this.spatialHit.invalidate(
      directBarParse !== null &&
      this.barPresentation.activeCount > 0,
    );
    // Large animated batches must not make the first pointer event pay for
    // the presentation envelope. Non-interactive consumers retain the lean
    // update path and build no auxiliary index.
    this.spatialHit.primeAnimatedBarsIfNeeded(
      this.rootInteraction.pointerListenerCount,
      this.scene,
      this.projectionValue,
      this.barPresentation.visibleProjection,
      this.barPresentation,
    );
    if (this.barPresentation.activeCount > 0) this.invalidate('presentation');
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(parse.projection);
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
  public async prepare(): Promise<PatchMapPrepareResult> {
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
    if (timeMs !== this.barPresentation.clockMs) {
      if (this.scene.activeAnimations > 0) {
        this.advance(timeMs);
      } else {
        // Renderer-side bar presentation is the common Engine path. Preserve
        // its aggregate dirty-range fast path without entering the dense
        // transaction animation table when that table is idle.
        this.advanceBarPresentation(timeMs);
      }
    }
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
    if (!this.barPresentation.setReducedMotion(enabled)) return false;
    if (enabled && this.projectionValue !== null) {
      const presentation = this.barPresentation.reconcile(
        this.projectionValue,
        this.projectionValue,
        this.scene,
        false,
      );
      this.renderer.setProjection(presentation);
      this.spatialHit.clearSpatialAnimations();
      this.spatialHit.invalidate();
      this.invalidate('reduced-motion');
    }
    return true;
  }

  /**
   * Gate the manual scheduler and settle renderer-visible values at their
   * already-committed semantic destinations. The supplied time is recorded,
   * but no elapsed wall-clock delta is integrated.
   */
  public suspendPresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    this.assertAlive();
    if (!Number.isFinite(timeMs) || timeMs < this.barPresentation.clockMs) {
      throw new RangeError('suspend timeMs must be finite and monotonic');
    }
    this.scheduler.cancelPending();
    this.scheduler.setContinuous(false, 'page-suspend');
    this.rootInteraction.cancelGesture();
    const frame = this.publishBarPresentationFrame(
      this.barPresentation.settle(timeMs, this.scene, this.projectionValue),
    );
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
  public resumePresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    this.assertAlive();
    if (!Number.isFinite(timeMs) || timeMs < this.barPresentation.clockMs) {
      throw new RangeError('resume timeMs must be finite and monotonic');
    }
    const frame = this.publishBarPresentationFrame(
      this.barPresentation.settle(timeMs, this.scene, this.projectionValue),
    );
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
    const hitImpact = this.spatialHit.planCommit(
      batch,
      this.scene,
      this.barPresentation.clockMs,
    );
    const result = this.scene.commit(batch);
    if (
      !this.sceneImageReconcileSuspended &&
      batch.operations.some((operation) =>
        operation.type !== 'view' && operation.type !== 'selection')
    ) {
      this.updatePublishedScene({
        ownedInputDataset: null,
        ownedParseOptionsKey: null,
      });
    }
    if (directImageVisibilityIds.size > 0) {
      this.synchronizeParsedImageVisibility(directImageVisibilityIds);
    }
    const hasGeometryChange = batch.operations.some(
      (operation) => operation.type !== 'view' && operation.type !== 'selection',
    );
    if (hasGeometryChange) this.barPresentation.recordGeometryMutation();
    const hasSelection = batch.operations.some((operation) => operation.type === 'selection');
    const lastView = [...batch.operations].reverse().find((operation) => operation.type === 'view');
    if (lastView?.type === 'view') this.currentView = Object.freeze({ ...lastView.view });
    this.renderer.markChanges(
      hasGeometryChange ? result.changedRanges : [],
      'commit',
      rendererDomain === undefined ? {} : { domain: rendererDomain },
    );
    if (hasSelection) this.renderer.markOverlayChanges(result.changedRanges, 'selection');
    this.spatialHit.invalidateFromCommit(
      hitImpact,
      rendererDomain === 'bar-only' &&
      this.barPresentation.activeCount > 0,
    );
    const projectionStalenessChanged =
      this.spatialHit.applyCommitProjectionStaleness(hitImpact, this.scene);
    if (projectionStalenessChanged) {
      const projection = this.barPresentation.visibleProjection;
      if (projection !== null) {
        this.renderer.setProjection(
          projection,
          result.changedRanges,
          this.spatialHit.staleProjectionIds,
          rendererDomain === 'text-only'
            ? 'text'
            : rendererDomain === 'bar-only'
              ? 'bar-presentation'
              : undefined,
        );
      }
    }
    this.spatialHit.retainCommitAnimations(hitImpact);
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
    const entityCountDelta = result.added - result.removed;
    if (entityCountDelta !== 0) {
      this.updatePublishedScene({
        entityCount: this.entityCountValue + entityCountDelta,
      });
    }
    return result;
  }

  public advance(timeMs: number): AdvanceResult {
    this.assertAlive();
    // Validate and advance the presentation authority first. Its structured
    // monotonic-clock error is part of the public Core/Engine contract, and a
    // rejected frame must not partially advance dense transaction animations.
    const presentation = this.advanceBarPresentation(timeMs);
    const result = this.scene.advance(timeMs);
    if (result.changed > 0) {
      this.componentRendererFactsPublished = false;
      this.textRendererFactsPublished = false;
    }
    if (result.changed > 0 && this.spatialHit.hasSpatialAnimations) {
      this.spatialHit.invalidate();
    }
    this.spatialHit.pruneCompletedSpatialAnimations(timeMs);
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

  public setWorldTransform(view: PatchMapWorldTransform): CommitResult {
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
      { min: this.rootInteraction.zoomLimits[0], max: this.rootInteraction.zoomLimits[1] },
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
      { min: this.rootInteraction.zoomLimits[0], max: this.rootInteraction.zoomLimits[1] },
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
    return this.spatialHit.hitTest(
      worldPoint,
      options,
      this.scene,
      this.projectionValue,
      this.barPresentation.visibleProjection,
      this.barPresentation,
    );
  }

  /** World AABB used by the same narrow-phase projection authority as hit testing. */
  public hitBounds(target: string | EntityRef): PatchMapBoundsTuple | null {
    this.assertAlive();
    return this.spatialHit.hitBounds(
      target,
      this.scene,
      this.barPresentation.visibleProjection,
    );
  }

  public sceneImageProbe(): PatchMapSceneImagesProbe {
    this.assertAlive();
    return this.sceneImages.probe(this.componentRendererFactsPublished);
  }

  public retrySceneImage(entityId: string): PatchMapSceneImageRetryResult {
    this.assertAlive();
    return this.sceneImages.retry(entityId);
  }

  public componentVisualProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapComponentVisualProductProbe | null {
    this.assertAlive();
    return createPatchMapComponentVisualProductProbe(
      target,
      this.componentTargets,
      this.projectionValue,
      this.barPresentation.visibleProjection,
      this.scene,
      this.renderer,
      this.sceneImages,
      this.componentRendererFactsPublished,
    );
  }

  public barPresentationProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapBarPresentationProductProbe | null {
    this.assertAlive();
    return createPatchMapBarPresentationProductProbe(
      target,
      this.componentTargets,
      this.projectionValue,
      this.barPresentation,
    );
  }

  /** Exact dense semantic order joined to current aggregate renderer facts. */
  public paintOrderProbe(): PatchMapPaintOrderProductProbe {
    this.assertAlive();
    return createPatchMapRuntimePaintOrderProbe(
      this.scene,
      this.renderer,
      this.barPresentation.visibleProjection,
      this.renderedSceneRevision,
    );
  }

  public textProbe(target: PatchMapTextTarget): PatchMapTextProductProbe | null {
    if (this.destroyedValue) return null;
    this.assertLoadPublicationHealthy();
    return createPatchMapTextProductProbe(
      target,
      this.textTargets,
      this.projectionValue,
      this.barPresentation.visibleProjection,
      this.scene,
      this.renderer,
      this.textRendererFactsPublished,
      this.renderedSceneRevision,
    );
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
    if (parse === null) throw new Error('PatchMapRuntime.selectSemantic requires a loaded dataset');
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
      throw new Error('PatchMapRuntime semantic selection requires a loaded dataset');
    }
    return semanticSelectionDenseIds(parse, ids, this.componentTargets);
  }

  public setSelectionOverlayPolicy(
    input: PatchMapSelectionOverlayPolicyInput,
  ): boolean {
    this.assertAlive();
    const parse = this.parseResultValue;
    if (parse === null) {
      throw new Error('PatchMapRuntime.setSelectionOverlayPolicy requires a loaded dataset');
    }
    const policy: PatchMapInteractionOverlayPolicy = Object.freeze({
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
    input: PatchMapPresentationPolicyInput,
  ): PatchMapPresentationPolicyProductProbe {
    this.assertAlive();
    if (!this.barPresentation.setLogicalPolicy(input)) return this.presentationPolicyProbe();
    this.applyPresentationPolicyToRenderer();
    this.spatialHit.invalidate();
    this.invalidate('presentation-policy');
    return this.presentationPolicyProbe();
  }

  public clearPresentationPolicy(): PatchMapPresentationPolicyProductProbe {
    this.assertAlive();
    if (!this.barPresentation.clearLogicalPolicy()) return this.presentationPolicyProbe();
    this.renderer.setPresentationPolicy(null);
    this.spatialHit.invalidate();
    this.invalidate('presentation-policy:clear');
    return this.presentationPolicyProbe();
  }

  public presentationPolicyProbe(): PatchMapPresentationPolicyProductProbe {
    this.assertAlive();
    const parse = this.parseResultValue;
    const policy = this.barPresentation.logicalPolicy;
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
      schemaRevision: PATCH_MAP_PRESENTATION_POLICY_REVISION,
      revision: this.barPresentation.policyRevision,
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
  ): PatchMapTransientProjectionResult | null {
    this.assertAlive();
    this.updatePublishedScene({ transientIncrementalParse: null });
    const current = this.parseResultValue;
    const sparseDirtyIndices = this.ownedInputDataset === null
      ? null
      : ownedPatchMapPreviewPatchIndices(input, this.ownedInputDataset);
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
    this.updatePublishedScene({
      transientIncrementalParse: Object.freeze({
        base: current,
        optionsKey,
        dirtyRootIds: Object.freeze([...dirtyRootIds]),
        dirtyIndices: Object.freeze(dirtyIndices),
        dirtyRoots: Object.freeze(dirtyIndices.map((index) => roots[index] as object)),
        selected,
      }),
    });
    const presentation = this.barPresentation.applyTransientEntityProjections(
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
      this.spatialHit.staleProjectionIds,
    );
    this.componentRendererFactsPublished = false;
    this.textRendererFactsPublished = false;
    this.renderedSceneRevision = null;
    this.spatialHit.invalidate();
    this.invalidate('transformer-preview');
    return Object.freeze({
      changed: dirtyRanges.length > 0,
      entityIds: uniqueEntityIds,
      dirtyRanges,
    });
  }

  public clearIncrementalPreview(): PatchMapTransientProjectionResult {
    this.assertAlive();
    this.updatePublishedScene({ transientIncrementalParse: null });
    const entityIds = this.barPresentation.clearTransientEntityProjections();
    const dirtyRanges = contiguousSlotRanges(entityIds.flatMap((entityId) => {
      const ref = this.scene.ref(entityId);
      return ref === null ? [] : [ref.slot];
    }));
    const presentation = this.barPresentation.visibleProjection;
    if (presentation !== null && dirtyRanges.length > 0) {
      this.renderer.setProjection(
        presentation,
        dirtyRanges,
        this.spatialHit.staleProjectionIds,
      );
      this.componentRendererFactsPublished = false;
      this.textRendererFactsPublished = false;
      this.renderedSceneRevision = null;
      this.spatialHit.invalidate();
      this.invalidate('transformer-preview-clear');
    }
    return Object.freeze({
      changed: dirtyRanges.length > 0,
      entityIds,
      dirtyRanges,
    });
  }

  public refreshSemanticTargets(
    targets: readonly PatchMapSemanticTarget[],
    options: PatchMapSemanticRefreshOptions = {},
  ): PatchMapSemanticRefreshResult {
    this.assertAlive();
    if (!Array.isArray(targets)) throw new TypeError('refresh targets must be an array');
    const parse = this.parseResultValue;
    if (parse === null) throw new Error('PatchMapRuntime.refreshSemanticTargets requires a loaded dataset');
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
    const projection = this.barPresentation.visibleProjection;
    if (dirtyRanges.length > 0 && projection !== null) {
      this.renderer.setProjection(projection, dirtyRanges);
      this.componentRendererFactsPublished = false;
      this.textRendererFactsPublished = false;
      this.renderedSceneRevision = null;
      this.spatialHit.invalidate();
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
    this.assertLoadPublicationHealthy();
    return this.scene.snapshot();
  }

  public debugSnapshot(): PatchMapRuntimeDebug {
    this.assertLoadPublicationHealthy();
    const selectionCount = this.destroyedValue ? 0 : this.scene.selection().refs.length;
    return Object.freeze({
      destroyed: this.destroyedValue,
      suspended: this.suspended,
      entityCount: this.entityCountValue,
      activeAnimations: this.activeAnimations,
      activeGestureCount: this.rootInteraction.activeGesture ? 1 : 0,
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
    policies: readonly PatchMapViewportPolicy[],
  ): readonly PatchMapViewportPolicy[] {
    this.assertAlive();
    return this.rootInteraction.setGesturePolicies(policies);
  }

  public setViewportZoomLimits(
    limits: readonly [number, number],
  ): readonly [number, number] {
    this.assertAlive();
    return this.rootInteraction.setZoomLimits(limits);
  }

  public bindRootViewportChanges(
    listener: (change: PatchMapRootViewportChange) => void,
  ): () => void {
    this.assertAlive();
    return this.rootInteraction.bindViewportChanges(listener);
  }

  public bindRootPointerInputs(
    listener: (input: PatchMapRootPointerInput) => void,
  ): () => void {
    this.assertAlive();
    return this.rootInteraction.bindPointerInputs(listener);
  }

  public cancelViewportGestures(): void {
    this.assertAlive();
    this.rootInteraction.cancelGesture();
    this.scheduler.setContinuous(false, 'gesture-cancel');
  }

  /**
   * Creates the one package-owned manual frame loop for this Core instance.
   * Automatic Core instances already own their scheduler and reject a second
   * frame owner.
   */
  public createFrameLoop(options: PatchMapFrameLoopOptions = {}): PatchMapFrameLoop {
    this.assertAlive();
    if (this.autoRender) {
      throw new Error('createFrameLoop requires autoRender: false');
    }
    if (
      this.externalFrameLoop !== null &&
      !this.externalFrameLoop.isDestroyed
    ) {
      throw new Error('PatchMapRuntime already owns an active frame loop');
    }
    this.externalFrameLoop = new PatchMapFrameLoop(this, options);
    return this.externalFrameLoop;
  }

  public async destroy(): Promise<boolean> {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.suspended = false;
    this.rootInteraction.cancelGesture();
    this.externalFrameLoop?.destroy();
    this.externalFrameLoop = null;
    this.scheduler.destroy();
    this.adaptiveFrameBudget.destroy();
    this.rootInteraction.destroy();
    this.spatialHit.destroy();
    this.barPresentation.destroy();
    const cleanupFailures: Error[] = [];
    try {
      await this.sceneImages.destroy();
    } catch (error) {
      cleanupFailures.push(normalizeCleanupFailure(error));
    }
    this.updatePublishedScene({
      projection: null,
      ownedInputDataset: null,
      ownedParseOptionsKey: null,
      transientIncrementalParse: null,
      componentTargets: new Map(),
      textTargets: new Map(),
    });
    this.componentRendererFactsPublished = false;
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
      throw new AggregateError(cleanupFailures, 'PatchMap cleanup failed');
    }
    return true;
  }

  private renderScheduledFrame(timeMs: number): boolean {
    if (
      this.destroyedValue ||
      this.suspended ||
      this.terminalLoadFailure !== null
    ) {
      return false;
    }
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
        const presentationTimeMs =
          this.barPresentation.clockMs + plan.presentationDeltaMs;
        if (this.scene.activeAnimations > 0) {
          const spatialAnimationActive = this.spatialHit.hasSpatialAnimations;
          const advanced = this.scene.advance(presentationTimeMs);
          if (advanced.changed > 0 && spatialAnimationActive) this.spatialHit.invalidate();
          this.renderer.markChanges(advanced.changedRanges, 'animation');
        }
        this.advanceBarPresentation(presentationTimeMs);
        this.spatialHit.pruneCompletedSpatialAnimations(presentationTimeMs);
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
    if (this.terminalLoadFailure !== null) return;
    this.componentRendererFactsPublished = false;
    this.textRendererFactsPublished = false;
    this.requestExternalFrameLoop();
    this.requestFrame?.();
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
    if (this.terminalLoadFailure !== null) return;
    if (this.externalFrameLoop === null) return;
    if (this.externalFrameLoop.isDestroyed) {
      this.externalFrameLoop = null;
      return;
    }
    this.externalFrameLoop.request();
  }

  private applyPresentationPolicyToRenderer(): void {
    const policy = this.barPresentation.logicalPolicy;
    if (policy === null) {
      if (typeof this.renderer.setPresentationPolicy === 'function') {
        this.renderer.setPresentationPolicy(null);
      }
      return;
    }
    if (typeof this.renderer.setPresentationPolicy !== 'function') {
      throw new Error('PatchMapRuntime presentation policy requires renderer support');
    }
    const parse = this.parseResultValue;
    const resolved: PatchMapResolvedPresentationPolicy = Object.freeze({
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

  private advanceBarPresentation(timeMs: number): PatchMapPresentationFrame {
    return this.publishBarPresentationFrame(
      this.barPresentation.advance(timeMs, this.scene, this.projectionValue),
    );
  }

  private publishBarPresentationFrame(
    frame: PatchMapPresentationFrame,
  ): PatchMapPresentationFrame {
    this.spatialHit.settlePresentationIndex(frame.activeCount);
    if (this.barPresentation.publicationChangedCount === 0) return frame;
    const projection = this.barPresentation.visibleProjection;
    if (projection === null) return frame;
    this.renderer.setProjection(
      projection,
      this.barPresentation.publicationDirtyRanges,
      undefined,
      'bar-presentation',
    );
    this.componentRendererFactsPublished = false;
    return frame;
  }

  private activeSceneImageIds(): ReadonlySet<string> {
    return activeSceneImageIds(this.publishedScene.current());
  }

  private queueIntrinsicImageSize(resolution: PatchMapSceneImageIntrinsicSize): void {
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
    resolutions: readonly PatchMapIntrinsicImageGeometry[],
  ): void {
    if (this.destroyedValue || resolutions.length === 0) return;
    const base = this.parseResultValue?.projection;
    const currentIndex = this.projectionValue ?? base;
    if (!base || !currentIndex) return;
    const update = this.intrinsicImageProjectionUpdate(
      base,
      currentIndex,
      resolutions,
    );
    if (update.changedIds.length === 0) return;
    this.updatePublishedScene({ projection: update.projection });
    this.spatialHit.setDenseGeometryCompatible(false);
    const presentation = this.barPresentation.replaceProjectionPreservingVisibleBars(
      update.projection,
    );
    this.spatialHit.acceptCurrentProjectionIds(update.changedIds);
    this.renderer.setProjection(
      presentation,
      undefined,
      this.spatialHit.staleProjectionIds,
    );
    this.spatialHit.invalidate();
  }

  private projectionWithResolvedIntrinsicSizes(
    base: PatchMapProjectionIndex,
  ): PatchMapProjectionIndex {
    const update = this.intrinsicImageProjectionUpdate(
      base,
      base,
      this.resolvedIntrinsicImageSizes(base),
    );
    return update.projection;
  }

  private intrinsicImageProjectionUpdate(
    base: PatchMapProjectionIndex,
    currentIndex: PatchMapProjectionIndex,
    resolutions: readonly PatchMapIntrinsicImageGeometry[],
  ): Readonly<{
    projection: PatchMapProjectionIndex;
    changedIds: readonly string[];
  }> {
    const replacements: Record<string, PatchMapEntityProjection> = Object.create(null) as Record<
      string,
      PatchMapEntityProjection
    >;

    for (const resolution of resolutions) {
      const image = base.imagesByEntityId?.[resolution.entityId];
      if (
        !image ||
        image.dimensionMode !== 'intrinsic' ||
        image.intrinsicTransform === undefined ||
        image.bindingKey !== resolution.bindingKey
      ) {
        continue;
      }
      if (resolution.generation !== null) {
        const current = this.sceneImages.imageProbe(resolution.entityId);
        if (
          current?.generation !== resolution.generation ||
          current.bindingKey !== resolution.bindingKey ||
          current.attachmentState !== 'current'
        ) {
          continue;
        }
      }
      const sourceProjection = base.byEntityId[resolution.entityId];
      if (!sourceProjection) continue;
      const [width, height] = resolution.naturalSize;
      if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
        continue;
      }
      const affine = projectPatchMapIntrinsicImageAffine(image.intrinsicTransform, width, height);
      const localBounds = freezePatchMapBounds(0, 0, width, height);
      const projection = Object.freeze({
        ...sourceProjection,
        affine,
        localBounds,
        worldBasis: patchMapAffineBasis(affine),
        visibleCenter: patchMapAffineCenter(affine, localBounds),
      } satisfies PatchMapEntityProjection);
      if (jsonEquivalent(currentIndex.byEntityId[resolution.entityId], projection)) continue;
      replacements[resolution.entityId] = projection;
    }

    const changedIds = Object.keys(replacements).sort();
    return Object.freeze({
      projection: changedIds.length === 0
        ? currentIndex
        : freezeProjectionReplacements(currentIndex, replacements),
      changedIds: Object.freeze(changedIds),
    });
  }

  private resolvedIntrinsicImageSizes(
    projection: PatchMapProjectionIndex,
  ): readonly PatchMapIntrinsicImageGeometry[] {
    const images = projection.imagesByEntityId ?? {};
    const resolutions: PatchMapIntrinsicImageGeometry[] = [];
    for (const entityId of Object.keys(images).sort()) {
      const image = images[entityId];
      if (image?.dimensionMode !== 'intrinsic') continue;
      const probe = this.sceneImages.imageProbe(entityId);
      if (probe?.naturalSize && probe.attachmentState === 'current') {
        resolutions.push({
          entityId,
          bindingKey: probe.bindingKey,
          generation: probe.generation,
          naturalSize: probe.naturalSize,
        });
        continue;
      }
      const naturalSize = this.sceneImages.resolvedBindingNaturalSize(image.bindingKey);
      if (naturalSize === null) continue;
      resolutions.push({
        entityId,
        bindingKey: image.bindingKey,
        generation: null,
        naturalSize,
      });
    }
    return Object.freeze(resolutions);
  }

  private reapplyResolvedIntrinsicSizes(): void {
    const projection = this.parseResultValue?.projection;
    if (!projection) return;
    this.pendingIntrinsicImageSizes.clear();
    this.applyIntrinsicImageSizes(this.resolvedIntrinsicImageSizes(projection));
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
    this.updatePublishedScene({
      parse: Object.freeze({ ...parse, document }),
    });
  }

  private requireFrameReport(): FrameReport {
    const report = this.lastFrameReport;
    if (!report) throw new Error('PatchMap has not produced a frame report');
    return report;
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('PatchMapRuntime is destroyed');
    this.assertLoadPublicationHealthy();
  }

  private assertLoadPublicationHealthy(): void {
    if (this.terminalLoadFailure !== null) throw this.terminalLoadFailure;
  }

}

export function createPatchMapRuntime(options: PatchMapRuntimeOptions = {}): Promise<PatchMapRuntime> {
  return PatchMapRuntime.create(options);
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
  projection: PatchMapBarProjection | undefined,
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

function activeSceneImageIds(
  published: PatchMapPublishedSceneState,
): ReadonlySet<string> {
  const active = new Set<string>();
  const images = published.projection?.imagesByEntityId ?? {};
  for (const entityId of Object.keys(images)) {
    const entity = published.scene.get(entityId);
    if (entity?.kind === 'image' && entity.visible) active.add(entityId);
  }
  return active;
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

function yieldPatchMapMainTask(): Promise<void> {
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

function validateWorldTransform(view: PatchMapWorldTransform): void {
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

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function reconcileFacts(
  plan: PatchMapDenseReconcilePlan,
  semanticChanged: boolean,
  before: PatchMapReconcileFactStamp,
  after: PatchMapReconcileFactStamp,
): PatchMapReconcileFacts {
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
  updates: readonly PatchMapDirectElementAngleUpdate[],
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
  updates: readonly PatchMapDirectTextUpdate[],
  targets: ReadonlyMap<string, IndexedTextTarget | null>,
): readonly string[] | undefined {
  const ids = new Set<string>();
  for (const update of updates) {
    const indexed = targets.get(patchMapTextTargetKey({
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
  updates: readonly PatchMapDirectTextUpdate[],
  targets: ReadonlyMap<string, IndexedComponentTarget | null>,
): readonly PatchMapDirectTextParseTargetIndex[] | undefined {
  const hints: PatchMapDirectTextParseTargetIndex[] = [];
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
    hints.push(indexed as PatchMapDirectTextParseTargetIndex);
  }
  return hints.length === 0 ? undefined : Object.freeze(hints);
}

function directBarEntityIds(
  updates: readonly PatchMapDirectBarHeightUpdate[],
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

function changedProjectionEntityIds(
  previous: PatchMapProjectionIndex,
  next: PatchMapProjectionIndex,
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
  updates: readonly PatchMapDirectBarHeightUpdate[],
  componentTargets: ReadonlyMap<string, IndexedComponentTarget | null>,
  recordStrategy: PatchMapStableRecordStrategy,
): ParsePatchMapResult | null {
  if (!isOwnedPatchMapDataset(input) || updates.length === 0) return null;
  const entities = [...previous.document.entities];
  const selectedEntityProjections = Object.create(null) as Record<
    string,
    PatchMapEntityProjection
  >;
  const selectedBarProjections = Object.create(null) as Record<
    string,
    PatchMapBarProjection
  >;
  const selectedComponentProjections = Object.create(null) as Record<
    string,
    PatchMapComponentVisualProjection
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
    const affine = freezePatchMapAffine(
      projection.affine[0],
      projection.affine[1],
      projection.affine[2],
      projection.affine[3],
      projection.affine[4] + ownerAffine[2] * localDeltaY,
      projection.affine[5] + ownerAffine[3] * localDeltaY,
    );
    const dense = projectPatchMapSignedRect(
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
    const localBounds = freezePatchMapBounds(
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
      worldBasis: patchMapAffineBasis(affine),
      visibleCenter: patchMapAffineCenter(affine, localBounds),
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

  const entityProjections = patchPatchMapStableRecord(
    previous.projection.byEntityId,
    selectedEntityProjections,
    entityIds,
    recordStrategy,
    true,
  );
  const barProjections = patchPatchMapStableRecord(
    previous.projection.barsByEntityId,
    selectedBarProjections,
    entityIds,
    recordStrategy,
    true,
  );
  const componentProjections = patchPatchMapStableRecord(
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
  placement: NonNullable<PatchMapProjectionIndex['barsByEntityId']>[string]['placement'],
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

function compactPatchMapProjectionStableRecords(
  projection: PatchMapProjectionIndex,
): void {
  for (const record of patchMapProjectionStableRecords(projection)) {
    compactPatchMapStableRecord(record);
  }
}

function rollbackPatchMapProjectionStableRecords(
  candidate: PatchMapProjectionIndex,
  previous: PatchMapProjectionIndex,
): void {
  const candidateRecords = patchMapProjectionStableRecords(candidate);
  const previousRecords = patchMapProjectionStableRecords(previous);
  for (let index = 0; index < candidateRecords.length; index += 1) {
    rollbackPatchMapStableRecord(
      candidateRecords[index],
      previousRecords[index],
    );
  }
}

function patchMapProjectionStableRecords(
  projection: PatchMapProjectionIndex,
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
  options: PatchMapReconcileOptions,
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

interface PatchMapReconcileFactStamp {
  readonly revision: number;
  readonly entityCount: number;
  readonly selectionCount: number;
}

function reconcileFactStamp(scene: PatchMapScene): PatchMapReconcileFactStamp {
  return Object.freeze({
    revision: scene.revision,
    entityCount: scene.entityCount,
    selectionCount: scene.selection().refs.length,
  });
}

function freezeReconcileResult<T extends PatchMapReconcileResult>(result: T): T {
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

function retainedOwnedInputDataset(
  input: unknown,
  options: ParsePatchMapOptions,
): Readonly<{
  dataset: readonly unknown[] | null;
  optionsKey: string | null;
}> {
  const optionsKey = incrementalParseOptionsKey(options);
  const dataset = isOwnedPatchMapDataset(input) && optionsKey !== null
    ? input
    : null;
  return Object.freeze({
    dataset,
    optionsKey: dataset === null ? null : optionsKey,
  });
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
    `PatchMapRuntime.commit operation ${index} (${operation}) cannot update the image projection sidecar; ` +
    'submit PATCH MAP JSON through PatchMapRuntime.reconcile instead',
  );
}

function normalizeCleanupFailure(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function freezeProjectionReplacements(
  source: PatchMapProjectionIndex,
  replacements: Readonly<Record<string, PatchMapEntityProjection>>,
): PatchMapProjectionIndex {
  const byEntityId = Object.freeze({
    ...source.byEntityId,
    ...replacements,
  });
  return Object.freeze({
    ...source,
    byEntityId,
  });
}

function normalizeRefreshTarget(
  target: unknown,
  index: number,
): PatchMapSemanticTarget {
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
  target: Extract<PatchMapSemanticTarget, { readonly kind: 'component' }>,
): readonly string[] {
  const indexed = targets.get(componentTargetKey({
    ownerId: target.ownerId,
    componentId: target.id,
  }));
  return indexed === undefined || indexed === null
    ? Object.freeze([])
    : Object.freeze([indexed.entityId]);
}

export type { EntityPatch };
