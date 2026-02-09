const COMPONENT_TYPES = new Set(['background', 'bar', 'icon', 'text']);

const isPlainObject = (value) =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeArray = (items, normalizeItem) => {
  let changed = false;
  const next = items.map((item) => {
    const normalized = normalizeItem(item);
    if (normalized !== item) changed = true;
    return normalized;
  });
  return changed ? next : items;
};

const assignIfChanged = (next, original, key, value) => {
  if (value === original[key]) return next;
  if (next === original) next = { ...original };
  next[key] = value;
  return next;
};

const normalizeSize = (value) => {
  if (typeof value === 'number') {
    return { width: value, height: value };
  }
  return value;
};

const normalizeGap = (value) => {
  if (typeof value === 'number') {
    return { x: value, y: value };
  }
  return value;
};

const normalizeMargin = (value) => {
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (isPlainObject(value) && ('x' in value || 'y' in value)) {
    const x = value.x ?? 0;
    const y = value.y ?? 0;
    return { top: y, right: x, bottom: y, left: x };
  }
  return value;
};

const normalizePxOrPercent = (value) => {
  if (typeof value === 'number') {
    return { value, unit: 'px' };
  }
  if (typeof value === 'string' && value.endsWith('%')) {
    return { value: Number.parseFloat(value.slice(0, -1)), unit: '%' };
  }
  return value;
};

const normalizePxOrPercentSize = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'string') {
    const normalized = normalizePxOrPercent(value);
    return { width: normalized, height: normalized };
  }
  if (!isPlainObject(value)) return value;
  if (!('width' in value || 'height' in value)) return value;

  let next = value;
  if ('width' in value) {
    const width = normalizePxOrPercent(value.width);
    if (width !== value.width) {
      if (next === value) next = { ...value };
      next.width = width;
    }
  }
  if ('height' in value) {
    const height = normalizePxOrPercent(value.height);
    if (height !== value.height) {
      if (next === value) next = { ...value };
      next.height = height;
    }
  }
  return next;
};

const normalizeBackgroundSize = () => ({
  width: { value: 100, unit: '%' },
  height: { value: 100, unit: '%' },
});

const normalizeComponent = (value, typeHint = value?.type) => {
  if (!isPlainObject(value)) return value;
  const type = typeHint ?? value.type;
  if (!COMPONENT_TYPES.has(type)) return value;

  let next = value;
  if ('margin' in value) {
    next = assignIfChanged(
      next,
      value,
      'margin',
      normalizeMargin(value.margin),
    );
  }
  if ('size' in value) {
    if (type === 'background') {
      next = assignIfChanged(next, value, 'size', normalizeBackgroundSize());
    } else if (type === 'bar' || type === 'icon') {
      next = assignIfChanged(
        next,
        value,
        'size',
        normalizePxOrPercentSize(value.size),
      );
    }
  }
  return next;
};

const normalizeGridItem = (value) => {
  if (!isPlainObject(value)) return value;
  let next = value;
  if ('size' in value) {
    next = assignIfChanged(next, value, 'size', normalizeSize(value.size));
  }
  if ('padding' in value) {
    next = assignIfChanged(
      next,
      value,
      'padding',
      normalizeMargin(value.padding),
    );
  }
  if (Array.isArray(value.components)) {
    next = assignIfChanged(
      next,
      value,
      'components',
      normalizeArray(value.components, normalizeComponent),
    );
  }
  return next;
};

const normalizeElement = (value) => {
  if (!isPlainObject(value)) return value;
  let next = value;
  if ('size' in value) {
    next = assignIfChanged(next, value, 'size', normalizeSize(value.size));
  }
  if ('gap' in value) {
    next = assignIfChanged(next, value, 'gap', normalizeGap(value.gap));
  }
  if ('padding' in value) {
    next = assignIfChanged(
      next,
      value,
      'padding',
      normalizeMargin(value.padding),
    );
  }
  if (Array.isArray(value.components)) {
    next = assignIfChanged(
      next,
      value,
      'components',
      normalizeArray(value.components, normalizeComponent),
    );
  }
  if (Array.isArray(value.children)) {
    next = assignIfChanged(
      next,
      value,
      'children',
      normalizeArray(value.children, normalizeNode),
    );
  }
  if ('item' in value) {
    next = assignIfChanged(next, value, 'item', normalizeGridItem(value.item));
  }
  return next;
};

const normalizeNode = (value) => {
  if (!isPlainObject(value)) return value;
  const type = value.type;
  if (COMPONENT_TYPES.has(type)) {
    return normalizeComponent(value, type);
  }
  return normalizeElement(value);
};

export const normalizeChanges = (changes, typeHint) => {
  if (!isPlainObject(changes)) return changes;
  if (COMPONENT_TYPES.has(typeHint)) {
    return normalizeComponent(changes, typeHint);
  }
  return normalizeElement(changes);
};
