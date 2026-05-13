import { describe, expect, it } from 'vitest';
import {
  createMinimapObjectSnapshot,
  minimapPointToCanvasPoint,
} from './model';

describe('minimap model', () => {
  it('projects finite canvas bounds to fill the minimap area', () => {
    const snapshot = createMinimapObjectSnapshot({
      patchmap: {
        canvas: {
          bounds: {
            x: 0,
            y: 0,
            width: 1000,
            height: 500,
            right: 1000,
            bottom: 500,
          },
        },
      },
      width: 240,
      height: 144,
      inset: 1,
    });

    expect(snapshot.canvas).toEqual({
      x: 1,
      y: 1,
      width: 238,
      height: 142,
    });
    expect(snapshot.scale).toEqual({
      x: 0.238,
      y: 0.284,
    });
  });

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
        scale: { x: 0.164, y: 0.164 },
        origin: { x: 8, y: 19 },
      }),
    ).toEqual({
      x: 500,
      y: 250,
    });
  });
});
