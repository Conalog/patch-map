export type PatchMapSpatialBounds =
  readonly [x: number, y: number, width: number, height: number];

export interface PatchMapSpatialCellCoverage {
  readonly minColumn: number;
  readonly maxColumn: number;
  readonly minRow: number;
  readonly maxRow: number;
}

/**
 * Resolve a bounded grid range without allowing invalid or oversized geometry
 * to expand an unbounded number of buckets.
 */
export function boundedSpatialCellCoverage(
  bounds: PatchMapSpatialBounds,
  cellSize: number,
  maxCells: number,
): Readonly<PatchMapSpatialCellCoverage> | null {
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

export function spatialCellKey(column: number, row: number): string {
  return `${column}:${row}`;
}
