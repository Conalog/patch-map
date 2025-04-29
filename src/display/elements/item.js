import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/vaildator';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import { elementPipeline } from '../change/pipeline/element';
import { singleObject } from '../data-schema/data-schema';
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
export const updateItem = (element, config, options) => {
  const validateConfig = validate(config, deepPartial(singleObject));
  if (isValidationError(validateConfig)) throw validateConfig;
  updateObject(element, config, elementPipeline, pipelineKeys, options);
};
