import { Container, Rectangle } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  it('resolves JSONPath queries and always wraps results in an array', () => {
    const nestedItem = { id: 'item-a', type: 'item' };
    const group = { id: 'group', type: 'group', children: [nestedItem] };
    const directItem = { id: 'item-b', type: 'item' };
    const root = {
      children: [group, directItem],
    };

    expect(selector<{ id: string }>('$..children[?(@.type === "item")]', root)).toEqual([
      directItem,
      nestedItem,
    ]);
    expect(selector<string>('$.children[*].id', root)).toEqual(['group', 'item-b']);
    expect(selector('$..children[?(@.id === "missing")]', root)).toEqual([]);
  });
});

describe('convertLegacyData', () => {
  it('returns an independent clone without mutating or aliasing the input', () => {
    const input = [
      {
        type: 'group',
        children: [{ type: 'rect', size: { width: 20, height: 10 } }],
      },
    ];
    const converted = convertLegacyData(input);

    expect(converted).toEqual(input);
    expect(converted).not.toBe(input);
    expect(converted[0]).not.toBe(input[0]);
    expect(converted[0]?.children).not.toBe(input[0]?.children);

    const convertedRect = converted[0]?.children[0];
    if (convertedRect) convertedRect.size.width = 99;

    expect(input[0]?.children[0]?.size.width).toBe(20);
  });
});

describe('point helpers', () => {
  it('recognizes points clearly inside and outside rectangular bounds', () => {
    const bounds = { x: 10, y: 20, width: 30, height: 40 };

    expect(intersectPoint({ x: 25, y: 40 }, bounds)).toBe(true);
    expect(intersectPoint({ x: 9, y: 40 }, bounds)).toBe(false);
    expect(intersectPoint({ x: 25, y: 61 }, bounds)).toBe(false);
  });

  it('compares Euclidean pointer displacement with the movement threshold', () => {
    expect(isMoved({ x: 0, y: 0 }, { x: 6, y: 8 }, 9)).toBe(true);
    expect(isMoved({ x: 0, y: 0 }, { x: 3, y: 4 }, 6)).toBe(false);
    expect(isMoved({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(isMoved({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  });
});

describe('findIntersectObject', () => {
  const boundedContainer = (label: string, bounds: Rectangle): Container => {
    const container = new Container({ label });
    container.boundsArea = bounds;
    return container;
  };

  it('returns the topmost visible and renderable object containing the point', () => {
    const lower = boundedContainer('lower', new Rectangle(0, 0, 20, 20));
    const upper = boundedContainer('upper', new Rectangle(5, 5, 20, 20));

    expect(findIntersectObject([lower, upper], { x: 10, y: 10 })).toBe(upper);

    upper.visible = false;
    expect(findIntersectObject([lower, upper], { x: 10, y: 10 })).toBe(lower);

    lower.renderable = false;
    expect(findIntersectObject([lower, upper], { x: 10, y: 10 })).toBeNull();

    lower.destroy();
    upper.destroy();
  });

  it('returns null when no object contains the point', () => {
    const object = boundedContainer('object', new Rectangle(0, 0, 10, 10));

    expect(findIntersectObject([object], { x: 20, y: 20 })).toBeNull();

    object.destroy();
  });
});
