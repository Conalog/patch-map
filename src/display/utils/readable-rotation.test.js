import { describe, expect, it } from 'vitest';
import {
  getReadableRotationCompensation,
  resolveReadableAngle,
} from './readable-rotation';

describe('readable-rotation', () => {
  it.each([
    { angle: 0, readable: 0, compensation: 0 },
    { angle: -23, readable: 337, compensation: 0 },
    { angle: 90, readable: 270, compensation: 180 },
    { angle: 131, readable: 311, compensation: 180 },
    { angle: 180, readable: 0, compensation: 180 },
    { angle: 229, readable: 49, compensation: 180 },
    { angle: 270, readable: 270, compensation: 0 },
    { angle: 315, readable: 315, compensation: 0 },
  ])('resolves readable angle for $angle°', ({
    angle,
    readable,
    compensation,
  }) => {
    expect(resolveReadableAngle(angle)).toBe(readable);
    expect(getReadableRotationCompensation(angle)).toBe(compensation);
  });
});
