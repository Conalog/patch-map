import { describe, expect, it } from 'vitest';
import {
  ANGLE_SNAP_STEP,
  computeRotationDelta,
  normalizeAngleDelta,
  rotatePoint,
  snapAngle,
} from './rotate-utils';

describe('rotate-utils', () => {
  it('computes a rotation delta around a center point', () => {
    const delta = computeRotationDelta({
      center: { x: 0, y: 0 },
      startPoint: { x: 10, y: 0 },
      currentPoint: { x: 0, y: 10 },
    });

    expect(delta).toBeCloseTo(Math.PI / 2);
  });

  it('snaps rotation delta to 15 degree increments', () => {
    const delta = computeRotationDelta({
      center: { x: 0, y: 0 },
      startPoint: { x: 10, y: 0 },
      currentPoint: { x: 8, y: 5 },
      snap: true,
    });

    expect(delta % ANGLE_SNAP_STEP).toBeCloseTo(0);
    expect(delta).toBeCloseTo(Math.PI / 6);
  });

  it('keeps unsnapped rotation delta when snap is false', () => {
    const delta = computeRotationDelta({
      center: { x: 0, y: 0 },
      startPoint: { x: 10, y: 0 },
      currentPoint: { x: 8, y: 5 },
    });

    expect(delta).not.toBeCloseTo(snapAngle(delta));
  });

  it('normalizes deltas around the 0/360 boundary', () => {
    expect(normalizeAngleDelta((358 * Math.PI) / 180)).toBeCloseTo(
      (-2 * Math.PI) / 180,
    );
  });

  it('rotates a point around a center point', () => {
    const rotated = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);

    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(10);
  });
});
