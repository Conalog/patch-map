import datasets from '../fixtures/datasets/index';
import { describe, expect, it, vi } from 'vitest';

import { materializePatchMapDataset } from '../../src/semantic/dataset';
import {
  patchMapBoundsCenter,
  patchMapViewportFitScale,
  normalizePatchMapViewportPadding,
  resolvePatchMapViewportContributors,
  type PatchMapViewportGeometry,
  type PatchMapViewportGeometryEntity,
  type PatchMapViewportFilter,
} from '../../src/viewport';

describe('PatchMap viewport substrate', () => {
  const dataset = materializePatchMapDataset(
    datasets['all-kinds-scene'],
  ).dataset;
  const geometry = viewportGeometry();

  it('resolves group, grid, filter, deduplication, and relation contributor rules', () => {
    expect(resolve(['group-a']).contributors.map(({ id }) => id)).toEqual([
      'item-a',
      'rect-b',
    ]);
    expect(resolve(['grid-a']).contributors.map(({ id }) => id)).toEqual([
      'grid-a',
    ]);
    expect(resolve(['group-a'], { rejectIds: ['rect-b'] }).contributors.map(({ id }) => id))
      .toEqual(['item-a']);
    expect(resolve(['item-a', 'item-a', 'rect-b'])).toMatchObject({
      duplicateCount: 1,
      contributors: [
        expect.objectContaining({ id: 'item-a' }),
        expect.objectContaining({ id: 'rect-b' }),
      ],
    });
    expect(resolve(['links']).contributors.map(({ id }) => id)).toEqual([
      'item-a',
      'rect-b',
    ]);
    expect(resolve(['links'], { relationEndpointsAvailable: false }).contributors)
      .toEqual([{ id: 'links', worldBounds: [10, 20, 190, 80] }]);
  });

  it('matches main defaults: includes images and excludes only relation roots', () => {
    const result = resolve(null);

    expect(result.contributors.map(({ id }) => id)).toEqual([
      'item-a',
      'rect-b',
      'grid-a',
      'image-a',
      'text-c',
      'zone-a',
    ]);
    expect(result.excluded).toEqual(['links']);
    expect(result.duplicateCount).toBe(0);
  });

  it('filters during traversal, pruning rejected group subtrees for default and explicit targets', () => {
    for (const targets of [null, ['group-a']] as const) {
      const filter = vi.fn<PatchMapViewportFilter>(({ id }) => id !== 'group-a');
      const result = resolve(targets, { filter });
      expect(result.excluded).toContain('group-a');
      expect(filter.mock.calls.map(([target]) => target.id)).not.toContain('item-a');
      expect(filter.mock.calls.map(([target]) => target.id)).not.toContain('rect-b');
    }
    expect(resolve(['group-a'], { filter: ({ id }) => id !== 'rect-b' })).toMatchObject({
      contributors: [expect.objectContaining({ id: 'item-a' })],
      excluded: ['rect-b'], missing: [], worldBounds: [10, 20, 100, 80],
    });
  });

  it('accepts truthy values and leaves no bounds when every resolved target is filtered out', () => {
    expect(resolve(['item-a', 'rect-b'], { filter: ({ id }) => id === 'item-a' ? 'keep' : 0 }))
      .toMatchObject({ contributors: [expect.objectContaining({ id: 'item-a' })], excluded: ['rect-b'] });
    expect(resolve(null, { filter: () => null })).toMatchObject({
      contributors: [], applied: [], missing: [], worldBounds: null,
    });
  });

  it('treats grids as single bounds contributors without filtering their cells', () => {
    const filter = vi.fn<PatchMapViewportFilter>(({ id }) => id === 'grid-a');
    expect(resolve(['grid-a'], { filter })).toMatchObject({
      contributors: [{ id: 'grid-a', worldBounds: [300, 40, 104, 48] }],
    });
    expect(filter.mock.calls.map(([target]) => target.id)).toEqual(['grid-a']);
    expect(resolve(['grid-a.0.1'], { filter: ({ id }) => id === 'grid-a.0.1' }).contributors)
      .toEqual([{ id: 'grid-a.0.1', worldBounds: [356, 40, 48, 48] }]);
    expect(resolve(['grid-a'], { filter: () => false })).toMatchObject({
      contributors: [], excluded: ['grid-a'], missing: [], worldBounds: null,
    });
  });

  it('includes hidden managed targets and retained inactive grid cells just as main does', () => {
    const group = dataset.find(({ id }) => id === 'group-a')!;
    const grid = dataset.find(({ id }) => id === 'grid-a')!;
    const hidden = materializePatchMapDataset([
      { ...group, show: false },
      { ...grid, cells: [[1, 0]], inactiveCellStrategy: 'hide' },
    ]).dataset;
    const hiddenGeometry = { ...geometry, entities: geometry.entities.map((entry) => ({ ...entry, visible: false })) };
    const result = resolvePatchMapViewportContributors(hidden, hiddenGeometry, { targets: null });
    expect(result.contributors.map(({ id }) => id)).toEqual(['item-a', 'rect-b', 'grid-a']);
    expect(result.contributors[2]?.worldBounds).toEqual([300, 40, 104, 48]);
    expect(resolvePatchMapViewportContributors(hidden, hiddenGeometry, {
      targets: ['grid-a.0.1'], filter: ({ value }) => value.show,
    })).toMatchObject({ contributors: [], excluded: ['grid-a.0.1'] });
    expect(resolvePatchMapViewportContributors(hidden, hiddenGeometry, {
      targets: ['group-a'], filter: ({ value }) => value.show,
    })).toMatchObject({ contributors: [], excluded: ['group-a'] });
  });

  it('does not include unrelated elements whose IDs merely share a grid prefix', () => {
    const unrelated = { ...geometry, entities: [
      ...geometry.entities,
      entity('grid-a.other.0.0', [1000, 1000, 100, 100]),
      entity('grid-a.99.99', [2000, 2000, 100, 100]),
    ] };
    expect(resolvePatchMapViewportContributors(dataset, unrelated, { targets: ['grid-a'] }).worldBounds)
      .toEqual([300, 40, 104, 48]);
  });

  it('expands explicit relations before filtering endpoints, without falling back after rejection', () => {
    const filter = vi.fn<PatchMapViewportFilter>(({ id }) => id !== 'rect-b');
    expect(resolve(['links'], { filter })).toMatchObject({
      contributors: [expect.objectContaining({ id: 'item-a' })], excluded: ['rect-b'],
    });
    expect(filter.mock.calls.map(([target]) => target.id)).toEqual(['item-a', 'rect-b']);
    expect(resolve(['links'], { filter: () => false })).toMatchObject({
      contributors: [], worldBounds: null, missing: [], excluded: ['item-a', 'rect-b'],
    });
    // The relation owner is not a traversal target when endpoints resolve.
    expect(resolve(['links'], { filter: ({ id }) => id !== 'links' }).contributors)
      .toHaveLength(2);
    expect(resolve(['links'], { relationEndpointsAvailable: false, filter: () => false }))
      .toMatchObject({ contributors: [], excluded: ['links'] });
  });

  it('deduplicates overlapping leaf targets before calling the filter again', () => {
    const filter = vi.fn<PatchMapViewportFilter>(() => true);
    expect(resolve(['group-a', 'item-a', 'links'], { filter }).contributors.map(({ id }) => id))
      .toEqual(['item-a', 'rect-b']);
    expect(filter.mock.calls.map(([target]) => target.id)).toEqual(['group-a', 'item-a', 'rect-b']);
  });

  it('uses relation bounds within groups, and falls back only when explicit endpoints cannot resolve', () => {
    const relation = dataset.find(({ id }) => id === 'links')!;
    const nested = materializePatchMapDataset([
      { type: 'group', id: 'nested', children: [relation] },
    ]).dataset;
    const filter = vi.fn<PatchMapViewportFilter>(() => true);
    const result = resolvePatchMapViewportContributors(nested, geometry, { targets: null, filter });
    expect(result.contributors).toEqual([{ id: 'links', worldBounds: [10, 20, 190, 80] }]);
    expect(filter.mock.calls.map(([target]) => target.id)).toEqual(['nested', 'links']);
    expect(resolvePatchMapViewportContributors(nested, geometry, { targets: ['links'] }).contributors)
      .toEqual(result.contributors);
  });

  it('resolves authored relation endpoints even when a dangling link has no rendered geometry', () => {
    const group = dataset.find(({ id }) => id === 'group-a')!;
    const roots = materializePatchMapDataset([
      group,
      { type: 'relations', id: 'dangling', links: [{ source: 'group-a', target: 'missing' }] },
    ]).dataset;
    const filter = vi.fn<PatchMapViewportFilter>(({ id }) => id !== 'rect-b');
    const result = resolvePatchMapViewportContributors(roots, geometry, { targets: ['dangling'], filter });
    expect(result).toMatchObject({
      contributors: [expect.objectContaining({ id: 'item-a' })], excluded: ['rect-b'],
    });
    expect(filter.mock.calls.map(([target]) => target.id)).toEqual(['group-a', 'item-a', 'rect-b']);
  });

  it('passes frozen semantic matches including grid instances, and validates filters on empty targets', () => {
    const filter = vi.fn<PatchMapViewportFilter>(() => true);
    resolve(['item-a', 'grid-a.0.0'], { filter });
    for (const [target] of filter.mock.calls) {
      expect(Object.isFrozen(target)).toBe(true);
      expect(Object.isFrozen(target.value)).toBe(true);
      expect(target.kind).toBe('element');
    }
    expect(() => resolve(['missing'], { filter: false as unknown as PatchMapViewportFilter }))
      .toThrow('viewport filter must be a function');
  });

  it('returns an explicit empty result without inventing bounds', () => {
    expect(resolve(['missing'])).toMatchObject({
      contributors: [],
      applied: [],
      missing: ['missing'],
      worldBounds: null,
    });
  });

  it('normalizes padding and accounts for rotation when fitting', () => {
    expect(normalizePatchMapViewportPadding()).toEqual({ x: 16, y: 16 });
    expect(normalizePatchMapViewportPadding(24)).toEqual({ x: 24, y: 24 });
    expect(normalizePatchMapViewportPadding([20, 30])).toEqual({ x: 20, y: 30 });
    expect(() => normalizePatchMapViewportPadding([-1, 16])).toThrow(
      'viewport padding must contain two finite non-negative values',
    );

    const bounds = [10, 20, 190, 80] as const;
    expect(patchMapBoundsCenter(bounds)).toEqual([105, 60]);
    expect(patchMapViewportFitScale(
      bounds,
      [800, 600],
      normalizePatchMapViewportPadding(0),
      90,
      [0.25, 4],
    )).toBeCloseTo(3.1578947368, 8);
    for (const angle of [Number.MAX_VALUE, -Number.MAX_VALUE, 450, -450]) {
      const fit = (degrees: number) => patchMapViewportFitScale(
        bounds, [800, 600], normalizePatchMapViewportPadding(24), degrees, [0.25, 4],
      );
      expect(fit(angle)).toBe(fit(angle % 360));
    }
  });

  function resolve(
    targets: readonly string[] | null,
    options: Readonly<{
      readonly rejectIds?: readonly string[];
      readonly relationEndpointsAvailable?: boolean;
      readonly filter?: PatchMapViewportFilter;
    }> = {},
  ) {
    return resolvePatchMapViewportContributors(dataset, geometry, {
      targets,
      ...options,
    });
  }
});

