import type {
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from '../contracts';
import type { SceneSnapshot } from '../dense/contracts';
import {
  createPatchMapAffine,
  multiplyPatchMapAffine,
  patchMapAffineBasis,
  patchMapAffineCorners,
  writePatchMapReadableRect,
  type PatchMapAffineBasis,
  type PatchMapPointTuple,
} from '../semantic/geometry';
import {
  relationPathHitScreen,
  resolvePatchMapRelationPath,
} from '../semantic/relations';
import type { PatchMapViewportGeometry } from '../viewport';
import type {
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitIndex,
  PatchMapRelationHitOptions,
  PatchMapSurfaceEntityGeometry,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceRelationGeometry,
  PatchMapSurfaceView,
} from './surface-contract';

export function createPatchMapSurfaceGeometrySnapshot(
  snapshot: SceneSnapshot,
  projection: PatchMapProjectionIndex | null = null,
  surfaceView: PatchMapSurfaceView = Object.freeze({
    ...snapshot.view,
    rotation: snapshot.view.rotation ?? 0,
  }),
): PatchMapSurfaceGeometrySnapshot {
  const entityGeometries = snapshot.entities
    .filter((entity) => entity.kind !== 'relation')
    .map((entity) =>
      createPatchMapSurfaceEntityGeometry(entity, projection, surfaceView));
  const geometryById = new Map(entityGeometries.map((entity) => [entity.id, entity]));
  const relations = snapshot.entities.flatMap((entity) => {
    if (entity.kind !== 'relation') return [];
    const sourceId = entity.data.from;
    const targetId = entity.data.to;
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') return [];
    const source = geometryById.get(sourceId);
    const target = geometryById.get(targetId);
    if (!source || !target) return [];
    const relationProjection = projection?.relationsByEntityId?.[entity.id];
    const fallbackProjection = Object.freeze({
      entityId: entity.id,
      relationId: relationSourceId(entity),
      sourceId,
      targetId,
      key: `${sourceId}>${targetId}`,
      identityKey: `${sourceId.length}:${sourceId}${targetId.length}:${targetId}`,
      authoredIndex: 0,
      affine: createPatchMapAffine(),
    });
    const resolved = resolvePatchMapRelationPath(
      relationProjection ?? fallbackProjection,
      {
        id: sourceId,
        center: source.visibleCenter ?? boundsCenter(source.worldBounds),
        worldBounds: source.worldBounds,
        visible: source.visible,
      },
      {
        id: targetId,
        center: target.visibleCenter ?? boundsCenter(target.worldBounds),
        worldBounds: target.worldBounds,
        visible: target.visible,
      },
      {
        color: typeof entity.data.color === 'number' ? entity.data.color : 0x000000ff,
        width: typeof entity.data.lineWidth === 'number' ? entity.data.lineWidth : 1,
        opacity: entity.opacity,
        zIndex: entity.zIndex,
        visible: entity.visible,
      },
    );
    const screenPoints = Object.freeze(
      resolved.worldPoints.map((point) => surfacePointToScreen(point, surfaceView)),
    );
    const sourceWorld = resolved.worldPoints[0] ??
      source.visibleCenter ??
      boundsCenter(source.worldBounds);
    const targetWorld = resolved.worldPoints[resolved.worldPoints.length - 1] ??
      target.visibleCenter ??
      boundsCenter(target.worldBounds);
    const sourceScreen = screenPoints[0] ?? surfacePointToScreen(sourceWorld, surfaceView);
    const targetScreen = screenPoints[screenPoints.length - 1] ??
      surfacePointToScreen(targetWorld, surfaceView);
    return [Object.freeze<PatchMapSurfaceRelationGeometry>({
      id: entity.id,
      relationId: resolved.relationId,
      key: resolved.key,
      identityKey: (relationProjection ?? fallbackProjection).identityKey,
      sourceId,
      targetId,
      kind: resolved.kind,
      localPoints: resolved.localPoints,
      worldPoints: resolved.worldPoints,
      screenPoints,
      worldBounds: resolved.worldBounds,
      screenBounds: boundsForTuplePoints(screenPoints),
      visible: resolved.visible,
      style: Object.freeze({
        color: resolved.style.color,
        colorHex: packedColorToHex(resolved.style.color),
        width: resolved.style.width,
        opacity: resolved.style.opacity,
        zIndex: resolved.style.zIndex,
      }),
      visibleStrokeWidthsCssPx: Object.freeze(
        resolved.worldStrokeWidths.map((width) => width * surfaceView.scale),
      ),
      worldEndpoints: Object.freeze([sourceWorld, targetWorld] as const),
      screenEndpoints: Object.freeze([
        sourceScreen,
        targetScreen,
      ] as const),
    })];
  });
  const selectedRefs = new Set(snapshot.selection.refs.map((ref) =>
    `${ref.slot}:${ref.generation}`));
  const selectedBounds = snapshot.entities.flatMap((entity) => {
    if (
      entity.kind === 'relation' ||
      !selectedRefs.has(`${entity.ref.slot}:${entity.ref.generation}`)
    ) {
      return [];
    }
    const geometry = geometryById.get(entity.id);
    return geometry ? [geometry.screenBounds] : [];
  });
  const selectionOverlay = unionBounds(selectedBounds);

  return Object.freeze({
    revision: snapshot.revision,
    sceneRevision: snapshot.revision,
    entities: Object.freeze(entityGeometries),
    relations: Object.freeze(relations),
    omittedRelations: Object.freeze((projection?.omittedRelations ?? []).map((relation) =>
      Object.freeze({
        id: relation.entityId,
        relationId: relation.relationId,
        key: relation.key,
        identityKey: relation.identityKey,
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        authoredIndex: relation.authoredIndex,
        reason: relation.reason,
      }))),
    selectionOverlay: selectionOverlay === null
      ? null
      : Object.freeze({ screenBounds: selectionOverlay }),
  });
}

export function createPatchMapSurfaceEntityGeometry(
  entity: SceneSnapshot['entities'][number],
  projection: PatchMapProjectionIndex | null,
  surfaceView: PatchMapSurfaceView,
): PatchMapSurfaceEntityGeometry {
  const entityProjection = projection?.byEntityId[entity.id];
  const geometry = entityProjection
    ? resolveProjectedEntityGeometry(entityProjection, surfaceView, projection)
    : resolveDenseEntityGeometry(entity.bounds, entity.rotation, surfaceView);
  return Object.freeze({
    id: entity.id,
    kind: entity.kind,
    localBounds: entityProjection?.localBounds ?? freezeBounds(
      0,
      0,
      entity.bounds.width,
      entity.bounds.height,
    ),
    worldBounds: geometry.worldBounds,
    screenBounds: geometry.screenBounds,
    visibleBounds: entity.visible ? geometry.worldBounds : null,
    visible: entity.visible,
    interactive: entity.interactive,
    scaleX: entityProjection?.scaleX ?? 1,
    scaleY: entityProjection?.scaleY ?? 1,
    ...(entityProjection?.ownerItemId ? { ownerItemId: entityProjection.ownerItemId } : {}),
    ...(entityProjection?.componentId ? { componentId: entityProjection.componentId } : {}),
    ...(entityProjection?.componentType
      ? { componentType: entityProjection.componentType }
      : {}),
    ...(entityProjection
      ? {
          contentOrientation: entityProjection.contentOrientation,
          screenBasis: geometry.screenBasis,
          visibleCenter: geometry.visibleCenter,
          screenAngle: entityProjection.contentOrientation === 'upright'
            ? normalizeDegrees(
                Math.atan2(geometry.screenBasis[1], geometry.screenBasis[0])
                  * 180 / Math.PI,
              )
            : normalizeDegrees(entityProjection.rotationDegrees + surfaceView.rotation),
        }
      : {}),
  });
}

export function createPatchMapSurfaceWorldGeometrySnapshot(
  snapshot: SceneSnapshot,
  projection: PatchMapProjectionIndex | null = null,
  surfaceView: PatchMapSurfaceView = Object.freeze({
    ...snapshot.view,
    rotation: snapshot.view.rotation ?? 0,
  }),
): PatchMapViewportGeometry {
  const resolvedById = new Map<string, Readonly<{
    readonly worldBounds: readonly [number, number, number, number];
    readonly visibleCenter: readonly [number, number];
    readonly visible: boolean;
  }>>();
  const entities = snapshot.entities.flatMap((entity) => {
    if (entity.kind === 'relation') return [];
    const entityProjection = projection?.byEntityId[entity.id];
    const geometry = entityProjection
      ? resolveProjectedEntityWorldGeometry(entityProjection, surfaceView, projection)
      : resolveDenseEntityWorldGeometry(entity.bounds, entity.rotation);
    const resolved = Object.freeze({
      worldBounds: geometry.worldBounds,
      visibleCenter: geometry.visibleCenter,
      visible: entity.visible,
    });
    resolvedById.set(entity.id, resolved);
    return [Object.freeze({
      id: entity.id,
      worldBounds: geometry.worldBounds,
      visible: entity.visible,
    })];
  });
  const relations = snapshot.entities.flatMap((entity) => {
    if (entity.kind !== 'relation') return [];
    const sourceId = entity.data.from;
    const targetId = entity.data.to;
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') return [];
    const source = resolvedById.get(sourceId);
    const target = resolvedById.get(targetId);
    if (!source || !target) return [];
    const relationProjection = projection?.relationsByEntityId?.[entity.id];
    const fallbackProjection = Object.freeze({
      entityId: entity.id,
      relationId: relationSourceId(entity),
      sourceId,
      targetId,
      key: `${sourceId}>${targetId}`,
      identityKey: `${sourceId.length}:${sourceId}${targetId.length}:${targetId}`,
      authoredIndex: 0,
      affine: createPatchMapAffine(),
    });
    const resolved = resolvePatchMapRelationPath(
      relationProjection ?? fallbackProjection,
      {
        id: sourceId,
        center: source.visibleCenter,
        worldBounds: source.worldBounds,
        visible: source.visible,
      },
      {
        id: targetId,
        center: target.visibleCenter,
        worldBounds: target.worldBounds,
        visible: target.visible,
      },
      {
        color: typeof entity.data.color === 'number' ? entity.data.color : 0x000000ff,
        width: typeof entity.data.lineWidth === 'number' ? entity.data.lineWidth : 1,
        opacity: entity.opacity,
        zIndex: entity.zIndex,
        visible: entity.visible,
      },
    );
    return [Object.freeze({
      id: entity.id,
      relationId: resolved.relationId,
      sourceId,
      targetId,
      worldBounds: resolved.worldBounds,
      visible: resolved.visible,
    })];
  });
  return Object.freeze({
    entities: Object.freeze(entities),
    relations: Object.freeze(relations),
  });
}

export function hitTestPatchMapSurfaceRelations(
  relations: readonly PatchMapSurfaceRelationGeometry[],
  point: PatchMapPoint,
  options: PatchMapRelationHitOptions = {},
): PatchMapRelationHit | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('relation hit point must contain finite coordinates');
  }
  const tolerance = options.toleranceCssPx ?? 4;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('toleranceCssPx must be finite and non-negative');
  }
  const screenPoint = Object.freeze([point.x, point.y] as const);
  for (let relationIndex = relations.length - 1; relationIndex >= 0; relationIndex -= 1) {
    const relation = relations[relationIndex];
    if (!relation?.visible || !relation.screenPoints || !relation.style) continue;
    for (
      let segmentIndex = relation.screenPoints.length - 1;
      segmentIndex >= 1;
      segmentIndex -= 1
    ) {
      const from = relation.screenPoints[segmentIndex - 1];
      const to = relation.screenPoints[segmentIndex];
      if (!from || !to) continue;
      if (relationPathHitScreen(
        Object.freeze([from, to]),
        screenPoint,
        relation.visibleStrokeWidthsCssPx?.[segmentIndex - 1] ?? relation.style.width,
        tolerance,
      )) {
        return Object.freeze({
          id: relation.id,
          relationId: relation.relationId ?? relation.id,
          key: relation.key ?? `${relation.sourceId}>${relation.targetId}`,
          identityKey: relation.identityKey ??
            `${relation.sourceId.length}:${relation.sourceId}${relation.targetId.length}:${relation.targetId}`,
          sourceId: relation.sourceId,
          targetId: relation.targetId,
        });
      }
    }
  }
  return null;
}

