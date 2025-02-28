import { theme } from './theme';

export const getNestedValue = (object, path = null) => {
  if (!path) return null;
  return path
    .split('.')
    .reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), object);
};

export const getColor = (color) => {
  return (
    (typeof color === 'string' && color.startsWith('#')
      ? color
      : getNestedValue(theme.get(), color)) ?? '#000'
  );
};
