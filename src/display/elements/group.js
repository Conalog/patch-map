import { changeShow } from '../change';
import { updateObject } from '../update-object';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  container.config = {};
  return container;
};

const pipeline = [{ keys: ['show'], handler: changeShow }];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateGroup = (element, options) => {
  updateObject(element, options, pipeline, pipelineKeys);
};