const PATCH_MAP_RELATION_HIT_CELL_SIZE = 64;
const PATCH_MAP_RELATION_HIT_MAX_CELLS_PER_PATH = 1_024;

export function buildPatchMapRelationHitIndex(
  relations: readonly PatchMapSurfaceRelationGeometry[],
): PatchMapRelationHitIndex {
  const mutable = new Map<string, number[]>();
  const overflow: number[] = [];
  relations.forEach((relation, index) => {
    if (
      !relation.visible || !relation.style ||
      !relation.screenPoints || relation.screenPoints.length < 2
    ) return;
    const strokeRadius = Math.max(
      4,
      ...(relation.visibleStrokeWidthsCssPx ?? [relation.style?.width ?? 0]).map(
        (width) => width / 2,
      ),
    );
    const cellKeys = relationHitPathCellKeys(relation.screenPoints, strokeRadius);
    if (cellKeys === null) {
      overflow.push(index);
      return;
    }
    for (const key of cellKeys) {
      const indices = mutable.get(key) ?? [];
      indices.push(index);
      mutable.set(key, indices);
    }
  });
  return Object.freeze({
    cells: new Map(
      [...mutable].map(([key, indices]) => [key, Object.freeze(indices)] as const),
    ),
    overflow: Object.freeze(overflow),
  });
}

