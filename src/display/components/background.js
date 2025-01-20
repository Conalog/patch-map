import { NineSliceSprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getAsset } from '../../assets/utils';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
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
  component.config = {};
  component.position.set(-texture.metadata.borderWidth / 2);
  return component;
};

const updateBackgroundSchema = z
  .object({
    show: z.boolean(),
    zIndex: z.number(),
    texture: z.string(),
    color: z.string(),
  })
  .partial();

export const updateBackgroundComponent = (component, opts) => {
  if (!component) return;
  const options = validate(opts, updateBackgroundSchema);
  if (isValidationError(options)) return;

  changeShow(component, options);
  changeZIndex(component, options);
  changeTexture(component, {
    texture: options.texture && `frames-${options.texture}`,
  });
  if (options.texture) {
    changeTransform(component);
  }
  changeColor(component, options);
  component.config = deepMerge(component.config, options);
};

export const changeTransform = (component) => {
  const borderWidth = component.texture.metadata.borderWidth;
  const parentSize = component.parent.config.size;
  component.setSize(
    parentSize.width + borderWidth,
    parentSize.height + borderWidth,
  );
  component.position.set(-borderWidth / 2);
};
