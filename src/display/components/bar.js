import { NineSliceSprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getAsset } from '../../assets/utils';
import { validate } from '../../utils/vaildator';
import {
  changeColor,
  changePercentSize,
  changePlacement,
  changeShow,
  changeTexture,
  changeZIndex,
} from '../change';
import { Margin, Placement } from '../layout-schema';

const barSchema = z.object({
  texture: z.string(),
  label: z.nullable(z.string()).default(null),
});

export const barComponent = (opts) => {
  const options = validate(opts, barSchema);
  if (isValidationError(options)) return;

  const texture = getAsset(`bars-${options.texture}`);
  if (!texture) return;

  const component = new NineSliceSprite({
    texture,
    ...texture.metadata.slice,
    width: 0,
    height: 0,
  });
  component.type = 'bar';
  component.label = options.label;
  return component;
};

const updateBarSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    texture: z.string(),
    color: z.string(),
    theme: z.record(z.unknown()),
    placement: Placement,
    margin: Margin,
    percentWidth: z.number().min(0).max(1),
    percentHeight: z.number().min(0).max(1),
  })
  .partial();

export const updateBarComponent = (component, opts) => {
  if (!component) return;
  const options = validate(opts, updateBarSchema);
  if (isValidationError(options)) return;

  changeShow(component, options);
  changeZIndex(component, options);
  changeTexture(component, { texture: `bars-${options.texture}` });
  changeColor(component, options);
  changePercentSize(component, options);
  changePlacement(component, options);
};
