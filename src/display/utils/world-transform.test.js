import { describe, expect, it, vi } from 'vitest';
import { applyWorldFlip } from './world-flip';
import { applyWorldRotation } from './world-rotation';

describe('applyWorldRotation', () => {
  const createMockDisplayObject = (
    angle = 0,
    pivotX = 0,
    pivotY = 0,
    options = {},
  ) => ({
    angle,
    constructor: {
      keepsBasePivotDuringCompensation:
        options.keepsBasePivotDuringCompensation,
    },
    store: options.store ?? { world: null },
    parent: options.parent ?? null,
    pivot: {
      x: pivotX,
      y: pivotY,
      set: vi.fn(function (x, y) {
        this.x = x;
        this.y = y;
      }),
    },
    getLocalBounds: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 50 })),
  });

  it('should not change angle when compensation is 0 for upright item content', () => {
    const obj = createMockDisplayObject(10);
    const view = { angle: 0 };
    applyWorldRotation(obj, view);
    expect(obj.angle).toBe(10);
    expect(obj.pivot.set).not.toHaveBeenCalled();
  });

  it('should compensate 180 degrees for upright item content when screen rotation is upside down', () => {
    const obj = createMockDisplayObject(0); // Initial angle 0
    const view = { angle: 180 };
    applyWorldRotation(obj, view);

    expect(obj.angle).toBe(180); // 0 + 180
    // Pivot should be set to center of bounds (100/2, 50/2)
    expect(obj.pivot.set).toHaveBeenCalledWith(50, 25);
  });

  it('should compensate when screen rotation enters the upside-down range and not before it', () => {
    const obj = createMockDisplayObject(0);
    const viewAfterThreshold = { angle: 90 };
    applyWorldRotation(obj, viewAfterThreshold);
    expect(obj.angle).toBe(180);

    const objUnder = createMockDisplayObject(0);
    const viewUnderThreshold = { angle: 89 };
    applyWorldRotation(objUnder, viewUnderThreshold);
    expect(objUnder.angle).toBe(0);
  });

  it('should keep local angle stable across non-compensated screen rotations', () => {
    const obj = createMockDisplayObject(30);

    applyWorldRotation(obj, { angle: 10 });
    expect(obj.angle).toBe(30);

    applyWorldRotation(obj, { angle: 45 });
    expect(obj.angle).toBe(30);

    applyWorldRotation(obj, { angle: 89 });
    expect(obj.angle).toBe(30);
    expect(obj.pivot.set).not.toHaveBeenCalled();
  });

  it('should keep the same compensated angle inside threshold and restore on exit', () => {
    const obj = createMockDisplayObject(15, 7, 9);

    applyWorldRotation(obj, { angle: 100 });
    expect(obj.angle).toBe(195);

    applyWorldRotation(obj, { angle: 200 });
    expect(obj.angle).toBe(195);

    applyWorldRotation(obj, { angle: 280 });
    expect(obj.angle).toBe(15);
    expect(obj.pivot.x).toBe(7);
    expect(obj.pivot.y).toBe(9);
  });

  it('should keep pre-rotated angle stable across repeated threshold transitions', () => {
    const obj = createMockDisplayObject(30, 3, 4);

    applyWorldRotation(obj, { angle: 95 });
    expect(obj.angle).toBe(210);

    applyWorldRotation(obj, { angle: 260 });
    expect(obj.angle).toBe(210);

    applyWorldRotation(obj, { angle: 300 });
    expect(obj.angle).toBe(30);
    expect(obj.pivot.x).toBe(3);
    expect(obj.pivot.y).toBe(4);

    applyWorldRotation(obj, { angle: 180 });
    expect(obj.angle).toBe(210);

    applyWorldRotation(obj, { angle: 20 });
    expect(obj.angle).toBe(30);
    expect(obj.pivot.x).toBe(3);
    expect(obj.pivot.y).toBe(4);
  });

  it('should restore pivot when moving out of threshold', () => {
    const obj = createMockDisplayObject(0, 10, 10);

    // 1. Move into threshold
    applyWorldRotation(obj, { angle: 180 });
    expect(obj.pivot.x).toBe(50);

    // 2. Move out of threshold
    applyWorldRotation(obj, { angle: 0 });
    expect(obj.pivot.x).toBe(10); // Should restore original base pivot
  });

  it('should throw RangeError when bounds contain non-finite values', () => {
    const obj = createMockDisplayObject(0);
    obj.getLocalBounds.mockReturnValue({
      x: 0,
      y: 0,
      width: Number.NaN,
      height: 10,
    });

    expect(() => applyWorldRotation(obj, { angle: 180 })).toThrow(RangeError);
  });

  it('should apply upright item compensation using base + screen rotation reference', () => {
    const obj = createMockDisplayObject(35, 0, 0);
    obj.parent = {
      angle: 0,
      props: { contentOrientation: 'upright' },
      parent: null,
    };

    applyWorldRotation(obj, { angle: 30 });
    expect(obj.angle).toBeCloseTo(35);

    applyWorldRotation(obj, { angle: 120 });
    expect(obj.angle).toBeCloseTo(215);
  });

  it('should include parent accumulated angle in upright item compensation', () => {
    const world = {};
    const parent = {
      angle: 90,
      props: { contentOrientation: 'upright' },
      parent: world,
    };
    const obj = createMockDisplayObject(0, 5, 8, { store: { world }, parent });

    applyWorldRotation(obj, { angle: 0 });
    expect(obj.angle).toBeCloseTo(180);
    expect(obj.pivot.set).toHaveBeenCalledWith(50, 25);

    applyWorldRotation(obj, { angle: 190 });
    expect(obj.angle).toBeCloseTo(0);
  });

  it('should keep base pivot when center pivot is disabled', () => {
    const obj = createMockDisplayObject(10, 3, 7, {
      keepsBasePivotDuringCompensation: true,
    });
    obj.parent = {
      angle: 0,
      props: { contentOrientation: 'upright' },
      parent: null,
    };

    applyWorldRotation(obj, { angle: 120 });

    expect(obj.angle).toBeCloseTo(190);
    expect(obj.pivot.x).toBe(3);
    expect(obj.pivot.y).toBe(7);
    expect(obj.pivot.set).not.toHaveBeenCalledWith(50, 25);
  });

  it('should use upright item contract over component default behavior', () => {
    const obj = createMockDisplayObject(0, 0, 0);
    obj.parent = {
      angle: 180,
      props: { contentOrientation: 'upright' },
      parent: null,
    };

    applyWorldRotation(obj, { angle: 0 });

    expect(obj.angle).toBe(180);
  });
});

