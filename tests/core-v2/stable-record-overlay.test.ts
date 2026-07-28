import { describe, expect, it } from 'vitest';

import {
  compactCoreV2StableRecord,
  isCoreV2StableRecordOverlay,
  patchCoreV2StableRecord,
  rollbackCoreV2StableRecord,
} from '../../src/core-v2/semantic/stable-record-overlay';

describe('Core v2 internal stable-record overlay', () => {
  it('preserves ordinary record access, ownership, order, JSON, and write rejection', () => {
    const base = Object.freeze(Object.assign(Object.create(null), {
      a: Object.freeze({ value: 1 }),
      b: Object.freeze({ value: 2 }),
      c: Object.freeze({ value: 3 }),
    })) as Readonly<Record<string, Readonly<{ value: number }>>>;
    const selected = Object.freeze({
      b: Object.freeze({ value: 20 }),
    });
    const patched = patchCoreV2StableRecord(
      base,
      selected,
      ['b'],
      'internal-overlay',
    );

    expect(patched).not.toBeNull();
    expect(isCoreV2StableRecordOverlay(patched)).toBe(true);
    expect(Object.keys(patched!)).toEqual(['a', 'b', 'c']);
    expect(Object.values(patched!).map(({ value }) => value)).toEqual([1, 20, 3]);
    expect(Object.hasOwn(patched!, 'b')).toBe(true);
    expect('c' in patched!).toBe(true);
    expect(JSON.stringify(patched)).toBe(
      '{"a":{"value":1},"b":{"value":20},"c":{"value":3}}',
    );
    expect(Reflect.set(patched!, 'b', { value: 99 })).toBe(false);
    expect(patched?.b?.value).toBe(20);
  });

  it('keeps the preceding snapshot exact until successful publication compacts it', () => {
    const base: Readonly<Record<string, Readonly<{ value: number }>>> = Object.freeze({
      a: Object.freeze({ value: 1 }),
      b: Object.freeze({ value: 2 }),
    });
    const first = patchCoreV2StableRecord(
      base,
      { a: Object.freeze({ value: 10 }) },
      ['a'],
      'internal-overlay',
    )!;
    const second = patchCoreV2StableRecord(
      first,
      { b: Object.freeze({ value: 20 }) },
      ['b'],
      'internal-overlay',
    )!;

    expect(first.a!.value).toBe(10);
    expect(first.b!.value).toBe(2);
    expect(second.a!.value).toBe(10);
    expect(second.b!.value).toBe(20);

    compactCoreV2StableRecord(second);
    expect(JSON.stringify(second)).toBe(
      '{"a":{"value":10},"b":{"value":20}}',
    );
    const third = patchCoreV2StableRecord(
      second,
      { a: Object.freeze({ value: 30 }) },
      ['a'],
      'internal-overlay',
    )!;
    expect(third.a!.value).toBe(30);
    expect(third.b!.value).toBe(20);
  });

  it('rolls an unpublished candidate back to its exact prior version', () => {
    const base: Readonly<Record<string, Readonly<{ value: number }>>> = Object.freeze({
      a: Object.freeze({ value: 1 }),
    });
    const candidate = patchCoreV2StableRecord(
      base,
      { a: Object.freeze({ value: 9 }) },
      ['a'],
      'internal-overlay',
    )!;

    expect(candidate.a!.value).toBe(9);
    rollbackCoreV2StableRecord(candidate, base);
    expect(base.a!.value).toBe(1);
    expect(candidate.a!.value).toBe(1);
  });

  it('retains the public deeply frozen copy strategy', () => {
    const base: Readonly<Record<string, Readonly<{ value: number }>>> =
      Object.freeze({ a: Object.freeze({ value: 1 }) });
    const patched = patchCoreV2StableRecord(
      base,
      { a: Object.freeze({ value: 2 }) },
      ['a'],
      'frozen-copy',
    );

    expect(patched).toEqual({ a: { value: 2 } });
    expect(Object.isFrozen(patched)).toBe(true);
    expect(isCoreV2StableRecordOverlay(patched)).toBe(false);
  });

});
