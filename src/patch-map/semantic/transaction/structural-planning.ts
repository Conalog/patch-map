import {
  PatchMapDatasetError,
  materializeOwnedPatchMapStructuralDataset,
  type MaterializedPatchMapDataset,
} from '../dataset';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  type PatchMapMutationTransactionPlan,
} from './contracts';
import {
  TransactionValidationFailure,
  datasetDiagnosticCode,
  diagnostic,
} from './diagnostics';
import {
  cloneMutableJson,
  type MutableJsonValue,
} from './json-values';
import type { NormalizedTransaction } from './request-normalization';
import {
  freezeTransactionSummary as freezeSummary,
  journalTargets,
  noteTargetOutcome as noteOutcome,
  ownedRootIndexById,
  rejectedTransactionPlan as rejected,
  type TargetJournalEntry,
} from './owned-fast-path-planning';
import {
  applyStructuralOperation,
  removeTarget,
} from './structural-mutations';
import {
  indexDataset,
  locate,
} from './structural-scene';

/**
 * Preserve normalized root identity for the common one-action top-level editor
 * operations. The generic planner remains the authority for nested,
 * multi-operation, missing, or otherwise ambiguous requests.
 */
export function planOwnedTopLevelStructuralTransaction(
  current: MaterializedPatchMapDataset,
  request: NormalizedTransaction,
): PatchMapMutationTransactionPlan | null {
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
  if (operation.op === 'ungroup' && operation.relationPolicy === 'remove') {
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

  let candidate: MaterializedPatchMapDataset;
  try {
    candidate = materializeOwnedPatchMapStructuralDataset(staged);
  } catch (error) {
    if (!(error instanceof PatchMapDatasetError)) throw error;
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
    schemaRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
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
