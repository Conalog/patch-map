import type { PatchMapProjectionIndex } from '../parsing/contracts';
import {
  comparePatchMapStackingPaths,
  rankPatchMapStackingPaths,
  type PatchMapStackingPath,
} from '../semantic/stacking';

export interface PatchMapScenePaintOrder {
  readonly exact: boolean;
  readonly rankByEntityId: Readonly<Record<string, number>>;
  readonly analysis?: PatchMapScenePaintOrderAnalysis;
}

// Dense authored zIndex values are stored as signed Int32 values, so this
// exact-route band cannot collide with public authored values.
export const PATCH_MAP_EXACT_PAINT_ORDER_OFFSET = 2 ** 32;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PatchMapScenePaintOrderAnalysis {
  readonly boundsByOwnerId: ReadonlyMap<string, Bounds>;
  readonly componentIdsByOwnerId: ReadonlyMap<string, readonly string[]>;
  readonly ownerIdByComponentId: ReadonlyMap<string, string>;
}

/** Resolve hierarchy once per projection publication, never during view-only frames. */
export function resolvePatchMapScenePaintOrder(
  index: PatchMapProjectionIndex,
  previous?: PatchMapScenePaintOrder,
  changedEntityIds?: ReadonlySet<string> | null,
): PatchMapScenePaintOrder {
  const retained = retainNonOverlappingPaintOrder(index, previous, changedEntityIds);
  if (retained !== null) return retained;
  const resolved = exactPaintOwners(index);
  const exactOwnerIds = resolved.exactOwnerIds;
  const analysis = Object.freeze({
    boundsByOwnerId: resolved.boundsByOwnerId,
    componentIdsByOwnerId: resolved.componentIdsByOwnerId,
    ownerIdByComponentId: resolved.ownerIdByComponentId,
  });
  if (exactOwnerIds.size === 0) {
    return Object.freeze({ exact: false, rankByEntityId: Object.freeze({}), analysis });
  }
  return scenePaintOrderForOwners(index, exactOwnerIds, analysis);
}

function scenePaintOrderForOwners(
  index: PatchMapProjectionIndex,
  exactOwnerIds: ReadonlySet<string>,
  analysis: PatchMapScenePaintOrderAnalysis,
): PatchMapScenePaintOrder {
  let earliestExactPath: PatchMapStackingPath | undefined;
  const considerExactPath = (entityId: string): void => {
    const path = index.byEntityId[entityId]?.stackingPath;
    if (path === undefined) return;
    if (
      earliestExactPath === undefined ||
      comparePatchMapStackingPaths(path, earliestExactPath) < 0
    ) earliestExactPath = path;
  };
  for (const ownerId of exactOwnerIds) {
    considerExactPath(ownerId);
  }
  for (const ownerId of exactOwnerIds) {
    for (const entityId of analysis.componentIdsByOwnerId.get(ownerId) ?? []) {
      considerExactPath(entityId);
    }
  }
  const paths = Object.create(null) as Record<string, PatchMapStackingPath>;
  if (earliestExactPath !== undefined) {
    // The shared exact container is the final aggregate lane. Keep the
    // compatible prefix batched, but route the complete stacking suffix so a
    // later normal sibling cannot be painted behind an earlier exact item.
    for (const projection of Object.values(index.byEntityId)) {
      const path = projection.stackingPath;
      if (
        path !== undefined &&
        comparePatchMapStackingPaths(path, earliestExactPath) >= 0
      ) paths[projection.entityId] = path;
    }
    for (const projection of Object.values(index.relationsByEntityId)) {
      const path = projection.stackingPath;
      if (
        path !== undefined &&
        comparePatchMapStackingPaths(path, earliestExactPath) >= 0
      ) paths[projection.entityId] = path;
    }
  }
  const ranks = rankPatchMapStackingPaths(paths);
  const rankByEntityId = Object.freeze(Object.fromEntries(
    Object.entries(ranks).map(([entityId, rank]) => [
      entityId,
      rank + PATCH_MAP_EXACT_PAINT_ORDER_OFFSET,
    ]),
  ));
  return Object.freeze({
    exact: true,
    rankByEntityId,
    analysis,
  });
}

