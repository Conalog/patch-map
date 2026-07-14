import { Container, Rectangle } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SelectionState,
  type SelectionDragCallback,
  type SelectionNode,
  type SelectionPointerEvent,
  type SelectionStateOptions,
  type SelectionTargetCallback,
} from '../src/selection-state';
import { StateManager } from '../src/state';

interface SceneNodeOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

const createNode = (
  id: string,
  type: string,
  options: SceneNodeOptions = {},
): SelectionNode => {
  const node = new Container() as SelectionNode;
  node.id = id;
  node.type = type;
  node.props = { id, type, locked: false };
  node.position.set(options.x ?? 0, options.y ?? 0);
  if (options.width !== undefined || options.height !== undefined) {
    node.boundsArea = new Rectangle(
      0,
      0,
      options.width ?? 0,
      options.height ?? 0,
    );
  }
  return node;
};

const pointerEvent = (
  overrides: Partial<SelectionPointerEvent> = {},
): SelectionPointerEvent => ({
  pointerId: 1,
  button: 0,
  detail: 1,
  ...overrides,
});

const click = (
  state: SelectionState,
  target: Container,
  overrides: Partial<SelectionPointerEvent> = {},
): void => {
  const down = pointerEvent({ target, ...overrides });
  const up = pointerEvent({ target, ...overrides });
  state.pointerdown(down);
  state.pointerup(up);
};

