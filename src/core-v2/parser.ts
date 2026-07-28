import type {
  AlignSetting,
  EntityInput,
  EntityKind,
  ImageEntityInput,
  Rgba,
  SceneDocument,
} from '../core-v1/contracts';
import {
  PatchMapParseError,
  type CoreV2BackgroundPaintProjection,
  type CoreV2BarProjection,
  type ComponentIdentity,
  type CoreV2ComponentRenderRole,
  type CoreV2ComponentVisualProjection,
  type CoreV2ContentOrientation,
  type CoreV2EntityProjection,
  type CoreV2ImageDimensionMode,
  type CoreV2ImageIntrinsicTransform,
  type CoreV2ImageProjection,
  type CoreV2ImageSourceKind,
  type CoreV2OmittedRelationProjection,
  type CoreV2RelationProjection,
  type CoreV2TextProjection,
  type ElementIdentity,
  type EntitySourceIdentity,
  type ExpandedItemIdentity,
  type ParseDiagnostic,
  type ParsePatchMapOptions,
  type ParsePatchMapResult,
} from './contracts';
import type {
  CoreV2ComponentSize,
  CoreV2ComponentType,
  CoreV2Edges,
  CoreV2Placement,
} from './semantic/dataset';
import {
  CORE_V2_IDENTITY_AFFINE,
  applyCoreV2Affine,
  coreV2AffineBasis,
  coreV2AffineCenter,
  createCoreV2Affine,
  multiplyCoreV2Affine,
  projectCoreV2SignedRect,
  type CoreV2AffineMatrix,
  type CoreV2DenseRectProjection,
} from './semantic/geometry';
import {
  layoutCoreV2Text,
  relocateCoreV2TextLayout,
  type CoreV2TextLayout,
  type CoreV2TextLayoutOptions,
} from './semantic/text-layout';
import { resolveCoreV2PlacementBounds } from './semantic/placement';
import {
  patchCoreV2StableRecord,
  type CoreV2StableRecordStrategy,
} from './semantic/stable-record-overlay';
import { CORE_V2_DEFAULT_COLOR_THEME } from './semantic/color';

type JsonRecord = Record<string, unknown>;

interface Transform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly affine: CoreV2AffineMatrix;
  readonly imageIntrinsicTransform: CoreV2ImageIntrinsicTransform;
}

interface EntityProjectionDraft extends CoreV2DenseRectProjection {
  readonly affine: CoreV2AffineMatrix;
  readonly rotationDegrees: number;
  readonly contentOrientation: CoreV2ContentOrientation;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Box extends Size {
  readonly x: number;
  readonly y: number;
}

interface MutableElementIdentity extends Omit<ElementIdentity, 'entityIds'> {
  entityIds: string[];
}

interface MutableComponentIdentity extends Omit<ComponentIdentity, 'entityIds'> {
  entityIds: string[];
}

interface MutableExpandedItemIdentity extends Omit<ExpandedItemIdentity, 'entityIds'> {
  entityIds: string[];
}

interface PendingRelation {
  readonly path: string;
  readonly entityId: string;
  readonly relationId: string;
  readonly authoredIndex: number;
  readonly from: string;
  readonly to: string;
  readonly transform: Transform;
  readonly owner: EntityOwner;
  readonly entity: Extract<EntityInput, { readonly kind: 'relation' }>;
}

interface ParseState {
  readonly options: ParsePatchMapOptions;
  readonly entities: EntityInput[];
  readonly diagnostics: ParseDiagnostic[];
  readonly elementIdentities: MutableElementIdentity[];
  readonly sourceElementPathById: Map<string, string>;
  readonly componentIdentities: MutableComponentIdentity[];
  readonly componentIdentityByPath: Map<string, MutableComponentIdentity>;
  readonly expandedItems: MutableExpandedItemIdentity[];
  readonly entityIds: Set<string>;
  readonly targetIds: Set<string>;
  readonly entityIdsBySourceId: Record<string, string[]>;
  readonly entityIdsByComponentId: Record<string, string[]>;
  readonly entitySourceById: Record<string, EntitySourceIdentity>;
  readonly projectionByEntityId: Record<string, CoreV2EntityProjection>;
  readonly componentVisualProjectionByEntityId: Record<string, CoreV2ComponentVisualProjection>;
  readonly backgroundPaintProjectionByEntityId: Record<string, CoreV2BackgroundPaintProjection>;
  readonly imageProjectionByEntityId: Record<string, CoreV2ImageProjection>;
  readonly textProjectionByEntityId: Record<string, CoreV2TextProjection>;
  readonly barProjectionByEntityId: Record<string, CoreV2BarProjection>;
  readonly relationProjectionByEntityId: Record<string, CoreV2RelationProjection>;
  readonly omittedRelations: CoreV2OmittedRelationProjection[];
  readonly pendingRelations: PendingRelation[];
  readonly relationPairsBySourceId: Map<string, Set<string>>;
  readonly warned: Set<string>;
  sourceElements: number;
  relationLinks: number;
  gridCells: number;
}

export interface CoreV2DirectTextParseTargetIndex {
  readonly rootIndex: number;
  readonly componentIndex: number;
  readonly componentPath: string;
  readonly entityId: string;
  readonly entityIndex: number;
}

interface DirectTextParseIndexes {
  readonly rootIds: readonly string[];
  readonly targets: ReadonlyMap<string, CoreV2DirectTextParseTargetIndex>;
}

const DIRECT_TEXT_PARSE_INDEX_CACHE = new WeakMap<
  ParsePatchMapResult,
  DirectTextParseIndexes
>();

/**
 * Renderer diagnostics may wrap an otherwise unchanged parser result. Carry
 * private direct-update indexes across that immutable shell so repeat text
 * edits do not rebuild the 5,000-root/component/entity lookup catalog.
 */
export function inheritPatchMapV010DirectParseIndexes(
  source: ParsePatchMapResult,
  target: ParsePatchMapResult,
): void {
  if (source === target) return;
  const indexes = DIRECT_TEXT_PARSE_INDEX_CACHE.get(source);
  if (indexes !== undefined) DIRECT_TEXT_PARSE_INDEX_CACHE.set(target, indexes);
}

interface ElementContext {
  readonly transform: Transform;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly ancestorIdentities: readonly MutableElementIdentity[];
}

interface EntityOwner {
  readonly element: MutableElementIdentity;
  readonly ancestors: readonly MutableElementIdentity[];
  readonly instance?: MutableExpandedItemIdentity;
  readonly component?: MutableComponentIdentity;
}

const ZERO_EDGES: CoreV2Edges = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
const TEXT_PLACEMENTS = new Set<CoreV2Placement>([
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
const AVAILABLE_TEXT_FONTS = Object.freeze(['Fira Code', 'Unifont']);
const BASIC_TEXT_STYLE_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fill',
  'align',
  'wordWrap',
  'wordWrapWidth',
  'breakWords',
  'lineHeight',
  'letterSpacing',
  'autoFont',
  'overflow',
]);
const TRANSFORM_ATTRIBUTE_KEYS = new Set(['x', 'y', 'angle', 'rotation']);
const SIGNED_SCALE_ATTRIBUTE_KEYS = new Set(['scaleX', 'scaleY']);
const SIGNED_SCALE_ATTRIBUTE_TYPES = new Set([
  'group',
  'grid',
  'item',
  'rect',
  'image',
  'text',
  'background',
  'bar',
  'icon',
  'relations',
]);
const TRANSFORM_ATTRIBUTE_TYPES = new Set([
  'group',
  'grid',
  'item',
  'rect',
  'image',
  'text',
  'background',
  'bar',
  'icon',
  'relations',
]);
const Z_INDEX_ATTRIBUTE_TYPES = new Set(['rect', 'image', 'text', 'relations']);

const ROOT_CONTEXT: ElementContext = {
  transform: {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    affine: CORE_V2_IDENTITY_AFFINE,
    imageIntrinsicTransform: Object.freeze({
      parentAffine: CORE_V2_IDENTITY_AFFINE,
      localTranslationAffine: CORE_V2_IDENTITY_AFFINE,
      localRotationScaleAffine: CORE_V2_IDENTITY_AFFINE,
      localPivotScaleAffine: CORE_V2_IDENTITY_AFFINE,
    }),
  },
  visible: true,
  interactive: true,
  ancestorIdentities: [],
};

export function parsePatchMapV010(
  input: unknown,
  options: ParsePatchMapOptions = {},
): ParsePatchMapResult {
  const state = createParseState(options);
  if (!Array.isArray(input)) {
    fatal(state, '$', 'invalid-root', 'PATCH MAP v0.10 input must be an array');
  }

  parseElements(input, '$', ROOT_CONTEXT, state);
  validateRelationEndpoints(state);
  return finishParseState(state);
}

/**
 * Parse selected canonical top-level roots into one fragment result. The
 * guarded incremental reconciler owns whole-dataset identity validation and
 * combines these fragments with unchanged parser-owned roots.
 */
export function parsePatchMapV010SelectedRoots(
  input: unknown,
  rootIndices: readonly number[],
  options: ParsePatchMapOptions = {},
  knownTargetIds: readonly string[] = [],
): ParsePatchMapResult {
  const state = createParseState(options);
  if (!Array.isArray(input)) {
    fatal(state, '$', 'invalid-root', 'PATCH MAP v0.10 input must be an array');
  }
  for (const targetId of knownTargetIds) state.targetIds.add(targetId);
  const seen = new Set<number>();
  for (const index of rootIndices) {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= input.length ||
      seen.has(index)
    ) {
      throw new RangeError('selected parser root indices must be unique in-range integers');
    }
    seen.add(index);
    parseElement(input[index], `$[${index}]`, ROOT_CONTEXT, state);
  }
  validateRelationEndpoints(state);
  return finishParseState(state);
}

export interface CoreV2DirectTextParseUpdate {
  readonly ownerId: string;
  readonly componentId: string;
  readonly text: string;
}

/**
 * Re-project validated top-level item text components without reparsing their
 * unchanged sibling geometry. This remains a guarded parser path: any
 * diagnostic-bearing or identity-ambiguous input returns `null` so the caller
 * can use the canonical selected-root parser.
 */
