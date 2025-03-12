import { diff } from '../../utils/diff/diff';

export const isConfigMatch = (object, key, value) => {
  return value == null || diff(object.config[key], value);
};
