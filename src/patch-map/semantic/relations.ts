import type { PatchMapRelationProjection } from '../contracts';
import {
  applyPatchMapAffine,
  invertPatchMapAffine,
  type PatchMapBoundsTuple,
  type PatchMapPointTuple,
} from './geometry';

export interface PatchMapRelationEndpointGeometry {
  readonly id: string;
  readonly center: PatchMapPointTuple;
  readonly worldBounds: PatchMapBoundsTuple;
  readonly visible: boolean;
}

export interface PatchMapRelationStyleProjection {
  readonly color: number;
  readonly width: number;
  readonly opacity: number;
  readonly zIndex: number;
  readonly visible: boolean;
}

export type PatchMapRelationPathKind = 'segment' | 'polyline';

export interface PatchMapResolvedRelationPath {
  readonly entityId: string;
  readonly relationId: string;
  readonly key: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: PatchMapRelationPathKind;
  readonly localPoints: readonly PatchMapPointTuple[];
  readonly worldPoints: readonly PatchMapPointTuple[];
  readonly worldBounds: PatchMapBoundsTuple;
  /** Per-segment stroke width after the relation-local affine normal scale. */
  readonly worldStrokeWidths: readonly number[];
  readonly visible: boolean;
  readonly style: PatchMapRelationStyleProjection;
}

/**
 * Expected-independent relation geometry shared by rendering, probes, and hit
 * testing. Endpoints are always measured in world space first, then converted
 * through the relation element's exact inverse affine.
 */
export function resolvePatchMapRelationPath(
  relation: PatchMapRelationProjection,
  source: PatchMapRelationEndpointGeometry,
  target: PatchMapRelationEndpointGeometry,
  style: PatchMapRelationStyleProjection,
): PatchMapResolvedRelationPath {
  const worldPoints = relation.sourceId === relation.targetId
    ? selfLinkWorldPoints(source.worldBounds)
    : Object.freeze([source.center, target.center]);
  const inverse = invertPatchMapAffine(relation.affine);
  const localPoints = Object.freeze(
    worldPoints.map((point) => snapPoint(applyPatchMapAffine(inverse, point))),
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
  localPoints: readonly PatchMapPointTuple[],
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
  bounds: PatchMapBoundsTuple,
): readonly PatchMapPointTuple[] {
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
  points: readonly PatchMapPointTuple[],
): PatchMapBoundsTuple {
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
  screenPoints: readonly PatchMapPointTuple[],
  point: PatchMapPointTuple,
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
  point: PatchMapPointTuple,
  from: PatchMapPointTuple,
  to: PatchMapPointTuple,
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

function freezePoint(x: number, y: number): PatchMapPointTuple {
  return Object.freeze([x, y]);
}

function snapPoint(point: PatchMapPointTuple): PatchMapPointTuple {
  return freezePoint(snapScalar(point[0]), snapScalar(point[1]));
}

function snapScalar(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= 1e-12 ? integer : value;
}
