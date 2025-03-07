import { Point } from 'pixi.js';

export const getPoints = (viewport, obj) => {
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
