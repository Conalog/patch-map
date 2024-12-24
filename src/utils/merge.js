import deepmerge from 'deepmerge';
import { isPlainObject } from 'is-plain-object';

export const deepMerge = (target, source, options = {}) => {
  const filteredSource = Object.fromEntries(
    Object.entries(source).filter(([_, value]) => value !== undefined),
  );
  return deepmerge(target, filteredSource, {
    isMergeableObject: isPlainObject,
    ...options,
  });
};
