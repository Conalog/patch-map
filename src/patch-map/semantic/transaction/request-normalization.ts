import {
  PATCH_MAP_COMPONENT_TYPES,
  PATCH_MAP_ELEMENT_TYPES,
} from '../dataset/contracts';
import type {
  PatchMapMutationConflictPolicy,
  PatchMapMutationJsonValue,
  PatchMapMutationOperation,
  PatchMapMutationPathChange,
  PatchMapMutationPathSegment,
  PatchMapMutationTarget,
} from './contracts';
import { isPlainRecord } from '../../shared/plain-record';
import { transactionFail } from './diagnostics';
import {
  cloneImmutableJson,
  isJsonRecord,
  isUnsafeJsonPathSegment,
} from './json-values';

export interface NormalizedTransaction {
  readonly operations: readonly PatchMapMutationOperation[];
  readonly strict: boolean;
  readonly conflictPolicy: PatchMapMutationConflictPolicy;
  readonly actionId?: string;
  readonly recordHistory?: boolean;
  readonly history?: PatchMapMutationJsonValue;
  readonly animatedBarTargets?: readonly Readonly<{
    readonly ownerId: string;
    readonly componentId: string;
  }>[];
}

const TRANSACTION_FIELDS = new Set([
  'operations',
  'strict',
  'actionId',
  'conflictPolicy',
  'recordHistory',
  'history',
  'animatedBarTargets',
]);
const BULK_PATCH_FIELDS = new Set(['targets', 'changes', 'strict', 'actionId']);
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
const ADD_FIELDS = new Set(['op', 'parent', 'collection', 'index', 'value']);
const MERGE_FIELDS = new Set(['op', 'target', 'changes']);
const CHANGE_FIELDS = new Set(['path', 'value']);
const REPLACE_FIELDS = new Set(['op', 'target', 'value']);
const RECONCILE_FIELDS = new Set(['op', 'target', 'components', 'matchMode']);
const REMOVE_FIELDS = new Set(['op', 'target', 'cascade']);
const MOVE_FIELDS = new Set(['op', 'target', 'parent', 'index']);
const GROUP_FIELDS = new Set(['op', 'targets', 'value']);
const UNGROUP_FIELDS = new Set(['op', 'target', 'relationPolicy']);
const ELEMENT_TYPE_SET = new Set<string>(PATCH_MAP_ELEMENT_TYPES);
const COMPONENT_TYPE_SET = new Set<string>(PATCH_MAP_COMPONENT_TYPES);
const SUPPORTED_OPERATION_SET = new Set([
  'add',
  'merge',
  'replace',
  'reconcile-components',
  'move',
  'group',
  'ungroup',
  'remove',
]);
const CONTRACT_OPERATION_SET = new Set([
  'add',
  'merge',
  'unset',
  'replace',
  'reconcile-components',
  'move',
  'group',
  'ungroup',
  'remove',
  'refresh',
]);

export const EMPTY_OPERATIONS: readonly PatchMapMutationOperation[] = Object.freeze([]);

export function isPatchMapElementType(value: unknown): value is string {
  return typeof value === 'string' && ELEMENT_TYPE_SET.has(value);
}

export function isPatchMapComponentType(value: unknown): value is string {
  return typeof value === 'string' && COMPONENT_TYPE_SET.has(value);
}

