import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import { FlipController, RotationController } from '../src/controllers';

const host = () => ({
  world: new Container(),
  emit: vi.fn<(event: string, payload: unknown) => boolean>(() => true),
  syncViewTransform: vi.fn<() => void>(),
});

describe('view controllers', () => {
  it('applies finite degree rotation and emits controller changes', () => {
    const target = host();
    const rotation = new RotationController(target);

    rotation.value = 90;
    expect(rotation.rotateBy(45)).toBe(135);
    expect(rotation.reset()).toBe(0);
    rotation.value = Number.NaN;

    expect(rotation.value).toBe(0);
    expect(target.world.angle).toBe(0);
    expect(target.syncViewTransform).toHaveBeenCalledTimes(3);
    expect(target.emit).toHaveBeenLastCalledWith('patchmap:rotated', {
      target,
      value: 0,
    });
    target.world.destroy();
  });

  it('preserves rotation while independently toggling world flip axes', () => {
    const target = host();
    const rotation = new RotationController(target);
    const flip = new FlipController(target);
    rotation.value = 30;

    expect(flip.set({ x: true })).toEqual({ x: true, y: false });
    expect(flip.toggleY()).toBe(true);
    expect(target.world.angle).toBeCloseTo(30);
    expect(target.world.scale.x).toBe(-1);
    expect(target.world.scale.y).toBe(-1);
    expect(flip.reset()).toEqual({ x: false, y: false });
    expect(target.emit).toHaveBeenLastCalledWith('patchmap:flipped', {
      target,
      x: false,
      y: false,
    });
    target.world.destroy();
  });

  it('apply synchronizes existing state without emitting', () => {
    const target = host();
    const rotation = new RotationController(target);
    const flip = new FlipController(target);
    rotation.value = 45;
    flip.x = true;
    target.emit.mockClear();
    target.syncViewTransform.mockClear();

    rotation.apply();
    flip.apply();

    expect(target.world.angle).toBe(45);
    expect(target.world.scale.x).toBe(-1);
    expect(target.emit).not.toHaveBeenCalled();
    expect(target.syncViewTransform).toHaveBeenCalledTimes(2);
    target.world.destroy();
  });

  it('restores the pre-initialized state without emitting or touching the host', () => {
    const target = host();
    const rotation = new RotationController(target);
    const flip = new FlipController(target);
    rotation.value = 45;
    flip.set({ x: true, y: true });
    target.emit.mockClear();
    target.syncViewTransform.mockClear();

    rotation.restoreInitialState();
    flip.restoreInitialState();

    expect(rotation.value).toBe(0);
    expect({ x: flip.x, y: flip.y }).toEqual({ x: false, y: false });
    expect(target.emit).not.toHaveBeenCalled();
    expect(target.syncViewTransform).not.toHaveBeenCalled();
    target.world.destroy();
  });
});
