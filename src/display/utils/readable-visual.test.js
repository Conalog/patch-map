import { Matrix } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { normalizeAngle, resolveReadableAngle } from './readable-rotation';
import {
  resolveReadableVisualCenterDelta,
  resolveReadableVisualTransform,
} from './readable-visual';

const toDegrees = (radian) => radian * (180 / Math.PI);

const rebuildMatrixFromTransform = (transform) => {
  const matrix = new Matrix();
  matrix.setTransform(
    transform.position.x,
    transform.position.y,
    transform.pivot.x,
    transform.pivot.y,
    transform.scale.x,
    transform.scale.y,
    transform.rotation,
    transform.skew.x,
    transform.skew.y,
  );
  return matrix;
};

const readMatrixAngle = (matrix) => toDegrees(Math.atan2(matrix.b, matrix.a));

describe('readable-visual', () => {
  it('resolves a local transform whose composed global angle is readable', () => {
    const outerGlobal = new Matrix();
    outerGlobal.setTransform(0, 0, 0, 0, 1, 1, (157 * Math.PI) / 180, 0, 0);

    const transform = resolveReadableVisualTransform(outerGlobal);
    const localMatrix = rebuildMatrixFromTransform(transform);
    const composed = outerGlobal.clone();
    composed.tx = 0;
    composed.ty = 0;
    composed.append(localMatrix);

    expect(normalizeAngle(readMatrixAngle(composed))).toBe(
      resolveReadableAngle(157),
    );
    expect(composed.a * composed.d - composed.b * composed.c).toBeGreaterThan(
      0,
    );
  });

  it('returns local center delta that preserves the baseline center', () => {
    const outerGlobal = new Matrix();
    const baseBounds = { x: 0, y: 0, width: 60, height: 20 };
    const transformedBounds = { x: 5, y: 15, width: 60, height: 20 };

    const delta = resolveReadableVisualCenterDelta(
      baseBounds,
      transformedBounds,
      outerGlobal,
    );

    expect(delta).toEqual({ x: -5, y: -15 });
  });
});
