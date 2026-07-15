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
  type ComponentIdentity,
  type ElementIdentity,
  type EntitySourceIdentity,
  type ExpandedItemIdentity,
  type ParseDiagnostic,
  type ParsePatchMapOptions,
  type ParsePatchMapResult,
} from './contracts';

type JsonRecord = Record<string, unknown>;

interface Transform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
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
  readonly from: string;
  readonly to: string;
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
  readonly pendingRelations: PendingRelation[];
  readonly warned: Set<string>;
  sourceElements: number;
  relationLinks: number;
  gridCells: number;
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

const DEFAULT_COLORS: Readonly<Record<string, Rgba>> = Object.freeze({
  white: 0xffffffff,
  black: 0x000000ff,
  transparent: 0x00000000,
  'primary.default': 0x4f46e5ff,
  'primary.dark': 0x312e81ff,
});
const TRANSFORM_ATTRIBUTE_KEYS = new Set(['x', 'y', 'angle', 'rotation']);
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
]);
const Z_INDEX_ATTRIBUTE_TYPES = new Set(['rect', 'image', 'relations']);

const ROOT_CONTEXT: ElementContext = {
  transform: { x: 0, y: 0, rotation: 0 },
  visible: true,
  interactive: true,
  ancestorIdentities: [],
};

