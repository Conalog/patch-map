import { elementPipeline } from '../change/pipeline/element-pipeline';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  return container;
};

const pipelineKeys = ['show', 'position'];
export const updateGroup = (element, options) => {
  updateObject(element, options, elementPipeline, pipelineKeys);
};
