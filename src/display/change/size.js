import { changePlacement } from './placement';
import { updateConfig } from './utils';

export const changeSize = (object, { size }) => {
  object.setSize(size);
  changePlacement(object, {});
  updateConfig(object, { size });
};
