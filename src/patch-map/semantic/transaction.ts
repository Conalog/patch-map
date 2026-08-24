import {
  assembleOwnedPatchMapDataset,
  PatchMapDatasetError,
  materializePatchMapDataset,
  normalizePatchMapTextStylePatch,
  replaceOwnedPatchMapBarHeightRoot,
  replaceOwnedPatchMapTextRoot,
  type PatchMapElement,
  type PatchMapTextStyle,
  type MaterializedPatchMapDataset,
} from './dataset';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationTarget,
  type PatchMapMutationTransactionPlan,
  type PatchMapBarHeightBatchTarget,
  type PatchMapPlannedBarHeightUpdate,
  type PatchMapPlannedTextUpdate,
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
  BAR_HEIGHT_BATCH_FIELDS,
  BAR_HEIGHT_BATCH_TARGET_FIELDS,
  EMPTY_OPERATIONS,
  TEXT_BATCH_FIELDS,
  TEXT_BATCH_TARGET_FIELDS,
  isIndexStructuralPath,
  isPatchMapComponentType,
  isPatchMapElementType,
  normalizeBulkPatch,
  normalizeTransaction,
  rejectUnknownFields,
  strictNumberArrayLike,
  strictOrderedArray,
  strictRecord,
  targetKey,
  targetLabel,
  type NormalizedTransaction,
} from './transaction/request-normalization';
import {
  EMPTY_TRANSACTION_TARGETS as EMPTY_TARGETS,
  applyPatchMapMutationPathChange as applyPathChange,
  freezeTransactionSummary as freezeSummary,
  journalTargets,
  noteTargetOutcome as noteOutcome,
  ownedRootIndexById,
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

/** Detach caller-owned JSON for host companion and transaction boundaries. */
export function detachPatchMapMutationJsonValue(
  value: unknown,
  path = '$.value',
): PatchMapMutationJsonValue {
  return cloneImmutableJson(value, path);
}

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
