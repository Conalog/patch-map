import { Assets } from 'pixi.js';
import { createRectTexture } from './rect';
import { cacheKey } from './utils';

export const getTexture = (renderer, config) => {
  let texture = null;
  if (typeof config === 'string') {
    texture = Assets.get(config);
  } else {
    texture = Assets.cache.has(cacheKey(renderer, config))
      ? Assets.cache.get(cacheKey(renderer, config))
      : createTexture(renderer, config);
  }
  return texture;
};

export const createTexture = (renderer, config) => {
  let texture = null;
  switch (config.type) {
    case 'rect':
      texture = createRectTexture(renderer, config);
      break;
  }
  Assets.cache.set(cacheKey(renderer, config), texture);
  return texture;
};
