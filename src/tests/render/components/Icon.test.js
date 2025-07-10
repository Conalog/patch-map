import { describe, expect, it, vi } from 'vitest';
import { setupPatchmapTests } from '../patchmap.setup';

describe('Icon Component Tests', () => {
  const { getPatchmap } = setupPatchmapTests();

  const itemWithIcon = {
    type: 'item',
    id: 'item-with-icon',
    size: { width: 100, height: 100 },
    components: [
      {
        type: 'background',
        source: { type: 'rect', borderWidth: 1, borderColor: 'red' },
      },
      {
        type: 'icon',
        id: 'icon-1',
        source: 'device',
        size: 50,
        tint: 'primary.default',
      },
    ],
  };

  it('should toggle the visibility of the icon component using the "show" property', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithIcon]);

    let icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
    expect(icon).toBeDefined();
    expect(icon.props.show).toBe(true);
    expect(icon.renderable).toBe(true);

    patchmap.update({
      path: '$..[?(@.id=="icon-1")]',
      changes: { show: false },
    });
    icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
    expect(icon.props.show).toBe(false);
    expect(icon.renderable).toBe(false);

    patchmap.update({
      path: '$..[?(@.id=="icon-1")]',
      changes: { show: true },
    });
    icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
    expect(icon.props.show).toBe(true);
    expect(icon.renderable).toBe(true);
  });

  it('should change the icon source when updated', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithIcon]);

    const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
    const initialTexture = icon.texture;
    patchmap.update({
      path: '$..[?(@.id=="icon-1")]',
      changes: { source: 'wifi' },
    });

    const updatedIcon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
    const newTexture = updatedIcon.texture;
    expect(updatedIcon.props.source).toBe('wifi');
    expect(newTexture).toBeDefined();
    expect(newTexture).not.toBe(initialTexture);
  });

  it('should handle an unregistered string source by logging a warning', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithIcon]);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unregisteredSource = 'unregistered-icon-asset';

    patchmap.update({
      path: '$..[?(@.id=="icon-1")]',
      changes: { source: unregisteredSource },
    });

    const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
    expect(consoleSpy).toHaveBeenCalledWith(
      'PixiJS Warning: ',
      '[Assets] Asset id unregistered-icon-asset was not found in the Cache',
    );
    expect(icon.texture).toBeDefined();
    expect(icon.props.source).toBe(unregisteredSource);
    consoleSpy.mockRestore();
  });

  describe('size', () => {
    it('should correctly resize the icon when a single number is provided for size', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithIcon]);

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { size: 75 },
      });

      const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
      expect(icon.props.size).toEqual({
        width: { value: 75, unit: 'px' },
        height: { value: 75, unit: 'px' },
      });
      expect(icon.width).toBe(75);
      expect(icon.height).toBe(75);
    });

    it('should correctly resize the icon when a percentage string is provided for size', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithIcon]);

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { size: '50%' },
      });

      const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
      const parent = patchmap.selector('$..[?(@.id=="item-with-icon")]')[0];

      expect(icon.props.size).toEqual({
        width: { value: 50, unit: '%' },
        height: { value: 50, unit: '%' },
      });
      expect(icon.width).toBe(parent.props.size.width * 0.5);
      expect(icon.height).toBe(parent.props.size.height * 0.5);
    });

    it('should correctly resize the icon when a size object with mixed units is provided', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithIcon]);

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { size: { width: 60, height: '30%' } },
      });

      const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
      const parent = patchmap.selector('$..[?(@.id=="item-with-icon")]')[0];

      expect(icon.props.size).toEqual({
        width: { value: 60, unit: 'px' },
        height: { value: 30, unit: '%' },
      });
      expect(icon.width).toBe(60);
      expect(icon.height).toBe(parent.props.size.height * 0.3);
    });

    it('should throw an error if a partial size object is provided', () => {
      const patchmap = getPatchmap();
      patchmap.draw([itemWithIcon]);

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { size: { width: 80 } },
      });

      const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
      expect(icon.props.size).toEqual({
        width: { value: 80, unit: 'px' },
        height: { value: 50, unit: 'px' },
      });
      expect(icon.width).toBe(80);
      expect(icon.height).toBe(50);
    });
  });

  describe('placement', () => {
    it.each([
      { placement: 'center', expected: { x: 25, y: 25 } },
      { placement: 'top', expected: { x: 25, y: 0 } },
      { placement: 'bottom', expected: { x: 25, y: 50 } },
      { placement: 'left', expected: { x: 0, y: 25 } },
      { placement: 'right', expected: { x: 50, y: 25 } },
      { placement: 'left-top', expected: { x: 0, y: 0 } },
      { placement: 'right-top', expected: { x: 50, y: 0 } },
      { placement: 'left-bottom', expected: { x: 0, y: 50 } },
      { placement: 'right-bottom', expected: { x: 50, y: 50 } },
    ])(
      'should correctly position the icon for placement: $placement',
      ({ placement, expected }) => {
        const patchmap = getPatchmap();
        patchmap.draw([itemWithIcon]);

        patchmap.update({
          path: '$..[?(@.id=="icon-1")]',
          changes: { placement: placement },
        });

        const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
        expect(icon.x).toBe(expected.x);
        expect(icon.y).toBe(expected.y);
      },
    );
  });

  describe('margin', () => {
    it.each([
      {
        case: 'a single number',
        margin: 10,
        placement: 'left-top',
        expected: { x: 10, y: 10 },
      },
      {
        case: 'an object with x and y',
        margin: { x: 5, y: 15 },
        placement: 'right-bottom',
        expected: { x: 45, y: 35 },
      },
      {
        case: 'a full object',
        margin: { top: 5, right: 10, bottom: 15, left: 20 },
        placement: 'left-top',
        expected: { x: 20, y: 5 },
      },
      {
        case: 'a partial object',
        margin: { top: 20, left: 8 },
        placement: 'left-top',
        expected: { x: 8, y: 20 },
      },
      {
        case: 'a negative number',
        margin: -5,
        placement: 'left-top',
        expected: { x: -5, y: -5 },
      },
      {
        case: 'an object with negative values',
        margin: { top: -10, right: 5 },
        placement: 'right-top',
        expected: { x: 45, y: -10 },
      },
    ])(
      'should correctly apply margin with placement: $case',
      ({ margin, placement, expected }) => {
        const patchmap = getPatchmap();
        patchmap.draw([itemWithIcon]);

        patchmap.update({
          path: '$..[?(@.id=="icon-1")]',
          changes: { placement, margin },
        });

        const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
        expect(icon.x).toBe(expected.x);
        expect(icon.y).toBe(expected.y);
      },
    );
  });

  describe('size, placement, margin', () => {
    it.each([
      {
        case: 'center placement with no margin and px size',
        changes: { size: 60, placement: 'center', margin: 0 },
        expected: { x: 20, y: 20, width: 60, height: 60 },
      },
      {
        case: 'top-right placement with numeric margin and percentage size',
        changes: { size: '40%', placement: 'right-top', margin: 10 },
        expected: { x: 50, y: 10, width: 40, height: 40 },
      },
      {
        case: 'bottom-left placement with x/y margin and mixed size units',
        changes: {
          size: { width: 50, height: '20%' },
          placement: 'left-bottom',
          margin: { x: 5, y: 15 },
        },
        expected: { x: 5, y: 65, width: 50, height: 20 },
      },
      {
        case: 'center placement with full margin object',
        changes: {
          size: 30,
          placement: 'center',
          margin: { top: 5, right: 10, bottom: 15, left: 20 },
        },
        expected: { x: 40, y: 30, width: 30, height: 30 },
      },
      {
        case: 'right placement with negative left/right margin',
        changes: { size: 50, placement: 'right', margin: { x: -10, y: 0 } },
        expected: { x: 60, y: 25, width: 50, height: 50 },
      },
      {
        case: 'bottom placement with negative top/bottom margin',
        changes: { size: '30%', placement: 'bottom', margin: { y: -5 } },
        expected: { x: 35, y: 75, width: 30, height: 30 },
      },
    ])(
      'should correctly calculate position and size with combined properties for: $case',
      ({ changes, expected }) => {
        const patchmap = getPatchmap();
        patchmap.draw([itemWithIcon]);

        patchmap.update({
          path: '$..[?(@.id=="icon-1")]',
          changes: changes,
        });

        const icon = patchmap.selector('$..[?(@.id=="icon-1")]')[0];
        expect(icon.width).toBeCloseTo(expected.width);
        expect(icon.height).toBeCloseTo(expected.height);
        expect(icon.x).toBeCloseTo(expected.x);
        expect(icon.y).toBeCloseTo(expected.y);
      },
    );
  });
});
