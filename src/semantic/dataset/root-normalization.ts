import {
  PATCH_MAP_COMPONENT_TYPES,
  PATCH_MAP_ELEMENT_TYPES,
  PatchMapDatasetError,
  type PatchMapAttrs,
  type PatchMapComponent,
  type PatchMapComponentType,
  type PatchMapElement,
  type PatchMapElementType,
  type PatchMapEventMode,
  type PatchMapGridItemTemplate,
  type PatchMapPlacement,
  type PatchMapRelationLink,
  type PatchMapTextOverflow,
} from './contracts';
import {
  assertKnownFields,
  booleanValue,
  cloneJsonRecord,
  enumValue,
  finiteNumber,
  invalidValue,
  nonnegativeFiniteNumber,
  normalizeComponentSize,
  normalizeEdges,
  normalizeFixedSize,
  normalizeGap,
  normalizeStandaloneRadius,
  rangedNumber,
  recordValue,
  requiredField,
  stringValue,
} from './value-normalization';
import {
  normalizeAssetSource,
  normalizeBackgroundSource,
  normalizeColorLike,
  normalizeRectTexture,
  normalizeRelationStyle,
  normalizeStrokeStyle,
  normalizeTextStyle,
} from './style-normalization';

export interface NormalizationState {
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
  background: new Set([...COMPONENT_BASE_FIELDS, 'source', 'tint']),
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
]);
const CONTENT_ORIENTATIONS = new Set<string>(['follow-item', 'upright']);
const EVENT_MODES = new Set<string>(['none', 'passive', 'auto', 'static', 'dynamic']);
const TEXT_OVERFLOWS = new Set<string>(['visible', 'hidden', 'ellipsis']);
const WHITE = '#ffffffff';
const RESERVED_TRANSFORM_ATTRS = new Set([
  'scale',
  'skew',
  'pivot',
  'skewX',
  'skewY',
  'pivotX',
  'pivotY',
]);
export function inventoryOwnedStructuralElement(
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
export function normalizeElement(
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
        style: normalizeRelationStyle(optionalField(record, 'style'), `${path}.style`),
      });
    case 'image':
      return Object.freeze({
        type,
        ...base,
        source: normalizeAssetSource(requiredField(record, 'source', path), `${path}.source`),
        ...(Object.hasOwn(record, 'size')
          ? { size: normalizeFixedSize(record.size, `${path}.size`) }
          : {}),
        ...(Object.hasOwn(record, 'opacity')
          ? { opacity: rangedNumber(record.opacity, `${path}.opacity`, 0, 1) }
          : {}),
      });
    case 'text':
      return Object.freeze({
        type,
        ...base,
        text: optionalString(record, 'text', path, ''),
        style: normalizeTextStyle(optionalField(record, 'style'), `${path}.style`, false, true),
        ...(Object.hasOwn(record, 'size')
          ? { size: normalizeFixedSize(record.size, `${path}.size`) }
          : {}),
        ...(Object.hasOwn(record, 'overflow')
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
        ...(Object.hasOwn(record, 'fill')
          ? { fill: normalizeColorLike(record.fill, `${path}.fill`) }
          : {}),
        ...(Object.hasOwn(record, 'stroke')
          ? { stroke: normalizeStrokeStyle(record.stroke, `${path}.stroke`) }
          : {}),
        radius: normalizeStandaloneRadius(optionalField(record, 'radius'), `${path}.radius`),
        ...(Object.hasOwn(record, 'eventMode')
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
  const id = Object.hasOwn(record, 'id')
    ? stringValue(record.id, `${path}.id`)
    : generatedElementId(path);
  registerElementId(id, `${path}.id`, state);

  return Object.freeze({
    id,
    ...(Object.hasOwn(record, 'label') ? { label: stringValue(record.label, `${path}.label`) } : {}),
    show: optionalBoolean(record, 'show', path, true),
    locked: optionalBoolean(record, 'locked', path, false),
    ...(Object.hasOwn(record, 'attrs') ? { attrs: normalizeAttrs(record.attrs, `${path}.attrs`) } : {}),
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
    values.map((value, index) => normalizePatchMapComponent(
      value,
      `${path}[${index}]`,
      ownerId,
      index,
      state,
    )),
  );
}

export function normalizePatchMapComponent(
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
        tint: Object.hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
      });
    case 'bar':
      return Object.freeze({
        type,
        ...base,
        source: normalizeRectTexture(requiredField(record, 'source', path), `${path}.source`),
        size: normalizeComponentSize(requiredField(record, 'size', path), `${path}.size`),
        placement: normalizePlacement(record, path, 'bottom'),
        margin: normalizeEdges(optionalField(record, 'margin'), `${path}.margin`),
        tint: Object.hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
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
        tint: Object.hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
      });
    case 'text':
      return Object.freeze({
        type,
        ...base,
        text: optionalString(record, 'text', path, ''),
        placement: normalizePlacement(record, path, 'center'),
        margin: normalizeEdges(optionalField(record, 'margin'), `${path}.margin`),
        tint: Object.hasOwn(record, 'tint') ? normalizeColorLike(record.tint, `${path}.tint`) : WHITE,
        style: normalizeTextStyle(optionalField(record, 'style'), `${path}.style`, true, true),
        split: optionalNonnegativeInteger(record, 'split', path, 0),
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
  const id = Object.hasOwn(record, 'id')
    ? stringValue(record.id, `${path}.id`)
    : `@component:${index}`;
  registerComponentId(ownerId, id, `${path}.id`, state);

  return Object.freeze({
    id,
    ...(Object.hasOwn(record, 'label') ? { label: stringValue(record.label, `${path}.label`) } : {}),
    show: optionalBoolean(record, 'show', path, true),
    ...(Object.hasOwn(record, 'attrs') ? { attrs: normalizeAttrs(record.attrs, `${path}.attrs`) } : {}),
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
  for (const key of RESERVED_TRANSFORM_ATTRS) {
    if (Object.hasOwn(record, key)) {
      invalidValue(
        `${path}.${key}`,
        `${key} is not a supported PatchMap transform attribute`,
      );
    }
  }
  if (Object.hasOwn(record, 'angle') && Object.hasOwn(record, 'rotation')) {
    invalidValue(path, 'angle and rotation are mutually exclusive');
  }

  for (const key of ['x', 'y', 'angle', 'rotation', 'zIndex', 'scaleX', 'scaleY'] as const) {
    if (Object.hasOwn(record, key)) finiteNumber(record[key], `${path}.${key}`);
  }
  if (Object.hasOwn(record, 'alpha')) rangedNumber(record.alpha, `${path}.alpha`, 0, 1);
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
  return Object.hasOwn(record, key) ? record[key] : undefined;
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
  if (!Object.hasOwn(record, key)) return [];
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
  return Object.hasOwn(record, key) ? stringValue(record[key], `${path}.${key}`) : fallback;
}

function optionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  fallback: boolean,
): boolean {
  return Object.hasOwn(record, key) ? booleanValue(record[key], `${path}.${key}`) : fallback;
}

function optionalNonnegativeInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  fallback: number,
): number {
  if (!Object.hasOwn(record, key)) return fallback;
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalidValue(`${path}.${key}`, 'field must be a nonnegative safe integer');
  }
  return value;
}

function optionalNonnegativeFiniteNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  fallback: number,
): number {
  return Object.hasOwn(record, key)
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
  return Object.hasOwn(record, key)
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
