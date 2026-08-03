import type { PatchMapLogicalTargetSnapshot } from '../query-selection';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationPathChange,
  type PatchMapMutationTarget,
} from '../semantic/transaction';
import type {
  PatchMapBarUpdate,
  PatchMapComponentUpdate,
  PatchMapTextUpdate,
  PatchMapTransactionOperation,
  PatchMapUpdate,
  PatchMapUpdateRecord,
} from './contracts';

export type ComponentType = 'background' | 'bar' | 'icon' | 'text';

export interface MutationContext {
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
  readonly byKey: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>;
  readonly componentsByOwnerAndType: ReadonlyMap<
    string,
    readonly PatchMapLogicalTargetSnapshot[]
  >;
}

export interface ResolvedComponent {
  readonly ownerId: string;
  readonly componentId: string;
  readonly target: PatchMapLogicalTargetSnapshot;
  readonly instance: boolean;
}

const COMPONENT_TYPES: readonly ComponentType[] = Object.freeze([
  'background',
  'bar',
  'icon',
  'text',
]);
const IDENTITY_FIELDS = new Set(['id', 'type']);
const ELEMENT_STRUCTURAL_FIELDS = new Set([
  ...IDENTITY_FIELDS,
  'cells',
  'children',
  'components',
  'item',
  'links',
  'relations',
]);
const UPDATE_FIELDS = new Set(['id', 'changes', ...COMPONENT_TYPES]);
const TRANSACTION_UPDATE_FIELDS = new Set([...UPDATE_FIELDS, 'type']);
const COMPONENT_FIELDS = new Set(['componentId', 'changes']);
const BAR_FIELDS = new Set([...COMPONENT_FIELDS, 'height', 'width', 'fill']);
const TEXT_FIELDS = new Set([...COMPONENT_FIELDS, 'text', 'style']);
const TRANSACTION_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  add: new Set(['type', 'parentId', 'index', 'value']),
  replace: new Set(['type', 'id', 'componentId', 'value']),
  remove: new Set(['type', 'id', 'componentId', 'cascade']),
  move: new Set(['type', 'id', 'parentId', 'index']),
  group: new Set(['type', 'ids', 'value']),
  ungroup: new Set(['type', 'id', 'relationPolicy']),
});
const MUTATION_CONTEXT_CACHE = new WeakMap<object, MutationContext>();

export function mutationContext(
  targets: readonly PatchMapLogicalTargetSnapshot[],
): MutationContext {
  const cached = MUTATION_CONTEXT_CACHE.get(targets);
  if (cached !== undefined) return cached;
  const componentsByOwnerAndType = new Map<string, PatchMapLogicalTargetSnapshot[]>();
  for (const target of targets) {
    if (target.kind !== 'component') continue;
    const key = componentLookupKey(target.ownerId!, target.type);
    const components = componentsByOwnerAndType.get(key);
    if (components === undefined) componentsByOwnerAndType.set(key, [target]);
    else components.push(target);
  }
  const context = Object.freeze({
    targets,
    byKey: new Map(targets.map((target) => [target.key, target])),
    componentsByOwnerAndType,
  });
  MUTATION_CONTEXT_CACHE.set(targets, context);
  return context;
}

export function targetByOwnerId(
  context: MutationContext,
  id: string,
): PatchMapLogicalTargetSnapshot | undefined {
  nonEmptyString(id, 'update.id');
  return context.byKey.get(`element:${id}`);
}

export function normalizeUpdate(input: unknown, path = '$.update'): PatchMapUpdate {
  const detached = detachPatchMapMutationJsonValue(input, path);
  if (!isJsonRecord(detached)) throw new TypeError(`${path} must be a plain JSON record`);
  validateUpdateRecord(detached, path, false);
  return detached as unknown as PatchMapUpdate;
}

