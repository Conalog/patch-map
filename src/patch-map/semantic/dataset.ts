import {
  PATCH_MAP_COMPONENT_TYPES,
  PATCH_MAP_ELEMENT_TYPES,
  PatchMapDatasetError,
  type MaterializedPatchMapDataset,
  type PatchMapAttrs,
  type PatchMapComponent,
  type PatchMapComponentType,
  type PatchMapDatasetMaterialization,
  type PatchMapElement,
  type PatchMapElementType,
  type PatchMapEventMode,
  type PatchMapGridItemTemplate,
  type PatchMapItemElement,
  type PatchMapPlacement,
  type PatchMapRelationLink,
  type PatchMapRelationsElement,
  type PatchMapTextOverflow,
  type PatchMapTextStyle,
} from './dataset/contracts';
import {
  patchMapSemanticHash,
  releasePatchMapSemanticHashScratch as releaseSemanticHashScratch,
} from './dataset/semantic-hash';
import {
  assertKnownFields,
  booleanValue,
  cloneJsonRecord,
  enumValue,
  finiteNumber,
  hasOwn,
  invalidValue,
  nonnegativeFiniteNumber,
  normalizeComponentSize,
  normalizeEdges,
  normalizeFixedSize,
  normalizeGap,
  normalizeRadius,
  rangedNumber,
  recordValue,
  requiredField,
  stringValue,
  validateVector,
} from './dataset/value-normalization';
import {
  normalizeAssetSource,
  normalizeBackgroundSource,
  normalizeColorLike,
  normalizeRectTexture,
  normalizeStrokeStyle,
  normalizeTextStyle,
} from './dataset/style-normalization';

export * from './dataset/contracts';

interface NormalizationState {
  readonly elementIds: Set<string>;
  readonly componentIdsByOwner: Map<string, Set<string>>;
  readonly elementTypes: Set<PatchMapElementType>;
  readonly componentTypes: Set<PatchMapComponentType>;
}

interface ElementBaseFields {
  readonly id: string;
  readonly label?: string;
  readonly show: boolean;
  readonly locked: boolean;
  readonly attrs?: PatchMapAttrs;
}

interface ComponentBaseFields {
  readonly id: string;
  readonly label?: string;
  readonly show: boolean;
  readonly attrs?: PatchMapAttrs;
}

const ELEMENT_BASE_FIELDS = ['type', 'id', 'label', 'show', 'locked', 'attrs'] as const;
const COMPONENT_BASE_FIELDS = ['type', 'id', 'label', 'show', 'attrs'] as const;
const ELEMENT_FIELDS: Readonly<Record<PatchMapElementType, ReadonlySet<string>>> = {
  group: new Set([...ELEMENT_BASE_FIELDS, 'children']),
  grid: new Set([...ELEMENT_BASE_FIELDS, 'cells', 'item', 'inactiveCellStrategy', 'gap']),
  item: new Set([...ELEMENT_BASE_FIELDS, 'size', 'components', 'padding', 'contentOrientation']),
  relations: new Set([...ELEMENT_BASE_FIELDS, 'links', 'style']),
  image: new Set([...ELEMENT_BASE_FIELDS, 'source', 'size', 'opacity']),
  text: new Set([...ELEMENT_BASE_FIELDS, 'text', 'style', 'size', 'overflow']),
  rect: new Set([...ELEMENT_BASE_FIELDS, 'size', 'fill', 'stroke', 'radius', 'eventMode']),
};
const COMPONENT_FIELDS: Readonly<Record<PatchMapComponentType, ReadonlySet<string>>> = {
  background: new Set([...COMPONENT_BASE_FIELDS, 'source', 'tint', 'size']),
  bar: new Set([
    ...COMPONENT_BASE_FIELDS,
    'source',
    'size',
    'placement',
    'margin',
    'tint',
    'animation',
    'animationDuration',
  ]),
  icon: new Set([...COMPONENT_BASE_FIELDS, 'source', 'size', 'placement', 'margin', 'tint']),
  text: new Set([
    ...COMPONENT_BASE_FIELDS,
    'text',
    'placement',
    'margin',
    'tint',
    'style',
    'split',
  ]),
};
const GRID_ITEM_FIELDS = new Set(['components', 'size', 'padding', 'contentOrientation']);
const LINK_FIELDS = new Set(['source', 'target']);
const ELEMENT_TYPE_SET = new Set<string>(PATCH_MAP_ELEMENT_TYPES);
const COMPONENT_TYPE_SET = new Set<string>(PATCH_MAP_COMPONENT_TYPES);
const PLACEMENTS = new Set<string>([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
  'none',
]);
const CONTENT_ORIENTATIONS = new Set<string>(['follow-item', 'upright']);
const EVENT_MODES = new Set<string>(['none', 'passive', 'auto', 'static', 'dynamic']);
const TEXT_OVERFLOWS = new Set<string>(['visible', 'hidden', 'ellipsis']);
const WHITE = '#ffffffff';
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

