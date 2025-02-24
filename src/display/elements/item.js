import { changeShow } from '../change';
import { updateComponents } from '../components/update-components';
import { updateObject } from '../update-object';
import { createContainer } from '../utils';

export const createItem = (config) => {
  const element = createContainer(config);
  element.position.set(config.position.x, config.position.y);
  element.angle = config.rotation ?? 0;
  element.size = config.size;
  element.config = {};
  return element;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  { keys: ['components'], handler: updateComponents },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateItem = (element, options) => {
  updateObject(element, options, pipeline, pipelineKeys);
};
