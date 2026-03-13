import { describe, expect, it } from 'vitest';
import { parseFitOptions } from './schema';

describe('events schema', () => {
  it('applies the default fit padding to both axes', () => {
    expect(parseFitOptions()).toEqual({
      padding: {
        x: 16,
        y: 16,
      },
    });
  });

  it('merges partial padding overrides with the default fit padding', () => {
    expect(parseFitOptions({ padding: { y: 10, x: 5 } })).toEqual({
      padding: {
        x: 5,
        y: 10,
      },
    });
  });

  it('keeps the default padding for omitted axes', () => {
    expect(parseFitOptions({ padding: { x: 5 } })).toEqual({
      padding: {
        x: 5,
        y: 16,
      },
    });
  });

  it('rejects unknown fit option keys', () => {
    expect(() => parseFitOptions({ extra: true })).toThrow();
  });

  it('rejects edge-based fit padding keys', () => {
    expect(() => parseFitOptions({ padding: { top: 10 } })).toThrow();
  });
});
