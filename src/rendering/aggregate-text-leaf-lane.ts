import {
  BitmapText,
  Container,
  type Matrix,
  Text,
  } from 'pixi.js';

import type { PatchMapTextProjection } from '../parsing/contracts';
import {
  RenderAlign,
  RenderFlags,
  RenderKind,
  type RenderStoreView,
  } from '../dense/renderer-types';
import {
  selectPatchMapTextRenderRoute,
  type PatchMapBitmapTextCapabilityProof,
  type PatchMapTextRenderRoute,
  type PatchMapTextRenderRouteReason,
  } from '../semantic/text-render-route';
import type { PatchMapBitmapTextCapabilityRequest } from './contracts/options';
import {
  freezeTextAttachedSignatures,
  freezeTextRendererProbe,
  freezeTextSemanticSignatures,
  sameTextAttachedSignatures,
  stableSerializeLeafValue,
  textRendererSignature,
  textSemanticSignatures,
  } from './leaf-signatures';
import {
  alignName,
  countVisibleGraphemes,
  textGlyphResolution,
  textRenderStyle,
  textStyle,
  } from './leaf-text-style';
import {
  applyLeafProjection,
  quadIntersectsViewport,
  quadViewportCoverage,
  } from './leaf-projection';
import {
  type PatchMapEntityPaintProbe,
  type PatchMapRenderLaneProbe,
  type PatchMapTextAttachedSignatures,
  type PatchMapTextRendererProbe,
} from '../rendering-port';
import {
  resolvePatchMapSlotQuad,
} from '../geometry/render-quads';
import type {
  PatchMapProjectionRenderContext,
  PatchMapQuadVertices,
  PatchMapResolvedRenderQuad,
} from '../geometry/render-quads';


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
  autoFont: boolean;
  visualLocalBounds: TextVisualLocalBounds | null;
  quad: PatchMapResolvedRenderQuad;
  vertices: PatchMapQuadVertices;
}

interface TextVisualLocalBounds {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

interface TextChunk {
  readonly key: number;
  readonly container: Container;
  readonly slots: Set<number>;
  readonly visibleSlots: Set<number>;
  vertices: PatchMapQuadVertices;
  allChildrenVisible: boolean;
}

export interface TextMaterializationViewport {
  readonly worldMatrix: Matrix;
  readonly width: number;
  readonly height: number;
  readonly padding?: number;
}

export interface AggregateTextLeafLaneOptions {
  readonly paintProbesByEntityId: Map<string, PatchMapEntityPaintProbe>;
  readonly transformMatrix: Matrix;
  readonly onDebugChange?: () => void;
  readonly resolveBitmapTextCapability?: (
    request: PatchMapBitmapTextCapabilityRequest,
  ) => PatchMapBitmapTextCapabilityProof | null;
}

export interface AggregateTextLeafLaneRetentionProbe {
  readonly texts: ReadonlyMap<number, unknown>;
  readonly textEntityIdBySlot: readonly (string | undefined)[];
  readonly textVerticesBySlot: readonly (PatchMapQuadVertices | undefined)[];
  readonly deferredTextSlots: ReadonlySet<number>;
}

const TEXT_CHUNKING_CAPACITY_THRESHOLD = 1_024;
const TEXT_CHUNK_SLOT_SPAN = 64;
const MAX_ZOOM_AWARE_TEXT_TEXTURE_EDGE = 2_048;
const EMPTY_QUAD_VERTICES: PatchMapQuadVertices = Object.freeze([
  0, 0,
  0, 0,
  0, 0,
  0, 0,
]);

/**
 * Owns the aggregate text leaf state machine. The parent leaf coordinator keeps
 * the single dense-store scan and calls this lane once for each text slot.
 */
export class AggregateTextLeafLane {
  public readonly container = new Container({ label: 'PatchMap / text (0)' });

  private readonly texts = new Map<number, TextEntry>();
  /** Visible semantic text slots, including those without a Pixi object yet. */
  private readonly textEntityIdBySlot: Array<string | undefined> = [];
  private readonly textVerticesBySlot: Array<PatchMapQuadVertices | undefined> = [];
  private readonly textPresentationVisibleBySlot: boolean[] = [];
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
  private confirmedTextFrame = 0;
  private textRasterResolution: number | undefined;
  private destroyed = false;

