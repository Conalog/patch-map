import catalogTypedCases from '../../contracts/evidence/catalog-typed-cases.v1.json';
import { describe, expect, it } from 'vitest';

import { parsePatchMap } from '../../src/parsing';
import type {
  PatchMapDatasetError,
  PatchMapEdges,
  PatchMapPlacement,
} from '../../src/semantic/dataset';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import { resolvePatchMapContentBox } from '../../src/semantic/layout';
import {
  resolvePatchMapPlacementBounds,
  type PatchMapPlacementBounds,
  type PatchMapPlacementReference,
} from '../../src/semantic/placement';

interface PlacementObservation {
  readonly localBounds: readonly [number, number, number, number];
  readonly worldBounds: readonly [number, number, number, number];
}

interface Lay002Params {
  readonly item: Readonly<{
    size: readonly [number, number];
    padding: PatchMapEdges;
  }>;
  readonly componentSize: readonly [number, number];
  readonly margin: PatchMapEdges;
  readonly placements: readonly PatchMapPlacement[];
  readonly placementMatrix: Readonly<Record<PatchMapPlacement, PlacementObservation>>;
}

const lay002 = getCaseParams<Lay002Params>('LAY-002');
const [itemWidth, itemHeight] = lay002.item.size;
const [componentWidth, componentHeight] = lay002.componentSize;
const contentTuple = resolvePatchMapContentBox(
  { width: itemWidth, height: itemHeight },
  lay002.item.padding,
  '$.LAY-002.item',
);
const reference: PatchMapPlacementReference = Object.freeze({
  x: contentTuple[0],
  y: contentTuple[1],
  width: contentTuple[2],
  height: contentTuple[3],
});
const componentSize = Object.freeze({ width: componentWidth, height: componentHeight });
const ITEM_WORLD_ORIGIN = Object.freeze([10, 20] as const);
const currentPlacements = lay002.placements.filter(
  (placement) => placement !== ('none' as string),
);

describe('PatchMap LAY-002 semantic placement', () => {
  it('resolves the exact approved local and world matrix for every placement', () => {
    for (const placement of currentPlacements) {
      const bounds = resolvePatchMapPlacementBounds(
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

  it('rejects placements outside the current closed placement set', () => {
    expectInvalidValue(
      () => resolve('none' as unknown as PatchMapPlacement),
      '$.placement',
    );
    expect(() => parsePatchMap([{
      type: 'item',
      id: 'item',
      size: 20,
      components: [{
        type: 'bar',
        id: 'bar',
        source: { type: 'rect' },
        size: 10,
        placement: 'none',
      }],
    }])).toThrow('Placement must be a supported PatchMap placement');
  });

  it('fails closed for unsupported, non-finite, negative-size, and overflowing profiles', () => {
    expectInvalidValue(
      () => resolvePatchMapPlacementBounds(
        reference,
        componentSize,
        'diagonal' as PatchMapPlacement,
        lay002.margin,
        '$.invalid-placement',
      ),
      '$.invalid-placement.placement',
    );
    expectInvalidValue(
      () => resolvePatchMapPlacementBounds(
        { ...reference, x: Number.NaN },
        componentSize,
        'center',
        lay002.margin,
        '$.non-finite',
      ),
      '$.non-finite.reference.x',
    );
    expectInvalidValue(
      () => resolvePatchMapPlacementBounds(
        reference,
        { ...componentSize, width: -1 },
        'center',
        lay002.margin,
        '$.negative-size',
      ),
      '$.negative-size.size.width',
    );
    expectInvalidValue(
      () => resolvePatchMapPlacementBounds(
        reference,
        componentSize,
        'center',
        { ...lay002.margin, bottom: Number.POSITIVE_INFINITY },
        '$.non-finite-margin',
      ),
      '$.non-finite-margin.margin.bottom',
    );
    expectInvalidValue(
      () => resolvePatchMapPlacementBounds(
        reference,
        componentSize,
        'center',
        { ...lay002.margin, left: -1 },
        '$.negative-margin',
      ),
      '$.negative-margin.margin.left',
    );
    expectInvalidValue(
      () => resolvePatchMapContentBox(
        { width: itemWidth, height: itemHeight },
        { ...lay002.item.padding, top: -1 },
        '$.negative-padding',
      ),
      '$.negative-padding.padding.top',
    );
    expectInvalidValue(
      () => resolvePatchMapPlacementBounds(
        { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 10 },
        { width: 0, height: 0 },
        'center',
        { top: 0, right: 0, bottom: 0, left: 0 },
        '$.overflow',
      ),
      '$.overflow.result.x',
    );
  });

  it('rejects negative authored margin and padding edges at materialization', () => {
    expect(() => materializePatchMapDataset([{
      type: 'item',
      id: 'negative-margin',
      size: 20,
      components: [{
        type: 'icon',
        id: 'icon',
        source: 'icon',
        size: 10,
        margin: { left: -1 },
      }],
    }])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].components[0].margin.left',
    }));

    expect(() => materializePatchMapDataset([{
      type: 'item',
      id: 'negative-padding',
      size: 20,
      padding: { top: -1 },
      components: [],
    }])).toThrowError(expect.objectContaining<Partial<PatchMapDatasetError>>({
      code: 'INVALID_VALUE',
      datasetPath: '$[0].padding.top',
    }));
  });

  it('is deterministic, immutable, and does not mutate caller-owned inputs', () => {
    const callerReference = { ...reference };
    const callerSize = { ...componentSize };
    const callerMargin = { ...lay002.margin };
    const before = structuredClone({ callerReference, callerSize, callerMargin });

    const first = resolvePatchMapPlacementBounds(
      callerReference,
      callerSize,
      'right-top',
      callerMargin,
    );
    const second = resolvePatchMapPlacementBounds(
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
      components: currentPlacements.map((placement) => ({
        type: 'bar',
        id: placement,
        source: { type: 'rect', fill: '#336699' },
        size: { width: componentWidth, height: componentHeight },
        placement,
        margin: lay002.margin,
      })),
    }];
    const before = structuredClone(input);
    const parsed = parsePatchMap(input);

    for (const placement of currentPlacements) {
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

function resolve(placement: PatchMapPlacement): PatchMapPlacementBounds {
  return resolvePatchMapPlacementBounds(reference, componentSize, placement, lay002.margin);
}

function tuple(bounds: PatchMapPlacementBounds): readonly [number, number, number, number] {
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
    expect.objectContaining<Partial<PatchMapDatasetError>>({
      category: 'INVALID_INPUT',
      code: 'INVALID_VALUE',
      datasetPath,
    }),
  );
}
