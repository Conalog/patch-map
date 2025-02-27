import { convertArray } from '../utils/convert';

export const add = (viewport, plugins = {}) => {
  for (const [key, options] of Object.entries(plugins)) {
    if (options.disabled) continue;
    viewport.plugins.remove(key);
    viewport[key](options);
  }
};

export const remove = (viewport, keys) => {
  for (const key of convertArray(keys)) {
    viewport.plugins.remove(key);
  }
};

export const start = (viewport, keys) => {
  for (const key of convertArray(keys)) {
    viewport.plugins.resume(key);
  }
};

export const stop = (viewport, keys) => {
  for (const key of convertArray(keys)) {
    viewport.plugins.pause(key);
  }
};

export const plugin = { add, remove, start, stop };
