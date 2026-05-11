import { Point } from 'pixi.js';
import {
  getBoundsFromPoints,
  getObjectFrameWorldCorners,
} from '../utils/transform';

const DEFAULT_ELIGIBLE_TYPES = new Set(['item', 'grid']);

export const createMinimapSnapshot = ({ patchmap, width, height, padding }) => {
  const canvasBounds = patchmap?.canvas?.bounds;
  if (!canvasBounds) {
    return null;
  }

  const scale = getMinimapScale({ canvasBounds, width, height, padding });
  const origin = {
    x: padding + (width - padding * 2 - canvasBounds.width * scale) / 2,
    y: padding + (height - padding * 2 - canvasBounds.height * scale) / 2,
  };

  return {
    canvas: projectRect(canvasBounds, canvasBounds, scale, origin),
    viewport: getViewportPolygon({ patchmap, canvasBounds, scale, origin }),
    objects: collectObjectSilhouettes({
      patchmap,
      canvasBounds,
      scale,
      origin,
    }),
    scale,
    origin,
    canvasBounds,
  };
};

export const minimapPointToCanvasPoint = ({
  point,
  canvasBounds,
  scale,
  origin,
}) => ({
  x: canvasBounds.x + (point.x - origin.x) / scale,
  y: canvasBounds.y + (point.y - origin.y) / scale,
});

const getMinimapScale = ({ canvasBounds, width, height, padding }) => {
  const availableWidth = Math.max(width - padding * 2, 1);
  const availableHeight = Math.max(height - padding * 2, 1);
  return Math.min(
    availableWidth / canvasBounds.width,
    availableHeight / canvasBounds.height,
  );
};

const collectObjectSilhouettes = ({
  patchmap,
  canvasBounds,
  scale,
  origin,
}) => {
  const world = patchmap?.world;
  if (!world) return [];

  return collectManagedElements(world)
    .filter(isMinimapEligibleElement)
    .map((element) => getElementCanvasFrame(element, world))
    .map((frame) => intersectRects(frame, canvasBounds))
    .filter(Boolean)
    .map((frame) => projectRect(frame, canvasBounds, scale, origin));
};

const collectManagedElements = (root) => {
  const result = [];
  const visit = (node) => {
    if (!node) return;
    if (node !== root && node?.type && node?.constructor?.isElement) {
      result.push(node);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(root);
  return result;
};

const isMinimapEligibleElement = (element) =>
  DEFAULT_ELIGIBLE_TYPES.has(element?.type) &&
  element.visible !== false &&
  element.renderable !== false &&
  element.props?.show !== false;

const getElementCanvasFrame = (element, world) => {
  const canvasCorners = getObjectFrameWorldCorners(element).map((point) =>
    world.toLocal(point),
  );
  return getBoundsFromPoints(canvasCorners);
};

const getViewportPolygon = ({ patchmap, canvasBounds, scale, origin }) => {
  const app = patchmap?.app;
  const viewport = patchmap?.viewport;
  const world = patchmap?.world;
  if (!app || !viewport || !world) return [];

  return [
    new Point(0, 0),
    new Point(app.screen.width, 0),
    new Point(app.screen.width, app.screen.height),
    new Point(0, app.screen.height),
  ].map((point) =>
    projectPoint(
      screenPointToCanvasPoint({ world, point }),
      canvasBounds,
      scale,
      origin,
    ),
  );
};

const screenPointToCanvasPoint = ({ world, point }) => {
  return world.toLocal(point);
};

const projectRect = (rect, canvasBounds, scale, origin) => ({
  x: origin.x + (rect.x - canvasBounds.x) * scale,
  y: origin.y + (rect.y - canvasBounds.y) * scale,
  width: rect.width * scale,
  height: rect.height * scale,
});

const projectPoint = (point, canvasBounds, scale, origin) => ({
  x: origin.x + (point.x - canvasBounds.x) * scale,
  y: origin.y + (point.y - canvasBounds.y) * scale,
});

const intersectRects = (rect, canvasBounds) => {
  if (!rect) return null;

  const x = Math.max(rect.x, canvasBounds.x);
  const y = Math.max(rect.y, canvasBounds.y);
  const right = Math.min(rect.x + rect.width, canvasBounds.right);
  const bottom = Math.min(rect.y + rect.height, canvasBounds.bottom);
  if (right <= x || bottom <= y) return null;

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
};
