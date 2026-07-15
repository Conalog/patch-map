import { describe, expect, it } from 'vitest';

import { percentile, summarize } from '../../performance/core-v2/protocol';
import { createSyntheticPatchMap } from '../../performance/core-v2/workloads';

describe('Core v2 performance protocol', () => {
  it('retains raw sample order and reports deterministic nearest-rank statistics', () => {
    const result = summarize([7, 1, 3, 2, 6, 5, 4]);
    expect(result.samples).toEqual([7, 1, 3, 2, 6, 5, 4]);
    expect(result).toMatchObject({ min: 1, median: 4, p95: 7, max: 7 });
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('generates deterministic schema-valid item inputs with bar, text, asset, and relation coverage', () => {
    const left = createSyntheticPatchMap(100, 123);
    const right = createSyntheticPatchMap(100, 123);
    expect(left).toEqual(right);
    expect(left).toHaveLength(101);
    expect(left[0]).toMatchObject({ type: 'item', id: 'item-00000' });
    expect(left.at(-1)).toMatchObject({ type: 'relations', id: 'synthetic-relations' });
  });
});