function inventoryOwnedStructuralElement(
  element: PatchMapElement,
  path: string,
  state: NormalizationState,
): void {
  if (state.elementIds.has(element.id)) {
    throw new PatchMapDatasetError(
      'DUPLICATE_ID',
      `${path}.id`,
      `duplicate element id ${JSON.stringify(element.id)}`,
    );
  }
  state.elementIds.add(element.id);
  state.elementTypes.add(element.type);
  if (element.type === 'group') {
    element.children.forEach((child, index) =>
      inventoryOwnedStructuralElement(child, `${path}.children[${index}]`, state));
    return;
  }
  if (element.type === 'item') {
    inventoryOwnedStructuralComponents(
      element.id,
      element.components,
      `${path}.components`,
      state,
    );
    return;
  }
  if (element.type === 'grid') {
    inventoryOwnedStructuralComponents(
      element.id,
      element.item.components,
      `${path}.item.components`,
      state,
    );
  }
}

function inventoryOwnedStructuralComponents(
  ownerId: string,
  components: readonly PatchMapComponent[],
  path: string,
  state: NormalizationState,
): void {
  const ids = new Set<string>();
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index]!;
    if (ids.has(component.id)) {
      throw new PatchMapDatasetError(
        'DUPLICATE_ID',
        `${path}[${index}].id`,
        `duplicate component id ${JSON.stringify(component.id)} for ${JSON.stringify(ownerId)}`,
      );
    }
    ids.add(component.id);
    state.componentTypes.add(component.type);
  }
  state.componentIdsByOwner.set(ownerId, ids);
}

/**
 * Replace one numeric bar height inside an already materialized top-level item.
 * The caller has validated the transaction envelope; every untouched field is
 * structurally shared from the deeply frozen Engine-owned root.
 */
