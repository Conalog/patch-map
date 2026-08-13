import 'pixi.js/prepare';
import 'pixi.js/accessibility';

import {
  Application,
  Container,
  Graphics,
  Matrix,
  Rectangle,
  type ApplicationOptions,
  type FederatedPointerEvent,
} from 'pixi.js';

import type { CoreView, SlotRange } from '../dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type CoreRenderer,
  type RendererFlushResult,
  type RenderStoreView,
} from '../dense/renderer-types';
import {
  AggregateLeafLayer,
  type PatchMapBitmapTextCapabilityRequest,
} from './leaf-layer';
import type {
  PatchMapSceneImageAssetBindingObservation as LeafAssetBindingObservation,
  PatchMapSceneImageAssetBindingProbe as LeafAssetBindingProbe,
  PatchMapSceneImageAssetBindingRequest as LeafAssetBindingRequest,
  PatchMapSceneImageLeafProbe as LeafSceneImageProbe,
} from '../scene-images/contracts';
import { AggregateMeshLayer } from './mesh-layer';
import { ParticleGraphicsLayer } from './particle-layer';
import type { PatchMapProjectionIndex } from '../contracts';
import type { PatchMapBitmapTextCapabilityProof } from '../semantic/text-render-route';
import {
  createPatchMapLeafAssetSession,
  type PatchMapAssetPolicy,
  type PatchMapAssetSession,
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
  PatchMapPixiPublicSurfaceProbe,
  PatchMapPixiRendererDebug,
  PatchMapPixiRendererLossProbe,
  RootInteractionHandlers,
  RootPointerInput,
} from './types';
import {
  createPatchMapProjectionQuadCache,
  createPatchMapWorldAffine,
  type PatchMapProjectionRenderContext,
  type PatchMapWorldOrientation,
} from './types';
import type {
  PatchMapRendererPresentationEntityProbe,
  PatchMapResolvedPresentationPolicy,
} from '../presentation-policy';
import type { PatchMapPresentationSlotVisibility } from '../presentation';
import {
  PatchMapPresentationStoreView,
  type PatchMapRendererEntityPresentationOverride,
} from './presentation-store';
import {
  registerPixiDevtools,
  unregisterPixiDevtools,
} from './pixi-devtools-registration';
import {
  buildPatchMapRelationAdjacency,
  contiguousRanges,
  expandPatchMapRelationDependencyRanges,
  mergeRanges,
  projectionChangedRanges,
  projectionOrientationRanges,
  projectionStalenessChangedRanges,
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
  readPatchMapPixiPublicSurfaceProbe,
  readPatchMapPixiRendererLossProbe,
} from './pixi-renderer/backend-public-surface';
import {
  appendOverlayHandles,
  appendOverlayOutline,
  DEFAULT_INTERACTION_OVERLAY_POLICY,
  interactionOverlayLabel,
  normalizeInteractionOverlayPolicy,
  resolveOverlayPathPlan,
  sameInteractionOverlayPolicy,
} from './pixi-renderer/interaction-overlay';
import {
  freezeRendererTextProbe,
  freezeRendererTextSemanticSignatures,
  normalizePresentationPolicy,
  samePresentationPolicy,
  sameRendererTextAttachedSignatures,
  sameRendererTextSemanticSignatures,
} from './pixi-renderer/presentation-values';
import {
  packedAlpha,
  packedRgb,
  positive,
  sameStringSet,
  sameView,
  sameWorldOrientation,
} from './pixi-renderer/value-atoms';
import type { PatchMapPixiRendererPublicationCheckpoint } from './pixi-renderer/publication-checkpoint';
import { PatchMapAccessibilityOverlayAuthority } from './pixi-renderer/accessibility-overlay-authority';

export {
  buildPatchMapRelationAdjacency,
  expandPatchMapRelationDependencyRanges,
  projectionChangedRanges,
} from './renderer-reconcile-ranges';
export type { PatchMapPixiRendererPublicationCheckpoint } from './pixi-renderer/publication-checkpoint';

