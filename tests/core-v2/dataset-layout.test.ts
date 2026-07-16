import catalogTypedCases from '../../docs/reference/core-v2-functional-contract/evidence/catalog-typed-cases.v1.json';
import { describe, expect, it } from 'vitest';

import type {
  CoreV2DatasetError,
  CoreV2GridElement,
} from '../../src/core-v2/semantic/dataset';
import {
  materializeCoreV2Grid,
  resolveCoreV2ComponentSize,
  resolveCoreV2ContentBox,
  resolveCoreV2Dimension,
  setCoreV2GridCell,
} from '../../src/core-v2/semantic/layout';
import type {
  CoreV2GridCellValue,
  CoreV2GridLayout,
  CoreV2MaterializedGridCell,
} from '../../src/core-v2/semantic/layout';

interface Dat003Params {
  readonly itemSize: readonly [number, number];
  readonly padding: Readonly<{ x: number; y: number; top: number }>;
  readonly componentSizes: readonly unknown[];
}

interface GridFixture {
  readonly id: string;
  readonly cells: readonly (readonly CoreV2GridCellValue[])[];
  readonly itemSize: readonly [number, number];
  readonly gap: readonly [number, number];
  readonly padding: number;
  readonly inactiveCellStrategy: 'destroy' | 'hide';
}

interface Dat005Params {
  readonly grid: GridFixture;
  readonly edgeMatrices: Readonly<{
    ragged: readonly (readonly CoreV2GridCellValue[])[];
    empty: readonly (readonly CoreV2GridCellValue[])[];
    duplicateLabels: readonly (readonly CoreV2GridCellValue[])[];
  }>;
}

const dat003 = getCaseParams<Dat003Params>('DAT-003');
const dat005 = getCaseParams<Dat005Params>('DAT-005');

describe('Core v2 DAT-003 semantic dimensions', () => {
  it('resolves the approved padded content box and equivalent dimension forms', () => {
    const [width, height] = dat003.itemSize;
    const contentBox = resolveCoreV2ContentBox(
      { width, height },
      {
        top: dat003.padding.top,
        right: dat003.padding.x,
        bottom: dat003.padding.y,
        left: dat003.padding.x,
      },
      '$.item-size-matrix',
    );
    const available = { width: contentBox[2], height: contentBox[3] };
    const numeric = resolveCoreV2ComponentSize(
      requireAt(dat003.componentSizes, 0),
      available,
      '$.components.numeric',
    );
    const percentageString = resolveCoreV2ComponentSize(
      requireAt(dat003.componentSizes, 1),
      available,
      '$.components.pct-string',
    );
    const percentageObject = resolveCoreV2ComponentSize(
      requireAt(dat003.componentSizes, 2),
      available,
      '$.components.pct-object',
    );
    const calc = resolveCoreV2ComponentSize(
      requireAt(dat003.componentSizes, 3),
      available,
      '$.components.calc',
    );

    expect(contentBox).toEqual([10, 7, 180, 88]);
    expect(numeric.width).toBe(100);
    expect(percentageString.width).toBe(90);
    expect(percentageObject.width).toBe(90);
    expect(calc.width).toBe(160);
    expect(percentageString).toEqual(percentageObject);
    expect(Object.isFrozen(contentBox)).toBe(true);
    expect(Object.isFrozen(calc)).toBe(true);
    expect(allNumbersAreFinite({ contentBox, numeric, percentageString, percentageObject, calc })).toBe(
      true,
    );
  });

  it('accepts only the bounded numeric, percentage, unit-object, and calc grammar', () => {
    expect(resolveCoreV2Dimension(12, 200)).toBe(12);
    expect(resolveCoreV2Dimension('25%', 200)).toBe(50);
    expect(resolveCoreV2Dimension({ value: 25, unit: '%' }, 200)).toBe(50);
    expect(resolveCoreV2Dimension({ value: 12, unit: 'px' }, 200)).toBe(12);
    expect(resolveCoreV2Dimension('calc(50% + 12px)', 200)).toBe(112);
    expect(resolveCoreV2Dimension('calc(12px + 50%)', 200)).toBe(112);

    expectInvalidValue(() => resolveCoreV2Dimension('12', 200, '$.numeric-string'), '$.numeric-string');
    expectInvalidValue(() => resolveCoreV2Dimension('12px', 200, '$.px-string'), '$.px-string');
    expectInvalidValue(
      () => resolveCoreV2Dimension('calc(100% - 10px + 2px)', 200, '$.multi-calc'),
      '$.multi-calc',
    );
  });

  it('rejects partial and non-finite size values with path-aware INVALID_VALUE diagnostics', () => {
    expectInvalidValue(
      () =>
        resolveCoreV2ComponentSize(
          { width: 10 },
          { width: 180, height: 88 },
          '$.validation.partial-size',
        ),
      '$.validation.partial-size.height',
    );
    expectInvalidValue(
      () =>
        resolveCoreV2ComponentSize(
          { width: 'Infinity', height: 10 },
          { width: 180, height: 88 },
          '$.validation.non-finite',
        ),
      '$.validation.non-finite.width',
    );
  });
});

