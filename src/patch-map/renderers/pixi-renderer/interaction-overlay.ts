import type { Graphics } from 'pixi.js';

import type { PatchMapProjectionIndex } from '../../contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../dense/renderer-types';
import {
  sameNullableStringArray,
  sameStringArray,
} from '../../shared/string-array-values';
import type { PatchMapInteractionOverlayPolicy } from '../types';
import {
  resolvePatchMapSlotQuad,
  type PatchMapProjectionRenderContext,
} from '../types';
import { positive } from './value-atoms';

export const DEFAULT_INTERACTION_OVERLAY_POLICY: PatchMapInteractionOverlayPolicy = Object.freeze({
  visibleEntityIds: null,
  transformableEntityIds: null,
  resizableEntityIds: Object.freeze([]),
  hidden: false,
  handleCssPx: 6,
  strokeCssPx: 2,
  strokeScale: 'fixed',
  minStrokeCssPx: 1,
  strokeAlignment: 'center',
  color: 0x2f80ed,
  displayMode: 'all',
  marqueeColor: 0x2f80ed,
  marqueeStrokeCssPx: 2,
  marqueeFillAlpha: 0.08,
});

export interface PatchMapOverlayPathPlan {
  /** One oriented quad per selected semantic geometry. */
  readonly individualVertices: readonly (readonly number[])[];
  /** Axis-aligned union for multiple quads; the oriented quad for one. */
  readonly aggregateVertices: readonly number[] | null;
  /** Selection paths after applying the bounds display mode. */
  readonly selectionPaths: readonly (readonly number[])[];
}

/** Parser-owned visual paint attached to a semantic owner. */
export type PatchMapOverlayPaintBoundsIndex = ReadonlyMap<string, readonly string[]>;

export interface PatchMapOverlayPaintBoundsContext {
  readonly entityIdsByOwnerId: PatchMapOverlayPaintBoundsIndex;
  readonly slotByEntityId: ReadonlyMap<string, number>;
}

export interface PatchMapOverlayWorldTransform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

/** Convert a CSS-pixel overlay length into the current aggregate world's units. */
export function resolveOverlayLocalCssLength(
  cssPx: number,
  world: Pick<PatchMapOverlayWorldTransform, 'a' | 'b'>,
): number {
  return cssPx / resolveOverlayWorldScale(world);
}

/** Resolve persistent selection LOD in CSS pixels before converting to world units. */
export function resolveSelectionScreenStrokeWidth(
  strokeCssPx: number,
  strokeScale: PatchMapInteractionOverlayPolicy['strokeScale'],
  minStrokeCssPx: number,
  world: Pick<PatchMapOverlayWorldTransform, 'a' | 'b'>,
): number {
  if (strokeScale === 'fixed') return strokeCssPx;
  const viewportScale = resolveOverlayWorldScale(world);
  return Math.min(strokeCssPx, Math.max(minStrokeCssPx, strokeCssPx * viewportScale));
}

/** Convert the effective persistent selection width into aggregate world units. */
export function resolveSelectionLocalStrokeWidth(
  strokeCssPx: number,
  strokeScale: PatchMapInteractionOverlayPolicy['strokeScale'],
  minStrokeCssPx: number,
  world: Pick<PatchMapOverlayWorldTransform, 'a' | 'b'>,
): number {
  return resolveSelectionScreenStrokeWidth(
    strokeCssPx,
    strokeScale,
    minStrokeCssPx,
    world,
  ) / resolveOverlayWorldScale(world);
}

/** Uniform viewport scale derived from the renderer-owned world matrix. */
export function resolveOverlayWorldScale(
  world: Pick<PatchMapOverlayWorldTransform, 'a' | 'b'>,
): number {
  return Math.max(Math.hypot(world.a, world.b), 0.001);
}

/** PixiJS v8: 0 outside, 0.5 centered, 1 inside. */
export function resolveOverlayStrokeAlignment(
  alignment: PatchMapInteractionOverlayPolicy['strokeAlignment'],
): 0 | 0.5 | 1 {
  if (alignment === 'outside') return 0;
  if (alignment === 'inside') return 1;
  return 0.5;
}

/**
 * Persistent paths need repaint only when scale changes; a screen-space
 * marquee also needs repaint when translation or orientation changes.
 */
export function interactionOverlayTransformNeedsRepaint(
  painted: PatchMapOverlayWorldTransform | null,
  current: PatchMapOverlayWorldTransform,
  marqueeVisible: boolean,
): boolean {
  if (painted === null) return true;
  if (resolveOverlayWorldScale(painted) !== resolveOverlayWorldScale(current)) return true;
  return marqueeVisible && (
    painted.a !== current.a ||
    painted.b !== current.b ||
    painted.c !== current.c ||
    painted.d !== current.d ||
    painted.tx !== current.tx ||
    painted.ty !== current.ty
  );
}

