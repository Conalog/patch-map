import { describe, expect, it } from 'vitest';

import {
  compactPatchMapStableRecord,
  isPatchMapStableRecordOverlay,
  patchPatchMapStableRecord,
  rollbackPatchMapStableRecord,
} from '../../src/semantic/stable-record-overlay';

describe('PatchMap internal stable-record overlay', () => {
  it('preserves ordinary record access, ownership, order, JSON, and write rejection', () => {
    const base = Object.freeze(Object.assign(Object.create(null), {
      a: Object.freeze({ value: 1 }),
      b: Object.freeze({ value: 2 }),
      c: Object.freeze({ value: 3 }),
    })) as Readonly<Record<string, Readonly<{ value: number }>>>;
    const selected = Object.freeze({
      b: Object.freeze({ value: 20 }),
    });
    const patched = patchPatchMapStableRecord(
      base,
      selected,
      ['b'],
      'internal-overlay',
    );

    expect(patched).not.toBeNull();
    expect(isPatchMapStableRecordOverlay(patched)).toBe(true);
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
    const first = patchPatchMapStableRecord(
      base,
      { a: Object.freeze({ value: 10 }) },
      ['a'],
      'internal-overlay',
    )!;
    const second = patchPatchMapStableRecord(
      first,
      { b: Object.freeze({ value: 20 }) },
      ['b'],
      'internal-overlay',
    )!;

    expect(first.a!.value).toBe(10);
    expect(first.b!.value).toBe(2);
    expect(second.a!.value).toBe(10);
    expect(second.b!.value).toBe(20);

    compactPatchMapStableRecord(second);
    expect(JSON.stringify(second)).toBe(
      '{"a":{"value":10},"b":{"value":20}}',
    );
    const third = patchPatchMapStableRecord(
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
    const candidate = patchPatchMapStableRecord(
      base,
      { a: Object.freeze({ value: 9 }) },
      ['a'],
      'internal-overlay',
    )!;

    expect(candidate.a!.value).toBe(9);
    rollbackPatchMapStableRecord(candidate, base);
    expect(base.a!.value).toBe(1);
    expect(candidate.a!.value).toBe(1);
  });

  it('retains the public deeply frozen copy strategy', () => {
    const base: Readonly<Record<string, Readonly<{ value: number }>>> =
      Object.freeze({ a: Object.freeze({ value: 1 }) });
    const patched = patchPatchMapStableRecord(
      base,
      { a: Object.freeze({ value: 2 }) },
      ['a'],
      'frozen-copy',
    );

    expect(patched).toEqual({ a: { value: 2 } });
    expect(Object.isFrozen(patched)).toBe(true);
    expect(isPatchMapStableRecordOverlay(patched)).toBe(false);
  });

});
