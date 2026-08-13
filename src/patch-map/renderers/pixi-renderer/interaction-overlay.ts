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
  color: 0x2f80ed,
});

export function resolveAggregateOverlayVertices(
  store: RenderStoreView,
  slots: readonly number[],
  projectionContext: PatchMapProjectionRenderContext,
): readonly number[] | null {
  const quads = slots.flatMap((slot) => {
    const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
    return quad.width > 0 && quad.height > 0 ? [quad] : [];
  });
  if (quads.length === 0) return null;
  if (quads.length === 1) return Object.freeze([...quads[0]!.vertices]);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const quad of quads) {
    for (let index = 0; index < quad.vertices.length; index += 2) {
      const x = quad.vertices[index];
      const y = quad.vertices[index + 1];
      if (x === undefined || y === undefined) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Object.freeze([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
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
    color: normalizeRgb(policy.color),
  });
}

export function sameInteractionOverlayPolicy(
  left: PatchMapInteractionOverlayPolicy,
  right: PatchMapInteractionOverlayPolicy,
): boolean {
  return left.hidden === right.hidden &&
    left.handleCssPx === right.handleCssPx &&
    left.strokeCssPx === right.strokeCssPx &&
    left.color === right.color &&
    sameNullableStringArray(left.visibleEntityIds, right.visibleEntityIds) &&
    sameNullableStringArray(left.transformableEntityIds, right.transformableEntityIds) &&
    sameNullableStringArray(left.resizableEntityIds, right.resizableEntityIds);
}

function normalizeRgb(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new RangeError('interaction overlay color must be a 0xRRGGBB integer');
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
