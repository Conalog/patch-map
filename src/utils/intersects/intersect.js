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
