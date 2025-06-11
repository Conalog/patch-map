import { changeProperty } from '../change';

const DEFAULT_EXCEPTION_KEYS = new Set(['position']);

export const updateObject = (
  object,
  changes,
  pipeline,
  pipelineKeys,
  undoRedoManager,
  options,
) => {
  if (!object) return;

  const pipelines = pipelineKeys.map((key) => pipeline[key]).filter(Boolean);
  for (const { keys, handler } of pipelines) {
    const hasMatch = keys.some((key) => key in changes);
    if (hasMatch) {
      handler(object, changes, undoRedoManager, options);
    }
  }

  const matchedKeys = new Set(pipelines.flatMap((item) => item.keys));
  for (const [key, value] of Object.entries(changes)) {
    if (!matchedKeys.has(key) && !DEFAULT_EXCEPTION_KEYS.has(key)) {
      changeProperty(object, key, value);
    }
  }
};
