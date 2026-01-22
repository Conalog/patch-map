import { describe, expect, it, vi } from 'vitest';
import { moveViewportCenter } from './viewport-rotation';

describe('moveViewportCenter', () => {
  it('uses moveCenter when angle is zero', () => {
    const viewport = {
      rotation: 0,
      scale: { x: 1, y: 1 },
      screenWidth: 100,
      screenHeight: 100,
      position: { set: vi.fn() },
      moveCenter: vi.fn(),
      plugins: { reset: vi.fn() },
      dirty: false,
    };

    moveViewportCenter(viewport, { x: 10, y: 20 });

    expect(viewport.moveCenter).toHaveBeenCalledWith(10, 20);
    expect(viewport.position.set).not.toHaveBeenCalled();
  });

  it('uses viewAngle for rotated centering', () => {
    const viewport = {
      rotation: 0,
      scale: { x: 1, y: 1 },
      screenWidth: 100,
      screenHeight: 100,
      position: { set: vi.fn() },
      moveCenter: vi.fn(),
      plugins: { reset: vi.fn() },
      dirty: false,
    };

    moveViewportCenter(viewport, { x: 10, y: 0 }, 90);

    expect(viewport.moveCenter).not.toHaveBeenCalled();
    expect(viewport.position.set).toHaveBeenCalledWith(50, 40);
    expect(viewport.plugins.reset).toHaveBeenCalled();
    expect(viewport.dirty).toBe(true);
  });
});
