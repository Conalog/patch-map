import { Point } from 'pixi.js';
import { getBoundsFromPoints } from '../utils/transform';
import { getFrameCorrection } from './restrict';

const CLAMP_EPSILON = 0.0001;

export const clampViewportToCanvasBounds = (viewport, bounds, world) => {
  if (!viewport || !bounds) return;

  if (world) {
    clampViewportToTransformedCanvasBounds(viewport, bounds, world);
    return;
  }

  clampViewportAxis({
    viewport,
    min: bounds.x,
    max: bounds.right,
    size: bounds.width,
    screenSize: viewport.screenWidth,
    worldScreenSize: viewport.worldScreenWidth,
    scale: viewport.scale?.x,
    positionKey: 'x',
    minEdgeKey: 'left',
    maxEdgeKey: 'right',
  });
  clampViewportAxis({
    viewport,
    min: bounds.y,
    max: bounds.bottom,
    size: bounds.height,
    screenSize: viewport.screenHeight,
    worldScreenSize: viewport.worldScreenHeight,
    scale: viewport.scale?.y,
    positionKey: 'y',
    minEdgeKey: 'top',
    maxEdgeKey: 'bottom',
  });
};

const clampViewportAxis = ({
  viewport,
  min,
  max,
  size,
  screenSize,
  worldScreenSize,
  scale,
  positionKey,
  minEdgeKey,
  maxEdgeKey,
}) => {
  const safeScale = Math.abs(scale || 1);
  const visibleSize = Number.isFinite(worldScreenSize)
    ? worldScreenSize
    : screenSize / safeScale;

  if (visibleSize >= size) {
    const center = min + size / 2;
    viewport[positionKey] = -center * safeScale + screenSize / 2;
    return;
  }

  if (viewport[minEdgeKey] < min) {
    viewport[minEdgeKey] = min;
  } else if (viewport[maxEdgeKey] > max) {
    viewport[maxEdgeKey] = max;
  }
};

const clampViewportToTransformedCanvasBounds = (viewport, bounds, world) => {
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const frame = getVisibleCanvasFrame(viewport, world);
    const correction = getFrameCorrection(frame, bounds);
    if (
      Math.abs(correction.x) <= CLAMP_EPSILON &&
      Math.abs(correction.y) <= CLAMP_EPSILON
    ) {
      return;
    }

    const center = screenPointToCanvasPoint({
      world,
      point: new Point(viewport.screenWidth / 2, viewport.screenHeight / 2),
    });
    const correctedCenter = new Point(
      center.x + correction.x,
      center.y + correction.y,
    );
    const correctedViewportCenter =
      world.localTransform?.apply?.(correctedCenter) ??
      viewport.toLocal(correctedCenter, world);
    viewport.moveCenter(correctedViewportCenter.x, correctedViewportCenter.y);
  }
};

const getVisibleCanvasFrame = (viewport, world) => {
  const screenWidth = viewport.screenWidth ?? 0;
  const screenHeight = viewport.screenHeight ?? 0;
  return getBoundsFromPoints(
    [
      new Point(0, 0),
      new Point(screenWidth, 0),
      new Point(screenWidth, screenHeight),
      new Point(0, screenHeight),
    ].map((point) => screenPointToCanvasPoint({ world, point })),
  );
};

const screenPointToCanvasPoint = ({ world, point }) => {
  return world.toLocal(point);
};
