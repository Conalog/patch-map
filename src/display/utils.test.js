import { describe, expect, it } from 'vitest';
import { parseMargin } from './utils';

describe('parseMargin', () => {
  it('should handle a single value for all sides', () => {
    const input = '10';
    const output = parseMargin(input);
    expect(output).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
  });

  it('should handle two values (vertical | horizontal)', () => {
    const input = '10 20';
    const output = parseMargin(input);
    expect(output).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
  });

  it('should handle three values (top | horizontal | bottom)', () => {
    const input = '10 20 30';
    const output = parseMargin(input);
    expect(output).toEqual({ top: 10, right: 20, bottom: 30, left: 20 });
  });

  it('should handle four values (top | right | bottom | left)', () => {
    const input = '10 20 30 40';
    const output = parseMargin(input);
    expect(output).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
  });

  it('should handle multiple spaces between numbers', () => {
    const input = '10  20  30   40';
    const output = parseMargin(input);
    expect(output).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
  });

  it('should handle single value as a float', () => {
    const input = '10.5';
    const output = parseMargin(input);
    expect(output).toEqual({
      top: 10.5,
      right: 10.5,
      bottom: 10.5,
      left: 10.5,
    });
  });

  it('should handle multiple values with floats', () => {
    const input = '10.5 20.75';
    const output = parseMargin(input);
    expect(output).toEqual({
      top: 10.5,
      right: 20.75,
      bottom: 10.5,
      left: 20.75,
    });
  });

  it('should handle mixed integers and floats', () => {
    const input = '10.5 20 30.75 40';
    const output = parseMargin(input);
    expect(output).toEqual({ top: 10.5, right: 20, bottom: 30.75, left: 40 });
  });

  it('should throw an error for invalid input (non-numeric)', () => {
    const input = '10px 20';
    expect(() => parseMargin(input)).toThrow();
  });

  it('should throw an error for more than 4 values', () => {
    const input = '10 20 30 40 50';
    expect(() => parseMargin(input)).toThrow();
  });

  it('should throw an error for invalid float format', () => {
    const input = '10. 20';
    expect(() => parseMargin(input)).toThrow();
  });

  it('should throw an error for leading spaces', () => {
    const input = ' 10 20 30 40';
    expect(() => parseMargin(input)).toThrow();
  });

  it('should throw an error for trailing spaces', () => {
    const input = '10 20 30 40 ';
    expect(() => parseMargin(input)).toThrow();
  });
});
