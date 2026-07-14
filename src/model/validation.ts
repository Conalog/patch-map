import type {
  AssetSource,
  DrawableSource,
  ItemComponentData,
  MapData,
  MapElementData,
} from '../contracts';

const ELEMENT_TYPES = [
  'group',
  'grid',
  'item',
  'relations',
  'image',
  'text',
  'rect',
] as const;

const COMPONENT_TYPES = ['background', 'bar', 'icon', 'text'] as const;

const ELEMENT_DISCRIMINATOR =
  "'group' | 'grid' | 'item' | 'relations' | 'image' | 'text' | 'rect'";
const COMPONENT_DISCRIMINATOR = "'background' | 'bar' | 'icon' | 'text'";

const PLACEMENT_ENUM =
  "'left' | 'left-top' | 'left-bottom' | 'top' | 'right' | 'right-top' | 'right-bottom' | 'bottom' | 'center'";

const PLACEMENTS = new Set([
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

const TEXT_COMPONENT_KEYS = new Set([
  'type',
  'id',
  'label',
  'show',
  'tint',
  'attrs',
  'text',
  'style',
  'placement',
  'margin',
  'split',
]);

const ELEMENT_KEYS: Readonly<Record<(typeof ELEMENT_TYPES)[number], ReadonlySet<string>>> = {
  group: new Set(['type', 'id', 'label', 'show', 'locked', 'attrs', 'children']),
  grid: new Set([
    'type',
    'id',
    'label',
    'show',
    'locked',
    'attrs',
    'cells',
    'item',
    'gap',
    'inactiveCellStrategy',
  ]),
  item: new Set([
    'type',
    'id',
    'label',
    'show',
    'locked',
    'attrs',
    'size',
    'components',
    'padding',
    'contentOrientation',
  ]),
  relations: new Set([
    'type',
    'id',
    'label',
    'show',
    'locked',
    'attrs',
    'links',
    'style',
  ]),
  image: new Set([
    'type',
    'id',
    'label',
    'show',
    'locked',
    'attrs',
    'source',
    'size',
  ]),
  text: new Set([
    'type',
    'id',
    'label',
    'show',
    'locked',
    'attrs',
    'text',
    'style',
  ]),
  rect: new Set([
    'type',
    'id',
    'label',
    'show',
    'locked',
    'attrs',
    'size',
    'fill',
    'stroke',
    'radius',
  ]),
};

const INLINE_SOURCE_KEYS = new Set([
  'src',
  'data',
  'format',
  'parser',
  'loadParser',
]);

/**
 * Public draw failures expose this error name. The class intentionally keeps
 * validation independent of a particular schema library's internal format.
 */
export class ZodValidationError extends Error {
  public override name = 'ZodValidationError';
}

export function validateMapData(value: unknown): asserts value is MapData {
  if (!Array.isArray(value)) {
    fail(`Expected array, received ${receivedType(value)}`, '');
  }

  validateSiblingIds(value, []);
  value.forEach((entry, index) => validateElement(entry, `[${index}]`));
}

export const isMapData = (value: unknown): value is MapData => {
  try {
    validateMapData(value);
    return true;
  } catch {
    return false;
  }
};

function validateElement(
  value: unknown,
  path: string,
): asserts value is MapElementData {
  const element = requireRecord(value, path);
  const type = element.type;
  if (
    typeof type !== 'string' ||
    !ELEMENT_TYPES.includes(type as (typeof ELEMENT_TYPES)[number])
  ) {
    fail(
      `Invalid discriminator value. Expected ${ELEMENT_DISCRIMINATOR}`,
      `${path}.type`,
    );
  }

  validateElementKeys(
    element,
    type as (typeof ELEMENT_TYPES)[number],
    path,
  );
  validateElementBase(element, path);
  switch (type) {
    case 'group':
      requireFields(element, ['children'], path);
      requireArray(element.children, `${path}.children`).forEach((child, index) =>
        validateElement(child, `${path}.children[${index}]`),
      );
      break;
    case 'grid':
      validateGrid(element, path);
      break;
    case 'item':
      requireFields(element, ['size'], path);
      validateFixedSize(element.size, `${path}.size`);
      validateComponents(element.components, `${path}.components`);
      validateSpacing(element.padding, `${path}.padding`);
      validateContentOrientation(
        element.contentOrientation,
        `${path}.contentOrientation`,
      );
      break;
    case 'relations':
      requireFields(element, ['links'], path);
      validateRelationLinks(element.links, `${path}.links`);
      validateOptionalRecord(element.style, `${path}.style`);
      break;
    case 'image':
      requireFields(element, ['source'], path);
      validateAssetSource(element.source, `${path}.source`);
      if (element.size !== undefined) {
        validateFixedSize(element.size, `${path}.size`);
      }
      break;
    case 'text':
      validateOptionalString(element.text, `${path}.text`);
      validateOptionalRecord(element.style, `${path}.style`);
      break;
    case 'rect':
      requireFields(element, ['size'], path);
      validateFixedSize(element.size, `${path}.size`);
      validateOptionalNumber(element.radius, `${path}.radius`);
      break;
  }
}

const validateGrid = (grid: Record<string, unknown>, path: string): void => {
  requireFields(grid, ['cells', 'item'], path);
  const cells = requireArray(grid.cells, `${path}.cells`);
  cells.forEach((row, rowIndex) => {
    requireArray(row, `${path}.cells[${rowIndex}]`).forEach((cell, colIndex) => {
      if (!(cell === 0 || cell === 1 || typeof cell === 'string')) {
        fail(
          'Expected 0, 1, or a string',
          `${path}.cells[${rowIndex}][${colIndex}]`,
        );
      }
    });
  });

  if (
    grid.inactiveCellStrategy !== undefined &&
    grid.inactiveCellStrategy !== 'destroy' &&
    grid.inactiveCellStrategy !== 'hide'
  ) {
    fail("Expected 'destroy' or 'hide'", `${path}.inactiveCellStrategy`);
  }
  validateGap(grid.gap, `${path}.gap`);

  const item = requireRecord(grid.item, `${path}.item`);
  validateFixedSize(item.size, `${path}.item.size`);
  validateComponents(item.components, `${path}.item.components`);
  validateSpacing(item.padding, `${path}.item.padding`);
  validateContentOrientation(
    item.contentOrientation,
    `${path}.item.contentOrientation`,
  );
};

const validateElementBase = (
  element: Record<string, unknown>,
  path: string,
): void => {
  validateOptionalString(element.id, `${path}.id`);
  validateOptionalString(element.label, `${path}.label`);
  validateOptionalBoolean(element.show, `${path}.show`);
  validateOptionalBoolean(element.locked, `${path}.locked`);
  validateOptionalRecord(element.attrs, `${path}.attrs`);
};

const validateComponents = (value: unknown, path: string): void => {
  if (value === undefined) return;
  requireArray(value, path).forEach((component, index) =>
    validateComponent(component, `${path}[${index}]`),
  );
};

function validateComponent(
  value: unknown,
  path: string,
): asserts value is ItemComponentData {
  const component = requireRecord(value, path);
  const type = component.type;
  if (
    typeof type !== 'string' ||
    !COMPONENT_TYPES.includes(type as (typeof COMPONENT_TYPES)[number])
  ) {
    fail(
      `Invalid discriminator value. Expected ${COMPONENT_DISCRIMINATOR}`,
      `${path}.type`,
    );
  }

  validateOptionalString(component.id, `${path}.id`);
  validateOptionalString(component.label, `${path}.label`);
  validateOptionalBoolean(component.show, `${path}.show`);
  validateOptionalRecord(component.attrs, `${path}.attrs`);

  switch (type) {
    case 'background':
      requireFields(component, ['source'], path);
      validateDrawableSource(component.source, `${path}.source`);
      break;
    case 'bar':
      requireFields(component, ['source', 'size'], path);
      validateDrawableSource(component.source, `${path}.source`);
      validateComponentSize(component.size, `${path}.size`);
      validatePlacement(component.placement, `${path}.placement`);
      validateSpacing(component.margin, `${path}.margin`);
      validateOptionalBoolean(component.animation, `${path}.animation`);
      validateOptionalNumber(
        component.animationDuration,
        `${path}.animationDuration`,
      );
      break;
    case 'icon':
      requireFields(component, ['source', 'size'], path);
      validateAssetSource(component.source, `${path}.source`);
      validateComponentSize(component.size, `${path}.size`);
      validatePlacement(component.placement, `${path}.placement`);
      validateSpacing(component.margin, `${path}.margin`);
      break;
    case 'text':
      validateTextComponentKeys(component, path);
      validateOptionalString(component.text, `${path}.text`);
      validateOptionalRecord(component.style, `${path}.style`);
      validateAutoFont(component.style, `${path}.style.autoFont`);
      validatePlacement(component.placement, `${path}.placement`);
      validateSpacing(component.margin, `${path}.margin`);
      validateOptionalNumber(component.split, `${path}.split`);
      break;
  }
}

const validateElementKeys = (
  element: Record<string, unknown>,
  type: (typeof ELEMENT_TYPES)[number],
  path: string,
): void => {
  const invalidKeys = Object.keys(element).filter(
    (key) => !ELEMENT_KEYS[type].has(key),
  );
  if (invalidKeys.length === 0) return;

  const index = /^\[(\d+)\]$/.exec(path)?.[1];
  if (index !== undefined) {
    throw new ZodValidationError(
      `Validation error: Unrecognized key(s) in object: ${invalidKeys
        .map((key) => `'${key}'`)
        .join(', ')} at index ${index}`,
    );
  }
  fail(
    `Unrecognized key(s) in object: ${invalidKeys
      .map((key) => `'${key}'`)
      .join(', ')}`,
    path,
  );
};

const requireFields = (
  value: Record<string, unknown>,
  fields: readonly string[],
  path: string,
): void => {
  const issues = fields
    .filter((field) => value[field] === undefined)
    .map((field) => `Required at "${path}.${field}"`);
  if (issues.length > 0) failIssues(issues);
};

const validateSiblingIds = (
  values: readonly unknown[],
  path: readonly (string | number)[],
): void => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value)) return;
    if (typeof value.id === 'string') {
      if (seen.has(value.id)) {
        const duplicatePath = [...path, index].join('.');
        throw new ZodValidationError(
          `Validation error: Duplicate id: ${value.id} at ${duplicatePath}`,
        );
      }
      seen.add(value.id);
    }

    if (Array.isArray(value.children)) {
      validateSiblingIds(value.children, [...path, index, 'children']);
    }
    if (Array.isArray(value.components)) {
      validateSiblingIds(value.components, [...path, index, 'components']);
    }
    if (isRecord(value.item) && Array.isArray(value.item.components)) {
      validateSiblingIds(
        value.item.components,
        [...path, index, 'item', 'components'],
      );
    }
  });
};

