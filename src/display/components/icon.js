import { Sprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getAsset } from '../../assets/utils';
import { validate } from '../../utils/vaildator';
import {
  changeColor,
  changePlacement,
  changeShow,
  changeSize,
  changeTexture,
} from '../change';
import {} from '../data-schema/component-schema';
import { updateObject } from '../update-object';

const iconSchema = z.object({
  texture: z.string(),
  label: z.nullable(z.string()).default(null),
});

export const iconComponent = (opts) => {
  const options = validate(opts, iconSchema);
  if (isValidationError(options)) throw options;

  const texture = getAsset(`icons-${options.texture}`);
  if (!texture) return;

  const component = new Sprite(texture);
  component.type = 'icon';
  component.label = options.label;
  component.config = {};
  return component;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  {
    keys: ['texture'],
    handler: (component, options) => {
      changeTexture(component, { texture: `icons-${options.texture}` });
    },
  },
  {
    keys: ['size'],
    handler: (component, options) => {
      changeSize(component, options);
      changePlacement(component, {});
    },
  },
  { keys: ['color'], handler: changeColor },
  { keys: ['placement', 'margin'], handler: changePlacement },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateIconComponent = (component, options) => {
  updateObject(component, options, pipeline, pipelineKeys);
};
