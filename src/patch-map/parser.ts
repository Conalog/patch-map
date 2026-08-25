import type {
  ExpandedItemIdentity,
  ParsePatchMapOptions,
  ParsePatchMapResult,
} from './contracts';
import type { PatchMapEdges } from './semantic/dataset';
import {
  addTextProjection,
  imageEntity,
  imageSourceProjection,
  parseComponent,
  semanticTextLayout,
  textEntity,
  withEntityOpacity,
} from './parser/component-text-lowering';
import type { PatchMapDirectTextParseTargetIndex } from './parser/direct-text-index';
import {
  ROOT_CONTEXT,
  addEntity,
  createElementIdentity,
  pathToken,
  registerSourceElementId,
  sourceIdentifier,
} from './parser/lowering-state';
import {
  parseRelations,
  validateRelationEndpoints,
} from './parser/relation-lowering';
import {
  composePatchMapParserTransform,
  projectPatchMapIntrinsicImageAffine,
  projectPatchMapParserImage,
  projectPatchMapParserTopLeft,
  type PatchMapParserSize,
  type PatchMapParserTransform,
} from './parser/transform-projection';
import {
  createPatchMapParseState as createParseState,
  deepFreezePatchMapParserValueAsync as deepFreezeAsync,
  fatalPatchMapParse as fatal,
  finishPatchMapParseState as finishParseState,
  patchMapParserNow as parserNow,
  warnPatchMapParse as warn,
  warnPatchMapParseOnce as warnOnce,
  yieldPatchMapParserTask as yieldParserTask,
  type PatchMapElementContext as ElementContext,
  type PatchMapMutableExpandedItemIdentity as MutableExpandedItemIdentity,
  type PatchMapParseState as ParseState,
  type PatchMapParserEntityOwner as EntityOwner,
} from './parser/parse-state';
import {
  attributeAlpha,
  axisSpacing,
  boxSpacing,
  elementTransform,
  eventInteractivity,
  finiteNumber,
  fixedSize,
  inspectAttributes,
  isParserRecord as isRecord,
  parseContentOrientation,
  projectedOpacity,
  projectedRadius,
  resolveColor,
  zIndex,
  type PatchMapParserBox as Box,
  type PatchMapParserRecord as JsonRecord,
} from './parser/value-normalization';

export type { PatchMapDirectTextParseTargetIndex };
export { projectPatchMapIntrinsicImageAffine };
export { parsePatchMapDirectTextBatch } from './parser/direct-text-batch';
export type { PatchMapDirectTextParseUpdate } from './parser/direct-text-batch';

type Transform = PatchMapParserTransform;
type Size = PatchMapParserSize;

const ZERO_EDGES: PatchMapEdges = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export function parsePatchMap(
  input: unknown,
  options: ParsePatchMapOptions = {},
): ParsePatchMapResult {
  const state = createParseState(options);
  if (!Array.isArray(input)) {
    fatal(state, '$', 'invalid-root', 'PatchMap input must be an array');
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
export function parsePatchMapSelectedRoots(
  input: unknown,
  rootIndices: readonly number[],
  options: ParsePatchMapOptions = {},
  knownTargetIds: readonly string[] = [],
): ParsePatchMapResult {
  const state = createParseState(options);
  if (!Array.isArray(input)) {
    fatal(state, '$', 'invalid-root', 'PatchMap input must be an array');
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


/**
 * Expected-equivalent cooperative parser for large browser loads. Individual
 * top-level records remain atomic, while the shared identity/relation state is
 * retained across bounded main-thread tasks.
 */
export async function parsePatchMapAsync(
  input: unknown,
  options: ParsePatchMapOptions = {},
): Promise<ParsePatchMapResult> {
  const state = createParseState(options);
  if (!Array.isArray(input)) {
    fatal(state, '$', 'invalid-root', 'PatchMap input must be an array');
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
  const denseTransform = projectPatchMapParserImage(transform, size);
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
    ), owner.opacity),
    owner,
    state,
    projectPatchMapParserTopLeft(transform, box),
  );
}
