import type { NormalizedPatchMapElement } from '../semantic/dataset';
import { isPlainRecord } from '../shared/plain-record';
import { sameStringArray } from '../shared/string-array-values';
import {
  invertPatchMapAffine,
  type PatchMapAffineMatrix,
  type PatchMapPointTuple,
} from '../semantic/geometry';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationOperation,
} from '../semantic/transaction';
import type {
  PatchMapAuthoringAction,
  PatchMapAuthoringPlan,
  PatchMapAuthoringPlanningContext,
} from './contracts';
import { fail, isJsonRecord } from './normalization';
import {
  elementTarget,
  facts,
  plannedPlan,
  unchangedPlan,
  uniqueTargetIds,
} from './plan-results';
import {
  assertUnlocked,
  isDescendant,
  optionalFinite,
  requireLocation,
  roundSix,
  type AuthoringElementLocation,
} from './scene-context';

type MutableJsonValue =
  | null
  | string
  | number
  | boolean
  | MutableJsonValue[]
  | MutableJsonRecord;
type MutableJsonRecord = { [key: string]: MutableJsonValue };

export function planHierarchyMove(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'move-hierarchy' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
  context: PatchMapAuthoringPlanningContext,
): PatchMapAuthoringPlan {
  const source = requireLocation(index, action.target, ['target']);
  assertUnlocked(source, ['target']);
  if (action.parentId === action.target) {
    fail('INVALID_MUTATION', ['parentId'], 'Hierarchy target cannot parent itself');
  }
  if (action.parentId !== null) {
    const parent = requireLocation(index, action.parentId, ['parentId']);
    assertUnlocked(parent, ['parentId']);
    if (parent.element.type !== 'group') {
      fail(
        'INVALID_MUTATION',
        ['parentId'],
        'PatchMap hierarchy parents must be group elements',
      );
    }
    if (isDescendant(index, action.parentId, action.target)) {
      fail('INVALID_MUTATION', ['parentId'], 'Hierarchy move would create a cycle');
    }
    if (action.index > parent.element.children.length) {
      fail('INVALID_VALUE', ['index'], 'Hierarchy insertion index is out of range');
    }
  }
  const rootLength = [...index.values()].filter(({ parentId }) => parentId === null).length;
  if (action.parentId === null && action.index > rootLength) {
    fail('INVALID_VALUE', ['index'], 'Root hierarchy insertion index is out of range');
  }
  const operation: PatchMapMutationOperation = Object.freeze({
    op: 'move',
    target: elementTarget(action.target),
    parent: action.parentId === null ? null : elementTarget(action.parentId),
    index: action.index,
  });
  return plannedPlan(
    action,
    [operation],
    context.selectionIds,
    facts({ movedTarget: action.target, parentId: action.parentId, index: action.index }),
  );
}

export function planReorder(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'reorder-z' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const requested = uniqueTargetIds(action.targets, 1);
  const locations = requested.map((id) => {
    const location = requireLocation(index, id, ['targets']);
    assertUnlocked(location, ['targets']);
    return location;
  });
  const parentId = locations[0]!.parentId;
  if (locations.some((location) => location.parentId !== parentId)) {
    fail('INVALID_MUTATION', ['targets'], 'Z-order targets must share one parent');
  }
  const siblings = locations[0]!.siblings.map(({ id }) => id);
  const selected = new Set(requested);
  const orderedTargets = siblings.filter((id) => selected.has(id));
  if (orderedTargets.length !== requested.length) {
    fail('MISSING_TARGET', ['targets'], 'Z-order target disappeared from its parent');
  }
  const remaining = siblings.filter((id) => !selected.has(id));
  const desired = action.placement === 'front'
    ? [...remaining, ...orderedTargets]
    : [...orderedTargets, ...remaining];
  const resultFacts = facts({ orderedIds: orderedTargets, placement: action.placement });
  if (sameStringArray(siblings, desired)) return unchangedPlan(action, resultFacts);
  const parent = parentId === null ? null : elementTarget(parentId);
  const operations: PatchMapMutationOperation[] = action.placement === 'front'
    ? orderedTargets.map((id) => Object.freeze({
        op: 'move' as const,
        target: elementTarget(id),
        parent,
        index: siblings.length,
      }))
    : [...orderedTargets].reverse().map((id) => Object.freeze({
        op: 'move' as const,
        target: elementTarget(id),
        parent,
        index: 0,
      }));
  return plannedPlan(action, operations, orderedTargets, resultFacts);
}

export function planGroup(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'group-targets' }>,
): PatchMapAuthoringPlan {
  uniqueTargetIds(action.targets, 1);
  const operation: PatchMapMutationOperation = Object.freeze({
    op: 'group',
    targets: Object.freeze(action.targets.map(elementTarget)),
    value: Object.freeze({
      type: 'group',
      id: action.groupId,
      attrs: Object.freeze({ x: 0, y: 0 }),
    }),
  });
  return plannedPlan(
    action,
    [operation],
    [action.groupId],
    facts({ groupId: action.groupId, groupedIds: action.targets }),
  );
}

