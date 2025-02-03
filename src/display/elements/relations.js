import { Graphics } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { validate } from '../../utils/vaildator';
import {
  changeLineStyle,
  changeLinks,
  changeShow,
  changeZIndex,
} from '../change';
import { relation } from '../data-schema/data-schema';
import { createContainer } from '../utils';

const relationSchema = z.object({
  type: z.literal('relations'),
  id: z.string(),
  label: z.nullable(z.string()),
  metadata: z.record(z.unknown()),
  viewport: z.unknown(),
});

export const createRelations = (opts) => {
  const config = validate(opts, relationSchema);
  if (isValidationError(config)) throw config;

  const element = createContainer(config);
  const path = createPath(config);
  element.addChild(path);
  element.config = {};
  return element;
};

const updateRelationSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    lineStyle: z.record(z.unknown()),
    links: z.array(relation),
  })
  .partial();

export const updateRelations = (element, opts) => {
  const config = validate(opts, updateRelationSchema);
  if (isValidationError(config)) throw config;

  changeShow(element, config);
  changeZIndex(element, config);
  changeLineStyle(element, config);
  changeLinks(element, config);
  element.config = deepMerge(element.config, config);
};

const createPath = ({ id, label }) => {
  const path = new Graphics();
  Object.assign(path, { type: 'path', id, label, links: [] });
  return path;
};
