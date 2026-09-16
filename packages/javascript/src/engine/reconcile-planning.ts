import type { PatchMapDirectBarHeightUpdate } from '../core/contracts';
import {
  ownedPatchMapExactPatchIndices,
  ownedPatchMapPreviewPatchIndices,
  type NormalizedPatchMapElement,
} from '../semantic/dataset';
import type {
  PatchMapMutationOperation,
  PatchMapPlannedBarHeightUpdate,
} from '../semantic/transaction';
import { sameStringArray } from '../shared/string-array-values';
import {
  componentSemanticKey,
  indexComponentSemantics,
  indexTextSemantics,
  reconcileFlatComponentSemantics,
  reconcileFlatTextSemantics,
  reconcileStructuralComponentSemantics,
  reconcileStructuralTextSemantics,
  type IndexedEngineTextSemantic,
  type PatchMapEngineComponentSemanticProbe,
  type PatchMapOwnedStructuralRootDelta,
} from './semantic-index';

export interface PatchMapHistoryReconcileOrderScope {
  readonly allowedElementOrderIds: readonly string[];
  readonly allowedComponentOrderOwners: readonly string[];
}

interface PatchMapHistoryOrderIndex {
  readonly elementIdsByParent: ReadonlyMap<string | null, readonly string[]>;
  readonly componentIdsByOwner: ReadonlyMap<string, readonly string[]>;
}

const EMPTY_HISTORY_ORDER_IDS = Object.freeze([] as string[]);
const INCREMENTAL_FLAT_ROOT_TYPES = new Set([
  'item',
  'rect',
  'image',
  'text',
]);

export function reconcileComponentSemantics(
  current: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
  currentDataset: readonly NormalizedPatchMapElement[],
  candidateDataset: readonly NormalizedPatchMapElement[],
  incrementalRootIds: readonly string[] | undefined,
  structuralRootDelta: PatchMapOwnedStructuralRootDelta | null,
): ReadonlyMap<string, PatchMapEngineComponentSemanticProbe> {
  return incrementalRootIds === undefined
    ? structuralRootDelta === null
      ? indexComponentSemantics(candidateDataset)
      : reconcileStructuralComponentSemantics(current, structuralRootDelta)
    : reconcileFlatComponentSemantics(
        current,
        currentDataset,
        candidateDataset,
        incrementalRootIds,
      );
}

export function reconcileTextSemantics(
  current: ReadonlyMap<string, IndexedEngineTextSemantic>,
  currentDataset: readonly NormalizedPatchMapElement[],
  candidateDataset: readonly NormalizedPatchMapElement[],
  incrementalRootIds: readonly string[] | undefined,
  structuralRootDelta: PatchMapOwnedStructuralRootDelta | null,
): ReadonlyMap<string, IndexedEngineTextSemantic> {
  return incrementalRootIds === undefined
    ? structuralRootDelta === null
      ? indexTextSemantics(candidateDataset)
      : reconcileStructuralTextSemantics(current, structuralRootDelta)
    : reconcileFlatTextSemantics(
        current,
        currentDataset,
        candidateDataset,
        incrementalRootIds,
      );
}

