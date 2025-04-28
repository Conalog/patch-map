import deepmerge from 'deepmerge';
import { isPlainObject } from 'is-plain-object';
import { findIndexByPriority } from '../findIndexByPriority';

const isPrimitive = (value) =>
  value === null ||
  ['string', 'number', 'boolean', 'bigint', 'symbol', 'undefined'].includes(
    typeof value,
  );

const _deepMerge = (target, source, options, visited) => {
  if (isPrimitive(source) || typeof source === 'function') return source;
  if (visited.has(source)) return visited.get(source);

  if (Array.isArray(target) && Array.isArray(source)) {
    return mergeArray(target, source, options, visited);
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const out = { ...target };
    visited.set(source, out);
    for (const key of Object.keys(source)) {
      out[key] = _deepMerge(target[key], source[key], options, visited);
    }
    return out;
  }

  if (
    target &&
    typeof target === 'object' &&
    !Array.isArray(target) &&
    !isPlainObject(target) &&
    isPlainObject(source)
  ) {
    visited.set(source, target);
    for (const key of Object.keys(source)) {
      target[key] = _deepMerge(target[key], source[key], options, visited);
    }
    return target;
  }
  return source;
};

const mergeArray = (target, source, options, visited) => {
  const merged = [...target];
  const used = new Set();

  source.forEach((item, i) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const idx = findIndexByPriority(merged, item, used);
      if (idx !== -1) {
        merged[idx] = deepmerge(merged[idx], item, {
          isMergeableObject: (value) =>
            Array.isArray(value) || isPlainObject(value),
          arrayMerge: (target, src) =>
            mergeArray(target, src, options, visited),
          ...options,
        });
        used.add(idx);
        return;
      }
    } else if (i < merged.length) {
      merged[i] = item;
      return;
    }
    merged.push(item);
  });

  return merged;
};

export const deepMerge = (target, source, options = {}) => {
  const visited = new WeakMap();
  return _deepMerge(target, source, options, visited);
};