/** Recover all projected consumers when a binding settles before leaf observation. */
export function patchMapSceneAssetTransitionSlots(
  index: PatchMapProjectionIndex,
  slotByEntityId: ReadonlyMap<string, number>,
  bindingKey: string,
  dirtySlots: readonly number[],
): readonly number[] | null {
  const slots = new Set(dirtySlots);
  for (const [entityId, image] of Object.entries(index.imagesByEntityId)) {
    if (image.bindingKey !== bindingKey) continue;
    const slot = slotByEntityId.get(entityId);
    if (slot === undefined) return null;
    slots.add(slot);
  }
  return Object.freeze([...slots].sort((left, right) => left - right));
}

function exactPaintOwners(index: PatchMapProjectionIndex): Readonly<{
  exactOwnerIds: ReadonlySet<string>;
  boundsByOwnerId: ReadonlyMap<string, Bounds>;
  componentIdsByOwnerId: ReadonlyMap<string, readonly string[]>;
  ownerIdByComponentId: ReadonlyMap<string, string>;
}> {
  const exact = new Set<string>();
  const componentIdsByOwner = new Map<string, string[]>();
  const ownerIdByComponentId = new Map<string, string>();
  for (const projection of Object.values(index.byEntityId)) {
    if (projection.ownerItemId === undefined || projection.componentId === undefined) continue;
    ownerIdByComponentId.set(projection.entityId, projection.ownerItemId);
    const ids = componentIdsByOwner.get(projection.ownerItemId);
    if (ids === undefined) componentIdsByOwner.set(projection.ownerItemId, [projection.entityId]);
    else ids.push(projection.entityId);
  }
  const owners: Array<Readonly<{ id: string; bounds: Bounds }>> = [];
  for (const [ownerId, entityIds] of componentIdsByOwner) {
    const owner = index.byEntityId[ownerId];
    if (owner === undefined) {
      exact.add(ownerId);
      continue;
    }
    const ownerBounds = projectionBounds(owner.affine, owner.localBounds);
    let paintBounds = ownerBounds;
    const ordered = entityIds
      .map((entityId) => ({
        entityId,
        path: index.byEntityId[entityId]?.stackingPath,
        role: legacyRole(index, entityId),
      }))
      .sort((left, right) => comparePatchMapStackingPaths(
        left.path ?? Object.freeze([]),
        right.path ?? Object.freeze([]),
      ));
    const legacyOrdered = entityIds.map((entityId, authoredOrder) => ({
      entityId,
      authoredOrder: componentAuthoredOrder(index, entityId, authoredOrder),
      role: legacyRole(index, entityId),
    })).sort((left, right) => left.role - right.role || left.authoredOrder - right.authoredOrder);
    for (const [position, entry] of ordered.entries()) {
      if (entry.path === undefined || legacyOrdered[position]?.entityId !== entry.entityId) {
        exact.add(ownerId);
      }
      const projection = index.byEntityId[entry.entityId];
      if (projection === undefined) {
        exact.add(ownerId);
        continue;
      }
      const componentBounds = projectionBounds(projection.affine, projection.localBounds);
      if (!contains(ownerBounds, componentBounds)) exact.add(ownerId);
      paintBounds = unionBounds(paintBounds, componentBounds);
    }
    owners.push({ id: ownerId, bounds: paintBounds });
  }
  for (const ownerId of overlappingOwnerIds(owners)) exact.add(ownerId);
  return Object.freeze({
    exactOwnerIds: exact,
    boundsByOwnerId: new Map(owners.map(({ id, bounds }) => [id, bounds])),
    componentIdsByOwnerId: componentIdsByOwner,
    ownerIdByComponentId,
  });
}

