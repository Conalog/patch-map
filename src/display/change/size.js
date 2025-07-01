import { mergeProps } from './utils';

export const changeSize = (object, { size = object.config.size }) => {
  object.setSize(size.width.value, size.height.value);
  mergeProps(object, { size });
};