describe('Core v2 DAT-005 deterministic grid materialization', () => {
  it('uses row and column identity with the approved positions and labels', () => {
    const input = makeGrid(dat005.grid);
    const before = JSON.stringify(input);
    const layout = materializeCoreV2Grid(input, '$.grid');

    expect(layout.activeIds).toEqual(['grid.0.0', 'grid.0.2', 'grid.1.0', 'grid.1.1']);
    expect(requireCell(layout, 'grid.0.2').label).toBe('B');
    expect(requireCell(layout, 'grid.1.0').localPosition).toEqual([0, 13]);
    expect(requireCell(layout, 'grid.0.2').localPosition).toEqual([44, 0]);
    expect(layout.identityCollisionCount).toBe(0);
    expect(allNumbersAreFinite(layout)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(layout.source).not.toBe(input);
    expect(layout.itemTemplate).not.toBe(input.item);
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.source.cells)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('keeps hidden cells logical across activation and deactivation', () => {
    const initial = materializeCoreV2Grid(makeGrid(dat005.grid));
    const hidden = requireCell(initial, 'grid.0.1');
    const activated = setCoreV2GridCell(initial, 0, 1, 1);
    const deactivated = setCoreV2GridCell(activated, 0, 1, 0);

    expect(hidden.visible).toBe(false);
    expect(requireCell(activated, 'grid.0.1').visible).toBe(true);
    expect(requireCell(deactivated, 'grid.0.1')).toMatchObject({
      id: 'grid.0.1',
      visible: false,
      logicalCount: 1,
    });
    expect(deactivated.logicalIds.filter((id) => id === 'grid.0.1')).toHaveLength(1);
  });

  it('destroys inactive logical cells while preserving their deterministic identity on recreation', () => {
    const destroyInput = makeGrid({ ...dat005.grid, inactiveCellStrategy: 'destroy' });
    const initial = materializeCoreV2Grid(destroyInput);
    const activated = setCoreV2GridCell(initial, 0, 1, 1);
    const deactivated = setCoreV2GridCell(activated, 0, 1, 0);

    expect(initial.cellsById['grid.0.1']).toBeUndefined();
    expect(requireCell(activated, 'grid.0.1').id).toBe('grid.0.1');
    expect(deactivated.cellsById['grid.0.1']).toBeUndefined();
    expect(deactivated.logicalIds).not.toContain('grid.0.1');
  });

  it('handles ragged, empty, and duplicate-label matrices without padding or identity collisions', () => {
    const ragged = materializeCoreV2Grid(
      makeGrid({ ...dat005.grid, cells: dat005.edgeMatrices.ragged }),
    );
    const empty = materializeCoreV2Grid(
      makeGrid({ ...dat005.grid, cells: dat005.edgeMatrices.empty }),
    );
    const duplicateLabels = materializeCoreV2Grid(
      makeGrid({ ...dat005.grid, cells: dat005.edgeMatrices.duplicateLabels }),
    );

    expect(ragged.activeIds).toEqual(['grid.0.0', 'grid.0.2', 'grid.1.0']);
    expect(ragged.activeIds.map((id) => requireCell(ragged, id).localPosition)).toEqual([
      [0, 0],
      [44, 0],
      [0, 13],
    ]);
    expect(empty.activeIds).toEqual([]);
    expect(empty.localBounds).toEqual([0, 0, 0, 0]);
    expect(duplicateLabels.cells.map((cell) => cell.id)).toEqual(['grid.0.0', 'grid.0.1']);
    expect(duplicateLabels.cells.map((cell) => cell.label)).toEqual(['A', 'A']);
    expect(duplicateLabels.identityCollisionCount).toBe(0);
  });
});

function getCaseParams<T>(id: string): T {
  const cases = catalogTypedCases.cases as readonly Readonly<{
    id: string;
    fixture: Readonly<{ params: unknown }>;
  }>[];
  const selected = cases.find((entry) => entry.id === id);
  if (selected === undefined) {
    throw new Error(`Missing approved case ${id}`);
  }
  return selected.fixture.params as T;
}

function makeGrid(fixture: GridFixture): CoreV2GridElement {
  const [width, height] = fixture.itemSize;
  const [x, y] = fixture.gap;
  return {
    type: 'grid',
    id: fixture.id,
    show: true,
    locked: false,
    cells: fixture.cells,
    item: {
      size: { width, height },
      components: [],
      padding: {
        top: fixture.padding,
        right: fixture.padding,
        bottom: fixture.padding,
        left: fixture.padding,
      },
      contentOrientation: 'upright',
    },
    inactiveCellStrategy: fixture.inactiveCellStrategy,
    gap: { x, y },
  };
}

function requireCell(layout: CoreV2GridLayout, id: string): CoreV2MaterializedGridCell {
  const cell = layout.cellsById[id];
  if (cell === undefined) {
    throw new Error(`Missing materialized cell ${id}`);
  }
  return cell;
}

function requireAt(values: readonly unknown[], index: number): unknown {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing fixture value at index ${index}`);
  }
  return value;
}

function expectInvalidValue(operation: () => unknown, datasetPath: string): void {
  expect(operation).toThrowError(
    expect.objectContaining<Partial<CoreV2DatasetError>>({
      category: 'INVALID_INPUT',
      code: 'INVALID_VALUE',
      datasetPath,
    }),
  );
}

function allNumbersAreFinite(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((entry) => allNumbersAreFinite(entry));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).every((entry) => allNumbersAreFinite(entry));
  }
  return true;
}
