import type {
  PatchMapLogicalSceneIndex,
  PatchMapLogicalTargetSnapshot,
} from './query-selection';
import type {
  PatchMapRelationsElement,
  NormalizedPatchMapElement,
} from './semantic/dataset';
import {
  PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
  type PatchMapRelationEndpointResolution,
  type PatchMapSelectionFrameProbe,
  type PatchMapSelectionVisualOptions,
  type PatchMapSelectionVisualProbe,
  type PatchMapTransformableSubsetProbe,
  type PatchMapTransformEligibility,
  type PatchMapTransformerHandle,
  type PatchMapTransformerHandleProbe,
  type PatchMapTransformerHandleRegion,
  type PatchMapTransformerTargetGeometry,
} from './selection-transformer/contracts';

export * from './selection-transformer/contracts';
export { PatchMapTransformerGestureAuthority } from './selection-transformer/gesture-authority';

const CORNER_HANDLES = Object.freeze(['nw', 'ne', 'sw', 'se'] as const);
const HANDLE_PRIORITY = Object.freeze(['corner', 'edge', 'rotate', 'frame'] as const);
const HANDLE_CURSORS = Object.freeze({
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize',
  n: 'ns-resize',
  e: 'ew-resize',
  s: 'ns-resize',
  w: 'ew-resize',
  frame: 'move',
  rotate: 'crosshair',
});

export function evaluatePatchMapTransformableSubset(
  index: PatchMapLogicalSceneIndex,
  selectionIds: readonly string[],
  lockedIds: readonly string[] = [],
): PatchMapTransformableSubsetProbe {
  validateStringArray(selectionIds, 'transform selection IDs');
  validateStringArray(lockedIds, 'transform locked IDs');
  const selectedTargets = uniqueCurrentTargets(index, selectionIds);
  const locked = new Set(lockedIds);
  const eligibilityById: Record<string, PatchMapTransformEligibility> = {};
  const transformableTargets: PatchMapLogicalTargetSnapshot[] = [];
  const rotatableTargets: PatchMapLogicalTargetSnapshot[] = [];
  const resizableTargets: PatchMapLogicalTargetSnapshot[] = [];
  const lockedTargets: PatchMapLogicalTargetSnapshot[] = [];
  const ineligibleTargets: PatchMapLogicalTargetSnapshot[] = [];

  for (const target of selectedTargets) {
    const eligibility = patchMapTransformEligibility(target, locked);
    eligibilityById[target.selectionId] = eligibility;
    if (eligibility === 'locked') {
      lockedTargets.push(target);
      continue;
    }
    if (eligibility === 'ineligible' || eligibility === 'none') {
      ineligibleTargets.push(target);
      continue;
    }
    transformableTargets.push(target);
    rotatableTargets.push(target);
    if (eligibility === 'move-resize-rotate') resizableTargets.push(target);
  }

  return Object.freeze({
    schemaRevision: PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
    selectedTargets: Object.freeze(selectedTargets),
    transformableTargets: Object.freeze(transformableTargets),
    rotatableTargets: Object.freeze(rotatableTargets),
    resizableTargets: Object.freeze(resizableTargets),
    lockedTargets: Object.freeze(lockedTargets),
    ineligibleTargets: Object.freeze(ineligibleTargets),
    activeResizeHandles: resizableTargets.length > 0,
    subsetIndicator: Object.freeze({
      selected: selectedTargets.length,
      transformable: transformableTargets.length,
      resizable: resizableTargets.length,
    }),
    eligibilityById: Object.freeze(eligibilityById),
  });
}

