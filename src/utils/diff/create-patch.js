import { isPlainObject } from 'is-plain-object';
import { isSame } from './is-same';

export const createPatch = (obj1, obj2) => {
  if (isSame(obj1, obj2)) return {};

  if (
    obj1 === null ||
    obj2 === null ||
    !isPlainObject(obj1) ||
    !isPlainObject(obj2)
  ) {
    return obj2;
  }

  const result = {};
  for (const key of Object.keys(obj2)) {
    if (
      !Object.prototype.hasOwnProperty.call(obj1, key) ||
      !isSame(obj1[key], obj2[key])
    ) {
      const patchValue = createPatch(obj1[key], obj2[key]);
      result[key] = patchValue;
    }
  }

  return result;
};
