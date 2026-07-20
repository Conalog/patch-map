import type {
  CorePoint,
  EntityRef,
  EntitySnapshot,
  HitTestOptions,
  SceneSnapshot,
} from '../../core-v1/contracts';
import type {
  CoreV2EntityProjection,
  CoreV2ProjectionIndex,
} from '../contracts';
import {
  applyCoreV2Affine,
  coreV2AffineCorners,
  invertCoreV2Affine,
  type CoreV2PointTuple,
} from './geometry';

export const CORE_V2_ENTITY_HIT_CELL_SIZE = 128;
export const CORE_V2_ENTITY_HIT_MAX_CELLS = 256;

interface CoreV2EntityHitEntry {
  readonly ref: EntityRef;
  readonly order: number;
}

export interface CoreV2EntityHitIndexOptions {
  readonly cellSize?: 64 | 128;
  readonly maxCellsPerEntity?: number;
}

export interface CoreV2EntityHitIndexDebug {
  readonly bucketCount: number;
  readonly bucketMembershipCount: number;
  readonly overflowCount: number;
  readonly indexedEntityCount: number;
  readonly cellSize: number;
  readonly maxCellsPerEntity: number;
}

/**
 * Immutable, world-space broad phase for Core v2 aggregate entities. Bucket
 * membership is bounded per entity; oversized or arithmetically unsafe AABBs
 * go through one overflow list instead of expanding an unbounded grid range.
 */
export class CoreV2EntityHitIndex {
  private readonly buckets: ReadonlyMap<string, readonly CoreV2EntityHitEntry[]>;
  private readonly overflow: readonly CoreV2EntityHitEntry[];
  private readonly cellSize: number;
  private readonly debugValue: CoreV2EntityHitIndexDebug;

  private constructor(
    buckets: ReadonlyMap<string, readonly CoreV2EntityHitEntry[]>,
    overflow: readonly CoreV2EntityHitEntry[],
    debug: CoreV2EntityHitIndexDebug,
  ) {
    this.buckets = buckets;
    this.overflow = overflow;
    this.cellSize = debug.cellSize;
    this.debugValue = Object.freeze(debug);
  }

  public static build(
    snapshot: SceneSnapshot,
    projection: CoreV2ProjectionIndex | null,
    staleProjectionIds: ReadonlySet<string> = new Set(),
    options: CoreV2EntityHitIndexOptions = {},
  ): CoreV2EntityHitIndex {
    const cellSize = options.cellSize ?? CORE_V2_ENTITY_HIT_CELL_SIZE;
    const maxCells = options.maxCellsPerEntity ?? CORE_V2_ENTITY_HIT_MAX_CELLS;
    if (cellSize !== 64 && cellSize !== 128) {
      throw new RangeError('Core v2 entity hit cellSize must be 64 or 128');
    }
    if (!Number.isSafeInteger(maxCells) || maxCells <= 0) {
      throw new RangeError('Core v2 entity hit maxCellsPerEntity must be a positive safe integer');
    }

    const mutableBuckets = new Map<string, CoreV2EntityHitEntry[]>();
    const overflow: CoreV2EntityHitEntry[] = [];
    let indexedEntityCount = 0;
    let bucketMembershipCount = 0;
    snapshot.entities.forEach((entity, order) => {
      if (entity.kind === 'relation') return;
      indexedEntityCount += 1;
      const entry = Object.freeze({ ref: entity.ref, order });
      const entityProjection = staleProjectionIds.has(entity.id)
        ? undefined
        : projection?.byEntityId[entity.id];
      const bounds = coreV2EntityWorldAabb(entity, entityProjection);
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
    return new CoreV2EntityHitIndex(
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

  public debugSnapshot(): CoreV2EntityHitIndexDebug {
    return this.debugValue;
  }
}

export function hitTestCoreV2EntityIndex(
  index: CoreV2EntityHitIndex,
  point: CorePoint,
  options: HitTestOptions,
  getEntity: (ref: EntityRef) => EntitySnapshot | null,
  projection: CoreV2ProjectionIndex | null,
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
    if (coreV2EntityContainsWorldPoint(entity, point, entityProjection)) return ref;
  }
  return null;
}

export function coreV2EntityContainsWorldPoint(
  entity: EntitySnapshot,
  point: CorePoint,
  projection?: CoreV2EntityProjection,
): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (projection?.contentOrientation === 'follow-item') {
    try {
      const local = applyCoreV2Affine(
        invertCoreV2Affine(projection.affine),
        Object.freeze([point.x, point.y] as CoreV2PointTuple),
      );
      return containsTuple(projection.localBounds, local);
    } catch {
      return false;
    }
  }
  return containsRotatedDenseEntity(entity, point);
}

export function coreV2EntityWorldAabb(
  entity: EntitySnapshot,
  projection?: CoreV2EntityProjection,
): readonly [number, number, number, number] | null {
  try {
    const points = projection?.contentOrientation === 'follow-item'
      ? coreV2AffineCorners(projection.affine, projection.localBounds)
      : denseEntityCorners(entity);
    return boundsForFinitePoints(points);
  } catch {
    return null;
  }
}

function denseEntityCorners(entity: EntitySnapshot): readonly CoreV2PointTuple[] {
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
): CoreV2PointTuple {
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  return Object.freeze([
    centerX + deltaX * cosine - deltaY * sine,
    centerY + deltaX * sine + deltaY * cosine,
  ]);
}

function boundsForFinitePoints(
  points: readonly CoreV2PointTuple[],
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

function boundedCellCoverage(
  bounds: readonly [number, number, number, number],
  cellSize: number,
  maxCells: number,
): Readonly<{
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
}> | null {
  const minColumn = Math.floor(bounds[0] / cellSize);
  const maxColumn = Math.floor((bounds[0] + bounds[2]) / cellSize);
  const minRow = Math.floor(bounds[1] / cellSize);
  const maxRow = Math.floor((bounds[1] + bounds[3]) / cellSize);
  if (![minColumn, maxColumn, minRow, maxRow].every(Number.isSafeInteger)) return null;
  const columns = maxColumn - minColumn + 1;
  const rows = maxRow - minRow + 1;
  if (columns <= 0 || rows <= 0 || columns > maxCells || rows > Math.floor(maxCells / columns)) {
    return null;
  }
  return Object.freeze({ minColumn, maxColumn, minRow, maxRow });
}

function mergeTopmostFirst(
  local: readonly CoreV2EntityHitEntry[],
  overflow: readonly CoreV2EntityHitEntry[],
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
  point: CoreV2PointTuple,
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

function cellKey(column: number, row: number): string {
  return `${column}:${row}`;
}
