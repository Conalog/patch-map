import { describe, expect, it } from 'vitest';
import {
  PatchMapScreenRegionIndex,
} from '../../src/patch-map/semantic/screen-region-index';

describe('PatchMapScreenRegionIndex', () => {
  it('returns nearby screen buckets in original geometry order', () => {
    const entities = Object.freeze([
      Object.freeze({ id: 'left', screenBounds: Object.freeze([0, 0, 20, 20] as const) }),
      Object.freeze({ id: 'far', screenBounds: Object.freeze([2_000, 2_000, 20, 20] as const) }),
      Object.freeze({ id: 'middle', screenBounds: Object.freeze([130, 10, 20, 20] as const) }),
    ]);
    const relations = Object.freeze([
      Object.freeze({ id: 'near-link', screenBounds: Object.freeze([10, 10, 140, 2] as const) }),
      Object.freeze({ id: 'far-link', screenBounds: Object.freeze([3_000, 3_000, 10, 10] as const) }),
    ]);
    const index = PatchMapScreenRegionIndex.build(entities, relations);

    const candidates = index.query([120, 0, 40, 40]);

    expect(candidates.entities.map(({ id }) => id)).toEqual(['left', 'middle']);
    expect(candidates.relations.map(({ id }) => id)).toEqual(['near-link']);
    expect(Object.isFrozen(candidates.entities)).toBe(true);
    expect(Object.isFrozen(candidates.relations)).toBe(true);
  });

  it('keeps non-finite and oversized geometry in the exact-test overflow lane', () => {
    const entities = Object.freeze([
      Object.freeze({ id: 'finite', screenBounds: Object.freeze([0, 0, 10, 10] as const) }),
      Object.freeze({ id: 'non-finite', screenBounds: Object.freeze([0, 0, Number.NaN, 10] as const) }),
      Object.freeze({ id: 'oversized', screenBounds: Object.freeze([0, 0, 100_000, 100_000] as const) }),
    ]);
    const relations = Object.freeze([
      Object.freeze({
        id: 'non-finite-bounds',
        screenBounds: Object.freeze([Number.NaN, 0, 10, 10] as const),
      }),
    ]);
    const index = PatchMapScreenRegionIndex.build(entities, relations);

    const candidates = index.query([10_000, 10_000, 1, 1]);

    expect(candidates.entities.map(({ id }) => id)).toEqual([
      'non-finite',
      'oversized',
    ]);
    expect(candidates.relations.map(({ id }) => id)).toEqual(['non-finite-bounds']);
  });

  it('falls back to the complete ordered geometry for unsafe query coverage', () => {
    const entities = Object.freeze([
      Object.freeze({ id: 'first', screenBounds: Object.freeze([0, 0, 10, 10] as const) }),
      Object.freeze({ id: 'second', screenBounds: Object.freeze([1_000, 1_000, 10, 10] as const) }),
    ]);
    const index = PatchMapScreenRegionIndex.build(entities, Object.freeze([]));

    expect(index.query([0, 0, 1_000_000, 1_000_000]).entities).toBe(entities);
    expect(index.query([0, 0, Number.NaN, 1]).entities).toBe(entities);
  });
});
