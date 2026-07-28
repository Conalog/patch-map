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
  readonly elements: readonly ElementIdentity[];
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
const ROOT_FRAGMENTS_CACHE = new WeakMap<
  ParsePatchMapResult,
  readonly RootFragment[]
>();
const STABLE_PARSE_INDEX_CACHE = new WeakMap<
  ParsePatchMapResult,
  StableParseIndexes
>();

/**
 * Renderer-only diagnostic shells retain the same parser identity graph.
 * Preserve the private fragment/index accelerators across that immutable
 * wrapper so a sequence of structural editor commands remains incremental.
 */
export function inheritPatchMapV010IncrementalParserCaches(
  source: ParsePatchMapResult,
  target: ParsePatchMapResult,
): void {
  if (source === target) return;
  const fragments = ROOT_FRAGMENTS_CACHE.get(source);
  if (fragments !== undefined) ROOT_FRAGMENTS_CACHE.set(target, fragments);
  const indexes = STABLE_PARSE_INDEX_CACHE.get(source);
  if (indexes !== undefined) STABLE_PARSE_INDEX_CACHE.set(target, indexes);
}

interface StableParseIndexes {
  readonly entityById: ReadonlyMap<string, number>;
  readonly elementByPath: ReadonlyMap<string, number>;
  readonly componentByPath: ReadonlyMap<string, number>;
}

/**
 * Build the immutable identity/slot indexes while a freshly loaded scene is
 * already doing one-time setup. Without this warm-up, the first transformer
 * commit pays the O(scene) index construction cost on pointer-up even though
 * every subsequent edit uses the incremental path.
 */
export function primePatchMapV010IncrementalFlat(
  parsed: ParsePatchMapResult,
): boolean {
  const rootCount = parsedRootCount(parsed);
  if (rootCount === 0) return false;
  return previousRootFragments(parsed, rootCount) !== null &&
    stableParseIndexes(parsed) !== null;
}

/**
 * Reuse unchanged, parser-owned root fragments across one Engine-authorized
 * top-level structural edit. Moved roots receive exact source-path rebasing;
 * new or structurally changed roots still go through the canonical selected
 * parser. Relations fall back whenever an endpoint could have changed.
 */
