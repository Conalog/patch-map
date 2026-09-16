import { Graphics, type Container, type Matrix } from 'pixi.js';

import type { PatchMapProjectionIndex } from '../../parsing/contracts';
import type { SlotRange } from '../../dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../dense/renderer-types';
import type { PatchMapInteractionOverlayPolicy, PatchMapOverlayPaintProbe } from '../../rendering-port';
import type {
  PatchMapProjectionRenderContext,
} from '../../geometry/render-quads';
import {
  appendOverlayHandles,
  appendOverlayOutline,
  DEFAULT_INTERACTION_OVERLAY_POLICY,
  indexOverlayPaintBounds,
  interactionOverlayLabel,
  interactionOverlayTransformNeedsRepaint,
  normalizeInteractionOverlayPolicy,
  resolveOverlayLocalCssLength,
  resolveOverlayPathPlan,
  resolveOverlayStrokeAlignment,
  resolveOverlayWorldScale,
  resolveSelectionLocalStrokeWidth,
  resolveSelectionScreenStrokeWidth,
  sameInteractionOverlayPolicy,
  type PatchMapOverlayPaintBoundsIndex,
  type PatchMapOverlayWorldTransform,
} from './interaction-overlay';

export interface PatchMapPixiInteractionOverlayAuthorityOptions {
  readonly worldMatrix: Matrix;
  readonly slotByEntityId: ReadonlyMap<string, number>;
  readonly readProjectionContext: () => PatchMapProjectionRenderContext;
}

type SelectionMarquee = Readonly<{
  readonly start: readonly [number, number];
  readonly current: readonly [number, number];
}>;

export class PatchMapPixiInteractionOverlayAuthority {
  public readonly selectionGraphics: Graphics;
  public readonly transformerGraphics: Graphics;

  private readonly worldMatrix: Matrix;
  private readonly slotByEntityId: ReadonlyMap<string, number>;
  private readonly readProjectionContext: () => PatchMapProjectionRenderContext;
  private readonly selectedSlots = new Set<number>();
  private readonly visibleOverlaySlots = new Set<number>();
  private readonly transformerOverlaySlots = new Set<number>();
  private readonly resizableOverlaySlots = new Set<number>();
  private individualSelectionOutlineCount = 0;
  private groupSelectionOutlineVisible = false;
  private selectionOutlineCount = 0;
  private redrawCount = 0;
  private paintTransform: PatchMapOverlayWorldTransform | null = null;
  private selectionLocalStrokeWidth = 0;
  private selectionScreenStrokeWidth = 0;
  private marqueeLocalStrokeWidth = 0;
  private policy = DEFAULT_INTERACTION_OVERLAY_POLICY;
  private marquee: SelectionMarquee | null = null;
  private paintBoundsProjection: PatchMapProjectionIndex | null = null;
  private paintBoundsIndex: PatchMapOverlayPaintBoundsIndex = new Map();
  private destroyed = false;

  public constructor(options: PatchMapPixiInteractionOverlayAuthorityOptions) {
    this.worldMatrix = options.worldMatrix;
    this.slotByEntityId = options.slotByEntityId;
    this.readProjectionContext = options.readProjectionContext;
    this.selectionGraphics = new Graphics({ label: 'PatchMap / selection overlay (0)' });
    this.selectionGraphics.eventMode = 'none';
    this.selectionGraphics.zIndex = 1;
    this.transformerGraphics = new Graphics({ label: 'PatchMap / transformer overlay (0)' });
    this.transformerGraphics.eventMode = 'none';
    this.transformerGraphics.zIndex = 2;
  }

  public get label(): string {
    return interactionOverlayLabel(this.selectionGraphics, this.transformerGraphics);
  }

  public get renderObjectCount(): number {
    return this.visibleOverlaySlots.size > 0 ? 2 : 0;
  }

  public get visiblePrimitiveCount(): number {
    return this.selectedSlots.size * 2;
  }

  public get marqueeVisible(): boolean {
    return this.marquee !== null;
  }

  public attachToTail(parent: Container): void {
    parent.addChild(this.selectionGraphics, this.transformerGraphics);
  }

