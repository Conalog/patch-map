import { Cache } from 'pixi.js';
import { getAsset } from '../utils';
import { createRectTexture } from './rect';

export const getTexture = (config) => {
  let texture = null;
  if (typeof config === 'string') {
    texture = getAsset(config);
  } else {
    texture = getAsset(Object.values(config).join('.'));
    texture ??= createTexture(config);
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
  Cache.set(Object.values(config).join('.'), texture);
  return texture;
};
