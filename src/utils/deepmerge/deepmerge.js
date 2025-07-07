import { isPlainObject } from 'is-plain-object';
import { findIndexByPriority } from '../findIndexByPriority';

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

const enumKeys = (obj) => {
  const out = [];
  for (const key of Reflect.ownKeys(obj)) {
    if (forbiddenKeys.has(key)) continue;
    if (Object.prototype.propertyIsEnumerable.call(obj, key)) out.push(key);
  }
  return out;
};

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
    const out = {};
    for (const key of enumKeys(target)) {
      out[key] = target[key];
    }
    visited.set(source, out);

    for (const key of enumKeys(source)) {
      out[key] = _deepMerge(out[key], source[key], options, visited);
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
  const { mergeBy, arrayMerge = null } = options;

  if (arrayMerge === 'overwrite') {
    return source;
  }

  const merged = [...target];
  const used = new Set();

  source.forEach((item, i) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const idx = findIndexByPriority(merged, item, used, mergeBy);
      if (idx !== -1) {
        merged[idx] = _deepMerge(merged[idx], item, options, visited);
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
  if (source === undefined) return target;
  const visited = new WeakMap();
  return _deepMerge(target, source, options, visited);
};
