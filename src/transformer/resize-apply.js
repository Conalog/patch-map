import { Point } from 'pixi.js';
import { isResizableElement } from './resize-context';
import { computeResize, resizeElementState } from './resize-utils';

/**
 * @typedef {object} ResizeElementState
 * @property {PIXI.DisplayObject} element
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
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
  const resizeInfo = computeResize({
    bounds: activeResize.bounds,
    handle: activeResize.handle,
    delta,
    keepRatio,
  });

  return activeResize.elementStates.map((state) => ({
    element: state.element,
    updatedState: resizeElementState(state, resizeInfo),
  }));
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
  updates.forEach(({ element, updatedState }) => {
    applyElementResize({
      element,
      updatedState,
      viewport,
      historyId,
    });
  });
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
