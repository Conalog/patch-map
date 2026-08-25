import {
  PATCH_MAP_COMPONENT_TYPES,
  PATCH_MAP_ELEMENT_TYPES,
  PatchMapDatasetError,
  type MaterializedPatchMapDataset,
  type PatchMapDatasetMaterialization,
  type PatchMapElement,
  type PatchMapGridElement,
  type PatchMapItemElement,
  type PatchMapRelationsElement,
  type PatchMapTextStyle,
} from './dataset/contracts';
import {
  patchMapSemanticHash,
  releasePatchMapSemanticHashScratch as releaseSemanticHashScratch,
} from './dataset/semantic-hash';
import { invalidValue } from './dataset/value-normalization';
import { normalizeTextStyle } from './dataset/style-normalization';
import {
  inventoryOwnedStructuralElement,
  normalizeElement,
  type NormalizationState,
} from './dataset/root-normalization';

export * from './dataset/contracts';

const OWNED_PATCH_MAP_DATASETS = new WeakSet<object>();
const OWNED_PATCH_MAP_ROOTS = new WeakSet<object>();
const OWNED_PATCH_MAP_MATERIALIZATIONS = new WeakMap<
  object,
  PatchMapDatasetMaterialization
>();
const OWNED_PATCH_MAP_ELEMENT_IDS = new WeakMap<object, ReadonlySet<string>>();
const OWNED_PATCH_MAP_EXACT_PATCHES = new WeakMap<
  object,
  Readonly<{
    readonly base: readonly unknown[];
    readonly dirtyIndices: readonly number[];
  }>
>();
const OWNED_PATCH_MAP_PREVIEW_PATCHES = new WeakMap<
  object,
  Readonly<{
    readonly base: readonly unknown[];
    readonly dirtyIndices: readonly number[];
  }>
>();

/**
 * Validate and detach a canonical PATCH MAP array before it becomes authoritative.
 * The returned graph has no mutable aliases into caller-owned JSON.
 */
export function materializePatchMapDataset(input: unknown): PatchMapDatasetMaterialization {
  if (!Array.isArray(input)) {
    invalidValue('$', 'dataset root must be an ordered element array');
  }

  const state: NormalizationState = {
    elementIds: new Set(),
    componentIdsByOwner: new Map(),
    elementTypes: new Set(),
    componentTypes: new Set(),
  };
  const dataset = Object.freeze(
    input.map((element, index) => normalizeElement(element, `$[${index}]`, state)),
  );
  dataset.forEach((root) => OWNED_PATCH_MAP_ROOTS.add(root));
  OWNED_PATCH_MAP_DATASETS.add(dataset);
  OWNED_PATCH_MAP_ELEMENT_IDS.set(dataset, new Set(state.elementIds));
  const rootIds = Object.freeze(dataset.map((element) => element.id));
  const elementTypes = Object.freeze(
    PATCH_MAP_ELEMENT_TYPES.filter((type) => state.elementTypes.has(type)),
  );
  const componentTypes = Object.freeze(
    PATCH_MAP_COMPONENT_TYPES.filter((type) => state.componentTypes.has(type)),
  );

  const materialized = Object.freeze({
    dataset,
    rootIds,
    elementTypes,
    componentTypes,
    semanticHash: patchMapSemanticHash(dataset),
    visibleBoundsFinite: true,
  });
  OWNED_PATCH_MAP_MATERIALIZATIONS.set(dataset, materialized);
  return materialized;
}

/**
 * Assemble a structurally shared candidate from individually normalized,
 * Engine-owned roots. Identity and type inventories are reusable only when
 * root order, IDs, and types are unchanged.
 */
