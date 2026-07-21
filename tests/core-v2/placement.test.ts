import catalogTypedCases from '../../docs/reference/core-v2-functional-contract/evidence/catalog-typed-cases.v1.json';
import { describe, expect, it } from 'vitest';

import { parsePatchMapV010 } from '../../src/core-v2/parser';
import type {
  CoreV2DatasetError,
  CoreV2Edges,
  CoreV2Placement,
} from '../../src/core-v2/semantic/dataset';
import { resolveCoreV2ContentBox } from '../../src/core-v2/semantic/layout';
import {
  resolveCoreV2PlacementBounds,
  type CoreV2PlacementBounds,
  type CoreV2PlacementReference,
} from '../../src/core-v2/semantic/placement';

interface PlacementObservation {
  readonly localBounds: readonly [number, number, number, number];
  readonly worldBounds: readonly [number, number, number, number];
}

interface Lay002Params {
  readonly item: Readonly<{
    size: readonly [number, number];
    padding: CoreV2Edges;
  }>;
  readonly componentSize: readonly [number, number];
  readonly margin: CoreV2Edges;
  readonly placements: readonly CoreV2Placement[];
  readonly placementMatrix: Readonly<Record<CoreV2Placement, PlacementObservation>>;
}

const lay002 = getCaseParams<Lay002Params>('LAY-002');
const [itemWidth, itemHeight] = lay002.item.size;
const [componentWidth, componentHeight] = lay002.componentSize;
const contentTuple = resolveCoreV2ContentBox(
  { width: itemWidth, height: itemHeight },
  lay002.item.padding,
  '$.LAY-002.item',
);
const reference: CoreV2PlacementReference = Object.freeze({
  x: contentTuple[0],
  y: contentTuple[1],
  width: contentTuple[2],
  height: contentTuple[3],
});
const componentSize = Object.freeze({ width: componentWidth, height: componentHeight });
const ITEM_WORLD_ORIGIN = Object.freeze([10, 20] as const);