export function normalizeBulkPatch(value: unknown): NormalizedTransaction {
  const record = strictRecord(value, '$', 'bulk patch must be a strict plain record');
  rejectUnknownFields(record, BULK_PATCH_FIELDS, '$');
  const targetValues = strictOrderedArray(
    record.targets,
    '$.targets',
    'targets must be an ordered array',
  );
  const changeValues = strictOrderedArray(
    record.changes,
    '$.changes',
    'changes must be an ordered array',
  );
  if (typeof record.strict !== 'boolean') {
    transactionFail('INVALID_VALUE', 'INVALID_INPUT', '$.strict', 'strict must be a boolean');
  }
  if (
    Object.hasOwn(record, 'actionId') &&
    (typeof record.actionId !== 'string' || record.actionId.length === 0)
  ) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      '$.actionId',
      'actionId must be a non-empty string',
    );
  }

  const targets = targetValues.map((target, index) =>
    normalizeTarget(target, `$.targets[${index}]`, index));
  const actionId = typeof record.actionId === 'string' ? record.actionId : undefined;
  if (targets.length === 0) {
    // Validate and detach the shared change list without inventing a staged
    // product target. The synthetic target is normalization-only and is never
    // returned, indexed, queried, or applied.
    normalizeOperation({
      op: 'merge',
      target: { kind: 'element', id: '__core_v2_empty_bulk_validation__' },
      changes: changeValues,
    }, 0);
    return Object.freeze({
      operations: EMPTY_OPERATIONS,
      strict: record.strict,
      conflictPolicy: 'reject',
      ...(actionId === undefined ? {} : { actionId }),
    });
  }

  const operations = Object.freeze(targets.map((target, index) =>
    normalizeOperation({ op: 'merge', target, changes: changeValues }, index)));
  return Object.freeze({
    operations,
    strict: record.strict,
    conflictPolicy: 'reject',
    ...(actionId === undefined ? {} : { actionId }),
  });
}

export function normalizeTransaction(value: unknown): NormalizedTransaction {
  const record = strictRecord(value, '$', 'transaction must be a strict plain record');
  rejectUnknownFields(record, TRANSACTION_FIELDS, '$');

  const operationValues = strictOrderedArray(
    record.operations,
    '$.operations',
    'operations must be a non-empty ordered array',
  );
  if (operationValues.length === 0) {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      '$.operations',
      'operations must be a non-empty ordered array',
    );
  }
  if (typeof record.strict !== 'boolean') {
    transactionFail('INVALID_VALUE', 'INVALID_INPUT', '$.strict', 'strict must be a boolean');
  }
  if (
    Object.hasOwn(record, 'actionId') &&
    (typeof record.actionId !== 'string' || record.actionId.length === 0)
  ) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      '$.actionId',
      'actionId must be a non-empty string',
    );
  }
  const conflictPolicy = record.conflictPolicy ?? 'reject';
  if (
    conflictPolicy !== 'reject' &&
    conflictPolicy !== 'cancel-active' &&
    conflictPolicy !== 'queue-after'
  ) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      '$.conflictPolicy',
      'conflictPolicy must be reject, cancel-active, or queue-after',
    );
  }
  if (
    Object.hasOwn(record, 'recordHistory') &&
    typeof record.recordHistory !== 'boolean'
  ) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      '$.recordHistory',
      'recordHistory must be a boolean',
    );
  }

  const operations = Object.freeze(
    operationValues.map((operation, index) => normalizeOperation(operation, index)),
  );
  const history = Object.hasOwn(record, 'history')
    ? cloneImmutableJson(record.history, '$.history')
    : undefined;
  const actionId = typeof record.actionId === 'string' ? record.actionId : undefined;
  const recordHistory = typeof record.recordHistory === 'boolean'
    ? record.recordHistory
    : undefined;
  const animatedBarTargets = record.animatedBarTargets === undefined
    ? undefined
    : Object.freeze(strictOrderedArray(
        record.animatedBarTargets,
        '$.animatedBarTargets',
        'animatedBarTargets must be an ordered array',
      ).map((value, index) => {
        const target = strictRecord(
          value,
          `$.animatedBarTargets[${index}]`,
          'animated bar target must be an object',
        );
        rejectUnknownFields(
          target,
          BAR_HEIGHT_BATCH_TARGET_FIELDS,
          `$.animatedBarTargets[${index}]`,
          index,
        );
        if (
          typeof target.ownerId !== 'string' || target.ownerId.length === 0 ||
          typeof target.componentId !== 'string' || target.componentId.length === 0
        ) {
          transactionFail(
            'INVALID_VALUE',
            'INVALID_INPUT',
            `$.animatedBarTargets[${index}]`,
            'animated bar target requires ownerId and componentId',
            index,
          );
        }
        return Object.freeze({
          ownerId: target.ownerId,
          componentId: target.componentId,
        });
      }));

  return Object.freeze({
    operations,
    strict: record.strict,
    conflictPolicy,
    ...(actionId === undefined ? {} : { actionId }),
    ...(recordHistory === undefined ? {} : { recordHistory }),
    ...(history === undefined ? {} : { history }),
    ...(animatedBarTargets === undefined ? {} : { animatedBarTargets }),
  });
}

