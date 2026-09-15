import 'pixi.js/prepare';
import 'pixi.js/accessibility';

import {
  Application,
  Container,
  Matrix,
  Rectangle,
  type ApplicationOptions,
} from 'pixi.js';

import type { CoreView, SlotRange } from '../dense/contracts';
import {
  type CoreRenderer,
  type RendererFlushResult,
  type RenderStoreView,
} from '../dense/renderer-types';
import {
  AggregateLeafLayer,
} from './leaf-layer';
import type {
  PatchMapSceneImageAssetBindingObservation as LeafAssetBindingObservation,
  PatchMapSceneImageAssetBindingProbe as LeafAssetBindingProbe,
  PatchMapSceneImageAssetBindingRequest as LeafAssetBindingRequest,
  PatchMapSceneImageLeafProbe as LeafSceneImageProbe,
} from '../scene-images/contracts';
import { AggregateMeshLayer } from './mesh-layer';
import { ParticleGraphicsLayer } from './particle-layer';
import type { PatchMapProjectionIndex } from '../parsing/contracts';
import {
  createPatchMapLeafAssetSession,
} from '../assets';
import type {
  PatchMapBackendPreference,
  PatchMapEntityPaintProbe,
  PatchMapInteractionOverlayPolicy,
  PatchMapOverlayPaintProbe,
  PatchMapActiveRendererBackend,
  PatchMapRenderLaneProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
  PatchMapRendererLossState,
  PatchMapRendererStrategy,
  PatchMapTextRendererProbe,
  PatchMapRendererPublicSurfaceProbe,
  PatchMapRendererDebug,
  PatchMapRendererLossProbe,
  RootInteractionHandlers,
} from '../rendering-port';
import {
  createPatchMapProjectionQuadCache,
  createPatchMapWorldAffine,
} from '../geometry/render-quads';
import type {
  PatchMapProjectionRenderContext,
  PatchMapWorldOrientation,
} from '../geometry/render-quads';
import type {
  PatchMapRendererPresentationEntityProbe,
  PatchMapResolvedPresentationPolicy,
} from '../presentation/policy';
import type { PatchMapPresentationSlotVisibility } from '../presentation';
import type { PatchMapPresentationLayerRenderUpdate } from '../presentation/layer-contracts';
import {
  PatchMapRendererRuntimeError,
  type PatchMapPixiRendererOptions,
} from './contracts/options';
import type { PatchMapRendererEntityPresentationOverride } from './contracts/presentation-store';
import {
  buildPatchMapRelationAdjacency,
  contiguousRanges,
  expandPatchMapRelationDependencyRanges,
  rangesTouchPatchMapRelationTopology,
} from './renderer-reconcile-ranges';
import type {
  PatchMapAccessibilityActivationInput,
  PatchMapAccessibilityRenderNode,
  PatchMapAccessibilitySurfaceProbe,
} from '../accessibility';
import {
  activeRendererBackend,
  backendName,
  publicGlContext,
  readPatchMapRendererPublicSurfaceProbe,
  readPatchMapRendererLossProbe,
} from './pixi-renderer/backend-public-surface';
import {
  freezeRendererTextProbe,
  freezeRendererTextSemanticSignatures,
  sameRendererTextAttachedSignatures,
  sameRendererTextSemanticSignatures,
} from './pixi-renderer/presentation-values';
import {
  packedAlpha,
  packedRgb,
  positive,
  sameView,
  sameWorldOrientation,
} from './pixi-renderer/value-atoms';
import type { PatchMapPixiRendererPublicationCheckpoint } from './pixi-renderer/publication-checkpoint';
import { PatchMapAccessibilityOverlayAuthority } from './pixi-renderer/accessibility-overlay-authority';
import { PatchMapCanvasSurfaceLifecycle } from './pixi-renderer/canvas-surface-lifecycle';
import { PatchMapPixiRootInteractionBindingAuthority } from './pixi-renderer/root-interaction-binding-authority';
import { PatchMapPixiSurfacePublicationAuthority } from './pixi-renderer/surface-publication-authority';
import { PatchMapPixiInteractionOverlayAuthority } from './pixi-renderer/interaction-overlay-authority';
import { PatchMapPixiCpuPublicationAuthority } from './pixi-renderer/cpu-publication-authority';
import { PatchMapPixiEntitySlotIndexAuthority } from './pixi-renderer/entity-slot-index';
import {
  patchMapSceneAssetTransitionSlots,
  resolvePatchMapScenePaintOrder,
  type PatchMapScenePaintOrder,
} from './scene-paint-order';

export {
  buildPatchMapRelationAdjacency,
  expandPatchMapRelationDependencyRanges,
  projectionChangedRanges,
} from './renderer-reconcile-ranges';
export type { PatchMapPixiRendererPublicationCheckpoint } from './pixi-renderer/publication-checkpoint';
export type { PatchMapPixiRendererOptions } from './contracts/options';

export interface PatchMapPixiInitializationMetrics {
  readonly applicationInitMs: number;
  readonly rendererBuildMs: number;
}

export class PatchMapPixiRuntimeError extends PatchMapRendererRuntimeError {
  public constructor(
    code: 'UNSUPPORTED_RUNTIME' | 'RENDERER_LOST',
    message: string,
  ) {
    super(code, message);
    this.name = 'PatchMapPixiRuntimeError';
  }
}

type AggregateLayer = AggregateMeshLayer | ParticleGraphicsLayer;

interface AggregateResult {
  readonly renderObjects: number;
  readonly visiblePrimitives: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
  readonly dynamicFullUploadCount: number;
  readonly staticInvalidatedUploadCount: number;
  readonly particleFullUploadCount: number;
  readonly uploadObservation: PatchMapRendererDebug['uploadObservation'];
}

const DEFAULT_VIEW: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
const DEFAULT_WORLD_ORIENTATION: PatchMapWorldOrientation = Object.freeze({
  rotationDegrees: 0,
  flipX: false,
  flipY: false,
});
export class PatchMapPixiRenderer implements CoreRenderer {
  public readonly application: Application;
  public readonly canvas: HTMLCanvasElement;
  public readonly strategy: PatchMapRendererStrategy;
  public readonly preference: PatchMapBackendPreference;
  public readonly world: Container;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics;

