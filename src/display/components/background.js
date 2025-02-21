import { NineSliceSprite } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { getTexture } from '../../assets/textures/utils';
import { validate } from '../../utils/vaildator';
import { changeColor, changeTexture } from '../change';
import { changeShow } from '../change';
import { Style } from '../data-schema/component-schema';
import { updateObject } from '../update-object';

const backgroundSchema = z.object({
  texture: z.nullable(z.string()).default(null),
  style: Style,
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

  const texture = getTexture(options.texture, options.style);
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

const pipeline = [
  { keys: ['show'], handler: changeShow },
  {
    keys: ['texture', 'style'],
    handler: (component, options) => {
      changeTexture(component, options);
      changeTransform(component);
    },
  },
  { keys: ['color'], handler: changeColor },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateBackgroundComponent = (component, options) => {
  updateObject(component, options, pipeline, pipelineKeys);
};

export const changeTransform = (component) => {
  const borderWidth = component.texture.metadata.borderWidth;
  const parentSize = component.parent.size;
  component.setSize(
    parentSize.width + borderWidth,
    parentSize.height + borderWidth,
  );
  component.position.set(-borderWidth / 2);
};
