import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { validate } from '../../utils/vaildator';
import { changeZIndex } from '../change';
import { changeShow } from '../change';
import { componentArraySchema } from '../data-schema/component-schema';
import { upateComponents } from '../update-components';
import { createContainer } from '../utils';

export const createItem = (config) => {
  const element = createContainer(config);
  element.position.set(config.position.x, config.position.y);
  element.angle = config.rotation ?? 0;
  element.size = config.size;
  element.config = {};
  return element;
};

const updateItemSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    components: componentArraySchema,
  })
  .partial();

export const updateItem = (element, opts) => {
  const config = validate(opts, updateItemSchema);
  if (isValidationError(config)) throw config;

  changeShow(element, config);
  changeZIndex(element, config);
  upateComponents(element, config);
  element.config = deepMerge(element.config, config);
};
