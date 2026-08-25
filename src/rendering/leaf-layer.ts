import {
  Container,
  Matrix } from 'pixi.js';

import {
  createPatchMapLeafAssetSession,
  type PatchMapAssetSession,
  } from '../assets';
import type { SlotRange } from '../dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
  } from '../dense/renderer-types';
import type { PatchMapBitmapTextCapabilityProof } from '../semantic/text-render-route';
import {
  AggregateImageLeafLane,
  type LeafAssetBindingObservation,
  type LeafAssetBindingProbe,
  type LeafAssetBindingRequest,
  type LeafAssetBindingTransition,
  type LeafSceneImageProbe,
  } from './aggregate-image-leaf-lane';
import {
  AggregateTextLeafLane,
  type AggregateTextLeafLaneRetentionProbe,
  type TextMaterializationViewport,
  } from './aggregate-text-leaf-lane';
import type { PatchMapBitmapTextCapabilityRequest } from './contracts/options';
export type { PatchMapBitmapTextCapabilityRequest } from './contracts/options';
export type {
  LeafAssetBindingObservation,
  LeafAssetBindingProbe,
  LeafAssetBindingRequest,
  LeafAssetBindingState,
  LeafAssetBindingTransition,
  LeafAssetRenderRole,
  LeafAssetSourceKind,
  LeafSceneImageProbe,
  } from './aggregate-image-leaf-lane';
import type {
  PatchMapEntityPaintProbe,
  PatchMapRenderLaneProbe,
  PatchMapTextRendererProbe,
} from '../rendering-port';
import type {
  PatchMapProjectionRenderContext,
} from '../geometry/render-quads';

export interface AggregateLeafLayerOptions {
  readonly onBindingTransition?: (transition: LeafAssetBindingTransition) => void;
  readonly resolveBitmapTextCapability?: (
    request: PatchMapBitmapTextCapabilityRequest,
  ) => PatchMapBitmapTextCapabilityProof | null;
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

export class AggregateLeafLayer {
  public readonly container = new Container({ label: 'patch-map:text-and-assets' });
  public readonly standaloneAssetContainer: Container;
  public readonly backgroundAssetContainer: Container;
  public readonly contentAssetContainer: Container;
  public readonly imageContainer: Container;
  public readonly textContainer: Container;

  private readonly paintProbesByEntityId = new Map<string, PatchMapEntityPaintProbe>();
  private readonly transformMatrix = new Matrix();
  private readonly textLane: AggregateTextLeafLane;
  private readonly imageLane: AggregateImageLeafLane;
  private storeEpoch = -1;
  private debugCache: LeafLayerDebug | null = null;
  private destroyed = false;

  public constructor(
    assetSession: PatchMapAssetSession = createPatchMapLeafAssetSession(),
    ownsAssetSession = true,
    options: AggregateLeafLayerOptions = {},
  ) {
    this.textLane = new AggregateTextLeafLane({
      paintProbesByEntityId: this.paintProbesByEntityId,
      transformMatrix: this.transformMatrix,
      onDebugChange: () => {
        this.debugCache = null;
      },
      ...(options.resolveBitmapTextCapability === undefined
        ? {}
        : { resolveBitmapTextCapability: options.resolveBitmapTextCapability }),
    });
    this.imageLane = new AggregateImageLeafLane({
      assetSession,
      ownsAssetSession,
      paintProbesByEntityId: this.paintProbesByEntityId,
      transformMatrix: this.transformMatrix,
      onDebugChange: () => {
        this.debugCache = null;
      },
      ...(options.onBindingTransition === undefined
        ? {}
        : { onBindingTransition: options.onBindingTransition }),
    });
    this.standaloneAssetContainer = this.imageLane.standaloneAssetContainer;
    this.backgroundAssetContainer = this.imageLane.backgroundAssetContainer;
    this.contentAssetContainer = this.imageLane.contentAssetContainer;
    this.imageContainer = this.imageLane.imageContainer;
    this.textContainer = this.textLane.container;
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
    this.container.addChild(
      this.standaloneAssetContainer,
      this.backgroundAssetContainer,
      this.contentAssetContainer,
      this.textContainer,
    );
  }

  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    this.assertAlive();
    return this.imageLane.bindSceneAsset(key, request);
  }

