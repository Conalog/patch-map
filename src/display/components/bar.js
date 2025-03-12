import { NineSliceSprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getTexture } from '../../assets/textures/texture';
import { validate } from '../../utils/vaildator';
import { componentPipeline } from '../change/component-pipeline';
import { TextureStyle } from '../data-schema/component-schema';
import { updateObject } from '../update-object';

const barSchema = z.object({
  texture: z.union([z.string(), TextureStyle]),
  label: z.nullable(z.string()).default(null),
});

export const barComponent = (opts) => {
  const options = validate(opts, barSchema);
  if (isValidationError(options)) throw options;

  const texture = getTexture(options.texture);
  if (!texture) return;

  const component = new NineSliceSprite({
    texture,
    ...texture.metadata.slice,
    width: 0,
    height: 0,
  });
  component.type = 'bar';
  component.label = options.label;
  component.config = {};
  return component;
};

const pipelineKeys = ['show', 'texture', 'tint', 'percentSize', 'placement'];
export const updateBarComponent = (component, options) => {
  updateObject(component, options, componentPipeline, pipelineKeys);
};
