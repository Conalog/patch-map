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
        getSliceDimension(radius, 'topLeft', 'topRight') + borderWidth ?? 0,
      leftWidth:
        getSliceDimension(radius, 'topLeft', 'bottomLeft') + borderWidth ?? 0,
      rightWidth:
        getSliceDimension(radius, 'topRight', 'bottomRight') + borderWidth ?? 0,
      bottomHeight:
        getSliceDimension(radius, 'bottomLeft', 'bottomRight') + borderWidth ??
        0,
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
  const parsedRadius = EachRadius.safeParse(radius);
  if (typeof radius === 'number' && radius > 0) {
    graphics.roundRect(...xywh, radius);
  } else if (parsedRadius.success) {
    const r = parsedRadius.data;
    graphics.roundShape(
      [
        { x: 0, y: 0, radius: r.topLeft },
        { x: size, y: 0, radius: r.topRight },
        { x: size, y: size, radius: r.bottomRight },
        { x: 0, y: size, radius: r.bottomLeft },
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

const getSliceDimension = (radius, key1, key2) => {
  return typeof radius === 'number'
    ? radius
    : Math.max(radius?.[key1] ?? 0, radius?.[key2] ?? 0);
};
