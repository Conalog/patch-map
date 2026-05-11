import { Point } from 'pixi.js';
import { getBoundsFromPoints } from '../utils/transform';

const EPSILON = 0.0001;

export const areViewportFrameCornersInsideCanvasBounds = ({
  corners,
  viewport,
  world,
  canvasBounds,
}) => {
  if (!canvasBounds || !Array.isArray(corners) || corners.length === 0) {
    return true;
  }
  if (!viewport || !world) return true;

  const canvasCorners = corners.map((corner) =>
    toCanvasPoint(corner, viewport, world),
  );
  return canvasCorners.every((point) =>
    isPointInsideCanvasBounds(point, canvasBounds),
  );
};

export const isViewportFrameInsideCanvasBounds = ({
  corners,
  viewport,
  element,
}) => {
  const canvasBounds = element?.store?.canvasBounds;
  if (!canvasBounds) return true;

  return areViewportFrameCornersInsideCanvasBounds({
    corners,
    viewport,
    world: element?.store?.world,
    canvasBounds,
  });
};

export const getFrameCorrection = (frame, canvasBounds) => {
  if (!frame || !canvasBounds) return { x: 0, y: 0 };
  return {
    x: getAxisCorrection({
      min: frame.x,
      max: frame.x + frame.width,
      size: frame.width,
      boundMin: canvasBounds.x,
      boundMax: canvasBounds.right,
      boundSize: canvasBounds.width,
    }),
    y: getAxisCorrection({
      min: frame.y,
      max: frame.y + frame.height,
      size: frame.height,
      boundMin: canvasBounds.y,
      boundMax: canvasBounds.bottom,
      boundSize: canvasBounds.height,
    }),
  };
};

const isPointInsideCanvasBounds = (point, canvasBounds) =>
  point.x >= canvasBounds.x - EPSILON &&
  point.x <= canvasBounds.right + EPSILON &&
  point.y >= canvasBounds.y - EPSILON &&
  point.y <= canvasBounds.bottom + EPSILON;

const toCanvasPoint = (point, viewport, world) => {
  const viewportPoint = new Point(point.x, point.y);
  const globalPoint =
    typeof viewport.toGlobal === 'function'
      ? viewport.toGlobal(viewportPoint)
      : viewportPoint;
  return world.toLocal(globalPoint);
};

export const getCanvasFrameFromViewportCorners = ({
  corners,
  viewport,
  world,
}) => {
  const canvasCorners = corners.map((corner) =>
    toCanvasPoint(corner, viewport, world),
  );
  return getBoundsFromPoints(canvasCorners);
};

const getAxisCorrection = ({
  min,
  max,
  size,
  boundMin,
  boundMax,
  boundSize,
}) => {
  if (size > boundSize) {
    return boundMin + boundSize / 2 - (min + size / 2);
  }
  if (min < boundMin) return boundMin - min;
  if (max > boundMax) return boundMax - max;
  return 0;
};
