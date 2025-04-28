import { deepMerge } from '../../utils/deepmerge/deepmerge';

export const changeProperty = (object, key, value) => {
  object[key] = deepMerge(object[key], value);
};
