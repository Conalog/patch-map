import { Point } from 'pixi.js';
import { isViewportFrameInsideCanvasBounds } from '../canvas-bounds/restrict';
import { getObjectFrameLocalCorners } from '../utils/transform';
import { isResizableElement } from './resize-context';
import {
  computeResize,
  resizeElementState,
  snapSizeToUnit,
} from './resize-utils';

/**
 * @typedef {object} ResizeElementState
 * @property {PIXI.DisplayObject} element
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {{ x: number, y: number }[]} corners
 */

/**
 * @typedef {object} ResizeUpdate
 * @property {PIXI.DisplayObject} element
 * @property {{ x: number, y: number, width: number, height: number }} updatedState
 */

/**
 * Captures initial element states in viewport-local coordinates for a resize
 * gesture.
 *
 * @param {object} params
 * @param {PIXI.DisplayObject[]} params.elements
 * @param {import('pixi-viewport').Viewport} params.viewport
 * @returns {ResizeElementState[]}
 */
export const createResizeElementStates = ({ elements, viewport }) =>
  elements.map((element) => {
    const worldPosition = element.getGlobalPosition();
    const viewportPosition = viewport.toLocal(worldPosition);
    const size = getElementSize(element);

    return {
      element,
      x: viewportPosition.x,
      y: viewportPosition.y,
      width: size.width,
      height: size.height,
      corners: getObjectFrameLocalCorners(element, viewport),
    };
  });

/**
 * Creates pointer movement delta in world coordinates.
 *
 * @param {{ x: number, y: number }} startPoint
 * @param {{ x: number, y: number }} currentPoint
 * @returns {{ x: number, y: number }}
 */
export const createResizeDelta = (startPoint, currentPoint) => ({
  x: currentPoint.x - startPoint.x,
  y: currentPoint.y - startPoint.y,
});

/**
 * Computes per-element updates from active resize session state and pointer
 * delta.
 *
 * @param {object} params
 * @param {{ bounds: { x: number, y: number, width: number, height: number }, handle: string, elementStates: ResizeElementState[] }} params.activeResize
 * @param {{ x: number, y: number }} params.delta
 * @param {boolean} params.keepRatio
 * @returns {ResizeUpdate[]}
 */
export const computeResizeUpdates = ({ activeResize, delta, keepRatio }) => {
  if (
    activeResize.frame?.mode === 'oriented' &&
    activeResize.elementStates.length === 1
  ) {
    return computeOrientedResizeUpdates({ activeResize, delta, keepRatio });
  }

  const resizeInfo = computeResize({
    bounds: activeResize.bounds,
    handle: activeResize.handle,
    delta,
    keepRatio,
  });

  return activeResize.elementStates.map((state) => {
    const updatedState = resizeElementState(state, resizeInfo);
    return {
      element: state.element,
      updatedState: {
        ...updatedState,
        corners: getResizedStateCorners({
          state,
          updatedState,
          resizeInfo,
        }),
      },
    };
  });
};

const computeOrientedResizeUpdates = ({ activeResize, delta, keepRatio }) => {
  const state = activeResize.elementStates[0];
  const geometry = getOrientedFrameGeometry(activeResize.frame);
  const localDelta = projectDelta(delta, geometry);
  const resizeInfo = computeResize({
    bounds: {
      x: 0,
      y: 0,
      width: geometry.width,
      height: geometry.height,
    },
    handle: activeResize.handle,
    delta: localDelta,
    keepRatio,
  });
  const origin = frameLocalToViewport(
    geometry,
    resizeInfo.bounds.x,
    resizeInfo.bounds.y,
  );

  const updatedState = {
    x: origin.x,
    y: origin.y,
    width: snapSizeToUnit(resizeInfo.bounds.width, state.width),
    height: snapSizeToUnit(resizeInfo.bounds.height, state.height),
  };

  return [
    {
      element: state.element,
      updatedState: {
        ...updatedState,
        corners: getOrientedStateCorners({
          geometry,
          origin,
          width: updatedState.width,
          height: updatedState.height,
        }),
      },
    },
  ];
};

const getOrientedFrameGeometry = (frame) => {
  const [topLeft, topRight, , bottomLeft] = frame.corners;
  const widthVector = {
    x: topRight.x - topLeft.x,
    y: topRight.y - topLeft.y,
  };
  const heightVector = {
    x: bottomLeft.x - topLeft.x,
    y: bottomLeft.y - topLeft.y,
  };
  const width = Math.hypot(widthVector.x, widthVector.y);
  const height = Math.hypot(heightVector.x, heightVector.y);

  return {
    origin: topLeft,
    xAxis: normalizeVector(widthVector),
    yAxis: normalizeVector(heightVector),
    width,
    height,
  };
};

const projectDelta = (delta, geometry) => ({
  x: delta.x * geometry.xAxis.x + delta.y * geometry.xAxis.y,
  y: delta.x * geometry.yAxis.x + delta.y * geometry.yAxis.y,
});