export function parsePatchMapV010(
  input: unknown,
  options: ParsePatchMapOptions = {},
): ParsePatchMapResult {
  const state: ParseState = {
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
    pendingRelations: [],
    warned: new Set(),
    sourceElements: 0,
    relationLinks: 0,
    gridCells: 0,
  };

  if (!Array.isArray(input)) {
    fatal(state, '$', 'invalid-root', 'PATCH MAP v0.10 input must be an array');
  }

  parseElements(input, '$', ROOT_CONTEXT, state);
  validateRelationEndpoints(state);

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
  };

  return deepFreeze(result);
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
  const localTransform = elementTransform(attrs, path, context.transform, state);
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
      parseRelations(value, path, sourceId, visible, owner, state);
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
      state.gridCells += 1;
      parseItemInstance(
        item,
        `${path}.item`,
        instanceId,
        sourceId,
        cellTransform,
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
  if (item.contentOrientation !== undefined) {
    warnOnce(
      state,
      'item-content-orientation',
      `${itemPath}.contentOrientation`,
      'content-orientation-unsupported',
      'contentOrientation is not projected or retained; components use rectangular placement',
      sourceElementId,
    );
  }
  const instance: MutableExpandedItemIdentity = {
    instanceId,
    sourceElementId,
    sourcePath: itemPath,
    entityIds: [],
    ...(grid ? { grid } : {}),
  };
  state.expandedItems.push(instance);

  addEntity(
    {
      kind: 'rect',
      id: instanceId,
      x: transform.x,
      y: transform.y,
      width: size.width,
      height: size.height,
      rotation: transform.rotation,
      fill: 0x00000000,
      visible,
      interactive,
      zIndex: 0,
      tags: ['item', `source:${sourceElementId}`],
    },
    { ...owner, instance },
    state,
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
  visible: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  if (!isRecord(value)) {
    warn(state, path, 'unsupported-component', 'Non-object component was not rendered', sourceElementId);
    return;
  }
  const type = typeof value.type === 'string' ? value.type : 'unknown';
  if (value.animation !== undefined || value.animationDuration !== undefined) {
    warnOnce(
      state,
      `component-animation:${type}`,
      path,
      'component-animation-unsupported',
      'Input animation/animationDuration are not applied or retained; the Core v2 runtime animation API supplies duration',
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
    const rawSize = value.size;
    const componentSize = rawSize === undefined
      ? itemSize
      : resolveComponentSize(rawSize, itemSize, `${path}.size`, state);
    const local = placeBox(
      { x: 0, y: 0, width: itemSize.width, height: itemSize.height },
      componentSize,
      value.placement,
      value.margin,
      path,
      state,
    );
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    if (sourceRecord?.type === 'rect') {
      const sourceFill = resolveColor(sourceRecord.fill, 0xffffffff, `${path}.source.fill`, state);
      const fill = value.tint === undefined
        ? sourceFill
        : multiplyColor(sourceFill, resolveColor(value.tint, 0xffffffff, `${path}.tint`, state));
      addEntity(
        {
          kind: 'rect',
          id: entityId,
          x: transform.x,
          y: transform.y,
          width: local.width,
          height: local.height,
          rotation: transform.rotation,
          fill,
          ...(sourceRecord.borderColor !== undefined
            ? { stroke: resolveColor(sourceRecord.borderColor, 0x000000ff, `${path}.source.borderColor`, state) }
            : {}),
          ...(finiteNumber(sourceRecord.borderWidth) !== undefined
            ? { strokeWidth: Math.max(0, finiteNumber(sourceRecord.borderWidth) as number) }
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
      );
      return;
    }
    const asset = assetSource(source, `${path}.source`, state);
    addEntity(
      imageEntity(entityId, transform, local, asset, value.tint, componentVisible, -10, path, state),
      { ...owner, component },
      state,
    );
    return;
  }

  if (type === 'bar') {
    const componentSize = resolveComponentSize(value.size, content, `${path}.size`, state);
    const local = placeBox(content, componentSize, value.placement ?? 'bottom', value.margin, path, state);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    const source = isRecord(value.source) ? value.source : undefined;
    if (value.source !== undefined && source?.type !== 'rect') {
      warn(state, `${path}.source`, 'bar-source-degraded', 'Non-rect bar source is rendered as a tinted aggregate bar', sourceElementId);
    }
    const trackFill = resolveColor(source?.fill, 0x00000000, `${path}.source.fill`, state);
    const fill = value.tint === undefined
      ? trackFill
      : multiplyColor(trackFill === 0 ? 0xffffffff : trackFill, resolveColor(value.tint, 0xffffffff, `${path}.tint`, state));
    addEntity(
      {
        kind: 'bar',
        id: entityId,
        x: transform.x,
        y: transform.y,
        width: local.width,
        height: local.height,
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
    );
    return;
  }

  if (type === 'icon') {
    const componentSize = resolveComponentSize(value.size, content, `${path}.size`, state);
    const local = placeBox(content, componentSize, value.placement ?? 'center', value.margin, path, state);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    addEntity(
      imageEntity(
        entityId,
        transform,
        local,
        assetSource(value.source, `${path}.source`, state),
        value.tint,
        componentVisible,
        20,
        path,
        state,
      ),
      { ...owner, component },
      state,
    );
    return;
  }

  if (type === 'text') {
    const style = isRecord(value.style) ? value.style : {};
    const fontSize = Math.max(1, finiteNumber(style.fontSize) ?? 14);
    const margins = boxSpacing(value.margin, `${path}.margin`, state);
    const available: Box = {
      x: content.x + margins.left,
      y: content.y + margins.top,
      width: Math.max(0, content.width - margins.left - margins.right),
      height: Math.max(0, content.height - margins.top - margins.bottom),
    };
    const textSize: Size = {
      width: finiteNumber(style.wordWrapWidth) ?? available.width,
      height: Math.min(available.height || fontSize * 1.2, fontSize * 1.2),
    };
    const local = placeBox(available, textSize, value.placement ?? 'center', 0, path, state);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    if (value.split !== undefined) {
      warnOnce(state, 'text-split', `${path}.split`, 'text-split-degraded', 'Text split is preserved in identity but rendered as one text run', sourceElementId);
    }
    addEntity(
      textEntity(entityId, transform, local, value.text, style, value.tint, componentVisible, false, path, state),
      { ...owner, component },
      state,
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
  addEntity(
    {
      kind: 'rect',
      id: sourceId,
      x: transform.x,
      y: transform.y,
      width: size.width,
      height: size.height,
      rotation: transform.rotation,
      fill: resolveColor(value.fill, 0xffffffff, `${path}.fill`, state),
      ...(value.stroke !== undefined
        ? { stroke: resolveColor(stroke?.color ?? value.stroke, 0x000000ff, `${path}.stroke`, state) }
        : {}),
      ...(finiteNumber(stroke?.width) !== undefined
        ? { strokeWidth: Math.max(0, finiteNumber(stroke?.width) as number) }
        : {}),
      ...(finiteNumber(value.radius) !== undefined
        ? { radius: Math.max(0, finiteNumber(value.radius) as number) }
        : {}),
      visible,
      interactive,
      zIndex: zIndex(value.attrs),
      tags: ['rect', `source:${sourceId}`],
    },
    owner,
    state,
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
  const size = value.size === undefined
    ? { width: 1, height: 1 }
    : fixedSize(value.size, `${path}.size`, state);
  addEntity(
    {
      ...imageEntity(
        sourceId,
        transform,
        { x: 0, y: 0, ...size },
        assetSource(value.source, `${path}.source`, state),
        undefined,
        visible,
        zIndex(value.attrs),
        path,
        state,
      ),
      interactive,
    },
    owner,
    state,
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
  const fontSize = Math.max(1, finiteNumber(style.fontSize) ?? 14);
  const text = typeof value.text === 'string' ? value.text : '';
  const width = Math.max(1, finiteNumber(style.wordWrapWidth) ?? text.length * fontSize * 0.6);
  const local: Box = { x: 0, y: 0, width, height: fontSize * 1.2 };
  addEntity(
    textEntity(sourceId, transform, local, text, style, undefined, visible, interactive, path, state),
    owner,
    state,
  );
}

function parseRelations(
  value: JsonRecord,
  path: string,
  sourceId: string,
  visible: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  if (!Array.isArray(value.links)) {
    fatal(state, `${path}.links`, 'invalid-relations', 'Relations links must be an array', sourceId);
  }
  const style = isRecord(value.style) ? value.style : {};
  if (style.cap !== undefined || style.join !== undefined) {
    warnOnce(state, 'relation-cap-join', `${path}.style`, 'relation-style-degraded', 'Relation cap/join are not retained or projected; basic line geometry is used', sourceId);
  }
  value.links.forEach((linkValue, index) => {
    const linkPath = `${path}.links[${index}]`;
    if (!isRecord(linkValue)) {
      fatal(state, linkPath, 'invalid-relation-link', 'Relation link must be an object', sourceId);
    }
    const from = relationEndpoint(linkValue.source, `${linkPath}.source`, state, sourceId);
    const to = relationEndpoint(linkValue.target, `${linkPath}.target`, state, sourceId);
    const entityId = `${sourceId}::link:${String(index).padStart(6, '0')}`;
    state.relationLinks += 1;
    addEntity(
      {
        kind: 'relation',
        id: entityId,
        from,
        to,
        color: resolveColor(style.color, 0x000000ff, `${path}.style.color`, state),
        lineWidth: Math.max(0, finiteNumber(style.width) ?? 1),
        opacity: clamp01(finiteNumber(style.alpha) ?? 1),
        visible,
        interactive: false,
        zIndex: zIndex(value.attrs),
        tags: ['relation', `source:${sourceId}`],
      },
      owner,
      state,
    );
    state.pendingRelations.push({ path: linkPath, entityId, from, to });
  });
}

function addEntity(entity: EntityInput, owner: EntityOwner, state: ParseState): void {
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
  state.entityIds.add(entity.id);
  if (entity.kind !== 'relation') state.targetIds.add(entity.id);
  state.entities.push(entity);
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
    if (!state.targetIds.has(relation.from)) {
      state.diagnostics.push({
        level: 'error',
        code: 'dangling-relation-endpoint',
        path: `${relation.path}.source`,
        message: `Unknown relation source ID ${JSON.stringify(relation.from)}`,
        entityId: relation.entityId,
      });
    }
    if (!state.targetIds.has(relation.to)) {
      state.diagnostics.push({
        level: 'error',
        code: 'dangling-relation-endpoint',
        path: `${relation.path}.target`,
        message: `Unknown relation target ID ${JSON.stringify(relation.to)}`,
        entityId: relation.entityId,
      });
    }
  }
  const failures = state.diagnostics.filter((entry) => entry.level === 'error');
  if (failures.length > 0) {
    throw new PatchMapParseError(
      `PATCH MAP v0.10 parse failed with ${failures.length} error${failures.length === 1 ? '' : 's'}`,
      deepFreeze([...state.diagnostics]),
    );
  }
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

function imageEntity(
  id: string,
  transform: Transform,
  box: Box,
  source: string,
  tint: unknown,
  visible: boolean,
  layer: number,
  path: string,
  state: ParseState,
): ImageEntityInput {
  return {
    kind: 'image',
    id,
    x: transform.x,
    y: transform.y,
    width: box.width,
    height: box.height,
    rotation: transform.rotation,
    source,
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
  textValue: unknown,
  style: JsonRecord,
  tint: unknown,
  visible: boolean,
  interactive: boolean,
  path: string,
  state: ParseState,
): EntityInput {
  const alignValue = style.align;
  const align: AlignSetting = alignValue === 'center' || alignValue === 'right' ? alignValue : 'left';
  if (alignValue !== undefined && alignValue !== 'left' && alignValue !== 'center' && alignValue !== 'right') {
    warn(state, `${path}.style.align`, 'text-align-degraded', 'Unsupported text alignment fell back to left');
  }
  return {
    kind: 'text',
    id,
    x: transform.x,
    y: transform.y,
    width: box.width,
    height: box.height,
    rotation: transform.rotation,
    text: typeof textValue === 'string' ? textValue : '',
    color: resolveColor(tint ?? style.fill, 0x000000ff, `${path}.style.fill`, state),
    fontSize: Math.max(1, finiteNumber(style.fontSize) ?? 14),
    ...(typeof style.fontFamily === 'string' ? { fontFamily: style.fontFamily } : {}),
    ...(fontWeight(style.fontWeight) !== undefined ? { fontWeight: fontWeight(style.fontWeight) as number } : {}),
    align,
    visible,
    interactive,
    zIndex: 30,
    tags: ['text'],
  };
}

function elementTransform(
  attrs: JsonRecord | undefined,
  path: string,
  parent: Transform,
  state: ParseState,
): Transform {
  return composeTransform(
    parent,
    numericAttribute(attrs?.x, `${path}.attrs.x`, state),
    numericAttribute(attrs?.y, `${path}.attrs.y`, state),
    rotationDegrees(attrs, `${path}.attrs`, state),
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
  );
}

function composeTransform(parent: Transform, x: number, y: number, rotation: number): Transform {
  const radians = parent.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: parent.x + x * cos - y * sin,
    y: parent.y + x * sin + y * cos,
    rotation: parent.rotation + rotation,
  };
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
  const placement = typeof placementValue === 'string' ? placementValue : 'center';
  const left = reference.x + margin.left;
  const top = reference.y + margin.top;
  const right = reference.x + reference.width - margin.right;
  const bottom = reference.y + reference.height - margin.bottom;
  const centerX = left + (Math.max(0, right - left) - size.width) / 2;
  const centerY = top + (Math.max(0, bottom - top) - size.height) / 2;
  let x = centerX;
  let y = centerY;
  switch (placement) {
    case 'left': x = left; break;
    case 'left-top': x = left; y = top; break;
    case 'left-bottom': x = left; y = bottom - size.height; break;
    case 'top': y = top; break;
    case 'right': x = right - size.width; break;
    case 'right-top': x = right - size.width; y = top; break;
    case 'right-bottom': x = right - size.width; y = bottom - size.height; break;
    case 'bottom': y = bottom - size.height; break;
    case 'center': break;
    default:
      warn(state, `${path}.placement`, 'invalid-placement', 'Invalid placement fell back to center');
  }
  return { x, y, width: size.width, height: size.height };
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

function assetSource(value: unknown, path: string, state: ParseState): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (isRecord(value) && typeof value.src === 'string' && value.src.length > 0) return value.src;
  warn(state, path, 'invalid-asset-source', 'Invalid asset source uses a deterministic missing-asset alias');
  return `@missing-asset:${pathToken(path)}`;
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
    const themeValue = state.options.colors?.[value] ?? DEFAULT_COLORS[value];
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
    const projected = (TRANSFORM_ATTRIBUTE_KEYS.has(key) && TRANSFORM_ATTRIBUTE_TYPES.has(type)) ||
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

function zIndex(attrs: unknown): number {
  return isRecord(attrs) ? finiteNumber(attrs.zIndex) ?? 0 : 0;
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
