import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/transform', () => ({
  getBoundsFromPoints: vi.fn((points) => {
    if (!points.length) {
      return null;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }),
  getObjectLocalCorners: vi.fn((element) => element.corners ?? []),
}));

import { buildResizeContext } from './resize-context';

const createElement = ({
  id,
  locked = false,
  isResizable = true,
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
  constructor: { isResizable },
});

describe('buildResizeContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when all selected resizable elements are locked', () => {
    const lockedRect = createElement({
      id: 'locked-rect',
      locked: true,
    });

    const result = buildResizeContext({
      elements: [lockedRect],
      viewport: { id: 'viewport' },
    });

    expect(result).toBeNull();
  });

  it('should exclude resizable elements under locked ancestors', () => {
    const lockedGroup = { props: { locked: true }, parent: null };
    const lockedChild = createElement({
      id: 'locked-child',
      parent: lockedGroup,
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

    const result = buildResizeContext({
      elements: [lockedChild, unlockedRect],
      viewport: { id: 'viewport' },
    });

    expect(result).toEqual({
      elements: [unlockedRect],
      bounds: {
        x: 20,
        y: 20,
        width: 20,
        height: 30,
      },
    });
  });
});