  public constructor(
    private readonly options: AggregateTextLeafLaneOptions,
  ) {
    this.container.eventMode = 'none';
    this.container.interactiveChildren = false;
  }

  public textRendererProbe(entityId: string): PatchMapTextRendererProbe | null {
    return this.textProbesByEntityId.get(entityId) ?? null;
  }

  public lastRenderedTextGraphemeCount(entityId: string): number {
    return this.textLastRenderedGraphemeCountByEntityId.get(entityId) ?? 0;
  }

  public renderLaneProbe(): PatchMapRenderLaneProbe {
    return Object.freeze({
      role: 'text',
      label: this.container.label,
      renderObjectCount: this.texts.size,
      visiblePrimitiveCount: this.texts.size,
    });
  }

  public debugCounts(): Readonly<{
    readonly bitmapTextCount: number;
    readonly fallbackTextCount: number;
  }> {
    let bitmapTextCount = 0;
    for (const entry of this.texts.values()) {
      if (entry.attachedRoute === 'bitmap-text') bitmapTextCount += 1;
    }
    return Object.freeze({
      bitmapTextCount,
      fallbackTextCount: this.texts.size - bitmapTextCount,
    });
  }

  public retentionProbe(): AggregateTextLeafLaneRetentionProbe {
    return Object.freeze({
      texts: this.texts,
      textEntityIdBySlot: this.textEntityIdBySlot,
      textVerticesBySlot: this.textVerticesBySlot,
      deferredTextSlots: this.deferredTextSlots,
    });
  }

  public beginFullRebuild(capacity: number): void {
    this.assertAlive();
    this.clearDisplayObjects();
    this.textChunking = capacity >= TEXT_CHUNKING_CAPACITY_THRESHOLD;
  }

  public setDeferredSource(
    store: RenderStoreView,
    projectionContext?: PatchMapProjectionRenderContext,
  ): void {
    this.deferredTextStore = store;
    this.deferredTextProjectionContext = projectionContext;
  }

  public usesChunking(): boolean {
    return this.textChunking;
  }

  public clearDeferred(slot: number): void {
    this.deferredTextSlots.delete(slot);
  }

  public defer(slot: number): void {
    this.deferredTextSlots.add(slot);
  }

  public shouldDeferSync(store: RenderStoreView, slot: number): boolean {
    if (
      !this.textChunking ||
      store.alive[slot] !== 1 ||
      store.kind[slot] !== RenderKind.Text ||
      ((store.flags[slot] ?? 0) & RenderFlags.Visible) === 0
    ) return false;
    return this.textChunks.get(textChunkKey(slot))?.container.visible === false;
  }

  public removeSlot(slot: number): void {
    const entry = this.texts.get(slot);
    if (this.textEntityIdBySlot[slot] === undefined && entry === undefined) return;
    this.deferredTextSlots.delete(slot);
    const entityId = this.textEntityIdBySlot[slot] ?? entry?.entityId;
    this.textEntityIdBySlot[slot] = undefined;
    this.textVerticesBySlot[slot] = undefined;
    this.textPresentationVisibleBySlot[slot] = false;
    this.removeMaterializedText(slot);
    if (entityId !== undefined) {
      this.textProbesByEntityId.delete(entityId);
      this.textLastRenderedGraphemeCountByEntityId.delete(entityId);
      this.options.paintProbesByEntityId.delete(entityId);
    }
    if (this.textChunking) {
      const key = textChunkKey(slot);
      const chunk = this.textChunks.get(key);
      chunk?.slots.delete(slot);
      chunk?.visibleSlots.delete(slot);
      this.dirtyTextChunkKeys.add(key);
    }
  }

