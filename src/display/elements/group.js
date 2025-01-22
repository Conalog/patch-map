import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { changeShow, changeZIndex } from '../change';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  container.config = config;
  return container;
};

export const updateGroup = (element, config) => {
  changeShow(element, config);
  changeZIndex(element, config);
  element.config = deepMerge(element.config, config);
};