export function createPatchMapSelectionVisualProbe(
  index: PatchMapLogicalSceneIndex,
  geometries: readonly PatchMapTransformerTargetGeometry[],
  options: PatchMapSelectionVisualOptions,
): PatchMapSelectionVisualProbe {
  validateGeometryList(geometries);
  const mode = options.mode ?? 'all';
  if (!['all', 'group-only', 'element-only', 'hidden'].includes(mode)) {
    throw new TypeError('selection visual mode is unsupported');
  }
  const handleCssPx = positiveFinite(options.handleCssPx ?? 8, 'handleCssPx');
  const strokeCssPx = positiveFinite(options.strokeCssPx ?? 1, 'strokeCssPx');
  const viewportScale = positiveFinite(options.viewportScale ?? 1, 'viewportScale');
  const selectedTargets = uniqueCurrentTargets(index, options.selectionIds);
  const rejected = new Set(options.rejectIds ?? []);
  const includedTypes = options.includeTypes === undefined
    ? null
    : new Set(options.includeTypes);
  const overlayTargets = selectedTargets.filter((target) => {
    if (rejected.has(target.selectionId) || rejected.has(target.id)) return false;
    return includedTypes === null || includedTypes.has(target.type);
  });
  const subset = evaluatePatchMapTransformableSubset(
    index,
    overlayTargets.map((target) => target.selectionId),
    options.lockedIds ?? [],
  );
  const aggregateFrame = selectionFrame(index, geometries, overlayTargets, viewportScale);
  const individualFrames = mode === 'all' || mode === 'element-only'
    ? Object.freeze(overlayTargets.flatMap((target) => {
        const frame = selectionFrame(index, geometries, [target], viewportScale);
        return frame === null ? [] : [frame];
      }))
    : Object.freeze([] as PatchMapSelectionFrameProbe[]);
  const groupFrame = mode === 'group-only'
    ? aggregateFrame
    : mode === 'all' && individualFrames.length > 1
      ? aggregateFrame
      : null;
  const frame = mode === 'hidden' ? null : aggregateFrame;

  return Object.freeze({
    schemaRevision: PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
    mode,
    selectedTargets: Object.freeze(selectedTargets),
    overlayTargets: Object.freeze(overlayTargets),
    transformableTargets: subset.transformableTargets,
    individualFrames,
    groupFrame,
    overlayCount: individualFrames.length + (groupFrame === null ? 0 : 1),
    explicitlyIndicatesTransformableSubset:
      subset.transformableTargets.length !== selectedTargets.length,
    handleCssPx,
    strokeCssPx,
    frame,
  });
}

export function createPatchMapTransformerHandleProbe(
  frame: PatchMapSelectionFrameProbe,
  options: Readonly<{
    readonly cornerCssPx?: number;
    readonly edgeStripCssPx?: number;
    readonly rotateZoneCssPx?: number;
  }> = {},
): PatchMapTransformerHandleProbe {
  const cornerCssPx = positiveFinite(options.cornerCssPx ?? 8, 'cornerCssPx');
  const edgeStripCssPx = positiveFinite(options.edgeStripCssPx ?? 6, 'edgeStripCssPx');
  const rotateZoneCssPx = positiveFinite(options.rotateZoneCssPx ?? 12, 'rotateZoneCssPx');
  const [nw, ne, se, sw] = frame.screenCorners;
  const center = midpoint(nw, se);
  const north = midpoint(nw, ne);
  const east = midpoint(ne, se);
  const south = midpoint(sw, se);
  const west = midpoint(nw, sw);
  const northVector = normalizedVector(
    Object.freeze([north[0] - center[0], north[1] - center[1]]),
  );
  const rotate = Object.freeze([
    north[0] + northVector[0] * (rotateZoneCssPx + cornerCssPx),
    north[1] + northVector[1] * (rotateZoneCssPx + cornerCssPx),
  ] as const);
  const entries: readonly Readonly<{
    id: PatchMapTransformerHandle;
    kind: PatchMapTransformerHandleRegion['kind'];
    center: readonly [number, number];
  }>[] = Object.freeze([
    { id: 'nw', kind: 'corner', center: nw },
    { id: 'ne', kind: 'corner', center: ne },
    { id: 'sw', kind: 'corner', center: sw },
    { id: 'se', kind: 'corner', center: se },
    { id: 'n', kind: 'edge', center: north },
    { id: 'e', kind: 'edge', center: east },
    { id: 's', kind: 'edge', center: south },
    { id: 'w', kind: 'edge', center: west },
    { id: 'frame', kind: 'frame', center },
    { id: 'rotate', kind: 'rotate', center: rotate },
  ]);
  const regions = entries.map((entry) => Object.freeze({
    ...entry,
    cursor: HANDLE_CURSORS[entry.id],
  }));
  return Object.freeze({
    schemaRevision: PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
    frame,
    visibleCorners: CORNER_HANDLES,
    regions: Object.freeze(regions),
    overlapPriority: HANDLE_PRIORITY,
    cornerCssPx,
    edgeStripCssPx,
    rotateZoneCssPx,
    cursorDirectionByHandle: HANDLE_CURSORS,
  });
}

