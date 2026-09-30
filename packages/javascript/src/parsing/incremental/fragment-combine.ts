import type { EntityInput, EntityKind } from '../../dense/contracts';
import type {
  ComponentIdentity,
  ElementIdentity,
  EntitySourceIdentity,
  ExpandedItemIdentity,
  ParseDiagnostic,
  ParsePatchMapResult,
  PatchMapProjectionIndex,
} from '../contracts';
import type { PatchMapStableRecordStrategy } from '../../semantic/stable-record-overlay';
import { sameStringArray } from '../../shared/string-array-values';

import {
  ROOT_FRAGMENTS_CACHE,
  STABLE_PARSE_INDEX_CACHE,
  stableParseIndexes,
} from './cache-indexes';
import type { RootFragment } from './contracts';
import {
  rebaseRootPath,
  rootIndexFromPath,
} from './root-fragments';
import {
  appendProjectionEntity,
  emptyProjection,
  freezeProjection,
  patchStableProjection,
} from './projection-patch';

export function relationEndpointsIntersect(
  projection: PatchMapProjectionIndex,
  ids: ReadonlySet<string>,
): boolean {
  if (ids.size === 0) return false;
  const relations = [
    ...Object.values(projection.relationsByEntityId),
    ...projection.omittedRelations,
  ];
  return relations.some(({ sourceId, targetId }) =>
    ids.has(sourceId) || ids.has(targetId));
}

export function addedElementsActivateOmittedRelation(
  previous: ParsePatchMapResult,
  previousElementIds: ReadonlySet<string>,
  fragments: readonly RootFragment[],
): boolean {
  const omitted = previous.projection.omittedRelations;
  if (omitted.length === 0) return false;
  const added = new Set<string>();
  for (const fragment of fragments) {
    for (const element of fragment.elements) {
      if (!previousElementIds.has(element.sourceId)) added.add(element.sourceId);
    }
  }
  return omitted.some(({ sourceId, targetId }) =>
    added.has(sourceId) || added.has(targetId));
}

export function structuralDiagnostics(
  previous: ParsePatchMapResult,
  previousFragments: readonly RootFragment[],
  nextFragments: readonly RootFragment[],
  reusedPreviousIndices: ReadonlySet<number>,
  selected: ParsePatchMapResult | null,
): readonly ParseDiagnostic[] | null {
  const nextIndexById = new Map(
    nextFragments.map((fragment, index) =>
      [fragment.element.sourceId, index] as const),
  );
  const indexed: Array<Readonly<{
    readonly index: number;
    readonly order: number;
    readonly diagnostic: ParseDiagnostic;
  }>> = [];
  let order = 0;
  for (const diagnostic of previous.diagnostics) {
    if (diagnostic.path.startsWith('$.renderer.')) continue;
    const previousIndex = rootIndexFromPath(diagnostic.path);
    if (previousIndex === null) return null;
    if (!reusedPreviousIndices.has(previousIndex)) continue;
    const fragment = previousFragments[previousIndex];
    if (fragment === undefined) return null;
    const nextIndex = nextIndexById.get(fragment.element.sourceId);
    if (nextIndex === undefined) continue;
    indexed.push(Object.freeze({
      index: nextIndex,
      order: order++,
      diagnostic: Object.freeze({
        ...diagnostic,
        path: rebaseRootPath(diagnostic.path, previousIndex, nextIndex),
      }),
    }));
  }
  for (const diagnostic of selected?.diagnostics ?? []) {
    if (diagnostic.path.startsWith('$.renderer.')) continue;
    const index = rootIndexFromPath(diagnostic.path);
    if (index === null) return null;
    indexed.push(Object.freeze({
      index,
      order: order++,
      diagnostic,
    }));
  }
  indexed.sort((left, right) =>
    left.index - right.index || left.order - right.order);
  return Object.freeze(indexed.map(({ diagnostic }) => diagnostic));
}

