import { describe, expect, it } from 'vitest';
import { clampViewportToCanvasBounds } from './clamp';
import { normalizeCanvasBounds } from './options';

describe('canvas bounds options', () => {
  it('normalizes finite canvas bounds with derived edges', () => {
    expect(
      normalizeCanvasBounds({ x: -100, y: 50, width: 5000, height: 3000 }),
    ).toEqual({
      x: -100,
      y: 50,
      width: 5000,
      height: 3000,
      right: 4900,
      bottom: 3050,
    });
  });

  it('returns null when canvas bounds are omitted', () => {
    expect(normalizeCanvasBounds()).toBeNull();
    expect(normalizeCanvasBounds(null)).toBeNull();
  });

  it('rejects non-finite bounds values', () => {
    expect(() =>
      normalizeCanvasBounds({
        x: 0,
        y: 0,
        width: Number.POSITIVE_INFINITY,
        height: 1,
      }),
    ).toThrow('canvas.bounds.width must be a finite number.');

    expect(() =>
      normalizeCanvasBounds({ x: '0', y: 0, width: 1, height: 1 }),
    ).toThrow('canvas.bounds.x must be a finite number.');
  });

  it('rejects non-positive sizes', () => {
    expect(() =>
      normalizeCanvasBounds({ x: 0, y: 0, width: 0, height: 1 }),
    ).toThrow('canvas.bounds.width must be greater than 0.');
    expect(() =>
      normalizeCanvasBounds({ x: 0, y: 0, width: 1, height: -1 }),
    ).toThrow('canvas.bounds.height must be greater than 0.');
  });

  it('rejects bounds whose derived edges overflow finite numbers', () => {
    expect(() =>
      normalizeCanvasBounds({
        x: Number.MAX_VALUE,
        y: 0,
        width: Number.MAX_VALUE,
        height: 1,
      }),
    ).toThrow('canvas.bounds.right must be a finite number.');

    expect(() =>
      normalizeCanvasBounds({
        x: 0,
        y: Number.MAX_VALUE,
        width: 1,
        height: Number.MAX_VALUE,
      }),
    ).toThrow('canvas.bounds.bottom must be a finite number.');
  });

  it('clamps viewport axes against non-zero canvas bounds', () => {
    const viewport = {
      screenWidth: 800,
      screenHeight: 600,
      worldScreenWidth: 400,
      worldScreenHeight: 300,
      scale: { x: 1, y: 1 },
      left: -100,
      right: 300,
      top: 10,
      bottom: 310,
      x: 100,
      y: -10,
    };
    const bounds = normalizeCanvasBounds({
      x: -20,
      y: 30,
      width: 1000,
      height: 700,
    });

    clampViewportToCanvasBounds(viewport, bounds);

    expect(viewport.left).toBe(-20);
    expect(viewport.top).toBe(30);
  });

  it('centers underflowing viewport axes on non-zero canvas bounds', () => {
    const viewport = {
      screenWidth: 800,
      screenHeight: 600,
      worldScreenWidth: 800,
      worldScreenHeight: 600,
      scale: { x: 1, y: 1 },
      x: 0,
      y: 0,
    };
    const bounds = normalizeCanvasBounds({
      x: 100,
      y: 50,
      width: 120,
      height: 80,
    });

    clampViewportToCanvasBounds(viewport, bounds);

    expect(viewport.x).toBe(240);
    expect(viewport.y).toBe(210);
  });
});
