import { describe, expect, it } from 'vitest';
import { computeResize, resizeElementState } from './resize-utils';

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

  it('snaps resize size changes to 1-unit steps for integer base sizes', () => {
    const state = { x: 10, y: 10, width: 100, height: 80 };
    const origin = { x: 0, y: 0 };

    const growSubUnit = resizeElementState(state, {
      origin,
      scaleX: 1.009,
      scaleY: 1,
    });
    const growOneUnit = resizeElementState(state, {
      origin,
      scaleX: 1.01,
      scaleY: 1,
    });
    const shrinkSubUnit = resizeElementState(state, {
      origin,
      scaleX: 0.991,
      scaleY: 1,
    });
    const shrinkOneUnit = resizeElementState(state, {
      origin,
      scaleX: 0.99,
      scaleY: 1,
    });

    expect(growSubUnit.width).toBe(100);
    expect(growOneUnit.width).toBe(101);
    expect(shrinkSubUnit.width).toBe(100);
    expect(shrinkOneUnit.width).toBe(99);
  });

  it('drops decimal size values on resize and keeps integer unit steps', () => {
    const state = { x: 10, y: 10, width: 100.4, height: 80.6 };
    const origin = { x: 0, y: 0 };

    const grow = resizeElementState(state, {
      origin,
      scaleX: 100.5 / 100.4,
      scaleY: 1,
    });
    const shrink = resizeElementState(state, {
      origin,
      scaleX: 1,
      scaleY: 80.5 / 80.6,
    });

    expect(grow.width).toBe(101);
    expect(shrink.height).toBe(80);
    expect(Number.isInteger(grow.width)).toBe(true);
    expect(Number.isInteger(shrink.height)).toBe(true);
  });

  it('normalizes decimal base sizes to integer units even with no scale change', () => {
    const state = { x: 10, y: 10, width: 100.4, height: 80.6 };
    const resized = resizeElementState(state, {
      origin: { x: 0, y: 0 },
      scaleX: 1,
      scaleY: 1,
    });

    expect(resized.width).toBe(100);
    expect(resized.height).toBe(81);
    expect(Number.isInteger(resized.width)).toBe(true);
    expect(Number.isInteger(resized.height)).toBe(true);
  });
});
