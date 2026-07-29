import 'pixi.js/prepare';
import 'pixi.js/accessibility';

import {
  Application,
  Container,
  Graphics,
  Matrix,
  Rectangle,
  VERSION,
  type ApplicationOptions,
  type FederatedPointerEvent,
} from 'pixi.js';

import type { CoreView, SlotRange } from '../../core-v1/contracts';
import {
  RenderFlags,
  RenderKind,
  type CoreRenderer,
  type RendererFlushResult,
  type RenderStoreView,
} from '../../core-v1/renderer/types';
import {
  AggregateLeafLayer,
  type LeafAssetBindingObservation,
  type LeafAssetBindingProbe,
  type LeafAssetBindingRequest,
  type LeafSceneImageProbe,
  type CoreV2BitmapTextCapabilityRequest,
} from './leaf-layer';
import { AggregateMeshLayer } from './mesh-layer';
import { ParticleGraphicsLayer } from './particle-layer';
import type { CoreV2ProjectionIndex, CoreV2TextProjection } from '../contracts';
import type { CoreV2BitmapTextCapabilityProof } from '../semantic/text-render-route';
import {
  createCoreV2LeafAssetSession,
  type CoreV2AssetPolicy,
  type CoreV2AssetSession,
} from '../assets';
import type {
  CoreV2BackendPreference,
  CoreV2EntityPaintProbe,
  CoreV2InteractionOverlayPolicy,
  CoreV2OverlayPaintProbe,
  CoreV2ActiveRendererBackend,
  CoreV2RenderLaneProbe,
  CoreV2RenderLaneRole,
  CoreV2RenderLaneSnapshot,
  CoreV2RendererLossState,
  CoreV2RendererStrategy,
  CoreV2TextAttachedSignatures,
  CoreV2TextSemanticSignatures,
  CoreV2TextRendererProbe,
  PixiCoreV2PublicSurfaceProbe,
  PixiCoreV2RendererDebug,
  PixiCoreV2RendererLossProbe,
  RootInteractionHandlers,
  RootPointerInput,
} from './types';
import {
  createCoreV2UprightFrameCache,
  createCoreV2WorldAffine,
  resolveCoreV2SlotQuad,
  type CoreV2ProjectionRenderContext,
  type CoreV2WorldOrientation,
} from './types';
import type {
  CoreV2RendererPresentationEntityProbe,
  CoreV2ResolvedPresentationPolicy,
} from '../presentation-policy';
import { CoreV2PresentationStoreView } from './presentation-store';
import type {
  CoreV2AccessibilityActivationInput,
  CoreV2AccessibilityRenderNode,
  CoreV2AccessibilitySurfaceProbe,
} from '../accessibility';

export interface PixiCoreV2RendererOptions {
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly strategy?: CoreV2RendererStrategy;
  readonly preference?: CoreV2BackendPreference;
  readonly antialias?: boolean;
  readonly background?: number;
  readonly powerPreference?: 'high-performance' | 'low-power';
  /** Reject a WebGL renderer unless Pixi reports a live WebGL2 context. */
  readonly requireWebGL2?: boolean;
  /** Register this Application with the official PixiJS DevTools hook. */
  readonly devtools?: boolean;
  readonly assetSession?: CoreV2AssetSession;
  readonly assetPolicy?: CoreV2AssetPolicy;
  readonly resolveBitmapTextCapability?: (
    request: CoreV2BitmapTextCapabilityRequest,
  ) => CoreV2BitmapTextCapabilityProof | null;
}

export interface PixiCoreV2InitializationMetrics {
  readonly applicationInitMs: number;
  readonly rendererBuildMs: number;
}

export class PixiCoreV2RuntimeError extends Error {
  public readonly code: 'UNSUPPORTED_RUNTIME' | 'RENDERER_LOST';

  public constructor(
    code: 'UNSUPPORTED_RUNTIME' | 'RENDERER_LOST',
    message: string,
  ) {
    super(message);
    this.name = 'PixiCoreV2RuntimeError';
    this.code = code;
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
  readonly uploadObservation: PixiCoreV2RendererDebug['uploadObservation'];
}

const DEFAULT_VIEW: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
const DEFAULT_WORLD_ORIENTATION: CoreV2WorldOrientation = Object.freeze({
  rotationDegrees: 0,
  flipX: false,
  flipY: false,
});
const DEFAULT_INTERACTION_OVERLAY_POLICY: CoreV2InteractionOverlayPolicy = Object.freeze({
  visibleEntityIds: null,
  transformableEntityIds: null,
  resizableEntityIds: null,
  hidden: false,
  handleCssPx: 6,
  strokeCssPx: 2,
});
const EMPTY_PROJECTION_INDEX: CoreV2ProjectionIndex = Object.freeze({
  byEntityId: Object.freeze({}),
});

interface PixiPublicGlContextSystem {
  readonly webGLVersion?: 1 | 2;
  readonly isLost?: boolean;
  forceContextLoss?(): void;
}

interface PixiPublicRendererSurface {
  readonly name?: string;
  readonly context?: PixiPublicGlContextSystem;
}

interface PixiDevtoolsHandle {
  readonly app: Application;
}

interface PixiDevtoolsRegistration {
  readonly token: object;
  readonly handle: PixiDevtoolsHandle;
}

type PixiDevtoolsGlobal = typeof globalThis & {
  __PIXI_DEVTOOLS__?: PixiDevtoolsHandle;
};

const DEVTOOLS_REGISTRATIONS: PixiDevtoolsRegistration[] = [];
let previousDevtoolsHandle: PixiDevtoolsHandle | undefined;
let previousDevtoolsHandleWasPresent = false;

export class PixiCoreV2Renderer implements CoreRenderer {
  public readonly application: Application;
  public readonly canvas: HTMLCanvasElement;
  public readonly strategy: CoreV2RendererStrategy;
  public readonly preference: CoreV2BackendPreference;
  public readonly world: Container;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics;

  private readonly aggregate: AggregateLayer;
  private readonly leaves: AggregateLeafLayer;
  private readonly backgroundGeometryLane: Container;
  private readonly selectionOverlay: Graphics;
  private readonly transformerOverlay: Graphics;
  private readonly selectedSlots = new Set<number>();
  private readonly visibleOverlaySlots = new Set<number>();
  private readonly transformerOverlaySlots = new Set<number>();
  private readonly resizableOverlaySlots = new Set<number>();
  private accessibilityRoot: Container | null = null;
  private readonly accessibilityNodes = new Map<string, Container>();
  private readonly accessibilityIdByNode = new Map<Container, string>();
  private accessibilityActivationListener:
    | ((
        targetId: string,
        input: CoreV2AccessibilityActivationInput,
      ) => void)
    | null = null;
  private accessibilityClickListener:
    | ((event: FederatedPointerEvent) => void)
    | null = null;
  private accessibilityActivationSequence = 0;
  private accessibilityFocusedId: string | null = null;
  private interactionOverlayPolicy = DEFAULT_INTERACTION_OVERLAY_POLICY;
  private readonly target: HTMLElement | undefined;
  private cleanupPromise: Promise<void> = Promise.resolve();
  private interactionUnbind: (() => void) | null = null;
  private lastStore: RenderStoreView | null = null;
  private lastSourceStore: RenderStoreView | null = null;
  private presentationPolicy: CoreV2ResolvedPresentationPolicy | null = null;
  private presentationStore: CoreV2PresentationStoreView | null = null;
  private presentationBaseStore: RenderStoreView | null = null;
  private pendingRanges: SlotRange[] | undefined;
  private pendingOverlayRanges: SlotRange[] | undefined;
  private pendingProjectionTransformOnly = false;
  private pendingBarPresentationOnly = false;
  private pendingTextOnly = false;
  private storeEpoch = 0;
  private frame = 0;
  private widthValue: number;
  private heightValue: number;
  private pixelRatioValue: number;
  private view: CoreView = DEFAULT_VIEW;
  private projectionIndex: CoreV2ProjectionIndex = EMPTY_PROJECTION_INDEX;
  private staleProjectionEntityIds: ReadonlySet<string> = new Set();
  private relationSlotsByEndpoint: ReadonlyMap<number, readonly number[]> = new Map();
  private relationSlots = new Set<number>();
  private relationEndpointsBySlot: ReadonlyMap<number, readonly [number, number]> = new Map();
  private projectionRevision = 0;
  private readonly uprightFrameCache = createCoreV2UprightFrameCache();
  private textProjectionSynchronizedRevision = -1;
  private lastRenderedTextProjectionRevision: number | null = null;
  private lastRenderedTextStoreRevision: number | null = null;
  private readonly entityIdBySlot = new Map<number, string>();
  private readonly slotByEntityId = new Map<string, number>();
  private readonly textEntityIdBySlot = new Map<number, string>();
  private readonly textVisibilityByEntityId = new Map<string, boolean>();
  private worldOrientation: CoreV2WorldOrientation = DEFAULT_WORLD_ORIENTATION;
  private readonly worldMatrix = new Matrix();
  private lastInvalidation = 'init';
  private destroyedValue = false;
  private synchronizeOnly = false;
  private readonly devtoolsToken = Object.freeze({});
  private readonly activeBackend: CoreV2ActiveRendererBackend;
  private readonly initialWebGLVersion: 1 | 2 | null;
  private devtoolsRegistered = false;
  private contextLossUnbind: (() => void) | null = null;
  private rendererLossState: CoreV2RendererLossState = 'healthy';
  private rendererLossEventCount = 0;
  private rendererRestorationEventCount = 0;
  private recoveredRendererFrameCount = 0;
  private lastRendererLossFrame: number | null = null;
  private lastRendererRecoveryFrame: number | null = null;
  private lastDebug: PixiCoreV2RendererDebug;
  private lastLaneProbe: CoreV2RenderLaneSnapshot;
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

