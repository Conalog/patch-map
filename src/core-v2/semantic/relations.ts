import type { CoreV2RelationProjection } from '../contracts';
import {
  applyCoreV2Affine,
  invertCoreV2Affine,
  type CoreV2BoundsTuple,
  type CoreV2PointTuple,
} from './geometry';

export interface CoreV2RelationEndpointGeometry {
  readonly id: string;
  readonly center: CoreV2PointTuple;
  readonly worldBounds: CoreV2BoundsTuple;
  readonly visible: boolean;
}

export interface CoreV2RelationStyleProjection {
  readonly color: number;
  readonly width: number;
  readonly opacity: number;
  readonly zIndex: number;
  readonly visible: boolean;
}

export type CoreV2RelationPathKind = 'segment' | 'polyline';

export interface CoreV2ResolvedRelationPath {
  readonly entityId: string;
  readonly relationId: string;
  readonly key: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: CoreV2RelationPathKind;
  readonly localPoints: readonly CoreV2PointTuple[];
  readonly worldPoints: readonly CoreV2PointTuple[];
  readonly worldBounds: CoreV2BoundsTuple;
  /** Per-segment stroke width after the relation-local affine normal scale. */
  readonly worldStrokeWidths: readonly number[];
  readonly visible: boolean;
  readonly style: CoreV2RelationStyleProjection;
}

/**
 * Expected-independent relation geometry shared by rendering, probes, and hit
 * testing. Endpoints are always measured in world space first, then converted
 * through the relation element's exact inverse affine.
 */
export function resolveCoreV2RelationPath(
  relation: CoreV2RelationProjection,
  source: CoreV2RelationEndpointGeometry,
  target: CoreV2RelationEndpointGeometry,
  style: CoreV2RelationStyleProjection,
): CoreV2ResolvedRelationPath {
  const worldPoints = relation.sourceId === relation.targetId
    ? selfLinkWorldPoints(source.worldBounds)
    : Object.freeze([source.center, target.center]);
  const inverse = invertCoreV2Affine(relation.affine);
  const localPoints = Object.freeze(
    worldPoints.map((point) => snapPoint(applyCoreV2Affine(inverse, point))),
  );
  const worldStrokeWidths = projectRelationStrokeWidths(
    localPoints,
    relation.affine,
    style.width,
  );
  return Object.freeze({
    entityId: relation.entityId,
    relationId: relation.relationId,
    key: relation.key,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    kind: relation.sourceId === relation.targetId ? 'polyline' : 'segment',
    localPoints,
    worldPoints,
    worldBounds: boundsForRelationPoints(worldPoints),
    worldStrokeWidths,
    visible: style.visible && source.visible && target.visible,
    style,
  });
}

export function projectRelationStrokeWidths(
  localPoints: readonly CoreV2PointTuple[],
  affine: readonly [number, number, number, number, number, number],
  width: number,
): readonly number[] {
  const projected: number[] = [];
  for (let index = 1; index < localPoints.length; index += 1) {
    const from = localPoints[index - 1];
    const to = localPoints[index];
    if (!from || !to) continue;
    const deltaX = to[0] - from[0];
    const deltaY = to[1] - from[1];
    const length = Math.hypot(deltaX, deltaY);
    if (length === 0) {
      projected.push(width);
      continue;
    }
    const normalX = -deltaY / length;
    const normalY = deltaX / length;
    const worldNormalX = affine[0] * normalX + affine[2] * normalY;
    const worldNormalY = affine[1] * normalX + affine[3] * normalY;
    projected.push(width * Math.hypot(worldNormalX, worldNormalY));
  }
  return Object.freeze(projected);
}

/** Finite five-point loop outside the endpoint's exact world AABB. */
export function selfLinkWorldPoints(
  bounds: CoreV2BoundsTuple,
): readonly CoreV2PointTuple[] {
  const [x, y, width, height] = bounds;
  const padding = Math.max(10, width / 2, height / 2);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const right = x + width;
  const bottom = y + height;
  return Object.freeze([
    freezePoint(centerX, y),
    freezePoint(right + padding, y - padding),
    freezePoint(right + padding * 2, centerY),
    freezePoint(right + padding, bottom + padding),
    freezePoint(centerX, bottom),
  ]);
}

export function boundsForRelationPoints(
  points: readonly CoreV2PointTuple[],
): CoreV2BoundsTuple {
  if (points.length === 0) return Object.freeze([0, 0, 0, 0]);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return Object.freeze([minX, minY, maxX - minX, maxY - minY]);
}

export function relationPathHitScreen(
  screenPoints: readonly CoreV2PointTuple[],
  point: CoreV2PointTuple,
  visibleStrokeWidthCssPx: number,
  toleranceCssPx = 4,
): boolean {
  if (!Number.isFinite(toleranceCssPx) || toleranceCssPx < 0) return false;
  const radius = Math.max(4, toleranceCssPx, visibleStrokeWidthCssPx / 2);
  if (!(radius >= 0) || !Number.isFinite(radius)) return false;
  for (let index = 1; index < screenPoints.length; index += 1) {
    const from = screenPoints[index - 1];
    const to = screenPoints[index];
    if (from && to && pointSegmentDistance(point, from, to) <= radius) return true;
  }
  return false;
}

export function pointSegmentDistance(
  point: CoreV2PointTuple,
  from: CoreV2PointTuple,
  to: CoreV2PointTuple,
): number {
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(point[0] - from[0], point[1] - from[1]);
  const projection = Math.max(0, Math.min(1,
    ((point[0] - from[0]) * deltaX + (point[1] - from[1]) * deltaY) / lengthSquared,
  ));
  return Math.hypot(
    point[0] - (from[0] + deltaX * projection),
    point[1] - (from[1] + deltaY * projection),
  );
}

function freezePoint(x: number, y: number): CoreV2PointTuple {
  return Object.freeze([x, y]);
}

function snapPoint(point: CoreV2PointTuple): CoreV2PointTuple {
  return freezePoint(snapScalar(point[0]), snapScalar(point[1]));
}

function snapScalar(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= 1e-12 ? integer : value;
}
