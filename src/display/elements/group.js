import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/validator';
import { deepPartial } from '../../utils/zod-deep-strict-partial';
import { elementPipeline } from '../change/pipeline/element';
import { Group } from '../data-schema/element-schema';
import { updateObject } from '../update/update-object';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  return container;
};

const pipelineKeys = ['show', 'position'];
export const updateGroup = (element, changes, options) => {
  const validated = validate(changes, deepPartial(Group));
  if (isValidationError(validated)) throw validated;
  updateObject(element, validated, elementPipeline, pipelineKeys, options);
};
