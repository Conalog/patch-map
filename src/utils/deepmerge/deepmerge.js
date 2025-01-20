import deepmerge from 'deepmerge';
import { isPlainObject } from 'is-plain-object';

export const deepMerge = (target, source, options = {}) => {
  return deepmerge(target, source, {
    isMergeableObject: (value) => {
      if (Array.isArray(value)) return true;
      return isPlainObject(value);
    },
    arrayMerge: mergeArray,
    ...options,
  });
};

const mergeArray = (target, source, options) => {
  const result = [...target];
  const usedIndexes = new Set();

  source.forEach((srcItem) => {
    if (typeof srcItem === 'number') {
      const idx = source.indexOf(srcItem);
      if (idx < result.length) {
        result[idx] = srcItem;
      } else {
        result.push(srcItem);
      }
      return;
    }

    let foundIndex = -1;
    if (srcItem && typeof srcItem === 'object') {
      if (srcItem.id) {
        foundIndex = result.findIndex(
          (item, idx) => !usedIndexes.has(idx) && item?.id === srcItem.id,
        );
      } else if (srcItem.name) {
        foundIndex = result.findIndex(
          (item, idx) => !usedIndexes.has(idx) && item?.name === srcItem.name,
        );
      } else if (srcItem.type) {
        foundIndex = result.findIndex(
          (item, idx) => !usedIndexes.has(idx) && item?.type === srcItem.type,
        );
      }
    }

    if (foundIndex > -1) {
      result[foundIndex] = deepmerge(result[foundIndex], srcItem, options);
      usedIndexes.add(foundIndex);
    } else {
      result.push(srcItem);
    }
  });
  return result;
};
