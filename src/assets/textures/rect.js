import { Graphics } from 'pixi.js';
import { getTheme } from '../../theme';
import { getColor } from '../../utils/get';
import { generateTexture } from './generate-texture';

export const createRectTexture = (rectOpts) => {
  const {
    fill = null,
    borderWidth = null,
    borderColor = null,
    radius = null,
  } = rectOpts;
  const rect = createRect({ fill, borderWidth, borderColor, radius });
  const texture = generateTexture(rect);

  texture.id = [fill, borderWidth, borderColor, radius].join('.');
  texture.metadata = {
    slice: {
      topHeight: borderWidth + 4,
      leftWidth: borderWidth + 4,
      rightWidth: borderWidth + 4,
      bottomHeight: borderWidth + 4,
    },
    borderWidth: borderWidth,
    config: { ...rectOpts },
  };
  return texture;
};

const createRect = ({ fill, borderWidth, borderColor, radius }) => {
  const graphics = new Graphics();
  const size = 20 + borderWidth;

  const xywh = [0, 0, size, size];
  if (radius > 0) {
    graphics.roundRect(...xywh, radius);
  } else {
    graphics.rect(...xywh);
  }

  if (fill) graphics.fill(getColor(fill, getTheme()));
  if (borderWidth) {
    graphics.stroke({
      width: borderWidth,
      color: getColor(borderColor, getTheme()),
    });
  }
  return graphics;
};