export function combineStructuralRootFragments(
  fragments: readonly RootFragment[],
  previous: ParsePatchMapResult,
  diagnostics: readonly ParseDiagnostic[],
): ParsePatchMapResult | null {
  const elements: ElementIdentity[] = [];
  const components: ComponentIdentity[] = [];
  const expandedItems: ExpandedItemIdentity[] = [];
  const elementByPath = new Map<string, number>();
  const componentByPath = new Map<string, number>();
  const entityIds = new Set<string>();
  const sourceIds = new Set<string>();
  const entityIdsBySourceId = Object.create(null) as Record<string, string[]>;
  const entityIdsByComponentId = Object.create(null) as Record<string, string[]>;
  const entitySourceById = Object.create(null) as Record<string, EntitySourceIdentity>;
  const sourceIdsByEntityId = new Map<string, string[]>();
  const sourceByEntityId = new Map<string, EntitySourceIdentity>();
  const nonRelationEntities: EntityInput[] = [];
  const relationEntities: EntityInput[] = [];
  const projection = emptyProjection();

  for (const fragment of fragments) {
    for (const element of fragment.elements) {
      if (
        sourceIds.has(element.sourceId) ||
        elementByPath.has(element.sourcePath)
      ) {
        return null;
      }
      sourceIds.add(element.sourceId);
      elementByPath.set(element.sourcePath, elements.length);
      elements.push(element);
      for (const entityId of element.entityIds) {
        const ids = sourceIdsByEntityId.get(entityId);
        if (ids === undefined) sourceIdsByEntityId.set(entityId, [element.sourceId]);
        else ids.push(element.sourceId);
      }
    }
    for (const component of fragment.components) {
      if (componentByPath.has(component.componentPath)) return null;
      componentByPath.set(component.componentPath, components.length);
      components.push(component);
    }
    expandedItems.push(...fragment.expandedItems);
    for (const entity of fragment.entities) {
      if (entityIds.has(entity.id)) return null;
      entityIds.add(entity.id);
      const source = fragment.entitySources[entity.id];
      if (source === undefined) return null;
      sourceByEntityId.set(entity.id, source);
      (entity.kind === 'relation' ? relationEntities : nonRelationEntities)
        .push(entity);
      appendProjectionEntity(projection, fragment.projection, entity.id);
    }
  }
  const entities = [
    ...nonRelationEntities,
    ...relationEntities,
  ];
  for (const entity of entities) {
    const source = sourceByEntityId.get(entity.id);
    const elementSourceIds = sourceIdsByEntityId.get(entity.id);
    if (source === undefined || elementSourceIds === undefined) {
      return null;
    }
    entitySourceById[entity.id] = source;
    appendIdentityEntityId(
      entityIdsBySourceId,
      source.sourceElementId,
      entity.id,
    );
    for (const sourceId of elementSourceIds) {
      if (sourceId === source.sourceElementId) continue;
      appendIdentityEntityId(entityIdsBySourceId, sourceId, entity.id);
    }
    if (source.componentId !== undefined) {
      appendIdentityEntityId(
        entityIdsByComponentId,
        source.componentId,
        entity.id,
      );
    }
  }
  const omittedRelations: NonNullable<
    PatchMapProjectionIndex['omittedRelations']
  >[number][] = [];
  for (const fragment of fragments) {
    omittedRelations.push(...fragment.projection.omittedRelations);
  }
  projection.omittedRelations.push(...omittedRelations);
  freezeRecordArrays(entityIdsBySourceId);
  freezeRecordArrays(entityIdsByComponentId);
  const kinds: Record<EntityKind, number> = {
    rect: 0,
    text: 0,
    image: 0,
    bar: 0,
    relation: 0,
  };
  const entityById = new Map<string, number>();
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index]!;
    kinds[entity.kind] += 1;
    entityById.set(entity.id, index);
  }
  const frozenEntities = Object.freeze(entities);
  const frozenElements = Object.freeze(elements);
  const frozenComponents = Object.freeze(components);
  const frozenExpandedItems = Object.freeze(expandedItems);
  const result = Object.freeze({
    document: Object.freeze({
      ...previous.document,
      entities: frozenEntities,
    }),
    diagnostics,
    identity: Object.freeze({
      counts: Object.freeze({
        sourceElements: frozenElements.length,
        sourceComponents: frozenComponents.length,
        expandedItems: frozenExpandedItems.length,
        gridCells: frozenExpandedItems.filter((entry) => entry.grid !== undefined).length,
        relationLinks: kinds.relation + omittedRelations.length,
        entities: frozenEntities.length,
        kinds: Object.freeze(kinds),
      }),
      entityIds: Object.freeze(frozenEntities.map(({ id }) => id)),
      entityIdsBySourceId: Object.freeze(entityIdsBySourceId),
      entityIdsByComponentId: Object.freeze(entityIdsByComponentId),
      entitySourceById: Object.freeze(entitySourceById),
      elements: frozenElements,
      components: frozenComponents,
      expandedItems: frozenExpandedItems,
    }),
    projection: freezeProjection(projection),
  });
  STABLE_PARSE_INDEX_CACHE.set(result, Object.freeze({
    entityById,
    elementByPath,
    componentByPath,
  }));
  return result;
}

