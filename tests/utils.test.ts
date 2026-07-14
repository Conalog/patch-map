import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

import {
  convertLegacyData,
  findIntersectObject,
  intersectPoint,
  isMoved,
  selector,
  uid,
} from '../src';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uid', () => {
  it('returns identifiers from the public safe alphabet', () => {
    const identifiers = Array.from({ length: 256 }, () => uid());

    expect(identifiers.every((identifier) => /^[0-9A-Z_a-z-]{15}$/.test(identifier))).toBe(
      true,
    );
    expect(new Set(identifiers)).toHaveLength(identifiers.length);
  });

  it('retains a browser-compatible fallback when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(uid()).toBe('000000000000000');
  });
});

describe('selector', () => {
  it('resolves value-then-path JSONPath queries and flattens collection matches', () => {
    const nestedItem = { id: 'item-a', type: 'item' };
    const group = { id: 'group', type: 'group', children: [nestedItem] };
    const directItem = { id: 'item-b', type: 'item' };
    const root = {
      children: [group, directItem],
    };

    expect(selector<{ id: string }>(root, '$..children[?(@.type === "item")]')).toEqual([
      directItem,
      nestedItem,
    ]);
    expect(selector<string>(root, '$.children[*].id')).toEqual(['group', 'item-b']);
    expect(selector(root, '$..children')).toEqual([group, directItem, nestedItem]);
    expect(selector(root, '$..children[?(@.id === "missing")]')).toEqual([]);
  });

  it('preserves the API-102 omitted and reversed-argument outcomes', () => {
    expect(selector('$')).toEqual([]);
    expect(selector()).toEqual([]);
    expect(() => selector('$..children', { children: [] })).toThrow(
      new TypeError('r.replaceAll is not a function'),
    );
    expect(() => selector('', { children: [] })).toThrow(
      expect.objectContaining({
        name: 'NewError',
        message:
          'JSONPath should not be called with "new" (it prevents return of (unwrapped) scalar values)',
      }),
    );
  });
});

describe('convertLegacyData', () => {
  it('converts grouped legacy entries without mutating the input', () => {
    const input = {
      devices: [{
        id: 'legacy-device',
        properties: {
          transform: { x: 12, y: 18, angle: 15 },
          size: { width: 30, height: 16 },
          status: 'ready',
        },
      }],
    };
    const before = structuredClone(input);
    const converted = convertLegacyData(input);

    expect(converted).toEqual([{
      type: 'item',
      id: 'legacy-device',
      size: 40,
      components: [
        {
          type: 'background',
          source: {
            type: 'rect',
            fill: 'white',
            borderWidth: 2,
            borderColor: 'primary.default',
            radius: 6,
          },
        },
        {
          type: 'icon',
          source: 'device',
          size: 24,
          tint: 'primary.default',
          placement: 'center',
        },
        {
          type: 'bar',
          show: false,
          size: '100%',
          source: { type: 'rect', radius: 3, fill: 'white' },
          tint: 'primary.default',
        },
      ],
      attrs: {
        x: 12,
        y: 18,
        metadata: { size: { width: 30, height: 16 }, status: 'ready' },
        display: 'device',
        zIndex: 10,
      },
    }]);
    expect(input).toEqual(before);
  });

  it('preserves the public standalone failure for current map arrays', () => {
    expect(() => convertLegacyData([{ type: 'rect', size: 20 }])).toThrow(
      new TypeError('n is not iterable'),
    );
  });
});

describe('point helpers', () => {
  it('recognizes a point only when the first argument is a live bounds handle', () => {
    const bounds = { x: 10, y: 20, width: 30, height: 40 };
    const element = { getBounds: () => bounds };

    expect(intersectPoint(element, { x: 25, y: 40 })).toBe(true);
    expect(intersectPoint(element, { x: 9, y: 40 })).toBe(false);
    expect(intersectPoint({ x: 25, y: 40 }, bounds)).toBe(false);
    expect(intersectPoint()).toBe(false);
  });

  it('compares Euclidean pointer displacement with the movement threshold', () => {
    expect(isMoved({ x: 0, y: 0 }, { x: 6, y: 8 }, 9)).toBe(true);
    expect(isMoved({ x: 0, y: 0 }, { x: 3, y: 4 }, 6)).toBe(false);
    expect(isMoved({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(isMoved({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
    expect(isMoved(0, 0, 1)).toBe(false);
    expect(isMoved()).toBe(false);
    expect(isMoved(null, null)).toBe(false);
  });
});

describe('findIntersectObject', () => {
  const boundedContainer = (
    label: string,
    bounds: { x: number; y: number; width: number; height: number },
  ): Container => ({
    label,
    children: [],
    getBounds: () => bounds,
  }) as unknown as Container;

  const rootWith = (...children: Container[]): Container => ({
    children,
  }) as unknown as Container;

  it('returns the first direct child containing the point', () => {
    const first = boundedContainer('first', { x: 0, y: 0, width: 20, height: 20 });
    const second = boundedContainer('second', { x: 5, y: 5, width: 20, height: 20 });
    const root = rootWith(first, second);

    expect(findIntersectObject(root, { x: 10, y: 10 })).toBe(first);
  });

  it('returns null when no object contains the point', () => {
    const object = boundedContainer('object', { x: 0, y: 0, width: 10, height: 10 });

    expect(findIntersectObject(rootWith(object), { x: 20, y: 20 })).toBeNull();
    expect(findIntersectObject(object, { x: 5, y: 5 })).toBeNull();
  });

  it('preserves the public invalid-root errors', () => {
    expect(() => findIntersectObject([] as unknown as Container, { x: 1, y: 1 })).toThrow(
      new TypeError('r.children is not iterable'),
    );
    expect(() => findIntersectObject()).toThrow(
      new TypeError("Cannot read properties of undefined (reading 'children')"),
    );
  });
});
