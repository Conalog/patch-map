import type {
  CorePoint,
  EntityRef,
  EntitySnapshot,
  HitTestOptions,
  SceneSnapshot,
} from '../dense/contracts';
import type {
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from '../contracts';
import {
  applyPatchMapAffine,
  patchMapAffineCorners,
  invertPatchMapAffine,
  type PatchMapPointTuple,
} from './geometry';
import {
  boundedSpatialCellCoverage as boundedCellCoverage,
  spatialCellKey as cellKey,
} from './spatial-grid';

const PATCH_MAP_ENTITY_HIT_CELL_SIZE = 128;
const PATCH_MAP_ENTITY_HIT_MAX_CELLS = 256;

interface PatchMapEntityHitEntry {
  readonly ref: EntityRef;
  readonly order: number;
}

export interface PatchMapEntityHitIndexOptions {
  readonly cellSize?: 64 | 128;
  readonly maxCellsPerEntity?: number;
  /**
   * Optional second projection used only for broad-phase membership.
   * The union of the live and envelope AABBs keeps an interpolating entity in
   * stable buckets while the narrow phase continues to use the live
   * projection.
   */
  readonly envelopeProjection?: PatchMapProjectionIndex | null;
}

export interface PatchMapEntityHitIndexDebug {
  readonly bucketCount: number;
  readonly bucketMembershipCount: number;
  readonly overflowCount: number;
  readonly indexedEntityCount: number;
  readonly cellSize: number;
  readonly maxCellsPerEntity: number;
}

/**
 * Immutable, world-space broad phase for PatchMap aggregate entities. Bucket
 * membership is bounded per entity; oversized or arithmetically unsafe AABBs
 * go through one overflow list instead of expanding an unbounded grid range.
 */
export class PatchMapEntityHitIndex {
  private readonly buckets: ReadonlyMap<string, readonly PatchMapEntityHitEntry[]>;
  private readonly overflow: readonly PatchMapEntityHitEntry[];
  private readonly cellSize: number;
  private readonly debugValue: PatchMapEntityHitIndexDebug;

  private constructor(
    buckets: ReadonlyMap<string, readonly PatchMapEntityHitEntry[]>,
    overflow: readonly PatchMapEntityHitEntry[],
    debug: PatchMapEntityHitIndexDebug,
  ) {
    this.buckets = buckets;
    this.overflow = overflow;
    this.cellSize = debug.cellSize;
    this.debugValue = Object.freeze(debug);
  }

  public static build(
    snapshot: SceneSnapshot,
    projection: PatchMapProjectionIndex | null,
    staleProjectionIds: ReadonlySet<string> = new Set(),
    options: PatchMapEntityHitIndexOptions = {},
  ): PatchMapEntityHitIndex {
    return PatchMapEntityHitIndex.buildEntities(
      snapshot.entities,
      projection,
      staleProjectionIds,
      options,
    );
  }

  /**
   * Build from an already selected render-ordered entity slice. This lets the
   * presentation path index only actively interpolating bars instead of
   * snapshotting the complete dense scene.
   */
  public static buildEntities(
    entities: readonly EntitySnapshot[],
    projection: PatchMapProjectionIndex | null,
    staleProjectionIds: ReadonlySet<string> = new Set(),
    options: PatchMapEntityHitIndexOptions = {},
  ): PatchMapEntityHitIndex {
    const cellSize = options.cellSize ?? PATCH_MAP_ENTITY_HIT_CELL_SIZE;
    const maxCells = options.maxCellsPerEntity ?? PATCH_MAP_ENTITY_HIT_MAX_CELLS;
    if (cellSize !== 64 && cellSize !== 128) {
      throw new RangeError('PatchMap entity hit cellSize must be 64 or 128');
    }
    if (!Number.isSafeInteger(maxCells) || maxCells <= 0) {
      throw new RangeError('PatchMap entity hit maxCellsPerEntity must be a positive safe integer');
    }

    const mutableBuckets = new Map<string, PatchMapEntityHitEntry[]>();
    const overflow: PatchMapEntityHitEntry[] = [];
    let indexedEntityCount = 0;
    let bucketMembershipCount = 0;
    entities.forEach((entity, order) => {
      if (entity.kind === 'relation') return;
      indexedEntityCount += 1;
      const entry = Object.freeze({ ref: entity.ref, order });
      const entityProjection = staleProjectionIds.has(entity.id)
        ? undefined
        : projection?.byEntityId[entity.id];
      const envelopeEntityProjection = staleProjectionIds.has(entity.id)
        ? undefined
        : options.envelopeProjection?.byEntityId[entity.id];
      const bounds = unionBounds(
        patchMapEntityWorldAabb(entity, entityProjection),
        patchMapEntityWorldAabb(entity, envelopeEntityProjection),
      );
      const coverage = bounds && boundedCellCoverage(bounds, cellSize, maxCells);
      if (!coverage) {
        overflow.push(entry);
        return;
      }
      for (let row = coverage.minRow; row <= coverage.maxRow; row += 1) {
        for (let column = coverage.minColumn; column <= coverage.maxColumn; column += 1) {
          const key = cellKey(column, row);
          const entries = mutableBuckets.get(key) ?? [];
          entries.push(entry);
          mutableBuckets.set(key, entries);
          bucketMembershipCount += 1;
        }
      }
    });
    const buckets = new Map(
      [...mutableBuckets].map(([key, entries]) => [key, Object.freeze(entries)] as const),
    );
    return new PatchMapEntityHitIndex(
      buckets,
      Object.freeze(overflow),
      {
        bucketCount: buckets.size,
        bucketMembershipCount,
        overflowCount: overflow.length,
        indexedEntityCount,
        cellSize,
        maxCellsPerEntity: maxCells,
      },
    );
  }

  /** Candidate refs in exact topmost-first snapshot/render order. */
  public candidates(point: CorePoint): readonly EntityRef[] {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return Object.freeze([]);
    const column = Math.floor(point.x / this.cellSize);
    const row = Math.floor(point.y / this.cellSize);
    if (!Number.isSafeInteger(column) || !Number.isSafeInteger(row)) {
      return Object.freeze(this.overflow.map((entry) => entry.ref).reverse());
    }
    const local = this.buckets.get(cellKey(column, row)) ?? [];
    return Object.freeze(mergeTopmostFirst(local, this.overflow));
  }

  public debugSnapshot(): PatchMapEntityHitIndexDebug {
    return this.debugValue;
  }
}

function unionBounds(
  left: readonly [number, number, number, number] | null,
  right: readonly [number, number, number, number] | null,
): readonly [number, number, number, number] | null {
  if (left === null) return right;
  if (right === null) return left;
  const minX = Math.min(left[0], right[0]);
  const minY = Math.min(left[1], right[1]);
  const maxX = Math.max(left[0] + left[2], right[0] + right[2]);
  const maxY = Math.max(left[1] + left[3], right[1] + right[3]);
  return Object.freeze([minX, minY, maxX - minX, maxY - minY]);
}

export function hitTestPatchMapEntityIndex(
  index: PatchMapEntityHitIndex,
  point: CorePoint,
  options: HitTestOptions,
  getEntity: (ref: EntityRef) => EntitySnapshot | null,
  projection: PatchMapProjectionIndex | null,
  staleProjectionIds: ReadonlySet<string> = new Set(),
): EntityRef | null {
  const kinds = options.kinds ? new Set(options.kinds) : null;
  for (const ref of index.candidates(point)) {
    const entity = getEntity(ref);
    if (!entity || entity.kind === 'relation' || !entity.visible) continue;
    if (options.interactiveOnly !== false && !entity.interactive) continue;
    if (kinds && !kinds.has(entity.kind)) continue;
    const entityProjection = staleProjectionIds.has(entity.id)
      ? undefined
      : projection?.byEntityId[entity.id];
    if (patchMapEntityContainsWorldPoint(entity, point, entityProjection)) return ref;
  }
  return null;
}

export function patchMapEntityContainsWorldPoint(
  entity: EntitySnapshot,
  point: CorePoint,
  projection?: PatchMapEntityProjection,
): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (projection?.contentOrientation === 'follow-item') {
    try {
      const local = applyPatchMapAffine(
        invertPatchMapAffine(projection.affine),
        Object.freeze([point.x, point.y] as PatchMapPointTuple),
      );
      return containsTuple(projection.localBounds, local);
    } catch {
      return false;
    }
  }
  return containsRotatedDenseEntity(entity, point);
}