export function normalizeTransactionOperations(
  input: unknown,
): readonly PatchMapTransactionOperation[] {
  const detached = detachPatchMapMutationJsonValue(input, '$.transaction');
  if (!Array.isArray(detached)) {
    throw new TypeError('transaction() requires an ordered operation array');
  }
  const operations = detached as unknown as readonly PatchMapMutationJsonValue[];
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    const path = `$.transaction[${index}]`;
    if (!isJsonRecord(operation)) throw new TypeError(`${path} must be a plain JSON record`);
    const type = operation.type;
    if (typeof type !== 'string') throw new TypeError(`${path}.type must be a string`);
    if (type === 'update') {
      validateUpdateRecord(operation, path, true);
      continue;
    }
    const fields = TRANSACTION_FIELDS[type];
    if (fields === undefined) throw new TypeError(`${path}.type is not supported: ${type}`);
    assertKnownFields(operation, fields, path);
  }
  return operations as unknown as readonly PatchMapTransactionOperation[];
}

export function lowerUpdate(
  input: PatchMapUpdate,
  preferred: PatchMapLogicalTargetSnapshot | undefined,
  context: MutationContext,
): readonly PatchMapMutationOperation[] {
  const id = nonEmptyString(input.id, 'update.id');
  const operations: PatchMapMutationOperation[] = [];
  if (input.changes !== undefined) {
    assertAuthoredTarget(preferred, id, 'element changes');
    operations.push(mergeOperation(
      { kind: 'element', id },
      input.changes,
      '$.changes',
      ELEMENT_STRUCTURAL_FIELDS,
    ));
  }
  for (const type of COMPONENT_TYPES) {
    const patch = input[type];
    if (patch === undefined) continue;
    if (
      type === 'text' &&
      preferred?.kind === 'element' &&
      preferred.type === 'text' &&
      patch.componentId === undefined
    ) {
      assertAuthoredTarget(preferred, id, 'text element changes');
      operations.push(mergePathOperation(
        { kind: 'element', id },
        componentPathChanges('text', patch, '$.text'),
      ));
      continue;
    }
    const component = resolveComponent(id, type, patch.componentId, preferred, context);
    if (component.instance) {
      throw new TypeError(
        `Concrete grid instance ${id}/${component.componentId} supports only bar height presentation updates through update() or updateBatch().`,
      );
    }
    operations.push(mergePathOperation(
      { kind: 'component', ownerId: id, id: component.componentId },
      componentPathChanges(type, patch, `$.${type}`),
    ));
  }
  if (operations.length === 0) {
    throw new TypeError('update() requires changes or one component patch');
  }
  return Object.freeze(operations);
}

export function lowerTransactionOperation(
  input: PatchMapTransactionOperation,
  context: MutationContext,
): readonly PatchMapMutationOperation[] {
  switch (input.type) {
    case 'update':
      return lowerUpdate(input, targetByOwnerId(context, input.id), context);
    case 'add':
      return Object.freeze([Object.freeze({
        op: 'add',
        parent: input.parentId === null
          ? null
          : Object.freeze({ kind: 'element' as const, id: nonEmptyString(input.parentId, 'parentId') }),
        collection: 'children' as const,
        index: nonNegativeInteger(input.index, 'index'),
        value: immutableRecord(input.value, '$.value'),
      })]);
    case 'replace':
      return Object.freeze([Object.freeze({
        op: 'replace',
        target: publicTarget(input.id, input.componentId),
        value: immutableRecord(input.value, '$.value'),
      })]);
    case 'remove':
      return Object.freeze([Object.freeze({
        op: 'remove',
        target: publicTarget(input.id, input.componentId),
        cascade: input.cascade ?? 'subtree',
      })]);
    case 'move':
      return Object.freeze([Object.freeze({
        op: 'move',
        target: Object.freeze({ kind: 'element' as const, id: nonEmptyString(input.id, 'id') }),
        parent: input.parentId === null
          ? null
          : Object.freeze({ kind: 'element' as const, id: nonEmptyString(input.parentId, 'parentId') }),
        index: nonNegativeInteger(input.index, 'index'),
      })]);
    case 'group':
      return Object.freeze([Object.freeze({
        op: 'group',
        targets: Object.freeze(input.ids.map((id) => Object.freeze({
          kind: 'element' as const,
          id: nonEmptyString(id, 'ids[]'),
        }))),
        value: immutableRecord(input.value, '$.value'),
      })]);
    case 'ungroup':
      return Object.freeze([Object.freeze({
        op: 'ungroup',
        target: Object.freeze({ kind: 'element' as const, id: nonEmptyString(input.id, 'id') }),
        relationPolicy: input.relationPolicy ?? 'reject',
      })]);
  }
}

