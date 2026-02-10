import { getBoundsFromPoints, getObjectLocalCorners } from '../utils/transform';

/**
 * @typedef {object} Bounds
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * Returns whether an element is resizable by Transformer.
 * Resizability is controlled by the static `isResizable` flag on the class.
 *
 * @param {PIXI.DisplayObject} element
 * @returns {boolean}
 */
export const isResizableElement = (element) =>
  Boolean(element?.constructor?.isResizable);

/**
 * Filters an element list to only resizable elements.
 *
 * @param {PIXI.DisplayObject[]} elements
 * @returns {PIXI.DisplayObject[]}
 */
export const getResizableElements = (elements) => {
  if (!Array.isArray(elements) || elements.length === 0) return [];
  return elements.filter((element) => isResizableElement(element));
};

/**
 * Normalizes a bounds-like object into a full bounds shape with number defaults.
 *
 * @param {Partial<Bounds> | null | undefined} bounds
 * @returns {Bounds}
 */
export const normalizeBounds = (bounds) => ({
  x: bounds?.x ?? 0,
  y: bounds?.y ?? 0,
  width: bounds?.width ?? 0,
  height: bounds?.height ?? 0,
});

/**
 * Computes group bounds in viewport-local coordinate space from element corners.
 *
 * @param {object} params
 * @param {PIXI.DisplayObject[]} params.elements
 * @param {import('pixi-viewport').Viewport | null} params.viewport
 * @returns {Bounds | null}
 */
export const getGroupBoundsInViewportSpace = ({ elements, viewport }) => {
  if (!viewport || !elements || elements.length === 0) return null;
  const corners = elements.flatMap((element) =>
    getObjectLocalCorners(element, viewport),
  );
  return getBoundsFromPoints(corners);
};

/**
 * Builds resize context for the current selection.
 * Returns `null` when resize cannot start (no selection, no viewport, or no
 * resizable elements).
 *
 * @param {object} params
 * @param {PIXI.DisplayObject[]} params.elements
 * @param {import('pixi-viewport').Viewport | null} params.viewport
 * @returns {{ elements: PIXI.DisplayObject[], bounds: Bounds } | null}
 */
export const buildResizeContext = ({ elements, viewport }) => {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  const resizableElements = getResizableElements(elements);
  if (resizableElements.length === 0) return null;

  const bounds = getGroupBoundsInViewportSpace({ elements, viewport });
  if (!bounds) return null;

  return {
    elements: resizableElements,
    bounds: normalizeBounds(bounds),
  };
};
