import { describe, expect, test } from 'vitest';
import { isSame } from './is-same';

class MockClass {
  constructor(value) {
    this.value = value;
  }
}

describe('isSame function', () => {
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

      // Dates
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

      // Class Instances
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
});
