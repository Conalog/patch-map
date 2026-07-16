import { CoreV2DatasetError } from './dataset';
import type {
  CoreV2Edges,
  CoreV2FixedSize,
  CoreV2GridElement,
  CoreV2GridItemTemplate,
} from './dataset';

export type CoreV2ContentBox = readonly [x: number, y: number, width: number, height: number];
export type CoreV2LocalPoint = readonly [x: number, y: number];
export type CoreV2LocalBounds = readonly [x: number, y: number, width: number, height: number];
export type CoreV2GridCellValue = 0 | 1 | string;

export interface CoreV2ResolvedSize {
  readonly width: number;
  readonly height: number;
}

export interface CoreV2MaterializedGridCell {
  readonly id: string;
  readonly row: number;
  readonly column: number;
  readonly value: CoreV2GridCellValue;
  readonly label?: string;
  readonly active: boolean;
  readonly visible: boolean;
  readonly logicalCount: 1;
  readonly localPosition: CoreV2LocalPoint;
}

export interface CoreV2GridLayout {
  /** A detached, deeply frozen snapshot used to derive deterministic grid updates. */
  readonly source: CoreV2GridElement;
  readonly id: string;
  readonly inactiveCellStrategy: 'destroy' | 'hide';
  readonly itemTemplate: CoreV2GridItemTemplate;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly cells: readonly CoreV2MaterializedGridCell[];
  readonly cellsById: Readonly<Record<string, CoreV2MaterializedGridCell>>;
  readonly activeIds: readonly string[];
  readonly logicalIds: readonly string[];
  readonly localBounds: CoreV2LocalBounds;
  readonly identityCollisionCount: number;
  readonly finiteValueCount: number;
}

const UNSIGNED_NUMBER_SOURCE = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const SIGNED_NUMBER_SOURCE = String.raw`[+-]?${UNSIGNED_NUMBER_SOURCE}`;
const PERCENTAGE_PATTERN = new RegExp(`^(${SIGNED_NUMBER_SOURCE})%$`);
const CALC_PERCENT_FIRST_PATTERN = new RegExp(
  `^(${SIGNED_NUMBER_SOURCE})%\\s*([+-])\\s*(${UNSIGNED_NUMBER_SOURCE})px$`,
);
const CALC_PIXEL_FIRST_PATTERN = new RegExp(
  `^(${SIGNED_NUMBER_SOURCE})px\\s*([+-])\\s*(${UNSIGNED_NUMBER_SOURCE})%$`,
);

export function resolveCoreV2Dimension(
  dimension: unknown,
  available: number,
  path = '$',
): number {
  assertFiniteNonNegative(available, `${path}.$available`, 'available dimension');

  let resolved: number;
  if (typeof dimension === 'number') {
    resolved = dimension;
  } else if (typeof dimension === 'string') {
    resolved = resolveStringDimension(dimension, available, path);
  } else if (isRecord(dimension)) {
    assertExactKeys(dimension, new Set(['value', 'unit']), path);
    const value = dimension.value;
    const unit = dimension.unit;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      invalid(`${path}.value`, 'dimension value must be finite');
    }
    if (unit !== 'px' && unit !== '%') {
      invalid(`${path}.unit`, 'dimension unit must be px or %');
    }
    resolved = unit === '%' ? (available * value) / 100 : value;
  } else {
    invalid(path, 'dimension must be a number, percentage, unit object, or supported calc()');
  }

  assertFiniteNonNegative(resolved, path, 'resolved dimension');
  return resolved;
}

export function resolveCoreV2ComponentSize(
  size: unknown,
  available: CoreV2FixedSize,
  path = '$',
): CoreV2ResolvedSize {
  assertFiniteNonNegative(available.width, `${path}.$available.width`, 'available width');
  assertFiniteNonNegative(available.height, `${path}.$available.height`, 'available height');

  let width: number;
  let height: number;
  if (isRecord(size) && (hasOwn(size, 'width') || hasOwn(size, 'height'))) {
    assertExactKeys(size, new Set(['width', 'height']), path);
    if (!hasOwn(size, 'width')) {
      invalid(`${path}.width`, 'component size requires both width and height');
    }
    if (!hasOwn(size, 'height')) {
      invalid(`${path}.height`, 'component size requires both width and height');
    }
    width = resolveCoreV2Dimension(size.width, available.width, `${path}.width`);
    height = resolveCoreV2Dimension(size.height, available.height, `${path}.height`);
  } else {
    width = resolveCoreV2Dimension(size, available.width, path);
    height = resolveCoreV2Dimension(size, available.height, path);
  }

  return freezeTree({ width, height });
}

