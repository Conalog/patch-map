import { describe, expect, it, vi } from 'vitest';
import { Placementable } from './Placementable';
import * as utils from './utils';

// Mock getLayoutContext to control parent size
vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLayoutContext: vi.fn(),
    mapViewDirection: vi.fn((_view, dir) => dir), // default no-flip
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

  it('should position at 0,0 when placement is left-top and no rotation/pivot', () => {
    vi.mocked(utils.getLayoutContext).mockReturnValue({
      parentWidth: 500,
      parentHeight: 500,
      contentWidth: 500,
      contentHeight: 500,
      parentPadding: { left: 0, top: 0, right: 0, bottom: 0 },
    });

    const comp = new TestComponent();
    comp._applyPlacement(comp.props);

    expect(comp.position.x).toBe(0);
    expect(comp.position.y).toBe(0);
  });

  it('should compensate for pivot', () => {
    vi.mocked(utils.getLayoutContext).mockReturnValue({
      parentWidth: 500,
      parentHeight: 500,
      contentWidth: 500,
      contentHeight: 500,
      parentPadding: { left: 0, top: 0, right: 0, bottom: 0 },
    });

    const comp = new TestComponent();
    comp.pivot = { x: 50, y: 25 }; // Pivot at center
    comp._applyPlacement(comp.props);

    // If target is 0,0 and min visual is -50, -25 (relative to pivot)
    // position should be 0 - (-50) = 50, 0 - (-25) = 25
    expect(comp.position.x).toBe(50);
    expect(comp.position.y).toBe(25);
  });

  it('should compensate for rotation (e.g. 180 deg)', () => {
    const comp = new TestComponent();
    comp.pivot = { x: 50, y: 25 };
    comp.angle = 180;

    comp._applyPlacement(comp.props);

    // At 180deg, the corner (0,0) moves to (100, 50) relative to pivot 50,25?
    // Wait. Corners rel to pivot: (-50, -25), (50, -25), (-50, 25), (50, 25)
    // Rotated 180: (50, 25), (-50, 25), (50, -25), (-50, -25)
    // Min X is -50, Min Y is -25.
    // Wait, visual min should still be -50, -25 because it's a symmetric rectangle around center.
    expect(comp.position.x).toBeCloseTo(50);
    expect(comp.position.y).toBeCloseTo(25);
  });

  it('should handle complex 90deg rotation with off-center pivot', () => {
    const comp = new TestComponent();
    comp.pivot = { x: 0, y: 0 }; // top-left pivot
    comp.angle = 90;

    comp._applyPlacement(comp.props);

    // Bounds (0,0,100,50). Pivot 0,0. Angle 90.
    // Rel to pivot: (0,0), (100,0), (0,50), (100,50)
    // Rotated 90 (x'= -y, y'= x): (0,0), (0,100), (-50,0), (-50,100)
    // Visual Min is (-50, 0).
    // Target position is (0,0).
    // result = (0 - (-50), 0 - 0) = (50, 0)
    expect(comp.position.x).toBeCloseTo(50);
    expect(comp.position.y).toBeCloseTo(0);
  });

  it('should handle scale and rotation together', () => {
    const comp = new TestComponent();
    comp.scale = { x: -1, y: 1 }; // flipped
    comp.angle = 0;
    comp.pivot = { x: 50, y: 25 };

    comp._applyPlacement(comp.props);

    // Bounds (0,0,100,50). Pivot 50,25.
    // Rel to pivot: (-50,-25), (50,-25), (-50,25), (50,25)
    // Apply Scale -1,1: (50,-25), (-50,-25), (50,25), (-50,25)
    // Visual Min is still -50, -25.
    // Position = 0 - (-50) = 50.
    expect(comp.position.x).toBeCloseTo(50);
  });

  it('should swap margins when direction is flipped by view', () => {
    // Force mapViewDirection to return 'right' for 'left'
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
    comp.useViewPlacement = true;
    comp.store = { view: { angle: 180 } };

    comp._applyPlacement(comp.props);

    // Direction became 'right'
    // Margins should swap: left becomes 100, right becomes 20
    // getHorizontalPosition for 'right':
    // result = parentWidth - componentWidth - margin.right - parentPadding.right
    // result = 500 - 100 - 20 - 0 = 380
    // Since visual min is 0 (default pivot 0,0), position.x should be 380
    expect(comp.position.x).toBe(380);
  });
});