  private constructor(
    application: Application,
    options: Required<Pick<PixiCoreV2RendererOptions, 'width' | 'height' | 'pixelRatio' | 'strategy' | 'preference'>> &
      Pick<
        PixiCoreV2RendererOptions,
        'target' | 'devtools' | 'assetSession' | 'assetPolicy' | 'resolveBitmapTextCapability'
      >,
    metrics: PixiCoreV2InitializationMetrics,
  ) {
    const buildStarted = now();
    this.application = application;
    this.canvas = application.canvas;
    this.activeBackend = activeRendererBackend(application);
    this.initialWebGLVersion = publicGlContext(application)?.webGLVersion ?? null;
    this.target = options.target;
    this.strategy = options.strategy;
    this.preference = options.preference;
    this.widthValue = options.width;
    this.heightValue = options.height;
    this.pixelRatioValue = options.pixelRatio;
    this.world = new Container({ label: 'PATCH MAP Core v2 / world', isRenderGroup: true });
    this.world.eventMode = 'none';
    this.world.interactiveChildren = false;
    this.aggregate = options.strategy === 'mesh'
      ? new AggregateMeshLayer({
          label: 'PATCH MAP Core v2 / aggregate mesh',
          applyStoreView: false,
        })
      : new ParticleGraphicsLayer({ label: 'PATCH MAP Core v2 / particle graphics' });
    this.backgroundGeometryLane = this.aggregate instanceof AggregateMeshLayer
      ? this.aggregate.backgroundGeometryContainer
      : new Container({ label: 'PATCH MAP Core v2 / background geometry unsupported (0)' });
    this.backgroundGeometryLane.eventMode = 'none';
    this.backgroundGeometryLane.interactiveChildren = false;
    const leafSession = options.assetSession ?? createCoreV2LeafAssetSession(options.assetPolicy);
    this.leaves = new AggregateLeafLayer(
      leafSession,
      options.assetSession === undefined,
      {
        onBindingTransition: ({ key, state, dirtySlots }) => {
          if (this.destroyedValue) return;
          this.lastInvalidation = `scene-asset:${key}:${state}`;
          this.pendingProjectionTransformOnly = false;
          this.pendingRanges = mergeRanges(
            this.pendingRanges ?? [],
            contiguousRanges(dirtySlots),
          );
        },
        ...(options.resolveBitmapTextCapability === undefined
          ? {}
          : { resolveBitmapTextCapability: options.resolveBitmapTextCapability }),
      },
    );
    this.selectionOverlay = new Graphics({ label: 'PATCH MAP Core v2 / selection overlay (0)' });
    this.selectionOverlay.eventMode = 'none';
    this.transformerOverlay = new Graphics({ label: 'PATCH MAP Core v2 / transformer overlay (0)' });
    this.transformerOverlay.eventMode = 'none';
    this.world.addChild(
      this.backgroundGeometryLane,
      this.leaves.backgroundAssetContainer,
      this.aggregate.container,
      this.leaves.contentAssetContainer,
      this.leaves.textContainer,
      this.selectionOverlay,
      this.transformerOverlay,
    );
    this.application.stage.label = 'PATCH MAP Core v2';
    this.application.stage.eventMode = 'static';
    this.application.stage.interactiveChildren = false;
    this.application.stage.hitArea = new Rectangle(0, 0, this.widthValue, this.heightValue);
    this.application.stage.addChild(this.world);
    this.application.ticker.stop();
    this.bindRendererLossEvents();
    if (options.devtools === true) {
      registerPixiDevtools(this.devtoolsToken, this.application);
      this.devtoolsRegistered = true;
    }
    this.target?.appendChild(this.canvas);
    this.canvas.style.touchAction = 'none';
    this.canvas.dataset.patchMapCore = 'v2';

    const rendererBuildMs = metrics.rendererBuildMs + (now() - buildStarted);
    this.initializationMetrics = Object.freeze({
      applicationInitMs: metrics.applicationInitMs,
      rendererBuildMs,
    });
    this.lastDebug = this.emptyDebug();
    this.lastLaneProbe = this.emptyLaneProbe();
  }

  public static async create(options: PixiCoreV2RendererOptions = {}): Promise<PixiCoreV2Renderer> {
    const width = positive(options.width ?? options.target?.clientWidth ?? 800, 'width');
    const height = positive(options.height ?? options.target?.clientHeight ?? 600, 'height');
    const pixelRatio = positive(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 'pixelRatio');
    const strategy = options.strategy ?? 'mesh';
    const preference = options.preference ?? 'webgl';
    const packedBackground = options.background ?? 0xf7f8faff;
    const application = new Application();
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
    await application.init(initOptions);
    const applicationInitMs = now() - applicationStarted;
    if (options.requireWebGL2 === true && activeRendererBackend(application) !== 'webgl2') {
      application.destroy({ removeView: false }, { children: true });
      throw new PixiCoreV2RuntimeError(
        'UNSUPPORTED_RUNTIME',
        'Core v2 requires a PixiJS WebGL2 renderer',
      );
    }
    return new PixiCoreV2Renderer(
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
    );
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
    this.lastInvalidation = reason;
    const previousIdle =
      this.pendingRanges !== undefined &&
      this.pendingRanges.length === 0;
    const barOnly =
      options.domain === 'bar-only' &&
      (previousIdle || this.pendingBarPresentationOnly);
    const textOnly =
      options.domain === 'text-only' &&
      (previousIdle || this.pendingTextOnly);
    // A view-only commit intentionally publishes an empty range after
    // setWorldOrientation(). Preserve the orientation fast-path promise in
    // that case; any actual scene mutation or full rebuild revokes it.
    if (options.fullRebuild || ranges.length > 0) {
      this.pendingProjectionTransformOnly = false;
      this.pendingBarPresentationOnly = barOnly;
      this.pendingTextOnly = textOnly;
    }
    if (options.fullRebuild) {
      this.storeEpoch += 1;
      this.pendingRanges = undefined;
      return;
    }
    this.pendingRanges = mergeRanges(this.pendingRanges ?? [], ranges);
  }

