import type { Graphics } from 'pixi.js';

import type { RenderStoreView } from '../../dense/renderer-types';
import { sameNullableStringArray } from '../../shared/string-array-values';
import type { PatchMapInteractionOverlayPolicy } from '../types';
import {
  resolvePatchMapSlotQuad,
  type PatchMapProjectionRenderContext,
} from '../types';
import { positive } from './value-atoms';

export const DEFAULT_INTERACTION_OVERLAY_POLICY: PatchMapInteractionOverlayPolicy = Object.freeze({
  visibleEntityIds: null,
  transformableEntityIds: null,
  resizableEntityIds: null,
  hidden: false,
  handleCssPx: 6,
  strokeCssPx: 2,
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
): PatchMapOverlayPathPlan {
  const quads = slots.flatMap((slot) => {
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    return quad.width > 0 && quad.height > 0 ? [quad] : [];
  });
  const individualVertices = Object.freeze(quads.map((quad) =>
    Object.freeze([...quad.vertices])));
  const aggregateVertices = aggregateOverlayVertices(individualVertices);
  const selectionPaths = composeOverlaySelectionPaths(
    individualVertices,
    aggregateVertices,
    displayMode,
  );
  return Object.freeze({ individualVertices, aggregateVertices, selectionPaths });
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
  return Object.freeze({
    visibleEntityIds,
    transformableEntityIds,
    resizableEntityIds: policy.resizableEntityIds === null
      ? null
      : freezeEntityIds(policy.resizableEntityIds, 'resizableEntityIds'),
    hidden: policy.hidden,
    handleCssPx: positive(policy.handleCssPx, 'handleCssPx'),
    strokeCssPx: positive(policy.strokeCssPx, 'strokeCssPx'),
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
    left.strokeAlignment === right.strokeAlignment &&
    left.color === right.color &&
    left.displayMode === right.displayMode &&
    left.marqueeColor === right.marqueeColor &&
    left.marqueeStrokeCssPx === right.marqueeStrokeCssPx &&
    left.marqueeFillAlpha === right.marqueeFillAlpha &&
    sameNullableStringArray(left.visibleEntityIds, right.visibleEntityIds) &&
    sameNullableStringArray(left.transformableEntityIds, right.transformableEntityIds) &&
    sameNullableStringArray(left.resizableEntityIds, right.resizableEntityIds);
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
