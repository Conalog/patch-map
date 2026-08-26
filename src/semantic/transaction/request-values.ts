import {
  PATCH_MAP_COMPONENT_TYPES,
  PATCH_MAP_ELEMENT_TYPES,
} from '../dataset/contracts';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationOperation,
  PatchMapMutationPathSegment,
  PatchMapMutationTarget,
} from './contracts';
import { isPlainRecord } from '../../shared/plain-record';
import { transactionFail } from './diagnostics';

export const BAR_HEIGHT_BATCH_FIELDS = new Set([
  'targets',
  'heights',
  'animate',
  'actionId',
  'recordHistory',
]);
export const BAR_HEIGHT_BATCH_TARGET_FIELDS = new Set(['ownerId', 'componentId']);
export const TEXT_BATCH_FIELDS = new Set([
  'targets',
  'texts',
  'styles',
  'actionId',
  'recordHistory',
]);
export const TEXT_BATCH_TARGET_FIELDS = new Set(['ownerId', 'componentId']);

const TARGET_ELEMENT_FIELDS = new Set(['kind', 'id']);
const TARGET_COMPONENT_FIELDS = new Set(['kind', 'ownerId', 'id']);
const ELEMENT_TYPE_SET = new Set<string>(PATCH_MAP_ELEMENT_TYPES);
const COMPONENT_TYPE_SET = new Set<string>(PATCH_MAP_COMPONENT_TYPES);

export const EMPTY_OPERATIONS: readonly PatchMapMutationOperation[] = Object.freeze([]);

export function isPatchMapElementType(value: unknown): value is string {
  return typeof value === 'string' && ELEMENT_TYPE_SET.has(value);
}

export function isPatchMapComponentType(value: unknown): value is string {
  return typeof value === 'string' && COMPONENT_TYPE_SET.has(value);
}

export function normalizeElementTarget(
  value: unknown,
  path: string,
  operationIndex: number,
): Extract<PatchMapMutationTarget, { readonly kind: 'element' }> {
  const target = normalizeTarget(value, path, operationIndex);
  if (target.kind !== 'element') {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${path}.kind`,
      'structural hierarchy operations require element targets',
      operationIndex,
      target,
    );
  }
  return target;
}

export function normalizeTarget(
  value: unknown,
  path: string,
  operationIndex: number,
): PatchMapMutationTarget {
  const record = strictRecord(value, path, 'target must be a strict plain record');
  if (record.kind !== 'element' && record.kind !== 'component') {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${path}.kind`,
      "target kind must be 'element' or 'component'",
      operationIndex,
    );
  }
  rejectUnknownFields(
    record,
    record.kind === 'element' ? TARGET_ELEMENT_FIELDS : TARGET_COMPONENT_FIELDS,
    path,
    operationIndex,
  );
  if (typeof record.id !== 'string') {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      `${path}.id`,
      'target id must be a string',
      operationIndex,
    );
  }
  if (record.kind === 'element') return Object.freeze({ kind: 'element', id: record.id });
  if (typeof record.ownerId !== 'string') {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      `${path}.ownerId`,
      'component target ownerId must be a string',
      operationIndex,
    );
  }
  return Object.freeze({ kind: 'component', ownerId: record.ownerId, id: record.id });
}

export function validateAddedElementRecord(
  value: Readonly<Record<string, PatchMapMutationJsonValue>>,
  operationPath: string,
  operationIndex: number,
): void {
  if (typeof value.id !== 'string' || value.id.length === 0) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      `${operationPath}.value.id`,
      'add value ID must be a non-empty string',
      operationIndex,
    );
  }
  if (typeof value.type !== 'string' || !ELEMENT_TYPE_SET.has(value.type)) {
    transactionFail(
      'INVALID_RECORD_KIND',
      'INVALID_INPUT',
      `${operationPath}.value.type`,
      'add value discriminator must be an element kind',
      operationIndex,
      { kind: 'element', id: value.id },
    );
  }
}

export function isNumberArrayLike(value: unknown): value is ArrayLike<number> {
  return Array.isArray(value) ||
    (
      ArrayBuffer.isView(value) &&
      !(value instanceof DataView) &&
      'length' in value
    );
}

export function strictNumberArrayLike(
  value: unknown,
  path: string,
  message: string,
): readonly unknown[] {
  if (Array.isArray(value)) return strictOrderedArray(value, path, message);
  if (!isNumberArrayLike(value)) {
    transactionFail('INVALID_VALUE', 'INVALID_INPUT', path, message);
  }
  const detached: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    detached.push(value[index]);
  }
  return Object.freeze(detached);
}

export function isIndexStructuralPath(path: readonly PatchMapMutationPathSegment[]): boolean {
  const root = path[0];
  return root === 'children' || root === 'components' || root === 'item' || root === 'cells';
}

export function targetKey(target: PatchMapMutationTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

export function targetLabel(target: PatchMapMutationTarget): string {
  return target.kind === 'element'
    ? `element:${target.id}`
    : `component:${target.ownerId}/${target.id}`;
}

export function rejectUnknownFields(
  record: Readonly<Record<string, unknown>>,
  accepted: ReadonlySet<string>,
  path: string,
  operationIndex?: number,
  target?: PatchMapMutationTarget,
): void {
  const unknown = Object.keys(record).filter((key) => !accepted.has(key)).sort()[0];
  if (unknown !== undefined) {
    transactionFail(
      'UNKNOWN_FIELD',
      'INVALID_INPUT',
      `${path}.${unknown}`,
      'field is not in the closed mutation schema',
      operationIndex,
      target,
    );
  }
}

export function strictRecord(
  value: unknown,
  path: string,
  message: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) {
    transactionFail('INVALID_VALUE', 'INVALID_INPUT', path, message);
  }
  const detached: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        path,
        'strict records must not contain symbol keys',
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        `${path}.${key}`,
        'strict record fields must be own enumerable data properties',
      );
    }
    Object.defineProperty(detached, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(detached);
}

export function strictOrderedArray(
  value: unknown,
  path: string,
  message: string,
  operationIndex?: number,
  target?: PatchMapMutationTarget,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      path,
      message,
      operationIndex,
      target,
    );
  }
  const detached: unknown[] = new Array(value.length);
  let entryCount = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string') {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        path,
        'ordered arrays must not contain symbol keys',
        operationIndex,
        target,
      );
    }
    const index = Number(key);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key
    ) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        `${path}.${key}`,
        'ordered arrays must not contain extra properties',
        operationIndex,
        target,
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        `${path}[${index}]`,
        'ordered arrays require own enumerable data entries without gaps',
        operationIndex,
        target,
      );
    }
    detached[index] = descriptor.value;
    entryCount += 1;
  }
  if (entryCount !== value.length) {
    for (let index = 0; index < detached.length; index += 1) {
      if (!Object.hasOwn(detached, index)) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}[${index}]`,
          'ordered arrays require own enumerable data entries without gaps',
          operationIndex,
          target,
        );
      }
    }
  }
  return Object.freeze(detached);
}

export function requireAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing value at index ${index}`);
  return value;
}
