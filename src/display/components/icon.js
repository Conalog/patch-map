import { Sprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getTexture } from '../../assets/textures/texture';
import { validate } from '../../utils/vaildator';
import {
  changePlacement,
  changeRenderOrder,
  changeShow,
  changeSize,
  changeTexture,
  changeTint,
} from '../change';
import { updateObject } from '../update-object';

const iconSchema = z.object({
  asset: z.string(),
  label: z.nullable(z.string()).default(null),
});

export const iconComponent = (opts) => {
  const options = validate(opts, iconSchema);
  if (isValidationError(options)) throw options;

  const asset = getTexture(`icons-${options.asset}`);
  if (!asset) return;

  const component = new Sprite(asset);
  component.type = 'icon';
  component.label = options.label;
  component.config = {};
  return component;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  {
    keys: ['asset'],
    handler: (component, options) => {
      changeTexture(component, options);
    },
  },
  {
    keys: ['size'],
    handler: (component, options) => {
      changeSize(component, options);
      changePlacement(component, {});
    },
  },
  { keys: ['tint'], handler: changeTint },
  { keys: ['placement', 'margin'], handler: changePlacement },
  { keys: ['renderOrder'], handler: changeRenderOrder },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateIconComponent = (component, options) => {
  updateObject(component, options, pipeline, pipelineKeys);
};