export function parsePatchMapV010IncrementalStructure(
  input: unknown,
  previousInput: unknown,
  previous: ParsePatchMapResult,
  options: ParsePatchMapOptions = {},
): ParsePatchMapResult | null {
  if (
    !Array.isArray(input) ||
    !Array.isArray(previousInput) ||
    input.length === 0
  ) {
    return null;
  }
  const previousRootCount = parsedRootCount(previous);
  if (
    previousRootCount === 0 ||
    previousInput.length !== previousRootCount
  ) {
    return null;
  }
  const previousFragments = previousRootFragments(previous, previousRootCount);
  if (previousFragments === null) return null;
  const previousById = new Map<string, Readonly<{
    readonly fragment: RootFragment;
    readonly index: number;
    readonly root: unknown;
  }>>();
  for (let index = 0; index < previousFragments.length; index += 1) {
    const fragment = previousFragments[index];
    const root: unknown = previousInput[index];
    if (
      fragment === undefined ||
      !isRecord(root) ||
      root.id !== fragment.element.sourceId ||
      previousById.has(fragment.element.sourceId)
    ) {
      return null;
    }
    previousById.set(fragment.element.sourceId, Object.freeze({
      fragment,
      index,
      root,
    }));
  }

  const nextFragments: Array<RootFragment | undefined> =
    Array.from({ length: input.length }, () => undefined);
  const dirtyIndices: number[] = [];
  const dirtyIndexSet = new Set<number>();
  const reusedPreviousIndices = new Set<number>();
  const nextIds = new Set<string>();
  for (let index = 0; index < input.length; index += 1) {
    const root: unknown = input[index];
    if (!isRecord(root) || typeof root.id !== 'string' || nextIds.has(root.id)) {
      return null;
    }
    nextIds.add(root.id);
    const prior = previousById.get(root.id);
    if (
      prior !== undefined &&
      root === prior.root &&
      root.type === prior.fragment.element.type
    ) {
      nextFragments[index] = prior.index === index
        ? prior.fragment
        : rebaseRootFragment(prior.fragment, prior.index, index);
      reusedPreviousIndices.add(prior.index);
    } else {
      if (root.type === 'relations') return null;
      dirtyIndices.push(index);
      dirtyIndexSet.add(index);
    }
  }

  let selected: ParsePatchMapResult | null = null;
  const parseDirtyFragments = (knownTargetIds: readonly string[] = []): boolean => {
    selected = parsePatchMapV010SelectedRoots(
      input,
      dirtyIndices,
      options,
      knownTargetIds,
    );
    if (selected.diagnostics.some(({ level }) => level === 'error')) return false;
    const fragments = selectedRootFragments(
      selected,
      input.length,
      dirtyIndexSet,
    );
    if (fragments === null) return false;
    for (const [index, fragment] of fragments) nextFragments[index] = fragment;
    return true;
  };
  if (dirtyIndices.length > 0 && !parseDirtyFragments()) return null;
  if (nextFragments.some((fragment) => fragment === undefined)) return null;
  let completed = nextFragments as RootFragment[];
  const nextElementIds = new Set(
    completed.flatMap((fragment) =>
      fragment.elements.map(({ sourceId }) => sourceId)),
  );
  const removedElementIds = new Set<string>();
  for (const fragment of previousFragments) {
    for (const element of fragment.elements) {
      if (!nextElementIds.has(element.sourceId)) {
        removedElementIds.add(element.sourceId);
      }
    }
  }
  const relationProjectionChanged =
    relationEndpointsIntersect(previous.projection, removedElementIds) ||
    addedElementsActivateOmittedRelation(
      previous,
      new Set(previous.identity.elements.map(({ sourceId }) => sourceId)),
      completed,
    );
  if (relationProjectionChanged) {
    for (let index = 0; index < input.length; index += 1) {
      const root: unknown = input[index];
      if (!isRecord(root) || root.type !== 'relations') continue;
      if (!dirtyIndexSet.has(index)) {
        dirtyIndices.push(index);
        dirtyIndexSet.add(index);
      }
      const prior = typeof root.id === 'string' ? previousById.get(root.id) : undefined;
      if (prior !== undefined) reusedPreviousIndices.delete(prior.index);
      nextFragments[index] = undefined;
    }
    if (!nextFragments.some((fragment) => fragment === undefined)) return null;
    const knownTargetIds: string[] = [];
    for (const fragment of completed) {
      if (fragment === undefined) continue;
      for (const entity of fragment.entities) {
        if (entity.kind !== 'relation') knownTargetIds.push(entity.id);
      }
    }
    if (!parseDirtyFragments(knownTargetIds)) return null;
    if (nextFragments.some((fragment) => fragment === undefined)) return null;
    completed = nextFragments as RootFragment[];
  }
  const diagnostics = structuralDiagnostics(
    previous,
    previousFragments,
    completed,
    reusedPreviousIndices,
    selected,
  );
  if (diagnostics === null) return null;
  const combined = combineStructuralRootFragments(
    Object.freeze(completed),
    previous,
    diagnostics,
  );
  if (combined === null) return null;
  ROOT_FRAGMENTS_CACHE.set(combined, Object.freeze(completed));
  stableParseIndexes(combined);
  return combined;
}

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
  selectedParse?: ParsePatchMapResult,
): ParsePatchMapResult | null {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    dirtyRootIds.length === 0
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
      value.type !== previousFragment.element.type
    ) {
      return null;
    }
    if (dirty.has(previousFragment.element.sourceId)) {
      if (!FLAT_INCREMENTAL_ELEMENT_TYPES.has(previousFragment.element.type)) {
        return null;
      }
      dirtyIndices.push(index);
      dirty.delete(previousFragment.element.sourceId);
    }
  }
  if (dirty.size !== 0) return null;
  const dirtyIndexSet = new Set(dirtyIndices);
  if (previous.diagnostics.some((diagnostic) => {
    if (diagnostic.path.startsWith('$.renderer.')) return false;
    const index = rootIndexFromPath(diagnostic.path);
    return index === null || dirtyIndexSet.has(index);
  })) {
    return null;
  }
  const selected = selectedParse ??
    parsePatchMapV010SelectedRoots(roots, dirtyIndices, options);
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
    dirtyIndexSet,
  );
  if (selectedFragments === null) return null;
  const nextFragments = Object.freeze(previousFragments.map((fragment, index) =>
    selectedFragments.get(index) ?? fragment));
  const combined = combineRootFragments(nextFragments, previous);
  if (combined !== null) ROOT_FRAGMENTS_CACHE.set(combined, nextFragments);
  return combined;
}

function previousRootFragments(
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
      (previous.projection.omittedRelations ?? []).filter(
        ({ relationId }) => relationId === element!.sourceId,
      ),
    ),
  })));
  ROOT_FRAGMENTS_CACHE.set(previous, fragments);
  return fragments;
}

