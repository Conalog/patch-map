import {
  BitmapText,
  Container,
  Matrix,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';

import type { SlotRange } from '../dense/contracts';
import {
  RenderAlign,
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';
import {
  createPatchMapLeafAssetSession,
  normalizePatchMapAssetDescriptor,
  type PatchMapAssetAcquisition,
  type PatchMapAssetSession,
} from '../assets';
import type { PatchMapTextProjection } from '../contracts';
import type { PatchMapAssetSource } from '../semantic/dataset';
import type {
  PatchMapSceneImageAssetBindingObservation,
  PatchMapSceneImageAssetBindingProbe,
  PatchMapSceneImageAssetBindingRequest,
  PatchMapSceneImageAssetBindingState,
  PatchMapSceneImageAssetRenderRole,
  PatchMapSceneImageAssetSourceKind,
  PatchMapSceneImageLeafProbe,
} from '../scene-images/contracts';
import {
  selectPatchMapTextRenderRoute,
  type PatchMapBitmapTextCapabilityProof,
  type PatchMapTextRenderRoute,
  type PatchMapTextRenderRouteReason,
  type PatchMapTextRenderStyle,
} from '../semantic/text-render-route';
import {
  resolvePatchMapSlotQuad,
  type PatchMapEntityPaintProbe,
  type PatchMapProjectionRenderContext,
  type PatchMapQuadVertices,
  type PatchMapRenderLaneProbe,
  type PatchMapResolvedRenderQuad,
  type PatchMapTextAttachedSignatures,
  type PatchMapTextRendererProbe,
} from './types';
import {
  alignName,
  countVisibleGraphemes,
  textGlyphResolution,
  textRenderStyle,
  textStyle,
} from './leaf-text-style';
import {
  freezeTextAttachedSignatures,
  freezeTextRendererProbe,
  freezeTextSemanticSignatures,
  sameTextAttachedSignatures,
  stableSerializeLeafValue,
  textRendererSignature,
  textSemanticSignatures,
} from './leaf-signatures';

interface TextEntry {
  readonly slot: number;
  readonly object: BitmapText | Text;
  readonly attachedRoute: PatchMapTextRenderRoute;
  readonly entityId: string;
  readonly objectStyleSignature: string;
  routeDecisionReason: PatchMapTextRenderRouteReason;
  attachedSignatures: PatchMapTextAttachedSignatures;
  attachedVisibleGraphemeCount: number;
  lastRenderedSignatures: PatchMapTextAttachedSignatures | null;
  lastRenderedFrame: number | null;
  lastRenderedVisibleGraphemeCount: number;
  targetKind: PatchMapTextProjection['targetKind'] | null;
  visualLocalOrigin: readonly [number, number];
  vertices: PatchMapQuadVertices;
}

interface TextChunk {
  readonly key: number;
  readonly container: Container;
  readonly slots: Set<number>;
  vertices: PatchMapQuadVertices;
  allChildrenVisible: boolean;
}

interface TextMaterializationViewport {
  readonly worldMatrix: Matrix;
  readonly width: number;
  readonly height: number;
  readonly padding?: number;
}

type LeafImageLane = 'standalone-assets' | 'background-assets' | 'content-assets';

interface ImageEntry {
  readonly object: Sprite;
  readonly entityId: string;
  readonly bindingKey: string;
  readonly bindingGeneration: number;
  readonly role: Exclude<LeafAssetRenderRole, 'none'>;
  readonly lane: LeafImageLane;
  vertices: PatchMapQuadVertices;
}

export type LeafAssetSourceKind = PatchMapSceneImageAssetSourceKind;
export type LeafAssetBindingState = PatchMapSceneImageAssetBindingState;
export type LeafAssetRenderRole = PatchMapSceneImageAssetRenderRole;
export type LeafAssetBindingRequest = PatchMapSceneImageAssetBindingRequest;
export type LeafAssetBindingObservation = PatchMapSceneImageAssetBindingObservation;
export type LeafAssetBindingProbe = PatchMapSceneImageAssetBindingProbe;
export type LeafSceneImageProbe = PatchMapSceneImageLeafProbe;

export interface LeafAssetBindingTransition {
  readonly key: string;
  readonly generation: number;
  readonly state: LeafAssetBindingState | 'unbound';
  readonly dirtySlots: readonly number[];
}

export interface AggregateLeafLayerOptions {
  readonly onBindingTransition?: (transition: LeafAssetBindingTransition) => void;
  /**
   * Explicit finite installed-atlas proof seam. The resolver owns font setup;
   * missing, stale, or unclear proof deliberately fails to guarded Text.
   */
  readonly resolveBitmapTextCapability?: (
    request: PatchMapBitmapTextCapabilityRequest,
  ) => PatchMapBitmapTextCapabilityProof | null;
}

export interface PatchMapBitmapTextCapabilityRequest {
  readonly entityId: string;
  readonly text: string;
  readonly style: PatchMapTextRenderStyle;
  readonly projection: PatchMapTextProjection | null;
}

interface NormalizedLeafAssetBindingRequest {
  readonly request: LeafAssetBindingRequest;
  readonly signature: string;
  readonly sourceKind: LeafAssetSourceKind;
  readonly acquire: (session: PatchMapAssetSession) => Promise<PatchMapAssetAcquisition>;
}

interface LeafAssetBinding {
  readonly key: string;
  readonly generation: number;
  readonly request: LeafAssetBindingRequest;
  readonly signature: string;
  readonly sourceKind: LeafAssetSourceKind;
  state: LeafAssetBindingState;
  completion?: Promise<LeafAssetBindingObservation>;
  acquisition?: PatchMapAssetAcquisition;
  texture?: Texture;
  failure?: unknown;
  cacheIdentity: string | null;
  normalizedResourceIdentity: string | null;
  reusedResolvedResource: boolean;
  naturalSize: readonly [number, number] | null;
  consumerCount: number;
  renderObjectCount: number;
  placeholderCount: number;
  staleAttachCount: number;
  staleCompletionCount: number;
}

export interface LeafLayerDebug {
  readonly bitmapTextCount: number;
  /** Pixi Text objects; together with bitmapTextCount this is the text object total. */
  readonly pixiTextCount: number;
  readonly imageCount: number;
  readonly loadedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly pendingAssetCount: number;
  readonly failedAssetCount: number;
  readonly placeholderCount: number;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
}

const PLACEHOLDER_TINT = 0xc7ceda;
const IMAGE_CHILD_APPEND_BATCH_SIZE = 1_024;
const TEXT_CHUNKING_CAPACITY_THRESHOLD = 1_024;
const TEXT_CHUNK_SLOT_SPAN = 64;
const EMPTY_QUAD_VERTICES: PatchMapQuadVertices = Object.freeze([
  0, 0,
  0, 0,
  0, 0,
  0, 0,
]);

export class AggregateLeafLayer {
  public readonly container = new Container({ label: 'patch-map:text-and-assets' });
  public readonly standaloneAssetContainer = new Container({
    label: 'PatchMap / standalone assets (0)',
    sortableChildren: false,
  });
  public readonly backgroundAssetContainer = new Container({
    label: 'PatchMap / background assets (0)',
    sortableChildren: false,
  });
  public readonly contentAssetContainer = new Container({
    label: 'PatchMap / content assets (0)',
    // Child order is maintained explicitly by semantic zIndex and stable slot.
    // Pixi's z-only sorting cannot provide the entity tie-breaker needed when
    // a pending Sprite is replaced after its equal-z siblings were inserted.
    sortableChildren: false,
  });
  /** Compatibility alias for the original standalone-image leaf surface. */
  public readonly imageContainer = this.standaloneAssetContainer;
  public readonly textContainer = new Container({ label: 'PatchMap / text (0)' });

  private readonly texts = new Map<number, TextEntry>();
  /** Visible semantic text slots, including those without a Pixi object yet. */
  private readonly textEntityIdBySlot: Array<string | undefined> = [];
  private readonly textVerticesBySlot: Array<PatchMapQuadVertices | undefined> = [];
  private readonly textProbesByEntityId = new Map<string, PatchMapTextRendererProbe>();
  private readonly textLastRenderedGraphemeCountByEntityId = new Map<string, number>();
  private readonly pendingTextEntries = new Set<TextEntry>();
  private readonly textChunks = new Map<number, TextChunk>();
  private readonly dirtyTextChunkKeys = new Set<number>();
  private readonly deferredTextSlots = new Set<number>();
  private deferredTextStore: RenderStoreView | null = null;
  private deferredTextProjectionContext: PatchMapProjectionRenderContext | undefined;
  private textChunkOrderDirty = false;
  private textChunking = false;
  private readonly images = new Map<number, ImageEntry>();
  private readonly imageBindingBySlot = new Map<number, string>();
  private readonly imageSlotsByBinding = new Map<string, Set<number>>();
  private readonly imageEntityIdBySlot = new Map<number, string>();
  private readonly imageProbesByEntityId = new Map<string, LeafSceneImageProbe>();
  private readonly paintProbesByEntityId = new Map<string, PatchMapEntityPaintProbe>();
  private readonly bindings = new Map<string, LeafAssetBinding>();
  private readonly hostAssetBindingKeyByAlias = new Map<string, string>();
  private readonly framePendingAssetReleases: PatchMapAssetAcquisition[] = [];
  private readonly readyAssetReleases: PatchMapAssetAcquisition[] = [];
  private readonly dirtyAssetSlots = new Set<number>();
  private readonly transformMatrix = new Matrix();
  private nextBindingGeneration = 0;
  private confirmedTextFrame = 0;
  private staleCompletionCount = 0;
  private storeEpoch = -1;
  private readonly dirtyImageLanes = new Set<LeafImageLane>();
  private debugCache: LeafLayerDebug | null = null;
  private destroyed = false;

  public constructor(
    private readonly assetSession: PatchMapAssetSession = createPatchMapLeafAssetSession(),
    private readonly ownsAssetSession = true,
    private readonly options: AggregateLeafLayerOptions = {},
  ) {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.textContainer.eventMode = 'none';
    this.textContainer.interactiveChildren = false;
    this.standaloneAssetContainer.eventMode = 'none';
    this.standaloneAssetContainer.interactiveChildren = false;
    this.standaloneAssetContainer.sortableChildren = false;
    this.backgroundAssetContainer.eventMode = 'none';
    this.backgroundAssetContainer.interactiveChildren = false;
    this.backgroundAssetContainer.sortableChildren = false;
    this.contentAssetContainer.eventMode = 'none';
    this.contentAssetContainer.interactiveChildren = false;
    this.contentAssetContainer.sortableChildren = false;
    this.container.addChild(
      this.standaloneAssetContainer,
      this.backgroundAssetContainer,
      this.contentAssetContainer,
      this.textContainer,
    );
  }

  /**
   * Bind one semantic scene key to an alias or an exact direct source.
   * Promise settlement belongs to the binding generation, never to a Sprite.
   */
  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    this.assertAlive();
    const cleanKey = nonempty(key, 'asset binding key');
    const normalized = normalizeLeafAssetBindingRequest(request);
    const previous = this.bindings.get(cleanKey);
    if (previous?.signature === normalized.signature && previous.state !== 'failed') {
      return previous.completion ?? Promise.resolve(bindingObservation(previous, 'attached'));
    }
    const staleCompletionCount = previous?.staleCompletionCount ?? 0;
    if (previous) this.retireBinding(previous);

    const generation = this.allocateBindingGeneration();
    const binding: LeafAssetBinding = {
      key: cleanKey,
      generation,
      request: normalized.request,
      signature: normalized.signature,
      sourceKind: normalized.sourceKind,
      state: 'pending',
      cacheIdentity: null,
      normalizedResourceIdentity: null,
      reusedResolvedResource: false,
      naturalSize: null,
      consumerCount: this.imageSlotsByBinding.get(cleanKey)?.size ?? 0,
      renderObjectCount: 0,
      placeholderCount: 0,
      staleAttachCount: 0,
      staleCompletionCount,
    };
    this.bindings.set(cleanKey, binding);
    const completion = this.acquireBinding(binding, normalized);
    binding.completion = completion;
    this.transitionBinding(binding, 'pending');
    return completion;
  }

  public unbindSceneAsset(key: string): Promise<boolean> {
    this.assertAlive();
    const cleanKey = nonempty(key, 'asset binding key');
    const binding = this.bindings.get(cleanKey);
    if (!binding) return Promise.resolve(false);
    this.retireBinding(binding);
    return Promise.resolve(true);
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    const binding = this.bindings.get(key);
    if (!binding) return null;
    const renderRole: LeafAssetRenderRole = binding.renderObjectCount === 0
      ? 'none'
      : binding.placeholderCount > 0
        ? 'asset-placeholder'
        : 'image';
    return Object.freeze({
      key: binding.key,
      generation: binding.generation,
      request: binding.request,
      sourceKind: binding.sourceKind,
      state: binding.state,
      attached: binding.state === 'resolved' && binding.acquisition !== undefined,
      cacheIdentity: binding.cacheIdentity,
      normalizedResourceIdentity: binding.normalizedResourceIdentity,
      reusedResolvedResource: binding.reusedResolvedResource || binding.consumerCount > 1,
      naturalSize: binding.naturalSize,
      consumerCount: binding.consumerCount,
      renderObjectCount: binding.renderObjectCount,
      placeholderCount: binding.placeholderCount,
      renderRole,
      staleAttachCount: binding.staleAttachCount,
      staleCompletionCount: binding.staleCompletionCount,
    });
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    return this.imageProbesByEntityId.get(entityId) ?? null;
  }

  public textRendererProbe(entityId: string): PatchMapTextRendererProbe | null {
    return this.textProbesByEntityId.get(entityId) ?? null;
  }

  /** Internal O(1) join fact used by the renderer when semantic state advances first. */
  public lastRenderedTextGraphemeCount(entityId: string): number {
    return this.textLastRenderedGraphemeCountByEntityId.get(entityId) ?? 0;
  }

  public entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null {
    return this.paintProbesByEntityId.get(entityId) ?? null;
  }

  public renderLaneProbe(): Readonly<{
    readonly backgroundAssets: PatchMapRenderLaneProbe;
    readonly contentAssets: PatchMapRenderLaneProbe;
    readonly text: PatchMapRenderLaneProbe;
  }> {
    return Object.freeze({
      backgroundAssets: freezeLaneProbe(
        'background-assets',
        this.backgroundAssetContainer.label,
        this.backgroundAssetContainer.children.length,
      ),
      contentAssets: freezeLaneProbe(
        'content-assets',
        this.contentAssetContainer.label,
        this.standaloneAssetContainer.children.length +
          this.contentAssetContainer.children.length,
      ),
      text: freezeLaneProbe(
        'text',
        this.textContainer.label,
        this.texts.size,
      ),
    });
  }

  /** Compatibility seam for host-driven alias-to-URL preloads. */
  public async loadAsset(alias: string, url: string): Promise<void> {
    const cleanAlias = nonempty(alias, 'asset alias');
    const cleanUrl = nonempty(url, 'asset URL');
    const sceneAliasKey = `alias:${cleanAlias}`;
    const bindingKey =
      this.bindings.has(sceneAliasKey) || this.imageSlotsByBinding.has(sceneAliasKey)
        ? sceneAliasKey
        : cleanAlias;
    const observation = await this.bindSceneAsset(bindingKey, {
      kind: 'source',
      source: cleanUrl,
    });
    if (observation.status === 'stale') return;
    const binding = this.bindings.get(bindingKey);
    if (binding?.generation === observation.generation && binding.state === 'failed') {
      if (binding.failure instanceof Error) throw binding.failure;
      throw new Error('PatchMap asset binding failed');
    }
    this.hostAssetBindingKeyByAlias.set(cleanAlias, bindingKey);
  }

  public unloadAsset(alias: string): Promise<boolean> {
    const cleanAlias = nonempty(alias, 'asset alias');
    const bindingKey = this.hostAssetBindingKeyByAlias.get(cleanAlias) ?? cleanAlias;
    this.hostAssetBindingKeyByAlias.delete(cleanAlias);
    return this.unbindSceneAsset(bindingKey);
  }

  /** Called only after Pixi has successfully rendered the attached leaves. */
  public confirmRenderedFrame(renderedFrame?: number): void {
    if (this.destroyed) return;
    const frame = renderedFrame ?? this.confirmedTextFrame + 1;
    if (!Number.isSafeInteger(frame) || frame <= 0 || frame < this.confirmedTextFrame) {
      throw new TypeError('rendered text frame must be a positive monotonic safe integer');
    }
    this.confirmedTextFrame = frame;
    if (this.textChunking) {
      for (const chunk of this.textChunks.values()) {
        if (!chunk.container.visible) continue;
        for (const slot of chunk.slots) {
          const entry = this.texts.get(slot);
          if (
            entry === undefined ||
            !entry.object.visible ||
            !this.pendingTextEntries.has(entry)
          ) {
            continue;
          }
          this.confirmPendingTextEntry(entry, frame);
        }
      }
    } else {
      for (const entry of this.pendingTextEntries) {
        if (!entry.object.visible) continue;
        this.confirmPendingTextEntry(entry, frame);
      }
    }
    if (this.framePendingAssetReleases.length > 0) {
      this.readyAssetReleases.push(...this.framePendingAssetReleases.splice(0));
    }
  }

  /** Finalize only acquisitions made safe by replacement or a rendered frame. */
  public async finalizeAssetUnloads(): Promise<void> {
    this.assertAlive();
    const leases = this.readyAssetReleases.splice(0);
    await Promise.all(leases.map(async (acquisition) => acquisition.release()));
  }

  public sync(
    store: RenderStoreView,
    options: {
      readonly changedRanges?: readonly SlotRange[];
      readonly fullRebuildEpoch?: number;
      readonly projectionContext?: PatchMapProjectionRenderContext;
      readonly projectionTransformOnly?: boolean;
      /** Initial-view proof used to avoid rasterizing offscreen Pixi Text. */
      readonly textMaterializationViewport?: TextMaterializationViewport;
    } = {},
  ): LeafLayerDebug {
    this.assertAlive();
    const epoch = options.fullRebuildEpoch ?? this.storeEpoch;
    const fullRebuild = epoch !== this.storeEpoch;
    const changedRanges = options.changedRanges;
    const hasLeafWork =
      fullRebuild ||
      changedRanges === undefined ||
      changedRanges.length > 0 ||
      this.dirtyAssetSlots.size > 0;
    if (!hasLeafWork) return this.debugSnapshot();
    this.debugCache = null;
    if (fullRebuild) {
      this.clearDisplayObjects();
      this.storeEpoch = epoch;
      this.textChunking = store.capacity >= TEXT_CHUNKING_CAPACITY_THRESHOLD;
    }
    this.deferredTextStore = store;
    this.deferredTextProjectionContext = options.projectionContext;

    if (fullRebuild || !options.changedRanges) {
      for (let slot = 0; slot < store.capacity; slot += 1) {
        this.syncSlot(
          store,
          slot,
          options.projectionContext,
          fullRebuild && this.textChunking
            ? options.textMaterializationViewport
            : undefined,
        );
      }
    } else {
      for (const range of options.changedRanges) {
        const start = Math.max(0, range.start);
        const end = Math.min(store.capacity, range.end);
        for (let slot = start; slot < end; slot += 1) {
          if (options.projectionTransformOnly === true) {
            this.deferredTextSlots.delete(slot);
            this.syncSlotProjectionOnly(store, slot, options.projectionContext);
          } else if (this.shouldDeferTextSync(store, slot)) {
            // Publish the new quad before culling decides whether the deferred
            // content/style texture is now needed on screen.
            this.syncSlotProjectionOnly(store, slot, options.projectionContext);
            this.deferredTextSlots.add(slot);
          } else {
            this.deferredTextSlots.delete(slot);
            this.syncSlot(store, slot, options.projectionContext);
          }
        }
      }
      for (const slot of this.dirtyAssetSlots) {
        if (
          slot >= 0 &&
          slot < store.capacity &&
          !rangesContainSlot(options.changedRanges, slot)
        ) {
          this.syncSlot(store, slot, options.projectionContext);
        }
      }
    }
    this.rebuildDirtyTextChunks();
    this.sortTextChunks();
    this.sortImageChildren();
    this.dirtyAssetSlots.clear();
    this.backgroundAssetContainer.label =
      `PatchMap / background assets (${this.backgroundAssetContainer.children.length})`;
    this.standaloneAssetContainer.label =
      `PatchMap / standalone assets (${this.standaloneAssetContainer.children.length})`;
    this.contentAssetContainer.label =
      `PatchMap / content assets (${this.contentAssetContainer.children.length})`;
    this.textContainer.label = `PatchMap / text (${this.texts.size})`;
    return this.debugSnapshot();
  }

  /**
   * Cull object-backed leaves against the screen without asking Pixi to
   * calculate bounds for every Text or Sprite. Aggregate geometry remains
   * batched and is intentionally outside this pass.
   */
  public cull(
    worldMatrix: Matrix,
    viewportWidth: number,
    viewportHeight: number,
    padding = 32,
  ): number {
    this.assertAlive();
    if (
      !Number.isFinite(viewportWidth) ||
      viewportWidth <= 0 ||
      !Number.isFinite(viewportHeight) ||
      viewportHeight <= 0 ||
      !Number.isFinite(padding) ||
      padding < 0
    ) {
      throw new TypeError('leaf culling viewport and padding must be finite and positive');
    }
    let visibleCount = 0;
    if (this.textChunking) {
      for (const initialChunk of this.textChunks.values()) {
        let chunk = initialChunk;
        let coverage = quadViewportCoverage(
          chunk.vertices,
          worldMatrix,
          viewportWidth,
          viewportHeight,
          padding,
        );
        if (coverage !== 'outside' && this.materializeDeferredTextChunk(chunk)) {
          this.rebuildDirtyTextChunks();
          chunk = this.textChunks.get(chunk.key) ?? chunk;
          coverage = quadViewportCoverage(
            chunk.vertices,
            worldMatrix,
            viewportWidth,
            viewportHeight,
            padding,
          );
        }
        const chunkVisible = coverage !== 'outside';
        if (chunk.container.visible !== chunkVisible) {
          chunk.container.visible = chunkVisible;
        }
        if (!chunkVisible) continue;
        if (coverage === 'inside') {
          if (!chunk.allChildrenVisible) {
            for (const slot of chunk.slots) {
              const entry = this.texts.get(slot);
              if (entry !== undefined && !entry.object.visible) {
                entry.object.visible = true;
              }
            }
            chunk.allChildrenVisible = true;
          }
          visibleCount += chunk.slots.size;
          continue;
        }
        let allChildrenVisible = true;
        for (const slot of chunk.slots) {
          const entry = this.texts.get(slot);
          if (entry === undefined) continue;
          const visible = quadIntersectsViewport(
            entry.vertices,
            worldMatrix,
            viewportWidth,
            viewportHeight,
            padding,
          );
          if (entry.object.visible !== visible) entry.object.visible = visible;
          if (visible) visibleCount += 1;
          else allChildrenVisible = false;
        }
        chunk.allChildrenVisible = allChildrenVisible;
      }
    } else {
      for (const entry of this.texts.values()) {
        const visible = quadIntersectsViewport(
          entry.vertices,
          worldMatrix,
          viewportWidth,
          viewportHeight,
          padding,
        );
        entry.object.visible = visible;
        if (visible) visibleCount += 1;
      }
    }
    for (const entry of this.images.values()) {
      const visible = quadIntersectsViewport(
        entry.vertices,
        worldMatrix,
        viewportWidth,
        viewportHeight,
        padding,
      );
      entry.object.visible = visible;
      if (visible) visibleCount += 1;
    }
    this.textContainer.label = `PatchMap / text (${this.texts.size})`;
    return visibleCount;
  }

  public debugSnapshot(): LeafLayerDebug {
    if (this.debugCache !== null) return this.debugCache;
    let bitmapTextCount = 0;
    let loadedAssetCount = 0;
    let pendingAssetCount = 0;
    let failedAssetCount = 0;
    let staleAttachCount = 0;
    for (const entry of this.texts.values()) {
      if (entry.attachedRoute === 'bitmap-text') bitmapTextCount += 1;
    }
    for (const binding of this.bindings.values()) {
      if (binding.state === 'resolved') loadedAssetCount += 1;
      else if (binding.state === 'pending') pendingAssetCount += 1;
      else failedAssetCount += 1;
      staleAttachCount += binding.staleAttachCount;
    }
    let unresolvedAssetCount = 0;
    for (const [key, slots] of this.imageSlotsByBinding) {
      if (slots.size > 0 && this.bindings.get(key)?.state !== 'resolved') {
        unresolvedAssetCount += 1;
      }
    }
    let placeholderCount = 0;
    for (const image of this.images.values()) {
      if (image.role === 'asset-placeholder') placeholderCount += 1;
    }
    this.debugCache = Object.freeze({
      bitmapTextCount,
      pixiTextCount: this.texts.size - bitmapTextCount,
      imageCount: this.images.size,
      loadedAssetCount,
      unresolvedAssetCount,
      pendingAssetCount,
      failedAssetCount,
      placeholderCount,
      staleAttachCount,
      staleCompletionCount: this.staleCompletionCount,
    });
    return this.debugCache;
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearDisplayObjects();
    const acquisitions = new Set<PatchMapAssetAcquisition>([
      ...[...this.bindings.values()]
        .map(({ acquisition }) => acquisition)
        .filter((value): value is PatchMapAssetAcquisition => value !== undefined),
      ...this.framePendingAssetReleases,
      ...this.readyAssetReleases,
    ]);
    this.bindings.clear();
    this.hostAssetBindingKeyByAlias.clear();
    this.framePendingAssetReleases.length = 0;
    this.readyAssetReleases.length = 0;
    this.dirtyAssetSlots.clear();
    this.nextBindingGeneration = 0;
    this.confirmedTextFrame = 0;
    this.staleCompletionCount = 0;
    this.storeEpoch = -1;
    this.dirtyImageLanes.clear();
    this.standaloneAssetContainer.destroy();
    this.backgroundAssetContainer.destroy();
    this.contentAssetContainer.destroy();
    this.textContainer.destroy();
    this.container.destroy();
    const settlements = await Promise.allSettled(
      [...acquisitions].map(async (acquisition) => acquisition.release()),
    );
    const releaseFailure = settlements.find(
      (settlement): settlement is PromiseRejectedResult => settlement.status === 'rejected',
    );
    if (this.ownsAssetSession) {
      await this.assetSession.destroy();
      return;
    }
    if (releaseFailure) throw new Error('PatchMap asset release failed');
  }

  private async acquireBinding(
    binding: LeafAssetBinding,
    request: NormalizedLeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    let acquisition: PatchMapAssetAcquisition;
    try {
      acquisition = await request.acquire(this.assetSession);
    } catch (error) {
      return this.finishBindingFailure(binding, error);
    }

    let texture: Texture;
    try {
      texture = requireTexture(acquisition.resource);
    } catch (error) {
      const stale = !this.isCurrentBinding(binding);
      if (stale) this.recordStaleCompletion(binding.key);
      await acquisition.release();
      return stale
        ? staleBindingObservation(binding)
        : this.finishBindingFailure(binding, error);
    }

    const naturalSize = textureNaturalSize(texture);
    // A decoder may intentionally return one public singleton Texture for many
    // unrelated sources. Sharing evidence comes from semantic consumers of this
    // binding, never from decoded object identity.
    const reusedResolvedResource = false;
    if (!this.isCurrentBinding(binding)) {
      this.recordStaleCompletion(binding.key);
      const observation = Object.freeze({
        key: binding.key,
        generation: binding.generation,
        status: 'stale' as const,
        cacheIdentity: acquisition.describedCacheIdentity ?? acquisition.cacheIdentity,
        normalizedResourceIdentity: acquisition.normalizedResourceIdentity,
        reusedResolvedResource,
        naturalSize,
      });
      // Release failure is part of this binding completion. Keeping it outside
      // the acquisition catch prevents a second stale count and makes cleanup
      // failure observable to the caller instead of converting it to success.
      await acquisition.release();
      return observation;
    }
    binding.acquisition = acquisition;
    binding.texture = texture;
    binding.cacheIdentity = acquisition.describedCacheIdentity ?? acquisition.cacheIdentity;
    binding.normalizedResourceIdentity = acquisition.normalizedResourceIdentity;
    binding.reusedResolvedResource = reusedResolvedResource;
    binding.naturalSize = naturalSize;
    binding.state = 'resolved';
    delete binding.failure;
    this.transitionBinding(binding, 'resolved');
    return bindingObservation(binding, 'attached');
  }

  private finishBindingFailure(
    binding: LeafAssetBinding,
    error: unknown,
  ): LeafAssetBindingObservation {
    if (!this.isCurrentBinding(binding)) {
      this.recordStaleCompletion(binding.key);
      return staleBindingObservation(binding);
    }
    binding.state = 'failed';
    binding.failure = error;
    this.transitionBinding(binding, 'failed');
    return bindingObservation(binding, 'attached');
  }

  private retireBinding(binding: LeafAssetBinding): void {
    if (this.bindings.get(binding.key) !== binding) return;
    this.bindings.delete(binding.key);
    if (binding.acquisition) {
      const stillRendered = binding.renderObjectCount > binding.placeholderCount;
      if (stillRendered) this.framePendingAssetReleases.push(binding.acquisition);
      else this.readyAssetReleases.push(binding.acquisition);
      delete binding.acquisition;
      delete binding.texture;
    }
    binding.consumerCount = 0;
    binding.renderObjectCount = 0;
    binding.placeholderCount = 0;
    this.transitionBinding(binding, 'unbound');
  }

  private transitionBinding(
    binding: LeafAssetBinding,
    state: LeafAssetBindingTransition['state'],
  ): void {
    this.debugCache = null;
    const dirtySlots = Object.freeze([
      ...(this.imageSlotsByBinding.get(binding.key) ?? []),
    ].sort((left, right) => left - right));
    for (const slot of dirtySlots) this.dirtyAssetSlots.add(slot);
    if (this.destroyed) return;
    this.options.onBindingTransition?.(Object.freeze({
      key: binding.key,
      generation: binding.generation,
      state,
      dirtySlots,
    }));
  }

  private syncSlot(
    store: RenderStoreView,
    slot: number,
    projectionContext?: PatchMapProjectionRenderContext,
    textMaterializationViewport?: TextMaterializationViewport,
  ): void {
    const alive = store.alive[slot] === 1;
    const visible = alive && ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0;
    const kind = store.kind[slot];
    if (!visible || kind !== RenderKind.Text) this.removeText(slot);
    if (!alive || kind !== RenderKind.Image) {
      this.clearImageSlot(slot);
    } else {
      const entityId = store.ids[slot] ?? `@slot:${slot}`;
      const bindingKey = projectionContext?.index.imagesByEntityId?.[entityId]?.bindingKey ??
        store.source[slot] ??
        '';
      const lane = imageLane(entityId, projectionContext);
      this.observeImageSlot(store, slot, entityId, bindingKey, lane);
      if (visible && lane !== null) {
        this.syncImage(store, slot, entityId, bindingKey, lane, projectionContext);
      } else {
        this.removeVisibleImage(store, slot, entityId, bindingKey, lane);
      }
    }
    if (!visible) return;
    if (kind === RenderKind.Text) {
      let preparedQuad: PatchMapResolvedRenderQuad | undefined;
      if (textMaterializationViewport !== undefined) {
        preparedQuad = this.trackTextSlot(store, slot, projectionContext);
        const padding = textMaterializationViewport.padding ?? 32;
        if (!quadIntersectsViewport(
          preparedQuad.vertices,
          textMaterializationViewport.worldMatrix,
          textMaterializationViewport.width,
          textMaterializationViewport.height,
          padding,
        )) {
          this.deferredTextSlots.add(slot);
          return;
        }
      }
      this.syncText(store, slot, projectionContext, preparedQuad);
    }
  }

  private syncSlotProjectionOnly(
    store: RenderStoreView,
    slot: number,
    projectionContext?: PatchMapProjectionRenderContext,
  ): void {
    const alive = store.alive[slot] === 1;
    const visible = alive && ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0;
    const kind = store.kind[slot];
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    if (visible && kind === RenderKind.Text) {
      const quad = this.trackTextSlot(store, slot, projectionContext);
      const entry = this.texts.get(slot);
      if (entry !== undefined && entry.entityId === entityId) {
        applyTextProjection(entry, quad, this.transformMatrix);
        entry.vertices = quad.vertices;
        entry.object.visible = true;
      }
      return;
    } else if (visible && kind === RenderKind.Image) {
      const entry = this.images.get(slot);
      if (entry !== undefined && entry.entityId === entityId) {
        const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
        applyLeafProjection(
          entry.object,
          quad,
          this.transformMatrix,
          entry.object.texture.width,
          entry.object.texture.height,
        );
        entry.vertices = quad.vertices;
        entry.object.visible = true;
        return;
      }
    } else if (kind !== RenderKind.Text && kind !== RenderKind.Image) {
      return;
    }
    // Unexpected topology/visibility cannot use the transform-only promise.
    this.syncSlot(store, slot, projectionContext);
  }

  private syncText(
    store: RenderStoreView,
    slot: number,
    projectionContext?: PatchMapProjectionRenderContext,
    preparedQuad?: PatchMapResolvedRenderQuad,
  ): void {
    this.debugCache = null;
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    const quad = preparedQuad ?? this.trackTextSlot(store, slot, projectionContext);
    const projection = projectionContext?.index.textsByEntityId?.[entityId] ?? null;
    const value = projection?.visibleText ?? store.text[slot] ?? '';
    const routeStyle = textRenderStyle(store, slot, projection);
    const capability = this.options.resolveBitmapTextCapability?.(Object.freeze({
      entityId,
      text: value,
      style: routeStyle,
      projection,
    })) ?? null;
    const routeDecision = selectPatchMapTextRenderRoute({
      text: value,
      style: routeStyle,
      glyphResolution: textGlyphResolution(projection),
      bitmapCapability: capability,
    });
    const route = routeDecision.route;
    const style = textStyle(store, slot, routeStyle, projection?.authoredStyle);
    const objectStyleSignature = stableSerializeLeafValue({
      style,
      atlasId: routeDecision.atlas.atlasId,
    });
    const packedColor = (projection?.color ?? store.color[slot] ?? 0xffffffff) >>> 0;
    const alpha = combinedAlpha(packedColor, store.opacity[slot] ?? 1);
    const semanticSignatures = textSemanticSignatures(store, slot, projection);
    const rendererSignature = textRendererSignature(
      route,
      routeDecision.atlas.atlasId,
      value,
      routeStyle,
      alignName(store.align[slot] ?? RenderAlign.Left),
      projection?.authoredStyle ?? null,
      packedColor,
      alpha,
    );
    const attachedSignatures = freezeTextAttachedSignatures(
      semanticSignatures,
      rendererSignature,
    );
    const visibleGraphemeCount = countVisibleGraphemes(value);
    let entry = this.texts.get(slot);
    if (
      !entry ||
      entry.entityId !== entityId ||
      entry.attachedRoute !== route ||
      entry.objectStyleSignature !== objectStyleSignature
    ) {
      const previousPublication = entry?.entityId === entityId
        ? Object.freeze({
            signatures: entry.lastRenderedSignatures,
            frame: entry.lastRenderedFrame,
            visibleGraphemeCount: entry.lastRenderedVisibleGraphemeCount,
          })
        : null;
      this.removeMaterializedText(slot);
      const object = route === 'bitmap-text'
        ? new BitmapText({ text: value, style })
        : new Text({ text: value, style });
      object.eventMode = 'none';
      object.label = `patch-map:${route}`;
      entry = {
        slot,
        object,
        attachedRoute: route,
        entityId,
        objectStyleSignature,
        routeDecisionReason: routeDecision.reason,
        attachedSignatures,
        attachedVisibleGraphemeCount: visibleGraphemeCount,
        lastRenderedSignatures: previousPublication?.signatures ?? null,
        lastRenderedFrame: previousPublication?.frame ?? null,
        lastRenderedVisibleGraphemeCount: previousPublication?.visibleGraphemeCount ?? 0,
        targetKind: projection?.targetKind ?? null,
        visualLocalOrigin: measureStandaloneTextLocalOrigin(object, projection),
        vertices: EMPTY_QUAD_VERTICES,
      };
      this.texts.set(slot, entry);
      this.textParentForSlot(slot).addChild(object);
    } else if (entry.object.text !== value) {
      entry.object.text = value;
      entry.visualLocalOrigin = measureStandaloneTextLocalOrigin(entry.object, projection);
    }

    const targetKind = projection?.targetKind ?? null;
    if (entry.targetKind !== targetKind) {
      entry.targetKind = targetKind;
      entry.visualLocalOrigin = measureStandaloneTextLocalOrigin(entry.object, projection);
    }

    if (!sameTextAttachedSignatures(entry.attachedSignatures, attachedSignatures)) {
      entry.attachedSignatures = attachedSignatures;
      entry.attachedVisibleGraphemeCount = visibleGraphemeCount;
    }
    entry.routeDecisionReason = routeDecision.reason;
    if (
      entry.lastRenderedFrame === null ||
      !sameTextAttachedSignatures(entry.lastRenderedSignatures, entry.attachedSignatures)
    ) {
      this.pendingTextEntries.add(entry);
    } else {
      this.pendingTextEntries.delete(entry);
    }

    const object = entry.object;
    applyTextProjection(entry, quad, this.transformMatrix);
    entry.vertices = quad.vertices;
    if (this.textChunking) this.dirtyTextChunkKeys.add(textChunkKey(slot));
    object.alpha = alpha;
    object.tint = packedRgb(packedColor);
    object.visible = true;
    this.publishTextProbe(entry);
    this.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
      entityId,
      lane: 'text',
      rendererKind: 'text',
      primitiveCount: 1,
      renderObjectCount: 1,
      packedTint: packedColor,
      rgbTint: packedRgb(packedColor),
      alpha: object.alpha,
    }));
  }

  private publishTextProbe(entry: TextEntry): void {
    const current = entry.lastRenderedFrame !== null &&
      sameTextAttachedSignatures(entry.attachedSignatures, entry.lastRenderedSignatures);
    this.textProbesByEntityId.set(entry.entityId, freezeTextRendererProbe({
      entityId: entry.entityId,
      attachedRoute: entry.attachedRoute,
      objectKind: entry.attachedRoute,
      routeDecisionReason: entry.routeDecisionReason,
      objectCount: 1,
      semanticSignatures: freezeTextSemanticSignatures(entry.attachedSignatures),
      attachedSignatures: entry.attachedSignatures,
      lastRenderedSignatures: entry.lastRenderedSignatures,
      publicationStatus: current ? 'current' : 'pending',
      lastRenderedFrame: entry.lastRenderedFrame,
      staleGlyphCount: !current && entry.lastRenderedSignatures !== null
        ? entry.lastRenderedVisibleGraphemeCount
        : 0,
    }));
    this.textLastRenderedGraphemeCountByEntityId.set(
      entry.entityId,
      entry.lastRenderedVisibleGraphemeCount,
    );
  }

  private syncImage(
    store: RenderStoreView,
    slot: number,
    entityId: string,
    bindingKey: string,
    lane: LeafImageLane,
    projectionContext?: PatchMapProjectionRenderContext,
  ): void {
    this.indexVisibleImageBinding(slot, bindingKey);
    const binding = this.bindings.get(bindingKey);
    const resolved = binding?.state === 'resolved' && binding.texture !== undefined;
    const texture = resolved ? binding.texture! : Texture.WHITE;
    const bindingGeneration = binding?.generation ?? 0;
    const role: ImageEntry['role'] = resolved ? 'image' : 'asset-placeholder';
    let entry = this.images.get(slot);
    if (
      entry &&
      binding &&
      entry.entityId === entityId &&
      entry.bindingKey === bindingKey &&
      entry.bindingGeneration === bindingGeneration &&
      entry.role === role &&
      entry.object.texture !== texture
    ) {
      // Metadata still claims this is the current attachment, so a different
      // Texture cannot be explained by a pending->resolved role transition or
      // by an intentional generation replacement. Count the live invariant
      // violation before repairing it below.
      binding.staleAttachCount += 1;
      this.recordEntityStaleAttachment(entityId);
    }
    if (
      !entry ||
      entry.entityId !== entityId ||
      entry.bindingKey !== bindingKey ||
      entry.bindingGeneration !== bindingGeneration ||
      entry.role !== role ||
      entry.lane !== lane ||
      entry.object.texture !== texture
    ) {
      if (entry) this.removeImageEntry(slot);
      const object = new Sprite({ texture });
      object.eventMode = 'none';
      object.label = `${lane}:${role === 'image' ? 'image' : 'placeholder'}`;
      entry = {
        object,
        entityId,
        bindingKey,
        bindingGeneration,
        role,
        lane,
        vertices: EMPTY_QUAD_VERTICES,
      };
      this.addImageEntry(slot, entry);
    }
    const sprite = entry.object;
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    applyLeafProjection(
      sprite,
      quad,
      this.transformMatrix,
      texture.width,
      texture.height,
    );
    entry.vertices = quad.vertices;
    sprite.tint = role === 'image'
      ? packedRgb(store.tint[slot] ?? 0xffffffff)
      : PLACEHOLDER_TINT;
    sprite.alpha = role === 'image'
      ? combinedAlpha(store.tint[slot] ?? 0xffffffff, store.opacity[slot] ?? 1)
      : clampAlpha(store.opacity[slot] ?? 1);
    const zIndex = store.zIndex[slot] ?? 0;
    if (sprite.zIndex !== zIndex) {
      sprite.zIndex = zIndex;
      this.dirtyImageLanes.add(lane);
    }
    sprite.visible = true;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 1, role);
    this.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
      entityId,
      lane: publicImageLane(lane),
      rendererKind: 'sprite',
      primitiveCount: 1,
      renderObjectCount: 1,
      packedTint: (store.tint[slot] ?? 0xffffffff) >>> 0,
      rgbTint: Number(sprite.tint) >>> 0,
      alpha: sprite.alpha,
    }));
  }

  private removeText(slot: number): void {
    const entry = this.texts.get(slot);
    if (this.textEntityIdBySlot[slot] === undefined && entry === undefined) return;
    this.deferredTextSlots.delete(slot);
    const entityId = this.textEntityIdBySlot[slot] ?? entry?.entityId;
    this.textEntityIdBySlot[slot] = undefined;
    this.textVerticesBySlot[slot] = undefined;
    this.removeMaterializedText(slot);
    if (entityId !== undefined) {
      this.textProbesByEntityId.delete(entityId);
      this.textLastRenderedGraphemeCountByEntityId.delete(entityId);
      this.paintProbesByEntityId.delete(entityId);
    }
    if (this.textChunking) {
      const key = textChunkKey(slot);
      this.textChunks.get(key)?.slots.delete(slot);
      this.dirtyTextChunkKeys.add(key);
    }
  }

  private removeMaterializedText(slot: number): void {
    const entry = this.texts.get(slot);
    if (!entry) return;
    this.debugCache = null;
    this.texts.delete(slot);
    this.pendingTextEntries.delete(entry);
    this.textProbesByEntityId.delete(entry.entityId);
    this.textLastRenderedGraphemeCountByEntityId.delete(entry.entityId);
    this.paintProbesByEntityId.delete(entry.entityId);
    entry.object.destroy();
  }

  private trackTextSlot(
    store: RenderStoreView,
    slot: number,
    projectionContext?: PatchMapProjectionRenderContext,
  ): PatchMapResolvedRenderQuad {
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    const previousEntityId = this.textEntityIdBySlot[slot];
    if (previousEntityId !== undefined && previousEntityId !== entityId) {
      this.removeText(slot);
    }
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    this.textEntityIdBySlot[slot] = entityId;
    this.textVerticesBySlot[slot] = quad.vertices;
    if (this.textChunking) {
      if (previousEntityId === undefined) this.textParentForSlot(slot);
      this.dirtyTextChunkKeys.add(textChunkKey(slot));
    }
    return quad;
  }

  private textParentForSlot(slot: number): Container {
    if (!this.textChunking) return this.textContainer;
    const key = textChunkKey(slot);
    const existing = this.textChunks.get(key);
    if (existing !== undefined) {
      existing.slots.add(slot);
      this.dirtyTextChunkKeys.add(key);
      return existing.container;
    }
    const container = new Container({
      label: `PatchMap / text chunk ${key}`,
      sortableChildren: false,
    });
    container.eventMode = 'none';
    container.interactiveChildren = false;
    const chunk: TextChunk = {
      key,
      container,
      slots: new Set([slot]),
      vertices: EMPTY_QUAD_VERTICES,
      allChildrenVisible: true,
    };
    this.textChunks.set(key, chunk);
    this.dirtyTextChunkKeys.add(key);
    this.textChunkOrderDirty = true;
    this.textContainer.addChild(container);
    return container;
  }

  /**
   * Keep style/content texture regeneration out of already culled text chunks.
   * Geometry-only publication is never deferred because it can move a chunk
   * into the viewport. The latest columnar store remains the only source of
   * truth and is consumed when culling makes the chunk visible again.
   */
  private shouldDeferTextSync(store: RenderStoreView, slot: number): boolean {
    if (
      !this.textChunking ||
      store.alive[slot] !== 1 ||
      store.kind[slot] !== RenderKind.Text ||
      ((store.flags[slot] ?? 0) & RenderFlags.Visible) === 0
    ) return false;
    return this.textChunks.get(textChunkKey(slot))?.container.visible === false;
  }

  private materializeDeferredTextChunk(chunk: TextChunk): boolean {
    const store = this.deferredTextStore;
    if (store === null) return false;
    let changed = false;
    for (const slot of [...chunk.slots]) {
      const deferred = this.deferredTextSlots.delete(slot);
      if (!deferred && this.texts.has(slot)) continue;
      this.syncSlot(store, slot, this.deferredTextProjectionContext);
      changed = true;
    }
    if (changed) this.debugCache = null;
    return changed;
  }

  private rebuildDirtyTextChunks(): void {
    if (!this.textChunking || this.dirtyTextChunkKeys.size === 0) return;
    for (const key of this.dirtyTextChunkKeys) {
      const chunk = this.textChunks.get(key);
      if (chunk === undefined) continue;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const slot of chunk.slots) {
        const vertices = this.textVerticesBySlot[slot];
        if (vertices === undefined) continue;
        for (let index = 0; index < vertices.length; index += 2) {
          const x = vertices[index];
          const y = vertices[index + 1];
          if (x === undefined || y === undefined) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (!Number.isFinite(minX)) {
        chunk.container.destroy();
        this.textChunks.delete(key);
        this.textChunkOrderDirty = true;
        continue;
      }
      chunk.vertices = Object.freeze([
        minX, minY,
        maxX, minY,
        maxX, maxY,
        minX, maxY,
      ] as const);
    }
    this.dirtyTextChunkKeys.clear();
  }

  private sortTextChunks(): void {
    if (!this.textChunking || !this.textChunkOrderDirty) return;
    const containers = [...this.textChunks.values()]
      .sort((left, right) => left.key - right.key)
      .map(({ container }) => container);
    this.textContainer.removeChildren();
    if (containers.length > 0) this.textContainer.addChild(...containers);
    this.textChunkOrderDirty = false;
  }

  private confirmPendingTextEntry(entry: TextEntry, frame: number): void {
    entry.lastRenderedSignatures = entry.attachedSignatures;
    entry.lastRenderedFrame = frame;
    entry.lastRenderedVisibleGraphemeCount = entry.attachedVisibleGraphemeCount;
    this.publishTextProbe(entry);
    this.pendingTextEntries.delete(entry);
  }

  private observeImageSlot(
    store: RenderStoreView,
    slot: number,
    entityId: string,
    bindingKey: string,
    lane: LeafImageLane | null,
  ): void {
    const previousEntityId = this.imageEntityIdBySlot.get(slot);
    if (previousEntityId && previousEntityId !== entityId) {
      this.imageProbesByEntityId.delete(previousEntityId);
      this.paintProbesByEntityId.delete(previousEntityId);
    }
    this.imageEntityIdBySlot.set(slot, entityId);
    this.publishHiddenImageProbe(store, slot, entityId, bindingKey, lane);
  }

  private removeVisibleImage(
    store: RenderStoreView,
    slot: number,
    entityId: string,
    bindingKey: string,
    lane: LeafImageLane | null,
  ): void {
    this.removeImageEntry(slot);
    this.unindexVisibleImageBinding(slot);
    this.publishHiddenImageProbe(store, slot, entityId, bindingKey, lane);
  }

  private publishHiddenImageProbe(
    store: RenderStoreView,
    slot: number,
    entityId: string,
    bindingKey: string,
    lane: LeafImageLane | null,
  ): void {
    const bindingGeneration = this.bindings.get(bindingKey)?.generation ?? 0;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 0, 'none');
    if (lane === null) {
      this.paintProbesByEntityId.delete(entityId);
      return;
    }
    this.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
      entityId,
      lane: publicImageLane(lane),
      rendererKind: 'none',
      primitiveCount: 0,
      renderObjectCount: 0,
      packedTint: (store.tint[slot] ?? 0xffffffff) >>> 0,
      rgbTint: null,
      alpha: null,
    }));
  }

  private clearImageSlot(slot: number): void {
    this.removeImageEntry(slot);
    this.unindexVisibleImageBinding(slot);
    const entityId = this.imageEntityIdBySlot.get(slot);
    this.imageEntityIdBySlot.delete(slot);
    if (entityId) {
      this.imageProbesByEntityId.delete(entityId);
      this.paintProbesByEntityId.delete(entityId);
    }
  }

  private setImageProbe(
    _slot: number,
    entityId: string,
    bindingKey: string,
    bindingGeneration: number,
    renderObjectCount: 0 | 1,
    role: LeafAssetRenderRole,
  ): void {
    const previous = this.imageProbesByEntityId.get(entityId);
    this.imageProbesByEntityId.set(entityId, Object.freeze({
      entityId,
      renderObjectCount,
      role,
      bindingKey,
      bindingGeneration,
      staleAttachCount: previous?.staleAttachCount ?? 0,
      // Asset completion is generation-level evidence and never mutates a
      // Sprite directly. Do not copy one shared stale completion to every
      // consumer; the scene controller owns entity attempt history.
      staleCompletionCount: previous?.staleCompletionCount ?? 0,
    }));
  }

  private recordEntityStaleAttachment(entityId: string): void {
    const probe = this.imageProbesByEntityId.get(entityId);
    if (!probe) return;
    this.imageProbesByEntityId.set(entityId, Object.freeze({
      ...probe,
      staleAttachCount: (probe.staleAttachCount ?? 0) + 1,
    }));
  }

  private indexVisibleImageBinding(slot: number, bindingKey: string): void {
    if (this.imageBindingBySlot.get(slot) === bindingKey) {
      this.updateBindingConsumerCount(bindingKey);
      return;
    }
    this.unindexVisibleImageBinding(slot);
    this.imageBindingBySlot.set(slot, bindingKey);
    if (!bindingKey) return;
    const slots = this.imageSlotsByBinding.get(bindingKey) ?? new Set<number>();
    slots.add(slot);
    this.imageSlotsByBinding.set(bindingKey, slots);
    this.updateBindingConsumerCount(bindingKey);
  }

  private unindexVisibleImageBinding(slot: number): void {
    const key = this.imageBindingBySlot.get(slot);
    this.imageBindingBySlot.delete(slot);
    this.dirtyAssetSlots.delete(slot);
    if (!key) return;
    const slots = this.imageSlotsByBinding.get(key);
    slots?.delete(slot);
    if (slots?.size === 0) this.imageSlotsByBinding.delete(key);
    this.updateBindingConsumerCount(key);
  }

  private addImageEntry(slot: number, entry: ImageEntry): void {
    this.images.set(slot, entry);
    this.adjustBindingRenderCounts(entry, 1);
    imageLaneContainer(this, entry.lane).addChild(entry.object);
    this.dirtyImageLanes.add(entry.lane);
  }

  private removeImageEntry(slot: number): void {
    const entry = this.images.get(slot);
    if (!entry) return;
    this.images.delete(slot);
    this.adjustBindingRenderCounts(entry, -1);
    entry.object.destroy();
    this.dirtyImageLanes.add(entry.lane);
  }

  private adjustBindingRenderCounts(entry: ImageEntry, delta: 1 | -1): void {
    const binding = this.bindings.get(entry.bindingKey);
    if (!binding || binding.generation !== entry.bindingGeneration) return;
    binding.renderObjectCount += delta;
    if (entry.role === 'asset-placeholder') binding.placeholderCount += delta;
    if (binding.renderObjectCount < 0 || binding.placeholderCount < 0) {
      throw new Error('PatchMap image binding render counter underflow');
    }
  }

  private updateBindingConsumerCount(key: string): void {
    const binding = this.bindings.get(key);
    if (binding) binding.consumerCount = this.imageSlotsByBinding.get(key)?.size ?? 0;
  }

  private isCurrentBinding(binding: LeafAssetBinding): boolean {
    return !this.destroyed && this.bindings.get(binding.key) === binding;
  }

  private allocateBindingGeneration(): number {
    if (this.nextBindingGeneration >= Number.MAX_SAFE_INTEGER) {
      throw new Error('PatchMap asset binding generation exhausted');
    }
    this.nextBindingGeneration += 1;
    return this.nextBindingGeneration;
  }

  private recordStaleCompletion(key: string): void {
    if (this.destroyed) return;
    this.debugCache = null;
    this.staleCompletionCount += 1;
    const current = this.bindings.get(key);
    if (current) current.staleCompletionCount += 1;
  }

  private sortImageChildren(): void {
    if (this.dirtyImageLanes.size === 0) return;
    for (const lane of this.dirtyImageLanes) this.sortImageLaneChildren(lane);
    this.dirtyImageLanes.clear();
  }

  private sortImageLaneChildren(lane: LeafImageLane): void {
    const container = imageLaneContainer(this, lane);
    const ordered = [...this.images.entries()]
      .filter(([, entry]) => entry.lane === lane)
      .sort(([leftSlot, left], [rightSlot, right]) => (
        left.object.zIndex - right.object.zIndex ||
        leftSlot - rightSlot ||
        left.entityId.localeCompare(right.entityId)
      ));
    const orderedChildren = ordered.map(([, entry]) => entry.object);
    const orderChanged = orderedChildren.length !== container.children.length ||
      orderedChildren.some((child, index) => container.children[index] !== child);
    if (orderChanged) {
      // Repeated setChildIndex calls splice Pixi's child array and can turn a
      // reverse permutation into quadratic work. Detach once, then append the
      // complete public child order in bounded batches so arbitrarily large
      // scenes do not depend on the engine's variadic argument limit.
      container.removeChildren();
      for (let start = 0; start < orderedChildren.length; start += IMAGE_CHILD_APPEND_BATCH_SIZE) {
        container.addChild(
          ...orderedChildren.slice(start, start + IMAGE_CHILD_APPEND_BATCH_SIZE),
        );
      }
    }
    // Assigning a child zIndex lets Pixi opt the parent back into z-only
    // sorting. Disable it after applying the stronger deterministic order.
    container.sortableChildren = false;
  }

  private clearDisplayObjects(): void {
    this.debugCache = null;
    for (const entry of this.texts.values()) entry.object.destroy();
    for (const entry of this.images.values()) entry.object.destroy();
    this.texts.clear();
    this.textEntityIdBySlot.length = 0;
    this.textVerticesBySlot.length = 0;
    this.textProbesByEntityId.clear();
    this.textLastRenderedGraphemeCountByEntityId.clear();
    this.pendingTextEntries.clear();
    this.deferredTextSlots.clear();
    this.deferredTextStore = null;
    this.deferredTextProjectionContext = undefined;
    for (const chunk of this.textChunks.values()) chunk.container.destroy();
    this.textChunks.clear();
    this.dirtyTextChunkKeys.clear();
    this.textChunkOrderDirty = false;
    this.textChunking = false;
    this.images.clear();
    this.imageBindingBySlot.clear();
    this.imageSlotsByBinding.clear();
    this.imageEntityIdBySlot.clear();
    this.imageProbesByEntityId.clear();
    this.paintProbesByEntityId.clear();
    this.dirtyAssetSlots.clear();
    for (const binding of this.bindings.values()) {
      binding.consumerCount = 0;
      binding.renderObjectCount = 0;
      binding.placeholderCount = 0;
    }
    this.dirtyImageLanes.clear();
    this.textContainer.removeChildren();
    this.standaloneAssetContainer.removeChildren();
    this.backgroundAssetContainer.removeChildren();
    this.contentAssetContainer.removeChildren();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AggregateLeafLayer is destroyed');
  }
}