export function hitPatchMapTransformerHandle(
  probe: PatchMapTransformerHandleProbe,
  point: readonly [number, number],
): PatchMapTransformerHandle | null {
  validateFiniteTuple(point, 'transformer hit point');
  const regions = new Map(probe.regions.map((region) => [region.id, region]));
  for (const id of CORNER_HANDLES) {
    const region = regions.get(id);
    if (region !== undefined && squareContains(region.center, probe.cornerCssPx, point)) {
      return id;
    }
  }
  const corners = probe.frame.screenCorners;
  const edges = Object.freeze([
    ['n', corners[0], corners[1]],
    ['e', corners[1], corners[2]],
    ['s', corners[3], corners[2]],
    ['w', corners[0], corners[3]],
  ] as const);
  for (const [id, start, end] of edges) {
    if (distanceToSegment(point, start, end) <= probe.edgeStripCssPx / 2) return id;
  }
  const rotate = regions.get('rotate');
  if (
    rotate !== undefined &&
    pointDistance(point, rotate.center) <= probe.rotateZoneCssPx / 2
  ) {
    return 'rotate';
  }
  return pointInConvexQuad(point, corners) ? 'frame' : null;
}

export function resolvePatchMapRelationEndpoints(
  dataset: readonly NormalizedPatchMapElement[],
  index: PatchMapLogicalSceneIndex,
  relationIds: readonly string[],
): PatchMapRelationEndpointResolution {
  validateStringArray(relationIds, 'relation IDs');
  const requestedRelationIds = Object.freeze([...new Set(relationIds)]);
  const relations = relationElements(dataset);
  const resolvedRelationIds: string[] = [];
  const missingRelationIds: string[] = [];
  const targets: PatchMapLogicalTargetSnapshot[] = [];
  const missingEndpointIds: string[] = [];
  const seenTargets = new Set<string>();
  const seenMissing = new Set<string>();
  let duplicateTargetCount = 0;

  for (const relationId of requestedRelationIds) {
    const relation = relations.get(relationId);
    if (relation === undefined) {
      missingRelationIds.push(relationId);
      continue;
    }
    resolvedRelationIds.push(relationId);
    for (const link of relation.links) {
      for (const endpointId of [link.source, link.target]) {
        const target = index.target(endpointId);
        if (target === null || target.kind !== 'element') {
          if (!seenMissing.has(endpointId)) {
            seenMissing.add(endpointId);
            missingEndpointIds.push(endpointId);
          }
          continue;
        }
        if (seenTargets.has(target.key)) {
          duplicateTargetCount += 1;
          continue;
        }
        seenTargets.add(target.key);
        targets.push(target);
      }
    }
  }

  return Object.freeze({
    schemaRevision: PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
    requestedRelationIds,
    resolvedRelationIds: Object.freeze(resolvedRelationIds),
    missingRelationIds: Object.freeze(missingRelationIds),
    targets: Object.freeze(targets),
    missingEndpointIds: Object.freeze(missingEndpointIds),
    duplicateTargetCount: 0,
    suppressedDuplicateEndpointCount: duplicateTargetCount,
    retainedEndpointSnapshotCount: 0,
  });
}

function patchMapTransformEligibility(
  target: PatchMapLogicalTargetSnapshot,
  lockedIds: ReadonlySet<string>,
): PatchMapTransformEligibility {
  if (
    target.locked ||
    target.ancestorLocked ||
    lockedIds.has(target.id) ||
    lockedIds.has(target.selectionId) ||
    lockedIds.has(target.key)
  ) {
    return 'locked';
  }
  if (target.kind !== 'element') return 'ineligible';
  if (target.type === 'rect' || target.type === 'image') return 'move-resize-rotate';
  if (target.type === 'grid' || target.type === 'item' || target.type === 'text') {
    return 'move-rotate';
  }
  return target.type.length === 0 ? 'none' : 'ineligible';
}