describe('Core v2 LAY-002 semantic placement', () => {
  it('resolves the exact approved local and world matrix for every placement', () => {
    for (const placement of lay002.placements) {
      const bounds = resolveCoreV2PlacementBounds(
        reference,
        componentSize,
        placement,
        lay002.margin,
        `$.LAY-002.placements.${placement}`,
      );
      const expected = lay002.placementMatrix[placement];

      expect(tuple(bounds), placement).toEqual(expected.localBounds);
      expect([
        bounds.x + ITEM_WORLD_ORIGIN[0],
        bounds.y + ITEM_WORLD_ORIGIN[1],
        bounds.width,
        bounds.height,
      ], placement).toEqual(expected.worldBounds);
      expect(Object.isFrozen(bounds), placement).toBe(true);
    }
  });

  it('applies margins only on named edges and keeps centered axes in the content frame', () => {
    expect(tuple(resolve('left'))).toEqual([26, 32, 30, 10]);
    expect(tuple(resolve('top'))).toEqual([38, 10, 30, 10]);
    expect(tuple(resolve('right-bottom'))).toEqual([54, 50, 30, 10]);
    expect(tuple(resolve('center'))).toEqual([38, 32, 30, 10]);
  });

  it('keeps none distinct by bypassing the padded reference origin and all margins', () => {
    const none = resolve('none');

    expect(reference).toEqual({ x: 17, y: 7, width: 72, height: 60 });
    expect(lay002.margin).toEqual({ top: 3, right: 5, bottom: 7, left: 9 });
    expect(tuple(none)).toEqual([0, 0, 30, 10]);
  });

  it('fails closed for unsupported, non-finite, negative-size, and overflowing profiles', () => {
    expectInvalidValue(
      () => resolveCoreV2PlacementBounds(
        reference,
        componentSize,
        'diagonal' as CoreV2Placement,
        lay002.margin,
        '$.invalid-placement',
      ),
      '$.invalid-placement.placement',
    );
    expectInvalidValue(
      () => resolveCoreV2PlacementBounds(
        { ...reference, x: Number.NaN },
        componentSize,
        'center',
        lay002.margin,
        '$.non-finite',
      ),
      '$.non-finite.reference.x',
    );
    expectInvalidValue(
      () => resolveCoreV2PlacementBounds(
        reference,
        { ...componentSize, width: -1 },
        'center',
        lay002.margin,
        '$.negative-size',
      ),
      '$.negative-size.size.width',
    );
    expectInvalidValue(
      () => resolveCoreV2PlacementBounds(
        reference,
        componentSize,
        'center',
        { ...lay002.margin, bottom: Number.POSITIVE_INFINITY },
        '$.non-finite-margin',
      ),
      '$.non-finite-margin.margin.bottom',
    );
    expectInvalidValue(
      () => resolveCoreV2PlacementBounds(
        { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 10 },
        { width: 0, height: 0 },
        'center',
        { top: 0, right: 0, bottom: 0, left: 0 },
        '$.overflow',
      ),
      '$.overflow.result.x',
    );
  });

  it('is deterministic, immutable, and does not mutate caller-owned inputs', () => {
    const callerReference = { ...reference };
    const callerSize = { ...componentSize };
    const callerMargin = { ...lay002.margin };
    const before = structuredClone({ callerReference, callerSize, callerMargin });

    const first = resolveCoreV2PlacementBounds(
      callerReference,
      callerSize,
      'right-top',
      callerMargin,
    );
    const second = resolveCoreV2PlacementBounds(
      callerReference,
      callerSize,
      'right-top',
      callerMargin,
    );

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect({ callerReference, callerSize, callerMargin }).toEqual(before);
    expect(Object.isFrozen(callerReference)).toBe(false);
    expect(Object.isFrozen(callerSize)).toBe(false);
    expect(Object.isFrozen(callerMargin)).toBe(false);
  });

  it('keeps the parser projection consumer in parity with the pure resolver', () => {
    const input = [{
      type: 'item',
      id: 'item',
      size: { width: itemWidth, height: itemHeight },
      padding: lay002.item.padding,
      attrs: { x: ITEM_WORLD_ORIGIN[0], y: ITEM_WORLD_ORIGIN[1] },
      components: lay002.placements.map((placement) => ({
        type: 'bar',
        id: placement,
        source: { type: 'rect', fill: '#336699' },
        size: { width: componentWidth, height: componentHeight },
        placement,
        margin: lay002.margin,
      })),
    }];
    const before = structuredClone(input);
    const parsed = parsePatchMapV010(input);

    for (const placement of lay002.placements) {
      const id = `item::bar:${placement}`;
      const entity = parsed.document.entities.find((candidate) => candidate.id === id);
      const projection = parsed.projection.byEntityId[id];
      const expected = lay002.placementMatrix[placement];
      if (entity?.kind !== 'bar' || projection === undefined) {
        throw new Error(`Missing parsed LAY-002 bar ${id}`);
      }

      expect([entity.x, entity.y, entity.width, entity.height], placement).toEqual(
        expected.worldBounds,
      );
      expect(projection.visibleCenter, placement).toEqual([
        expected.worldBounds[0] + componentWidth / 2,
        expected.worldBounds[1] + componentHeight / 2,
      ]);
    }
    expect(input).toEqual(before);
  });
});

function resolve(placement: CoreV2Placement): CoreV2PlacementBounds {
  return resolveCoreV2PlacementBounds(reference, componentSize, placement, lay002.margin);
}

function tuple(bounds: CoreV2PlacementBounds): readonly [number, number, number, number] {
  return [bounds.x, bounds.y, bounds.width, bounds.height];
}

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

function expectInvalidValue(operation: () => unknown, datasetPath: string): void {
  expect(operation).toThrowError(
    expect.objectContaining<Partial<CoreV2DatasetError>>({
      category: 'INVALID_INPUT',
      code: 'INVALID_VALUE',
      datasetPath,
    }),
  );
}