export function parsePatchMapV010DirectTextBatch(
  input: unknown,
  previous: ParsePatchMapResult,
  updates: readonly CoreV2DirectTextParseUpdate[],
  options: ParsePatchMapOptions = {},
  resolvedTargets?: readonly CoreV2DirectTextParseTargetIndex[],
  recordStrategy: CoreV2StableRecordStrategy = 'frozen-copy',
): ParsePatchMapResult | null {
  if (!Array.isArray(input) || input.length === 0 || updates.length === 0) {
    return null;
  }
  if (resolvedTargets !== undefined && resolvedTargets.length !== updates.length) {
    return null;
  }
  const indexes = resolvedTargets === undefined
    ? directTextParseIndexes(previous, input.length)
    : null;
  if (resolvedTargets === undefined) {
    if (indexes === null) return null;
    for (let index = 0; index < input.length; index += 1) {
      const root: unknown = input[index];
      if (!isRecord(root) || root.id !== indexes.rootIds[index]) {
        return null;
      }
    }
  }

  const state = createParseState(options);
  const pending: Array<Readonly<{
    readonly entityId: string;
    readonly entityIndex: number;
  }>> = [];
  const seen = new Set<string>();
  for (const update of updates) {
    if (
      typeof update.ownerId !== 'string' ||
      update.ownerId.length === 0 ||
      typeof update.componentId !== 'string' ||
      update.componentId.length === 0 ||
      typeof update.text !== 'string'
    ) {
      return null;
    }
    const key = directTextTargetKey(update.ownerId, update.componentId);
    if (seen.has(key)) return null;
    seen.add(key);
    const indexed = resolvedTargets?.[pending.length] ?? indexes?.targets.get(key);
    if (
      indexed === undefined ||
      indexed.componentPath !==
        `$[${indexed.rootIndex}].components[${indexed.componentIndex}]` ||
      previous.document.entities[indexed.entityIndex]?.id !== indexed.entityId
    ) {
      return null;
    }
    const rootValue: unknown = input[indexed.rootIndex];
    if (
      !isRecord(rootValue) ||
      rootValue.id !== update.ownerId ||
      rootValue.type !== 'item' ||
      !Array.isArray(rootValue.components)
    ) {
      return null;
    }
    const component: unknown = rootValue.components[indexed.componentIndex];
    if (!isRecord(component) || component.type !== 'text' || component.text !== update.text) {
      return null;
    }
    if (
      previous.diagnostics.some((diagnostic) =>
        diagnostic.path === indexed.componentPath ||
        diagnostic.path.startsWith(`${indexed.componentPath}.`))
    ) {
      return null;
    }
    if (
      !appendDirectTextComponent(
        state,
        rootValue,
        indexed.rootIndex,
        component,
        indexed.componentIndex,
      )
    ) {
      return null;
    }
    pending.push(Object.freeze({
      entityId: indexed.entityId,
      entityIndex: indexed.entityIndex,
    }));
  }

  if (
    state.diagnostics.length !== 0 ||
    state.entities.length !== pending.length
  ) {
    return null;
  }
  const selectedEntities = new Map(
    state.entities.map((entity) => [entity.id, deepFreeze(entity)] as const),
  );
  if (selectedEntities.size !== state.entities.length) return null;
  const entities = [...previous.document.entities];
  const entityIds = pending.map(({ entityId }) => entityId);
  const entityProjections = patchCoreV2StableRecord(
    previous.projection.byEntityId,
    state.projectionByEntityId,
    entityIds,
    recordStrategy,
    true,
  );
  const textProjections = patchCoreV2StableRecord(
    previous.projection.textsByEntityId,
    state.textProjectionByEntityId,
    entityIds,
    recordStrategy,
    true,
  );
  if (entityProjections === null || textProjections === null) return null;
  for (const entry of pending) {
    const entity = selectedEntities.get(entry.entityId);
    const projection = state.projectionByEntityId[entry.entityId];
    const text = state.textProjectionByEntityId[entry.entityId];
    if (entity?.kind !== 'text' || projection === undefined || text === undefined) {
      return null;
    }
    entities[entry.entityIndex] = entity;
  }

  const result = Object.freeze({
    ...previous,
    document: Object.freeze({
      ...previous.document,
      entities: Object.freeze(entities),
    }),
    projection: Object.freeze({
      ...previous.projection,
      byEntityId: entityProjections,
      textsByEntityId: textProjections,
    }),
  });
  if (indexes !== null) DIRECT_TEXT_PARSE_INDEX_CACHE.set(result, indexes);
  return result;
}

/**
 * Append one exact text component to a shared selected-component parse. The
 * caller finishes and freezes the parse once for the whole batch.
 */
function appendDirectTextComponent(
  state: ParseState,
  root: JsonRecord,
  rootIndex: number,
  component: JsonRecord,
  componentIndex: number,
): boolean {
  const rootId = root.id;
  if (typeof rootId !== 'string') return false;
  const rootPath = `$[${rootIndex}]`;
  const componentPath = `${rootPath}.components[${componentIndex}]`;
  state.sourceElements += 1;
  const element = createElementIdentity(root, rootId, rootPath, 'item');
  state.elementIdentities.push(element);
  state.sourceElementPathById.set(rootId, rootPath);
  const attrs = isRecord(root.attrs) ? root.attrs : undefined;
  inspectAttributes(attrs, `${rootPath}.attrs`, 'item', state);
  const transform = elementTransform(attrs, rootPath, ROOT_CONTEXT.transform, 'item', state);
  const size = fixedSize(root.size, `${rootPath}.size`, state);
  const padding = boxSpacing(root.padding, `${rootPath}.padding`, state);
  const content: Box = {
    x: padding.left,
    y: padding.top,
    width: Math.max(0, size.width - padding.left - padding.right),
    height: Math.max(0, size.height - padding.top - padding.bottom),
  };
  const contentOrientation = parseContentOrientation(
    root.contentOrientation,
    `${rootPath}.contentOrientation`,
    rootId,
    state,
  );
  const instance: MutableExpandedItemIdentity = {
    instanceId: rootId,
    sourceElementId: rootId,
    sourcePath: rootPath,
    entityIds: [],
  };
  state.expandedItems.push(instance);
  parseComponent(
    component,
    componentPath,
    rootId,
    rootId,
    transform,
    size,
    content,
    contentOrientation,
    root.show !== false,
    { element, ancestors: [], instance },
    state,
  );
  return true;
}

/**
 * Expected-equivalent cooperative parser for large browser loads. Individual
 * top-level records remain atomic, while the shared identity/relation state is
 * retained across bounded main-thread tasks.
 */
export async function parsePatchMapV010Async(
  input: unknown,
  options: ParsePatchMapOptions = {},
): Promise<ParsePatchMapResult> {
  const state = createParseState(options);
  if (!Array.isArray(input)) {
    fatal(state, '$', 'invalid-root', 'PATCH MAP v0.10 input must be an array');
  }

  let sliceStarted = parserNow();
  for (const [index, value] of input.entries()) {
    parseElement(value, `$[${index}]`, ROOT_CONTEXT, state);
    if (parserNow() - sliceStarted < 8 || index === input.length - 1) continue;
    await yieldParserTask();
    sliceStarted = parserNow();
  }
  await yieldParserTask();
  validateRelationEndpoints(state);
  const result = finishParseState(state, false);
  await deepFreezeAsync(result);
  return result;
}

function createParseState(options: ParsePatchMapOptions): ParseState {
  return {
    options,
    entities: [],
    diagnostics: [],
    elementIdentities: [],
    sourceElementPathById: new Map(),
    componentIdentities: [],
    componentIdentityByPath: new Map(),
    expandedItems: [],
    entityIds: new Set(),
    targetIds: new Set(),
    entityIdsBySourceId: Object.create(null) as Record<string, string[]>,
    entityIdsByComponentId: Object.create(null) as Record<string, string[]>,
    entitySourceById: Object.create(null) as Record<string, EntitySourceIdentity>,
    projectionByEntityId: Object.create(null) as Record<string, CoreV2EntityProjection>,
    componentVisualProjectionByEntityId: Object.create(null) as Record<
      string,
      CoreV2ComponentVisualProjection
    >,
    backgroundPaintProjectionByEntityId: Object.create(null) as Record<
      string,
      CoreV2BackgroundPaintProjection
    >,
    imageProjectionByEntityId: Object.create(null) as Record<string, CoreV2ImageProjection>,
    textProjectionByEntityId: Object.create(null) as Record<string, CoreV2TextProjection>,
    barProjectionByEntityId: Object.create(null) as Record<string, CoreV2BarProjection>,
    relationProjectionByEntityId: Object.create(null) as Record<string, CoreV2RelationProjection>,
    omittedRelations: [],
    pendingRelations: [],
    relationPairsBySourceId: new Map(),
    warned: new Set(),
    sourceElements: 0,
    relationLinks: 0,
    gridCells: 0,
  };
}

function directTextTargetKey(ownerId: string, componentId: string): string {
  return `${ownerId.length}:${ownerId}:${componentId}`;
}

function directTextParseIndexes(
  previous: ParsePatchMapResult,
  rootCount: number,
): DirectTextParseIndexes | null {
  const cached = DIRECT_TEXT_PARSE_INDEX_CACHE.get(previous);
  if (cached !== undefined) {
    return cached.rootIds.length === rootCount ? cached : null;
  }
  const rootIds = new Array<string | undefined>(rootCount);
  for (const identity of previous.identity.elements) {
    const match = /^\$\[(\d+)\]$/u.exec(identity.sourcePath);
    if (match === null) continue;
    const index = Number(match[1]);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= rootCount ||
      rootIds[index] !== undefined
    ) {
      return null;
    }
    rootIds[index] = identity.sourceId;
  }
  if (rootIds.some((rootId) => rootId === undefined)) return null;

  const componentIdentities = new Map<string, ComponentIdentity>();
  for (const identity of previous.identity.components) {
    const key = directTextTargetKey(identity.sourceElementId, identity.componentId);
    if (componentIdentities.has(key)) return null;
    componentIdentities.set(key, identity);
  }
  const entityIndices = new Map(
    previous.document.entities.map((entity, index) => [entity.id, index] as const),
  );
  if (entityIndices.size !== previous.document.entities.length) return null;

  const targets = new Map<string, CoreV2DirectTextParseTargetIndex>();
  for (const projection of Object.values(previous.projection.textsByEntityId ?? {})) {
    if (
      projection.targetKind !== 'component' ||
      projection.ownerId === undefined ||
      projection.componentId === undefined
    ) {
      continue;
    }
    const key = directTextTargetKey(projection.ownerId, projection.componentId);
    const identity = componentIdentities.get(key);
    const pathMatch = identity === undefined
      ? null
      : /^\$\[(\d+)\]\.components\[(\d+)\]$/u.exec(identity.componentPath);
    const rootIndex = pathMatch === null ? Number.NaN : Number(pathMatch[1]);
    const componentIndex = pathMatch === null ? Number.NaN : Number(pathMatch[2]);
    const entityIndex = entityIndices.get(projection.entityId);
    if (
      targets.has(key) ||
      identity === undefined ||
      !Number.isSafeInteger(rootIndex) ||
      rootIndex < 0 ||
      rootIndex >= rootCount ||
      !Number.isSafeInteger(componentIndex) ||
      componentIndex < 0 ||
      rootIds[rootIndex] !== projection.ownerId ||
      entityIndex === undefined ||
      !identity.entityIds.includes(projection.entityId)
    ) {
      return null;
    }
    targets.set(key, Object.freeze({
      rootIndex,
      componentIndex,
      componentPath: identity.componentPath,
      entityId: projection.entityId,
      entityIndex,
    }));
  }
  const result = Object.freeze({
    rootIds: Object.freeze(rootIds as string[]),
    targets,
  });
  DIRECT_TEXT_PARSE_INDEX_CACHE.set(previous, result);
  return result;
}

function finishParseState(
  state: ParseState,
  freezeResult = true,
): ParsePatchMapResult {
  const kinds: Record<EntityKind, number> = {
    rect: 0,
    text: 0,
    image: 0,
    bar: 0,
    relation: 0,
  };
  for (const entity of state.entities) kinds[entity.kind] += 1;

  const document: SceneDocument = {
    version: 1,
    entities: state.entities,
  };
  const result: ParsePatchMapResult = {
    document,
    diagnostics: state.diagnostics,
    identity: {
      counts: {
        sourceElements: state.sourceElements,
        sourceComponents: state.componentIdentities.length,
        expandedItems: state.expandedItems.length,
        gridCells: state.gridCells,
        relationLinks: state.relationLinks,
        entities: state.entities.length,
        kinds,
      },
      entityIds: state.entities.map((entity) => entity.id),
      entityIdsBySourceId: state.entityIdsBySourceId,
      entityIdsByComponentId: state.entityIdsByComponentId,
      entitySourceById: state.entitySourceById,
      elements: state.elementIdentities,
      components: state.componentIdentities,
      expandedItems: state.expandedItems,
    },
    projection: {
      byEntityId: state.projectionByEntityId,
      componentsByEntityId: state.componentVisualProjectionByEntityId,
      backgroundsByEntityId: state.backgroundPaintProjectionByEntityId,
      imagesByEntityId: state.imageProjectionByEntityId,
      textsByEntityId: state.textProjectionByEntityId,
      barsByEntityId: state.barProjectionByEntityId,
      relationsByEntityId: state.relationProjectionByEntityId,
      omittedRelations: state.omittedRelations,
    },
  };

  return freezeResult ? deepFreeze(result) : result;
}

function parserNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function yieldParserTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function parseElements(
  values: readonly unknown[],
  path: string,
  context: ElementContext,
  state: ParseState,
): void {
  values.forEach((value, index) => parseElement(value, `${path}[${index}]`, context, state));
}

function parseElement(
  value: unknown,
  path: string,
  context: ElementContext,
  state: ParseState,
): void {
  state.sourceElements += 1;
  if (!isRecord(value)) {
    warn(state, path, 'unsupported-element', 'Non-object element was not rendered');
    return;
  }

  const type = typeof value.type === 'string' ? value.type : 'unknown';
  const sourceId = sourceIdentifier(value.id, `@element:${pathToken(path)}`, path, state);
  registerSourceElementId(sourceId, path, state);
  const identity = createElementIdentity(value, sourceId, path, type);
  state.elementIdentities.push(identity);

  const attrs = isRecord(value.attrs) ? value.attrs : undefined;
  inspectAttributes(attrs, `${path}.attrs`, type, state);
  const localTransform = elementTransform(attrs, path, context.transform, type, state);
  const visible = context.visible && value.show !== false;
  const interactive = context.interactive && value.locked !== true;
  const owner: EntityOwner = {
    element: identity,
    ancestors: context.ancestorIdentities,
  };

  switch (type) {
    case 'group': {
      if (!Array.isArray(value.children)) {
        fatal(state, `${path}.children`, 'invalid-group', 'Group children must be an array', sourceId);
      }
      parseElements(
        value.children,
        `${path}.children`,
        {
          transform: localTransform,
          visible,
          interactive,
          ancestorIdentities: [...context.ancestorIdentities, identity],
        },
        state,
      );
      return;
    }
    case 'grid':
      parseGrid(value, path, sourceId, localTransform, visible, interactive, owner, state);
      return;
    case 'item':
      parseItem(value, path, sourceId, localTransform, visible, interactive, owner, state);
      return;
    case 'relations':
      parseRelations(value, path, sourceId, localTransform, visible, owner, state);
      return;
    case 'rect':
      parseDirectRect(value, path, sourceId, localTransform, visible, interactive, owner, state);
      return;
    case 'image':
      parseDirectImage(value, path, sourceId, localTransform, visible, interactive, owner, state);
      return;
    case 'text':
      parseDirectText(value, path, sourceId, localTransform, visible, interactive, owner, state);
      return;
    default:
      warn(
        state,
        `${path}.type`,
        'unsupported-element',
        `Unsupported element type ${JSON.stringify(type)} was preserved in the identity index but not rendered`,
        sourceId,
      );
  }
}

function parseGrid(
  value: JsonRecord,
  path: string,
  sourceId: string,
  transform: Transform,
  visible: boolean,
  interactive: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  if (!Array.isArray(value.cells) || !isRecord(value.item)) {
    fatal(state, path, 'invalid-grid', 'Grid requires cells[][] and an item template', sourceId);
  }
  const item = value.item;
  const itemSize = fixedSize(item.size, `${path}.item.size`, state);
  const gap = axisSpacing(value.gap, `${path}.gap`, state);
  const hideInactive = value.inactiveCellStrategy === 'hide';
  if (value.inactiveCellStrategy !== undefined && !hideInactive) {
    warnOnce(
      state,
      'inactive-cell-strategy',
      `${path}.inactiveCellStrategy`,
      'inactive-cell-strategy-unsupported',
      'Unsupported inactiveCellStrategy fell back to skipping inactive cells',
      sourceId,
    );
  }

  const cells = value.cells as unknown[];
  cells.forEach((rowValue, row) => {
    if (!Array.isArray(rowValue)) {
      warn(state, `${path}.cells[${row}]`, 'unsupported-grid-row', 'Non-array grid row was skipped', sourceId);
      return;
    }
    const rowValues = rowValue as unknown[];
    rowValues.forEach((cellValue, column) => {
      if (cellValue !== 0 && cellValue !== 1 && typeof cellValue !== 'string') {
        warn(
          state,
          `${path}.cells[${row}][${column}]`,
          'unsupported-grid-cell',
          'Grid cell must be 0, 1, or a string and was skipped',
          sourceId,
        );
        return;
      }
      if (cellValue === 0 && !hideInactive) return;

      const instanceId = `${sourceId}.${row}.${column}`;
      const cellTransform = composeTransform(
        transform,
        column * (itemSize.width + gap.x),
        row * (itemSize.height + gap.y),
        0,
      );
      const itemAttrs = isRecord(item.attrs) ? item.attrs : undefined;
      inspectAttributes(itemAttrs, `${path}.item.attrs`, 'item', state);
      const itemTransform = elementTransform(
        itemAttrs,
        `${path}.item`,
        cellTransform,
        'item',
        state,
      );
      state.gridCells += 1;
      parseItemInstance(
        item,
        `${path}.item`,
        instanceId,
        sourceId,
        itemTransform,
        visible && cellValue !== 0,
        interactive && cellValue !== 0,
        itemSize,
        owner,
        { row, column, cell: cellValue },
        state,
      );
    });
  });
}

function parseItem(
  value: JsonRecord,
  path: string,
  sourceId: string,
  transform: Transform,
  visible: boolean,
  interactive: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  const size = fixedSize(value.size, `${path}.size`, state);
  parseItemInstance(
    value,
    path,
    sourceId,
    sourceId,
    transform,
    visible,
    interactive,
    size,
    owner,
    undefined,
    state,
  );
}

function parseItemInstance(
  item: JsonRecord,
  itemPath: string,
  instanceId: string,
  sourceElementId: string,
  transform: Transform,
  visible: boolean,
  interactive: boolean,
  size: Size,
  owner: EntityOwner,
  grid: ExpandedItemIdentity['grid'] | undefined,
  state: ParseState,
): void {
  const contentOrientation = parseContentOrientation(
    item.contentOrientation,
    `${itemPath}.contentOrientation`,
    sourceElementId,
    state,
  );
  const instance: MutableExpandedItemIdentity = {
    instanceId,
    sourceElementId,
    sourcePath: itemPath,
    entityIds: [],
    ...(grid ? { grid } : {}),
  };
  state.expandedItems.push(instance);

  const denseTransform = centerPivotTopLeft(transform, size, 'follow-item');
  addEntity(
    {
      kind: 'rect',
      id: instanceId,
      x: denseTransform.x,
      y: denseTransform.y,
      width: denseTransform.width,
      height: denseTransform.height,
      rotation: transform.rotation,
      fill: 0x00000000,
      visible,
      interactive,
      zIndex: 0,
      tags: ['item', `source:${sourceElementId}`],
    },
    { ...owner, instance },
    state,
    denseTransform,
  );

  if (item.components === undefined) return;
  if (!Array.isArray(item.components)) {
    warn(state, `${itemPath}.components`, 'unsupported-components', 'Item components must be an array', sourceElementId);
    return;
  }
  const padding = boxSpacing(item.padding, `${itemPath}.padding`, state);
  const content: Box = {
    x: padding.left,
    y: padding.top,
    width: Math.max(0, size.width - padding.left - padding.right),
    height: Math.max(0, size.height - padding.top - padding.bottom),
  };
  item.components.forEach((component, index) => {
    parseComponent(
      component,
      `${itemPath}.components[${index}]`,
      instanceId,
      sourceElementId,
      transform,
      size,
      content,
      contentOrientation,
      visible,
      { ...owner, instance },
      state,
    );
  });
}