export function resolveOverlayPathPlan(
  store: RenderStoreView,
  slots: readonly number[],
  projectionContext: PatchMapProjectionRenderContext,
  displayMode: PatchMapInteractionOverlayPolicy['displayMode'],
  paintBoundsContext?: PatchMapOverlayPaintBoundsContext,
): PatchMapOverlayPathPlan {
  const individualVertices = Object.freeze(slots.flatMap((slot) => {
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    if (!(quad.width > 0) || !(quad.height > 0)) return [];
    return [resolveOverlayPaintBoundsVertices(
      store,
      slot,
      quad.vertices,
      quad.projection?.localBounds[2] ?? quad.width,
      quad.projection?.localBounds[3] ?? quad.height,
      projectionContext,
      paintBoundsContext,
    )];
  }));
  const aggregateVertices = aggregateOverlayVertices(individualVertices);
  const selectionPaths = composeOverlaySelectionPaths(
    individualVertices,
    aggregateVertices,
    displayMode,
  );
  return Object.freeze({ individualVertices, aggregateVertices, selectionPaths });
}

/** Build once per immutable projection identity, never per unchanged frame. */
export function indexOverlayPaintBounds(
  projection: PatchMapProjectionIndex,
): PatchMapOverlayPaintBoundsIndex {
  const mutable = new Map<string, string[]>();
  const append = (ownerId: string, entityId: string): void => {
    const current = mutable.get(ownerId);
    if (current === undefined) mutable.set(ownerId, [entityId]);
    else if (!current.includes(entityId)) current.push(entityId);
  };
  for (const component of Object.values(projection.componentsByEntityId)) {
    append(component.ownerId, component.entityId);
  }
  for (const bar of Object.values(projection.barsByEntityId)) {
    append(bar.ownerId, bar.entityId);
  }
  for (const text of Object.values(projection.textsByEntityId)) {
    if (text.ownerId !== undefined) append(text.ownerId, text.entityId);
  }
  return new Map([...mutable].map(([ownerId, entityIds]) => [
    ownerId,
    Object.freeze([...entityIds].sort()),
  ]));
}

function resolveOverlayPaintBoundsVertices(
  store: RenderStoreView,
  slot: number,
  semanticVertices: readonly number[],
  semanticLocalWidth: number,
  semanticLocalHeight: number,
  projectionContext: PatchMapProjectionRenderContext,
  paintBoundsContext?: PatchMapOverlayPaintBoundsContext,
): readonly number[] {
  const candidates: number[][] = [[...semanticVertices]];
  const ownStrokeWidth = store.kind[slot] === RenderKind.Rect
    && visiblePaintSlot(store, slot)
    && packedRgbaAlpha(store.stroke[slot] as number) > 0
    ? Math.max(0, store.strokeWidth[slot] as number)
    : 0;
  if (ownStrokeWidth > 0) {
    candidates.push([...expandOverlayQuad(
      semanticVertices,
      semanticLocalWidth,
      semanticLocalHeight,
      ownStrokeWidth / 2,
    )]);
  }
  const ownerId = store.ids[slot];
  if (ownerId !== undefined && paintBoundsContext !== undefined) {
    for (const paintEntityId of (
      paintBoundsContext.entityIdsByOwnerId.get(ownerId) ?? []
    )) {
      const paintSlot = paintBoundsContext.slotByEntityId.get(paintEntityId);
      const paint = projectionContext.index.backgroundsByEntityId[paintEntityId];
      if (
        paintSlot === undefined
        || !visiblePaintSlot(store, paintSlot)
      ) {
        continue;
      }
      const paintQuad = resolvePatchMapSlotQuad(store, paintSlot, projectionContext);
      if (!(paintQuad.width > 0) || !(paintQuad.height > 0)) continue;
      const centeredStrokeOutset = paint?.sourceKind === 'rect'
        && paint.borderWidth > 0
        && packedRgbaAlpha(paint.borderColor) > 0
        && packedRgbaAlpha(paint.tint) > 0
        ? paint.borderWidth / 2
        : 0;
      candidates.push(centeredStrokeOutset > 0
        ? [...expandOverlayQuad(
            paintQuad.vertices,
            paintQuad.projection?.localBounds[2] ?? paintQuad.width,
            paintQuad.projection?.localBounds[3] ?? paintQuad.height,
            centeredStrokeOutset,
          )]
        : [...paintQuad.vertices]);
    }
  }
  return candidates.length === 1
    ? Object.freeze(candidates[0]!)
    : orientedOverlayUnion(semanticVertices, candidates);
}