export function patchMapEntityWorldAabb(
  entity: EntitySnapshot,
  projection?: PatchMapEntityProjection,
): readonly [number, number, number, number] | null {
  try {
    const points = projection?.contentOrientation === 'follow-item'
      ? patchMapAffineCorners(projection.affine, projection.localBounds)
      : denseEntityCorners(entity);
    return boundsForFinitePoints(points);
  } catch {
    return null;
  }
}

function denseEntityCorners(entity: EntitySnapshot): readonly PatchMapPointTuple[] {
  const { x, y, width, height } = entity.bounds;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radians = entity.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze([
    rotateDenseCorner(x, y, centerX, centerY, cosine, sine),
    rotateDenseCorner(x + width, y, centerX, centerY, cosine, sine),
    rotateDenseCorner(x + width, y + height, centerX, centerY, cosine, sine),
    rotateDenseCorner(x, y + height, centerX, centerY, cosine, sine),
  ]);
}

function rotateDenseCorner(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  cosine: number,
  sine: number,
): PatchMapPointTuple {
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  return Object.freeze([
    centerX + deltaX * cosine - deltaY * sine,
    centerY + deltaX * sine + deltaY * cosine,
  ]);
}

function boundsForFinitePoints(
  points: readonly PatchMapPointTuple[],
): readonly [number, number, number, number] | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return [minX, minY, width, height].every(Number.isFinite)
    ? Object.freeze([minX, minY, width, height])
    : null;
}

