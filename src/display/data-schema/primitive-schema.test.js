import { describe, expect, it, vi } from 'vitest';
import { uid } from '../../utils/uuid';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
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
        expect(() => Tint.parse(value)).not.toThrow();
        const parsed = Tint.parse(value);
        expect(parsed).toEqual(value);
      },
    );
  });

  describe('Base Schema', () => {
    it('should parse a valid object with all properties', () => {
      const data = {
        show: false,
        id: 'custom-id',
        label: 'My Base',
        attrs: { extra: 'value' },
      };
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
  });

  describe('Size Schema', () => {
    it('should transform a single number into a width/height object', () => {
      const input = 100;
      const expected = { width: 100, height: 100 };
      expect(Size.parse(input)).toEqual(expected);
    });

    it('should correctly parse a valid width/height object', () => {
      const input = { width: 100, height: 200 };
      expect(Size.parse(input)).toEqual(input);
    });

    it.each([
      { case: 'negative number', input: -100 },
      { case: 'invalid object property', input: { width: '100', height: 100 } },
      { case: 'partial object', input: { width: 100 } },
      { case: 'null input', input: null },
    ])('should throw an error for invalid input: $case', ({ input }) => {
      expect(() => Size.parse(input)).toThrow();
    });
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
      {
        case: 'invalid pre-formatted object unit',
        input: { value: 50, unit: 'em' },
      },
    ])('should throw an error for invalid input for $case', ({ input }) => {
      expect(() => pxOrPercentSchema.parse(input)).toThrow();
    });
  });

  describe('PxOrPercentSize Schema', () => {
    it('should transform a single number into a full px width/height object', () => {
      const input = 100;
      const expected = {
        width: { value: 100, unit: 'px' },
        height: { value: 100, unit: 'px' },
      };
      expect(PxOrPercentSize.parse(input)).toEqual(expected);
    });

    it('should transform a single percentage string into a full % width/height object', () => {
      const input = '75%';
      const expected = {
        width: { value: 75, unit: '%' },
        height: { value: 75, unit: '%' },
      };
      expect(PxOrPercentSize.parse(input)).toEqual(expected);
    });

    it('should correctly parse a full width/height object', () => {
      const input = { width: 150, height: '75%' };
      const expected = {
        width: { value: 150, unit: 'px' },
        height: { value: 75, unit: '%' },
      };
      expect(PxOrPercentSize.parse(input)).toEqual(expected);
    });

    it('should allow partial PxOrPercentSize objects with deepPartial', () => {
      const input = {
        width: { value: 150, unit: 'px' },
        height: { value: 75, unit: '%' },
      };
      const expected = {
        width: { value: 150, unit: 'px' },
        height: { value: 75, unit: '%' },
      };
      expect(deepPartial(PxOrPercentSize).parse(input)).toEqual(expected);
    });

    it.each([
      { case: 'partial object', input: { width: 100 } },
      { case: 'invalid value in object', input: { width: -50, height: 100 } },
      { case: 'null input', input: null },
    ])('should throw an error for invalid input: $case', ({ input }) => {
      expect(() => PxOrPercentSize.parse(input)).toThrow();
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
    ])('should accept valid placement value: %s', (placement) => {
      expect(() => Placement.parse(placement)).not.toThrow();
    });

    it.each(['top-left', 'invalid-placement', null])(
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
      expect(RelationsStyle.parse(data)).toEqual({ lineWidth: 2 });
    });
  });

  describe('TextStyle Schema', () => {
    it('should apply default styles for a partial object', () => {
      const data = { fontSize: 16 };
      expect(TextStyle.parse(data)).toEqual({
        fontSize: 16,
        autoFont: { min: 1, max: 100 },
      });
    });

    it('should not override provided styles', () => {
      const data = { fontFamily: 'Arial', fill: 'red', fontWeight: 'bold' };
      expect(TextStyle.parse(data)).toEqual({
        autoFont: { min: 1, max: 100 },
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 'red',
      });
    });
  });

  describe('pxOrPercentSchema with calc() support', () => {
    describe('Valid calc() Expressions', () => {
      const validCalcCases = [
        { case: 'simple subtraction', input: 'calc(100% - 20px)' },
        { case: 'different order', input: 'calc(10px - 100%)' },
        { case: 'simple addition', input: 'calc(20px + 40%)' },
        { case: 'multiple px values', input: 'calc(5px + 1px - 4px)' },
        {
          case: 'multiple mixed values',
          input: 'calc(10% + 20% - 14px + 40%)',
        },
        { case: 'multiple spaces', input: 'calc( 100%  -  20px )' },
        { case: '', input: 'calc( 100% + -20px )' },
      ];

      it.each(validCalcCases)(
        'should parse valid calc expression: $case',
        ({ input }) => {
          expect(pxOrPercentSchema.parse(input)).toBe(input);
        },
      );
    });

    describe('Invalid calc() Expressions', () => {
      const invalidCalcCases = [
        { case: 'invalid unit (rem)', input: 'calc(100% - 20rem)' },
        { case: 'missing closing parenthesis', input: 'calc(100% - 20px' },
        { case: 'missing opening parenthesis', input: '100% - 20px)' },
        { case: 'empty calc', input: 'calc()' },
        { case: 'ending with operator', input: 'calc(100% -)' },
        { case: 'starting with operator', input: 'calc(- 100%)' },
        { case: 'double operators', input: 'calc(100% -- 20px)' },
        { case: 'invalid operator', input: 'calc(100% * 20px)' },
        { case: 'no units', input: 'calc(100 - 20)' },
        { case: 'no spaces', input: 'calc(100%-20px)' },
      ];

      it.each(invalidCalcCases)(
        'should throw an error for invalid calc expression: $case',
        ({ input }) => {
          expect(() => pxOrPercentSchema.parse(input)).toThrow();
        },
      );
    });
  });
});
