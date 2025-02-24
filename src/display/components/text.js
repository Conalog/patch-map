import { BitmapText } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/vaildator';
import {
  changePlacement,
  changeRenderOrder,
  changeShow,
  changeText,
  changeTextStyle,
} from '../change';
import { updateObject } from '../update-object';

const textSchema = z.object({
  label: z.nullable(z.string()).default(null),
});

export const textComponent = (opts) => {
  const options = validate(opts, textSchema);
  if (isValidationError(options)) throw options;

  const component = new BitmapText({
    text: '',
  });
  component.type = 'text';
  component.label = options.label;
  component.config = {};
  return component;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  { keys: ['text', 'split'], handler: changeText },
  { keys: ['style', 'margin'], handler: changeTextStyle },
  { keys: ['placement', 'margin'], handler: changePlacement },
  { keys: ['renderOrder'], handler: changeRenderOrder },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateTextComponent = (component, options) => {
  updateObject(component, options, pipeline, pipelineKeys);
};
