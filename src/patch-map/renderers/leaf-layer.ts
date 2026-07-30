import {
  BitmapText,
  Container,
  Matrix,
  Sprite,
  Text,
  Texture,
  type TextStyleOptions,
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
import { segmentPatchMapGraphemes } from '../semantic/text-layout';
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
  type PatchMapTextSemanticSignatures,
} from './types';

interface TextEntry {
  readonly slot: number;
  readonly object: BitmapText | Text;
  readonly route: PatchMapTextRenderRoute;
  readonly entityId: string;
  readonly objectStyleSignature: string;
  routeReason: PatchMapTextRenderRouteReason;
  attachedSignatures: PatchMapTextAttachedSignatures;
  attachedVisibleGraphemeCount: number;
  lastRenderedSignatures: PatchMapTextAttachedSignatures | null;
  lastRenderedFrame: number | null;
  lastRenderedVisibleGraphemeCount: number;
  vertices: PatchMapQuadVertices;
}

interface TextChunk {
  readonly key: number;
  readonly container: Container;
  readonly slots: Set<number>;
  vertices: PatchMapQuadVertices;
  allChildrenVisible: boolean;
}

type LeafImageLane = 'background-assets' | 'content-assets';

interface ImageEntry {
  readonly object: Sprite;
  readonly entityId: string;
  readonly bindingKey: string;
  readonly bindingGeneration: number;
  readonly role: Exclude<LeafAssetRenderRole, 'none'>;
  readonly lane: LeafImageLane;
  vertices: PatchMapQuadVertices;
}

export type LeafAssetSourceKind = 'alias' | 'url' | 'data-uri' | 'descriptor';
export type LeafAssetBindingState = 'pending' | 'resolved' | 'failed';
export type LeafAssetRenderRole = 'image' | 'asset-placeholder' | 'none';

export type LeafAssetBindingRequest =
  | Readonly<{ readonly kind: 'alias'; readonly alias: string }>
  | Readonly<{ readonly kind: 'source'; readonly source: PatchMapAssetSource }>;

export interface LeafAssetBindingObservation {
  readonly key: string;
  readonly generation: number;
  readonly status: 'attached' | 'stale';
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly reusedResolvedResource: boolean;
  readonly naturalSize: readonly [number, number] | null;
}

export interface LeafAssetBindingProbe {
  readonly key: string;
  readonly generation: number;
  readonly request: LeafAssetBindingRequest;
  readonly sourceKind: LeafAssetSourceKind;
  readonly state: LeafAssetBindingState;
  readonly attached: boolean;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly reusedResolvedResource: boolean;
  readonly naturalSize: readonly [number, number] | null;
  readonly consumerCount: number;
  readonly renderObjectCount: number;
  readonly placeholderCount: number;
  readonly renderRole: LeafAssetRenderRole;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
}