export function resolveCoreV2ContentBox(
  size: CoreV2FixedSize,
  padding: CoreV2Edges,
  path = '$',
): CoreV2ContentBox {
  assertFiniteNonNegative(size.width, `${path}.size.width`, 'item width');
  assertFiniteNonNegative(size.height, `${path}.size.height`, 'item height');
  assertFinite(padding.top, `${path}.padding.top`, 'padding');
  assertFinite(padding.right, `${path}.padding.right`, 'padding');
  assertFinite(padding.bottom, `${path}.padding.bottom`, 'padding');
  assertFinite(padding.left, `${path}.padding.left`, 'padding');

  const width = size.width - padding.left - padding.right;
  const height = size.height - padding.top - padding.bottom;
  assertFiniteNonNegative(width, `${path}.contentBox.width`, 'content-box width');
  assertFiniteNonNegative(height, `${path}.contentBox.height`, 'content-box height');

  return freezeTree([padding.left, padding.top, width, height] as CoreV2ContentBox);
}

export function materializeCoreV2Grid(
  grid: CoreV2GridElement,
  path = '$',
): CoreV2GridLayout {
  validateGridGeometry(grid, path);
  const source = freezeTree(cloneTree(grid));
  const cells: CoreV2MaterializedGridCell[] = [];
  const cellsById: Record<string, CoreV2MaterializedGridCell> = Object.create(null) as Record<
    string,
    CoreV2MaterializedGridCell
  >;
  const activeIds: string[] = [];
  const logicalIds: string[] = [];
  const identitySet = new Set<string>();
  let identityCollisionCount = 0;

  let columnCount = 0;
  for (let row = 0; row < source.cells.length; row += 1) {
    const rowValues = source.cells[row];
    if (rowValues === undefined) {
      invalid(`${path}.cells[${row}]`, 'grid row is missing');
    }
    columnCount = Math.max(columnCount, rowValues.length);

    for (let column = 0; column < rowValues.length; column += 1) {
      const value = rowValues[column];
      assertGridCellValue(value, `${path}.cells[${row}][${column}]`);
      const active = value !== 0;
      const id = `${source.id}.${row}.${column}`;
      if (identitySet.has(id)) {
        identityCollisionCount += 1;
      }
      identitySet.add(id);
      if (active) {
        activeIds.push(id);
      }
      if (!active && source.inactiveCellStrategy === 'destroy') {
        continue;
      }

      const localPosition = freezeTree([
        column * (source.item.size.width + source.gap.x),
        row * (source.item.size.height + source.gap.y),
      ] as CoreV2LocalPoint);
      const cell = freezeTree<CoreV2MaterializedGridCell>({
        id,
        row,
        column,
        value,
        ...(typeof value === 'string' ? { label: value } : {}),
        active,
        visible: active && source.show,
        logicalCount: 1,
        localPosition,
      });
      cells.push(cell);
      cellsById[id] = cell;
      logicalIds.push(id);
    }
  }

  const rowCount = source.cells.length;
  const localBounds = calculateGridBounds(source, rowCount, columnCount);
  const finiteValueCount = localBounds.length + cells.length * 2;
  const layout: CoreV2GridLayout = {
    source,
    id: source.id,
    inactiveCellStrategy: source.inactiveCellStrategy,
    itemTemplate: source.item,
    rowCount,
    columnCount,
    cells,
    cellsById,
    activeIds,
    logicalIds,
    localBounds,
    identityCollisionCount,
    finiteValueCount,
  };
  return freezeTree(layout);
}

export function setCoreV2GridCell(
  layout: CoreV2GridLayout,
  row: number,
  column: number,
  value: CoreV2GridCellValue,
  path = '$',
): CoreV2GridLayout {
  assertSafeIndex(row, `${path}.row`);
  assertSafeIndex(column, `${path}.column`);
  assertGridCellValue(value, `${path}.value`);

  const targetRow = layout.source.cells[row];
  if (targetRow === undefined || column >= targetRow.length) {
    invalid(`${path}.cells[${row}][${column}]`, 'grid cell coordinate is outside the matrix');
  }

  const cells = layout.source.cells.map((currentRow, currentRowIndex) =>
    currentRow.map((currentValue, currentColumnIndex) =>
      currentRowIndex === row && currentColumnIndex === column ? value : currentValue,
    ),
  );
  const source: CoreV2GridElement = { ...layout.source, cells };
  return materializeCoreV2Grid(source, path);
}

