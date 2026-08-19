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
  TransactionBatch,
} from './dense/contracts';
import { RenderKind } from './dense/renderer-types';
import type {
  ParseDiagnostic,
  ParseIdentityIndex,
  ParsePatchMapOptions,
  ParsePatchMapResult,
  PatchMapBarProjection,
  PatchMapProjectionIndex,
} from './contracts';
import {
  PATCH_MAP_PRESENTATION_POLICY_REVISION,
  type PatchMapPresentationPolicyInput,
  type PatchMapPresentationPolicyProductProbe,
  type PatchMapResolvedPresentationPolicy,
} from './presentation-policy';
import type { PatchMapPaintOrderProductProbe } from './paint-order-product';
import {
  parsePatchMapV010,
  parsePatchMapV010Async,
} from './parser';
import {
  primePatchMapV010IncrementalFlat,
} from './incremental-parser';
import {
  withRendererDegradationDiagnostics,
} from './renderers/degradation';
import type { PatchMapFrameLoop, PatchMapFrameLoopOptions } from './scheduler';
import {
  primePatchMapParsedSceneReconcileIncremental,
} from './semantic/reconcile';
import {
  PatchMapPixiRenderer,
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
import type { PatchMapBoundsTuple } from './semantic/geometry';
import type { PatchMapStableRecordStrategy } from './semantic/stable-record-overlay';
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
  type PatchMapInstanceBarHeightBatchRequest,
  type PatchMapInstanceBarHeightBatchResult,
  type PatchMapLoadResult,
  type PatchMapPrepareResult,
  type PatchMapPresentationLifecycleResult,
  type PatchMapReconcileOptions,
  type PatchMapReconcileResult,
  type PatchMapRootPointerInput,
  type PatchMapRootViewportChange,
  type PatchMapRuntimeDebug,
  type PatchMapRuntimeOptions,
  type PatchMapSelectionMarqueeInput,
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
} from './core/published-scene-state';
import {
  PatchMapSpatialHitAuthority,
  isLargePatchMapAnimatedBarBatch,
  type PatchMapSpatialHitCommitImpact,
} from './core/spatial-hit-authority';
import {
  createPatchMapBarPresentationProductProbe,
  createPatchMapComponentVisualProductProbe,
  createPatchMapRuntimePaintOrderProbe,
  createPatchMapTextProductProbe,
  indexPatchMapComponentProbeTargets as indexComponentTargets,
  indexPatchMapTextProbeTargets as indexTextTargets,
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
  resolvePresentationFillOverrides,
  semanticPresentationFillDenseIds,
  semanticSelectionDenseIds,
} from './core/semantic-dense-planning';
import {
  freezeReconcileResult,
  reconcileFacts,
  reconcileFactStamp,
  retainedOwnedInputDataset,
} from './core/reconcile-planning';
import {
  preparePatchMapReconcileCandidate,
  type PatchMapPreparedReconcileCandidate,
} from './core/reconcile-candidate';
import {
  intrinsicImageProjectionUpdate,
  projectionWithResolvedIntrinsicSizes,
  resolvedIntrinsicImageSizes,
  type PatchMapIntrinsicImageGeometry,
} from './core/intrinsic-image-projection';
import {
  compactPatchMapProjectionStableRecords,
  rollbackPatchMapProjectionStableRecords,
} from './core/projection-records';
import {
  preparePatchMapIncrementalPreview,
  preparePatchMapSemanticRefresh,
  preparePatchMapTransientDirtyRanges,
} from './core/transient-projection-planning';
import { PatchMapFramePublicationAuthority } from './core/frame-publication-authority';
import { contiguousSlotRanges, mergeSlotRanges } from './core/slot-ranges';
import {
  applyPatchMapInstanceBarHeightStorageUpdates,
  instancePresentationRequestFromStored,
  isPatchMapInstanceBarHeightOnlyRequest,
  planPatchMapInstanceBarHeightOnlyOverlay,
  planPatchMapInstancePresentationOverlay,
  type PatchMapStoredInstancePresentation,
} from './core/instance-presentation-overlay';
import type { PatchMapRendererEntityPresentationOverride } from './renderers/presentation-store';

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

export class PatchMapRuntime {
  public readonly renderer: PatchMapPixiRenderer;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics;