export function replaceOwnedPatchMapBarHeightRoot(
  root: PatchMapElement,
  componentId: string,
  height: number,
  componentIndexHint?: number,
): PatchMapItemElement | null {
  if (
    !OWNED_PATCH_MAP_ROOTS.has(root) ||
    root.type !== 'item' ||
    !Number.isFinite(height) ||
    height < 0
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

function normalizeElement(
  value: unknown,
  path: string,
  state: NormalizationState,
): PatchMapElement {
  const record = recordValue(value, path, 'element must be an object');
  const type = recordKind(record.type, `${path}.type`, ELEMENT_TYPE_SET) as PatchMapElementType;
  assertKnownFields(record, ELEMENT_FIELDS[type], path);
  state.elementTypes.add(type);
  const base = normalizeElementBase(record, path, state);

  switch (type) {
    case 'group':
      return Object.freeze({
        type,
        ...base,
        children: normalizeElements(requiredArray(record, 'children', path), `${path}.children`, state),
      });
    case 'grid': {
      const cells = normalizeCells(requiredArray(record, 'cells', path), `${path}.cells`);
      const inactiveCellStrategy = optionalEnum(
        record,
        'inactiveCellStrategy',
        path,
        new Set(['destroy', 'hide']),
        'destroy',
      ) as 'destroy' | 'hide';
      registerGridCellIds(base.id, cells, inactiveCellStrategy, path, state);
      return Object.freeze({
        type,
        ...base,
        cells,
        item: normalizeGridItem(requiredField(record, 'item', path), `${path}.item`, base.id, state),
        inactiveCellStrategy,
        gap: normalizeGap(optionalField(record, 'gap'), `${path}.gap`),
      });
    }
    case 'item':
      return Object.freeze({
        type,
        ...base,
        size: normalizeFixedSize(requiredField(record, 'size', path), `${path}.size`),
        components: normalizeComponents(
          optionalArray(record, 'components', path),
          `${path}.components`,
          base.id,
          state,
        ),
        padding: normalizeEdges(optionalField(record, 'padding'), `${path}.padding`),
        contentOrientation: normalizeContentOrientation(record, path),
      });
    case 'relations':
      return Object.freeze({
        type,
        ...base,
        links: normalizeLinks(requiredArray(record, 'links', path), `${path}.links`),
        style: normalizeStrokeStyle(optionalField(record, 'style'), `${path}.style`, true),
      });
    case 'image':
      return Object.freeze({
        type,
        ...base,
        source: normalizeAssetSource(requiredField(record, 'source', path), `${path}.source`),
        ...(hasOwn(record, 'size')
          ? { size: normalizeFixedSize(record.size, `${path}.size`) }
          : {}),
        ...(hasOwn(record, 'opacity')
          ? { opacity: rangedNumber(record.opacity, `${path}.opacity`, 0, 1) }
          : {}),
      });
    case 'text':
      return Object.freeze({
        type,
        ...base,
        text: optionalString(record, 'text', path, ''),
        style: normalizeTextStyle(optionalField(record, 'style'), `${path}.style`, false, true),
        ...(hasOwn(record, 'size')
          ? { size: normalizeFixedSize(record.size, `${path}.size`) }
          : {}),
        ...(hasOwn(record, 'overflow')
          ? {
              overflow: enumValue(
                record.overflow,
                `${path}.overflow`,
                TEXT_OVERFLOWS,
              ) as PatchMapTextOverflow,
            }
          : {}),
      });
    case 'rect':
      return Object.freeze({
        type,
        ...base,
        size: normalizeFixedSize(requiredField(record, 'size', path), `${path}.size`),
        ...(hasOwn(record, 'fill')
          ? { fill: normalizeColorLike(record.fill, `${path}.fill`) }
          : {}),
        ...(hasOwn(record, 'stroke')
          ? { stroke: normalizeStrokeStyle(record.stroke, `${path}.stroke`) }
          : {}),
        radius: normalizeRadius(optionalField(record, 'radius'), `${path}.radius`),
        ...(hasOwn(record, 'eventMode')
          ? {
              eventMode: enumValue(
                record.eventMode,
                `${path}.eventMode`,
                EVENT_MODES,
              ) as PatchMapEventMode,
            }
          : {}),
      });
  }
}

function normalizeElementBase(
  record: Readonly<Record<string, unknown>>,
  path: string,
  state: NormalizationState,
): ElementBaseFields {
  const id = hasOwn(record, 'id')
    ? stringValue(record.id, `${path}.id`)
    : generatedElementId(path);
  registerElementId(id, `${path}.id`, state);

  return Object.freeze({
    id,
    ...(hasOwn(record, 'label') ? { label: stringValue(record.label, `${path}.label`) } : {}),
    show: optionalBoolean(record, 'show', path, true),
    locked: optionalBoolean(record, 'locked', path, false),
    ...(hasOwn(record, 'attrs') ? { attrs: normalizeAttrs(record.attrs, `${path}.attrs`) } : {}),
  });
}

function normalizeElements(
  values: readonly unknown[],
  path: string,
  state: NormalizationState,
): readonly PatchMapElement[] {
  return Object.freeze(values.map((value, index) => normalizeElement(value, `${path}[${index}]`, state)));
}

function normalizeGridItem(
  value: unknown,
  path: string,
  gridId: string,
  state: NormalizationState,
): PatchMapGridItemTemplate {
  const record = recordValue(value, path, 'grid item template must be an object');
  assertKnownFields(record, GRID_ITEM_FIELDS, path);
  return Object.freeze({
    size: normalizeFixedSize(requiredField(record, 'size', path), `${path}.size`),
    components: normalizeComponents(
      optionalArray(record, 'components', path),
      `${path}.components`,
      `${gridId}#template`,
      state,
    ),
    padding: normalizeEdges(optionalField(record, 'padding'), `${path}.padding`),
    contentOrientation: normalizeContentOrientation(record, path),
  });
}

function normalizeComponents(
  values: readonly unknown[],
  path: string,
  ownerId: string,
  state: NormalizationState,
): readonly PatchMapComponent[] {
  return Object.freeze(
    values.map((value, index) => normalizeComponent(value, `${path}[${index}]`, ownerId, index, state)),
  );
}

function normalizeComponent(
  value: unknown,
  path: string,
  ownerId: string,
  index: number,
  state: NormalizationState,
): PatchMapComponent {
  const record = recordValue(value, path, 'component must be an object');
  const type = recordKind(record.type, `${path}.type`, COMPONENT_TYPE_SET) as PatchMapComponentType;
  assertKnownFields(record, COMPONENT_FIELDS[type], path);
  state.componentTypes.add(type);
  const base = normalizeComponentBase(record, path, ownerId, index, state);

  switch (type) {
    case 'background':
      return Object.freeze({
        type,
        ...base,
        source: normalizeBackgroundSource(requiredField(record, 'source', path), `${path}.source`),
        tint: hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
        ...(hasOwn(record, 'size')
          ? { size: normalizeComponentSize(record.size, `${path}.size`) }
          : {}),
      });
    case 'bar':
      return Object.freeze({
        type,
        ...base,
        source: normalizeRectTexture(requiredField(record, 'source', path), `${path}.source`),
        size: normalizeComponentSize(requiredField(record, 'size', path), `${path}.size`),
        placement: normalizePlacement(record, path, 'bottom'),
        margin: normalizeEdges(optionalField(record, 'margin'), `${path}.margin`),
        tint: hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
        animation: optionalBoolean(record, 'animation', path, true),
        animationDuration: optionalNonnegativeFiniteNumber(
          record,
          'animationDuration',
          path,
          200,
        ),
      });
    case 'icon':
      return Object.freeze({
        type,
        ...base,
        source: normalizeAssetSource(requiredField(record, 'source', path), `${path}.source`),
        size: normalizeComponentSize(requiredField(record, 'size', path), `${path}.size`),
        placement: normalizePlacement(record, path, 'center'),
        margin: normalizeEdges(optionalField(record, 'margin'), `${path}.margin`),
        tint: hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
      });
    case 'text':
      return Object.freeze({
        type,
        ...base,
        text: optionalString(record, 'text', path, ''),
        placement: normalizePlacement(record, path, 'center'),
        margin: normalizeEdges(optionalField(record, 'margin'), `${path}.margin`),
        tint: hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
        style: normalizeTextStyle(optionalField(record, 'style'), `${path}.style`, true, true),
        split: optionalInteger(record, 'split', path, 0),
      });
  }
}

function normalizeComponentBase(
  record: Readonly<Record<string, unknown>>,
  path: string,
  ownerId: string,
  index: number,
  state: NormalizationState,
): ComponentBaseFields {
  const id = hasOwn(record, 'id')
    ? stringValue(record.id, `${path}.id`)
    : `@component:${index}`;
  registerComponentId(ownerId, id, `${path}.id`, state);

  return Object.freeze({
    id,
    ...(hasOwn(record, 'label') ? { label: stringValue(record.label, `${path}.label`) } : {}),
    show: optionalBoolean(record, 'show', path, true),
    ...(hasOwn(record, 'attrs') ? { attrs: normalizeAttrs(record.attrs, `${path}.attrs`) } : {}),
  });
}

function normalizeCells(values: readonly unknown[], path: string): readonly (readonly (0 | 1 | string)[])[] {
  return Object.freeze(
    values.map((row, rowIndex) => {
      if (!Array.isArray(row)) invalidValue(`${path}[${rowIndex}]`, 'grid row must be an array');
      const rowValues = row as readonly unknown[];
      return Object.freeze(
        rowValues.map((cell, columnIndex): 0 | 1 | string => {
          if (cell !== 0 && cell !== 1 && typeof cell !== 'string') {
            invalidValue(
              `${path}[${rowIndex}][${columnIndex}]`,
              'grid cell must be 0, 1, or a string',
            );
          }
          return cell;
        }),
      );
    }),
  );
}

function registerGridCellIds(
  gridId: string,
  cells: readonly (readonly (0 | 1 | string)[])[],
  strategy: 'destroy' | 'hide',
  path: string,
  state: NormalizationState,
): void {
  cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell === 0 && strategy === 'destroy') return;
      registerElementId(
        `${gridId}.${rowIndex}.${columnIndex}`,
        `${path}.cells[${rowIndex}][${columnIndex}]`,
        state,
      );
    });
  });
}

