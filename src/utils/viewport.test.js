import { describe, expect, it } from 'vitest';
import { getSafeViewportScale, MIN_VIEWPORT_SCALE } from './viewport';

describe('viewport utils', () => {
  it('returns positive absolute viewport scale', () => {
    expect(getSafeViewportScale({ scale: { x: 2 } })).toBe(2);
    expect(getSafeViewportScale({ scale: { x: -2 } })).toBe(2);
  });

  it('clamps tiny or zero scales to minimum', () => {
    expect(getSafeViewportScale({ scale: { x: 0 } })).toBe(MIN_VIEWPORT_SCALE);
    expect(getSafeViewportScale({ scale: { x: 1e-9 } })).toBe(
      MIN_VIEWPORT_SCALE,
    );
  });

  it('falls back to default scale for non-finite values', () => {
    expect(getSafeViewportScale({ scale: { x: Number.NaN } })).toBe(1);
    expect(
      getSafeViewportScale({ scale: { x: Number.POSITIVE_INFINITY } }),
    ).toBe(1);
    expect(getSafeViewportScale(null)).toBe(1);
  });
});
