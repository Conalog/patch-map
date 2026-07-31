import type {
  AlignSetting,
  EntityInput,
  ImageEntityInput,
  Rgba,
} from './dense/contracts';
import {
  PatchMapParseError,
  type PatchMapComponentRenderRole,
  type PatchMapContentOrientation,
  type PatchMapImageDimensionMode,
  type PatchMapImageIntrinsicTransform,
  type PatchMapImageProjection,
  type PatchMapRelationProjection,
  type ExpandedItemIdentity,
  type ParsePatchMapOptions,
  type ParsePatchMapResult,
} from './contracts';
import type {
  PatchMapComponentSize,
  PatchMapComponentType,
  PatchMapEdges,
  PatchMapPlacement,
} from './semantic/dataset';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  patchMapAffineBasis,
  patchMapAffineCenter,
  createPatchMapAffine,
} from './semantic/geometry';
import {
  layoutPatchMapText,
  relocatePatchMapTextLayout,
  type PatchMapTextLayout,
  type PatchMapTextLayoutOptions,
} from './semantic/text-layout';
import { resolvePatchMapPlacementBounds } from './semantic/placement';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from './semantic/stable-record-overlay';
import { multiplyPatchMapRgba } from './parser/color';
import { normalizePatchMapImageSource } from './parser/image-source';
import {
  cachePatchMapV010DirectParseIndexes,
  directTextParseIndexes,
  directTextTargetKey,
  inheritPatchMapV010DirectParseIndexes,
  type PatchMapDirectTextParseTargetIndex,
} from './parser/direct-text-index';
import {
  composePatchMapParserTransform,
  projectPatchMapIntrinsicImageAffine,
  projectPatchMapParserImage,
  projectPatchMapParserTopLeft,
  type PatchMapEntityProjectionDraft,
  type PatchMapParserSize,
  type PatchMapParserTransform,
} from './parser/transform-projection';
import {
  clonePatchMapParserJson as cloneJson,
  createPatchMapParseState as createParseState,
  deepFreezePatchMapParserValue as deepFreeze,
  deepFreezePatchMapParserValueAsync as deepFreezeAsync,
  fatalPatchMapParse as fatal,
  finishPatchMapParseState as finishParseState,
  patchMapParserNow as parserNow,
  warnPatchMapParse as warn,
  warnPatchMapParseOnce as warnOnce,
  yieldPatchMapParserTask as yieldParserTask,
  type PatchMapElementContext as ElementContext,
  type PatchMapMutableComponentIdentity as MutableComponentIdentity,
  type PatchMapMutableElementIdentity as MutableElementIdentity,
  type PatchMapMutableExpandedItemIdentity as MutableExpandedItemIdentity,
  type PatchMapParseState as ParseState,
  type PatchMapParserEntityOwner as EntityOwner,
} from './parser/parse-state';
import {
  PATCH_MAP_PLACEMENTS as TEXT_PLACEMENTS,
  attributeAlpha,
  axisSpacing,
  barAnimation,
  barAnimationDuration,
  barPlacement,
  boxSpacing,
  clamp01,
  componentTransform,
  elementTransform,
  eventInteractivity,
  finiteNumber,
  fixedSize,
  fontWeight,
  inspectAttributes,
  isParserRecord as isRecord,
  nonNegative,
  parseContentOrientation,
  placeBox,
  projectedOpacity,
  projectedRadius,
  relationEndpoint,
  resolveColor,
  resolveComponentSize,
  zIndex,
  type PatchMapParserBox as Box,
  type PatchMapParserRecord as JsonRecord,
} from './parser/value-normalization';

export { inheritPatchMapV010DirectParseIndexes };
export type { PatchMapDirectTextParseTargetIndex };
export { projectPatchMapIntrinsicImageAffine };

type Transform = PatchMapParserTransform;
type EntityProjectionDraft = PatchMapEntityProjectionDraft;
type Size = PatchMapParserSize;