function selectionFrame(
  index: PatchMapLogicalSceneIndex,
  geometries: readonly PatchMapTransformerTargetGeometry[],
  targets: readonly PatchMapLogicalTargetSnapshot[],
  viewportScale: number,
): PatchMapSelectionFrameProbe | null {
  if (targets.length === 0) return null;
  const members = uniqueGeometries(targets.flatMap((target) =>
    targetGeometries(index, target, geometries)));
  if (members.length === 0) return null;
  if (
    targets.length === 1 &&
    members.length === 1 &&
    targets[0]?.type !== 'group' &&
    targets[0]?.type !== 'grid'
  ) {
    const corners = orientedScreenCorners(members[0]!, viewportScale);
    return Object.freeze({
      kind: 'oriented',
      orientationDegrees: normalizeDegrees(members[0]?.screenAngle ?? 0),
      screenBounds: boundsForPoints(corners),
      screenCorners: corners,
    });
  }
  const bounds = unionBounds(members.map((geometry) => geometry.screenBounds));
  if (bounds === null) return null;
  return Object.freeze({
    kind: 'axis-aligned-union',
    orientationDegrees: 0,
    screenBounds: bounds,
    screenCorners: boundsCorners(bounds),
  });
}

function targetGeometries(
  index: PatchMapLogicalSceneIndex,
  target: PatchMapLogicalTargetSnapshot,
  geometries: readonly PatchMapTransformerTargetGeometry[],
): readonly PatchMapTransformerTargetGeometry[] {
  const direct = geometries.filter((geometry) => {
    if (!geometry.visible) return false;
    if (target.kind === 'component') {
      return geometry.ownerItemId === target.ownerId &&
        geometry.componentId === target.id;
    }
    return geometry.id === target.id;
  });
  if (target.type !== 'group' && target.type !== 'grid') return direct;
  const descendantIds = new Set(index.targets()
    .filter((candidate) => candidate.ancestorKeys.includes(target.key))
    .flatMap((candidate) => [candidate.id, candidate.selectionId]));
  return geometries.filter((geometry) =>
    geometry.visible &&
    (
      descendantIds.has(geometry.id) ||
      (geometry.ownerItemId !== undefined && descendantIds.has(geometry.ownerItemId))
    ));
}

function uniqueCurrentTargets(
  index: PatchMapLogicalSceneIndex,
  ids: readonly string[],
): PatchMapLogicalTargetSnapshot[] {
  validateStringArray(ids, 'selection IDs');
  const result: PatchMapLogicalTargetSnapshot[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const target = index.target(id);
    if (target === null || seen.has(target.key)) continue;
    seen.add(target.key);
    result.push(target);
  }
  return result;
}

function relationElements(
  dataset: readonly NormalizedPatchMapElement[],
): ReadonlyMap<string, PatchMapRelationsElement> {
  const result = new Map<string, PatchMapRelationsElement>();
  const visit = (element: NormalizedPatchMapElement): void => {
    if (element.type === 'relations') result.set(element.id, element);
    if (element.type === 'group') element.children.forEach(visit);
  };
  dataset.forEach(visit);
  return result;
}

function orientedScreenCorners(
  geometry: PatchMapTransformerTargetGeometry,
  viewportScale: number,
): PatchMapSelectionFrameProbe['screenCorners'] {
  const local = geometry.localBounds;
  const basis = geometry.screenBasis;
  if (local === undefined || basis === undefined) {
    return boundsCorners(geometry.screenBounds);
  }
  const center = Object.freeze([
    geometry.screenBounds[0] + geometry.screenBounds[2] / 2,
    geometry.screenBounds[1] + geometry.screenBounds[3] / 2,
  ] as const);
  const halfX = Object.freeze([
    basis[0] * local[2] * viewportScale / 2,
    basis[1] * local[2] * viewportScale / 2,
  ] as const);
  const halfY = Object.freeze([
    basis[2] * local[3] * viewportScale / 2,
    basis[3] * local[3] * viewportScale / 2,
  ] as const);
  return Object.freeze([
    freezePoint(center[0] - halfX[0] - halfY[0], center[1] - halfX[1] - halfY[1]),
    freezePoint(center[0] + halfX[0] - halfY[0], center[1] + halfX[1] - halfY[1]),
    freezePoint(center[0] + halfX[0] + halfY[0], center[1] + halfX[1] + halfY[1]),
    freezePoint(center[0] - halfX[0] + halfY[0], center[1] - halfX[1] + halfY[1]),
  ]);
}