describe('SelectionState', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  const activate = (
    world: Container,
    options: SelectionStateOptions,
    viewport?: Container,
  ): { manager: StateManager; state: SelectionState } => {
    const manager = new StateManager({
      patchmap: { world, viewport: viewport ?? world },
    });
    manager.register('selection', SelectionState);
    manager.setState('selection', options);
    const state = manager.current as SelectionState;
    cleanups.push(() => {
      manager.destroy();
      if (!world.destroyed) world.destroy({ children: true });
      if (viewport && viewport !== world && !viewport.destroyed) {
        viewport.destroy({ children: true });
      }
    });
    return { manager, state };
  };

  it('declares raw Pixi event names and separates click, double-click, and right-click', () => {
    expect(SelectionState.handledEvents).toEqual([
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointerupoutside',
      'click',
      'tap',
      'rightclick',
      'pointerover',
    ]);

    const world = new Container();
    const item = createNode('item', 'item', { width: 20, height: 20 });
    world.addChild(item);
    const onDown = vi.fn();
    const onUp = vi.fn();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const onRightClick = vi.fn();
    const { state } = activate(world, {
      onDown,
      onUp,
      onClick,
      onDoubleClick,
      onRightClick,
    });

    click(state, item, { detail: 1 });
    click(state, item, { detail: 2 });

    expect(onDown).toHaveBeenCalledTimes(2);
    expect(onUp).toHaveBeenCalledTimes(2);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toBe(item);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick.mock.calls[0]?.[0]).toBe(item);

    const preventDefault = vi.fn();
    const preventNativeDefault = vi.fn();
    const rightEvent = pointerEvent({
      target: item,
      button: 2,
      preventDefault,
      nativeEvent: { preventDefault: preventNativeDefault },
    });
    state.pointerdown(rightEvent);
    state.rightclick(rightEvent);

    expect(onDown).toHaveBeenCalledTimes(3);
    expect(onDown).toHaveBeenLastCalledWith(item, rightEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(preventNativeDefault).toHaveBeenCalledOnce();
    expect(onRightClick).toHaveBeenCalledWith(item, rightEvent);
  });

  it('uses Pixi click detail for native click and double-click dispatch', () => {
    const world = new Container();
    const item = createNode('item', 'item', { width: 20, height: 20 });
    world.addChild(item);
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const { state } = activate(world, { onClick, onDoubleClick });
    const first = pointerEvent({ target: item, detail: 1 });
    const second = pointerEvent({ target: item, detail: 2 });

    state.click(first);
    state.click(second);

    expect(onClick).toHaveBeenCalledWith(item, first);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).toHaveBeenCalledWith(item, second);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('routes the documented touch tap alias through one click callback', () => {
    const world = new Container();
    const item = createNode('item', 'item', { width: 20, height: 20 });
    world.addChild(item);
    const onClick = vi.fn();
    const { state } = activate(world, { onClick });
    const event = pointerEvent({
      target: world,
      global: { x: 10, y: 10 },
      detail: 1,
    });

    state.tap(event);

    expect(onClick).toHaveBeenCalledWith(item, event);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('starts box selection once after the movement threshold and reports live ordered results', () => {
    const world = new Container();
    const first = createNode('first', 'rect', {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    });
    const second = createNode('second', 'rect', {
      x: 40,
      y: 10,
      width: 10,
      height: 10,
    });
    world.addChild(first, second);
    const onUp = vi.fn();
    const onClick = vi.fn();
    const onDragStart = vi.fn();
    const onDrag = vi.fn<SelectionDragCallback>();
    const onDragEnd = vi.fn();
    const { state } = activate(world, {
      draggable: true,
      onUp,
      onClick,
      onDragStart,
      onDrag,
      onDragEnd,
    });

    state.pointerdown(pointerEvent({ target: world, global: { x: 0, y: 0 } }));
    state.pointermove(pointerEvent({ target: world, global: { x: 2, y: 2 } }));
    expect(onDragStart).not.toHaveBeenCalled();

    state.pointermove(pointerEvent({ target: world, global: { x: 25, y: 25 } }));
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDragStart.mock.calls[0]?.[0]).toEqual([first]);
    expect(onDrag.mock.calls[0]?.[0]).toEqual([first]);
    expect(world.children.at(-1)?.label).toBe('patch-map-selection-box');

    state.pointermove(pointerEvent({ target: world, global: { x: 60, y: 30 } }));
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDrag.mock.calls[1]?.[0]).toEqual([first, second]);

    const upEvent = pointerEvent({ target: world, global: { x: 60, y: 30 } });
    state.pointerup(upEvent);
    expect(onDragEnd).toHaveBeenCalledWith([first, second], upEvent);
    state.click(pointerEvent({ target: world, global: { x: 60, y: 30 } }));
    expect(onUp).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(world.children).toEqual([first, second]);
  });

  it('accumulates paint-selection targets without creating a box overlay', () => {
    const world = new Container();
    const first = createNode('first', 'rect', {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    });
    const second = createNode('second', 'rect', {
      x: 40,
      y: 10,
      width: 10,
      height: 10,
    });
    const middle = createNode('middle', 'rect', {
      x: 25,
      y: 10,
      width: 5,
      height: 10,
    });
    world.addChild(first, middle, second);
    const onDragStart = vi.fn();
    const onDrag = vi.fn<SelectionDragCallback>();
    const onDragEnd = vi.fn();
    const onUp = vi.fn();
    const { state } = activate(world, {
      draggable: true,
      paintSelection: true,
      onDragStart,
      onDrag,
      onDragEnd,
      onUp,
    });

    state.pointerdown(pointerEvent({ target: first, global: { x: 12, y: 12 } }));
    state.pointermove(pointerEvent({ target: second, global: { x: 42, y: 12 } }));
    state.pointermove(pointerEvent({ target: first, global: { x: 12, y: 12 } }));
    state.pointerup(pointerEvent({ target: first, global: { x: 12, y: 12 } }));

    expect(onDragStart.mock.calls[0]?.[0]).toEqual([first, middle, second]);
    expect(onDrag.mock.calls.map((call) => call[0])).toEqual([
      [first, middle, second],
      [first, middle, second],
    ]);
    expect(onDragEnd.mock.calls[0]?.[0]).toEqual([first, middle, second]);
    expect(onUp.mock.calls[0]?.[0]).toBe(first);
    expect(world.children).toEqual([first, middle, second]);
  });

  it.each([
    ['entity', 'item'],
    ['closestGroup', 'near'],
    ['highestGroup', 'top'],
    ['grid', 'grid'],
  ] as const)('resolves the %s selection unit', (selectUnit, expectedId) => {
    const world = new Container();
    const top = createNode('top', 'group');
    const near = createNode('near', 'group');
    const grid = createNode('grid', 'grid');
    const item = createNode('item', 'item', { width: 10, height: 10 });
    grid.addChild(item);
    near.addChild(grid);
    top.addChild(near);
    world.addChild(top);
    const onClick = vi.fn<SelectionTargetCallback>();
    const { state } = activate(world, { selectUnit, onClick });

    click(state, item);

    expect((onClick.mock.calls[0]?.[0] as SelectionNode).id).toBe(expectedId);
  });

  it('uses the grid unit for deep selection through event or active modifiers', () => {
    const world = new Container();
    const top = createNode('top', 'group');
    const grid = createNode('grid', 'grid');
    const item = createNode('item', 'item', { width: 10, height: 10 });
    grid.addChild(item);
    top.addChild(grid);
    world.addChild(top);
    const onClick = vi.fn<SelectionTargetCallback>();
    const { manager, state } = activate(world, {
      selectUnit: 'highestGroup',
      deepSelect: true,
      onClick,
    });

    click(state, item, { ctrlKey: true });
    manager.activateModifier('meta');
    click(state, item);

    expect(onClick.mock.calls.map((call) => call[0])).toEqual([grid, grid]);
  });

  it('applies the filter to the resolved selection unit', () => {
    const world = new Container();
    const blocked = createNode('blocked', 'group');
    const blockedLeaf = createNode('blocked-leaf', 'rect', {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    });
    blocked.addChild(blockedLeaf);
    const allowed = createNode('allowed', 'rect', {
      x: 40,
      y: 10,
      width: 10,
      height: 10,
    });
    world.addChild(blocked, allowed);
    const onClick = vi.fn();
    const onDragEnd = vi.fn();
    const filter = vi.fn((node: SelectionNode) => node.id !== 'blocked');
    const { state } = activate(world, {
      draggable: true,
      selectUnit: 'closestGroup',
      filter,
      onClick,
      onDragEnd,
    });

    click(state, blockedLeaf);
    expect(onClick).toHaveBeenCalledWith(null, expect.anything());
    expect(filter.mock.calls.map(([node]) => node)).toEqual([
      blocked,
      blocked,
      blocked,
    ]);

    state.pointerdown(pointerEvent({ target: world, global: { x: 0, y: 0 } }));
    state.pointermove(pointerEvent({ target: world, global: { x: 60, y: 30 } }));
    state.pointerup(pointerEvent({ target: world, global: { x: 60, y: 30 } }));
    expect(onDragEnd.mock.calls[0]?.[0]).toEqual([allowed]);
  });

  it('uses native click detail for drill-down without inventing a timing window', () => {
    const world = new Container();
    const top = createNode('top', 'group');
    const near = createNode('near', 'group');
    const item = createNode('item', 'item', { width: 10, height: 10 });
    near.addChild(item);
    top.addChild(near);
    world.addChild(top);
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const { state } = activate(world, {
      selectUnit: 'highestGroup',
      drillDown: true,
      onClick,
      onDoubleClick,
    });

    click(state, item, { detail: 1 });
    click(state, item, { detail: 2 });

    expect(onClick.mock.calls[0]?.[0]).toBe(top);
    expect(onDoubleClick.mock.calls[0]?.[0]).toBe(near);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('deduplicates hover targets, suppresses hover while dragging, and cleans up on pause', () => {
    const world = new Container();
    const first = createNode('first', 'rect', {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
    });
    const second = createNode('second', 'rect', {
      x: 40,
      y: 10,
      width: 10,
      height: 10,
    });
    world.addChild(first, second);
    const onOver = vi.fn<SelectionTargetCallback>();
    const onDrag = vi.fn();
    const { state } = activate(world, { draggable: true, onOver, onDrag });

    state.pointerover(pointerEvent({ target: first }));
    state.pointerover(pointerEvent({ target: first }));
    state.pointerover(pointerEvent({ target: second }));
    expect(onOver.mock.calls.map((call) => call[0])).toEqual([first, second]);

    state.pointerdown(pointerEvent({ target: world, global: { x: 0, y: 0 } }));
    state.pointermove(pointerEvent({ target: world, global: { x: 25, y: 25 } }));
    state.pointerover(pointerEvent({ target: first }));
    expect(onOver).toHaveBeenCalledTimes(2);
    expect(world.children.at(-1)?.label).toBe('patch-map-selection-box');

    state.pause();
    expect(world.children).toEqual([first, second]);
    state.pointermove(pointerEvent({ target: world, global: { x: 60, y: 30 } }));
    expect(onDrag).toHaveBeenCalledTimes(1);

    state.destroy();
    expect(state.store).toBeNull();
  });
});
