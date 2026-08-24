import {
  assembleOwnedPatchMapDataset,
  assembleOwnedPatchMapSparsePreviewDataset,
  PatchMapDatasetError,
  materializePatchMapDataset,
  replaceOwnedPatchMapBarHeightRoot,
  replaceOwnedPatchMapElementAngleRoot,
  type MaterializedPatchMapDataset,
  type PatchMapElement,
} from '../dataset';
import {
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  type PatchMapMutationPathChange,
  type PatchMapMutationPathSegment,
  type PatchMapMutationTarget,
  type PatchMapMutationTransactionDiagnostic,
  type PatchMapMutationTransactionPlan,
  type PatchMapMutationTransactionSummary,
  type PatchMapPlannedElementAngleUpdate,
} from './contracts';
import {
  TransactionValidationFailure,
  transactionFail,
} from './diagnostics';
import {
  cloneMutableJson,
  defineMutableProperty,
  isMutableJsonRecord,
  jsonEquivalent,
  requireRecordValue,
  type MutableJsonRecord,
  type MutableJsonValue,
} from './json-values';
import {
  requireAt,
  targetKey,
  type NormalizedTransaction,
} from './request-normalization';

export type TargetOutcome = 'missing' | 'unchanged' | 'applied';

export interface TargetJournalEntry {
  readonly target: PatchMapMutationTarget;
  outcome: TargetOutcome;
}

export const EMPTY_TRANSACTION_TARGETS: readonly [] = Object.freeze([]);

const FAST_FLAT_ROOT_TYPES = new Set([
  'item',
  'rect',
  'image',
  'text',
]);
const OWNED_ROOT_INDEX_CACHE = new WeakMap<
  readonly PatchMapElement[],
  ReadonlyMap<string, number> | null
>();

export function planOwnedElementAngleTransaction(
  current: MaterializedPatchMapDataset,
  request: NormalizedTransaction,
): PatchMapMutationTransactionPlan | null {
  if (current.dataset.length === 0 || request.operations.length === 0) return null;
  const rootIndexById = ownedRootIndexById(current.dataset);
  if (rootIndexById === null) return null;
  const roots: PatchMapElement[] = [...current.dataset];
  const applied: PatchMapMutationTarget[] = [];
  const unchanged: PatchMapMutationTarget[] = [];
  const directUpdates: PatchMapPlannedElementAngleUpdate[] = [];
  const seen = new Set<string>();

  for (const operation of request.operations) {
    if (
      operation.op !== 'merge' ||
      operation.target.kind !== 'element' ||
      operation.changes.length !== 1
    ) {
      return null;
    }
    const change = operation.changes[0];
    if (
      change === undefined ||
      change.path.length !== 2 ||
      change.path[0] !== 'attrs' ||
      change.path[1] !== 'angle' ||
      typeof change.value !== 'number' ||
      !Number.isFinite(change.value) ||
      seen.has(operation.target.id)
    ) {
      return null;
    }
    seen.add(operation.target.id);
    const rootIndex = rootIndexById.get(operation.target.id);
    const root = rootIndex === undefined ? undefined : roots[rootIndex];
    if (
      rootIndex === undefined ||
      root === undefined ||
      !FAST_FLAT_ROOT_TYPES.has(root.type) ||
      (
        root.attrs !== undefined &&
        Object.hasOwn(root.attrs, 'rotation')
      )
    ) {
      return null;
    }
    if (
      root.attrs !== undefined &&
      Object.hasOwn(root.attrs, 'angle') &&
      root.attrs.angle === change.value
    ) {
      unchanged.push(operation.target);
      continue;
    }
    const replacement = replaceOwnedPatchMapElementAngleRoot(
      root,
      change.value,
    );
    if (replacement === null) return null;
    roots[rootIndex] = replacement;
    applied.push(operation.target);
    directUpdates.push(Object.freeze({
      id: operation.target.id,
      angle: change.value,
    }));
  }

  const candidate = applied.length === 0
    ? current
    : assembleOwnedPatchMapDataset(current, roots);
  const frozenApplied = Object.freeze(applied);
  const frozenUnchanged = Object.freeze(unchanged);
  return Object.freeze({
    status: 'planned',
    changed: frozenApplied.length > 0,
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
    candidate,
    applied: frozenApplied,
    missing: EMPTY_TRANSACTION_TARGETS,
    unchanged: frozenUnchanged,
    directElementAngleUpdates: Object.freeze(directUpdates),
    summary: freezeTransactionSummary(frozenApplied.length, 0, frozenUnchanged.length),
  });
}

export function planOwnedBarHeightTransaction(
  current: MaterializedPatchMapDataset,
  request: NormalizedTransaction,
): PatchMapMutationTransactionPlan | null {
  if (current.dataset.length === 0 || request.operations.length === 0) return null;
  const rootIndexById = new Map(
    current.dataset.map((root, index) => [root.id, index] as const),
  );
  if (rootIndexById.size !== current.dataset.length) return null;
  const roots: PatchMapElement[] = [...current.dataset];
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
    if (
      rootIndex === undefined ||
      (root?.type !== 'item' && root?.type !== 'grid')
    ) return null;
    const rootComponents = root.type === 'item'
      ? root.components
      : root.item.components;
    const matches = rootComponents.filter(({ id }) => id === operation.target.id);
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
      noteTargetOutcome(journal, operation.target, 'unchanged');
      continue;
    }
    const replacement = replaceOwnedPatchMapBarHeightRoot(
      root,
      operation.target.id,
      change.value,
    );
    if (replacement === null) return null;
    roots[rootIndex] = replacement;
    changed = true;
    noteTargetOutcome(journal, operation.target, 'applied');
  }

  const candidate = changed
    ? assembleOwnedPatchMapDataset(current, roots)
    : current;
  const applied = journalTargets(journal, 'applied');
  const missing = journalTargets(journal, 'missing');
  const unchanged = journalTargets(journal, 'unchanged');
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
    candidate,
    applied,
    missing,
    unchanged,
    summary: freezeTransactionSummary(applied.length, missing.length, unchanged.length),
  });
}

