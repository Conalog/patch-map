export const getNestedValue = (object, path = null) => {
  if (!path) return null;
  return path
    .split('.')
    .reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), object);
};

export const getColor = (theme, color) => {
  return (
    (typeof color === 'string' && color.startsWith('#')
      ? color
      : getNestedValue(theme, color)) ?? '#000'
  );
};

export const getViewport = (object) => {
  if (!object) return null;
  return object.viewport ?? getViewport(object.parent);
};