  public markOverlayChanges(ranges: readonly SlotRange[], reason: string): void {
    this.assertAlive();
    this.lastInvalidation = reason;
    this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], ranges);
  }

  public setInteractionOverlayPolicy(
    policy: CoreV2InteractionOverlayPolicy,
  ): boolean {
    this.assertAlive();
    const normalized = normalizeInteractionOverlayPolicy(policy);
    if (sameInteractionOverlayPolicy(this.interactionOverlayPolicy, normalized)) {
      return false;
    }
    this.interactionOverlayPolicy = normalized;
    this.pendingOverlayRanges = undefined;
    this.lastInvalidation = 'interaction-overlay-policy';
    return true;
  }

  /**
   * Apply host presentation state without touching the authoritative dense
   * store. Policy changes intentionally rebuild aggregate batches once;
   * subsequent scene updates retain dirty-range synchronization.
   */
  public setPresentationPolicy(policy: CoreV2ResolvedPresentationPolicy | null): boolean {
    this.assertAlive();
    const normalized = policy === null ? null : normalizePresentationPolicy(policy);
    if (samePresentationPolicy(this.presentationPolicy, normalized)) return false;
    this.presentationPolicy = normalized;
    this.presentationStore = normalized === null || this.lastSourceStore === null
      ? null
      : new CoreV2PresentationStoreView(this.lastSourceStore, normalized);
    this.presentationBaseStore = this.presentationStore === null
      ? null
      : this.lastSourceStore;
    this.pendingRanges = undefined;
    this.pendingOverlayRanges = undefined;
    this.pendingProjectionTransformOnly = false;
    this.pendingBarPresentationOnly = false;
    this.pendingTextOnly = false;
    this.lastInvalidation = normalized === null
      ? 'presentation-policy:clear'
      : `presentation-policy:${normalized.revision}`;
    return true;
  }

  public presentationEntityProbe(
    entityId: string,
  ): CoreV2RendererPresentationEntityProbe | null {
    this.assertAlive();
    if (typeof entityId !== 'string' || entityId.length === 0) {
      throw new TypeError('entityId must be a non-empty string');
    }
    const active = this.presentationStore?.entityProbe(entityId);
    if (active !== null && active !== undefined) {
      return Object.freeze({ entityId, ...active });
    }
    const store = this.presentationPolicy === null
      ? this.lastSourceStore ?? this.lastStore
      : this.presentationStore;
    if (store === null) return null;
    const slot = store.ids.indexOf(entityId);
    if (slot < 0 || (store.alive[slot] ?? 0) === 0) return null;
    const visible = ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0 &&
      (store.opacity[slot] ?? 0) > 0;
    return Object.freeze({
      entityId,
      emphasis: 1,
      visible,
      renderObjectCount: visible ? 1 : 0,
      packedFill: (store.fill[slot] ?? 0) >>> 0,
    });
  }

  /**
   * Replace the semantic projection index, or publish in-place transient
   * presentation edits with caller-owned dirty ranges. The explicit-range
   * path avoids an O(scene) projection diff on every animation frame.
   */
  public setProjection(
    index: CoreV2ProjectionIndex,
    changedRanges?: readonly SlotRange[],
    staleEntityIds?: ReadonlySet<string>,
    updateKind?: 'bar-presentation' | 'text',
  ): boolean {
    this.assertAlive();
    const nextStaleEntityIds = staleEntityIds === undefined
      ? this.staleProjectionEntityIds
      : new Set(staleEntityIds);
    const stalenessChanged = !sameStringSet(
      this.staleProjectionEntityIds,
      nextStaleEntityIds,
    );
    if (
      this.projectionIndex === index &&
      changedRanges === undefined &&
      !stalenessChanged
    ) {
      return false;
    }
    const previous = this.projectionIndex;
    const previousStaleEntityIds = this.staleProjectionEntityIds;
    this.projectionIndex = index;
    this.pendingProjectionTransformOnly = false;
    this.staleProjectionEntityIds = nextStaleEntityIds;
    this.projectionRevision += 1;
    const projectionRanges = changedRanges === undefined
      ? this.lastStore
        ? projectionChangedRanges(this.lastStore, previous, index)
        : []
      : mergeRanges([], changedRanges);
    const stalenessRanges = stalenessChanged && this.lastStore
      ? projectionStalenessChangedRanges(
          previousStaleEntityIds,
          nextStaleEntityIds,
          this.slotByEntityId,
        )
      : [];
    const ranges = mergeRanges(projectionRanges, stalenessRanges);
    const barPresentationOnly =
      updateKind === 'bar-presentation' &&
      changedRanges !== undefined &&
      this.pendingRanges !== undefined &&
      (
        this.pendingRanges.length === 0 ||
        this.pendingBarPresentationOnly
      );
    const textOnly =
      updateKind === 'text' &&
      changedRanges !== undefined &&
      this.pendingRanges !== undefined &&
      (
        this.pendingRanges.length === 0 ||
        this.pendingTextOnly
      );
    this.pendingRanges = mergeRanges(this.pendingRanges ?? [], ranges);
    this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], ranges);
    this.pendingBarPresentationOnly = barPresentationOnly;
    this.pendingTextOnly = textOnly;
    this.lastInvalidation = changedRanges === undefined
      ? 'projection'
      : 'presentation-projection';
    return true;
  }

  public setWorldOrientation(world: CoreV2WorldOrientation): boolean {
    this.assertAlive();
    if (sameWorldOrientation(this.worldOrientation, world)) return false;
    this.worldOrientation = Object.freeze({ ...world });
    this.projectionRevision += 1;
    this.pendingBarPresentationOnly = false;
    this.pendingTextOnly = false;
    this.applyWorldTransform();
    const transformOnlyEligible =
      this.pendingRanges !== undefined && this.pendingRanges.length === 0;
    if (this.lastStore) {
      const upright = projectionOrientationRanges(this.lastStore, this.projectionIndex, 'upright');
      this.pendingRanges = mergeRanges(this.pendingRanges ?? [], upright);
      this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], upright);
    }
    this.pendingProjectionTransformOnly = transformOnlyEligible;
    this.lastInvalidation = 'world-orientation';
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
    this.lastInvalidation = 'resize';
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
      this.projectionRevision += 1;
      const transformOnlyEligible =
        this.pendingRanges !== undefined && this.pendingRanges.length === 0;
      if (this.lastStore) {
        const upright = projectionOrientationRanges(this.lastStore, this.projectionIndex, 'upright');
        this.pendingRanges = mergeRanges(this.pendingRanges ?? [], upright);
        this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], upright);
      }
      this.pendingProjectionTransformOnly = transformOnlyEligible;
      this.pendingBarPresentationOnly = false;
      this.pendingTextOnly = false;
    }
    if (scaleChanged) this.pendingOverlayRanges = undefined;
    this.applyWorldTransform();
    this.lastInvalidation = 'view';
    return true;
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
    const visibleChunks = this.aggregate.cull(
      this.worldMatrix,
      this.widthValue,
      this.heightValue,
      48,
      precise,
    );
    if (!precise) {
      this.aggregate.backgroundGeometryContainer.sortChildren();
      this.aggregate.quadContainer.sortChildren();
      this.aggregate.relationContainer.sortChildren();
    }
    return visibleChunks;
  }

  public flush(store: RenderStoreView): RendererFlushResult {
    this.assertAlive();
    const effectiveStore = this.presentationStoreFor(store);
    const storeReplaced = this.lastStore !== effectiveStore;
    if (storeReplaced) {
      this.storeEpoch += 1;
      this.pendingRanges = undefined;
      this.pendingOverlayRanges = undefined;
      this.pendingProjectionTransformOnly = false;
      this.pendingBarPresentationOnly = false;
      this.pendingTextOnly = false;
      this.selectedSlots.clear();
      this.visibleOverlaySlots.clear();
      this.transformerOverlaySlots.clear();
      this.resizableOverlaySlots.clear();
    }
    // View rotation can change upright projection geometry. Resolve it before
    // consuming pending ranges so the first published frame cannot lag.
    this.setView(effectiveStore.view);
    if (
      storeReplaced ||
      this.pendingRanges === undefined ||
      rangesTouchCoreV2RelationTopology(
        store,
        this.pendingRanges,
        this.relationSlots,
        this.relationEndpointsBySlot,
      )
    ) {
      const adjacency = buildCoreV2RelationAdjacency(store);
      this.relationSlotsByEndpoint = adjacency.byEndpoint;
      this.relationSlots = adjacency.relationSlots;
      this.relationEndpointsBySlot = adjacency.endpointsByRelation;
    }
    const projectionTransformOnly =
      this.pendingProjectionTransformOnly &&
      !storeReplaced &&
      this.pendingRanges !== undefined;
    const barPresentationOnly =
      this.pendingBarPresentationOnly &&
      !storeReplaced &&
      this.pendingRanges !== undefined;
    const textOnly =
      this.pendingTextOnly &&
      !storeReplaced &&
      this.pendingRanges !== undefined;
    const ranges = this.pendingRanges === undefined ||
      this.relationSlotsByEndpoint.size === 0 ||
      projectionTransformOnly
      ? this.pendingRanges
      : expandCoreV2RelationDependencyRanges(
          effectiveStore,
          this.pendingRanges,
          this.relationSlotsByEndpoint,
        );
    if (!projectionTransformOnly && !barPresentationOnly) {
      this.syncEntitySlots(
        effectiveStore,
        storeReplaced ? undefined : ranges,
      );
      this.syncTextVisibility(
        effectiveStore,
        storeReplaced || ranges === undefined ? undefined : ranges,
      );
    }
    let aggregateViewportWork = false;
    if (this.aggregate instanceof AggregateMeshLayer) {
      this.aggregate.cull(
        this.worldMatrix,
        this.widthValue,
        this.heightValue,
        48,
        !barPresentationOnly,
      );
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
    if (this.aggregate instanceof AggregateMeshLayer) {
      this.aggregate.cull(
        this.worldMatrix,
        this.widthValue,
        this.heightValue,
        48,
        !barPresentationOnly,
      );
    }
    const leaves = this.leaves.sync(effectiveStore, {
      fullRebuildEpoch: this.storeEpoch,
      projectionContext: this.projectionContext(),
      ...(ranges === undefined
        ? {}
        : { changedRanges: barPresentationOnly ? [] : ranges }),
      ...(projectionTransformOnly ? { projectionTransformOnly: true } : {}),
    });
    this.leaves.cull(this.worldMatrix, this.widthValue, this.heightValue);
    this.textProjectionSynchronizedRevision = this.projectionRevision;
    this.syncSelectionOverlay(
      effectiveStore,
      storeReplaced,
      this.pendingOverlayRanges ?? ranges,
    );
    const rendered = !this.synchronizeOnly;
    this.synchronizeOnly = false;
    if (rendered) {
      if (
        this.rendererLossState === 'lost'
        && publicGlContext(this.application)?.isLost === true
      ) {
        throw new PixiCoreV2RuntimeError(
          'RENDERER_LOST',
          'PixiJS WebGL2 context is lost before frame publication',
        );
      }
      this.application.render();
      const renderedFrame = this.frame + 1;
      if (this.rendererLossState !== 'healthy') {
        if (publicGlContext(this.application)?.isLost === true) {
          throw new PixiCoreV2RuntimeError(
            'RENDERER_LOST',
            'PixiJS WebGL2 context remained lost after a recovery render',
          );
        }
        this.rendererLossState = 'healthy';
        this.recoveredRendererFrameCount += 1;
        this.lastRendererRecoveryFrame = renderedFrame;
        this.lastInvalidation = 'renderer-context-recovered';
      }
      this.leaves.confirmRenderedFrame(renderedFrame);
      this.frame = renderedFrame;
      this.lastRenderedTextProjectionRevision = this.projectionRevision;
      this.lastRenderedTextStoreRevision = effectiveStore.revision;
    }
    this.lastStore = effectiveStore;
    this.lastSourceStore = store;
    this.pendingRanges = [];
    this.pendingOverlayRanges = [];
    this.pendingProjectionTransformOnly = false;
    this.pendingBarPresentationOnly = false;
    this.pendingTextOnly = false;
    const overlayCount = this.visibleOverlaySlots.size > 0 ? 2 : 0;
    this.lastLaneProbe = this.buildLaneProbe(overlayCount);
    this.lastDebug = Object.freeze({
      strategy: this.strategy,
      backend: backendName(this.application),
      frame: this.frame,
      storeEpoch: this.storeEpoch,
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
      lastInvalidation: this.lastInvalidation,
      destroyed: false,
    });
    this.world.label = `PATCH MAP Core v2 / world (${effectiveStore.liveCount} entities)`;
    return Object.freeze({
      rendered,
      commandCount: this.lastDebug.aggregateRenderObjects,
    });
  }

  private presentationStoreFor(store: RenderStoreView): RenderStoreView {
    const policy = this.presentationPolicy;
    if (policy === null) return store;
    if (
      this.presentationStore === null ||
      this.presentationBaseStore !== store ||
      this.presentationStore.capacity !== store.capacity
    ) {
      this.presentationStore = new CoreV2PresentationStoreView(store, policy);
      this.presentationBaseStore = store;
      return this.presentationStore;
    }
    this.presentationStore.synchronize(store, policy, this.pendingRanges);
    return this.presentationStore;
  }

  public synchronizeNextFlush(): void {
    this.assertAlive();
    this.synchronizeOnly = true;
    this.lastInvalidation = 'synchronize';
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
      this.backgroundGeometryLane,
      this.leaves.backgroundAssetContainer,
      this.aggregate.container,
      this.leaves.contentAssetContainer,
    ]);
  }

  public async loadAsset(alias: string, url: string): Promise<void> {
    await this.leaves.loadAsset(alias, url);
    this.lastInvalidation = `asset:${alias}:load`;
    this.pendingProjectionTransformOnly = false;
    this.pendingRanges ??= [];
  }

  public async unloadAsset(alias: string): Promise<boolean> {
    const unloaded = await this.leaves.unloadAsset(alias);
    if (unloaded) {
      this.lastInvalidation = `asset:${alias}:unload`;
      this.pendingProjectionTransformOnly = false;
      this.pendingRanges ??= [];
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
    this.lastInvalidation = `scene-asset:${key}:bind`;
    this.pendingProjectionTransformOnly = false;
    this.pendingRanges ??= [];
    return completion;
  }

  public async unbindSceneAsset(key: string): Promise<boolean> {
    this.assertAlive();
    const unbound = await this.leaves.unbindSceneAsset(key);
    if (unbound) {
      this.lastInvalidation = `scene-asset:${key}:unbind`;
      this.pendingProjectionTransformOnly = false;
      this.pendingRanges ??= [];
    }
    return unbound;
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    return this.leaves.sceneAssetBindingProbe(key);
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    return this.leaves.sceneImageProbe(entityId);
  }

  public textRendererProbe(entityId: string): CoreV2TextRendererProbe | null {
    if (this.destroyedValue) return null;
    const leaf = this.leaves.textRendererProbe(entityId);
    const textIndex = this.projectionIndex.textsByEntityId;
    if (textIndex === undefined) return leaf;
    const semantic = textIndex[entityId];
    if (semantic === undefined) return null;
    const semanticSignatures = freezeRendererTextSemanticSignatures({
      content: semantic.contentSignature,
      style: semantic.styleSignature,
      layout: semantic.layoutSignature,
    });
    const expectedObjectCount = this.textVisibilityByEntityId.get(entityId) === true ? 1 : 0;
    if (expectedObjectCount === 0) {
      const current = this.textProjectionSynchronizedRevision === this.projectionRevision &&
        this.lastRenderedTextProjectionRevision === this.projectionRevision &&
        this.lastRenderedTextStoreRevision === this.lastStore?.revision;
      return freezeRendererTextProbe({
        entityId,
        route: 'none',
        rendererKind: 'none',
        routeReason: 'not-attached',
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
        route: 'none',
        rendererKind: 'none',
        routeReason: 'not-attached',
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
    const current = this.textProjectionSynchronizedRevision === this.projectionRevision &&
      this.lastRenderedTextProjectionRevision === this.projectionRevision &&
      this.lastRenderedTextStoreRevision === this.lastStore?.revision &&
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

  public renderLaneProbe(): CoreV2RenderLaneSnapshot {
    return this.lastLaneProbe;
  }

  public entityPaintProbe(entityId: string): CoreV2EntityPaintProbe | null {
    const leaf = this.leaves.entityPaintProbe(entityId);
    if (leaf !== null) return leaf;
    return this.aggregate instanceof AggregateMeshLayer
      ? this.aggregate.entityPaintProbe(entityId)
      : null;
  }

  /** Exact scene-tail order and current visibility of aggregate editor overlays. */
  public overlayPaintProbe(): CoreV2OverlayPaintProbe {
    this.assertAlive();
    const visible = this.visibleOverlaySlots.size > 0;
    return Object.freeze({
      order: Object.freeze(['selection', 'transformer'] as const),
      selection: visible,
      transformer: this.transformerOverlaySlots.size > 0,
      selectedEntityCount: this.visibleOverlaySlots.size,
      renderObjectCount: visible ? 2 : 0,
    });
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
    nodes: readonly CoreV2AccessibilityRenderNode[],
  ): CoreV2AccessibilitySurfaceProbe {
    this.assertAlive();
    const ids = new Set<string>();
    for (const node of nodes) {
      if (ids.has(node.id)) {
        throw new TypeError(`duplicate accessibility target ${node.id}`);
      }
      ids.add(node.id);
      validateAccessibilityRenderNode(node);
    }
    if (nodes.length === 0) {
      this.destroyAccessibilityOverlay();
      return this.accessibilitySurfaceProbe();
    }
    this.ensureAccessibilityRoot();
    const root = this.accessibilityRoot;
    if (root === null) throw new Error('accessibility root was not created');

    for (const [id, container] of this.accessibilityNodes) {
      if (ids.has(id)) continue;
      if (container.parent === root) root.removeChild(container);
      this.accessibilityNodes.delete(id);
      this.accessibilityIdByNode.delete(container);
      container.destroy();
    }

    nodes.forEach((node, index) => {
      let container = this.accessibilityNodes.get(node.id);
      if (container === undefined) {
        container = new Container({
          label: `PATCH MAP Core v2 / accessibility / ${node.id}`,
        });
        container.eventMode = 'static';
        container.interactiveChildren = false;
        container.accessible = true;
        container.accessibleChildren = true;
        container.accessiblePointerEvents = 'auto';
        root.addChild(container);
        this.accessibilityNodes.set(node.id, container);
        this.accessibilityIdByNode.set(container, node.id);
      }
      container.accessibleTitle = node.title;
      container.accessibleHint = node.hint;
      container.accessibleText = node.text;
      container.accessibleType = node.type;
      container.tabIndex = node.tabIndex;
      updateAccessibilityRectangle(container, 'boundsArea', node.screenBounds);
      updateAccessibilityRectangle(container, 'hitArea', node.screenBounds);
      if (root.children[index] !== container) {
        root.setChildIndex(container, index);
      }
    });
    if (
      this.accessibilityFocusedId !== null &&
      !this.accessibilityNodes.has(this.accessibilityFocusedId)
    ) {
      this.accessibilityFocusedId = null;
    }
    const accessibility = this.application.renderer.accessibility;
    const enabled = nodes.length > 0;
    if (accessibility.isActive !== enabled) {
      accessibility.setAccessibilityEnabled(enabled);
    }
    this.application.stage.interactiveChildren = nodes.length > 0;
    return this.accessibilitySurfaceProbe();
  }

  public bindAccessibilityActivation(
    listener: (
      targetId: string,
      input: CoreV2AccessibilityActivationInput,
    ) => void,
  ): () => void {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new TypeError('accessibility activation listener must be a function');
    }
    if (this.accessibilityActivationListener !== null) {
      throw new Error('accessibility activation listener is already bound');
    }
    this.accessibilityActivationListener = listener;
    return () => {
      if (this.accessibilityActivationListener === listener) {
        this.accessibilityActivationListener = null;
      }
    };
  }

  public focusAccessibilityTarget(targetId: string): boolean {
    this.assertAlive();
    const node = this.accessibilityNodes.get(targetId);
    if (node === undefined) return false;
    this.accessibilityFocusedId = targetId;
    const system = this.application.renderer.accessibility;
    if (!system.isActive) system.setAccessibilityEnabled(true);
    const shadow = [...system.div.children].find((child) =>
      child instanceof HTMLElement &&
      child.title === node.accessibleTitle &&
      child.tabIndex === node.tabIndex);
    if (shadow instanceof HTMLElement) {
      shadow.focus({ preventScroll: true });
    }
    return true;
  }

  public accessibilitySurfaceProbe(): CoreV2AccessibilitySurfaceProbe {
    if (this.destroyedValue) {
      return Object.freeze({
        active: false,
        shadowDomActive: false,
        overlayNodeCount: 0,
        shadowDomNodeCount: 0,
        rootListenerCount: 0,
        entityListenerCount: 0,
        focusedId: null,
        shadowDomFocusedId: null,
        destroyed: true,
      });
    }
    const system = this.application.renderer.accessibility;
    const shadowRoot = system.isActive ? system.div : null;
    const activeElement =
      typeof document === 'undefined' ? null : document.activeElement;
    let shadowDomFocusedId: string | null = null;
    if (
      shadowRoot !== null &&
      typeof HTMLElement !== 'undefined' &&
      activeElement instanceof HTMLElement &&
      shadowRoot.contains(activeElement)
    ) {
      for (const [id, node] of this.accessibilityNodes) {
        if (
          activeElement.title === node.accessibleTitle &&
          activeElement.tabIndex === node.tabIndex
        ) {
          shadowDomFocusedId = id;
          break;
        }
      }
    }
    return Object.freeze({
      active: this.accessibilityRoot !== null,
      shadowDomActive: system.isActive,
      overlayNodeCount: this.accessibilityNodes.size,
      shadowDomNodeCount: shadowRoot?.children.length ?? 0,
      rootListenerCount: this.accessibilityClickListener === null ? 0 : 1,
      entityListenerCount: 0,
      focusedId: this.accessibilityFocusedId,
      shadowDomFocusedId,
      destroyed: false,
    });
  }

  public bindRootInteractions(handlers: RootInteractionHandlers): () => void {
    this.assertAlive();
    this.interactionUnbind?.();
    const stage = this.application.stage;
    const pointerInput = (
      type: RootPointerInput['type'],
      event: FederatedPointerEvent,
    ): RootPointerInput => Object.freeze({
      type,
      screenX: event.global.x,
      screenY: event.global.y,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      timeMs: event.timeStamp,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    const pointerDown = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('down', event));
    };
    const pointerMove = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('move', event));
    };
    const pointerUp = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('up', event));
    };
    const pointerUpOutside = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('up-outside', event));
    };
    const pointerCancel = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('cancel', event));
    };
    const pointerLeave = (event: PointerEvent): void => {
      const bounds = this.canvas.getBoundingClientRect();
      const scaleX = bounds.width > 0 ? this.widthValue / bounds.width : 1;
      const scaleY = bounds.height > 0 ? this.heightValue / bounds.height : 1;
      handlers.pointer(Object.freeze({
        type: 'leave',
        screenX: (event.clientX - bounds.left) * scaleX,
        screenY: (event.clientY - bounds.top) * scaleY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        timeMs: event.timeStamp,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
    };
    // Pixi v8 forwards wheel through a passive native listener in Chromium.
    // Keep pointer input federated, but own one non-passive root canvas wheel
    // listener so preventing page scroll never emits a browser console error.
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      const bounds = this.canvas.getBoundingClientRect();
      const scaleX = bounds.width > 0 ? this.widthValue / bounds.width : 1;
      const scaleY = bounds.height > 0 ? this.heightValue / bounds.height : 1;
      handlers.wheel(
        (event.clientX - bounds.left) * scaleX,
        (event.clientY - bounds.top) * scaleY,
        event.deltaY,
      );
    };
    const contextMenu = (event: MouseEvent): void => {
      const bounds = this.canvas.getBoundingClientRect();
      const scaleX = bounds.width > 0 ? this.widthValue / bounds.width : 1;
      const scaleY = bounds.height > 0 ? this.heightValue / bounds.height : 1;
      if (handlers.contextMenu(
        (event.clientX - bounds.left) * scaleX,
        (event.clientY - bounds.top) * scaleY,
      )) {
        event.preventDefault();
      }
    };
    stage.on('pointerdown', pointerDown);
    stage.on('pointermove', pointerMove);
    stage.on('pointerup', pointerUp);
    stage.on('pointerupoutside', pointerUpOutside);
    stage.on('pointercancel', pointerCancel);
    this.canvas.addEventListener('wheel', wheel, { passive: false });
    this.canvas.addEventListener('pointerleave', pointerLeave);
    this.canvas.addEventListener('contextmenu', contextMenu);
    const unbind = (): void => {
      stage.off('pointerdown', pointerDown);
      stage.off('pointermove', pointerMove);
      stage.off('pointerup', pointerUp);
      stage.off('pointerupoutside', pointerUpOutside);
      stage.off('pointercancel', pointerCancel);
      this.canvas.removeEventListener('wheel', wheel);
      this.canvas.removeEventListener('pointerleave', pointerLeave);
      this.canvas.removeEventListener('contextmenu', contextMenu);
      if (this.interactionUnbind === unbind) this.interactionUnbind = null;
    };
    this.interactionUnbind = unbind;
    return unbind;
  }

  public interactionOwnershipProbe(): Readonly<{
    readonly rootBindingCount: number;
    readonly rootListenerCount: number;
    readonly entityCallbackCount: number;
  }> {
    return Object.freeze({
      rootBindingCount: this.interactionUnbind === null ? 0 : 6,
      rootListenerCount: this.interactionUnbind === null ? 0 : 8,
      entityCallbackCount: 0,
    });
  }

  public publicSurfaceProbe(): PixiCoreV2PublicSurfaceProbe {
    const stage = this.application.stage;
    const roles: readonly CoreV2RenderLaneRole[] = [
      'background-geometry',
      'background-assets',
      'ordinary-geometry',
      'relations-dynamic',
      'content-assets',
      'text',
      'interaction-overlay',
    ];
    return Object.freeze({
      rendererLibrary: 'pixi.js-v8',
      rendererVersion: VERSION,
      backend: activeRendererBackend(this.application),
      applicationInitialized: this.application.renderer !== undefined,
      manualRender: true,
      canvas: Object.freeze({
        authoritative: this.application.canvas === this.canvas,
        attached: this.target?.contains(this.canvas) ?? this.canvas.isConnected,
        patchMapCore: this.canvas.dataset.patchMapCore === 'v2' ? 'v2' : null,
      }),
      stage: Object.freeze({
        label: stage.label,
        authoritative: stage.children.includes(this.world) && this.world.parent === stage,
        discoverableByDevTools: pixiDevtoolsOwnsApplication(this.application),
        worldAttached: stage.children.includes(this.world) && this.world.parent === stage,
        childCount: stage.children.length,
      }),
      aggregateLayers: Object.freeze(roles.map((role) => {
        const lane = this.lastLaneProbe[role];
        return Object.freeze({
          role,
          label: lane.label,
          renderObjectCount: lane.renderObjectCount,
          visiblePrimitiveCount: lane.visiblePrimitiveCount,
        });
      })),
    });
  }

  public rendererLossProbe(): PixiCoreV2RendererLossProbe {
    if (this.destroyedValue) {
      return Object.freeze({
        backend: this.activeBackend,
        webGLVersion: this.initialWebGLVersion,
        state: 'destroyed',
        contextLost: false,
        lossEventCount: this.rendererLossEventCount,
        restorationEventCount: this.rendererRestorationEventCount,
        recoveredFrameCount: this.recoveredRendererFrameCount,
        listenerCount: 0,
        lastLossFrame: this.lastRendererLossFrame,
        lastRecoveryFrame: this.lastRendererRecoveryFrame,
        destroyed: true,
      });
    }
    const context = publicGlContext(this.application);
    const contextLost = context?.isLost === true;
    return Object.freeze({
      backend: this.activeBackend,
      webGLVersion: context?.webGLVersion ?? this.initialWebGLVersion,
      state: contextLost ? 'lost' : this.rendererLossState,
      contextLost,
      lossEventCount: this.rendererLossEventCount,
      restorationEventCount: this.rendererRestorationEventCount,
      recoveredFrameCount: this.recoveredRendererFrameCount,
      listenerCount: this.contextLossUnbind === null ? 0 : 2,
      lastLossFrame: this.lastRendererLossFrame,
      lastRecoveryFrame: this.lastRendererRecoveryFrame,
      destroyed: false,
    });
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
    this.lastInvalidation = 'renderer-context-lost';
    context.forceContextLoss();
    return true;
  }

  public debugSnapshot(): PixiCoreV2RendererDebug {
    return this.destroyedValue ? Object.freeze({ ...this.lastDebug, destroyed: true }) : this.lastDebug;
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyAccessibilityOverlay();
    this.accessibilityActivationListener = null;
    this.destroyedValue = true;
    this.rendererLossState = 'destroyed';
    this.contextLossUnbind?.();
    this.contextLossUnbind = null;
    if (this.devtoolsRegistered) {
      unregisterPixiDevtools(this.devtoolsToken);
      this.devtoolsRegistered = false;
    }
    this.lastLaneProbe = freezeLaneSnapshot([
      ['background-geometry', this.backgroundGeometryLane.label],
      ['background-assets', this.leaves.backgroundAssetContainer.label],
      ['ordinary-geometry', this.aggregate.container.label],
      ['relations-dynamic', this.aggregate.container.label],
      ['content-assets', this.leaves.contentAssetContainer.label],
      ['text', this.leaves.textContainer.label],
      ['interaction-overlay', interactionOverlayLabel(this.selectionOverlay, this.transformerOverlay)],
    ]);
    this.interactionUnbind?.();
    this.interactionUnbind = null;
    this.selectedSlots.clear();
    this.visibleOverlaySlots.clear();
    this.transformerOverlaySlots.clear();
    this.resizableOverlaySlots.clear();
    this.interactionOverlayPolicy = DEFAULT_INTERACTION_OVERLAY_POLICY;
    this.application.stage.removeChild(this.world);
    this.world.removeChildren();
    this.aggregate.destroy();
    if (!(this.aggregate instanceof AggregateMeshLayer)) {
      this.backgroundGeometryLane.destroy();
    }
    this.selectionOverlay.destroy();
    this.transformerOverlay.destroy();
    this.cleanupPromise = this.leaves.destroy();
    this.world.destroy();
    this.application.destroy({ removeView: false }, { children: true });
    this.canvas.remove();
    this.lastStore = null;
    this.lastSourceStore = null;
    this.presentationPolicy = null;
    this.presentationStore = null;
    this.presentationBaseStore = null;
    this.pendingRanges = [];
    this.pendingOverlayRanges = [];
    this.pendingProjectionTransformOnly = false;
    this.selectedSlots.clear();
    this.relationSlotsByEndpoint = new Map();
    this.relationSlots.clear();
    this.relationEndpointsBySlot = new Map();
    this.entityIdBySlot.clear();
    this.slotByEntityId.clear();
    this.textEntityIdBySlot.clear();
    this.textVisibilityByEntityId.clear();
    this.staleProjectionEntityIds = new Set();
    this.uprightFrameCache.frames.clear();
    this.uprightFrameCache.index = null;
    this.uprightFrameCache.revision = -1;
    this.textProjectionSynchronizedRevision = -1;
    this.lastRenderedTextProjectionRevision = null;
    this.lastRenderedTextStoreRevision = null;
    this.lastDebug = Object.freeze({ ...this.lastDebug, destroyed: true });
    return true;
  }

  public async whenDestroyed(): Promise<void> {
    await this.cleanupPromise;
  }

  private ensureAccessibilityRoot(): void {
    if (this.accessibilityRoot !== null) return;
    const root = new Container({
      label: 'PATCH MAP Core v2 / accessibility overlay',
    });
    root.eventMode = 'static';
    root.interactiveChildren = true;
    root.accessible = false;
    root.accessibleChildren = true;
    const click = (event: FederatedPointerEvent): void => {
      const targetId = this.accessibilityIdByNode.get(
        event.target as Container,
      );
      if (targetId === undefined) return;
      this.accessibilityFocusedId = targetId;
      this.accessibilityActivationSequence =
        this.accessibilityActivationSequence === Number.MAX_SAFE_INTEGER
          ? 1
          : this.accessibilityActivationSequence + 1;
      this.accessibilityActivationListener?.(
        targetId,
        Object.freeze({
          source: 'pixi-click-alias',
          activationId:
            `pixi:${targetId}:${this.accessibilityActivationSequence}`,
        }),
      );
    };
    root.on('click', click);
    this.accessibilityClickListener = click;
    this.accessibilityRoot = root;
    this.application.stage.addChild(root);
  }

  private destroyAccessibilityOverlay(): void {
    const root = this.accessibilityRoot;
    if (root === null) {
      this.application.stage.interactiveChildren = false;
      const accessibility = this.application.renderer.accessibility;
      if (accessibility.isActive) {
        accessibility.setAccessibilityEnabled(false);
      }
      return;
    }
    if (this.accessibilityClickListener !== null) {
      root.off('click', this.accessibilityClickListener);
    }
    this.accessibilityClickListener = null;
    if (root.parent !== null) root.parent.removeChild(root);
    for (const child of root.removeChildren()) child.destroy();
    root.destroy();
    this.accessibilityRoot = null;
    this.accessibilityNodes.clear();
    this.accessibilityIdByNode.clear();
    this.accessibilityFocusedId = null;
    this.application.stage.interactiveChildren = false;
    const accessibility = this.application.renderer.accessibility;
    if (accessibility.isActive) {
      accessibility.setAccessibilityEnabled(false);
    }
  }

  private syncAggregate(
    store: RenderStoreView,
    ranges: readonly SlotRange[] | undefined,
    projectionTransformOnly = false,
  ): AggregateResult {
    if (this.aggregate instanceof AggregateMeshLayer) {
      const debug = this.aggregate.sync(store, {
        fullRebuildEpoch: this.storeEpoch,
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
      fullRebuildEpoch: this.storeEpoch,
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

  private syncTextVisibility(
    store: RenderStoreView,
    ranges: readonly SlotRange[] | undefined,
  ): void {
    const slots = ranges === undefined
      ? Array.from({ length: store.capacity }, (_value, slot) => slot)
      : slotsForRanges(store.capacity, ranges);
    if (ranges === undefined) {
      this.textEntityIdBySlot.clear();
      this.textVisibilityByEntityId.clear();
    }
    for (const slot of slots) {
      const previousEntityId = this.textEntityIdBySlot.get(slot);
      if (previousEntityId !== undefined) {
        this.textEntityIdBySlot.delete(slot);
        this.textVisibilityByEntityId.delete(previousEntityId);
      }
      if (store.alive[slot] !== 1 || store.kind[slot] !== RenderKind.Text) continue;
      const entityId = store.ids[slot];
      if (!entityId) continue;
      this.textEntityIdBySlot.set(slot, entityId);
      this.textVisibilityByEntityId.set(
        entityId,
        ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0,
      );
    }
  }

  private syncEntitySlots(
    store: RenderStoreView,
    ranges: readonly SlotRange[] | undefined,
  ): void {
    const slots = ranges === undefined
      ? Array.from({ length: store.capacity }, (_value, slot) => slot)
      : slotsForRanges(store.capacity, ranges);
    if (ranges === undefined) {
      this.entityIdBySlot.clear();
      this.slotByEntityId.clear();
    }
    for (const slot of slots) {
      const previousEntityId = this.entityIdBySlot.get(slot);
      if (previousEntityId !== undefined) {
        this.entityIdBySlot.delete(slot);
        if (this.slotByEntityId.get(previousEntityId) === slot) {
          this.slotByEntityId.delete(previousEntityId);
        }
      }
      if ((store.alive[slot] ?? 0) !== 1) continue;
      const entityId = store.ids[slot];
      if (entityId === undefined) continue;
      this.entityIdBySlot.set(slot, entityId);
      this.slotByEntityId.set(entityId, slot);
    }
  }

  private syncSelectionOverlay(
    store: RenderStoreView,
    fullRebuild: boolean,
    ranges: readonly SlotRange[] | undefined,
  ): void {
    let changed = fullRebuild || ranges === undefined;
    const slots = fullRebuild || ranges === undefined
      ? Array.from({ length: store.capacity }, (_, slot) => slot)
      : slotsForRanges(store.capacity, ranges);
    for (const slot of slots) {
      const before = this.selectedSlots.has(slot);
      const selected =
        store.alive[slot] === 1 &&
        ((store.flags[slot] ?? 0) & RenderFlags.Selected) !== 0 &&
        store.kind[slot] !== RenderKind.Relation;
      if (selected) this.selectedSlots.add(slot);
      else this.selectedSlots.delete(slot);
      if (before !== selected || (selected && !fullRebuild)) changed = true;
    }
    if (!changed) return;
    const policy = this.interactionOverlayPolicy;
    const visibleIds = policy.visibleEntityIds === null
      ? null
      : new Set(policy.visibleEntityIds);
    const transformableIds = policy.transformableEntityIds === null
      ? null
      : new Set(policy.transformableEntityIds);
    const resizableIds = policy.resizableEntityIds === null
      ? null
      : new Set(policy.resizableEntityIds);
    this.visibleOverlaySlots.clear();
    this.transformerOverlaySlots.clear();
    this.resizableOverlaySlots.clear();
    if (!policy.hidden) {
      for (const slot of this.selectedSlots) {
        const id = store.ids[slot];
        if (!id || (visibleIds !== null && !visibleIds.has(id))) continue;
        this.visibleOverlaySlots.add(slot);
        if (transformableIds === null || transformableIds.has(id)) {
          this.transformerOverlaySlots.add(slot);
        }
        if (resizableIds === null || resizableIds.has(id)) {
          this.resizableOverlaySlots.add(slot);
        }
      }
    }
    this.selectionOverlay.clear();
    this.transformerOverlay.clear();
    const overlayVertices = resolveAggregateOverlayVertices(
      store,
      [...this.visibleOverlaySlots].sort((left, right) => left - right),
      this.projectionContext(),
    );
    if (overlayVertices !== null) {
      appendOverlayOutline(this.selectionOverlay, overlayVertices);
      if (this.resizableOverlaySlots.size > 0) {
        appendOverlayHandles(
          this.transformerOverlay,
          overlayVertices,
          policy.handleCssPx / Math.max(this.view.scale, 0.001),
        );
      }
    }
    if (this.visibleOverlaySlots.size > 0) {
      this.selectionOverlay.stroke({
        color: 0x2f80ed,
        width: policy.strokeCssPx / Math.max(this.view.scale, 0.001),
        alpha: 1,
      });
    }
    if (this.resizableOverlaySlots.size > 0) {
      this.transformerOverlay.fill({ color: 0xffffff, alpha: 1 });
      this.transformerOverlay.stroke({
        color: 0x2f80ed,
        width: policy.strokeCssPx / Math.max(this.view.scale, 0.001),
        alpha: 1,
      });
    }
    this.selectionOverlay.label =
      `PATCH MAP Core v2 / selection overlay (${this.visibleOverlaySlots.size})`;
    this.transformerOverlay.label =
      `PATCH MAP Core v2 / transformer overlay (${this.transformerOverlaySlots.size})`;
  }

  private emptyDebug(): PixiCoreV2RendererDebug {
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
      lastInvalidation: this.lastInvalidation,
      destroyed: false,
    });
  }

  private emptyLaneProbe(): CoreV2RenderLaneSnapshot {
    return freezeLaneSnapshot([
      ['background-geometry', this.backgroundGeometryLane.label],
      ['background-assets', this.leaves.backgroundAssetContainer.label],
      ['ordinary-geometry', this.aggregate.container.label],
      ['relations-dynamic', this.aggregate.container.label],
      ['content-assets', this.leaves.contentAssetContainer.label],
      ['text', this.leaves.textContainer.label],
      ['interaction-overlay', interactionOverlayLabel(this.selectionOverlay, this.transformerOverlay)],
    ]);
  }

  private buildLaneProbe(overlayCount: number): CoreV2RenderLaneSnapshot {
    const leaves = this.leaves.renderLaneProbe();
    let backgroundGeometry: CoreV2RenderLaneProbe;
    let ordinaryGeometry: CoreV2RenderLaneProbe;
    let relationsDynamic: CoreV2RenderLaneProbe;
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
        interactionOverlayLabel(this.selectionOverlay, this.transformerOverlay),
        overlayCount,
        this.selectedSlots.size * 2,
      ),
    });
  }

  private projectionContext(): CoreV2ProjectionRenderContext {
    return Object.freeze({
      index: this.projectionIndex,
      revision: this.projectionRevision,
      world: this.worldOrientation,
      staleEntityIds: this.staleProjectionEntityIds,
      uprightFrameCache: this.uprightFrameCache,
    });
  }

  private applyWorldTransform(): void {
    const [a, b, c, d] = createCoreV2WorldAffine(this.worldOrientation);
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

  private bindRendererLossEvents(): void {
    if (activeRendererBackend(this.application) !== 'webgl2') return;
    const lost = (event: Event): void => {
      event.preventDefault();
      if (this.destroyedValue) return;
      this.rendererLossEventCount += 1;
      this.rendererLossState = 'lost';
      this.lastRendererLossFrame = this.frame;
      this.lastInvalidation = 'renderer-context-lost';
    };
    const restored = (): void => {
      if (this.destroyedValue) return;
      this.rendererRestorationEventCount += 1;
      this.rendererLossState = 'restored-pending-frame';
      this.lastInvalidation = 'renderer-context-restored';
    };
    this.canvas.addEventListener('webglcontextlost', lost);
    this.canvas.addEventListener('webglcontextrestored', restored);
    this.contextLossUnbind = () => {
      this.canvas.removeEventListener('webglcontextlost', lost);
      this.canvas.removeEventListener('webglcontextrestored', restored);
    };
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('PixiCoreV2Renderer is destroyed');
  }
}