/** Expand a projected affine quad by a centered local-space stroke outset. */
function expandOverlayQuad(
  vertices: readonly number[],
  localWidth: number,
  localHeight: number,
  outset: number,
): readonly number[] {
  if (!(outset > 0) || !(localWidth > 0) || !(localHeight > 0)) {
    return Object.freeze([...vertices]);
  }
  const left = vertices[0]!;
  const top = vertices[1]!;
  const edgeXx = vertices[2]! - left;
  const edgeXy = vertices[3]! - top;
  const edgeYx = vertices[6]! - left;
  const edgeYy = vertices[7]! - top;
  const x = outset / localWidth;
  const y = outset / localHeight;
  const topLeftX = left - edgeXx * x - edgeYx * y;
  const topLeftY = top - edgeXy * x - edgeYy * y;
  const expandedEdgeXx = edgeXx * (1 + 2 * x);
  const expandedEdgeXy = edgeXy * (1 + 2 * x);
  const expandedEdgeYx = edgeYx * (1 + 2 * y);
  const expandedEdgeYy = edgeYy * (1 + 2 * y);
  return Object.freeze([
    topLeftX,
    topLeftY,
    topLeftX + expandedEdgeXx,
    topLeftY + expandedEdgeXy,
    topLeftX + expandedEdgeXx + expandedEdgeYx,
    topLeftY + expandedEdgeXy + expandedEdgeYy,
    topLeftX + expandedEdgeYx,
    topLeftY + expandedEdgeYy,
  ]);
}

/** Enclose paint quads in the selected semantic quad's oriented affine frame. */
function orientedOverlayUnion(
  reference: readonly number[],
  candidates: readonly (readonly number[])[],
): readonly number[] {
  const originX = reference[0]!;
  const originY = reference[1]!;
  const edgeXx = reference[2]! - originX;
  const edgeXy = reference[3]! - originY;
  const edgeYx = reference[6]! - originX;
  const edgeYy = reference[7]! - originY;
  const determinant = edgeXx * edgeYy - edgeXy * edgeYx;
  if (Math.abs(determinant) < Number.EPSILON) {
    return aggregateOverlayVertices(candidates) ?? Object.freeze([...reference]);
  }
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const vertices of candidates) {
    for (let index = 0; index < vertices.length; index += 2) {
      const deltaX = vertices[index]! - originX;
      const deltaY = vertices[index + 1]! - originY;
      const u = (deltaX * edgeYy - deltaY * edgeYx) / determinant;
      const v = (edgeXx * deltaY - edgeXy * deltaX) / determinant;
      minU = Math.min(minU, u);
      minV = Math.min(minV, v);
      maxU = Math.max(maxU, u);
      maxV = Math.max(maxV, v);
    }
  }
  const point = (u: number, v: number): readonly [number, number] => Object.freeze([
    originX + edgeXx * u + edgeYx * v,
    originY + edgeXy * u + edgeYy * v,
  ]);
  const topLeft = point(minU, minV);
  const topRight = point(maxU, minV);
  const bottomRight = point(maxU, maxV);
  const bottomLeft = point(minU, maxV);
  return Object.freeze([
    ...topLeft,
    ...topRight,
    ...bottomRight,
    ...bottomLeft,
  ]);
}

function visiblePaintSlot(store: RenderStoreView, slot: number): boolean {
  return store.alive[slot] === 1
    && ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0
    && (store.opacity[slot] ?? 0) > 0;
}

function packedRgbaAlpha(value: number): number {
  return (value >>> 0) & 0xff;
}

export function composeOverlaySelectionPaths(
  individualVertices: readonly (readonly number[])[],
  aggregateVertices: readonly number[] | null,
  displayMode: PatchMapInteractionOverlayPolicy['displayMode'],
): readonly (readonly number[])[] {
  if (displayMode === 'hidden' || aggregateVertices === null) return Object.freeze([]);
  if (displayMode === 'group-only') return Object.freeze([aggregateVertices]);
  if (displayMode === 'element-only' || individualVertices.length <= 1) {
    return individualVertices;
  }
  return Object.freeze([...individualVertices, aggregateVertices]);
}

export function appendOverlayOutline(
  graphics: Graphics,
  vertices: readonly number[],
): void {
  const firstX = vertices[0];
  const firstY = vertices[1];
  if (firstX === undefined || firstY === undefined) return;
  graphics.moveTo(firstX, firstY);
  for (let index = 2; index < vertices.length; index += 2) {
    graphics.lineTo(vertices[index]!, vertices[index + 1]!);
  }
  graphics.closePath();
}

