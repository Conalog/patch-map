import { updateConfig } from './utils';

export const changeSize = (object, { size = object.size }) => {
  object.setSize(size.value);
  updateConfig(object, { size });
};
