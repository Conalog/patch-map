import { multiplyPatchMapAffine } from '../geometry';
import {
  type PatchMapMutationOperation,
  type PatchMapMutationTarget,
} from './contracts';
import { transactionFail } from './diagnostics';
import {
  cloneMutableJson,
  defineMutableProperty,
  isMutableJsonRecord,
  type MutableJsonRecord,
  type MutableJsonValue,
} from './json-values';
import type { TargetOutcome } from './owned-fast-path-planning';
import {
  assertUnlockedLocation,
  elementIdsInArray,
  elementSubtreeIds,
  freezeUniqueStrings,
  hierarchyConflict,
  locate,
  locationTarget,
  missingStructuralTarget,
  rebaseElementRecord,
  relationDependencyCount,
  removeRelationDependencies,
  requireElementLocation,
  requireLocationAffine,
  requireLocationParentAffine,
  stagedElementLocalAffine,
  structuralDestination,
  type StagedLocation,
} from './structural-scene';

export function removeTarget(
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

export function applyStructuralOperation(
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
