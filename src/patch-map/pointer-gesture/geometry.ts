export interface PatchMapRegionEntityGeometry {
  readonly id: string;
  readonly ownerItemId?: string;
  readonly screenBounds: readonly [number, number, number, number];
  readonly visible: boolean;
  readonly interactive: boolean;
}

export interface PatchMapRegionRelationGeometry {
  readonly id: string;
  readonly relationId?: string;
  readonly screenPoints?: readonly (readonly [number, number])[];
  readonly screenEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  readonly visible?: boolean;
}

export interface PatchMapRegionHitResult {
  readonly candidateIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly duplicateCount: number;
  readonly nonFiniteCount: number;
}

/** Main-compatible root click slop in logical CSS pixels. */
export const PATCH_MAP_POINTER_CLICK_SLOP_CSS_PX = 4;

/** Largest per-axis displacement; diagonal movement does not inflate the slop. */
export function pointAxisDistance(
  start: readonly [number, number],
  current: readonly [number, number],
): number {
  return Math.max(
    Math.abs(current[0] - start[0]),
    Math.abs(current[1] - start[1]),
  );
}

/** Strict greater-than preserves clicks at the exact 4 CSS px boundary. */
export function pointMovedBeyondCssSlop(
  start: readonly [number, number],
  current: readonly [number, number],
  thresholdCssPx = PATCH_MAP_POINTER_CLICK_SLOP_CSS_PX,
): boolean {
  return coordinatesMovedBeyondCssSlop(
    start[0],
    start[1],
    current[0],
    current[1],
    thresholdCssPx,
  );
}

/** Numeric variant keeps the root pointer-move hot path allocation-free. */
export function coordinatesMovedBeyondCssSlop(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  thresholdCssPx = PATCH_MAP_POINTER_CLICK_SLOP_CSS_PX,
): boolean {
  return Math.abs(currentX - startX) > thresholdCssPx ||
    Math.abs(currentY - startY) > thresholdCssPx;
}

export function hitPatchMapBoxRegion(
  entities: readonly PatchMapRegionEntityGeometry[],
  relations: readonly PatchMapRegionRelationGeometry[],
  start: readonly [number, number],
  end: readonly [number, number],
  options: Readonly<{ readonly partialIntersection?: boolean }> = {},
): PatchMapRegionHitResult {
  validateFiniteTuple(start, 'box start');
  validateFiniteTuple(end, 'box end');
  const box = normalizedBounds(start, end);
  const partial = options.partialIntersection ?? true;
  const candidateIds: string[] = [];
  const seen = new Set<string>();
  const duplicateCount = 0;
  let nonFiniteCount = 0;
  for (const entity of entities) {
    if (!entity.visible || !entity.interactive) continue;
    if (!finiteBounds(entity.screenBounds)) {
      nonFiniteCount += 1;
      continue;
    }
    const hit = partial
      ? boundsIntersect(box, entity.screenBounds)
      : boundsContainBounds(box, entity.screenBounds);
    if (!hit) continue;
    const id = entity.ownerItemId ?? entity.id;
    if (seen.has(id)) continue;
    seen.add(id);
    candidateIds.push(id);
  }
  return freezeRegionResult(
    candidateIds,
    relationIdsIntersectingBox(relations, box),
    duplicateCount,
    nonFiniteCount,
  );
}

export function hitPatchMapPaintRegion(
  entities: readonly PatchMapRegionEntityGeometry[],
  relations: readonly PatchMapRegionRelationGeometry[],
  segments: readonly (readonly [
    readonly [number, number],
    readonly [number, number],
  ])[],
  options: Readonly<{ readonly toleranceCssPx?: number }> = {},
): PatchMapRegionHitResult {
  const tolerance = nonNegativeFinite(options.toleranceCssPx ?? 0, 'paint toleranceCssPx');
  const finiteSegments = segments.filter((segment) =>
    finitePoint(segment[0]) && finitePoint(segment[1]));
  const candidateIds: string[] = [];
  const seen = new Set<string>();
  const duplicateCount = 0;
  let nonFiniteCount = segments.length - finiteSegments.length;
  for (const entity of entities) {
    if (!entity.visible || !entity.interactive) continue;
    if (!finiteBounds(entity.screenBounds)) {
      nonFiniteCount += 1;
      continue;
    }
    if (!finiteSegments.some((segment) =>
      segmentIntersectsExpandedBounds(segment, entity.screenBounds, tolerance))) {
      continue;
    }
    const id = entity.ownerItemId ?? entity.id;
    if (seen.has(id)) continue;
    seen.add(id);
    candidateIds.push(id);
  }
  const relationIds = relations.flatMap((relation) => {
    if (relation.visible === false) return [];
    const points = relationPoints(relation);
    if (points.some((point) => !finitePoint(point))) {
      nonFiniteCount += 1;
      return [];
    }
    return polylineSegments(points).some((relationSegment) =>
      finiteSegments.some((paintSegment) =>
        segmentDistance(relationSegment, paintSegment) <= tolerance))
      ? [relation.relationId ?? relation.id]
      : [];
  });
  return freezeRegionResult(candidateIds, uniqueStrings(relationIds), duplicateCount, nonFiniteCount);
}

function normalizedBounds(
  start: readonly [number, number],
  end: readonly [number, number],
): readonly [number, number, number, number] {
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  return Object.freeze([x, y, Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])]);
}

