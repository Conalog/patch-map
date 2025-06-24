import { updateConfig } from './utils';

export const changeSize = (object, { size = object.config.size }) => {
  object.setSize(size.value);
  updateConfig(object, { size });
};