function textChunkKey(slot: number): number {
  return Math.floor(slot / TEXT_CHUNK_SLOT_SPAN);
}

function imageLane(
  entityId: string,
  projectionContext?: PatchMapProjectionRenderContext,
): LeafImageLane | null {
  const component = projectionContext?.index.componentsByEntityId?.[entityId];
  if (component === undefined) return 'standalone-assets';
  if (component.renderRole === 'background-asset') return 'background-assets';
  if (component.renderRole === 'content-asset') return 'content-assets';
  return null;
}

function quadIntersectsViewport(
  vertices: PatchMapQuadVertices,
  matrix: Matrix,
  width: number,
  height: number,
  padding: number,
): boolean {
  return quadViewportCoverage(
    vertices,
    matrix,
    width,
    height,
    padding,
  ) !== 'outside';
}

function quadViewportCoverage(
  vertices: PatchMapQuadVertices,
  matrix: Matrix,
  width: number,
  height: number,
  padding: number,
): 'outside' | 'partial' | 'inside' {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index]!;
    const y = vertices[index + 1]!;
    const screenX = matrix.a * x + matrix.c * y + matrix.tx;
    const screenY = matrix.b * x + matrix.d * y + matrix.ty;
    minX = Math.min(minX, screenX);
    minY = Math.min(minY, screenY);
    maxX = Math.max(maxX, screenX);
    maxY = Math.max(maxY, screenY);
  }
  if (
    maxX < -padding ||
    minX > width + padding ||
    maxY < -padding ||
    minY > height + padding
  ) {
    return 'outside';
  }
  return (
    minX >= -padding &&
    maxX <= width + padding &&
    minY >= -padding &&
    maxY <= height + padding
  )
    ? 'inside'
    : 'partial';
}

