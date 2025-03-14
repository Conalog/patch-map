import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { isSame } from '../../utils/diff/isSame';

export const isConfigMatch = (object, key, value) => {
  return value == null || isSame(object.config[key], value);
};

export const updateConfig = (object, config) => {
  object.config = deepMerge(object.config, config);
};
