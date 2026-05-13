import { describe, expect, it } from 'vitest';
import { getFrameCorrection } from './restrict';

const canvasBounds = Object.freeze({
  x: 0,
  y: 10,
  width: 500,
  height: 300,
  right: 500,
  bottom: 310,
});

describe('canvas bounds restriction', () => {
  it('returns no correction for frames already inside canvas bounds', () => {
    expect(
      getFrameCorrection(
        { x: 20, y: 30, width: 100, height: 80 },
        canvasBounds,
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it('moves overflowing frames back inside canvas bounds', () => {
    expect(
      getFrameCorrection(
        { x: 480, y: -20, width: 50, height: 40 },
        canvasBounds,
      ),
    ).toEqual({ x: -30, y: 30 });
  });

  it('keeps oversized frames containing canvas bounds without forcing center alignment', () => {
    expect(
      getFrameCorrection(
        { x: 100, y: 100, width: 700, height: 500 },
        canvasBounds,
      ),
    ).toEqual({ x: -100, y: -90 });
  });

  it('does not move oversized frames that already contain canvas bounds', () => {
    expect(
      getFrameCorrection(
        { x: -50, y: -20, width: 700, height: 500 },
        canvasBounds,
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it('preserves oversized frames when requested for pointer-anchored zoom', () => {
    expect(
      getFrameCorrection(
        { x: 100, y: 100, width: 700, height: 500 },
        canvasBounds,
        { preserveUnderflow: true },
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it('centers oversized frames when requested', () => {
    expect(
      getFrameCorrection(
        { x: 100, y: 100, width: 700, height: 500 },
        canvasBounds,
        { centerUnderflow: true },
      ),
    ).toEqual({ x: -200, y: -190 });
  });
});
