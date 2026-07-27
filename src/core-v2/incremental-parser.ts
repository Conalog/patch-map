import type { EntityInput, EntityKind } from '../core-v1/contracts';
import type {
  ComponentIdentity,
  CoreV2ProjectionIndex,
  ElementIdentity,
  EntitySourceIdentity,
  ExpandedItemIdentity,
  ParseDiagnostic,
  ParsePatchMapOptions,
  ParsePatchMapResult,
} from './contracts';
import { parsePatchMapV010SelectedRoots } from './parser';

type JsonRecord = Readonly<Record<string, unknown>>;

interface RootFragment {
  readonly element: ElementIdentity;
  readonly components: readonly ComponentIdentity[];
  readonly expandedItems: readonly ExpandedItemIdentity[];
  readonly entities: readonly EntityInput[];
  readonly entitySources: Readonly<Record<string, EntitySourceIdentity>>;
  readonly projection: CoreV2ProjectionIndex;
}

const FLAT_INCREMENTAL_ELEMENT_TYPES = new Set([
  'item',
  'rect',
  'image',
  'text',
]);

/**
 * Reparse only explicitly dirty top-level roots for the common flat editor
 * scene. This is deliberately a guarded optimization, not a second parser:
 * relation, hierarchy, grid, diagnostic, identity, or root-order complexity
 * returns `null` so the caller can run the canonical full parser unchanged.
 *
 * `dirtyRootIds` is trusted only after the Engine has atomically staged its
 * own detached candidate. Direct caller input must continue through the full
 * parser unless every unchanged root is covered by that transaction authority.
 */
export function parsePatchMapV010IncrementalFlat(
  input: unknown,
  previous: ParsePatchMapResult,
  dirtyRootIds: readonly string[],
  options: ParsePatchMapOptions = {},
): ParsePatchMapResult | null {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    dirtyRootIds.length === 0 ||
    previous.diagnostics.length !== 0 ||
    previous.identity.counts.relationLinks !== 0 ||
    previous.identity.elements.length !== input.length
  ) {
    return null;
  }
  const roots = input as readonly unknown[];

  const dirty = new Set(dirtyRootIds);
  if (dirty.size !== dirtyRootIds.length) return null;
  const previousFragments = previousRootFragments(previous, roots.length);
  if (previousFragments === null) return null;

  const dirtyIndices: number[] = [];
  for (let index = 0; index < roots.length; index += 1) {
    const value = roots[index];
    const previousFragment = previousFragments[index];
    if (
      previousFragment === undefined ||
      !isRecord(value) ||
      value.id !== previousFragment.element.sourceId ||
      value.type !== previousFragment.element.type ||
      !FLAT_INCREMENTAL_ELEMENT_TYPES.has(previousFragment.element.type)
    ) {
      return null;
    }
    if (dirty.has(previousFragment.element.sourceId)) {
      dirtyIndices.push(index);
      dirty.delete(previousFragment.element.sourceId);
    }
  }
  if (dirty.size !== 0) return null;
  const selected = parsePatchMapV010SelectedRoots(roots, dirtyIndices, options);
  if (
    selected.diagnostics.length !== 0 ||
    selected.identity.counts.relationLinks !== 0 ||
    selected.identity.elements.length !== dirtyIndices.length
  ) {
    return null;
  }
  const selectedFragments = selectedRootFragments(
    selected,
    roots.length,
    new Set(dirtyIndices),
  );
  if (selectedFragments === null) return null;
  return combineRootFragments(previousFragments.map((fragment, index) =>
    selectedFragments.get(index) ?? fragment));
}

function previousRootFragments(
  previous: ParsePatchMapResult,
  rootCount: number,
): readonly RootFragment[] | null {
  const rootIndexById = new Map<string, number>();
  const elements = Array.from(
    { length: rootCount },
    (): ElementIdentity | undefined => undefined,
  );
  for (const element of previous.identity.elements) {
    const index = exactRootIndex(element.sourcePath);
    if (
      index === null ||
      index >= rootCount ||
      elements[index] !== undefined ||
      rootIndexById.has(element.sourceId)
    ) {
      return null;
    }
    elements[index] = element;
    rootIndexById.set(element.sourceId, index);
  }
  if (elements.some((element) => element === undefined)) return null;

  const components = Array.from(
    { length: rootCount },
    () => [] as ComponentIdentity[],
  );
  for (const component of previous.identity.components) {
    const index = rootIndexById.get(component.sourceElementId);
    if (index === undefined) return null;
    components[index]!.push(component);
  }

  const expandedItems = Array.from(
    { length: rootCount },
    () => [] as ExpandedItemIdentity[],
  );
  for (const expanded of previous.identity.expandedItems) {
    const index = rootIndexById.get(expanded.sourceElementId);
    if (index === undefined) return null;
    expandedItems[index]!.push(expanded);
  }

  const entities = Array.from(
    { length: rootCount },
    () => [] as EntityInput[],
  );
  const entitySources = Array.from(
    { length: rootCount },
    () => Object.create(null) as Record<string, EntitySourceIdentity>,
  );
  for (const entity of previous.document.entities) {
    const source = previous.identity.entitySourceById[entity.id];
    const index = source === undefined
      ? undefined
      : rootIndexById.get(source.sourceElementId);
    if (source === undefined || index === undefined) return null;
    entities[index]!.push(entity);
    entitySources[index]![entity.id] = source;
  }

  return Object.freeze(elements.map((element, index) => Object.freeze({
    element: element!,
    components: Object.freeze(components[index]!),
    expandedItems: Object.freeze(expandedItems[index]!),
    entities: Object.freeze(entities[index]!),
    entitySources: Object.freeze(entitySources[index]!),
    projection: projectionForEntities(previous.projection, entities[index]!),
  })));
}

