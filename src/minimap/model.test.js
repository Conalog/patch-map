import { describe, expect, it } from 'vitest';
import { minimapPointToCanvasPoint } from './model';

describe('minimap model', () => {
  it('maps minimap points back to finite canvas coordinates', () => {
    expect(
      minimapPointToCanvasPoint({
        point: { x: 90, y: 60 },
        canvasBounds: {
          x: 0,
          y: 0,
          width: 1000,
          height: 500,
          right: 1000,
          bottom: 500,
        },
        scale: 0.164,
        origin: { x: 8, y: 19 },
      }),
    ).toEqual({
      x: 500,
      y: 250,
    });
  });
});
