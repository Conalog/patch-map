import { isPlainObject } from 'is-plain-object';

export const createPatch = (obj1, obj2) => {
  if (obj1 === obj2) return {};
  if (
    obj1 === null ||
    obj1 === undefined ||
    obj2 === null ||
    obj2 === undefined
  ) {
    return obj2;
  }

  if (!isPlainObject(obj1) || !isPlainObject(obj2)) {
    try {
      if (typeof obj1 !== 'function' && typeof obj2 !== 'function') {
        return JSON.stringify(obj1) === JSON.stringify(obj2) ? {} : obj2;
      }
    } catch (_) {
      return obj2;
    }
    return obj2;
  }

  const result = {};
  for (const key of Object.keys(obj2)) {
    if (!(key in obj1)) {
      result[key] = obj2[key];
    } else {
      const patchValue = createPatch(obj1[key], obj2[key]);
      const hasChanged = !(
        isPlainObject(patchValue) && Object.keys(patchValue).length === 0
      );

      if (hasChanged) {
        result[key] = patchValue;
      }
    }
  }

  return result;
};
