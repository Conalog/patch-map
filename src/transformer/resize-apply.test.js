import { describe, expect, it, vi } from 'vitest';
import { applyResizeUpdates, computeResizeUpdates } from './resize-apply';

const canvasBounds = Object.freeze({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  right: 100,
  bottom: 100,
});

const createViewport = () => ({
  toGlobal: (point) => ({ x: point.x, y: point.y }),
});

const createWorld = () => ({
  toLocal: (point) => ({ x: point.x, y: point.y }),
});

const createElement = ({ canvasBounds: bounds = null } = {}) => ({
  constructor: { isResizable: true },
  props: {},
  parent: null,
  store: {
    canvasBounds: bounds,
    world: createWorld(),
  },
  apply: vi.fn(),
});

describe('resize-apply canvas bounds', () => {
  it('applies resize updates whose proposed frame stays inside canvas bounds', () => {
    const element = createElement({ canvasBounds });

    const count = applyResizeUpdates({
      viewport: createViewport(),
      updates: [
        {
          element,
          updatedState: {
            x: 10,
            y: 20,
            width: 30,
            height: 40,
            corners: [
              { x: 10, y: 20 },
              { x: 40, y: 20 },
              { x: 40, y: 60 },
              { x: 10, y: 60 },
            ],
          },
        },
      ],
    });

    expect(count).toBe(1);
    expect(element.apply).toHaveBeenCalledWith(
      {
        attrs: { x: 10, y: 20 },
        size: { width: 30, height: 40 },
      },
      undefined,
    );
  });

  it('rejects resize updates whose proposed frame leaves canvas bounds', () => {
    const element = createElement({ canvasBounds });

    const count = applyResizeUpdates({
      viewport: createViewport(),
      updates: [
        {
          element,
          updatedState: {
            x: 10,
            y: 20,
            width: 120,
            height: 40,
            corners: [
              { x: 10, y: 20 },
              { x: 130, y: 20 },
              { x: 130, y: 60 },
              { x: 10, y: 60 },
            ],
          },
        },
      ],
    });

    expect(count).toBe(0);
    expect(element.apply).not.toHaveBeenCalled();
  });

  it('keeps resize updates permissive when canvas bounds are omitted', () => {
    const element = createElement();

    const count = applyResizeUpdates({
      viewport: createViewport(),
      updates: [
        {
          element,
          updatedState: {
            x: 10,
            y: 20,
            width: 120,
            height: 40,
            corners: [
              { x: 10, y: 20 },
              { x: 130, y: 20 },
              { x: 130, y: 60 },
              { x: 10, y: 60 },
            ],
          },
        },
      ],
    });

    expect(count).toBe(1);
    expect(element.apply).toHaveBeenCalled();
  });

  it('checks resized multi-selection states with the element frame corners', () => {
    const element = createElement({ canvasBounds });
    const updates = computeResizeUpdates({
      activeResize: {
        bounds: { x: 10, y: 10, width: 30, height: 30 },
        handle: 'right',
        elementStates: [
          {
            element,
            x: 20,
            y: 20,
            width: 20,
            height: 10,
            corners: [
              { x: 20, y: 20 },
              { x: 34.1421356237, y: 34.1421356237 },
              { x: 27.0710678119, y: 41.2132034356 },
              { x: 12.9289321881, y: 27.0710678119 },
            ],
          },
        ],
      },
      delta: { x: 10, y: 0 },
      keepRatio: false,
    });

    expect(updates[0].updatedState.corners[1].y).toBeGreaterThan(
      updates[0].updatedState.corners[0].y,
    );
  });
});
