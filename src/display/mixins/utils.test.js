import { describe, expect, it } from 'vitest';
import { ROTATION_THRESHOLD } from './constants';
import { calcSize, mapViewDirection, parseCalcExpression } from './utils';

describe('mapViewDirection', () => {
  it('should return original direction if view is not provided', () => {
    expect(mapViewDirection(null, 'left')).toBe('left');
  });

  it('should not flip when angle is 0 and no flip is active', () => {
    const view = { angle: 0, flipX: false, flipY: false };
    expect(mapViewDirection(view, 'left')).toBe('left');
    expect(mapViewDirection(view, 'right')).toBe('right');
    expect(mapViewDirection(view, 'top')).toBe('top');
    expect(mapViewDirection(view, 'bottom')).toBe('bottom');
  });

  it('should flip both axes when angle is within threshold (e.g., 180)', () => {
    const view = { angle: 180, flipX: false, flipY: false };
    expect(mapViewDirection(view, 'left')).toBe('right');
    expect(mapViewDirection(view, 'right')).toBe('left');
    expect(mapViewDirection(view, 'top')).toBe('bottom');
    expect(mapViewDirection(view, 'bottom')).toBe('top');
  });

  it('should respect flipX', () => {
    const view = { angle: 0, flipX: true, flipY: false };
    expect(mapViewDirection(view, 'left')).toBe('right');
    expect(mapViewDirection(view, 'right')).toBe('left');
    expect(mapViewDirection(view, 'top')).toBe('top');
  });

  it('should respect flipY', () => {
    const view = { angle: 0, flipX: false, flipY: true };
    expect(mapViewDirection(view, 'left')).toBe('left');
    expect(mapViewDirection(view, 'top')).toBe('bottom');
    expect(mapViewDirection(view, 'bottom')).toBe('top');
  });

  it('should cancel out flipX and angle flip (180 deg)', () => {
    const view = { angle: 180, flipX: true, flipY: false };
    expect(mapViewDirection(view, 'left')).toBe('left');
    expect(mapViewDirection(view, 'top')).toBe('bottom');
  });

  it('should handle boundary angles correctly', () => {
    const minView = {
      angle: ROTATION_THRESHOLD.MIN,
      flipX: false,
      flipY: false,
    };
    expect(mapViewDirection(minView, 'left')).toBe('right');

    const justBeforeMin = {
      angle: ROTATION_THRESHOLD.MIN - 1,
      flipX: false,
      flipY: false,
    };
    expect(mapViewDirection(justBeforeMin, 'left')).toBe('left');
  });
});

describe('parseCalcExpression', () => {
  const parentDimension = 200;

  const testCases = [
    {
      name: 'a simple percentage value',
      expression: 'calc(50%)',
      expected: 100,
    },
    { name: 'a simple pixel value', expression: 'calc(75px)', expected: 75 },
    {
      name: 'subtraction of pixels from a percentage',
      expression: 'calc(100% - 50px)',
      expected: 150,
    },
    {
      name: 'addition of pixels to a percentage',
      expression: 'calc(25% + 25px)',
      expected: 75,
    },
    {
      name: 'multiple terms with mixed units',
      expression: 'calc(50% - 20px + 10% + 5px)',
      expected: 105,
    },
    {
      name: 'floating point numbers in percentages and pixels',
      expression: 'calc(12.5% + 15.5px)',
      expected: 40.5,
    },
    {
      name: 'negative values within the expression',
      expression: 'calc(50% + -30px)',
      expected: 70,
    },
    {
      name: 'an expression resulting in zero',
      expression: 'calc(50% - 100px)',
      expected: 0,
    },
    {
      name: 'an expression with only pixel values',
      expression: 'calc(100px - 25px + 10px)',
      expected: 85,
    },
    {
      name: 'an expression with only percentage values',
      expression: 'calc(100% - 25% + 10%)',
      expected: 170,
    },
  ];

  it.each(testCases)('should correctly parse $name', ({
    expression,
    expected,
  }) => {
    expect(parseCalcExpression(expression, parentDimension)).toBe(expected);
  });
});

