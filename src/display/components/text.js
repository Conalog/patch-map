import { BitmapText } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { validate } from '../../utils/vaildator';
import {
  changeContent,
  changePlacement,
  changeShow,
  changeZIndex,
  chnageTextStyle,
} from '../change';
import { Margin, Placement } from '../data-schema/component-schema';

const textSchema = z.object({
  label: z.nullable(z.string()).default(null),
});

export const textComponent = (opts) => {
  const options = validate(opts, textSchema);
  if (isValidationError(options)) return;

  const component = new BitmapText({
    text: '',
  });
  component.type = 'text';
  component.label = options.label;
  component.config = {};
  return component;
};

const updateTextSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    placement: Placement,
    margin: Margin,
    content: z.string(),
    style: z.record(z.unknown()),
    split: z.number().int(),
  })
  .partial();

export const updateTextComponent = (component, opts) => {
  if (!component) return;
  const options = validate(opts, updateTextSchema);
  if (isValidationError(options)) return;

  changeShow(component, options);
  changeZIndex(component, options);
  changeContent(component, options);
  chnageTextStyle(component, options);
  changePlacement(component, options);
  component.config = deepMerge(component.config, options);
};