  public syncSlot(
    store: RenderStoreView,
    slot: number,
    visible: boolean,
    projectionContext?: PatchMapProjectionRenderContext,
    textMaterializationViewport?: TextMaterializationViewport,
  ): void {
    this.assertAlive();
    const preparedQuad = this.trackTextSlot(store, slot, projectionContext);
    this.setTextPresentationVisible(slot, visible);
    if (!visible) {
      this.deferredTextSlots.add(slot);
      const entry = this.texts.get(slot);
      if (entry !== undefined) {
        applyTextProjection(entry, preparedQuad, this.options.transformMatrix);
        entry.vertices = preparedQuad.vertices;
        entry.object.visible = false;
      }
      return;
    }
    if (textMaterializationViewport !== undefined) {
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

  public syncProjectionOnly(
    store: RenderStoreView,
    slot: number,
    visible: boolean,
    projectionContext?: PatchMapProjectionRenderContext,
  ): void {
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    const quad = this.trackTextSlot(store, slot, projectionContext);
    this.setTextPresentationVisible(slot, visible);
    const entry = this.texts.get(slot);
    if (entry !== undefined && entry.entityId === entityId) {
      applyTextProjection(entry, quad, this.options.transformMatrix);
      entry.vertices = quad.vertices;
      entry.object.visible = visible;
    }
  }

  public finishSync(): void {
    this.rebuildDirtyTextChunks();
    this.sortTextChunks();
    this.container.label = `PatchMap / text (${this.texts.size})`;
  }

  public cull(
    worldMatrix: Matrix,
    viewportWidth: number,
    viewportHeight: number,
    padding: number,
    textRasterResolution?: number,
  ): number {
    const textRasterResolutionChanged = textRasterResolution !== undefined &&
      textRasterResolution !== this.textRasterResolution;
    if (textRasterResolution !== undefined) {
      this.textRasterResolution = textRasterResolution;
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
        const chunkReentered = chunkVisible && !chunk.container.visible;
        if (chunk.container.visible !== chunkVisible) {
          chunk.container.visible = chunkVisible;
        }
        if (!chunkVisible) continue;
        if (coverage === 'inside') {
          if (chunkReentered || !chunk.allChildrenVisible || textRasterResolutionChanged) {
            for (const slot of chunk.visibleSlots) {
              const entry = this.texts.get(slot);
              if (entry !== undefined) {
                const becameVisible = !entry.object.visible;
                if (becameVisible) entry.object.visible = true;
                if (
                  textRasterResolution !== undefined &&
                  (textRasterResolutionChanged || chunkReentered || becameVisible)
                ) {
                  applyTextRasterResolution(
                    entry,
                    textRasterResolution,
                    this.options.transformMatrix,
                  );
                }
              }
            }
          }
          chunk.allChildrenVisible = true;
          visibleCount += chunk.visibleSlots.size;
          continue;
        }
        let allChildrenVisible = true;
        for (const slot of chunk.visibleSlots) {
          const entry = this.texts.get(slot);
          if (entry === undefined) continue;
          const visible = quadIntersectsViewport(
            entry.vertices,
            worldMatrix,
            viewportWidth,
            viewportHeight,
            padding,
          );
          const becameVisible = visible && !entry.object.visible;
          if (entry.object.visible !== visible) entry.object.visible = visible;
          if (visible) {
            if (
              textRasterResolution !== undefined &&
              (textRasterResolutionChanged || chunkReentered || becameVisible)
            ) {
              applyTextRasterResolution(
                entry,
                textRasterResolution,
                this.options.transformMatrix,
              );
            }
            visibleCount += 1;
          } else {
            allChildrenVisible = false;
          }
        }
        chunk.allChildrenVisible = allChildrenVisible;
      }
    } else {
      for (const entry of this.texts.values()) {
        const visible = this.textPresentationVisibleBySlot[entry.slot] === true &&
          quadIntersectsViewport(
            entry.vertices,
            worldMatrix,
            viewportWidth,
            viewportHeight,
            padding,
          );
        const becameVisible = visible && !entry.object.visible;
        entry.object.visible = visible;
        if (visible) {
          if (
            textRasterResolution !== undefined &&
            (textRasterResolutionChanged || becameVisible)
          ) {
            applyTextRasterResolution(
              entry,
              textRasterResolution,
              this.options.transformMatrix,
            );
          }
          visibleCount += 1;
        }
      }
    }
    this.container.label = `PatchMap / text (${this.texts.size})`;
    return visibleCount;
  }

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
  }

  public clearDisplayObjects(): void {
    for (const entry of this.texts.values()) entry.object.destroy();
    this.texts.clear();
    this.textEntityIdBySlot.length = 0;
    this.textVerticesBySlot.length = 0;
    this.textPresentationVisibleBySlot.length = 0;
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
    this.container.removeChildren();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearDisplayObjects();
    this.confirmedTextFrame = 0;
    this.textRasterResolution = undefined;
    this.container.destroy();
  }

