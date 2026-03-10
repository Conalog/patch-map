import { describe, expect, it } from 'vitest';
import { resolvePlacementOffset } from './placement-offset';

const createComponent = (options = {}) => ({
  angle: options.angle ?? 0,
  scale: options.scale ?? { x: 1, y: 1 },
  pivot: options.pivot ?? { x: 0, y: 0 },
  constructor: {
    avoidsVisualOffsetWhenOverflowing:
      options.avoidsVisualOffsetWhenOverflowing ?? false,
  },
  getLocalBounds: () =>
    options.bounds ?? { x: 0, y: 0, width: 100, height: 50 },
});

describe('placement-offset', () => {
  it('returns zero offset when there is no visual transform', () => {
    const component = createComponent();

    expect(
      resolvePlacementOffset(component, 100, { contentWidth: 500 }),
    ).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('returns visual offset when local flip changes visible bounds', () => {
    const component = createComponent({
      scale: { x: 1, y: -1 },
    });

    expect(
      resolvePlacementOffset(component, 100, { contentWidth: 500 }),
    ).toEqual({ offsetX: 0, offsetY: -50 });
  });

  it('skips offset when overflowing text-like content has no visual transform', () => {
    const component = createComponent({
      avoidsVisualOffsetWhenOverflowing: true,
      bounds: { x: -20, y: -5, width: 140, height: 30 },
    });

    expect(
      resolvePlacementOffset(component, 140, { contentWidth: 100 }),
    ).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('keeps offset when overflowing content also has a visual transform', () => {
    const component = createComponent({
      angle: 90,
      avoidsVisualOffsetWhenOverflowing: true,
      bounds: { x: -20, y: -5, width: 140, height: 30 },
    });

    const offset = resolvePlacementOffset(component, 140, {
      contentWidth: 100,
    });

    expect(offset.offsetX).toBeCloseTo(-25);
    expect(offset.offsetY).toBeCloseTo(-20);
  });
});
