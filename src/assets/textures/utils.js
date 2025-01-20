import { Cache, Graphics } from 'pixi.js';
import { THEME_CONFIG } from '../../config/theme';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { FRAME_CONFIG } from './config';

const RESOLUTION = 5;

export const generateTexture = (app, target = null, opts = {}) => {
  const options = deepMerge({ resolution: RESOLUTION }, opts);
  if (!target) return;
  const texture = app.renderer.generateTexture({
    target,
    resolution: options.resolution,
  });
  return texture;
};

export const createDefaultRect = ({
  fill = THEME_CONFIG.white,
  borderWidth = 0,
  borderColor = THEME_CONFIG.black,
  radius = 0,
}) => {
  const rect = new Graphics();
  if (radius > 0) {
    rect.roundRect(
      0,
      0,
      FRAME_CONFIG.size.width,
      FRAME_CONFIG.size.height,
      radius,
    );
  } else {
    rect.rect(0, 0, FRAME_CONFIG.size.width, FRAME_CONFIG.size.height);
  }
  rect.fill(fill);
  if (borderWidth) {
    rect.stroke({ width: borderWidth, color: borderColor });
  }
  return rect;
};

export const addTexture = (key, name, texture = null) => {
  if (!texture) return;
  Cache.set(`${key}-${name}`, texture);
};
