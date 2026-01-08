import { Rect } from '../../display/elements/Rect';
import { cacheKey, generateTexture } from './utils';

const DEFAULT_RECT_OPTS = {
  fill: 'transparent',
  borderWidth: 0,
  borderColor: 'black',
  radius: 0,
};

const normalizeRectOpts = (rectOpts = {}) => {
  const normalized = { ...rectOpts };
  for (const key of ['fill', 'borderWidth', 'borderColor', 'radius']) {
    if (normalized[key] == null) delete normalized[key];
  }
  return normalized;
};

export const createRectTexture = (renderer, theme, rectOpts) => {
  const normalizedRectOpts = normalizeRectOpts(rectOpts);
  const {
    fill = DEFAULT_RECT_OPTS.fill,
    borderWidth = DEFAULT_RECT_OPTS.borderWidth,
    borderColor = DEFAULT_RECT_OPTS.borderColor,
    radius = DEFAULT_RECT_OPTS.radius,
  } = normalizedRectOpts;
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
  const changes = { size: { width: size, height: size } };
  if (fill !== undefined) changes.fill = fill;
  if (stroke !== undefined) changes.stroke = stroke;
  if (radius !== undefined) changes.radius = radius;
  rect.apply(changes);
  return rect;
};

const getSliceDimension = (radius, key1, key2) => {
  return typeof radius === 'number'
    ? radius
    : Math.max(radius?.[key1] ?? 0, radius?.[key2] ?? 0);
};