function retainNonOverlappingPaintOrder(
  index: PatchMapProjectionIndex,
  previous: PatchMapScenePaintOrder | undefined,
  changedEntityIds: ReadonlySet<string> | null | undefined,
): PatchMapScenePaintOrder | null {
  if (
    previous === undefined || previous.exact || previous.analysis === undefined ||
    changedEntityIds === undefined || changedEntityIds === null
  ) return null;
  const changedOwnerIds = new Set<string>();
  for (const entityId of changedEntityIds) {
    const projection = index.byEntityId[entityId];
    if (projection?.ownerItemId !== undefined && projection.componentId !== undefined) {
      changedOwnerIds.add(projection.ownerItemId);
    }
    else if (previous.analysis.ownerIdByComponentId.has(entityId)) {
      changedOwnerIds.add(previous.analysis.ownerIdByComponentId.get(entityId)!);
    }
    else if (previous.analysis.boundsByOwnerId.has(entityId)) changedOwnerIds.add(entityId);
  }
  if (changedOwnerIds.size === 0) return previous;
  const nextComponentIdsByOwnerId = new Map(previous.analysis.componentIdsByOwnerId);
  const nextOwnerIdByComponentId = new Map(previous.analysis.ownerIdByComponentId);
  for (const entityId of changedEntityIds) {
    const previousOwnerId = previous.analysis.ownerIdByComponentId.get(entityId);
    const projection = index.byEntityId[entityId];
    const nextOwnerId = projection?.componentId === undefined
      ? undefined
      : projection.ownerItemId;
    if (previousOwnerId !== undefined && previousOwnerId !== nextOwnerId) {
      nextComponentIdsByOwnerId.set(
        previousOwnerId,
        (nextComponentIdsByOwnerId.get(previousOwnerId) ?? []).filter((id) => id !== entityId),
      );
      nextOwnerIdByComponentId.delete(entityId);
    }
    if (nextOwnerId !== undefined && previousOwnerId !== nextOwnerId) {
      nextComponentIdsByOwnerId.set(
        nextOwnerId,
        [...(nextComponentIdsByOwnerId.get(nextOwnerId) ?? []), entityId],
      );
      nextOwnerIdByComponentId.set(entityId, nextOwnerId);
    }
  }
  const nextBounds = new Map(previous.analysis.boundsByOwnerId);
  const exactOwnerIds = new Set<string>();
  for (const ownerId of changedOwnerIds) {
    const owner = index.byEntityId[ownerId];
    const componentIds = nextComponentIdsByOwnerId.get(ownerId);
    if (owner === undefined || componentIds === undefined) return null;
    const ownerBounds = projectionBounds(owner.affine, owner.localBounds);
    const ordered = componentIds.map((entityId) => ({
      entityId,
      path: index.byEntityId[entityId]?.stackingPath,
      role: legacyRole(index, entityId),
    })).sort((left, right) => comparePatchMapStackingPaths(
      left.path ?? Object.freeze([]),
      right.path ?? Object.freeze([]),
    ));
    const legacyOrdered = componentIds.map((entityId, authoredOrder) => ({
      entityId,
      authoredOrder: componentAuthoredOrder(index, entityId, authoredOrder),
      role: legacyRole(index, entityId),
    })).sort((left, right) => left.role - right.role || left.authoredOrder - right.authoredOrder);
    let paintBounds = ownerBounds;
    for (const [position, entry] of ordered.entries()) {
      const projection = index.byEntityId[entry.entityId];
      if (projection === undefined) return null;
      if (entry.path === undefined || legacyOrdered[position]?.entityId !== entry.entityId) {
        exactOwnerIds.add(ownerId);
      }
      const componentBounds = projectionBounds(projection.affine, projection.localBounds);
      if (!contains(ownerBounds, componentBounds)) exactOwnerIds.add(ownerId);
      paintBounds = unionBounds(
        paintBounds,
        componentBounds,
      );
    }
    nextBounds.set(ownerId, paintBounds);
  }
  const overlapOwnerIds = changedOwnerIds.size <= 32
    ? overlappingFewChangedOwnerIds(nextBounds, changedOwnerIds)
    : overlappingChangedOwnerIds(nextBounds, changedOwnerIds);
  for (const ownerId of overlapOwnerIds) {
    exactOwnerIds.add(ownerId);
  }
  const analysis = Object.freeze({
    boundsByOwnerId: nextBounds,
    componentIdsByOwnerId: nextComponentIdsByOwnerId,
    ownerIdByComponentId: nextOwnerIdByComponentId,
  });
  if (exactOwnerIds.size > 0) {
    return scenePaintOrderForOwners(index, exactOwnerIds, analysis);
  }
  return Object.freeze({
    exact: false,
    rankByEntityId: previous.rankByEntityId,
    analysis,
  });
}

