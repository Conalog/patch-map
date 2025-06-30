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
    const baseBar = { type: 'bar', source: { type: 'rect', fill: 'blue' } };

    it('should parse a minimal valid bar and apply all defaults', () => {
      const parsed = barSchema.parse(baseBar);
      expect(parsed.placement).toBe('bottom');
      expect(parsed.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(parsed.animation).toBe(true);
      expect(parsed.animationDuration).toBe(200);
      expect(parsed.width).toBeUndefined();
      expect(parsed.height).toBeUndefined();
    });

    it('should correctly parse all properties and override defaults', () => {
      const data = {
        ...baseBar,
        width: '50%',
        height: 20,
        placement: 'top',
        margin: { x: 10, y: -20 }, // Negative margin is allowed
        animation: false,
        animationDuration: 1000,
      };
      const parsed = barSchema.parse(data);
      expect(parsed.placement).toBe('top');
      expect(parsed.margin).toEqual({
        top: -20,
        right: 10,
        bottom: -20,
        left: 10,
      });
      expect(parsed.animation).toBe(false);
      expect(parsed.animationDuration).toBe(1000);
      // Check if PxOrPercentSize transformation worked
      expect(parsed.width).toEqual({ value: 50, unit: '%' });
      expect(parsed.height).toEqual({ value: 20, unit: 'px' });
    });

    it('should fail if source is missing or has invalid type', () => {
      const { source, ...rest } = baseBar;
      expect(() => barSchema.parse(rest)).toThrow(); // Missing source
      expect(() =>
        barSchema.parse({ ...baseBar, source: 'a-string' }),
      ).toThrow(); // Invalid source type
    });

    it('should fail if an unknown property is provided', () => {
      const data = { ...baseBar, width: 100, another: 'property' };
      expect(() => barSchema.parse(data)).toThrow();
    });
  });

  describe('Icon Schema', () => {
    const baseIcon = { type: 'icon', source: 'icon.svg' };

    it('should parse a minimal valid icon and apply defaults', () => {
      const parsed = iconSchema.parse(baseIcon);
      expect(parsed.source).toBe('icon.svg');
      expect(parsed.placement).toBe('center');
      expect(parsed.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(parsed.size).toBeUndefined();
    });

    it('should parse correctly with size properties', () => {
      const data = { ...baseIcon, size: '75%' };
      const parsed = iconSchema.parse(data);
      expect(parsed.size).toEqual({ value: 75, unit: '%' });
    });

    it('should fail if required `source` is missing', () => {
      const data = { type: 'icon', size: 50 };
      expect(() => iconSchema.parse(data)).toThrow();
    });

    it('should fail if `source` is not a string', () => {
      const data = { type: 'icon', source: {} };
      expect(() => iconSchema.parse(data)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const data = { ...baseIcon, extra: 'property' };
      expect(() => iconSchema.parse(data)).toThrow();
    });
  });

  describe('Text Schema', () => {
    it('should parse valid text and apply all defaults', () => {
      const parsed = textSchema.parse({ type: 'text' });
      expect(parsed.text).toBe('');
      expect(parsed.style.fontFamily).toBe('FiraCode');
      expect(parsed.style.fill).toBe('black');
      expect(parsed.style.fontWeight).toBe(400);
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
      expect(parsed.style.fontFamily).toBe('FiraCode'); // Default maintained
    });

    it('should fail if `split` is not an integer', () => {
      const data = { type: 'text', split: 1.5 };
      expect(() => textSchema.parse(data)).toThrow();
    });

    it('should fail if an unknown property is provided', () => {
      const data = { type: 'text', text: 'hello', somethingElse: 'test' };
      expect(() => textSchema.parse(data)).toThrow();
    });
  });

  describe('componentSchema (Discriminated Union)', () => {
    it.each([
      { case: 'a valid background', data: { type: 'background', source: 'a' } },
      { case: 'a valid bar', data: { type: 'bar', source: {} } },
      { case: 'a valid icon', data: { type: 'icon', source: 'a' } },
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

    it('should fail for a known type with missing required properties', () => {
      // 'icon' requires 'source'
      const data = { type: 'icon' };
      const result = componentSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['source']);
    });
  });

  describe('componentArraySchema', () => {
    it('should parse a valid array of mixed components', () => {
      const data = [
        { type: 'background', source: 'bg.png' },
        { type: 'text', text: 'Hello World' },
        { type: 'icon', source: 'icon.svg', size: '10%' },
        { type: 'bar', source: { fill: 'green' }, width: 100 },
      ];
      expect(() => componentArraySchema.parse(data)).not.toThrow();
    });

    it('should parse an empty array', () => {
      expect(() => componentArraySchema.parse([])).not.toThrow();
    });

    it('should fail if any single element in the array is invalid', () => {
      const data = [
        { type: 'text', text: 'Valid' },
        { type: 'bar' }, // Invalid: missing 'source'
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
      // The error path should correctly point to the invalid element.
      expect(result.error.issues[0].path).toEqual([1, 'source']);
    });
  });
});
