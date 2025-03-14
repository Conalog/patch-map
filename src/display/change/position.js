import { updateConfig } from './utils';

export const changePosition = (object, { position }) => {
  object.position.set(position.x, position.y);
  updateConfig(object, { position });
};
