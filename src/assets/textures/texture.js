import { Cache } from 'pixi.js';
import { getAsset } from '../utils';
import { createRectTexture } from './rect';
import { cacheKey } from './utils';

export const getTexture = (config) => {
  let texture = null;
  if (typeof config === 'string') {
    texture = getAsset(config);
  } else {
    texture = Cache.has(cacheKey(config))
      ? getAsset(cacheKey(config))
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