  private syncText(
    store: RenderStoreView,
    slot: number,
    projectionContext?: PatchMapProjectionRenderContext,
    preparedQuad?: PatchMapResolvedRenderQuad,
  ): void {
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    const quad = preparedQuad ?? this.trackTextSlot(store, slot, projectionContext);
    const projection = projectionContext?.index.textsByEntityId[entityId] ?? null;
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
    let objectCreated = false;
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
      objectCreated = true;
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
        autoFont: projection?.authoredStyle.autoFont !== undefined,
        visualLocalBounds: measureTextLocalBounds(
          object,
          projection?.targetKind === 'element' ||
            projection?.authoredStyle.autoFont !== undefined,
        ),
        quad,
        vertices: EMPTY_QUAD_VERTICES,
      };
      this.texts.set(slot, entry);
      this.textParentForSlot(slot).addChild(object);
    } else if (entry.object.text !== value) {
      entry.object.text = value;
      entry.autoFont = projection?.authoredStyle.autoFont !== undefined;
      entry.visualLocalBounds = measureTextLocalBounds(
        entry.object,
        entry.targetKind === 'element' || entry.autoFont,
      );
    }

    const targetKind = projection?.targetKind ?? null;
    if (entry.targetKind !== targetKind) {
      entry.targetKind = targetKind;
      entry.autoFont = projection?.authoredStyle.autoFont !== undefined;
      entry.visualLocalBounds = measureTextLocalBounds(
        entry.object,
        entry.targetKind === 'element' || entry.autoFont,
      );
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
    applyTextProjection(entry, quad, this.options.transformMatrix);
    if (objectCreated && this.textRasterResolution !== undefined) {
      applyTextRasterResolution(entry, this.textRasterResolution, this.options.transformMatrix);
    }
    entry.vertices = quad.vertices;
    if (this.textChunking) this.dirtyTextChunkKeys.add(textChunkKey(slot));
    object.alpha = alpha;
    object.tint = packedRgb(packedColor);
    object.visible = true;
    this.publishTextProbe(entry);
    this.options.paintProbesByEntityId.set(entityId, freezeEntityPaintProbe({
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

  private removeMaterializedText(slot: number): void {
    const entry = this.texts.get(slot);
    if (!entry) return;
    this.texts.delete(slot);
    this.pendingTextEntries.delete(entry);
    this.textProbesByEntityId.delete(entry.entityId);
    this.textLastRenderedGraphemeCountByEntityId.delete(entry.entityId);
    this.options.paintProbesByEntityId.delete(entry.entityId);
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
      this.removeSlot(slot);
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
    if (!this.textChunking) return this.container;
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
      visibleSlots: new Set(),
      vertices: EMPTY_QUAD_VERTICES,
      allChildrenVisible: true,
    };
    this.textChunks.set(key, chunk);
    this.dirtyTextChunkKeys.add(key);
    this.textChunkOrderDirty = true;
    this.container.addChild(container);
    return container;
  }

  private setTextPresentationVisible(slot: number, visible: boolean): void {
    this.textPresentationVisibleBySlot[slot] = visible;
    if (!this.textChunking) return;
    const chunk = this.textChunks.get(textChunkKey(slot));
    if (chunk === undefined) return;
    if (visible) chunk.visibleSlots.add(slot);
    else chunk.visibleSlots.delete(slot);
    chunk.allChildrenVisible = false;
  }

  private materializeDeferredTextChunk(chunk: TextChunk): boolean {
    const store = this.deferredTextStore;
    if (store === null) return false;
    let changed = false;
    for (const slot of [...chunk.visibleSlots]) {
      const deferred = this.deferredTextSlots.delete(slot);
      if (!deferred && this.texts.has(slot)) continue;
      this.syncSlot(store, slot, true, this.deferredTextProjectionContext);
      changed = true;
    }
    if (changed) this.options.onDebugChange?.();
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
    this.container.removeChildren();
    if (containers.length > 0) this.container.addChild(...containers);
    this.textChunkOrderDirty = false;
  }

  private confirmPendingTextEntry(entry: TextEntry, frame: number): void {
    entry.lastRenderedSignatures = entry.attachedSignatures;
    entry.lastRenderedFrame = frame;
    entry.lastRenderedVisibleGraphemeCount = entry.attachedVisibleGraphemeCount;
    this.publishTextProbe(entry);
    this.pendingTextEntries.delete(entry);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('AggregateTextLeafLane is destroyed');
  }
}

function textChunkKey(slot: number): number {
  return Math.floor(slot / TEXT_CHUNK_SLOT_SPAN);
}

function packedRgb(value: number): number {
  return (value >>> 8) & 0xffffff;
}

function combinedAlpha(value: number, opacity: number): number {
  return Math.max(0, Math.min(1, opacity * ((value & 0xff) / 255)));
}

function freezeEntityPaintProbe(
  probe: PatchMapEntityPaintProbe,
): PatchMapEntityPaintProbe {
  return Object.freeze({ ...probe });
}

function applyTextProjection(
  entry: TextEntry,
  quad: PatchMapResolvedRenderQuad,
  matrix: Matrix,
): void {
  entry.quad = quad;
  const visualBounds = entry.visualLocalBounds;
  if (visualBounds !== null && entry.targetKind !== 'element') {
    applyContainedAutoFontTextProjection(entry.object, quad, visualBounds, matrix);
    return;
  }
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
  const originX = visualBounds?.minX ?? 0;
  const originY = visualBounds?.minY ?? 0;
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

function applyContainedAutoFontTextProjection(
  object: BitmapText | Text,
  quad: PatchMapResolvedRenderQuad,
  visual: TextVisualLocalBounds,
  matrix: Matrix,
): void {
  object.anchor.set(0);
  const localWidth = Math.max(
    Number.EPSILON,
    Math.abs(quad.projection?.localBounds[2] ?? quad.width),
  );
  const localHeight = Math.max(
    Number.EPSILON,
    Math.abs(quad.projection?.localBounds[3] ?? quad.height),
  );
  const fitScale = Math.min(
    1,
    localWidth / Math.max(Number.EPSILON, visual.width),
    localHeight / Math.max(Number.EPSILON, visual.height),
  );
  const xScale = quad.width / localWidth;
  const yScale = quad.height / localHeight;
  const localOffsetX = (localWidth - visual.width * fitScale) / 2 - visual.minX * fitScale;
  const localOffsetY = (localHeight - visual.height * fitScale) / 2 - visual.minY * fitScale;
  const a = quad.basis[0] * xScale;
  const b = quad.basis[1] * xScale;
  const c = quad.basis[2] * yScale;
  const d = quad.basis[3] * yScale;
  object.setFromMatrix(matrix.set(
    a * fitScale,
    b * fitScale,
    c * fitScale,
    d * fitScale,
    quad.vertices[0] + a * localOffsetX + c * localOffsetY,
    quad.vertices[1] + b * localOffsetX + d * localOffsetY,
  ));
}

/** Cache browser raster bounds for element projection or autoFont containment. */
function measureTextLocalBounds(
  object: BitmapText | Text,
  autoFont: boolean,
): TextVisualLocalBounds | null {
  if (!autoFont) return null;
  object.anchor.set(0);
  if (typeof document === 'undefined') return null;
  const bounds = object.getLocalBounds();
  const minX = Number.isFinite(bounds.minX) ? bounds.minX : 0;
  const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
  const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX : minX;
  const maxY = Number.isFinite(bounds.maxY) ? bounds.maxY : minY;
  return Object.freeze({
    minX,
    minY,
    width: Math.max(Number.EPSILON, maxX - minX),
    height: Math.max(Number.EPSILON, maxY - minY),
  });
}

function applyTextRasterResolution(
  entry: TextEntry,
  requestedResolution: number,
  matrix: Matrix,
): void {
  if (!(entry.object instanceof Text)) return;
  if (Math.abs(entry.object.resolution - requestedResolution) <= Number.EPSILON) return;
  const visual = entry.visualLocalBounds;
  const maximumLogicalEdge = visual === null
    ? Math.max(entry.object.width, entry.object.height, 1)
    : Math.max(visual.width, visual.height, 1);
  const resolution = Math.min(
    requestedResolution,
    MAX_ZOOM_AWARE_TEXT_TEXTURE_EDGE / maximumLogicalEdge,
  );
  if (Math.abs(entry.object.resolution - resolution) <= Number.EPSILON) return;
  entry.object.resolution = resolution;
  entry.visualLocalBounds = measureTextLocalBounds(
    entry.object,
    entry.targetKind === 'element' || entry.autoFont,
  );
  applyTextProjection(entry, entry.quad, matrix);
}
