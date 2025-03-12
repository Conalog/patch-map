import { BitmapText } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/vaildator';
import { componentPipeline } from '../change/component-pipeline';
import { updateObject } from '../update/update-object';

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

const pipelineKeys = ['show', 'text', 'style', 'placement'];
export const updateTextComponent = (component, options) => {
  updateObject(component, options, componentPipeline, pipelineKeys);
};
