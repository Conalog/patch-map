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

export const normalizeCanvasBounds = (bounds) => {
  if (bounds == null) return null;
  if (typeof bounds !== 'object' || Array.isArray(bounds)) {
    throw new TypeError('canvas.bounds must be an object.');
  }

  const normalized = {};
  for (const key of BOUNDS_KEYS) {
    const value = bounds[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`canvas.bounds.${key} must be a finite number.`);
    }
    normalized[key] = value;
  }

  if (normalized.width <= 0) {
    throw new TypeError('canvas.bounds.width must be greater than 0.');
  }
  if (normalized.height <= 0) {
    throw new TypeError('canvas.bounds.height must be greater than 0.');
  }

  const right = normalized.x + normalized.width;
  const bottom = normalized.y + normalized.height;
  if (!Number.isFinite(right)) {
    throw new TypeError('canvas.bounds.right must be a finite number.');
  }
  if (!Number.isFinite(bottom)) {
    throw new TypeError('canvas.bounds.bottom must be a finite number.');
  }

  return Object.freeze({
    ...normalized,
    right,
    bottom,
  });
};
