import { NineSliceSprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getAsset } from '../../assets/utils';
import { validate } from '../../utils/vaildator';
import { changeColor, changeTexture } from '../change';
import { changeZIndex } from '../change';
import { changeShow } from '../change';

const backgroundSchema = z.object({
  texture: z.string(),
  label: z.nullable(z.string()).default(null),
  position: z
    .object({
      x: z.number().default(0),
      y: z.number().default(0),
    })
    .default({}),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const backgroundComponent = (opts) => {
  const options = validate(opts, backgroundSchema);
  if (isValidationError(options)) return;

  const texture = getAsset(`frames-${options.texture}`);
  if (!texture) return;

  const component = new NineSliceSprite({
    texture,
    ...texture.metadata.slice,
    width: options.width + texture.metadata.borderWidth,
    height: options.height + texture.metadata.borderWidth,
  });
  component.type = 'background';
  component.label = options.label;
  component.position.set(options.position.x, options.position.y);
  return component;
};

const updateBackgroundSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    texture: z.string(),
    color: z.string(),
    theme: z.record(z.unknown()),
  })
  .partial();

export const updateBackgroundComponent = (component, opts) => {
  if (!component) return;
  const options = validate(opts, updateBackgroundSchema);
  if (isValidationError(options)) return;

  changeShow(component, options);
  changeZIndex(component, options);
  changeTexture(component, { texture: `frames-${options.texture}` });
  changeColor(component, options);
};