function relationIdsIntersectingBox(
  relations: readonly PatchMapRegionRelationGeometry[],
  box: readonly [number, number, number, number],
): readonly string[] {
  return uniqueStrings(relations.flatMap((relation) => {
    if (relation.visible === false) return [];
    const points = relationPoints(relation);
    if (points.some((point) => !finitePoint(point))) return [];
    return polylineSegments(points).some((segment) => segmentIntersectsBounds(segment, box))
      ? [relation.relationId ?? relation.id]
      : [];
  }));
}

function relationPoints(
  relation: PatchMapRegionRelationGeometry,
): readonly (readonly [number, number])[] {
  return relation.screenPoints && relation.screenPoints.length >= 2
    ? relation.screenPoints
    : relation.screenEndpoints;
}

function polylineSegments(
  points: readonly (readonly [number, number])[],
): readonly (readonly [readonly [number, number], readonly [number, number]])[] {
  const segments: (readonly [readonly [number, number], readonly [number, number]])[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from !== undefined && to !== undefined) segments.push(Object.freeze([from, to]));
  }
  return segments;
}

function segmentIntersectsExpandedBounds(
  segment: readonly [readonly [number, number], readonly [number, number]],
  bounds: readonly [number, number, number, number],
  tolerance: number,
): boolean {
  const expanded = Object.freeze([
    bounds[0] - tolerance,
    bounds[1] - tolerance,
    bounds[2] + tolerance * 2,
    bounds[3] + tolerance * 2,
  ] as const);
  return segmentIntersectsBounds(segment, expanded);
}

function segmentIntersectsBounds(
  segment: readonly [readonly [number, number], readonly [number, number]],
  bounds: readonly [number, number, number, number],
): boolean {
  if (pointInBounds(segment[0], bounds) || pointInBounds(segment[1], bounds)) return true;
  const [x, y, width, height] = bounds;
  const corners = [
    Object.freeze([x, y] as const),
    Object.freeze([x + width, y] as const),
    Object.freeze([x + width, y + height] as const),
    Object.freeze([x, y + height] as const),
  ];
  return segmentsIntersect(segment, [corners[0]!, corners[1]!]) ||
    segmentsIntersect(segment, [corners[1]!, corners[2]!]) ||
    segmentsIntersect(segment, [corners[2]!, corners[3]!]) ||
    segmentsIntersect(segment, [corners[3]!, corners[0]!]);
}

function segmentsIntersect(
  left: readonly [readonly [number, number], readonly [number, number]],
  right: readonly [readonly [number, number], readonly [number, number]],
): boolean {
  const [a, b] = left;
  const [c, d] = right;
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && pointOnSegment(c, a, b)) return true;
  if (abD === 0 && pointOnSegment(d, a, b)) return true;
  if (cdA === 0 && pointOnSegment(a, c, d)) return true;
  if (cdB === 0 && pointOnSegment(b, c, d)) return true;
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}

function segmentDistance(
  left: readonly [readonly [number, number], readonly [number, number]],
  right: readonly [readonly [number, number], readonly [number, number]],
): number {
  if (segmentsIntersect(left, right)) return 0;
  return Math.min(
    pointToSegmentDistance(left[0], right[0], right[1]),
    pointToSegmentDistance(left[1], right[0], right[1]),
    pointToSegmentDistance(right[0], left[0], left[1]),
    pointToSegmentDistance(right[1], left[0], left[1]),
  );
}

function pointToSegmentDistance(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return pointDistance(point, start);
  const projection = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared),
  );
  return Math.hypot(
    point[0] - (start[0] + projection * dx),
    point[1] - (start[1] + projection * dy),
  );
}

function orientation(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(value) <= Number.EPSILON ? 0 : value;
}

function pointOnSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): boolean {
  return point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1]);
}

function pointInBounds(
  point: readonly [number, number],
  bounds: readonly [number, number, number, number],
): boolean {
  return point[0] >= bounds[0] &&
    point[0] <= bounds[0] + bounds[2] &&
    point[1] >= bounds[1] &&
    point[1] <= bounds[1] + bounds[3];
}

function boundsIntersect(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
): boolean {
  return left[0] <= right[0] + right[2] &&
    left[0] + left[2] >= right[0] &&
    left[1] <= right[1] + right[3] &&
    left[1] + left[3] >= right[1];
}

function boundsContainBounds(
  outer: readonly [number, number, number, number],
  inner: readonly [number, number, number, number],
): boolean {
  return inner[0] >= outer[0] &&
    inner[1] >= outer[1] &&
    inner[0] + inner[2] <= outer[0] + outer[2] &&
    inner[1] + inner[3] <= outer[1] + outer[3];
}

function finiteBounds(bounds: readonly [number, number, number, number]): boolean {
  return bounds.every(Number.isFinite) && bounds[2] >= 0 && bounds[3] >= 0;
}

function finitePoint(point: readonly [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

export function validateFiniteTuple(point: readonly [number, number], label: string): void {
  if (!finitePoint(point)) throw new RangeError(`${label} must contain finite coordinates`);
}

function nonNegativeFinite(value: number, label: string): number {
  if (value < 0 || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be non-negative and finite`);
  }
  return value;
}

export function pointDistance(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function freezeRegionResult(
  candidateIds: readonly string[],
  relationIds: readonly string[],
  duplicateCount: number,
  nonFiniteCount: number,
): PatchMapRegionHitResult {
  return Object.freeze({
    candidateIds: Object.freeze([...candidateIds]),
    relationIds: Object.freeze([...relationIds]),
    duplicateCount,
    nonFiniteCount,
  });
}
