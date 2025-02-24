import { Assets, Cache } from 'pixi.js';
import { createRectTexture } from './rect';
import { cacheKey } from './utils';

export const getTexture = (config) => {
  let texture = null;
  if (typeof config === 'string') {
    texture = Assets.get(config);
  } else {
    texture = Cache.has(cacheKey(config))
      ? Assets.get(cacheKey(config))
      : createTexture(config);
  }
  return texture;
};

export const createTexture = (config) => {
  let texture = null;
  switch (config.type) {
    case 'rect':
      texture = createRectTexture(config);
      break;
  }
  Cache.set(cacheKey(config), texture);
  return texture;
};