export function assembleOwnedPatchMapDataset(
  current: MaterializedPatchMapDataset,
  roots: readonly PatchMapElement[],
): PatchMapDatasetMaterialization {
  const dirtyIndices = validateOwnedPatchMapRoots(current, roots);
  const dataset = Object.freeze([...roots]);
  OWNED_PATCH_MAP_DATASETS.add(dataset);
  const elementIds = OWNED_PATCH_MAP_ELEMENT_IDS.get(current.dataset);
  if (elementIds !== undefined) OWNED_PATCH_MAP_ELEMENT_IDS.set(dataset, elementIds);
  OWNED_PATCH_MAP_EXACT_PATCHES.set(dataset, Object.freeze({
    base: current.dataset,
    dirtyIndices,
  }));
  let cachedSemanticHash: string | undefined;
  const materialized = {
    dataset,
    rootIds: current.rootIds,
    elementTypes: current.elementTypes,
    componentTypes: current.componentTypes,
    visibleBoundsFinite: current.visibleBoundsFinite,
  } as PatchMapDatasetMaterialization;
  Object.defineProperty(materialized, 'semanticHash', {
    enumerable: true,
    configurable: false,
    get: () => {
      cachedSemanticHash ??= patchMapSemanticHash(dataset);
      return cachedSemanticHash;
    },
  });
  Object.freeze(materialized);
  OWNED_PATCH_MAP_MATERIALIZATIONS.set(dataset, materialized);
  return materialized;
}

/**
 * Assemble a transient transformer preview without hashing all unchanged
 * roots. The inherited hash is intentionally non-authoritative: callers must
 * run the canonical transaction planner before history or semantic commit.
 */
export function assembleOwnedPatchMapPreviewDataset(
  current: MaterializedPatchMapDataset,
  roots: readonly PatchMapElement[],
): PatchMapDatasetMaterialization {
  validateOwnedPatchMapRoots(current, roots);
  const dataset = Object.freeze([...roots]);
  OWNED_PATCH_MAP_DATASETS.add(dataset);
  const elementIds = OWNED_PATCH_MAP_ELEMENT_IDS.get(current.dataset);
  if (elementIds !== undefined) OWNED_PATCH_MAP_ELEMENT_IDS.set(dataset, elementIds);
  const materialized = Object.freeze({
    dataset,
    rootIds: current.rootIds,
    elementTypes: current.elementTypes,
    componentTypes: current.componentTypes,
    semanticHash: current.semanticHash,
    visibleBoundsFinite: current.visibleBoundsFinite,
  });
  return materialized;
}

/**
 * Assemble an internally planned transient preview from only its normalized
 * replacement roots. Unlike the general preview assembly above, this shape
 * cannot conceal changes outside `replacements`, so pointer-move previews do
 * not need to rescan every unchanged root merely to prove structural sharing.
 */
export function assembleOwnedPatchMapSparsePreviewDataset(
  current: MaterializedPatchMapDataset,
  replacements: readonly Readonly<{
    readonly index: number;
    readonly root: PatchMapElement;
  }>[],
): PatchMapDatasetMaterialization {
  const roots = [...current.dataset];
  const seen = new Set<number>();
  const dirtyIndices: number[] = [];
  for (const replacement of replacements) {
    const { index, root } = replacement;
    const before = current.dataset[index];
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= current.dataset.length ||
      seen.has(index) ||
      before === undefined ||
      before.id !== root.id ||
      before.type !== root.type ||
      !OWNED_PATCH_MAP_ROOTS.has(root)
    ) {
      throw new TypeError('sparse PatchMap preview replacement is invalid');
    }
    seen.add(index);
    dirtyIndices.push(index);
    roots[index] = root;
  }
  dirtyIndices.sort((left, right) => left - right);
  const dataset = Object.freeze(roots);
  OWNED_PATCH_MAP_DATASETS.add(dataset);
  const elementIds = OWNED_PATCH_MAP_ELEMENT_IDS.get(current.dataset);
  if (elementIds !== undefined) OWNED_PATCH_MAP_ELEMENT_IDS.set(dataset, elementIds);
  OWNED_PATCH_MAP_PREVIEW_PATCHES.set(dataset, Object.freeze({
    base: current.dataset,
    dirtyIndices: Object.freeze(dirtyIndices),
  }));
  return Object.freeze({
    dataset,
    rootIds: current.rootIds,
    elementTypes: current.elementTypes,
    componentTypes: current.componentTypes,
    semanticHash: current.semanticHash,
    visibleBoundsFinite: current.visibleBoundsFinite,
  });
}

