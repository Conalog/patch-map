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
  type CoreV2AssetAcquisition,
  type CoreV2AssetSession,
} from '../assets';
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

interface LeafAsset {
  readonly url: string;
  readonly texture: Texture;
  readonly acquisition: CoreV2AssetAcquisition;
}

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
  private readonly imageSlotsBySource = new Map<string, Set<number>>();
  private readonly assets = new Map<string, LeafAsset>();
  private readonly pendingAssetReleases: CoreV2AssetAcquisition[] = [];
  private readonly aliasGenerations = new Map<string, number>();
  private readonly pendingAliasGenerations = new Map<string, number>();
  private readonly dirtyAssetSlots = new Set<number>();
  private readonly unresolved = new Set<string>();
  private readonly transformMatrix = new Matrix();
  private storeEpoch = -1;
  private destroyed = false;

  public constructor(
    private readonly assetSession: CoreV2AssetSession = createCoreV2LeafAssetSession(),
    private readonly ownsAssetSession = true,
  ) {
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
    if (previous?.url === cleanUrl) {
      if (this.pendingAliasGenerations.has(cleanAlias)) {
        this.aliasGenerations.set(cleanAlias, (this.aliasGenerations.get(cleanAlias) ?? 0) + 1);
        this.pendingAliasGenerations.delete(cleanAlias);
      }
      return;
    }
    const generation = (this.aliasGenerations.get(cleanAlias) ?? 0) + 1;
    this.aliasGenerations.set(cleanAlias, generation);
    this.pendingAliasGenerations.set(cleanAlias, generation);
    try {
      const acquisition = await this.assetSession.acquireSource(cleanUrl);
      if (this.destroyed) {
        await acquisition.release();
        throw new Error('AggregateLeafLayer is destroyed');
      }
      if (this.aliasGenerations.get(cleanAlias) !== generation) {
        await acquisition.release();
        return;
      }
      let texture: Texture;
      try {
        texture = requireTexture(acquisition.resource);
      } catch (error) {
        await acquisition.release();
        throw error;
      }

      // A concurrent call for the same alias may have completed while this load
      // was pending. Do not retain a duplicate lease for an identical binding.
      const current = this.assets.get(cleanAlias);
      if (current?.url === cleanUrl) {
        await acquisition.release();
        return;
      }

      this.assets.set(cleanAlias, { url: cleanUrl, texture, acquisition });
      this.unresolved.delete(cleanAlias);
      this.markSourceDirty(cleanAlias);
      if (current) {
        this.discardTextureReferences(cleanAlias, current.texture);
        this.pendingAssetReleases.push(current.acquisition);
      }
    } finally {
      if (this.pendingAliasGenerations.get(cleanAlias) === generation) {
        this.pendingAliasGenerations.delete(cleanAlias);
      }
    }
  }

  public unloadAsset(alias: string): Promise<boolean> {
    this.assertAlive();
    const cleanAlias = alias.trim();
    const previous = this.assets.get(cleanAlias);
    const pending = this.pendingAliasGenerations.has(cleanAlias);
    if (!previous && !pending) return Promise.resolve(false);
    this.aliasGenerations.set(cleanAlias, (this.aliasGenerations.get(cleanAlias) ?? 0) + 1);
    this.pendingAliasGenerations.delete(cleanAlias);
    if (!previous) return Promise.resolve(true);
    this.assets.delete(cleanAlias);
    this.markSourceDirty(cleanAlias);
    if ((this.imageSlotsBySource.get(cleanAlias)?.size ?? 0) > 0) this.unresolved.add(cleanAlias);
    // Recreate the affected Sprite rather than only swapping its texture. The
    // structural change invalidates Pixi's cached batch instruction before the
    // old texture source is physically released.
    this.discardTextureReferences(cleanAlias, previous.texture);
    this.pendingAssetReleases.push(previous.acquisition);
    return Promise.resolve(true);
  }

  /** Finalize only after a rendered frame has replaced every live texture reference. */
  public async finalizeAssetUnloads(): Promise<void> {
    this.assertAlive();
    const leases = this.pendingAssetReleases.splice(0);
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
    this.dirtyAssetSlots.clear();
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
      ...[...this.assets.values()].map(({ acquisition }) => acquisition),
      ...this.pendingAssetReleases,
    ];
    this.assets.clear();
    this.pendingAssetReleases.length = 0;
    this.aliasGenerations.clear();
    this.pendingAliasGenerations.clear();
    this.unresolved.clear();
    this.container.destroy({ children: true });
    const settlements = await Promise.allSettled(
      leases.map(async (acquisition) => acquisition.release()),
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

  private syncSlot(
    store: RenderStoreView,
    slot: number,
    projectionContext?: CoreV2ProjectionRenderContext,
  ): void {
    const alive = store.alive[slot] === 1;
    const visible = alive && ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0;
    const kind = store.kind[slot];
    if (!visible || kind !== RenderKind.Text) this.removeText(slot);
    if (!visible || kind !== RenderKind.Image) this.removeImage(slot);
    if (!visible) return;
    if (kind === RenderKind.Text) this.syncText(store, slot, projectionContext);
    if (kind === RenderKind.Image) this.syncImage(store, slot, projectionContext);
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
    projectionContext?: CoreV2ProjectionRenderContext,
  ): void {
    const source = store.source[slot] ?? '';
    this.indexImageSource(slot, source);
    const texture = this.assets.get(source)?.texture ?? Texture.WHITE;
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
    applyLeafProjection(
      sprite,
      resolveCoreV2SlotQuad(store, slot, projectionContext),
      this.transformMatrix,
      texture.width,
      texture.height,
    );
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
    this.unindexImageSource(slot);
    if (!sprite) return;
    this.images.delete(slot);
    sprite.destroy();
  }

  private indexImageSource(slot: number, source: string): void {
    const previous = this.imageSources.get(slot);
    if (previous === source) return;
    this.unindexImageSource(slot);
    this.imageSources.set(slot, source);
    if (!source) return;
    const slots = this.imageSlotsBySource.get(source) ?? new Set<number>();
    slots.add(slot);
    this.imageSlotsBySource.set(source, slots);
    if (!this.assets.has(source)) this.unresolved.add(source);
  }

  private unindexImageSource(slot: number): void {
    const source = this.imageSources.get(slot);
    this.imageSources.delete(slot);
    this.dirtyAssetSlots.delete(slot);
    if (!source) return;
    const slots = this.imageSlotsBySource.get(source);
    slots?.delete(slot);
    if (slots?.size === 0) {
      this.imageSlotsBySource.delete(source);
      this.unresolved.delete(source);
    }
  }

  private markSourceDirty(source: string): void {
    for (const slot of this.imageSlotsBySource.get(source) ?? []) {
      this.dirtyAssetSlots.add(slot);
    }
  }

  private discardTextureReferences(alias: string, texture: Texture): void {
    for (const slot of this.imageSlotsBySource.get(alias) ?? []) {
      const sprite = this.images.get(slot);
      if (!sprite || sprite.texture !== texture) continue;
      this.images.delete(slot);
      sprite.destroy();
    }
  }

  private clearDisplayObjects(): void {
    for (const entry of this.texts.values()) entry.object.destroy();
    for (const sprite of this.images.values()) sprite.destroy();
    this.texts.clear();
    this.images.clear();
    this.imageSources.clear();
    this.imageSlotsBySource.clear();
    this.dirtyAssetSlots.clear();
    this.unresolved.clear();
    this.textContainer.removeChildren();
    this.imageContainer.removeChildren();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AggregateLeafLayer is destroyed');
  }
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
  return Math.max(0, Math.min(1, opacity * ((value & 0xff) / 255)));
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
