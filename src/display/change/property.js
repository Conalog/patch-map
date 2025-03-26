import { updateConfig } from './utils';

export const changeProperty = (object, key, value) => {
  if (key === 'metadata' || key in object) {
    object[key] = value;
    updateConfig(object, { [key]: value });
  }
};