/**
 * Normalize only new or structurally edited roots, then assemble one exact
 * authoritative dataset around unchanged Engine-owned roots. Structural
 * editor actions otherwise clone and normalize the full 5,000-root scene even
 * when they add, remove, reorder, group, or ungroup only a few roots.
 */
export function materializeOwnedPatchMapStructuralDataset(
  input: readonly unknown[],
): PatchMapDatasetMaterialization {
  const roots = input.map((root) => {
    if (
      root !== null &&
      typeof root === 'object' &&
      OWNED_PATCH_MAP_ROOTS.has(root)
    ) {
      return root as PatchMapElement;
    }
    const normalized = materializePatchMapDataset([root]).dataset[0];
    if (normalized === undefined) {
      invalidValue('$', 'structural root normalization produced no element');
    }
    return normalized;
  });
  const state: NormalizationState = {
    elementIds: new Set(),
    componentIdsByOwner: new Map(),
    elementTypes: new Set(),
    componentTypes: new Set(),
  };
  roots.forEach((root, index) =>
    inventoryOwnedStructuralElement(root, `$[${index}]`, state));
  const dataset = Object.freeze(roots);
  dataset.forEach((root) => OWNED_PATCH_MAP_ROOTS.add(root));
  OWNED_PATCH_MAP_DATASETS.add(dataset);
  OWNED_PATCH_MAP_ELEMENT_IDS.set(dataset, new Set(state.elementIds));
  const materialized = Object.freeze({
    dataset,
    rootIds: Object.freeze(dataset.map(({ id }) => id)),
    elementTypes: Object.freeze(
      PATCH_MAP_ELEMENT_TYPES.filter((type) => state.elementTypes.has(type)),
    ),
    componentTypes: Object.freeze(
      PATCH_MAP_COMPONENT_TYPES.filter((type) => state.componentTypes.has(type)),
    ),
    semanticHash: patchMapSemanticHash(dataset),
    visibleBoundsFinite: true,
  });
  OWNED_PATCH_MAP_MATERIALIZATIONS.set(dataset, materialized);
  return materialized;
}

/**
 * Recover the canonical materialization that owns a detached dataset shell.
 * Transient preview assemblies are intentionally excluded because their
 * inherited semantic hash is not authoritative.
 */
export function ownedPatchMapMaterialization(
  input: unknown,
): MaterializedPatchMapDataset | null {
  return input !== null && typeof input === 'object'
    ? OWNED_PATCH_MAP_MATERIALIZATIONS.get(input) ?? null
    : null;
}

/**
 * Release the latest exact-hash scratch when its owning dataset leaves the
 * product lifecycle. The cache is only an acceleration aid; a different live
 * dataset remains untouched and every miss rebuilds from canonical values.
 */
export function releasePatchMapSemanticHashScratch(
  dataset: readonly unknown[],
): void {
  releaseSemanticHashScratch(dataset);
}

/** Exact immutable element membership retained with Engine-owned datasets. */
export function ownedPatchMapElementIds(
  input: unknown,
): ReadonlySet<string> | null {
  return input !== null && typeof input === 'object'
    ? OWNED_PATCH_MAP_ELEMENT_IDS.get(input) ?? null
    : null;
}

