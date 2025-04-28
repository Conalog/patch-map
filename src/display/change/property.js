import { deepMerge } from '../../utils/deepmerge/deepmerge';

export const changeProperty = (object, key, value) => {
  deepMerge(object, { [key]: value });
};