function parsedRootCount(parsed: ParsePatchMapResult): number {
  let rootCount = 0;
  for (const element of parsed.identity.elements) {
    const index = exactRootIndex(element.sourcePath);
    if (index !== null) rootCount = Math.max(rootCount, index + 1);
  }
  return rootCount;
}

function rebaseRootFragment(
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

function rebaseRootPath(
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

function relationEndpointsIntersect(
  projection: CoreV2ProjectionIndex,
  ids: ReadonlySet<string>,
): boolean {
  if (ids.size === 0) return false;
  const relations = [
    ...Object.values(projection.relationsByEntityId ?? {}),
    ...(projection.omittedRelations ?? []),
  ];
  return relations.some(({ sourceId, targetId }) =>
    ids.has(sourceId) || ids.has(targetId));
}

function addedElementsActivateOmittedRelation(
  previous: ParsePatchMapResult,
  previousElementIds: ReadonlySet<string>,
  fragments: readonly RootFragment[],
): boolean {
  const omitted = previous.projection.omittedRelations ?? [];
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

function structuralDiagnostics(
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

function selectedRootFragments(
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
        (parsed.projection.omittedRelations ?? []).filter(
          ({ relationId }) => relationId === rootElements.get(index)!.sourceId,
        ),
      ),
    }));
  }
  return fragments;
}

