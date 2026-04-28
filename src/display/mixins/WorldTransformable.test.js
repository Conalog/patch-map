import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/world-flip', () => ({
  applyWorldFlip: vi.fn(),
}));

vi.mock('../utils/world-rotation', () => ({
  applyWorldRotation: vi.fn(),
}));

import { applyWorldFlip } from '../utils/world-flip';
import { applyWorldRotation } from '../utils/world-rotation';
import { WorldTransformable } from './WorldTransformable';

const createMockViewport = () => ({
  on: vi.fn(),
  off: vi.fn(),
});

class MockBase {
  constructor({ store, parent }) {
    this.store = store;
    this.parent = parent;
    this.destroyed = false;
    this.props = {
      placement: 'bottom',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    };
    this.scale = {
      x: 1,
      y: 1,
      set: vi.fn((x, y) => {
        this.scale.x = x;
        this.scale.y = y;
      }),
    };
    this.pivot = {
      x: 0,
      y: 0,
      set: vi.fn((x, y) => {
        this.pivot.x = x;
        this.pivot.y = y;
      }),
    };
    this.position = {
      x: 0,
      y: 0,
      set: vi.fn((x, y) => {
        this.position.x = x;
        this.position.y = y;
      }),
    };
    this.angle = 0;
    this._bounds = { x: 0, y: 0, width: 100, height: 20 };
    this.getLocalBounds = vi.fn(() => this._bounds);
  }

  setBounds(nextBounds) {
    this._bounds = nextBounds;
  }

  _afterRender() {}

  destroy() {
    this.destroyed = true;
  }
}

describe('WorldTransformable', () => {
  beforeEach(() => {
    vi.mocked(applyWorldRotation).mockReset();
    vi.mocked(applyWorldFlip).mockReset();
  });

  it('re-applies world transform when bounds change after first render', () => {
    const world = {};
    const viewport = createMockViewport();
    const parent = { angle: 180, parent: world };
    const TestClass = WorldTransformable(MockBase);
    const instance = new TestClass({
      store: {
        world,
        viewport,
        view: { angle: 0, flipX: false, flipY: false },
      },
      parent,
    });
    instance._applyPlacement = vi.fn();

    vi.mocked(applyWorldRotation).mockClear();
    vi.mocked(applyWorldFlip).mockClear();

    instance._afterRender();
    expect(applyWorldRotation).toHaveBeenCalledTimes(1);
    expect(applyWorldFlip).toHaveBeenCalledTimes(1);
    expect(instance._applyPlacement).toHaveBeenCalledTimes(1);

    vi.mocked(applyWorldRotation).mockClear();
    vi.mocked(applyWorldFlip).mockClear();
    instance._applyPlacement.mockClear();

    instance._afterRender();
    expect(applyWorldRotation).not.toHaveBeenCalled();
    expect(applyWorldFlip).not.toHaveBeenCalled();
    expect(instance._applyPlacement).not.toHaveBeenCalled();

    instance.setBounds({ x: 0, y: 0, width: 140.8, height: 10 });
    instance._afterRender();
    expect(applyWorldRotation).toHaveBeenCalledTimes(1);
    expect(applyWorldFlip).toHaveBeenCalledTimes(1);
    expect(instance._applyPlacement).toHaveBeenCalledTimes(1);
  });

  it('skips parent chain and bounds polling while the viewport is dragging', () => {
    const world = {};
    const viewport = createMockViewport();
    viewport.moving = false;
    const parent = { angle: 0, parent: world };
    const TestClass = WorldTransformable(MockBase);
    const instance = new TestClass({
      store: {
        world,
        viewport,
        view: { angle: 0, flipX: false, flipY: false },
      },
      parent,
    });
    instance._applyPlacement = vi.fn();

    instance._afterRender();
    instance.getLocalBounds.mockClear();
    vi.mocked(applyWorldRotation).mockClear();
    vi.mocked(applyWorldFlip).mockClear();
    instance._applyPlacement.mockClear();

    viewport.moving = true;
    for (let i = 0; i < 10; i += 1) {
      instance._afterRender();
    }

    expect(instance.getLocalBounds).not.toHaveBeenCalled();
    expect(applyWorldRotation).not.toHaveBeenCalled();
    expect(applyWorldFlip).not.toHaveBeenCalled();
    expect(instance._applyPlacement).not.toHaveBeenCalled();

    viewport.moving = false;
    instance.setBounds({ x: 0, y: 0, width: 120, height: 20 });
    instance._afterRender();

    expect(instance.getLocalBounds).toHaveBeenCalledTimes(1);
    expect(applyWorldRotation).toHaveBeenCalledTimes(1);
    expect(applyWorldFlip).toHaveBeenCalledTimes(1);
    expect(instance._applyPlacement).toHaveBeenCalledTimes(1);
  });

  it('stops polling bounds after the world transform settles', () => {
    const world = {};
    const viewport = createMockViewport();
    const parent = { angle: 0, parent: world };
    const TestClass = WorldTransformable(MockBase);
    const instance = new TestClass({
      store: {
        world,
        viewport,
        view: { angle: 0, flipX: false, flipY: false },
      },
      parent,
    });
    instance._applyPlacement = vi.fn();

    instance._afterRender();
    instance._afterRender();
    instance._afterRender();
    instance.getLocalBounds.mockClear();
    vi.mocked(applyWorldRotation).mockClear();
    vi.mocked(applyWorldFlip).mockClear();
    instance._applyPlacement.mockClear();

    for (let i = 0; i < 10; i += 1) {
      instance._afterRender();
    }

    expect(instance.getLocalBounds).not.toHaveBeenCalled();
    expect(applyWorldRotation).not.toHaveBeenCalled();
    expect(applyWorldFlip).not.toHaveBeenCalled();
    expect(instance._applyPlacement).not.toHaveBeenCalled();

    instance.setBounds({ x: 0, y: 0, width: 130, height: 20 });
    instance._markWorldTransformBoundsDirty();
    instance._afterRender();

    expect(instance.getLocalBounds).toHaveBeenCalledTimes(1);
    expect(applyWorldRotation).toHaveBeenCalledTimes(1);
    expect(applyWorldFlip).toHaveBeenCalledTimes(1);
    expect(instance._applyPlacement).toHaveBeenCalledTimes(1);
  });
});
