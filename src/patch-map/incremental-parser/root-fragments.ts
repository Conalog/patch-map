import type { EntityInput } from '../dense/contracts';
import type {
  ComponentIdentity,
  ElementIdentity,
  EntitySourceIdentity,
  ExpandedItemIdentity,
  ParsePatchMapResult,
} from '../contracts';

import { ROOT_FRAGMENTS_CACHE } from './cache-indexes';
import type { JsonRecord, RootFragment } from './contracts';
import { projectionForEntities } from './projection-patch';

export type { JsonRecord, RootFragment } from './contracts';

export function previousRootFragments(
  previous: ParsePatchMapResult,
  rootCount: number,
): readonly RootFragment[] | null {
  const cached = ROOT_FRAGMENTS_CACHE.get(previous);
  if (cached !== undefined && cached.length === rootCount) return cached;

  const rootIndexById = new Map<string, number>();
  const rootElements = Array.from(
    { length: rootCount },
    (): ElementIdentity | undefined => undefined,
  );
  const elements = Array.from(
    { length: rootCount },
    () => [] as ElementIdentity[],
  );
  for (const element of previous.identity.elements) {
    const index = rootIndexFromPath(element.sourcePath);
    if (
      index === null ||
      index >= rootCount ||
      rootIndexById.has(element.sourceId)
    ) {
      return null;
    }
    elements[index]!.push(element);
    if (exactRootIndex(element.sourcePath) === index) {
      if (rootElements[index] !== undefined) return null;
      rootElements[index] = element;
    }
    rootIndexById.set(element.sourceId, index);
  }
  if (rootElements.some((element) => element === undefined)) return null;

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

  const fragments = Object.freeze(rootElements.map((element, index) => Object.freeze({
    element: element!,
    elements: Object.freeze(elements[index]!),
    components: Object.freeze(components[index]!),
    expandedItems: Object.freeze(expandedItems[index]!),
    entities: Object.freeze(entities[index]!),
    entitySources: Object.freeze(entitySources[index]!),
    projection: projectionForEntities(
      previous.projection,
      entities[index]!,
      previous.projection.omittedRelations.filter(
        ({ relationId }) => relationId === element!.sourceId,
      ),
    ),
  })));
  ROOT_FRAGMENTS_CACHE.set(previous, fragments);
  return fragments;
}

export function parsedRootCount(parsed: ParsePatchMapResult): number {
  let rootCount = 0;
  for (const element of parsed.identity.elements) {
    const index = exactRootIndex(element.sourcePath);
    if (index !== null) rootCount = Math.max(rootCount, index + 1);
  }
  return rootCount;
}

export function rebaseRootFragment(
  fragment: RootFragment,
  previousIndex: number,
  nextIndex: number,
): RootFragment {
  const previousPrefix = `$[${previousIndex}]`;
  const nextPrefix = `$[${nextIndex}]`;
  const rebase = (path: string): string => {
    if (!path.startsWith(previousPrefix)) return path;
    const suffix = path[previousPrefix.length];
    return suffix === undefined || suffix === '.' || suffix === '['
      ? `${nextPrefix}${path.slice(previousPrefix.length)}`
      : path;
  };
  let element: ElementIdentity | undefined;
  const mutableElements: ElementIdentity[] = [];
  for (const current of fragment.elements) {
    const rebased = rebaseElementIdentity(current, rebase(current.sourcePath));
    mutableElements.push(rebased);
    if (current === fragment.element) element = rebased;
  }
  if (element === undefined) {
    throw new Error('incremental structural root lost its rebased identity');
  }
  const elements = Object.freeze(mutableElements);
  const components = Object.freeze(fragment.components.map((component) =>
    rebaseComponentIdentity(component, rebase(component.componentPath))));
  const expandedItems = Object.freeze(fragment.expandedItems.map((expanded) =>
    rebaseExpandedItemIdentity(expanded, rebase(expanded.sourcePath))));
  const entitySources = Object.create(null) as Record<string, EntitySourceIdentity>;
  for (const entityInput of fragment.entities) {
    const source = fragment.entitySources[entityInput.id];
    if (source === undefined) {
      throw new Error('incremental structural root lost its entity source identity');
    }
    entitySources[entityInput.id] = rebaseEntitySourceIdentity(source, rebase);
  }
  return Object.freeze({
    element,
    elements,
    components,
    expandedItems,
    entities: fragment.entities,
    entitySources: Object.freeze(entitySources),
    projection: fragment.projection,
  });
}

