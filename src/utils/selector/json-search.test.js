import { describe, expect, it } from 'vitest';
import { JSONSearch } from './json-search';

// Test data: covers PATCH MAP structure and README examples
const sample = {
  // 1. Primitive
  a: 1,
  b: { c: 2, d: [3, 4] },

  // 2. Array/2D array/nested object
  arr: [
    { x: 10, y: 20, deep: { z: 100, deeper: { w: 999 } } },
    { x: 30, y: 40, deep: { z: 200, deeper: { w: 888 } } },
  ],
  deepArr: [[{ y: 1 }, { y: 2, z: { w: 3 } }], [{ y: 4 }]],

  // 3. Deep nested object
  nested: {
    level1: {
      level2: {
        level3: {
          value: 1234,
          arr: [{ foo: 'bar' }, { foo: 'baz', deep: { wow: 42 } }],
        },
      },
    },
  },

  // 4. PATCH MAP/README hierarchical items
  items: [
    {
      type: 'group',
      id: 'group-1',
      label: 'group-label-1',
      items: [
        { type: 'grid', id: 1 },
        { type: 'item', id: 2 },
        { type: 'grid', id: 'grid-1', label: 'grid-label-1' },
      ],
    },
    {
      type: 'group',
      id: 'group-2',
      items: [{ type: 'grid', id: 3 }],
    },
    {
      type: 'item',
      id: 'item-1',
      items: [{ type: 'grid', id: 4 }],
    },
  ],
};

describe('JSONSearch', () => {
  describe('Primitive', () => {
    it('value: $.a', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.a', json: sample });
      expect(result).toEqual([1]);
    });
    it('nested: $.b.c', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.b.c', json: sample });
      expect(result).toEqual([2]);
    });
    it('array index: $.b.d[0]', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.b.d[0]', json: sample });
      expect(result).toEqual([3]);
    });
  });

  describe('Array', () => {
    it('all x: $.arr[*].x', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.arr[*].x', json: sample });
      expect(result).toEqual([10, 30]);
    });
    it('deep z: $.arr[*].deep.z', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.arr[*].deep.z', json: sample });
      expect(result).toEqual([100, 200]);
    });
    it('desc w: $..w', () => {
      const result = JSONSearch({ resultType: 'value', path: '$..w', json: sample });
      expect(result).toEqual([999, 888, 3]);
    });
    it('2d y: $.deepArr[*][*].y', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.deepArr[*][*].y', json: sample });
      expect(result).toEqual([1, 2, 4]);
    });
  });

  describe('Deep', () => {
    it('deep value: $.nested.level1.level2.level3.value', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.nested.level1.level2.level3.value', json: sample });
      expect(result).toEqual([1234]);
    });
    it('deep foo: $.nested.level1.level2.level3.arr[*].foo', () => {
      const result = JSONSearch({
        resultType: 'value',
        path: '$.nested.level1.level2.level3.arr[*].foo',
        json: sample,
      });
      expect(result).toEqual(['bar', 'baz']);
    });
    it('deep wow: $.nested.level1.level2.level3.arr[*].deep.wow', () => {
      const result = JSONSearch({
        resultType: 'value',
        path: '$.nested.level1.level2.level3.arr[*].deep.wow',
        json: sample,
      });
      expect(result).toEqual([42]);
    });
  });

  describe('Options', () => {
    it('searchableKeys: $..bar', () => {
      const obj = { foo: [{ bar: 1 }, { bar: 2 }], baz: [{ bar: 3 }] };
      const result = JSONSearch({ resultType: 'value', searchableKeys: ['baz'], path: '$..bar', json: obj });
      expect(result).toEqual([3]);
    });
    it('no searchableKeys: $..bar', () => {
      const obj = { foo: [{ bar: 1 }, { bar: 2 }], baz: [{ bar: 3 }] };
      const result = JSONSearch({ resultType: 'value', path: '$..bar', json: obj });
      expect(result).toEqual([1, 2, 3]);
    });
    it('not exist: $.notExist', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.notExist', json: sample });
      expect(result).toEqual([]);
    });
    it('null: $.a', () => {
      expect(() => {
        JSONSearch({ resultType: 'value', path: '$.a', json: null });
      }).toThrow();
    });
    it('undefined: $.a', () => {
      expect(() => {
        JSONSearch({ resultType: 'value', path: '$.a', json: undefined });
      }).toThrow();
    });
    it('empty searchableKeys: $..bar', () => {
      const obj = { foo: [{ bar: 1 }], baz: [{ bar: 2 }] };
      const result = JSONSearch({ resultType: 'value', searchableKeys: ['notExist'], path: '$..bar', json: obj });
      expect(result).toEqual([]);
    });
  });

  describe('ResultType', () => {
    it('path: $.arr[*].x', () => {
      const result = JSONSearch({ resultType: 'path', path: '$.arr[*].x', json: sample });
      expect(result.every((v) => typeof v === 'string')).toBe(true);
    });
    it('pointer: $.arr[*].x', () => {
      const result = JSONSearch({
        resultType: 'pointer',
        path: '$.arr[*].x',
        json: sample,
      });
      expect(result.every((v) => typeof v === 'string' && v.startsWith('/'))).toBe(true);
    });
    it('filter: $.arr[?(@.x>10)].x', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.arr[?(@.x>10)].x', json: sample });
      expect(result).toEqual([30]);
    });
    it('flatten: $.arr[*].x', () => {
      const result = JSONSearch({ resultType: 'value', path: '$.arr[*].x', json: sample, flatten: false });
      expect(Array.isArray(result[0])).toBe(false);
    });
  });

  describe('Selector', () => {
    it('label: $..[?(@.label=="group-label-1")]', () => {
      const result = JSONSearch({ resultType: 'value', path: '$..[?(@.label=="group-label-1")]', json: sample });
      expect(result).toEqual([expect.objectContaining({ label: 'group-label-1' })]);
    });
    it('type group: $..[?(@.type=="group")]', () => {
      const result = JSONSearch({ resultType: 'value', path: '$..[?(@.type=="group")]', json: sample });
      expect(result.every((v) => v.type === 'group')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
    it('type grid: $..[?(@.type=="grid")]', () => {
      const result = JSONSearch({ resultType: 'value', path: '$..[?(@.type=="grid")]', json: sample });
      expect(result.every((v) => v.type === 'grid')).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
    it('id grid-1: $..[?(@.id=="grid-1")]', () => {
      const result = JSONSearch({ resultType: 'value', path: '$..[?(@.id=="grid-1")]', json: sample });
      expect(result).toEqual([expect.objectContaining({ id: 'grid-1' })]);
    });
    it('chained filter: $..items[?(@.type=="group")].items[?(@.type=="grid")]', () => {
      const result = JSONSearch({
        resultType: 'value',
        path: '$..items[?(@.type=="group")].items[?(@.type=="grid")]',
        json: sample,
      });
      expect(result).toEqual(
        expect.arrayContaining([
          { type: 'grid', id: 1 },
          { type: 'grid', id: 'grid-1', label: 'grid-label-1' },
          { type: 'grid', id: 3 },
        ]),
      );
      expect(result.length).toBe(3);
    });
  });
});
