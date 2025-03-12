import { Graphics } from 'pixi.js';
import { elementPipeline } from '../change/pipeline/element-pipeline';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createRelations = (config) => {
  const element = createContainer(config);
  const path = createPath();
  element.addChild(path);
  return element;
};

const pipelineKeys = ['show', 'strokeStyle', 'links'];
export const updateRelations = (element, options) => {
  updateObject(element, options, elementPipeline, pipelineKeys);
};

const createPath = () => {
  const path = new Graphics();
  Object.assign(path, { type: 'path', links: [] });
  return path;
};