export interface PatchMapPixiRendererOptions {
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly strategy?: PatchMapRendererStrategy;
  readonly preference?: PatchMapBackendPreference;
  readonly antialias?: boolean;
  readonly background?: number;
  readonly powerPreference?: 'high-performance' | 'low-power';
  /** Reject a WebGL renderer unless Pixi reports a live WebGL2 context. */
  readonly requireWebGL2?: boolean;
  /** Register this Application with the official PixiJS DevTools hook. */
  readonly devtools?: boolean;
  readonly assetSession?: PatchMapAssetSession;
  readonly assetPolicy?: PatchMapAssetPolicy;
  readonly resolveBitmapTextCapability?: (
    request: PatchMapBitmapTextCapabilityRequest,
  ) => PatchMapBitmapTextCapabilityProof | null;
}

export interface PatchMapPixiInitializationMetrics {
  readonly applicationInitMs: number;
  readonly rendererBuildMs: number;
}

export class PatchMapPixiRuntimeError extends Error {
  public readonly code: 'UNSUPPORTED_RUNTIME' | 'RENDERER_LOST';

  public constructor(
    code: 'UNSUPPORTED_RUNTIME' | 'RENDERER_LOST',
    message: string,
  ) {
    super(message);
    this.name = 'PatchMapPixiRuntimeError';
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
  readonly uploadObservation: PatchMapPixiRendererDebug['uploadObservation'];
}

const DEFAULT_VIEW: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
const DEFAULT_WORLD_ORIENTATION: PatchMapWorldOrientation = Object.freeze({
  rotationDegrees: 0,
  flipX: false,
  flipY: false,
});
const EMPTY_PROJECTION_INDEX: PatchMapProjectionIndex = Object.freeze({
  byEntityId: Object.freeze({}),
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
  private readonly selectionOverlay: Graphics;
  private readonly transformerOverlay: Graphics;
  private readonly accessibilityOverlay: PatchMapAccessibilityOverlayAuthority;
  private readonly selectedSlots = new Set<number>();
  private readonly visibleOverlaySlots = new Set<number>();
  private readonly transformerOverlaySlots = new Set<number>();
  private readonly resizableOverlaySlots = new Set<number>();
  private individualSelectionOutlineCount = 0;
  private groupSelectionOutlineVisible = false;
  private selectionOutlineCount = 0;
  private interactionOverlayPolicy = DEFAULT_INTERACTION_OVERLAY_POLICY;
  private selectionMarquee: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null = null;
  private readonly target: HTMLElement | undefined;
  private cleanupPromise: Promise<void> = Promise.resolve();
  private interactionUnbind: (() => void) | null = null;
  private lastStore: RenderStoreView | null = null;
  private lastSourceStore: RenderStoreView | null = null;
  private presentationPolicy: PatchMapResolvedPresentationPolicy | null = null;
  private instancePresentationOverrides: ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  > = new Map();
  private presentationStore: PatchMapPresentationStoreView | null = null;
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
  private projectionIndex: PatchMapProjectionIndex = EMPTY_PROJECTION_INDEX;
  private staleProjectionEntityIds: ReadonlySet<string> = new Set();
  private relationSlotsByEndpoint: ReadonlyMap<number, readonly number[]> = new Map();
  private relationSlots = new Set<number>();
  private relationEndpointsBySlot: ReadonlyMap<number, readonly [number, number]> = new Map();
  private projectionRevision = 0;
  private readonly projectionQuadCache = createPatchMapProjectionQuadCache();
  private textProjectionSynchronizedRevision = -1;
  private lastRenderedTextProjectionRevision: number | null = null;
  private lastRenderedTextStoreRevision: number | null = null;
  private readonly entityIdBySlot = new Map<number, string>();
  private readonly slotByEntityId = new Map<string, number>();
  private readonly textEntityIdBySlot = new Map<number, string>();
  private readonly textVisibilityByEntityId = new Map<string, boolean>();
  private worldOrientation: PatchMapWorldOrientation = DEFAULT_WORLD_ORIENTATION;
  private readonly worldMatrix = new Matrix();
  private lastInvalidation = 'init';
  private destroyedValue = false;
  private synchronizeOnly = false;
  private readonly devtoolsToken = Object.freeze({});
  private readonly activeBackend: PatchMapActiveRendererBackend;
  private readonly initialWebGLVersion: 1 | 2 | null;
  private devtoolsRegistered = false;
  private contextLossUnbind: (() => void) | null = null;
  private rendererLossState: PatchMapRendererLossState = 'healthy';
  private rendererLossEventCount = 0;
  private rendererRestorationEventCount = 0;
  private recoveredRendererFrameCount = 0;
  private lastRendererLossFrame: number | null = null;
  private lastRendererRecoveryFrame: number | null = null;
  private lastDebug: PatchMapPixiRendererDebug;
  private lastLaneProbe: PatchMapRenderLaneSnapshot;
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
    const leafSession = options.assetSession ?? createPatchMapLeafAssetSession(options.assetPolicy);
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
    this.selectionOverlay = new Graphics({ label: 'PatchMap / selection overlay (0)' });
    this.selectionOverlay.eventMode = 'none';
    this.selectionOverlay.zIndex = 1;
    this.transformerOverlay = new Graphics({ label: 'PatchMap / transformer overlay (0)' });
    this.transformerOverlay.eventMode = 'none';
    this.transformerOverlay.zIndex = 2;
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
      );
      this.world.addChild(
        this.aggregate.container,
        this.selectionOverlay,
        this.transformerOverlay,
      );
    } else {
      this.world.addChild(
        this.leaves.standaloneAssetContainer,
        this.backgroundGeometryLane,
        this.leaves.backgroundAssetContainer,
        this.aggregate.container,
        this.leaves.contentAssetContainer,
        this.leaves.textContainer,
        this.selectionOverlay,
        this.transformerOverlay,
      );
    }
    this.application.stage.label = 'PatchMap';
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
    this.canvas.dataset.patchMapProduct = 'patch-map';

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
    const previousIdle =
      this.pendingRanges !== undefined &&
      this.pendingRanges.length === 0;
    const barOnly =
      options.domain === 'bar-only' &&
      (previousIdle || this.pendingBarPresentationOnly);
    const textOnly =
      options.domain === 'text-only' &&
      (previousIdle || this.pendingTextOnly);
    const invalidatesProjectionTransform = options.fullRebuild || ranges.length > 0;
    const nextProjectionTransformOnly = invalidatesProjectionTransform
      ? false
      : this.pendingProjectionTransformOnly;
    const nextBarPresentationOnly = invalidatesProjectionTransform
      ? barOnly
      : this.pendingBarPresentationOnly;
    const nextTextOnly = invalidatesProjectionTransform
      ? textOnly
      : this.pendingTextOnly;
    // A view-only commit intentionally publishes an empty range after
    // setWorldOrientation(). Preserve the orientation fast-path promise in
    // that case; any actual scene mutation or full rebuild revokes it.
    if (options.fullRebuild) {
      this.barPresentationVisibilityConservative = true;
      const nextStoreEpoch = this.storeEpoch + 1;
      this.lastInvalidation = reason;
      this.pendingProjectionTransformOnly = nextProjectionTransformOnly;
      this.pendingBarPresentationOnly = nextBarPresentationOnly;
      this.pendingTextOnly = nextTextOnly;
      this.storeEpoch = nextStoreEpoch;
      this.pendingRanges = undefined;
      return;
    }
    const nextRanges = mergeRanges(this.pendingRanges ?? [], ranges);
    if (ranges.length > 0 && options.domain !== 'bar-only') {
      this.barPresentationVisibilityConservative = true;
    }
    this.lastInvalidation = reason;
    this.pendingProjectionTransformOnly = nextProjectionTransformOnly;
    this.pendingBarPresentationOnly = nextBarPresentationOnly;
    this.pendingTextOnly = nextTextOnly;
    this.pendingRanges = nextRanges;
  }

  public markOverlayChanges(ranges: readonly SlotRange[], reason: string): void {
    this.assertAlive();
    this.lastInvalidation = reason;
    this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], ranges);
  }

  public setInteractionOverlayPolicy(
    policy: PatchMapInteractionOverlayPolicy,
  ): boolean {
    this.assertAlive();
    const normalized = normalizeInteractionOverlayPolicy(policy);
    if (sameInteractionOverlayPolicy(this.interactionOverlayPolicy, normalized)) {
      return false;
    }
    this.interactionOverlayPolicy = normalized;
    if (this.lastStore !== null) {
      this.syncSelectionOverlay(this.lastStore, true, undefined);
    }
    this.pendingOverlayRanges = undefined;
    this.lastInvalidation = 'interaction-overlay-policy';
    return true;
  }

  /** Transient box gesture paint; intentionally absent from snapshots and probes. */
  public setSelectionMarquee(input: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null): boolean {
    this.assertAlive();
    const next = input === null ? null : normalizeSelectionMarquee(input);
    if (sameSelectionMarquee(this.selectionMarquee, next)) return false;
    this.selectionMarquee = next;
    if (this.lastStore !== null) this.drawInteractionOverlays(this.lastStore);
    this.lastInvalidation = 'selection-marquee';
    return true;
  }

  /**
   * Apply host presentation state without touching the authoritative dense
   * store. Policy changes intentionally rebuild aggregate batches once;
   * subsequent scene updates retain dirty-range synchronization.
   */
  public setPresentationPolicy(policy: PatchMapResolvedPresentationPolicy | null): boolean {
    this.assertAlive();
    const normalized = policy === null ? null : normalizePresentationPolicy(policy);
    if (samePresentationPolicy(this.presentationPolicy, normalized)) return false;
    const nextPresentationStore =
      (normalized === null && this.instancePresentationOverrides.size === 0) ||
      this.lastSourceStore === null
      ? null
      : new PatchMapPresentationStoreView(
          this.lastSourceStore,
          normalized,
          this.instancePresentationOverrides,
        );
    const nextPresentationBaseStore = nextPresentationStore === null
      ? null
      : this.lastSourceStore;
    this.presentationPolicy = normalized;
    this.presentationStore = nextPresentationStore;
    this.presentationBaseStore = nextPresentationBaseStore;
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

  /** @internal Publish sparse instance presentation values into aggregate columns. */
  public setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
    changedRanges?: readonly SlotRange[],
  ): boolean {
    this.assertAlive();
    this.instancePresentationOverrides = overrides;
    if (this.lastSourceStore !== null) {
      if (this.presentationStore === null) {
        if (overrides.size > 0 || this.presentationPolicy !== null) {
          this.presentationStore = new PatchMapPresentationStoreView(
            this.lastSourceStore,
            this.presentationPolicy,
            overrides,
          );
          this.presentationBaseStore = this.lastSourceStore;
          this.pendingRanges = undefined;
        }
      } else if (overrides.size === 0 && this.presentationPolicy === null) {
        this.presentationStore = null;
        this.presentationBaseStore = null;
        this.pendingRanges = undefined;
      } else {
        this.presentationStore.synchronize(
          this.lastSourceStore,
          this.presentationPolicy,
          changedRanges,
          overrides,
        );
        this.pendingRanges = changedRanges === undefined
          ? undefined
          : mergeRanges(this.pendingRanges ?? [], changedRanges);
      }
    }
    this.pendingOverlayRanges = changedRanges === undefined
      ? undefined
      : mergeRanges(this.pendingOverlayRanges ?? [], changedRanges);
    this.pendingProjectionTransformOnly = false;
    this.pendingBarPresentationOnly = false;
    this.pendingTextOnly = false;
    this.lastInvalidation = overrides.size === 0
      ? 'instance-presentation:clear'
      : 'instance-presentation';
    return true;
  }

  public presentationEntityProbe(
    entityId: string,
  ): PatchMapRendererPresentationEntityProbe | null {
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
    const slot = this.slotByEntityId.get(entityId);
    if (slot === undefined || (store.alive[slot] ?? 0) === 0) return null;
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
    index: PatchMapProjectionIndex,
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
    const nextPendingRanges = mergeRanges(this.pendingRanges ?? [], ranges);
    const nextPendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], ranges);
    const nextInvalidation = changedRanges === undefined
      ? 'projection'
      : 'presentation-projection';
    const nextProjectionRevision = this.projectionRevision + 1;
    this.projectionIndex = index;
    if (updateKind !== 'bar-presentation') {
      this.barPresentationVisibilityConservative = true;
    }
    this.pendingProjectionTransformOnly = false;
    this.staleProjectionEntityIds = nextStaleEntityIds;
    this.projectionRevision = nextProjectionRevision;
    this.pendingRanges = nextPendingRanges;
    this.pendingOverlayRanges = nextPendingOverlayRanges;
    this.pendingBarPresentationOnly = barPresentationOnly;
    this.pendingTextOnly = textOnly;
    this.lastInvalidation = nextInvalidation;
    return true;
  }

  public setWorldOrientation(world: PatchMapWorldOrientation): boolean {
    this.assertAlive();
    if (sameWorldOrientation(this.worldOrientation, world)) return false;
    this.worldOrientation = Object.freeze({ ...world });
    this.projectionRevision += 1;
    this.pendingBarPresentationOnly = false;
    this.pendingTextOnly = false;
    this.applyWorldTransform();
    this.barPresentationVisibilityStale = true;
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
    this.barPresentationVisibilityStale = true;
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
    if (scaleChanged || this.selectionMarquee !== null) this.pendingOverlayRanges = undefined;
    this.applyWorldTransform();
    this.barPresentationVisibilityStale = true;
    this.lastInvalidation = 'view';
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
    const viewChanged = this.setView(effectiveStore.view);
    if (
      storeReplaced ||
      this.pendingRanges === undefined ||
      rangesTouchPatchMapRelationTopology(
        store,
        this.pendingRanges,
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
    const stableBarPresentationFrame = barPresentationOnly && !viewChanged;
    const ranges = this.pendingRanges === undefined ||
      this.relationSlotsByEndpoint.size === 0 ||
      projectionTransformOnly
      ? this.pendingRanges
      : expandPatchMapRelationDependencyRanges(
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
    const leaves = this.leaves.sync(effectiveStore, {
      fullRebuildEpoch: this.storeEpoch,
      projectionContext: this.projectionContext(),
      ...(ranges === undefined
        ? {}
        : { changedRanges: barPresentationOnly ? [] : ranges }),
      ...(projectionTransformOnly ? { projectionTransformOnly: true } : {}),
    });
    // Bar presentation mutates only aggregate geometry. With a stable view,
    // object-backed image/text bounds are unchanged and retaining their last
    // cull result avoids an O(all leaves) scan on every animation frame.
    if (!stableBarPresentationFrame) {
      this.leaves.cull(this.worldMatrix, this.widthValue, this.heightValue);
    }
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
    this.world.label = `PatchMap / world (${effectiveStore.liveCount} entities)`;
    return Object.freeze({
      rendered,
      commandCount: this.lastDebug.aggregateRenderObjects,
    });
  }

  private presentationStoreFor(store: RenderStoreView): RenderStoreView {
    const policy = this.presentationPolicy;
    const overrides = this.instancePresentationOverrides;
    if (policy === null && overrides.size === 0) return store;
    if (
      this.presentationStore === null ||
      this.presentationBaseStore !== store ||
      this.presentationStore.capacity !== store.capacity
    ) {
      this.presentationStore = new PatchMapPresentationStoreView(store, policy, overrides);
      this.presentationBaseStore = store;
      return this.presentationStore;
    }
    this.presentationStore.synchronize(store, policy, this.pendingRanges, overrides);
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
      this.leaves.standaloneAssetContainer,
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

  public textRendererProbe(entityId: string): PatchMapTextRendererProbe | null {
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
    const visible = this.selectionOutlineCount > 0;
    return Object.freeze({
      order: Object.freeze(['selection', 'transformer'] as const),
      selection: visible,
      transformer: this.transformerOverlaySlots.size > 0,
      selectedEntityCount: this.visibleOverlaySlots.size,
      renderObjectCount: visible ? 2 : 0,
      displayMode: this.interactionOverlayPolicy.displayMode,
      individualOutlineCount: this.individualSelectionOutlineCount,
      groupOutline: this.groupSelectionOutlineVisible,
      outlineCount: this.selectionOutlineCount,
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
    this.interactionUnbind?.();
    const stage = this.application.stage;
    const capturedPointerIds = new Set<number>();
    const capturePointer = (pointerId: number): void => {
      try {
        this.canvas.setPointerCapture(pointerId);
        capturedPointerIds.add(pointerId);
      } catch {
        // Synthetic/non-active pointer input cannot be captured. Federated
        // pointerupoutside remains the fallback completion path.
      }
    };
    const releasePointer = (pointerId: number): void => {
      capturedPointerIds.delete(pointerId);
      try {
        if (this.canvas.hasPointerCapture(pointerId)) {
          this.canvas.releasePointerCapture(pointerId);
        }
      } catch {
        // The browser may implicitly release capture before this root cleanup.
      }
    };
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
      capturePointer(event.pointerId);
      handlers.pointer(pointerInput('down', event));
    };
    const pointerMove = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('move', event));
    };
    const pointerUp = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('up', event));
      releasePointer(event.pointerId);
    };
    const pointerUpOutside = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('up-outside', event));
      releasePointer(event.pointerId);
    };
    const pointerCancel = (event: FederatedPointerEvent): void => {
      handlers.pointer(pointerInput('cancel', event));
      releasePointer(event.pointerId);
    };
    const pointerLeave = (event: PointerEvent): void => {
      if (capturedPointerIds.has(event.pointerId)) return;
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
      for (const pointerId of capturedPointerIds) releasePointer(pointerId);
      capturedPointerIds.clear();
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

  public publicSurfaceProbe(): PatchMapPixiPublicSurfaceProbe {
    return readPatchMapPixiPublicSurfaceProbe(
      this.application,
      this.canvas,
      this.world,
      this.target,
      this.lastLaneProbe,
    );
  }

  public rendererLossProbe(): PatchMapPixiRendererLossProbe {
    return readPatchMapPixiRendererLossProbe(
      this.application,
      this.activeBackend,
      this.initialWebGLVersion,
      this.destroyedValue,
      this.rendererLossState,
      this.rendererLossEventCount,
      this.rendererRestorationEventCount,
      this.recoveredRendererFrameCount,
      this.contextLossUnbind,
      this.lastRendererLossFrame,
      this.lastRendererRecoveryFrame,
    );
  }

  /** @internal Capture exact load-side CPU publication state without touching Pixi/GPU state. */
  public capturePublicationCheckpoint(): PatchMapPixiRendererPublicationCheckpoint {
    if (this.destroyed) throw new Error('PatchMapPixiRenderer is destroyed');
    return Object.freeze({
      projectionIndex: this.projectionIndex,
      staleProjectionEntityIds: this.staleProjectionEntityIds,
      projectionRevision: this.projectionRevision,
      pendingRanges: this.pendingRanges,
      pendingOverlayRanges: this.pendingOverlayRanges,
      pendingProjectionTransformOnly: this.pendingProjectionTransformOnly,
      pendingBarPresentationOnly: this.pendingBarPresentationOnly,
      pendingTextOnly: this.pendingTextOnly,
      lastInvalidation: this.lastInvalidation,
      storeEpoch: this.storeEpoch,
      presentationPolicy: this.presentationPolicy,
      instancePresentationOverrides: this.instancePresentationOverrides,
      presentationStore: this.presentationStore,
      presentationBaseStore: this.presentationBaseStore,
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
    this.projectionIndex = checkpoint.projectionIndex;
    this.staleProjectionEntityIds = checkpoint.staleProjectionEntityIds;
    this.projectionRevision = checkpoint.projectionRevision;
    this.pendingRanges = checkpoint.pendingRanges;
    this.pendingOverlayRanges = checkpoint.pendingOverlayRanges;
    this.pendingProjectionTransformOnly = checkpoint.pendingProjectionTransformOnly;
    this.pendingBarPresentationOnly = checkpoint.pendingBarPresentationOnly;
    this.pendingTextOnly = checkpoint.pendingTextOnly;
    this.lastInvalidation = checkpoint.lastInvalidation;
    this.storeEpoch = checkpoint.storeEpoch;
    this.presentationPolicy = checkpoint.presentationPolicy;
    this.instancePresentationOverrides = checkpoint.instancePresentationOverrides;
    this.presentationStore = checkpoint.presentationStore;
    this.presentationBaseStore = checkpoint.presentationBaseStore;
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

  public debugSnapshot(): PatchMapPixiRendererDebug {
    return this.destroyedValue ? Object.freeze({ ...this.lastDebug, destroyed: true }) : this.lastDebug;
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.accessibilityOverlay.destroy();
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
    this.individualSelectionOutlineCount = 0;
    this.groupSelectionOutlineVisible = false;
    this.selectionOutlineCount = 0;
    this.interactionOverlayPolicy = DEFAULT_INTERACTION_OVERLAY_POLICY;
    this.selectionMarquee = null;
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
      const overlaySlots = policy.visibleEntityIds === null
        ? this.selectedSlots
        : policy.visibleEntityIds.flatMap((id) => {
            const slot = this.slotByEntityId.get(id);
            return slot === undefined ? [] : [slot];
          });
      for (const slot of overlaySlots) {
        const id = store.ids[slot];
        if (!id || store.alive[slot] !== 1) continue;
        this.visibleOverlaySlots.add(slot);
        if (transformableIds === null || transformableIds.has(id)) {
          this.transformerOverlaySlots.add(slot);
        }
        if (resizableIds === null || resizableIds.has(id)) {
          this.resizableOverlaySlots.add(slot);
        }
      }
    }
    this.drawInteractionOverlays(store);
  }

  private drawInteractionOverlays(store: RenderStoreView): void {
    const policy = this.interactionOverlayPolicy;
    this.selectionOverlay.clear();
    this.transformerOverlay.clear();
    const pathPlan = resolveOverlayPathPlan(
      store,
      [...this.visibleOverlaySlots].sort((left, right) => left - right),
      this.projectionContext(),
      policy.displayMode,
    );
    for (const vertices of pathPlan.selectionPaths) {
      appendOverlayOutline(this.selectionOverlay, vertices);
    }
    const overlayVertices = pathPlan.aggregateVertices;
    if (overlayVertices !== null) {
      if (this.resizableOverlaySlots.size > 0) {
        appendOverlayHandles(
          this.transformerOverlay,
          overlayVertices,
          policy.handleCssPx / Math.max(this.view.scale, 0.001),
        );
      }
    }
    this.individualSelectionOutlineCount = policy.displayMode === 'element-only'
      ? pathPlan.individualVertices.length
      : policy.displayMode === 'all'
        ? pathPlan.individualVertices.length
        : 0;
    this.groupSelectionOutlineVisible = policy.displayMode === 'group-only'
      ? overlayVertices !== null
      : policy.displayMode === 'all' && pathPlan.individualVertices.length > 1;
    this.selectionOutlineCount = pathPlan.selectionPaths.length;
    if (this.selectionOutlineCount > 0) {
      this.selectionOverlay.stroke({
        color: policy.color,
        width: policy.strokeCssPx / Math.max(this.view.scale, 0.001),
        alpha: 1,
      });
    }
    if (this.resizableOverlaySlots.size > 0) {
      this.transformerOverlay.fill({ color: 0xffffff, alpha: 1 });
      this.transformerOverlay.stroke({
        color: policy.color,
        width: policy.strokeCssPx / Math.max(this.view.scale, 0.001),
        alpha: 1,
      });
    }
    if (this.selectionMarquee !== null) {
      appendScreenMarquee(
        this.transformerOverlay,
        this.selectionMarquee,
        this.worldMatrix,
      );
      this.transformerOverlay.fill({ color: policy.color, alpha: 0.08 });
      this.transformerOverlay.stroke({
        color: policy.color,
        width: policy.strokeCssPx / Math.max(this.view.scale, 0.001),
        alpha: 1,
      });
    }
    this.selectionOverlay.label =
      `PatchMap / selection overlay (${this.visibleOverlaySlots.size})`;
    this.transformerOverlay.label =
      `PatchMap / transformer overlay (${this.transformerOverlaySlots.size})`;
  }

  private emptyDebug(): PatchMapPixiRendererDebug {
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

  private emptyLaneProbe(): PatchMapRenderLaneSnapshot {
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
        interactionOverlayLabel(this.selectionOverlay, this.transformerOverlay),
        overlayCount,
        this.selectedSlots.size * 2,
      ),
    });
  }

  private projectionContext(): PatchMapProjectionRenderContext {
    return Object.freeze({
      index: this.projectionIndex,
      revision: this.projectionRevision,
      world: this.worldOrientation,
      staleEntityIds: this.staleProjectionEntityIds,
      quadCache: this.projectionQuadCache,
    });
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
    if (this.destroyedValue) throw new Error('PatchMapPixiRenderer is destroyed');
  }
}