function resolveAggregateOverlayVertices(
  store: RenderStoreView,
  slots: readonly number[],
  projectionContext: CoreV2ProjectionRenderContext,
): readonly number[] | null {
  const quads = slots.flatMap((slot) => {
    const quad = resolveCoreV2SlotQuad(store, slot, projectionContext);
    return quad.width > 0 && quad.height > 0 ? [quad] : [];
  });
  if (quads.length === 0) return null;
  if (quads.length === 1) return Object.freeze([...quads[0]!.vertices]);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const quad of quads) {
    for (let index = 0; index < quad.vertices.length; index += 2) {
      const x = quad.vertices[index];
      const y = quad.vertices[index + 1];
      if (x === undefined || y === undefined) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Object.freeze([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
}

function appendOverlayOutline(
  graphics: Graphics,
  vertices: readonly number[],
): void {
  const firstX = vertices[0];
  const firstY = vertices[1];
  if (firstX === undefined || firstY === undefined) return;
  graphics.moveTo(firstX, firstY);
  for (let index = 2; index < vertices.length; index += 2) {
    graphics.lineTo(vertices[index]!, vertices[index + 1]!);
  }
  graphics.closePath();
}

function appendOverlayHandles(
  graphics: Graphics,
  vertices: readonly number[],
  size: number,
): void {
  const half = size / 2;
  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index];
    const y = vertices[index + 1];
    if (x === undefined || y === undefined) continue;
    graphics.rect(x - half, y - half, size, size);
  }
}

function interactionOverlayLabel(selection: Graphics, transformer: Graphics): string {
  return `${selection.label} + ${transformer.label}`;
}

function slotsForRanges(capacity: number, ranges: readonly SlotRange[]): readonly number[] {
  const slots: number[] = [];
  for (const range of ranges) {
    const start = Math.max(0, Math.min(capacity, range.start));
    const end = Math.max(start, Math.min(capacity, range.end));
    for (let slot = start; slot < end; slot += 1) slots.push(slot);
  }
  return slots;
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function normalizeInteractionOverlayPolicy(
  policy: CoreV2InteractionOverlayPolicy,
): CoreV2InteractionOverlayPolicy {
  const visibleEntityIds = policy.visibleEntityIds === null
    ? null
    : freezeEntityIds(policy.visibleEntityIds, 'visibleEntityIds');
  const transformableEntityIds = policy.transformableEntityIds === null
    ? null
    : freezeEntityIds(policy.transformableEntityIds, 'transformableEntityIds');
  return Object.freeze({
    visibleEntityIds,
    transformableEntityIds,
    resizableEntityIds: policy.resizableEntityIds === null
      ? null
      : freezeEntityIds(policy.resizableEntityIds, 'resizableEntityIds'),
    hidden: policy.hidden,
    handleCssPx: positive(policy.handleCssPx, 'handleCssPx'),
    strokeCssPx: positive(policy.strokeCssPx, 'strokeCssPx'),
  });
}

function sameInteractionOverlayPolicy(
  left: CoreV2InteractionOverlayPolicy,
  right: CoreV2InteractionOverlayPolicy,
): boolean {
  return left.hidden === right.hidden &&
    left.handleCssPx === right.handleCssPx &&
    left.strokeCssPx === right.strokeCssPx &&
    sameNullableStringArray(left.visibleEntityIds, right.visibleEntityIds) &&
    sameNullableStringArray(left.transformableEntityIds, right.transformableEntityIds) &&
    sameNullableStringArray(left.resizableEntityIds, right.resizableEntityIds);
}

function sameNullableStringArray(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  return left === null || right === null
    ? left === right
    : sameStringArray(left, right);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function freezeEntityIds(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return Object.freeze([...new Set(values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  }))]);
}

function normalizePresentationPolicy(
  policy: CoreV2ResolvedPresentationPolicy,
): CoreV2ResolvedPresentationPolicy {
  if (!Number.isSafeInteger(policy.revision) || policy.revision < 1) {
    throw new RangeError('presentation policy revision must be a positive safe integer');
  }
  if (
    !Number.isFinite(policy.deEmphasisAlpha) ||
    policy.deEmphasisAlpha < 0 ||
    policy.deEmphasisAlpha > 1
  ) {
    throw new RangeError('presentation deEmphasisAlpha must be between zero and one');
  }
  return Object.freeze({
    revision: policy.revision,
    highlightedEntityIds: policy.highlightedEntityIds === null
      ? null
      : freezePresentationIds(policy.highlightedEntityIds, 'highlightedEntityIds'),
    deEmphasisAlpha: policy.deEmphasisAlpha,
    hiddenEntityIds: freezePresentationIds(policy.hiddenEntityIds, 'hiddenEntityIds'),
    fillOverrides: freezePresentationFillOverrides(policy.fillOverrides),
  });
}

function freezePresentationFillOverrides(
  values: CoreV2ResolvedPresentationPolicy['fillOverrides'],
): CoreV2ResolvedPresentationPolicy['fillOverrides'] {
  if (!Array.isArray(values as unknown)) {
    throw new TypeError('fillOverrides must be an array');
  }
  const seen = new Set<string>();
  return Object.freeze(values.map((value, index) => {
    if (value === null || typeof value !== 'object') {
      throw new TypeError(`fillOverrides[${index}] must be an object`);
    }
    if (typeof value.id !== 'string' || value.id.length === 0) {
      throw new TypeError(`fillOverrides[${index}].id must be a non-empty string`);
    }
    if (seen.has(value.id)) {
      throw new RangeError(`fillOverrides contains duplicate id ${value.id}`);
    }
    if (
      !Number.isSafeInteger(value.packedColor) ||
      value.packedColor < 0 ||
      value.packedColor > 0xffffffff
    ) {
      throw new RangeError(
        `fillOverrides[${index}].packedColor must be a packed RGBA integer`,
      );
    }
    seen.add(value.id);
    return Object.freeze({ id: value.id, packedColor: value.packedColor >>> 0 });
  }).sort((left, right) => left.id.localeCompare(right.id)));
}

function freezePresentationIds(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const result = values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  });
  return Object.freeze([...new Set(result)].sort());
}

