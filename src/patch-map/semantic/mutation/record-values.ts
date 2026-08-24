import type { PatchMapDatasetError } from '../dataset';
import type { PatchMapSemanticTarget } from '../probe';
import { isPlainRecord } from '../../shared/plain-record';
import type {
  PatchMapSemanticMutationDiagnostic,
  PatchMapSemanticMutationDiagnosticReason,
} from './contracts';

const ELEMENT_TARGET_FIELDS = new Set(['kind', 'id']);
const COMPONENT_TARGET_FIELDS = new Set(['kind', 'ownerId', 'id']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function normalizeTarget(value: unknown): PatchMapSemanticTarget {
  if (!isPlainRecord(value)) {
    fail('invalid-target', '$.target', 'target must be a plain object');
  }
  const fields = ownEnumerableDataRecord(
    value,
    '$.target',
    'invalid-target',
    'target',
  );
  const kind = fields.kind;
  const acceptedFields = kind === 'element' ? ELEMENT_TARGET_FIELDS : COMPONENT_TARGET_FIELDS;
  const unknownField = Object.keys(fields).find((key) => !acceptedFields.has(key));
  if (unknownField !== undefined) {
    fail('invalid-target', `$.target.${unknownField}`, 'target contains an unknown field');
  }
  if (kind !== 'element' && kind !== 'component') {
    fail('invalid-target', '$.target.kind', "target kind must be 'element' or 'component'");
  }
  const id = fields.id;
  if (typeof id !== 'string') {
    fail('invalid-target', '$.target.id', 'target id must be a string');
  }
  if (kind === 'element') {
    return Object.freeze({ kind, id });
  }
  const ownerId = fields.ownerId;
  if (typeof ownerId !== 'string') {
    fail('invalid-target', '$.target.ownerId', 'component target ownerId must be a string');
  }
  return Object.freeze({ kind, ownerId, id });
}

export function normalizePatch(value: unknown): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) {
    fail('invalid-value', '$.patch', 'patch must be a strict plain record');
  }
  return cloneJsonRecord(value, '$.patch');
}

function cloneJsonRecord(
  value: Readonly<Record<string, unknown>>,
  path: string,
  ancestors = new Set<object>(),
): Readonly<Record<string, unknown>> {
  if (ancestors.has(value)) {
    fail('invalid-value', path, 'cyclic values are not accepted');
  }
  ancestors.add(value);
  try {
    const result: Record<string, unknown> = {};
    const fields = ownEnumerableDataRecord(value, path, 'invalid-value', 'record');
    for (const key of Object.keys(fields)) {
      if (UNSAFE_KEYS.has(key)) {
        fail('invalid-value', `${path}.${key}`, 'unsafe property names are not accepted');
      }
      defineDataProperty(result, key, cloneJsonValue(fields[key], `${path}.${key}`, ancestors));
    }
    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

function cloneJsonValue(value: unknown, path: string, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-value', path, 'numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) fail('invalid-value', path, 'cyclic values are not accepted');
    ancestors.add(value);
    try {
      const clone: unknown[] = [];
      const length = value.length;
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (descriptor === undefined) {
          fail('invalid-value', `${path}[${index}]`, 'sparse arrays are not accepted');
        }
        if (!descriptor.enumerable || !('value' in descriptor)) {
          fail(
            'invalid-value',
            `${path}[${index}]`,
            'array entries must be own enumerable data properties',
          );
        }
        clone.push(cloneJsonValue(descriptor.value, `${path}[${index}]`, ancestors));
      }
      for (const key of Reflect.ownKeys(value)) {
        if (key === 'length') continue;
        if (typeof key !== 'string') {
          fail('invalid-value', path, 'arrays must not contain symbol keys');
        }
        if (!isCanonicalArrayIndex(key, length)) {
          fail('invalid-value', `${path}.${key}`, 'extra array properties are not accepted');
        }
      }
      return Object.freeze(clone);
    } finally {
      ancestors.delete(value);
    }
  }
  if (isPlainRecord(value)) return cloneJsonRecord(value, path, ancestors);
  fail('invalid-value', path, 'values must be JSON scalars, arrays, or strict plain records');
}

export function mergeRecords(
  current: object,
  patch: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(current)) defineDataProperty(result, key, Reflect.get(current, key));
  for (const key of Object.keys(patch)) {
    const previous = Reflect.get(current, key) as unknown;
    const next = patch[key];
    defineDataProperty(
      result,
      key,
      isPlainRecord(previous) && isPlainRecord(next) ? mergeRecords(previous, next) : next,
    );
  }
  return result;
}

export function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => jsonEquivalent(entry, right[index]))
    );
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && jsonEquivalent(left[key], right[key]),
  );
}

export function diagnostic(
  reason: PatchMapSemanticMutationDiagnosticReason,
  path: string,
  message: string,
  datasetCode?: PatchMapDatasetError['code'],
): PatchMapSemanticMutationDiagnostic {
  return Object.freeze({
    reason,
    path,
    message,
    ...(datasetCode === undefined ? {} : { datasetCode }),
  });
}

function ownEnumerableDataRecord(
  value: Readonly<Record<string, unknown>>,
  path: string,
  reason: Extract<
    PatchMapSemanticMutationDiagnosticReason,
    'invalid-target' | 'invalid-value'
  >,
  subject: 'record' | 'target',
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      fail(reason, path, `${subject} must not contain symbol keys`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      fail(
        reason,
        `${path}.${key}`,
        `${subject} fields must be own enumerable data properties`,
      );
    }
    defineDataProperty(result, key, descriptor.value);
  }
  return result;
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isSafeInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key;
}

function defineDataProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export class MutationValidationFailure extends Error {
  public readonly diagnostic: PatchMapSemanticMutationDiagnostic;

  public constructor(mutationDiagnostic: PatchMapSemanticMutationDiagnostic) {
    super(mutationDiagnostic.message);
    this.name = 'MutationValidationFailure';
    this.diagnostic = mutationDiagnostic;
  }
}

function fail(
  reason: Extract<PatchMapSemanticMutationDiagnosticReason, 'invalid-target' | 'invalid-value'>,
  path: string,
  message: string,
): never {
  throw new MutationValidationFailure(diagnostic(reason, path, message));
}
