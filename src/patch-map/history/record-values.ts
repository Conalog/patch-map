import { isOwnedPatchMapDataset } from '../semantic/dataset';
import type {
  PatchMapSemanticHistoryCommand,
  PatchMapSemanticHistoryCommandInput,
  PatchMapSemanticHistorySnapshot,
  PatchMapSemanticHistorySnapshotInput,
} from './contracts';

export function detachCommand<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: PatchMapSemanticHistoryCommandInput<TDataset, TCompanion>,
): PatchMapSemanticHistoryCommand<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('history command must be an object');
  }
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new TypeError('history command id must be a non-empty string');
  }
  const before = detachSnapshot(input.before, '$.before');
  const after = detachSnapshot(input.after, '$.after');
  const record = Object.freeze({ before, after });
  return Object.freeze({
    id: input.id,
    recordCount: 1,
    records: Object.freeze([record]),
    before,
    after,
  });
}

export function retainOwnedImmutableCommand<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: PatchMapSemanticHistoryCommandInput<TDataset, TCompanion>,
): PatchMapSemanticHistoryCommand<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('history command must be an object');
  }
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new TypeError('history command id must be a non-empty string');
  }
  const before = retainOwnedImmutableSnapshot(input.before, '$.before');
  const after = retainOwnedImmutableSnapshot(input.after, '$.after');
  const record = Object.freeze({ before, after });
  return Object.freeze({
    id: input.id,
    recordCount: 1,
    records: Object.freeze([record]),
    before,
    after,
  });
}

function retainOwnedImmutableSnapshot<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: PatchMapSemanticHistorySnapshotInput<TDataset, TCompanion>,
  path: string,
): PatchMapSemanticHistorySnapshot<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError(`${path} must be an object`);
  }
  if (!isOwnedPatchMapDataset(input.dataset)) {
    throw new TypeError(`${path}.dataset must be an Engine-owned materialized array`);
  }
  const companion = input.companion === undefined ? null : input.companion;
  if (!isDeeplyFrozenJson(companion)) {
    throw new TypeError(`${path}.companion must be Engine-owned and deeply frozen`);
  }
  return Object.freeze({ dataset: input.dataset, companion });
}

function isDeeplyFrozenJson(
  value: unknown,
  visited: Set<object> = new Set(),
): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value !== 'object' || !Object.isFrozen(value)) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !('value' in descriptor) ||
          !isDeeplyFrozenJson(descriptor.value, visited)
        ) {
          return false;
        }
      }
      return Reflect.ownKeys(value).every((key) => (
        key === 'length' ||
        (typeof key === 'string' && isCanonicalArrayIndex(key, value.length))
      ));
    }
    if (!isPlainJsonRecord(value)) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return false;
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        !isDeeplyFrozenJson(descriptor.value, visited)
      ) {
        return false;
      }
    }
    return true;
  } finally {
    visited.delete(value);
  }
}

function isPlainJsonRecord(value: object): value is Readonly<Record<string, unknown>> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function mergeCommands<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  previous: PatchMapSemanticHistoryCommand<TDataset, TCompanion>,
  next: PatchMapSemanticHistoryCommand<TDataset, TCompanion>,
): PatchMapSemanticHistoryCommand<TDataset, TCompanion> {
  return Object.freeze({
    id: previous.id,
    recordCount: previous.recordCount + next.recordCount,
    records: Object.freeze([...previous.records, ...next.records]),
    before: previous.before,
    after: next.after,
  });
}

function detachSnapshot<
  TDataset extends readonly unknown[],
  TCompanion,
>(
  input: PatchMapSemanticHistorySnapshotInput<TDataset, TCompanion>,
  path: string,
): PatchMapSemanticHistorySnapshot<TDataset, TCompanion> {
  if (input === null || typeof input !== 'object') {
    throw new TypeError(`${path} must be an object`);
  }
  if (!Array.isArray(input.dataset)) {
    throw new TypeError(`${path}.dataset must be an array`);
  }
  const dataset = cloneSemanticValue(input.dataset, `${path}.dataset`) as TDataset;
  const companion = input.companion === undefined
    ? null
    : cloneSemanticValue(input.companion, `${path}.companion`) as TCompanion;
  return Object.freeze({ dataset, companion });
}

function cloneSemanticValue(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain finite numbers`);
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} must contain only JSON semantic values`);
  }
  if (ancestors.has(value)) throw new TypeError(`${path} must not contain cycles`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const clone: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (descriptor === undefined) {
          throw new TypeError(`${path}[${index}] must not be sparse`);
        }
        if (!descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError(`${path}[${index}] must be an enumerable data property`);
        }
        clone.push(cloneSemanticValue(
          descriptor.value,
          `${path}[${index}]`,
          ancestors,
        ));
      }
      for (const key of Reflect.ownKeys(value)) {
        if (key === 'length') continue;
        if (typeof key !== 'string') {
          throw new TypeError(`${path} must not contain symbol keys`);
        }
        if (!isCanonicalArrayIndex(key, value.length)) {
          throw new TypeError(`${path}.${key} must not be an extra array property`);
        }
      }
      return Object.freeze(clone);
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain semantic records`);
    }
    const clone: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new TypeError(`${path} must not contain symbol keys`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(`${path}.${key} must be an enumerable data property`);
      }
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: cloneSemanticValue(descriptor.value, `${path}.${key}`, ancestors),
      });
    }
    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  const index = Number(key);
  return Number.isSafeInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key;
}

export function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => semanticEqual(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => (
      key === rightKeys[index] && semanticEqual(left[key], right[key])
    ));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