function selectedRootFragments(
  parsed: ParsePatchMapResult,
  rootCount: number,
  expectedIndices: ReadonlySet<number>,
): ReadonlyMap<number, RootFragment> | null {
  const elements = new Map<number, ElementIdentity>();
  const rootIndexById = new Map<string, number>();
  for (const element of parsed.identity.elements) {
    const index = exactRootIndex(element.sourcePath);
    if (
      index === null ||
      index >= rootCount ||
      !expectedIndices.has(index) ||
      elements.has(index) ||
      rootIndexById.has(element.sourceId)
    ) {
      return null;
    }
    elements.set(index, element);
    rootIndexById.set(element.sourceId, index);
  }
  if (elements.size !== expectedIndices.size) return null;

  const components = new Map<number, ComponentIdentity[]>();
  const expandedItems = new Map<number, ExpandedItemIdentity[]>();
  const entities = new Map<number, EntityInput[]>();
  const entitySources = new Map<number, Record<string, EntitySourceIdentity>>();
  for (const index of expectedIndices) {
    components.set(index, []);
    expandedItems.set(index, []);
    entities.set(index, []);
    entitySources.set(index, Object.create(null) as Record<string, EntitySourceIdentity>);
  }
  for (const component of parsed.identity.components) {
    const index = rootIndexById.get(component.sourceElementId);
    if (index === undefined) return null;
    components.get(index)!.push(component);
  }
  for (const expanded of parsed.identity.expandedItems) {
    const index = rootIndexById.get(expanded.sourceElementId);
    if (index === undefined) return null;
    expandedItems.get(index)!.push(expanded);
  }
  for (const entity of parsed.document.entities) {
    const source = parsed.identity.entitySourceById[entity.id];
    const index = source === undefined
      ? undefined
      : rootIndexById.get(source.sourceElementId);
    if (source === undefined || index === undefined) return null;
    entities.get(index)!.push(entity);
    entitySources.get(index)![entity.id] = source;
  }

  const fragments = new Map<number, RootFragment>();
  for (const index of expectedIndices) {
    fragments.set(index, Object.freeze({
      element: elements.get(index)!,
      components: Object.freeze(components.get(index)!),
      expandedItems: Object.freeze(expandedItems.get(index)!),
      entities: Object.freeze(entities.get(index)!),
      entitySources: Object.freeze(entitySources.get(index)!),
      projection: projectionForEntities(parsed.projection, entities.get(index)!),
    }));
  }
  return fragments;
}

function combineRootFragments(
  fragments: readonly RootFragment[],
): ParsePatchMapResult | null {
  const entities: EntityInput[] = [];
  const elements: ElementIdentity[] = [];
  const components: ComponentIdentity[] = [];
  const expandedItems: ExpandedItemIdentity[] = [];
  const entityIds = new Set<string>();
  const sourceIds = new Set<string>();
  const entityIdsBySourceId = Object.create(null) as Record<string, string[]>;
  const entityIdsByComponentId = Object.create(null) as Record<string, string[]>;
  const entitySourceById = Object.create(null) as Record<string, EntitySourceIdentity>;
  const projection = emptyProjection();

  for (const fragment of fragments) {
    if (sourceIds.has(fragment.element.sourceId)) return null;
    sourceIds.add(fragment.element.sourceId);
    elements.push(fragment.element);
    components.push(...fragment.components);
    expandedItems.push(...fragment.expandedItems);
    entityIdsBySourceId[fragment.element.sourceId] = [
      ...fragment.element.entityIds,
    ];
    for (const component of fragment.components) {
      const componentIds = entityIdsByComponentId[component.componentId] ??
        (entityIdsByComponentId[component.componentId] = []);
      componentIds.push(...component.entityIds);
    }
    for (const entity of fragment.entities) {
      if (entityIds.has(entity.id)) return null;
      entityIds.add(entity.id);
      entities.push(entity);
      const source = fragment.entitySources[entity.id];
      if (source === undefined) return null;
      entitySourceById[entity.id] = source;
      appendProjectionEntity(projection, fragment.projection, entity.id);
    }
  }

  freezeRecordArrays(entityIdsBySourceId);
  freezeRecordArrays(entityIdsByComponentId);
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
      version: 1,
      entities: frozenEntities,
    }),
    diagnostics: Object.freeze([] as ParseDiagnostic[]),
    identity: Object.freeze({
      counts: Object.freeze({
        sourceElements: frozenElements.length,
        sourceComponents: frozenComponents.length,
        expandedItems: frozenExpandedItems.length,
        gridCells: frozenExpandedItems.filter((entry) => entry.grid !== undefined).length,
        relationLinks: 0,
        entities: frozenEntities.length,
        kinds: Object.freeze(kinds),
      }),
      entityIds: Object.freeze(frozenEntities.map((entity) => entity.id)),
      entityIdsBySourceId: Object.freeze(entityIdsBySourceId),
      entityIdsByComponentId: Object.freeze(entityIdsByComponentId),
      entitySourceById: Object.freeze(entitySourceById),
      elements: frozenElements,
      components: frozenComponents,
      expandedItems: frozenExpandedItems,
    }),
    projection: freezeProjection(projection),
  });
}

