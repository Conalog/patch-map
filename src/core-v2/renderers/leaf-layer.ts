import {
  BitmapText,
  Container,
  Matrix,
  Sprite,
  Text,
  Texture,
  type TextStyleOptions,
} from 'pixi.js';

import type { SlotRange } from '../../core-v1/contracts';
import {
  RenderAlign,
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../core-v1/renderer/types';
import {
  createCoreV2LeafAssetSession,
  normalizeCoreV2AssetDescriptor,
  type CoreV2AssetAcquisition,
  type CoreV2AssetSession,
} from '../assets';
import type { CoreV2AssetSource } from '../semantic/dataset';
import {
  resolveCoreV2SlotQuad,
  type CoreV2ProjectionRenderContext,
  type CoreV2ResolvedRenderQuad,
} from './types';

interface TextEntry {
  readonly object: BitmapText | Text;
  readonly bitmap: boolean;
  styleSignature: string;
}

interface ImageEntry {
  readonly object: Sprite;
  readonly entityId: string;
  readonly bindingKey: string;
  readonly bindingGeneration: number;
  readonly role: Exclude<LeafAssetRenderRole, 'none'>;
}

export type LeafAssetSourceKind = 'alias' | 'url' | 'data-uri' | 'descriptor';
export type LeafAssetBindingState = 'pending' | 'resolved' | 'failed';
export type LeafAssetRenderRole = 'image' | 'asset-placeholder' | 'none';

export type LeafAssetBindingRequest =
  | Readonly<{ readonly kind: 'alias'; readonly alias: string }>
  | Readonly<{ readonly kind: 'source'; readonly source: CoreV2AssetSource }>;

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
}

interface NormalizedLeafAssetBindingRequest {
  readonly request: LeafAssetBindingRequest;
  readonly signature: string;
  readonly sourceKind: LeafAssetSourceKind;
  readonly acquire: (session: CoreV2AssetSession) => Promise<CoreV2AssetAcquisition>;
}

interface LeafAssetBinding {
  readonly key: string;
  readonly generation: number;
  readonly request: LeafAssetBindingRequest;
  readonly signature: string;
  readonly sourceKind: LeafAssetSourceKind;
  state: LeafAssetBindingState;
  completion?: Promise<LeafAssetBindingObservation>;
  acquisition?: CoreV2AssetAcquisition;
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

export class AggregateLeafLayer {
  public readonly container = new Container({ label: 'core-v2:text-and-assets' });
  public readonly textContainer = new Container({ label: 'core-v2:text' });
  public readonly imageContainer = new Container({
    label: 'core-v2:assets',
    // Child order is maintained explicitly by semantic zIndex and stable slot.
    // Pixi's z-only sorting cannot provide the entity tie-breaker needed when
    // a pending Sprite is replaced after its equal-z siblings were inserted.
    sortableChildren: false,
  });

  private readonly texts = new Map<number, TextEntry>();
  private readonly images = new Map<number, ImageEntry>();
  private readonly imageBindingBySlot = new Map<number, string>();
  private readonly imageSlotsByBinding = new Map<string, Set<number>>();
  private readonly imageEntityIdBySlot = new Map<number, string>();
  private readonly imageProbesByEntityId = new Map<string, LeafSceneImageProbe>();
  private readonly bindings = new Map<string, LeafAssetBinding>();
  private readonly framePendingAssetReleases: CoreV2AssetAcquisition[] = [];
  private readonly readyAssetReleases: CoreV2AssetAcquisition[] = [];
  private readonly dirtyAssetSlots = new Set<number>();
  private readonly transformMatrix = new Matrix();
  private nextBindingGeneration = 0;
  private staleCompletionCount = 0;
  private storeEpoch = -1;
  private imageOrderDirty = false;
  private destroyed = false;