  private readonly publishedScene: PatchMapPublishedSceneAuthority;
  private readonly sceneOptions: CoreSceneOptions;
  private readonly framePublication: PatchMapFramePublicationAuthority;
  private readonly sceneImages: PatchMapSceneImageController;
  private readonly loadAuthority: PatchMapLoadAuthority;
  private readonly barPresentation = new PatchMapBarPresentationAuthority();
  private readonly parseOptions: ParsePatchMapOptions;
  private readonly onTerminalFailure: ((error: Error) => void) | undefined;
  private readonly stableRecordStrategy: PatchMapStableRecordStrategy;
  private readonly rootInteraction: PatchMapRootInteractionAuthority;
  private spatialHit = new PatchMapSpatialHitAuthority();
  private sceneImageReconcileSuspended = false;
  private currentView: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private worldFlipX = false;
  private worldFlipY = false;
  private destroyedValue = false;
  private pendingIntrinsicImageSizes = new Map<string, PatchMapSceneImageIntrinsicSize>();
  private terminalFailure: Error | null = null;
  private instancePresentations = new Map<string, PatchMapStoredInstancePresentation>();
  private instancePresentationOverrides = new Map<
    string,
    PatchMapRendererEntityPresentationOverride
  >();

  private constructor(renderer: PatchMapPixiRenderer, options: PatchMapRuntimeOptions) {
    this.renderer = renderer;
    this.initializationMetrics = renderer.initializationMetrics;
    this.parseOptions = options.parse ?? {};
    const autoRender = options.autoRender ?? true;
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
    this.framePublication = new PatchMapFramePublicationAuthority(
      renderer,
      this.barPresentation,
      {
        assertAlive: () => this.assertAlive(),
        assertPublicationHealthy: () => this.assertPublicationHealthy(),
        isRuntimeDestroyed: () => this.destroyedValue,
        readScene: () => this.scene,
        readProjection: () => this.projectionValue,
        readSpatialHit: () => this.spatialHit,
        readFrameWorkloadSize: () => this.parseResultValue?.identity.counts.sourceElements ?? 0,
        readViewportGestureActive: () => this.rootInteraction.activeGesture,
        applyPendingIntrinsicImageSizes: () => this.applyPendingIntrinsicImageSizes(),
        cancelRootGesture: () => this.rootInteraction.cancelGesture(),
        finalizeSceneImagesAfterRenderedFrame: () => {
          void this.sceneImages.finalizeAfterRenderedFrame();
        },
      },
      {
        autoRender,
        ...(options.requestFrame === undefined ? {} : { requestFrame: options.requestFrame }),
      },
    );
    this.sceneImages = new PatchMapSceneImageController(renderer, {
      onInvalidate: (reason) => {
        if (this.loadAuthority.publicationSideEffectsInProgress) return;
        this.framePublication.invalidate(reason);
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
        requestGestureFrame: () => this.framePublication.requestExternalFrameLoop(),
        setGestureContinuous: (enabled, reason) => {
          this.framePublication.setContinuous(enabled, reason);
        },
      },
      {
        selectionMode: options.rootSelectionMode ?? 'immediate',
        autoRender,
        wheelActivationModifier: options.rootWheelActivationModifier ?? 'none',
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
    this.assertPublicationHealthy();
    return this.entityCountValue;
  }

  public get activeAnimations(): number {
    return this.framePublication.activeAnimations;
  }

  /** Source-level workload size used by the shared adaptive frame policy. */
  public get frameWorkloadSize(): number {
    return this.framePublication.frameWorkloadSize;
  }

  /** Current monotonic presentation clock used by a package-owned frame loop. */
  public get frameTimeMs(): number {
    return this.framePublication.frameTimeMs;
  }

  /** Root-owned gesture state used by automatic and host-driven frame loops. */
  public get viewportGestureActive(): boolean {
    return this.framePublication.viewportGestureActive;
  }

  public get presentationRevision(): number {
    return this.framePublication.presentationRevision;
  }

  public get reducedMotion(): boolean {
    return this.framePublication.reducedMotion;
  }

  public get view(): CoreView {
    this.assertPublicationHealthy();
    return this.currentView;
  }

  public get diagnostics(): readonly ParseDiagnostic[] {
    this.assertPublicationHealthy();
    return this.parseResultValue?.diagnostics ?? [];
  }

  public get identity(): ParseIdentityIndex | null {
    this.assertPublicationHealthy();
    return this.parseResultValue?.identity ?? null;
  }

  public get projection(): PatchMapProjectionIndex | null {
    this.assertPublicationHealthy();
    return this.projectionValue;
  }

  /** Renderer-visible projection. Semantic consumers should use `projection`. */
  public get visibleProjection(): PatchMapProjectionIndex | null {
    this.assertPublicationHealthy();
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
        projection: projectionWithResolvedIntrinsicSizes(parse.projection, this.sceneImages),
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
        projection: projectionWithResolvedIntrinsicSizes(parse.projection, this.sceneImages),
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
        automaticAnimationFramesActive: this.framePublication.automaticAnimationFramesActive,
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
      this.setRendererInstancePresentationOverrides(new Map());
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
    this.instancePresentations.clear();
    this.instancePresentationOverrides.clear();
    this.framePublication.resetAdaptiveBudget();
    this.framePublication.invalidate('load');
  }

  private installLoadedRuntimeState(state: PatchMapLoadRuntimeState): void {
    this.barPresentation.installLoadedState(state.barPresentation);
    this.spatialHit = state.spatialHit;
    this.currentView = state.currentView;
    this.pendingIntrinsicImageSizes = state.pendingIntrinsicImageSizes;
    this.framePublication.installAutomaticAnimationFramesActive(
      state.automaticAnimationFramesActive,
    );
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
      this.renderer.restorePublicationCheckpoint(checkpoint.state);
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
    this.markTerminalFailure(
      'PatchMapRuntime entered a terminal state after load rollback failed',
      cause,
    );
  }

  private markTerminalMutationFailure(cause: unknown): void {
    this.markTerminalFailure(
      'PatchMapRuntime entered a terminal state after mutation publication failed',
      cause,
    );
  }

  private markTerminalFailure(message: string, cause: unknown): void {
    if (this.terminalFailure !== null) return;
    const failure = new Error(message, { cause });
    this.terminalFailure = failure;
    this.framePublication.sealTerminal();
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
    const published = this.publishedScene.current();
    const currentParse = published.parse;
    if (currentParse === null) {
      throw new Error('PatchMapRuntime.reconcile requires a loaded PATCH MAP dataset');
    }

    const totalStarted = now();
    const before = reconcileFactStamp(published.scene);
    const candidate = preparePatchMapReconcileCandidate(
      input,
      options,
      this.parseOptions,
      currentParse,
      published,
      published.scene,
      this.stableRecordStrategy,
      this.renderer.strategy,
    );
    const {
      parse,
      plan,
      path,
      semanticChanged,
      parseMs,
      planMs,
    } = candidate;

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
        path === 'direct-text'
          ? 'text-only'
          : path === 'direct-bar'
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
    try {
      this.publishReconcileCandidate(input, options, candidate, commit);
    } catch (error) {
      // The dense store has already committed. Its exact slot generations,
      // animation table, and history cannot be reconstructed without changing
      // stable identity. Seal the runtime instead of exposing a partially
      // published scene through Engine's still-previous semantic authority.
      this.markTerminalMutationFailure(error);
      throw error;
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

  private publishReconcileCandidate(
    input: unknown,
    options: PatchMapReconcileOptions,
    candidate: PatchMapPreparedReconcileCandidate,
    commit: CommitResult,
  ): void {
    const {
      parse,
      path,
      incrementalEntityIds,
      hierarchyOnlyTargetMapping,
      structuralPresentationEntityIds,
      parseOptions,
    } = candidate;
    const previousProjection = this.projectionValue;
    const mappingReusable =
      path === 'direct-bar' ||
      path === 'direct-text' ||
      path === 'direct-angle' ||
      hierarchyOnlyTargetMapping;
    const candidateComponentTargets = mappingReusable
      ? this.componentTargets
      : indexComponentTargets(parse);
    const retainedInput = retainedOwnedInputDataset(input, parseOptions);
    const overlayPlan = this.instancePresentations.size === 0
      ? null
      : planPatchMapInstancePresentationOverlay(
          instancePresentationRequestFromStored(
            [...this.instancePresentations.values()],
            !this.barPresentation.reducedMotion && options.animateBarChanges !== false,
          ),
          parse.projection,
          parse.projection,
          candidateComponentTargets,
          retainedInput.dataset,
          this.parseOptions,
          this.scene.renderStore,
          new Map(),
          new Map(),
          this.stableRecordStrategy,
          {
            strictMissing: false,
          },
        );
    const effectiveProjection = overlayPlan?.projection ?? parse.projection;
    const basePresentationEntityIds = incrementalEntityIds ??
      (
        hierarchyOnlyTargetMapping
          ? Object.freeze([])
          : structuralPresentationEntityIds
      );
    const presentationEntityIds = basePresentationEntityIds === undefined
      ? undefined
      : Object.freeze([...new Set([
          ...basePresentationEntityIds,
          ...(overlayPlan?.changedEntityIds ?? []),
        ])]);
    const presentation = this.barPresentation.reconcile(
      previousProjection,
      effectiveProjection,
      this.scene,
      !this.barPresentation.reducedMotion && options.animateBarChanges !== false,
      path === 'direct-bar' ? undefined : options.animatedBarTargets,
      presentationEntityIds,
      parse.identity.entitySourceById,
    );
    const overlayDirtyRanges = contiguousSlotRanges(
      (overlayPlan?.changedEntityIds ?? []).flatMap((entityId) => {
        const ref = this.scene.ref(entityId);
        return ref === null ? [] : [ref.slot];
      }),
    );
    const publicationRanges = mergeSlotRanges(commit.changedRanges, overlayDirtyRanges);
    this.updatePublishedScene({
      parse,
      transientIncrementalParse: null,
      projection: effectiveProjection,
      ownedInputDataset: retainedInput.dataset,
      ownedParseOptionsKey: retainedInput.optionsKey,
    });
    this.spatialHit.setDenseGeometryCompatible(true);
    this.spatialHit.clearStaleProjectionIds();
    this.renderer.setProjection(
      presentation,
      publicationRanges,
      this.spatialHit.staleProjectionIds,
      path === 'direct-text'
        ? 'text'
        : path === 'direct-bar'
          ? 'bar-presentation'
          : undefined,
    );
    this.setRendererInstancePresentationOverrides(
      overlayPlan?.rendererOverrides ?? new Map(),
      publicationRanges,
    );
    if (isLargePatchMapAnimatedBarBatch(this.barPresentation.activeCount)) {
      this.renderer.setAggregateCullPrecision(false);
    }
    if (
      path !== 'direct-bar' &&
      path !== 'direct-text' &&
      path !== 'direct-angle'
    ) {
      this.sceneImages.reconcile(effectiveProjection, {
        activeEntityIds: activeSceneImageIds(
          this.publishedScene.current(),
          overlayPlan?.rendererOverrides,
        ),
      });
      this.reapplyResolvedIntrinsicSizes();
      if (path !== 'incremental' && !hierarchyOnlyTargetMapping) {
        this.updatePublishedScene({
          componentTargets: candidateComponentTargets,
          textTargets: indexTextTargets(parse),
        });
      }
      this.applyPresentationPolicyToRenderer();
    }
    this.spatialHit.clearSpatialAnimations();
    this.spatialHit.invalidate(
      path === 'direct-bar' && this.barPresentation.activeCount > 0,
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
    if (this.barPresentation.activeCount > 0) {
      this.framePublication.invalidate('presentation');
    }
    this.instancePresentations = new Map(overlayPlan?.presentations ?? []);
    this.instancePresentationOverrides = new Map(overlayPlan?.rendererOverrides ?? []);
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(effectiveProjection);
    }
  }

  /** Build aggregate CPU/GPU resources without presenting a visible frame. */
  public async prepare(): Promise<PatchMapPrepareResult> {
    return this.framePublication.prepare();
  }

  public flush(reason = 'manual'): FrameReport {
    return this.framePublication.flush(reason);
  }

  /** Advance the deterministic presentation clock and publish one manual frame. */
  public publishFrame(timeMs: number): FrameReport {
    return this.framePublication.publishFrame(timeMs);
  }

  /**
   * Reduced motion is a presentation policy, not a semantic mutation. Enabling
   * it settles current bar sidecars at their committed destinations and keeps
   * later reconciles from scheduling interpolation.
   */
  public setReducedMotion(enabled: boolean): boolean {
    return this.framePublication.setReducedMotion(enabled);
  }

  /**
   * Gate the manual scheduler and settle renderer-visible values at their
   * already-committed semantic destinations. The supplied time is recorded,
   * but no elapsed wall-clock delta is integrated.
   */
  public suspendPresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    return this.framePublication.suspendPresentation(timeMs);
  }

  /**
   * Resume from a deterministic time origin. Rendering remains manual and the
   * caller chooses the single coherent publication frame.
   */
  public resumePresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    return this.framePublication.resumePresentation(timeMs);
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
    try {
      this.publishDenseCommit(
        batch,
        result,
        directImageVisibilityIds,
        hitImpact,
        rendererDomain,
      );
    } catch (error) {
      this.markTerminalMutationFailure(error);
      throw error;
    }
    return result;
  }

  private publishDenseCommit(
    batch: TransactionBatch,
    result: CommitResult,
    directImageVisibilityIds: ReadonlySet<string>,
    hitImpact: PatchMapSpatialHitCommitImpact,
    rendererDomain?: 'bar-only' | 'text-only',
  ): void {
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
    this.framePublication.invalidate(
      this.scene.activeAnimations > 0 ? 'animation' : 'commit',
    );
    const entityCountDelta = result.added - result.removed;
    if (entityCountDelta !== 0) {
      this.updatePublishedScene({
        entityCount: this.entityCountValue + entityCountDelta,
      });
    }
  }

  public advance(timeMs: number): AdvanceResult {
    return this.framePublication.advance(timeMs);
  }

  public setView(view: CoreView): CommitResult {
    return this.commit({ operations: [{ type: 'view', view }] });
  }

  public setWorldTransform(view: PatchMapWorldTransform): CommitResult {
    this.assertAlive();
    validateWorldTransform(view);
    const previousOrientation = Object.freeze({
      rotationDegrees: this.currentView.rotation ?? 0,
      flipX: this.worldFlipX,
      flipY: this.worldFlipY,
    });
    const nextOrientation = Object.freeze({
      rotationDegrees: view.rotationDegrees,
      flipX: view.flipX,
      flipY: view.flipY,
    });
    try {
      this.renderer.setWorldOrientation(nextOrientation);
      const result = this.setView({
        x: view.x,
        y: view.y,
        scale: view.scale,
        rotation: view.rotationDegrees,
      });
      this.worldFlipX = view.flipX;
      this.worldFlipY = view.flipY;
      return result;
    } catch (error) {
      try {
        this.renderer.setWorldOrientation(previousOrientation);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'world transform and renderer-orientation rollback both failed',
        );
      }
      throw error;
    }
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
    return this.sceneImages.probe(this.framePublication.componentRendererFactsPublished);
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
      this.framePublication.componentRendererFactsPublished,
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
      this.framePublication.renderedSceneRevision,
    );
  }

  public textProbe(target: PatchMapTextTarget): PatchMapTextProductProbe | null {
    if (this.destroyedValue) return null;
    this.assertPublicationHealthy();
    return createPatchMapTextProductProbe(
      target,
      this.textTargets,
      this.projectionValue,
      this.barPresentation.visibleProjection,
      this.scene,
      this.renderer,
      this.framePublication.textRendererFactsPublished,
      this.framePublication.renderedSceneRevision,
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
    this.framePublication.invalidate('selection');
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
    if (typeof this.renderer.setInteractionOverlayPolicy !== 'function') return false;
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
      strokeScale: input.strokeScale,
      minStrokeCssPx: input.minStrokeCssPx,
      strokeAlignment: input.strokeAlignment,
      color: input.color,
      displayMode: input.displayMode,
      marqueeColor: input.marqueeColor,
      marqueeStrokeCssPx: input.marqueeStrokeCssPx,
      marqueeFillAlpha: input.marqueeFillAlpha,
    });
    const changed = this.renderer.setInteractionOverlayPolicy(policy);
    if (changed) this.framePublication.invalidate('interaction-overlay-policy');
    return changed;
  }