export function combineRootFragments(
  fragments: readonly RootFragment[],
  previous: ParsePatchMapResult,
  recordStrategy: PatchMapStableRecordStrategy,
): ParsePatchMapResult | null {
  const stable = combineStableRootFragments(
    fragments,
    previous,
    recordStrategy,
  );
  if (stable !== null) return stable;

  const entities: EntityInput[] = [];
  const elements: ElementIdentity[] = [];
  const components: ComponentIdentity[] = [];
  const expandedItems: ExpandedItemIdentity[] = [];
  const entityIds = new Set<string>();
  const entityById = new Map<string, EntityInput>();
  const sourceIds = new Set<string>();
  const entityIdsBySourceId = Object.create(null) as Record<string, string[]>;
  const entityIdsByComponentId = Object.create(null) as Record<string, string[]>;
  const entitySourceById = Object.create(null) as Record<string, EntitySourceIdentity>;
  const projection = emptyProjection();

  for (const fragment of fragments) {
    for (const element of fragment.elements) {
      if (sourceIds.has(element.sourceId)) return null;
      sourceIds.add(element.sourceId);
      elements.push(element);
      entityIdsBySourceId[element.sourceId] = [...element.entityIds];
    }
    components.push(...fragment.components);
    expandedItems.push(...fragment.expandedItems);
    for (const component of fragment.components) {
      const componentIds = entityIdsByComponentId[component.componentId] ??
        (entityIdsByComponentId[component.componentId] = []);
      componentIds.push(...component.entityIds);
    }
    for (const entity of fragment.entities) {
      if (entityIds.has(entity.id)) return null;
      entityIds.add(entity.id);
      entityById.set(entity.id, entity);
      const source = fragment.entitySources[entity.id];
      if (source === undefined) return null;
      entitySourceById[entity.id] = source;
      appendProjectionEntity(projection, fragment.projection, entity.id);
    }
  }
  projection.omittedRelations.push(...previous.projection.omittedRelations);
  if (entityById.size !== previous.document.entities.length) return null;
  for (const previousEntity of previous.document.entities) {
    const entity = entityById.get(previousEntity.id);
    if (entity === undefined) return null;
    entities.push(entity);
  }

  const orderedEntityIdsBySourceId = reorderRecordLike(
    previous.identity.entityIdsBySourceId,
    entityIdsBySourceId,
  );
  const orderedEntityIdsByComponentId = reorderRecordLike(
    previous.identity.entityIdsByComponentId,
    entityIdsByComponentId,
  );
  const orderedEntitySourceById = reorderRecordLike(
    previous.identity.entitySourceById,
    entitySourceById,
  );
  if (
    orderedEntityIdsBySourceId === null ||
    orderedEntityIdsByComponentId === null ||
    orderedEntitySourceById === null
  ) {
    return null;
  }
  freezeRecordArrays(orderedEntityIdsBySourceId);
  freezeRecordArrays(orderedEntityIdsByComponentId);
  const kinds: Record<EntityKind, number> = {
    rect: 0,
    text: 0,
    image: 0,
    bar: 0,
    relation: 0,
  };
  for (const entity of entities) kinds[entity.kind] += 1;
  const frozenEntities = Object.freeze(entities);
  const frozenElements = Object.freeze(elements);
  const frozenComponents = Object.freeze(components);
  const frozenExpandedItems = Object.freeze(expandedItems);

  return Object.freeze({
    document: Object.freeze({
      ...previous.document,
      entities: frozenEntities,
    }),
    diagnostics: Object.freeze(
      previous.diagnostics.filter((diagnostic) =>
        !diagnostic.path.startsWith('$.renderer.')),
    ),
    identity: Object.freeze({
      counts: Object.freeze({
        sourceElements: frozenElements.length,
        sourceComponents: frozenComponents.length,
        expandedItems: frozenExpandedItems.length,
        gridCells: frozenExpandedItems.filter((entry) => entry.grid !== undefined).length,
        relationLinks: kinds.relation,
        entities: frozenEntities.length,
        kinds: Object.freeze(kinds),
      }),
      entityIds: Object.freeze(frozenEntities.map((entity) => entity.id)),
      entityIdsBySourceId: Object.freeze(orderedEntityIdsBySourceId),
      entityIdsByComponentId: Object.freeze(orderedEntityIdsByComponentId),
      entitySourceById: Object.freeze(orderedEntitySourceById),
      elements: frozenElements,
      components: frozenComponents,
      expandedItems: frozenExpandedItems,
    }),
    projection: freezeProjection(projection),
  });
}

