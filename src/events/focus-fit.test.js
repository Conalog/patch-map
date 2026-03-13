import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/bounds', () => ({
  calcGroupOrientedBounds: vi.fn((objects) => ({
    center: {
      x: objects.reduce((sum, obj) => sum + obj.centerX, 0),
      y: objects.reduce((sum, obj) => sum + obj.centerY, 0),
    },
    innerBounds: {
      width: objects.reduce((sum, obj) => sum + obj.width, 0),
      height: objects.reduce((sum, obj) => sum + obj.height, 0),
    },
  })),
}));

vi.mock('../utils/selector/selector', () => ({
  selector: vi.fn(),
}));

vi.mock('./schema', async () => {
  const actual = await vi.importActual('./schema');
  return {
    ...actual,
    parseFitOptions: vi.fn(actual.parseFitOptions),
  };
});

import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { fit as fitViewport, focus as focusViewport } from './focus-fit';
import { parseFitOptions } from './schema';

const createTarget = (id, overrides = {}) => ({
  id,
  type: 'rect',
  children: [],
  centerX: 10,
  centerY: 20,
  width: 30,
  height: 40,
  ...overrides,
});

const createViewport = (children = [], overrides = {}) => ({
  id: 'viewport',
  type: 'canvas',
  children,
  scale: { x: 2, y: 4 },
  moveCenter: vi.fn(),
  fit: vi.fn(),
  toLocal: vi.fn((point) => point),
  ...overrides,
});

const linkChildren = (parent, children) => {
  parent.children = children;
  children.forEach((child) => {
    child.parent = parent;
  });
  return parent;
};

const markAsElement = (node, isElement = true) => {
  node.constructor = { isElement };
  return node;
};