const validateRelationLinks = (value: unknown, path: string): void => {
  requireArray(value, path).forEach((value, index) => {
    const linkPath = `${path}[${index}]`;
    const link = requirePublicRecord(value, linkPath);
    const issues: string[] = [];
    if (link.source === undefined) issues.push(`Required at "${linkPath}.source"`);
    if (link.target === undefined) issues.push(`Required at "${linkPath}.target"`);
    if (issues.length > 0) failIssues(issues);
  });
};

const validateTextComponentKeys = (
  component: Record<string, unknown>,
  path: string,
): void => {
  const invalidKeys = Object.keys(component).filter(
    (key) => !TEXT_COMPONENT_KEYS.has(key),
  );
  if (invalidKeys.length === 0) return;
  fail(
    `Unrecognized key(s) in object: ${invalidKeys
      .map((key) => `'${key}'`)
      .join(', ')}`,
    path,
  );
};

const validateAutoFont = (styleValue: unknown, path: string): void => {
  if (!isRecord(styleValue) || styleValue.autoFont === undefined) return;
  const autoFont = requirePublicRecord(styleValue.autoFont, path);
  validateOptionalNumber(autoFont.min, `${path}.min`);
  validateOptionalNumber(autoFont.max, `${path}.max`);
};

const validateFixedSize = (value: unknown, path: string): void => {
  if (isFiniteNumber(value)) return;
  const size = requireRecord(value, path);
  requireFiniteNumber(size.width, `${path}.width`);
  requireFiniteNumber(size.height, `${path}.height`);
};