function viewportGeometry(): PatchMapViewportGeometry {
  return Object.freeze({
    entities: Object.freeze([
      entity('item-a', [10, 20, 100, 80]),
      entity('rect-b', [160, 40, 40, 30]),
      entity('grid-a.0.0', [300, 40, 48, 48]),
      entity('grid-a.0.1', [356, 40, 48, 48]),
      entity('image-a', [-20, 200, 80, 40]),
      entity('text-c', [40, 140, 80, 20]),
      entity('zone-a', [20, 320, 240, 120]),
    ]),
    relations: Object.freeze([
      Object.freeze({
        id: 'links:0',
        relationId: 'links',
        sourceId: 'item-a',
        targetId: 'item-a',
        worldBounds: Object.freeze([10, 20, 100, 80] as const),
        visible: true,
      }),
      Object.freeze({
        id: 'links:1',
        relationId: 'links',
        sourceId: 'item-a',
        targetId: 'rect-b',
        worldBounds: Object.freeze([10, 20, 190, 80] as const),
        visible: true,
      }),
    ]),
  });
}

function entity(
  id: string,
  worldBounds: readonly [number, number, number, number],
): PatchMapViewportGeometryEntity {
  return Object.freeze({
    id,
    worldBounds: Object.freeze([
      worldBounds[0],
      worldBounds[1],
      worldBounds[2],
      worldBounds[3],
    ] as const),
    visible: true,
  });
}
