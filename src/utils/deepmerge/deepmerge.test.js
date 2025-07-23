import { describe, expect, test } from 'vitest';
import { deepMerge } from './deepmerge';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
class MockContainer {
  constructor(init = {}) {
    this.x = 0;
    this.y = 0;
    this.children = [1, 2];
    this.meta = { style: { color: 'red', width: 100 } };
    Object.assign(this, init);
  }
  addChild(child) {
    this.children.push(child);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Primitive / basic override                                              */
/* -------------------------------------------------------------------------- */
describe('deepMerge – primitive / basic combinations', () => {
  test.each([
    ['number → number', 1, 2, 2],
    ['number → array', 1, [2], [2]],
    ['number → object', 1, { a: 1 }, { a: 1 }],
    ['string → string', '1', '2', '2'],
    ['array → array', [1, 2, 3], ['1', true], ['1', true, 3]],
    ['array → object', [1, 2], { a: 1 }, { a: 1 }],
    ['object → array', { a: 1 }, [1, 2], [1, 2]],
  ])('%s', (_, left, right, expected) =>
    expect(deepMerge(left, right)).toEqual(expected),
  );
});

/* -------------------------------------------------------------------------- */
/* 2. Edge-case override                                                      */
/* -------------------------------------------------------------------------- */
describe('deepMerge – edge-case behavior', () => {
  test('object + undefined → object', () =>
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 }));

  test('undefined + object → object', () =>
    expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 }));

  test('date property override', () => {
    const l = { d: new Date('2024-01-01T00:00:00Z') };
    const r = { d: new Date('2025-01-01T00:00:00Z') };
    expect(deepMerge(l, r)).toEqual(r);
  });

  test('function property override', () => {
    const f1 = () => 1;
    const f2 = () => 2;
    expect(deepMerge({ f: f1 }, { f: f2 }).f).toBe(f2);
  });

  test('null / undefined mixing', () => {
    expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, null)).toBeNull();
    expect(deepMerge(undefined, [1, 2])).toEqual([1, 2]);
  });

  test('array duplicate id merges only once per target', () => {
    const left = { components: [{ id: 1, val: 1 }] };
    const right = {
      components: [
        { id: 1, val: 2 },
        { id: 1, val: 3 },
      ],
    };
    expect(deepMerge(left, right).components).toEqual([
      { id: 1, val: 2 },
      { id: 1, val: 3 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Array/Object merge priority (id → label → type)                         */
/* -------------------------------------------------------------------------- */
describe('deepMerge – mergeStrategy by id → label → type', () => {
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
          { id: 1, data: [30, 40], style: { color: 'blue', fontSize: 14 } },
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
    [
      {
        components: [],
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
        ],
      },
    ],
    [
      { components: [{ type: 'text', text: 'original' }] },
      { components: [null, { type: 'text', text: 'new' }] },
      { components: [null, { type: 'text', text: 'new' }] },
    ],
  ])('Case %#', (left, right, expected) => {
    expect(deepMerge(left, right)).toEqual(expected);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. MockContainer (Pixi) behaviour                                          */
/* -------------------------------------------------------------------------- */
describe('deepMerge – MockContainer replace / in-place', () => {
  test('plain object + container → container (replace)', () => {
    const result = deepMerge({ x: 10 }, new MockContainer());
    expect(result).toBeInstanceOf(Object);
    expect(result.children).toEqual([1, 2]);
  });

  test('container + container2 → container2 (replace)', () => {
    const c1 = new MockContainer();
    const c2 = new MockContainer({ x: 50 });
    expect(deepMerge(c1, c2)).toBe(c2);
    expect(c2.x).toBe(50);
  });

  test('container + undefined → container', () => {
    const container = new MockContainer();
    expect(deepMerge(container, undefined)).toEqual(container);
  });

  test('undefined + container → container', () => {
    const c = new MockContainer();
    expect(deepMerge(undefined, c)).toBe(c);
  });

  /* --- 추가 F. in-place primitive override --- */
  test('container in-place primitive key override', () => {
    const c = new MockContainer();
    deepMerge(c, { x: 999 });
    expect(c.x).toBe(999);
  });

  test('', () => {
    const parent = new MockContainer();
    const a = { parent: { parent: parent } };
    const b = { parent: { parent: { meta: { style: { height: 100 } } } } };

    expect(deepMerge(a, b).parent.parent).toBe(parent);
    expect(deepMerge(a, b).parent.parent.meta).toEqual({
      style: { color: 'red', width: 100, height: 100 },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Circular‑reference merging                                             */
/* -------------------------------------------------------------------------- */
describe('deepMerge – circular-reference MockContainer', () => {
  test('children & meta.style merge with self reference intact', () => {
    const container = new MockContainer();
    container.parent = container;
    const result = deepMerge(container, {
      children: [4],
      meta: { style: { height: 100 } },
    });

    expect(result).toBe(container);
    expect(result.children).toEqual([4, 2]);
    expect(result.meta).toEqual({
      style: { color: 'red', width: 100, height: 100 },
    });
    expect(container.children).toEqual([4, 2]);
    expect(container.meta).toEqual({
      style: { color: 'red', width: 100, height: 100 },
    });
    expect(container.parent).toBe(container);
  });

  /* --- Extra case C: self‑reference inside source object --- */
  test('source contains self-reference (no infinite loop)', () => {
    const target = {};
    const patch = { a: 1 };
    patch.self = patch;
    const out = deepMerge(target, patch);
    expect(out.a).toBe(1);
    expect(out.self).toBe(out);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Additional misc edge cases                                              */
/* -------------------------------------------------------------------------- */
describe('deepMerge – misc extras', () => {
  test('array element with function replaced', () => {
    const l = { comps: [{ id: 1, cb: () => 1 }] };
    const r = { comps: [{ id: 1, cb: () => 2 }] };
    expect(deepMerge(l, r).comps[0].cb()).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. New edge‑case coverage – Date root / Map object / circular in array     */
/* -------------------------------------------------------------------------- */
describe('deepMerge – additional edge‑case coverage', () => {
  test('root Date override replaces target Date', () => {
    const left = new Date('2020-01-01T00:00:00Z');
    const right = new Date('2025-01-01T00:00:00Z');
    expect(deepMerge(left, right)).toBe(right);
  });

  test('plain target replaced by non‑plain object (Map instance)', () => {
    const left = { a: 1 };
    const map = new Map([['k', 'v']]);
    const result = deepMerge(left, map);
    expect(result).toBe(map);
    expect(result.get('k')).toBe('v');
  });

  test('array element containing self‑reference merges without recursion error', () => {
    const selfObj = {};
    selfObj.self = selfObj;
    const left = { arr: [selfObj] };
    const right = { arr: [selfObj] };

    const merged = deepMerge(left, right);
    expect(merged.arr[0]).toBe(merged.arr[0].self);
  });

  test('Self-referential object merge', () => {
    const obj = {};
    obj.self = obj;
    const result = deepMerge(obj, obj);
    expect(result).toEqual(obj);
  });

  test('cross-reference objects in array cause range error with deepmerge', () => {
    const a = {};
    const b = {};
    a.next = b;
    b.prev = a;

    const left = [a];
    const right = [b];
    const result = deepMerge(left, right);
    expect(result).toEqual([a, b]);
  });
});

describe('deepMerge – mergeStrategy option', () => {
  test.each([
    {
      name: 'should replace array when mergeStrategy is "replace"',
      left: { arr: [1, 2, 3] },
      right: { arr: [4, 5] },
      options: { mergeStrategy: 'replace' },
      expected: { arr: [4, 5] },
    },
    {
      name: 'should merge arrays by default (no option)',
      left: { arr: [1, 2, 3] },
      right: { arr: [4, 5] },
      options: {},
      expected: { arr: [4, 5, 3] },
    },
    {
      name: 'should merge nested arrays when mergeStrategy is "replace" at top level',
      left: { nested: { arr: ['a', 'b'] } },
      right: { nested: { arr: ['c'] } },
      options: { mergeStrategy: 'replace' },
      expected: { nested: { arr: ['c'] } },
    },
    {
      name: 'should merge nested arrays when mergeStrategy is "replace" at second level',
      left: [{ source: '1', target: '2' }],
      right: [{ source: '2', target: '3' }],
      expected: [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
      ],
    },
  ])('$name', ({ left, right, options, expected }) => {
    expect(deepMerge(left, right, options)).toEqual(expected);
  });
});