/** Exact sparse lineage for one internally assembled transient preview. */
export function ownedPatchMapPreviewPatchIndices(
  input: unknown,
  base: readonly unknown[],
): readonly number[] | null {
  if (input === null || typeof input !== 'object') return null;
  const patch = OWNED_PATCH_MAP_PREVIEW_PATCHES.get(input);
  return patch?.base === base ? patch.dirtyIndices : null;
}

/**
 * Exact root replacements recorded while an authoritative candidate is
 * validated and canonically hashed. Consumers may skip redundant whole-scene
 * identity scans only when they still hold the exact base dataset.
 */
export function ownedPatchMapExactPatchIndices(
  input: unknown,
  base: readonly unknown[],
): readonly number[] | null {
  if (input === null || typeof input !== 'object') return null;
  const patch = OWNED_PATCH_MAP_EXACT_PATCHES.get(input);
  return patch?.base === base ? patch.dirtyIndices : null;
}

function validateOwnedPatchMapRoots(
  current: MaterializedPatchMapDataset,
  roots: readonly PatchMapElement[],
): readonly number[] {
  if (roots.length !== current.dataset.length) {
    throw new RangeError('owned PatchMap root count changed');
  }
  const dirtyIndices: number[] = [];
  for (let index = 0; index < roots.length; index += 1) {
    const before = current.dataset[index];
    const after = roots[index];
    if (
      before === undefined ||
      after === undefined ||
      before.id !== after.id ||
      before.type !== after.type ||
      !OWNED_PATCH_MAP_ROOTS.has(after)
    ) {
      throw new TypeError(
        `owned PatchMap root ${index} changed identity or is not materializer-owned`,
      );
    }
    if (before !== after) dirtyIndices.push(index);
  }
  return Object.freeze(dirtyIndices);
}

export function replaceOwnedPatchMapBarHeightRoot(
  root: PatchMapElement,
  componentId: string,
  height: number,
  componentIndexHint?: number,
): PatchMapItemElement | PatchMapGridElement | null {
  if (
    !OWNED_PATCH_MAP_ROOTS.has(root) ||
    (root.type !== 'item' && root.type !== 'grid') ||
    !Number.isFinite(height) ||
    height < 0
  ) {
    return null;
  }
  const rootComponents = root.type === 'item'
    ? root.components
    : root.item.components;
  const hintedComponent = componentIndexHint === undefined
    ? undefined
    : rootComponents[componentIndexHint];
  const componentIndex = hintedComponent?.id === componentId
    ? componentIndexHint!
    : rootComponents.findIndex(({ id }) => id === componentId);
  const component = componentIndex < 0 ? undefined : rootComponents[componentIndex];
  if (
    component?.type !== 'bar' ||
    typeof component.size !== 'object' ||
    component.size === null ||
    Array.isArray(component.size) ||
    !('width' in component.size) ||
    !('height' in component.size)
  ) {
    return null;
  }
  const size = Object.freeze({ ...component.size, height });
  const replacement = Object.freeze({ ...component, size });
  const components = [...rootComponents];
  components[componentIndex] = replacement;
  const frozenComponents = Object.freeze(components);
  const next = root.type === 'item'
    ? Object.freeze({ ...root, components: frozenComponents })
    : Object.freeze({
        ...root,
        item: Object.freeze({ ...root.item, components: frozenComponents }),
      });
  OWNED_PATCH_MAP_ROOTS.add(next);
  return next;
}

/**
 * Replace one text payload inside an already materialized top-level item.
 * The batch planner validates identity and value shape before using this
 * structural-sharing path, so unrelated component/style/layout input remains
 * byte-for-byte owned by the current immutable root.
 */