function normalizeOperation(value: unknown, operationIndex: number): PatchMapMutationOperation {
  const path = `$.operations[${operationIndex}]`;
  const record = strictRecord(value, path, 'operation must be a strict plain record');
  if (typeof record.op !== 'string') {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${path}.op`,
      'operation discriminator must be a string',
      operationIndex,
    );
  }
  if (!SUPPORTED_OPERATION_SET.has(record.op)) {
    const known = CONTRACT_OPERATION_SET.has(record.op);
    transactionFail(
      known ? 'UNSUPPORTED_RUNTIME' : 'INVALID_MUTATION',
      known ? 'UNSUPPORTED_RUNTIME' : 'INVALID_INPUT',
      `${path}.op`,
      known
        ? `Operation ${record.op} is outside this planner profile`
        : `Unknown operation discriminator ${record.op}`,
      operationIndex,
    );
  }

  switch (record.op) {
    case 'add': {
      rejectUnknownFields(record, ADD_FIELDS, path, operationIndex);
      const parent = record.parent === null
        ? null
        : normalizeElementTarget(record.parent, `${path}.parent`, operationIndex);
      if (record.collection !== 'children') {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.collection`,
          'add collection must be children',
          operationIndex,
          parent ?? undefined,
        );
      }
      if (!Number.isSafeInteger(record.index) || Number(record.index) < 0) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.index`,
          'add index must be a non-negative safe integer',
          operationIndex,
          parent ?? undefined,
        );
      }
      const valueRecord = strictRecord(
        record.value,
        `${path}.value`,
        'add value must be a strict plain record',
      );
      const value = cloneImmutableJson(valueRecord, `${path}.value`);
      if (!isJsonRecord(value)) throw new Error('Add clone lost record shape');
      validateAddedElementRecord(value, path, operationIndex);
      return Object.freeze({
        op: 'add',
        parent,
        collection: 'children',
        index: Number(record.index),
        value,
      });
    }
    case 'merge': {
      rejectUnknownFields(record, MERGE_FIELDS, path, operationIndex);
      const target = normalizeTarget(record.target, `${path}.target`, operationIndex);
      const changeValues = strictOrderedArray(
        record.changes,
        `${path}.changes`,
        'changes must be an ordered array',
        operationIndex,
        target,
      );
      const changes = Object.freeze(
        changeValues.map((change, changeIndex) =>
          normalizeChange(change, operationIndex, changeIndex, target),
        ),
      );
      assertNoOverlappingPaths(changes, operationIndex, target);
      return Object.freeze({ op: 'merge', target, changes });
    }
    case 'replace': {
      rejectUnknownFields(record, REPLACE_FIELDS, path, operationIndex);
      const target = normalizeTarget(record.target, `${path}.target`, operationIndex);
      const valueRecord = strictRecord(
        record.value,
        `${path}.value`,
        'replacement value must be a strict plain record',
      );
      const replacement = cloneImmutableJson(valueRecord, `${path}.value`);
      if (!isJsonRecord(replacement)) throw new Error('Replacement clone lost record shape');
      return Object.freeze({ op: 'replace', target, value: replacement });
    }
    case 'reconcile-components': {
      rejectUnknownFields(record, RECONCILE_FIELDS, path, operationIndex);
      const target = normalizeTarget(record.target, `${path}.target`, operationIndex);
      if (target.kind !== 'element') {
        transactionFail(
          'INVALID_MUTATION',
          'INVALID_INPUT',
          `${path}.target.kind`,
          'reconcile-components requires an element target',
          operationIndex,
          target,
        );
      }
      const componentValues = strictOrderedArray(
        record.components,
        `${path}.components`,
        'components must be an ordered array',
        operationIndex,
        target,
      );
      if (record.matchMode !== undefined && record.matchMode !== 'replace') {
        transactionFail(
          'UNSUPPORTED_RUNTIME',
          'UNSUPPORTED_RUNTIME',
          `${path}.matchMode`,
          'Only authoritative replace reconciliation is implemented by this profile',
          operationIndex,
          target,
        );
      }
      const components = Object.freeze(
        componentValues.map((component, index) => {
          const componentRecord = strictRecord(
            component,
            `${path}.components[${index}]`,
            'component must be a strict plain record',
          );
          const clone = cloneImmutableJson(componentRecord, `${path}.components[${index}]`);
          if (!isJsonRecord(clone)) throw new Error('Component clone lost record shape');
          return clone;
        }),
      );
      assertUniqueComponentIds(components, path, operationIndex, target);
      return Object.freeze({
        op: 'reconcile-components',
        target,
        components,
        matchMode: 'replace',
      });
    }
    case 'move': {
      rejectUnknownFields(record, MOVE_FIELDS, path, operationIndex);
      const target = normalizeElementTarget(record.target, `${path}.target`, operationIndex);
      const parent = record.parent === null
        ? null
        : normalizeElementTarget(record.parent, `${path}.parent`, operationIndex);
      if (!Number.isSafeInteger(record.index) || Number(record.index) < 0) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.index`,
          'move index must be a non-negative safe integer',
          operationIndex,
          target,
        );
      }
      return Object.freeze({ op: 'move', target, parent, index: Number(record.index) });
    }
    case 'group': {
      rejectUnknownFields(record, GROUP_FIELDS, path, operationIndex);
      const targetValues = strictOrderedArray(
        record.targets,
        `${path}.targets`,
        'group targets must be a non-empty ordered array',
        operationIndex,
      );
      if (targetValues.length === 0) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.targets`,
          'group targets must be a non-empty ordered array',
          operationIndex,
        );
      }
      const targets = Object.freeze(targetValues.map((target, targetIndex) =>
        normalizeElementTarget(target, `${path}.targets[${targetIndex}]`, operationIndex)));
      const identities = new Set(targets.map((target) => target.id));
      if (identities.size !== targets.length) {
        transactionFail(
          'CONFLICTING_FIELDS',
          'INVALID_INPUT',
          `${path}.targets`,
          'group targets must be unique',
          operationIndex,
        );
      }
      const valueRecord = strictRecord(
        record.value,
        `${path}.value`,
        'group value must be a strict plain record',
      );
      const value = cloneImmutableJson(valueRecord, `${path}.value`);
      if (!isJsonRecord(value)) throw new Error('Group clone lost record shape');
      return Object.freeze({ op: 'group', targets, value });
    }
    case 'ungroup': {
      rejectUnknownFields(record, UNGROUP_FIELDS, path, operationIndex);
      const target = normalizeElementTarget(record.target, `${path}.target`, operationIndex);
      const relationPolicy = record.relationPolicy ?? 'reject';
      if (relationPolicy !== 'reject' && relationPolicy !== 'remove') {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.relationPolicy`,
          'ungroup relationPolicy must be reject or remove',
          operationIndex,
          target,
        );
      }
      return Object.freeze({ op: 'ungroup', target, relationPolicy });
    }
    case 'remove': {
      rejectUnknownFields(record, REMOVE_FIELDS, path, operationIndex);
      const target = normalizeTarget(record.target, `${path}.target`, operationIndex);
      if (record.cascade !== 'reject' && record.cascade !== 'subtree') {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.cascade`,
          'cascade must be reject or subtree',
          operationIndex,
          target,
        );
      }
      return Object.freeze({ op: 'remove', target, cascade: record.cascade });
    }
    default:
      throw new Error('Supported operation was not normalized');
  }
}

function normalizeElementTarget(
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

function validateAddedElementRecord(
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

function normalizeChange(
  value: unknown,
  operationIndex: number,
  changeIndex: number,
  target: PatchMapMutationTarget,
): PatchMapMutationPathChange {
  const path = `$.operations[${operationIndex}].changes[${changeIndex}]`;
  const record = strictRecord(value, path, 'change must be a strict plain record');
  rejectUnknownFields(record, CHANGE_FIELDS, path, operationIndex, target);
  if (!Object.hasOwn(record, 'value')) {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${path}.value`,
      'change value is required',
      operationIndex,
      target,
    );
  }
  const pathValues = strictOrderedArray(
    record.path,
    `${path}.path`,
    'path must be a non-empty segment array',
    operationIndex,
    target,
  );
  if (pathValues.length === 0) {
    transactionFail(
      'INVALID_PATH',
      'INVALID_INPUT',
      `${path}.path`,
      'path must be a non-empty segment array',
      operationIndex,
      target,
    );
  }
  const segments = Object.freeze(
    pathValues.map((segment, segmentIndex) => {
      if (typeof segment === 'string') {
        if (segment.length === 0 || isUnsafeJsonPathSegment(segment)) {
          transactionFail(
            'INVALID_PATH',
            'INVALID_INPUT',
            `${path}.path[${segmentIndex}]`,
            'path contains an empty or unsafe property segment',
            operationIndex,
            target,
          );
        }
        return segment;
      }
      if (typeof segment === 'number' && Number.isInteger(segment) && segment >= 0) {
        return segment;
      }
      transactionFail(
        'INVALID_PATH',
        'INVALID_INPUT',
        `${path}.path[${segmentIndex}]`,
        'path segments must be property strings or nonnegative integer indexes',
        operationIndex,
        target,
      );
    }),
  );
  if (segments[0] === 'id' || segments[0] === 'type') {
    transactionFail(
      'INVALID_PATH',
      'INVALID_INPUT',
      `${path}.path[0]`,
      'identity and discriminator fields require explicit structural operations',
      operationIndex,
      target,
    );
  }
  return Object.freeze({
    path: segments,
    value: cloneImmutableJson(record.value, `${path}.value`),
  });
}

