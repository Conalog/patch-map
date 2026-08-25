import { describe, expect, it, vi } from 'vitest';

interface TypeSuffixValueAtoms {
  recordValue(value: unknown, label: string): object;
  arrayValue(value: unknown, label: string): readonly unknown[];
  stringValue(value: unknown, label: string): string;
  booleanValue(value: unknown, label: string): boolean;
  finiteNumber(value: unknown, label: string): number;
}

interface ValueAtomsModule {
  clone<T>(value: T): T;
  cloneOptional<T>(value: T | undefined): T | undefined;
  deepFreeze<T>(value: T, seen?: WeakSet<object>): T;
  createTypeSuffixValueAtoms(
    assert: (condition: unknown, message: string) => void,
  ): TypeSuffixValueAtoms;
  createOrderedExactKeyAssertion(
    assert: (condition: unknown, message: string) => void,
  ): (value: object, keys: readonly string[], label: string) => void;
}

const valueAtomsNamespace: unknown = await import(
  /* @vite-ignore */ new URL(
    '../../scripts/verification/patch-map-contract/value-atoms.mjs',
    import.meta.url,
  ).href
);

const {
  clone,
  cloneOptional,
  deepFreeze,
  createTypeSuffixValueAtoms,
  createOrderedExactKeyAssertion,
} = valueAtomsNamespace as ValueAtomsModule;

describe('patch-map verifier value atoms', () => {
  it('clones detached values without mutating the source', () => {
    const source = {
      nested: { value: 1 },
      values: [1, 2],
    };

    const cloned = clone(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.nested).not.toBe(source.nested);
    expect(cloned.values).not.toBe(source.values);

    cloned.nested.value = 2;
    cloned.values.push(3);
    expect(source).toEqual({ nested: { value: 1 }, values: [1, 2] });
  });

  it('returns undefined without invoking structuredClone', () => {
    const structuredCloneSpy = vi.spyOn(globalThis, 'structuredClone');
    try {
      expect(cloneOptional(undefined)).toBeUndefined();
      expect(structuredCloneSpy).not.toHaveBeenCalled();
    } finally {
      structuredCloneSpy.mockRestore();
    }
  });

  it('freezes nested cyclic values child-first and preserves identity', () => {
    const child = { value: 1 };
    const root: { child: typeof child; self?: unknown } = { child };
    root.self = root;

    expect(deepFreeze(root)).toBe(root);
    expect(root.self).toBe(root);
    expect(Object.isFrozen(child)).toBe(true);
    expect(Object.isFrozen(root)).toBe(true);
  });

  it('freezes a nested child before its parent', () => {
    const freezeOrder: string[] = [];
    const child = freezeTracked({}, 'child', freezeOrder);
    const parent = freezeTracked({ child }, 'parent', freezeOrder);

    deepFreeze(parent);

    expect(freezeOrder).toEqual(['child', 'parent']);
  });

  it('continues into an unfrozen child below an already frozen parent', () => {
    const child = { nested: { value: 1 } };
    const parent = Object.freeze({ child });

    expect(deepFreeze(parent)).toBe(parent);
    expect(Object.isFrozen(child.nested)).toBe(true);
    expect(Object.isFrozen(child)).toBe(true);
    expect(Object.isFrozen(parent)).toBe(true);
  });

  it('accepts only the exact type-suffix value contracts', () => {
    const atoms = createTypeSuffixValueAtoms(assertCondition);
    const nullPrototypeRecord = Object.create(null) as Record<string, unknown>;
    const array: unknown[] = [];

    expect(atoms.recordValue(nullPrototypeRecord, 'entry')).toBe(nullPrototypeRecord);
    expect(atoms.arrayValue(array, 'entry')).toBe(array);
    expect(atoms.stringValue('value', 'entry')).toBe('value');
    expect(atoms.booleanValue(false, 'entry')).toBe(false);
    expect(Object.is(atoms.finiteNumber(-0, 'entry'), -0)).toBe(true);
  });

  it('uses exact type-suffix assertion messages for rejected values', () => {
    const atoms = createTypeSuffixValueAtoms(assertCondition);

    expect(() => atoms.recordValue(null, 'entry')).toThrowError(/^entry object$/);
    expect(() => atoms.recordValue([], 'entry')).toThrowError(/^entry object$/);
    expect(() => atoms.arrayValue({}, 'entry')).toThrowError(/^entry array$/);
    expect(() => atoms.stringValue('', 'entry')).toThrowError(/^entry string$/);
    expect(() => atoms.booleanValue(0, 'entry')).toThrowError(/^entry boolean$/);
    expect(() => atoms.finiteNumber(Number.NaN, 'entry')).toThrowError(/^entry finite$/);
    expect(() => atoms.finiteNumber(Number.POSITIVE_INFINITY, 'entry')).toThrowError(
      /^entry finite$/,
    );
    expect(() => atoms.finiteNumber(Number.NEGATIVE_INFINITY, 'entry')).toThrowError(
      /^entry finite$/,
    );
  });

  it('reports unknown source keys before missing caller keys in their original orders', () => {
    const failures: string[] = [];
    const assertExactKeys = createOrderedExactKeyAssertion((condition, message) => {
      if (!condition) failures.push(message);
    });
    const value = {
      'unknown-second': 2,
      'unknown-first': 1,
    };

    assertExactKeys(value, ['missing-second', 'missing-first'], 'entry');

    expect(failures).toEqual([
      'entry unknown key unknown-second',
      'entry unknown key unknown-first',
      'entry missing key missing-second',
      'entry missing key missing-first',
    ]);
  });

  it('ignores inherited and symbol keys while requiring expected keys to be owned', () => {
    const assertExactKeys = createOrderedExactKeyAssertion(assertCondition);
    const inherited = { inherited: true };
    const symbol = Symbol('ignored');
    const value = Object.assign(Object.create(inherited) as Record<PropertyKey, unknown>, {
      owned: true,
    });
    value[symbol] = true;

    expect(() => assertExactKeys(value, ['owned'], 'entry')).not.toThrow();
    expect(() => assertExactKeys(value, ['owned', 'inherited'], 'entry')).toThrowError(
      /^entry missing key inherited$/,
    );
  });
});

function assertCondition(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function freezeTracked<T extends object>(value: T, label: string, order: string[]): T {
  return new Proxy(value, {
    preventExtensions(target) {
      order.push(label);
      return Reflect.preventExtensions(target);
    },
  });
}