export function queryPatchMapRelationHitIndex(
  index: PatchMapRelationHitIndex,
  point: PatchMapPoint,
): readonly number[] {
  const local = index.cells.get(relationHitCellKey(point.x, point.y)) ?? [];
  return mergeOrderedRelationIndices(local, index.overflow);
}

export function emptyPatchMapRelationHitIndex(): PatchMapRelationHitIndex {
  return Object.freeze({ cells: new Map(), overflow: Object.freeze([]) });
}

export function selectionOverlayFromEntityGeometry(
  selected: readonly PatchMapSurfaceEntityGeometry[],
): PatchMapSurfaceGeometrySnapshot['selectionOverlay'] {
  const screenBounds = unionBounds(selected.map((entity) => entity.screenBounds));
  return screenBounds === null ? null : Object.freeze({ screenBounds });
}

function relationHitCellKey(x: number, y: number): string {
  return `${Math.floor(x / PATCH_MAP_RELATION_HIT_CELL_SIZE)}:${Math.floor(y / PATCH_MAP_RELATION_HIT_CELL_SIZE)}`;
}

function relationHitPathCellKeys(
  points: readonly (readonly [number, number])[],
  radius: number,
): ReadonlySet<string> | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  const halo = Math.ceil(radius / PATCH_MAP_RELATION_HIT_CELL_SIZE);
  const haloWidth = halo * 2 + 1;
  const cellsPerStep = haloWidth * haloWidth;
  if (
    !Number.isSafeInteger(halo) ||
    !Number.isSafeInteger(cellsPerStep) ||
    cellsPerStep > PATCH_MAP_RELATION_HIT_MAX_CELLS_PER_PATH
  ) {
    return null;
  }

  const keys = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    const startColumn = relationHitCellCoordinate(from[0]);
    const startRow = relationHitCellCoordinate(from[1]);
    const endColumn = relationHitCellCoordinate(to[0]);
    const endRow = relationHitCellCoordinate(to[1]);
    if (
      startColumn === null || startRow === null ||
      endColumn === null || endRow === null
    ) {
      return null;
    }
    const stepBudget = Math.abs(endColumn - startColumn) +
      Math.abs(endRow - startRow) + 1;
    if (
      !Number.isSafeInteger(stepBudget) ||
      stepBudget > PATCH_MAP_RELATION_HIT_MAX_CELLS_PER_PATH
    ) {
      return null;
    }
    if (!addRelationSegmentCells(
      keys,
      from,
      to,
      startColumn,
      startRow,
      endColumn,
      endRow,
      halo,
    )) {
      return null;
    }
  }
  return keys;
}

