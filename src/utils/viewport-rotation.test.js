import { describe, expect, it, vi } from 'vitest';
import {
  getViewportWorldCenter,
  getWorldLocalCenter,
} from './viewport-rotation';

describe('viewport-rotation', () => {
  it('getViewportWorldCenter returns world center from viewport screen center', () => {
    const viewport = {
      screenWidth: 200,
      screenHeight: 100,
      toWorld: vi.fn(() => ({ x: 10, y: 20 })),
    };

    const center = getViewportWorldCenter(viewport);

    expect(viewport.toWorld).toHaveBeenCalledWith(100, 50);
    expect(center).toEqual({ x: 10, y: 20 });
  });

  it('getWorldLocalCenter converts viewport world center to world local coordinates', () => {
    const viewport = {
      screenWidth: 200,
      screenHeight: 100,
      toWorld: vi.fn(() => ({ x: 30, y: 40 })),
    };
    const world = {
      parent: { id: 'parent' },
      toLocal: vi.fn(() => ({ x: 5, y: 6 })),
    };

    const center = getWorldLocalCenter(viewport, world);

    expect(world.toLocal).toHaveBeenCalledWith({ x: 30, y: 40 }, world.parent);
    expect(center).toEqual({ x: 5, y: 6 });
  });
});
