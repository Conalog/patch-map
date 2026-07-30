import {
  PATCH_MAP_ELEMENT_TYPES,
  type PatchMapElementType,
  type MaterializedPatchMapDataset,
  type NormalizedPatchMapElement,
} from './semantic/dataset';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  applyPatchMapAffine,
  patchMapAffineCorners,
  createPatchMapAffine,
  invertPatchMapAffine,
  multiplyPatchMapAffine,
  type PatchMapAffineMatrix,
  type PatchMapBoundsTuple,
  type PatchMapPointTuple,
} from './semantic/geometry';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationTransactionRequest,
} from './semantic/transaction';

export const PATCH_MAP_AUTHORING_REVISION = 'core-v2-authoring/1' as const;

export type PatchMapAuthoringAction =
  | Readonly<{
      readonly type: 'create-element';
      readonly kind: PatchMapElementType;
      readonly id: string;
      readonly positionWorld: PatchMapPointTuple;
      readonly parentId: string | null;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'edit-position-angle';
      readonly target: string;
      readonly x: number;
      readonly y: number;
      readonly angleDegrees: number;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'align-targets';
      readonly targets: readonly string[];
      readonly axis: PatchMapAuthoringAlignmentAxis;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'distribute-targets';
      readonly targets: readonly string[];
      readonly axis: PatchMapAuthoringDistributionAxis;
      readonly basis: 'bounds';
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'apply-style';
      readonly target: string;
      readonly changes: Readonly<Record<string, PatchMapMutationJsonValue>>;
      readonly strict: true;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'move-hierarchy';
      readonly target: string;
      readonly parentId: string | null;
      readonly index: number;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'reorder-z';
      readonly targets: readonly string[];
      readonly placement: 'front' | 'back';
      readonly preserveRelativeOrder: true;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'group-targets';
      readonly targets: readonly string[];
      readonly groupId: string;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'duplicate-tree' | 'copy-paste-tree';
      readonly target: string;
      readonly rootId: string;
      readonly offsetWorld: PatchMapPointTuple;
      readonly rewriteInternalReferences: true;
      readonly preserveExternalReferences: true;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'ungroup-target';
      readonly target: string;
      readonly actionId: string;
    }>;

export type PatchMapAuthoringActionType = PatchMapAuthoringAction['type'];
export type PatchMapAuthoringAlignmentAxis =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center-x'
  | 'center-y';
export type PatchMapAuthoringDistributionAxis = 'horizontal' | 'vertical';
export type PatchMapAuthoringDiagnosticCode =
  | 'DUPLICATE_ID'
  | 'INVALID_MUTATION'
  | 'INVALID_VALUE'
  | 'MISSING_TARGET';

export interface PatchMapAuthoringDiagnostic {
  readonly code: PatchMapAuthoringDiagnosticCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export interface PatchMapAuthoringPlanningContext {
  readonly selectionIds: readonly string[];
}

export type PatchMapAuthoringFacts = Readonly<Record<string, PatchMapMutationJsonValue>>;

interface PatchMapAuthoringPlanBase {
  readonly schemaRevision: typeof PATCH_MAP_AUTHORING_REVISION;
  readonly actionType: PatchMapAuthoringActionType | null;
  readonly action: PatchMapAuthoringAction | null;
  readonly facts: PatchMapAuthoringFacts;
}

export type PatchMapAuthoringPlan =
  | Readonly<PatchMapAuthoringPlanBase & {
      readonly status: 'planned';
      readonly changed: true;
      readonly transaction: PatchMapMutationTransactionRequest;
    }>
  | Readonly<PatchMapAuthoringPlanBase & {
      readonly status: 'unchanged';
      readonly changed: false;
      readonly transaction: null;
    }>
  | Readonly<PatchMapAuthoringPlanBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly transaction: null;
      readonly diagnostic: PatchMapAuthoringDiagnostic;
    }>;

interface AuthoringElementLocation {
  readonly element: NormalizedPatchMapElement;
  readonly parentId: string | null;
  readonly siblings: readonly NormalizedPatchMapElement[];
  readonly index: number;
  readonly parentAffine: PatchMapAffineMatrix;
  readonly worldAffine: PatchMapAffineMatrix;
  readonly ancestorLocked: boolean;
}

interface AuthoringGeometry {
  readonly location: AuthoringElementLocation;
  readonly bounds: PatchMapBoundsTuple;
}

type MutableJsonValue =
  | null
  | string
  | number
  | boolean
  | MutableJsonValue[]
  | MutableJsonRecord;
type MutableJsonRecord = { [key: string]: MutableJsonValue };