function addRelationSegmentCells(
  keys: Set<string>,
  from: readonly [number, number],
  to: readonly [number, number],
  startColumn: number,
  startRow: number,
  endColumn: number,
  endRow: number,
  halo: number,
): boolean {
  let column = startColumn;
  let row = startRow;
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const stepX = Math.sign(deltaX);
  const stepY = Math.sign(deltaY);
  const tDeltaX = stepX === 0
    ? Number.POSITIVE_INFINITY
    : PATCH_MAP_RELATION_HIT_CELL_SIZE / Math.abs(deltaX);
  const tDeltaY = stepY === 0
    ? Number.POSITIVE_INFINITY
    : PATCH_MAP_RELATION_HIT_CELL_SIZE / Math.abs(deltaY);
  let tMaxX = stepX === 0
    ? Number.POSITIVE_INFINITY
    : ((stepX > 0 ? column + 1 : column) * PATCH_MAP_RELATION_HIT_CELL_SIZE - from[0]) /
      deltaX;
  let tMaxY = stepY === 0
    ? Number.POSITIVE_INFINITY
    : ((stepY > 0 ? row + 1 : row) * PATCH_MAP_RELATION_HIT_CELL_SIZE - from[1]) /
      deltaY;

  while (true) {
    for (let rowOffset = -halo; rowOffset <= halo; rowOffset += 1) {
      for (let columnOffset = -halo; columnOffset <= halo; columnOffset += 1) {
        const candidateColumn = column + columnOffset;
        const candidateRow = row + rowOffset;
        if (!Number.isSafeInteger(candidateColumn) || !Number.isSafeInteger(candidateRow)) {
          return false;
        }
        keys.add(`${candidateColumn}:${candidateRow}`);
        if (keys.size > PATCH_MAP_RELATION_HIT_MAX_CELLS_PER_PATH) return false;
      }
    }
    if (column === endColumn && row === endRow) return true;
    if (tMaxX < tMaxY) {
      column += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      row += stepY;
      tMaxY += tDeltaY;
    } else {
      column += stepX;
      row += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
  }
}

function relationHitCellCoordinate(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const coordinate = Math.floor(value / PATCH_MAP_RELATION_HIT_CELL_SIZE);
  return Number.isSafeInteger(coordinate) ? coordinate : null;
}

function mergeOrderedRelationIndices(
  local: readonly number[],
  overflow: readonly number[],
): readonly number[] {
  if (local.length === 0) return overflow;
  if (overflow.length === 0) return local;
  const merged: number[] = [];
  let localIndex = 0;
  let overflowIndex = 0;
  while (localIndex < local.length || overflowIndex < overflow.length) {
    const localValue = local[localIndex];
    const overflowValue = overflow[overflowIndex];
    if (
      overflowValue === undefined ||
      (localValue !== undefined && localValue < overflowValue)
    ) {
      merged.push(localValue as number);
      localIndex += 1;
    } else if (localValue === undefined || overflowValue < localValue) {
      merged.push(overflowValue);
      overflowIndex += 1;
    } else {
      merged.push(localValue);
      localIndex += 1;
      overflowIndex += 1;
    }
  }
  return Object.freeze(merged);
}

function relationSourceId(entity: SceneSnapshot['entities'][number]): string {
  const tag = entity.tags.find((entry) => entry.startsWith('source:'));
  return tag?.slice('source:'.length) || entity.id;
}

interface ResolvedEntityGeometry {
  readonly worldBounds: readonly [number, number, number, number];
  readonly screenBounds: readonly [number, number, number, number];
  readonly screenBasis: PatchMapAffineBasis;
  readonly visibleCenter: readonly [number, number];
}

interface ResolvedWorldEntityGeometry {
  readonly worldBounds: readonly [number, number, number, number];
  readonly worldCorners: readonly (readonly [number, number])[];
  readonly worldBasis: PatchMapAffineBasis;
  readonly visibleCenter: readonly [number, number];
}

function resolveProjectedEntityWorldGeometry(
  projection: NonNullable<PatchMapProjectionIndex['byEntityId'][string]>,
  view: PatchMapSurfaceView,
  index?: PatchMapProjectionIndex | null,
): ResolvedWorldEntityGeometry {
  const orientedWorldAffine = multiplyPatchMapAffine(
    createPatchMapAffine(0, 0, 0, view.flipX ? -1 : 1, view.flipY ? -1 : 1),
    createPatchMapAffine(0, 0, view.rotation),
  );
  let worldCorners: readonly (readonly [number, number])[];
  let worldBasis: PatchMapAffineBasis;
  if (projection.contentOrientation === 'upright') {
    const resolved = writePatchMapReadableRect(
      {
        center: [0, 0],
        basis: [1, 0, 0, 1],
        width: 0,
        height: 0,
      },
      projection,
      orientedWorldAffine[0],
      orientedWorldAffine[1],
      orientedWorldAffine[2],
      orientedWorldAffine[3],
      1,
      readableBarPlacementAnchor(projection, index),
    );
    worldBasis = Object.freeze([
      resolved.basis[0],
      resolved.basis[1],
      resolved.basis[2],
      resolved.basis[3],
    ] as const);
    worldCorners = resolvedReadableCorners(resolved);
  } else {
    worldBasis = patchMapAffineBasis(projection.affine);
    worldCorners = patchMapAffineCorners(projection.affine, projection.localBounds);
  }
  return Object.freeze({
    worldBounds: boundsForTuplePoints(worldCorners),
    worldCorners,
    worldBasis,
    visibleCenter: projection.contentOrientation === 'upright'
      ? freezePoint(
          (worldCorners[0]![0] + worldCorners[2]![0]) / 2,
          (worldCorners[0]![1] + worldCorners[2]![1]) / 2,
        )
      : projection.visibleCenter,
  });
}

function resolveProjectedEntityGeometry(
  projection: NonNullable<PatchMapProjectionIndex['byEntityId'][string]>,
  view: PatchMapSurfaceView,
  index?: PatchMapProjectionIndex | null,
): ResolvedEntityGeometry {
  const worldGeometry = resolveProjectedEntityWorldGeometry(projection, view, index);
  const orientedWorldAffine = multiplyPatchMapAffine(
    createPatchMapAffine(0, 0, 0, view.flipX ? -1 : 1, view.flipY ? -1 : 1),
    createPatchMapAffine(0, 0, view.rotation),
  );
  const screenBasis = projection.contentOrientation === 'upright'
    ? patchMapAffineBasis(multiplyPatchMapAffine(
        orientedWorldAffine,
        Object.freeze([
          worldGeometry.worldBasis[0],
          worldGeometry.worldBasis[1],
          worldGeometry.worldBasis[2],
          worldGeometry.worldBasis[3],
          0,
          0,
        ] as const),
      ))
    : patchMapAffineBasis(multiplyPatchMapAffine(orientedWorldAffine, projection.affine));
  const screenCorners = worldGeometry.worldCorners.map((point) =>
    surfacePointToScreen(point, view));
  return Object.freeze({
    worldBounds: worldGeometry.worldBounds,
    screenBounds: boundsForTuplePoints(screenCorners),
    screenBasis,
    visibleCenter: worldGeometry.visibleCenter,
  });
}

function readableBarPlacementAnchor(
  projection: PatchMapEntityProjection,
  index?: PatchMapProjectionIndex | null,
): PatchMapPointTuple | undefined {
  if (
    projection.componentType !== 'bar' ||
    projection.ownerItemId === undefined
  ) {
    return undefined;
  }
  return index?.byEntityId[projection.ownerItemId]?.visibleCenter;
}

function resolveDenseEntityWorldGeometry(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
): ResolvedWorldEntityGeometry {
  const worldCorners = rotatedWorldCorners(bounds, rotation).map((point) =>
    freezePoint(point.x, point.y));
  return Object.freeze({
    worldBounds: boundsForTuplePoints(worldCorners),
    worldCorners,
    worldBasis: patchMapAffineBasis(createPatchMapAffine(0, 0, rotation)),
    visibleCenter: freezePoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    ),
  });
}

