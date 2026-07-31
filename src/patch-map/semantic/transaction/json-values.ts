import type { PatchMapMutationJsonValue } from './contracts';
import { nonSerializable } from './diagnostics';

export type MutableJsonValue =
  | null
  | string
  | number
  | boolean
  | MutableJsonValue[]
  | { [key: string]: MutableJsonValue };

export type MutableJsonRecord = { [key: string]: MutableJsonValue };

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function isUnsafeJsonPathSegment(value: string): boolean {
  return UNSAFE_PATH_SEGMENTS.has(value);
}

/**
 * Detach and deeply freeze JSON entering the mutation boundary.
 */
export function cloneImmutableJson(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): PatchMapMutationJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) nonSerializable(path, 'numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) nonSerializable(path, 'cyclic values are not accepted');
    ancestors.add(value);
    try {
      const result: PatchMapMutationJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          nonSerializable(`${path}[${index}]`, 'sparse arrays are not accepted');
        }
        result.push(cloneImmutableJson(value[index], `${path}[${index}]`, ancestors));
      }
      return Object.freeze(result);
    } finally {
      ancestors.delete(value);
    }
  }
  if (isPlainRecord(value)) {
    if (ancestors.has(value)) nonSerializable(path, 'cyclic values are not accepted');
    ancestors.add(value);
    try {
      const result: Record<string, PatchMapMutationJsonValue> = {};
      for (const key of Object.keys(value)) {
        if (isUnsafeJsonPathSegment(key)) {
          nonSerializable(`${path}.${key}`, 'unsafe keys are not accepted');
        }
        defineImmutableProperty(
          result,
          key,
          cloneImmutableJson(value[key], `${path}.${key}`, ancestors),
        );
      }
      return Object.freeze(result);
    } finally {
      ancestors.delete(value);
    }
  }
  nonSerializable(path, 'values must be JSON scalars, arrays, or strict plain records');
}

/**
 * Clone JSON into the isolated staging graph where mutations may be applied.
 */
export function cloneMutableJson(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): MutableJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) nonSerializable(path, 'numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) nonSerializable(path, 'cyclic values are not accepted');
    ancestors.add(value);
    try {
      return value.map((entry, index) => cloneMutableJson(entry, `${path}[${index}]`, ancestors));
    } finally {
      ancestors.delete(value);
    }
  }
  if (isPlainRecord(value)) {
    if (ancestors.has(value)) nonSerializable(path, 'cyclic values are not accepted');
    ancestors.add(value);
    try {
      const result: MutableJsonRecord = {};
      for (const key of Object.keys(value)) {
        if (isUnsafeJsonPathSegment(key)) {
          nonSerializable(`${path}.${key}`, 'unsafe keys are not accepted');
        }
        defineMutableProperty(
          result,
          key,
          cloneMutableJson(value[key], `${path}.${key}`, ancestors),
        );
      }
      return result;
    } finally {
      ancestors.delete(value);
    }
  }
  nonSerializable(path, 'values must be JSON scalars, arrays, or strict plain records');
}

export function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length &&
      left.every((entry, index) => jsonEquivalent(entry, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every(
    (key, index) => key === rightKeys[index] && jsonEquivalent(left[key], right[key]),
  );
}

export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isJsonRecord(
  value: PatchMapMutationJsonValue,
): value is Readonly<Record<string, PatchMapMutationJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isMutableJsonRecord(value: unknown): value is MutableJsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requireRecordValue(
  record: MutableJsonRecord,
  key: string,
): MutableJsonValue {
  const value = record[key];
  if (value === undefined) throw new Error(`Missing staged record value ${key}`);
  return value;
}

export function defineMutableProperty(
  target: MutableJsonRecord,
  key: string,
  value: MutableJsonValue,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function defineImmutableProperty(
  target: Record<string, PatchMapMutationJsonValue>,
  key: string,
  value: PatchMapMutationJsonValue,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: false,
    writable: false,
  });
}
