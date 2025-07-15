import { getObjectLocalCorners } from '../transform';
import { sat } from './sat';

export const intersect = (obj1, obj2) => {
  const viewport = obj1?.context?.viewport ?? obj2?.context?.viewport;
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
