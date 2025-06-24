import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/validator';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import { elementPipeline } from '../change/pipeline/element';
import { Item } from '../data-schema/element-schema';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createItem = (config) => {
  const element = createContainer(config);
  element.position.set(config.x, config.y);
  element.size = { width: config.width, height: config.height };
  element.config = {
    ...element.config,
    position: { x: config.x, y: config.y },
    size: element.size,
  };
  return element;
};

const pipelineKeys = ['show', 'position', 'components'];
export const updateItem = (element, changes, options) => {
  const validated = validate(changes, deepPartial(Item));
  if (isValidationError(validated)) throw validated;
  updateObject(element, validated, elementPipeline, pipelineKeys, options);
};