describe('calcSize', () => {
  const mockParent = {
    props: {
      size: { width: 400, height: 200 },
      padding: { top: 10, right: 20, bottom: 30, left: 40 },
    },
  };

  const testCases = [
    {
      name: 'with simple pixel values',
      props: {
        source: {},
        size: {
          width: { value: 100, unit: 'px' },
          height: { value: 50, unit: 'px' },
        },
      },
      respectsPadding: true,
      expected: { width: 100, height: 50, borderWidth: 0 },
    },
    {
      name: 'with percentage values based on parent content area',
      props: {
        source: {},
        size: {
          width: { value: 50, unit: '%' },
          height: { value: 25, unit: '%' },
        },
      },
      respectsPadding: true,
      // Expected: width = 340 * 0.5 = 170, height = 160 * 0.25 = 40
      expected: { width: 170, height: 40, borderWidth: 0 },
    },
    {
      name: 'with borderWidth, which is added to the final size',
      props: {
        source: { borderWidth: 5 },
        size: {
          width: { value: 100, unit: 'px' },
          height: { value: 50, unit: 'px' },
        },
      },
      respectsPadding: true,
      expected: { width: 105, height: 55, borderWidth: 5 },
    },
    {
      name: 'with calc() expressions for width and height',
      props: {
        source: { borderWidth: 2 },
        size: { width: 'calc(100% - 40px)', height: 'calc(50% + 10px)' },
      },
      respectsPadding: true,
      // Expected: width = (340 - 40) + 2 = 302, height = (160 * 0.5 + 10) + 2 = 92
      expected: { width: 302, height: 92, borderWidth: 2 },
    },
    {
      name: "when respectsPadding is false, using parent's full dimensions",
      props: {
        source: {},
        size: {
          width: { value: 50, unit: '%' },
          height: { value: 50, unit: '%' },
        },
      },
      respectsPadding: false,
      // Expected: width = 400 * 0.5 = 200, height = 200 * 0.5 = 100
      expected: { width: 200, height: 100, borderWidth: 0 },
    },
    {
      name: 'gracefully when the component has no parent',
      props: {
        source: {},
        size: {
          width: { value: 50, unit: '%' },
          height: { value: 100, unit: 'px' },
        },
      },
      respectsPadding: true,
      parent: null,
      // Expected: width = 0 (since % of null is 0), height = 100
      expected: { width: 0, height: 100, borderWidth: 0 },
    },
    {
      name: 'with pixel values and borderWidth',
      props: {
        source: { borderWidth: 5 },
        size: {
          width: { value: 100, unit: 'px' },
          height: { value: 50, unit: 'px' },
        },
      },
      respectsPadding: true,
      // Expected: width = 100 + 5, height = 50 + 5
      expected: { width: 105, height: 55, borderWidth: 5 },
    },
    {
      name: 'with percentage values and borderWidth',
      props: {
        source: { borderWidth: 10 },
        size: {
          width: { value: 50, unit: '%' },
          height: { value: 25, unit: '%' },
        },
      },
      respectsPadding: true,
      // Expected: width = (340 * 0.5) + 10 = 180, height = (160 * 0.25) + 10 = 50
      expected: { width: 180, height: 50, borderWidth: 10 },
    },
    {
      name: 'with calc() expressions and borderWidth',
      props: {
        source: { borderWidth: 2 },
        size: { width: 'calc(100% - 40px)', height: 'calc(50% + 10px)' },
      },
      respectsPadding: true,
      // Expected: width = (340 - 40) + 2 = 302, height = (160 * 0.5 + 10) + 2 = 92
      expected: { width: 302, height: 92, borderWidth: 2 },
    },
  ];

  it.each(testCases)('should calculate size correctly $name', ({
    props,
    respectsPadding,
    parent = mockParent,
    expected,
  }) => {
    const mockComponent = {
      constructor: { respectsPadding },
      parent,
    };
    const result = calcSize(mockComponent, props);
    expect(result).toEqual(expected);
  });
});