function samePresentationPolicy(
  left: CoreV2ResolvedPresentationPolicy | null,
  right: CoreV2ResolvedPresentationPolicy | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return left.revision === right.revision &&
    left.deEmphasisAlpha === right.deEmphasisAlpha &&
    sameOptionalStringArray(left.highlightedEntityIds, right.highlightedEntityIds) &&
    sameOrderedStrings(left.hiddenEntityIds, right.hiddenEntityIds) &&
    samePresentationFillOverrides(left.fillOverrides, right.fillOverrides);
}

function samePresentationFillOverrides(
  left: CoreV2ResolvedPresentationPolicy['fillOverrides'],
  right: CoreV2ResolvedPresentationPolicy['fillOverrides'],
): boolean {
  return left.length === right.length && left.every((value, index) =>
    value.id === right[index]?.id && value.packedColor === right[index]?.packedColor
  );
}

function sameOptionalStringArray(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  return left === null || right === null
    ? left === right
    : sameOrderedStrings(left, right);
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function projectionStalenessChangedRanges(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
  slotByEntityId: ReadonlyMap<string, number>,
): SlotRange[] {
  const slots: number[] = [];
  for (const entityId of previous) {
    if (next.has(entityId)) continue;
    const slot = slotByEntityId.get(entityId);
    if (slot !== undefined) slots.push(slot);
  }
  for (const entityId of next) {
    if (previous.has(entityId)) continue;
    const slot = slotByEntityId.get(entityId);
    if (slot !== undefined) slots.push(slot);
  }
  return contiguousRanges(slots);
}

function mergeRanges(left: readonly SlotRange[], right: readonly SlotRange[]): SlotRange[] {
  const sorted = [...left, ...right]
    .filter(({ start, end }) => Number.isInteger(start) && Number.isInteger(end) && end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: SlotRange[] = [];
  for (const range of sorted) {
    const previous = result.at(-1);
    if (previous && range.start <= previous.end) {
      result[result.length - 1] = { start: previous.start, end: Math.max(previous.end, range.end) };
    } else {
      result.push({ start: range.start, end: range.end });
    }
  }
  return result;
}

function freezeRendererTextSemanticSignatures(
  signatures: CoreV2TextSemanticSignatures,
): CoreV2TextSemanticSignatures {
  return Object.freeze({
    content: signatures.content,
    style: signatures.style,
    layout: signatures.layout,
  });
}

function freezeRendererTextAttachedSignatures(
  signatures: CoreV2TextAttachedSignatures,
): CoreV2TextAttachedSignatures {
  return Object.freeze({
    content: signatures.content,
    style: signatures.style,
    layout: signatures.layout,
    renderer: signatures.renderer,
  });
}

function freezeRendererTextProbe(probe: CoreV2TextRendererProbe): CoreV2TextRendererProbe {
  return Object.freeze({
    ...probe,
    semanticSignatures: freezeRendererTextSemanticSignatures(probe.semanticSignatures),
    attachedSignatures: probe.attachedSignatures === null
      ? null
      : freezeRendererTextAttachedSignatures(probe.attachedSignatures),
    lastRenderedSignatures: probe.lastRenderedSignatures === null
      ? null
      : freezeRendererTextAttachedSignatures(probe.lastRenderedSignatures),
  });
}

function sameRendererTextSemanticSignatures(
  semantic: CoreV2TextSemanticSignatures,
  attached: CoreV2TextAttachedSignatures | null,
): boolean {
  return attached !== null &&
    semantic.content === attached.content &&
    semantic.style === attached.style &&
    semantic.layout === attached.layout;
}

function sameRendererTextAttachedSignatures(
  left: CoreV2TextAttachedSignatures | null,
  right: CoreV2TextAttachedSignatures | null,
): boolean {
  return left === right || (
    left !== null &&
    right !== null &&
    left.content === right.content &&
    left.style === right.style &&
    left.layout === right.layout &&
    left.renderer === right.renderer
  );
}

function sameView(left: CoreView, right: CoreView): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    (left.rotation ?? 0) === (right.rotation ?? 0)
  );
}