export function appendOverlayHandles(
  graphics: Graphics,
  vertices: readonly number[],
  size: number,
): void {
  const half = size / 2;
  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index];
    const y = vertices[index + 1];
    if (x === undefined || y === undefined) continue;
    graphics.rect(x - half, y - half, size, size);
  }
}

export function interactionOverlayLabel(
  selection: Graphics,
  transformer: Graphics,
): string {
  return `${selection.label} + ${transformer.label}`;
}

export function normalizeInteractionOverlayPolicy(
  policy: PatchMapInteractionOverlayPolicy,
): PatchMapInteractionOverlayPolicy {
  const visibleEntityIds = policy.visibleEntityIds === null
    ? null
    : freezeEntityIds(policy.visibleEntityIds, 'visibleEntityIds');
  const transformableEntityIds = policy.transformableEntityIds === null
    ? null
    : freezeEntityIds(policy.transformableEntityIds, 'transformableEntityIds');
  const strokeCssPx = positive(policy.strokeCssPx, 'strokeCssPx');
  const minStrokeCssPx = positive(policy.minStrokeCssPx, 'minStrokeCssPx');
  if (minStrokeCssPx > strokeCssPx) {
    throw new RangeError('minStrokeCssPx cannot exceed strokeCssPx');
  }
  return Object.freeze({
    visibleEntityIds,
    transformableEntityIds,
    resizableEntityIds: freezeEntityIds(policy.resizableEntityIds, 'resizableEntityIds'),
    hidden: policy.hidden,
    handleCssPx: positive(policy.handleCssPx, 'handleCssPx'),
    strokeCssPx,
    strokeScale: normalizeStrokeScale(policy.strokeScale),
    minStrokeCssPx,
    strokeAlignment: normalizeStrokeAlignment(policy.strokeAlignment),
    color: normalizeRgb(policy.color),
    displayMode: normalizeDisplayMode(policy.displayMode),
    marqueeColor: normalizeRgb(policy.marqueeColor),
    marqueeStrokeCssPx: positive(policy.marqueeStrokeCssPx, 'marqueeStrokeCssPx'),
    marqueeFillAlpha: normalizeAlpha(policy.marqueeFillAlpha),
  });
}

export function sameInteractionOverlayPolicy(
  left: PatchMapInteractionOverlayPolicy,
  right: PatchMapInteractionOverlayPolicy,
): boolean {
  return left.hidden === right.hidden &&
    left.handleCssPx === right.handleCssPx &&
    left.strokeCssPx === right.strokeCssPx &&
    left.strokeScale === right.strokeScale &&
    left.minStrokeCssPx === right.minStrokeCssPx &&
    left.strokeAlignment === right.strokeAlignment &&
    left.color === right.color &&
    left.displayMode === right.displayMode &&
    left.marqueeColor === right.marqueeColor &&
    left.marqueeStrokeCssPx === right.marqueeStrokeCssPx &&
    left.marqueeFillAlpha === right.marqueeFillAlpha &&
    sameNullableStringArray(left.visibleEntityIds, right.visibleEntityIds) &&
    sameNullableStringArray(left.transformableEntityIds, right.transformableEntityIds) &&
    sameStringArray(left.resizableEntityIds, right.resizableEntityIds);
}

function normalizeStrokeScale(
  value: PatchMapInteractionOverlayPolicy['strokeScale'],
): PatchMapInteractionOverlayPolicy['strokeScale'] {
  if (value !== 'fixed' && value !== 'viewport') {
    throw new TypeError('interaction overlay strokeScale is unsupported');
  }
  return value;
}

function aggregateOverlayVertices(
  quads: readonly (readonly number[])[],
): readonly number[] | null {
  if (quads.length === 0) return null;
  if (quads.length === 1) return quads[0]!;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const vertices of quads) {
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
  return Object.freeze([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
}

function normalizeDisplayMode(
  value: PatchMapInteractionOverlayPolicy['displayMode'],
): PatchMapInteractionOverlayPolicy['displayMode'] {
  if (!['all', 'group-only', 'element-only', 'hidden'].includes(value)) {
    throw new TypeError('interaction overlay displayMode is unsupported');
  }
  return value;
}

function normalizeStrokeAlignment(
  value: PatchMapInteractionOverlayPolicy['strokeAlignment'],
): PatchMapInteractionOverlayPolicy['strokeAlignment'] {
  if (!['outside', 'center', 'inside'].includes(value)) {
    throw new TypeError('interaction overlay strokeAlignment is unsupported');
  }
  return value;
}

function normalizeRgb(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new RangeError('interaction overlay color must be a 0xRRGGBB integer');
  }
  return value;
}

function normalizeAlpha(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('interaction overlay marqueeFillAlpha must be between 0 and 1');
  }
  return value;
}

function freezeEntityIds(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return Object.freeze([...new Set(values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  }))]);
}
