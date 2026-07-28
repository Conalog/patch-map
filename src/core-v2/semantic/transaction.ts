import {
  assembleOwnedCoreV2Dataset,
  assembleOwnedCoreV2PreviewDataset,
  CORE_V2_COMPONENT_TYPES,
  CORE_V2_ELEMENT_TYPES,
  CoreV2DatasetError,
  materializeCoreV2Dataset,
  materializeOwnedCoreV2StructuralDataset,
  replaceOwnedCoreV2BarHeightRoot,
  replaceOwnedCoreV2TextRoot,
  type CoreV2Element,
  type MaterializedCoreV2Dataset,
} from './dataset';
import {
  CORE_V2_IDENTITY_AFFINE,
  createCoreV2Affine,
  invertCoreV2Affine,
  multiplyCoreV2Affine,
  type CoreV2AffineMatrix,
} from './geometry';

export const CORE_V2_MUTATION_TRANSACTION_REVISION =
  'core-v2-mutation-transaction/1' as const;

export type CoreV2MutationConflictPolicy = 'reject' | 'cancel-active' | 'queue-after';
export type CoreV2MutationPathSegment = string | number;
export type CoreV2MutationTarget =
  | Readonly<{ readonly kind: 'element'; readonly id: string }>
  | Readonly<{
      readonly kind: 'component';
      readonly ownerId: string;
      readonly id: string;
    }>;

export type CoreV2MutationJsonValue =
  | null
  | string
  | number
  | boolean
  | readonly CoreV2MutationJsonValue[]
  | Readonly<{ readonly [key: string]: CoreV2MutationJsonValue }>;

/** Detach caller-owned JSON for host companion and transaction boundaries. */
export function detachCoreV2MutationJsonValue(
  value: unknown,
  path = '$.value',
): CoreV2MutationJsonValue {
  return cloneImmutableJson(value, path);
}

export interface CoreV2MutationPathChange {
  readonly path: readonly CoreV2MutationPathSegment[];
  readonly value: CoreV2MutationJsonValue;
}

export type CoreV2MutationOperation =
  | Readonly<{
      readonly op: 'add';
      readonly parent: Extract<CoreV2MutationTarget, { readonly kind: 'element' }> | null;
      readonly collection: 'children';
      readonly index: number;
      readonly value: Readonly<Record<string, CoreV2MutationJsonValue>>;
    }>
  | Readonly<{
      readonly op: 'merge';
      readonly target: CoreV2MutationTarget;
      readonly changes: readonly CoreV2MutationPathChange[];
    }>
  | Readonly<{
      readonly op: 'replace';
      readonly target: CoreV2MutationTarget;
      readonly value: Readonly<Record<string, CoreV2MutationJsonValue>>;
    }>
  | Readonly<{
      readonly op: 'reconcile-components';
      readonly target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>;
      readonly components: readonly Readonly<Record<string, CoreV2MutationJsonValue>>[];
      readonly matchMode?: 'replace';
    }>
  | Readonly<{
      readonly op: 'remove';
      readonly target: CoreV2MutationTarget;
      readonly cascade: 'reject' | 'subtree';
    }>
  | Readonly<{
      readonly op: 'move';
      readonly target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>;
      readonly parent: Extract<CoreV2MutationTarget, { readonly kind: 'element' }> | null;
      readonly index: number;
    }>
  | Readonly<{
      readonly op: 'group';
      readonly targets: readonly Extract<
        CoreV2MutationTarget,
        { readonly kind: 'element' }
      >[];
      readonly value: Readonly<Record<string, CoreV2MutationJsonValue>>;
    }>
  | Readonly<{
      readonly op: 'ungroup';
      readonly target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>;
      readonly relationPolicy: 'reject' | 'remove';
    }>;

export interface CoreV2MutationTransactionRequest {
  readonly operations: readonly CoreV2MutationOperation[];
  readonly strict: boolean;
  readonly actionId?: string;
  readonly conflictPolicy?: CoreV2MutationConflictPolicy;
  readonly recordHistory?: boolean;
  readonly history?: CoreV2MutationJsonValue;
}

/**
 * A target-set merge keeps the empty-set no-op distinct from a raw mutation
 * transaction, whose operations array remains intentionally non-empty.
 */
export interface CoreV2BulkPatchRequest {
  readonly targets: readonly CoreV2MutationTarget[];
  readonly changes: readonly CoreV2MutationPathChange[];
  readonly strict: boolean;
  readonly actionId?: string;
}

export interface CoreV2BarHeightBatchTarget {
  readonly ownerId: string;
  readonly componentId: string;
}

export interface CoreV2BarHeightBatchRequest {
  readonly targets: readonly CoreV2BarHeightBatchTarget[];
  readonly heights: ArrayLike<number>;
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface CoreV2PlannedBarHeightUpdate extends CoreV2BarHeightBatchTarget {
  readonly height: number;
}

export interface CoreV2TextBatchTarget {
  readonly ownerId: string;
  readonly componentId: string;
}

export interface CoreV2TextBatchRequest {
  readonly targets: readonly CoreV2TextBatchTarget[];
  readonly texts: readonly string[];
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface CoreV2PlannedTextUpdate extends CoreV2TextBatchTarget {
  readonly text: string;
}

export type CoreV2MutationDiagnosticCategory =
  | 'INVALID_INPUT'
  | 'MISSING_TARGET'
  | 'CONFLICT'
  | 'UNSUPPORTED_RUNTIME';

export type CoreV2MutationDiagnosticCode =
  | 'INVALID_SCHEMA_VERSION'
  | 'INVALID_RECORD_KIND'
  | 'UNKNOWN_FIELD'
  | 'INVALID_VALUE'
  | 'INVALID_PATH'
  | 'INVALID_MUTATION'
  | 'OVERLAPPING_PATH'
  | 'CONFLICTING_FIELDS'
  | 'DUPLICATE_ID'
  | 'NON_SERIALIZABLE_VALUE'
  | 'MISSING_TARGET'
  | 'CONFLICT'
  | 'UNSUPPORTED_RUNTIME';

export interface CoreV2MutationTransactionDiagnostic {
  readonly code: CoreV2MutationDiagnosticCode;
  readonly category: CoreV2MutationDiagnosticCategory;
  readonly path: string;
  readonly message: string;
  readonly operationIndex?: number;
  readonly target?: CoreV2MutationTarget;
  readonly datasetCode?: CoreV2DatasetError['code'];
}

export interface CoreV2MutationTransactionSummary {
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly unchangedCount: number;
}

export type CoreV2MutationTransactionPlan =
  | Readonly<{
      readonly status: 'planned';
      readonly changed: boolean;
      readonly schemaRevision: typeof CORE_V2_MUTATION_TRANSACTION_REVISION;
      readonly strict: boolean;
      readonly conflictPolicy: CoreV2MutationConflictPolicy;
      readonly operations: readonly CoreV2MutationOperation[];
      readonly actionId?: string;
      readonly recordHistory?: boolean;
      readonly history?: CoreV2MutationJsonValue;
      /** Compact exact-height batch used by the aggregate bar hot path. */
      readonly directBarHeightUpdates?: readonly CoreV2PlannedBarHeightUpdate[];
      /** Compact owner-qualified text batch used by the editor text hot path. */
      readonly directTextUpdates?: readonly CoreV2PlannedTextUpdate[];
      /** Logical selection replacement authored by group/ungroup. */
      readonly selectionIds?: readonly string[];
      /** Semantic hierarchy IDs whose aggregate retained order may change. */
      readonly allowedElementOrderIds?: readonly string[];
      readonly candidate: MaterializedCoreV2Dataset;
      readonly applied: readonly CoreV2MutationTarget[];
      readonly missing: readonly CoreV2MutationTarget[];
      readonly unchanged: readonly CoreV2MutationTarget[];
      readonly summary: CoreV2MutationTransactionSummary;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly changed: false;
      readonly schemaRevision: typeof CORE_V2_MUTATION_TRANSACTION_REVISION;
      readonly actionId?: string;
      readonly candidate: null;
      readonly applied: readonly [];
      readonly missing: readonly [];
      readonly unchanged: readonly [];
      readonly summary: CoreV2MutationTransactionSummary;
      readonly diagnostic: CoreV2MutationTransactionDiagnostic;
    }>;

type MutableJsonValue =
  | null
  | string
  | number
  | boolean
  | MutableJsonValue[]
  | { [key: string]: MutableJsonValue };
type MutableJsonRecord = { [key: string]: MutableJsonValue };

interface NormalizedTransaction {
  readonly operations: readonly CoreV2MutationOperation[];
  readonly strict: boolean;
  readonly conflictPolicy: CoreV2MutationConflictPolicy;
  readonly actionId?: string;
  readonly recordHistory?: boolean;
  readonly history?: CoreV2MutationJsonValue;
}

interface StagedLocation {
  readonly kind: CoreV2MutationTarget['kind'];
  readonly ownerId?: string;
  readonly parent: MutableJsonValue[];
  readonly index: number;
  readonly parentElementId?: string | null;
  readonly parentAffine?: CoreV2AffineMatrix;
  readonly worldAffine?: CoreV2AffineMatrix;
  readonly locked?: boolean;
  record: MutableJsonRecord;
}

type TargetOutcome = 'missing' | 'unchanged' | 'applied';

interface TargetJournalEntry {
  readonly target: CoreV2MutationTarget;
  outcome: TargetOutcome;
}

const TRANSACTION_FIELDS = new Set([
  'operations',
  'strict',
  'actionId',
  'conflictPolicy',
  'recordHistory',
  'history',
]);
const BULK_PATCH_FIELDS = new Set(['targets', 'changes', 'strict', 'actionId']);
const BAR_HEIGHT_BATCH_FIELDS = new Set([
  'targets',
  'heights',
  'actionId',
  'recordHistory',
]);
const BAR_HEIGHT_BATCH_TARGET_FIELDS = new Set(['ownerId', 'componentId']);
const TEXT_BATCH_FIELDS = new Set([
  'targets',
  'texts',
  'actionId',
  'recordHistory',
]);
const TEXT_BATCH_TARGET_FIELDS = new Set(['ownerId', 'componentId']);
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
const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const ELEMENT_TYPE_SET = new Set<string>(CORE_V2_ELEMENT_TYPES);
const COMPONENT_TYPE_SET = new Set<string>(CORE_V2_COMPONENT_TYPES);
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
const EMPTY_TARGETS: readonly [] = Object.freeze([]);
const EMPTY_OPERATIONS: readonly CoreV2MutationOperation[] = Object.freeze([]);

/**
 * Validate one compact, ordered bar-height batch without materializing the
 * equivalent merge/change/path object graph. The candidate remains an owned,
 * structurally shared PATCH MAP dataset and therefore uses the same history,
 * reconcile, atomic publication, and semantic-hash authorities as transact().
 */
export function planCoreV2BarHeightBatch(
  current: MaterializedCoreV2Dataset,
  requestInput: unknown,
): CoreV2MutationTransactionPlan {
  let record: Readonly<Record<string, unknown>>;
  try {
    record = strictRecord(
      requestInput,
      '$',
      'bar height batch must be a strict plain record',
    );
    rejectUnknownFields(record, BAR_HEIGHT_BATCH_FIELDS, '$');
    if (!Array.isArray(record.targets)) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.targets',
        'targets must be an ordered array',
      );
    }
    if (!isNumberArrayLike(record.heights)) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.heights',
        'heights must be a numeric array or typed array',
      );
    }
    if (record.targets.length !== record.heights.length) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.heights',
        'heights length must match targets length',
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'actionId') &&
      (typeof record.actionId !== 'string' || record.actionId.length === 0)
    ) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.actionId',
        'actionId must be a non-empty string',
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'recordHistory') &&
      typeof record.recordHistory !== 'boolean'
    ) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.recordHistory',
        'recordHistory must be a boolean',
      );
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic);
  }

  const actionId = typeof record.actionId === 'string'
    ? record.actionId
    : undefined;
  const recordHistory = typeof record.recordHistory === 'boolean'
    ? record.recordHistory
    : undefined;
  if (record.targets.length === 0) {
    return Object.freeze({
      status: 'planned',
      changed: false,
      schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
      strict: true,
      conflictPolicy: 'reject',
      operations: EMPTY_OPERATIONS,
      ...(actionId === undefined ? {} : { actionId }),
      ...(recordHistory === undefined ? {} : { recordHistory }),
      candidate: current,
      applied: EMPTY_TARGETS,
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      directBarHeightUpdates: Object.freeze([]),
      summary: freezeSummary(0, 0, 0),
    });
  }

  const rootIndexById = new Map(
    current.dataset.map((root, index) => [root.id, index] as const),
  );
  const roots: CoreV2Element[] = [...current.dataset];
  const journal = new Map<string, TargetJournalEntry>();
  const directUpdates = new Map<string, CoreV2PlannedBarHeightUpdate>();
  const seenTargets = new Set<string>();
  let changed = false;
  try {
    for (let index = 0; index < record.targets.length; index += 1) {
      const targetRecord = strictRecord(
        record.targets[index],
        `$.targets[${index}]`,
        'bar height target must be a strict plain record',
      );
      rejectUnknownFields(
        targetRecord,
        BAR_HEIGHT_BATCH_TARGET_FIELDS,
        `$.targets[${index}]`,
        index,
      );
      if (
        typeof targetRecord.ownerId !== 'string' ||
        targetRecord.ownerId.length === 0 ||
        typeof targetRecord.componentId !== 'string' ||
        targetRecord.componentId.length === 0
      ) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          'bar height target requires non-empty ownerId and componentId',
          index,
        );
      }
      const height = record.heights[index];
      if (typeof height !== 'number' || !Number.isFinite(height) || height < 0) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `$.heights[${index}]`,
          'bar height must be finite and non-negative',
          index,
        );
      }
      const target = Object.freeze({
        kind: 'component' as const,
        ownerId: targetRecord.ownerId,
        id: targetRecord.componentId,
      });
      const key = targetKey(target);
      if (seenTargets.has(key)) {
        transactionFail(
          'DUPLICATE_ID',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          `bar height batch repeats ${targetLabel(target)}`,
          index,
          target,
        );
      }
      seenTargets.add(key);
      const rootIndex = rootIndexById.get(target.ownerId);
      const root = rootIndex === undefined ? undefined : roots[rootIndex];
      if (rootIndex === undefined || root?.type !== 'item') {
        transactionFail(
          'MISSING_TARGET',
          'MISSING_TARGET',
          `$.targets[${index}]`,
          `No staged record matches ${targetLabel(target)}`,
          index,
          target,
        );
      }
      const matches = root.components.filter(({ id }) => id === target.id);
      const component = matches.length === 1 ? matches[0] : undefined;
      if (
        component?.type !== 'bar' ||
        typeof component.size !== 'object' ||
        component.size === null ||
        Array.isArray(component.size) ||
        !('height' in component.size)
      ) {
        transactionFail(
          'INVALID_MUTATION',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          `${targetLabel(target)} is not one numeric-height bar component`,
          index,
          target,
        );
      }
      if (component.size.height === height) {
        noteOutcome(journal, target, 'unchanged');
        continue;
      }
      const update = Object.freeze({
        ownerId: target.ownerId,
        componentId: target.id,
        height,
      });
      directUpdates.set(key, update);
      const replacement = replaceOwnedCoreV2BarHeightRoot(
        root,
        target.id,
        height,
      );
      if (replacement === null) {
        transactionFail(
          'INVALID_MUTATION',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          `${targetLabel(target)} could not accept the bar height`,
          index,
          target,
        );
      }
      roots[rootIndex] = replacement;
      changed = true;
      noteOutcome(journal, target, 'applied');
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic, actionId);
  }

  const candidate = changed
    ? assembleOwnedCoreV2Dataset(current, roots)
    : current;
  const applied = journalTargets(journal, 'applied');
  const unchanged = journalTargets(journal, 'unchanged');
  return Object.freeze({
    status: 'planned',
    changed,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    strict: true,
    conflictPolicy: 'reject',
    operations: EMPTY_OPERATIONS,
    ...(actionId === undefined ? {} : { actionId }),
    ...(recordHistory === undefined ? {} : { recordHistory }),
    candidate,
    applied,
    missing: EMPTY_TARGETS,
    unchanged,
    directBarHeightUpdates: Object.freeze([...directUpdates.values()]),
    summary: freezeSummary(applied.length, 0, unchanged.length),
  });
}

