import { describe, expect, it } from 'vitest';

import { screenToWorld, zoomViewAt } from '../../lab/performance-v1/runtime';

describe('performance lab viewport coordinates', () => {
  it('maps canvas screen coordinates through the current pan and zoom', () => {
    expect(screenToWorld({ x: 210, y: 130 }, { x: 30, y: -10, scale: 2 })).toEqual({
      x: 90,
      y: 70,
    });
  });

  it('keeps the cursor world point stable while zooming', () => {
    const view = { x: 20, y: 30, scale: 1 };
    const cursor = { x: 180, y: 130 };
    const before = screenToWorld(cursor, view);
    const zoomed = zoomViewAt(cursor, view, -480);

    expect(zoomed.scale).toBeGreaterThan(view.scale);
    expect(screenToWorld(cursor, zoomed).x).toBeCloseTo(before.x);
    expect(screenToWorld(cursor, zoomed).y).toBeCloseTo(before.y);
  });

  it('clamps extreme wheel input to a bounded interactive zoom', () => {
    expect(zoomViewAt({ x: 0, y: 0 }, { x: 0, y: 0, scale: 1 }, 100_000).scale).toBe(0.25);
    expect(zoomViewAt({ x: 0, y: 0 }, { x: 0, y: 0, scale: 1 }, -100_000).scale).toBe(4);
  });
});