export function historyReconcileOrderScope(
  beforeDataset: readonly NormalizedPatchMapElement[],
  afterDataset: readonly NormalizedPatchMapElement[],
): PatchMapHistoryReconcileOrderScope {
  const allowedElementOrderIds = new Set<string>();
  const allowedComponentOrderOwners = new Set<string>();

  // History reconciles directly between grouped command boundaries rather than
  // replaying each accepted record. Comparing those two boundaries once keeps
  // the authorization exact without multiplying work by a gesture's record count.
  const before = indexHistoryOrders(beforeDataset);
  const after = indexHistoryOrders(afterDataset);
  const parentIds = new Set([
    ...before.elementIdsByParent.keys(),
    ...after.elementIdsByParent.keys(),
  ]);
  for (const parentId of parentIds) {
    const beforeIds = before.elementIdsByParent.get(parentId) ?? EMPTY_HISTORY_ORDER_IDS;
    const afterIds = after.elementIdsByParent.get(parentId) ?? EMPTY_HISTORY_ORDER_IDS;
    if (sameStringArray(beforeIds, afterIds)) continue;
    beforeIds.forEach((id) => allowedElementOrderIds.add(id));
    afterIds.forEach((id) => allowedElementOrderIds.add(id));
  }

  const ownerIds = new Set([
    ...before.componentIdsByOwner.keys(),
    ...after.componentIdsByOwner.keys(),
  ]);
  for (const ownerId of ownerIds) {
    const beforeIds = before.componentIdsByOwner.get(ownerId) ?? EMPTY_HISTORY_ORDER_IDS;
    const afterIds = after.componentIdsByOwner.get(ownerId) ?? EMPTY_HISTORY_ORDER_IDS;
    if (!sameStringArray(beforeIds, afterIds)) {
      allowedComponentOrderOwners.add(ownerId);
    }
  }

  return Object.freeze({
    allowedElementOrderIds: Object.freeze([...allowedElementOrderIds].sort()),
    allowedComponentOrderOwners: Object.freeze([...allowedComponentOrderOwners].sort()),
  });
}

export function directAnimatedBarTargets(
  operations: readonly PatchMapMutationOperation[],
  componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
): readonly Readonly<{ readonly ownerId: string; readonly componentId: string }>[] {
  const targets = new Map<string, Readonly<{ ownerId: string; componentId: string }>>();
  for (const operation of operations) {
    if (operation.op !== 'merge' || operation.target.kind !== 'component') continue;
    if (!operation.changes.some((change) => change.path[0] === 'size')) continue;
    const key = componentSemanticKey(operation.target.ownerId, operation.target.id);
    if (componentSemantics.get(key)?.componentType !== 'bar') continue;
    const target = Object.freeze({
      ownerId: operation.target.ownerId,
      componentId: operation.target.id,
    });
    targets.set(key, target);
  }
  return Object.freeze([...targets.values()]);
}

export function operationsOnlyUpdateBarSize(
  operations: readonly PatchMapMutationOperation[],
  componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
): boolean {
  return operations.length > 0 && operations.every((operation) => {
    if (
      operation.op !== 'merge' ||
      operation.target.kind !== 'component' ||
      operation.changes.length === 0 ||
      operation.changes.some((change) => change.path[0] !== 'size')
    ) {
      return false;
    }
    return componentSemantics.get(
      componentSemanticKey(operation.target.ownerId, operation.target.id),
    )?.componentType === 'bar';
  });
}

export function directBarHeightUpdatesFor(
  operations: readonly PatchMapMutationOperation[],
  componentSemantics: ReadonlyMap<string, PatchMapEngineComponentSemanticProbe>,
): readonly PatchMapDirectBarHeightUpdate[] | undefined {
  if (operations.length === 0) return undefined;
  const updates = new Map<string, PatchMapDirectBarHeightUpdate>();
  for (const operation of operations) {
    if (
      operation.op !== 'merge' ||
      operation.target.kind !== 'component' ||
      operation.changes.length !== 1
    ) {
      return undefined;
    }
    const [change] = operation.changes;
    if (
      change === undefined ||
      change.path.length !== 2 ||
      change.path[0] !== 'size' ||
      change.path[1] !== 'height'
    ) {
      return undefined;
    }
    const key = componentSemanticKey(operation.target.ownerId, operation.target.id);
    const semantic = componentSemantics.get(key);
    const size = semantic?.authoredSize;
    const height = typeof size === 'object' &&
      size !== null &&
      'height' in size
      ? size.height
      : undefined;
    if (
      semantic?.componentType !== 'bar' ||
      typeof height !== 'number' ||
      !Number.isFinite(height) ||
      height < 0
    ) {
      return undefined;
    }
    updates.set(key, Object.freeze({
      ownerId: operation.target.ownerId,
      componentId: operation.target.id,
      height,
    }));
  }
  return Object.freeze([...updates.values()]);
}

