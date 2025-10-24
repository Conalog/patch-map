import { Graphics } from 'pixi.js';
import { EachRadius } from '../../display/data-schema/primitive-schema';
import { getColor } from '../../utils/get';
import { cacheKey, generateTexture } from './utils';

export const createRectTexture = (renderer, theme, rectOpts) => {
  const {
    fill = null,
    borderWidth = null,
    borderColor = null,
    radius = null,
  } = rectOpts;
  const rect = createRect(theme, { fill, borderWidth, borderColor, radius });
  const texture = generateTexture(rect, renderer);

  texture.id = cacheKey(renderer, rectOpts);
  texture.metadata = {
    slice: {
      topHeight:
        typeof radius === 'number'
          ? radius
          : Math.max(radius?.topLeft, radius?.topRight),
      leftWidth:
        typeof radius === 'number'
          ? radius
          : Math.max(radius?.topLeft, radius?.bottomLeft),
      rightWidth:
        typeof radius === 'number'
          ? radius
          : Math.max(radius?.topRight, radius?.bottomRight),
      bottomHeight:
        typeof radius === 'number'
          ? radius
          : Math.max(radius?.bottomRight, radius?.bottomLeft),
    },
    borderWidth: borderWidth,
    config: { ...rectOpts },
  };
  return texture;
};

const createRect = (theme, { fill, borderWidth, borderColor, radius }) => {
  const graphics = new Graphics();
  const size = 20 + borderWidth;

  const xywh = [0, 0, size, size];
  if (typeof radius === 'number' && radius > 0) {
    graphics.roundRect(...xywh, radius);
  } else if (EachRadius.safeParse(radius).success) {
    graphics.roundShape(
      [
        { x: 0, y: 0, radius: radius.topLeft },
        { x: size, y: 0, radius: radius.topRight },
        { x: size, y: size, radius: radius.bottomRight },
        { x: 0, y: size, radius: radius.bottomLeft },
      ],
      0,
    );
  } else {
    graphics.rect(...xywh);
  }

  if (fill) graphics.fill(getColor(theme, fill));
  if (borderWidth) {
    graphics.stroke({
      width: borderWidth,
      color: getColor(theme, borderColor),
    });
  }
  return graphics;
};
