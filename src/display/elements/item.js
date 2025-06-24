import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/validator';
import { elementPipeline } from '../change/pipeline/element';
import { deepSingleObject } from '../data-schema/element-schema';
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
export const updateItem = (element, changes, options) => {
  const validated = validate(changes, deepSingleObject);
  if (isValidationError(validated)) throw validated;
  updateObject(element, changes, elementPipeline, pipelineKeys, options);
};