/**
 * Validate one ordered owner-qualified text batch without allocating a merge
 * operation/path graph or normalizing and hashing each dirty root separately.
 */
export function planCoreV2TextBatch(
  current: MaterializedCoreV2Dataset,
  requestInput: unknown,
): CoreV2MutationTransactionPlan {
  let record: Readonly<Record<string, unknown>>;
  try {
    record = strictRecord(
      requestInput,
      '$',
      'text batch must be a strict plain record',
    );
    rejectUnknownFields(record, TEXT_BATCH_FIELDS, '$');
    if (!Array.isArray(record.targets)) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.targets',
        'targets must be an ordered array',
      );
    }
    if (!isStringArray(record.texts)) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.texts',
        'texts must be an ordered string array',
      );
    }
    if (record.targets.length !== record.texts.length) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.texts',
        'texts length must match targets length',
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'actionId') &&
      (typeof record.actionId !== 'string' || record.actionId.length === 0)
    ) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.actionId',
        'actionId must be a non-empty string',
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'recordHistory') &&
      typeof record.recordHistory !== 'boolean'
    ) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.recordHistory',
        'recordHistory must be a boolean',
      );
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic);
  }

  const actionId = typeof record.actionId === 'string'
    ? record.actionId
    : undefined;
  const recordHistory = typeof record.recordHistory === 'boolean'
    ? record.recordHistory
    : undefined;
  if (record.targets.length === 0) {
    return Object.freeze({
      status: 'planned',
      changed: false,
      schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
      strict: true,
      conflictPolicy: 'reject',
      operations: EMPTY_OPERATIONS,
      ...(actionId === undefined ? {} : { actionId }),
      ...(recordHistory === undefined ? {} : { recordHistory }),
      candidate: current,
      applied: EMPTY_TARGETS,
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      directTextUpdates: Object.freeze([]),
      summary: freezeSummary(0, 0, 0),
    });
  }

  const rootIndexById = ownedRootIndexById(current.dataset);
  if (rootIndexById === null) {
    return rejected(
      diagnostic(
        'DUPLICATE_ID',
        'INVALID_INPUT',
        '$.targets',
        'current owned root identity is ambiguous',
      ),
      actionId,
    );
  }
  const roots: CoreV2Element[] = [...current.dataset];
  const journal = new Map<string, TargetJournalEntry>();
  const directUpdates = new Map<string, CoreV2PlannedTextUpdate>();
  const seenTargets = new Set<string>();
  let changed = false;
  try {
    for (let index = 0; index < record.targets.length; index += 1) {
      const targetRecord = strictRecord(
        record.targets[index],
        `$.targets[${index}]`,
        'text target must be a strict plain record',
      );
      rejectUnknownFields(
        targetRecord,
        TEXT_BATCH_TARGET_FIELDS,
        `$.targets[${index}]`,
        index,
      );
      if (
        typeof targetRecord.ownerId !== 'string' ||
        targetRecord.ownerId.length === 0 ||
        typeof targetRecord.componentId !== 'string' ||
        targetRecord.componentId.length === 0
      ) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          'text target requires non-empty ownerId and componentId',
          index,
        );
      }
      const text = record.texts[index];
      if (typeof text !== 'string') {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `$.texts[${index}]`,
          'text must be a string',
          index,
        );
      }
      const target = Object.freeze({
        kind: 'component' as const,
        ownerId: targetRecord.ownerId,
        id: targetRecord.componentId,
      });
      const key = targetKey(target);
      if (seenTargets.has(key)) {
        transactionFail(
          'DUPLICATE_ID',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          `text batch repeats ${targetLabel(target)}`,
          index,
          target,
        );
      }
      seenTargets.add(key);
      const rootIndex = rootIndexById.get(target.ownerId);
      const root = rootIndex === undefined ? undefined : roots[rootIndex];
      if (rootIndex === undefined || root?.type !== 'item') {
        transactionFail(
          'MISSING_TARGET',
          'MISSING_TARGET',
          `$.targets[${index}]`,
          `No staged record matches ${targetLabel(target)}`,
          index,
          target,
        );
      }
      const matches = root.components.filter(({ id }) => id === target.id);
      const component = matches.length === 1 ? matches[0] : undefined;
      if (component?.type !== 'text') {
        transactionFail(
          'INVALID_MUTATION',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          `${targetLabel(target)} is not one text component`,
          index,
          target,
        );
      }
      if (component.text === text) {
        noteOutcome(journal, target, 'unchanged');
        continue;
      }
      const update = Object.freeze({
        ownerId: target.ownerId,
        componentId: target.id,
        text,
      });
      directUpdates.set(key, update);
      const replacement = replaceOwnedCoreV2TextRoot(root, target.id, text);
      if (replacement === null) {
        transactionFail(
          'INVALID_MUTATION',
          'INVALID_INPUT',
          `$.targets[${index}]`,
          `${targetLabel(target)} could not accept the text`,
          index,
          target,
        );
      }
      roots[rootIndex] = replacement;
      changed = true;
      noteOutcome(journal, target, 'applied');
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic, actionId);
  }

  const candidate = changed
    ? assembleOwnedCoreV2Dataset(current, roots)
    : current;
  const applied = journalTargets(journal, 'applied');
  const unchanged = journalTargets(journal, 'unchanged');
  return Object.freeze({
    status: 'planned',
    changed,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    strict: true,
    conflictPolicy: 'reject',
    operations: EMPTY_OPERATIONS,
    ...(actionId === undefined ? {} : { actionId }),
    ...(recordHistory === undefined ? {} : { recordHistory }),
    candidate,
    applied,
    missing: EMPTY_TARGETS,
    unchanged,
    directTextUpdates: Object.freeze([...directUpdates.values()]),
    summary: freezeSummary(applied.length, 0, unchanged.length),
  });
}