const validateComponentSize = (value: unknown, path: string): void => {
  if (isComponentLength(value)) return;
  const size = requireRecord(value, path);
  validateComponentLength(size.width, `${path}.width`);
  validateComponentLength(size.height, `${path}.height`);
};

const validateComponentLength = (value: unknown, path: string): void => {
  if (!isComponentLength(value)) {
    fail('Expected a pixel number, percent string, or unit value', path);
  }
};

const isComponentLength = (value: unknown): boolean => {
  if (isFiniteNumber(value)) return true;
  if (typeof value === 'string') {
    return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value);
  }
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.value) &&
    (value.unit === 'px' || value.unit === '%')
  );
};

const validateGap = (value: unknown, path: string): void => {
  if (value === undefined || isFiniteNumber(value)) return;
  const gap = requireRecord(value, path);
  validateOptionalNumber(gap.x, `${path}.x`);
  validateOptionalNumber(gap.y, `${path}.y`);
};

const validateSpacing = (value: unknown, path: string): void => {
  if (value === undefined || isFiniteNumber(value)) return;
  const spacing = requireRecord(value, path);
  for (const key of ['x', 'y', 'top', 'right', 'bottom', 'left']) {
    validateOptionalNumber(spacing[key], `${path}.${key}`);
  }
};

