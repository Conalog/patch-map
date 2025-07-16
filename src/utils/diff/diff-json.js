import { isPlainObject } from 'is-plain-object';

export const diffJson = (obj1, obj2) => {
  if (obj1 === obj2) return {};
  if (obj1 != null && obj2 == null) return obj1;
  if (obj1 == null && obj2 != null) return obj2;

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return obj2;
    }

    const areArraysEqual = obj1.every((item, index) => {
      const itemDiff = diffJson(item, obj2[index]);
      return (
        typeof itemDiff === 'object' &&
        itemDiff !== null &&
        Object.keys(itemDiff).length === 0
      );
    });

    return areArraysEqual ? {} : obj2;
  }

  if (!isPlainObject(obj1) || !isPlainObject(obj2)) {
    return obj1 === obj2 ? {} : obj2;
  }

  const result = {};
  for (const key of Object.keys(obj2)) {
    if (!(key in obj1)) {
      result[key] = obj2[key];
    } else {
      const diffValue = diffJson(obj1[key], obj2[key]);
      if (isPlainObject(diffValue)) {
        if (Object.keys(diffValue).length > 0) {
          result[key] = diffValue;
        }
      } else {
        if (diffValue != null) {
          result[key] = diffValue;
        }
      }
    }
  }

  return result;
};
