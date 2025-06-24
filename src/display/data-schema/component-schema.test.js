import { beforeEach, describe, expect, it, vi } from 'vitest';

// We import the actual schemas from the provided files for integration testing.
import {
  Background,
  Bar,
  Icon,
  Text,
  componentArraySchema,
  componentSchema,
} from './component-schema.js';

// --- Global Setup ---

// Mocking a unique ID generator for predictable test outcomes.
// This is used by the `Base` schema in `primitive-schema.js`.
let idCounter = 0;
const uid = vi.fn(() => `mock-id-${idCounter++}`);
global.uid = uid;

beforeEach(() => {
  // Reset counter before each test to ensure test isolation.
  idCounter = 0;
  uid.mockClear();
});

// --- Test Suites ---

describe('Component Schema Tests (Final Version)', () => {
  // --- Test each component schema individually ---

  describe('Background Schema', () => {
    it.each([
      {
        case: 'with a string source',
        source: 'image.png',
        expected: 'image.png',
      },
      {
        case: 'with a TextureStyle object source',
        source: { type: 'rect', fill: 'red' },
        expected: { type: 'rect', fill: 'red' },
      },
    ])('should parse a valid background $case', ({ source, expected }) => {
      const data = { type: 'background', source };
      const parsed = Background.parse(data);
      expect(parsed.source).toEqual(expected);
    });

    it('should fail with an invalid source type', () => {
      const data = { type: 'background', source: 123 }; // Source must be string or TextureStyle
      expect(() => Background.parse(data)).toThrow();
    });
  });

  describe('Bar Schema', () => {
    // Base valid data for Bar tests
    const baseBar = {
      type: 'bar',
      width: 100,
      height: 20,
      source: { fill: 'blue' },
    };

    it('should parse a valid bar and apply all defaults', () => {
      const parsed = Bar.parse(baseBar);
      expect(parsed.placemnet).toBe('bottom');
      // Margin preprocesses to a full object
      expect(parsed.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(parsed.animation).toBe(true);
      expect(parsed.animationDuration).toBe(200);
      // Check if PxOrPercentSize transformation worked
      expect(parsed.width.unit).toBe('px');
      expect(parsed.height.value).toBe(20);
    });

    it('should correctly override default values', () => {
      const data = {
        ...baseBar,
        placemnet: 'top',
        margin: { x: 10, y: 20 }, // Use object syntax for margin
        animation: false,
      };
      const parsed = Bar.parse(data);
      expect(parsed.placemnet).toBe('top');
      expect(parsed.margin).toEqual({
        top: 20,
        right: 10,
        bottom: 20,
        left: 10,
      });
      expect(parsed.animation).toBe(false);
    });

    it('should fail if required properties from merged schemas (PxOrPercentSize) are missing', () => {
      const { width, ...rest } = baseBar; // Missing width
      expect(() => Bar.parse(rest)).toThrow();
    });
  });

  describe('Icon Schema', () => {
    const baseIcon = { type: 'icon', source: 'icon.svg' };

    it.each([
      { case: 'a number size', size: 50, expected: { value: 50, unit: 'px' } },
      {
        case: 'a percentage string size',
        size: '75%',
        expected: { value: 75, unit: '%' },
      },
      { case: 'a zero size', size: 0, expected: { value: 0, unit: 'px' } },
    ])('should parse a valid icon with $case', ({ size, expected }) => {
      const data = { ...baseIcon, size };
      const parsed = Icon.parse(data);
      expect(parsed.size).toEqual(expected);
      // Check if defaults are applied
      expect(parsed.placemnet).toBe('center');
    });

    // Edge cases for the `size` property (which uses pxOrPercentSchema)
    it.each([
      { case: 'a negative number', size: -10 },
      { case: 'a malformed percentage string', size: '50 percent' },
      { case: 'an invalid type like an object', size: { value: 50 } },
      { case: 'null or undefined', size: undefined },
    ])('should fail for an invalid size like $case', ({ size }) => {
      const data = { ...baseIcon, size };
      // `size: undefined` will fail because the property is required
      expect(() => Icon.parse(data)).toThrow();
    });

    it('should fail if required `source` is missing', () => {
      const data = { type: 'icon', size: 50 };
      expect(() => Icon.parse(data)).toThrow();
    });
  });

  describe('Text Schema', () => {
    const baseText = { type: 'text' };

    it('should parse valid text and apply all defaults', () => {
      const parsed = Text.parse(baseText);
      expect(parsed.text).toBe('');
      // Check for default style properties from TextStyle's preprocess
      expect(parsed.style.fontFamily).toBe('FiraCode');
      expect(parsed.style.fill).toBe('black');
      expect(parsed.style.fontWeight).toBe(400);
      expect(parsed.split).toBe(0);
      expect(parsed.placemnet).toBe('center');
    });

    it('should correctly merge provided styles with defaults', () => {
      const data = {
        ...baseText,
        style: { fill: 'red', fontSize: 24, customProp: true },
      };
      const parsed = Text.parse(data);
      expect(parsed.style.fill).toBe('red'); // Overridden
      expect(parsed.style.fontSize).toBe(24); // Added
      expect(parsed.style.fontFamily).toBe('FiraCode'); // Default maintained
      expect(parsed.style.customProp).toBe(true); // Passthrough via z.record(z.unknown())
    });
  });

  // --- Test the discriminated union and array schemas ---
  describe('componentSchema (Discriminated Union)', () => {
    it.each([
      { case: 'a valid background', data: { type: 'background', source: '' } },
      {
        case: 'a valid bar',
        data: { type: 'bar', width: 1, height: 1, source: {} },
      },
      { case: 'a valid icon', data: { type: 'icon', size: 1, source: '' } },
      { case: 'a valid text', data: { type: 'text' } },
    ])('should correctly parse $case', ({ data }) => {
      expect(() => componentSchema.parse(data)).not.toThrow();
    });

    it('should fail for an object with an unknown type', () => {
      const data = { type: 'chart', value: 100 };
      const result = componentSchema.safeParse(data);
      expect(result.success).toBe(false);
      // Check for the specific discriminated union error
      expect(result.error.issues[0].code).toBe('invalid_union_discriminator');
    });

    it('should fail for a known type with missing required properties', () => {
      // 'icon' requires 'source' and 'size'
      const data = { type: 'icon', source: 'image.png' };
      const result = componentSchema.safeParse(data);
      expect(result.success).toBe(false);
      // The error should point to the missing 'size' field
      expect(result.error.issues[0].path).toEqual(['size']);
    });
  });

  describe('componentArraySchema', () => {
    it('should parse a valid array of mixed, well-formed components', () => {
      const data = [
        { type: 'background', source: 'bg.png' },
        { type: 'text', text: 'Hello World' },
        { type: 'icon', source: 'icon.svg', size: '10%' },
      ];
      expect(() => componentArraySchema.parse(data)).not.toThrow();
    });

    it('should correctly parse an empty array', () => {
      expect(() => componentArraySchema.parse([])).not.toThrow();
    });

    it('should fail if any single element in the array is invalid', () => {
      const data = [
        { type: 'text', text: 'Valid' },
        { type: 'icon', source: 'missing-size.svg' }, // This one is invalid
      ];
      const result = componentArraySchema.safeParse(data);
      expect(result.success).toBe(false);
      // The error path should correctly point to the invalid element in the array
      expect(result.error.issues[0].path).toEqual([1, 'size']);
    });
  });
});
