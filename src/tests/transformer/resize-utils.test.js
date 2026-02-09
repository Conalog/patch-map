import { describe, expect, it } from 'vitest';
import {
  computeResize,
  resizeElementState,
} from '../../transformer/resize-utils';

describe('resize-utils', () => {
  it('scales width from the right handle', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const resizeInfo = computeResize({
      bounds,
      handle: 'right',
      delta: { x: 100, y: 0 },
    });

    expect(resizeInfo.bounds).toEqual({ x: 0, y: 0, width: 300, height: 100 });
    expect(resizeInfo.scaleX).toBeCloseTo(1.5);
    expect(resizeInfo.scaleY).toBeCloseTo(1);

    const resized = resizeElementState(
      { x: 100, y: 20, width: 50, height: 30 },
      resizeInfo,
    );
    expect(resized).toEqual({
      x: 150,
      y: 20,
      width: 75,
      height: 30,
    });
  });

  it('scales width from the left handle and shifts positions', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const resizeInfo = computeResize({
      bounds,
      handle: 'left',
      delta: { x: 50, y: 0 },
    });

    expect(resizeInfo.bounds).toEqual({ x: 50, y: 0, width: 150, height: 100 });
    expect(resizeInfo.scaleX).toBeCloseTo(0.75);

    const resized = resizeElementState(
      { x: 0, y: 10, width: 40, height: 20 },
      resizeInfo,
    );
    expect(resized).toEqual({
      x: 50,
      y: 10,
      width: 30,
      height: 20,
    });
  });

  it('scales both axes from the bottom-right handle', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const resizeInfo = computeResize({
      bounds,
      handle: 'bottom-right',
      delta: { x: 100, y: 50 },
    });

    expect(resizeInfo.bounds).toEqual({ x: 0, y: 0, width: 300, height: 150 });
    expect(resizeInfo.scaleX).toBeCloseTo(1.5);
    expect(resizeInfo.scaleY).toBeCloseTo(1.5);

    const resized = resizeElementState(
      { x: 100, y: 50, width: 50, height: 30 },
      resizeInfo,
    );
    expect(resized).toEqual({
      x: 150,
      y: 75,
      width: 75,
      height: 45,
    });
  });

  it('keeps aspect ratio from a corner when keepRatio is true', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const resizeInfo = computeResize({
      bounds,
      handle: 'bottom-right',
      delta: { x: 100, y: 0 },
      keepRatio: true,
    });

    expect(resizeInfo.bounds).toEqual({ x: 0, y: 0, width: 300, height: 150 });
    expect(resizeInfo.scaleX).toBeCloseTo(1.5);
    expect(resizeInfo.scaleY).toBeCloseTo(1.5);
  });

  it('keeps aspect ratio from an edge when keepRatio is true', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const resizeInfo = computeResize({
      bounds,
      handle: 'right',
      delta: { x: 100, y: 0 },
      keepRatio: true,
    });

    expect(resizeInfo.bounds).toEqual({
      x: 0,
      y: -25,
      width: 300,
      height: 150,
    });
    expect(resizeInfo.origin).toEqual({ x: 0, y: 50 });
  });

  it('does not shrink on corner keepRatio when only opposite-axis delta is negative', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const resizeInfo = computeResize({
      bounds,
      handle: 'bottom-right',
      delta: { x: 0, y: -20 },
      keepRatio: true,
    });

    expect(resizeInfo.bounds).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });
});
