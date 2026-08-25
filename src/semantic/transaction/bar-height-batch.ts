import {
  assembleOwnedPatchMapDataset,
  replaceOwnedPatchMapBarHeightRoot,
  type MaterializedPatchMapDataset,
  type PatchMapElement,
} from '../dataset';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  type PatchMapBarHeightBatchTarget,
  type PatchMapMutationTarget,
  type PatchMapMutationTransactionPlan,
  type PatchMapPlannedBarHeightUpdate,
} from './contracts';
import {
  TransactionValidationFailure,
  diagnostic,
  transactionFail,
} from './diagnostics';
import {
  EMPTY_TRANSACTION_TARGETS as EMPTY_TARGETS,
  freezeTransactionSummary as freezeSummary,
  ownedRootIndexById,
  rejectedTransactionPlan as rejected,
} from './owned-fast-path-planning';
import {
  BAR_HEIGHT_BATCH_FIELDS,
  BAR_HEIGHT_BATCH_TARGET_FIELDS,
  EMPTY_OPERATIONS,
  rejectUnknownFields,
  strictNumberArrayLike,
  strictOrderedArray,
  strictRecord,
  targetKey,
  targetLabel,
} from './request-values';

/**
 * Validate one compact, ordered bar-height batch without materializing the
 * equivalent merge/change/path object graph. The candidate remains an owned,
 * structurally shared PATCH MAP dataset and therefore uses the same history,
 * reconcile, atomic publication, and semantic-hash authorities as transact().
 */
export function planPatchMapBarHeightBatch(
  current: MaterializedPatchMapDataset,
  requestInput: unknown,
): PatchMapMutationTransactionPlan {
  let record: Readonly<Record<string, unknown>>;
  let targets: readonly unknown[];
  let heights: readonly unknown[];
  let animate: boolean | readonly unknown[] | undefined;
  try {
    record = strictRecord(
      requestInput,
      '$',
      'bar height batch must be a strict plain record',
    );
    rejectUnknownFields(record, BAR_HEIGHT_BATCH_FIELDS, '$');
    targets = strictOrderedArray(record.targets, '$.targets', 'targets must be an ordered array');
    heights = strictNumberArrayLike(
      record.heights,
      '$.heights',
      'heights must be a numeric array or typed array',
    );
    if (targets.length !== heights.length) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.heights',
        'heights length must match targets length',
      );
    }
    if (record.animate === undefined || typeof record.animate === 'boolean') {
      animate = record.animate as boolean | undefined;
    } else {
      animate = strictOrderedArray(
        record.animate,
        '$.animate',
        'animate must be a boolean or an ordered boolean array',
      );
      if (animate.length !== targets.length) {
        transactionFail(
          'INVALID_VALUE',
          'INVALID_INPUT',
          '$.animate',
          'animate length must match targets length',
        );
      }
      for (let index = 0; index < animate.length; index += 1) {
        if (typeof animate[index] !== 'boolean') {
          transactionFail(
            'INVALID_VALUE',
            'INVALID_INPUT',
            `$.animate[${index}]`,
            'animate entries must be booleans',
            index,
          );
        }
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
      directBarHeightUpdates: Object.freeze([]),
      animatedBarTargets: Object.freeze([]),
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
  const directUpdates: PatchMapPlannedBarHeightUpdate[] = [];
  const animatedBarTargets: PatchMapBarHeightBatchTarget[] = [];
  const seenTargets = new Set<string>();
  let changed = false;
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const targetRecord = strictRecord(
        targets[index],
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
      const height = heights[index];
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
      if (
        rootIndex === undefined ||
        (root?.type !== 'item' && root?.type !== 'grid')
      ) {
        transactionFail(
          'MISSING_TARGET',
          'MISSING_TARGET',
          `$.targets[${index}]`,
          `No staged record matches ${targetLabel(target)}`,
          index,
          target,
        );
      }
      const rootComponents = root.type === 'item'
        ? root.components
        : root.item.components;
      const componentIndex = rootComponents.findIndex(({ id }) => id === target.id);
      const component = componentIndex < 0
        ? undefined
        : rootComponents[componentIndex];
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
        unchanged.push(target);
        continue;
      }
      const update = Object.freeze({
        ownerId: target.ownerId,
        componentId: target.id,
        height,
      });
      directUpdates.push(update);
      if (animate !== false && (!Array.isArray(animate) || animate[index] === true)) {
        animatedBarTargets.push(Object.freeze({
          ownerId: target.ownerId,
          componentId: target.id,
        }));
      }
      const replacement = replaceOwnedPatchMapBarHeightRoot(
        root,
        target.id,
        height,
        componentIndex,
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
    directBarHeightUpdates: Object.freeze(directUpdates),
    animatedBarTargets: Object.freeze(animatedBarTargets),
    summary: freezeSummary(frozenApplied.length, 0, frozenUnchanged.length),
  });
}