export function resolveComponent(
  ownerId: string,
  type: ComponentType,
  requestedId: string | undefined,
  preferred: PatchMapLogicalTargetSnapshot | undefined,
  context: MutationContext,
): ResolvedComponent {
  const requested = requestedId === undefined
    ? undefined
    : nonEmptyString(requestedId, `${type}.componentId`);
  const preferredComponent = preferred?.kind === 'component' && preferred.ownerId === ownerId
    ? preferred
    : undefined;
  if (
    preferredComponent !== undefined &&
    preferredComponent.type === type &&
    (requested === undefined || preferredComponent.id === requested)
  ) {
    return resolvedComponent(preferredComponent, context);
  }
  const ownerComponents = context.componentsByOwnerAndType.get(
    componentLookupKey(ownerId, type),
  ) ?? Object.freeze([]);
  const candidates = requested === undefined
    ? ownerComponents
    : ownerComponents.filter((target) => target.id === requested);
  if (candidates.length === 0) {
    throw new TypeError(
      requested === undefined
        ? `${ownerId} has no ${type} component`
        : `${ownerId} has no ${type} component named ${requested}`,
    );
  }
  if (candidates.length > 1) {
    throw new TypeError(
      `${ownerId} has multiple ${type} components. Set ${type}.componentId to choose one.`,
    );
  }
  return resolvedComponent(candidates[0]!, context);
}

export function ownerId(target: PatchMapLogicalTargetSnapshot): string {
  return target.kind === 'component' ? target.ownerId! : target.id;
}

function publicTarget(idValue: string, componentId?: string): PatchMapMutationTarget {
  const id = nonEmptyString(idValue, 'id');
  return componentId === undefined
    ? Object.freeze({ kind: 'element', id })
    : Object.freeze({
        kind: 'component',
        ownerId: id,
        id: nonEmptyString(componentId, 'componentId'),
      });
}

function validateUpdateRecord(
  input: Readonly<Record<string, PatchMapMutationJsonValue>>,
  path: string,
  transaction: boolean,
): void {
  assertKnownFields(input, transaction ? TRANSACTION_UPDATE_FIELDS : UPDATE_FIELDS, path);
  for (const type of COMPONENT_TYPES) {
    const patch = input[type];
    if (patch === undefined) continue;
    if (!isJsonRecord(patch)) throw new TypeError(`${path}.${type} must be a plain JSON record`);
    assertKnownFields(
      patch,
      type === 'bar' ? BAR_FIELDS : type === 'text' ? TEXT_FIELDS : COMPONENT_FIELDS,
      `${path}.${type}`,
    );
  }
}

function assertKnownFields(
  input: Readonly<Record<string, PatchMapMutationJsonValue>>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(input)) {
    if (!fields.has(key)) throw new TypeError(`${path}.${key} is not a supported field`);
  }
}

function componentLookupKey(ownerId: string, type: string): string {
  return `${ownerId}\u0000${type}`;
}

function resolvedComponent(
  target: PatchMapLogicalTargetSnapshot,
  context: MutationContext,
): ResolvedComponent {
  return Object.freeze({
    ownerId: target.ownerId!,
    componentId: target.id,
    target,
    instance: instanceTarget(target, context.byKey),
  });
}

function instanceTarget(
  target: PatchMapLogicalTargetSnapshot,
  byKey: ReadonlyMap<string, PatchMapLogicalTargetSnapshot>,
): boolean {
  if (target.type === 'grid-cell') return true;
  if (target.parentKey === null) return false;
  return byKey.get(target.parentKey)?.type === 'grid-cell';
}

