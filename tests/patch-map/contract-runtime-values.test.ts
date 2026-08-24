import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import {
  deepFreezePatchMapLabValue,
  detachPatchMapLabValue,
  isPatchMapLabRecord,
} from '../../lab/patch-map/contract/runtime-values';

describe('PatchMap Lab runtime values', () => {
  it('deep-freezes nested values without recursing forever through cycles', () => {
    const value: {
      nested: { entries: string[] };
      self?: unknown;
    } = {
      nested: { entries: ['first'] },
    };
    value.self = value;

    const result = deepFreezePatchMapLabValue(value);

    expect(result).toBe(value);
    expect(result.self).toBe(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nested)).toBe(true);
    expect(Object.isFrozen(result.nested.entries)).toBe(true);
  });

  it('returns a detached, deeply frozen clone without mutating the source', () => {
    const source = {
      rows: [{ id: 'item-a', values: [1, 2] }],
    };

    const result = detachPatchMapLabValue(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.rows).not.toBe(source.rows);
    expect(result.rows[0]).not.toBe(source.rows[0]);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(Object.isFrozen(result.rows[0]?.values)).toBe(true);
  });

  it('accepts non-array records and rejects arrays, null, and primitives', () => {
    expect(isPatchMapLabRecord({ id: 'item-a' })).toBe(true);
    expect(isPatchMapLabRecord(Object.create(null))).toBe(true);
    expect(isPatchMapLabRecord([])).toBe(false);
    expect(isPatchMapLabRecord(null)).toBe(false);
    expect(isPatchMapLabRecord('item-a')).toBe(false);
  });

  it('remains an import-free expected-blind leaf', async () => {
    const source = await readFile(
      new URL('../../lab/patch-map/contract/runtime-values.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/^\s*import\s/mu);
    expect(source).not.toMatch(
      /normalizedExpected|approvedExpected|comparisonResult|catalog-normalized-expected/u,
    );
    expect(source).not.toMatch(/from ['"]node:/u);
  });
});
