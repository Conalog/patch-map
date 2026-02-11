import gsap from 'gsap';
import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../patchmap.setup';

describe('Text Component Tests', () => {
  const { getPatchmap } = setupPatchmapTests();

  const itemWithText = {
    type: 'item',
    id: 'item-with-text',
    size: { width: 200, height: 100 },
    components: [
      {
        type: 'text',
        id: 'text-1',
        text: 'Hello World',
        style: { fontSize: 20, fill: 'black' },
      },
    ],
  };

  it('should render a text component with initial properties', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithText]);
    gsap.exportRoot().totalProgress(1);

    const text = patchmap.selector('$..[?(@.id=="text-1")]')[0];
    expect(text).toBeDefined();
    expect(text.text).toBe('Hello World');
    // Note: PIXI BitmapText style handling might differ, checking basic props
    expect(text.props.style.fontSize).toBe(20);
    expect(text.props.style.fill).toBe('black');
  });

  it('should update text content', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithText]);
    gsap.exportRoot().totalProgress(1);

    const text = patchmap.selector('$..[?(@.id=="text-1")]')[0];
    expect(text.text).toBe('Hello World');

    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes: { text: 'Updated Text' },
    });

    expect(text.text).toBe('Updated Text');
  });

  it('should update style properties', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithText]);
    gsap.exportRoot().totalProgress(1);

    const text = patchmap.selector('$..[?(@.id=="text-1")]')[0];

    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes: { style: { fontSize: 30, fill: 'red' } },
    });

    expect(text.props.style.fontSize).toBe(30);
    expect(text.props.style.fill).toBe('red');
  });

  it('should update tint', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithText]);
    gsap.exportRoot().totalProgress(1);

    const text = patchmap.selector('$..[?(@.id=="text-1")]')[0];
    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes: { tint: 0xff0000 },
    });

    expect(text.tint).toBe(0xff0000);
  });

  it('should throw RangeError when text size becomes non-finite', () => {
    const patchmap = getPatchmap();
    patchmap.draw([itemWithText]);
    gsap.exportRoot().totalProgress(1);

    expect(() =>
      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: { attrs: { width: Number.NaN } },
      }),
    ).toThrow(RangeError);
  });

  describe('Placement and Layout', () => {
    const layoutTestCases = [
      {
        description: 'center placement',
        itemSize: { width: 200, height: 100 },
        textPlacement: 'center',
        validate: (text, itemSize) => {
          expect(text.x + text.width / 2).toBeCloseTo(itemSize.width / 2);
          expect(text.y + text.height / 2).toBeCloseTo(itemSize.height / 2);
        },
      },
      {
        description: 'top-left placement',
        itemSize: { width: 200, height: 100 },
        textPlacement: 'left-top',
        validate: (text) => {
          expect(text.x).toBe(0);
          expect(text.y).toBe(0);
        },
      },
      {
        description: 'bottom-right placement',
        itemSize: { width: 200, height: 100 },
        textPlacement: 'right-bottom',
        validate: (text, itemSize) => {
          expect(text.x + text.width).toBeCloseTo(itemSize.width);
          expect(text.y + text.height).toBeCloseTo(itemSize.height);
        },
      },
    ];

    it.each(layoutTestCases)('should correctly position to $description', ({
      itemSize,
      textPlacement,
      validate,
    }) => {
      const patchmap = getPatchmap();
      const testItem = {
        type: 'item',
        id: 'test-item-layout',
        size: itemSize,
        components: [
          {
            type: 'text',
            id: 'text-layout',
            text: 'Layout', // 텍스트가 있어야 너비가 생김
            placement: textPlacement,
          },
        ],
      };
      patchmap.draw([testItem]);
      gsap.exportRoot().totalProgress(1);

      const text = patchmap.selector('$..[?(@.id=="text-layout")]')[0];
      validate(text, itemSize);
    });
  });

  it('should correctly split text based on the "split" property', () => {
    const patchmap = getPatchmap();
    const testItem = {
      type: 'item',
      id: 'test-item-split',
      size: { width: 200, height: 100 },
      components: [
        { type: 'text', id: 'text-split', text: '123456', split: 0 },
      ],
    };
    patchmap.draw([testItem]);
    gsap.exportRoot().totalProgress(1);

    const text = patchmap.selector('$..[?(@.id=="text-split")]')[0];
    expect(text.text).toBe('123456');

    patchmap.update({
      path: '$..[?(@.id=="text-split")]',
      changes: { split: 2 },
    });
    expect(text.text).toBe('12\n34\n56');

    patchmap.update({
      path: '$..[?(@.id=="text-split")]',
      changes: { split: 3 },
    });
    expect(text.text).toBe('123\n456');

    patchmap.update({
      path: '$..[?(@.id=="text-split")]',
      changes: { text: 'abcdef' },
    });
    expect(text.text).toBe('abc\ndef');

    patchmap.update({
      path: '$..[?(@.id=="text-split")]',
      changes: { split: 0 },
    });
    expect(text.text).toBe('abcdef');
  });

  describe('Auto Font Sizing', () => {
    it('should adjust font size within min/max range to fit the container', () => {
      const patchmap = getPatchmap();
      const itemSize = { width: 200, height: 50 };

      const testItem = {
        type: 'item',
        id: 'item-autofont',
        size: itemSize,
        components: [
          {
            type: 'text',
            id: 'text-autofont',
            text: 'A',
            style: {
              fontSize: 'auto',
              autoFont: { min: 10, max: 100 },
            },
          },
        ],
      };

      patchmap.draw([testItem]);
      gsap.exportRoot().totalProgress(1);

      const text = patchmap.selector('$..[?(@.id=="text-autofont")]')[0];

      const initialFontSize = text.style.fontSize;
      expect(initialFontSize).toBeGreaterThan(40);
      expect(initialFontSize).toBeLessThanOrEqual(50);

      patchmap.update({
        path: '$..[?(@.id=="text-autofont")]',
        changes: { text: 'Very Long Text String For Auto Font Test' },
      });

      expect(text.style.fontSize).toBeLessThan(initialFontSize);
      expect(text.style.fontSize).toBeGreaterThanOrEqual(10); // min 값

      patchmap.update({
        path: '$..[?(@.id=="text-autofont")]',
        changes: {
          text: 'Very Very Very Very Very Very Very Long Text', // 더 긴 텍스트
          style: { autoFont: { min: 5, max: 100 } },
        },
      });
      expect(text.style.fontSize).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Text Component Overflow Tests', () => {
    const createTextItem = (props = {}) => ({
      type: 'item',
      id: 'item-overflow',
      size: { width: 100, height: 30 },
      components: [
        {
          type: 'text',
          id: 'text-1',
          text: 'This is a very long text string',
          style: {
            fontSize: 20,
            fontFamily: 'Arial',
            ...props.style,
          },
          ...props,
        },
      ],
    });

    const getText = (patchmap) => {
      return patchmap.selector('$..[?(@.id=="text-1")]')[0];
    };

    it('should default to "visible" and not truncate text', () => {
      const patchmap = getPatchmap();
      patchmap.draw([createTextItem()]);

      const text = getText(patchmap);
      expect(text.text).toBe('This is a very long text string');
      expect(text.style.overflow).toBe('visible');
    });

    it('should truncate text simply when overflow is "hidden"', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        createTextItem({ style: { overflow: 'hidden', fontSize: 20 } }),
      ]);

      const text = getText(patchmap);
      expect(text.text.length).toBeLessThan(
        'This is a very long text string'.length,
      );
      expect(text.text.endsWith('…')).toBe(false);
      expect('This is a very long text string'.startsWith(text.text)).toBe(
        true,
      );
    });

    it('should truncate text with ellipsis when overflow is "ellipsis"', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        createTextItem({ style: { overflow: 'ellipsis', fontSize: 20 } }),
      ]);

      const text = getText(patchmap);
      expect(text.text.length).toBeLessThan(
        'This is a very long text string'.length,
      );
      expect(text.text.endsWith('…')).toBe(true);
    });

    it('should update truncation when container size changes (re-calculation)', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        {
          ...createTextItem({ style: { overflow: 'ellipsis', fontSize: 20 } }),
          size: { width: 50, height: 30 },
        },
      ]);

      const text = getText(patchmap);
      const initialText = text.text;
      expect(initialText.endsWith('…')).toBe(true);

      patchmap.update({
        path: '$..[?(@.id=="item-overflow")]',
        changes: { size: { width: 150, height: 30 } },
      });

      const updatedText = getText(patchmap).text;
      expect(updatedText.length).toBeGreaterThan(initialText.length);
    });

    it('should prioritize autoFont shrinking over overflow truncation', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        createTextItem({
          text: 'Short Text',
          style: {
            fontSize: 'auto',
            autoFont: { min: 10, max: 50 },
            overflow: 'ellipsis',
          },
        }),
      ]);

      const text = getText(patchmap);
      expect(text.text).toBe('Short Text');

      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: { text: 'Very very very very long text string here' },
      });

      expect(text.style.fontSize).toBe(10);
      expect(text.text.endsWith('…')).toBe(true);
    });

    it('should re-calculate overflow when margin increases (reducing content area)', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        createTextItem({
          style: { overflow: 'ellipsis', fontSize: 20 },
          text: 'Hello World',
          margin: 0,
        }),
      ]);

      patchmap.update({
        path: '$..[?(@.id=="item-overflow")]',
        changes: { size: { width: 140, height: 40 } },
      });

      const text = getText(patchmap);
      expect(text.text).toBe('Hello World');

      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: { margin: { left: 30, right: 30 } },
      });

      expect(text.text).not.toBe('Hello World');
      expect(text.text.endsWith('…')).toBe(true);
    });

    it('should restore full text when switching overflow to "visible"', () => {
      const patchmap = getPatchmap();
      const fullString = 'This is a very long text string';

      patchmap.draw([
        createTextItem({
          text: fullString,
          style: { overflow: 'ellipsis', fontSize: 20 },
        }),
      ]);

      const text = getText(patchmap);
      expect(text.text).not.toBe(fullString);
      expect(text.text.endsWith('…')).toBe(true);

      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: { style: { overflow: 'visible' } },
      });

      expect(text.text).toBe(fullString);
    });
  });
});
