import {
  boundedSpatialCellCoverage as boundedCellCoverage,
  spatialCellKey as cellKey,
} from './spatial-grid';

const PATCH_MAP_SCREEN_REGION_CELL_SIZE = 128;
const PATCH_MAP_SCREEN_REGION_MAX_CELLS_PER_GEOMETRY = 256;
const PATCH_MAP_SCREEN_REGION_MAX_QUERY_CELLS = 4_096;

export type PatchMapScreenRegionBounds =
  readonly [x: number, y: number, width: number, height: number];

export interface PatchMapScreenRegionGeometry {
  readonly screenBounds?: PatchMapScreenRegionBounds;
}

export interface PatchMapScreenRegionCandidates<
  Entity extends PatchMapScreenRegionGeometry,
  Relation extends PatchMapScreenRegionGeometry,
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
export class PatchMapScreenRegionIndex<
  Entity extends PatchMapScreenRegionGeometry,
  Relation extends PatchMapScreenRegionGeometry,
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
    Entity extends PatchMapScreenRegionGeometry,
    Relation extends PatchMapScreenRegionGeometry,
  >(
    entities: readonly Entity[],
    relations: readonly Relation[],
  ): PatchMapScreenRegionIndex<Entity, Relation> {
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
    return new PatchMapScreenRegionIndex(
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
    bounds: PatchMapScreenRegionBounds,
  ): PatchMapScreenRegionCandidates<Entity, Relation> {
    const coverage = boundedCellCoverage(
      bounds,
      PATCH_MAP_SCREEN_REGION_CELL_SIZE,
      PATCH_MAP_SCREEN_REGION_MAX_QUERY_CELLS,
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
  bounds: PatchMapScreenRegionBounds | undefined,
  channel: keyof MutableBucket,
  index: number,
  overflow: number[],
): void {
  const coverage = bounds === undefined
    ? null
    : boundedCellCoverage(
        bounds,
        PATCH_MAP_SCREEN_REGION_CELL_SIZE,
        PATCH_MAP_SCREEN_REGION_MAX_CELLS_PER_GEOMETRY,
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

function numberAscending(left: number, right: number): number {
  return left - right;
}
