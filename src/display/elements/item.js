import { elementPipeline } from '../change/pipeline/element-pipeline';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createItem = (config) => {
  const element = createContainer(config);
  element.position.set(config.position.x, config.position.y);
  element.size = config.size;
  element.config = {
    ...element.config,
    position: config.position,
    size: config.size,
  };
  return element;
};

const pipelineKeys = ['show', 'position', 'components'];
export const updateItem = (element, options) => {
  updateObject(element, options, elementPipeline, pipelineKeys);
};