/**
 * Validate a bulk target-set merge. An empty target set is a real product
 * no-op, while an empty raw transaction remains invalid.
 */
export function planCoreV2BulkPatch(
  current: MaterializedCoreV2Dataset,
  requestInput: unknown,
  schemaRevision: string = CORE_V2_MUTATION_TRANSACTION_REVISION,
): CoreV2MutationTransactionPlan {
  if (schemaRevision !== CORE_V2_MUTATION_TRANSACTION_REVISION) {
    return rejected(
      diagnostic(
        'INVALID_SCHEMA_VERSION',
        'INVALID_INPUT',
        '$.schemaRevision',
        `Expected ${CORE_V2_MUTATION_TRANSACTION_REVISION}`,
      ),
    );
  }

  let request: NormalizedTransaction;
  try {
    request = normalizeBulkPatch(requestInput);
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic);
  }

  if (request.operations.length > 0) {
    const directBars = planOwnedBarHeightTransaction(current, request);
    if (directBars !== null) return directBars;
    const incremental = planFlatOwnedMergeTransaction(current, request);
    if (incremental !== null) return incremental;
    return planNormalizedCoreV2MutationTransaction(current, request);
  }

  return Object.freeze({
    status: 'planned',
    changed: false,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    strict: request.strict,
    conflictPolicy: 'reject',
    operations: EMPTY_OPERATIONS,
    ...(request.actionId === undefined ? {} : { actionId: request.actionId }),
    candidate: current,
    applied: EMPTY_TARGETS,
    missing: EMPTY_TARGETS,
    unchanged: EMPTY_TARGETS,
    summary: freezeSummary(0, 0, 0),
  });
}

const FAST_FLAT_ROOT_TYPES = new Set([
  'item',
  'rect',
  'image',
  'text',
]);
const OWNED_ROOT_INDEX_CACHE = new WeakMap<
  readonly CoreV2Element[],
  ReadonlyMap<string, number> | null
>();

function planOwnedBarHeightTransaction(
  current: MaterializedCoreV2Dataset,
  request: NormalizedTransaction,
): CoreV2MutationTransactionPlan | null {
  if (current.dataset.length === 0 || request.operations.length === 0) return null;
  const rootIndexById = new Map(
    current.dataset.map((root, index) => [root.id, index] as const),
  );
  if (rootIndexById.size !== current.dataset.length) return null;
  const roots: CoreV2Element[] = [...current.dataset];
  const journal = new Map<string, TargetJournalEntry>();
  let changed = false;

  for (const operation of request.operations) {
    if (
      operation.op !== 'merge' ||
      operation.target.kind !== 'component' ||
      operation.changes.length !== 1
    ) {
      return null;
    }
    const [change] = operation.changes;
    if (
      change === undefined ||
      change.path.length !== 2 ||
      change.path[0] !== 'size' ||
      change.path[1] !== 'height' ||
      typeof change.value !== 'number' ||
      !Number.isFinite(change.value) ||
      change.value < 0
    ) {
      return null;
    }
    const rootIndex = rootIndexById.get(operation.target.ownerId);
    const root = rootIndex === undefined ? undefined : roots[rootIndex];
    if (rootIndex === undefined || root?.type !== 'item') return null;
    const matches = root.components.filter(({ id }) => id === operation.target.id);
    const component = matches.length === 1 ? matches[0] : undefined;
    if (
      component?.type !== 'bar' ||
      typeof component.size !== 'object' ||
      component.size === null ||
      Array.isArray(component.size) ||
      !('width' in component.size) ||
      !('height' in component.size)
    ) {
      return null;
    }
    if (component.size.height === change.value) {
      noteOutcome(journal, operation.target, 'unchanged');
      continue;
    }
    const replacement = replaceOwnedCoreV2BarHeightRoot(
      root,
      operation.target.id,
      change.value,
    );
    if (replacement === null) return null;
    roots[rootIndex] = replacement;
    changed = true;
    noteOutcome(journal, operation.target, 'applied');
  }

  const candidate = changed
    ? assembleOwnedCoreV2Dataset(current, roots)
    : current;
  const applied = journalTargets(journal, 'applied');
  const missing = journalTargets(journal, 'missing');
  const unchanged = journalTargets(journal, 'unchanged');
  return Object.freeze({
    status: 'planned',
    changed,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    strict: request.strict,
    conflictPolicy: request.conflictPolicy,
    operations: request.operations,
    ...(request.actionId === undefined ? {} : { actionId: request.actionId }),
    ...(request.recordHistory === undefined ? {} : { recordHistory: request.recordHistory }),
    ...(request.history === undefined ? {} : { history: request.history }),
    candidate,
    applied,
    missing,
    unchanged,
    summary: freezeSummary(applied.length, missing.length, unchanged.length),
  });
}

/**
 * Structural-share the common flat merge candidate. Validation, missing
 * targets, hierarchy, identity/type edits, or large whole-scene writes fall
 * back to the canonical generic transaction planner.
 */
function planFlatOwnedMergeTransaction(
  current: MaterializedCoreV2Dataset,
  request: NormalizedTransaction,
  preview = false,
): CoreV2MutationTransactionPlan | null {
  if (
    current.dataset.length === 0 ||
    request.operations.some((operation) => operation.op !== 'merge')
  ) {
    return null;
  }
  const rootIndexById = ownedRootIndexById(current.dataset);
  if (rootIndexById === null) return null;
  const dirtyRootIds = new Set<string>();
  for (const operation of request.operations) {
    if (operation.op !== 'merge') return null;
    if (operation.changes.some((change) =>
      !fastFlatMergePathSupported(operation.target, change.path))) {
      return null;
    }
    const rootId = operation.target.kind === 'element'
      ? operation.target.id
      : operation.target.ownerId;
    const rootIndex = rootIndexById.get(rootId);
    if (rootIndex === undefined) return null;
    const root = current.dataset[rootIndex];
    if (root === undefined || !FAST_FLAT_ROOT_TYPES.has(root.type)) return null;
    dirtyRootIds.add(rootId);
  }
  const mutableRoots = new Map<number, MutableJsonRecord>();
  const journal = new Map<string, TargetJournalEntry>();
  try {
    for (const [operationIndex, operation] of request.operations.entries()) {
      if (operation.op !== 'merge') return null;
      const rootId = operation.target.kind === 'element'
        ? operation.target.id
        : operation.target.ownerId;
      const rootIndex = rootIndexById.get(rootId);
      if (rootIndex === undefined) return null;
      let root = mutableRoots.get(rootIndex);
      if (root === undefined) {
        const cloned = cloneMutableJson(current.dataset[rootIndex], `$[${rootIndex}]`);
        if (!isMutableJsonRecord(cloned)) return null;
        root = cloned;
        mutableRoots.set(rootIndex, root);
      }
      const target = flatRootTarget(root, operation.target);
      if (target === null) return null;
      const before = cloneMutableJson(target, `$.operations[${operationIndex}].target`);
      for (const change of operation.changes) {
        applyPathChange(
          target,
          change,
          `$.operations[${operationIndex}]`,
          operationIndex,
          operation.target,
        );
      }
      noteOutcome(
        journal,
        operation.target,
        jsonEquivalent(before, target) ? 'unchanged' : 'applied',
      );
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic, request.actionId);
  }

  const roots: CoreV2Element[] = [...current.dataset];
  try {
    for (const [rootIndex, root] of mutableRoots) {
      const normalized = materializeCoreV2Dataset([root]).dataset[0];
      if (normalized === undefined) return null;
      roots[rootIndex] = normalized;
    }
  } catch (error) {
    if (error instanceof CoreV2DatasetError) return null;
    throw error;
  }
  const candidate = preview
    ? assembleOwnedCoreV2PreviewDataset(current, roots)
    : assembleOwnedCoreV2Dataset(current, roots);
  const applied = journalTargets(journal, 'applied');
  const missing = journalTargets(journal, 'missing');
  const unchanged = journalTargets(journal, 'unchanged');
  const changed = [...mutableRoots.keys()].some((rootIndex) =>
    !jsonEquivalent(current.dataset[rootIndex], candidate.dataset[rootIndex]));

  return Object.freeze({
    status: 'planned',
    changed,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    strict: request.strict,
    conflictPolicy: request.conflictPolicy,
    operations: request.operations,
    ...(request.actionId === undefined ? {} : { actionId: request.actionId }),
    ...(request.recordHistory === undefined ? {} : { recordHistory: request.recordHistory }),
    ...(request.history === undefined ? {} : { history: request.history }),
    candidate,
    applied,
    missing,
    unchanged,
    summary: freezeSummary(applied.length, missing.length, unchanged.length),
  });
}

function ownedRootIndexById(
  dataset: readonly CoreV2Element[],
): ReadonlyMap<string, number> | null {
  const cached = OWNED_ROOT_INDEX_CACHE.get(dataset);
  if (cached !== undefined) return cached;
  const indexById = new Map<string, number>();
  for (const [index, root] of dataset.entries()) {
    if (indexById.has(root.id)) {
      OWNED_ROOT_INDEX_CACHE.set(dataset, null);
      return null;
    }
    indexById.set(root.id, index);
  }
  OWNED_ROOT_INDEX_CACHE.set(dataset, indexById);
  return indexById;
}

function fastFlatMergePathSupported(
  target: CoreV2MutationTarget,
  path: readonly CoreV2MutationPathSegment[],
): boolean {
  const root = path[0];
  if (typeof root !== 'string' || root === 'id' || root === 'type') return false;
  return target.kind === 'component' ||
    !['children', 'components', 'item', 'cells', 'links'].includes(root);
}

function flatRootTarget(
  root: MutableJsonRecord,
  target: CoreV2MutationTarget,
): MutableJsonRecord | null {
  if (target.kind === 'element') {
    return root.id === target.id ? root : null;
  }
  if (
    root.id !== target.ownerId ||
    root.type !== 'item' ||
    !Array.isArray(root.components)
  ) {
    return null;
  }
  const matches = root.components.filter((component) =>
    isMutableJsonRecord(component) && component.id === target.id);
  return matches.length === 1 && isMutableJsonRecord(matches[0])
    ? matches[0]
    : null;
}