  public unbindSceneAsset(key: string): Promise<boolean> {
    this.assertAlive();
    return this.imageLane.unbindSceneAsset(key);
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    return this.imageLane.sceneAssetBindingProbe(key);
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    return this.imageLane.sceneImageProbe(entityId);
  }

  public textRendererProbe(entityId: string): PatchMapTextRendererProbe | null {
    return this.textLane.textRendererProbe(entityId);
  }

  public lastRenderedTextGraphemeCount(entityId: string): number {
    return this.textLane.lastRenderedTextGraphemeCount(entityId);
  }

  public entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null {
    return this.paintProbesByEntityId.get(entityId) ?? null;
  }

  public renderLaneProbe(): Readonly<{
    readonly backgroundAssets: PatchMapRenderLaneProbe;
    readonly contentAssets: PatchMapRenderLaneProbe;
    readonly text: PatchMapRenderLaneProbe;
  }> {
    const imageLanes = this.imageLane.renderLaneProbe();
    return Object.freeze({
      backgroundAssets: imageLanes.backgroundAssets,
      contentAssets: imageLanes.contentAssets,
      text: this.textLane.renderLaneProbe(),
    });
  }

  public loadAsset(alias: string, url: string): Promise<void> {
    this.assertAlive();
    return this.imageLane.loadAsset(alias, url);
  }

  public unloadAsset(alias: string): Promise<boolean> {
    this.assertAlive();
    return this.imageLane.unloadAsset(alias);
  }

  public confirmRenderedFrame(renderedFrame?: number): void {
    if (this.destroyed) return;
    this.textLane.confirmRenderedFrame(renderedFrame);
    this.imageLane.confirmRenderedFrame();
  }

  public finalizeAssetUnloads(): Promise<void> {
    this.assertAlive();
    return this.imageLane.finalizeAssetUnloads();
  }

