export const getCenterPointObject = (object) => {
  const { x, y } = object.position;
  const { width, height } = object;
  const { padding = 0 } = object.metadata;
  const { left = 0, top = 0, right = 0, bottom = 0 } = getPadding(padding);
  const adjustedWidth = width - (left + right);
  const adjustedHeight = height - (top + bottom);

  return {
    x: x + left + adjustedWidth / 2,
    y: y + top + adjustedHeight / 2,
  };
};

export const getPadding = (padding) => {
  const {
    left = 0,
    top = 0,
    right = 0,
    bottom = 0,
  } = typeof padding === 'number'
    ? { left: padding, top: padding, right: padding, bottom: padding }
    : padding || {};
  return { left, top, right, bottom };
};