const CREATE_FIELDS = new Set([
  'type',
  'kind',
  'id',
  'positionWorld',
  'parentId',
  'actionId',
]);
const POSITION_FIELDS = new Set([
  'type',
  'target',
  'x',
  'y',
  'angleDegrees',
  'actionId',
]);
const ALIGN_FIELDS = new Set(['type', 'targets', 'axis', 'actionId']);
const DISTRIBUTE_FIELDS = new Set(['type', 'targets', 'axis', 'basis', 'actionId']);
const STYLE_FIELDS = new Set(['type', 'target', 'changes', 'strict', 'actionId']);
const MOVE_FIELDS = new Set(['type', 'target', 'parentId', 'index', 'actionId']);
const REORDER_FIELDS = new Set([
  'type',
  'targets',
  'placement',
  'preserveRelativeOrder',
  'actionId',
]);
const GROUP_FIELDS = new Set(['type', 'targets', 'groupId', 'actionId']);
const DUPLICATE_FIELDS = new Set([
  'type',
  'target',
  'rootId',
  'offsetWorld',
  'rewriteInternalReferences',
  'preserveExternalReferences',
  'actionId',
]);
const UNGROUP_FIELDS = new Set(['type', 'target', 'actionId']);
const STYLE_CHANGE_FIELDS = new Set([
  'alpha',
  'fill',
  'stroke',
  'strokeWidth',
  'cornerRadius',
  'fontSize',
  'letterSpacing',
  'lineHeight',
]);
const ELEMENT_TYPE_SET = new Set<string>(PATCH_MAP_ELEMENT_TYPES);
const ALIGNMENT_AXIS_SET = new Set<PatchMapAuthoringAlignmentAxis>([
  'left',
  'right',
  'top',
  'bottom',
  'center-x',
  'center-y',
]);
const DISTRIBUTION_AXIS_SET = new Set<PatchMapAuthoringDistributionAxis>([
  'horizontal',
  'vertical',
]);
const EMPTY_FACTS: PatchMapAuthoringFacts = Object.freeze({});

/**
 * Build one expected-blind editor action against immutable semantic authority.
 * A plan never publishes state; Engine owns transaction/history/surface commit.
 */
export function planPatchMapAuthoringAction(
  current: MaterializedPatchMapDataset,
  actionInput: unknown,
  contextInput: PatchMapAuthoringPlanningContext,
): PatchMapAuthoringPlan {
  let action: PatchMapAuthoringAction;
  let context: PatchMapAuthoringPlanningContext;
  try {
    action = normalizeAction(actionInput);
    context = normalizeContext(contextInput);
  } catch (error) {
    if (!(error instanceof AuthoringValidationFailure)) throw error;
    return rejectedPlan(null, error.diagnostic);
  }

  const index = indexAuthoringElements(current.dataset);
  try {
    switch (action.type) {
      case 'create-element':
        return planCreate(action, index, current.dataset);
      case 'edit-position-angle':
        return planPositionEdit(action, index);
      case 'align-targets':
        return planAlignment(action, index);
      case 'distribute-targets':
        return planDistribution(action, index);
      case 'apply-style':
        return planStyle(action, index);
      case 'move-hierarchy':
        return planHierarchyMove(action, index, context);
      case 'reorder-z':
        return planReorder(action, index);
      case 'group-targets':
        return planGroup(action);
      case 'duplicate-tree':
      case 'copy-paste-tree':
        return planDuplicate(action, index);
      case 'ungroup-target':
        return planUngroup(action, index, context);
    }
  } catch (error) {
    if (!(error instanceof AuthoringValidationFailure)) throw error;
    return rejectedPlan(action, error.diagnostic);
  }
}

function planCreate(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'create-element' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
  dataset: readonly NormalizedPatchMapElement[],
): PatchMapAuthoringPlan {
  if (index.has(action.id)) {
    fail('DUPLICATE_ID', ['id'], `Element ID ${action.id} already exists`);
  }
  const destination = destinationForParent(action.parentId, index, dataset);
  const parentPoint = applyPatchMapAffine(
    invertPatchMapAffine(destination.parentAffine),
    action.positionWorld,
  );
  const element = createElementRecord(action.kind, action.id, parentPoint);
  const operation: PatchMapMutationOperation = Object.freeze({
    op: 'add',
    parent: action.parentId === null
      ? null
      : Object.freeze({ kind: 'element' as const, id: action.parentId }),
    collection: 'children',
    index: destination.childCount,
    value: element,
  });
  return plannedPlan(
    action,
    [operation],
    [action.id],
    facts({
      createdId: action.id,
      kind: action.kind,
      componentIds: componentIds(element),
      positionWorld: action.positionWorld,
    }),
  );
}

