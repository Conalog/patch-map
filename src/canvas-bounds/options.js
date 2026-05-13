/**
 * @typedef {object} CanvasBounds
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} right
 * @property {number} bottom
 */

const BOUNDS_KEYS = ['x', 'y', 'width', 'height'];
const DEFAULT_AUTO_BOUNDS = Object.freeze({
  x: 0,
  y: 0,
  width: 5000,
  height: 3000,
});
const MIN_AUTO_BOUNDS = Object.freeze({
  width: 5000,
  height: 3000,
});

export const normalizeCanvasBounds = (bounds, options = {}) => {
  if (bounds == null) return null;
  if (typeof bounds !== 'object' || Array.isArray(bounds)) {
    throw new TypeError('canvas.bounds must be an object.');
  }

  const contentBounds = normalizeContentBounds(options.contentBounds);
  const width = normalizeCanvasBoundsSize({
    bounds,
    key: 'width',
    contentSize: contentBounds?.width,
    fallback: DEFAULT_AUTO_BOUNDS.width,
  });
  const height = normalizeCanvasBoundsSize({
    bounds,
    key: 'height',
    contentSize: contentBounds?.height,
    fallback: DEFAULT_AUTO_BOUNDS.height,
  });
  const normalized = { width, height };

  normalized.x = normalizeCanvasBoundsPosition({
    bounds,
    key: 'x',
    contentPosition: contentBounds?.x,
    contentSize: contentBounds?.width,
    size: width,
    fallback: DEFAULT_AUTO_BOUNDS.x,
  });
  normalized.y = normalizeCanvasBoundsPosition({
    bounds,
    key: 'y',
    contentPosition: contentBounds?.y,
    contentSize: contentBounds?.height,
    size: height,
    fallback: DEFAULT_AUTO_BOUNDS.y,
  });

  const right = normalized.x + normalized.width;
  const bottom = normalized.y + normalized.height;
  if (!Number.isFinite(right)) {
    throw new TypeError('canvas.bounds.right must be a finite number.');
  }
  if (!Number.isFinite(bottom)) {
    throw new TypeError('canvas.bounds.bottom must be a finite number.');
  }

  return Object.freeze({
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
    right,
    bottom,
  });
};

export const hasAutoCanvasBounds = (bounds) =>
  bounds != null &&
  typeof bounds === 'object' &&
  !Array.isArray(bounds) &&
  BOUNDS_KEYS.some((key) => bounds[key] === undefined);

const normalizeCanvasBoundsSize = ({ bounds, key, contentSize, fallback }) => {
  const value = bounds[key];
  if (value === undefined) {
    const autoSize = contentSize
      ? Math.max(contentSize, MIN_AUTO_BOUNDS[key])
      : fallback;
    return normalizePositiveSize(autoSize, key);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`canvas.bounds.${key} must be a finite number.`);
  }
  return normalizePositiveSize(value, key);
};

const normalizePositiveSize = (value, key) => {
  if (value <= 0) {
    throw new TypeError(`canvas.bounds.${key} must be greater than 0.`);
  }
  return value;
};

const normalizeCanvasBoundsPosition = ({
  bounds,
  key,
  contentPosition,
  contentSize,
  size,
  fallback,
}) => {
  const value = bounds[key];
  if (value === undefined) {
    return contentSize
      ? contentPosition + contentSize / 2 - size / 2
      : fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`canvas.bounds.${key} must be a finite number.`);
  }
  return value;
};

const normalizeContentBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return null;

  const normalized = {};
  for (const key of BOUNDS_KEYS) {
    const value =
      bounds[key] ??
      (key === 'x' ? bounds.minX : undefined) ??
      (key === 'y' ? bounds.minY : undefined) ??
      (key === 'width' && Number.isFinite(bounds.maxX - bounds.minX)
        ? bounds.maxX - bounds.minX
        : undefined) ??
      (key === 'height' && Number.isFinite(bounds.maxY - bounds.minY)
        ? bounds.maxY - bounds.minY
        : undefined);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    normalized[key] = value;
  }

  if (normalized.width <= 0 || normalized.height <= 0) return null;
  return normalized;
};
