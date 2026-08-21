import { describe, expect, test } from 'vitest';
import { isSame } from './is-same';

class MockClass {
  constructor(value) {
    this.value = value;
  }
}

describe('isSame function', () => {
  // ... 기존 테스트 스위트는 그대로 유지 ...
  describe('Plain Objects and Primitives', () => {
    test.each([
      { name: 'identical numbers', v1: 1, v2: 1, expected: true },
      { name: 'different numbers', v1: 1, v2: 2, expected: false },
      { name: 'identical strings', v1: 'hello', v2: 'hello', expected: true },
      { name: 'different strings', v1: 'hello', v2: 'world', expected: false },
      { name: 'identical booleans', v1: true, v2: true, expected: true },
      {
        name: 'deeply identical plain objects',
        v1: { a: 1, b: { c: 3, d: [4, 5] } },
        v2: { a: 1, b: { c: 3, d: [4, 5] } },
        expected: true,
      },
      {
        name: 'deeply different plain objects',
        v1: { a: 1, b: { c: 99 } },
        v2: { a: 1, b: { c: 3 } },
        expected: false,
      },
      {
        name: 'objects where one has extra properties (forward)',
        v1: { a: 1, b: 2 },
        v2: { a: 1 },
        expected: false,
      },
      {
        name: 'objects where one has extra properties (backward)',
        v1: { a: 1 },
        v2: { a: 1, b: 2 },
        expected: false,
      },
    ])('should return $expected for $name', ({ v1, v2, expected }) => {
      expect(isSame(v1, v2)).toBe(expected);
    });
  });

  describe('Null and Undefined Handling', () => {
    test.each([
      { name: 'two nulls', v1: null, v2: null, expected: true },
      { name: 'two undefineds', v1: undefined, v2: undefined, expected: true },
      { name: 'null and undefined', v1: null, v2: undefined, expected: false },
      { name: 'object and null', v1: { a: 1 }, v2: null, expected: false },
      {
        name: 'object and undefined',
        v1: { a: 1 },
        v2: undefined,
        expected: false,
      },
      {
        name: 'object properties with identical nulls',
        v1: { a: null },
        v2: { a: null },
        expected: true,
      },
      {
        name: 'object properties with identical undefineds',
        v1: { a: undefined },
        v2: { a: undefined },
        expected: true,
      },
      {
        name: 'object properties with null vs undefined',
        v1: { a: null },
        v2: { a: undefined },
        expected: false,
      },
    ])(
      'should return $expected when comparing $name',
      ({ v1, v2, expected }) => {
        expect(isSame(v1, v2)).toBe(expected);
      },
    );
  });

  describe('Non-Plain Object Handling (Arrays, Dates, Instances, Functions)', () => {
    test.each([
      {
        name: 'identical arrays',
        v1: [1, 2, { a: 3 }],
        v2: [1, 2, { a: 3 }],
        expected: true,
      },
      {
        name: 'different arrays (length)',
        v1: [1, 2],
        v2: [1, 2, 3],
        expected: false,
      },
      {
        name: 'different arrays (value)',
        v1: [{ a: 1 }],
        v2: [{ a: 2 }],
        expected: false,
      },
      {
        name: 'identical Date objects',
        v1: new Date('2024-01-01'),
        v2: new Date('2024-01-01'),
        expected: true,
      },
      {
        name: 'different Date objects',
        v1: new Date('2024-01-01'),
        v2: new Date('2024-01-02'),
        expected: false,
      },
      {
        name: 'identical class instances (by value)',
        v1: new MockClass(10),
        v2: new MockClass(10),
        expected: true,
      },
      {
        name: 'different class instances (by value)',
        v1: new MockClass(10),
        v2: new MockClass(20),
        expected: false,
      },
    ])('should return $expected for $name', ({ v1, v2, expected }) => {
      expect(isSame(v1, v2)).toBe(expected);
    });

    test('should return true for identical function references', () => {
      const func = () => {};
      expect(isSame(func, func)).toBe(true);
    });

    test('should return false for different function references', () => {
      const func1 = () => {};
      const func2 = () => {};
      expect(isSame(func1, func2)).toBe(false);
    });
  });

  describe('Advanced Edge Cases', () => {
    test('should handle NaN correctly, returning true', () => {
      expect(isSame(Number.NaN, Number.NaN)).toBe(true);
      expect(isSame({ a: Number.NaN }, { a: Number.NaN })).toBe(true);
      expect(isSame({ a: Number.NaN }, { a: 1 })).toBe(false);
    });

    test('should differentiate between objects with explicit undefined and missing properties', () => {
      expect(isSame({ a: 1, b: undefined }, { a: 1 })).toBe(false);
    });

    test('should differentiate between arrays and array-like objects', () => {
      expect(isSame([1, 2, 3], { 0: 1, 1: 2, 2: 3, length: 3 })).toBe(false);
    });

    test('should handle objects created with Object.create(null)', () => {
      const obj1 = Object.create(null);
      obj1.a = 1;
      const obj2 = Object.create(null);
      obj2.a = 1;
      const obj3 = { a: 1 };

      expect(isSame(obj1, obj2)).toBe(true);
      expect(isSame(obj1, obj3)).toBe(false);
    });

    test('should compare RegExp objects', () => {
      expect(isSame(/abc/g, /abc/g)).toBe(true);
      expect(isSame(/abc/g, /abc/i)).toBe(false);
      expect(isSame(/abc/g, /abc/g)).toBe(true);
    });

    test('should handle circular references without crashing', () => {
      const obj1 = {};
      const obj2 = {};
      obj1.a = obj2;
      obj2.a = obj1;

      const obj3 = {};
      const obj4 = {};
      obj3.a = obj4;
      obj4.a = obj3;

      expect(isSame(obj1, obj3)).toBe(true);
    });
  });

  describe('ES6+ Data Structures and Features', () => {
    test('should handle Symbol properties correctly', () => {
      const sym = Symbol('id');
      const obj1 = { [sym]: 1 };
      const obj2 = { [sym]: 1 };
      const obj3 = { [sym]: 2 };

      expect(isSame(obj1, obj2)).toBe(true);
      expect(isSame(obj1, obj3)).toBe(false);
      expect(isSame({ a: 1, [sym]: 1 }, { a: 1 })).toBe(false);
    });

    test('should compare Map objects correctly', () => {
      const map1 = new Map([
        ['a', 1],
        ['b', { x: 2 }],
      ]);
      const map2 = new Map([
        ['a', 1],
        ['b', { x: 2 }],
      ]);
      const map3 = new Map([
        ['b', { x: 2 }],
        ['a', 1],
      ]);
      const map4 = new Map([
        ['a', 1],
        ['b', { x: 99 }],
      ]);

      expect(isSame(map1, map2)).toBe(true);
      expect(isSame(map1, map3)).toBe(false);
      expect(isSame(map1, map4)).toBe(false);
    });

    test('should compare Set objects correctly', () => {
      const set1 = new Set([1, { a: 2 }]);
      const set2 = new Set([1, { a: 2 }]);
      const set3 = new Set([{ a: 2 }, 1]);
      const set4 = new Set([1, { a: 99 }]);

      expect(isSame(set1, set2)).toBe(true);
      expect(isSame(set1, set3)).toBe(false);
      expect(isSame(set1, set4)).toBe(false);
    });

    test('should compare TypedArrays by value', () => {
      const arr1 = new Uint8Array([1, 2, 3]);
      const arr2 = new Uint8Array([1, 2, 3]);
      const arr3 = new Uint8Array([1, 2, 4]);
      const arr4 = new Float32Array([1, 2, 3]);

      expect(isSame(arr1, arr2)).toBe(true);
      expect(isSame(arr1, arr3)).toBe(false);
      expect(isSame(arr1, arr4)).toBe(false);
    });
  });
});
