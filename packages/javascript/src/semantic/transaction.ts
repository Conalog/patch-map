import {
  assembleOwnedPatchMapDataset,
  PatchMapDatasetError,
  materializePatchMapDataset,
  type MaterializedPatchMapDataset,
} from './dataset';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationTransactionPlan,
} from './transaction/contracts';
import {
  TransactionValidationFailure,
  datasetDiagnosticCode,
  diagnostic,
  transactionFail,
} from './transaction/diagnostics';
import {
  cloneImmutableJson,
  cloneMutableJson,
  defineMutableProperty,
  isMutableJsonRecord,
  jsonEquivalent,
  type MutableJsonRecord,
} from './transaction/json-values';
import {
  EMPTY_OPERATIONS,
  isIndexStructuralPath,
  isPatchMapComponentType,
  isPatchMapElementType,
  normalizeBulkPatch,
  normalizeTransaction,
  targetLabel,
  type NormalizedTransaction,
} from './transaction/request-normalization';
import {
  EMPTY_TRANSACTION_TARGETS as EMPTY_TARGETS,
  applyPatchMapMutationPathChange as applyPathChange,
  freezeTransactionSummary as freezeSummary,
  journalTargets,
  noteTargetOutcome as noteOutcome,
  planFlatOwnedMergeTransaction,
  planOwnedBarHeightTransaction,
  planOwnedElementAngleTransaction,
  rejectedTransactionPlan as rejected,
  type TargetJournalEntry,
} from './transaction/owned-fast-path-planning';
import {
  applyStructuralOperation,
  removeTarget,
} from './transaction/structural-mutations';
import { planOwnedTopLevelStructuralTransaction } from './transaction/structural-planning';
import {
  indexDataset,
  locate,
  type StagedLocation,
} from './transaction/structural-scene';

export * from './transaction/contracts';
export { planPatchMapBarHeightBatch } from './transaction/bar-height-batch';
export { planPatchMapTextBatch } from './transaction/text-batch';

/** Detach caller-owned JSON for host companion and transaction boundaries. */
export function detachPatchMapMutationJsonValue(
  value: unknown,
  path = '$.value',
): PatchMapMutationJsonValue {
  return cloneImmutableJson(value, path);
}

/**
 * Validate a bulk target-set merge. An empty target set is a real product
 * no-op, while an empty raw transaction remains invalid.
 */
export function planPatchMapBulkPatch(
  current: MaterializedPatchMapDataset,
  requestInput: unknown,
  schemaRevision: string = PATCH_MAP_MUTATION_TRANSACTION_REVISION,
): PatchMapMutationTransactionPlan {
  if (schemaRevision !== PATCH_MAP_MUTATION_TRANSACTION_REVISION) {
    return rejected(
      diagnostic(
        'INVALID_SCHEMA_VERSION',
        'INVALID_INPUT',
        '$.schemaRevision',
        `Expected ${PATCH_MAP_MUTATION_TRANSACTION_REVISION}`,
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
    const directAngles = planOwnedElementAngleTransaction(current, request);
    if (directAngles !== null) return directAngles;
    const directBars = planOwnedBarHeightTransaction(current, request);
    if (directBars !== null) return directBars;
    const incremental = planFlatOwnedMergeTransaction(current, request);
    if (incremental !== null) return incremental;
    return planNormalizedPatchMapMutationTransaction(current, request);
  }

  return Object.freeze({
    status: 'planned',
    changed: false,
    schemaRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
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

/**
 * Stage a transient visual preview. The flat-root fast path deliberately skips
 * the whole-dataset semantic hash; the normal planner remains mandatory before
 * history or authoritative semantic publication.
 */
export function planPatchMapPreviewMutationTransaction(
  current: MaterializedPatchMapDataset,
  requestInput: unknown,
  schemaRevision: string = PATCH_MAP_MUTATION_TRANSACTION_REVISION,
): PatchMapMutationTransactionPlan {
  if (schemaRevision !== PATCH_MAP_MUTATION_TRANSACTION_REVISION) {
    return planPatchMapMutationTransaction(current, requestInput, schemaRevision);
  }
  let request: NormalizedTransaction;
  try {
    request = normalizeTransaction(requestInput);
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejected(error.diagnostic);
  }
  const incremental = planFlatOwnedMergeTransaction(current, request, true);
  return incremental ?? planNormalizedPatchMapMutationTransaction(current, request);
}

/**
 * Promote an internally validated flat preview into an authoritative candidate
 * without cloning and normalizing its dirty roots again. Canonical hashing is
 * deliberately deferred until this promotion so pointer-move previews remain
 * cheap while pointer-up still publishes the exact deterministic hash.
 */
export function promotePatchMapPreviewMutationTransaction(
  current: MaterializedPatchMapDataset,
  preview: PatchMapMutationTransactionPlan,
): PatchMapMutationTransactionPlan {
  if (preview.status !== 'planned' || !preview.changed) return preview;
  const candidate = assembleOwnedPatchMapDataset(current, preview.candidate.dataset);
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
export function planPatchMapMutationTransaction(
  current: MaterializedPatchMapDataset,
  requestInput: unknown,
  schemaRevision: string = PATCH_MAP_MUTATION_TRANSACTION_REVISION,
): PatchMapMutationTransactionPlan {
  if (schemaRevision !== PATCH_MAP_MUTATION_TRANSACTION_REVISION) {
    return rejected(
      diagnostic(
        'INVALID_SCHEMA_VERSION',
        'INVALID_INPUT',
        '$.schemaRevision',
        `Expected ${PATCH_MAP_MUTATION_TRANSACTION_REVISION}`,
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
  const directAngles = planOwnedElementAngleTransaction(current, request);
  if (directAngles !== null) return directAngles;
  const directBars = planOwnedBarHeightTransaction(current, request);
  if (directBars !== null) return directBars;
  const incremental = planFlatOwnedMergeTransaction(current, request);
  if (incremental !== null) return incremental;
  return planNormalizedPatchMapMutationTransaction(current, request);
}

function planNormalizedPatchMapMutationTransaction(
  current: MaterializedPatchMapDataset,
  request: NormalizedTransaction,
): PatchMapMutationTransactionPlan {
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

  let candidate: MaterializedPatchMapDataset;
  try {
    candidate = materializePatchMapDataset(staged);
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
  const summary = freezeSummary(applied.length, missing.length, unchanged.length);
  const changed = !jsonEquivalent(current.dataset, candidate.dataset);

  return Object.freeze({
    status: 'planned',
    changed,
    schemaRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
    strict: request.strict,
    conflictPolicy: request.conflictPolicy,
    operations: request.operations,
    ...(request.actionId === undefined ? {} : { actionId: request.actionId }),
    ...(request.recordHistory === undefined ? {} : { recordHistory: request.recordHistory }),
    ...(request.history === undefined ? {} : { history: request.history }),
    ...(request.animatedBarTargets === undefined
      ? {}
      : { animatedBarTargets: request.animatedBarTargets }),
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


function replacementRecord(
  operation: Extract<PatchMapMutationOperation, { readonly op: 'replace' }>,
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
    ? isPatchMapElementType(type)
    : isPatchMapComponentType(type);
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
  operation: Extract<PatchMapMutationOperation, { readonly op: 'reconcile-components' }>,
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
