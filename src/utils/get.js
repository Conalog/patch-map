import { isPlainObject } from 'is-plain-object';

export const getNestedValue = (object, path = null) => {
  if (!path) return null;
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : null), object);
};

export const getDiffObjects = (obj1, obj2) => {
  const diff = {};
  const allKeys = Object.keys(obj2);

  for (const key of allKeys) {
    const value1 = obj1[key];
    const value2 = obj2[key];

    if (isPlainObject(value1) && isPlainObject(value2)) {
      const nestedDiff = getDiffObjects(value1, value2);
      if (Object.keys(nestedDiff).length > 0) {
        diff[key] = nestedDiff;
      }
    } else if (value1 !== value2) {
      diff[key] = value2;
    }
  }
  return diff;
};

export const getCenterPointObject = (object) => {
  const { x, y } = object.position;
  const { width, height } = object;
  const { padding = 0 } = object.texture.metadata;
  const { left = 0, top = 0, right = 0, bottom = 0 } = getPadding(padding);
  const adjustedWidth = width - (left + right);
  const adjustedHeight = height - (top + bottom);

  return {
    x: x + left + adjustedWidth / 2,
    y: y + top + adjustedHeight / 2,
  };
};

export const getFrameInnerSize = (frame, margin = 0) => {
  const padding = getPadding(frame.texture.metadata.padding);
  return {
    width: frame.width - padding.left - padding.right - margin * 2,
    height: frame.height - padding.top - padding.bottom - margin * 2,
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

export const getBorderPadding = (borderWidth) =>
  borderWidth ? borderWidth / 2 : 0;

export const getColor = (color, theme) => {
  return (
    (color.startsWith('#') ? color : getNestedValue(theme, color)) ?? '#000'
  );
};
