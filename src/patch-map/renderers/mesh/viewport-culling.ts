import type { AggregateChunkLaneGeometry } from './chunk-geometry';
import type {
  AggregateViewportBounds,
  AggregateViewportCull,
} from './contracts';
export type {
  AggregateViewportBounds,
  AggregateViewportCull,
} from './contracts';

interface AggregateViewportChunk {
  readonly geometryBounds: AggregateViewportBounds | null;
}

export function aggregateLaneGeometryBounds(
  geometry: AggregateChunkLaneGeometry,
): AggregateViewportBounds | null {
  let bounds: AggregateViewportBounds | null = null;
  for (const group of [
    ...geometry.backgroundGroups,
    ...geometry.rectGroups,
    ...geometry.barGroups,
  ]) {
    bounds = includePositionBounds(bounds, group.positions);
  }
  for (const background of geometry.styledBackgrounds) {
    bounds = includePositionBounds(bounds, background.quad.vertices);
  }
  for (const rect of geometry.styledRects) {
    bounds = includePositionBounds(bounds, rect.quad.vertices);
  }
  for (const bar of geometry.styledBars) {
    bounds = includePositionBounds(bounds, bar.quad.vertices);
  }
  return bounds;
}

export function includePositionBounds(
  bounds: AggregateViewportBounds | null,
  positions: ArrayLike<number>,
): AggregateViewportBounds | null {
  let next = bounds;
  for (let index = 0; index + 1 < positions.length; index += 2) {
    const x = positions[index];
    const y = positions[index + 1];
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    next ??= { minX: x, minY: y, maxX: x, maxY: y };
    next.minX = Math.min(next.minX, x);
    next.minY = Math.min(next.minY, y);
    next.maxX = Math.max(next.maxX, x);
    next.maxY = Math.max(next.maxY, y);
  }
  return next;
}

export function chunkIntersectsViewport(
  chunk: AggregateViewportChunk,
  viewport: AggregateViewportCull,
): boolean {
  const bounds = chunk.geometryBounds;
  if (bounds === null) return true;
  const { matrix, width, height, padding } = viewport;
  const corners = [
    bounds.minX, bounds.minY,
    bounds.maxX, bounds.minY,
    bounds.maxX, bounds.maxY,
    bounds.minX, bounds.maxY,
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < corners.length; index += 2) {
    const x = corners[index]!;
    const y = corners[index + 1]!;
    const screenX = matrix.a * x + matrix.c * y + matrix.tx;
    const screenY = matrix.b * x + matrix.d * y + matrix.ty;
    minX = Math.min(minX, screenX);
    minY = Math.min(minY, screenY);
    maxX = Math.max(maxX, screenX);
    maxY = Math.max(maxY, screenY);
  }
  return maxX >= -padding &&
    minX <= width + padding &&
    maxY >= -padding &&
    minY <= height + padding;
}

export function boundsIntersectsViewport(
  bounds: AggregateViewportBounds | null,
  viewport: AggregateViewportCull,
): boolean {
  if (bounds === null) return true;
  const { matrix, width, height, padding } = viewport;
  const x0 = bounds.minX;
  const y0 = bounds.minY;
  const x1 = bounds.maxX;
  const y1 = bounds.maxY;
  const screenX0 = matrix.a * x0 + matrix.c * y0 + matrix.tx;
  const screenY0 = matrix.b * x0 + matrix.d * y0 + matrix.ty;
  const screenX1 = matrix.a * x1 + matrix.c * y0 + matrix.tx;
  const screenY1 = matrix.b * x1 + matrix.d * y0 + matrix.ty;
  const screenX2 = matrix.a * x1 + matrix.c * y1 + matrix.tx;
  const screenY2 = matrix.b * x1 + matrix.d * y1 + matrix.ty;
  const screenX3 = matrix.a * x0 + matrix.c * y1 + matrix.tx;
  const screenY3 = matrix.b * x0 + matrix.d * y1 + matrix.ty;
  const minX = Math.min(screenX0, screenX1, screenX2, screenX3);
  const minY = Math.min(screenY0, screenY1, screenY2, screenY3);
  const maxX = Math.max(screenX0, screenX1, screenX2, screenX3);
  const maxY = Math.max(screenY0, screenY1, screenY2, screenY3);
  return maxX >= -padding &&
    minX <= width + padding &&
    maxY >= -padding &&
    minY <= height + padding;
}