  public setSelectionMarquee(input: PatchMapSelectionMarqueeInput | null): boolean {
    this.assertAlive();
    if (typeof this.renderer.setSelectionMarquee !== 'function') return false;
    const changed = this.renderer.setSelectionMarquee(input);
    if (changed) this.framePublication.invalidate('selection-marquee');
    return changed;
  }

  public setPresentationPolicy(
    input: PatchMapPresentationPolicyInput,
  ): PatchMapPresentationPolicyProductProbe {
    this.assertAlive();
    if (!this.barPresentation.setLogicalPolicy(input)) return this.presentationPolicyProbe();
    this.applyPresentationPolicyToRenderer();
    this.spatialHit.invalidate();
    this.framePublication.invalidate('presentation-policy');
    return this.presentationPolicyProbe();
  }

  public clearPresentationPolicy(): PatchMapPresentationPolicyProductProbe {
    this.assertAlive();
    if (!this.barPresentation.clearLogicalPolicy()) return this.presentationPolicyProbe();
    this.renderer.setPresentationPolicy(null);
    this.spatialHit.invalidate();
    this.framePublication.invalidate('presentation-policy:clear');
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
    const fillOverrideById = new Map(
      policy?.fillOverrides.map((entry) => [entry.id, entry] as const) ?? [],
    );
    const entities = sourceIds.map((id) => {
      const denseEntityIds = parse === null
        ? Object.freeze([] as string[])
        : semanticSelectionDenseIds(parse, [id]);
      const rendererFacts = denseEntityIds.flatMap((entityId) => {
        const probe = this.renderer.presentationEntityProbe(entityId);
        return probe === null ? [] : [probe];
      });
      const fillOverride = fillOverrideById.get(id);
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
    const prepared = preparePatchMapIncrementalPreview(
      input,
      dirtyRootIds,
      this.parseOptions,
      this.publishedScene.current(),
    );
    if (prepared === null) return null;
    this.updatePublishedScene({
      transientIncrementalParse: prepared,
    });
    const presentation = this.barPresentation.applyTransientEntityProjections(
      prepared.selected.projection.byEntityId,
      prepared.entityIds,
    );
    if (presentation === null) return null;
    const dirtyRanges = preparePatchMapTransientDirtyRanges(prepared.entityIds, this.scene);
    this.renderer.setProjection(
      presentation,
      dirtyRanges,
      this.spatialHit.staleProjectionIds,
    );
    this.framePublication.markProjectionFactsStale();
    this.spatialHit.invalidate();
    this.framePublication.invalidate('transformer-preview');
    return Object.freeze({
      changed: dirtyRanges.length > 0,
      entityIds: prepared.entityIds,
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
      this.framePublication.markProjectionFactsStale();
      this.spatialHit.invalidate();
      this.framePublication.invalidate('transformer-preview-clear');
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
    const prepared = preparePatchMapSemanticRefresh(
      targets,
      options,
      parse,
      this.componentTargets,
      this.scene,
    );
    if (options.strict === true && prepared.missingTargets.length > 0) return prepared;
    const projection = this.barPresentation.visibleProjection;
    if (prepared.dirtyRanges.length > 0 && projection !== null) {
      this.renderer.setProjection(projection, prepared.dirtyRanges);
      this.framePublication.markProjectionFactsStale();
      this.spatialHit.invalidate();
      this.framePublication.invalidate('semantic-refresh');
    }
    return prepared;
  }

  /** Publish runtime-only concrete component presentation without semantic mutation. */
  public updateInstanceBarHeights(
    request: PatchMapInstanceBarHeightBatchRequest,
  ): PatchMapInstanceBarHeightBatchResult {
    this.assertAlive();
    const authored = this.parseResultValue?.projection;
    const current = this.projectionValue;
    if (authored === undefined || current === null) {
      throw new Error('PatchMapRuntime.updateInstanceBarHeights requires a loaded dataset');
    }
    if (isPatchMapInstanceBarHeightOnlyRequest(request)) {
      return this.updateInstanceBarHeightOnly(request, current, authored);
    }
    const plan = planPatchMapInstancePresentationOverlay(
      request,
      current,
      authored,
      this.componentTargets,
      this.publishedScene.current().ownedInputDataset,
      this.parseOptions,
      this.scene.renderStore,
      this.instancePresentations,
      this.instancePresentationOverrides,
      this.stableRecordStrategy,
    );
    if (plan.missingTargets.length > 0) {
      return Object.freeze({
        changed: false,
        appliedTargets: Object.freeze([]),
        missingTargets: plan.missingTargets,
        dirtyRanges: Object.freeze([]),
        activeAnimationCount: this.barPresentation.activeCount,
        overlayCount: this.instancePresentations.size,
      });
    }
    if (plan.changedEntityIds.length === 0) {
      this.instancePresentations = new Map(plan.presentations);
      this.instancePresentationOverrides = new Map(plan.rendererOverrides);
      return Object.freeze({
        changed: plan.overlayStateChanged,
        appliedTargets: plan.appliedTargets,
        missingTargets: Object.freeze([]),
        dirtyRanges: Object.freeze([]),
        activeAnimationCount: this.barPresentation.activeCount,
        overlayCount: this.instancePresentations.size,
      });
    }

    const dirtyRanges = contiguousSlotRanges(plan.changedEntityIds.flatMap((entityId) => {
      const ref = this.scene.ref(entityId);
      return ref === null ? [] : [ref.slot];
    }));
    const imagePlan = this.sceneImages.prepareReconcile(plan.projection, {
      activeEntityIds: activeSceneImageIds(
        this.publishedScene.current(),
        plan.rendererOverrides,
        plan.projection,
      ),
    });
    const presentation = this.barPresentation.reconcile(
      current,
      plan.projection,
      this.scene,
      !this.barPresentation.reducedMotion && request.animate !== false,
      undefined,
      plan.changedEntityIds,
      this.parseResultValue?.identity.entitySourceById,
    );
    this.updatePublishedScene({
      projection: plan.projection,
      transientIncrementalParse: null,
    });
    try {
      this.renderer.setProjection(
        presentation,
        dirtyRanges,
        this.spatialHit.staleProjectionIds,
        'bar-presentation',
      );
      this.setRendererInstancePresentationOverrides(plan.rendererOverrides, dirtyRanges);
    } catch (error) {
      this.markTerminalMutationFailure(error);
      throw error;
    }
    try {
      this.sceneImages.commitReconcile(imagePlan);
    } catch (error) {
      this.markTerminalMutationFailure(error);
      throw error;
    }
    this.instancePresentations = new Map(plan.presentations);
    this.instancePresentationOverrides = new Map(plan.rendererOverrides);
    this.framePublication.markProjectionFactsStale();
    this.spatialHit.setDenseGeometryCompatible(false);
    this.spatialHit.clearSpatialAnimations();
    this.spatialHit.invalidate(this.barPresentation.activeCount > 0);
    this.spatialHit.primeAnimatedBarsIfNeeded(
      this.rootInteraction.pointerListenerCount,
      this.scene,
      this.projectionValue,
      this.barPresentation.visibleProjection,
      this.barPresentation,
    );
    if (isLargePatchMapAnimatedBarBatch(this.barPresentation.activeCount)) {
      this.renderer.setAggregateCullPrecision(false);
    }
    this.framePublication.invalidate('instance-presentation-overlay');
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(plan.projection);
    }
    return Object.freeze({
      changed: true,
      appliedTargets: plan.appliedTargets,
      missingTargets: Object.freeze([]),
      dirtyRanges,
      activeAnimationCount: this.barPresentation.activeCount,
      overlayCount: this.instancePresentations.size,
    });
  }

  private updateInstanceBarHeightOnly(
    request: PatchMapInstanceBarHeightBatchRequest,
    current: PatchMapProjectionIndex,
    authored: PatchMapProjectionIndex,
  ): PatchMapInstanceBarHeightBatchResult {
    const plan = planPatchMapInstanceBarHeightOnlyOverlay(
      request,
      current,
      authored,
      this.componentTargets,
      this.instancePresentations,
      this.stableRecordStrategy,
    );
    if (plan.missingTargets.length > 0) {
      return Object.freeze({
        changed: false,
        appliedTargets: Object.freeze([]),
        missingTargets: plan.missingTargets,
        dirtyRanges: Object.freeze([]),
        activeAnimationCount: this.barPresentation.activeCount,
        overlayCount: this.instancePresentations.size,
      });
    }
    if (plan.changedEntityIds.length === 0) {
      applyPatchMapInstanceBarHeightStorageUpdates(
        this.instancePresentations,
        plan.storageUpdates,
      );
      return Object.freeze({
        changed: plan.overlayStateChanged,
        appliedTargets: plan.appliedTargets,
        missingTargets: Object.freeze([]),
        dirtyRanges: Object.freeze([]),
        activeAnimationCount: this.barPresentation.activeCount,
        overlayCount: this.instancePresentations.size,
      });
    }

    const dirtyRanges = contiguousSlotRanges(plan.changedEntityIds.flatMap((entityId) => {
      const ref = this.scene.ref(entityId);
      return ref === null ? [] : [ref.slot];
    }));
    const presentation = this.barPresentation.reconcile(
      current,
      plan.projection,
      this.scene,
      !this.barPresentation.reducedMotion && request.animate !== false,
      undefined,
      plan.changedEntityIds,
      this.parseResultValue?.identity.entitySourceById,
    );
    this.updatePublishedScene({
      projection: plan.projection,
      transientIncrementalParse: null,
    });
    try {
      this.renderer.setProjection(
        presentation,
        dirtyRanges,
        this.spatialHit.staleProjectionIds,
        'bar-presentation',
      );
    } catch (error) {
      this.markTerminalMutationFailure(error);
      throw error;
    }
    applyPatchMapInstanceBarHeightStorageUpdates(
      this.instancePresentations,
      plan.storageUpdates,
    );
    this.framePublication.markProjectionFactsStale();
    this.spatialHit.setDenseGeometryCompatible(false);
    this.spatialHit.clearSpatialAnimations();
    this.spatialHit.invalidate(this.barPresentation.activeCount > 0);
    this.spatialHit.primeAnimatedBarsIfNeeded(
      this.rootInteraction.pointerListenerCount,
      this.scene,
      this.projectionValue,
      this.barPresentation.visibleProjection,
      this.barPresentation,
    );
    if (isLargePatchMapAnimatedBarBatch(this.barPresentation.activeCount)) {
      this.renderer.setAggregateCullPrecision(false);
    }
    this.framePublication.invalidate('instance-bar-height-overlay');
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(plan.projection);
    }
    return Object.freeze({
      changed: true,
      appliedTargets: plan.appliedTargets,
      missingTargets: Object.freeze([]),
      dirtyRanges,
      activeAnimationCount: this.barPresentation.activeCount,
      overlayCount: this.instancePresentations.size,
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
      this.framePublication.invalidate('resize');
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
    const activeBindingKeys = this.activeSceneImageBindingKeys();
    if (activeBindingKeys.length > 0) {
      await this.settleSceneImageBindings(activeBindingKeys);
      this.assertAlive();
    }
    this.flush('capture');
    return this.renderer.captureBase64();
  }

  public ref(id: string): EntityRef | null {
    this.assertPublicationHealthy();
    return this.scene.ref(id);
  }

  public get(target: string | EntityRef): EntitySnapshot | null {
    this.assertPublicationHealthy();
    return this.scene.get(target);
  }

  public query(filter: QueryFilter = {}): readonly EntityRef[] {
    this.assertPublicationHealthy();
    return this.scene.query(filter);
  }

  public selection(): SelectionSnapshot {
    this.assertPublicationHealthy();
    return this.scene.selection();
  }

  public snapshot(): SceneSnapshot {
    this.assertPublicationHealthy();
    return this.scene.snapshot();
  }

  public debugSnapshot(): PatchMapRuntimeDebug {
    this.assertPublicationHealthy();
    const selectionCount = this.destroyedValue ? 0 : this.scene.selection().refs.length;
    return Object.freeze({
      destroyed: this.destroyedValue,
      suspended: this.framePublication.suspended,
      entityCount: this.entityCountValue,
      activeAnimations: this.activeAnimations,
      activeGestureCount: this.rootInteraction.activeGesture ? 1 : 0,
      selectionCount,
      diagnostics: this.diagnostics.length,
      renderer: this.renderer.debugSnapshot(),
      scheduler: this.framePublication.schedulerDebugSnapshot(),
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
    this.framePublication.setContinuous(false, 'gesture-cancel');
  }

  /**
   * Creates the one package-owned manual frame loop for this Core instance.
   * Automatic Core instances already own their scheduler and reject a second
   * frame owner.
   */
  public createFrameLoop(options: PatchMapFrameLoopOptions = {}): PatchMapFrameLoop {
    return this.framePublication.createFrameLoop(options);
  }

  public async destroy(): Promise<boolean> {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.framePublication.destroy();
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
    this.pendingIntrinsicImageSizes.clear();
    this.instancePresentations.clear();
    this.instancePresentationOverrides.clear();
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

  private activeSceneImageIds(): ReadonlySet<string> {
    return activeSceneImageIds(
      this.publishedScene.current(),
      this.instancePresentationOverrides,
    );
  }

  private activeSceneImageBindingKeys(): readonly string[] {
    const images = this.publishedScene.current().projection?.imagesByEntityId ?? {};
    const keys = new Set<string>();
    for (const entityId of this.activeSceneImageIds()) {
      const bindingKey = images[entityId]?.bindingKey;
      if (bindingKey !== undefined) keys.add(bindingKey);
    }
    return Object.freeze([...keys]);
  }

  private setRendererInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
    ranges?: readonly Readonly<{ readonly start: number; readonly end: number }>[],
  ): void {
    const renderer = this.renderer as PatchMapPixiRenderer & Readonly<{
      setInstancePresentationOverrides?: PatchMapPixiRenderer['setInstancePresentationOverrides'];
    }>;
    renderer.setInstancePresentationOverrides?.(overrides, ranges);
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
    const update = intrinsicImageProjectionUpdate(
      base,
      currentIndex,
      resolutions,
      this.sceneImages,
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

  private reapplyResolvedIntrinsicSizes(): void {
    const projection = this.parseResultValue?.projection;
    if (!projection) return;
    this.pendingIntrinsicImageSizes.clear();
    this.applyIntrinsicImageSizes(resolvedIntrinsicImageSizes(projection, this.sceneImages));
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

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('PatchMapRuntime is destroyed');
    this.assertPublicationHealthy();
  }

  private assertPublicationHealthy(): void {
    if (this.terminalFailure !== null) throw this.terminalFailure;
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

function activeSceneImageIds(
  published: PatchMapPublishedSceneState,
  overrides?: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  projection: PatchMapProjectionIndex | null = published.projection,
): ReadonlySet<string> {
  const active = new Set<string>();
  const images = projection?.imagesByEntityId ?? {};
  for (const entityId of Object.keys(images)) {
    const entity = published.scene.get(entityId);
    const override = overrides?.get(entityId);
    if (
      entity !== null &&
      (override?.kind === RenderKind.Image ||
        (override?.kind === undefined && entity?.kind === 'image')) &&
      (override?.visible ?? entity.visible)
    ) {
      active.add(entityId);
    }
  }
  return active;
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


export type { EntityPatch };