  private readonly aggregate: AggregateLayer;
  private readonly leaves: AggregateLeafLayer;
  private readonly backgroundGeometryLane: Container;
  private readonly scenePaintContainer: Container;
  private readonly interactionOverlay: PatchMapPixiInteractionOverlayAuthority;
  private readonly accessibilityOverlay: PatchMapAccessibilityOverlayAuthority;
  private readonly target: HTMLElement | undefined;
  private readonly rootInteractionBindings: PatchMapPixiRootInteractionBindingAuthority;
  private readonly surfacePublication: PatchMapPixiSurfacePublicationAuthority;
  private readonly cpuPublication: PatchMapPixiCpuPublicationAuthority;
  private cleanupPromise: Promise<void> = Promise.resolve();
  private frame = 0;
  private widthValue: number;
  private heightValue: number;
  private pixelRatioValue: number;
  private view: CoreView = DEFAULT_VIEW;
  private relationSlotsByEndpoint: ReadonlyMap<number, readonly number[]> = new Map();
  private relationSlots = new Set<number>();
  private relationEndpointsBySlot: ReadonlyMap<number, readonly [number, number]> = new Map();
  private readonly projectionQuadCache = createPatchMapProjectionQuadCache();
  private textProjectionSynchronizedRevision = -1;
  private lastRenderedTextProjectionRevision: number | null = null;
  private lastRenderedTextStoreRevision: number | null = null;
  private readonly entitySlotIndex = new PatchMapPixiEntitySlotIndexAuthority();
  private worldOrientation: PatchMapWorldOrientation = DEFAULT_WORLD_ORIENTATION;
  private readonly worldMatrix = new Matrix();
  private destroyedValue = false;
  private readonly activeBackend: PatchMapActiveRendererBackend;
  private readonly initialWebGLVersion: 1 | 2 | null;
  private rendererLossState: PatchMapRendererLossState = 'healthy';
  private rendererLossEventCount = 0;
  private rendererRestorationEventCount = 0;
  private recoveredRendererFrameCount = 0;
  private lastRendererLossFrame: number | null = null;
  private lastRendererRecoveryFrame: number | null = null;
  private lastDebug: PatchMapRendererDebug;
  private lastLaneProbe: PatchMapRenderLaneSnapshot;
  private scenePaintOrder: PatchMapScenePaintOrder = Object.freeze({
    exact: false,
    rankByEntityId: Object.freeze({}),
  });
  private lastAggregateResult: AggregateResult = {
    renderObjects: 0,
    visiblePrimitives: 0,
    uploadedChunks: 0,
    uploadedBytes: 0,
    dynamicFullUploadCount: 0,
    staticInvalidatedUploadCount: 0,
    particleFullUploadCount: 0,
    uploadObservation: 'dirty-chunk-bytes',
  };
  private barPresentationVisibilityRevision = 0;
  private barPresentationVisibilityStale = true;
  private barPresentationVisibilityConservative = true;

  private constructor(
    application: Application,
    options: Required<Pick<PatchMapPixiRendererOptions, 'width' | 'height' | 'pixelRatio' | 'strategy' | 'preference'>> &
      Pick<
        PatchMapPixiRendererOptions,
        'target' | 'devtools' | 'assetSession' | 'assetPolicy' | 'resolveBitmapTextCapability'
      >,
    metrics: PatchMapPixiInitializationMetrics,
    canvasLifecycle: PatchMapCanvasSurfaceLifecycle,
  ) {
    const buildStarted = now();
    this.application = application;
    this.accessibilityOverlay = new PatchMapAccessibilityOverlayAuthority(application);
    this.canvas = application.canvas;
    this.activeBackend = activeRendererBackend(application);
    this.initialWebGLVersion = publicGlContext(application)?.webGLVersion ?? null;
    this.target = options.target;
    this.strategy = options.strategy;
    this.preference = options.preference;
    this.widthValue = options.width;
    this.heightValue = options.height;
    this.pixelRatioValue = options.pixelRatio;
    this.cpuPublication = new PatchMapPixiCpuPublicationAuthority(
      this.entitySlotIndex.slotByEntityId,
    );
    this.rootInteractionBindings = new PatchMapPixiRootInteractionBindingAuthority({
      stage: this.application.stage,
      canvas: this.canvas,
      readViewportWidth: () => this.widthValue,
      readViewportHeight: () => this.heightValue,
      isSurfacePublished: () => this.surfacePublication.published,
    });
    this.surfacePublication = new PatchMapPixiSurfacePublicationAuthority({
      application: this.application,
      canvas: this.canvas,
      canvasLifecycle,
      rootInteractionBindings: this.rootInteractionBindings,
      devtoolsRequested: options.devtools === true,
      assertInitialRenderAvailable: () => {
        if (publicGlContext(this.application)?.isLost === true) {
          throw new PatchMapPixiRuntimeError(
            'RENDERER_LOST',
            'PixiJS WebGL2 context is lost before frame publication',
          );
        }
      },
      onContextLost: () => {
        if (this.destroyedValue) return;
        this.rendererLossEventCount += 1;
        this.rendererLossState = 'lost';
        this.lastRendererLossFrame = this.frame;
        this.cpuPublication.invalidate('renderer-context-lost');
      },
      onContextRestored: () => {
        if (this.destroyedValue) return;
        this.rendererRestorationEventCount += 1;
        this.rendererLossState = 'restored-pending-frame';
        this.cpuPublication.invalidate('renderer-context-restored');
      },
    });
    this.world = new Container({ label: 'PatchMap / world', isRenderGroup: true });
    this.world.sortableChildren = true;
    this.world.eventMode = 'none';
    this.world.interactiveChildren = false;
    this.aggregate = options.strategy === 'mesh'
      ? new AggregateMeshLayer({
          label: 'PatchMap / aggregate mesh',
          applyStoreView: false,
        })
      : new ParticleGraphicsLayer({ label: 'PatchMap / particle graphics' });
    this.backgroundGeometryLane = this.aggregate instanceof AggregateMeshLayer
      ? this.aggregate.backgroundGeometryContainer
      : new Container({ label: 'PatchMap / background geometry unsupported (0)' });
    this.backgroundGeometryLane.eventMode = 'none';
    this.backgroundGeometryLane.interactiveChildren = false;
    this.scenePaintContainer = new Container({
      label: 'PatchMap / exact scene paint',
      sortableChildren: true,
    });
    this.scenePaintContainer.eventMode = 'none';
    this.scenePaintContainer.interactiveChildren = false;
    const leafSession = options.assetSession ?? createPatchMapLeafAssetSession(options.assetPolicy);
    this.leaves = new AggregateLeafLayer(
      leafSession,
      options.assetSession === undefined,
      {
        onBindingTransition: ({ key, state, dirtySlots }) => {
          if (this.destroyedValue) return;
          const slots = patchMapSceneAssetTransitionSlots(
            this.cpuPublication.projectionIndex,
            this.entitySlotIndex.slotByEntityId,
            key,
            dirtySlots,
          );
          const reason = `scene-asset:${key}:${state}`;
          if (slots === null) {
            this.cpuPublication.markChanges([], reason, { fullRebuild: true });
          } else {
            this.cpuPublication.markRetainedLeafRanges(contiguousRanges(slots), reason);
          }
        },
        ...(options.resolveBitmapTextCapability === undefined
          ? {}
          : { resolveBitmapTextCapability: options.resolveBitmapTextCapability }),
      },
    );
    this.interactionOverlay = new PatchMapPixiInteractionOverlayAuthority({
      worldMatrix: this.worldMatrix,
      slotByEntityId: this.entitySlotIndex.slotByEntityId,
      readProjectionContext: () => this.projectionContext(),
    });
    if (this.aggregate instanceof AggregateMeshLayer) {
      // Preserve aggregate batching while matching PATCH MAP's authored
      // underlay -> item frame -> component-content order. Standalone root
      // images cannot share the component-asset lane: doing so either covers
      // the complete scene or hides every item icon behind the root overlay.
      this.aggregate.container.addChild(
        this.leaves.standaloneAssetContainer,
        this.aggregate.ordinaryGeometryContainer,
        this.aggregate.backgroundGeometryContainer,
        this.leaves.backgroundAssetContainer,
        this.aggregate.relationsDynamicContainer,
        this.leaves.contentAssetContainer,
        this.leaves.textContainer,
        this.scenePaintContainer,
      );
      this.world.addChild(this.aggregate.container);
      this.interactionOverlay.attachToTail(this.world);
    } else {
      this.world.addChild(
        this.leaves.standaloneAssetContainer,
        this.backgroundGeometryLane,
        this.leaves.backgroundAssetContainer,
        this.aggregate.container,
        this.leaves.contentAssetContainer,
        this.leaves.textContainer,
      );
      this.interactionOverlay.attachToTail(this.world);
    }
    this.application.stage.label = 'PatchMap';
    this.application.stage.eventMode = 'static';
    this.application.stage.interactiveChildren = false;
    this.application.stage.hitArea = new Rectangle(0, 0, this.widthValue, this.heightValue);
    this.application.stage.addChild(this.world);
    this.application.ticker.stop();
    canvasLifecycle.applyRuntimeIdentity();
    this.surfacePublication.armInitialRender();

    const rendererBuildMs = metrics.rendererBuildMs + (now() - buildStarted);
    this.initializationMetrics = Object.freeze({
      applicationInitMs: metrics.applicationInitMs,
      rendererBuildMs,
    });
    this.lastDebug = this.emptyDebug();
    this.lastLaneProbe = this.emptyLaneProbe();
  }

