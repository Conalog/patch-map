import { isPlainObject } from 'is-plain-object';

export const diffJson = (obj1, obj2) => {
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
