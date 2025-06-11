import { Graphics } from 'pixi.js';
import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/validator';
import { elementPipeline } from '../change/pipeline/element';
import { deepRelationGroupObject } from '../data-schema/data-schema';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createRelations = (config) => {
  const element = createContainer(config);
  const path = createPath();
  element.addChild(path);
  return element;
};

const pipelineKeys = ['show', 'strokeStyle', 'links'];
export const updateRelations = (element, changes, options) => {
  const validated = validate(changes, deepRelationGroupObject);
  if (isValidationError(validated)) throw validated;
  updateObject(element, changes, elementPipeline, pipelineKeys, options);
};

const createPath = () => {
  const path = new Graphics();
  Object.assign(path, { type: 'path', links: [] });
  return path;
};