  public static async create(options: PatchMapPixiRendererOptions = {}): Promise<PatchMapPixiRenderer> {
    const width = positive(options.width ?? options.target?.clientWidth ?? 800, 'width');
    const height = positive(options.height ?? options.target?.clientHeight ?? 600, 'height');
    const pixelRatio = positive(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 'pixelRatio');
    const strategy = options.strategy ?? 'mesh';
    const preference = options.preference ?? 'webgl';
    const packedBackground = options.background ?? 0xf7f8faff;
    const application = new Application();
    let canvasLifecycle = options.canvas === undefined
      ? null
      : PatchMapCanvasSurfaceLifecycle.stageCallerCanvas(options.canvas, options.target);
    let applicationInitialized = false;
    const applicationStarted = now();
    const initOptions: Partial<ApplicationOptions> = {
      width,
      height,
      resolution: pixelRatio,
      autoDensity: true,
      antialias: options.antialias ?? false,
      autoStart: false,
      sharedTicker: false,
      preference,
      powerPreference: options.powerPreference ?? 'high-performance',
      webgl: {
        preferWebGLVersion: 2,
      },
      background: packedRgb(packedBackground),
      backgroundAlpha: packedAlpha(packedBackground),
      clearBeforeRender: true,
      ...(options.canvas === undefined ? {} : { canvas: options.canvas }),
    };
    try {
      await application.init(initOptions);
      applicationInitialized = true;
      canvasLifecycle ??= PatchMapCanvasSurfaceLifecycle.ownCreatedCanvas(
        application.canvas,
        options.target,
      );
      const applicationInitMs = now() - applicationStarted;
      if (options.requireWebGL2 === true && activeRendererBackend(application) !== 'webgl2') {
        throw new PatchMapPixiRuntimeError(
          'UNSUPPORTED_RUNTIME',
          'PatchMap requires a PixiJS WebGL2 renderer',
        );
      }
      return new PatchMapPixiRenderer(
        application,
        {
          width,
          height,
          pixelRatio,
          strategy,
          preference,
          ...(options.target ? { target: options.target } : {}),
          ...(options.devtools === true ? { devtools: true } : {}),
          ...(options.assetSession ? { assetSession: options.assetSession } : {}),
          ...(options.assetPolicy ? { assetPolicy: options.assetPolicy } : {}),
          ...(options.resolveBitmapTextCapability
            ? { resolveBitmapTextCapability: options.resolveBitmapTextCapability }
            : {}),
        },
        { applicationInitMs, rendererBuildMs: 0 },
        canvasLifecycle,
      );
    } catch (error) {
      if (applicationInitialized) {
        try {
          application.destroy({ removeView: false }, { children: true });
        } catch {
          // The original initialization/construction failure remains authoritative.
        }
      }
      canvasLifecycle?.destroy();
      throw error;
    }
  }

  public get width(): number {
    return this.widthValue;
  }

  public get height(): number {
    return this.heightValue;
  }

  public get pixelRatio(): number {
    return this.pixelRatioValue;
  }

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  public markChanges(
    ranges: readonly SlotRange[],
    reason: string,
    options: {
      readonly fullRebuild?: boolean;
      readonly domain?: 'bar-only' | 'text-only';
    } = {},
  ): void {
    this.assertAlive();
    if (this.cpuPublication.markChanges(ranges, reason, options)) {
      this.barPresentationVisibilityConservative = true;
    }
  }

  public markOverlayChanges(ranges: readonly SlotRange[], reason: string): void {
    this.assertAlive();
    this.cpuPublication.markOverlayChanges(ranges, reason);
  }

  public setInteractionOverlayPolicy(
    policy: PatchMapInteractionOverlayPolicy,
  ): boolean {
    this.assertAlive();
    const changed = this.interactionOverlay.setPolicy(
      policy,
      this.cpuPublication.lastStore,
    );
    if (!changed) return false;
    this.cpuPublication.invalidateOverlay('interaction-overlay-policy');
    return true;
  }

  /** Transient box gesture paint; intentionally absent from snapshots and probes. */
  public setSelectionMarquee(input: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null): boolean {
    this.assertAlive();
    const changed = this.interactionOverlay.setMarquee(
      input,
      this.cpuPublication.lastStore,
    );
    if (!changed) return false;
    this.cpuPublication.invalidate('selection-marquee');
    return true;
  }

  /**
   * Apply host presentation state without touching the authoritative dense
   * store. Policy changes intentionally rebuild aggregate batches once;
   * subsequent scene updates retain dirty-range synchronization.
   */
  public setPresentationPolicy(policy: PatchMapResolvedPresentationPolicy | null): boolean {
    this.assertAlive();
    return this.cpuPublication.setPresentationPolicy(policy);
  }

  /** @internal Apply one keyed-layer composition delta without rebuilding the view. */
  public setPresentationLayerMultipliers(
    update: PatchMapPresentationLayerRenderUpdate,
  ): boolean {
    this.assertAlive();
    return this.cpuPublication.setPresentationLayerMultipliers(update);
  }