function parseComponent(
  value: unknown,
  path: string,
  instanceId: string,
  sourceElementId: string,
  itemTransform: Transform,
  itemSize: Size,
  content: Box,
  contentOrientation: CoreV2ContentOrientation,
  visible: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  if (!isRecord(value)) {
    warn(state, path, 'unsupported-component', 'Non-object component was not rendered', sourceElementId);
    return;
  }
  const type = typeof value.type === 'string' ? value.type : 'unknown';
  if (
    type !== 'bar' &&
    (value.animation !== undefined || value.animationDuration !== undefined)
  ) {
    warnOnce(
      state,
      `component-animation:${type}`,
      path,
      'component-animation-unsupported',
      'animation/animationDuration are unsupported on non-bar components',
      sourceElementId,
    );
  }
  const componentId = sourceIdentifier(value.id, `@component:${pathToken(path)}`, path, state);
  const component = componentIdentity(value, componentId, path, type, sourceElementId, state);
  const entityId = `${instanceId}::${type}:${componentId}`;
  const componentVisible = visible && value.show !== false;
  const attrs = isRecord(value.attrs) ? value.attrs : undefined;
  inspectAttributes(attrs, `${path}.attrs`, type, state);

  if (type === 'background') {
    const source = value.source;
    const sourceRecord = isRecord(source) ? source : undefined;
    // Approved v0.10 compatibility semantics preserve authored background size
    // in the semantic dataset, but always paint the complete item frame.
    const local: Box = { x: 0, y: 0, width: itemSize.width, height: itemSize.height };
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    if (sourceRecord?.type === 'rect') {
      const sourceFill = resolveColor(sourceRecord.fill, 0xffffffff, `${path}.source.fill`, state);
      const borderWidth = projectedBackgroundBorderWidth(
        sourceRecord.borderWidth,
        `${path}.source.borderWidth`,
        state,
      );
      const borderColor = resolveColor(
        sourceRecord.borderColor,
        0x000000ff,
        `${path}.source.borderColor`,
        state,
      );
      const radius = projectedBackgroundRadius(sourceRecord.radius, `${path}.source.radius`, state);
      const tint = resolveColor(value.tint, 0xffffffff, `${path}.tint`, state);
      const fill = multiplyColor(sourceFill, tint);
      addComponentVisualProjection(
        entityId,
        instanceId,
        componentId,
        type,
        'background-geometry',
        value.size,
        state,
      );
      state.backgroundPaintProjectionByEntityId[entityId] = Object.freeze({
        entityId,
        sourceKind: 'rect',
        fill: sourceFill,
        borderWidth,
        borderColor,
        radius,
        tint,
      });
      const denseTransform = centerPivotTopLeft(transform, local, 'follow-item');
      addEntity(
        {
          kind: 'rect',
          id: entityId,
          x: denseTransform.x,
          y: denseTransform.y,
          width: denseTransform.width,
          height: denseTransform.height,
          rotation: transform.rotation,
          fill,
          ...(sourceRecord.borderColor !== undefined || borderWidth > 0
            ? { stroke: borderColor }
            : {}),
          ...(sourceRecord.borderWidth !== undefined
            ? { strokeWidth: borderWidth }
            : {}),
          ...(finiteNumber(sourceRecord.radius) !== undefined
            ? { radius: Math.max(0, finiteNumber(sourceRecord.radius) as number) }
            : {}),
          visible: componentVisible,
          interactive: false,
          zIndex: -10,
          tags: ['background', `parent:${instanceId}`, `component:${componentId}`],
        },
        { ...owner, component },
        state,
        denseTransform,
      );
      return;
    }
    const tint = resolveColor(value.tint, 0xffffffff, `${path}.tint`, state);
    addComponentVisualProjection(
      entityId,
      instanceId,
      componentId,
      type,
      'background-asset',
      value.size,
      state,
    );
    state.backgroundPaintProjectionByEntityId[entityId] = Object.freeze({
      entityId,
      sourceKind: 'asset',
      fill: 0x00000000,
      borderWidth: 0,
      borderColor: 0x000000ff,
      radius: Object.freeze([0, 0, 0, 0] as const),
      tint,
    });
    const asset = imageSourceProjection(
      entityId,
      source,
      `${path}.source`,
      'layout',
      value.size !== undefined,
      state,
    );
    addEntity(
      imageEntity(
        entityId,
        transform,
        local,
        asset,
        value.tint === undefined ? undefined : tint,
        componentVisible,
        -10,
        path,
        state,
      ),
      { ...owner, component },
      state,
      centerPivotTopLeft(transform, local, 'follow-item'),
    );
    return;
  }

  if (type === 'bar') {
    const componentSize = resolveComponentSize(value.size, content, `${path}.size`, state);
    const placement = barPlacement(value.placement, `${path}.placement`, state);
    const margin = boxSpacing(value.margin, `${path}.margin`, state);
    const local = resolveCoreV2PlacementBounds(content, componentSize, placement, margin, path);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    const denseTransform = centerPivotTopLeft(transform, local, contentOrientation);
    const animation = barAnimation(value.animation, `${path}.animation`, sourceElementId, state);
    const animationDuration = barAnimationDuration(
      value.animationDuration,
      `${path}.animationDuration`,
      sourceElementId,
      state,
    );
    const source = isRecord(value.source) ? value.source : undefined;
    if (value.source !== undefined && source?.type !== 'rect') {
      warn(state, `${path}.source`, 'bar-source-degraded', 'Non-rect bar source is rendered as a tinted aggregate bar', sourceElementId);
    }
    const trackFill = resolveColor(source?.fill, 0x00000000, `${path}.source.fill`, state);
    const fill = value.tint === undefined
      ? trackFill
      : multiplyColor(trackFill === 0 ? 0xffffffff : trackFill, resolveColor(value.tint, 0xffffffff, `${path}.tint`, state));
    state.barProjectionByEntityId[entityId] = Object.freeze({
      entityId,
      ownerId: instanceId,
      componentId,
      placement,
      margin: Object.freeze(margin),
      contentOrientation,
      animation,
      animationDuration,
      destinationHeight: local.height,
    });
    addEntity(
      {
        kind: 'bar',
        id: entityId,
        x: denseTransform.x,
        y: denseTransform.y,
        width: denseTransform.width,
        height: denseTransform.height,
        rotation: transform.rotation,
        value: 1,
        min: 0,
        max: 1,
        fill,
        trackFill,
        ...(finiteNumber(source?.radius) !== undefined
          ? { radius: Math.max(0, finiteNumber(source?.radius) as number) }
          : {}),
        visible: componentVisible,
        interactive: false,
        zIndex: 10,
        tags: ['bar', `parent:${instanceId}`, `component:${componentId}`],
      },
      { ...owner, component },
      state,
      denseTransform,
    );
    return;
  }

  if (type === 'icon') {
    const componentSize = resolveComponentSize(value.size, content, `${path}.size`, state);
    const local = placeBox(content, componentSize, value.placement ?? 'center', value.margin, path, state);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    addComponentVisualProjection(
      entityId,
      instanceId,
      componentId,
      type,
      'content-asset',
      value.size,
      state,
    );
    addEntity(
      imageEntity(
        entityId,
        transform,
        local,
        imageSourceProjection(
          entityId,
          value.source,
          `${path}.source`,
          'layout',
          value.size !== undefined,
          state,
        ),
        value.tint,
        componentVisible,
        20,
        path,
        state,
      ),
      { ...owner, component },
      state,
      centerPivotTopLeft(transform, local, contentOrientation),
    );
    return;
  }

  if (type === 'text') {
    const style = isRecord(value.style) ? value.style : {};
    const margins = boxSpacing(value.margin, `${path}.margin`, state);
    const available: Box = {
      x: content.x + margins.left,
      y: content.y + margins.top,
      width: Math.max(0, content.width - margins.left - margins.right),
      height: Math.max(0, content.height - margins.top - margins.bottom),
    };
    const source = typeof value.text === 'string' ? value.text : '';
    const split = textSplit(value.split, `${path}.split`, state);
    const placement = textPlacement(value.placement, `${path}.placement`, state);
    const initialLayout = semanticTextLayout(
      source,
      style,
      { width: available.width, height: available.height },
      style.overflow,
      split,
      undefined,
      path,
      state,
    );
    const local = placeBox(
      content,
      {
        width: initialLayout.layoutBounds.width,
        height: initialLayout.layoutBounds.height,
      },
      placement,
      margins,
      path,
      state,
    );
    const layout = relocateCoreV2TextLayout(initialLayout, { x: local.x, y: local.y });
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    const color = resolveColor(value.tint ?? style.fill, 0x000000ff, `${path}.style.fill`, state);
    addTextProjection({
      entityId,
      targetKind: 'component',
      ownerId: instanceId,
      componentId,
      authoredStyle: style,
      color,
      placement,
      margin: margins,
      contentOrientation,
      layout,
    }, state);
    addEntity(
      textEntity(
        entityId,
        transform,
        local,
        layout,
        style,
        color,
        componentVisible,
        false,
        30,
        path,
        state,
      ),
      { ...owner, component },
      state,
      centerPivotTopLeft(transform, local, contentOrientation),
    );
    return;
  }

  warn(
    state,
    `${path}.type`,
    'unsupported-component',
    `Unsupported component type ${JSON.stringify(type)} was preserved in the identity index but not rendered`,
    sourceElementId,
  );
}

function parseDirectRect(
  value: JsonRecord,
  path: string,
  sourceId: string,
  transform: Transform,
  visible: boolean,
  interactive: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  const size = fixedSize(value.size, `${path}.size`, state);
  const stroke = isRecord(value.stroke) ? value.stroke : undefined;
  const radius = projectedRadius(value.radius, `${path}.radius`, state);
  const denseTransform = centerPivotTopLeft(transform, size);
  addEntity(
    {
      kind: 'rect',
      id: sourceId,
      x: denseTransform.x,
      y: denseTransform.y,
      width: denseTransform.width,
      height: denseTransform.height,
      rotation: transform.rotation,
      fill: resolveColor(value.fill, 0xffffffff, `${path}.fill`, state),
      ...(value.stroke !== undefined
        ? { stroke: resolveColor(stroke?.color ?? value.stroke, 0x000000ff, `${path}.stroke`, state) }
        : {}),
      ...(finiteNumber(stroke?.width) !== undefined
        ? { strokeWidth: Math.max(0, finiteNumber(stroke?.width) as number) }
        : {}),
      ...(radius === undefined ? {} : { radius }),
      visible,
      interactive: eventInteractivity(value.eventMode, interactive, `${path}.eventMode`, state),
      zIndex: zIndex(value.attrs),
      tags: ['rect', `source:${sourceId}`],
    },
    owner,
    state,
    denseTransform,
  );
}

function parseDirectImage(
  value: JsonRecord,
  path: string,
  sourceId: string,
  transform: Transform,
  visible: boolean,
  interactive: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  const authoredSize = value.size !== undefined;
  const size = !authoredSize
    ? { width: 32, height: 32 }
    : fixedSize(value.size, `${path}.size`, state);
  const denseTransform = centerPivotImage(transform, size);
  const projected = imageEntity(
    sourceId,
    transform,
    { x: 0, y: 0, ...size },
    imageSourceProjection(
      sourceId,
      value.source,
      `${path}.source`,
      authoredSize ? 'authored' : 'intrinsic',
      authoredSize,
      state,
      !authoredSize ? transform.imageIntrinsicTransform : undefined,
    ),
    undefined,
    visible,
    zIndex(value.attrs),
    path,
    state,
  );
  addEntity(
    {
      ...projected,
      x: denseTransform.x,
      y: denseTransform.y,
      width: denseTransform.width,
      height: denseTransform.height,
      ...(value.opacity === undefined
        ? {}
        : { opacity: projectedOpacity(value.opacity, `${path}.opacity`, state) }),
      interactive,
    },
    owner,
    state,
    denseTransform,
  );
}

function parseDirectText(
  value: JsonRecord,
  path: string,
  sourceId: string,
  transform: Transform,
  visible: boolean,
  interactive: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  const style = isRecord(value.style) ? value.style : {};
  const source = typeof value.text === 'string' ? value.text : '';
  const authoredFrame = value.size === undefined
    ? undefined
    : fixedSize(value.size, `${path}.size`, state);
  const layout = semanticTextLayout(
    source,
    style,
    authoredFrame,
    value.overflow,
    0,
    { x: 0, y: 0 },
    path,
    state,
  );
  const box: Box = {
    x: 0,
    y: 0,
    width: layout.layoutBounds.width,
    height: layout.layoutBounds.height,
  };
  const color = resolveColor(style.fill, 0x000000ff, `${path}.style.fill`, state);
  addTextProjection({
    entityId: sourceId,
    targetKind: 'element',
    authoredStyle: style,
    color,
    placement: null,
    margin: ZERO_EDGES,
    contentOrientation: 'follow-item',
    layout,
  }, state);
  addEntity(
    textEntity(
      sourceId,
      transform,
      box,
      layout,
      style,
      color,
      visible,
      interactive,
      zIndex(value.attrs),
      path,
      state,
    ),
    owner,
    state,
    centerPivotTopLeft(transform, box),
  );
}

function parseRelations(
  value: JsonRecord,
  path: string,
  sourceId: string,
  transform: Transform,
  visible: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  if (!Array.isArray(value.links)) {
    fatal(state, `${path}.links`, 'invalid-relations', 'Relations links must be an array', sourceId);
  }
  const style = isRecord(value.style) ? value.style : {};
  if (style.alpha !== undefined && style.opacity !== undefined) {
    fatal(
      state,
      `${path}.style`,
      'relation-opacity-conflict',
      'Relation style alpha and opacity cannot both be authored',
      sourceId,
    );
  }
  const determinant = transform.affine[0] * transform.affine[3] -
    transform.affine[1] * transform.affine[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) {
    fatal(
      state,
      `${path}.attrs`,
      'non-invertible-relation-transform',
      'Relations transform must remain invertible for relation-local projection',
      sourceId,
    );
  }
  // Aggregate relation geometry is a sequence of independent butt-capped
  // segments, so the materializer defaults are exact and need no warning.
  if (
    (style.cap !== undefined && style.cap !== 'butt') ||
    (style.join !== undefined && style.join !== 'miter')
  ) {
    warnOnce(state, 'relation-cap-join', `${path}.style`, 'relation-style-degraded', 'Relation cap/join are not retained or projected; basic line geometry is used', sourceId);
  }
  value.links.forEach((linkValue, index) => {
    const linkPath = `${path}.links[${index}]`;
    if (!isRecord(linkValue)) {
      fatal(state, linkPath, 'invalid-relation-link', 'Relation link must be an object', sourceId);
    }
    const from = relationEndpoint(linkValue.source, `${linkPath}.source`, state, sourceId);
    const to = relationEndpoint(linkValue.target, `${linkPath}.target`, state, sourceId);
    const pairKey = relationPairKey(from, to);
    const relationPairs = state.relationPairsBySourceId.get(sourceId) ?? new Set<string>();
    if (relationPairs.has(pairKey)) return;
    relationPairs.add(pairKey);
    state.relationPairsBySourceId.set(sourceId, relationPairs);
    const entityId = relationEntityId(sourceId, pairKey);
    state.relationLinks += 1;
    const entity = {
        kind: 'relation',
        id: entityId,
        from,
        to,
        color: resolveColor(style.color, 0x000000ff, `${path}.style.color`, state),
        lineWidth: Math.max(0, finiteNumber(style.width) ?? 1),
        opacity: clamp01(finiteNumber(style.alpha) ?? finiteNumber(style.opacity) ?? 1),
        visible,
        interactive: false,
        zIndex: zIndex(value.attrs),
        tags: ['relation', `source:${sourceId}`],
      } as const;
    state.pendingRelations.push({
      path: linkPath,
      entityId,
      relationId: sourceId,
      authoredIndex: index,
      from,
      to,
      transform,
      owner,
      entity,
    });
  });
}