/**
 * Structural-share the common flat merge candidate. Validation, missing
 * targets, hierarchy, identity/type edits, or large whole-scene writes fall
 * back to the canonical generic transaction planner.
 */
export function planFlatOwnedMergeTransaction(
  current: MaterializedPatchMapDataset,
  request: NormalizedTransaction,
  preview = false,
): PatchMapMutationTransactionPlan | null {
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
        applyPatchMapMutationPathChange(
          target,
          change,
          `$.operations[${operationIndex}]`,
          operationIndex,
          operation.target,
        );
      }
      noteTargetOutcome(
        journal,
        operation.target,
        jsonEquivalent(before, target) ? 'unchanged' : 'applied',
      );
    }
  } catch (error) {
    if (!(error instanceof TransactionValidationFailure)) throw error;
    return rejectedTransactionPlan(error.diagnostic, request.actionId);
  }

  const roots: PatchMapElement[] = [...current.dataset];
  const dirtyEntries = [...mutableRoots.entries()];
  let normalizedDirtyRoots: readonly PatchMapElement[];
  try {
    normalizedDirtyRoots = materializePatchMapDataset(
      dirtyEntries.map(([, root]) => root),
    ).dataset;
    if (normalizedDirtyRoots.length !== dirtyEntries.length) return null;
    for (let index = 0; index < dirtyEntries.length; index += 1) {
      const entry = dirtyEntries[index];
      const normalized = normalizedDirtyRoots[index];
      if (entry === undefined || normalized === undefined) return null;
      roots[entry[0]] = normalized;
    }
  } catch (error) {
    if (error instanceof PatchMapDatasetError) return null;
    throw error;
  }
  const candidate = preview
    ? assembleOwnedPatchMapSparsePreviewDataset(
        current,
        dirtyEntries.map(([rootIndex], index) => Object.freeze({
          index: rootIndex,
          root: normalizedDirtyRoots[index]!,
        })),
      )
    : assembleOwnedPatchMapDataset(current, roots);
  const applied = journalTargets(journal, 'applied');
  const missing = journalTargets(journal, 'missing');
  const unchanged = journalTargets(journal, 'unchanged');
  const changed = [...mutableRoots.keys()].some((rootIndex) =>
    !jsonEquivalent(current.dataset[rootIndex], candidate.dataset[rootIndex]));

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
    candidate,
    applied,
    missing,
    unchanged,
    summary: freezeTransactionSummary(applied.length, missing.length, unchanged.length),
  });
}

export function ownedRootIndexById(
  dataset: readonly PatchMapElement[],
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

export function applyPatchMapMutationPathChange(
  target: MutableJsonRecord,
  change: PatchMapMutationPathChange,
  operationPath: string,
  operationIndex: number,
  logicalTarget: PatchMapMutationTarget,
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

export function noteTargetOutcome(
  journal: Map<string, TargetJournalEntry>,
  target: PatchMapMutationTarget,
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

export function journalTargets(
  journal: ReadonlyMap<string, TargetJournalEntry>,
  outcome: TargetOutcome,
): readonly PatchMapMutationTarget[] {
  return Object.freeze(
    [...journal.values()].filter((entry) => entry.outcome === outcome).map((entry) => entry.target),
  );
}

export function freezeTransactionSummary(
  appliedCount: number,
  missingCount: number,
  unchangedCount: number,
): PatchMapMutationTransactionSummary {
  return Object.freeze({ appliedCount, missingCount, unchangedCount });
}

export function rejectedTransactionPlan(
  mutationDiagnostic: PatchMapMutationTransactionDiagnostic,
  actionId?: string,
): Extract<PatchMapMutationTransactionPlan, { readonly status: 'rejected' }> {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    schemaRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
    ...(actionId === undefined ? {} : { actionId }),
    candidate: null,
    applied: EMPTY_TRANSACTION_TARGETS,
    missing: EMPTY_TRANSACTION_TARGETS,
    unchanged: EMPTY_TRANSACTION_TARGETS,
    summary: freezeTransactionSummary(0, 0, 0),
    diagnostic: mutationDiagnostic,
  });
}

function fastFlatMergePathSupported(
  target: PatchMapMutationTarget,
  path: readonly PatchMapMutationPathSegment[],
): boolean {
  const root = path[0];
  if (typeof root !== 'string' || root === 'id' || root === 'type') return false;
  return target.kind === 'component' ||
    !['children', 'components', 'item', 'cells', 'links'].includes(root);
}

function flatRootTarget(
  root: MutableJsonRecord,
  target: PatchMapMutationTarget,
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

function invalidAppliedPath(
  operationPath: string,
  operationIndex: number,
  target: PatchMapMutationTarget,
  path: readonly PatchMapMutationPathSegment[],
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