  /** @internal Publish sparse instance presentation values into aggregate columns. */
  public setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
    changedRanges?: readonly SlotRange[],
  ): boolean {
    this.assertAlive();
    return this.cpuPublication.setInstancePresentationOverrides(overrides, changedRanges);
  }

  public presentationEntityProbe(
    entityId: string,
  ): PatchMapRendererPresentationEntityProbe | null {
    this.assertAlive();
    if (typeof entityId !== 'string' || entityId.length === 0) {
      throw new TypeError('entityId must be a non-empty string');
    }
    return this.cpuPublication.presentationEntityProbe(entityId);
  }

  /**
   * Replace the semantic projection index, or publish in-place transient
   * presentation edits with caller-owned dirty ranges. The explicit-range
   * path avoids an O(scene) projection diff on every animation frame.
   */
  public setProjection(
    index: PatchMapProjectionIndex,
    changedRanges?: readonly SlotRange[],
    staleEntityIds?: ReadonlySet<string>,
    updateKind?: 'bar-presentation' | 'text',
    sourceStore?: RenderStoreView,
  ): boolean {
    this.assertAlive();
    const changed = this.cpuPublication.setProjection(
      index,
      changedRanges,
      staleEntityIds,
      updateKind,
      sourceStore,
    );
    if (changed && updateKind === undefined) {
      const previousPaintOrder = this.scenePaintOrder ?? Object.freeze({
        exact: false,
        rankByEntityId: Object.freeze({}),
      });
      const changedEntityIds = changedRanges === undefined
        ? undefined
        : this.entitySlotIndex.entityIdsForRanges(changedRanges);
      const nextPaintOrder = resolvePatchMapScenePaintOrder(
        index,
        previousPaintOrder,
        changedEntityIds,
      );
      const paintOrderChanged = previousPaintOrder.exact !== nextPaintOrder.exact ||
        !sameNumberRecord(
          previousPaintOrder.rankByEntityId,
          nextPaintOrder.rankByEntityId,
        );
      this.scenePaintOrder = nextPaintOrder;
      this.applyScenePaintOrder();
      if (paintOrderChanged && this.cpuPublication.lastStore !== null) {
        const slots = changedScenePaintOrderSlots(
          previousPaintOrder,
          nextPaintOrder,
          this.entitySlotIndex.slotByEntityId,
        );
        if (slots === null) {
          this.cpuPublication.markChanges([], 'scene-paint-order', { fullRebuild: true });
        } else {
          this.cpuPublication.markChanges(
            contiguousRanges(slots),
            'scene-paint-order',
          );
        }
      }
    }
    if (changed && updateKind !== 'bar-presentation') {
      this.barPresentationVisibilityConservative = true;
    }
    return changed;
  }

  public setWorldOrientation(world: PatchMapWorldOrientation): boolean {
    this.assertAlive();
    if (sameWorldOrientation(this.worldOrientation, world)) return false;
    this.worldOrientation = Object.freeze({ ...world });
    this.cpuPublication.markProjectionOrientationChanged();
    this.applyWorldTransform();
    this.barPresentationVisibilityStale = true;
    return true;
  }

  public resize(width: number, height: number, pixelRatio = this.pixelRatioValue): boolean {
    this.assertAlive();
    positive(width, 'width');
    positive(height, 'height');
    positive(pixelRatio, 'pixelRatio');
    if (
      width === this.widthValue &&
      height === this.heightValue &&
      pixelRatio === this.pixelRatioValue
    ) {
      return false;
    }
    this.widthValue = width;
    this.heightValue = height;
    if (pixelRatio !== this.pixelRatioValue) {
      this.application.renderer.resolution = pixelRatio;
      this.pixelRatioValue = pixelRatio;
    }
    this.application.renderer.resize(width, height);
    this.application.stage.hitArea = new Rectangle(0, 0, width, height);
    this.barPresentationVisibilityStale = true;
    this.cpuPublication.invalidate('resize');
    return true;
  }

  public setView(view: CoreView): boolean {
    this.assertAlive();
    if (sameView(this.view, view)) return false;
    const rotationChanged = (this.view.rotation ?? 0) !== (view.rotation ?? 0);
    const scaleChanged = this.view.scale !== view.scale;
    this.view = Object.freeze({
      x: view.x,
      y: view.y,
      scale: view.scale,
      rotation: view.rotation ?? 0,
    });
    if (rotationChanged && this.worldOrientation.rotationDegrees !== (this.view.rotation ?? 0)) {
      this.worldOrientation = Object.freeze({
        ...this.worldOrientation,
        rotationDegrees: this.view.rotation ?? 0,
      });
      this.cpuPublication.markProjectionOrientationChanged();
    }
    if (scaleChanged || this.interactionOverlay.marqueeVisible) {
      this.cpuPublication.invalidateOverlayForView();
    }
    this.applyWorldTransform();
    this.barPresentationVisibilityStale = true;
    this.cpuPublication.invalidate('view');
    return true;
  }

  /** @internal Refresh aggregate culling before the presentation frame kernel. */
  public prepareBarPresentationVisibility(view: CoreView): Readonly<{
    revision: number;
    visibility: PatchMapPresentationSlotVisibility | null;
  }> {
    this.assertAlive();
    this.setView(view);
    if (this.aggregate instanceof AggregateMeshLayer && this.barPresentationVisibilityStale) {
      this.aggregate.cull(
        this.worldMatrix,
        this.widthValue,
        this.heightValue,
        48,
        false,
      );
      this.barPresentationVisibilityStale = false;
      this.barPresentationVisibilityRevision += 1;
    }
    return {
      revision: this.barPresentationVisibilityRevision,
      visibility: this.barPresentationVisibilityConservative ||
          this.cpuPublication.hasPresentationLayers ||
          !(this.aggregate instanceof AggregateMeshLayer)
        ? null
        : this.aggregate.barPresentationVisibility(),
    };
  }

  /**
   * Move retained Mesh records between precise idle culling and coarse
   * animation culling without submitting a frame. Large bar transactions use
   * this during their one-shot commit so the first direct-manipulation frame
   * does not pay thousands of scene-child attachments.
   */
  public setAggregateCullPrecision(precise: boolean): number {
    this.assertAlive();
    if (!(this.aggregate instanceof AggregateMeshLayer)) return 0;
    if (this.aggregate.preciseViewportCull === precise) return 0;
    const visibleChunks = this.aggregate.cull(
      this.worldMatrix,
      this.widthValue,
      this.heightValue,
      48,
      precise,
    );
    if (!precise) {
      this.aggregate.backgroundGeometryContainer.sortChildren();
      this.aggregate.ordinaryGeometryContainer.sortChildren();
      this.aggregate.relationsDynamicContainer.sortChildren();
    }
    return visibleChunks;
  }

  public flush(store: RenderStoreView): RendererFlushResult {
    this.assertAlive();
    const effectiveStore = this.cpuPublication.beginFlush(store);
    const storeReplaced = this.cpuPublication.flushStoreReplaced;
    if (storeReplaced) {
      this.interactionOverlay.resetSelection();
    }
    // View rotation can change upright projection geometry. Resolve it before
    // consuming pending ranges so the first published frame cannot lag.
    const viewChanged = this.setView(effectiveStore.view);
    const pendingRanges = this.cpuPublication.pendingRanges;
    if (
      storeReplaced ||
      pendingRanges === undefined ||
      rangesTouchPatchMapRelationTopology(
        store,
        pendingRanges,
        this.relationSlots,
        this.relationEndpointsBySlot,
      )
    ) {
      const adjacency = buildPatchMapRelationAdjacency(store);
      this.relationSlotsByEndpoint = adjacency.byEndpoint;
      this.relationSlots = adjacency.relationSlots;
      this.relationEndpointsBySlot = adjacency.endpointsByRelation;
    }
    const projectionTransformOnly =
      this.cpuPublication.pendingProjectionTransformOnly &&
      !storeReplaced &&
      pendingRanges !== undefined;
    const barPresentationOnly =
      this.cpuPublication.pendingBarPresentationOnly &&
      !storeReplaced &&
      pendingRanges !== undefined;
    const textOnly =
      this.cpuPublication.pendingTextOnly &&
      !storeReplaced &&
      pendingRanges !== undefined;
    const stableBarPresentationFrame = barPresentationOnly && !viewChanged;
    const ranges = pendingRanges === undefined ||
      this.relationSlotsByEndpoint.size === 0 ||
      projectionTransformOnly
      ? pendingRanges
      : expandPatchMapRelationDependencyRanges(
          effectiveStore,
          pendingRanges,
          this.relationSlotsByEndpoint,
        );
    if (!projectionTransformOnly && !barPresentationOnly) {
      this.entitySlotIndex.syncEntitySlots(
        effectiveStore,
        storeReplaced ? undefined : ranges,
      );
      this.entitySlotIndex.syncTextVisibility(
        effectiveStore,
        storeReplaced || ranges === undefined ? undefined : ranges,
      );
    }
    let aggregateViewportWork = false;
    if (this.aggregate instanceof AggregateMeshLayer) {
      if (!stableBarPresentationFrame) {
        this.aggregate.cull(
          this.worldMatrix,
          this.widthValue,
          this.heightValue,
          48,
          !barPresentationOnly,
        );
      }
      aggregateViewportWork = this.aggregate.hasVisibleDeferredBarUpdates();
    }
    const aggregate = !storeReplaced &&
      (ranges?.length === 0 || textOnly) &&
      !aggregateViewportWork
      ? idleAggregateResult(this.lastAggregateResult)
      : this.syncAggregate(
          effectiveStore,
          textOnly ? [] : ranges,
          projectionTransformOnly,
        );
    this.lastAggregateResult = aggregate;
    if (this.aggregate instanceof AggregateMeshLayer && !stableBarPresentationFrame) {
      this.aggregate.cull(
        this.worldMatrix,
        this.widthValue,
        this.heightValue,
        48,
        !barPresentationOnly,
      );
      if (this.barPresentationVisibilityConservative || this.barPresentationVisibilityStale) {
        this.barPresentationVisibilityRevision += 1;
      }
      this.barPresentationVisibilityConservative = false;
      this.barPresentationVisibilityStale = false;
    }
    this.leaves.sync(effectiveStore, {
      fullRebuildEpoch: this.cpuPublication.storeEpoch,
      projectionContext: this.projectionContext(),
      textMaterializationViewport: {
        worldMatrix: this.worldMatrix,
        width: this.widthValue,
        height: this.heightValue,
      },
      ...(ranges === undefined
        ? {}
        : { changedRanges: barPresentationOnly ? [] : ranges }),
      ...(projectionTransformOnly ? { projectionTransformOnly: true } : {}),
    });
    // Bar presentation mutates only aggregate geometry. With a stable view,
    // object-backed image/text bounds are unchanged and retaining their last
    // cull result avoids an O(all leaves) scan on every animation frame.
    if (!stableBarPresentationFrame) {
      this.leaves.cull(
        this.worldMatrix,
        this.widthValue,
        this.heightValue,
        32,
        zoomAwareTextRasterResolution(this.pixelRatioValue, this.view.scale),
      );
    }
    const leaves = this.leaves.debugSnapshot();
    this.textProjectionSynchronizedRevision = this.cpuPublication.projectionRevision;
    this.interactionOverlay.synchronize(
      effectiveStore,
      storeReplaced,
      this.cpuPublication.pendingOverlayRanges ?? ranges,
    );
    const rendered = this.cpuPublication.consumeSynchronizedRender();
    if (rendered) {
      if (
        this.rendererLossState === 'lost' &&
        publicGlContext(this.application)?.isLost === true
      ) {
        throw new PatchMapPixiRuntimeError(
          'RENDERER_LOST',
          'PixiJS WebGL2 context is lost before frame publication',
        );
      }
      this.application.render();
      const renderedFrame = this.frame + 1;
      if (this.rendererLossState !== 'healthy') {
        if (publicGlContext(this.application)?.isLost === true) {
          throw new PatchMapPixiRuntimeError(
            'RENDERER_LOST',
            'PixiJS WebGL2 context remained lost after a recovery render',
          );
        }
        this.rendererLossState = 'healthy';
        this.recoveredRendererFrameCount += 1;
        this.lastRendererRecoveryFrame = renderedFrame;
        this.cpuPublication.invalidate('renderer-context-recovered');
      }
      this.leaves.confirmRenderedFrame(renderedFrame);
      this.frame = renderedFrame;
      this.lastRenderedTextProjectionRevision = this.cpuPublication.projectionRevision;
      this.lastRenderedTextStoreRevision = effectiveStore.revision;
    }
    this.cpuPublication.commitFlush(store, effectiveStore);
    const overlayCount = this.interactionOverlay.renderObjectCount;
    this.lastLaneProbe = this.buildLaneProbe(overlayCount);
    this.lastDebug = Object.freeze({
      strategy: this.strategy,
      backend: backendName(this.application),
      frame: this.frame,
      storeEpoch: this.cpuPublication.storeEpoch,
      entityCount: effectiveStore.liveCount,
      aggregateRenderObjects: aggregate.renderObjects + leaves.bitmapTextCount + leaves.fallbackTextCount + leaves.imageCount + overlayCount,
      visiblePrimitives: aggregate.visiblePrimitives,
      uploadedChunks: aggregate.uploadedChunks,
      uploadedBytes: aggregate.uploadedBytes,
      dynamicFullUploadCount: aggregate.dynamicFullUploadCount,
      staticInvalidatedUploadCount: aggregate.staticInvalidatedUploadCount,
      particleFullUploadCount: aggregate.particleFullUploadCount,
      uploadObservation: aggregate.uploadObservation,
      bitmapTextCount: leaves.bitmapTextCount,
      fallbackTextCount: leaves.fallbackTextCount,
      imageCount: leaves.imageCount,
      loadedAssetCount: leaves.loadedAssetCount,
      unresolvedAssetCount: leaves.unresolvedAssetCount,
      view: this.view,
      lastInvalidation: this.cpuPublication.lastInvalidation,
      destroyed: false,
    });
    this.world.label = `PatchMap / world (${effectiveStore.liveCount} entities)`;
    return Object.freeze({
      rendered,
      commandCount: this.lastDebug.aggregateRenderObjects,
    });
  }

  public synchronizeNextFlush(): void {
    this.assertAlive();
    this.cpuPublication.synchronizeNextFlush();
  }

  public async prepareGpu(): Promise<void> {
    this.assertAlive();
    // Canvas Text owns a lazily regenerated texture. Preparing the complete
    // RenderGroup makes Pixi retain a batch instruction for that initial
    // texture; the first later `text.text = ...` update can then invalidate
    // the texture before the prepared batch is rebuilt. Keep dynamic text out
    // of the preload queue and let the first visible render rasterize it.
    // Aggregate geometry and decoded image leaves remain safe, useful upload
    // targets and preserve the purpose of the explicit GPU preparation phase.
    await this.application.renderer.prepare.upload([
      this.leaves.standaloneAssetContainer,
      this.backgroundGeometryLane,
      this.leaves.backgroundAssetContainer,
      this.aggregate.container,
      this.leaves.contentAssetContainer,
    ]);
  }

  public async loadAsset(alias: string, url: string): Promise<void> {
    await this.leaves.loadAsset(alias, url);
    this.cpuPublication.markRetainedLeafChange(`asset:${alias}:load`);
  }

  public async unloadAsset(alias: string): Promise<boolean> {
    const unloaded = await this.leaves.unloadAsset(alias);
    if (unloaded) {
      this.cpuPublication.markRetainedLeafChange(`asset:${alias}:unload`);
    }
    return unloaded;
  }

  public async finalizeAssetUnloads(): Promise<void> {
    await this.leaves.finalizeAssetUnloads();
  }

  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    this.assertAlive();
    const completion = this.leaves.bindSceneAsset(key, request);
    this.cpuPublication.markRetainedLeafChange(`scene-asset:${key}:bind`);
    return completion;
  }

  public async unbindSceneAsset(key: string): Promise<boolean> {
    this.assertAlive();
    const unbound = await this.leaves.unbindSceneAsset(key);
    if (unbound) {
      this.cpuPublication.markRetainedLeafChange(`scene-asset:${key}:unbind`);
    }
    return unbound;
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    return this.leaves.sceneAssetBindingProbe(key);
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    return this.leaves.sceneImageProbe(entityId);
  }

  public textRendererProbe(entityId: string): PatchMapTextRendererProbe | null {
    if (this.destroyedValue) return null;
    const leaf = this.leaves.textRendererProbe(entityId);
    const textIndex = this.cpuPublication.projectionIndex.textsByEntityId;
    if (textIndex === undefined) return leaf;
    const semantic = textIndex[entityId];
    if (semantic === undefined) return null;
    const semanticSignatures = freezeRendererTextSemanticSignatures({
      content: semantic.contentSignature,
      style: semantic.styleSignature,
      layout: semantic.layoutSignature,
    });
    const expectedObjectCount =
      this.entitySlotIndex.textVisibilityByEntityId.get(entityId) === true ? 1 : 0;
    if (expectedObjectCount === 0) {
      const current = this.textProjectionSynchronizedRevision === this.cpuPublication.projectionRevision &&
        this.lastRenderedTextProjectionRevision === this.cpuPublication.projectionRevision &&
        this.lastRenderedTextStoreRevision === this.cpuPublication.lastStore?.revision;
      return freezeRendererTextProbe({
        entityId,
        attachedRoute: 'none',
        objectKind: 'none',
        routeDecisionReason: 'not-attached',
        objectCount: 0,
        semanticSignatures,
        attachedSignatures: null,
        lastRenderedSignatures: null,
        publicationStatus: current ? 'current' : 'pending',
        lastRenderedFrame: current ? this.frame : null,
        staleGlyphCount: 0,
      });
    }
    if (leaf === null) {
      return freezeRendererTextProbe({
        entityId,
        attachedRoute: 'none',
        objectKind: 'none',
        routeDecisionReason: 'not-attached',
        objectCount: 0,
        semanticSignatures,
        attachedSignatures: null,
        lastRenderedSignatures: null,
        publicationStatus: 'pending',
        lastRenderedFrame: null,
        staleGlyphCount: 0,
      });
    }
    const attachedMatchesSemantic = sameRendererTextSemanticSignatures(
      semanticSignatures,
      leaf.attachedSignatures,
    );
    const renderedMatchesAttached = sameRendererTextAttachedSignatures(
      leaf.attachedSignatures,
      leaf.lastRenderedSignatures,
    );
    const current = this.textProjectionSynchronizedRevision === this.cpuPublication.projectionRevision &&
      this.lastRenderedTextProjectionRevision === this.cpuPublication.projectionRevision &&
      this.lastRenderedTextStoreRevision === this.cpuPublication.lastStore?.revision &&
      leaf.objectCount === expectedObjectCount &&
      attachedMatchesSemantic &&
      renderedMatchesAttached &&
      leaf.lastRenderedFrame !== null;
    return freezeRendererTextProbe({
      ...leaf,
      semanticSignatures,
      publicationStatus: current ? 'current' : 'pending',
      staleGlyphCount: leaf.lastRenderedSignatures !== null &&
        (!attachedMatchesSemantic || !renderedMatchesAttached)
        ? this.leaves.lastRenderedTextGraphemeCount(entityId)
        : 0,
    });
  }

  public renderLaneProbe(): PatchMapRenderLaneSnapshot {
    return this.lastLaneProbe;
  }

  public entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null {
    const leaf = this.leaves.entityPaintProbe(entityId);
    if (leaf !== null) return leaf;
    return this.aggregate instanceof AggregateMeshLayer
      ? this.aggregate.entityPaintProbe(entityId)
      : null;
  }

  /** Exact scene-tail order and current visibility of aggregate editor overlays. */
  public overlayPaintProbe(): PatchMapOverlayPaintProbe {
    this.assertAlive();
    return this.interactionOverlay.probe();
  }

  public async captureBase64(): Promise<string> {
    this.assertAlive();
    return this.application.renderer.extract.base64({ target: this.application.stage, format: 'png' });
  }

  /**
   * Publish detached screen-space accessibility records. The Containers have
   * no visual content and exist only while accessibility is enabled; aggregate
   * meshes remain the sole visual representation of scene entities.
   */
  public setAccessibilityTree(
    nodes: readonly PatchMapAccessibilityRenderNode[],
  ): PatchMapAccessibilitySurfaceProbe {
    this.assertAlive();
    return this.accessibilityOverlay.setTree(nodes);
  }

  public bindAccessibilityActivation(
    listener: (
      targetId: string,
      input: PatchMapAccessibilityActivationInput,
    ) => void,
  ): () => void {
    this.assertAlive();
    return this.accessibilityOverlay.bindActivation(listener);
  }

  public focusAccessibilityTarget(targetId: string): boolean {
    this.assertAlive();
    return this.accessibilityOverlay.focus(targetId);
  }

  public accessibilitySurfaceProbe(): PatchMapAccessibilitySurfaceProbe {
    return this.accessibilityOverlay.probe();
  }

  public bindRootInteractions(handlers: RootInteractionHandlers): () => void {
    this.assertAlive();
    return this.rootInteractionBindings.bind(handlers);
  }

  public interactionOwnershipProbe(): Readonly<{
    readonly rootBindingCount: number;
    readonly rootListenerCount: number;
    readonly entityCallbackCount: number;
  }> {
    return this.rootInteractionBindings.probe();
  }

  public publicSurfaceProbe(): PatchMapRendererPublicSurfaceProbe {
    return readPatchMapRendererPublicSurfaceProbe(
      this.application,
      this.canvas,
      this.world,
      this.target,
      this.lastLaneProbe,
    );
  }

  public rendererLossProbe(): PatchMapRendererLossProbe {
    return readPatchMapRendererLossProbe(
      this.application,
      this.activeBackend,
      this.initialWebGLVersion,
      this.destroyedValue,
      this.rendererLossState,
      this.rendererLossEventCount,
      this.rendererRestorationEventCount,
      this.recoveredRendererFrameCount,
      this.surfacePublication.rendererLossListenerCount,
      this.lastRendererLossFrame,
      this.lastRendererRecoveryFrame,
    );
  }

  /** @internal Capture exact load-side CPU publication state without touching Pixi/GPU state. */
  public capturePublicationCheckpoint(): PatchMapPixiRendererPublicationCheckpoint {
    if (this.destroyed) throw new Error('PatchMapPixiRenderer is destroyed');
    return Object.freeze({
      ...this.cpuPublication.captureCheckpoint(this.barPresentationVisibilityConservative),
      scenePaintOrder: this.scenePaintOrder,
    });
  }

  /**
   * @internal Restore a captured checkpoint using assignments only so rollback
   * cannot mask the original load failure with validation, allocation, renderer,
   * or GPU work.
   */
  public restorePublicationCheckpoint(
    checkpoint: PatchMapPixiRendererPublicationCheckpoint,
  ): void {
    this.barPresentationVisibilityConservative = this.cpuPublication.rollback(checkpoint);
    this.scenePaintOrder = checkpoint.scenePaintOrder ??
      resolvePatchMapScenePaintOrder(checkpoint.projectionIndex);
    this.applyScenePaintOrder();
  }

  /**
   * Deterministic public loss fixture for verification. Pixi's documented
   * GlContextSystem owns the actual GPU resource release/recreation.
   */
  public forceRendererLoss(): boolean {
    this.assertAlive();
    const context = publicGlContext(this.application);
    if (typeof context?.forceContextLoss !== 'function') return false;
    this.rendererLossState = 'lost';
    this.lastRendererLossFrame = this.frame;
    this.cpuPublication.invalidate('renderer-context-lost');
    context.forceContextLoss();
    return true;
  }

  public debugSnapshot(): PatchMapRendererDebug {
    return this.destroyedValue ? Object.freeze({ ...this.lastDebug, destroyed: true }) : this.lastDebug;
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.accessibilityOverlay.destroy();
    this.destroyedValue = true;
    this.rendererLossState = 'destroyed';
    this.surfacePublication.deactivate();
    this.lastLaneProbe = freezeLaneSnapshot([
      ['background-geometry', this.backgroundGeometryLane.label],
      ['background-assets', this.leaves.backgroundAssetContainer.label],
      ['ordinary-geometry', this.aggregate.container.label],
      ['relations-dynamic', this.aggregate.container.label],
      ['content-assets', this.leaves.contentAssetContainer.label],
      ['text', this.leaves.textContainer.label],
      ['interaction-overlay', this.interactionOverlay.label],
    ]);
    this.rootInteractionBindings.destroy();
    this.application.stage.removeChild(this.world);
    this.world.removeChildren();
    this.aggregate.destroy();
    if (!(this.aggregate instanceof AggregateMeshLayer)) {
      this.backgroundGeometryLane.destroy();
    }
    this.interactionOverlay.destroy();
    this.cleanupPromise = this.leaves.destroy();
    this.world.destroy();
    this.application.destroy({ removeView: false }, { children: true });
    this.surfacePublication.destroyCanvas();
    this.cpuPublication.destroy();
    this.relationSlotsByEndpoint = new Map();
    this.relationSlots.clear();
    this.relationEndpointsBySlot = new Map();
    this.entitySlotIndex.destroy();
    this.projectionQuadCache.readableFrames.clear();
    this.projectionQuadCache.index = null;
    this.projectionQuadCache.revision = -1;
    this.textProjectionSynchronizedRevision = -1;
    this.lastRenderedTextProjectionRevision = null;
    this.lastRenderedTextStoreRevision = null;
    this.lastDebug = Object.freeze({ ...this.lastDebug, destroyed: true });
    return true;
  }

  public async whenDestroyed(): Promise<void> {
    await this.cleanupPromise;
  }

  private syncAggregate(
    store: RenderStoreView,
    ranges: readonly SlotRange[] | undefined,
    projectionTransformOnly = false,
  ): AggregateResult {
    if (this.aggregate instanceof AggregateMeshLayer) {
      const debug = this.aggregate.sync(store, {
        fullRebuildEpoch: this.cpuPublication.storeEpoch,
        projectionContext: this.projectionContext(),
        ...(ranges === undefined ? {} : { changedRanges: ranges }),
        ...(projectionTransformOnly ? { projectionTransformOnly: true } : {}),
      });
      return {
        renderObjects: debug.meshCount,
        visiblePrimitives: debug.visibleQuads + debug.visibleRelations,
        uploadedChunks: debug.uploadedChunks,
        uploadedBytes: debug.uploadedBytes,
        dynamicFullUploadCount: 0,
        staticInvalidatedUploadCount: 0,
        particleFullUploadCount: 0,
        uploadObservation: 'dirty-chunk-bytes',
      };
    }
    const debug = this.aggregate.sync(store, {
      fullRebuildEpoch: this.cpuPublication.storeEpoch,
      projectionContext: this.projectionContext(),
      ...(ranges === undefined ? {} : { changedRanges: ranges }),
      ...(projectionTransformOnly ? { projectionTransformOnly: true } : {}),
    });
    return {
      renderObjects: debug.aggregateDisplayObjectCount,
      visiblePrimitives:
        debug.staticParticleCount +
        debug.dynamicParticleCount +
        debug.fallbackShapeCount +
        debug.relationSegmentCount,
      uploadedChunks: debug.particleFullUploadCount > 0 ? 1 : 0,
      // ParticlePipe does not expose public uploaded byte counts. Preserve zero
      // and report the observable whole-container particle count separately.
      uploadedBytes: 0,
      dynamicFullUploadCount: debug.dynamicFullUploadCount,
      staticInvalidatedUploadCount: debug.staticInvalidatedUploadCount,
      particleFullUploadCount: debug.particleFullUploadCount,
      uploadObservation: 'particle-full-upload-count',
    };
  }

  private emptyDebug(): PatchMapRendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: backendName(this.application),
      frame: 0,
      storeEpoch: 0,
      entityCount: 0,
      aggregateRenderObjects: 0,
      visiblePrimitives: 0,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: this.strategy === 'mesh' ? 'dirty-chunk-bytes' : 'particle-full-upload-count',
      bitmapTextCount: 0,
      fallbackTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
      view: this.view,
      lastInvalidation: this.cpuPublication.lastInvalidation,
      destroyed: false,
    });
  }

  private emptyLaneProbe(): PatchMapRenderLaneSnapshot {
    return freezeLaneSnapshot([
      ['background-geometry', this.backgroundGeometryLane.label],
      ['background-assets', this.leaves.backgroundAssetContainer.label],
      ['ordinary-geometry', this.aggregate.container.label],
      ['relations-dynamic', this.aggregate.container.label],
      ['content-assets', this.leaves.contentAssetContainer.label],
      ['text', this.leaves.textContainer.label],
      ['interaction-overlay', this.interactionOverlay.label],
    ]);
  }

  private buildLaneProbe(overlayCount: number): PatchMapRenderLaneSnapshot {
    const leaves = this.leaves.renderLaneProbe();
    let backgroundGeometry: PatchMapRenderLaneProbe;
    let ordinaryGeometry: PatchMapRenderLaneProbe;
    let relationsDynamic: PatchMapRenderLaneProbe;
    if (this.aggregate instanceof AggregateMeshLayer) {
      const aggregate = this.aggregate.renderLaneProbe();
      backgroundGeometry = aggregate.backgroundGeometry;
      ordinaryGeometry = aggregate.ordinaryGeometry;
      relationsDynamic = aggregate.relationsDynamic;
    } else {
      const debug = this.aggregate.debugCounters;
      backgroundGeometry = freezeLane(
        'background-geometry',
        this.backgroundGeometryLane.label,
        0,
        0,
      );
      ordinaryGeometry = freezeLane(
        'ordinary-geometry',
        `${this.aggregate.container.label} / static+fallback`,
        2,
        debug.staticParticleCount + debug.fallbackShapeCount,
      );
      relationsDynamic = freezeLane(
        'relations-dynamic',
        `${this.aggregate.container.label} / relations+dynamic`,
        2,
        debug.dynamicParticleCount + debug.relationSegmentCount,
      );
    }
    return Object.freeze({
      'background-geometry': backgroundGeometry,
      'background-assets': leaves.backgroundAssets,
      'ordinary-geometry': ordinaryGeometry,
      'relations-dynamic': relationsDynamic,
      'content-assets': leaves.contentAssets,
      text: leaves.text,
      'interaction-overlay': freezeLane(
        'interaction-overlay',
        this.interactionOverlay.label,
        overlayCount,
        this.interactionOverlay.visiblePrimitiveCount,
      ),
    });
  }

  private projectionContext(): PatchMapProjectionRenderContext {
    const context = this.cpuPublication.projectionContext(
      this.worldOrientation,
      this.projectionQuadCache,
    );
    return this.scenePaintOrder.exact
      ? Object.freeze({
          ...context,
          paintOrderByEntityId: this.scenePaintOrder.rankByEntityId,
        })
      : context;
  }

  private applyScenePaintOrder(): void {
    const target = this.scenePaintOrder.exact && this.scenePaintContainer !== undefined
      ? this.scenePaintContainer
      : null;
    const exactTarget = this.aggregate instanceof AggregateMeshLayer ? target : null;
    if (this.aggregate instanceof AggregateMeshLayer) {
      this.aggregate.setPaintContainer(exactTarget);
    }
    this.leaves?.setPaintContainer(exactTarget, this.scenePaintOrder.rankByEntityId);
  }

  private applyWorldTransform(): void {
    const [a, b, c, d] = createPatchMapWorldAffine(this.worldOrientation);
    const scale = this.view.scale;
    this.world.setFromMatrix(this.worldMatrix.set(
      a * scale,
      b * scale,
      c * scale,
      d * scale,
      this.view.x,
      this.view.y,
    ));
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('PatchMapPixiRenderer is destroyed');
  }
}

