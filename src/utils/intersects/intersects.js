import { Point } from 'pixi.js';
import { getViewport } from '../get';
import { sat } from './sat';

export const intersects = (obj1, obj2) => {
  const viewport = getViewport(obj1) ?? getViewport(obj2);
  if (!viewport) return false;

  const points1 = getPoints(viewport, obj1);
  const points2 = getPoints(viewport, obj2);
  return sat(points1, points2);
};

const getPoints = (viewport, obj) => {
  const bounds = obj.getLocalBounds();
  const { x, y, width, height } = bounds;

  const localCorners = [
    new Point(x, y),
    new Point(x + width, y),
    new Point(x + width, y + height),
    new Point(x, y + height),
  ];
  return localCorners.flatMap((corner) => {
    const point = viewport.toWorld(obj.toGlobal(corner));
    return [point.x, point.y];
  });
};