function addEntity(
  entity: EntityInput,
  owner: EntityOwner,
  state: ParseState,
  projection?: EntityProjectionDraft,
): void {
  if (state.entityIds.has(entity.id)) {
    fatal(
      state,
      owner.component?.componentPath ?? owner.element.sourcePath,
      'duplicate-entity-id',
      `Duplicate visible entity ID ${JSON.stringify(entity.id)}`,
      owner.element.sourceId,
      entity.id,
    );
  }
  const storedEntity = entity.kind !== 'relation' && entity.kind !== 'text' &&
    (entity.width === 0 || entity.height === 0) && entity.interactive
    ? Object.freeze({ ...entity, interactive: false }) as EntityInput
    : entity;
  state.entityIds.add(entity.id);
  if (entity.kind !== 'relation') state.targetIds.add(entity.id);
  state.entities.push(storedEntity);
  if (entity.kind !== 'relation') {
    const affine = projection?.affine ?? createCoreV2Affine(
      entity.x,
      entity.y,
      entity.rotation ?? 0,
    );
    state.projectionByEntityId[entity.id] = Object.freeze({
      entityId: entity.id,
      localBounds: projection?.localBounds ?? Object.freeze([
        0,
        0,
        entity.width,
        entity.height,
      ] as const),
      affine,
      worldBasis: coreV2AffineBasis(affine),
      visibleCenter: projection?.affine
        ? coreV2AffineCenter(projection.affine, projection.localBounds)
        : Object.freeze([entity.x + entity.width / 2, entity.y + entity.height / 2] as const),
      rotationDegrees: projection?.rotationDegrees ?? entity.rotation ?? 0,
      scaleX: projection?.scaleX ?? 1,
      scaleY: projection?.scaleY ?? 1,
      contentOrientation: projection?.contentOrientation ?? 'follow-item',
      ...(owner.instance ? { ownerItemId: owner.instance.instanceId } : {}),
      ...(owner.component
        ? {
            componentId: owner.component.componentId,
            componentType: owner.component.type,
          }
        : {}),
    });
  }
  owner.element.entityIds.push(entity.id);
  appendRecord(state.entityIdsBySourceId, owner.element.sourceId, entity.id);
  for (const ancestor of owner.ancestors) {
    ancestor.entityIds.push(entity.id);
    appendRecord(state.entityIdsBySourceId, ancestor.sourceId, entity.id);
  }
  owner.instance?.entityIds.push(entity.id);
  if (owner.component) {
    owner.component.entityIds.push(entity.id);
    appendRecord(state.entityIdsByComponentId, owner.component.componentId, entity.id);
  }
  state.entitySourceById[entity.id] = {
    entityId: entity.id,
    sourceElementId: owner.element.sourceId,
    sourceElementPath: owner.element.sourcePath,
    ...(owner.instance ? { instanceId: owner.instance.instanceId } : {}),
    ...(owner.component
      ? {
          componentId: owner.component.componentId,
          componentPath: owner.component.componentPath,
        }
      : {}),
  };
}

function validateRelationEndpoints(state: ParseState): void {
  for (const relation of state.pendingRelations) {
    const sourceExists = state.targetIds.has(relation.from);
    const targetExists = state.targetIds.has(relation.to);
    const projection = Object.freeze({
      entityId: relation.entityId,
      relationId: relation.relationId,
      sourceId: relation.from,
      targetId: relation.to,
      key: `${relation.from}>${relation.to}`,
      identityKey: relationPairKey(relation.from, relation.to),
      authoredIndex: relation.authoredIndex,
      affine: relation.transform.affine,
    } satisfies CoreV2RelationProjection);
    if (sourceExists && targetExists) {
      state.relationProjectionByEntityId[relation.entityId] = projection;
      addEntity(relation.entity, relation.owner, state);
      continue;
    }
    const reason = !sourceExists && !targetExists
      ? 'missing-source-and-target'
      : !sourceExists
        ? 'missing-source'
        : 'missing-target';
    state.omittedRelations.push(Object.freeze({ ...projection, reason }));
    state.diagnostics.push({
      level: 'warning',
      code: 'omitted-relation-endpoint',
      path: relation.path,
      message: `Relation segment was omitted because ${reason.replaceAll('-', ' ')}`,
      entityId: relation.entityId,
    });
  }
  const failures = state.diagnostics.filter((entry) => entry.level === 'error');
  if (failures.length > 0) {
    throw new PatchMapParseError(
      `PATCH MAP v0.10 parse failed with ${failures.length} error${failures.length === 1 ? '' : 's'}`,
      deepFreeze([...state.diagnostics]),
    );
  }
}

function relationPairKey(source: string, target: string): string {
  return `${source.length}:${source}${target.length}:${target}`;
}

function relationEntityId(relationId: string, identityKey: string): string {
  return `@relation:${relationId.length}:${relationId}${identityKey}`;
}

function createElementIdentity(
  value: JsonRecord,
  sourceId: string,
  sourcePath: string,
  type: string,
): MutableElementIdentity {
  const attrs = isRecord(value.attrs) ? cloneJson(value.attrs) as Readonly<Record<string, unknown>> : undefined;
  const metadata = value.metadata ?? (isRecord(value.attrs) ? value.attrs.metadata : undefined);
  return {
    sourceId,
    sourcePath,
    type,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    entityIds: [],
    ...(attrs ? { rawAttrs: attrs } : {}),
    ...(metadata !== undefined ? { rawMetadata: cloneJson(metadata) } : {}),
  };
}

function componentIdentity(
  value: JsonRecord,
  componentId: string,
  componentPath: string,
  type: string,
  sourceElementId: string,
  state: ParseState,
): MutableComponentIdentity {
  const existing = state.componentIdentityByPath.get(componentPath);
  if (existing) return existing;
  const attrs = isRecord(value.attrs) ? cloneJson(value.attrs) as Readonly<Record<string, unknown>> : undefined;
  const metadata = value.metadata ?? (isRecord(value.attrs) ? value.attrs.metadata : undefined);
  const identity: MutableComponentIdentity = {
    componentId,
    componentPath,
    type,
    sourceElementId,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    entityIds: [],
    ...(attrs ? { rawAttrs: attrs } : {}),
    ...(metadata !== undefined ? { rawMetadata: cloneJson(metadata) } : {}),
  };
  state.componentIdentityByPath.set(componentPath, identity);
  state.componentIdentities.push(identity);
  return identity;
}

function addComponentVisualProjection(
  entityId: string,
  ownerId: string,
  componentId: string,
  componentType: CoreV2ComponentType,
  renderRole: CoreV2ComponentRenderRole,
  authoredSize: unknown,
  state: ParseState,
): void {
  state.componentVisualProjectionByEntityId[entityId] = Object.freeze({
    entityId,
    ownerId,
    componentId,
    componentType,
    // The stable dense entity ID is the product identity token. Physical Pixi
    // objects may be replaced without changing this semantic identity.
    logicalIdentity: entityId,
    renderRole,
    ...(authoredSize === undefined
      ? {}
      : {
          authoredSize: deepFreeze(cloneJson(authoredSize)) as CoreV2ComponentSize,
        }),
  });
}

function projectedBackgroundBorderWidth(
  value: unknown,
  path: string,
  state: ParseState,
): number {
  if (value === undefined) return 0;
  const width = finiteNumber(value);
  if (width !== undefined) return nonNegative(width, path, state);
  warn(state, path, 'invalid-border-width', 'Invalid background border width fell back to zero');
  return 0;
}

function projectedBackgroundRadius(
  value: unknown,
  path: string,
  state: ParseState,
): readonly [number, number, number, number] {
  const scalar = finiteNumber(value);
  if (scalar !== undefined) {
    const radius = nonNegative(scalar, path, state);
    return Object.freeze([radius, radius, radius, radius] as const);
  }
  if (value === undefined) return Object.freeze([0, 0, 0, 0] as const);
  if (Array.isArray(value)) {
    if (value.length !== 4) {
      warn(state, path, 'invalid-radius', 'Background corner radius array must contain four entries');
      return Object.freeze([0, 0, 0, 0] as const);
    }
    return Object.freeze([
      projectedBackgroundRadiusCorner(value[0], `${path}[0]`, state),
      projectedBackgroundRadiusCorner(value[1], `${path}[1]`, state),
      projectedBackgroundRadiusCorner(value[2], `${path}[2]`, state),
      projectedBackgroundRadiusCorner(value[3], `${path}[3]`, state),
    ] as const);
  }
  if (isRecord(value)) {
    return Object.freeze([
      projectedBackgroundRadiusCorner(value.topLeft, `${path}.topLeft`, state),
      projectedBackgroundRadiusCorner(value.topRight, `${path}.topRight`, state),
      projectedBackgroundRadiusCorner(value.bottomRight, `${path}.bottomRight`, state),
      projectedBackgroundRadiusCorner(value.bottomLeft, `${path}.bottomLeft`, state),
    ] as const);
  }
  warn(state, path, 'invalid-radius', 'Invalid background radius fell back to zero');
  return Object.freeze([0, 0, 0, 0] as const);
}

function projectedBackgroundRadiusCorner(
  value: unknown,
  path: string,
  state: ParseState,
): number {
  if (value === undefined) return 0;
  const radius = finiteNumber(value);
  if (radius !== undefined) return nonNegative(radius, path, state);
  warn(state, path, 'invalid-radius', 'Invalid background corner radius fell back to zero');
  return 0;
}

function imageEntity(
  id: string,
  transform: Transform,
  box: Box,
  source: CoreV2ImageProjection,
  tint: unknown,
  visible: boolean,
  layer: number,
  path: string,
  state: ParseState,
): ImageEntityInput {
  const denseTransform = centerPivotTopLeft(transform, box);
  return {
    kind: 'image',
    id,
    x: denseTransform.x,
    y: denseTransform.y,
    width: denseTransform.width,
    height: denseTransform.height,
    rotation: transform.rotation,
    // Preserve the inherited dense transport column for existing consumers.
    // Reconciliation/resource identity comes from the lossless sidecar key.
    source: typeof source.authoredSource === 'string'
      ? source.authoredSource
      : source.authoredSource.src,
    ...(tint !== undefined ? { tint: resolveColor(tint, 0xffffffff, `${path}.tint`, state) } : {}),
    visible,
    interactive: false,
    zIndex: layer,
    tags: ['image'],
  };
}

function textEntity(
  id: string,
  transform: Transform,
  box: Box,
  layout: CoreV2TextLayout,
  style: JsonRecord,
  color: Rgba,
  visible: boolean,
  interactive: boolean,
  layer: number,
  path: string,
  state: ParseState,
): EntityInput {
  const alignValue = style.align;
  const align: AlignSetting = alignValue === 'center' || alignValue === 'right' ? alignValue : 'left';
  if (alignValue !== undefined && alignValue !== 'left' && alignValue !== 'center' && alignValue !== 'right') {
    warn(state, `${path}.style.align`, 'text-align-degraded', 'Unsupported text alignment fell back to left');
  }
  const denseTransform = centerPivotTopLeft(transform, box);
  return {
    kind: 'text',
    id,
    x: denseTransform.x,
    y: denseTransform.y,
    width: denseTransform.width,
    height: denseTransform.height,
    rotation: transform.rotation,
    text: layout.visibleText,
    color,
    fontSize: layout.fontSizePx,
    ...(finiteNumber(style.alpha) === undefined
      ? {}
      : { opacity: clamp01(finiteNumber(style.alpha) as number) }),
    ...(typeof style.fontFamily === 'string' ? { fontFamily: style.fontFamily } : {}),
    ...(fontWeight(style.fontWeight) !== undefined ? { fontWeight: fontWeight(style.fontWeight) as number } : {}),
    align,
    visible,
    interactive,
    zIndex: layer,
    tags: ['text'],
  };
}

