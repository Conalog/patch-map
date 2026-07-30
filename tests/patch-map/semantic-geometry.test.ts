import { describe, expect, it } from 'vitest';

import { projectPatchMapSignedRect } from '../../src/patch-map/semantic/geometry';

describe('PatchMap signed rectangular projection', () => {
  it('encodes a horizontal flip as the equivalent positive dense footprint', () => {
    const projection = projectPatchMapSignedRect(
      { x: 80, y: 0, rotation: 0, scaleX: -1, scaleY: 1 },
      40,
      20,
    );

    expect(projection).toEqual({
      x: 40,
      y: 0,
      width: 40,
      height: 20,
      rotation: 0,
      localBounds: [0, 0, 40, 20],
      scaleX: -1,
      scaleY: 1,
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.localBounds)).toBe(true);
  });

  it('retains authored local bounds while scaling the dense footprint', () => {
    const projection = projectPatchMapSignedRect(
      { x: 20, y: 30, rotation: 0, scaleX: -2, scaleY: 0.5 },
      10,
      8,
    );

    expect(projection).toMatchObject({
      x: 0,
      y: 30,
      width: 20,
      height: 4,
      localBounds: [0, 0, 10, 8],
      scaleX: -2,
      scaleY: 0.5,
    });
  });

  it('keeps authored-origin rotation equivalent to a center-pivot dense quad', () => {
    const projection = projectPatchMapSignedRect(
      { x: 0, y: 0, rotation: 45, scaleX: 1, scaleY: 1 },
      40,
      20,
    );

    expect(projection.x).toBeCloseTo(-12.9289321881, 9);
    expect(projection.y).toBeCloseTo(11.2132034356, 9);
    expect(projection.width).toBe(40);
    expect(projection.height).toBe(20);
  });

  it('rejects non-finite transforms and invalid local sizes', () => {
    expect(() => projectPatchMapSignedRect(
      { x: 0, y: 0, rotation: 0, scaleX: Number.NaN, scaleY: 1 },
      10,
      10,
    )).toThrow(TypeError);
    expect(() => projectPatchMapSignedRect(
      { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      -1,
      10,
    )).toThrow(TypeError);
  });
});
