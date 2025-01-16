import { changeLayout, changeZIndex } from '../change';
import { changeShow } from '../change';
import { createContainer } from '../utils';

export const createItem = (config) => {
  const container = createContainer(config);
  container.position.set(config.position.x, config.position.y);
  container.angle = config.rotation ?? 0;
  container.size = { ...config.size };
  return container;
};

export const updateItem = (element, config) => {
  changeShow(element, config);
  changeZIndex(element, config);
  changeLayout(element, config);
};