function planPositionEdit(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'edit-position-angle' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const location = requireLocation(index, action.target, ['target']);
  assertUnlocked(location, ['target']);
  const attrs = location.element.attrs ?? {};
  const changes = [
    pathChangeIfDifferent(attrs.x, action.x, ['attrs', 'x']),
    pathChangeIfDifferent(attrs.y, action.y, ['attrs', 'y']),
    pathChangeIfDifferent(rotationDegrees(attrs), action.angleDegrees, ['attrs', 'angle']),
  ].filter(isPathChange);
  const target = elementTarget(action.target);
  const resultFacts = facts({
    target: action.target,
    x: action.x,
    y: action.y,
    angleDegrees: action.angleDegrees,
  });
  if (changes.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(
    action,
    [Object.freeze({ op: 'merge', target, changes: Object.freeze(changes) })],
    [action.target],
    resultFacts,
  );
}

function planAlignment(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'align-targets' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const geometries = requireGeometries(action.targets, index, 2);
  const anchor = alignmentAnchor(action.axis, geometries);
  const operations = geometries.flatMap((geometry) => {
    const delta = alignmentDelta(action.axis, geometry.bounds, anchor);
    return geometryTranslationOperation(geometry, delta);
  });
  const resultFacts = facts({
    targets: action.targets,
    axis: action.axis,
    anchor,
  });
  if (operations.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(action, operations, action.targets, resultFacts);
}

function planDistribution(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'distribute-targets' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const geometries = requireGeometries(action.targets, index, 3);
  const horizontal = action.axis === 'horizontal';
  const startIndex = horizontal ? 0 : 1;
  const sizeIndex = horizontal ? 2 : 3;
  const start = Math.min(...geometries.map(({ bounds }) => bounds[startIndex]));
  const end = Math.max(
    ...geometries.map(({ bounds }) => bounds[startIndex] + bounds[sizeIndex]),
  );
  const occupied = geometries.reduce(
    (sum, { bounds }) => sum + bounds[sizeIndex],
    0,
  );
  const gap = roundSix((end - start - occupied) / (geometries.length - 1));
  let cursor = start;
  const desiredStarts: number[] = [];
  const operations: PatchMapMutationOperation[] = [];
  for (const geometry of geometries) {
    desiredStarts.push(roundSix(cursor));
    const currentStart = geometry.bounds[startIndex];
    const delta = horizontal
      ? Object.freeze([roundSix(cursor - currentStart), 0] as const)
      : Object.freeze([0, roundSix(cursor - currentStart)] as const);
    operations.push(...geometryTranslationOperation(geometry, delta));
    cursor += geometry.bounds[sizeIndex] + gap;
  }
  const digest = authoringFingerprint({
    axis: action.axis,
    targets: action.targets,
    starts: desiredStarts,
    gap,
  });
  const resultFacts = facts({
    targets: action.targets,
    axis: action.axis,
    gap,
    desiredStarts,
    distributionDigest: digest,
  });
  if (operations.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(action, operations, action.targets, resultFacts);
}

function planStyle(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'apply-style' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const location = requireLocation(index, action.target, ['target']);
  assertUnlocked(location, ['target']);
  if (location.element.type !== 'text') {
    fail('INVALID_MUTATION', ['target'], 'Pinned advanced style editing requires a text element');
  }
  validateStyleChanges(action.changes);
  const style = location.element.style;
  const changes = Object.entries(action.changes)
    .map(([key, value]) => pathChangeIfDifferent(style[key], value, ['style', key]))
    .filter(isPathChange);
  const resultFacts = facts({
    target: action.target,
    changedFields: Object.keys(action.changes),
  });
  if (changes.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(
    action,
    [Object.freeze({
      op: 'merge',
      target: elementTarget(action.target),
      changes: Object.freeze(changes),
    })],
    [action.target],
    resultFacts,
  );
}

function planHierarchyMove(
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
        'PATCH MAP v0.10 hierarchy parents must be group elements',
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

function planReorder(
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
  if (sameStrings(siblings, desired)) return unchangedPlan(action, resultFacts);
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

function planGroup(
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

function planDuplicate(
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

function planUngroup(
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

function normalizeAction(value: unknown): PatchMapAuthoringAction {
  const record = strictRecord(value, []);
  const type = nonEmptyString(record.type, ['type']);
  switch (type) {
    case 'create-element': {
      rejectUnknown(record, CREATE_FIELDS);
      const kindValue = nonEmptyString(record.kind, ['kind']);
      if (!ELEMENT_TYPE_SET.has(kindValue)) {
        fail('INVALID_VALUE', ['kind'], `Unsupported element kind ${kindValue}`);
      }
      return Object.freeze({
        type,
        kind: kindValue as PatchMapElementType,
        id: nonEmptyString(record.id, ['id']),
        positionWorld: point(record.positionWorld, ['positionWorld']),
        parentId: nullableId(record.parentId, ['parentId']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'edit-position-angle':
      rejectUnknown(record, POSITION_FIELDS);
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        x: finiteNumber(record.x, ['x']),
        y: finiteNumber(record.y, ['y']),
        angleDegrees: finiteNumber(record.angleDegrees, ['angleDegrees']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'align-targets': {
      rejectUnknown(record, ALIGN_FIELDS);
      const axis = nonEmptyString(record.axis, ['axis']);
      if (!ALIGNMENT_AXIS_SET.has(axis as PatchMapAuthoringAlignmentAxis)) {
        fail('INVALID_VALUE', ['axis'], `Unsupported alignment axis ${axis}`);
      }
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        axis: axis as PatchMapAuthoringAlignmentAxis,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'distribute-targets': {
      rejectUnknown(record, DISTRIBUTE_FIELDS);
      const axis = nonEmptyString(record.axis, ['axis']);
      if (!DISTRIBUTION_AXIS_SET.has(axis as PatchMapAuthoringDistributionAxis)) {
        fail('INVALID_VALUE', ['axis'], `Unsupported distribution axis ${axis}`);
      }
      if (record.basis !== 'bounds') {
        fail('INVALID_VALUE', ['basis'], 'Pinned distribution basis must be bounds');
      }
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        axis: axis as PatchMapAuthoringDistributionAxis,
        basis: 'bounds',
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'apply-style': {
      rejectUnknown(record, STYLE_FIELDS);
      if (record.strict !== true) {
        fail('INVALID_VALUE', ['strict'], 'Authoring style transactions must be strict');
      }
      const changes = detachPatchMapMutationJsonValue(record.changes, '$.changes');
      if (!isJsonRecord(changes)) {
        fail('INVALID_VALUE', ['changes'], 'Style changes must be a strict JSON record');
      }
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        changes,
        strict: true,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'move-hierarchy':
      rejectUnknown(record, MOVE_FIELDS);
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        parentId: nullableId(record.parentId, ['parentId']),
        index: nonNegativeInteger(record.index, ['index']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'reorder-z': {
      rejectUnknown(record, REORDER_FIELDS);
      if (record.placement !== 'front' && record.placement !== 'back') {
        fail('INVALID_VALUE', ['placement'], 'Z-order placement must be front or back');
      }
      if (record.preserveRelativeOrder !== true) {
        fail(
          'INVALID_VALUE',
          ['preserveRelativeOrder'],
          'Z-order changes must preserve relative order',
        );
      }
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        placement: record.placement,
        preserveRelativeOrder: true,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'group-targets':
      rejectUnknown(record, GROUP_FIELDS);
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        groupId: nonEmptyString(record.groupId, ['groupId']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'duplicate-tree':
    case 'copy-paste-tree':
      rejectUnknown(record, DUPLICATE_FIELDS);
      if (record.rewriteInternalReferences !== true) {
        fail(
          'INVALID_VALUE',
          ['rewriteInternalReferences'],
          'Internal duplicate references must be rewritten',
        );
      }
      if (record.preserveExternalReferences !== true) {
        fail(
          'INVALID_VALUE',
          ['preserveExternalReferences'],
          'External duplicate references must be preserved',
        );
      }
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        rootId: nonEmptyString(record.rootId, ['rootId']),
        offsetWorld: point(record.offsetWorld, ['offsetWorld']),
        rewriteInternalReferences: true,
        preserveExternalReferences: true,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'ungroup-target':
      rejectUnknown(record, UNGROUP_FIELDS);
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    default:
      fail('INVALID_VALUE', ['type'], `Unsupported authoring action ${type}`);
  }
}

function normalizeContext(value: unknown): PatchMapAuthoringPlanningContext {
  const record = strictRecord(value, ['context']);
  rejectUnknown(record, new Set(['selectionIds']), ['context']);
  return Object.freeze({
    selectionIds: stringArray(record.selectionIds, ['context', 'selectionIds']),
  });
}

function createElementRecord(
  kind: PatchMapElementType,
  id: string,
  position: PatchMapPointTuple,
): Readonly<Record<string, PatchMapMutationJsonValue>> {
  const [width, height] = defaultElementSize(kind);
  const attrs = Object.freeze({
    x: roundSix(position[0] - width / 2),
    y: roundSix(position[1] - height / 2),
  });
  switch (kind) {
    case 'item':
      return Object.freeze({
        type: 'item',
        id,
        size: Object.freeze({ width, height }),
        padding: 4,
        components: Object.freeze([
          Object.freeze({
            type: 'background',
            id: `${id}.background`,
            source: Object.freeze({ type: 'rect', fill: '#dbeafe' }),
          }),
          Object.freeze({
            type: 'bar',
            id: `${id}.bar`,
            source: Object.freeze({ type: 'rect', fill: '#2563eb' }),
            size: Object.freeze({ width: 56, height: 8 }),
            placement: 'bottom',
            animation: true,
            animationDuration: 200,
          }),
          Object.freeze({
            type: 'icon',
            id: `${id}.icon`,
            source: 'object',
            size: Object.freeze({ width: 16, height: 16 }),
            placement: 'left-top',
            tint: '#1e3a8a',
          }),
          Object.freeze({
            type: 'text',
            id: `${id}.text`,
            text: 'Item',
            placement: 'center',
            style: Object.freeze({
              fontFamily: 'Fira Code',
              fontSize: 14,
              fill: '#111827',
            }),
          }),
        ]),
        attrs,
      });
    case 'rect':
      return Object.freeze({
        type: 'rect',
        id,
        size: Object.freeze({ width, height }),
        fill: '#3b82f6',
        radius: 4,
        attrs,
      });
    case 'image':
      return Object.freeze({
        type: 'image',
        id,
        source: 'object',
        size: Object.freeze({ width, height }),
        attrs,
      });
    case 'text':
      return Object.freeze({
        type: 'text',
        id,
        text: 'Text',
        style: Object.freeze({
          fontFamily: 'Fira Code',
          fontSize: 16,
          fill: '#111827',
        }),
        size: Object.freeze({ width, height }),
        attrs,
      });
    case 'group':
      return Object.freeze({
        type: 'group',
        id,
        children: Object.freeze([]),
        attrs,
      });
    case 'grid':
      return Object.freeze({
        type: 'grid',
        id,
        cells: Object.freeze([Object.freeze([1])]),
        inactiveCellStrategy: 'hide',
        gap: Object.freeze({ x: 8, y: 8 }),
        item: Object.freeze({
          size: Object.freeze({ width, height }),
          padding: 4,
          components: Object.freeze([
            Object.freeze({
              type: 'background',
              id: `${id}.cell-background`,
              source: Object.freeze({ type: 'rect', fill: '#e0f2fe' }),
            }),
          ]),
        }),
        attrs,
      });
    case 'relations':
      return Object.freeze({
        type: 'relations',
        id,
        links: Object.freeze([]),
        style: Object.freeze({ color: '#334155', width: 2 }),
        attrs,
      });
  }
}

function defaultElementSize(kind: PatchMapElementType): PatchMapPointTuple {
  switch (kind) {
    case 'item':
      return Object.freeze([100, 80]);
    case 'rect':
      return Object.freeze([80, 60]);
    case 'image':
      return Object.freeze([80, 48]);
    case 'text':
      return Object.freeze([96, 24]);
    case 'grid':
      return Object.freeze([48, 48]);
    case 'group':
    case 'relations':
      return Object.freeze([0, 0]);
  }
}

function destinationForParent(
  parentId: string | null,
  index: ReadonlyMap<string, AuthoringElementLocation>,
  dataset: readonly NormalizedPatchMapElement[],
): Readonly<{ readonly parentAffine: PatchMapAffineMatrix; readonly childCount: number }> {
  if (parentId === null) {
    return Object.freeze({
      parentAffine: PATCH_MAP_IDENTITY_AFFINE,
      childCount: dataset.length,
    });
  }
  const parent = requireLocation(index, parentId, ['parentId']);
  assertUnlocked(parent, ['parentId']);
  if (parent.element.type !== 'group') {
    fail(
      'INVALID_MUTATION',
      ['parentId'],
      'PATCH MAP v0.10 hierarchy parents must be group elements',
    );
  }
  return Object.freeze({
    parentAffine: parent.worldAffine,
    childCount: parent.element.children.length,
  });
}

function indexAuthoringElements(
  dataset: readonly NormalizedPatchMapElement[],
): ReadonlyMap<string, AuthoringElementLocation> {
  const index = new Map<string, AuthoringElementLocation>();
  const visit = (
    elements: readonly NormalizedPatchMapElement[],
    parentId: string | null,
    parentAffine: PatchMapAffineMatrix,
    ancestorLocked: boolean,
  ): void => {
    elements.forEach((element, elementIndex) => {
      const worldAffine = multiplyPatchMapAffine(parentAffine, elementLocalAffine(element));
      index.set(element.id, Object.freeze({
        element,
        parentId,
        siblings: elements,
        index: elementIndex,
        parentAffine,
        worldAffine,
        ancestorLocked,
      }));
      if (element.type === 'group') {
        visit(
          element.children,
          element.id,
          worldAffine,
          ancestorLocked || element.locked,
        );
      }
    });
  };
  visit(dataset, null, PATCH_MAP_IDENTITY_AFFINE, false);
  return index;
}

function elementLocalAffine(element: NormalizedPatchMapElement): PatchMapAffineMatrix {
  const attrs = element.attrs ?? {};
  return createPatchMapAffine(
    optionalFinite(attrs.x, 0),
    optionalFinite(attrs.y, 0),
    rotationDegrees(attrs),
    optionalFinite(attrs.scaleX, 1),
    optionalFinite(attrs.scaleY, 1),
  );
}

function rotationDegrees(attrs: Readonly<Record<string, unknown>>): number {
  if (attrs.angle !== undefined) return optionalFinite(attrs.angle, 0);
  if (attrs.rotation !== undefined) {
    return roundSix(optionalFinite(attrs.rotation, 0) * 180 / Math.PI);
  }
  return 0;
}

function requireGeometries(
  targetIds: readonly string[],
  index: ReadonlyMap<string, AuthoringElementLocation>,
  minimum: number,
): readonly AuthoringGeometry[] {
  const targets = uniqueTargetIds(targetIds, minimum);
  return Object.freeze(targets.map((target, targetIndex) => {
    const location = requireLocation(index, target, ['targets', targetIndex]);
    assertUnlocked(location, ['targets', targetIndex]);
    const size = elementSize(location.element);
    if (size === null) {
      fail(
        'INVALID_MUTATION',
        ['targets', targetIndex],
        `Element ${target} has no distributable rectangular bounds`,
      );
    }
    const corners = patchMapAffineCorners(
      location.worldAffine,
      Object.freeze([0, 0, size[0], size[1]]),
    );
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return Object.freeze({
      location,
      bounds: Object.freeze([
        roundSix(left),
        roundSix(top),
        roundSix(Math.max(...xs) - left),
        roundSix(Math.max(...ys) - top),
      ] as const),
    });
  }));
}

function elementSize(element: NormalizedPatchMapElement): PatchMapPointTuple | null {
  switch (element.type) {
    case 'item':
    case 'rect':
      return Object.freeze([element.size.width, element.size.height]);
    case 'image':
    case 'text':
      return element.size === undefined
        ? null
        : Object.freeze([element.size.width, element.size.height]);
    case 'grid': {
      const rows = element.cells.length;
      const columns = Math.max(0, ...element.cells.map((row) => row.length));
      return Object.freeze([
        columns === 0
          ? 0
          : columns * element.item.size.width + (columns - 1) * element.gap.x,
        rows === 0
          ? 0
          : rows * element.item.size.height + (rows - 1) * element.gap.y,
      ]);
    }
    case 'group':
    case 'relations':
      return null;
  }
}

function alignmentAnchor(
  axis: PatchMapAuthoringAlignmentAxis,
  geometries: readonly AuthoringGeometry[],
): number {
  switch (axis) {
    case 'left':
      return Math.min(...geometries.map(({ bounds }) => bounds[0]));
    case 'right':
      return Math.max(...geometries.map(({ bounds }) => bounds[0] + bounds[2]));
    case 'top':
      return Math.min(...geometries.map(({ bounds }) => bounds[1]));
    case 'bottom':
      return Math.max(...geometries.map(({ bounds }) => bounds[1] + bounds[3]));
    case 'center-x':
      return roundSix(
        geometries.reduce((sum, { bounds }) => sum + bounds[0] + bounds[2] / 2, 0) /
        geometries.length,
      );
    case 'center-y':
      return roundSix(
        geometries.reduce((sum, { bounds }) => sum + bounds[1] + bounds[3] / 2, 0) /
        geometries.length,
      );
  }
}

function alignmentDelta(
  axis: PatchMapAuthoringAlignmentAxis,
  bounds: PatchMapBoundsTuple,
  anchor: number,
): PatchMapPointTuple {
  switch (axis) {
    case 'left':
      return Object.freeze([roundSix(anchor - bounds[0]), 0]);
    case 'right':
      return Object.freeze([roundSix(anchor - bounds[0] - bounds[2]), 0]);
    case 'top':
      return Object.freeze([0, roundSix(anchor - bounds[1])]);
    case 'bottom':
      return Object.freeze([0, roundSix(anchor - bounds[1] - bounds[3])]);
    case 'center-x':
      return Object.freeze([roundSix(anchor - bounds[0] - bounds[2] / 2), 0]);
    case 'center-y':
      return Object.freeze([0, roundSix(anchor - bounds[1] - bounds[3] / 2)]);
  }
}

function geometryTranslationOperation(
  geometry: AuthoringGeometry,
  deltaWorld: PatchMapPointTuple,
): readonly PatchMapMutationOperation[] {
  if (nearZero(deltaWorld[0]) && nearZero(deltaWorld[1])) return Object.freeze([]);
  const inverse = invertPatchMapAffine(geometry.location.parentAffine);
  const deltaLocal = Object.freeze([
    roundSix(inverse[0] * deltaWorld[0] + inverse[2] * deltaWorld[1]),
    roundSix(inverse[1] * deltaWorld[0] + inverse[3] * deltaWorld[1]),
  ] as const);
  const attrs = geometry.location.element.attrs ?? {};
  const currentX = optionalFinite(attrs.x, 0);
  const currentY = optionalFinite(attrs.y, 0);
  const changes = [
    pathChangeIfDifferent(currentX, roundSix(currentX + deltaLocal[0]), ['attrs', 'x']),
    pathChangeIfDifferent(currentY, roundSix(currentY + deltaLocal[1]), ['attrs', 'y']),
  ].filter(isPathChange);
  if (changes.length === 0) return Object.freeze([]);
  return Object.freeze([
    Object.freeze({
      op: 'merge',
      target: elementTarget(geometry.location.element.id),
      changes: Object.freeze(changes),
    }),
  ]);
}

function validateStyleChanges(
  changes: Readonly<Record<string, PatchMapMutationJsonValue>>,
): void {
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    fail('INVALID_VALUE', ['changes'], 'Style changes must not be empty');
  }
  const unknown = keys.find((key) => !STYLE_CHANGE_FIELDS.has(key));
  if (unknown !== undefined) {
    fail('INVALID_VALUE', ['changes', unknown], `Unsupported pinned style field ${unknown}`);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'fill' || key === 'stroke') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail('INVALID_VALUE', [key], `${key} must be a finite number`);
    }
    if (key === 'alpha' && (value < 0 || value > 1)) {
      fail('INVALID_VALUE', [key], 'alpha must be within [0, 1]');
    }
    if (
      key !== 'alpha' &&
      key !== 'letterSpacing' &&
      value < 0
    ) {
      fail('INVALID_VALUE', [key], `${key} must be non-negative`);
    }
    if ((key === 'fontSize' || key === 'lineHeight') && value === 0) {
      fail('INVALID_VALUE', [key], `${key} must be greater than zero`);
    }
  }
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

function componentIds(
  element: Readonly<Record<string, PatchMapMutationJsonValue>>,
): readonly string[] {
  const source = element.type === 'item'
    ? element.components
    : element.type === 'grid' && isJsonRecord(element.item)
      ? element.item.components
      : null;
  if (!Array.isArray(source)) return Object.freeze([]);
  const components = source as readonly PatchMapMutationJsonValue[];
  return Object.freeze(components.flatMap((component) =>
    isJsonRecord(component) && typeof component.id === 'string' ? [component.id] : []));
}

function plannedPlan(
  action: PatchMapAuthoringAction,
  operations: readonly PatchMapMutationOperation[],
  selectedIds: readonly string[],
  planFacts: PatchMapAuthoringFacts,
): PatchMapAuthoringPlan {
  if (operations.length === 0) return unchangedPlan(action, planFacts);
  const transaction: PatchMapMutationTransactionRequest = Object.freeze({
    operations: Object.freeze([...operations]),
    strict: true,
    actionId: action.actionId,
    conflictPolicy: 'reject',
    recordHistory: true,
    history: Object.freeze({
      selectedIds: Object.freeze([...selectedIds]),
      mode: 'select',
    }),
  });
  return Object.freeze({
    schemaRevision: PATCH_MAP_AUTHORING_REVISION,
    actionType: action.type,
    action,
    facts: planFacts,
    status: 'planned',
    changed: true,
    transaction,
  });
}

function unchangedPlan(
  action: PatchMapAuthoringAction,
  planFacts: PatchMapAuthoringFacts,
): PatchMapAuthoringPlan {
  return Object.freeze({
    schemaRevision: PATCH_MAP_AUTHORING_REVISION,
    actionType: action.type,
    action,
    facts: planFacts,
    status: 'unchanged',
    changed: false,
    transaction: null,
  });
}

function rejectedPlan(
  action: PatchMapAuthoringAction | null,
  planDiagnostic: PatchMapAuthoringDiagnostic,
): PatchMapAuthoringPlan {
  return Object.freeze({
    schemaRevision: PATCH_MAP_AUTHORING_REVISION,
    actionType: action?.type ?? null,
    action,
    facts: EMPTY_FACTS,
    status: 'rejected',
    changed: false,
    transaction: null,
    diagnostic: planDiagnostic,
  });
}

function facts(
  value: Readonly<Record<string, PatchMapMutationJsonValue>>,
): PatchMapAuthoringFacts {
  const detached = detachPatchMapMutationJsonValue(value, '$.facts');
  if (!isJsonRecord(detached)) throw new Error('Authoring facts lost record shape');
  return detached;
}

function elementTarget(id: string): Readonly<{ readonly kind: 'element'; readonly id: string }> {
  return Object.freeze({ kind: 'element', id });
}

function requireLocation(
  index: ReadonlyMap<string, AuthoringElementLocation>,
  id: string,
  path: readonly (string | number)[],
): AuthoringElementLocation {
  const location = index.get(id);
  if (location === undefined) {
    fail('MISSING_TARGET', path, `No element matches ${id}`);
  }
  return location;
}

function assertUnlocked(
  location: AuthoringElementLocation,
  path: readonly (string | number)[],
): void {
  if (location.element.locked || location.ancestorLocked) {
    fail('INVALID_MUTATION', path, `Element ${location.element.id} is locked`);
  }
}

function isDescendant(
  index: ReadonlyMap<string, AuthoringElementLocation>,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current = index.get(candidateId);
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (current.parentId === ancestorId) return true;
    current = index.get(current.parentId);
  }
  return false;
}

function uniqueTargetIds(
  ids: readonly string[],
  minimum: number,
): readonly string[] {
  if (ids.length < minimum) {
    fail(
      'INVALID_VALUE',
      ['targets'],
      `Authoring action requires at least ${minimum} unique targets`,
    );
  }
  if (new Set(ids).size !== ids.length) {
    fail('INVALID_VALUE', ['targets'], 'Authoring targets must be unique');
  }
  return ids;
}

function pathChangeIfDifferent(
  current: unknown,
  next: PatchMapMutationJsonValue,
  path: readonly (string | number)[],
): Readonly<{ readonly path: readonly (string | number)[]; readonly value: PatchMapMutationJsonValue }> | null {
  return jsonEqual(current, next) ? null : Object.freeze({ path: Object.freeze([...path]), value: next });
}

function isPathChange<T>(value: T | null): value is T {
  return value !== null;
}

function optionalFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nearZero(value: number): boolean {
  return Math.abs(value) <= 1e-9;
}

function roundSix(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function authoringFingerprint(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function strictRecord(
  value: unknown,
  path: readonly (string | number)[],
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) {
    fail('INVALID_VALUE', path, 'Expected a strict plain record');
  }
  return value;
}

function rejectUnknown(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  path: readonly (string | number)[] = [],
): void {
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    fail('INVALID_VALUE', [...path, unknown], `Unknown authoring field ${unknown}`);
  }
}

function nonEmptyString(
  value: unknown,
  path: readonly (string | number)[],
): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_VALUE', path, 'Expected a non-empty string');
  }
  return value;
}

function nullableId(
  value: unknown,
  path: readonly (string | number)[],
): string | null {
  return value === null ? null : nonEmptyString(value, path);
}

function finiteNumber(
  value: unknown,
  path: readonly (string | number)[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_VALUE', path, 'Expected a finite number');
  }
  return value;
}

function nonNegativeInteger(
  value: unknown,
  path: readonly (string | number)[],
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail('INVALID_VALUE', path, 'Expected a non-negative safe integer');
  }
  return Number(value);
}

function point(
  value: unknown,
  path: readonly (string | number)[],
): PatchMapPointTuple {
  if (!Array.isArray(value) || value.length !== 2) {
    fail('INVALID_VALUE', path, 'Expected a two-value point');
  }
  return Object.freeze([
    finiteNumber(value[0], [...path, 0]),
    finiteNumber(value[1], [...path, 1]),
  ]);
}

function stringArray(
  value: unknown,
  path: readonly (string | number)[],
): readonly string[] {
  if (!Array.isArray(value)) fail('INVALID_VALUE', path, 'Expected an array of strings');
  return Object.freeze(value.map((entry, index) =>
    nonEmptyString(entry, [...path, index])));
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isMutableRecord(value: MutableJsonValue | undefined): value is MutableJsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonRecord(
  value: PatchMapMutationJsonValue | undefined,
): value is Readonly<Record<string, PatchMapMutationJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(
  code: PatchMapAuthoringDiagnosticCode,
  path: readonly (string | number)[],
  message: string,
): never {
  throw new AuthoringValidationFailure(Object.freeze({
    code,
    path: Object.freeze([...path]),
    message,
  }));
}

class AuthoringValidationFailure extends Error {
  public readonly diagnostic: PatchMapAuthoringDiagnostic;

  public constructor(diagnostic: PatchMapAuthoringDiagnostic) {
    super(diagnostic.message);
    this.name = 'AuthoringValidationFailure';
    this.diagnostic = diagnostic;
  }
}
