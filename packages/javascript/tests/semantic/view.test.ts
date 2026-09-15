import { describe, expect, it } from 'vitest';

import {
  fitView,
  panView,
  screenToWorld,
  worldToScreen,
  zoomViewAt,
} from '../../src/viewport/view';

describe('PatchMap view transforms', () => {
  it('round-trips translated, scaled, and rotated coordinates', () => {
    const view = { x: 120, y: -40, scale: 2.5, rotation: 33 };
    const world = { x: 17, y: -9 };
    const screen = worldToScreen(world, view);
    const roundTrip = screenToWorld(screen, view);
    expect(roundTrip.x).toBeCloseTo(world.x, 9);
    expect(roundTrip.y).toBeCloseTo(world.y, 9);
  });

  it('keeps the world point under the cursor stable while zooming', () => {
    const point = { x: 240, y: 180 };
    const view = { x: 10, y: 20, scale: 1.25, rotation: 15 };
    const before = screenToWorld(point, view);
    const afterView = zoomViewAt(view, point, 3);
    const after = screenToWorld(point, afterView);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('pans in screen space and fits bounds with padding', () => {
    expect(panView({ x: 4, y: 5, scale: 2 }, { x: -2, y: 7 })).toEqual({
      x: 2,
      y: 12,
      scale: 2,
      rotation: 0,
    });
    const fitted = fitView({ x: 100, y: 50, width: 200, height: 100 }, { width: 500, height: 300 }, 50);
    expect(fitted.scale).toBe(2);
    expect(worldToScreen({ x: 200, y: 100 }, fitted)).toEqual({ x: 250, y: 150 });
  });

  it('keeps the default fit floor and accepts an explicit lower scale limit', () => {
    const bounds = { x: 0, y: 0, width: 10_000, height: 5_000 };
    const viewport = { width: 500, height: 300 };

    expect(fitView(bounds, viewport, 50).scale).toBe(0.1);
    expect(fitView(bounds, viewport, 50, { min: 0.025, max: 8 }).scale).toBe(0.04);
    expect(() => fitView(bounds, viewport, 50, { min: 0, max: 8 }))
      .toThrow('invalid view scale limits');
  });
});