function imageLaneContainer(
  layer: AggregateLeafLayer,
  lane: LeafImageLane,
): Container {
  if (lane === 'standalone-assets') return layer.standaloneAssetContainer;
  return lane === 'background-assets'
    ? layer.backgroundAssetContainer
    : layer.contentAssetContainer;
}

function publicImageLane(lane: LeafImageLane): 'background-assets' | 'content-assets' {
  return lane === 'background-assets' ? 'background-assets' : 'content-assets';
}

function freezeLaneProbe(
  role: PatchMapRenderLaneProbe['role'],
  label: string,
  visiblePrimitiveCount: number,
): PatchMapRenderLaneProbe {
  return Object.freeze({
    role,
    label,
    renderObjectCount: visiblePrimitiveCount,
    visiblePrimitiveCount,
  });
}

function freezeEntityPaintProbe(
  probe: PatchMapEntityPaintProbe,
): PatchMapEntityPaintProbe {
  return Object.freeze({ ...probe });
}

function normalizeLeafAssetBindingRequest(
  request: LeafAssetBindingRequest,
): NormalizedLeafAssetBindingRequest {
  if (request.kind === 'alias') {
    const alias = nonempty(request.alias, 'asset alias');
    const frozenRequest = Object.freeze({ kind: 'alias' as const, alias });
    return Object.freeze({
      request: frozenRequest,
      signature: `alias:${JSON.stringify(alias)}`,
      sourceKind: 'alias' as const,
      acquire: (session: PatchMapAssetSession) => session.acquire(alias),
    });
  }
  if (request.kind !== 'source') throw new TypeError('asset binding kind must be alias or source');
  const descriptor = normalizePatchMapAssetDescriptor(request.source);
  const sourceKind: LeafAssetSourceKind = typeof request.source === 'string'
    ? /^data:/i.test(descriptor.src)
      ? 'data-uri'
      : 'url'
    : 'descriptor';
  const source: PatchMapAssetSource = typeof request.source === 'string'
    ? descriptor.src
    : descriptor;
  const frozenRequest = Object.freeze({ kind: 'source' as const, source });
  return Object.freeze({
    request: frozenRequest,
    signature: `source:${sourceKind}:${stableSerializeLeafValue(descriptor)}`,
    sourceKind,
    acquire: (session: PatchMapAssetSession) => session.acquireSource(source),
  });
}

