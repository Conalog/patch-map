import { describe, expect, test } from 'vitest';
import { diffJson } from './diff-json';

describe('diffJson function tests', () => {
  test.each([
    {
      name: 'Identical objects',
      obj1: { a: 1, b: 2 },
      obj2: { a: 1, b: 2 },
      expected: {},
    },
    {
      name: 'obj2 is null',
      obj1: { a: 1, b: 2 },
      obj2: null,
      expected: { a: 1, b: 2 },
    },
    {
      name: 'Key only in obj2',
      obj1: { a: 1 },
      obj2: { a: 1, b: 2 },
      expected: { b: 2 },
    },
    {
      name: 'Different value for the same key',
      obj1: { a: 1, b: 'hello' },
      obj2: { a: 1, b: 'world' },
      expected: { b: 'world' },
    },
    {
      name: 'Nested object - some property differs',
      obj1: {
        nested: { one: 1, two: 2 },
      },
      obj2: {
        nested: { one: 1, two: 3 },
      },
      expected: {
        nested: { two: 3 },
      },
    },
    {
      name: 'Nested object - obj2 has a new key',
      obj1: {
        nested: { x: 10 },
      },
      obj2: {
        nested: { x: 10, y: 20 },
      },
      expected: {
        nested: { y: 20 },
      },
    },
    {
      name: 'Deeply nested - some property differs',
      obj1: {
        level1: {
          level2: { value: 10, unchanged: 'same' },
        },
      },
      obj2: {
        level1: {
          level2: { value: 99, unchanged: 'same' },
        },
      },
      expected: {
        level1: {
          level2: { value: 99 },
        },
      },
    },
    {
      name: 'Deeply nested - key only in obj2',
      obj1: {
        level1: {
          level2: { name: 'Alice' },
        },
      },
      obj2: {
        level1: {
          level2: { name: 'Alice', age: 30 },
        },
      },
      expected: {
        level1: {
          level2: { age: 30 },
        },
      },
    },
    {
      name: 'Array - new item in obj2',
      obj1: {
        level1: {
          level2: { names: ['Alice', 'Bob'] },
        },
      },
      obj2: {
        level1: {
          level2: { names: ['Alice', 'Bob', 'Charlie'] },
        },
      },
      expected: {
        level1: {
          level2: { names: ['Alice', 'Bob', 'Charlie'] },
        },
      },
    },
    {
      name: 'Array of objects - new item in obj2',
      obj1: {
        level1: {
          level2: { people: [{ name: 'Alice' }, { name: 'Bob' }] },
        },
      },
      obj2: {
        level1: {
          level2: {
            people: [{ name: '1234' }, { name: 'Bob' }, { name: 'Charlie' }],
          },
        },
      },
      expected: {
        level1: {
          level2: {
            people: [{ name: '1234' }, { name: 'Bob' }, { name: 'Charlie' }],
          },
        },
      },
    },
    {
      name: 'Identical arrays of objects should return an empty object',
      obj1: {
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'b' },
        ],
      },
      obj2: {
        data: [
          { id: 1, value: 'a' },
          { id: 2, value: 'b' },
        ],
      },
      expected: {},
    },
    {
      name: 'Different arrays of objects should return the new array',
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
  ])('$name', ({ obj1, obj2, expected }) => {
    const result = diffJson(obj1, obj2);
    expect(result).toEqual(expected);
  });
});