export function componentOrderOwners(
  operations: readonly PatchMapMutationOperation[],
): readonly string[] {
  return Object.freeze([...new Set(
    operations
      .filter((operation) => operation.op === 'reconcile-components')
      .map((operation) => operation.target.id),
  )]);
}

export function operationsMayChangeElementStructure(
  operations: readonly PatchMapMutationOperation[],
): boolean {
  return operations.some((operation) => {
    switch (operation.op) {
      case 'add':
      case 'move':
      case 'group':
      case 'ungroup':
        return true;
      case 'remove':
        return operation.target.kind === 'element';
      default:
        return false;
    }
  });
}

export function operationsOnlyUpdateElementGeometry(
  operations: readonly PatchMapMutationOperation[],
): boolean {
  if (operations.length === 0) return false;
  return operations.every((operation) => (
    operation.op === 'merge' &&
    operation.target.kind === 'element' &&
    operation.changes.length > 0 &&
    operation.changes.every((change) => {
      if (change.path.length !== 2) return false;
      const [domain, field] = change.path;
      return (
        domain === 'attrs' &&
        (field === 'x' || field === 'y' || field === 'angle' || field === 'rotation')
      ) || (
        domain === 'size' &&
        (field === 'width' || field === 'height')
      );
    })
  ));
}

export function incrementalOwnedRootIds(
  current: readonly NormalizedPatchMapElement[],
  candidate: readonly NormalizedPatchMapElement[],
): readonly string[] | undefined {
  if (current.length === 0 || current.length !== candidate.length) {
    return undefined;
  }
  const exactDirtyIndices = ownedPatchMapExactPatchIndices(candidate, current);
  if (exactDirtyIndices !== null) {
    if (exactDirtyIndices.length === 0) return undefined;
    const dirty: string[] = [];
    for (const index of exactDirtyIndices) {
      const before = current[index];
      const after = candidate[index];
      if (
        before === undefined ||
        after === undefined ||
        before.id !== after.id ||
        before.type !== after.type ||
        !INCREMENTAL_FLAT_ROOT_TYPES.has(after.type)
      ) {
        return undefined;
      }
      dirty.push(after.id);
    }
    return Object.freeze(dirty);
  }
  const dirty: string[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < candidate.length; index += 1) {
    const before = current[index];
    const after = candidate[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.type !== after.type ||
      ids.has(after.id)
    ) {
      return undefined;
    }
    ids.add(after.id);
    if (before === after) continue;
    if (!INCREMENTAL_FLAT_ROOT_TYPES.has(after.type)) return undefined;
    dirty.push(after.id);
  }
  return dirty.length === 0 ? undefined : Object.freeze(dirty);
}

export function incrementalFlatRootIds(
  current: readonly NormalizedPatchMapElement[],
  candidate: readonly NormalizedPatchMapElement[],
  operations: readonly PatchMapMutationOperation[],
): readonly string[] | undefined {
  if (
    current.length === 0 ||
    current.length !== candidate.length ||
    operations.length === 0
  ) {
    return undefined;
  }
  const sparseDirtyIndices =
    ownedPatchMapExactPatchIndices(candidate, current) ??
    ownedPatchMapPreviewPatchIndices(candidate, current);
  if (sparseDirtyIndices !== null) {
    const dirty = new Set<string>();
    for (const operation of operations) {
      if (operation.op !== 'merge') return undefined;
      dirty.add(
        operation.target.kind === 'element'
          ? operation.target.id
          : operation.target.ownerId,
      );
    }
    const ordered: string[] = [];
    for (const index of sparseDirtyIndices) {
      const before = current[index];
      const after = candidate[index];
      if (
        before === undefined ||
        after === undefined ||
        before.id !== after.id ||
        before.type !== after.type ||
        !dirty.delete(after.id) ||
        !INCREMENTAL_FLAT_ROOT_TYPES.has(after.type)
      ) {
        return undefined;
      }
      ordered.push(after.id);
    }
    return dirty.size === 0 && ordered.length > 0
      ? Object.freeze(ordered)
      : undefined;
  }
  const rootOrder = new Map<string, number>();
  for (let index = 0; index < candidate.length; index += 1) {
    const before = current[index];
    const after = candidate[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.type !== after.type ||
      rootOrder.has(after.id)
    ) {
      return undefined;
    }
    rootOrder.set(after.id, index);
  }

  const dirty = new Set<string>();
  for (const operation of operations) {
    if (operation.op !== 'merge') return undefined;
    const rootId = operation.target.kind === 'element'
      ? operation.target.id
      : operation.target.ownerId;
    if (!rootOrder.has(rootId)) return undefined;
    dirty.add(rootId);
  }
  if (dirty.size === 0) return undefined;
  for (const rootId of dirty) {
    const index = rootOrder.get(rootId);
    const root = index === undefined ? undefined : candidate[index];
    if (root === undefined || !INCREMENTAL_FLAT_ROOT_TYPES.has(root.type)) {
      return undefined;
    }
  }
  return Object.freeze(
    [...dirty].sort((left, right) => rootOrder.get(left)! - rootOrder.get(right)!),
  );
}

