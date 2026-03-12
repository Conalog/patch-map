import { describe, expect, it, vi } from 'vitest';
import { fit as fitViewport } from './focus-fit';

vi.mock('../utils/bounds', () => ({
  calcGroupOrientedBounds: vi.fn(() => ({
    center: { x: 50, y: 75 },
    innerBounds: { width: 100, height: 40 },
  })),
}));

vi.mock('../utils/selector/selector', () => ({
  selector: vi.fn(() => [{ id: 'item-1' }]),
}));

describe('fit', () => {
  it('merges default padding with per-call overrides', () => {
    const viewport = {
      scale: { x: 1, y: 1 },
      toLocal: vi.fn((value) => value),
      moveCenter: vi.fn(),
      fit: vi.fn(),
    };

    fitViewport(viewport, 'item-1', { padding: { top: 10, x: 5 } });

    expect(viewport.fit).toHaveBeenCalledWith(true, 110, 82);
  });
});