export function replaceOwnedPatchMapTextRoot(
  root: PatchMapElement,
  componentId: string,
  text: string,
  stylePatch?: PatchMapTextStyle,
  componentIndexHint?: number,
): PatchMapItemElement | null {
  if (
    !OWNED_PATCH_MAP_ROOTS.has(root) ||
    root.type !== 'item' ||
    typeof text !== 'string'
  ) {
    return null;
  }
  const hintedComponent = componentIndexHint === undefined
    ? undefined
    : root.components[componentIndexHint];
  const componentIndex = hintedComponent?.id === componentId
    ? componentIndexHint!
    : root.components.findIndex(({ id }) => id === componentId);
  const component = componentIndex < 0 ? undefined : root.components[componentIndex];
  if (component?.type !== 'text') return null;
  const replacement = Object.freeze({
    ...component,
    text,
    ...(stylePatch === undefined
      ? {}
      : { style: Object.freeze({ ...component.style, ...stylePatch }) }),
  });
  const components = [...root.components];
  components[componentIndex] = replacement;
  const next = Object.freeze({
    ...root,
    components: Object.freeze(components),
  });
  OWNED_PATCH_MAP_ROOTS.add(next);
  return next;
}

/**
 * Replace one validated top-level flat-root angle without cloning and
 * re-normalizing its complete component subtree.
 */
export function replaceOwnedPatchMapElementAngleRoot(
  root: PatchMapElement,
  angle: number,
): PatchMapElement | null {
  if (
    !OWNED_PATCH_MAP_ROOTS.has(root) ||
    !Number.isFinite(angle) ||
    !['item', 'rect', 'image', 'text'].includes(root.type)
  ) {
    return null;
  }
  const attrs = Object.freeze({
    ...(root.attrs ?? {}),
    angle,
  });
  const next = Object.freeze({ ...root, attrs }) as PatchMapElement;
  OWNED_PATCH_MAP_ROOTS.add(next);
  return next;
}

/** Normalize the approved item-text style patch profile without defaults. */
export function normalizePatchMapTextStylePatch(
  value: unknown,
  path = '$.style',
): PatchMapTextStyle {
  return normalizeTextStyle(value, path, true, false);
}

/** Internal capability check for detached, deeply frozen materializer output. */
export function isOwnedPatchMapDataset(
  value: unknown,
): value is readonly PatchMapElement[] {
  return typeof value === 'object' &&
    value !== null &&
    OWNED_PATCH_MAP_DATASETS.has(value);
}

/**
 * Optional strict reference pass for host workflows that must reject dangling
 * relation endpoints before the last complete scene is published. The default
 * parser remains compatibility-oriented and may project dangling paths as
 * explicit omitted relations.
 */
export function validatePatchMapDatasetReferences(
  dataset: readonly PatchMapElement[],
): void {
  const elementIds = new Set<string>();
  const relations: {
    readonly element: PatchMapRelationsElement;
    readonly path: string;
  }[] = [];

  const visit = (elements: readonly PatchMapElement[], parentPath: string): void => {
    elements.forEach((element, index) => {
      const path = `${parentPath}[${index}]`;
      elementIds.add(element.id);
      if (element.type === 'grid') {
        element.cells.forEach((row, rowIndex) => {
          row.forEach((cell, columnIndex) => {
            if (cell === 0 && element.inactiveCellStrategy === 'destroy') return;
            elementIds.add(`${element.id}.${rowIndex}.${columnIndex}`);
          });
        });
      } else if (element.type === 'group') {
        visit(element.children, `${path}.children`);
      } else if (element.type === 'relations') {
        relations.push(Object.freeze({ element, path }));
      }
    });
  };
  visit(dataset, '$');

  for (const { element, path } of relations) {
    element.links.forEach((link, index) => {
      if (!elementIds.has(link.source)) {
        throw new PatchMapDatasetError(
          'MISSING_TARGET',
          `${path}.links[${index}].source`,
          `relation source ${JSON.stringify(link.source)} does not exist`,
        );
      }
      if (!elementIds.has(link.target)) {
        throw new PatchMapDatasetError(
          'MISSING_TARGET',
          `${path}.links[${index}].target`,
          `relation target ${JSON.stringify(link.target)} does not exist`,
        );
      }
    });
  }
}