function boundsCorners(
  bounds: readonly [number, number, number, number],
): PatchMapSelectionFrameProbe['screenCorners'] {
  const [x, y, width, height] = bounds;
  return Object.freeze([
    freezePoint(x, y),
    freezePoint(x + width, y),
    freezePoint(x + width, y + height),
    freezePoint(x, y + height),
  ]);
}

function boundsForPoints(
  points: readonly (readonly [number, number])[],
): readonly [number, number, number, number] {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return Object.freeze([
    minX,
    minY,
    Math.max(...xs) - minX,
    Math.max(...ys) - minY,
  ]);
}

function unionBounds(
  values: readonly (readonly [number, number, number, number])[],
): readonly [number, number, number, number] | null {
  if (values.length === 0) return null;
  const minX = Math.min(...values.map((value) => value[0]));
  const minY = Math.min(...values.map((value) => value[1]));
  const maxX = Math.max(...values.map((value) => value[0] + value[2]));
  const maxY = Math.max(...values.map((value) => value[1] + value[3]));
  return Object.freeze([minX, minY, maxX - minX, maxY - minY]);
}

function uniqueGeometries(
  values: readonly PatchMapTransformerTargetGeometry[],
): readonly PatchMapTransformerTargetGeometry[] {
  const result: PatchMapTransformerTargetGeometry[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = `${value.ownerItemId ?? ''}/${value.componentId ?? ''}/${value.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return Object.freeze(result);
}

function midpoint(
  left: readonly [number, number],
  right: readonly [number, number],
): readonly [number, number] {
  return freezePoint((left[0] + right[0]) / 2, (left[1] + right[1]) / 2);
}

function normalizedVector(
  value: readonly [number, number],
): readonly [number, number] {
  const length = Math.hypot(value[0], value[1]);
  return length > 0
    ? freezePoint(value[0] / length, value[1] / length)
    : freezePoint(0, -1);
}

function squareContains(
  center: readonly [number, number],
  size: number,
  point: readonly [number, number],
): boolean {
  const half = size / 2;
  return Math.abs(point[0] - center[0]) <= half &&
    Math.abs(point[1] - center[1]) <= half;
}

function distanceToSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return pointDistance(point, start);
  const t = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * dx +
    (point[1] - start[1]) * dy
  ) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function pointDistance(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function pointInConvexQuad(
  point: readonly [number, number],
  corners: PatchMapSelectionFrameProbe['screenCorners'],
): boolean {
  let sign = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const start = corners[index]!;
    const end = corners[(index + 1) % corners.length]!;
    const cross = (end[0] - start[0]) * (point[1] - start[1]) -
      (end[1] - start[1]) * (point[0] - start[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const nextSign = Math.sign(cross);
    if (sign !== 0 && nextSign !== sign) return false;
    sign = nextSign;
  }
  return true;
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return Object.is(normalized < 0 ? normalized + 360 : normalized, -0)
    ? 0
    : normalized < 0
      ? normalized + 360
      : normalized;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive`);
  }
  return value;
}

function validateGeometryList(values: readonly PatchMapTransformerTargetGeometry[]): void {
  if (!Array.isArray(values)) throw new TypeError('transformer geometries must be an array');
  const geometries = values as readonly PatchMapTransformerTargetGeometry[];
  geometries.forEach((geometry, index) => {
    if (typeof geometry.id !== 'string' || geometry.id.length === 0) {
      throw new TypeError(`transformer geometry ${index} needs an ID`);
    }
    validateFiniteTuple(geometry.screenBounds, `transformer geometry ${index} bounds`);
    if (geometry.screenBounds.length !== 4) {
      throw new TypeError(`transformer geometry ${index} bounds need four values`);
    }
  });
}

function validateStringArray(values: readonly string[], label: string): void {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  values.forEach((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
  });
}

function validateFiniteTuple(values: readonly number[], label: string): void {
  if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`${label} must contain finite numbers`);
  }
}

function freezePoint(x: number, y: number): readonly [number, number] {
  return Object.freeze([x, y] as const);
}
