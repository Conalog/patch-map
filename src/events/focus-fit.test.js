import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/bounds', () => ({
  calcGroupOrientedBounds: vi.fn(),
}));

vi.mock('../utils/selector/selector', () => ({
  selector: vi.fn(),
}));

import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { fit as fitViewport, focus as focusViewport } from './focus-fit';

const createViewport = (overrides = {}) => ({
  scale: { x: 1, y: 1 },
  toLocal: vi.fn((value) => value),
  moveCenter: vi.fn(),
  fit: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  selector.mockReturnValue([{ id: 'item-1' }, { id: 'item-2' }]);
  calcGroupOrientedBounds.mockReturnValue({
    center: { x: 50, y: 75 },
    innerBounds: { width: 100, height: 40 },
  });
});

describe('focus-fit', () => {
  it('fits selected objects with merged padding using viewport-space padding', () => {
    const viewport = createViewport({
      scale: { x: 2, y: 4 },
      toLocal: vi.fn(() => ({ x: 25, y: 30 })),
    });

    fitViewport(viewport, 'item-1', { padding: { top: 10, x: 5 } });

    expect(selector).toHaveBeenCalledWith(
      viewport,
      '$..children[?(@.type != null && @.parent.type !== "item" && @.parent.type !== "relations")]',
    );
    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([{ id: 'item-1' }]);
    expect(viewport.moveCenter).toHaveBeenCalledWith(25, 30);
    expect(viewport.fit).toHaveBeenCalledWith(true, 60, 36);
  });

  it('centers selected objects without fitting when using focus', () => {
    const viewport = createViewport({
      toLocal: vi.fn(() => ({ x: 10, y: 20 })),
    });

    focusViewport(viewport, 'item-2');

    expect(calcGroupOrientedBounds).toHaveBeenCalledWith([{ id: 'item-2' }]);
    expect(viewport.moveCenter).toHaveBeenCalledWith(10, 20);
    expect(viewport.fit).not.toHaveBeenCalled();
  });

  it('returns null without moving when no matching objects are found', () => {
    selector.mockReturnValue([]);
    const viewport = createViewport();

    const result = fitViewport(viewport, 'missing-id');

    expect(result).toBeNull();
    expect(calcGroupOrientedBounds).not.toHaveBeenCalled();
    expect(viewport.moveCenter).not.toHaveBeenCalled();
    expect(viewport.fit).not.toHaveBeenCalled();
  });

  it('throws for unknown fit option keys', () => {
    const viewport = createViewport();

    expect(() =>
      fitViewport(viewport, 'item-1', { padding: { top: 8 }, extra: true }),
    ).toThrow();
  });

  it('throws for unknown padding keys', () => {
    const viewport = createViewport();

    expect(() =>
      fitViewport(viewport, 'item-1', {
        padding: { top: 8, typo: 4 },
      }),
    ).toThrow();
  });
});
