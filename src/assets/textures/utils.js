import { TextureStyle } from '../../display/data-schema/component-schema';
import { deepMerge } from '../../utils/deepmerge/deepmerge';

const RESOLUTION = 5;

export const generateTexture = (target, renderer, opts = {}) => {
  const options = deepMerge({ resolution: RESOLUTION }, opts);
  if (!target) return;

  const texture = renderer.generateTexture({
    target,
    resolution: options.resolution,
  });
  return texture;
};

export const cacheKey = (renderer, config) => {
  return [
    renderer.uid,
    ...TextureStyle.keyof().options.map((key) => config[key]),
  ].join('-');
};
