import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { changeProperty } from '../change';

const DEFAULT_EXCEPTION_KEYS = new Set(['position']);

export const updateObject = (
  object,
  config,
  pipeline,
  pipelineKeys,
  options,
) => {
  if (!object) return;

  const pipelines = pipelineKeys.map((key) => pipeline[key]).filter(Boolean);
  for (const { keys, handler } of pipelines) {
    const hasMatch = keys.some((key) => key in config);
    if (hasMatch) {
      handler(object, config, options);
    }
  }

  const matchedKeys = new Set(pipelines.flatMap((item) => item.keys));
  for (const [key, value] of Object.entries(config)) {
    if (!matchedKeys.has(key) && !DEFAULT_EXCEPTION_KEYS.has(key)) {
      changeProperty(object, key, value);
    }
  }
  object.config = deepMerge(object.config, config);
};
