import { intersectPoint } from './intersect-point';

/**
 * Calculates the smallest t (0 to 1) along the segment (p1, p2) where it first enters the object.
 * Returns 0 if p1 is already inside the object.
 * Returns null if the segment does not intersect the object.
 *
 * @param {PIXI.DisplayObject} obj - The object to check.
 * @param {PIXI.Point} p1 - The start point of the segment.
 * @param {PIXI.Point} p2 - The end point of the segment.
 * @param {PIXI.Point[]} corners - The corners of the object in the same coordinate space as p1 and p2.
 * @returns {number|null} The minimum t value (0 to 1) or null.
 */
export const getSegmentEntryT = (obj, p1, p2, corners) => {
  if (intersectPoint(obj, p1)) {
    return 0;
  }

  let minT = 1.1;

  for (let i = 0; i < corners.length; i++) {
    const v1 = corners[i];
    const v2 = corners[(i + 1) % corners.length];

    const t = intersectSegments(p1.x, p1.y, p2.x, p2.y, v1.x, v1.y, v2.x, v2.y);
    if (t !== null && t < minT) {
      minT = t;
    }
  }

  return minT > 1 ? null : minT;
};

/**
 * Calculates the intersection t of two line segments.
 *
 * @private
 */
function intersectSegments(x1, y1, x2, y2, x3, y3, x4, y4) {
  const dx12 = x2 - x1;
  const dy12 = y2 - y1;
  const dx34 = x4 - x3;
  const dy34 = y4 - y3;
  const denominator = dy34 * dx12 - dx34 * dy12;

  if (denominator === 0) {
    return null;
  }

  const dx13 = x1 - x3;
  const dy13 = y1 - y3;
  const t = (dx34 * dy13 - dy34 * dx13) / denominator;
  const u = (dx12 * dy13 - dy12 * dx13) / denominator;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return t;
  }
  return null;
}
