const isPlainObject = (value) =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const normalizeAxisSpacing = (value) => {
  if (typeof value === 'number') {
    return { x: value, y: value };
  }

  return value;
};

export const normalizeBoxSpacing = (
  value,
  { preserveUnknownKeys = false } = {},
) => {
  if (typeof value === 'number') {
    return {
      top: value,
      right: value,
      bottom: value,
      left: value,
    };
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const next = preserveUnknownKeys ? { ...value } : {};

  if ('x' in value) {
    const x = value.x ?? 0;
    next.right = x;
    next.left = x;
    delete next.x;
  }

  if ('y' in value) {
    const y = value.y ?? 0;
    next.top = y;
    next.bottom = y;
    delete next.y;
  }

  if ('top' in value) next.top = value.top ?? 0;
  if ('right' in value) next.right = value.right ?? 0;
  if ('bottom' in value) next.bottom = value.bottom ?? 0;
  if ('left' in value) next.left = value.left ?? 0;

  return next;
};