export function planDuplicate(
  action: Extract<
    PatchMapAuthoringAction,
    { readonly type: 'duplicate-tree' | 'copy-paste-tree' }
  >,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const source = requireLocation(index, action.target, ['target']);
  assertUnlocked(source, ['target']);
  const idMap = buildDuplicateIdMap(source.element, action.rootId);
  const clone = cloneElementTree(source.element, idMap);
  offsetClonedRoot(clone, source.parentAffine, action.offsetWorld);
  const frozenClone = detachPatchMapMutationJsonValue(clone, '$.duplicate');
  if (!isJsonRecord(frozenClone)) throw new Error('Detached duplicate lost record shape');
  const parent = source.parentId === null ? null : elementTarget(source.parentId);
  const operation: PatchMapMutationOperation = Object.freeze({
    op: 'add',
    parent,
    collection: 'children',
    index: source.index + 1,
    value: frozenClone,
  });
  return plannedPlan(
    action,
    [operation],
    [action.rootId],
    facts({
      rootId: action.rootId,
      sourceId: action.target,
      idMap: Object.fromEntries(idMap),
      internalReferencesRewritten: true,
      externalReferencesPreserved: true,
      offsetWorld: action.offsetWorld,
    }),
  );
}

export function planUngroup(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'ungroup-target' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
  context: PatchMapAuthoringPlanningContext,
): PatchMapAuthoringPlan {
  const location = requireLocation(index, action.target, ['target']);
  assertUnlocked(location, ['target']);
  if (location.element.type !== 'group') {
    fail('INVALID_MUTATION', ['target'], 'Ungroup target must be a group element');
  }
  const childIds = location.element.children.map(({ id }) => id);
  const selectedIds = context.selectionIds.includes(action.target)
    ? childIds
    : context.selectionIds;
  const operation: PatchMapMutationOperation = Object.freeze({
    op: 'ungroup',
    target: elementTarget(action.target),
    relationPolicy: 'reject',
  });
  return plannedPlan(
    action,
    [operation],
    selectedIds,
    facts({ ungroupedId: action.target, childIds }),
  );
}

function buildDuplicateIdMap(
  root: NormalizedPatchMapElement,
  rootId: string,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const visit = (element: NormalizedPatchMapElement, isRoot: boolean): void => {
    result.set(element.id, isRoot ? rootId : `${rootId}/${element.id}`);
    if (element.type === 'group') {
      element.children.forEach((child) => visit(child, false));
    }
  };
  visit(root, true);
  return result;
}

function cloneElementTree(
  root: NormalizedPatchMapElement,
  idMap: ReadonlyMap<string, string>,
): MutableJsonRecord {
  const clone = cloneMutableJson(root);
  if (!isMutableRecord(clone)) throw new Error('Duplicate root lost record shape');
  rewriteClonedElement(clone, idMap);
  return clone;
}

function rewriteClonedElement(
  element: MutableJsonRecord,
  idMap: ReadonlyMap<string, string>,
): void {
  const sourceId = element.id;
  if (typeof sourceId !== 'string') throw new Error('Duplicate source element lost its ID');
  const targetId = idMap.get(sourceId);
  if (targetId === undefined) throw new Error(`Duplicate ID map omitted ${sourceId}`);
  element.id = targetId;
  if (element.type === 'group') {
    const children = element.children;
    if (!Array.isArray(children)) throw new Error('Duplicate group lost its children');
    for (const child of children) {
      if (!isMutableRecord(child)) throw new Error('Duplicate child lost record shape');
      rewriteClonedElement(child, idMap);
    }
  }
  if (element.type === 'relations') {
    const links = element.links;
    if (!Array.isArray(links)) throw new Error('Duplicate relations lost their links');
    for (const link of links) {
      if (!isMutableRecord(link)) throw new Error('Duplicate relation link lost record shape');
      if (typeof link.source === 'string' && idMap.has(link.source)) {
        link.source = idMap.get(link.source)!;
      }
      if (typeof link.target === 'string' && idMap.has(link.target)) {
        link.target = idMap.get(link.target)!;
      }
    }
  }
}

function offsetClonedRoot(
  root: MutableJsonRecord,
  parentAffine: PatchMapAffineMatrix,
  offsetWorld: PatchMapPointTuple,
): void {
  const inverse = invertPatchMapAffine(parentAffine);
  const offsetLocal = Object.freeze([
    inverse[0] * offsetWorld[0] + inverse[2] * offsetWorld[1],
    inverse[1] * offsetWorld[0] + inverse[3] * offsetWorld[1],
  ] as const);
  const attrs = isMutableRecord(root.attrs) ? root.attrs : {};
  attrs.x = roundSix(optionalFinite(attrs.x, 0) + offsetLocal[0]);
  attrs.y = roundSix(optionalFinite(attrs.y, 0) + offsetLocal[1]);
  root.attrs = attrs;
}

function cloneMutableJson(value: unknown): MutableJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Authoring clone contains a non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneMutableJson);
  if (isPlainRecord(value)) {
    const result: MutableJsonRecord = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = cloneMutableJson(nested);
    }
    return result;
  }
  throw new TypeError('Authoring clone accepts JSON values only');
}

function isMutableRecord(value: MutableJsonValue | undefined): value is MutableJsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
