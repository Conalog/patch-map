import { Polygon } from 'pixi.js';
import { getViewport } from '../get';
import { getObjectLocalCorners } from '../transform';

export const intersectPoint = (obj, point) => {
  const viewport = getViewport(obj);
  if (!viewport) return false;

  if (obj.allowContainsPoint) {
    return obj.containsPoint(point);
  }

  const localCorners = getObjectLocalCorners(obj, viewport);
  const polygon = new Polygon(localCorners);
  return polygon.contains(point.x, point.y);
};