function mergeTopmostFirst(
  local: readonly PatchMapEntityHitEntry[],
  overflow: readonly PatchMapEntityHitEntry[],
): EntityRef[] {
  const refs: EntityRef[] = [];
  let localIndex = local.length - 1;
  let overflowIndex = overflow.length - 1;
  while (localIndex >= 0 || overflowIndex >= 0) {
    const localEntry = local[localIndex];
    const overflowEntry = overflow[overflowIndex];
    if (!overflowEntry || (localEntry && localEntry.order > overflowEntry.order)) {
      refs.push(localEntry!.ref);
      localIndex -= 1;
    } else {
      refs.push(overflowEntry.ref);
      overflowIndex -= 1;
    }
  }
  return refs;
}

function containsTuple(
  bounds: readonly [number, number, number, number],
  point: PatchMapPointTuple,
): boolean {
  return point[0] >= bounds[0] && point[1] >= bounds[1] &&
    point[0] <= bounds[0] + bounds[2] && point[1] <= bounds[1] + bounds[3];
}

function containsRotatedDenseEntity(entity: EntitySnapshot, point: CorePoint): boolean {
  const centerX = entity.bounds.x + entity.bounds.width / 2;
  const centerY = entity.bounds.y + entity.bounds.height / 2;
  const radians = -entity.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  const localX = deltaX * cosine - deltaY * sine;
  const localY = deltaX * sine + deltaY * cosine;
  return [centerX, centerY, localX, localY].every(Number.isFinite) &&
    Math.abs(localX) <= entity.bounds.width / 2 &&
    Math.abs(localY) <= entity.bounds.height / 2;
}
