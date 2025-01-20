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

export const getTheme = (object) => {
  return object.viewport?.theme ?? getTheme(object.parent);
};

export const getColor = (color, theme) => {
  return (
    (color.startsWith('#') ? color : getNestedValue(theme, color)) ?? '#000'
  );
};
