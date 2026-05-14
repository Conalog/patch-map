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

  it('resolves missing canvas bounds fields from content bounds', () => {
    expect(
      normalizeCanvasBounds(
        {},
        { contentBounds: { x: -200, y: 100, width: 400, height: 300 } },
      ),
    ).toEqual({
      x: -2500,
      y: -1250,
      width: 5000,
      height: 3000,
      right: 2500,
      bottom: 1750,
    });
  });

  it('uses explicit canvas bounds fields while resolving the missing fields', () => {
    expect(
      normalizeCanvasBounds(
        { width: 2000 },
        { contentBounds: { x: -200, y: 100, width: 400, height: 300 } },
      ),
    ).toEqual({
      x: -1000,
      y: -1250,
      width: 2000,
      height: 3000,
      right: 1000,
      bottom: 1750,
    });
  });

  it('returns null when canvas bounds are omitted', () => {
    expect(normalizeCanvasBounds()).toBeNull();
    expect(normalizeCanvasBounds(null)).toBeNull();
  });

  it('rejects non-finite explicit bounds values', () => {
    expect(() =>
      normalizeCanvasBounds({
        x: 0,
        y: 0,
        width: Number.POSITIVE_INFINITY,
        height: 1,
      }),
    ).toThrow('canvas.bounds.width must be a finite number.');

    expect(() => normalizeCanvasBounds({ x: '0' })).toThrow(
      'canvas.bounds.x must be a finite number.',
    );
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

  it('keeps underflowing viewport axes within non-zero canvas bounds', () => {
    const viewport = {
      screenWidth: 800,
      screenHeight: 600,
      worldScreenWidth: 800,
      worldScreenHeight: 600,
      scale: { x: 1, y: 1 },
      left: 150,
      right: 950,
      top: 100,
      bottom: 700,
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

    expect(viewport.left).toBe(100);
    expect(viewport.top).toBe(50);
  });

  it('centers underflowing viewport axes when requested', () => {
    const viewport = {
      screenWidth: 800,
      screenHeight: 600,
      worldScreenWidth: 800,
      worldScreenHeight: 600,
      scale: { x: 1, y: 1 },
      left: 0,
      right: 800,
      top: 0,
      bottom: 600,
      x: 0,
      y: 0,
    };
    const bounds = normalizeCanvasBounds({
      x: 100,
      y: 50,
      width: 120,
      height: 80,
    });

    clampViewportToCanvasBounds(viewport, bounds, null, {
      centerUnderflow: true,
    });

    expect(viewport.x).toBe(240);
    expect(viewport.y).toBe(210);
  });

  it('preserves underflowing viewport axes when requested for pointer-anchored zoom', () => {
    const viewport = {
      screenWidth: 800,
      screenHeight: 600,
      worldScreenWidth: 800,
      worldScreenHeight: 600,
      scale: { x: 1, y: 1 },
      left: 150,
      right: 950,
      top: 100,
      bottom: 700,
      x: 0,
      y: 0,
    };
    const bounds = normalizeCanvasBounds({
      x: 100,
      y: 50,
      width: 120,
      height: 80,
    });

    clampViewportToCanvasBounds(viewport, bounds, null, {
      preserveUnderflow: true,
    });

    expect(viewport.left).toBe(150);
    expect(viewport.top).toBe(100);
  });
});