function normalizeLinks(values: readonly unknown[], path: string): readonly PatchMapRelationLink[] {
  const seen = new Set<string>();
  const links: PatchMapRelationLink[] = [];
  values.forEach((value, index) => {
    const linkPath = `${path}[${index}]`;
    const record = recordValue(value, linkPath, 'relation link must be an object');
    assertKnownFields(record, LINK_FIELDS, linkPath);
    const source = stringValue(requiredField(record, 'source', linkPath), `${linkPath}.source`);
    const target = stringValue(requiredField(record, 'target', linkPath), `${linkPath}.target`);
    const key = `${source.length}:${source}${target.length}:${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(Object.freeze({ source, target }));
  });
  return Object.freeze(links);
}

function normalizeAttrs(value: unknown, path: string): PatchMapAttrs {
  const record = recordValue(value, path, 'attrs must be a string-keyed object');
  if (hasOwn(record, 'angle') && hasOwn(record, 'rotation')) {
    invalidValue(path, 'angle and rotation are mutually exclusive');
  }

  for (const key of ['x', 'y', 'angle', 'rotation', 'zIndex', 'scaleX', 'scaleY'] as const) {
    if (hasOwn(record, key)) finiteNumber(record[key], `${path}.${key}`);
  }
  if (hasOwn(record, 'alpha')) rangedNumber(record.alpha, `${path}.alpha`, 0, 1);
  for (const key of ['scale', 'skew', 'pivot'] as const) {
    if (hasOwn(record, key)) validateVector(record[key], `${path}.${key}`);
  }

  return cloneJsonRecord(record, path);
}

function normalizeContentOrientation(
  record: Readonly<Record<string, unknown>>,
  path: string,
): 'follow-item' | 'upright' {
  return optionalEnum(
    record,
    'contentOrientation',
    path,
    CONTENT_ORIENTATIONS,
    'upright',
  ) as 'follow-item' | 'upright';
}

function normalizePlacement(
  record: Readonly<Record<string, unknown>>,
  path: string,
  fallback: PatchMapPlacement,
): PatchMapPlacement {
  return optionalEnum(record, 'placement', path, PLACEMENTS, fallback) as PatchMapPlacement;
}

function registerElementId(id: string, path: string, state: NormalizationState): void {
  if (state.elementIds.has(id)) {
    duplicateId(path, `duplicate scene-global element identity ${JSON.stringify(id)}`);
  }
  state.elementIds.add(id);
}

function registerComponentId(
  ownerId: string,
  id: string,
  path: string,
  state: NormalizationState,
): void {
  let ids = state.componentIdsByOwner.get(ownerId);
  if (!ids) {
    ids = new Set();
    state.componentIdsByOwner.set(ownerId, ids);
  }
  if (ids.has(id)) {
    duplicateId(path, `duplicate owner-local component identity ${JSON.stringify(id)}`);
  }
  ids.add(id);
}

function generatedElementId(path: string): string {
  return `@element:${path}`;
}

function optionalField(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return hasOwn(record, key) ? record[key] : undefined;
}

function requiredArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): readonly unknown[] {
  const value = requiredField(record, key, path);
  if (!Array.isArray(value)) invalidValue(`${path}.${key}`, 'field must be an array');
  return value;
}

function optionalArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): readonly unknown[] {
  if (!hasOwn(record, key)) return [];
  const value = record[key];
  if (!Array.isArray(value)) invalidValue(`${path}.${key}`, 'field must be an array');
  return value;
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  fallback: string,
): string {
  return hasOwn(record, key) ? stringValue(record[key], `${path}.${key}`) : fallback;
}

function optionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  fallback: boolean,
): boolean {
  return hasOwn(record, key) ? booleanValue(record[key], `${path}.${key}`) : fallback;
}

function optionalInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  fallback: number,
): number {
  if (!hasOwn(record, key)) return fallback;
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    invalidValue(`${path}.${key}`, 'field must be an integer');
  }
  return value;
}

function optionalNonnegativeFiniteNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  fallback: number,
): number {
  return hasOwn(record, key)
    ? nonnegativeFiniteNumber(record[key], `${path}.${key}`)
    : fallback;
}

function optionalEnum(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  accepted: ReadonlySet<string>,
  fallback: string,
): string {
  return hasOwn(record, key)
    ? enumValue(record[key], `${path}.${key}`, accepted)
    : fallback;
}

function recordKind(value: unknown, path: string, accepted: ReadonlySet<string>): string {
  if (typeof value !== 'string' || !accepted.has(value)) {
    throw new PatchMapDatasetError(
      'INVALID_RECORD_KIND',
      path,
      `unsupported or missing discriminator ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function duplicateId(path: string, detail: string): never {
  throw new PatchMapDatasetError('DUPLICATE_ID', path, detail);
}