function sameWorldOrientation(left: CoreV2WorldOrientation, right: CoreV2WorldOrientation): boolean {
  return left.rotationDegrees === right.rotationDegrees &&
    left.flipX === right.flipX &&
    left.flipY === right.flipY;
}

export function projectionChangedRanges(
  store: RenderStoreView,
  before: CoreV2ProjectionIndex,
  after: CoreV2ProjectionIndex,
): SlotRange[] {
  const slots: number[] = [];
  const changedEndpointIds = new Set<string>();
  for (let slot = 0; slot < store.capacity; slot += 1) {
    const id = store.ids[slot];
    if (!id) continue;
    const entityChanged = before.byEntityId[id] !== after.byEntityId[id] &&
      JSON.stringify(before.byEntityId[id]) !== JSON.stringify(after.byEntityId[id]);
    const relationChanged = before.relationsByEntityId?.[id] !== after.relationsByEntityId?.[id] &&
      JSON.stringify(before.relationsByEntityId?.[id]) !==
        JSON.stringify(after.relationsByEntityId?.[id]);
    const imageChanged = before.imagesByEntityId?.[id] !== after.imagesByEntityId?.[id] &&
      JSON.stringify(before.imagesByEntityId?.[id]) !==
        JSON.stringify(after.imagesByEntityId?.[id]);
    const componentChanged =
      before.componentsByEntityId?.[id] !== after.componentsByEntityId?.[id] &&
      JSON.stringify(before.componentsByEntityId?.[id]) !==
        JSON.stringify(after.componentsByEntityId?.[id]);
    const backgroundChanged =
      before.backgroundsByEntityId?.[id] !== after.backgroundsByEntityId?.[id] &&
      JSON.stringify(before.backgroundsByEntityId?.[id]) !==
        JSON.stringify(after.backgroundsByEntityId?.[id]);
    const textChanged = textProjectionChanged(
      before.textsByEntityId?.[id],
      after.textsByEntityId?.[id],
    );
    if (entityChanged) changedEndpointIds.add(id);
    if (
      entityChanged ||
      relationChanged ||
      imageChanged ||
      componentChanged ||
      backgroundChanged ||
      textChanged
    ) {
      slots.push(slot);
    }
  }
  if (changedEndpointIds.size > 0) {
    for (let slot = 0; slot < store.capacity; slot += 1) {
      const id = store.ids[slot];
      const relation = id ? after.relationsByEntityId?.[id] : undefined;
      if (
        relation &&
        (changedEndpointIds.has(relation.sourceId) || changedEndpointIds.has(relation.targetId))
      ) {
        slots.push(slot);
      }
    }
  }
  return contiguousRanges([...new Set(slots)].sort((left, right) => left - right));
}

