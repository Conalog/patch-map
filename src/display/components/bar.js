import { NineSliceSprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getTexture } from '../../assets/textures/utils';
import { validate } from '../../utils/vaildator';
import {
  changeColor,
  changePercentSize,
  changePlacement,
  changeShow,
  changeTexture,
} from '../change';
import { Style } from '../data-schema/component-schema';
import { updateObject } from '../update-object';

const barSchema = z.object({
  texture: z.nullable(z.string()).default(null),
  style: Style,
  label: z.nullable(z.string()).default(null),
});

export const barComponent = (opts) => {
  const options = validate(opts, barSchema);
  if (isValidationError(options)) throw options;

  const texture = getTexture(options.texture, options.style);
  if (!texture) return;

  const component = new NineSliceSprite({
    texture,
    ...texture.metadata.slice,
    width: 0,
    height: 0,
  });
  component.type = 'bar';
  component.label = options.label;
  component.config = {};
  return component;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  {
    keys: ['texture', 'style'],
    handler: (component, options) => {
      changeTexture(component, options);
    },
  },
  { keys: ['color'], handler: changeColor },
  {
    keys: ['percentWidth', 'percentHeight', 'margin'],
    handler: (component, options) => {
      changePercentSize(component, options);
      changePlacement(component, {});
    },
  },
  { keys: ['placement', 'margin'], handler: changePlacement },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));
const exceptionKeys = new Set(['animation', 'animationDuration']);

export const updateBarComponent = (component, options) => {
  updateObject(component, options, pipeline, pipelineKeys, exceptionKeys);
};
