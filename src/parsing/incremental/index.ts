import type { EntityInput } from '../../dense/contracts';
import type {
  PatchMapEntityProjection,
  ParsePatchMapOptions,
  ParsePatchMapResult,
} from '../contracts';
import { parsePatchMapSelectedRoots } from '..';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  patchMapAffineBasis,
  patchMapAffineCenter,
  createPatchMapAffine,
  invertPatchMapAffine,
  multiplyPatchMapAffine,
  projectPatchMapSignedRect,
  type PatchMapAffineMatrix,
} from '../../semantic/geometry';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from '../../semantic/stable-record-overlay';

import {
  DIRECT_ANGLE_LOCAL_AFFINE_CACHE,
  ROOT_FRAGMENTS_CACHE,
  STABLE_PARSE_INDEX_CACHE,
  STRUCTURAL_CHANGED_ENTITY_IDS_CACHE,
  stableParseIndexes,
} from './cache-indexes';
import {
  addedElementsActivateOmittedRelation,
  combineRootFragments,
  combineStructuralRootFragments,
  relationEndpointsIntersect,
  structuralDiagnostics,
} from './fragment-combine';
import {
  isRecord,
  parsedRootCount,
  previousRootFragments,
  rebaseRootFragment,
  rootIndexFromPath,
  selectedRootFragments,
} from './root-fragments';
import type {
  JsonRecord,
  RootFragment,
} from './contracts';

export {
  patchMapStructuralChangedEntityIds,
} from './cache-indexes';

const EMPTY_RECORD = Object.freeze({}) as JsonRecord;

const FLAT_INCREMENTAL_ELEMENT_TYPES = new Set([
  'item',
  'rect',
  'image',
  'text',
]);
const DIRECT_ANGLE_ELEMENT_TYPES = new Set([
  'item',
  'rect',
  'text',
]);

/**
 * Build the immutable identity/slot indexes while a freshly loaded scene is
 * already doing one-time setup. Without this warm-up, the first transformer
 * commit pays the O(scene) index construction cost on pointer-up even though
 * every subsequent edit uses the incremental path.
 */
