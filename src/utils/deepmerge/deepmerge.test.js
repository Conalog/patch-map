import { describe, expect, test } from 'vitest';
import { deepMerge } from './deepmerge';

// -----------------------------------------------------------------------------
// Primitive merging
// -----------------------------------------------------------------------------
describe('deepMerge – primitive override behavior', () => {
  test('number overrides number', () => {
    expect(deepMerge(123, 456)).toBe(456);
  });

  test('string overrides string', () => {
    expect(deepMerge('123', '456')).toBe('456');
  });
});

// -----------------------------------------------------------------------------
// Edge cases
// -----------------------------------------------------------------------------
describe('deepMerge – edge case behavior', () => {
  test('object + undefined → undefined', () => {
    expect(deepMerge({ a: 1 }, undefined)).toBeUndefined();
  });

  test('undefined + object → object', () => {
    expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
  });

  test('replace object with array', () => {
    expect(deepMerge({ a: 1 }, [1, 2])).toEqual([1, 2]);
  });

  test('date property override', () => {
    const left = { d: new Date('2024-01-01T00:00:00Z') };
    const right = { d: new Date('2025-01-01T00:00:00Z') };
    expect(deepMerge(left, right)).toEqual(right);
  });

  test('function property override', () => {
    const f1 = () => 1;
    const f2 = () => 2;
    expect(deepMerge({ f: f1 }, { f: f2 }).f).toBe(f2);
  });

  test('array duplicate id merges only once per target element', () => {
    const left = { components: [{ id: 1, val: 1 }] };
    const right = {
      components: [
        { id: 1, val: 2 },
        { id: 1, val: 3 },
      ],
    };
    const result = deepMerge(left, right);
    expect(result.components).toEqual([
      { id: 1, val: 2 },
      { id: 1, val: 3 },
    ]);
  });
});

// -----------------------------------------------------------------------------
// Array/Object merging (id → label → type 우선순위)
// -----------------------------------------------------------------------------
describe('deepMerge - arrayMerge by id → name → type', () => {
  test.each([
    [
      {
        show: true,
        components: [{ id: 1, data: [10, 20], style: { color: 'blue' } }],
      },
      {
        show: false,
        components: [{ id: 1, data: [30, 40], style: { fontSize: 14 } }],
      },
      {
        show: false,
        components: [
          {
            id: 1,
            data: [30, 40],
            style: { color: 'blue', fontSize: 14 },
          },
        ],
      },
    ],
    [
      {
        components: [
          { label: 'legend', visible: true, style: { color: 'red' } },
        ],
      },
      {
        components: [{ label: 'legend', style: { fontSize: 12 } }],
      },
      {
        components: [
          {
            label: 'legend',
            visible: true,
            style: { color: 'red', fontSize: 12 },
          },
        ],
      },
    ],
    [
      { components: [{ type: 'bar', width: 100 }] },
      { components: [{ type: 'bar', height: 200 }] },
      { components: [{ type: 'bar', width: 100, height: 200 }] },
    ],
    [
      { components: [{ id: 1, value: 10 }] },
      {
        components: [
          { id: 2, value: 20 },
          { label: 'title' },
          { type: 'pie', data: [1] },
        ],
      },
      {
        components: [
          { id: 1, value: 10 },
          { id: 2, value: 20 },
          { label: 'title' },
          { type: 'pie', data: [1] },
        ],
      },
    ],
    [
      {
        show: true,
        components: [
          { id: 100, type: 'bar', data: [1], style: { color: 'blue' } },
          { label: 'legend', visible: false },
        ],
      },
      {
        show: false,
        components: [
          { id: 100, style: { fontSize: 14 }, data: [2, 3] },
          { type: 'bar', data: [5] },
          { label: 'legend', visible: true },
          { extraProp: true },
        ],
      },
      {
        show: false,
        components: [
          {
            id: 100,
            type: 'bar',
            data: [2, 3],
            style: { color: 'blue', fontSize: 14 },
          },
          { label: 'legend', visible: true },
          { type: 'bar', data: [5] },
          { extraProp: true },
        ],
      },
    ],
    [
      {
        components: [
          { type: 'text', text: '1' },
          { type: 'text', text: '2' },
          { type: 'text', text: '3' },
          { type: 'text', text: '4' },
        ],
      },
      {
        components: [
          { type: 'text', text: '5' },
          { type: 'text', text: '6' },
          { type: 'text', text: '7' },
        ],
      },
      {
        components: [
          { type: 'text', text: '5' },
          { type: 'text', text: '6' },
          { type: 'text', text: '7' },
          { type: 'text', text: '4' },
        ],
      },
    ],
  ])('Case %#', (left, right, expected) => {
    const result = deepMerge(left, right);
    expect(result).toEqual(expected);
  });
});
