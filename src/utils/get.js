export const getNestedValue = (object, path) => {
  if (typeof path !== 'string' || !path) {
    return null;
  }

  const value = path
    .split('.')
    .reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), object);
  return typeof value === 'string' ? value : null;
};

export const getColor = (theme, color) => {
  if (typeof color !== 'string') {
    return color;
  }
  const themeColor = getNestedValue(theme, color);
  return themeColor ?? color;
};