export function primePatchMapIncrementalFlat(
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
export function parsePatchMapIncrementalStructure(
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
    selected = parsePatchMapSelectedRoots(
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
  const changedEntityIds: string[] = [];
  const changedEntityIdSet = new Set<string>();
  const appendChanged = (fragment: RootFragment | undefined): void => {
    for (const entity of fragment?.entities ?? []) {
      if (!changedEntityIdSet.has(entity.id)) {
        changedEntityIdSet.add(entity.id);
        changedEntityIds.push(entity.id);
      }
    }
  };
  for (let index = 0; index < previousFragments.length; index += 1) {
    if (!reusedPreviousIndices.has(index)) appendChanged(previousFragments[index]);
  }
  for (const index of dirtyIndices) appendChanged(completed[index]);
  STRUCTURAL_CHANGED_ENTITY_IDS_CACHE.set(
    combined,
    Object.freeze(changedEntityIds),
  );
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
export function parsePatchMapIncrementalFlat(
  input: unknown,
  previous: ParsePatchMapResult,
  dirtyRootIds: readonly string[],
  options: ParsePatchMapOptions = {},
  selectedParse?: ParsePatchMapResult,
  recordStrategy: PatchMapStableRecordStrategy = 'frozen-copy',
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
    parsePatchMapSelectedRoots(roots, dirtyIndices, options);
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
  const combined = combineRootFragments(nextFragments, previous, recordStrategy);
  if (combined !== null) ROOT_FRAGMENTS_CACHE.set(combined, nextFragments);
  return combined;
}

export interface PatchMapDirectElementAngleParseUpdate {
  readonly id: string;
  readonly angle: number;
}

/**
 * Re-project an Engine-owned batch that changes only absolute angles on flat
 * top-level roots. The canonical parser already established every identity,
 * component layout, paint, asset, and text record; this guarded path applies
 * the exact root affine delta to those stable projections instead of parsing
 * the same 5,000 component trees again.
 *
 * Any structural-sharing, relation, image-pivot, diagnostic, or finite-math
 * ambiguity returns `null` before publication so PatchMapRuntime can run the canonical
 * selected-root parser unchanged.
 */
export function parsePatchMapDirectElementAngleBatch(
  input: unknown,
  previousInput: unknown,
  previous: ParsePatchMapResult,
  updates: readonly PatchMapDirectElementAngleParseUpdate[],
  recordStrategy: PatchMapStableRecordStrategy = 'frozen-copy',
): ParsePatchMapResult | null {
  if (
    !Array.isArray(input) ||
    !Array.isArray(previousInput) ||
    input.length === 0 ||
    input.length !== previousInput.length ||
    updates.length === 0 ||
    Object.keys(previous.projection.relationsByEntityId).length > 0 ||
    previous.projection.omittedRelations.length > 0
  ) {
    return null;
  }
  const roots = input as readonly unknown[];
  const previousRoots = previousInput as readonly unknown[];

  const previousFragments = previousRootFragments(previous, roots.length);
  const indexes = stableParseIndexes(previous);
  if (previousFragments === null || indexes === null) return null;

  const updatesById = new Map<string, PatchMapDirectElementAngleParseUpdate>();
  for (const update of updates) {
    if (
      typeof update.id !== 'string' ||
      update.id.length === 0 ||
      !Number.isFinite(update.angle) ||
      updatesById.has(update.id)
    ) {
      return null;
    }
    updatesById.set(update.id, update);
  }

  const entities = [...previous.document.entities];
  const elements = [...previous.identity.elements];
  const selectedProjections = Object.create(null) as Record<
    string,
    PatchMapEntityProjection
  >;
  const dirtyEntityIds: string[] = [];
  const nextFragments: RootFragment[] = [...previousFragments];
  const localAffines: Map<string, PatchMapAffineMatrix> =
    DIRECT_ANGLE_LOCAL_AFFINE_CACHE.get(previous) ??
    new Map<string, PatchMapAffineMatrix>();
  let updatedRootCount = 0;

  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const beforeRoot: unknown = previousRoots[rootIndex];
    const afterRoot: unknown = roots[rootIndex];
    const fragment = previousFragments[rootIndex];
    if (
      fragment === undefined ||
      !isRecord(beforeRoot) ||
      !isRecord(afterRoot) ||
      beforeRoot.id !== fragment.element.sourceId ||
      afterRoot.id !== fragment.element.sourceId ||
      beforeRoot.type !== fragment.element.type ||
      afterRoot.type !== fragment.element.type
    ) {
      return null;
    }

    const update = updatesById.get(fragment.element.sourceId);
    if (update === undefined) {
      if (beforeRoot !== afterRoot) return null;
      continue;
    }
    updatedRootCount += 1;
    if (
      !DIRECT_ANGLE_ELEMENT_TYPES.has(fragment.element.type) ||
      !sameRecordExcept(beforeRoot, afterRoot, 'attrs')
    ) {
      return null;
    }
    const beforeAttrs = isRecord(beforeRoot.attrs) ? beforeRoot.attrs : EMPTY_RECORD;
    const afterAttrs = isRecord(afterRoot.attrs) ? afterRoot.attrs : EMPTY_RECORD;
    if (
      afterAttrs.angle !== update.angle ||
      Object.hasOwn(afterAttrs, 'rotation') ||
      !sameRecordExcept(beforeAttrs, afterAttrs, 'angle')
    ) {
      return null;
    }
    if (previous.diagnostics.some((diagnostic) => {
      if (diagnostic.path.startsWith('$.renderer.')) return false;
      return diagnostic.path === fragment.element.sourcePath ||
        diagnostic.path.startsWith(`${fragment.element.sourcePath}.`);
    })) {
      return null;
    }

    const rootProjection = fragment.projection.byEntityId[fragment.element.sourceId];
    if (rootProjection === undefined) return null;
    let rootAffine: PatchMapAffineMatrix;
    let inverseRootAffine: PatchMapAffineMatrix;
    try {
      rootAffine = createPatchMapAffine(
        finiteRecordNumber(afterAttrs, 'x', 0),
        finiteRecordNumber(afterAttrs, 'y', 0),
        update.angle,
        finiteRecordNumber(afterAttrs, 'scaleX', 1),
        finiteRecordNumber(afterAttrs, 'scaleY', 1),
      );
      inverseRootAffine = invertPatchMapAffine(rootProjection.affine);
    } catch {
      return null;
    }
    const angleDelta = update.angle - rootProjection.rotationDegrees;
    const fragmentEntities: EntityInput[] = [];
    const fragmentProjections = Object.create(null) as Record<
      string,
      PatchMapEntityProjection
    >;

    for (const entity of fragment.entities) {
      if (entity.kind === 'relation') return null;
      const projection = fragment.projection.byEntityId[entity.id];
      if (projection === undefined) return null;
      let localAffine = localAffines.get(entity.id);
      if (localAffine === undefined) {
        localAffine = entity.id === fragment.element.sourceId
          ? PATCH_MAP_IDENTITY_AFFINE
          : multiplyPatchMapAffine(inverseRootAffine, projection.affine);
        localAffines.set(entity.id, localAffine);
      }
      const affine = entity.id === fragment.element.sourceId
        ? rootAffine
        : multiplyPatchMapAffine(rootAffine, localAffine);
      const rotationDegrees = projection.rotationDegrees + angleDelta;
      const dense = projectPatchMapSignedRect(
        {
          x: affine[4],
          y: affine[5],
          rotation: rotationDegrees,
          scaleX: projection.scaleX,
          scaleY: projection.scaleY,
        },
        projection.localBounds[2],
        projection.localBounds[3],
      );
      const nextEntity = Object.freeze({
        ...entity,
        x: dense.x,
        y: dense.y,
        width: dense.width,
        height: dense.height,
        rotation: rotationDegrees,
      }) as EntityInput;
      const nextProjection = Object.freeze({
        ...projection,
        affine,
        worldBasis: patchMapAffineBasis(affine),
        visibleCenter: patchMapAffineCenter(affine, projection.localBounds),
        rotationDegrees,
      });
      const entityIndex = indexes.entityById.get(entity.id);
      if (entityIndex === undefined) return null;
      entities[entityIndex] = nextEntity;
      selectedProjections[entity.id] = nextProjection;
      fragmentEntities.push(nextEntity);
      fragmentProjections[entity.id] = nextProjection;
      dirtyEntityIds.push(entity.id);
    }

    const elementIndex = indexes.elementByPath.get(fragment.element.sourcePath);
    if (elementIndex === undefined) return null;
    const nextElement = Object.freeze({
      ...fragment.element,
      rawAttrs: afterAttrs,
    });
    elements[elementIndex] = nextElement;
    const fragmentElements = Object.freeze(fragment.elements.map((element) =>
      element === fragment.element ? nextElement : element));
    if (!fragmentElements.includes(nextElement)) return null;
    nextFragments[rootIndex] = Object.freeze({
      ...fragment,
      element: nextElement,
      elements: fragmentElements,
      entities: Object.freeze(fragmentEntities),
      projection: Object.freeze({
        ...fragment.projection,
        byEntityId: Object.freeze(fragmentProjections),
      }),
    });
  }

  if (updatedRootCount !== updatesById.size || dirtyEntityIds.length === 0) {
    return null;
  }
  const byEntityId = patchPatchMapStableRecord(
    previous.projection.byEntityId,
    selectedProjections,
    dirtyEntityIds,
    recordStrategy,
    true,
  );
  if (byEntityId === null) return null;
  const result = Object.freeze({
    ...previous,
    document: Object.freeze({
      ...previous.document,
      entities: Object.freeze(entities),
    }),
    identity: Object.freeze({
      ...previous.identity,
      elements: Object.freeze(elements),
    }),
    projection: Object.freeze({
      ...previous.projection,
      byEntityId,
    }),
  });
  const frozenFragments = Object.freeze(nextFragments);
  ROOT_FRAGMENTS_CACHE.set(result, frozenFragments);
  STABLE_PARSE_INDEX_CACHE.set(result, indexes);
  DIRECT_ANGLE_LOCAL_AFFINE_CACHE.set(result, localAffines);
  return result;
}

function sameRecordExcept(
  before: JsonRecord,
  after: JsonRecord,
  ignoredKey: string,
): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete(ignoredKey);
  for (const key of keys) {
    if (
      Object.hasOwn(before, key) !== Object.hasOwn(after, key) ||
      before[key] !== after[key]
    ) {
      return false;
    }
  }
  return true;
}

function finiteRecordNumber(
  record: JsonRecord,
  key: string,
  fallback: number,
): number {
  if (!Object.hasOwn(record, key)) return fallback;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.NaN;
}