function semanticTextLayout(
  source: string,
  style: JsonRecord,
  contentFrame: Size | undefined,
  overflowValue: unknown,
  split: number,
  origin: Readonly<{ x: number; y: number }> | undefined,
  path: string,
  state: ParseState,
): CoreV2TextLayout {
  const fontSizePx = positiveTextMetric(style.fontSize, `${path}.style.fontSize`, state);
  const lineHeightPx = positiveTextMetric(style.lineHeight, `${path}.style.lineHeight`, state);
  const letterSpacingPx = textLetterSpacing(
    style.letterSpacing,
    `${path}.style.letterSpacing`,
    state,
  );
  const overflow = textOverflow(overflowValue, `${path}.overflow`, state);
  const wordWrapWidth = textWrapWidth(style, contentFrame, path, state);
  // Match the PATCH MAP v0.10 text-style default even when callers use the
  // lower-level parser directly instead of passing through the materializer.
  const requestedFontValue = requestedFont(style.fontFamily) ?? 'Fira Code';
  const autoFont = textAutoFont(style.autoFont, `${path}.style.autoFont`, state);
  const options: CoreV2TextLayoutOptions = {
    source,
    ...(fontSizePx === undefined ? {} : { fontSizePx }),
    ...(lineHeightPx === undefined ? {} : { lineHeightPx }),
    ...(letterSpacingPx === undefined ? {} : { letterSpacingPx }),
    requestedFont: requestedFontValue,
    availableRequestedFonts: AVAILABLE_TEXT_FONTS,
    split,
    wordWrapWidthPx: wordWrapWidth,
    breakWords: style.breakWords === true,
    ...(contentFrame === undefined
      ? {}
      : { contentFrame: { width: contentFrame.width, height: contentFrame.height } }),
    overflow,
    ...(autoFont === undefined ? {} : { autoFont }),
    ...(origin === undefined ? {} : { origin }),
    advancedStyle: hasAdvancedTextStyle(style),
  };
  const layout = layoutCoreV2Text(options);
  for (const diagnostic of layout.diagnostics) {
    warnOnce(
      state,
      `text-layout:${path}:${diagnostic.code}:${diagnostic.sourceIndex ?? -1}`,
      diagnostic.sourceIndex === undefined
        ? `${path}.text`
        : `${path}.text[${diagnostic.sourceIndex}]`,
      'text-layout-unsupported',
      `${diagnostic.code}: ${diagnostic.detail}`,
    );
  }
  return layout;
}

function addTextProjection(
  input: Readonly<{
    entityId: string;
    targetKind: 'element' | 'component';
    ownerId?: string;
    componentId?: string;
    authoredStyle: JsonRecord;
    color: number;
    placement: CoreV2Placement | null;
    margin: CoreV2Edges;
    contentOrientation: CoreV2ContentOrientation;
    layout: CoreV2TextLayout;
  }>,
  state: ParseState,
): void {
  state.textProjectionByEntityId[input.entityId] = Object.freeze({
    ...input.layout,
    entityId: input.entityId,
    targetKind: input.targetKind,
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
    ...(input.componentId === undefined ? {} : { componentId: input.componentId }),
    authoredStyle: deepFreeze(cloneJson(input.authoredStyle)),
    color: input.color >>> 0,
    placement: input.placement,
    margin: Object.freeze({ ...input.margin }),
    contentOrientation: input.contentOrientation,
  });
}

function positiveTextMetric(
  value: unknown,
  path: string,
  state: ParseState,
): number | undefined {
  if (value === undefined) return undefined;
  const metric = finiteNumber(value);
  if (metric !== undefined && metric > 0) return metric;
  warn(state, path, 'invalid-text-metric', 'Invalid text metric used the deterministic profile default');
  return undefined;
}

function textLetterSpacing(
  value: unknown,
  path: string,
  state: ParseState,
): number | undefined {
  if (value === undefined) return undefined;
  const spacing = finiteNumber(value);
  if (spacing !== undefined) return spacing;
  warn(state, path, 'invalid-text-metric', 'Invalid letterSpacing used the deterministic profile default');
  return undefined;
}

function textSplit(value: unknown, path: string, state: ParseState): number {
  if (value === undefined) return 0;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  warn(state, path, 'invalid-text-split', 'Invalid split fell back to zero');
  return 0;
}

function textPlacement(
  value: unknown,
  path: string,
  state: ParseState,
): CoreV2Placement {
  if (value === undefined) return 'center';
  if (typeof value === 'string' && TEXT_PLACEMENTS.has(value as CoreV2Placement)) {
    return value as CoreV2Placement;
  }
  warn(state, path, 'invalid-placement', 'Invalid placement fell back to center');
  return 'center';
}

function textOverflow(
  value: unknown,
  path: string,
  state: ParseState,
): 'visible' | 'hidden' | 'ellipsis' {
  if (value === undefined || value === 'visible') return 'visible';
  if (value === 'hidden' || value === 'ellipsis') return value;
  warn(state, path, 'invalid-text-overflow', 'Invalid overflow fell back to visible');
  return 'visible';
}

function textWrapWidth(
  style: JsonRecord,
  contentFrame: Size | undefined,
  path: string,
  state: ParseState,
): number | null {
  if (style.wordWrap !== true) return null;
  if (style.wordWrapWidth === undefined) return contentFrame?.width ?? null;
  const width = finiteNumber(style.wordWrapWidth);
  if (width !== undefined && width >= 0) return width;
  warn(
    state,
    `${path}.style.wordWrapWidth`,
    'invalid-text-wrap-width',
    'Invalid wordWrapWidth fell back to the available frame width',
  );
  return contentFrame?.width ?? null;
}

function textAutoFont(
  value: unknown,
  path: string,
  state: ParseState,
): Readonly<{ minPx: number; maxPx: number }> | undefined {
  if (value === undefined) return undefined;
  if (isRecord(value)) {
    const min = finiteNumber(value.min);
    const max = finiteNumber(value.max);
    if (
      min !== undefined &&
      max !== undefined &&
      Number.isSafeInteger(min) &&
      Number.isSafeInteger(max) &&
      min > 0 &&
      max >= min
    ) {
      return Object.freeze({ minPx: min, maxPx: max });
    }
  }
  warn(state, path, 'invalid-text-auto-font', 'Invalid autoFont bounds were ignored');
  return undefined;
}

function requestedFont(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value)) {
    return value.find((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  return undefined;
}

function hasAdvancedTextStyle(style: JsonRecord): boolean {
  return Object.keys(style).some((key) => !BASIC_TEXT_STYLE_KEYS.has(key));
}

function elementTransform(
  attrs: JsonRecord | undefined,
  path: string,
  parent: Transform,
  type: string,
  state: ParseState,
): Transform {
  const projectsSignedScale = SIGNED_SCALE_ATTRIBUTE_TYPES.has(type);
  return composeTransform(
    parent,
    numericAttribute(attrs?.x, `${path}.attrs.x`, state),
    numericAttribute(attrs?.y, `${path}.attrs.y`, state),
    rotationDegrees(attrs, `${path}.attrs`, state),
    projectsSignedScale ? scaleAttribute(attrs?.scaleX, `${path}.attrs.scaleX`, state) : 1,
    projectsSignedScale ? scaleAttribute(attrs?.scaleY, `${path}.attrs.scaleY`, state) : 1,
  );
}

function componentTransform(
  itemTransform: Transform,
  box: Box,
  attrs: JsonRecord | undefined,
  path: string,
  state: ParseState,
): Transform {
  return composeTransform(
    itemTransform,
    box.x + numericAttribute(attrs?.x, `${path}.attrs.x`, state),
    box.y + numericAttribute(attrs?.y, `${path}.attrs.y`, state),
    rotationDegrees(attrs, `${path}.attrs`, state),
    scaleAttribute(attrs?.scaleX, `${path}.attrs.scaleX`, state),
    scaleAttribute(attrs?.scaleY, `${path}.attrs.scaleY`, state),
  );
}

function composeTransform(
  parent: Transform,
  x: number,
  y: number,
  rotation: number,
  scaleX = 1,
  scaleY = 1,
): Transform {
  const radians = parent.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = x * parent.scaleX;
  const localY = y * parent.scaleY;
  const handedness = Math.sign(parent.scaleX * parent.scaleY) || 1;
  const localTranslationAffine = createCoreV2Affine(x, y);
  const localRotationScaleAffine = createCoreV2Affine(0, 0, rotation, scaleX, scaleY);
  const localPivotScaleAffine = createCoreV2Affine(0, 0, 0, scaleX, scaleY);
  return {
    x: parent.x + localX * cos - localY * sin,
    y: parent.y + localX * sin + localY * cos,
    rotation: parent.rotation + rotation * handedness,
    scaleX: parent.scaleX * scaleX,
    scaleY: parent.scaleY * scaleY,
    affine: multiplyCoreV2Affine(
      parent.affine,
      multiplyCoreV2Affine(localTranslationAffine, localRotationScaleAffine),
    ),
    imageIntrinsicTransform: Object.freeze({
      parentAffine: parent.affine,
      localTranslationAffine,
      localRotationScaleAffine,
      localPivotScaleAffine,
    }),
  };
}

/**
 * The PATCH MAP origin is the authored local top-left, while the inherited
 * dense renderer rotates quads around their center. Shift the stored top-left
 * so both representations produce the same transformed corners and AABB.
 */
function centerPivotTopLeft(
  transform: Transform,
  size: Size,
  contentOrientation: CoreV2ContentOrientation = 'follow-item',
): EntityProjectionDraft {
  return Object.freeze({
    ...projectCoreV2SignedRect(transform, size.width, size.height),
    affine: transform.affine,
    rotationDegrees: transform.rotation,
    contentOrientation,
  });
}

/** Standalone image `attrs` use the inherited Sprite center-pivot contract. */
function centerPivotImage(
  transform: Transform,
  size: Size,
): EntityProjectionDraft {
  const width = size.width * Math.abs(transform.scaleX);
  const height = size.height * Math.abs(transform.scaleY);
  const x = transform.x + (transform.scaleX < 0 ? -width : 0);
  const y = transform.y + (transform.scaleY < 0 ? -height : 0);
  const affine = projectCoreV2IntrinsicImageAffine(
    transform.imageIntrinsicTransform,
    size.width,
    size.height,
  );
  return Object.freeze({
    x,
    y,
    width,
    height,
    rotation: transform.rotation,
    localBounds: Object.freeze([0, 0, size.width, size.height] as const),
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    affine,
    rotationDegrees: transform.rotation,
    contentOrientation: 'follow-item',
  });
}

function parseContentOrientation(
  value: unknown,
  path: string,
  sourceId: string,
  state: ParseState,
): CoreV2ContentOrientation {
  if (value === undefined || value === 'upright') return 'upright';
  if (value === 'follow-item') return value;
  warn(
    state,
    path,
    'invalid-content-orientation',
    'Invalid contentOrientation fell back to upright',
    sourceId,
  );
  return 'upright';
}

function rotationDegrees(attrs: JsonRecord | undefined, path: string, state: ParseState): number {
  const angle = finiteNumber(attrs?.angle);
  if (angle !== undefined) return angle;
  const rotation = finiteNumber(attrs?.rotation);
  if (rotation !== undefined) return rotation * 180 / Math.PI;
  if (attrs?.angle !== undefined || attrs?.rotation !== undefined) {
    warn(state, path, 'invalid-rotation', 'Invalid angle/rotation fell back to zero');
  }
  return 0;
}

function fixedSize(value: unknown, path: string, state: ParseState): Size {
  if (finiteNumber(value) !== undefined) {
    const size = nonNegative(finiteNumber(value) as number, path, state);
    return { width: size, height: size };
  }
  if (isRecord(value)) {
    const width = finiteNumber(value.width);
    const height = finiteNumber(value.height);
    if (width !== undefined && height !== undefined) {
      return {
        width: nonNegative(width, `${path}.width`, state),
        height: nonNegative(height, `${path}.height`, state),
      };
    }
  }
  warn(state, path, 'invalid-size', 'Invalid fixed size fell back to 0×0');
  return { width: 0, height: 0 };
}

function resolveComponentSize(value: unknown, reference: Size, path: string, state: ParseState): Size {
  if (isRecord(value) && ('width' in value || 'height' in value)) {
    return {
      width: componentLength(value.width, reference.width, `${path}.width`, state),
      height: componentLength(value.height, reference.height, `${path}.height`, state),
    };
  }
  const length = componentLength(value, Math.min(reference.width, reference.height), path, state);
  return { width: length, height: length };
}

function barPlacement(
  value: unknown,
  path: string,
  state: ParseState,
): CoreV2Placement {
  if (value === undefined) return 'bottom';
  if (typeof value === 'string' && TEXT_PLACEMENTS.has(value as CoreV2Placement)) {
    return value as CoreV2Placement;
  }
  if (typeof value === 'string') {
    warn(state, path, 'invalid-placement', 'Invalid placement fell back to center');
  }
  return 'center';
}

function barAnimation(
  value: unknown,
  path: string,
  sourceId: string,
  state: ParseState,
): boolean {
  if (value === undefined) return true;
  if (typeof value === 'boolean') return value;
  fatal(
    state,
    path,
    'invalid-component-animation',
    'Bar animation must be a boolean',
    sourceId,
  );
}

function barAnimationDuration(
  value: unknown,
  path: string,
  sourceId: string,
  state: ParseState,
): number {
  if (value === undefined) return 200;
  const duration = finiteNumber(value);
  if (duration !== undefined && duration >= 0) return duration;
  fatal(
    state,
    path,
    'invalid-animation-duration',
    'Bar animationDuration must be a nonnegative finite number',
    sourceId,
  );
}

function componentLength(value: unknown, reference: number, path: string, state: ParseState): number {
  const numeric = finiteNumber(value);
  if (numeric !== undefined) return nonNegative(numeric, path, state);
  if (typeof value === 'string') {
    const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))%\s*$/.exec(value);
    if (match) return nonNegative(reference * Number(match[1]) / 100, path, state);
  }
  if (isRecord(value)) {
    const amount = finiteNumber(value.value);
    if (amount !== undefined && value.unit === 'px') return nonNegative(amount, path, state);
    if (amount !== undefined && value.unit === '%') {
      return nonNegative(reference * amount / 100, path, state);
    }
  }
  warn(state, path, 'invalid-component-size', 'Invalid component length fell back to 0');
  return 0;
}