function bindingObservation(
  binding: LeafAssetBinding,
  status: LeafAssetBindingObservation['status'],
): LeafAssetBindingObservation {
  return Object.freeze({
    key: binding.key,
    generation: binding.generation,
    status,
    cacheIdentity: binding.cacheIdentity,
    normalizedResourceIdentity: binding.normalizedResourceIdentity,
    reusedResolvedResource: binding.reusedResolvedResource,
    naturalSize: binding.naturalSize,
  });
}

function staleBindingObservation(binding: LeafAssetBinding): LeafAssetBindingObservation {
  return Object.freeze({
    key: binding.key,
    generation: binding.generation,
    status: 'stale',
    cacheIdentity: null,
    normalizedResourceIdentity: null,
    reusedResolvedResource: false,
    naturalSize: null,
  });
}

function textureNaturalSize(texture: Texture): readonly [number, number] {
  const width = texture.width;
  const height = texture.height;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('asset texture dimensions must be positive and finite');
  }
  return Object.freeze([width, height] as const);
}

function requireTexture(value: unknown): Texture {
  if (value instanceof Texture) return value as Texture;
  throw new TypeError('asset did not resolve to a Pixi Texture');
}

function rangesContainSlot(ranges: readonly SlotRange[], slot: number): boolean {
  return ranges.some((range) => slot >= range.start && slot < range.end);
}

