import { describe, expect, it, vi } from 'vitest';
import { uid } from '../../utils/uuid';
import {
  Base,
  Gap,
  Margin,
  Placement,
  PxOrPercentSize,
  RelationsStyle,
  Size,
  TextStyle,
  TextureStyle,
  Tint,
  pxOrPercentSchema,
} from './primitive-schema';

vi.mock('../../utils/uuid');
vi.mocked(uid).mockReturnValue('mock-uid-123');

describe('Primitive Schema Tests', () => {
  describe('Tint Schema', () => {
    const validColorSourceCases = [
      // CSS Color Names (pass as string)
      { case: 'CSS color name', value: 'red' },
      // Hex Values (string passes as string, number passes as any)
      { case: 'number hex', value: 0xff0000 },
      { case: '6-digit hex string', value: '#ff0000' },
      { case: '3-digit hex string', value: '#f00' },
      { case: '8-digit hex string with alpha', value: '#ff0000ff' },
      { case: '4-digit hex string with alpha', value: '#f00f' },
      // RGB/RGBA Objects (pass as any)
      { case: 'RGB object', value: { r: 255, g: 0, b: 0 } },
      { case: 'RGBA object', value: { r: 255, g: 0, b: 0, a: 0.5 } },
      // RGB/RGBA Strings (pass as string)
      { case: 'rgb string', value: 'rgb(255, 0, 0)' },
      { case: 'rgba string', value: 'rgba(255, 0, 0, 0.5)' },
      // Arrays (pass as any)
      { case: 'normalized RGB array', value: [1, 0, 0] },
      { case: 'normalized RGBA array', value: [1, 0, 0, 0.5] },
      // Typed Arrays (pass as any)
      { case: 'Float32Array', value: new Float32Array([1, 0, 0, 0.5]) },
      { case: 'Uint8Array', value: new Uint8Array([255, 0, 0]) },
      {
        case: 'Uint8ClampedArray',
        value: new Uint8ClampedArray([255, 0, 0, 128]),
      },
      // HSL/HSLA (object passes as any, string passes as string)
      { case: 'HSL object', value: { h: 0, s: 100, l: 50 } },
      { case: 'HSLA object', value: { h: 0, s: 100, l: 50, a: 0.5 } },
      { case: 'hsl string', value: 'hsl(0, 100%, 50%)' },
      // HSV/HSVA (pass as any)
      { case: 'HSV object', value: { h: 0, s: 100, v: 100 } },
      { case: 'HSVA object', value: { h: 0, s: 100, v: 100, a: 0.5 } },
    ];

    it.each(validColorSourceCases)(
      'should correctly parse various color source types: $case',
      ({ value }) => {
        // Since the schema is z.union([z.string(), z.any()]),
        // it should not throw for any of these valid ColorSource formats.
        expect(() => Tint.parse(value)).not.toThrow();
        const parsed = Tint.parse(value);
        expect(parsed).toEqual(value);
      },
    );
  });

  describe('Base Schema', () => {
    it('should parse a valid object with all properties', () => {
      const data = { show: false, id: 'custom-id', attrs: { extra: 'value' } };
      const result = Base.parse(data);
      expect(result).toEqual(data);
    });

    it('should apply default values for missing optional properties', () => {
      const data = {};
      const result = Base.parse(data);
      expect(result).toEqual({ show: true, id: 'mock-uid-123' });
      expect(uid).toHaveBeenCalled();
    });

    it('should throw an error for unknown properties due to .strict()', () => {
      const data = { show: true, unknownProperty: 'test' };
      expect(() => Base.parse(data)).toThrow();
    });

    it('should allow "attrs" to contain any data type', () => {
      const data = {
        attrs: {
          aNumber: 123,
          aString: 'hello',
          aBoolean: false,
          aNull: null,
          anObject: { nested: true },
        },
      };
      const result = Base.parse(data);
      expect(result.attrs).toEqual(data.attrs);
    });
  });

  describe('Size Schema', () => {
    it.each([
      { case: 'positive integers', input: { width: 100, height: 200 } },
      { case: 'zero values', input: { width: 0, height: 0 } },
      { case: 'floating point numbers', input: { width: 10.5, height: 20.5 } },
    ])('should correctly parse valid size object for $case', ({ input }) => {
      expect(Size.parse(input)).toEqual(input);
    });

    it.each([
      { case: 'negative width', input: { width: -100, height: 100 } },
      { case: 'negative height', input: { width: 100, height: -1 } },
      { case: 'invalid type (string)', input: { width: '100', height: 100 } },
      { case: 'missing height property', input: { width: 100 } },
      { case: 'NaN value', input: { width: 100, height: Number.NaN } },
    ])(
      'should throw an error for invalid size object for $case',
      ({ input }) => {
        expect(() => Size.parse(input)).toThrow();
      },
    );
  });

  describe('pxOrPercentSchema', () => {
    it.each([
      {
        case: 'pixel number',
        input: 100,
        expected: { value: 100, unit: 'px' },
      },
      {
        case: 'percentage string',
        input: '80%',
        expected: { value: 80, unit: '%' },
      },
      {
        case: 'float percentage string',
        input: '33.3%',
        expected: { value: 33.3, unit: '%' },
      },
      {
        case: 'zero pixel',
        input: 0,
        expected: { value: 0, unit: 'px' },
      },
      {
        case: 'zero percent',
        input: '0%',
        expected: { value: 0, unit: '%' },
      },
      {
        case: 'pre-formatted object',
        input: { value: 50, unit: 'px' },
        expected: { value: 50, unit: 'px' },
      },
    ])('should correctly parse and transform $case', ({ input, expected }) => {
      expect(pxOrPercentSchema.parse(input)).toEqual(expected);
    });

    it.each([
      { case: 'negative number', input: -100 },
      { case: 'malformed percentage string', input: '100' },
      { case: 'percentage with space', input: '50 %' },
      { case: 'invalid unit string', input: '100em' },
      {
        case: 'invalid pre-formatted object unit',
        input: { value: 50, unit: 'em' },
      },
      { case: 'null input', input: null },
    ])('should throw an error for invalid input for $case', ({ input }) => {
      expect(() => pxOrPercentSchema.parse(input)).toThrow();
    });
  });

  describe('PxOrPercentSize Schema', () => {
    it('should parse and transform mixed pixel and percentage values', () => {
      const input = { width: 150, height: '75%' };
      const expected = {
        width: { value: 150, unit: 'px' },
        height: { value: 75, unit: '%' },
      };
      expect(PxOrPercentSize.parse(input)).toEqual(expected);
    });

    it('should correctly parse the new "size" property', () => {
      const input = { size: '50%' };
      const expected = { size: { value: 50, unit: '%' } };
      expect(PxOrPercentSize.parse(input)).toEqual(expected);
    });

    it('should parse an empty object', () => {
      expect(PxOrPercentSize.parse({})).toEqual({});
    });

    it('should handle all properties at once', () => {
      const input = { width: 100, height: '50%', size: 25 };
      const expected = {
        width: { value: 100, unit: 'px' },
        height: { value: 50, unit: '%' },
        size: { value: 25, unit: 'px' },
      };
      expect(PxOrPercentSize.parse(input)).toEqual(expected);
    });
  });

  describe('Placement Schema', () => {
    it.each([
      'left',
      'left-top',
      'left-bottom',
      'top',
      'right',
      'right-top',
      'right-bottom',
      'bottom',
      'center',
      'none',
    ])('should accept valid placement value: %s', (placement) => {
      expect(() => Placement.parse(placement)).not.toThrow();
    });

    it.each(['top-left', 'center-top', 'invalid-placement', '', null])(
      'should reject invalid placement value: %s',
      (placement) => {
        expect(() => Placement.parse(placement)).toThrow();
      },
    );
  });

  describe('Gap Schema', () => {
    it.each([
      { case: 'a single number', input: 20, expected: { x: 20, y: 20 } },
      {
        case: 'object with x and y',
        input: { x: 10, y: 30 },
        expected: { x: 10, y: 30 },
      },
      {
        case: 'object with only x',
        input: { x: 15 },
        expected: { x: 15, y: 0 },
      },
      {
        case: 'object with only y',
        input: { y: 25 },
        expected: { x: 0, y: 25 },
      },
      { case: 'empty object', input: {}, expected: { x: 0, y: 0 } },
      { case: 'undefined', input: undefined, expected: { x: 0, y: 0 } },
    ])('should correctly preprocess and parse $case', ({ input, expected }) => {
      expect(Gap.parse(input)).toEqual(expected);
    });

    it.each([
      { case: 'negative number', input: -10 },
      { case: 'object with negative x', input: { x: -10, y: 10 } },
      { case: 'null input', input: null },
      { case: 'string input', input: '20' },
      { case: 'object with non-numeric value', input: { x: '10', y: 10 } },
    ])('should throw an error for invalid input for $case', ({ input }) => {
      expect(() => Gap.parse(input)).toThrow();
    });
  });

  describe('Margin Schema', () => {
    it.each([
      {
        case: 'single number',
        input: 15,
        expected: { top: 15, right: 15, bottom: 15, left: 15 },
      },
      {
        case: 'object with x and y',
        input: { x: 10, y: 20 },
        expected: { top: 20, right: 10, bottom: 20, left: 10 },
      },
      {
        case: 'full object',
        input: { top: 5, right: 10, bottom: 15, left: 20 },
        expected: { top: 5, right: 10, bottom: 15, left: 20 },
      },
      {
        case: 'object with only x',
        input: { x: 30 },
        expected: { top: 0, right: 30, bottom: 0, left: 30 },
      },
      {
        case: 'object with only y',
        input: { y: 40 },
        expected: { top: 40, right: 0, bottom: 40, left: 0 },
      },
      {
        case: 'empty object',
        input: {},
        expected: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      {
        case: 'undefined',
        input: undefined,
        expected: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      {
        case: 'partial object with undefined',
        input: { top: 10, right: undefined },
        expected: { top: 10, right: 0, bottom: 0, left: 0 },
      },
      {
        case: 'negative number',
        input: -10,
        expected: { top: -10, right: -10, bottom: -10, left: -10 },
      },
      {
        case: 'object with negative value',
        input: { top: -5, right: 10, bottom: -15, left: 20 },
        expected: { top: -5, right: 10, bottom: -15, left: 20 },
      },
    ])('should correctly preprocess and parse $case', ({ input, expected }) => {
      expect(Margin.parse(input)).toEqual(expected);
    });

    it.each([
      { case: 'null input', input: null },
      { case: 'object with non-numeric value', input: { top: '10' } },
    ])('should throw an error for invalid input for $case', ({ input }) => {
      expect(() => Margin.parse(input)).toThrow();
    });
  });

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

    it('should parse an empty object', () => {
      expect(TextureStyle.parse({})).toEqual({});
    });

    it.each([
      { case: 'invalid enum for type', input: { type: 'circle' } },
      { case: 'invalid type for fill', input: { fill: 123 } },
      { case: 'invalid type for borderWidth', input: { borderWidth: '2px' } },
    ])('should fail on invalid data types ($case)', ({ input }) => {
      expect(() => TextureStyle.parse(input)).toThrow();
    });
  });

  describe('RelationsStyle Schema', () => {
    it('should add default color if not provided', () => {
      const data = { lineWidth: 2 };
      expect(RelationsStyle.parse(data)).toEqual({
        color: 'black',
        lineWidth: 2,
      });
    });

    it('should not override provided color', () => {
      const data = { color: 'blue' };
      expect(RelationsStyle.parse(data)).toEqual({ color: 'blue' });
    });

    it.each([
      { case: 'undefined', input: undefined },
      { case: 'null', input: null },
      { case: 'empty object', input: {} },
    ])('should return default object for $case input', ({ input }) => {
      expect(RelationsStyle.parse(input)).toEqual({ color: 'black' });
    });
  });

  describe('TextStyle Schema', () => {
    it('should apply default styles for a partial object', () => {
      const data = { fontSize: 16 };
      expect(TextStyle.parse(data)).toEqual({
        fontFamily: 'FiraCode',
        fontWeight: 400,
        fill: 'black',
        fontSize: 16,
      });
    });

    it('should not override provided styles', () => {
      const data = { fontFamily: 'Arial', fill: 'red', fontWeight: 'bold' };
      expect(TextStyle.parse(data)).toEqual({
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 'red',
      });
    });

    it.each([
      { case: 'undefined', input: undefined },
      { case: 'null', input: null },
      { case: 'empty object', input: {} },
    ])('should return full default object for $case input', ({ input }) => {
      expect(TextStyle.parse(input)).toEqual({
        fontFamily: 'FiraCode',
        fontWeight: 400,
        fill: 'black',
      });
    });
  });
});