  public sync(
    store: RenderStoreView,
    options: {
      readonly changedRanges?: readonly SlotRange[];
      readonly fullRebuildEpoch?: number;
      readonly projectionContext?: PatchMapProjectionRenderContext;
      readonly projectionTransformOnly?: boolean;
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
      this.imageLane.hasDirtySlots();
    if (!hasLeafWork) return this.debugSnapshot();
    this.debugCache = null;
    if (fullRebuild) {
      this.paintProbesByEntityId.clear();
      this.imageLane.beginFullRebuild();
      this.textLane.beginFullRebuild(store.capacity);
      this.storeEpoch = epoch;
    }
    this.textLane.setDeferredSource(store, options.projectionContext);
    const textMaterializationViewport = fullRebuild && this.textLane.usesChunking()
      ? options.textMaterializationViewport
      : undefined;

    if (fullRebuild || !options.changedRanges) {
      for (let slot = 0; slot < store.capacity; slot += 1) {
        this.syncSlot(store, slot, options.projectionContext, textMaterializationViewport);
      }
    } else {
      for (const range of options.changedRanges) {
        const start = Math.max(0, range.start);
        const end = Math.min(store.capacity, range.end);
        for (let slot = start; slot < end; slot += 1) {
          if (options.projectionTransformOnly === true) {
            this.textLane.clearDeferred(slot);
            this.syncSlotProjectionOnly(store, slot, options.projectionContext);
          } else if (this.textLane.shouldDeferSync(store, slot)) {
            this.syncSlotProjectionOnly(store, slot, options.projectionContext);
            this.textLane.defer(slot);
          } else {
            this.textLane.clearDeferred(slot);
            this.syncSlot(store, slot, options.projectionContext);
          }
        }
      }
      for (const slot of this.imageLane.dirtySlots()) {
        if (
          slot >= 0 &&
          slot < store.capacity &&
          !rangesContainSlot(options.changedRanges, slot)
        ) {
          this.syncSlot(store, slot, options.projectionContext);
        }
      }
    }
    this.imageLane.finishFullRebuild();
    this.textLane.finishSync();
    this.imageLane.finishSync();
    return this.debugSnapshot();
  }

  public cull(
    worldMatrix: Matrix,
    viewportWidth: number,
    viewportHeight: number,
    padding = 32,
    textRasterResolution?: number,
  ): number {
    this.assertAlive();
    if (
      !Number.isFinite(viewportWidth) ||
      viewportWidth <= 0 ||
      !Number.isFinite(viewportHeight) ||
      viewportHeight <= 0 ||
      !Number.isFinite(padding) ||
      padding < 0 ||
      (textRasterResolution !== undefined && (
        !Number.isFinite(textRasterResolution) || textRasterResolution <= 0
      ))
    ) {
      throw new TypeError('leaf culling viewport and padding must be finite and positive');
    }
    return this.textLane.cull(
      worldMatrix,
      viewportWidth,
      viewportHeight,
      padding,
      textRasterResolution,
    ) + this.imageLane.cull(worldMatrix, viewportWidth, viewportHeight, padding);
  }

  public debugSnapshot(): LeafLayerDebug {
    if (this.debugCache !== null) return this.debugCache;
    const textCounts = this.textLane.debugCounts();
    const imageCounts = this.imageLane.debugCounts();
    this.debugCache = Object.freeze({
      bitmapTextCount: textCounts.bitmapTextCount,
      fallbackTextCount: textCounts.fallbackTextCount,
      ...imageCounts,
    });
    return this.debugCache;
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const imageDestruction = this.imageLane.destroy();
    this.textLane.destroy();
    this.paintProbesByEntityId.clear();
    this.storeEpoch = -1;
    this.container.destroy();
    await imageDestruction;
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
    this.imageLane.syncSlot(store, slot, alive, visible, projectionContext);
    const textAlive = alive && kind === RenderKind.Text;
    if (!textAlive) {
      this.textLane.removeSlot(slot);
      return;
    }
    this.textLane.syncSlot(
      store,
      slot,
      visible,
      projectionContext,
      textMaterializationViewport,
    );
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
    if (alive && kind === RenderKind.Text) {
      this.textLane.syncProjectionOnly(store, slot, visible, projectionContext);
      return;
    }
    if (
      alive &&
      kind === RenderKind.Image &&
      this.imageLane.syncProjectionOnly(store, slot, entityId, visible, projectionContext)
    ) {
      return;
    }
    if (kind !== RenderKind.Text && kind !== RenderKind.Image) return;
    this.syncSlot(store, slot, projectionContext);
  }

  private get texts(): AggregateTextLeafLaneRetentionProbe['texts'] {
    return this.textLane.retentionProbe().texts;
  }

  private get textEntityIdBySlot(): AggregateTextLeafLaneRetentionProbe['textEntityIdBySlot'] {
    return this.textLane.retentionProbe().textEntityIdBySlot;
  }

  private get textVerticesBySlot(): AggregateTextLeafLaneRetentionProbe['textVerticesBySlot'] {
    return this.textLane.retentionProbe().textVerticesBySlot;
  }

  private get deferredTextSlots(): AggregateTextLeafLaneRetentionProbe['deferredTextSlots'] {
    return this.textLane.retentionProbe().deferredTextSlots;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AggregateLeafLayer is destroyed');
  }
}

function rangesContainSlot(ranges: readonly SlotRange[], slot: number): boolean {
  return ranges.some((range) => slot >= range.start && slot < range.end);
}