function projectionForEntities(
  source: CoreV2ProjectionIndex,
  entities: readonly EntityInput[],
): CoreV2ProjectionIndex {
  const projection = emptyProjection();
  for (const entity of entities) appendProjectionEntity(projection, source, entity.id);
  return freezeProjection(projection);
}

function emptyProjection(): MutableProjection {
  return {
    byEntityId: Object.create(null) as MutableProjection['byEntityId'],
    componentsByEntityId:
      Object.create(null) as MutableProjection['componentsByEntityId'],
    backgroundsByEntityId:
      Object.create(null) as MutableProjection['backgroundsByEntityId'],
    imagesByEntityId: Object.create(null) as MutableProjection['imagesByEntityId'],
    textsByEntityId: Object.create(null) as MutableProjection['textsByEntityId'],
    barsByEntityId: Object.create(null) as MutableProjection['barsByEntityId'],
    relationsByEntityId:
      Object.create(null) as MutableProjection['relationsByEntityId'],
    omittedRelations: [],
  };
}

interface MutableProjection {
  readonly byEntityId: Record<string, NonNullable<CoreV2ProjectionIndex['byEntityId'][string]>>;
  readonly componentsByEntityId: Record<string, NonNullable<
    NonNullable<CoreV2ProjectionIndex['componentsByEntityId']>[string]
  >>;
  readonly backgroundsByEntityId: Record<string, NonNullable<
    NonNullable<CoreV2ProjectionIndex['backgroundsByEntityId']>[string]
  >>;
  readonly imagesByEntityId: Record<string, NonNullable<
    NonNullable<CoreV2ProjectionIndex['imagesByEntityId']>[string]
  >>;
  readonly textsByEntityId: Record<string, NonNullable<
    NonNullable<CoreV2ProjectionIndex['textsByEntityId']>[string]
  >>;
  readonly barsByEntityId: Record<string, NonNullable<
    NonNullable<CoreV2ProjectionIndex['barsByEntityId']>[string]
  >>;
  readonly relationsByEntityId: Record<string, NonNullable<
    NonNullable<CoreV2ProjectionIndex['relationsByEntityId']>[string]
  >>;
  readonly omittedRelations: NonNullable<CoreV2ProjectionIndex['omittedRelations']>[number][];
}

function appendProjectionEntity(
  target: MutableProjection,
  source: CoreV2ProjectionIndex,
  entityId: string,
): void {
  appendRecordValue(target.byEntityId, source.byEntityId, entityId);
  appendRecordValue(target.componentsByEntityId, source.componentsByEntityId, entityId);
  appendRecordValue(target.backgroundsByEntityId, source.backgroundsByEntityId, entityId);
  appendRecordValue(target.imagesByEntityId, source.imagesByEntityId, entityId);
  appendRecordValue(target.textsByEntityId, source.textsByEntityId, entityId);
  appendRecordValue(target.barsByEntityId, source.barsByEntityId, entityId);
  appendRecordValue(target.relationsByEntityId, source.relationsByEntityId, entityId);
}

function appendRecordValue<Value>(
  target: Record<string, Value>,
  source: Readonly<Record<string, Value>> | undefined,
  key: string,
): void {
  const value = source?.[key];
  if (value !== undefined) target[key] = value;
}

function freezeProjection(projection: MutableProjection): CoreV2ProjectionIndex {
  return Object.freeze({
    byEntityId: Object.freeze(projection.byEntityId),
    componentsByEntityId: Object.freeze(projection.componentsByEntityId),
    backgroundsByEntityId: Object.freeze(projection.backgroundsByEntityId),
    imagesByEntityId: Object.freeze(projection.imagesByEntityId),
    textsByEntityId: Object.freeze(projection.textsByEntityId),
    barsByEntityId: Object.freeze(projection.barsByEntityId),
    relationsByEntityId: Object.freeze(projection.relationsByEntityId),
    omittedRelations: Object.freeze(projection.omittedRelations),
  });
}

function exactRootIndex(path: string): number | null {
  const match = /^\$\[(\d+)\]$/.exec(path);
  if (match === null) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : null;
}

function freezeRecordArrays(record: Record<string, string[]>): void {
  for (const key of Object.keys(record)) Object.freeze(record[key]);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
