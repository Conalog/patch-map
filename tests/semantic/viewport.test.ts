import datasets from '../fixtures/datasets/index';
import { describe, expect, it } from 'vitest';

import { materializePatchMapDataset } from '../../src/semantic/dataset';
import {
  patchMapBoundsCenter,
  patchMapViewportFitScale,
  normalizePatchMapViewportPadding,
  resolvePatchMapViewportContributors,
  type PatchMapViewportGeometry,
  type PatchMapViewportGeometryEntity,
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
      'grid-a.0.0',
      'grid-a.0.1',
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

  it('uses the default managed set while explicitly excluding image and relation roots', () => {
    const result = resolve(null);

    expect(result.contributors.map(({ id }) => id)).toEqual([
      'item-a',
      'rect-b',
      'grid-a.0.0',
      'grid-a.0.1',
      'text-c',
      'zone-a',
    ]);
    expect(result.excluded).toEqual(['links', 'image-a']);
    expect(result.duplicateCount).toBe(0);
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
  });

  function resolve(
    targets: readonly string[] | null,
    options: Readonly<{
      readonly rejectIds?: readonly string[];
      readonly relationEndpointsAvailable?: boolean;
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
