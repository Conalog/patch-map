import { elementPipeline } from '../change/element-pipeline';
import { updateObject } from '../update-object';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  return container;
};

const pipelineKeys = ['show', 'position'];
export const updateGroup = (element, options) => {
  updateObject(element, options, elementPipeline, pipelineKeys);
};