function normalizeTarget(
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

function assertNoOverlappingPaths(
  changes: readonly PatchMapMutationPathChange[],
  operationIndex: number,
  target: PatchMapMutationTarget,
): void {
  for (let leftIndex = 0; leftIndex < changes.length; leftIndex += 1) {
    const left = requireAt(changes, leftIndex).path;
    for (let rightIndex = leftIndex + 1; rightIndex < changes.length; rightIndex += 1) {
      const right = requireAt(changes, rightIndex).path;
      if (pathIsPrefix(left, right) || pathIsPrefix(right, left)) {
        transactionFail(
          'OVERLAPPING_PATH',
          'INVALID_INPUT',
          `$.operations[${operationIndex}].changes[${rightIndex}].path`,
          'merge changes contain duplicate or prefix-overlapping paths',
          operationIndex,
          target,
        );
      }
    }
  }
}

function assertUniqueComponentIds(
  components: readonly Readonly<Record<string, PatchMapMutationJsonValue>>[],
  operationPath: string,
  operationIndex: number,
  target: PatchMapMutationTarget,
): void {
  const ids = new Set<string>();
  components.forEach((component, index) => {
    if (typeof component.id !== 'string') return;
    if (ids.has(component.id)) {
      transactionFail(
        'DUPLICATE_ID',
        'INVALID_INPUT',
        `${operationPath}.components[${index}].id`,
        `duplicate owner-local component identity ${JSON.stringify(component.id)}`,
        operationIndex,
        target,
      );
    }
    ids.add(component.id);
  });
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

function pathIsPrefix(
  prefix: readonly PatchMapMutationPathSegment[],
  candidate: readonly PatchMapMutationPathSegment[],
): boolean {
  return prefix.length <= candidate.length && prefix.every((segment, index) => segment === candidate[index]);
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