describe('applyWorldFlip', () => {
  const createMockDisplayObject = (scaleX = 1, scaleY = 1, options = {}) => ({
    angle: options.angle ?? 0,
    parent: options.parent ?? null,
    store: options.store ?? { world: null },
    scale: {
      x: scaleX,
      y: scaleY,
      set: vi.fn(function (x, y) {
        this.x = x;
        this.y = y;
      }),
    },
  });

  it('should flip scale.x when screen flipX is true', () => {
    const obj = createMockDisplayObject(1, 1);
    const view = { flipX: true, flipY: false };
    applyWorldFlip(obj, view);
    expect(obj.scale.set).toHaveBeenCalledWith(-1, 1);
  });

  it('should not flip if screen flip state has not changed', () => {
    const obj = createMockDisplayObject(1, 1);
    const view = { flipX: true, flipY: false };

    applyWorldFlip(obj, view); // First call
    expect(obj.scale.set).toHaveBeenCalledTimes(1);

    applyWorldFlip(obj, view); // Second call with same state
    expect(obj.scale.set).toHaveBeenCalledTimes(1);
  });

  it('should maintain original scale magnitude', () => {
    const obj = createMockDisplayObject(2, 0.5);
    const view = { flipX: true, flipY: true };
    applyWorldFlip(obj, view);
    expect(obj.scale.set).toHaveBeenCalledWith(-2, -0.5);
  });

  it('should map global flip axes into local axes for vertical basis', () => {
    const world = {};
    const parent = { angle: 90, parent: world };
    const obj = createMockDisplayObject(2, 3, {
      angle: 0,
      parent,
      store: { world },
    });

    applyWorldFlip(obj, { flipX: true, flipY: false });
    expect(obj.scale.set).toHaveBeenCalledWith(2, -3);

    applyWorldFlip(obj, { flipX: false, flipY: true });
    expect(obj.scale.set).toHaveBeenLastCalledWith(-2, 3);
  });

  it('should throw RangeError when scale is non-finite', () => {
    const obj = createMockDisplayObject(Number.NaN, 1);
    const view = { flipX: true, flipY: false };

    expect(() => applyWorldFlip(obj, view)).toThrow(RangeError);
  });
});