function rebaseElementIdentity(
  element: ElementIdentity,
  sourcePath: string,
): ElementIdentity {
  const rebased: {
    sourceId: string;
    sourcePath: string;
    type: string;
    label?: string;
    entityIds: readonly string[];
    rawAttrs?: Readonly<Record<string, unknown>>;
    rawMetadata?: unknown;
  } = {
    sourceId: element.sourceId,
    sourcePath,
    type: element.type,
    entityIds: element.entityIds,
  };
  if (element.label !== undefined) rebased.label = element.label;
  if (element.rawAttrs !== undefined) rebased.rawAttrs = element.rawAttrs;
  if (Object.hasOwn(element, 'rawMetadata')) rebased.rawMetadata = element.rawMetadata;
  return Object.freeze(rebased);
}

function rebaseComponentIdentity(
  component: ComponentIdentity,
  componentPath: string,
): ComponentIdentity {
  const rebased: {
    componentId: string;
    componentPath: string;
    type: string;
    label?: string;
    sourceElementId: string;
    entityIds: readonly string[];
    rawAttrs?: Readonly<Record<string, unknown>>;
    rawMetadata?: unknown;
  } = {
    componentId: component.componentId,
    componentPath,
    type: component.type,
    sourceElementId: component.sourceElementId,
    entityIds: component.entityIds,
  };
  if (component.label !== undefined) rebased.label = component.label;
  if (component.rawAttrs !== undefined) rebased.rawAttrs = component.rawAttrs;
  if (Object.hasOwn(component, 'rawMetadata')) {
    rebased.rawMetadata = component.rawMetadata;
  }
  return Object.freeze(rebased);
}

function rebaseExpandedItemIdentity(
  expanded: ExpandedItemIdentity,
  sourcePath: string,
): ExpandedItemIdentity {
  return Object.freeze({
    instanceId: expanded.instanceId,
    sourceElementId: expanded.sourceElementId,
    sourcePath,
    entityIds: expanded.entityIds,
    ...(expanded.grid === undefined ? {} : { grid: expanded.grid }),
  });
}

function rebaseEntitySourceIdentity(
  source: EntitySourceIdentity,
  rebase: (path: string) => string,
): EntitySourceIdentity {
  return Object.freeze({
    entityId: source.entityId,
    sourceElementId: source.sourceElementId,
    sourceElementPath: rebase(source.sourceElementPath),
    ...(source.instanceId === undefined ? {} : { instanceId: source.instanceId }),
    ...(source.componentId === undefined ? {} : { componentId: source.componentId }),
    ...(source.componentPath === undefined
      ? {}
      : { componentPath: rebase(source.componentPath) }),
  });
}

export function rebaseRootPath(
  path: string,
  previousIndex: number,
  nextIndex: number,
): string {
  const prefix = `$[${previousIndex}]`;
  return path === prefix || path.startsWith(`${prefix}.`) ||
    path.startsWith(`${prefix}[`)
    ? `$[${nextIndex}]${path.slice(prefix.length)}`
    : path;
}

export function selectedRootFragments(
  parsed: ParsePatchMapResult,
  rootCount: number,
  expectedIndices: ReadonlySet<number>,
): ReadonlyMap<number, RootFragment> | null {
  const rootElements = new Map<number, ElementIdentity>();
  const elements = new Map<number, ElementIdentity[]>();
  const rootIndexById = new Map<string, number>();
  for (const element of parsed.identity.elements) {
    const index = rootIndexFromPath(element.sourcePath);
    if (
      index === null ||
      index >= rootCount ||
      !expectedIndices.has(index) ||
      rootIndexById.has(element.sourceId)
    ) {
      return null;
    }
    elements.get(index)?.push(element);
    if (!elements.has(index)) elements.set(index, [element]);
    if (exactRootIndex(element.sourcePath) === index) {
      if (rootElements.has(index)) return null;
      rootElements.set(index, element);
    }
    rootIndexById.set(element.sourceId, index);
  }
  if (rootElements.size !== expectedIndices.size) return null;

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
      element: rootElements.get(index)!,
      elements: Object.freeze(elements.get(index)!),
      components: Object.freeze(components.get(index)!),
      expandedItems: Object.freeze(expandedItems.get(index)!),
      entities: Object.freeze(entities.get(index)!),
      entitySources: Object.freeze(entitySources.get(index)!),
      projection: projectionForEntities(
        parsed.projection,
        entities.get(index)!,
        parsed.projection.omittedRelations.filter(
          ({ relationId }) => relationId === rootElements.get(index)!.sourceId,
        ),
      ),
    }));
  }
  return fragments;
}

function exactRootIndex(path: string): number | null {
  const match = /^\$\[(\d+)\]$/.exec(path);
  if (match === null) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : null;
}

export function rootIndexFromPath(path: string): number | null {
  const match = /^\$\[(\d+)\]/.exec(path);
  if (match === null) return null;
  const suffix = path[match[0].length];
  if (suffix !== undefined && suffix !== '.' && suffix !== '[') return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : null;
}

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
