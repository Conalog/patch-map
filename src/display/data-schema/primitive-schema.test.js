import { describe, expect, it, vi } from 'vitest';
import {
  Base,
  Gap,
  Margin,
  Placement,
  Position,
  PxOrPercentSize,
  RelationsStyle,
  Size,
  TextStyle,
  TextureStyle,
} from './primitive-schema'; // Assuming the schemas are in './base-schema.js'

// --- Mocks ---

// Mock for the global uid function used in the Base schema.
// Vitest's `vi.fn()` provides mocking capabilities.
const uid = vi.fn(() => 'mock-uid-123');
global.uid = uid;

// --- Test Suites ---

describe('Base Schema Tests', () => {
  // Test suite for the Base schema
  describe('Base Schema', () => {
    it('should parse a valid object with all properties and allow passthrough', () => {
      const data = { show: false, id: 'custom-id', extra: 'passthrough-value' };
      const result = Base.parse(data);
      expect(result).toEqual({
        show: false,
        id: 'custom-id',
        extra: 'passthrough-value',
      });
    });

    it('should apply default values for missing properties', () => {
      const data = {};
      const result = Base.parse(data);
      // The mock uid function should be called to generate a default id.
      expect(result).toEqual({ show: true, id: 'mock-uid-123' });
      expect(uid).toHaveBeenCalled();
    });
  });

  // Test suite for the Position schema
  describe('Position Schema', () => {
    it.each([
      {
        case: 'standard positive integers',
        input: { x: 100, y: 200 },
        expected: { x: 100, y: 200 },
      },
      { case: 'zero values', input: { x: 0, y: 0 }, expected: { x: 0, y: 0 } },
      {
        case: 'negative values',
        input: { x: -50, y: -150 },
        expected: { x: -50, y: -150 },
      },
      {
        case: 'floating point numbers',
        input: { x: 10.5, y: 20.5 },
        expected: { x: 10.5, y: 20.5 },
      },
      {
        case: 'missing properties apply defaults',
        input: {},
        expected: { x: 0, y: 0 },
      },
      {
        case: 'one missing property',
        input: { x: 55 },
        expected: { x: 55, y: 0 },
      },
    ])(
      'should correctly parse position object for $case',
      ({ input, expected }) => {
        // The imported Position is now a Zod schema, so we can use it directly.
        expect(Position.parse(input)).toEqual(expected);
      },
    );

    it('should fail parsing with invalid types', () => {
      expect(() => Position.parse({ x: '100', y: '200' })).toThrow();
      expect(() => Position.parse({ x: 100, y: null })).toThrow();
    });
  });

  // Test suite for the Size schema
  describe('Size Schema', () => {
    it.each([
      {
        case: 'standard positive integers',
        input: { width: 100, height: 200 },
        expected: { width: 100, height: 200 },
      },
      {
        case: 'zero values',
        input: { width: 0, height: 0 },
        expected: { width: 0, height: 0 },
      },
      {
        case: 'floating point numbers',
        input: { width: 10.5, height: 20.5 },
        expected: { width: 10.5, height: 20.5 },
      },
    ])(
      'should correctly parse size object for $case',
      ({ input, expected }) => {
        // The imported Size is now a Zod schema.
        expect(Size.parse(input)).toEqual(expected);
      },
    );

    it.each([
      { case: 'negative numbers', input: { width: -100, height: 100 } },
      { case: 'one negative number', input: { width: 100, height: -1 } },
      { case: 'invalid type (string)', input: { width: '100', height: 100 } },
      { case: 'missing property (no defaults)', input: { width: 100 } },
    ])(
      'should throw an error for invalid size object for $case',
      ({ input }) => {
        expect(() => Size.parse(input)).toThrow();
      },
    );
  });

  // Test suite for the PxOrPercentSize schema
  describe('PxOrPercentSize Schema', () => {
    it.each([
      {
        case: 'pixel values (numbers)',
        input: { width: 100, height: 50 },
        expected: {
          width: { value: 100, unit: 'px' },
          height: { value: 50, unit: 'px' },
        },
      },
      {
        case: 'percentage values (strings)',
        input: { width: '80%', height: '100%' },
        expected: {
          width: { value: 80, unit: '%' },
          height: { value: 100, unit: '%' },
        },
      },
      {
        case: 'mix of pixel and percentage',
        input: { width: 150, height: '75%' },
        expected: {
          width: { value: 150, unit: 'px' },
          height: { value: 75, unit: '%' },
        },
      },
      {
        case: 'floating point values',
        input: { width: 99.9, height: '33.3%' },
        expected: {
          width: { value: 99.9, unit: 'px' },
          height: { value: 33.3, unit: '%' },
        },
      },
      {
        case: 'zero values',
        input: { width: 0, height: '0%' },
        expected: {
          width: { value: 0, unit: 'px' },
          height: { value: 0, unit: '%' },
        },
      },
    ])(
      'should correctly parse and transform for $case',
      ({ input, expected }) => {
        // The imported PxOrPercentSize is now a Zod schema.
        expect(PxOrPercentSize.parse(input)).toEqual(expected);
      },
    );

    it.each([
      { case: 'negative number', input: { width: -100, height: 50 } },
      {
        case: 'malformed percentage string',
        input: { width: '100', height: '50%' },
      },
      {
        case: 'percentage with space',
        input: { width: '50 %', height: '50%' },
      },
      { case: 'invalid unit', input: { width: '100em', height: '50%' } },
      { case: 'missing property', input: { width: 100 } },
    ])('should throw an error for invalid input for $case', ({ input }) => {
      expect(() => PxOrPercentSize.parse(input)).toThrow();
    });
  });

  // Test suite for the Placement schema
  describe('Placement Schema', () => {
    it.each([
      { placement: 'left' },
      { placement: 'left-top' },
      { placement: 'left-bottom' },
      { placement: 'top' },
      { placement: 'right' },
      { placement: 'right-top' },
      { placement: 'right-bottom' },
      { placement: 'bottom' },
      { placement: 'center' },
      { placement: 'none' },
    ])('should accept valid placement value: $placement', ({ placement }) => {
      expect(() => Placement.parse(placement)).not.toThrow();
    });

    it('should reject an invalid placement value', () => {
      expect(() => Placement.parse('top-left')).toThrow(); // Invalid enum
    });
  });

  // Test suite for the Gap schema
  describe('Gap Schema', () => {
    it.each([
      { case: 'a single number', input: 20, expected: { x: 20, y: 20 } },
      {
        case: 'an object with x and y',
        input: { x: 10, y: 30 },
        expected: { x: 10, y: 30 },
      },
      {
        case: 'an object with only x',
        input: { x: 15 },
        expected: { x: 15, y: 0 },
      },
      {
        case: 'an object with only y',
        input: { y: 25 },
        expected: { y: 25, x: 0 },
      },
      { case: 'an empty object', input: {}, expected: { x: 0, y: 0 } },
      { case: 'undefined', input: undefined, expected: { x: 0, y: 0 } },
    ])('should correctly preprocess and parse $case', ({ input, expected }) => {
      expect(Gap.parse(input)).toEqual(expected);
    });

    it('should throw an error for negative numbers', () => {
      expect(() => Gap.parse(-10)).toThrow();
      expect(() => Gap.parse({ x: -10, y: 10 })).toThrow();
    });
  });

  // Test suite for the Margin schema
  describe('Margin Schema', () => {
    it.each([
      {
        case: 'a single number',
        input: 15,
        expected: { top: 15, right: 15, bottom: 15, left: 15 },
      },
      {
        case: 'an object with x and y',
        input: { x: 10, y: 20 },
        expected: { top: 20, right: 10, bottom: 20, left: 10 },
      },
      {
        case: 'a full object',
        input: { top: 5, right: 10, bottom: 15, left: 20 },
        expected: { top: 5, right: 10, bottom: 15, left: 20 },
      },
      {
        case: 'an object with only x',
        input: { x: 30 },
        expected: { top: 0, right: 30, bottom: 0, left: 30 },
      },
      {
        case: 'an object with only y',
        input: { y: 40 },
        expected: { top: 40, right: 0, bottom: 40, left: 0 },
      },
      {
        case: 'an empty object',
        input: {},
        expected: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      {
        case: 'undefined',
        input: undefined,
        expected: { top: 0, right: 0, bottom: 0, left: 0 },
      },
    ])('should correctly preprocess and parse $case', ({ input, expected }) => {
      expect(Margin.parse(input)).toEqual(expected);
    });
  });

  // Test suite for the TextureStyle schema
  describe('TextureStyle Schema', () => {
    it('should parse a full valid object', () => {
      const data = {
        type: 'rect',
        fill: 'red',
        borderWidth: 2,
        borderColor: 'black',
        radius: 5,
      };
      expect(TextureStyle.parse(data)).toEqual(data);
    });

    it('should parse a partial object', () => {
      const data = { fill: '#FFF' };
      expect(TextureStyle.parse(data)).toEqual({ fill: '#FFF' });
    });

    it('should accept null values', () => {
      const data = {
        fill: null,
        borderWidth: null,
        borderColor: null,
        radius: null,
      };
      expect(TextureStyle.parse(data)).toEqual(data);
    });

    it('should fail on invalid enum for type', () => {
      const data = { type: 'circle' };
      expect(() => TextureStyle.parse(data)).toThrow();
    });
  });

  // Test suite for the RelationsStyle schema
  describe('RelationsStyle Schema', () => {
    it('should add default color if not provided', () => {
      const data = { lineWidth: 2 };
      expect(RelationsStyle.parse(data)).toEqual({
        color: 'black',
        lineWidth: 2,
      });
    });

    it('should not override provided color', () => {
      const data = { color: 'blue', lineStyle: 'dashed' };
      expect(RelationsStyle.parse(data)).toEqual({
        color: 'blue',
        lineStyle: 'dashed',
      });
    });

    it('should accept any other properties', () => {
      const data = { customProp: true };
      expect(RelationsStyle.parse(data)).toEqual({
        color: 'black',
        customProp: true,
      });
    });
  });

  // Test suite for the TextStyle schema
  describe('TextStyle Schema', () => {
    it('should apply default styles', () => {
      const data = { fontSize: 16 };
      expect(TextStyle.parse(data)).toEqual({
        fontFamily: 'FiraCode',
        fontWeight: 400,
        fill: 'black',
        fontSize: 16,
      });
    });

    it('should not override provided styles', () => {
      const data = { fontFamily: 'Arial', fill: 'red' };
      expect(TextStyle.parse(data)).toEqual({
        fontFamily: 'Arial',
        fontWeight: 400,
        fill: 'red',
      });
    });

    it('should accept any other valid text properties', () => {
      const data = { align: 'center', stroke: 'white', strokeThickness: 2 };
      expect(TextStyle.parse(data)).toEqual({
        fontFamily: 'FiraCode',
        fontWeight: 400,
        fill: 'black',
        align: 'center',
        stroke: 'white',
        strokeThickness: 2,
      });
    });
  });
});
