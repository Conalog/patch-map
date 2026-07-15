import {
  Assets,
  BitmapText,
  Container,
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

interface TextEntry {
  readonly object: BitmapText | Text;
  readonly bitmap: boolean;
  styleSignature: string;
}

interface SharedAssetState {
  readonly url: string;
  readonly ownership: 'core-v2' | 'external';
  readonly texture: Promise<Texture>;
  references: number;
  releasing?: Promise<void>;
}

interface SharedAssetLease {
  readonly state: SharedAssetState;
  readonly texture: Texture;
  released: boolean;
}

interface LeafAsset {
  readonly url: string;
  readonly texture: Texture;
  readonly lease: SharedAssetLease;
}

// Pixi Assets is a process-wide singleton and does not expose consumer
// reference counts. Keep Core v2's leases process-wide too: an asset already
// present in the public cache is borrowed, while one first loaded here is
// released only after the final Core v2 lease reaches its detach barrier.
const sharedAssetStates = new Map<string, SharedAssetState>();

export interface LeafLayerDebug {
  readonly bitmapTextCount: number;
  readonly fallbackTextCount: number;
  readonly imageCount: number;
  readonly loadedAssetCount: number;
  readonly unresolvedAssetCount: number;
}

export class AggregateLeafLayer {
  public readonly container = new Container({ label: 'core-v2:text-and-assets' });
  public readonly textContainer = new Container({ label: 'core-v2:text' });
  public readonly imageContainer = new Container({ label: 'core-v2:assets' });

  private readonly texts = new Map<number, TextEntry>();
  private readonly images = new Map<number, Sprite>();
  private readonly imageSources = new Map<number, string>();
  private readonly assets = new Map<string, LeafAsset>();
  private readonly pendingAssetReleases: SharedAssetLease[] = [];
  private readonly unresolved = new Set<string>();
  private storeEpoch = -1;
  private assetsDirty = false;
  private destroyed = false;

  public constructor() {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.textContainer.eventMode = 'none';
    this.textContainer.interactiveChildren = false;
    this.imageContainer.eventMode = 'none';
    this.imageContainer.interactiveChildren = false;
    this.container.addChild(this.imageContainer, this.textContainer);
  }

  public async loadAsset(alias: string, url: string): Promise<void> {
    this.assertAlive();
    const cleanAlias = alias.trim();
    const cleanUrl = url.trim();
    if (!cleanAlias || !cleanUrl) throw new TypeError('asset alias and URL must be non-empty');
    const previous = this.assets.get(cleanAlias);
    if (previous?.url === cleanUrl) return;
    const lease = await acquireSharedAsset(cleanUrl);
    if (this.destroyed) {
      await releaseSharedAsset(lease);
      throw new Error('AggregateLeafLayer is destroyed');
    }

    // A concurrent call for the same alias may have completed while this load
    // was pending. Do not retain a duplicate lease for an identical binding.
    const current = this.assets.get(cleanAlias);
    if (current?.url === cleanUrl) {
      await releaseSharedAsset(lease);
      return;
    }

    this.assets.set(cleanAlias, { url: cleanUrl, texture: lease.texture, lease });
    this.unresolved.delete(cleanAlias);
    this.assetsDirty = true;
    if (current) {
      this.discardTextureReferences(cleanAlias, current.texture);
      this.pendingAssetReleases.push(current.lease);
    }
  }

  public unloadAsset(alias: string): Promise<boolean> {
    this.assertAlive();
    const previous = this.assets.get(alias);
    if (!previous) return Promise.resolve(false);
    this.assets.delete(alias);
    this.assetsDirty = true;
    // Recreate the affected Sprite rather than only swapping its texture. The
    // structural change invalidates Pixi's cached batch instruction before the
    // old texture source is physically released.
    this.discardTextureReferences(alias, previous.texture);
    this.pendingAssetReleases.push(previous.lease);
    return Promise.resolve(true);
  }

  /** Finalize only after a rendered frame has replaced every live texture reference. */
  public async finalizeAssetUnloads(): Promise<void> {
    this.assertAlive();
    const leases = this.pendingAssetReleases.splice(0);
    await Promise.all(leases.map(async (lease) => releaseSharedAsset(lease)));
  }

  public sync(
    store: RenderStoreView,
    options: { readonly changedRanges?: readonly SlotRange[]; readonly fullRebuildEpoch?: number } = {},
  ): LeafLayerDebug {
    this.assertAlive();
    const epoch = options.fullRebuildEpoch ?? this.storeEpoch;
    const fullRebuild = epoch !== this.storeEpoch;
    if (fullRebuild) {
      this.clearDisplayObjects();
      this.storeEpoch = epoch;
    }

    if (fullRebuild || this.assetsDirty || !options.changedRanges) {
      for (let slot = 0; slot < store.capacity; slot += 1) this.syncSlot(store, slot);
    } else {
      for (const range of options.changedRanges) {
        const start = Math.max(0, range.start);
        const end = Math.min(store.capacity, range.end);
        for (let slot = start; slot < end; slot += 1) this.syncSlot(store, slot);
      }
    }
    this.refreshUnresolved();
    this.assetsDirty = false;
    return this.debugSnapshot();
  }

  public debugSnapshot(): LeafLayerDebug {
    let bitmapTextCount = 0;
    for (const entry of this.texts.values()) if (entry.bitmap) bitmapTextCount += 1;
    return Object.freeze({
      bitmapTextCount,
      fallbackTextCount: this.texts.size - bitmapTextCount,
      imageCount: this.images.size,
      loadedAssetCount: this.assets.size,
      unresolvedAssetCount: this.unresolved.size,
    });
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearDisplayObjects();
    const leases = [
      ...[...this.assets.values()].map(({ lease }) => lease),
      ...this.pendingAssetReleases,
    ];
    this.assets.clear();
    this.pendingAssetReleases.length = 0;
    this.unresolved.clear();
    this.container.destroy({ children: true });
    await Promise.all(leases.map(async (lease) => releaseSharedAsset(lease)));
  }

  private syncSlot(store: RenderStoreView, slot: number): void {
    const alive = store.alive[slot] === 1;
    const visible = alive && ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0;
    const kind = store.kind[slot];
    if (!visible || kind !== RenderKind.Text) this.removeText(slot);
    if (!visible || kind !== RenderKind.Image) this.removeImage(slot);
    if (!visible) return;
    if (kind === RenderKind.Text) this.syncText(store, slot);
    if (kind === RenderKind.Image) this.syncImage(store, slot);
  }

  private syncText(store: RenderStoreView, slot: number): void {
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
    object.position.set(store.x[slot] ?? 0, store.y[slot] ?? 0);
    object.rotation = degreesToRadians(store.rotation[slot] ?? 0);
    object.alpha = combinedAlpha(store.color[slot] ?? 0xffffffff, store.opacity[slot] ?? 1);
    object.tint = packedRgb(store.color[slot] ?? 0xffffffff);
    object.visible = true;
  }

  private syncImage(store: RenderStoreView, slot: number): void {
    const source = store.source[slot] ?? '';
    this.imageSources.set(slot, source);
    const texture = this.assets.get(source)?.texture ?? Texture.WHITE;
    if (!this.assets.has(source) && source) this.unresolved.add(source);
    let sprite = this.images.get(slot);
    if (!sprite) {
      sprite = new Sprite({ texture });
      sprite.eventMode = 'none';
      sprite.label = 'core-v2:image';
      this.images.set(slot, sprite);
      this.imageContainer.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }
    sprite.position.set(store.x[slot] ?? 0, store.y[slot] ?? 0);
    sprite.rotation = degreesToRadians(store.rotation[slot] ?? 0);
    sprite.width = Math.max(0, store.width[slot] ?? 0);
    sprite.height = Math.max(0, store.height[slot] ?? 0);
    sprite.tint = packedRgb(store.tint[slot] ?? 0xffffffff);
    sprite.alpha = combinedAlpha(store.tint[slot] ?? 0xffffffff, store.opacity[slot] ?? 1);
    sprite.visible = true;
  }

  private removeText(slot: number): void {
    const entry = this.texts.get(slot);
    if (!entry) return;
    this.texts.delete(slot);
    entry.object.destroy();
  }

  private removeImage(slot: number): void {
    const sprite = this.images.get(slot);
    this.imageSources.delete(slot);
    if (!sprite) return;
    this.images.delete(slot);
    sprite.destroy();
  }

  private refreshUnresolved(): void {
    this.unresolved.clear();
    for (const source of this.imageSources.values()) {
      if (source && !this.assets.has(source)) this.unresolved.add(source);
    }
  }

  private discardTextureReferences(alias: string, texture: Texture): void {
    for (const [slot, sprite] of [...this.images]) {
      if (this.imageSources.get(slot) !== alias || sprite.texture !== texture) continue;
      this.images.delete(slot);
      this.imageSources.delete(slot);
      sprite.destroy();
    }
  }

  private clearDisplayObjects(): void {
    for (const entry of this.texts.values()) entry.object.destroy();
    for (const sprite of this.images.values()) sprite.destroy();
    this.texts.clear();
    this.images.clear();
    this.imageSources.clear();
    this.unresolved.clear();
    this.textContainer.removeChildren();
    this.imageContainer.removeChildren();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AggregateLeafLayer is destroyed');
  }
}

async function acquireSharedAsset(url: string): Promise<SharedAssetLease> {
  while (true) {
    const existing = sharedAssetStates.get(url);
    if (existing?.releasing) {
      // Never hand out a texture while Pixi is destroying its source. A fresh
      // acquisition starts only after that global unload has settled.
      await existing.releasing.catch(() => undefined);
      continue;
    }

    const state = existing ?? createSharedAssetState(url);
    if (existing) state.references += 1;
    try {
      const texture = await state.texture;
      return { state, texture, released: false };
    } catch (error) {
      rollbackSharedAssetAcquire(state);
      throw error;
    }
  }
}

function createSharedAssetState(url: string): SharedAssetState {
  const cached = Assets.get<unknown>(url);
  const ownership = cached === undefined ? 'core-v2' : 'external';
  const texture = cached === undefined
    ? Assets.load<Texture>(url).then((loaded) => requireTexture(url, loaded))
    : Promise.resolve(requireTexture(url, cached));
  const state: SharedAssetState = {
    url,
    ownership,
    texture,
    references: 1,
  };
  sharedAssetStates.set(url, state);
  return state;
}

function rollbackSharedAssetAcquire(state: SharedAssetState): void {
  state.references -= 1;
  if (state.references === 0 && sharedAssetStates.get(state.url) === state) {
    sharedAssetStates.delete(state.url);
  }
}

async function releaseSharedAsset(lease: SharedAssetLease): Promise<void> {
  if (lease.released) return;
  lease.released = true;
  const state = lease.state;
  state.references -= 1;
  if (state.references > 0) return;
  if (state.references < 0) throw new Error(`asset lease underflow for ${JSON.stringify(state.url)}`);

  if (state.ownership === 'external') {
    if (sharedAssetStates.get(state.url) === state) sharedAssetStates.delete(state.url);
    return;
  }

  // Install the releasing promise before invoking Assets.unload so a racing
  // acquire waits instead of borrowing a texture whose GPU source is dying.
  const releasing = Promise.resolve().then(async () => Assets.unload(state.url));
  state.releasing = releasing;
  try {
    await releasing;
  } finally {
    if (sharedAssetStates.get(state.url) === state) sharedAssetStates.delete(state.url);
  }
}

function requireTexture(url: string, value: unknown): Texture {
  if (value instanceof Texture) return value as Texture;
  throw new TypeError(`asset ${JSON.stringify(url)} did not resolve to a Pixi Texture`);
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
  return Math.max(0, Math.min(1, opacity * ((value & 0xff) / 255)));
}

function degreesToRadians(value: number): number {
  return value * (Math.PI / 180);
}
