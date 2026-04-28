import { getViewport } from '../get';
import { getObjectLocalCorners } from '../transform';
import { sat } from './sat';

export const intersect = (obj1, obj2) => {
  const viewport = getViewport(obj2) ?? getViewport(obj1);
  if (!viewport) return false;

  const points1 = toFlatPoints(getObjectLocalCorners(obj1, viewport));
  return intersectLocalPoints(points1, obj2, viewport);
};

export const intersectLocalPoints = (points1, obj2, viewport) => {
  const points2 = toFlatPoints(getObjectLocalCorners(obj2, viewport));
  if (!boundsIntersect(getFlatBounds(points1), getFlatBounds(points2))) {
    return false;
  }
  return sat(points1, points2);
};

export const toFlatPoints = (points) =>
  points.flatMap((point) => [point.x, point.y]);

export const getFlatBounds = (points) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (minX === Number.POSITIVE_INFINITY) {
    return null;
  }
  return { minX, minY, maxX, maxY };
};

export const boundsContainPoint = (bounds, point) =>
  !bounds ||
  (point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY);

export const boundsIntersect = (left, right) =>
  !left ||
  !right ||
  (left.minX <= right.maxX &&
    left.maxX >= right.minX &&
    left.minY <= right.maxY &&
    left.maxY >= right.minY);
