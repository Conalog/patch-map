import { describe, expect, it } from 'vitest';
import { normalizeChanges } from './normalize';

describe('normalizeChanges', () => {
  it('preserves edge overrides when margin mixes axis and edge keys', () => {
    expect(normalizeChanges({ margin: { top: 10, x: 5 } }, 'icon')).toEqual({
      margin: { top: 10, right: 5, left: 5 },
    });
  });

  it('preserves edge overrides when padding mixes axis and edge keys', () => {
    expect(
      normalizeChanges({
        type: 'item',
        padding: { bottom: 12, x: 3 },
      }),
    ).toEqual({
      type: 'item',
      padding: { right: 3, bottom: 12, left: 3 },
    });
  });
});
