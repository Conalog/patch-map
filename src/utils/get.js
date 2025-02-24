import { getTheme } from './theme';

export const getNestedValue = (object, path = null) => {
  if (!path) return null;
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : null), object);
};

export const getColor = (color) => {
  return (
    (color.startsWith('#') ? color : getNestedValue(getTheme(), color)) ??
    '#000'
  );
};

export const getViewport = (object) => {
  return object.viewport ?? getViewport(object.parent);
};