function placeBox(
  reference: Box,
  size: Size,
  placementValue: unknown,
  marginValue: unknown,
  path: string,
  state: ParseState,
): Box {
  const margin = boxSpacing(marginValue, `${path}.margin`, state);
  let placement: CoreV2Placement = 'center';
  if (
    typeof placementValue === 'string' &&
    TEXT_PLACEMENTS.has(placementValue as CoreV2Placement)
  ) {
    placement = placementValue as CoreV2Placement;
  } else if (typeof placementValue === 'string') {
    warn(state, `${path}.placement`, 'invalid-placement', 'Invalid placement fell back to center');
  }
  return resolveCoreV2PlacementBounds(reference, size, placement, margin, path);
}

function boxSpacing(value: unknown, path: string, state: ParseState): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const uniform = finiteNumber(value);
  if (uniform !== undefined) {
    return { top: uniform, right: uniform, bottom: uniform, left: uniform };
  }
  if (value === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!isRecord(value)) {
    warn(state, path, 'invalid-spacing', 'Invalid spacing fell back to zero');
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const x = finiteNumber(value.x) ?? 0;
  const y = finiteNumber(value.y) ?? 0;
  return {
    top: finiteNumber(value.top) ?? y,
    right: finiteNumber(value.right) ?? x,
    bottom: finiteNumber(value.bottom) ?? y,
    left: finiteNumber(value.left) ?? x,
  };
}

function axisSpacing(value: unknown, path: string, state: ParseState): { x: number; y: number } {
  const uniform = finiteNumber(value);
  if (uniform !== undefined) return { x: uniform, y: uniform };
  if (value === undefined) return { x: 0, y: 0 };
  if (isRecord(value)) {
    return { x: finiteNumber(value.x) ?? 0, y: finiteNumber(value.y) ?? 0 };
  }
  warn(state, path, 'invalid-gap', 'Invalid gap fell back to zero');
  return { x: 0, y: 0 };
}

function imageSourceProjection(
  entityId: string,
  value: unknown,
  path: string,
  dimensionMode: CoreV2ImageDimensionMode,
  authoredSize: boolean,
  state: ParseState,
  intrinsicTransform?: CoreV2ImageIntrinsicTransform,
): CoreV2ImageProjection {
  const normalized = normalizeImageSource(value, path, state);
  const projection = Object.freeze({
    entityId,
    authoredSource: normalized.authoredSource,
    bindingKey: normalized.bindingKey,
    cacheIdentity: normalized.cacheIdentity,
    sourceKind: normalized.sourceKind,
    authoredSize,
    dimensionMode,
    ...(intrinsicTransform === undefined
      ? {}
      : {
          intrinsicTransform: Object.freeze({
            parentAffine: intrinsicTransform.parentAffine,
            localTranslationAffine: intrinsicTransform.localTranslationAffine,
            localRotationScaleAffine: intrinsicTransform.localRotationScaleAffine,
            localPivotScaleAffine: intrinsicTransform.localPivotScaleAffine,
          }),
        }),
  } satisfies CoreV2ImageProjection);
  state.imageProjectionByEntityId[entityId] = projection;
  return projection;
}

/**
 * Preserve exact nested affine authority while applying the standalone Sprite
 * center pivot whose placement changes with decoded intrinsic dimensions.
 */
export function projectCoreV2IntrinsicImageAffine(
  transform: CoreV2ImageIntrinsicTransform,
  width: number,
  height: number,
): CoreV2AffineMatrix {
  if (!(width >= 0) || !Number.isFinite(width) || !(height >= 0) || !Number.isFinite(height)) {
    throw new TypeError('intrinsic image dimensions must be finite and non-negative');
  }
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const pivotCenter = applyCoreV2Affine(
    transform.localPivotScaleAffine,
    Object.freeze([halfWidth, halfHeight] as const),
  );
  const local = multiplyCoreV2Affine(
    transform.localTranslationAffine,
    multiplyCoreV2Affine(
      createCoreV2Affine(pivotCenter[0], pivotCenter[1]),
      multiplyCoreV2Affine(
        transform.localRotationScaleAffine,
        createCoreV2Affine(-halfWidth, -halfHeight),
      ),
    ),
  );
  return multiplyCoreV2Affine(transform.parentAffine, local);
}

function normalizeImageSource(
  value: unknown,
  path: string,
  state: ParseState,
): Readonly<{
  authoredSource: CoreV2ImageProjection['authoredSource'];
  bindingKey: string;
  cacheIdentity: string;
  sourceKind: CoreV2ImageSourceKind;
}> {
  if (typeof value === 'string' && value.length > 0) {
    const sourceKind = classifyImageSourceString(value);
    if (sourceKind === 'data-uri') {
      const identity = `data-uri:${value.length}:${stableHash(value)}`;
      return Object.freeze({
        authoredSource: value,
        bindingKey: identity,
        cacheIdentity: identity,
        sourceKind,
      });
    }
    const identity = `${sourceKind}:${value}`;
    return Object.freeze({
      authoredSource: value,
      bindingKey: identity,
      cacheIdentity: identity,
      sourceKind,
    });
  }
  if (isRecord(value) && typeof value.src === 'string' && value.src.length > 0) {
    const authoredSource = deepFreeze(cloneJson(value)) as unknown as CoreV2ImageProjection['authoredSource'];
    const canonical = stableSerializeJson(authoredSource);
    return Object.freeze({
      authoredSource,
      bindingKey: `descriptor:${canonical}`,
      cacheIdentity: descriptorCacheIdentity(authoredSource),
      sourceKind: 'descriptor',
    });
  }
  warn(state, path, 'invalid-asset-source', 'Invalid asset source uses a deterministic missing-asset alias');
  const authoredSource = `@missing-asset:${pathToken(path)}`;
  const identity = `alias:${authoredSource}`;
  return Object.freeze({
    authoredSource,
    bindingKey: identity,
    cacheIdentity: identity,
    sourceKind: 'alias',
  });
}

function classifyImageSourceString(source: string): Exclude<CoreV2ImageSourceKind, 'descriptor'> {
  if (/^data:/iu.test(source)) return 'data-uri';
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(source)) return 'url';
  return 'alias';
}

