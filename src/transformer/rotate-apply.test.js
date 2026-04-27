import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/transform', () => ({
  getCentroid: vi.fn((points) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  })),
  getObjectFrameLocalCorners: vi.fn((element) => element.corners ?? []),
}));

import {
  applyRotateUpdates,
  computeRotateUpdates,
  createRotateElementStates,
  getRotationKey,
  rotateElementState,
} from './rotate-apply';

const createElement = ({
  id = 'element',
  attrs = {},
  angle = 0,
  rotation = 0,
  isRotatable = true,
  parent = null,
  corners = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
} = {}) => ({
  id,
  angle,
  rotation,
  props: { attrs },
  parent,
  corners,
  constructor: { isRotatable },
  getGlobalPosition: () => ({ x: attrs.x ?? 0, y: attrs.y ?? 0 }),
  apply: vi.fn(),
});

const viewport = {
  toLocal: (point) => ({ x: point.x, y: point.y }),
};

describe('rotate-apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves existing angle key', () => {
    expect(getRotationKey(createElement({ attrs: { angle: 30 } }))).toBe(
      'angle',
    );
  });

  it('preserves existing rotation key and falls back to angle', () => {
    expect(getRotationKey(createElement({ attrs: { rotation: 0.5 } }))).toBe(
      'rotation',
    );
    expect(
      getRotationKey(createElement({ attrs: { rotation: 0.5, angle: 30 } })),
    ).toBe('rotation');
    expect(getRotationKey(createElement())).toBe('angle');
  });

  it('rotates element origin around a visible center using center offset', () => {
    const updated = rotateElementState(
      {
        origin: { x: 0, y: 0 },
        center: { x: 5, y: 5 },
        centerOffset: { x: 5, y: 5 },
        rotationKey: 'rotation',
        rotation: 0,
      },
      { center: { x: 10, y: 5 }, deltaAngle: Math.PI / 2 },
    );

    expect(updated.x).toBeCloseTo(15);
    expect(updated.y).toBeCloseTo(-5);
    expect(updated.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('writes angle updates in degrees', () => {
    const updated = rotateElementState(
      {
        origin: { x: 0, y: 0 },
        center: { x: 5, y: 5 },
        centerOffset: { x: 5, y: 5 },
        rotationKey: 'angle',
        rotation: 0,
      },
      { center: { x: 5, y: 5 }, deltaAngle: Math.PI / 2 },
    );

    expect(updated.rotation).toBeCloseTo(90);
  });

  it('captures element states from viewport-local origin and visible center', () => {
    const element = createElement({ attrs: { x: 10, y: 20 } });
    const [state] = createRotateElementStates({
      elements: [element],
      viewport,
    });

    expect(state.origin).toEqual({ x: 10, y: 20 });
    expect(state.center).toEqual({ x: 5, y: 5 });
    expect(state.centerOffset).toEqual({ x: -5, y: -15 });
  });

  it('computes and applies attrs-only rotate updates with shared history id', () => {
    const element = createElement({ attrs: { x: 0, y: 0, rotation: 0 } });
    const activeRotate = {
      frame: { center: { x: 5, y: 5 } },
      elementStates: createRotateElementStates({
        elements: [element],
        viewport,
      }),
    };
    const updates = computeRotateUpdates({
      activeRotate,
      deltaAngle: Math.PI / 2,
    });

    applyRotateUpdates({ updates, viewport, historyId: 'history-1' });

    expect(element.apply).toHaveBeenCalledWith(
      {
        attrs: {
          x: 10,
          y: 0,
          rotation: Math.PI / 2,
        },
      },
      { historyId: 'history-1' },
    );
  });

  it('maps updated origin through parent local space', () => {
    const parent = {
      toLocal: vi.fn((point) => ({ x: point.x - 100, y: point.y - 100 })),
    };
    const element = createElement({ parent });

    applyRotateUpdates({
      updates: [
        {
          element,
          updatedState: {
            x: 120,
            y: 130,
            rotationKey: 'rotation',
            rotation: 1,
          },
        },
      ],
      viewport,
    });

    expect(element.apply).toHaveBeenCalledWith(
      {
        attrs: { x: 20, y: 30, rotation: 1 },
      },
      undefined,
    );
  });
});
