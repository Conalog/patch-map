import { Graphics } from 'pixi.js';
import { changeLinks, changeShow, changeStrokeStyle } from '../change';
import { updateObject } from '../update-object';
import { createContainer } from '../utils';

export const createRelations = (config) => {
  const element = createContainer(config);
  const path = createPath();
  element.addChild(path);
  element.config = {};
  return element;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  { keys: ['strokeStyle'], handler: changeStrokeStyle },
  { keys: ['links'], handler: changeLinks },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateRelations = (element, options) => {
  updateObject(element, options, pipeline, pipelineKeys);
};

const createPath = () => {
  const path = new Graphics();
  Object.assign(path, { type: 'path', links: [] });
  return path;
};