/**
 * Stage a transient visual preview. The flat-root fast path deliberately skips
 * the whole-dataset semantic hash; the normal planner remains mandatory before
 * history or authoritative semantic publication.
 */
export function planCoreV2PreviewMutationTransaction(
  current: MaterializedCoreV2Dataset,
  requestInput: unknown,
  schemaRevision: string = CORE_V2_MUTATION_TRANSACTION_REVISION,
): CoreV2MutationTransactionPlan {
  if (schemaRevision !== CORE_V2_MUTATION_TRANSACTION_REVISION) {
    return planCoreV2MutationTransaction(current, requestInput, schemaRevision);
  }
  let request: NormalizedTransaction;
  try {
    request = normalizeTransaction(requestInput);
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic);
  }
  const incremental = planFlatOwnedMergeTransaction(current, request, true);
  return incremental ?? planNormalizedCoreV2MutationTransaction(current, request);
}

/**
 * Promote an internally validated flat preview into an authoritative candidate
 * without cloning and normalizing its dirty roots again. Canonical hashing is
 * deliberately deferred until this promotion so pointer-move previews remain
 * cheap while pointer-up still publishes the exact deterministic hash.
 */
export function promoteCoreV2PreviewMutationTransaction(
  current: MaterializedCoreV2Dataset,
  preview: CoreV2MutationTransactionPlan,
): CoreV2MutationTransactionPlan {
  if (preview.status !== 'planned' || !preview.changed) return preview;
  const candidate = assembleOwnedCoreV2Dataset(current, preview.candidate.dataset);
  return Object.freeze({
    ...preview,
    candidate,
  });
}

/**
 * Validate and stage one versioned mutation transaction without touching engine,
 * history, renderer, or handle state. All operations run against one detached
 * candidate and the dataset is materialized exactly once after staging succeeds.
 */
export function planCoreV2MutationTransaction(
  current: MaterializedCoreV2Dataset,
  requestInput: unknown,
  schemaRevision: string = CORE_V2_MUTATION_TRANSACTION_REVISION,
): CoreV2MutationTransactionPlan {
  if (schemaRevision !== CORE_V2_MUTATION_TRANSACTION_REVISION) {
    return rejected(
      diagnostic(
        'INVALID_SCHEMA_VERSION',
        'INVALID_INPUT',
        '$.schemaRevision',
        `Expected ${CORE_V2_MUTATION_TRANSACTION_REVISION}`,
      ),
    );
  }

  let request: NormalizedTransaction;
  try {
    request = normalizeTransaction(requestInput);
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic);
  }

  const structural = planOwnedTopLevelStructuralTransaction(current, request);
  if (structural !== null) return structural;
  const directBars = planOwnedBarHeightTransaction(current, request);
  if (directBars !== null) return directBars;
  const incremental = planFlatOwnedMergeTransaction(current, request);
  if (incremental !== null) return incremental;
  return planNormalizedCoreV2MutationTransaction(current, request);
}

/**
 * Preserve normalized root identity for the common one-action top-level editor
 * operations. The generic planner remains the authority for nested,
 * multi-operation, missing, or otherwise ambiguous requests.
 */
function planOwnedTopLevelStructuralTransaction(
  current: MaterializedCoreV2Dataset,
  request: NormalizedTransaction,
): CoreV2MutationTransactionPlan | null {
  if (request.operations.length !== 1 || current.dataset.length === 0) return null;
  const operation = request.operations[0];
  if (
    operation === undefined ||
    !(
      operation.op === 'add' ||
      operation.op === 'move' ||
      operation.op === 'group' ||
      operation.op === 'ungroup' ||
      operation.op === 'remove'
    )
  ) {
    return null;
  }
  const rootIndexById = ownedRootIndexById(current.dataset);
  if (rootIndexById === null) return null;
  if (
    (operation.op === 'add' || operation.op === 'move') &&
    operation.parent !== null
  ) {
    return null;
  }
  if (
    (operation.op === 'move' ||
      operation.op === 'ungroup' ||
      operation.op === 'remove') &&
    (
      operation.op === 'remove' && operation.target.kind !== 'element' ||
      rootIndexById.get(operation.target.id) === undefined
    )
  ) {
    return null;
  }
  if (
    operation.op === 'group' &&
    (
      operation.targets.length === 0 ||
      operation.targets.some(({ id }) => rootIndexById.get(id) === undefined)
    )
  ) {
    return null;
  }

  const staged = [...current.dataset] as unknown as MutableJsonValue[];
  const cloneRoot = (id: string): boolean => {
    const index = rootIndexById.get(id);
    if (index === undefined) return false;
    staged[index] = cloneMutableJson(staged[index], `$[${index}]`);
    return true;
  };
  if (operation.op === 'move' || operation.op === 'ungroup') {
    if (!cloneRoot(operation.target.id)) return null;
  } else if (operation.op === 'group') {
    for (const { id } of operation.targets) {
      if (!cloneRoot(id)) return null;
    }
  }

  const journal = new Map<string, TargetJournalEntry>();
  let selectionIds: readonly string[] | undefined;
  let allowedElementOrderIds: readonly string[] = Object.freeze([]);
  try {
    const index = indexDataset(staged);
    if (
      operation.op === 'add' ||
      operation.op === 'move' ||
      operation.op === 'group' ||
      operation.op === 'ungroup'
    ) {
      const result = applyStructuralOperation(
        staged,
        index,
        operation,
        '$.operations[0]',
        0,
        request.strict,
      );
      if (!result.changed) return null;
      for (const outcome of result.outcomes) {
        noteOutcome(journal, outcome.target, outcome.outcome);
      }
      selectionIds = result.selectionIds;
      allowedElementOrderIds = result.allowedElementOrderIds;
    } else {
      const located = locate(
        index,
        operation.target,
        '$.operations[0]',
        0,
      );
      if (located === undefined || located.parent !== staged) return null;
      removeTarget(located, operation, '$.operations[0]', 0);
      noteOutcome(journal, operation.target, 'applied');
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic, request.actionId);
  }

  let candidate: MaterializedCoreV2Dataset;
  try {
    candidate = materializeOwnedCoreV2StructuralDataset(staged);
  } catch (error) {
    if (!(error instanceof CoreV2DatasetError)) throw error;
    const code = datasetDiagnosticCode(error);
    return rejected(
      diagnostic(
        code,
        'INVALID_INPUT',
        error.datasetPath,
        error.message,
        undefined,
        undefined,
        error.code,
      ),
      request.actionId,
    );
  }
  const applied = journalTargets(journal, 'applied');
  const missing = journalTargets(journal, 'missing');
  const unchanged = journalTargets(journal, 'unchanged');
  return Object.freeze({
    status: 'planned',
    changed: true,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    strict: request.strict,
    conflictPolicy: request.conflictPolicy,
    operations: request.operations,
    ...(request.actionId === undefined ? {} : { actionId: request.actionId }),
    ...(request.recordHistory === undefined ? {} : { recordHistory: request.recordHistory }),
    ...(request.history === undefined ? {} : { history: request.history }),
    ...(selectionIds === undefined ? {} : { selectionIds }),
    ...(allowedElementOrderIds.length === 0
      ? {}
      : { allowedElementOrderIds }),
    candidate,
    applied,
    missing,
    unchanged,
    summary: freezeSummary(applied.length, missing.length, unchanged.length),
  });
}

function planNormalizedCoreV2MutationTransaction(
  current: MaterializedCoreV2Dataset,
  request: NormalizedTransaction,
): CoreV2MutationTransactionPlan {
  const stagedValue = cloneMutableJson(current.dataset, '$.current');
  if (!Array.isArray(stagedValue)) {
    return rejected(
      diagnostic('INVALID_VALUE', 'INVALID_INPUT', '$.current', 'Current dataset must be an array'),
      request.actionId,
    );
  }
  const staged = stagedValue;
  let index = indexDataset(staged);
  const journal = new Map<string, TargetJournalEntry>();
  const allowedElementOrderIds = new Set<string>();
  let selectionIds: readonly string[] | undefined;

  try {
    request.operations.forEach((operation, operationIndex) => {
      const operationPath = `$.operations[${operationIndex}]`;
      if (
        operation.op === 'add' ||
        operation.op === 'move' ||
        operation.op === 'group' ||
        operation.op === 'ungroup'
      ) {
        const structural = applyStructuralOperation(
          staged,
          index,
          operation,
          operationPath,
          operationIndex,
          request.strict,
        );
        for (const outcome of structural.outcomes) {
          noteOutcome(journal, outcome.target, outcome.outcome);
        }
        for (const id of structural.allowedElementOrderIds) {
          allowedElementOrderIds.add(id);
        }
        if (structural.selectionIds !== undefined) {
          selectionIds = structural.selectionIds;
        }
        if (structural.changed) index = indexDataset(staged);
        return;
      }
      const located = locate(index, operation.target, operationPath, operationIndex);
      if (located === undefined) {
        noteOutcome(journal, operation.target, 'missing');
        if (request.strict) {
          transactionFail(
            'MISSING_TARGET',
            'MISSING_TARGET',
            `${operationPath}.target`,
            `No staged record matches ${targetLabel(operation.target)}`,
            operationIndex,
            operation.target,
          );
        }
        return;
      }

      const before = cloneMutableJson(located.record, `${operationPath}.target`);
      let rebuildIndex = false;
      switch (operation.op) {
        case 'merge':
          for (const change of operation.changes) {
            applyPathChange(located.record, change, operationPath, operationIndex, operation.target);
            if (isIndexStructuralPath(change.path)) rebuildIndex = true;
          }
          break;
        case 'replace': {
          const replacement = replacementRecord(operation, operationPath, operationIndex);
          located.parent[located.index] = replacement;
          located.record = replacement;
          rebuildIndex = operation.target.kind === 'element';
          break;
        }
        case 'reconcile-components':
          reconcileComponents(located, operation, operationPath, operationIndex);
          rebuildIndex = true;
          break;
        case 'remove':
          removeTarget(located, operation, operationPath, operationIndex);
          rebuildIndex = true;
          break;
      }

      const changed = operation.op === 'remove' || !jsonEquivalent(before, located.record);
      noteOutcome(journal, operation.target, changed ? 'applied' : 'unchanged');
      if (rebuildIndex) index = indexDataset(staged);
    });
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic, request.actionId);
  }

  let candidate: MaterializedCoreV2Dataset;
  try {
    candidate = materializeCoreV2Dataset(staged);
  } catch (error) {
    if (!(error instanceof CoreV2DatasetError)) throw error;
    const code = datasetDiagnosticCode(error);
    return rejected(
      diagnostic(
        code,
        'INVALID_INPUT',
        error.datasetPath,
        error.message,
        undefined,
        undefined,
        error.code,
      ),
      request.actionId,
    );
  }

  const applied = journalTargets(journal, 'applied');
  const missing = journalTargets(journal, 'missing');
  const unchanged = journalTargets(journal, 'unchanged');
  const summary = freezeSummary(applied.length, missing.length, unchanged.length);
  const changed = !jsonEquivalent(current.dataset, candidate.dataset);

  return Object.freeze({
    status: 'planned',
    changed,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    strict: request.strict,
    conflictPolicy: request.conflictPolicy,
    operations: request.operations,
    ...(request.actionId === undefined ? {} : { actionId: request.actionId }),
    ...(request.recordHistory === undefined ? {} : { recordHistory: request.recordHistory }),
    ...(request.history === undefined ? {} : { history: request.history }),
    ...(selectionIds === undefined ? {} : { selectionIds }),
    ...(allowedElementOrderIds.size === 0
      ? {}
      : { allowedElementOrderIds: Object.freeze([...allowedElementOrderIds]) }),
    candidate,
    applied,
    missing,
    unchanged,
    summary,
  });
}

