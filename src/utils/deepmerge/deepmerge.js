import deepmerge from 'deepmerge';
import { isPlainObject } from 'is-plain-object';
import { findIndexByPriority } from '../findIndexByPriority';

const isPrimitive = (value) =>
  value === null ||
  ['string', 'number', 'boolean', 'bigint', 'symbol', 'undefined'].includes(
    typeof value,
  );

export const deepMerge = (target = {}, source = {}, options = {}) => {
  if (isPrimitive(target) || isPrimitive(source)) {
    return source;
  }
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
  const mergedArray = [...target];
  const usedIndexes = new Set();

  source.forEach((srcItem, srcIndex) => {
    if (typeof srcItem === 'number') {
      if (srcIndex < mergedArray.length) {
        mergedArray[srcIndex] = srcItem;
      } else {
        mergedArray.push(srcItem);
      }
      return;
    }

    if (srcItem && typeof srcItem === 'object' && !Array.isArray(srcItem)) {
      const idx = findIndexByPriority(mergedArray, srcItem, usedIndexes);
      if (idx !== -1) {
        mergedArray[idx] = deepmerge(mergedArray[idx], srcItem, options);
        usedIndexes.add(idx);
        return;
      }
    }
    mergedArray.push(srcItem);
  });
  return mergedArray;
};
