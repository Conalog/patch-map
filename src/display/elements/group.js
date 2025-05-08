import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/validator';
import { elementPipeline } from '../change/pipeline/element';
import { deepGroupObject } from '../data-schema/data-schema';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  return container;
};

const pipelineKeys = ['show', 'position'];
export const updateGroup = (element, config, options) => {
  const validateConfig = validate(config, deepGroupObject);
  if (isValidationError(validateConfig)) throw validateConfig;
  updateObject(element, config, elementPipeline, pipelineKeys, options);
};