function combineStructuralRootFragments(
  fragments: readonly RootFragment[],
  previous: ParsePatchMapResult,
  diagnostics: readonly ParseDiagnostic[],
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
  const nonRelationEntities: Array<Readonly<{
    readonly entity: EntityInput;
    readonly fragment: RootFragment;
  }>> = [];
  const relationEntities: Array<Readonly<{
    readonly entity: EntityInput;
    readonly fragment: RootFragment;
  }>> = [];

  for (const fragment of fragments) {
    for (const element of fragment.elements) {
      if (sourceIds.has(element.sourceId)) return null;
      sourceIds.add(element.sourceId);
      elements.push(element);
    }
    components.push(...fragment.components);
    expandedItems.push(...fragment.expandedItems);
    for (const entity of fragment.entities) {
      if (entityIds.has(entity.id)) return null;
      entityIds.add(entity.id);
      (entity.kind === 'relation' ? relationEntities : nonRelationEntities)
        .push(Object.freeze({ entity, fragment }));
    }
  }
  for (const { entity, fragment } of [
    ...nonRelationEntities,
    ...relationEntities,
  ]) {
    entities.push(entity);
    const source = fragment.entitySources[entity.id];
    if (source === undefined) return null;
    entitySourceById[entity.id] = source;
    appendIdentityEntityId(
      entityIdsBySourceId,
      source.sourceElementId,
      entity.id,
    );
    for (const element of fragment.elements) {
      if (
        element.sourceId !== source.sourceElementId &&
        element.entityIds.includes(entity.id)
      ) {
        appendIdentityEntityId(
          entityIdsBySourceId,
          element.sourceId,
          entity.id,
        );
      }
    }
    if (source.componentId !== undefined) {
      appendIdentityEntityId(
        entityIdsByComponentId,
        source.componentId,
        entity.id,
      );
    }
    appendProjectionEntity(projection, fragment.projection, entity.id);
  }
  for (const fragment of fragments) {
    projection.omittedRelations.push(...(fragment.projection.omittedRelations ?? []));
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
        relationLinks: kinds.relation + projection.omittedRelations.length,
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
}

function combineRootFragments(
  fragments: readonly RootFragment[],
  previous: ParsePatchMapResult,
): ParsePatchMapResult | null {
  const stable = combineStableRootFragments(fragments, previous);
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
  projection.omittedRelations.push(...(previous.projection.omittedRelations ?? []));
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

function stableParseIndexes(previous: ParsePatchMapResult): StableParseIndexes | null {
  const cached = STABLE_PARSE_INDEX_CACHE.get(previous);
  if (cached !== undefined) return cached;
  const entityById = uniqueIndex(previous.document.entities, ({ id }) => id);
  const elementByPath = uniqueIndex(previous.identity.elements, ({ sourcePath }) => sourcePath);
  const componentByPath = uniqueIndex(
    previous.identity.components,
    ({ componentPath }) => componentPath,
  );
  if (entityById === null || elementByPath === null || componentByPath === null) {
    return null;
  }
  const indexes = Object.freeze({
    entityById,
    elementByPath,
    componentByPath,
  });
  STABLE_PARSE_INDEX_CACHE.set(previous, indexes);
  return indexes;
}

function uniqueIndex<Value>(
  values: readonly Value[],
  keyFor: (value: Value) => string,
): ReadonlyMap<string, number> | null {
  const result = new Map<string, number>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) return null;
    const key = keyFor(value);
    if (result.has(key)) return null;
    result.set(key, index);
  }
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
    sameStrings(left.entityIds, right.entityIds)
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
    sameStrings(left.entityIds, right.entityIds)
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
    sameStrings(left.entityIds, right.entityIds) &&
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

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function patchStableProjection(
  previous: CoreV2ProjectionIndex,
  fragments: readonly RootFragment[],
  dirtyIndices: readonly number[],
  entityIds: readonly string[],
): CoreV2ProjectionIndex | null {
  const selected = emptyProjection();
  for (const rootIndex of dirtyIndices) {
    const fragment = fragments[rootIndex];
    if (fragment === undefined) return null;
    for (const entity of fragment.entities) {
      appendProjectionEntity(selected, fragment.projection, entity.id);
    }
  }
  const byEntityId = patchProjectionRecord(previous.byEntityId, selected.byEntityId, entityIds);
  const componentsByEntityId = patchProjectionRecord(
    previous.componentsByEntityId,
    selected.componentsByEntityId,
    entityIds,
  );
  const backgroundsByEntityId = patchProjectionRecord(
    previous.backgroundsByEntityId,
    selected.backgroundsByEntityId,
    entityIds,
  );
  const imagesByEntityId = patchProjectionRecord(
    previous.imagesByEntityId,
    selected.imagesByEntityId,
    entityIds,
  );
  const textsByEntityId = patchProjectionRecord(
    previous.textsByEntityId,
    selected.textsByEntityId,
    entityIds,
  );
  const barsByEntityId = patchProjectionRecord(
    previous.barsByEntityId,
    selected.barsByEntityId,
    entityIds,
  );
  const relationsByEntityId = patchProjectionRecord(
    previous.relationsByEntityId,
    selected.relationsByEntityId,
    entityIds,
  );
  if (
    byEntityId === null ||
    componentsByEntityId === null ||
    backgroundsByEntityId === null ||
    imagesByEntityId === null ||
    textsByEntityId === null ||
    barsByEntityId === null ||
    relationsByEntityId === null
  ) {
    return null;
  }
  return Object.freeze({
    byEntityId,
    componentsByEntityId,
    backgroundsByEntityId,
    imagesByEntityId,
    textsByEntityId,
    barsByEntityId,
    relationsByEntityId,
    omittedRelations: previous.omittedRelations ?? Object.freeze([]),
  });
}

function patchProjectionRecord<Value>(
  previous: Readonly<Record<string, Value>> | undefined,
  selected: Readonly<Record<string, Value>>,
  entityIds: readonly string[],
): Readonly<Record<string, Value>> | null {
  const current: Readonly<Record<string, Value>> =
    previous ?? Object.freeze({} as Record<string, Value>);
  let changed = false;
  for (const entityId of entityIds) {
    if (
      Object.hasOwn(current, entityId) !==
      Object.hasOwn(selected, entityId)
    ) {
      return null;
    }
    const before = current[entityId];
    const after = selected[entityId];
    if (
      before !== after &&
      JSON.stringify(before) !== JSON.stringify(after)
    ) {
      changed = true;
    }
  }
  if (!changed) return current;
  const next = Object.assign(Object.create(null) as Record<string, Value>, current);
  for (const entityId of entityIds) {
    const value = selected[entityId];
    if (value !== undefined) next[entityId] = value;
  }
  return Object.freeze(next);
}

function projectionForEntities(
  source: CoreV2ProjectionIndex,
  entities: readonly EntityInput[],
  omittedRelations: readonly NonNullable<
    CoreV2ProjectionIndex['omittedRelations']
  >[number][] = [],
): CoreV2ProjectionIndex {
  const projection = emptyProjection();
  for (const entity of entities) appendProjectionEntity(projection, source, entity.id);
  projection.omittedRelations.push(...omittedRelations);
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

function rootIndexFromPath(path: string): number | null {
  const match = /^\$\[(\d+)\]/.exec(path);
  if (match === null) return null;
  const suffix = path[match[0].length];
  if (suffix !== undefined && suffix !== '.' && suffix !== '[') return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? index : null;
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

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
