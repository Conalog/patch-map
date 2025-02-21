import { Cache } from 'pixi.js';
import { getAsset } from '../utils';
import { createRectTexture } from './rect';

export const getTexture = (textureId, style) => {
  let texture = null;
  if (textureId) {
    texture = getAsset(textureId);
  } else {
    texture = getAsset(Object.values(style).join('.'));
    texture ??= createTexture(style);
  }
  return texture;
};

export const createTexture = (style) => {
  let texture = null;
  switch (style.type) {
    case 'rect':
      texture = createRectTexture({ ...style });
      break;
  }
  Cache.set(Object.values(style).join('.'), texture);
  return texture;
};
