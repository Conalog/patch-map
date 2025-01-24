import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { changeZIndex } from '../change';
import { changeShow } from '../change';
import { upateComponents } from '../update-components';
import { createContainer } from '../utils';

export const createItem = (config) => {
  const element = createContainer(config);
  element.position.set(config.position.x, config.position.y);
  element.angle = config.rotation ?? 0;
  element.size = { ...config.size };
  element.config = config;
  return element;
};

export const updateItem = (element, config) => {
  changeShow(element, config);
  changeZIndex(element, config);
  upateComponents(element, config);
  element.config = deepMerge(element.config, config);
};
