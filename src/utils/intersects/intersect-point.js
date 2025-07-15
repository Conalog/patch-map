import { Polygon } from 'pixi.js';
import { getPoints } from './get-points';

export const intersectPoint = (obj, point) => {
  const viewport = obj?.context?.viewport;
  if (!viewport) return false;

  if ('containsPoint' in obj) {
    return obj.getBounds().containsPoint(point);
  }

  const points = getPoints(viewport, obj);
  const polygon = new Polygon(points);
  return polygon.contains(point.x, point.y);
};
