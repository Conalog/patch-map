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
export const updateGroup = (element, changes, options) => {
  const validated = validate(changes, deepGroupObject);
  if (isValidationError(validated)) throw validated;
  updateObject(element, changes, elementPipeline, pipelineKeys, options);
};