function overlappingFewChangedOwnerIds(
  boundsByOwnerId: ReadonlyMap<string, Bounds>,
  changedOwnerIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const ownerId of changedOwnerIds) {
    const current = boundsByOwnerId.get(ownerId);
    if (current === undefined) continue;
    for (const [candidateId, candidate] of boundsByOwnerId) {
      if (candidateId !== ownerId && overlaps(current, candidate)) {
        result.add(ownerId);
        result.add(candidateId);
      }
    }
  }
  return result;
}

function overlappingChangedOwnerIds(
  boundsByOwnerId: ReadonlyMap<string, Bounds>,
  changedOwnerIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const result = new Set<string>();
  if (boundsByOwnerId.size < 2) return result;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let width = 0;
  let height = 0;
  for (const bounds of boundsByOwnerId.values()) {
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    width += bounds.maxX - bounds.minX;
    height += bounds.maxY - bounds.minY;
  }
  const cellWidth = Math.max(width / boundsByOwnerId.size, 1);
  const cellHeight = Math.max(height / boundsByOwnerId.size, 1);
  const buckets = new Map<string, Array<Readonly<{ id: string; bounds: Bounds }>>>();
  const indexed: Array<Readonly<{ id: string; bounds: Bounds }>> = [];
  const oversized: Array<Readonly<{ id: string; bounds: Bounds }>> = [];
  const insert = (entry: Readonly<{ id: string; bounds: Bounds }>): void => {
    const startX = Math.floor((entry.bounds.minX - minX) / cellWidth);
    const endX = Math.floor((entry.bounds.maxX - minX) / cellWidth);
    const startY = Math.floor((entry.bounds.minY - minY) / cellHeight);
    const endY = Math.floor((entry.bounds.maxY - minY) / cellHeight);
    if ((endX - startX + 1) * (endY - startY + 1) > 64) {
      oversized.push(entry);
    } else {
      for (let x = startX; x <= endX; x += 1) {
        for (let y = startY; y <= endY; y += 1) {
          const key = `${x}:${y}`;
          const bucket = buckets.get(key);
          if (bucket === undefined) buckets.set(key, [entry]);
          else bucket.push(entry);
        }
      }
    }
    indexed.push(entry);
  };
  for (const [id, bounds] of boundsByOwnerId) {
    if (!changedOwnerIds.has(id)) insert({ id, bounds });
  }
  for (const id of changedOwnerIds) {
    const bounds = boundsByOwnerId.get(id);
    if (bounds === undefined) continue;
    const current = { id, bounds } as const;
    const candidates = new Map<string, Readonly<{ id: string; bounds: Bounds }>>();
    const startX = Math.floor((bounds.minX - minX) / cellWidth);
    const endX = Math.floor((bounds.maxX - minX) / cellWidth);
    const startY = Math.floor((bounds.minY - minY) / cellHeight);
    const endY = Math.floor((bounds.maxY - minY) / cellHeight);
    if ((endX - startX + 1) * (endY - startY + 1) > 64) {
      for (const candidate of indexed) candidates.set(candidate.id, candidate);
    } else {
      for (let x = startX; x <= endX; x += 1) {
        for (let y = startY; y <= endY; y += 1) {
          for (const candidate of buckets.get(`${x}:${y}`) ?? []) {
            candidates.set(candidate.id, candidate);
          }
        }
      }
      for (const candidate of oversized) candidates.set(candidate.id, candidate);
    }
    for (const candidate of candidates.values()) {
      if (overlaps(bounds, candidate.bounds)) {
        result.add(id);
        result.add(candidate.id);
      }
    }
    insert(current);
  }
  return result;
}

function legacyRole(index: PatchMapProjectionIndex, entityId: string): number {
  const role = index.componentsByEntityId[entityId]?.renderRole;
  if (role === 'background-geometry') return 2;
  if (role === 'background-asset') return 3;
  if (role === 'ordinary-geometry') return 4;
  if (role === 'content-asset') return 5;
  if (role === 'text') return 6;
  const componentType = index.byEntityId[entityId]?.componentType;
  if (componentType === 'background') return 2;
  if (componentType === 'bar') return 4;
  if (componentType === 'icon') return 5;
  if (componentType === 'text') return 6;
  return 1;
}

function componentAuthoredOrder(
  index: PatchMapProjectionIndex,
  entityId: string,
  fallback: number,
): number {
  const path = index.byEntityId[entityId]?.stackingPath;
  return path?.[path.length - 1]?.authoredOrder ?? fallback;
}