  public constructor(
    private readonly assetSession: CoreV2AssetSession = createCoreV2LeafAssetSession(),
    private readonly ownsAssetSession = true,
    private readonly options: AggregateLeafLayerOptions = {},
  ) {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.textContainer.eventMode = 'none';
    this.textContainer.interactiveChildren = false;
    this.imageContainer.eventMode = 'none';
    this.imageContainer.interactiveChildren = false;
    this.imageContainer.sortableChildren = false;
    this.container.addChild(this.imageContainer, this.textContainer);
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

  /** Compatibility seam for host-driven alias-to-URL preloads. */
  public async loadAsset(alias: string, url: string): Promise<void> {
    const cleanAlias = nonempty(alias, 'asset alias');
    const cleanUrl = nonempty(url, 'asset URL');
    const observation = await this.bindSceneAsset(cleanAlias, {
      kind: 'source',
      source: cleanUrl,
    });
    if (observation.status === 'stale') return;
    const binding = this.bindings.get(cleanAlias);
    if (binding?.generation === observation.generation && binding.state === 'failed') {
      if (binding.failure instanceof Error) throw binding.failure;
      throw new Error('Core v2 asset binding failed');
    }
  }

  public unloadAsset(alias: string): Promise<boolean> {
    return this.unbindSceneAsset(alias);
  }

  /** Called by the renderer only after Pixi has rendered replacement Sprites. */
  public confirmRenderedFrame(): void {
    if (this.destroyed || this.framePendingAssetReleases.length === 0) return;
    this.readyAssetReleases.push(...this.framePendingAssetReleases.splice(0));
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
      readonly projectionContext?: CoreV2ProjectionRenderContext;
    } = {},
  ): LeafLayerDebug {
    this.assertAlive();
    const epoch = options.fullRebuildEpoch ?? this.storeEpoch;
    const fullRebuild = epoch !== this.storeEpoch;
    if (fullRebuild) {
      this.clearDisplayObjects();
      this.storeEpoch = epoch;
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
          this.syncSlot(store, slot, options.projectionContext);
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
    this.sortImageChildren();
    this.dirtyAssetSlots.clear();
    return this.debugSnapshot();
  }

  public debugSnapshot(): LeafLayerDebug {
    let bitmapTextCount = 0;
    let loadedAssetCount = 0;
    let pendingAssetCount = 0;
    let failedAssetCount = 0;
    let staleAttachCount = 0;
    for (const entry of this.texts.values()) if (entry.bitmap) bitmapTextCount += 1;
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
    return Object.freeze({
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
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearDisplayObjects();
    const acquisitions = new Set<CoreV2AssetAcquisition>([
      ...[...this.bindings.values()]
        .map(({ acquisition }) => acquisition)
        .filter((value): value is CoreV2AssetAcquisition => value !== undefined),
      ...this.framePendingAssetReleases,
      ...this.readyAssetReleases,
    ]);
    this.bindings.clear();
    this.framePendingAssetReleases.length = 0;
    this.readyAssetReleases.length = 0;
    this.dirtyAssetSlots.clear();
    this.nextBindingGeneration = 0;
    this.staleCompletionCount = 0;
    this.storeEpoch = -1;
    this.imageOrderDirty = false;
    this.container.destroy({ children: true });
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
    if (releaseFailure) throw new Error('Core v2 asset release failed');
  }

  private async acquireBinding(
    binding: LeafAssetBinding,
    request: NormalizedLeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    let acquisition: CoreV2AssetAcquisition;
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
    projectionContext?: CoreV2ProjectionRenderContext,
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
      this.observeImageSlot(slot, entityId, bindingKey);
      if (visible) this.syncImage(store, slot, entityId, bindingKey, projectionContext);
      else this.removeVisibleImage(slot, entityId, bindingKey);
    }
    if (!visible) return;
    if (kind === RenderKind.Text) this.syncText(store, slot, projectionContext);
  }

  private syncText(
    store: RenderStoreView,
    slot: number,
    projectionContext?: CoreV2ProjectionRenderContext,
  ): void {
    const value = store.text[slot] ?? '';
    const bitmap = isBitmapTextSafe(value);
    const signature = textStyleSignature(store, slot);
    let entry = this.texts.get(slot);
    if (!entry || entry.bitmap !== bitmap || entry.styleSignature !== signature) {
      this.removeText(slot);
      const style = textStyle(store, slot);
      const object = bitmap
        ? new BitmapText({ text: value, style })
        : new Text({ text: value, style });
      object.eventMode = 'none';
      object.label = bitmap ? 'core-v2:bitmap-text' : 'core-v2:fallback-text';
      entry = { object, bitmap, styleSignature: signature };
      this.texts.set(slot, entry);
      this.textContainer.addChild(object);
    } else if (entry.object.text !== value) {
      entry.object.text = value;
    }

    const object = entry.object;
    applyLeafProjection(
      object,
      resolveCoreV2SlotQuad(store, slot, projectionContext),
      this.transformMatrix,
    );
    object.alpha = combinedAlpha(store.color[slot] ?? 0xffffffff, store.opacity[slot] ?? 1);
    object.tint = packedRgb(store.color[slot] ?? 0xffffffff);
    object.visible = true;
  }

  private syncImage(
    store: RenderStoreView,
    slot: number,
    entityId: string,
    bindingKey: string,
    projectionContext?: CoreV2ProjectionRenderContext,
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
      entry.object.texture !== texture
    ) {
      if (entry) this.removeImageEntry(slot);
      const object = new Sprite({ texture });
      object.eventMode = 'none';
      object.label = role === 'image' ? 'core-v2:image' : 'core-v2:image-placeholder';
      entry = { object, entityId, bindingKey, bindingGeneration, role };
      this.addImageEntry(slot, entry);
    }
    const sprite = entry.object;
    applyLeafProjection(
      sprite,
      resolveCoreV2SlotQuad(store, slot, projectionContext),
      this.transformMatrix,
      texture.width,
      texture.height,
    );
    sprite.tint = role === 'image'
      ? packedRgb(store.tint[slot] ?? 0xffffffff)
      : PLACEHOLDER_TINT;
    sprite.alpha = role === 'image'
      ? combinedAlpha(store.tint[slot] ?? 0xffffffff, store.opacity[slot] ?? 1)
      : clampAlpha(store.opacity[slot] ?? 1);
    const zIndex = store.zIndex[slot] ?? 0;
    if (sprite.zIndex !== zIndex) {
      sprite.zIndex = zIndex;
      this.imageOrderDirty = true;
    }
    sprite.visible = true;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 1, role);
  }