function resolveDenseEntityGeometry(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
  view: PatchMapSurfaceView,
): ResolvedEntityGeometry {
  const worldGeometry = resolveDenseEntityWorldGeometry(bounds, rotation);
  const screenCorners = worldGeometry.worldCorners.map((point) =>
    surfacePointToScreen(point, view));
  const worldAffine = multiplyPatchMapAffine(
    createPatchMapAffine(0, 0, 0, view.flipX ? -1 : 1, view.flipY ? -1 : 1),
    createPatchMapAffine(0, 0, view.rotation + rotation),
  );
  return Object.freeze({
    worldBounds: worldGeometry.worldBounds,
    screenBounds: boundsForTuplePoints(screenCorners),
    screenBasis: patchMapAffineBasis(worldAffine),
    visibleCenter: worldGeometry.visibleCenter,
  });
}

function resolvedReadableCorners(
  resolved: Readonly<{
    center: readonly [number, number];
    basis: readonly [number, number, number, number];
    width: number;
    height: number;
  }>,
): readonly (readonly [number, number])[] {
  const halfWidth = resolved.width / 2;
  const halfHeight = resolved.height / 2;
  const xWidth = resolved.basis[0] * halfWidth;
  const yWidth = resolved.basis[1] * halfWidth;
  const xHeight = resolved.basis[2] * halfHeight;
  const yHeight = resolved.basis[3] * halfHeight;
  const centerX = resolved.center[0];
  const centerY = resolved.center[1];
  return Object.freeze([
    freezePoint(centerX - xWidth - xHeight, centerY - yWidth - yHeight),
    freezePoint(centerX + xWidth - xHeight, centerY + yWidth - yHeight),
    freezePoint(centerX + xWidth + xHeight, centerY + yWidth + yHeight),
    freezePoint(centerX - xWidth + xHeight, centerY - yWidth + yHeight),
  ]);
}

