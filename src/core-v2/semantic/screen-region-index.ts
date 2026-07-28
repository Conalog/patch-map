export const CORE_V2_SCREEN_REGION_CELL_SIZE = 128;
export const CORE_V2_SCREEN_REGION_MAX_CELLS_PER_GEOMETRY = 256;
export const CORE_V2_SCREEN_REGION_MAX_QUERY_CELLS = 4_096;

export type CoreV2ScreenRegionBounds =
  readonly [x: number, y: number, width: number, height: number];

export interface CoreV2ScreenRegionGeometry {
  readonly screenBounds?: CoreV2ScreenRegionBounds;
}

export interface CoreV2ScreenRegionCandidates<
  Entity extends CoreV2ScreenRegionGeometry,
  Relation extends CoreV2ScreenRegionGeometry,
> {
  readonly entities: readonly Entity[];
  readonly relations: readonly Relation[];
}

interface MutableBucket {
  readonly entityIndices: number[];
  readonly relationIndices: number[];
}

interface FrozenBucket {
  readonly entityIndices: readonly number[];
  readonly relationIndices: readonly number[];
}

/**
 * Screen-space broad phase for box and paint selection. Exact intersection
 * remains in the pointer-gesture authority; this index only removes geometry
 * that cannot intersect the requested screen bounds.
 */
export class CoreV2ScreenRegionIndex<
  Entity extends CoreV2ScreenRegionGeometry,
  Relation extends CoreV2ScreenRegionGeometry,
> {
  private readonly entities: readonly Entity[];
  private readonly relations: readonly Relation[];
  private readonly buckets: ReadonlyMap<string, FrozenBucket>;
  private readonly overflowEntityIndices: readonly number[];
  private readonly overflowRelationIndices: readonly number[];

  private constructor(
    entities: readonly Entity[],
    relations: readonly Relation[],
    buckets: ReadonlyMap<string, FrozenBucket>,
    overflowEntityIndices: readonly number[],
    overflowRelationIndices: readonly number[],
  ) {
    this.entities = entities;
    this.relations = relations;
    this.buckets = buckets;
    this.overflowEntityIndices = overflowEntityIndices;
    this.overflowRelationIndices = overflowRelationIndices;
  }

  public static build<
    Entity extends CoreV2ScreenRegionGeometry,
    Relation extends CoreV2ScreenRegionGeometry,
  >(
    entities: readonly Entity[],
    relations: readonly Relation[],
  ): CoreV2ScreenRegionIndex<Entity, Relation> {
    const buckets = new Map<string, MutableBucket>();
    const overflowEntityIndices: number[] = [];
    const overflowRelationIndices: number[] = [];
    entities.forEach((entity, index) => {
      addGeometryToBuckets(
        buckets,
        entity.screenBounds,
        'entityIndices',
        index,
        overflowEntityIndices,
      );
    });
    relations.forEach((relation, index) => {
      addGeometryToBuckets(
        buckets,
        relation.screenBounds,
        'relationIndices',
        index,
        overflowRelationIndices,
      );
    });
    return new CoreV2ScreenRegionIndex(
      entities,
      relations,
      new Map([...buckets].map(([key, bucket]) => [
        key,
        Object.freeze({
          entityIndices: Object.freeze(bucket.entityIndices),
          relationIndices: Object.freeze(bucket.relationIndices),
        }),
      ])),
      Object.freeze(overflowEntityIndices),
      Object.freeze(overflowRelationIndices),
    );
  }

  public query(
    bounds: CoreV2ScreenRegionBounds,
  ): CoreV2ScreenRegionCandidates<Entity, Relation> {
    const coverage = boundedCellCoverage(
      bounds,
      CORE_V2_SCREEN_REGION_CELL_SIZE,
      CORE_V2_SCREEN_REGION_MAX_QUERY_CELLS,
    );
    if (coverage === null) {
      return Object.freeze({
        entities: this.entities,
        relations: this.relations,
      });
    }
    const entityIndices = new Set(this.overflowEntityIndices);
    const relationIndices = new Set(this.overflowRelationIndices);
    for (let row = coverage.minRow; row <= coverage.maxRow; row += 1) {
      for (let column = coverage.minColumn; column <= coverage.maxColumn; column += 1) {
        const bucket = this.buckets.get(cellKey(column, row));
        if (bucket === undefined) continue;
        for (const index of bucket.entityIndices) entityIndices.add(index);
        for (const index of bucket.relationIndices) relationIndices.add(index);
      }
    }
    return Object.freeze({
      entities: Object.freeze(
        [...entityIndices].sort(numberAscending).map((index) => this.entities[index]!),
      ),
      relations: Object.freeze(
        [...relationIndices].sort(numberAscending).map((index) => this.relations[index]!),
      ),
    });
  }
}

function addGeometryToBuckets(
  buckets: Map<string, MutableBucket>,
  bounds: CoreV2ScreenRegionBounds | undefined,
  channel: keyof MutableBucket,
  index: number,
  overflow: number[],
): void {
  const coverage = bounds === undefined
    ? null
    : boundedCellCoverage(
        bounds,
        CORE_V2_SCREEN_REGION_CELL_SIZE,
        CORE_V2_SCREEN_REGION_MAX_CELLS_PER_GEOMETRY,
      );
  if (coverage === null) {
    overflow.push(index);
    return;
  }
  for (let row = coverage.minRow; row <= coverage.maxRow; row += 1) {
    for (let column = coverage.minColumn; column <= coverage.maxColumn; column += 1) {
      const key = cellKey(column, row);
      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = { entityIndices: [], relationIndices: [] };
        buckets.set(key, bucket);
      }
      bucket[channel].push(index);
    }
  }
}

function boundedCellCoverage(
  bounds: CoreV2ScreenRegionBounds,
  cellSize: number,
  maxCells: number,
): Readonly<{
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
}> | null {
  if (
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite) ||
    bounds[2] < 0 ||
    bounds[3] < 0
  ) {
    return null;
  }
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

function cellKey(column: number, row: number): string {
  return `${column}:${row}`;
}

function numberAscending(left: number, right: number): number {
  return left - right;
}