function normalizeBulkPatch(value: unknown): NormalizedTransaction {
  const record = strictRecord(value, '$', 'bulk patch must be a strict plain record');
  rejectUnknownFields(record, BULK_PATCH_FIELDS, '$');
  if (!Array.isArray(record.targets)) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      '$.targets',
      'targets must be an ordered array',
    );
  }
  if (!Array.isArray(record.changes)) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      '$.changes',
      'changes must be an ordered array',
    );
  }
  if (typeof record.strict !== 'boolean') {
    transactionFail('INVALID_VALUE', 'INVALID_INPUT', '$.strict', 'strict must be a boolean');
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'actionId') &&
    (typeof record.actionId !== 'string' || record.actionId.length === 0)
  ) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      '$.actionId',
      'actionId must be a non-empty string',
    );
  }

  const targets = record.targets.map((target, index) =>
    normalizeTarget(target, `$.targets[${index}]`, index));
  const actionId = typeof record.actionId === 'string' ? record.actionId : undefined;
  if (targets.length === 0) {
    // Validate and detach the shared change list without inventing a staged
    // product target. The synthetic target is normalization-only and is never
    // returned, indexed, queried, or applied.
    normalizeOperation({
      op: 'merge',
      target: { kind: 'element', id: '__core_v2_empty_bulk_validation__' },
      changes: record.changes,
    }, 0);
    return Object.freeze({
      operations: EMPTY_OPERATIONS,
      strict: record.strict,
      conflictPolicy: 'reject',
      ...(actionId === undefined ? {} : { actionId }),
    });
  }

  const operations = Object.freeze(targets.map((target, index) =>
    normalizeOperation({ op: 'merge', target, changes: record.changes }, index)));
  return Object.freeze({
    operations,
    strict: record.strict,
    conflictPolicy: 'reject',
    ...(actionId === undefined ? {} : { actionId }),
  });
}

function normalizeTransaction(value: unknown): NormalizedTransaction {
  const record = strictRecord(value, '$', 'transaction must be a strict plain record');
  rejectUnknownFields(record, TRANSACTION_FIELDS, '$');

  if (!Array.isArray(record.operations) || record.operations.length === 0) {
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
    Object.prototype.hasOwnProperty.call(record, 'actionId') &&
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
    Object.prototype.hasOwnProperty.call(record, 'recordHistory') &&
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
    record.operations.map((operation, index) => normalizeOperation(operation, index)),
  );
  const history = Object.prototype.hasOwnProperty.call(record, 'history')
    ? cloneImmutableJson(record.history, '$.history')
    : undefined;
  const actionId = typeof record.actionId === 'string' ? record.actionId : undefined;
  const recordHistory = typeof record.recordHistory === 'boolean'
    ? record.recordHistory
    : undefined;

  return Object.freeze({
    operations,
    strict: record.strict,
    conflictPolicy,
    ...(actionId === undefined ? {} : { actionId }),
    ...(recordHistory === undefined ? {} : { recordHistory }),
    ...(history === undefined ? {} : { history }),
  });
}

function normalizeOperation(value: unknown, operationIndex: number): CoreV2MutationOperation {
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
      if (!Array.isArray(record.changes)) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.changes`,
          'changes must be an ordered array',
          operationIndex,
          target,
        );
      }
      const changes = Object.freeze(
        record.changes.map((change, changeIndex) =>
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
      if (!Array.isArray(record.components)) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.components`,
          'components must be an ordered array',
          operationIndex,
          target,
        );
      }
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
        record.components.map((component, index) => {
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
      if (!Array.isArray(record.targets) || record.targets.length === 0) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `${path}.targets`,
          'group targets must be a non-empty ordered array',
          operationIndex,
        );
      }
      const targets = Object.freeze(record.targets.map((target, targetIndex) =>
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
): Extract<CoreV2MutationTarget, { readonly kind: 'element' }> {
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
  value: Readonly<Record<string, CoreV2MutationJsonValue>>,
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
  target: CoreV2MutationTarget,
): CoreV2MutationPathChange {
  const path = `$.operations[${operationIndex}].changes[${changeIndex}]`;
  const record = strictRecord(value, path, 'change must be a strict plain record');
  rejectUnknownFields(record, CHANGE_FIELDS, path, operationIndex, target);
  if (!Object.prototype.hasOwnProperty.call(record, 'value')) {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${path}.value`,
      'change value is required',
      operationIndex,
      target,
    );
  }
  if (!Array.isArray(record.path) || record.path.length === 0) {
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
    record.path.map((segment, segmentIndex) => {
      if (typeof segment === 'string') {
        if (segment.length === 0 || UNSAFE_PATH_SEGMENTS.has(segment)) {
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
): CoreV2MutationTarget {
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

function applyPathChange(
  target: MutableJsonRecord,
  change: CoreV2MutationPathChange,
  operationPath: string,
  operationIndex: number,
  logicalTarget: CoreV2MutationTarget,
): void {
  let parent: MutableJsonValue = target;
  const lastIndex = change.path.length - 1;
  for (let index = 0; index < lastIndex; index += 1) {
    const segment = requireAt(change.path, index);
    const nextSegment = requireAt(change.path, index + 1);
    if (typeof segment === 'number') {
      if (!Array.isArray(parent) || segment >= parent.length) {
        invalidAppliedPath(operationPath, operationIndex, logicalTarget, change.path, index);
      }
      parent = requireAt(parent, segment);
      continue;
    }
    if (!isMutableJsonRecord(parent)) {
      invalidAppliedPath(operationPath, operationIndex, logicalTarget, change.path, index);
    }
    const existing: MutableJsonValue | undefined = parent[segment];
    if (existing === undefined) {
      if (typeof nextSegment === 'number') {
        invalidAppliedPath(operationPath, operationIndex, logicalTarget, change.path, index);
      }
      const created: MutableJsonRecord = {};
      defineMutableProperty(parent, segment, created);
      parent = created;
      continue;
    }
    parent = existing;
  }

  const leaf = requireAt(change.path, lastIndex);
  const incoming = cloneMutableJson(change.value, `${operationPath}.changes.value`);
  if (typeof leaf === 'number') {
    if (!Array.isArray(parent) || leaf >= parent.length) {
      invalidAppliedPath(operationPath, operationIndex, logicalTarget, change.path, lastIndex);
    }
    const previous = requireAt(parent, leaf);
    parent[leaf] = mergedValue(previous, incoming);
    return;
  }
  if (!isMutableJsonRecord(parent)) {
    invalidAppliedPath(operationPath, operationIndex, logicalTarget, change.path, lastIndex);
  }
  const previous = parent[leaf];
  defineMutableProperty(
    parent,
    leaf,
    previous === undefined ? incoming : mergedValue(previous, incoming),
  );
}

function replacementRecord(
  operation: Extract<CoreV2MutationOperation, { readonly op: 'replace' }>,
  operationPath: string,
  operationIndex: number,
): MutableJsonRecord {
  const replacement = cloneMutableJson(operation.value, `${operationPath}.value`);
  if (!isMutableJsonRecord(replacement)) throw new Error('Replacement clone lost record shape');
  const suppliedId = replacement.id;
  if (suppliedId !== undefined && suppliedId !== operation.target.id) {
    transactionFail(
      'CONFLICTING_FIELDS',
      'INVALID_INPUT',
      `${operationPath}.value.id`,
      'replacement identity must equal the logical target identity',
      operationIndex,
      operation.target,
    );
  }
  defineMutableProperty(replacement, 'id', operation.target.id);
  const type = replacement.type;
  const validScope = operation.target.kind === 'element'
    ? typeof type === 'string' && ELEMENT_TYPE_SET.has(type)
    : typeof type === 'string' && COMPONENT_TYPE_SET.has(type);
  if (!validScope) {
    transactionFail(
      'INVALID_RECORD_KIND',
      'INVALID_INPUT',
      `${operationPath}.value.type`,
      `replacement discriminator is not valid for ${operation.target.kind} scope`,
      operationIndex,
      operation.target,
    );
  }
  return replacement;
}

function reconcileComponents(
  location: StagedLocation,
  operation: Extract<CoreV2MutationOperation, { readonly op: 'reconcile-components' }>,
  operationPath: string,
  operationIndex: number,
): void {
  if (location.record.type !== 'item') {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${operationPath}.target`,
      'reconcile-components target must resolve to an item element',
      operationIndex,
      operation.target,
    );
  }
  const components = operation.components.map((component) =>
    cloneMutableJson(component, `${operationPath}.components`),
  );
  defineMutableProperty(location.record, 'components', components);
}

function removeTarget(
  location: StagedLocation,
  operation: Extract<CoreV2MutationOperation, { readonly op: 'remove' }>,
  operationPath: string,
  operationIndex: number,
): void {
  if (
    operation.target.kind === 'element' &&
    operation.cascade === 'reject' &&
    location.record.type === 'group' &&
    Array.isArray(location.record.children) &&
    location.record.children.length > 0
  ) {
    transactionFail(
      'CONFLICTING_FIELDS',
      'INVALID_INPUT',
      `${operationPath}.cascade`,
      'cascade reject cannot remove a group with children',
      operationIndex,
      operation.target,
    );
  }
  location.parent.splice(location.index, 1);
}

interface StructuralTargetOutcome {
  readonly target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>;
  readonly outcome: TargetOutcome;
}

interface StructuralMutationResult {
  readonly changed: boolean;
  readonly outcomes: readonly StructuralTargetOutcome[];
  readonly selectionIds?: readonly string[];
  readonly allowedElementOrderIds: readonly string[];
}

type StructuralOperation = Extract<
  CoreV2MutationOperation,
  { readonly op: 'add' | 'move' | 'group' | 'ungroup' }
