import { isPlainObject } from 'is-plain-object';
import { isSame } from './is-same';

export const diffReplace = (obj1, obj2) => {
  if (isSame(obj1, obj2)) {
    return {};
  }

  if (!isPlainObject(obj1) || !isPlainObject(obj2)) {
    return obj2;
  }

  const result = {};
  const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

  for (const key of allKeys) {
    const val1 = obj1[key];
    const val2 = obj2[key];

    if (!isSame(val1, val2)) {
      result[key] = val2;
    }
  }

  return result;
};