/**
 * Geometry/text edits preserve dense identity. In that common editor path,
 * replace only dirty immutable records and shallow projection tables instead
 * of rebuilding every identity map and validating every unchanged entity.
 */
function combineStableRootFragments(
  fragments: readonly RootFragment[],
  previous: ParsePatchMapResult,
  recordStrategy: PatchMapStableRecordStrategy,
): ParsePatchMapResult | null {
  const previousFragments = ROOT_FRAGMENTS_CACHE.get(previous);
  if (
    previousFragments === undefined ||
    previousFragments.length !== fragments.length
  ) {
    return null;
  }
  const dirtyIndices: number[] = [];
  for (let index = 0; index < fragments.length; index += 1) {
    if (fragments[index] !== previousFragments[index]) dirtyIndices.push(index);
  }
  if (dirtyIndices.length === 0) return null;
  const indexes = stableParseIndexes(previous);
  if (indexes === null) return null;

  const entities = [...previous.document.entities];
  const elements = [...previous.identity.elements];
  const components = [...previous.identity.components];
  const dirtyEntityIds: string[] = [];

  for (const rootIndex of dirtyIndices) {
    const before = previousFragments[rootIndex];
    const after = fragments[rootIndex];
    if (
      before === undefined ||
      after === undefined ||
      !sameElementIdentities(before.elements, after.elements) ||
      !sameComponentIdentities(before.components, after.components) ||
      !sameExpandedIdentities(before.expandedItems, after.expandedItems) ||
      !sameEntityIdentities(before.entities, after.entities) ||
      !sameEntitySourceIdentities(before, after)
    ) {
      return null;
    }
    for (const element of after.elements) {
      const index = indexes.elementByPath.get(element.sourcePath);
      if (index === undefined) return null;
      elements[index] = element;
    }
    for (const component of after.components) {
      const index = indexes.componentByPath.get(component.componentPath);
      if (index === undefined) return null;
      components[index] = component;
    }
    for (const entity of after.entities) {
      const index = indexes.entityById.get(entity.id);
      if (index === undefined) return null;
      entities[index] = entity;
      dirtyEntityIds.push(entity.id);
    }
  }

  const projection = patchStableProjection(
    previous.projection,
    fragments,
    dirtyIndices,
    dirtyEntityIds,
    recordStrategy,
  );
  if (projection === null) return null;
  const result = Object.freeze({
    document: Object.freeze({
      ...previous.document,
      entities: Object.freeze(entities),
    }),
    diagnostics: Object.freeze(
      previous.diagnostics.filter((diagnostic) =>
        !diagnostic.path.startsWith('$.renderer.')),
    ),
    identity: Object.freeze({
      ...previous.identity,
      elements: Object.freeze(elements),
      components: Object.freeze(components),
    }),
    projection,
  });
  STABLE_PARSE_INDEX_CACHE.set(result, indexes);
  return result;
}

