import {
  PatchMapTextLayoutError,
  type PatchMapTextBounds,
} from './contracts';

export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_LINE_HEIGHT = 20;
export const DEFAULT_LINE_HEIGHT_RATIO = DEFAULT_LINE_HEIGHT / DEFAULT_FONT_SIZE;
export const DEFAULT_BASELINE = 16;
export const ELLIPSIS = '…';
export const MISSING_GLYPH_BOX = '□';
export const EXPLICIT_MISSING_CODE_POINTS = new Set([0x10ffff]);
export const MAX_SEMANTIC_ADVANCE = Number.MAX_SAFE_INTEGER;

export function bounds(x: number, y: number, width: number, height: number): PatchMapTextBounds {
  return freeze({ x, y, width, height });
}

export function maximum(values: readonly number[]): number {
  let result = 0;
  for (const value of values) result = Math.max(result, value);
  return result;
}

export function saturatingAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isFinite(result)) {
    return result < 0 ? -MAX_SEMANTIC_ADVANCE : MAX_SEMANTIC_ADVANCE;
  }
  return Math.max(-MAX_SEMANTIC_ADVANCE, Math.min(MAX_SEMANTIC_ADVANCE, result));
}

export function saturatingSubtract(left: number, right: number): number {
  return saturatingAdd(left, -right);
}

export function saturatingMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  const result = left * right;
  if (!Number.isFinite(result) || Math.abs(result) > MAX_SEMANTIC_ADVANCE) {
    return Math.sign(left) === Math.sign(right)
      ? MAX_SEMANTIC_ADVANCE
      : -MAX_SEMANTIC_ADVANCE;
  }
  return result;
}

/** Preserve the 16px/20px semantic default while scaling omitted line height. */
export function resolveLineHeightPx(fontSizePx: number, explicit?: number): number {
  return explicit ?? saturatingMultiply(fontSizePx, DEFAULT_LINE_HEIGHT_RATIO);
}

export function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) unsupported(path, 'value must be finite');
}

export function assertFinitePositive(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) unsupported(path, 'value must be finite and positive');
}

export function assertFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) unsupported(path, 'value must be finite and non-negative');
}

export function unsupported(path: string, detail: string): never {
  throw new PatchMapTextLayoutError(path, detail);
}

export function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