function textProjectionChanged(
  before: CoreV2TextProjection | undefined,
  after: CoreV2TextProjection | undefined,
): boolean {
  if (before === after) return false;
  if (before === undefined || after === undefined) return true;
  return before.entityId !== after.entityId ||
    before.targetKind !== after.targetKind ||
    before.ownerId !== after.ownerId ||
    before.componentId !== after.componentId ||
    before.contentSignature !== after.contentSignature ||
    before.styleSignature !== after.styleSignature ||
    before.layoutSignature !== after.layoutSignature ||
    before.color !== after.color ||
    before.contentOrientation !== after.contentOrientation ||
    before.placement !== after.placement ||
    before.margin.top !== after.margin.top ||
    before.margin.right !== after.margin.right ||
    before.margin.bottom !== after.margin.bottom ||
    before.margin.left !== after.margin.left ||
    JSON.stringify(before.authoredStyle) !== JSON.stringify(after.authoredStyle);
}

function projectionOrientationRanges(
  store: RenderStoreView,
  index: CoreV2ProjectionIndex,
  orientation: 'follow-item' | 'upright',
): SlotRange[] {
  const slots: number[] = [];
  for (let slot = 0; slot < store.capacity; slot += 1) {
    const id = store.ids[slot];
    if (id && index.byEntityId[id]?.contentOrientation === orientation) slots.push(slot);
  }
  return contiguousRanges(slots);
}

