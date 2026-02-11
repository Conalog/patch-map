import { describe, expect, it, vi } from 'vitest';
import { ROTATION_THRESHOLD } from '../mixins/constants';
import { applyWorldFlip } from './world-flip';
import { applyWorldRotation } from './world-rotation';

describe('applyWorldRotation', () => {
  const createMockDisplayObject = (angle = 0, pivotX = 0, pivotY = 0) => ({
    angle,
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

  it('should not change angle when compensation is 0 (readable mode)', () => {
    const obj = createMockDisplayObject(10);
    const view = { angle: 0 };
    applyWorldRotation(obj, view);
    expect(obj.angle).toBe(10);
    expect(obj.pivot.set).not.toHaveBeenCalled();
  });

  it('should compensate 180 degrees in readable mode when view is upside down', () => {
    const obj = createMockDisplayObject(0); // Initial angle 0
    const view = { angle: 180 };
    applyWorldRotation(obj, view);

    expect(obj.angle).toBe(180); // 0 + 180
    // Pivot should be set to center of bounds (100/2, 50/2)
    expect(obj.pivot.set).toHaveBeenCalledWith(50, 25);
  });

  it('should use ROTATION_THRESHOLD for readable mode boundary', () => {
    const obj = createMockDisplayObject(0);
    const viewAfterThreshold = { angle: ROTATION_THRESHOLD.MIN };
    applyWorldRotation(obj, viewAfterThreshold);
    expect(obj.angle).toBe(180);

    const objUnder = createMockDisplayObject(0);
    const viewUnderThreshold = { angle: ROTATION_THRESHOLD.MIN - 1 };
    applyWorldRotation(objUnder, viewUnderThreshold);
    expect(objUnder.angle).toBe(0);
  });

  it('should keep local angle stable across non-compensated view angles', () => {
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
});

describe('applyWorldFlip', () => {
  const createMockDisplayObject = (scaleX = 1, scaleY = 1) => ({
    scale: {
      x: scaleX,
      y: scaleY,
      set: vi.fn(function (x, y) {
        this.x = x;
        this.y = y;
      }),
    },
  });

  it('should flip scale.x when view.flipX is true', () => {
    const obj = createMockDisplayObject(1, 1);
    const view = { flipX: true, flipY: false };
    applyWorldFlip(obj, view);
    expect(obj.scale.set).toHaveBeenCalledWith(-1, 1);
  });

  it('should not flip if view state has not changed', () => {
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

  it('should throw RangeError when scale is non-finite', () => {
    const obj = createMockDisplayObject(Number.NaN, 1);
    const view = { flipX: true, flipY: false };

    expect(() => applyWorldFlip(obj, view)).toThrow(RangeError);
  });
});
