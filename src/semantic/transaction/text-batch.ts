import {
  assembleOwnedPatchMapDataset,
  normalizePatchMapTextStylePatch,
  PatchMapDatasetError,
  replaceOwnedPatchMapTextRoot,
  type MaterializedPatchMapDataset,
  type PatchMapElement,
  type PatchMapTextStyle,
} from '../dataset';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  type PatchMapMutationTarget,
  type PatchMapMutationTransactionPlan,
  type PatchMapPlannedTextUpdate,
} from './contracts';
import {
  TransactionValidationFailure,
  diagnostic,
  transactionFail,
} from './diagnostics';
import { cloneImmutableJson, jsonEquivalent } from './json-values';
import {
  EMPTY_TRANSACTION_TARGETS as EMPTY_TARGETS,
  freezeTransactionSummary as freezeSummary,
  ownedRootIndexById,
  rejectedTransactionPlan as rejected,
} from './owned-fast-path-planning';
import {
  EMPTY_OPERATIONS,
  TEXT_BATCH_FIELDS,
  TEXT_BATCH_TARGET_FIELDS,
  rejectUnknownFields,
  strictOrderedArray,
  strictRecord,
  targetKey,
  targetLabel,
} from './request-normalization';

/**
 * Validate one ordered owner-qualified text batch without allocating a merge
 * operation/path graph or normalizing and hashing each dirty root separately.
 */
export function planPatchMapTextBatch(
  current: MaterializedPatchMapDataset,
  requestInput: unknown,
): PatchMapMutationTransactionPlan {
  let record: Readonly<Record<string, unknown>>;
  let targets: readonly unknown[];
  let texts: readonly unknown[];
  let styles: readonly unknown[] | undefined;
  try {
    record = strictRecord(
      requestInput,
      '$',
      'text batch must be a strict plain record',
    );
    rejectUnknownFields(record, TEXT_BATCH_FIELDS, '$');
    targets = strictOrderedArray(record.targets, '$.targets', 'targets must be an ordered array');
    texts = strictOrderedArray(record.texts, '$.texts', 'texts must be an ordered string array');
    if (!texts.every((value) => typeof value === 'string')) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.texts',
        'texts must be an ordered string array',
      );
    }
    if (targets.length !== texts.length) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.texts',
        'texts length must match targets length',
      );
    }
    if (Object.hasOwn(record, 'styles')) {
      styles = strictOrderedArray(
        record.styles,
        '$.styles',
        'styles must be an ordered array matching targets length',
      );
      if (styles.length !== targets.length) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          '$.styles',
          'styles must be an ordered array matching targets length',
        );
      }
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
  if (targets.length === 0) {
    return Object.freeze({
      status: 'planned',
      changed: false,
      schemaRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
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
  const roots: PatchMapElement[] = [...current.dataset];
  const applied: PatchMapMutationTarget[] = [];
  const unchanged: PatchMapMutationTarget[] = [];
  const directUpdates: PatchMapPlannedTextUpdate[] = [];
  const seenTargets = new Set<string>();
  let changed = false;
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const targetRecord = strictRecord(
        targets[index],
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
      const text = texts[index];
      if (typeof text !== 'string') {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          `$.texts[${index}]`,
          'text must be a string',
          index,
        );
      }
      let stylePatch: PatchMapTextStyle | undefined;
      if (styles !== undefined) {
        try {
          const detachedStyle = cloneImmutableJson(
            styles[index],
            `$.styles[${index}]`,
          );
          stylePatch = normalizePatchMapTextStylePatch(
            detachedStyle,
            `$.styles[${index}]`,
          );
        } catch (error) {
          if (!(error instanceof PatchMapDatasetError)) throw error;
          transactionFail(
            'INVALID_VALUE',
            'INVALID_INPUT',
            error.datasetPath,
            error.message,
            index,
          );
        }
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
      const componentIndex = root.components.findIndex(({ id }) => id === target.id);
      const component = componentIndex < 0
        ? undefined
        : root.components[componentIndex];
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
      const nextStyle = stylePatch === undefined
        ? component.style
        : Object.freeze({ ...component.style, ...stylePatch });
      if (
        component.text === text &&
        jsonEquivalent(component.style, nextStyle)
      ) {
        unchanged.push(target);
        continue;
      }
      const update = Object.freeze({
        ownerId: target.ownerId,
        componentId: target.id,
        text,
      });
      directUpdates.push(update);
      const replacement = replaceOwnedPatchMapTextRoot(
        root,
        target.id,
        text,
        stylePatch,
        componentIndex,
      );
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
      applied.push(target);
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic, actionId);
  }

  const candidate = changed
    ? assembleOwnedPatchMapDataset(current, roots)
    : current;
  const frozenApplied = Object.freeze(applied);
  const frozenUnchanged = Object.freeze(unchanged);
  return Object.freeze({
    status: 'planned',
    changed,
    schemaRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
    strict: true,
    conflictPolicy: 'reject',
    operations: EMPTY_OPERATIONS,
    ...(actionId === undefined ? {} : { actionId }),
    ...(recordHistory === undefined ? {} : { recordHistory }),
    candidate,
    applied: frozenApplied,
    missing: EMPTY_TARGETS,
    unchanged: frozenUnchanged,
    directTextUpdates: Object.freeze(directUpdates),
    summary: freezeSummary(frozenApplied.length, 0, frozenUnchanged.length),
  });
}