function descriptorCacheIdentity(
  source: CoreV2ImageProjection['authoredSource'],
): string {
  if (typeof source === 'string') return `descriptor:${source}`;
  if (descriptorNeedsFramedIdentity(source)) {
    const canonical = stableSerializeJson(source);
    return `descriptor-safe:${source.src.length}:${source.src}:${stableHash(canonical)}`;
  }
  const query: Array<readonly [string, unknown]> = [];
  if (source.data !== undefined) {
    const keys = Object.keys(source.data).sort();
    if (keys.length === 0) query.push(['data', source.data]);
    for (const key of keys) query.push([key, source.data[key]]);
  }
  if (source.format !== undefined) query.push(['format', source.format]);
  if (source.parser !== undefined) query.push(['parser', source.parser]);
  if (source.loadParser !== undefined) query.push(['loadParser', source.loadParser]);
  query.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const suffix = query.length === 0
    ? ''
    : `?${query.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(
        scalarIdentityValue(value),
      )}`).join('&')}`;
  return `descriptor:${source.src}${suffix}`;
}

function descriptorNeedsFramedIdentity(
  source: Exclude<CoreV2ImageProjection['authoredSource'], string>,
): boolean {
  if (/[?#]/u.test(source.src)) return true;
  const topLevelOptionNames = new Set(['data', 'format', 'parser', 'loadParser']);
  return Object.keys(source.data ?? {}).some((key) => topLevelOptionNames.has(key));
}

function scalarIdentityValue(value: unknown): string {
  return typeof value === 'string' ? value : stableSerializeJson(value);
}

function stableSerializeJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerializeJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerializeJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(`@unsupported:${typeof value}`);
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function relationEndpoint(value: unknown, path: string, state: ParseState, sourceId: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (isRecord(value) && typeof value.id === 'string' && value.id.length > 0) return value.id;
  fatal(state, path, 'invalid-relation-endpoint', 'Relation endpoint must be a string or { id }', sourceId);
}

function resolveColor(value: unknown, fallback: Rgba, path: string, state: ParseState): Rgba {
  if (value === undefined) return fallback >>> 0;
  const numeric = finiteNumber(value);
  if (numeric !== undefined && Number.isInteger(numeric) && numeric >= 0 && numeric <= 0xffffffff) {
    return (numeric <= 0xffffff ? numeric * 0x100 + 0xff : numeric) >>> 0;
  }
  if (typeof value === 'string') {
    const themeValue = state.options.colors?.[value] ?? CORE_V2_DEFAULT_COLOR_THEME[value];
    if (themeValue !== undefined && themeValue !== value) {
      return resolveColor(themeValue, fallback, path, state);
    }
    const parsed = parseCssColor(value);
    if (parsed !== undefined) return parsed;
    const hashed = ((fnv1a(value) & 0xffffff) * 0x100 + 0xff) >>> 0;
    warn(state, path, 'color-fallback', `Unknown color token ${JSON.stringify(value)} used deterministic hash fallback`);
    return hashed;
  }
  warn(state, path, 'color-fallback', 'Unsupported color value used the documented fallback');
  return fallback >>> 0;
}

function parseCssColor(input: string): Rgba | undefined {
  const value = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex) {
    if (hex.length === 3) return pack(parseInt(hex[0]! + hex[0]!, 16), parseInt(hex[1]! + hex[1]!, 16), parseInt(hex[2]! + hex[2]!, 16), 255);
    if (hex.length === 4) return pack(parseInt(hex[0]! + hex[0]!, 16), parseInt(hex[1]! + hex[1]!, 16), parseInt(hex[2]! + hex[2]!, 16), parseInt(hex[3]! + hex[3]!, 16));
    if (hex.length === 6) return (parseInt(hex, 16) * 0x100 + 0xff) >>> 0;
    if (hex.length === 8) return parseInt(hex, 16) >>> 0;
  }
  const rgb = /^rgba?\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)(?:,\s*([^)]*))?\s*\)$/.exec(value);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(cssChannel);
    const alpha = rgb[4] === undefined ? 255 : cssAlpha(rgb[4]);
    if (channels.every((channel) => channel !== undefined) && alpha !== undefined) {
      return pack(channels[0]!, channels[1]!, channels[2]!, alpha);
    }
  }
  const hsl = /^hsla?\(\s*([^,]+),\s*([^,]+)%,\s*([^,)]+)%(?:,\s*([^)]*))?\s*\)$/.exec(value);
  if (hsl) {
    const hue = Number(hsl[1]);
    const saturation = Number(hsl[2]);
    const lightness = Number(hsl[3]);
    const alpha = hsl[4] === undefined ? 255 : cssAlpha(hsl[4]);
    if ([hue, saturation, lightness].every(Number.isFinite) && alpha !== undefined) {
      const [r, g, b] = hslToRgb(hue, clamp01(saturation / 100), clamp01(lightness / 100));
      return pack(r, g, b, alpha);
    }
  }
  return undefined;
}

function cssChannel(value: string): number | undefined {
  const percentage = /^(-?(?:\d+\.?\d*|\.\d+))%$/.exec(value.trim());
  const amount = percentage ? Number(percentage[1]) * 2.55 : Number(value);
  return Number.isFinite(amount) ? Math.round(Math.min(255, Math.max(0, amount))) : undefined;
}

function cssAlpha(value: string): number | undefined {
  const text = value.trim();
  const percentage = /^(-?(?:\d+\.?\d*|\.\d+))%$/.exec(text);
  const amount = percentage ? Number(percentage[1]) / 100 : Number(text);
  return Number.isFinite(amount) ? Math.round(clamp01(amount) * 255) : undefined;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 360;
  if (saturation === 0) {
    const gray = Math.round(lightness * 255);
    return [gray, gray, gray];
  }
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number): number => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(channel(1 / 3) * 255 + 1e-8),
    Math.round(channel(0) * 255 + 1e-8),
    Math.round(channel(-1 / 3) * 255 + 1e-8),
  ];
}

function multiplyColor(left: Rgba, right: Rgba): Rgba {
  return pack(
    Math.round(((left >>> 24) & 0xff) * ((right >>> 24) & 0xff) / 255),
    Math.round(((left >>> 16) & 0xff) * ((right >>> 16) & 0xff) / 255),
    Math.round(((left >>> 8) & 0xff) * ((right >>> 8) & 0xff) / 255),
    Math.round((left & 0xff) * (right & 0xff) / 255),
  );
}

function pack(r: number, g: number, b: number, a: number): Rgba {
  return ((((r & 0xff) * 0x1000000) + ((g & 0xff) << 16) + ((b & 0xff) << 8) + (a & 0xff)) >>> 0);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function inspectAttributes(attrs: JsonRecord | undefined, path: string, type: string, state: ParseState): void {
  if (!attrs) return;
  for (const key of Object.keys(attrs)) {
    if (key === 'skew' || key === 'skewX' || key === 'skewY') {
      warnOnce(
        state,
        `affine-skew:${type}:${key}`,
        `${path}.${key}`,
        'affine-skew-unsupported',
        'Authored skew is preserved in identity but is outside the orthogonal Core v2 projection contract',
      );
      continue;
    }
    if (key === 'pivot' || key === 'pivotX' || key === 'pivotY') {
      warnOnce(
        state,
        `affine-pivot:${type}:${key}`,
        `${path}.${key}`,
        'affine-pivot-unsupported',
        'Authored pivot is preserved in identity but Core v2 uses the PATCH MAP top-left origin',
      );
      continue;
    }
    const projected = (TRANSFORM_ATTRIBUTE_KEYS.has(key) && TRANSFORM_ATTRIBUTE_TYPES.has(type)) ||
      (SIGNED_SCALE_ATTRIBUTE_KEYS.has(key) && SIGNED_SCALE_ATTRIBUTE_TYPES.has(type)) ||
      (key === 'zIndex' && Z_INDEX_ATTRIBUTE_TYPES.has(type));
    if (projected || key === 'metadata') continue;
    warnOnce(
      state,
      `attr:${type}:${key}`,
      `${path}.${key}`,
      'attribute-preserved-only',
      `Attribute ${JSON.stringify(key)} is preserved in identity but has no dense-store projection`,
    );
  }
}

function sourceIdentifier(
  value: unknown,
  fallback: string,
  path: string,
  state: ParseState,
): string {
  if (typeof value === 'string' && value.length > 0) return value;
  warn(state, `${path}.id`, 'generated-id', `Missing/invalid ID was replaced with deterministic ${JSON.stringify(fallback)}`);
  return fallback;
}

function registerSourceElementId(sourceId: string, sourcePath: string, state: ParseState): void {
  const existingPath = state.sourceElementPathById.get(sourceId);
  if (existingPath !== undefined) {
    fatal(
      state,
      `${sourcePath}.id`,
      'duplicate-source-element-id',
      `Duplicate source element ID ${JSON.stringify(sourceId)}; first declared at ${existingPath}`,
      sourceId,
    );
  }
  state.sourceElementPathById.set(sourceId, sourcePath);
}

function pathToken(path: string): string {
  return path.replace(/^\$\.?/, '').replace(/[^a-zA-Z0-9_-]+/g, '.').replace(/^\.|\.$/g, '') || 'root';
}

function numericAttribute(value: unknown, path: string, state: ParseState): number {
  const parsed = finiteNumber(value);
  if (parsed !== undefined) return parsed;
  if (value !== undefined) warn(state, path, 'invalid-number', 'Invalid numeric attribute fell back to zero');
  return 0;
}

function scaleAttribute(value: unknown, path: string, state: ParseState): number {
  if (value === undefined) return 1;
  const parsed = finiteNumber(value);
  if (parsed !== undefined) return parsed;
  warn(state, path, 'invalid-scale', 'Invalid signed scale fell back to one');
  return 1;
}

function zIndex(attrs: unknown): number {
  return isRecord(attrs) ? finiteNumber(attrs.zIndex) ?? 0 : 0;
}

function eventInteractivity(
  value: unknown,
  fallback: boolean,
  path: string,
  state: ParseState,
): boolean {
  if (value === undefined) return fallback;
  if (value === 'none' || value === 'passive') return false;
  if (value === 'auto' || value === 'static' || value === 'dynamic') return fallback;
  warn(state, path, 'invalid-event-mode', 'Invalid eventMode fell back to the inherited hit-test policy');
  return fallback;
}

function projectedOpacity(value: unknown, path: string, state: ParseState): number {
  const opacity = finiteNumber(value);
  if (opacity === undefined) {
    warn(state, path, 'invalid-opacity', 'Invalid opacity fell back to fully opaque');
    return 1;
  }
  if (opacity < 0 || opacity > 1) {
    warn(state, path, 'opacity-clamped', 'Opacity outside 0..1 was clamped');
  }
  return clamp01(opacity);
}

function projectedRadius(value: unknown, path: string, state: ParseState): number | undefined {
  const scalar = finiteNumber(value);
  if (scalar !== undefined) return Math.max(0, scalar);
  const corners = Array.isArray(value)
    ? value.map((entry) => finiteNumber(entry))
    : isRecord(value)
      ? [
          finiteNumber(value.topLeft) ?? 0,
          finiteNumber(value.topRight) ?? 0,
          finiteNumber(value.bottomRight) ?? 0,
          finiteNumber(value.bottomLeft) ?? 0,
        ]
      : undefined;
  if (corners !== undefined && corners.length === 4 && corners.every((entry) => entry !== undefined)) {
    warn(
      state,
      path,
      'corner-radius-degraded',
      'Per-corner radius is preserved by the semantic dataset and uses the maximum corner in the scalar dense renderer',
    );
    return Math.max(0, ...corners);
  }
  if (value !== undefined) {
    warn(state, path, 'invalid-radius', 'Invalid radius was omitted from dense rendering');
  }
  return undefined;
}

function fontWeight(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  if (numeric !== undefined) return numeric;
  if (value === 'normal') return 400;
  if (value === 'bold') return 700;
  return undefined;
}

function nonNegative(value: number, path: string, state: ParseState): number {
  if (value >= 0) return value;
  warn(state, path, 'negative-length', 'Negative length was clamped to zero');
  return 0;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function appendRecord(record: Record<string, string[]>, key: string, value: string): void {
  const list = record[key] ?? (record[key] = []);
  list.push(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function warn(
  state: ParseState,
  path: string,
  code: string,
  message: string,
  sourceId?: string,
  entityId?: string,
): void {
  state.diagnostics.push({
    level: 'warning',
    code,
    path,
    message,
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(entityId !== undefined ? { entityId } : {}),
  });
}

function warnOnce(
  state: ParseState,
  key: string,
  path: string,
  code: string,
  message: string,
  sourceId?: string,
): void {
  if (state.warned.has(key)) return;
  state.warned.add(key);
  warn(state, path, code, message, sourceId);
}

function fatal(
  state: ParseState,
  path: string,
  code: string,
  message: string,
  sourceId?: string,
  entityId?: string,
): never {
  state.diagnostics.push({
    level: 'error',
    code,
    path,
    message,
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(entityId !== undefined ? { entityId } : {}),
  });
  throw new PatchMapParseError(message, deepFreeze([...state.diagnostics]));
}

function cloneJson<T>(value: T, seen = new Map<object, unknown>()): T {
  if (typeof value !== 'object' || value === null) return value;
  const existing = seen.get(value as object);
  if (existing !== undefined) return existing as T;
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const entry of value) clone.push(cloneJson(entry, seen));
    return clone as T;
  }
  const clone: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  seen.set(value as object, clone);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = cloneJson(entry, seen);
  }
  return clone as T;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

async function deepFreezeAsync<T>(value: T): Promise<T> {
  if (typeof value !== 'object' || value === null) return value;
  const seen = new WeakSet<object>();
  const pending: object[] = [value as object];
  let sliceStarted = parserNow();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const nested of Object.values(current as Record<string, unknown>)) {
      if (typeof nested === 'object' && nested !== null && !seen.has(nested)) {
        pending.push(nested);
      }
    }
    Object.freeze(current);
    if (parserNow() - sliceStarted < 8 || pending.length === 0) continue;
    await yieldParserTask();
    sliceStarted = parserNow();
  }
  return value;
}