const ZERO_EDGES: PatchMapEdges = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
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
const ROOT_CONTEXT: ElementContext = {
  transform: {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    affine: PATCH_MAP_IDENTITY_AFFINE,
    imageIntrinsicTransform: Object.freeze({
      parentAffine: PATCH_MAP_IDENTITY_AFFINE,
      localTranslationAffine: PATCH_MAP_IDENTITY_AFFINE,
      localRotationScaleAffine: PATCH_MAP_IDENTITY_AFFINE,
      localPivotScaleAffine: PATCH_MAP_IDENTITY_AFFINE,
    }),
  },
  visible: true,
  interactive: true,
  opacity: 1,
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

export interface PatchMapDirectTextParseUpdate {
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
  updates: readonly PatchMapDirectTextParseUpdate[],
  options: ParsePatchMapOptions = {},
  resolvedTargets?: readonly PatchMapDirectTextParseTargetIndex[],
  recordStrategy: PatchMapStableRecordStrategy = 'frozen-copy',
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
  const entityProjections = patchPatchMapStableRecord(
    previous.projection.byEntityId,
    state.projectionByEntityId,
    entityIds,
    recordStrategy,
    true,
  );
  const textProjections = patchPatchMapStableRecord(
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
  if (indexes !== null) cachePatchMapV010DirectParseIndexes(result, indexes);
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
    {
      element,
      ancestors: [],
      opacity: attributeAlpha(attrs, `${rootPath}.attrs.alpha`, state),
      instance,
    },
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
  const opacity = context.opacity * attributeAlpha(attrs, `${path}.attrs.alpha`, state);
  const owner: EntityOwner = {
    element: identity,
    ancestors: context.ancestorIdentities,
    opacity,
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
          opacity,
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
      const cellTransform = composePatchMapParserTransform(
        transform,
        column * (itemSize.width + gap.x),
        row * (itemSize.height + gap.y),
        0,
      );
      const itemAttrs = isRecord(item.attrs) ? item.attrs : undefined;
      inspectAttributes(itemAttrs, `${path}.item.attrs`, 'item', state);
      const itemOpacity = owner.opacity *
        attributeAlpha(itemAttrs, `${path}.item.attrs.alpha`, state);
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
        { ...owner, opacity: itemOpacity },
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

  const denseTransform = projectPatchMapParserTopLeft(transform, size, 'follow-item');
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
      ...(owner.opacity === 1 ? {} : { opacity: owner.opacity }),
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
  contentOrientation: PatchMapContentOrientation,
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
  const opacity = owner.opacity * attributeAlpha(attrs, `${path}.attrs.alpha`, state);

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
      const fill = multiplyPatchMapRgba(sourceFill, tint);
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
      const denseTransform = projectPatchMapParserTopLeft(transform, local, 'follow-item');
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
          ...(opacity === 1 ? {} : { opacity }),
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
      withEntityOpacity(imageEntity(
        entityId,
        transform,
        local,
        asset,
        value.tint === undefined ? undefined : tint,
        componentVisible,
        -10,
        path,
        state,
      ), opacity),
      { ...owner, component },
      state,
      projectPatchMapParserTopLeft(transform, local, 'follow-item'),
    );
    return;
  }

  if (type === 'bar') {
    const componentSize = resolveComponentSize(value.size, content, `${path}.size`, state);
    const placement = barPlacement(value.placement, `${path}.placement`, state);
    const margin = boxSpacing(value.margin, `${path}.margin`, state);
    const local = resolvePatchMapPlacementBounds(content, componentSize, placement, margin, path);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    const denseTransform = projectPatchMapParserTopLeft(transform, local, contentOrientation);
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
      : multiplyPatchMapRgba(
          trackFill === 0 ? 0xffffffff : trackFill,
          resolveColor(value.tint, 0xffffffff, `${path}.tint`, state),
        );
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
      percentageReferenceHeight: content.height,
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
        ...(opacity === 1 ? {} : { opacity }),
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
      withEntityOpacity(imageEntity(
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
      ), opacity),
      { ...owner, component },
      state,
      projectPatchMapParserTopLeft(transform, local, contentOrientation),
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
    const layout = relocatePatchMapTextLayout(initialLayout, { x: local.x, y: local.y });
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
      withEntityOpacity(textEntity(
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
      ), opacity),
      { ...owner, component },
      state,
      projectPatchMapParserTopLeft(transform, local, contentOrientation),
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
  const denseTransform = projectPatchMapParserTopLeft(transform, size);
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
      ...(owner.opacity === 1 ? {} : { opacity: owner.opacity }),
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
  const attrs = isRecord(value.attrs) ? value.attrs : undefined;
  const denseTransform = authoredSize && attrs?.display === 'image'
    ? projectPatchMapParserTopLeft(transform, size)
    : projectPatchMapParserImage(transform, size);
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
      ...((owner.opacity === 1 && value.opacity === undefined)
        ? {}
        : {
            opacity: owner.opacity * (
              value.opacity === undefined
                ? 1
                : projectedOpacity(value.opacity, `${path}.opacity`, state)
            ),
          }),
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
    withEntityOpacity(textEntity(
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
    ), owner.opacity),
    owner,
    state,
    projectPatchMapParserTopLeft(transform, box),
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
        opacity: owner.opacity *
          clamp01(finiteNumber(style.alpha) ?? finiteNumber(style.opacity) ?? 1),
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
    const affine = projection?.affine ?? createPatchMapAffine(
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
      worldBasis: patchMapAffineBasis(affine),
      visibleCenter: projection?.affine
        ? patchMapAffineCenter(projection.affine, projection.localBounds)
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
    } satisfies PatchMapRelationProjection);
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
  componentType: PatchMapComponentType,
  renderRole: PatchMapComponentRenderRole,
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
          authoredSize: deepFreeze(cloneJson(authoredSize)) as PatchMapComponentSize,
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
  source: PatchMapImageProjection,
  tint: unknown,
  visible: boolean,
  layer: number,
  path: string,
  state: ParseState,
): ImageEntityInput {
  const denseTransform = projectPatchMapParserTopLeft(transform, box);
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

function withEntityOpacity(entity: EntityInput, opacity: number): EntityInput {
  const combined = opacity * (entity.opacity ?? 1);
  if (combined === (entity.opacity ?? 1)) return entity;
  return {
    ...entity,
    opacity: combined,
  };
}

function textEntity(
  id: string,
  transform: Transform,
  box: Box,
  layout: PatchMapTextLayout,
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
  const denseTransform = projectPatchMapParserTopLeft(transform, box);
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
): PatchMapTextLayout {
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
  const options: PatchMapTextLayoutOptions = {
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
  const layout = layoutPatchMapText(options);
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
    placement: PatchMapPlacement | null;
    margin: PatchMapEdges;
    contentOrientation: PatchMapContentOrientation;
    layout: PatchMapTextLayout;
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
): PatchMapPlacement {
  if (value === undefined) return 'center';
  if (typeof value === 'string' && TEXT_PLACEMENTS.has(value as PatchMapPlacement)) {
    return value as PatchMapPlacement;
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

function imageSourceProjection(
  entityId: string,
  value: unknown,
  path: string,
  dimensionMode: PatchMapImageDimensionMode,
  authoredSize: boolean,
  state: ParseState,
  intrinsicTransform?: PatchMapImageIntrinsicTransform,
): PatchMapImageProjection {
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
  } satisfies PatchMapImageProjection);
  state.imageProjectionByEntityId[entityId] = projection;
  return projection;
}

function normalizeImageSource(
  value: unknown,
  path: string,
  state: ParseState,
): ReturnType<typeof normalizePatchMapImageSource> {
  if (typeof value === 'string' && value.length > 0) {
    return normalizePatchMapImageSource(value);
  }
  if (isRecord(value) && typeof value.src === 'string' && value.src.length > 0) {
    const authoredSource = deepFreeze(
      cloneJson(value),
    ) as unknown as PatchMapImageProjection['authoredSource'];
    return normalizePatchMapImageSource(authoredSource);
  }
  warn(state, path, 'invalid-asset-source', 'Invalid asset source uses a deterministic missing-asset alias');
  const authoredSource = `@missing-asset:${pathToken(path)}`;
  return normalizePatchMapImageSource(authoredSource);
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

function appendRecord(record: Record<string, string[]>, key: string, value: string): void {
  const list = record[key] ?? (record[key] = []);
  list.push(value);
}
