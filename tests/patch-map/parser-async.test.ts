import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import { PatchMapParseError } from '../../src/patch-map/contracts';
import {
  parsePatchMapV010,
  parsePatchMapV010Async,
} from '../../src/patch-map/parser';

describe('PatchMap cooperative parser', () => {
  it('is expected-equivalent, deeply frozen, and input-immutable', async () => {
    const input = structuredClone(catalogProfiles.datasets['all-kinds-scene']);
    const before = JSON.stringify(input);

    const synchronous = parsePatchMapV010(input);
    const cooperative = await parsePatchMapV010Async(input);

    expect(cooperative).toEqual(synchronous);
    expect(JSON.stringify(input)).toBe(before);
    expect(deeplyFrozen(cooperative)).toBe(true);
  });

  it('preserves the canonical fatal diagnostic for invalid roots', async () => {
    let synchronousError: PatchMapParseError | null = null;
    try {
      parsePatchMapV010(null);
    } catch (error) {
      if (error instanceof PatchMapParseError) synchronousError = error;
      else throw error;
    }
    expect(synchronousError).not.toBeNull();

    await expect(parsePatchMapV010Async(null)).rejects.toMatchObject({
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
