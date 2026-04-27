import { Matrix, Point, Rectangle } from 'pixi.js';

const tempMatrix = new Matrix();
const FRAME_BOUNDS_OPTIONS = { useSizeFallback: true };

// A temporary array of points to be reused across calculations, avoiding frequent object allocation.
const tempCorners = [new Point(), new Point(), new Point(), new Point()];

/**
 * Calculates the four corners of a DisplayObject in world space.
 *
 * @param {PIXI.DisplayObject} displayObject - The DisplayObject to measure.
 * @param {{ useSizeFallback?: boolean }} [options]
 * @returns {Array<PIXI.Point>} An array of 4 new Point instances for the world-space corners.
 */
export const getObjectWorldCorners = (displayObject, options = {}) => {
  const corners = tempCorners;
  const localBounds = getObjectLocalBounds(displayObject, options);
  if (localBounds.worldCorners) {
    return localBounds.worldCorners;
  }
  const worldTransform = displayObject.getGlobalTransform(tempMatrix, false);

  // Set the four corners based on the object's original (local) bounds.
  corners[0].set(localBounds.x, localBounds.y);
  corners[1].set(localBounds.x + localBounds.width, localBounds.y);
  corners[2].set(
    localBounds.x + localBounds.width,
    localBounds.y + localBounds.height,
  );
  corners[3].set(localBounds.x, localBounds.y + localBounds.height);

  // Apply the final world transformation to each corner to get its on-screen position.
  worldTransform.apply(corners[0], corners[0]);
  worldTransform.apply(corners[1], corners[1]);
  worldTransform.apply(corners[2], corners[2]);
  worldTransform.apply(corners[3], corners[3]);

  // Return clones to prevent mutation of the globally reused `tempCorners` array.
  return corners.map((point) => point.clone());
};

export const getObjectFrameWorldCorners = (displayObject) =>
  getObjectWorldCorners(displayObject, FRAME_BOUNDS_OPTIONS);

const getObjectLocalBounds = (displayObject, options) => {
  const localBounds = displayObject.getLocalBounds();
  if (hasArea(localBounds)) return localBounds;

  if (options.useSizeFallback) {
    const size = normalizeSize(displayObject?.props?.size);
    if (size) return { x: 0, y: 0, width: size.width, height: size.height };
  }

  const childWorldCorners = displayObject.children?.flatMap((child) =>
    getObjectWorldCorners(child, options),
  );
  if (childWorldCorners?.length > 0) {
    return {
      worldCorners: boundsToCorners(getBoundsFromPoints(childWorldCorners)),
    };
  }

  return localBounds;
};

const hasArea = (bounds) =>
  (bounds?.width ?? 0) > 0 || (bounds?.height ?? 0) > 0;

const normalizeSize = (size) => {
  if (typeof size === 'number') return { width: size, height: size };
  if (
    Number.isFinite(size?.width) &&
    Number.isFinite(size?.height) &&
    (size.width > 0 || size.height > 0)
  ) {
    return size;
  }
  return null;
};

const boundsToCorners = (bounds) => [
  new Point(bounds.x, bounds.y),
  new Point(bounds.x + bounds.width, bounds.y),
  new Point(bounds.x + bounds.width, bounds.y + bounds.height),
  new Point(bounds.x, bounds.y + bounds.height),
];

/**
 * Calculates the four corners of a DisplayObject and transforms them into the local space of the Viewport.
 * This is useful for positioning elements that are children of the Viewport.
 *
 * @param {PIXI.DisplayObject} displayObject - The DisplayObject to measure.
 * @param {PIXI.Viewport} viewport - The Viewport to which the coordinates will be relative.
 * @param {{ useSizeFallback?: boolean }} [options]
 * @returns {Array<PIXI.Point>} An array of 4 new Point instances for the local-space corners relative to the viewport.
 */
export const getObjectLocalCorners = (
  displayObject,
  viewport,
  options = {},
) => {
  if (!displayObject || !viewport) {
    return [];
  }
  return getObjectWorldCorners(displayObject, options).map((point) =>
    viewport.toLocal(point),
  );
};

export const getObjectFrameLocalCorners = (displayObject, viewport) =>
  getObjectLocalCorners(displayObject, viewport, FRAME_BOUNDS_OPTIONS);

/**
 * Calculates the geometric center (centroid) of an array of points.
 *
 * @param {Array<PIXI.Point>} points - An array of points to calculate the centroid from.
 * @returns {{x: number, y: number}} A new Point object representing the centroid.
 */
export const getCentroid = (points) => {
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  return { x: cx, y: cy };
};

/**
 * Calculates the smallest axis-aligned rectangle that encloses a set of points.
 *
 * @param {Array<PIXI.Point>} points - The array of points to enclose.
 * @returns {PIXI.Rectangle} A new Rectangle representing the bounding box.
 */
export const getBoundsFromPoints = (points) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  // Handle the edge case of an empty input array.
  if (minX === Number.POSITIVE_INFINITY) {
    return new Rectangle(0, 0, 0, 0);
  }
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
};

/**
 * Decomposes a PIXI.Matrix into its constituent properties (scale, skew, rotation, position)
 * and applies them to a PIXI.Transform object.
 *
 * @param {PIXI.Transform} transform - The Transform object to store the decomposed results into.
 * @param {PIXI.Matrix} matrix - The Matrix object to decompose.
 * @returns {PIXI.Transform} The resulting Transform object with the applied properties.
 */
export const decomposeTransform = (transform, matrix) => {
  const a = matrix.a;
  const b = matrix.b;
  const c = matrix.c;
  const d = matrix.d;

  transform.position.set(matrix.tx, matrix.ty);

  const skewX = -Math.atan2(-c, d);
  const skewY = Math.atan2(b, a);

  const delta = Math.abs(skewX + skewY);

  // This check differentiates between a pure rotation and a transformation with skew.
  // The epsilon (0.00001) is used to handle floating-point inaccuracies.
  if (delta < 0.00001 || Math.abs(Math.PI - delta) < 0.00001) {
    transform.rotation = skewY;
    transform.skew.set(0, 0);
  } else {
    transform.rotation = 0;
    transform.skew.set(skewX, skewY);
  }
  transform.scale.x = Math.sqrt(a * a + b * b);
  transform.scale.y = Math.sqrt(c * c + d * d);

  return transform;
};