  public setPolicy(
    policy: PatchMapInteractionOverlayPolicy,
    store: RenderStoreView | null,
  ): boolean {
    const normalized = normalizeInteractionOverlayPolicy(policy);
    if (sameInteractionOverlayPolicy(this.policy, normalized)) return false;
    this.policy = normalized;
    if (store !== null) this.synchronize(store, true, undefined);
    return true;
  }

  public setMarquee(
    input: SelectionMarquee | null,
    store: RenderStoreView | null,
  ): boolean {
    const next = input === null ? null : normalizeSelectionMarquee(input);
    if (sameSelectionMarquee(this.marquee, next)) return false;
    this.marquee = next;
    if (store !== null) this.paint(store);
    return true;
  }

  public synchronize(
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
    const transformNeedsRepaint = interactionOverlayTransformNeedsRepaint(
      this.paintTransform,
      this.worldMatrix,
      this.marquee !== null,
    );
    if (!changed && !transformNeedsRepaint) return;
    if (!changed) {
      this.paint(store);
      return;
    }
    const transformableIds = this.policy.transformableEntityIds === null
      ? null
      : new Set(this.policy.transformableEntityIds);
    const resizableIds = new Set(this.policy.resizableEntityIds);
    this.visibleOverlaySlots.clear();
    this.transformerOverlaySlots.clear();
    this.resizableOverlaySlots.clear();
    if (!this.policy.hidden) {
      const overlaySlots = this.policy.visibleEntityIds === null
        ? this.selectedSlots
        : this.policy.visibleEntityIds.flatMap((id) => {
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
        if (resizableIds.has(id)) {
          this.resizableOverlaySlots.add(slot);
        }
      }
    }
    this.paint(store);
  }

  public resetSelection(): void {
    this.selectedSlots.clear();
    this.visibleOverlaySlots.clear();
    this.transformerOverlaySlots.clear();
    this.resizableOverlaySlots.clear();
  }

  public probe(): PatchMapOverlayPaintProbe {
    const visible = this.selectionOutlineCount > 0;
    return Object.freeze({
      order: Object.freeze(['selection', 'transformer'] as const),
      selection: visible,
      transformer: this.transformerOverlaySlots.size > 0,
      selectedEntityCount: this.visibleOverlaySlots.size,
      renderObjectCount: visible ? 2 : 0,
      displayMode: this.policy.displayMode,
      strokeAlignment: this.policy.strokeAlignment,
      strokeScale: this.policy.strokeScale,
      individualOutlineCount: this.individualSelectionOutlineCount,
      groupOutline: this.groupSelectionOutlineVisible,
      outlineCount: this.selectionOutlineCount,
      redrawCount: this.redrawCount,
      worldScale: this.paintTransform === null
        ? null
        : resolveOverlayWorldScale(this.paintTransform),
      selectionLocalStrokeWidth: this.selectionLocalStrokeWidth,
      selectionScreenStrokeWidth: this.selectionScreenStrokeWidth,
      marqueeLocalStrokeWidth: this.marqueeLocalStrokeWidth,
    });
  }

  /** @internal Observable seam for immutable projection-cache tests. */
  public resolvePaintBoundsIndex(
    projection: PatchMapProjectionIndex,
  ): PatchMapOverlayPaintBoundsIndex {
    if (this.paintBoundsProjection !== projection) {
      this.paintBoundsProjection = projection;
      this.paintBoundsIndex = indexOverlayPaintBounds(projection);
    }
    return this.paintBoundsIndex;
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.resetSelection();
    this.individualSelectionOutlineCount = 0;
    this.groupSelectionOutlineVisible = false;
    this.selectionOutlineCount = 0;
    this.redrawCount = 0;
    this.paintTransform = null;
    this.selectionLocalStrokeWidth = 0;
    this.selectionScreenStrokeWidth = 0;
    this.marqueeLocalStrokeWidth = 0;
    this.policy = DEFAULT_INTERACTION_OVERLAY_POLICY;
    this.marquee = null;
    this.paintBoundsProjection = null;
    this.paintBoundsIndex = new Map();
    this.selectionGraphics.destroy();
    this.transformerGraphics.destroy();
    return true;
  }

  private paint(store: RenderStoreView): void {
    const projectionContext = this.readProjectionContext();
    const selectionLocalStrokeWidth = resolveSelectionLocalStrokeWidth(
      this.policy.strokeCssPx,
      this.policy.strokeScale,
      this.policy.minStrokeCssPx,
      this.worldMatrix,
    );
    const selectionScreenStrokeWidth = resolveSelectionScreenStrokeWidth(
      this.policy.strokeCssPx,
      this.policy.strokeScale,
      this.policy.minStrokeCssPx,
      this.worldMatrix,
    );
    const marqueeLocalStrokeWidth = resolveOverlayLocalCssLength(
      this.policy.marqueeStrokeCssPx,
      this.worldMatrix,
    );
    const handleLocalSize = resolveOverlayLocalCssLength(
      this.policy.handleCssPx,
      this.worldMatrix,
    );
    this.selectionGraphics.clear();
    this.transformerGraphics.clear();
    const pathPlan = resolveOverlayPathPlan(
      store,
      [...this.visibleOverlaySlots].sort((left, right) => left - right),
      projectionContext,
      this.policy.displayMode,
      {
        entityIdsByOwnerId: this.resolvePaintBoundsIndex(projectionContext.index),
        slotByEntityId: this.slotByEntityId,
      },
    );
    for (const vertices of pathPlan.selectionPaths) {
      appendOverlayOutline(this.selectionGraphics, vertices);
    }
    const overlayVertices = pathPlan.aggregateVertices;
    if (overlayVertices !== null && this.resizableOverlaySlots.size > 0) {
      appendOverlayHandles(this.transformerGraphics, overlayVertices, handleLocalSize);
    }
    this.individualSelectionOutlineCount = this.policy.displayMode === 'element-only'
      ? pathPlan.individualVertices.length
      : this.policy.displayMode === 'all'
        ? pathPlan.individualVertices.length
        : 0;
    this.groupSelectionOutlineVisible = this.policy.displayMode === 'group-only'
      ? overlayVertices !== null
      : this.policy.displayMode === 'all' && pathPlan.individualVertices.length > 1;
    this.selectionOutlineCount = pathPlan.selectionPaths.length;
    if (this.selectionOutlineCount > 0) {
      this.selectionGraphics.stroke({
        color: this.policy.color,
        width: selectionLocalStrokeWidth,
        alignment: resolveOverlayStrokeAlignment(this.policy.strokeAlignment),
        alpha: 1,
      });
    }
    if (this.resizableOverlaySlots.size > 0) {
      this.transformerGraphics.fill({ color: 0xffffff, alpha: 1 });
      this.transformerGraphics.stroke({
        color: this.policy.color,
        width: selectionLocalStrokeWidth,
        alignment: resolveOverlayStrokeAlignment(this.policy.strokeAlignment),
        alpha: 1,
      });
    }
    if (this.marquee !== null) {
      appendScreenMarquee(this.transformerGraphics, this.marquee, this.worldMatrix);
      this.transformerGraphics.fill({
        color: this.policy.marqueeColor,
        alpha: this.policy.marqueeFillAlpha,
      });
      this.transformerGraphics.stroke({
        color: this.policy.marqueeColor,
        width: marqueeLocalStrokeWidth,
        alignment: 0.5,
        alpha: 1,
      });
    }
    this.selectionGraphics.label =
      `PatchMap / selection overlay (${this.visibleOverlaySlots.size})`;
    this.transformerGraphics.label =
      `PatchMap / transformer overlay (${this.transformerOverlaySlots.size})`;
    this.redrawCount += 1;
    this.paintTransform = Object.freeze({
      a: this.worldMatrix.a,
      b: this.worldMatrix.b,
      c: this.worldMatrix.c,
      d: this.worldMatrix.d,
      tx: this.worldMatrix.tx,
      ty: this.worldMatrix.ty,
    });
    this.selectionLocalStrokeWidth = selectionLocalStrokeWidth;
    this.selectionScreenStrokeWidth = selectionScreenStrokeWidth;
    this.marqueeLocalStrokeWidth = marqueeLocalStrokeWidth;
  }
}

function normalizeSelectionMarquee(input: SelectionMarquee): SelectionMarquee {
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

function sameSelectionMarquee(left: SelectionMarquee | null, right: SelectionMarquee | null): boolean {
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
  marquee: SelectionMarquee,
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