const frameLocalToViewport = (geometry, x, y) => ({
  x: geometry.origin.x + geometry.xAxis.x * x + geometry.yAxis.x * y,
  y: geometry.origin.y + geometry.xAxis.y * x + geometry.yAxis.y * y,
});

const normalizeVector = (vector) => {
  const length = Math.hypot(vector.x, vector.y);
  if (!length) return { x: 0, y: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
};

/**
 * Applies computed resize updates to elements.
 *
 * @param {object} params
 * @param {ResizeUpdate[]} params.updates
 * @param {import('pixi-viewport').Viewport} params.viewport
 * @param {string | null | undefined} params.historyId
 */
export const applyResizeUpdates = ({ updates, viewport, historyId }) => {
  if (!areResizeUpdatesInsideCanvasBounds({ updates, viewport })) return 0;

  updates.forEach(({ element, updatedState }) => {
    applyElementResize({
      element,
      updatedState,
      viewport,
      historyId,
    });
  });
  return updates.length;
};

/**
 * Gets element size from props-size when present, otherwise from display size.
 *
 * @param {PIXI.DisplayObject} element
 * @returns {{ width: number, height: number }}
 */
const getElementSize = (element) => {
  if (element?.props?.size) {
    return element.props.size;
  }
  return { width: element.width, height: element.height };
};

const areResizeUpdatesInsideCanvasBounds = ({ updates, viewport }) =>
  updates.every(({ element, updatedState }) =>
    isViewportFrameInsideCanvasBounds({
      corners: updatedState.corners,
      viewport,
      element,
    }),
  );

const getAxisAlignedStateCorners = ({ x, y, width, height }) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

const getResizedStateCorners = ({ state, updatedState, resizeInfo }) => {
  if (!Array.isArray(state.corners) || state.corners.length < 4) {
    return getAxisAlignedStateCorners(updatedState);
  }

  const [topLeft, topRight, , bottomLeft] = state.corners;
  const widthScale = getSafeScale(updatedState.width, state.width);
  const heightScale = getSafeScale(updatedState.height, state.height);
  const topLeftOffset = {
    x: (topLeft.x - state.x) * resizeInfo.scaleX,
    y: (topLeft.y - state.y) * resizeInfo.scaleY,
  };
  const nextTopLeft = {
    x: updatedState.x + topLeftOffset.x,
    y: updatedState.y + topLeftOffset.y,
  };
  const widthVector = {
    x: (topRight.x - topLeft.x) * widthScale,
    y: (topRight.y - topLeft.y) * widthScale,
  };
  const heightVector = {
    x: (bottomLeft.x - topLeft.x) * heightScale,
    y: (bottomLeft.y - topLeft.y) * heightScale,
  };
  const nextTopRight = {
    x: nextTopLeft.x + widthVector.x,
    y: nextTopLeft.y + widthVector.y,
  };
  const nextBottomLeft = {
    x: nextTopLeft.x + heightVector.x,
    y: nextTopLeft.y + heightVector.y,
  };

  return [
    nextTopLeft,
    nextTopRight,
    {
      x: nextTopRight.x + heightVector.x,
      y: nextTopRight.y + heightVector.y,
    },
    nextBottomLeft,
  ];
};

const getSafeScale = (nextSize, previousSize) => {
  if (!Number.isFinite(nextSize) || !Number.isFinite(previousSize)) return 1;
  if (!previousSize) return 1;
  return nextSize / previousSize;
};

const getOrientedStateCorners = ({ geometry, origin, width, height }) => {
  const topRight = {
    x: origin.x + geometry.xAxis.x * width,
    y: origin.y + geometry.xAxis.y * width,
  };
  const bottomLeft = {
    x: origin.x + geometry.yAxis.x * height,
    y: origin.y + geometry.yAxis.y * height,
  };
  return [
    origin,
    topRight,
    {
      x: topRight.x + geometry.yAxis.x * height,
      y: topRight.y + geometry.yAxis.y * height,
    },
    bottomLeft,
  ];
};

/**
 * Applies a single resize result to one element.
 *
 * @param {object} params
 * @param {PIXI.DisplayObject} params.element
 * @param {{ x: number, y: number, width: number, height: number }} params.updatedState
 * @param {import('pixi-viewport').Viewport | null | undefined} params.viewport
 * @param {string | null | undefined} params.historyId
 */
const applyElementResize = ({ element, updatedState, viewport, historyId }) => {
  if (!element || !isResizableElement(element)) return;

  const parent = element.parent;
  const localPosition = parent
    ? parent.toLocal(
        new Point(updatedState.x, updatedState.y),
        viewport ?? undefined,
      )
    : new Point(updatedState.x, updatedState.y);

  const changes = {
    attrs: { x: localPosition.x, y: localPosition.y },
    size: {
      width: Math.max(1, updatedState.width),
      height: Math.max(1, updatedState.height),
    },
  };

  element.apply(changes, historyId ? { historyId } : undefined);
};