function sameElementIdentities(
  before: readonly ElementIdentity[],
  after: readonly ElementIdentity[],
): boolean {
  return sameStableRecords(before, after, (left, right) => (
    left.sourceId === right.sourceId &&
    left.sourcePath === right.sourcePath &&
    left.type === right.type &&
    sameStringArray(left.entityIds, right.entityIds)
  ));
}

function sameComponentIdentities(
  before: readonly ComponentIdentity[],
  after: readonly ComponentIdentity[],
): boolean {
  return sameStableRecords(before, after, (left, right) => (
    left.componentId === right.componentId &&
    left.componentPath === right.componentPath &&
    left.type === right.type &&
    left.sourceElementId === right.sourceElementId &&
    sameStringArray(left.entityIds, right.entityIds)
  ));
}

function sameExpandedIdentities(
  before: readonly ExpandedItemIdentity[],
  after: readonly ExpandedItemIdentity[],
): boolean {
  return sameStableRecords(before, after, (left, right) => (
    left.instanceId === right.instanceId &&
    left.sourceElementId === right.sourceElementId &&
    left.sourcePath === right.sourcePath &&
    sameStringArray(left.entityIds, right.entityIds) &&
    (
      left.grid === right.grid ||
      (
        left.grid !== undefined &&
        right.grid !== undefined &&
        left.grid.row === right.grid.row &&
        left.grid.column === right.grid.column &&
        left.grid.cell === right.grid.cell
      )
    )
  ));
}

function sameEntityIdentities(
  before: readonly EntityInput[],
  after: readonly EntityInput[],
): boolean {
  return sameStableRecords(before, after, (left, right) => (
    left.id === right.id && left.kind === right.kind
  ));
}

function sameEntitySourceIdentities(
  before: RootFragment,
  after: RootFragment,
): boolean {
  return after.entities.every((entity) => {
    const left = before.entitySources[entity.id];
    const right = after.entitySources[entity.id];
    return (
      left !== undefined &&
      right !== undefined &&
      left.entityId === right.entityId &&
      left.sourceElementId === right.sourceElementId &&
      left.sourceElementPath === right.sourceElementPath &&
      left.instanceId === right.instanceId &&
      left.componentId === right.componentId &&
      left.componentPath === right.componentPath
    );
  });
}

function sameStableRecords<Value>(
  before: readonly Value[],
  after: readonly Value[],
  same: (left: Value, right: Value) => boolean,
): boolean {
  return (
    before.length === after.length &&
    before.every((entry, index) => {
      const candidate = after[index];
      return candidate !== undefined && same(entry, candidate);
    })
  );
}

function freezeRecordArrays(record: Record<string, string[]>): void {
  for (const key of Object.keys(record)) Object.freeze(record[key]);
}

function appendIdentityEntityId(
  record: Record<string, string[]>,
  key: string,
  entityId: string,
): void {
  const ids = record[key] ?? (record[key] = []);
  ids.push(entityId);
}

function reorderRecordLike<Value>(
  order: Readonly<Record<string, unknown>>,
  candidate: Readonly<Record<string, Value>>,
): Record<string, Value> | null {
  const ordered = Object.create(null) as Record<string, Value>;
  const keys = Object.keys(order);
  if (keys.length !== Object.keys(candidate).length) return null;
  for (const key of keys) {
    const value = candidate[key];
    if (value === undefined) return null;
    ordered[key] = value;
  }
  return ordered;
}