function projectionBounds(
  affine: readonly number[],
  local: readonly number[],
): Bounds {
  const x = local[0] ?? 0;
  const y = local[1] ?? 0;
  const width = local[2] ?? 0;
  const height = local[3] ?? 0;
  const topLeft = transform(affine, x, y);
  const topRight = transform(affine, x + width, y);
  const bottomRight = transform(affine, x + width, y + height);
  const bottomLeft = transform(affine, x, y + height);
  return {
    minX: Math.min(topLeft[0], topRight[0], bottomRight[0], bottomLeft[0]),
    minY: Math.min(topLeft[1], topRight[1], bottomRight[1], bottomLeft[1]),
    maxX: Math.max(topLeft[0], topRight[0], bottomRight[0], bottomLeft[0]),
    maxY: Math.max(topLeft[1], topRight[1], bottomRight[1], bottomLeft[1]),
  };
}

function transform(affine: readonly number[], x: number, y: number): readonly [number, number] {
  return [
    (affine[0] ?? 1) * x + (affine[2] ?? 0) * y + (affine[4] ?? 0),
    (affine[1] ?? 0) * x + (affine[3] ?? 1) * y + (affine[5] ?? 0),
  ];
}

function contains(outer: Bounds, inner: Bounds): boolean {
  const epsilon = 1e-6;
  return inner.minX >= outer.minX - epsilon && inner.minY >= outer.minY - epsilon &&
    inner.maxX <= outer.maxX + epsilon && inner.maxY <= outer.maxY + epsilon;
}

function unionBounds(left: Bounds, right: Bounds): Bounds {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

function overlaps(left: Bounds, right: Bounds): boolean {
  return left.minX < right.maxX && left.maxX > right.minX &&
    left.minY < right.maxY && left.maxY > right.minY;
}

function overlappingOwnerIds(
  owners: readonly Readonly<{ id: string; bounds: Bounds }>[],
): ReadonlySet<string> {
  const result = new Set<string>();
  if (owners.length < 2) return result;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let width = 0;
  let height = 0;
  for (const { bounds: entry } of owners) {
    minX = Math.min(minX, entry.minX);
    minY = Math.min(minY, entry.minY);
    width += entry.maxX - entry.minX;
    height += entry.maxY - entry.minY;
  }
  const cellWidth = Math.max(width / owners.length, 1);
  const cellHeight = Math.max(height / owners.length, 1);
  const buckets = new Map<string, Array<Readonly<{ id: string; bounds: Bounds }>>>();
  const checkedAt = new Map<string, number>();
  const oversized: Array<Readonly<{ id: string; bounds: Bounds }>> = [];
  for (const [ownerIndex, current] of owners.entries()) {
    const startX = Math.floor((current.bounds.minX - minX) / cellWidth);
    const endX = Math.floor((current.bounds.maxX - minX) / cellWidth);
    const startY = Math.floor((current.bounds.minY - minY) / cellHeight);
    const endY = Math.floor((current.bounds.maxY - minY) / cellHeight);
    const cellCount = (endX - startX + 1) * (endY - startY + 1);
    if (cellCount > 64) {
      for (let candidateIndex = 0; candidateIndex < ownerIndex; candidateIndex += 1) {
        const candidate = owners[candidateIndex];
        if (candidate !== undefined && overlaps(candidate.bounds, current.bounds)) {
          result.add(candidate.id);
          result.add(current.id);
        }
      }
      oversized.push(current);
      continue;
    }
    for (const candidate of oversized) {
      if (overlaps(candidate.bounds, current.bounds)) {
        result.add(candidate.id);
        result.add(current.id);
      }
    }
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        const key = `${x}:${y}`;
        const bucket = buckets.get(key);
        if (bucket !== undefined) {
          for (const candidate of bucket) {
            if (checkedAt.get(candidate.id) === ownerIndex) continue;
            checkedAt.set(candidate.id, ownerIndex);
            if (overlaps(candidate.bounds, current.bounds)) {
              result.add(candidate.id);
              result.add(current.id);
            }
          }
        }
        if (bucket === undefined) buckets.set(key, [current]);
        else bucket.push(current);
      }
    }
  }
  return result;
}
