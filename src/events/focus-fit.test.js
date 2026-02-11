import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fit as fitViewport, focus } from './focus-fit';

vi.mock('../utils/bounds', () => ({
  calcGroupOrientedBounds: vi.fn(),
}));

vi.mock('../utils/selector/selector', () => ({
  selector: vi.fn(),
}));

import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';

const createViewport = () => ({
  scale: { x: 2, y: 2 },
  toLocal: vi.fn((point) => point),
  moveCenter: vi.fn(),
  fit: vi.fn(),
});

describe('focus-fit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('focus moves center and does not call fit', () => {
    const viewport = createViewport();
    vi.mocked(selector).mockReturnValue([
      { id: 'target-1', type: 'icon', parent: { type: 'canvas' } },
    ]);
    vi.mocked(calcGroupOrientedBounds).mockReturnValue({
      center: { x: 10, y: 20 },
      innerBounds: { width: 100, height: 50 },
    });

    focus(viewport, 'target-1');

    expect(viewport.moveCenter).toHaveBeenCalledWith(10, 20);
    expect(viewport.fit).not.toHaveBeenCalled();
  });

  it('fit moves center and calls viewport.fit with scaled size', () => {
    const viewport = createViewport();
    vi.mocked(selector).mockReturnValue([
      { id: 'target-1', type: 'icon', parent: { type: 'canvas' } },
    ]);
    vi.mocked(calcGroupOrientedBounds).mockReturnValue({
      center: { x: 10, y: 20 },
      innerBounds: { width: 100, height: 50 },
    });

    fitViewport(viewport, 'target-1');

    expect(viewport.moveCenter).toHaveBeenCalledWith(10, 20);
    expect(viewport.fit).toHaveBeenCalledWith(true, 50, 25);
  });
});