>;

function applyStructuralOperation(
  dataset: MutableJsonValue[],
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  operation: StructuralOperation,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): StructuralMutationResult {
  switch (operation.op) {
    case 'add':
      return addElement(dataset, index, operation, operationPath, operationIndex, strict);
    case 'move':
      return moveElement(dataset, index, operation, operationPath, operationIndex, strict);
    case 'group':
      return groupElements(dataset, index, operation, operationPath, operationIndex, strict);
    case 'ungroup':
      return ungroupElement(dataset, index, operation, operationPath, operationIndex, strict);
  }
}

function addElement(
  dataset: MutableJsonValue[],
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  operation: Extract<StructuralOperation, { readonly op: 'add' }>,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): StructuralMutationResult {
  const value = cloneMutableJson(operation.value, `${operationPath}.value`);
  if (!isMutableJsonRecord(value) || typeof value.id !== 'string') {
    throw new Error('Normalized add value lost its element identity');
  }
  const target = Object.freeze({ kind: 'element' as const, id: value.id });
  if (locate(index, target, operationPath, operationIndex) !== undefined) {
    transactionFail(
      'DUPLICATE_ID',
      'INVALID_INPUT',
      `${operationPath}.value.id`,
      `add ID ${target.id} already exists`,
      operationIndex,
      target,
    );
  }
  const destination = structuralDestination(
    dataset,
    index,
    operation.parent,
    operationPath,
    operationIndex,
    strict,
  );
  if (destination === null) {
    const missing = operation.parent ?? target;
    return Object.freeze({
      changed: false,
      outcomes: Object.freeze([{ target: missing, outcome: 'missing' as const }]),
      allowedElementOrderIds: Object.freeze([]),
    });
  }
  if (operation.index > destination.children.length) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      `${operationPath}.index`,
      'add index exceeds the destination insertion range',
      operationIndex,
      target,
    );
  }
  const siblingIds = elementIdsInArray(destination.children);
  destination.children.splice(operation.index, 0, value);
  return Object.freeze({
    changed: true,
    outcomes: Object.freeze([{ target, outcome: 'applied' as const }]),
    selectionIds: Object.freeze([target.id]),
    allowedElementOrderIds: freezeUniqueStrings([target.id, ...siblingIds]),
  });
}

function moveElement(
  dataset: MutableJsonValue[],
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  operation: Extract<StructuralOperation, { readonly op: 'move' }>,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): StructuralMutationResult {
  const source = locate(index, operation.target, operationPath, operationIndex);
  if (source === undefined) {
    return missingStructuralResult(operation.target, operationPath, operationIndex, strict);
  }
  requireElementLocation(source, operation.target, operationPath, operationIndex);
  assertUnlockedLocation(source, operation.target, operationPath, operationIndex);

  const destination = structuralDestination(
    dataset,
    index,
    operation.parent,
    operationPath,
    operationIndex,
    strict,
  );
  if (destination === null) {
    const missing = operation.parent ?? operation.target;
    return Object.freeze({
      changed: false,
      outcomes: Object.freeze([{ target: missing, outcome: 'missing' as const }]),
      allowedElementOrderIds: Object.freeze([]),
    });
  }
  if (operation.parent?.id === operation.target.id ||
      (operation.parent !== null && elementSubtreeIds(source.record).has(operation.parent.id))) {
    hierarchyConflict(
      `${operationPath}.parent`,
      'move parent cannot be the target or one of its descendants',
      operationIndex,
      operation.target,
    );
  }
  if (operation.index > destination.children.length) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      `${operationPath}.index`,
      'move index exceeds the destination insertion range',
      operationIndex,
      operation.target,
    );
  }

  const sourceSiblings = elementIdsInArray(source.parent);
  const destinationSiblings = elementIdsInArray(destination.children);
  const sameParent = source.parent === destination.children;
  let insertionIndex = operation.index;
  if (sameParent && source.index < insertionIndex) insertionIndex -= 1;
  const unchanged = sameParent && source.index === insertionIndex;
  if (unchanged) {
    return Object.freeze({
      changed: false,
      outcomes: Object.freeze([{ target: operation.target, outcome: 'unchanged' as const }]),
      allowedElementOrderIds: Object.freeze([]),
    });
  }

  const worldAffine = requireLocationAffine(source, operationPath, operationIndex, operation.target);
  source.parent.splice(source.index, 1);
  rebaseElementRecord(
    source.record,
    worldAffine,
    destination.parentAffine,
    operationPath,
    operationIndex,
    operation.target,
  );
  destination.children.splice(insertionIndex, 0, source.record);
  return Object.freeze({
    changed: true,
    outcomes: Object.freeze([{ target: operation.target, outcome: 'applied' as const }]),
    allowedElementOrderIds: freezeUniqueStrings([
      operation.target.id,
      ...sourceSiblings,
      ...destinationSiblings,
    ]),
  });
}

function groupElements(
  dataset: MutableJsonValue[],
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  operation: Extract<StructuralOperation, { readonly op: 'group' }>,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): StructuralMutationResult {
  const outcomes: StructuralTargetOutcome[] = [];
  const locations: Array<Readonly<{
    target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>;
    location: StagedLocation;
  }>> = [];
  for (const [targetIndex, target] of operation.targets.entries()) {
    const location = locate(index, target, operationPath, operationIndex);
    if (location === undefined) {
      if (strict) {
        missingStructuralTarget(
          target,
          `${operationPath}.targets[${targetIndex}]`,
          operationIndex,
        );
      }
      outcomes.push({ target, outcome: 'missing' });
      continue;
    }
    requireElementLocation(location, target, operationPath, operationIndex);
    assertUnlockedLocation(location, target, operationPath, operationIndex);
    locations.push(Object.freeze({ target, location }));
  }
  if (locations.length === 0) {
    return Object.freeze({
      changed: false,
      outcomes: Object.freeze(outcomes),
      allowedElementOrderIds: Object.freeze([]),
    });
  }

  const parent = locations[0]?.location.parent;
  if (parent === undefined || locations.some(({ location }) => location.parent !== parent)) {
    hierarchyConflict(
      `${operationPath}.targets`,
      'group targets must share one current parent',
      operationIndex,
      locations[0]?.target,
    );
  }
  const parentAffine = requireLocationParentAffine(
    locations[0]!.location,
    operationPath,
    operationIndex,
    locations[0]!.target,
  );
  const groupRecord = groupValueRecord(operation, operationPath, operationIndex);
  const groupId = groupRecord.id;
  const groupTarget = Object.freeze({ kind: 'element' as const, id: groupId });
  if (locate(index, groupTarget, operationPath, operationIndex) !== undefined) {
    transactionFail(
      'DUPLICATE_ID',
      'INVALID_INPUT',
      `${operationPath}.value.id`,
      `group ID ${groupId} already exists`,
      operationIndex,
      groupTarget,
    );
  }

  const sorted = [...locations].sort((left, right) => left.location.index - right.location.index);
  const siblingIds = elementIdsInArray(parent);
  const firstIndex = sorted[0]!.location.index;
  const groupWorld = multiplyCoreV2Affine(parentAffine, stagedElementLocalAffine(groupRecord));
  const children = sorted.map(({ location }) => {
    const world = requireLocationAffine(location, operationPath, operationIndex, locationTarget(location));
    rebaseElementRecord(
      location.record,
      world,
      groupWorld,
      operationPath,
      operationIndex,
      locationTarget(location),
    );
    return location.record;
  });
  for (const { location } of [...sorted].sort((left, right) => right.location.index - left.location.index)) {
    parent.splice(location.index, 1);
  }
  defineMutableProperty(groupRecord, 'children', children);
  parent.splice(firstIndex, 0, groupRecord);
  outcomes.push(...sorted.map(({ target }) => ({ target, outcome: 'applied' as const })));
  return Object.freeze({
    changed: true,
    outcomes: Object.freeze(outcomes),
    selectionIds: Object.freeze([groupId]),
    allowedElementOrderIds: freezeUniqueStrings([
      groupId,
      ...siblingIds,
      ...sorted.map(({ target }) => target.id),
    ]),
  });
}

