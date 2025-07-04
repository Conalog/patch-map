import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uid } from '../../utils/uuid';
import {
  backgroundSchema,
  barSchema,
  componentArraySchema,
  componentSchema,
  iconSchema,
  textSchema,
} from './component-schema.js';

// Mocking a unique ID generator for predictable test outcomes.
vi.mock('../../utils/uuid', () => ({
  uid: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(uid).mockClear();
  vi.mocked(uid).mockReturnValue('mock-id-0');
});

describe('Component Schemas', () => {
  describe('Background Schema', () => {
    it('should parse with a string source', () => {
      const data = { type: 'background', source: 'image.png' };
      const parsed = backgroundSchema.parse(data);
      expect(parsed.source).toBe('image.png');
      expect(parsed.id).toBe('mock-id-0'); // check default from Base
    });

    it('should parse with a TextureStyle object source', () => {
      const data = {
        type: 'background',
        source: { type: 'rect', fill: 'red' },
      };
      const parsed = backgroundSchema.parse(data);
      expect(parsed.source).toEqual({ type: 'rect', fill: 'red' });
    });

    it('should fail with an invalid source type', () => {
      const data = { type: 'background', source: 123 };
      expect(() => backgroundSchema.parse(data)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const data = {
        type: 'background',
        source: 'image.png',
        unknown: 'property',
      };
      expect(() => backgroundSchema.parse(data)).toThrow();
    });
  });

  describe('Bar Schema', () => {
    const baseBar = {
      type: 'bar',
      source: { type: 'rect', fill: 'blue' },
    };

    it('should parse a minimal valid bar and transform size to an object', () => {
      const data = { ...baseBar, size: 100 }; // Input size is a single number
      const parsed = barSchema.parse(data);
      expect(parsed.placement).toBe('bottom');
      expect(parsed.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(parsed.animation).toBe(true);
      expect(parsed.animationDuration).toBe(200);
      // The single number `100` is transformed into a full width/height object.
      expect(parsed.size).toEqual({
        width: { value: 100, unit: 'px' },
        height: { value: 100, unit: 'px' },
      });
    });

    it('should correctly parse an object size', () => {
      const data = {
        ...baseBar,
        size: { width: '50%', height: 20 },
      };
      const parsed = barSchema.parse(data);
      // The size object is parsed correctly.
      expect(parsed.size).toEqual({
        width: { value: 50, unit: '%' },
        height: { value: 20, unit: 'px' },
      });
    });

    it.each([
      {
        case: 'single number',
        input: 150,
        expected: {
          width: { value: 150, unit: 'px' },
          height: { value: 150, unit: 'px' },
        },
      },
      {
        case: 'percentage string',
        input: '75%',
        expected: {
          width: { value: 75, unit: '%' },
          height: { value: 75, unit: '%' },
        },
      },
    ])(
      'should correctly parse and transform different valid size formats: $case',
      ({ input, expected }) => {
        const data = { ...baseBar, size: input };
        const parsed = barSchema.parse(data);
        expect(parsed.size).toEqual(expected);
      },
    );

    it('should fail if required `size` or `source` is missing', () => {
      const dataWithoutSource = { type: 'bar', size: 100 };
      const dataWithoutSize = { type: 'bar', source: { type: 'rect' } };
      expect(() => barSchema.parse(dataWithoutSource)).toThrow();
      expect(() => barSchema.parse(dataWithoutSize)).toThrow();
    });

    it('should fail if size is a partial object', () => {
      const dataWithPartialWidth = { ...baseBar, size: { width: '25%' } }; // Missing height
      const dataWithPartialHeight = { ...baseBar, size: { height: 20 } }; // Missing width
      expect(() => barSchema.parse(dataWithPartialWidth)).toThrow();
      expect(() => barSchema.parse(dataWithPartialHeight)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const data = { ...baseBar, size: 100, another: 'property' };
      expect(() => barSchema.parse(data)).toThrow();
    });
  });

  describe('Icon Schema', () => {
    const baseIcon = { type: 'icon', source: 'icon.svg' };

    it('should parse a minimal valid icon and transform size to an object', () => {
      const data = { ...baseIcon, size: 50 };
      const parsed = iconSchema.parse(data);
      expect(parsed.placement).toBe('center');
      expect(parsed.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      // The single number `50` is transformed into a full width/height object.
      expect(parsed.size).toEqual({
        width: { value: 50, unit: 'px' },
        height: { value: 50, unit: 'px' },
      });
    });

    it.each([
      {
        case: 'percentage string',
        input: '75%',
        expected: {
          width: { value: 75, unit: '%' },
          height: { value: 75, unit: '%' },
        },
      },
      {
        case: 'object with width and height',
        input: { width: 100, height: '100%' },
        expected: {
          width: { value: 100, unit: 'px' },
          height: { value: 100, unit: '%' },
        },
      },
    ])(
      'should parse and transform correctly with different size properties: $case',
      ({ input, expected }) => {
        const data = { ...baseIcon, size: input };
        const parsed = iconSchema.parse(data);
        expect(parsed.size).toEqual(expected);
      },
    );

    it('should fail if required `source` or `size` is missing', () => {
      const dataWithoutSource = { type: 'icon', size: 50 };
      const dataWithoutSize = { type: 'icon', source: 'icon.svg' };
      expect(() => iconSchema.parse(dataWithoutSource)).toThrow();
      expect(() => iconSchema.parse(dataWithoutSize)).toThrow();
    });

    it('should fail if size is a partial object', () => {
      const dataWithPartialWidth = { ...baseIcon, size: { width: '25%' } }; // Missing height
      const dataWithPartialHeight = { ...baseIcon, size: { height: 20 } }; // Missing width
      expect(() => iconSchema.parse(dataWithPartialWidth)).toThrow();
      expect(() => iconSchema.parse(dataWithPartialHeight)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const data = { ...baseIcon, size: 50, extra: 'property' };
      expect(() => iconSchema.parse(data)).toThrow();
    });
  });

  describe('Text Schema', () => {
    it('should parse valid text and apply all defaults', () => {
      const parsed = textSchema.parse({ type: 'text' });
      expect(parsed.text).toBe('');
      expect(parsed.split).toBe(0);
      expect(parsed.placement).toBe('center');
    });

    it('should correctly merge provided styles with defaults', () => {
      const data = {
        type: 'text',
        style: { fill: 'red', fontSize: 24 },
      };
      const parsed = textSchema.parse(data);
      expect(parsed.style.fill).toBe('red'); // Overridden
      expect(parsed.style.fontSize).toBe(24); // Added
    });
  });

  describe('componentSchema (Discriminated Union)', () => {
    it.each([
      { case: 'a valid background', data: { type: 'background', source: 'a' } },
      {
        case: 'a valid bar',
        data: { type: 'bar', source: { type: 'rect' }, size: 100 },
      },
      {
        case: 'a valid icon',
        data: { type: 'icon', source: 'a', size: '50%' },
      },
      { case: 'a valid text', data: { type: 'text' } },
    ])('should correctly parse $case', ({ data }) => {
      expect(() => componentSchema.parse(data)).not.toThrow();
    });

    it('should fail for an object with an unknown type', () => {
      const data = { type: 'chart', value: 100 };
      const result = componentSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe('invalid_union_discriminator');
    });
  });

  describe('componentArraySchema', () => {
    it('should parse a valid array of mixed components', () => {
      const data = [
        { type: 'background', source: 'bg.png' },
        { type: 'text', text: 'Hello World' },
        { type: 'icon', source: 'icon.svg', size: '10%' },
        {
          type: 'bar',
          source: { fill: 'green' },
          size: { width: 100, height: '20%' },
        },
      ];
      expect(() => componentArraySchema.parse(data)).not.toThrow();
    });

    it('should fail if any single element in the array is invalid', () => {
      const data = [
        { type: 'text', text: 'Valid' },
        { type: 'bar', source: { type: 'rect' } }, // Invalid: missing 'size'
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
      // The error path should correctly point to the invalid element's missing property.
      expect(result.error.issues[0].path).toEqual([1, 'size']);
    });
  });
});
