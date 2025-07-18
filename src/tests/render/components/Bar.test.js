import gsap from 'gsap';
import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../patchmap.setup';

describe('Bar Component Tests', () => {
  const { getPatchmap } = setupPatchmapTests();

  const itemWithBar = {
    type: 'item',
    id: 'item-with-bar',
    size: { width: 200, height: 100 },
    components: [
      {
        type: 'bar',
        id: 'bar-1',
        source: { type: 'rect', fill: 'blue' },
        size: { width: '50%', height: 20 },
      },
    ],
  };

  it('should render a bar with minimal required properties and correct default values', async () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithBar]);

    const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];
    expect(bar).toBeDefined();

    expect(bar.props.placement).toBe('bottom');
    expect(bar.props.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(bar.props.animation).toBe(true);
    expect(bar.props.animationDuration).toBe(200);

    expect(bar.width).toBe(1);
    expect(bar.height).toBe(1);
    gsap.exportRoot().totalProgress(1);
    expect(bar.width).toBe(100);
    expect(bar.height).toBe(20);
    expect(bar.x).toBe(50);
    expect(bar.y).toBe(80);
  });

  it("should update the bar's appearance when source property is changed", () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithBar]);
    gsap.exportRoot().totalProgress(1);

    const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];
    expect(bar.props.source.fill).toBe('blue');

    patchmap.update({
      path: '$..[?(@.id=="bar-1")]',
      changes: { source: { type: 'rect', fill: 'red' } },
    });
    expect(bar.props.source.fill).toBe('red');
  });

  describe('when updating size', () => {
    const testCases = [
      {
        description: 'percentage width and fixed height',
        size: { width: '25%', height: 40 },
        expected: { width: 50, height: 40 },
      },
      {
        description: 'fixed width and percentage height',
        size: { width: 60, height: '10%' },
        expected: { width: 60, height: 10 },
      },
      {
        description: 'percentage for both width and height',
        size: { width: '100%', height: '50%' },
        expected: { width: 200, height: 50 },
      },
      {
        description: 'fixed values for both width and height',
        size: { width: 120, height: 30 },
        expected: { width: 120, height: 30 },
      },
      {
        description: 'zero size',
        size: { width: 0, height: 0 },
        expected: { width: 0, height: 0 },
      },
      {
        description: 'size overflowing parent with fixed values',
        size: { width: 300, height: 150 },
        expected: { width: 300, height: 150 },
      },
      {
        description: 'size overflowing parent with percentage values',
        size: { width: '200%', height: '110%' },
        expected: { width: 400, height: 110 },
      },
    ];

    it.each(testCases)(
      'should correctly update to $description',
      ({ size, expected }) => {
        const patchmap = getPatchmap();
        patchmap.draw([itemWithBar]);
        gsap.exportRoot().totalProgress(1);

        const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];

        patchmap.update({
          path: '$..[?(@.id=="bar-1")]',
          changes: { size },
        });
        gsap.exportRoot().totalProgress(1);

        expect(bar.width).toBe(expected.width);
        expect(bar.height).toBe(expected.height);
      },
    );
  });

  describe('when parent item has padding', () => {
    const itemWithPaddedBar = {
      type: 'item',
      id: 'padded-item',
      size: { width: 200, height: 100 },
      padding: 20,
      components: [
        {
          type: 'bar',
          id: 'bar-in-padded',
          source: { type: 'rect', fill: 'green' },
          size: { width: '50%', height: '100%' },
        },
      ],
    };

    it('should calculate size based on parent content area', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithPaddedBar]);
      gsap.exportRoot().totalProgress(1);

      const bar = patchmap.selector('$..[?(@.id=="bar-in-padded")]')[0];
      const contentWidth = 200 - 20 * 2; // 160
      const contentHeight = 100 - 20 * 2; // 60
      expect(bar.width).toBe(contentWidth * 0.5); // 80
      expect(bar.height).toBe(contentHeight * 1); // 60
    });
  });

  describe('when toggling animation property', () => {
    it('should apply size changes immediately if animation is false from the start', () => {
      const patchmap = getPatchmap();
      const itemWithNonAnimatedBar = {
        ...itemWithBar,
        components: [{ ...itemWithBar.components[0], animation: false }],
      };

      patchmap.draw([itemWithNonAnimatedBar]);
      const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];
      expect(bar.width).toBe(100);
      expect(bar.height).toBe(20);
    });

    it('should kill the in-progress animation and jump to the final state when animation is set to false', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithBar]);
      gsap.exportRoot().totalProgress(1);
      const bar = patchmap.selector('$..[?(@.id=="bar-1")]')[0];

      patchmap.update({
        path: '$..[?(@.id=="bar-1")]',
        changes: { size: { width: 200, height: 50 } },
      });
      patchmap.update({
        path: '$..[?(@.id=="bar-1")]',
        changes: { animation: false },
      });
      expect(bar.width).toBe(200);
      expect(bar.height).toBe(50);
    });
  });

  describe('when combining various layout properties', () => {
    const layoutTestCases = [
      {
        description: 'basic center placement with no padding or margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 0,
        barSize: { width: 50, height: 20 },
        barPlacement: 'center',
        barMargin: 0,
        expected: { x: 75, y: 40, width: 50, height: 20 },
      },
      {
        description: 'top-left placement with uniform padding',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: 50, height: 20 },
        barPlacement: 'left-top',
        barMargin: 0,
        expected: { x: 10, y: 10, width: 50, height: 20 },
      },
      {
        description: 'bottom-right with uniform padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: 50, height: 20 },
        barPlacement: 'right-bottom',
        barMargin: 5,
        expected: { x: 135, y: 65, width: 50, height: 20 },
      },
      {
        description: 'center with non-uniform padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: { top: 10, right: 20, bottom: 30, left: 40 },
        barSize: { width: 50, height: 20 },
        barPlacement: 'center',
        barMargin: { top: 1, right: 2, bottom: 3, left: 4 },
        expected: { x: 86, y: 29, width: 50, height: 20 },
      },
      {
        description: 'percentage size with padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 20,
        barSize: { width: '50%', height: '25%' },
        barPlacement: 'right-top',
        barMargin: 5,
        expected: { x: 95, y: 25, width: 80, height: 15 },
      },
      {
        description: 'full-size bar with padding and margin',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: '100%', height: '100%' },
        barPlacement: 'left-top',
        barMargin: 5,
        expected: { x: 15, y: 15, width: 180, height: 80 },
      },
      {
        description:
          'single axis placement (top) should be horizontally centered',
        itemSize: { width: 200, height: 100 },
        itemPadding: 0,
        barSize: { width: 50, height: 20 },
        barPlacement: 'top',
        barMargin: 10,
        expected: { x: 75, y: 10, width: 50, height: 20 },
      },
      {
        description:
          'single axis placement (left) should be vertically centered',
        itemSize: { width: 200, height: 100 },
        itemPadding: 0,
        barSize: { width: 50, height: 20 },
        barPlacement: 'left',
        barMargin: 10,
        expected: { x: 10, y: 40, width: 50, height: 20 },
      },
      {
        description: 'edge case: bar larger than content area',
        itemSize: { width: 100, height: 100 },
        itemPadding: 10,
        barSize: { width: 100, height: 100 },
        barPlacement: 'left-top',
        barMargin: 0,
        expected: { x: 10, y: 10, width: 100, height: 100 },
      },
      {
        description: 'edge case: padding larger than item size',
        itemSize: { width: 100, height: 100 },
        itemPadding: 60,
        barSize: { width: '100%', height: '100%' },
        barPlacement: 'center',
        barMargin: 0,
        expected: { x: 60, y: 60, width: 0, height: 0 },
      },
      {
        description: 'edge case: zero size item',
        itemSize: { width: 0, height: 0 },
        itemPadding: 0,
        barSize: { width: 10, height: 10 },
        barPlacement: 'center',
        barMargin: 0,
        expected: { x: -5, y: -5, width: 10, height: 10 },
      },

      {
        description: 'edge case: negative margin should shift element outside',
        itemSize: { width: 200, height: 100 },
        itemPadding: 10,
        barSize: { width: 50, height: 20 },
        barPlacement: 'left-top',
        barMargin: -5,
        expected: { x: 5, y: 5, width: 50, height: 20 },
      },
    ];

    it.each(layoutTestCases)(
      '$description',
      ({
        itemSize,
        itemPadding,
        barSize,
        barPlacement,
        barMargin,
        expected,
      }) => {
        const patchmap = getPatchmap();
        const testItem = {
          type: 'item',
          id: 'test-item',
          size: itemSize,
          padding: itemPadding,
          components: [
            {
              type: 'bar',
              id: 'test-bar',
              source: { type: 'rect', fill: 'magenta' },
              size: barSize,
              placement: barPlacement,
              margin: barMargin,
            },
          ],
        };

        patchmap.draw([testItem]);
        gsap.exportRoot().totalProgress(1);

        const bar = patchmap.selector('$..[?(@.id=="test-bar")]')[0];
        expect(bar.width).toBeCloseTo(expected.width);
        expect(bar.height).toBeCloseTo(expected.height);
        expect(bar.x).toBeCloseTo(expected.x);
        expect(bar.y).toBeCloseTo(expected.y);
      },
    );
  });
});
