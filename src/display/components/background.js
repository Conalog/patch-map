import { NineSliceSprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getTexture } from '../../assets/textures/texture';
import { validate } from '../../utils/vaildator';
import { componentPipeline } from '../change/pipeline/component-pipeline';
import { TextureStyle } from '../data-schema/component-schema';
import { updateObject } from '../update/update-object';

const backgroundSchema = z.object({
  texture: z.union([z.string(), TextureStyle]),
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
  if (isValidationError(options)) throw options;

  const texture = getTexture(options.texture);
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

const pipelineKeys = ['show', 'textureTransform', 'tint'];
export const updateBackgroundComponent = (component, options) => {
  updateObject(component, options, componentPipeline, pipelineKeys);
};
