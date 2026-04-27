import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/transform', () => ({
  getBoundsFromPoints: vi.fn((points) => {
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }),
  getCentroid: vi.fn((points) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  })),
  getObjectLocalCorners: vi.fn((element) => element.corners ?? []),
}));

import { buildRotateContext } from './rotate-context';

const createElement = ({
  id,
  locked = false,
  isRotatable = true,
  corners = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ],
  parent = null,
} = {}) => ({
  id,
  props: { locked },
  corners,
  parent,
  constructor: { isRotatable },
});

describe('buildRotateContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for an empty selection', () => {
    const result = buildRotateContext({
      elements: [],
      viewport: { id: 'viewport' },
    });

    expect(result).toBeNull();
  });

  it('returns null when selection has no rotatable elements', () => {
    const result = buildRotateContext({
      elements: [createElement({ id: 'item', isRotatable: false })],
      viewport: { id: 'viewport' },
    });

    expect(result).toBeNull();
  });

  it('returns null when all selected rotatable elements are locked', () => {
    const result = buildRotateContext({
      elements: [createElement({ id: 'locked', locked: true })],
      viewport: { id: 'viewport' },
    });

    expect(result).toBeNull();
  });

  it('uses the full selection frame while mutating only unlocked rotatable elements', () => {
    const lockedGroup = { props: { locked: true }, parent: null };
    const lockedChild = createElement({
      id: 'locked-child',
      parent: lockedGroup,
      corners: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    });
    const unlockedRect = createElement({
      id: 'unlocked-rect',
      corners: [
        { x: 20, y: 20 },
        { x: 40, y: 20 },
        { x: 40, y: 50 },
        { x: 20, y: 50 },
      ],
    });

    const result = buildRotateContext({
      elements: [lockedChild, unlockedRect],
      viewport: { id: 'viewport' },
    });

    expect(result.elements).toEqual([unlockedRect]);
    expect(result.frame).toMatchObject({
      mode: 'axis-aligned',
      bounds: { x: 0, y: 0, width: 40, height: 50 },
      center: { x: 20, y: 25 },
      rotation: 0,
    });
  });

  it('uses the full mixed selection frame when non-rotatable elements are selected', () => {
    const rotatable = createElement({ id: 'rotatable' });
    const nonRotatable = createElement({
      id: 'item',
      isRotatable: false,
      corners: [
        { x: 100, y: 100 },
        { x: 130, y: 100 },
        { x: 130, y: 140 },
        { x: 100, y: 140 },
      ],
    });

    const result = buildRotateContext({
      elements: [rotatable, nonRotatable],
      viewport: { id: 'viewport' },
    });

    expect(result.elements).toEqual([rotatable]);
    expect(result.frame).toMatchObject({
      mode: 'axis-aligned',
      bounds: { x: 0, y: 0, width: 130, height: 140 },
      center: { x: 65, y: 70 },
      rotation: 0,
    });
  });

  it('builds an oriented frame for one rotatable element', () => {
    const result = buildRotateContext({
      elements: [
        createElement({
          id: 'rotated',
          corners: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 20 },
            { x: -10, y: 10 },
          ],
        }),
      ],
      viewport: { id: 'viewport' },
    });

    expect(result.frame.mode).toBe('oriented');
    expect(result.frame.rotation).toBeCloseTo(Math.PI / 4);
    expect(result.frame.center).toEqual({ x: 0, y: 10 });
  });

  it('builds an axis-aligned frame for multiple rotatable elements', () => {
    const result = buildRotateContext({
      elements: [
        createElement({ id: 'left' }),
        createElement({
          id: 'right',
          corners: [
            { x: 20, y: 10 },
            { x: 50, y: 10 },
            { x: 50, y: 30 },
            { x: 20, y: 30 },
          ],
        }),
      ],
      viewport: { id: 'viewport' },
    });

    expect(result.frame).toEqual({
      mode: 'axis-aligned',
      bounds: { x: 0, y: 0, width: 50, height: 30 },
      corners: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 30 },
        { x: 0, y: 30 },
      ],
      center: { x: 25, y: 15 },
      rotation: 0,
    });
  });
});