function contiguousRanges(slots: readonly number[]): SlotRange[] {
  const ranges: SlotRange[] = [];
  for (const slot of slots) {
    const previous = ranges.at(-1);
    if (previous?.end === slot) {
      ranges[ranges.length - 1] = { start: previous.start, end: slot + 1 };
    } else {
      ranges.push({ start: slot, end: slot + 1 });
    }
  }
  return ranges;
}

/**
 * A relation can live in a different fixed Mesh chunk from either endpoint.
 * Expand endpoint dirtiness before layer synchronization so visibility and
 * geometry cannot leave a stale relation buffer even on injected stores that
 * report endpoint-only ranges.
 */
export function expandCoreV2RelationDependencyRanges(
  store: RenderStoreView,
  ranges: readonly SlotRange[],
  adjacency?: ReadonlyMap<number, readonly number[]>,
): SlotRange[] {
  if (ranges.length === 0) return [];
  const dirtySlots = new Set<number>();
  const dirtyEndpoints = new Set<number>();
  for (const range of ranges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      dirtySlots.add(slot);
      if ((store.kind[slot] as number) !== RenderKind.Relation) dirtyEndpoints.add(slot);
    }
  }
  if (dirtyEndpoints.size > 0 && adjacency) {
    for (const endpoint of dirtyEndpoints) {
      for (const relationSlot of adjacency.get(endpoint) ?? []) dirtySlots.add(relationSlot);
    }
  } else if (dirtyEndpoints.size > 0) {
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if (
        (store.alive[slot] as number) === 1 &&
        (store.kind[slot] as number) === RenderKind.Relation &&
        (
          dirtyEndpoints.has(store.relationFrom[slot] as number) ||
          dirtyEndpoints.has(store.relationTo[slot] as number)
        )
      ) {
        dirtySlots.add(slot);
      }
    }
  }
  return contiguousRanges([...dirtySlots].sort((left, right) => left - right));
}

export function buildCoreV2RelationAdjacency(store: RenderStoreView): Readonly<{
  byEndpoint: ReadonlyMap<number, readonly number[]>;
  relationSlots: Set<number>;
  endpointsByRelation: ReadonlyMap<number, readonly [number, number]>;
}> {
  const mutable = new Map<number, number[]>();
  const relationSlots = new Set<number>();
  const endpointsByRelation = new Map<number, readonly [number, number]>();
  for (let slot = 0; slot < store.capacity; slot += 1) {
    if (
      (store.alive[slot] as number) !== 1 ||
      (store.kind[slot] as number) !== RenderKind.Relation
    ) {
      continue;
    }
    relationSlots.add(slot);
    endpointsByRelation.set(slot, Object.freeze([
      store.relationFrom[slot] as number,
      store.relationTo[slot] as number,
    ]));
    const source = store.relationFrom[slot] as number;
    const target = store.relationTo[slot] as number;
    appendRelationAdjacency(mutable, source, slot);
    if (target !== source) appendRelationAdjacency(mutable, target, slot);
  }
  return Object.freeze({
    byEndpoint: new Map(
      [...mutable].map(([endpoint, slots]) => [endpoint, Object.freeze(slots)] as const),
    ),
    relationSlots,
    endpointsByRelation,
  });
}

function appendRelationAdjacency(
  adjacency: Map<number, number[]>,
  endpoint: number,
  relationSlot: number,
): void {
  if (endpoint < 0) return;
  const slots = adjacency.get(endpoint);
  if (slots === undefined) adjacency.set(endpoint, [relationSlot]);
  else slots.push(relationSlot);
}

function rangesTouchCoreV2RelationTopology(
  store: RenderStoreView,
  ranges: readonly SlotRange[],
  knownRelationSlots: ReadonlySet<number>,
  endpointsByRelation: ReadonlyMap<number, readonly [number, number]>,
): boolean {
  for (const range of ranges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      const currentlyRelation = (store.alive[slot] as number) === 1 &&
        (store.kind[slot] as number) === RenderKind.Relation;
      if (!knownRelationSlots.has(slot)) {
        if (currentlyRelation) return true;
        continue;
      }
      if (!currentlyRelation) return true;
      const previous = endpointsByRelation.get(slot);
      if (
        !previous ||
        previous[0] !== (store.relationFrom[slot] as number) ||
        previous[1] !== (store.relationTo[slot] as number)
      ) {
        return true;
      }
    }
  }
  return false;
}

function publicRenderer(application: Application): PixiPublicRendererSurface {
  return application.renderer as unknown as PixiPublicRendererSurface;
}

function publicGlContext(application: Application): PixiPublicGlContextSystem | null {
  return publicRenderer(application).context ?? null;
}

function activeRendererBackend(application: Application): CoreV2ActiveRendererBackend {
  const renderer = publicRenderer(application);
  const name = renderer.name ?? application.renderer.constructor.name;
  if (/webgpu/i.test(name)) return 'webgpu';
  if (/webgl|glrenderer/i.test(name)) {
    const version = renderer.context?.webGLVersion;
    return version === 2 ? 'webgl2' : version === 1 ? 'webgl1' : 'unknown';
  }
  return 'unknown';
}

function registerPixiDevtools(token: object, application: Application): void {
  const root = globalThis as PixiDevtoolsGlobal;
  if (DEVTOOLS_REGISTRATIONS.length === 0) {
    previousDevtoolsHandleWasPresent = Object.prototype.hasOwnProperty.call(
      root,
      '__PIXI_DEVTOOLS__',
    );
    previousDevtoolsHandle = root.__PIXI_DEVTOOLS__;
  }
  const registration = Object.freeze({
    token,
    handle: Object.freeze({ app: application }),
  });
  DEVTOOLS_REGISTRATIONS.push(registration);
  root.__PIXI_DEVTOOLS__ = registration.handle;
}

function unregisterPixiDevtools(token: object): void {
  const index = DEVTOOLS_REGISTRATIONS.findIndex((entry) => entry.token === token);
  if (index < 0) return;
  const [registration] = DEVTOOLS_REGISTRATIONS.splice(index, 1);
  const root = globalThis as PixiDevtoolsGlobal;
  if (root.__PIXI_DEVTOOLS__ !== registration?.handle) return;
  const next = DEVTOOLS_REGISTRATIONS.at(-1);
  if (next) {
    root.__PIXI_DEVTOOLS__ = next.handle;
    return;
  }
  if (previousDevtoolsHandleWasPresent) {
    Reflect.set(root, '__PIXI_DEVTOOLS__', previousDevtoolsHandle);
  } else {
    Reflect.deleteProperty(root, '__PIXI_DEVTOOLS__');
  }
  previousDevtoolsHandle = undefined;
  previousDevtoolsHandleWasPresent = false;
}

function pixiDevtoolsOwnsApplication(application: Application): boolean {
  return (globalThis as PixiDevtoolsGlobal).__PIXI_DEVTOOLS__?.app === application;
}

function backendName(application: Application): string {
  const name = publicRenderer(application).name ?? application.renderer.constructor.name;
  if (/webgpu/i.test(name)) return 'webgpu';
  if (/webgl|glrenderer/i.test(name)) return 'webgl';
  return name || 'unknown';
}

function packedRgb(value: number): number {
  return (value >>> 8) & 0xffffff;
}

function packedAlpha(value: number): number {
  return (value & 0xff) / 255;
}

function freezeLane(
  role: CoreV2RenderLaneRole,
  label: string,
  renderObjectCount: number,
  visiblePrimitiveCount: number,
): CoreV2RenderLaneProbe {
  return Object.freeze({ role, label, renderObjectCount, visiblePrimitiveCount });
}

function freezeLaneSnapshot(
  lanes: readonly (readonly [CoreV2RenderLaneRole, string])[],
): CoreV2RenderLaneSnapshot {
  const result = Object.create(null) as Record<CoreV2RenderLaneRole, CoreV2RenderLaneProbe>;
  for (const [role, label] of lanes) result[role] = freezeLane(role, label, 0, 0);
  return Object.freeze(result);
}

function validateAccessibilityRenderNode(
  node: CoreV2AccessibilityRenderNode,
): void {
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new TypeError('accessibility node ID must be non-empty');
  }
  if (
    typeof node.title !== 'string' ||
    node.title.length === 0 ||
    typeof node.hint !== 'string' ||
    typeof node.text !== 'string'
  ) {
    throw new TypeError('accessibility node text fields are invalid');
  }
  if (!Number.isSafeInteger(node.tabIndex) || node.tabIndex < 0) {
    throw new RangeError('accessibility tabIndex must be non-negative');
  }
  const [x, y, width, height] = node.screenBounds;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width < 0 ||
    height < 0
  ) {
    throw new RangeError('accessibility bounds must be finite and non-negative');
  }
}

function updateAccessibilityRectangle(
  container: Container,
  field: 'boundsArea' | 'hitArea',
  bounds: readonly [number, number, number, number],
): void {
  const current = field === 'boundsArea'
    ? container.boundsArea
    : container.hitArea;
  if (current instanceof Rectangle) {
    [current.x, current.y, current.width, current.height] = bounds;
    return;
  }
  const rectangle = new Rectangle(...bounds);
  if (field === 'boundsArea') container.boundsArea = rectangle;
  else container.hitArea = rectangle;
}

function positive(value: number, name: string): number {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
  return value;
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
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
