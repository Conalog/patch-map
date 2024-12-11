import deepmerge from 'deepmerge';
import { isPlainObject } from 'is-plain-object';

export const deepMerge = (target, source, options = {}) => {
  return deepmerge(target, source, {
    isMergeableObject: isPlainObject,
    ...options,
  });
};
