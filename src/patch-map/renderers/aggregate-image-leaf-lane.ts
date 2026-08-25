import {
  Container,
  Sprite,
  Texture,
  type Matrix,
} from 'pixi.js';

import {
  createPatchMapLeafAssetSession,
  normalizePatchMapAssetDescriptor,
  type PatchMapAssetAcquisition,
  type PatchMapAssetSession,
} from '../assets';
import {
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';
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
import { stableSerializeLeafValue } from './leaf-signatures';
import {
  applyLeafProjection,
  quadIntersectsViewport,
} from './leaf-projection';
import {
  resolvePatchMapSlotQuad,
  type PatchMapEntityPaintProbe,
  type PatchMapProjectionRenderContext,
  type PatchMapQuadVertices,
  type PatchMapRenderLaneProbe,
} from './types';

type LeafImageLane = 'standalone-assets' | 'background-assets' | 'content-assets';

interface ImageEntry {
  readonly object: Sprite;
  readonly entityId: string;
  bindingKey: string;
  bindingGeneration: number;
  role: 'image';
  lane: LeafImageLane;
  resource: LeafAssetResource;
  counted: boolean;
  vertices: PatchMapQuadVertices;
}

interface LeafAssetResource {
  readonly acquisition: PatchMapAssetAcquisition;
  readonly texture: Texture;
  entryCount: number;
  bindingOwned: boolean;
  releaseQueued: boolean;
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

export interface AggregateImageLeafLaneOptions {
  readonly assetSession?: PatchMapAssetSession;
  readonly ownsAssetSession?: boolean;
  readonly paintProbesByEntityId: Map<string, PatchMapEntityPaintProbe>;
  readonly transformMatrix: Matrix;
  readonly onBindingTransition?: (transition: LeafAssetBindingTransition) => void;
  readonly onDebugChange: () => void;
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
  resource?: LeafAssetResource;
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

export interface AggregateImageLeafLaneDebugCounts {
  readonly imageCount: number;
  readonly loadedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly pendingAssetCount: number;
  readonly failedAssetCount: number;
  readonly placeholderCount: number;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
}

const IMAGE_CHILD_APPEND_BATCH_SIZE = 1_024;
const EMPTY_QUAD_VERTICES: PatchMapQuadVertices = Object.freeze([
  0, 0,
  0, 0,
  0, 0,
  0, 0,
]);

export class AggregateImageLeafLane {
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
    sortableChildren: false,
  });
  public readonly imageContainer = this.standaloneAssetContainer;

  private readonly images = new Map<number, ImageEntry>();
  private readonly imageBindingBySlot = new Map<number, string>();
  private readonly imageSlotsByBinding = new Map<string, Set<number>>();
  private readonly imageEntityIdBySlot = new Map<number, string>();
  private readonly imageProbesByEntityId = new Map<string, LeafSceneImageProbe>();
  private readonly bindings = new Map<string, LeafAssetBinding>();
  private readonly hostAssetBindingKeyByAlias = new Map<string, string>();
  private readonly framePendingAssetReleases: PatchMapAssetAcquisition[] = [];
  private readonly readyAssetReleases: PatchMapAssetAcquisition[] = [];
  private readonly dirtyAssetSlots = new Set<number>();
  private retainedImagesByEntityId: Map<string, ImageEntry> | null = null;
  private nextBindingGeneration = 0;
  private staleCompletionCount = 0;
  private readonly dirtyImageLanes = new Set<LeafImageLane>();
  private destroyed = false;

  private readonly assetSession: PatchMapAssetSession;
  private readonly ownsAssetSession: boolean;

  public constructor(private readonly options: AggregateImageLeafLaneOptions) {
    this.assetSession = options.assetSession ?? createPatchMapLeafAssetSession();
    this.ownsAssetSession = options.ownsAssetSession ?? true;
    for (const container of [
      this.standaloneAssetContainer,
      this.backgroundAssetContainer,
      this.contentAssetContainer,
    ]) {
      container.eventMode = 'none';
      container.interactiveChildren = false;
      container.sortableChildren = false;
    }
  }

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
      attached: binding.state === 'resolved' && binding.resource !== undefined,
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

  public renderLaneProbe(): Readonly<{
    readonly backgroundAssets: PatchMapRenderLaneProbe;
    readonly contentAssets: PatchMapRenderLaneProbe;
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
    });
  }

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

  public confirmRenderedFrame(): void {
    if (this.destroyed) return;
    if (this.framePendingAssetReleases.length > 0) {
      this.readyAssetReleases.push(...this.framePendingAssetReleases.splice(0));
    }
  }

  public async finalizeAssetUnloads(): Promise<void> {
    this.assertAlive();
    const leases = this.readyAssetReleases.splice(0);
    await Promise.all(leases.map(async (acquisition) => acquisition.release()));
  }

  public hasDirtySlots(): boolean {
    return this.dirtyAssetSlots.size > 0;
  }

  public dirtySlots(): ReadonlySet<number> {
    return this.dirtyAssetSlots;
  }

  public syncSlot(
    store: RenderStoreView,
    slot: number,
    alive: boolean,
    visible: boolean,
    projectionContext?: PatchMapProjectionRenderContext,
  ): void {
    if (!alive || store.kind[slot] !== RenderKind.Image) {
      this.clearImageSlot(slot);
      return;
    }
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    const bindingKey = projectionContext?.index.imagesByEntityId[entityId]?.bindingKey ??
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

  public syncProjectionOnly(
    store: RenderStoreView,
    slot: number,
    entityId: string,
    visible: boolean,
    projectionContext?: PatchMapProjectionRenderContext,
  ): boolean {
    if (!visible || store.kind[slot] !== RenderKind.Image) return false;
    const entry = this.images.get(slot);
    if (entry === undefined || entry.entityId !== entityId) return false;
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    applyLeafProjection(
      entry.object,
      quad,
      this.options.transformMatrix,
      entry.object.texture.width,
      entry.object.texture.height,
    );
    entry.vertices = quad.vertices;
    entry.object.visible = true;
    return true;
  }

  public beginFullRebuild(): void {
    if (this.retainedImagesByEntityId !== null) {
      throw new Error('PatchMap image full rebuild is already active');
    }
    const retained = new Map<string, ImageEntry>();
    for (const entry of this.images.values()) {
      this.uncountImageEntry(entry);
      retained.set(entry.entityId, entry);
    }
    this.retainedImagesByEntityId = retained;
    this.images.clear();
    this.imageBindingBySlot.clear();
    this.imageSlotsByBinding.clear();
    this.imageEntityIdBySlot.clear();
    this.imageProbesByEntityId.clear();
  }

  public finishFullRebuild(): void {
    const retained = this.retainedImagesByEntityId;
    if (retained === null) return;
    this.retainedImagesByEntityId = null;
    for (const entry of retained.values()) this.discardImageEntry(entry);
  }

  public finishSync(): void {
    this.sortImageChildren();
    this.dirtyAssetSlots.clear();
    this.backgroundAssetContainer.label =
      `PatchMap / background assets (${this.backgroundAssetContainer.children.length})`;
    this.standaloneAssetContainer.label =
      `PatchMap / standalone assets (${this.standaloneAssetContainer.children.length})`;
    this.contentAssetContainer.label =
      `PatchMap / content assets (${this.contentAssetContainer.children.length})`;
  }

  public cull(
    worldMatrix: Matrix,
    viewportWidth: number,
    viewportHeight: number,
    padding: number,
  ): number {
    let visibleCount = 0;
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

  public debugCounts(): AggregateImageLeafLaneDebugCounts {
    let loadedAssetCount = 0;
    let pendingAssetCount = 0;
    let failedAssetCount = 0;
    let staleAttachCount = 0;
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
    return Object.freeze({
      imageCount: this.images.size,
      loadedAssetCount,
      unresolvedAssetCount,
      pendingAssetCount,
      failedAssetCount,
      placeholderCount: 0,
      staleAttachCount,
      staleCompletionCount: this.staleCompletionCount,
    });
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearDisplayObjects();
    const acquisitions = new Set<PatchMapAssetAcquisition>([
      ...[...this.bindings.values()]
        .map(({ resource }) => resource?.acquisition)
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
    this.staleCompletionCount = 0;
    this.dirtyImageLanes.clear();
    this.standaloneAssetContainer.destroy();
    this.backgroundAssetContainer.destroy();
    this.contentAssetContainer.destroy();
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
      await acquisition.release();
      return observation;
    }
    binding.resource = {
      acquisition,
      texture,
      entryCount: 0,
      bindingOwned: true,
      releaseQueued: false,
    };
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
    if (binding.resource) {
      const resource = binding.resource;
      resource.bindingOwned = false;
      delete binding.resource;
      this.queueResourceRelease(resource, false);
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
    this.options.onDebugChange();
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
    const resource = binding?.state === 'resolved' ? binding.resource : undefined;
    const bindingGeneration = binding?.generation ?? 0;
    let entry = this.images.get(slot) ?? this.takeRetainedImage(entityId);
    if (entry !== undefined && entry.entityId !== entityId) {
      this.discardImageEntry(entry);
      entry = undefined;
    }
    if (binding === undefined) {
      if (entry !== undefined) {
        if (this.images.get(slot) === entry) this.images.delete(slot);
        this.discardImageEntry(entry);
      }
      this.setImageProbe(slot, entityId, bindingKey, 0, 0, 'none');
      this.options.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
        entityId,
        lane: publicImageLane(lane),
        rendererKind: 'none',
        primitiveCount: 0,
        renderObjectCount: 0,
        packedTint: (store.tint[slot] ?? 0xffffffff) >>> 0,
        rgbTint: null,
        alpha: null,
      }));
      return;
    }
    if (resource === undefined && entry === undefined) {
      const role: LeafAssetRenderRole = binding.state === 'failed'
        ? 'asset-placeholder'
        : 'none';
      this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 0, role);
      this.options.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
        entityId,
        lane: publicImageLane(lane),
        rendererKind: 'none',
        primitiveCount: 0,
        renderObjectCount: 0,
        packedTint: (store.tint[slot] ?? 0xffffffff) >>> 0,
        rgbTint: null,
        alpha: null,
      }));
      return;
    }
    const texture = resource?.texture ?? entry!.resource.texture;
    if (
      entry &&
      entry.bindingKey === bindingKey &&
      entry.bindingGeneration === bindingGeneration &&
      entry.resource === resource &&
      entry.object.texture !== texture
    ) {
      binding.staleAttachCount += 1;
      this.recordEntityStaleAttachment(entityId);
    }
    if (!entry) {
      const object = new Sprite({ texture });
      object.eventMode = 'none';
      object.label = `${lane}:image`;
      if (resource === undefined) {
        throw new Error('PatchMap image entry requires a resolved resource');
      }
      entry = {
        object,
        entityId,
        bindingKey,
        bindingGeneration,
        role: 'image',
        lane,
        resource,
        counted: false,
        vertices: EMPTY_QUAD_VERTICES,
      };
      this.attachImageResource(resource);
    } else {
      this.uncountImageEntry(entry);
      if (resource !== undefined && entry.resource !== resource) {
        const previous = entry.resource;
        this.attachImageResource(resource);
        entry.resource = resource;
        entry.object.texture = resource.texture;
        this.detachImageResource(previous, true);
      }
      if (entry.lane !== lane) {
        imageLaneContainer(this, entry.lane).removeChild(entry.object);
        imageLaneContainer(this, lane).addChild(entry.object);
        this.dirtyImageLanes.add(entry.lane);
        entry.lane = lane;
      }
      entry.bindingKey = bindingKey;
      entry.bindingGeneration = bindingGeneration;
      entry.object.label = `${lane}:image`;
      if (entry.object.texture !== texture) entry.object.texture = texture;
    }
    const attached = this.images.get(slot) === entry;
    this.images.set(slot, entry);
    this.countImageEntry(entry);
    if (!attached && entry.object.parent === null) {
      imageLaneContainer(this, entry.lane).addChild(entry.object);
      this.dirtyImageLanes.add(entry.lane);
    }
    const sprite = entry.object;
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    applyLeafProjection(
      sprite,
      quad,
      this.options.transformMatrix,
      texture.width,
      texture.height,
    );
    entry.vertices = quad.vertices;
    sprite.tint = packedRgb(store.tint[slot] ?? 0xffffffff);
    sprite.alpha = combinedAlpha(store.tint[slot] ?? 0xffffffff, store.opacity[slot] ?? 1);
    const zIndex = store.zIndex[slot] ?? 0;
    if (sprite.zIndex !== zIndex) {
      sprite.zIndex = zIndex;
      this.dirtyImageLanes.add(lane);
    }
    sprite.visible = true;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 1, 'image');
    this.options.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
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
      this.options.paintProbesByEntityId.delete(previousEntityId);
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
      this.options.paintProbesByEntityId.delete(entityId);
      return;
    }
    this.options.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
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
      this.options.paintProbesByEntityId.delete(entityId);
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

  private removeImageEntry(slot: number): void {
    const entry = this.images.get(slot);
    if (!entry) return;
    this.images.delete(slot);
    this.discardImageEntry(entry);
  }

  private discardImageEntry(entry: ImageEntry): void {
    this.uncountImageEntry(entry);
    this.detachImageResource(entry.resource, true);
    entry.object.destroy();
    this.dirtyImageLanes.add(entry.lane);
  }

  private countImageEntry(entry: ImageEntry): void {
    if (entry.counted) return;
    entry.counted = true;
    this.adjustBindingRenderCounts(entry, 1);
  }

  private uncountImageEntry(entry: ImageEntry): void {
    if (!entry.counted) return;
    this.adjustBindingRenderCounts(entry, -1);
    entry.counted = false;
  }

  private adjustBindingRenderCounts(entry: ImageEntry, delta: 1 | -1): void {
    const binding = this.bindings.get(entry.bindingKey);
    if (!binding || binding.generation !== entry.bindingGeneration) return;
    binding.renderObjectCount += delta;
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
    this.options.onDebugChange();
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
      container.removeChildren();
      for (let start = 0; start < orderedChildren.length; start += IMAGE_CHILD_APPEND_BATCH_SIZE) {
        container.addChild(
          ...orderedChildren.slice(start, start + IMAGE_CHILD_APPEND_BATCH_SIZE),
        );
      }
    }
    container.sortableChildren = false;
  }

  private clearDisplayObjects(): void {
    this.options.onDebugChange();
    for (const entry of this.images.values()) this.discardImageEntry(entry);
    if (this.retainedImagesByEntityId !== null) {
      for (const entry of this.retainedImagesByEntityId.values()) this.discardImageEntry(entry);
      this.retainedImagesByEntityId = null;
    }
    this.images.clear();
    this.imageBindingBySlot.clear();
    this.imageSlotsByBinding.clear();
    this.imageEntityIdBySlot.clear();
    for (const entityId of this.imageProbesByEntityId.keys()) {
      this.options.paintProbesByEntityId.delete(entityId);
    }
    this.imageProbesByEntityId.clear();
    this.dirtyAssetSlots.clear();
    for (const binding of this.bindings.values()) {
      binding.consumerCount = 0;
      binding.renderObjectCount = 0;
      binding.placeholderCount = 0;
    }
    this.dirtyImageLanes.clear();
    this.standaloneAssetContainer.removeChildren();
    this.backgroundAssetContainer.removeChildren();
    this.contentAssetContainer.removeChildren();
  }

  private takeRetainedImage(entityId: string): ImageEntry | undefined {
    const entry = this.retainedImagesByEntityId?.get(entityId);
    if (entry !== undefined) this.retainedImagesByEntityId?.delete(entityId);
    return entry;
  }

  private attachImageResource(resource: LeafAssetResource): void {
    resource.entryCount += 1;
  }

  private detachImageResource(resource: LeafAssetResource, afterFrame: boolean): void {
    resource.entryCount -= 1;
    if (resource.entryCount < 0) throw new Error('PatchMap image resource counter underflow');
    this.queueResourceRelease(resource, afterFrame);
  }

  private queueResourceRelease(resource: LeafAssetResource, afterFrame: boolean): void {
    if (resource.bindingOwned || resource.entryCount > 0 || resource.releaseQueued) return;
    resource.releaseQueued = true;
    (afterFrame ? this.framePendingAssetReleases : this.readyAssetReleases)
      .push(resource.acquisition);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AggregateImageLeafLane is destroyed');
  }
}

function imageLane(
  entityId: string,
  projectionContext?: PatchMapProjectionRenderContext,
): LeafImageLane | null {
  const component = projectionContext?.index.componentsByEntityId[entityId];
  if (component === undefined) return 'standalone-assets';
  if (component.renderRole === 'background-asset') return 'background-assets';
  if (component.renderRole === 'content-asset') return 'content-assets';
  return null;
}

function imageLaneContainer(
  laneOwner: AggregateImageLeafLane,
  lane: LeafImageLane,
): Container {
  if (lane === 'standalone-assets') return laneOwner.standaloneAssetContainer;
  return lane === 'background-assets'
    ? laneOwner.backgroundAssetContainer
    : laneOwner.contentAssetContainer;
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

function freezeEntityPaintProbe(probe: PatchMapEntityPaintProbe): PatchMapEntityPaintProbe {
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

function packedRgb(value: number): number {
  return (value >>> 8) & 0xffffff;
}

function combinedAlpha(value: number, opacity: number): number {
  return clampAlpha(opacity * ((value & 0xff) / 255));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be non-empty`);
  }
  return value.trim();
}