export function incrementalBarHeightRootIds(
  current: readonly NormalizedPatchMapElement[],
  candidate: readonly NormalizedPatchMapElement[],
  updates: readonly PatchMapPlannedBarHeightUpdate[],
): readonly string[] | undefined {
  if (
    current.length === 0 ||
    current.length !== candidate.length ||
    updates.length === 0
  ) {
    return undefined;
  }
  const exactDirtyIndices = ownedPatchMapExactPatchIndices(candidate, current);
  if (exactDirtyIndices !== null) {
    const updateOwnerIds = new Set(updates.map(({ ownerId }) => ownerId));
    const dirty: string[] = [];
    for (const index of exactDirtyIndices) {
      const before = current[index];
      const after = candidate[index];
      if (
        before === undefined ||
        (after?.type !== 'item' && after?.type !== 'grid') ||
        before.id !== after.id ||
        before.type !== after.type ||
        !updateOwnerIds.delete(after.id)
      ) {
        return undefined;
      }
      dirty.push(after.id);
    }
    if (updateOwnerIds.size === 0) return Object.freeze(dirty);
  }
  const rootOrder = new Map<string, number>();
  for (let index = 0; index < candidate.length; index += 1) {
    const before = current[index];
    const after = candidate[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.type !== after.type ||
      rootOrder.has(after.id)
    ) {
      return undefined;
    }
    rootOrder.set(after.id, index);
  }
  const dirty = new Set<string>();
  for (const update of updates) {
    const index = rootOrder.get(update.ownerId);
    const root = index === undefined ? undefined : candidate[index];
    if (root?.type !== 'item' && root?.type !== 'grid') return undefined;
    dirty.add(update.ownerId);
  }
  return Object.freeze(
    [...dirty].sort((left, right) => rootOrder.get(left)! - rootOrder.get(right)!),
  );
}

function indexHistoryOrders(
  dataset: readonly NormalizedPatchMapElement[],
): PatchMapHistoryOrderIndex {
  const elementIdsByParent = new Map<string | null, readonly string[]>();
  const componentIdsByOwner = new Map<string, readonly string[]>();
  const visit = (
    elements: readonly NormalizedPatchMapElement[],
    parentId: string | null,
  ): void => {
    elementIdsByParent.set(
      parentId,
      Object.freeze(elements.map((element) => element.id)),
    );
    for (const element of elements) {
      if (element.type === 'group') visit(element.children, element.id);
      if (element.type === 'item') {
        componentIdsByOwner.set(
          element.id,
          Object.freeze(element.components.map((component) => component.id)),
        );
      } else if (element.type === 'grid') {
        componentIdsByOwner.set(
          element.id,
          Object.freeze(element.item.components.map((component) => component.id)),
        );
      }
    }
  };
  visit(dataset, null);
  return Object.freeze({ elementIdsByParent, componentIdsByOwner });
}
