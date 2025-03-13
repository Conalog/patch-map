import { elementPipeline } from '../change/pipeline/element';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  return container;
};

const pipelineKeys = ['show', 'position'];
export const updateGroup = (element, config, options) => {
  updateObject(element, config, elementPipeline, pipelineKeys, options);
};
