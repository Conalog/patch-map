import { Polygon } from 'pixi.js';
import { getObjectLocalCorners } from '../transform';

export const intersectPoint = (obj, point) => {
  const viewport = obj?.context?.viewport;
  if (!viewport) return false;

  const localCorners = getObjectLocalCorners(obj, viewport);
  const polygon = new Polygon(localCorners);
  return polygon.contains(point.x, point.y);
};