function surfacePointToScreen(
  point: readonly [number, number],
  view: PatchMapSurfaceView,
): readonly [number, number] {
  const scaledX = point[0] * view.scale;
  const scaledY = point[1] * view.scale;
  const radians = view.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return freezePoint(
    view.x + (scaledX * cosine - scaledY * sine) * (view.flipX ? -1 : 1),
    view.y + (scaledX * sine + scaledY * cosine) * (view.flipY ? -1 : 1),
  );
}

function boundsForTuplePoints(
  points: readonly (readonly [number, number])[],
): readonly [number, number, number, number] {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return freezeBounds(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY);
}

function rotatedWorldCorners(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
): readonly PatchMapPoint[] {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radians = rotation * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [-bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, bounds.height / 2],
    [-bounds.width / 2, bounds.height / 2],
  ] as const;
  return corners.map(([localX, localY]) => Object.freeze({
    x: centerX + localX * cosine - localY * sine,
    y: centerY + localX * sine + localY * cosine,
  }));
}

function unionBounds(
  bounds: readonly (readonly [number, number, number, number])[],
): readonly [number, number, number, number] | null {
  if (bounds.length === 0) return null;
  const minX = Math.min(...bounds.map((entry) => entry[0]));
  const minY = Math.min(...bounds.map((entry) => entry[1]));
  const maxX = Math.max(...bounds.map((entry) => entry[0] + entry[2]));
  const maxY = Math.max(...bounds.map((entry) => entry[1] + entry[3]));
  return freezeBounds(minX, minY, maxX - minX, maxY - minY);
}

function boundsCenter(
  bounds: readonly [number, number, number, number],
): readonly [number, number] {
  return freezePoint(bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2);
}

function normalizeDegrees(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function packedColorToHex(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(8, '0')}`;
}

function freezeBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  return Object.freeze([
    snapGeometryScalar(x),
    snapGeometryScalar(y),
    snapGeometryScalar(width),
    snapGeometryScalar(height),
  ] as const);
}

function freezePoint(x: number, y: number): readonly [number, number] {
  return Object.freeze([snapGeometryScalar(x), snapGeometryScalar(y)] as const);
}

function snapGeometryScalar(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= 1e-12 ? integer : value;
}
