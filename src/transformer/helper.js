import { Point, Rectangle } from 'pixi.js';

// A temporary array of points to be reused in calculations, avoiding frequent object allocation.
const tempCorners = [new Point(), new Point(), new Point(), new Point()];

/**
 * Helper function: Calculates the final world-space coordinates of an object's four corners.
 *
 * @param {PIXI.DisplayObject} displayObject - The target object for which to calculate the world corners.
 * @returns {Array<PIXI.Point>} An array of 4 new Point instances representing the corner coordinates in world space.
 */
export const getObjectWorldCorners = (displayObject) => {
  const corners = tempCorners;
  const localBounds = displayObject.getLocalBounds();
  const worldTransform = displayObject.worldTransform;

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

  // Return clones to prevent mutation of the temporary `tempCorners` array.
  return corners.map((point) => point.clone());
};

/**
 * Helper function: Calculates the geometric center (centroid) of an array of four points.
 *
 * @param {Array<PIXI.Point>} points - The array of 4 points for which to calculate the centroid.
 * @returns {{x: number, y: number}} An object containing the x and y coordinates of the centroid.
 */
export const getCentroid = (points) => {
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  return { x: cx, y: cy };
};

/**
 * Helper function: Calculates the smallest axis-aligned rectangle that encloses all given points.
 *
 * @param {Array<PIXI.Point>} points - The array of points to enclose within the bounds.
 * @returns {PIXI.Rectangle} The smallest axis-aligned rectangle that contains all the points.
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

  // Handle cases where there are no points, returning an empty rectangle.
  if (minX === Number.POSITIVE_INFINITY) {
    return new Rectangle(0, 0, 0, 0);
  }

  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
};
