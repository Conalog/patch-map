import catalogProfiles from '../fixtures/product-datasets.json';
import { describe, expect, it } from 'vitest';

import { PatchMapParseError } from '../../src/parsing/contracts';
import {
  parsePatchMap,
  parsePatchMapAsync,
} from '../../src/parsing';

describe('PatchMap cooperative parser', () => {
  it('is expected-equivalent, deeply frozen, and input-immutable', async () => {
    const input = structuredClone(catalogProfiles.datasets['all-kinds-scene']);
    const before = JSON.stringify(input);

    const synchronous = parsePatchMap(input);
    const cooperative = await parsePatchMapAsync(input);

    expect(cooperative).toEqual(synchronous);
    expect(JSON.stringify(input)).toBe(before);
    expect(deeplyFrozen(cooperative)).toBe(true);
  });

  it('preserves the canonical fatal diagnostic for invalid roots', async () => {
    let synchronousError: PatchMapParseError | null = null;
    try {
      parsePatchMap(null);
    } catch (error) {
      if (error instanceof PatchMapParseError) synchronousError = error;
      else throw error;
    }
    expect(synchronousError).not.toBeNull();

    await expect(parsePatchMapAsync(null)).rejects.toMatchObject({
      name: 'PatchMapParseError',
      diagnostics: synchronousError?.diagnostics,
    });
  });
});

function deeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((nested) => deeplyFrozen(nested, seen));
}
