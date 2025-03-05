import { deepMerge } from '../utils/deepmerge/deepmerge';
import { changeProperty } from './change';

const DEFAULT_EXCEPTION_KEYS = new Set(['position']);

export const updateObject = (
  object,
  options,
  pipeline = [],
  pipelineKeys = new Set([]),
  exceptionKeys = new Set([]),
) => {
  if (!object) return;

  for (const { keys, handler } of pipeline) {
    const hasMatch = keys.some((key) => key in options);
    if (hasMatch) {
      handler(object, options);
    }
  }
  for (const [key, value] of Object.entries(options)) {
    if (
      !pipelineKeys.has(key) &&
      !exceptionKeys.has(key) &&
      !DEFAULT_EXCEPTION_KEYS.has(key)
    ) {
      changeProperty(object, key, value);
    }
  }
  object.config = deepMerge(object.config, options);
};
