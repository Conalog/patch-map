import { BitmapText } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { validate } from '../../utils/vaildator';
import {
  changeContent,
  changePlacement,
  changeShow,
  changeZIndex,
  chnageTextStyle,
} from '../change';
import { Margin, Placement } from '../layout-schema';

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
  return component;
};

const updateTextSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    theme: z.record(z.unknown()),
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
  chnageTextStyle(component, options);
  changeContent(component, options);
  changePlacement(component, options);
};
