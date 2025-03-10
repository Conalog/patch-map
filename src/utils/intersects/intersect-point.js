import { Polygon } from 'pixi.js';
import { getViewport } from '../get';
import { getPoints } from './get-points';

export const intersectPoint = (obj, point) => {
  const viewport = getViewport(obj);
  if (!viewport) return false;

  if (obj.context && 'containsPoint' in obj) {
    return obj.containsPoint(point);
  }

  const points = getPoints(viewport, obj);
  const polygon = new Polygon(points);
  return polygon.contains(point.x, point.y);
};
