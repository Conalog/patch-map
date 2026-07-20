import 'pixi.js/prepare';

import {
  Application,
  Container,
  Graphics,
  Matrix,
  Rectangle,
  type ApplicationOptions,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
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
} from './leaf-layer';
import { AggregateMeshLayer } from './mesh-layer';
import { ParticleGraphicsLayer } from './particle-layer';
import type { CoreV2ProjectionIndex } from '../contracts';
import {
  createCoreV2LeafAssetSession,
  type CoreV2AssetPolicy,
  type CoreV2AssetSession,
} from '../assets';
import type {
  CoreV2BackendPreference,
  CoreV2RendererStrategy,
  PixiCoreV2RendererDebug,
  RootInteractionHandlers,
} from './types';
import {
  createCoreV2WorldAffine,
  resolveCoreV2SlotQuad,
  type CoreV2ProjectionRenderContext,
  type CoreV2WorldOrientation,
} from './types';

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
  readonly assetSession?: CoreV2AssetSession;
  readonly assetPolicy?: CoreV2AssetPolicy;
}

export interface PixiCoreV2InitializationMetrics {
  readonly applicationInitMs: number;
  readonly rendererBuildMs: number;
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
const EMPTY_PROJECTION_INDEX: CoreV2ProjectionIndex = Object.freeze({
  byEntityId: Object.freeze({}),
});

export class PixiCoreV2Renderer implements CoreRenderer {
  public readonly application: Application;
  public readonly canvas: HTMLCanvasElement;
  public readonly strategy: CoreV2RendererStrategy;
  public readonly preference: CoreV2BackendPreference;
  public readonly world: Container;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics;

  private readonly aggregate: AggregateLayer;
  private readonly leaves: AggregateLeafLayer;
  private readonly selectionOverlay: Graphics;
  private readonly selectedSlots = new Set<number>();
  private readonly target: HTMLElement | undefined;
  private cleanupPromise: Promise<void> = Promise.resolve();
  private interactionUnbind: (() => void) | null = null;
  private lastStore: RenderStoreView | null = null;
  private pendingRanges: SlotRange[] | undefined;
  private pendingOverlayRanges: SlotRange[] | undefined;
  private storeEpoch = 0;
  private frame = 0;
  private widthValue: number;
  private heightValue: number;
  private pixelRatioValue: number;
  private view: CoreView = DEFAULT_VIEW;
  private projectionIndex: CoreV2ProjectionIndex = EMPTY_PROJECTION_INDEX;
  private relationSlotsByEndpoint: ReadonlyMap<number, readonly number[]> = new Map();
  private relationSlots = new Set<number>();
  private relationEndpointsBySlot: ReadonlyMap<number, readonly [number, number]> = new Map();
  private projectionRevision = 0;
  private worldOrientation: CoreV2WorldOrientation = DEFAULT_WORLD_ORIENTATION;
  private readonly worldMatrix = new Matrix();
  private lastInvalidation = 'init';
  private destroyedValue = false;
  private synchronizeOnly = false;
  private lastDebug: PixiCoreV2RendererDebug;
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
      Pick<PixiCoreV2RendererOptions, 'target' | 'assetSession' | 'assetPolicy'>,
    metrics: PixiCoreV2InitializationMetrics,
  ) {
    const buildStarted = now();
    this.application = application;
    this.canvas = application.canvas;
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
    const leafSession = options.assetSession ?? createCoreV2LeafAssetSession(options.assetPolicy);
    this.leaves = new AggregateLeafLayer(
      leafSession,
      options.assetSession === undefined,
      {
        onBindingTransition: ({ key, state, dirtySlots }) => {
          if (this.destroyedValue) return;
          this.lastInvalidation = `scene-asset:${key}:${state}`;
          this.pendingRanges = mergeRanges(
            this.pendingRanges ?? [],
            contiguousRanges(dirtySlots),
          );
        },
      },
    );
    this.selectionOverlay = new Graphics({ label: 'PATCH MAP Core v2 / interaction overlay' });
    this.selectionOverlay.eventMode = 'none';
    this.world.addChild(this.aggregate.container, this.leaves.container, this.selectionOverlay);
    this.application.stage.label = 'PATCH MAP Core v2';
    this.application.stage.eventMode = 'static';
    this.application.stage.interactiveChildren = false;
    this.application.stage.hitArea = new Rectangle(0, 0, this.widthValue, this.heightValue);
    this.application.stage.addChild(this.world);
    this.application.ticker.stop();
    this.target?.appendChild(this.canvas);
    this.canvas.style.touchAction = 'none';
    this.canvas.dataset.patchMapCore = 'v2';

    const rendererBuildMs = metrics.rendererBuildMs + (now() - buildStarted);
    this.initializationMetrics = Object.freeze({
      applicationInitMs: metrics.applicationInitMs,
      rendererBuildMs,
    });
    this.lastDebug = this.emptyDebug();
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
      background: packedRgb(packedBackground),
      backgroundAlpha: packedAlpha(packedBackground),
      clearBeforeRender: true,
      ...(options.canvas === undefined ? {} : { canvas: options.canvas }),
    };
    await application.init(initOptions);
    const applicationInitMs = now() - applicationStarted;
    return new PixiCoreV2Renderer(
      application,
      {
        width,
        height,
        pixelRatio,
        strategy,
        preference,
        ...(options.target ? { target: options.target } : {}),
        ...(options.assetSession ? { assetSession: options.assetSession } : {}),
        ...(options.assetPolicy ? { assetPolicy: options.assetPolicy } : {}),
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
    options: { readonly fullRebuild?: boolean } = {},
  ): void {
    this.assertAlive();
    this.lastInvalidation = reason;
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

  public setProjection(index: CoreV2ProjectionIndex): boolean {
    this.assertAlive();
    if (this.projectionIndex === index) return false;
    const previous = this.projectionIndex;
    this.projectionIndex = index;
    this.projectionRevision += 1;
    const ranges = this.lastStore
      ? projectionChangedRanges(this.lastStore, previous, index)
      : [];
    this.pendingRanges = mergeRanges(this.pendingRanges ?? [], ranges);
    this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], ranges);
    this.lastInvalidation = 'projection';
    return true;
  }

