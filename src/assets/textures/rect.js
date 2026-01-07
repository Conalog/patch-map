import { Rect } from '../../display/elements/Rect';
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
        getSliceDimension(radius, 'topLeft', 'topRight') + (borderWidth ?? 0),
      leftWidth:
        getSliceDimension(radius, 'topLeft', 'bottomLeft') + (borderWidth ?? 0),
      rightWidth:
        getSliceDimension(radius, 'topRight', 'bottomRight') +
        (borderWidth ?? 0),
      bottomHeight:
        getSliceDimension(radius, 'bottomLeft', 'bottomRight') +
        (borderWidth ?? 0),
    },
    borderWidth: borderWidth,
    config: { ...rectOpts },
  };
  return texture;
};

const createRect = (theme, { fill, borderWidth, borderColor, radius }) => {
  const safeBorderWidth = borderWidth ?? 0;
  const size = 20 + safeBorderWidth;
  const stroke =
    safeBorderWidth > 0
      ? { width: safeBorderWidth, color: borderColor }
      : undefined;
  const rect = new Rect({ theme });
  rect.apply({
    size: { width: size, height: size },
    fill,
    stroke,
    radius,
  });
  return rect;
};

const getSliceDimension = (radius, key1, key2) => {
  return typeof radius === 'number'
    ? radius
    : Math.max(radius?.[key1] ?? 0, radius?.[key2] ?? 0);
};
