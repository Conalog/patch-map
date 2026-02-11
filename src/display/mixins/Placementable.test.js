import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Placementable } from './Placementable';
import * as utils from './utils';

vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLayoutContext: vi.fn(),
    mapViewDirection: vi.fn((_view, dir) => dir),
  };
});

describe('Placementable', () => {
  const MockBase = class {
    static registerHandler = vi.fn();

    constructor() {
      this.position = {
        x: 0,
        y: 0,
        set: vi.fn((x, y) => {
          this.position.x = x;
          this.position.y = y;
        }),
      };
      this.pivot = { x: 0, y: 0 };
      this.scale = { x: 1, y: 1 };
      this.angle = 0;
      this.props = {
        placement: 'left-top',
        margin: { left: 0, top: 0, right: 0, bottom: 0 },
      };
    }
    getLocalBounds() {
      return { x: 0, y: 0, width: 100, height: 50 };
    }
  };

  const TestComponent = Placementable(MockBase);

  beforeEach(() => {
    vi.mocked(utils.getLayoutContext).mockReturnValue({
      parentWidth: 500,
      parentHeight: 500,
      contentWidth: 500,
      contentHeight: 500,
      parentPadding: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    vi.mocked(utils.mapViewDirection).mockImplementation((_view, dir) => dir);
  });

  it('should position at 0,0 when placement is left-top and no rotation/pivot', () => {
    const comp = new TestComponent();
    comp._applyPlacement(comp.props);

    expect(comp.position.x).toBe(0);
    expect(comp.position.y).toBe(0);
  });

  it('should compensate for pivot', () => {
    const comp = new TestComponent();
    comp.pivot = { x: 50, y: 25 };
    comp._applyPlacement(comp.props);

    expect(comp.position.x).toBe(50);
    expect(comp.position.y).toBe(25);
  });

  it('should compensate for rotation (e.g. 180 deg)', () => {
    const comp = new TestComponent();
    comp.pivot = { x: 50, y: 25 };
    comp.angle = 180;

    comp._applyPlacement(comp.props);
    expect(comp.position.x).toBeCloseTo(50);
    expect(comp.position.y).toBeCloseTo(25);
  });

  it('should handle complex 90deg rotation with off-center pivot', () => {
    const comp = new TestComponent();
    comp.pivot = { x: 0, y: 0 };
    comp.angle = 90;

    comp._applyPlacement(comp.props);

    expect(comp.position.x).toBeCloseTo(50);
    expect(comp.position.y).toBeCloseTo(0);
  });

  it('should handle scale and rotation together', () => {
    const comp = new TestComponent();
    comp.scale = { x: -1, y: 1 };
    comp.angle = 0;
    comp.pivot = { x: 50, y: 25 };

    comp._applyPlacement(comp.props);

    expect(comp.position.x).toBeCloseTo(50);
  });

  it('should swap margins when direction is flipped by view', () => {
    vi.mocked(utils.mapViewDirection).mockReturnValue('right');
    vi.mocked(utils.getLayoutContext).mockReturnValue({
      parentWidth: 500,
      parentHeight: 500,
      contentWidth: 500,
      contentHeight: 500,
      parentPadding: { left: 0, top: 0, right: 0, bottom: 0 },
    });

    const comp = new TestComponent();
    comp.props.placement = 'left-center';
    comp.props.margin = { left: 20, right: 100, top: 0, bottom: 0 };
    comp.store = { view: { angle: 180 } };

    comp._applyPlacement(comp.props);

    expect(comp.position.x).toBe(380);
  });
});
