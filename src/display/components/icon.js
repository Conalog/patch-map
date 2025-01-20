import { Sprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getAsset } from '../../assets/utils';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { validate } from '../../utils/vaildator';
import {
  changeColor,
  changePlacement,
  changeShow,
  changeSize,
  changeTexture,
  changeZIndex,
} from '../change';
import { Margin, Placement } from '../layout-schema';

const iconSchema = z.object({
  texture: z.string(),
  label: z.nullable(z.string()).default(null),
});

export const iconComponent = (opts) => {
  const options = validate(opts, iconSchema);
  if (isValidationError(options)) return;

  const texture = getAsset(`icons-${options.texture}`);
  if (!texture) return;

  const component = new Sprite(texture);
  component.type = 'icon';
  component.label = options.label;
  component.config = {};
  return component;
};

const updateIconSchema = z
  .object({
    show: z.boolean(),
    texture: z.string(),
    color: z.string(),
    zIndex: z.number(),
    placement: Placement,
    margin: Margin,
    size: z.number().nonnegative(),
  })
  .partial();

export const updateIconComponent = (component, opts = {}) => {
  if (!component) return;
  const options = validate(opts, updateIconSchema);
  if (isValidationError(options)) return;

  changeShow(component, options);
  changeTexture(component, {
    texture: options.texture && `icons-${options.texture}`,
  });
  changeSize(component, options);
  changeColor(component, options);
  changeZIndex(component, options);
  changePlacement(component, options);
  component.config = deepMerge(component.config, options);
};