  private removeText(slot: number): void {
    const entry = this.texts.get(slot);
    if (!entry) return;
    this.texts.delete(slot);
    entry.object.destroy();
  }

  private observeImageSlot(slot: number, entityId: string, bindingKey: string): void {
    const previousEntityId = this.imageEntityIdBySlot.get(slot);
    if (previousEntityId && previousEntityId !== entityId) {
      this.imageProbesByEntityId.delete(previousEntityId);
    }
    this.imageEntityIdBySlot.set(slot, entityId);
    const bindingGeneration = this.bindings.get(bindingKey)?.generation ?? 0;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 0, 'none');
  }

  private removeVisibleImage(slot: number, entityId: string, bindingKey: string): void {
    this.removeImageEntry(slot);
    this.unindexVisibleImageBinding(slot);
    const bindingGeneration = this.bindings.get(bindingKey)?.generation ?? 0;
    this.setImageProbe(slot, entityId, bindingKey, bindingGeneration, 0, 'none');
  }

  private clearImageSlot(slot: number): void {
    this.removeImageEntry(slot);
    this.unindexVisibleImageBinding(slot);
    const entityId = this.imageEntityIdBySlot.get(slot);
    this.imageEntityIdBySlot.delete(slot);
    if (entityId) this.imageProbesByEntityId.delete(entityId);
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
    this.imageContainer.addChild(entry.object);
    this.imageOrderDirty = true;
  }

  private removeImageEntry(slot: number): void {
    const entry = this.images.get(slot);
    if (!entry) return;
    this.images.delete(slot);
    this.adjustBindingRenderCounts(entry, -1);
    entry.object.destroy();
    this.imageOrderDirty = true;
  }

