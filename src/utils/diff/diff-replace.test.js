import { describe, expect, test } from 'vitest';
import { diffReplace } from './diff-replace';

class MockClass {
  constructor(value) {
    this.value = value;
  }
  getValue() {
    return this.value;
  }
}

describe('diffReplace function tests', () => {
  test.each([
    {
      name: 'should replace the entire object if a property is removed',
      obj1: {
        style: { width: 2, color: '#0C73BF', cap: 'round' },
        meta: { unchanged: true },
      },
      obj2: {
        style: { width: 2, color: '#0C73BF' },
        meta: { unchanged: true },
      },
      expected: { style: { width: 2, color: '#0C73BF' } },
    },
    {
      name: 'should replace the entire object if a property is added',
      obj1: { style: { width: 2, color: '#0C73BF' } },
      obj2: { style: { width: 2, color: '#0C73BF', cap: 'round' } },
      expected: { style: { width: 2, color: '#0C73BF', cap: 'round' } },
    },
    {
      name: 'should replace a deeply nested object when its property changes',
      obj1: {
        level1: {
          level2: { value: 10, config: { enabled: true } },
          static: 'A',
        },
      },
      obj2: {
        level1: {
          level2: { value: 10, config: { enabled: false } },
          static: 'A',
        },
      },
      expected: {
        level1: {
          level2: { value: 10, config: { enabled: false } },
          static: 'A',
        },
      },
    },
  ])('$name', ({ obj1, obj2, expected }) => {
    expect(diffReplace(obj1, obj2)).toStrictEqual(expected);
  });

  test.each([
    {
      name: 'Identical objects and primitives should return an empty object',
      obj1: { a: 1, b: { c: 3 } },
      obj2: { a: 1, b: { c: 3 } },
      expected: {},
    },
    {
      name: 'A new key at the root level should be added',
      obj1: { a: 1 },
      obj2: { a: 1, b: 2 },
      expected: { b: 2 },
    },
    {
      name: 'A changed primitive value should be updated',
      obj1: { a: 1, b: 'hello' },
      obj2: { a: 1, b: 'world' },
      expected: { b: 'world' },
    },
  ])('$name', ({ obj1, obj2, expected }) => {
    expect(diffReplace(obj1, obj2)).toStrictEqual(expected);
  });

  test.each([
    {
      name: 'should return an empty object for identical arrays',
      obj1: { data: [{ id: 1, value: 'a' }] },
      obj2: { data: [{ id: 1, value: 'a' }] },
      expected: {},
    },
    {
      name: 'should replace the entire array if an element inside it changes',
      obj1: {
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'b' },
        ],
      },
      obj2: {
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'c' },
        ],
      },
      expected: {
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'c' },
        ],
      },
    },
    {
      name: 'should replace the entire array if its length changes',
      obj1: { data: [{ id: 1, value: 'a' }] },
      obj2: {
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'b' },
        ],
      },
      expected: {
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'b' },
        ],
      },
    },
  ])('$name', ({ obj1, obj2, expected }) => {
    expect(diffReplace(obj1, obj2)).toStrictEqual(expected);
  });

  test.each([
    {
      name: 'should return obj2 when obj1 is null',
      obj1: null,
      obj2: { a: 1 },
      expected: { a: 1 },
    },
    {
      name: 'should return obj1 when obj2 is null',
      obj1: { a: 1 },
      obj2: null,
      expected: null,
    },
    {
      name: 'should handle replacement of an object with a primitive',
      obj1: { data: { isObject: true } },
      obj2: { data: 'isPrimitive' },
      expected: { data: 'isPrimitive' },
    },
    {
      name: 'should handle replacement of a primitive with an object',
      obj1: { data: 'isPrimitive' },
      obj2: { data: { isObject: true } },
      expected: { data: { isObject: true } },
    },
    {
      name: 'should handle null vs undefined in nested objects',
      obj1: { config: { setting: 'on', value: null } },
      obj2: { config: { setting: 'on', value: undefined } },
      expected: { config: { setting: 'on', value: undefined } },
    },
  ])('$name', ({ obj1, obj2, expected }) => {
    expect(diffReplace(obj1, obj2)).toStrictEqual(expected);
  });

  test.each([
    {
      name: '[Class Instance] should return empty object for identical class instances',
      obj1: { data: new MockClass(10) },
      obj2: { data: new MockClass(10) },
      expected: {},
    },
    {
      name: '[Class Instance] should return the new instance if properties differ',
      obj1: { data: new MockClass(10) },
      obj2: { data: new MockClass(20) },
      expected: { data: new MockClass(20) },
    },
    {
      name: '[Date Object] should return empty object for identical dates',
      obj1: { timestamp: new Date('2024-01-01') },
      obj2: { timestamp: new Date('2024-01-01') },
      expected: {},
    },
    {
      name: '[Date Object] should return the new date if dates differ',
      obj1: { timestamp: new Date('2024-01-01') },
      obj2: { timestamp: new Date('2025-01-01') },
      expected: { timestamp: new Date('2025-01-01') },
    },
    {
      name: '[Mixed Types] should handle mix of plain objects, instances, and primitives',
      obj1: { id: 1, config: { a: 1 }, instance: new MockClass(1) },
      obj2: { id: 1, config: { a: 2 }, instance: new MockClass(2) },
      expected: {
        config: { a: 2 },
        instance: new MockClass(2),
      },
    },
  ])('$name', ({ obj1, obj2, expected }) => {
    const result = diffReplace(obj1, obj2);
    if (typeof expected.action === 'function') {
      expect(result.action).toBe(expected.action);
    } else {
      expect(result).toStrictEqual(expected);
    }
  });

  test('[Function] should return the new function if functions differ', () => {
    const func1 = () => 1;
    const func2 = () => 2;
    const obj1 = { action: func1 };
    const obj2 = { action: func2 };

    const result = diffReplace(obj1, obj2);
    expect(result.action).toBe(func2);
  });

  test('[Function] should return an empty object for identical function references', () => {
    const func1 = () => 1;
    const obj1 = { action: func1 };
    const obj2 = { action: func1 };
    expect(diffReplace(obj1, obj2)).toStrictEqual({});
  });

  describe('Critical Edge Cases for diffReplace', () => {
    test('should NOT throw error on circular references and return correct diff', () => {
      const obj1 = { name: 'obj1' };
      obj1.self = obj1;

      const obj2 = { name: 'obj2' };
      obj2.self = obj2;

      const obj3 = { name: 'obj1' };
      obj3.self = obj3;

      expect(() => diffReplace(obj1, obj2)).not.toThrow();
      expect(diffReplace(obj1, obj2)).toStrictEqual({
        name: 'obj2',
        self: obj2,
      });
      expect(diffReplace(obj1, obj3)).toStrictEqual({});
    });

    test('should replace object when a property is changed from a value to undefined', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { a: 1, b: undefined, c: 3 };

      expect(diffReplace(obj1, obj2)).toStrictEqual({ b: undefined });
    });

    test('should replace object when a property is removed', () => {
      const obj1 = { a: { a: 1 }, b: 2, c: 3 };
      const obj2 = { a: { a: 1 } };

      expect(diffReplace(obj1, obj2)).toStrictEqual({});
      expect(diffReplace(obj2, obj1)).toStrictEqual({ b: 2, c: 3 });
    });

    test('should replace array when sparse vs undefined elements are present', () => {
      const obj1 = { data: [1, null, 3] };
      const obj2 = { data: [1, undefined, 3] };

      expect(diffReplace(obj1, obj2)).toStrictEqual({
        data: [1, undefined, 3],
      });
    });

    test('should correctly diff objects with different prototypes', () => {
      const obj1 = { a: 1 };
      const obj2 = Object.create(null);
      obj2.a = 1;

      expect(diffReplace(obj1, obj2)).toStrictEqual(obj2);
    });
  });
});
