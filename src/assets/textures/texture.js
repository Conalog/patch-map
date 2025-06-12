import { Assets } from 'pixi.js';
import { createRectTexture } from './rect';
import { cacheKey } from './utils';

export const getTexture = (renderer, theme, config) => {
  let texture = null;
  if (typeof config === 'string') {
    texture = Assets.get(config);
  } else {
    texture = Assets.cache.has(cacheKey(renderer, config))
      ? Assets.cache.get(cacheKey(renderer, config))
      : createTexture(renderer, theme, config);
  }
  return texture;
};

export const createTexture = (renderer, theme, config) => {
  let texture = null;
  switch (config.type) {
    case 'rect':
      texture = createRectTexture(renderer, theme, config);
      break;
  }
  Assets.cache.set(cacheKey(renderer, config), texture);
  return texture;
};
