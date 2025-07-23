import { describe, expect, test } from 'vitest';
import { createPatch } from './create-patch';

// --- 테스트용 Mock 클래스 ---
class MockClass {
  constructor(value) {
    this.value = value;
  }
}

describe('createPatch function tests', () => {
  test.each([
    {
      name: 'should return an empty object for identical objects',
      obj1: { a: 1, b: 2 },
      obj2: { a: 1, b: 2 },
      expected: {},
    },
    {
      name: 'should return the new value for a changed primitive',
      obj1: { a: 1, b: 'hello' },
      obj2: { a: 1, b: 'world' },
      expected: { b: 'world' },
    },
    {
      name: 'should return an object with the new key',
      obj1: { a: 1 },
      obj2: { a: 1, b: 2 },
      expected: { b: 2 },
    },
    {
      name: 'should not return keys that were removed in obj2',
      obj1: { a: 1, b: 2 },
      obj2: { a: 1 },
      expected: {},
    },
  ])('Basic Changes: $name', ({ obj1, obj2, expected }) => {
    expect(createPatch(obj1, obj2)).toEqual(expected);
  });

  test.each([
    {
      name: 'should return a patch for a changed nested property',
      obj1: { nested: { one: 1, two: 2 } },
      obj2: { nested: { one: 1, two: 3 } },
      expected: { nested: { two: 3 } },
    },
    {
      name: 'should return a patch for a new key in a nested object',
      obj1: { nested: { x: 10 } },
      obj2: { nested: { x: 10, y: 20 } },
      expected: { nested: { y: 20 } },
    },
    {
      name: 'should return a deeply nested patch',
      obj1: { level1: { level2: { value: 10 } } },
      obj2: { level1: { level2: { value: 99 } } },
      expected: { level1: { level2: { value: 99 } } },
    },
  ])('Nested Objects: $name', ({ obj1, obj2, expected }) => {
    expect(createPatch(obj1, obj2)).toEqual(expected);
  });

  test.each([
    {
      name: 'should return an empty object for identical arrays',
      obj1: { data: [1, { a: 2 }] },
      obj2: { data: [1, { a: 2 }] },
      expected: {},
    },
    {
      name: 'should return the entire new array if length changes',
      obj1: { data: ['Alice', 'Bob'] },
      obj2: { data: ['Alice', 'Bob', 'Charlie'] },
      expected: { data: ['Alice', 'Bob', 'Charlie'] },
    },
    {
      name: 'should return the entire new array if an element changes',
      obj1: { data: [{ id: 1 }, { id: 2 }] },
      obj2: { data: [{ id: 1 }, { id: 3 }] },
      expected: { data: [{ id: 1 }, { id: 3 }] },
    },
  ])('Arrays: $name', ({ obj1, obj2, expected }) => {
    expect(createPatch(obj1, obj2)).toEqual(expected);
  });

  test.each([
    {
      name: 'should return obj2 when obj1 is null',
      obj1: null,
      obj2: { a: 1 },
      expected: { a: 1 },
    },
    {
      name: 'should return null when obj2 is null',
      obj1: { a: 1 },
      obj2: null,
      expected: null,
    },
    {
      name: 'should return undefined when obj2 is undefined',
      obj1: { a: 1 },
      obj2: undefined,
      expected: undefined,
    },
    {
      name: 'should return empty object for two null values',
      obj1: null,
      obj2: null,
      expected: {},
    },
    {
      name: 'should return empty object for two undefined values',
      obj1: undefined,
      obj2: undefined,
      expected: {},
    },
    {
      name: 'should return the new value when changing from null to undefined',
      obj1: { value: null },
      obj2: { value: undefined },
      expected: { value: undefined },
    },
    {
      name: 'should return the new value when changing from function to undefined',
      obj1: { value: () => 1 },
      obj2: { value: undefined },
      expected: { value: undefined },
    },
    {
      name: 'should return the new Date object if dates differ',
      obj1: { date: new Date('2024-01-01') },
      obj2: { date: new Date('2025-01-01') },
      expected: { date: new Date('2025-01-01') },
    },
    {
      name: 'should return empty object for identical Date objects',
      obj1: { date: new Date('2024-01-01') },
      obj2: { date: new Date('2024-01-01') },
      expected: {},
    },
    {
      name: 'should return the new class instance if values differ',
      obj1: { instance: new MockClass(10) },
      obj2: { instance: new MockClass(20) },
      expected: { instance: new MockClass(20) },
    },
    {
      name: 'should return empty object for identical class instances',
      obj1: { instance: new MockClass(10) },
      obj2: { instance: new MockClass(10) },
      expected: {},
    },
  ])('Edge Cases: $name', ({ obj1, obj2, expected }) => {
    expect(createPatch(obj1, obj2)).toEqual(expected);
  });

  test('[Function] should return the new function if functions differ', () => {
    const func1 = () => 1;
    const func2 = () => 2;
    const obj1 = { action: func1 };
    const obj2 = { action: func2 };

    const result = createPatch(obj1, obj2);
    expect(result.action).toBe(func2);
  });
});
