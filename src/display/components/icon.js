import { Sprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getTexture } from '../../assets/textures/texture';
import { validate } from '../../utils/vaildator';
import { componentPipeline } from '../change/pipeline/component';
import { updateObject } from '../update/update-object';

const iconSchema = z.object({
  asset: z.string(),
  label: z.nullable(z.string()).default(null),
});

export const iconComponent = (opts) => {
  const options = validate(opts, iconSchema);
  if (isValidationError(options)) throw options;

  const asset = getTexture(`icons-${options.asset}`);
  if (!asset) return;

  const component = new Sprite(asset);
  component.type = 'icon';
  component.label = options.label;
  component.config = {};
  return component;
};

const pipelineKeys = ['show', 'texture', 'size', 'tint', 'placement'];
export const updateIconComponent = (component, options) => {
  updateObject(component, options, componentPipeline, pipelineKeys);
};