function freezeLane(
  role: PatchMapRenderLaneRole,
  label: string,
  renderObjectCount: number,
  visiblePrimitiveCount: number,
): PatchMapRenderLaneProbe {
  return Object.freeze({ role, label, renderObjectCount, visiblePrimitiveCount });
}

function freezeLaneSnapshot(
  lanes: readonly (readonly [PatchMapRenderLaneRole, string])[],
): PatchMapRenderLaneSnapshot {
  const result = Object.create(null) as Record<PatchMapRenderLaneRole, PatchMapRenderLaneProbe>;
  for (const [role, label] of lanes) result[role] = freezeLane(role, label, 0, 0);
  return Object.freeze(result);
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function sameNumberRecord(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function changedScenePaintOrderSlots(
  previous: PatchMapScenePaintOrder,
  next: PatchMapScenePaintOrder,
  slotByEntityId: ReadonlyMap<string, number>,
): readonly number[] | null {
  const slots = new Set<number>();
  for (const entityId of new Set([
    ...Object.keys(previous.rankByEntityId),
    ...Object.keys(next.rankByEntityId),
  ])) {
    if (previous.rankByEntityId[entityId] === next.rankByEntityId[entityId]) continue;
    const slot = slotByEntityId.get(entityId);
    if (slot === undefined) return null;
    slots.add(slot);
  }
  return Object.freeze([...slots].sort((left, right) => left - right));
}

const MAX_ZOOM_AWARE_TEXT_SCALE = 10;

function zoomAwareTextRasterResolution(pixelRatio: number, scale: number): number {
  const tier = scale <= 1.5
    ? 1
    : scale <= 3
      ? 2
      : scale <= 6
        ? 4
        : scale <= 9
          ? 8
          : MAX_ZOOM_AWARE_TEXT_SCALE;
  return pixelRatio * tier;
}

function idleAggregateResult(previous: AggregateResult): AggregateResult {
  if (previous.uploadObservation === 'particle-full-upload-count') {
    return {
      ...previous,
      uploadedChunks: previous.dynamicFullUploadCount > 0 ? 1 : 0,
      uploadedBytes: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: previous.dynamicFullUploadCount,
    };
  }
  return {
    ...previous,
    uploadedChunks: 0,
    uploadedBytes: 0,
    dynamicFullUploadCount: 0,
    staticInvalidatedUploadCount: 0,
    particleFullUploadCount: 0,
  };
}
