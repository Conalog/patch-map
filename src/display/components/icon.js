import { Sprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getAsset } from '../../assets/utils';
import { validate } from '../../utils/vaildator';
import {
  changeColor,
  changePlacement,
  changeShow,
  changeTexture,
  changeZIndex,
} from '../change';
import { Placement } from '../layout-schema';

const iconSchema = z.object({
  texture: z.string(),
  label: z.nullable(z.string()).default(null),
  size: z.number().nonnegative(),
});

export const iconComponent = (opts) => {
  const options = validate(opts, iconSchema);
  if (isValidationError(options)) return;

  const texture = getAsset(`icons-${options.texture}`);
  if (!texture) return;

  const component = new Sprite(texture);
  component.type = 'icon';
  component.label = options.label;
  component.setSize(options.size);
  return component;
};

const updateIconSchema = z
  .object({
    show: z.boolean(),
    texture: z.string(),
    color: z.string(),
    theme: z.record(z.unknown()),
    zIndex: z.number(),
    placement: Placement,
  })
  .partial();

export const updateIconComponent = (component, opts = {}) => {
  if (!component) return;
  const options = validate(opts, updateIconSchema);
  if (isValidationError(options)) return;

  changeShow(component, options);
  changeTexture(component, { texture: `icons-${options.texture}` });
  changeColor(component, options);
  changeZIndex(component, options);
  changePlacement(component, options);
};
