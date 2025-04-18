import { describe, expect, it } from 'vitest';
import { isSame } from './isSame';

describe('isSame', () => {
  it('should return true for identical plain objects', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 2 };
    expect(isSame(obj1, obj2)).toBe(true);
  });

  it('should return false for different plain objects', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, b: 3 };
    expect(isSame(obj1, obj2)).toBe(false);
  });

  it('should return true for identical non-object values', () => {
    expect(isSame(1, 1)).toBe(true);
    expect(isSame('test', 'test')).toBe(true);
  });

  it('should return false for different non-object values', () => {
    expect(isSame(1, 2)).toBe(false);
    expect(isSame('test', 'diff')).toBe(false);
  });

  it('should return true for deeply identical objects', () => {
    const obj1 = { a: { b: 2, c: 3 }, d: 4 };
    const obj2 = { a: { b: 2, c: 3 }, d: 4 };
    expect(isSame(obj1, obj2)).toBe(true);
  });

  it('should return false for deeply different objects', () => {
    const obj1 = { a: { b: 2, c: 3 }, d: 4 };
    const obj2 = { a: { b: 2, c: 4 }, d: 4 };
    expect(isSame(obj1, obj2)).toBe(false);
  });

  it('should handle undefined and null values correctly', () => {
    expect(isSame(undefined, undefined)).toBe(true);
    expect(isSame(null, null)).toBe(true);
    expect(isSame(undefined, null)).toBe(false);
    expect(isSame(null, undefined)).toBe(false);
    expect(isSame({ a: undefined }, { a: undefined })).toBe(true);
    expect(isSame({ a: null }, { a: null })).toBe(true);
    expect(isSame({ a: undefined }, { a: null })).toBe(true);
  });

  it('should handle objects with null and undefined properties correctly', () => {
    const obj1 = { a: null, b: undefined, c: { d: null } };
    const obj2 = { a: null, b: undefined, c: { d: null } };
    const obj3 = { a: null, b: undefined, c: { d: undefined } };

    expect(isSame(obj1, obj2)).toBe(true);
    expect(isSame(obj1, obj3)).toBe(true);
  });

  it('should handle mixed object and primitive comparisons', () => {
    expect(isSame({ a: 1 }, 1)).toBe(false);
    expect(isSame({ a: 1 }, null)).toBe(false);
    expect(isSame({ a: 1 }, undefined)).toBe(false);
    expect(isSame(null, { a: 1 })).toBe(false);
    expect(isSame(undefined, { a: 1 })).toBe(false);
  });
});