describe('focus-fit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts null ids with filter options for focus and resolves managed viewport targets', () => {
    const background = markAsElement(createTarget('background-image'));
    const node = markAsElement(
      createTarget('node-1', { centerX: 5, centerY: 6 }),
    );
    const viewport = createViewport([background, node]);

    focusViewport(viewport, null, {
      filter: (obj) => obj.id !== 'background-image',
    });

    expect(selector).not.toHaveBeenCalled();
    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([node]);
    expect(viewport.moveCenter).toHaveBeenCalledWith(5, 6);
  });

  it('applies filter after resolving explicit ids', () => {
    const viewport = createViewport();
    const keep = markAsElement(
      createTarget('node-1', { centerX: 11, centerY: 12 }),
    );
    const skip = markAsElement(createTarget('node-2'));
    vi.mocked(selector).mockReturnValue([keep, skip]);

    focusViewport(viewport, ['node-1', 'node-2'], {
      filter: (obj) => obj.id !== 'node-2',
    });

    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([keep]);
    expect(viewport.moveCenter).toHaveBeenCalledWith(11, 12);
  });

  it('returns null when the filter removes every managed target', () => {
    const viewport = createViewport([
      markAsElement(createTarget('background-image')),
    ]);

    const result = focusViewport(viewport, null, {
      filter: () => false,
    });

    expect(result).toBeNull();
    expect(calcGroupOrientedBounds).not.toHaveBeenCalled();
    expect(viewport.moveCenter).not.toHaveBeenCalled();
  });

  it('fits selected objects with merged padding using viewport-space padding', () => {
    const target = markAsElement(
      createTarget('item-1', { width: 100, height: 40 }),
    );
    const viewport = createViewport([], {
      toLocal: vi.fn(() => ({ x: 25, y: 30 })),
    });
    vi.mocked(selector).mockReturnValue([target]);

    fitViewport(viewport, 'item-1', { padding: { y: 10, x: 5 } });

    expect(selector).toHaveBeenCalledWith(
      viewport,
      '$..children[?(@.type != null && @.parent.type !== "item" && @.parent.type !== "relations")]',
    );
    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([target]);
    expect(viewport.moveCenter).toHaveBeenCalledWith(25, 30);
    expect(viewport.fit).toHaveBeenCalledWith(true, 60, 30);
  });

  it('centers selected objects without fitting when using focus', () => {
    const target = markAsElement(
      createTarget('item-2', { centerX: 10, centerY: 20 }),
    );
    const viewport = createViewport([], {
      toLocal: vi.fn(() => ({ x: 10, y: 20 })),
    });
    vi.mocked(selector).mockReturnValue([target]);

    focusViewport(viewport, 'item-2');

    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([target]);
    expect(viewport.moveCenter).toHaveBeenCalledWith(10, 20);
    expect(viewport.fit).not.toHaveBeenCalled();
    expect(parseFitOptions).not.toHaveBeenCalled();
  });

  it('returns null without moving when no matching objects are found', () => {
    vi.mocked(selector).mockReturnValue([]);
    const viewport = createViewport();

    const result = fitViewport(viewport, 'missing-id');

    expect(result).toBeNull();
    expect(calcGroupOrientedBounds).not.toHaveBeenCalled();
    expect(viewport.moveCenter).not.toHaveBeenCalled();
    expect(viewport.fit).not.toHaveBeenCalled();
  });

  it('still validates fit options when no matching objects are found', () => {
    vi.mocked(selector).mockReturnValue([]);
    const viewport = createViewport();

    expect(() =>
      fitViewport(viewport, 'missing-id', { padding: { top: 8 } }),
    ).toThrow();

    expect(parseFitOptions).toHaveBeenCalledWith({ padding: { top: 8 } });
    expect(viewport.moveCenter).not.toHaveBeenCalled();
    expect(viewport.fit).not.toHaveBeenCalled();
  });

  it('rejects an options object passed as the first argument', () => {
    const viewport = createViewport();

    expect(() => focusViewport(viewport, {})).toThrow(/string|array/i);
  });

  it('rejects a filter options object passed as the first argument', () => {
    const viewport = createViewport();

    expect(() =>
      fitViewport(viewport, {
        filter: () => true,
      }),
    ).toThrow();
  });

  it('throws for unknown fit option keys', () => {
    const viewport = createViewport();

    expect(() =>
      fitViewport(viewport, 'item-1', { padding: { top: 8 }, extra: true }),
    ).toThrow();
  });

  it('throws for unknown padding keys', () => {
    const viewport = createViewport();

    expect(() =>
      fitViewport(viewport, 'item-1', {
        padding: { top: 8 },
      }),
    ).toThrow();
  });

  it('rejects a non-function filter', () => {
    const viewport = createViewport();

    expect(() => fitViewport(viewport, ['node-1'], { filter: 'nope' })).toThrow(
      /function/i,
    );
  });

  it('does not move the viewport before rejecting invalid fit options', () => {
    const viewport = createViewport();

    expect(() =>
      fitViewport(viewport, 'item-1', { padding: { top: 8 } }),
    ).toThrow();

    expect(viewport.moveCenter).not.toHaveBeenCalled();
    expect(viewport.fit).not.toHaveBeenCalled();
  });

  it('accepts null ids with filter options for fit and applies fit math to filtered targets', () => {
    const background = markAsElement(
      createTarget('background-image', { width: 400, height: 200 }),
    );
    const node = markAsElement(
      createTarget('node-1', {
        centerX: 9,
        centerY: 7,
        width: 100,
        height: 80,
      }),
    );
    const viewport = createViewport([background, node]);

    fitViewport(viewport, null, {
      filter: (obj) => obj.id === 'node-1',
    });

    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([node]);
    expect(viewport.moveCenter).toHaveBeenCalledWith(9, 7);
    expect(viewport.fit).toHaveBeenCalledWith(true, 82, 52);
  });

  it('uses filtered child contributors instead of the parent group bounds', () => {
    const childA = markAsElement(
      createTarget('child-a', {
        centerX: 3,
        centerY: 4,
        width: 10,
        height: 20,
      }),
    );
    const childB = markAsElement(
      createTarget('child-b', {
        centerX: 100,
        centerY: 200,
        width: 500,
        height: 600,
      }),
    );
    const group = markAsElement(
      linkChildren(
        createTarget('group-1', {
          type: 'group',
          width: 999,
          height: 999,
        }),
        [childA, childB],
      ),
    );
    const viewport = createViewport([group]);
    vi.mocked(selector).mockReturnValue([group, childA, childB]);

    fitViewport(viewport, 'group-1', {
      filter: (obj) => obj.id !== 'child-b',
      padding: 0,
    });

    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([childA]);
    expect(viewport.fit).toHaveBeenCalledWith(true, 5, 5);
  });

  it('dedupes contributors when a container and its child are both explicitly targeted', () => {
    const child = markAsElement(
      createTarget('child-1', { centerX: 8, centerY: 9 }),
    );
    const group = markAsElement(
      linkChildren(createTarget('group-1', { type: 'group' }), [child]),
    );
    const viewport = createViewport([group]);
    vi.mocked(selector).mockReturnValue([group, child]);

    focusViewport(viewport, ['group-1', 'child-1']);

    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([child]);
  });

  it('ignores typed non-element nodes in both traversal and id lookup', () => {
    const item = markAsElement(createTarget('item-1', { type: 'item' }));
    const rawTypedChild = markAsElement(
      {
        id: 'custom-1',
        type: 'custom',
        children: [],
        parent: null,
        centerX: 999,
        centerY: 999,
        width: 999,
        height: 999,
      },
      false,
    );
    const viewport = createViewport([item, rawTypedChild]);
    rawTypedChild.parent = viewport;
    vi.mocked(selector).mockReturnValue([item, rawTypedChild]);

    focusViewport(viewport);
    expect(calcGroupOrientedBounds).toHaveBeenLastCalledWith([item]);

    const byId = focusViewport(viewport, 'custom-1');
    expect(byId).toBeNull();
  });

  it('parses fit options only for fit calls', () => {
    const target = markAsElement(createTarget('item-1'));
    const viewport = createViewport();
    vi.mocked(selector).mockReturnValue([target]);

    fitViewport(viewport, 'item-1', { padding: { x: 5 } });

    expect(parseFitOptions).toHaveBeenCalledWith({ padding: { x: 5 } });
  });
});