export interface LeafSceneImageProbe {
  readonly entityId: string;
  readonly renderObjectCount: 0 | 1;
  readonly role: LeafAssetRenderRole;
  readonly bindingKey: string;
  readonly bindingGeneration: number;
  readonly staleAttachCount?: number;
  readonly staleCompletionCount?: number;
}

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
  readonly fallbackTextCount: number;
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
  /** Compatibility alias: pre-component images are content assets. */
  public readonly imageContainer = this.contentAssetContainer;
  public readonly textContainer = new Container({ label: 'PatchMap / text (0)' });

  private readonly texts = new Map<number, TextEntry>();
  private readonly textProbesByEntityId = new Map<string, PatchMapTextRendererProbe>();
  private readonly textLastRenderedGraphemeCountByEntityId = new Map<string, number>();
  private readonly pendingTextEntries = new Set<TextEntry>();
  private readonly textChunks = new Map<number, TextChunk>();
  private readonly dirtyTextChunkKeys = new Set<number>();
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
    this.backgroundAssetContainer.eventMode = 'none';
    this.backgroundAssetContainer.interactiveChildren = false;
    this.backgroundAssetContainer.sortableChildren = false;
    this.contentAssetContainer.eventMode = 'none';
    this.contentAssetContainer.interactiveChildren = false;
    this.contentAssetContainer.sortableChildren = false;
    this.container.addChild(
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

    if (fullRebuild || !options.changedRanges) {
      for (let slot = 0; slot < store.capacity; slot += 1) {
        this.syncSlot(store, slot, options.projectionContext);
      }
    } else {
      for (const range of options.changedRanges) {
        const start = Math.max(0, range.start);
        const end = Math.min(store.capacity, range.end);
        for (let slot = start; slot < end; slot += 1) {
          if (options.projectionTransformOnly === true) {
            this.syncSlotProjectionOnly(store, slot, options.projectionContext);
          } else {
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
      for (const chunk of this.textChunks.values()) {
        const coverage = quadViewportCoverage(
          chunk.vertices,
          worldMatrix,
          viewportWidth,
          viewportHeight,
          padding,
        );
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
      if (entry.route === 'bitmap-text') bitmapTextCount += 1;
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
      fallbackTextCount: this.texts.size - bitmapTextCount,
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
    if (kind === RenderKind.Text) this.syncText(store, slot, projectionContext);
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
      const entry = this.texts.get(slot);
      if (entry !== undefined && entry.entityId === entityId) {
        const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
        applyLeafProjection(entry.object, quad, this.transformMatrix);
        entry.vertices = quad.vertices;
        if (this.textChunking) this.dirtyTextChunkKeys.add(textChunkKey(slot));
        entry.object.visible = true;
        return;
      }
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
  ): void {
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
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
    const objectStyleSignature = stableSerialize({
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
      entry.route !== route ||
      entry.objectStyleSignature !== objectStyleSignature
    ) {
      const previousPublication = entry?.entityId === entityId
        ? Object.freeze({
            signatures: entry.lastRenderedSignatures,
            frame: entry.lastRenderedFrame,
            visibleGraphemeCount: entry.lastRenderedVisibleGraphemeCount,
          })
        : null;
      this.removeText(slot);
      const object = route === 'bitmap-text'
        ? new BitmapText({ text: value, style })
        : new Text({ text: value, style });
      object.eventMode = 'none';
      object.label = `patch-map:${route}`;
      entry = {
        slot,
        object,
        route,
        entityId,
        objectStyleSignature,
        routeReason: routeDecision.reason,
        attachedSignatures,
        attachedVisibleGraphemeCount: visibleGraphemeCount,
        lastRenderedSignatures: previousPublication?.signatures ?? null,
        lastRenderedFrame: previousPublication?.frame ?? null,
        lastRenderedVisibleGraphemeCount: previousPublication?.visibleGraphemeCount ?? 0,
        vertices: EMPTY_QUAD_VERTICES,
      };
      this.texts.set(slot, entry);
      this.textParentForSlot(slot).addChild(object);
    } else if (entry.object.text !== value) {
      entry.object.text = value;
    }

    if (!sameTextAttachedSignatures(entry.attachedSignatures, attachedSignatures)) {
      entry.attachedSignatures = attachedSignatures;
      entry.attachedVisibleGraphemeCount = visibleGraphemeCount;
    }
    entry.routeReason = routeDecision.reason;
    if (
      entry.lastRenderedFrame === null ||
      !sameTextAttachedSignatures(entry.lastRenderedSignatures, entry.attachedSignatures)
    ) {
      this.pendingTextEntries.add(entry);
    } else {
      this.pendingTextEntries.delete(entry);
    }

    const object = entry.object;
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    applyLeafProjection(
      object,
      quad,
      this.transformMatrix,
    );
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
      route: entry.route,
      rendererKind: entry.route,
      routeReason: entry.routeReason,
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
      lane,
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
    if (!entry) return;
    this.texts.delete(slot);
    this.pendingTextEntries.delete(entry);
    this.textProbesByEntityId.delete(entry.entityId);
    this.textLastRenderedGraphemeCountByEntityId.delete(entry.entityId);
    this.paintProbesByEntityId.delete(entry.entityId);
    if (this.textChunking) {
      const key = textChunkKey(slot);
      this.textChunks.get(key)?.slots.delete(slot);
      this.dirtyTextChunkKeys.add(key);
    }
    entry.object.destroy();
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
        const vertices = this.texts.get(slot)?.vertices;
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
    const bindingGeneration = this.bindings.get(bindingKey)?.generation ?? 0;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 0, 'none');
    if (lane === null) {
      this.paintProbesByEntityId.delete(entityId);
      return;
    }
    this.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
      entityId,
      lane,
      rendererKind: 'none',
      primitiveCount: 0,
      renderObjectCount: 0,
      packedTint: (store.tint[slot] ?? 0xffffffff) >>> 0,
      rgbTint: null,
      alpha: null,
    }));
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
    const bindingGeneration = this.bindings.get(bindingKey)?.generation ?? 0;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 0, 'none');
    if (lane === null) {
      this.paintProbesByEntityId.delete(entityId);
      return;
    }
    this.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
      entityId,
      lane,
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
    this.textProbesByEntityId.clear();
    this.textLastRenderedGraphemeCountByEntityId.clear();
    this.pendingTextEntries.clear();
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
  if (component === undefined) return 'content-assets';
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
  return lane === 'background-assets'
    ? layer.backgroundAssetContainer
    : layer.contentAssetContainer;
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
    signature: `source:${sourceKind}:${stableSerialize(descriptor)}`,
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

export function isBitmapTextSafe(value: string): boolean {
  return value.length <= 128 && /^[\x20-\x7e\n\r\t]*$/.test(value);
}

function textStyle(
  store: RenderStoreView,
  slot: number,
  routeStyle: PatchMapTextRenderStyle,
  authoredStyle: PatchMapTextProjection['authoredStyle'] | undefined,
): TextStyleOptions {
  const stroke = pixiTextStroke(authoredStyle);
  return {
    fontFamily: routeStyle.fontFamily,
    fontSize: routeStyle.fontSize,
    fontWeight: pixiTextFontWeight(routeStyle.fontWeight),
    fontStyle: routeStyle.fontStyle,
    lineHeight: routeStyle.lineHeight,
    letterSpacing: routeStyle.letterSpacing,
    // Semantic layout already supplied explicit line breaks and clipping text.
    wordWrap: false,
    // Keep the raster white and apply exact packed paint through leaf tint.
    fill: 0xffffff,
    ...(stroke === undefined ? {} : { stroke }),
    align: alignName(store.align[slot] ?? RenderAlign.Left),
  };
}

function pixiTextStroke(
  authoredStyle: PatchMapTextProjection['authoredStyle'] | undefined,
): TextStyleOptions['stroke'] | undefined {
  const stroke = authoredStyle?.stroke;
  if (stroke === undefined) return undefined;
  const width = authoredStyle?.strokeWidth;
  if (
    (typeof stroke === 'string' || typeof stroke === 'number') &&
    typeof width === 'number' &&
    Number.isFinite(width)
  ) {
    return { color: stroke, width };
  }
  return stroke as TextStyleOptions['stroke'];
}

function textRenderStyle(
  store: RenderStoreView,
  slot: number,
  projection: PatchMapTextProjection | null,
): PatchMapTextRenderStyle {
  const authored = projection?.authoredStyle;
  const fontFamily = textFontFamily(authored?.fontFamily, store.fontFamily[slot]);
  const fontWeight = textFontWeight(authored?.fontWeight, store.fontWeight[slot]);
  const fontStyle = textFontStyle(authored?.fontStyle);
  const align = alignName(store.align[slot] ?? RenderAlign.Left);
  return Object.freeze({
    fontFamily,
    fontSize: projection?.fontSizePx ?? Math.max(1, store.fontSize[slot] ?? 16),
    fontWeight,
    fontStyle,
    lineHeight: projection?.lineHeightPx ?? Math.max(1, store.fontSize[slot] ?? 16) * 1.2,
    letterSpacing: projection?.letterSpacingPx ?? 0,
    advancedFeatures: textAdvancedFeatures(authored, align),
  });
}

function textGlyphResolution(
  projection: PatchMapTextProjection | null,
): Readonly<{ missingGlyphCount: number; fallbackGlyphCount: number }> {
  if (projection === null) {
    return Object.freeze({ missingGlyphCount: 0, fallbackGlyphCount: 0 });
  }
  const missingGlyphCount = projection.missingGlyphs.reduce(
    (count, missing) => count + missing.count,
    0,
  );
  const fallbackGlyphCount = projection.visibleFontRuns.reduce(
    (count, run) => count + (
      run.fallbackReason === undefined ? 0 : countVisibleGraphemes(run.text)
    ),
    0,
  );
  return Object.freeze({ missingGlyphCount, fallbackGlyphCount });
}

function textSemanticSignatures(
  store: RenderStoreView,
  slot: number,
  projection: PatchMapTextProjection | null,
): PatchMapTextSemanticSignatures {
  if (projection !== null) {
    return freezeTextSemanticSignatures({
      content: projection.contentSignature,
      style: projection.styleSignature,
      layout: projection.layoutSignature,
    });
  }
  const text = store.text[slot] ?? '';
  const style = [
    store.fontFamily[slot] || 'Arial',
    store.fontSize[slot] ?? 16,
    store.fontWeight[slot] ?? 400,
    store.align[slot] ?? RenderAlign.Left,
  ];
  return freezeTextSemanticSignatures({
    content: stableSerialize(['dense-text-content/v1', text]),
    style: stableSerialize(['dense-text-style/v1', ...style]),
    layout: stableSerialize([
      'dense-text-layout/v1',
      text,
      ...style,
      store.width[slot] ?? 0,
      store.height[slot] ?? 0,
    ]),
  });
}

function textRendererSignature(
  route: PatchMapTextRenderRoute,
  atlasId: string | null,
  text: string,
  style: PatchMapTextRenderStyle,
  align: 'left' | 'center' | 'right',
  authoredStyle: PatchMapTextProjection['authoredStyle'] | null,
  packedColor: number,
  alpha: number,
): string {
  return stableSerialize({
    revision: 'core-v2-text-renderer/1',
    route,
    atlasId,
    text,
    style,
    align,
    authoredStyle,
    paint: { packedColor, alpha },
  });
}

function freezeTextSemanticSignatures(
  signatures: PatchMapTextSemanticSignatures,
): PatchMapTextSemanticSignatures {
  return Object.freeze({
    content: signatures.content,
    style: signatures.style,
    layout: signatures.layout,
  });
}

function freezeTextAttachedSignatures(
  semantic: PatchMapTextSemanticSignatures,
  renderer: string,
): PatchMapTextAttachedSignatures {
  return Object.freeze({
    content: semantic.content,
    style: semantic.style,
    layout: semantic.layout,
    renderer,
  });
}

function sameTextAttachedSignatures(
  left: PatchMapTextAttachedSignatures | null,
  right: PatchMapTextAttachedSignatures | null,
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

function freezeTextRendererProbe(probe: PatchMapTextRendererProbe): PatchMapTextRendererProbe {
  return Object.freeze({
    ...probe,
    semanticSignatures: freezeTextSemanticSignatures(probe.semanticSignatures),
    attachedSignatures: probe.attachedSignatures === null
      ? null
      : freezeTextAttachedSignatures(probe.attachedSignatures, probe.attachedSignatures.renderer),
    lastRenderedSignatures: probe.lastRenderedSignatures === null
      ? null
      : freezeTextAttachedSignatures(
          probe.lastRenderedSignatures,
          probe.lastRenderedSignatures.renderer,
        ),
  });
}

function countVisibleGraphemes(text: string): number {
  let count = 0;
  for (const grapheme of segmentPatchMapGraphemes(text)) {
    if (grapheme !== '\n' && grapheme !== '\r' && grapheme !== '\r\n') count += 1;
  }
  return count;
}

function textFontFamily(authored: unknown, dense: string | undefined): string {
  if (typeof authored === 'string' && authored.length > 0) return authored;
  if (Array.isArray(authored)) {
    const family = authored.find((value): value is string => (
      typeof value === 'string' && value.length > 0
    ));
    if (family !== undefined) return family;
  }
  return dense && dense.length > 0 ? dense : 'Arial';
}

function textFontWeight(authored: unknown, dense: number | undefined): number {
  const resolvedAuthored = authoredTextFontWeight(authored);
  if (resolvedAuthored !== null) return resolvedAuthored;
  if (validTextFontWeight(dense)) return dense;
  return 400;
}

function authoredTextFontWeight(value: unknown): number | null {
  if (value === 'bold' || value === 'bolder') return 700;
  if (value === 'normal') return 400;
  if (value === 'lighter') return 300;
  if (validTextFontWeight(value)) return value;
  if (typeof value === 'string' && /^(?:[1-9]00)$/.test(value)) return Number(value);
  return null;
}

function pixiTextFontWeight(value: number): NonNullable<TextStyleOptions['fontWeight']> {
  if (value === 400) return 'normal';
  if (value === 700) return 'bold';
  return String(value) as NonNullable<TextStyleOptions['fontWeight']>;
}

function textFontStyle(value: unknown): PatchMapTextRenderStyle['fontStyle'] {
  return value === 'italic' || value === 'oblique' ? value : 'normal';
}

const TEXT_SEMANTIC_STYLE_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fill',
  'align',
  'wordWrap',
  'wordWrapWidth',
  'breakWords',
  'lineHeight',
  'letterSpacing',
  'autoFont',
  'overflow',
]);

function textAdvancedFeatures(
  authored: PatchMapTextProjection['authoredStyle'] | undefined,
  align: 'left' | 'center' | 'right',
): readonly string[] {
  const features = authored === undefined
    ? []
    : Object.keys(authored).filter((key) => !TEXT_SEMANTIC_STYLE_KEYS.has(key));
  if (align !== 'left') features.push(`align:${align}`);
  if (authored?.fontWeight !== undefined && authoredTextFontWeight(authored.fontWeight) === null) {
    features.push('fontWeight:invalid');
  }
  return Object.freeze([...new Set(features)].sort());
}

function validTextFontWeight(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 900;
}

function alignName(value: number): 'left' | 'center' | 'right' {
  if (value === RenderAlign.Center) return 'center';
  if (value === RenderAlign.Right) return 'right';
  return 'left';
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

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be non-empty`);
  }
  return value.trim();
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('asset descriptor must contain JSON values');
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
