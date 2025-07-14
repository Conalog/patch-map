import { getPoints } from './get-points';
import { sat } from './sat';

export const intersect = (obj1, obj2) => {
  const viewport = obj1?.context?.viewport ?? obj2?.context?.viewport;
  if (!viewport) return false;

  const points1 = getPoints(viewport, obj1);
  const points2 = getPoints(viewport, obj2);
  return sat(points1, points2);
};
