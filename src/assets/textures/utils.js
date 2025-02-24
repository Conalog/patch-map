import { TextureStyle } from '../../display/data-schema/component-schema';
import { renderer } from '../../renderer';
import { deepMerge } from '../../utils/deepmerge/deepmerge';

const RESOLUTION = 5;

export const generateTexture = (target = null, opts = {}) => {
  const options = deepMerge({ resolution: RESOLUTION }, opts);
  if (!target) return;

  const texture = renderer.generateTexture({
    target,
    resolution: options.resolution,
  });
  return texture;
};

export const cacheKey = (config) => {
  return TextureStyle.keyof()
    .options.map((key) => config[key])
    .join('-');
};