function packedRgb(value: number): number {
  return (value >>> 8) & 0xffffff;
}

function combinedAlpha(value: number, opacity: number): number {
  return clampAlpha(opacity * ((value & 0xff) / 255));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyLeafProjection(
  object: Sprite | BitmapText | Text,
  quad: PatchMapResolvedRenderQuad,
  matrix: Matrix,
  naturalWidth?: number,
  naturalHeight?: number,
): void {
  object.anchor.set(0.5);

  // Never assign DisplayObject.width/height: those accessors include current
  // scale, erase reflection signs, and force text raster measurement. Feed the
  // exact signed/sheared affine through Pixi's public Matrix API instead.
  const localWidth = naturalWidth ?? quad.projection?.localBounds[2] ?? quad.width;
  const localHeight = naturalHeight ?? quad.projection?.localBounds[3] ?? quad.height;
  const resolvedWidth = Math.max(Number.EPSILON, Math.abs(localWidth));
  const resolvedHeight = Math.max(Number.EPSILON, Math.abs(localHeight));
  const xScale = quad.width / resolvedWidth;
  const yScale = quad.height / resolvedHeight;
  object.setFromMatrix(matrix.set(
    quad.basis[0] * xScale,
    quad.basis[1] * xScale,
    quad.basis[2] * yScale,
    quad.basis[3] * yScale,
    quad.center[0],
    quad.center[1],
  ));
}

function applyTextProjection(
  entry: TextEntry,
  quad: PatchMapResolvedRenderQuad,
  matrix: Matrix,
): void {
  if (entry.targetKind !== 'element') {
    applyLeafProjection(entry.object, quad, matrix);
    return;
  }

  const object = entry.object;
  object.anchor.set(0);
  const localWidth = quad.projection?.localBounds[2] ?? quad.width;
  const localHeight = quad.projection?.localBounds[3] ?? quad.height;
  const resolvedWidth = Math.max(Number.EPSILON, Math.abs(localWidth));
  const resolvedHeight = Math.max(Number.EPSILON, Math.abs(localHeight));
  const xScale = quad.width / resolvedWidth;
  const yScale = quad.height / resolvedHeight;
  const a = quad.basis[0] * xScale;
  const b = quad.basis[1] * xScale;
  const c = quad.basis[2] * yScale;
  const d = quad.basis[3] * yScale;
  const [originX, originY] = entry.visualLocalOrigin;
  const topLeftX = quad.vertices[0];
  const topLeftY = quad.vertices[1];
  object.setFromMatrix(matrix.set(
    a,
    b,
    c,
    d,
    topLeftX - a * originX - c * originY,
    topLeftY - b * originX - d * originY,
  ));
}

/** Cache the browser-measured Pixi origin only when text content/style is rebuilt. */
function measureStandaloneTextLocalOrigin(
  object: BitmapText | Text,
  projection: PatchMapTextProjection | null,
): readonly [number, number] {
  if (projection?.targetKind !== 'element') return Object.freeze([0, 0] as const);
  object.anchor.set(0);
  if (typeof document === 'undefined') return Object.freeze([0, 0] as const);
  const bounds = object.getLocalBounds();
  const x = Number.isFinite(bounds.minX) ? bounds.minX : 0;
  const y = Number.isFinite(bounds.minY) ? bounds.minY : 0;
  return Object.freeze([x, y] as const);
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be non-empty`);
  }
  return value.trim();
}