  public setWorldOrientation(world: CoreV2WorldOrientation): boolean {
    this.assertAlive();
    if (sameWorldOrientation(this.worldOrientation, world)) return false;
    this.worldOrientation = Object.freeze({ ...world });
    this.projectionRevision += 1;
    this.applyWorldTransform();
    if (this.lastStore) {
      const upright = projectionOrientationRanges(this.lastStore, this.projectionIndex, 'upright');
      this.pendingRanges = mergeRanges(this.pendingRanges ?? [], upright);
      this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], upright);
    }
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
      if (this.lastStore) {
        const upright = projectionOrientationRanges(this.lastStore, this.projectionIndex, 'upright');
        this.pendingRanges = mergeRanges(this.pendingRanges ?? [], upright);
        this.pendingOverlayRanges = mergeRanges(this.pendingOverlayRanges ?? [], upright);
      }
    }
    this.applyWorldTransform();
    this.lastInvalidation = 'view';
    return true;
  }

  public flush(store: RenderStoreView): RendererFlushResult {
    this.assertAlive();
    const storeReplaced = this.lastStore !== store;
    if (storeReplaced) {
      this.storeEpoch += 1;
      this.pendingRanges = undefined;
      this.pendingOverlayRanges = undefined;
      this.selectedSlots.clear();
    }
    // View rotation can change upright projection geometry. Resolve it before
    // consuming pending ranges so the first published frame cannot lag.
    this.setView(store.view);
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
    const ranges = this.pendingRanges === undefined || this.relationSlotsByEndpoint.size === 0
      ? this.pendingRanges
      : expandCoreV2RelationDependencyRanges(
          store,
          this.pendingRanges,
          this.relationSlotsByEndpoint,
        );
    const aggregate = !storeReplaced && ranges?.length === 0
      ? idleAggregateResult(this.lastAggregateResult)
      : this.syncAggregate(store, ranges);
    this.lastAggregateResult = aggregate;
    const leaves = this.leaves.sync(store, {
      fullRebuildEpoch: this.storeEpoch,
      projectionContext: this.projectionContext(),
      ...(ranges === undefined ? {} : { changedRanges: ranges }),
    });
    this.syncSelectionOverlay(store, storeReplaced, this.pendingOverlayRanges ?? ranges);
    const rendered = !this.synchronizeOnly;
    this.synchronizeOnly = false;
    if (rendered) {
      this.application.render();
      this.leaves.confirmRenderedFrame();
      this.frame += 1;
    }
    this.lastStore = store;
    this.pendingRanges = [];
    this.pendingOverlayRanges = [];
    const overlayCount = this.selectedSlots.size > 0 ? 1 : 0;
    this.lastDebug = Object.freeze({
      strategy: this.strategy,
      backend: backendName(this.application),
      frame: this.frame,
      storeEpoch: this.storeEpoch,
      entityCount: store.liveCount,
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
    this.world.label = `PATCH MAP Core v2 / world (${store.liveCount} entities)`;
    return Object.freeze({
      rendered,
      commandCount: this.lastDebug.aggregateRenderObjects,
    });
  }

  public synchronizeNextFlush(): void {
    this.assertAlive();
    this.synchronizeOnly = true;
    this.lastInvalidation = 'synchronize';
  }

  public async prepareGpu(): Promise<void> {
    this.assertAlive();
    await this.application.renderer.prepare.upload(this.world);
  }

  public async loadAsset(alias: string, url: string): Promise<void> {
    await this.leaves.loadAsset(alias, url);
    this.lastInvalidation = `asset:${alias}:load`;
    this.pendingRanges ??= [];
  }

  public async unloadAsset(alias: string): Promise<boolean> {
    const unloaded = await this.leaves.unloadAsset(alias);
    if (unloaded) {
      this.lastInvalidation = `asset:${alias}:unload`;
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
    this.pendingRanges ??= [];
    return completion;
  }

  public async unbindSceneAsset(key: string): Promise<boolean> {
    this.assertAlive();
    const unbound = await this.leaves.unbindSceneAsset(key);
    if (unbound) {
      this.lastInvalidation = `scene-asset:${key}:unbind`;
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

  public async captureBase64(): Promise<string> {
    this.assertAlive();
    return this.application.renderer.extract.base64({ target: this.application.stage, format: 'png' });
  }

  public bindRootInteractions(handlers: RootInteractionHandlers): () => void {
    this.assertAlive();
    this.interactionUnbind?.();
    const stage = this.application.stage;
    const pointerDown = (event: FederatedPointerEvent): void => {
      handlers.pointerDown(event.global.x, event.global.y, event.pointerId, event.button);
    };
    const pointerMove = (event: FederatedPointerEvent): void => {
      handlers.pointerMove(event.global.x, event.global.y, event.pointerId, event.buttons);
    };
    const pointerUp = (event: FederatedPointerEvent): void => {
      handlers.pointerUp(event.global.x, event.global.y, event.pointerId);
    };
    const pointerCancel = (event: FederatedPointerEvent): void => {
      handlers.pointerCancel(event.pointerId);
    };
    const wheel = (event: FederatedWheelEvent): void => {
      event.preventDefault();
      handlers.wheel(event.global.x, event.global.y, event.deltaY);
    };
    stage.on('pointerdown', pointerDown);
    stage.on('pointermove', pointerMove);
    stage.on('pointerup', pointerUp);
    stage.on('pointerupoutside', pointerUp);
    stage.on('pointercancel', pointerCancel);
    stage.on('wheel', wheel);
    const unbind = (): void => {
      stage.off('pointerdown', pointerDown);
      stage.off('pointermove', pointerMove);
      stage.off('pointerup', pointerUp);
      stage.off('pointerupoutside', pointerUp);
      stage.off('pointercancel', pointerCancel);
      stage.off('wheel', wheel);
      if (this.interactionUnbind === unbind) this.interactionUnbind = null;
    };
    this.interactionUnbind = unbind;
    return unbind;
  }

  public debugSnapshot(): PixiCoreV2RendererDebug {
    return this.destroyedValue ? Object.freeze({ ...this.lastDebug, destroyed: true }) : this.lastDebug;
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.interactionUnbind?.();
    this.interactionUnbind = null;
    this.application.stage.removeChild(this.world);
    this.world.removeChildren();
    this.aggregate.destroy();
    this.selectionOverlay.destroy();
    this.cleanupPromise = this.leaves.destroy();
    this.world.destroy();
    this.application.destroy({ removeView: false }, { children: true });
    this.canvas.remove();
    this.lastStore = null;
    this.pendingRanges = [];
    this.pendingOverlayRanges = [];
    this.selectedSlots.clear();
    this.relationSlotsByEndpoint = new Map();
    this.relationSlots.clear();
    this.relationEndpointsBySlot = new Map();
    this.lastDebug = Object.freeze({ ...this.lastDebug, destroyed: true });
    return true;
  }

  public async whenDestroyed(): Promise<void> {
    await this.cleanupPromise;
  }

  private syncAggregate(store: RenderStoreView, ranges: readonly SlotRange[] | undefined): AggregateResult {
    if (this.aggregate instanceof AggregateMeshLayer) {
      const debug = this.aggregate.sync(store, {
        fullRebuildEpoch: this.storeEpoch,
        projectionContext: this.projectionContext(),
        ...(ranges === undefined ? {} : { changedRanges: ranges }),
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
    this.selectionOverlay.clear();
    for (const slot of [...this.selectedSlots].sort((left, right) => left - right)) {
      appendRotatedOutline(this.selectionOverlay, store, slot, this.projectionContext());
    }
    if (this.selectedSlots.size > 0) {
      this.selectionOverlay.stroke({ color: 0x2f80ed, width: 2 / Math.max(this.view.scale, 0.001), alpha: 1 });
    }
    this.selectionOverlay.label = `PATCH MAP Core v2 / interaction overlay (${this.selectedSlots.size})`;
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

  private projectionContext(): CoreV2ProjectionRenderContext {
    return Object.freeze({
      index: this.projectionIndex,
      revision: this.projectionRevision,
      world: this.worldOrientation,
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

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('PixiCoreV2Renderer is destroyed');
  }
}

function appendRotatedOutline(
  graphics: Graphics,
  store: RenderStoreView,
  slot: number,
  projectionContext: CoreV2ProjectionRenderContext,
): void {
  const quad = resolveCoreV2SlotQuad(store, slot, projectionContext);
  if (!(quad.width > 0) || !(quad.height > 0)) return;
  graphics.moveTo(quad.vertices[0], quad.vertices[1]);
  for (let index = 2; index < quad.vertices.length; index += 2) {
    graphics.lineTo(quad.vertices[index]!, quad.vertices[index + 1]!);
  }
  graphics.closePath();
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
    if (entityChanged) changedEndpointIds.add(id);
    if (entityChanged || relationChanged || imageChanged) slots.push(slot);
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

function backendName(application: Application): string {
  const name = application.renderer.constructor.name;
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