const validateContentOrientation = (value: unknown, path: string): void => {
  if (
    value !== undefined &&
    value !== 'upright' &&
    value !== 'follow-item'
  ) {
    fail("Expected 'upright' or 'follow-item'", path);
  }
};

const validatePlacement = (value: unknown, path: string): void => {
  if (
    value !== undefined &&
    (typeof value !== 'string' || !PLACEMENTS.has(value))
  ) {
    const received = typeof value === 'string'
      ? `'${value}'`
      : receivedType(value);
    fail(
      `Invalid enum value. Expected ${PLACEMENT_ENUM}, received ${received}`,
      path,
    );
  }
};

function validateAssetSource(
  value: unknown,
  path: string,
): asserts value is AssetSource {
  if (typeof value === 'string') return;
  const descriptor = requireRecord(value, path);
  if (typeof descriptor.src !== 'string') {
    fail('Expected an asset key, URL, or inline descriptor with src', path);
  }
  const invalidKey = Object.keys(descriptor).find(
    (key) => !INLINE_SOURCE_KEYS.has(key),
  );
  if (invalidKey) {
    fail(`Unknown inline asset descriptor field '${invalidKey}'`, path);
  }
}

function validateDrawableSource(
  value: unknown,
  path: string,
): asserts value is DrawableSource {
  if (isRecord(value) && value.type === 'rect') {
    validateOptionalNumber(value.borderWidth, `${path}.borderWidth`);
    validateOptionalNumber(value.radius, `${path}.radius`);
    return;
  }
  validateAssetSource(value, path);
}

const validateOptionalRecord = (value: unknown, path: string): void => {
  if (value !== undefined) requireRecord(value, path);
};

const validateOptionalString = (value: unknown, path: string): void => {
  if (value !== undefined && typeof value !== 'string') {
    fail('Expected a string', path);
  }
};

const validateOptionalBoolean = (value: unknown, path: string): void => {
  if (value !== undefined && typeof value !== 'boolean') {
    fail('Expected a boolean', path);
  }
};

const validateOptionalNumber = (value: unknown, path: string): void => {
  if (value !== undefined) requireFiniteNumber(value, path);
};

function requireFiniteNumber(value: unknown, path: string): number {
  if (!isFiniteNumber(value)) fail('Expected a finite number', path);
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail('Expected an array', path);
  return value;
}

function requireRecord(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!isRecord(value)) fail('Expected an object', path);
  return value;
}

function requirePublicRecord(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`Expected object, received ${receivedType(value)}`, path);
  }
  return value;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const receivedType = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

function fail(message: string, path: string): never {
  const location = path ? ` at "${path}"` : '';
  throw new ZodValidationError(`Validation error: ${message}${location}`);
}

function failIssues(issues: readonly string[]): never {
  throw new ZodValidationError(`Validation error: ${issues.join('; ')}`);
}