function ungroupElement(
  dataset: MutableJsonValue[],
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  operation: Extract<StructuralOperation, { readonly op: 'ungroup' }>,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): StructuralMutationResult {
  const location = locate(index, operation.target, operationPath, operationIndex);
  if (location === undefined) {
    return missingStructuralResult(operation.target, operationPath, operationIndex, strict);
  }
  requireElementLocation(location, operation.target, operationPath, operationIndex);
  assertUnlockedLocation(location, operation.target, operationPath, operationIndex);
  if (location.record.type !== 'group' || !Array.isArray(location.record.children)) {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${operationPath}.target`,
      'ungroup target must resolve to a group element',
      operationIndex,
      operation.target,
    );
  }
  const dependentRelationCount = relationDependencyCount(dataset, operation.target.id);
  if (dependentRelationCount > 0 && operation.relationPolicy === 'reject') {
    hierarchyConflict(
      `${operationPath}.relationPolicy`,
      'ungroup target is referenced by a relation endpoint',
      operationIndex,
      operation.target,
    );
  }
  if (dependentRelationCount > 0) removeRelationDependencies(dataset, operation.target.id);

  const parentAffine = requireLocationParentAffine(
    location,
    operationPath,
    operationIndex,
    operation.target,
  );
  const groupWorld = requireLocationAffine(location, operationPath, operationIndex, operation.target);
  const siblingIds = elementIdsInArray(location.parent);
  const children = location.record.children.map((value, childIndex) => {
    if (!isMutableJsonRecord(value) || typeof value.id !== 'string') {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        `${operationPath}.target.children[${childIndex}]`,
        'ungroup child must be a materialized element record',
        operationIndex,
        operation.target,
      );
    }
    const childTarget = Object.freeze({ kind: 'element' as const, id: value.id });
    const childWorld = multiplyCoreV2Affine(groupWorld, stagedElementLocalAffine(value));
    rebaseElementRecord(
      value,
      childWorld,
      parentAffine,
      operationPath,
      operationIndex,
      childTarget,
    );
    return value;
  });
  location.parent.splice(location.index, 1, ...children);
  const childIds = children.map((child) => {
    if (typeof child.id !== 'string') {
      throw new Error('Materialized ungroup child lost its string ID');
    }
    return child.id;
  });
  return Object.freeze({
    changed: true,
    outcomes: Object.freeze([{ target: operation.target, outcome: 'applied' as const }]),
    selectionIds: Object.freeze(childIds),
    allowedElementOrderIds: freezeUniqueStrings([
      operation.target.id,
      ...siblingIds,
      ...childIds,
    ]),
  });
}

function structuralDestination(
  dataset: MutableJsonValue[],
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  parent: Extract<CoreV2MutationTarget, { readonly kind: 'element' }> | null,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): Readonly<{
  readonly children: MutableJsonValue[];
  readonly parentAffine: CoreV2AffineMatrix;
}> | null {
  if (parent === null) {
    return Object.freeze({ children: dataset, parentAffine: CORE_V2_IDENTITY_AFFINE });
  }
  const location = locate(index, parent, operationPath, operationIndex);
  if (location === undefined) {
    if (strict) missingStructuralTarget(parent, `${operationPath}.parent`, operationIndex);
    return null;
  }
  requireElementLocation(location, parent, operationPath, operationIndex);
  assertUnlockedLocation(location, parent, operationPath, operationIndex);
  if (location.record.type !== 'group' || !Array.isArray(location.record.children)) {
    transactionFail(
      'INVALID_MUTATION',
      'INVALID_INPUT',
      `${operationPath}.parent`,
      'move parent must resolve to a group element or null',
      operationIndex,
      parent,
    );
  }
  return Object.freeze({
    children: location.record.children,
    parentAffine: requireLocationAffine(location, operationPath, operationIndex, parent),
  });
}

function groupValueRecord(
  operation: Extract<StructuralOperation, { readonly op: 'group' }>,
  operationPath: string,
  operationIndex: number,
): MutableJsonRecord & { id: string } {
  const value = cloneMutableJson(operation.value, `${operationPath}.value`);
  if (!isMutableJsonRecord(value)) throw new Error('Group clone lost record shape');
  if (value.type !== 'group') {
    transactionFail(
      'INVALID_RECORD_KIND',
      'INVALID_INPUT',
      `${operationPath}.value.type`,
      'group value discriminator must be group',
      operationIndex,
    );
  }
  const id = value.id;
  if (typeof id !== 'string' || id.length === 0) {
    transactionFail(
      'INVALID_VALUE',
      'INVALID_INPUT',
      `${operationPath}.value.id`,
      'group value ID must be a non-empty string',
      operationIndex,
    );
  }
  if (Object.prototype.hasOwnProperty.call(value, 'children')) {
    transactionFail(
      'CONFLICTING_FIELDS',
      'INVALID_INPUT',
      `${operationPath}.value.children`,
      'group value must not supply children',
      operationIndex,
    );
  }
  return Object.assign(value, { id });
}

function missingStructuralResult(
  target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): StructuralMutationResult {
  if (strict) missingStructuralTarget(target, `${operationPath}.target`, operationIndex);
  return Object.freeze({
    changed: false,
    outcomes: Object.freeze([{ target, outcome: 'missing' as const }]),
    allowedElementOrderIds: Object.freeze([]),
  });
}

function missingStructuralTarget(
  target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>,
  path: string,
  operationIndex: number,
): never {
  transactionFail(
    'MISSING_TARGET',
    'MISSING_TARGET',
    path,
    `No staged record matches ${targetLabel(target)}`,
    operationIndex,
    target,
  );
}

function hierarchyConflict(
  path: string,
  message: string,
  operationIndex: number,
  target?: CoreV2MutationTarget,
): never {
  transactionFail('CONFLICT', 'CONFLICT', path, message, operationIndex, target);
}

function requireElementLocation(
  location: StagedLocation,
  target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>,
  operationPath: string,
  operationIndex: number,
): void {
  if (location.kind === 'element') return;
  transactionFail(
    'INVALID_MUTATION',
    'INVALID_INPUT',
    `${operationPath}.target`,
    'hierarchy target must resolve to an element',
    operationIndex,
    target,
  );
}

function assertUnlockedLocation(
  location: StagedLocation,
  target: Extract<CoreV2MutationTarget, { readonly kind: 'element' }>,
  operationPath: string,
  operationIndex: number,
): void {
  if (location.locked !== true) return;
  hierarchyConflict(
    `${operationPath}.target`,
    'hierarchy target or one of its ancestors is locked',
    operationIndex,
    target,
  );
}

function requireLocationAffine(
  location: StagedLocation,
  operationPath: string,
  operationIndex: number,
  target: CoreV2MutationTarget,
): CoreV2AffineMatrix {
  if (location.worldAffine !== undefined) return location.worldAffine;
  hierarchyConflict(
    `${operationPath}.target`,
    'hierarchy target has no finite world transform',
    operationIndex,
    target,
  );
}

function requireLocationParentAffine(
  location: StagedLocation,
  operationPath: string,
  operationIndex: number,
  target: CoreV2MutationTarget,
): CoreV2AffineMatrix {
  if (location.parentAffine !== undefined) return location.parentAffine;
  hierarchyConflict(
    `${operationPath}.target`,
    'hierarchy target has no finite parent transform',
    operationIndex,
    target,
  );
}

function rebaseElementRecord(
  record: MutableJsonRecord,
  worldAffine: CoreV2AffineMatrix,
  parentAffine: CoreV2AffineMatrix,
  operationPath: string,
  operationIndex: number,
  target: CoreV2MutationTarget,
): void {
  let local: CoreV2AffineMatrix;
  try {
    local = multiplyCoreV2Affine(invertCoreV2Affine(parentAffine), worldAffine);
  } catch {
    hierarchyConflict(
      `${operationPath}.target`,
      'hierarchy transform cannot be rebased through a singular parent',
      operationIndex,
      target,
    );
  }
  const [a, b, c, d, x, y] = local;
  const scaleX = Math.hypot(a, b);
  const determinant = a * d - b * c;
  if (!(scaleX > 1e-12) || !Number.isFinite(determinant)) {
    hierarchyConflict(
      `${operationPath}.target`,
      'hierarchy transform cannot be represented by the pinned affine profile',
      operationIndex,
      target,
    );
  }
  const scaleY = determinant / scaleX;
  const skew = a * c + b * d;
  const tolerance = 1e-8 * Math.max(1, scaleX * Math.abs(scaleY));
  if (!Number.isFinite(scaleY) || Math.abs(scaleY) <= 1e-12 || Math.abs(skew) > tolerance) {
    hierarchyConflict(
      `${operationPath}.target`,
      'hierarchy rebase would require unsupported skew or singular scale',
      operationIndex,
      target,
    );
  }
  const angle = normalizeSignedZero(Math.atan2(b, a) * 180 / Math.PI);
  const attrs = isMutableJsonRecord(record.attrs) ? record.attrs : {};
  defineMutableProperty(attrs, 'x', normalizeSignedZero(x));
  defineMutableProperty(attrs, 'y', normalizeSignedZero(y));
  if (Object.prototype.hasOwnProperty.call(attrs, 'rotation') &&
      !Object.prototype.hasOwnProperty.call(attrs, 'angle')) {
    defineMutableProperty(attrs, 'rotation', normalizeSignedZero(angle * Math.PI / 180));
  } else if (angle !== 0 || Object.prototype.hasOwnProperty.call(attrs, 'angle')) {
    defineMutableProperty(attrs, 'angle', angle);
    delete attrs.rotation;
  } else {
    delete attrs.angle;
    delete attrs.rotation;
  }
  writeScaleAttribute(attrs, 'scaleX', scaleX);
  writeScaleAttribute(attrs, 'scaleY', scaleY);
  defineMutableProperty(record, 'attrs', attrs);
}

function writeScaleAttribute(
  attrs: MutableJsonRecord,
  key: 'scaleX' | 'scaleY',
  value: number,
): void {
  const normalized = normalizeSignedZero(Math.abs(value - 1) <= 1e-12 ? 1 : value);
  if (normalized === 1 && !Object.prototype.hasOwnProperty.call(attrs, key)) delete attrs[key];
  else defineMutableProperty(attrs, key, normalized);
}

function stagedElementLocalAffine(record: MutableJsonRecord): CoreV2AffineMatrix {
  const attrs = isMutableJsonRecord(record.attrs) ? record.attrs : undefined;
  const x = finiteOr(attrs?.x, 0);
  const y = finiteOr(attrs?.y, 0);
  const angle = Number.isFinite(attrs?.angle)
    ? Number(attrs?.angle)
    : Number.isFinite(attrs?.rotation)
      ? Number(attrs?.rotation) * 180 / Math.PI
      : 0;
  const scaleX = finiteOr(attrs?.scaleX, 1);
  const scaleY = finiteOr(attrs?.scaleY, 1);
  return createCoreV2Affine(x, y, angle, scaleX, scaleY);
}

function finiteOr(value: MutableJsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function elementSubtreeIds(record: MutableJsonRecord): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (value: MutableJsonValue): void => {
    if (!isMutableJsonRecord(value)) return;
    if (typeof value.id === 'string') ids.add(value.id);
    if (value.type === 'group' && Array.isArray(value.children)) {
      for (const child of value.children) visit(child);
    }
  };
  visit(record);
  return ids;
}

function elementIdsInArray(values: readonly MutableJsonValue[]): readonly string[] {
  return Object.freeze(values.flatMap((value) =>
    isMutableJsonRecord(value) && typeof value.id === 'string' ? [value.id] : []));
}

function freezeUniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function locationTarget(
  location: StagedLocation,
): Extract<CoreV2MutationTarget, { readonly kind: 'element' }> {
  const id = location.record.id;
  if (typeof id !== 'string') {
    throw new Error('Staged element location lost its string ID');
  }
  return Object.freeze({ kind: 'element', id });
}

function relationDependencyCount(dataset: readonly MutableJsonValue[], id: string): number {
  let count = 0;
  visitRelationRecords(dataset, (links) => {
    for (const link of links) {
      if (!isMutableJsonRecord(link)) continue;
      if (link.source === id || link.target === id) count += 1;
    }
  });
  return count;
}

function removeRelationDependencies(dataset: readonly MutableJsonValue[], id: string): void {
  visitRelationRecords(dataset, (links, owner) => {
    defineMutableProperty(owner, 'links', links.filter((link) =>
      !isMutableJsonRecord(link) || (link.source !== id && link.target !== id)));
  });
}

function visitRelationRecords(
  values: readonly MutableJsonValue[],
  visit: (links: MutableJsonValue[], owner: MutableJsonRecord) => void,
): void {
  for (const value of values) {
    if (!isMutableJsonRecord(value)) continue;
    if (value.type === 'relations' && Array.isArray(value.links)) visit(value.links, value);
    if (value.type === 'group' && Array.isArray(value.children)) {
      visitRelationRecords(value.children, visit);
    }
  }
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) <= 1e-12 ? 0 : value;
}

function indexDataset(dataset: MutableJsonValue[]): ReadonlyMap<string, readonly StagedLocation[]> {
  const mutable = new Map<string, StagedLocation[]>();
  dataset.forEach((value, index) => indexElement(
    value,
    dataset,
    index,
    mutable,
    null,
    CORE_V2_IDENTITY_AFFINE,
    false,
  ));
  return mutable;
}

function indexElement(
  value: MutableJsonValue,
  parent: MutableJsonValue[],
  index: number,
  targetIndex: Map<string, StagedLocation[]>,
  parentElementId: string | null,
  parentAffine: CoreV2AffineMatrix,
  ancestorLocked: boolean,
): void {
  if (!isMutableJsonRecord(value)) return;
  const id = value.id;
  if (typeof id !== 'string') return;
  const worldAffine = multiplyCoreV2Affine(parentAffine, stagedElementLocalAffine(value));
  const locked = ancestorLocked || value.locked === true;
  addLocation(targetIndex, targetKey({ kind: 'element', id }), {
    kind: 'element',
    parent,
    index,
    parentElementId,
    parentAffine,
    worldAffine,
    locked,
    record: value,
  });

  if (value.type === 'group' && Array.isArray(value.children)) {
    value.children.forEach((child, childIndex) =>
      indexElement(
        child,
        value.children as MutableJsonValue[],
        childIndex,
        targetIndex,
        id,
        worldAffine,
        locked,
      ),
    );
  }
  if (value.type === 'item' && Array.isArray(value.components)) {
    indexComponents(value.components, id, targetIndex);
  }
  const gridItem = value.item;
  if (value.type === 'grid' && isMutableJsonRecord(gridItem) && Array.isArray(gridItem.components)) {
    indexComponents(gridItem.components, id, targetIndex);
  }
}

function indexComponents(
  components: MutableJsonValue[],
  ownerId: string,
  targetIndex: Map<string, StagedLocation[]>,
): void {
  components.forEach((value, index) => {
    if (!isMutableJsonRecord(value) || typeof value.id !== 'string') return;
    addLocation(targetIndex, targetKey({ kind: 'component', ownerId, id: value.id }), {
      kind: 'component',
      ownerId,
      parent: components,
      index,
      record: value,
    });
  });
}

function addLocation(
  index: Map<string, StagedLocation[]>,
  key: string,
  location: StagedLocation,
): void {
  const existing = index.get(key);
  if (existing === undefined) index.set(key, [location]);
  else existing.push(location);
}

function locate(
  index: ReadonlyMap<string, readonly StagedLocation[]>,
  target: CoreV2MutationTarget,
  operationPath: string,
  operationIndex: number,
): StagedLocation | undefined {
  const matches = index.get(targetKey(target)) ?? [];
  if (matches.length > 1) {
    transactionFail(
      'DUPLICATE_ID',
      'INVALID_INPUT',
      `${operationPath}.target`,
      `${targetLabel(target)} resolves to multiple staged records`,
      operationIndex,
      target,
    );
  }
  return matches[0];
}

function assertNoOverlappingPaths(
  changes: readonly CoreV2MutationPathChange[],
  operationIndex: number,
  target: CoreV2MutationTarget,
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
  components: readonly Readonly<Record<string, CoreV2MutationJsonValue>>[],
  operationPath: string,
  operationIndex: number,
  target: CoreV2MutationTarget,
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

function noteOutcome(
  journal: Map<string, TargetJournalEntry>,
  target: CoreV2MutationTarget,
  outcome: TargetOutcome,
): void {
  const key = targetKey(target);
  const previous = journal.get(key);
  if (previous === undefined) {
    journal.set(key, { target, outcome });
    return;
  }
  if (outcomeRank(outcome) > outcomeRank(previous.outcome)) previous.outcome = outcome;
}

function journalTargets(
  journal: ReadonlyMap<string, TargetJournalEntry>,
  outcome: TargetOutcome,
): readonly CoreV2MutationTarget[] {
  return Object.freeze(
    [...journal.values()].filter((entry) => entry.outcome === outcome).map((entry) => entry.target),
  );
}

function outcomeRank(outcome: TargetOutcome): number {
  switch (outcome) {
    case 'missing':
      return 0;
    case 'unchanged':
      return 1;
    case 'applied':
      return 2;
  }
}

function isNumberArrayLike(value: unknown): value is ArrayLike<number> {
  return Array.isArray(value) ||
    (
      ArrayBuffer.isView(value) &&
      !(value instanceof DataView) &&
      'length' in value
    );
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === 'string');
}

function mergedValue(current: MutableJsonValue, incoming: MutableJsonValue): MutableJsonValue {
  if (!isMutableJsonRecord(current) || !isMutableJsonRecord(incoming)) return incoming;
  const result = cloneMutableJson(current, '$.merge');
  if (!isMutableJsonRecord(result)) throw new Error('Record clone lost record shape');
  for (const key of Object.keys(incoming)) {
    const previous = result[key];
    const next = requireRecordValue(incoming, key);
    defineMutableProperty(
      result,
      key,
      previous === undefined ? cloneMutableJson(next, '$.merge') : mergedValue(previous, next),
    );
  }
  return result;
}

function isIndexStructuralPath(path: readonly CoreV2MutationPathSegment[]): boolean {
  const root = path[0];
  return root === 'children' || root === 'components' || root === 'item' || root === 'cells';
}

function pathIsPrefix(
  prefix: readonly CoreV2MutationPathSegment[],
  candidate: readonly CoreV2MutationPathSegment[],
): boolean {
  return prefix.length <= candidate.length && prefix.every((segment, index) => segment === candidate[index]);
}

function targetKey(target: CoreV2MutationTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

function targetLabel(target: CoreV2MutationTarget): string {
  return target.kind === 'element'
    ? `element:${target.id}`
    : `component:${target.ownerId}/${target.id}`;
}

function invalidAppliedPath(
  operationPath: string,
  operationIndex: number,
  target: CoreV2MutationTarget,
  path: readonly CoreV2MutationPathSegment[],
  segmentIndex: number,
): never {
  transactionFail(
    'INVALID_PATH',
    'INVALID_INPUT',
    `${operationPath}.changes.path[${segmentIndex}]`,
    `path ${JSON.stringify(path)} does not address a mergeable staged value`,
    operationIndex,
    target,
  );
}

function rejectUnknownFields(
  record: Readonly<Record<string, unknown>>,
  accepted: ReadonlySet<string>,
  path: string,
  operationIndex?: number,
  target?: CoreV2MutationTarget,
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

function strictRecord(
  value: unknown,
  path: string,
  message: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) {
    transactionFail('INVALID_VALUE', 'INVALID_INPUT', path, message);
  }
  return value;
}

function cloneImmutableJson(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): CoreV2MutationJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) nonSerializable(path, 'numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) nonSerializable(path, 'cyclic values are not accepted');
    ancestors.add(value);
    try {
      const result: CoreV2MutationJsonValue[] = [];
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
      const result: Record<string, CoreV2MutationJsonValue> = {};
      for (const key of Object.keys(value)) {
        if (UNSAFE_PATH_SEGMENTS.has(key)) nonSerializable(`${path}.${key}`, 'unsafe keys are not accepted');
        defineImmutableProperty(result, key, cloneImmutableJson(value[key], `${path}.${key}`, ancestors));
      }
      return Object.freeze(result);
    } finally {
      ancestors.delete(value);
    }
  }
  nonSerializable(path, 'values must be JSON scalars, arrays, or strict plain records');
}

function cloneMutableJson(
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
        if (UNSAFE_PATH_SEGMENTS.has(key)) nonSerializable(`${path}.${key}`, 'unsafe keys are not accepted');
        defineMutableProperty(result, key, cloneMutableJson(value[key], `${path}.${key}`, ancestors));
      }
      return result;
    } finally {
      ancestors.delete(value);
    }
  }
  nonSerializable(path, 'values must be JSON scalars, arrays, or strict plain records');
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => jsonEquivalent(entry, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every(
    (key, index) => key === rightKeys[index] && jsonEquivalent(left[key], right[key]),
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonRecord(
  value: CoreV2MutationJsonValue,
): value is Readonly<Record<string, CoreV2MutationJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMutableJsonRecord(value: unknown): value is MutableJsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecordValue(record: MutableJsonRecord, key: string): MutableJsonValue {
  const value = record[key];
  if (value === undefined) throw new Error(`Missing staged record value ${key}`);
  return value;
}

function defineMutableProperty(target: MutableJsonRecord, key: string, value: MutableJsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function defineImmutableProperty(
  target: Record<string, CoreV2MutationJsonValue>,
  key: string,
  value: CoreV2MutationJsonValue,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: false,
    writable: false,
  });
}

function requireAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing value at index ${index}`);
  return value;
}

