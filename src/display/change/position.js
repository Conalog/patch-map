import { updateConfig } from './utils';

export const changePosition = (object, { x, y }) => {
  object.position.set(x, y);
  updateConfig(object, { x, y });
};
