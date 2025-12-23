import { getViewport } from '../get';
import { getObjectLocalCorners } from '../transform';
import { sat } from './sat';

export const intersect = (obj1, obj2) => {
  const viewport = getViewport(obj2) ?? getViewport(obj1);
  if (!viewport) return false;

  const points1 = getObjectLocalCorners(obj1, viewport).flatMap((point) => [
    point.x,
    point.y,
  ]);
  const points2 = getObjectLocalCorners(obj2, viewport).flatMap((point) => [
    point.x,
    point.y,
  ]);

  return sat(points1, points2);
};

export const intersectSegment = (segment, obj) => {
  const viewport = getViewport(obj);
  if (!viewport) return false;

  const points1 = segment.flatMap((p) => [p.x, p.y]);
  const points2 = getObjectLocalCorners(obj, viewport).flatMap((p) => [
    p.x,
    p.y,
  ]);

  return sat(points1, points2);
};
