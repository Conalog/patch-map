export const getNestedValue = (object, path = null) => {
  if (!path) return null;
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : null), object);
};

export const getColor = (color, theme) => {
  return (
    (color.startsWith('#') ? color : getNestedValue(theme, color)) ?? '#000'
  );
};