function normalizeSelectionMarquee(input: Readonly<{
  readonly start: readonly [number, number];
  readonly current: readonly [number, number];
}>): Readonly<{
  readonly start: readonly [number, number];
  readonly current: readonly [number, number];
}> {
  const point = (
    value: readonly [number, number],
    label: string,
  ): readonly [number, number] => {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
      throw new TypeError(`selection marquee ${label} must be a finite [x, y] tuple`);
    }
    return Object.freeze([value[0], value[1]] as const);
  };
  return Object.freeze({
    start: point(input.start, 'start'),
    current: point(input.current, 'current'),
  });
}

function sameSelectionMarquee(
  left: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null,
  right: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null,
): boolean {
  return left === right || (
    left !== null &&
    right !== null &&
    left.start[0] === right.start[0] &&
    left.start[1] === right.start[1] &&
    left.current[0] === right.current[0] &&
    left.current[1] === right.current[1]
  );
}

function appendScreenMarquee(
  graphics: Graphics,
  marquee: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }>,
  world: Matrix,
): void {
  const determinant = world.a * world.d - world.b * world.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return;
  const left = Math.min(marquee.start[0], marquee.current[0]);
  const top = Math.min(marquee.start[1], marquee.current[1]);
  const right = Math.max(marquee.start[0], marquee.current[0]);
  const bottom = Math.max(marquee.start[1], marquee.current[1]);
  const inverse = (x: number, y: number): readonly [number, number] => {
    const translatedX = x - world.tx;
    const translatedY = y - world.ty;
    return [
      (world.d * translatedX - world.c * translatedY) / determinant,
      (-world.b * translatedX + world.a * translatedY) / determinant,
    ];
  };
  const northWest = inverse(left, top);
  const northEast = inverse(right, top);
  const southEast = inverse(right, bottom);
  const southWest = inverse(left, bottom);
  graphics
    .moveTo(northWest[0], northWest[1])
    .lineTo(northEast[0], northEast[1])
    .lineTo(southEast[0], southEast[1])
    .lineTo(southWest[0], southWest[1])
    .closePath();
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
