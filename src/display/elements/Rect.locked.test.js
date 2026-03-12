import { describe, expect, it, vi } from 'vitest';
import { Rect } from './Rect';

describe('Rect locked interaction state', () => {
  it('should toggle eventMode when locked changes', () => {
    const rect = new Rect({
      theme: {},
      viewport: { emit: vi.fn() },
    });

    rect.apply({
      type: 'rect',
      id: 'rect-1',
      size: { width: 20, height: 20 },
      fill: 'white',
    });
    expect(rect.eventMode).toBe('static');

    rect.apply({ locked: true });
    expect(rect.eventMode).toBe('none');

    rect.apply({ locked: false });
    expect(rect.eventMode).toBe('static');
  });
});