function datasetDiagnosticCode(error: CoreV2DatasetError): CoreV2MutationDiagnosticCode {
  if (/duplicate/iu.test(error.message)) return 'DUPLICATE_ID';
  return error.code;
}

function freezeSummary(
  appliedCount: number,
  missingCount: number,
  unchangedCount: number,
): CoreV2MutationTransactionSummary {
  return Object.freeze({ appliedCount, missingCount, unchangedCount });
}

function rejected(
  mutationDiagnostic: CoreV2MutationTransactionDiagnostic,
  actionId?: string,
): Extract<CoreV2MutationTransactionPlan, { readonly status: 'rejected' }> {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    schemaRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
    ...(actionId === undefined ? {} : { actionId }),
    candidate: null,
    applied: EMPTY_TARGETS,
    missing: EMPTY_TARGETS,
    unchanged: EMPTY_TARGETS,
    summary: freezeSummary(0, 0, 0),
    diagnostic: mutationDiagnostic,
  });
}

function diagnostic(
  code: CoreV2MutationDiagnosticCode,
  category: CoreV2MutationDiagnosticCategory,
  path: string,
  message: string,
  operationIndex?: number,
  target?: CoreV2MutationTarget,
  datasetCode?: CoreV2DatasetError['code'],
): CoreV2MutationTransactionDiagnostic {
  return Object.freeze({
    code,
    category,
    path,
    message,
    ...(operationIndex === undefined ? {} : { operationIndex }),
    ...(target === undefined ? {} : { target }),
    ...(datasetCode === undefined ? {} : { datasetCode }),
  });
}

function transactionFail(
  code: CoreV2MutationDiagnosticCode,
  category: CoreV2MutationDiagnosticCategory,
  path: string,
  message: string,
  operationIndex?: number,
  target?: CoreV2MutationTarget,
): never {
  throw new TransactionValidationFailure(
    diagnostic(code, category, path, message, operationIndex, target),
  );
}

function nonSerializable(path: string, message: string): never {
  transactionFail('NON_SERIALIZABLE_VALUE', 'INVALID_INPUT', path, message);
}

class TransactionValidationFailure extends Error {
  public readonly diagnostic: CoreV2MutationTransactionDiagnostic;

  public constructor(mutationDiagnostic: CoreV2MutationTransactionDiagnostic) {
    super(mutationDiagnostic.message);
    this.name = 'TransactionValidationFailure';
    this.diagnostic = mutationDiagnostic;
  }
}
