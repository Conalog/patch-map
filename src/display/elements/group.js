import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { validate } from '../../utils/vaildator';
import { changeShow, changeZIndex } from '../change';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: true });
  container.config = {};
  return container;
};

const updateGroupSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
  })
  .partial();

export const updateGroup = (element, opts) => {
  const config = validate(opts, updateGroupSchema);
  if (isValidationError(config)) throw config;

  changeShow(element, config);
  changeZIndex(element, config);
  element.config = deepMerge(element.config, config);
};
