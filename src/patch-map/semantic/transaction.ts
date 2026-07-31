import {
  assembleOwnedPatchMapDataset,
  PatchMapDatasetError,
  materializePatchMapDataset,
  materializeOwnedPatchMapStructuralDataset,
  normalizePatchMapTextStylePatch,
  replaceOwnedPatchMapBarHeightRoot,
  replaceOwnedPatchMapTextRoot,
  type PatchMapElement,
  type PatchMapTextStyle,
  type MaterializedPatchMapDataset,
} from './dataset';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  createPatchMapAffine,
  invertPatchMapAffine,
  multiplyPatchMapAffine,
  type PatchMapAffineMatrix,
} from './geometry';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationTarget,
  type PatchMapMutationTransactionPlan,
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
  type MutableJsonValue,
} from './transaction/json-values';
import {
  BAR_HEIGHT_BATCH_FIELDS,
  BAR_HEIGHT_BATCH_TARGET_FIELDS,
  EMPTY_OPERATIONS,
  TEXT_BATCH_FIELDS,
  TEXT_BATCH_TARGET_FIELDS,
  isIndexStructuralPath,
  isNumberArrayLike,
  isPatchMapComponentType,
  isPatchMapElementType,
  isStringArray,
  normalizeBulkPatch,
  normalizeTransaction,
  rejectUnknownFields,
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
  type TargetOutcome,
} from './transaction/owned-fast-path-planning';

export * from './transaction/contracts';

/** Detach caller-owned JSON for host companion and transaction boundaries. */
export function detachPatchMapMutationJsonValue(
  value: unknown,
  path = '$.value',
): PatchMapMutationJsonValue {
  return cloneImmutableJson(value, path);
}

interface StagedLocation {
  readonly kind: PatchMapMutationTarget['kind'];
  readonly ownerId?: string;
  readonly parent: MutableJsonValue[];
  readonly index: number;
  readonly parentElementId?: string | null;
  readonly parentAffine?: PatchMapAffineMatrix;
  readonly worldAffine?: PatchMapAffineMatrix;
  readonly locked?: boolean;
  record: MutableJsonRecord;
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
      const componentIndex = root.components.findIndex(({ id }) => id === target.id);
      const component = componentIndex < 0
        ? undefined
        : root.components[componentIndex];
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
      Object.prototype.hasOwnProperty.call(record, 'styles') &&
      (
        !Array.isArray(record.styles) ||
        record.styles.length !== record.targets.length
      )
    ) {
      transactionFail(
        'INVALID_VALUE',
        'INVALID_INPUT',
        '$.styles',
        'styles must be an ordered array matching targets length',
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
      let stylePatch: PatchMapTextStyle | undefined;
      if (Array.isArray(record.styles)) {
        try {
          stylePatch = normalizePatchMapTextStylePatch(
            record.styles[index],
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

/**
 * Preserve normalized root identity for the common one-action top-level editor
 * operations. The generic planner remains the authority for nested,
 * multi-operation, missing, or otherwise ambiguous requests.
 */
function planOwnedTopLevelStructuralTransaction(
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

function removeTarget(
  location: StagedLocation,
  operation: Extract<PatchMapMutationOperation, { readonly op: 'remove' }>,
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
  readonly target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>;
  readonly outcome: TargetOutcome;
}

interface StructuralMutationResult {
  readonly changed: boolean;
  readonly outcomes: readonly StructuralTargetOutcome[];
  readonly selectionIds?: readonly string[];
  readonly allowedElementOrderIds: readonly string[];
}

type StructuralOperation = Extract<
  PatchMapMutationOperation,
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
    target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>;
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
  const groupWorld = multiplyPatchMapAffine(parentAffine, stagedElementLocalAffine(groupRecord));
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
    const childWorld = multiplyPatchMapAffine(groupWorld, stagedElementLocalAffine(value));
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
  parent: Extract<PatchMapMutationTarget, { readonly kind: 'element' }> | null,
  operationPath: string,
  operationIndex: number,
  strict: boolean,
): Readonly<{
  readonly children: MutableJsonValue[];
  readonly parentAffine: PatchMapAffineMatrix;
}> | null {
  if (parent === null) {
    return Object.freeze({ children: dataset, parentAffine: PATCH_MAP_IDENTITY_AFFINE });
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
  target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
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
  target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
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
  target?: PatchMapMutationTarget,
): never {
  transactionFail('CONFLICT', 'CONFLICT', path, message, operationIndex, target);
}

function requireElementLocation(
  location: StagedLocation,
  target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
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
  target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>,
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
  target: PatchMapMutationTarget,
): PatchMapAffineMatrix {
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
  target: PatchMapMutationTarget,
): PatchMapAffineMatrix {
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
  worldAffine: PatchMapAffineMatrix,
  parentAffine: PatchMapAffineMatrix,
  operationPath: string,
  operationIndex: number,
  target: PatchMapMutationTarget,
): void {
  let local: PatchMapAffineMatrix;
  try {
    local = multiplyPatchMapAffine(invertPatchMapAffine(parentAffine), worldAffine);
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

function stagedElementLocalAffine(record: MutableJsonRecord): PatchMapAffineMatrix {
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
  return createPatchMapAffine(x, y, angle, scaleX, scaleY);
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
): Extract<PatchMapMutationTarget, { readonly kind: 'element' }> {
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
    PATCH_MAP_IDENTITY_AFFINE,
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
  parentAffine: PatchMapAffineMatrix,
  ancestorLocked: boolean,
): void {
  if (!isMutableJsonRecord(value)) return;
  const id = value.id;
  if (typeof id !== 'string') return;
  const worldAffine = multiplyPatchMapAffine(parentAffine, stagedElementLocalAffine(value));
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
  target: PatchMapMutationTarget,
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