function assertAuthoredTarget(
  target: PatchMapLogicalTargetSnapshot | undefined,
  id: string,
  operation: string,
): void {
  if (target !== undefined && target.type === 'grid-cell') {
    throw new TypeError(`Concrete grid instance ${id} does not support ${operation}`);
  }
}

function componentPathChanges(
  type: ComponentType,
  patch: PatchMapComponentUpdate,
  path: string,
): readonly PatchMapMutationPathChange[] {
  const changes: PatchMapMutationPathChange[] = patch.changes === undefined
    ? []
    : [...pathChanges(patch.changes, `${path}.changes`)];
  if (type === 'bar') {
    const bar = patch as PatchMapBarUpdate;
    if (bar.height !== undefined) {
      changes.push(pathChange(['size', 'height'], bar.height, `${path}.height`));
    }
    if (bar.width !== undefined) {
      changes.push(pathChange(['size', 'width'], bar.width, `${path}.width`));
    }
    if (bar.fill !== undefined) {
      changes.push(pathChange(['source', 'fill'], bar.fill, `${path}.fill`));
    }
  } else if (type === 'text') {
    const text = patch as PatchMapTextUpdate;
    if (text.text !== undefined) {
      changes.push(pathChange(['text'], text.text, `${path}.text`));
    }
    if (text.style !== undefined) {
      const style = immutableRecord(text.style, `${path}.style`);
      flattenRecord(style, ['style'], changes);
    }
  }
  if (changes.length === 0) throw new TypeError(`${path} must contain at least one changed field`);
  return Object.freeze(changes);
}

function mergeOperation(
  target: PatchMapMutationTarget,
  patch: PatchMapUpdateRecord,
  path: string,
  protectedFields: ReadonlySet<string> = IDENTITY_FIELDS,
): PatchMapMutationOperation {
  const changes = pathChanges(patch, path, protectedFields);
  if (changes.length === 0) throw new TypeError(`${path} must contain at least one changed field`);
  return Object.freeze({ op: 'merge', target, changes });
}

function mergePathOperation(
  target: PatchMapMutationTarget,
  changes: readonly PatchMapMutationPathChange[],
): PatchMapMutationOperation {
  return Object.freeze({ op: 'merge', target, changes });
}

function pathChange(
  path: readonly (string | number)[],
  value: unknown,
  valuePath: string,
): PatchMapMutationPathChange {
  return Object.freeze({
    path: Object.freeze([...path]),
    value: detachPatchMapMutationJsonValue(value, valuePath),
  });
}

function pathChanges(
  patch: PatchMapUpdateRecord,
  path: string,
  protectedFields: ReadonlySet<string> = IDENTITY_FIELDS,
): readonly PatchMapMutationPathChange[] {
  const detached = immutableRecord(patch, path);
  const changes: PatchMapMutationPathChange[] = [];
  flattenRecord(detached, [], changes, protectedFields);
  return Object.freeze(changes);
}

function flattenRecord(
  record: Readonly<Record<string, PatchMapMutationJsonValue>>,
  prefix: readonly (string | number)[],
  changes: PatchMapMutationPathChange[],
  protectedFields: ReadonlySet<string> = IDENTITY_FIELDS,
): void {
  for (const [key, value] of Object.entries(record)) {
    if (prefix.length === 0 && protectedFields.has(key)) {
      throw new TypeError(
        `update() cannot change protected ${key}; use transaction() for structural changes`,
      );
    }
    const path = Object.freeze([...prefix, key]);
    if (isJsonRecord(value) && Object.keys(value).length > 0) {
      flattenRecord(value, path, changes, protectedFields);
    } else {
      changes.push(Object.freeze({ path, value }));
    }
  }
}

function immutableRecord(value: unknown, path: string): PatchMapUpdateRecord {
  const detached = detachPatchMapMutationJsonValue(value, path);
  if (!isJsonRecord(detached)) throw new TypeError(`${path} must be a plain JSON record`);
  return detached;
}

function isJsonRecord(
  value: PatchMapMutationJsonValue,
): value is Readonly<Record<string, PatchMapMutationJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}
