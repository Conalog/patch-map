import { describe, expect, it } from 'vitest';
import { parseFitOptions } from './schema';

describe('events schema', () => {
  it('applies the default fit padding to all edges', () => {
    expect(parseFitOptions()).toEqual({
      padding: {
        top: 16,
        right: 16,
        bottom: 16,
        left: 16,
      },
    });
  });

  it('merges partial padding overrides with the default fit padding', () => {
    expect(parseFitOptions({ padding: { top: 10, x: 5 } })).toEqual({
      padding: {
        top: 10,
        right: 5,
        bottom: 16,
        left: 5,
      },
    });
  });

  it('rejects unknown fit option keys', () => {
    expect(() => parseFitOptions({ extra: true })).toThrow();
  });
});