function resolveStringDimension(value: string, available: number, path: string): number {
  const percentageMatch = PERCENTAGE_PATTERN.exec(value);
  if (percentageMatch !== null) {
    return (available * Number(percentageMatch[1])) / 100;
  }

  if (!value.startsWith('calc(') || !value.endsWith(')')) {
    invalid(path, 'dimension string must be a percentage or supported calc()');
  }
  const expression = value.slice(5, -1).trim();
  const percentFirst = CALC_PERCENT_FIRST_PATTERN.exec(expression);
  if (percentFirst !== null) {
    const percentage = (available * Number(percentFirst[1])) / 100;
    const pixels = Number(percentFirst[3]);
    return percentFirst[2] === '+' ? percentage + pixels : percentage - pixels;
  }
  const pixelFirst = CALC_PIXEL_FIRST_PATTERN.exec(expression);
  if (pixelFirst !== null) {
    const pixels = Number(pixelFirst[1]);
    const percentage = (available * Number(pixelFirst[3])) / 100;
    return pixelFirst[2] === '+' ? pixels + percentage : pixels - percentage;
  }
  invalid(path, 'calc() supports exactly one percentage and one px term');
}

function validateGridGeometry(grid: CoreV2GridElement, path: string): void {
  if (grid.id.length === 0) {
    invalid(`${path}.id`, 'grid id must not be empty');
  }
  if (!Array.isArray(grid.cells)) {
    invalid(`${path}.cells`, 'grid cells must be a matrix');
  }
  assertFiniteNonNegative(grid.item.size.width, `${path}.item.size.width`, 'grid item width');
  assertFiniteNonNegative(grid.item.size.height, `${path}.item.size.height`, 'grid item height');
  assertFiniteNonNegative(grid.gap.x, `${path}.gap.x`, 'grid horizontal gap');
  assertFiniteNonNegative(grid.gap.y, `${path}.gap.y`, 'grid vertical gap');
}

function calculateGridBounds(
  grid: CoreV2GridElement,
  rowCount: number,
  columnCount: number,
): CoreV2LocalBounds {
  if (rowCount === 0 || columnCount === 0) {
    return freezeTree([0, 0, 0, 0] as CoreV2LocalBounds);
  }
  const width = columnCount * grid.item.size.width + (columnCount - 1) * grid.gap.x;
  const height = rowCount * grid.item.size.height + (rowCount - 1) * grid.gap.y;
  assertFiniteNonNegative(width, '$.localBounds.width', 'grid bounds width');
  assertFiniteNonNegative(height, '$.localBounds.height', 'grid bounds height');
  return freezeTree([0, 0, width, height] as CoreV2LocalBounds);
}

function assertGridCellValue(value: unknown, path: string): asserts value is CoreV2GridCellValue {
  if (value !== 0 && value !== 1 && typeof value !== 'string') {
    invalid(path, 'grid cell must be 0, 1, or a string label');
  }
}

function assertSafeIndex(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid(path, 'grid coordinate must be a non-negative safe integer');
  }
}

function assertFinite(value: number, path: string, label: string): void {
  if (!Number.isFinite(value)) {
    invalid(path, `${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, path: string, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    invalid(path, `${label} must be finite and non-negative`);
  }
}

function assertExactKeys(value: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    invalid(`${path}.${unexpected}`, 'field is not accepted by this dimension form');
  }
}

function hasOwn(value: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneTree<T>(value: T): T {
  if (Array.isArray(value)) {
    const entries = value as readonly unknown[];
    return entries.map((entry) => cloneTree(entry)) as T;
  }
  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneTree(entry);
    }
    return clone as T;
  }
  return value;
}

function freezeTree<T>(value: T): T {
  if ((Array.isArray(value) || isRecord(value)) && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) {
      freezeTree(entry);
    }
    Object.freeze(value);
  }
  return value;
}

function invalid(path: string, detail: string): never {
  throw new CoreV2DatasetError('INVALID_VALUE', path, detail);
}