  private adjustBindingRenderCounts(entry: ImageEntry, delta: 1 | -1): void {
    const binding = this.bindings.get(entry.bindingKey);
    if (!binding || binding.generation !== entry.bindingGeneration) return;
    binding.renderObjectCount += delta;
    if (entry.role === 'asset-placeholder') binding.placeholderCount += delta;
    if (binding.renderObjectCount < 0 || binding.placeholderCount < 0) {
      throw new Error('Core v2 image binding render counter underflow');
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
      throw new Error('Core v2 asset binding generation exhausted');
    }
    this.nextBindingGeneration += 1;
    return this.nextBindingGeneration;
  }

  private recordStaleCompletion(key: string): void {
    if (this.destroyed) return;
    this.staleCompletionCount += 1;
    const current = this.bindings.get(key);
    if (current) current.staleCompletionCount += 1;
  }

  private sortImageChildren(): void {
    if (!this.imageOrderDirty) return;
    const ordered = [...this.images.entries()].sort(([leftSlot, left], [rightSlot, right]) => (
      left.object.zIndex - right.object.zIndex ||
      leftSlot - rightSlot ||
      left.entityId.localeCompare(right.entityId)
    ));
    ordered.forEach(([, entry], index) => {
      if (this.imageContainer.children[index] !== entry.object) {
        this.imageContainer.setChildIndex(entry.object, index);
      }
    });
    // Assigning a child zIndex lets Pixi opt the parent back into z-only
    // sorting. Disable it after applying the stronger deterministic order.
    this.imageContainer.sortableChildren = false;
    this.imageOrderDirty = false;
  }

  private clearDisplayObjects(): void {
    for (const entry of this.texts.values()) entry.object.destroy();
    for (const entry of this.images.values()) entry.object.destroy();
    this.texts.clear();
    this.images.clear();
    this.imageBindingBySlot.clear();
    this.imageSlotsByBinding.clear();
    this.imageEntityIdBySlot.clear();
    this.imageProbesByEntityId.clear();
    this.dirtyAssetSlots.clear();
    for (const binding of this.bindings.values()) {
      binding.consumerCount = 0;
      binding.renderObjectCount = 0;
      binding.placeholderCount = 0;
    }
    this.imageOrderDirty = false;
    this.textContainer.removeChildren();
    this.imageContainer.removeChildren();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AggregateLeafLayer is destroyed');
  }
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
      acquire: (session: CoreV2AssetSession) => session.acquire(alias),
    });
  }
  if (request.kind !== 'source') throw new TypeError('asset binding kind must be alias or source');
  const descriptor = normalizeCoreV2AssetDescriptor(request.source);
  const sourceKind: LeafAssetSourceKind = typeof request.source === 'string'
    ? /^data:/i.test(descriptor.src)
      ? 'data-uri'
      : 'url'
    : 'descriptor';
  const source: CoreV2AssetSource = typeof request.source === 'string'
    ? descriptor.src
    : descriptor;
  const frozenRequest = Object.freeze({ kind: 'source' as const, source });
  return Object.freeze({
    request: frozenRequest,
    signature: `source:${sourceKind}:${stableSerialize(descriptor)}`,
    sourceKind,
    acquire: (session: CoreV2AssetSession) => session.acquireSource(source),
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

function textStyle(store: RenderStoreView, slot: number): TextStyleOptions {
  return {
    fontFamily: store.fontFamily[slot] || 'Arial',
    fontSize: Math.max(1, store.fontSize[slot] ?? 16),
    fontWeight: (store.fontWeight[slot] ?? 400) >= 600 ? 'bold' : 'normal',
    fill: packedRgb(store.color[slot] ?? 0xffffffff),
    align: alignName(store.align[slot] ?? RenderAlign.Left),
  };
}

function textStyleSignature(store: RenderStoreView, slot: number): string {
  return [
    store.fontFamily[slot] || 'Arial',
    store.fontSize[slot] ?? 16,
    store.fontWeight[slot] ?? 400,
    store.color[slot] ?? 0xffffffff,
    store.align[slot] ?? RenderAlign.Left,
  ].join('|');
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
  quad: CoreV2ResolvedRenderQuad,
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
