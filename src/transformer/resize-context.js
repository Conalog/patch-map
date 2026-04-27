import { isResizableCandidate } from '../utils/interaction-locks';
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
export const isResizableElement = (element, stopAt = null) =>
  isResizableCandidate(element, stopAt);

/**
 * Filters an element list to only resizable elements.
 *
 * @param {PIXI.DisplayObject[]} elements
 * @returns {PIXI.DisplayObject[]}
 */
export const getResizableElements = (elements, stopAt = null) => {
  if (!Array.isArray(elements) || elements.length === 0) return [];
  return elements.filter((element) => isResizableElement(element, stopAt));
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

const buildResizeFrame = ({ elements, viewport }) => {
  if (!viewport || !elements || elements.length === 0) return null;

  if (elements.length === 1) {
    const corners = getObjectLocalCorners(elements[0], viewport);
    if (corners.length === 0) return null;
    const bounds = normalizeBounds(getBoundsFromPoints(corners));
    return {
      mode: 'oriented',
      bounds,
      corners,
      center: getCenter(corners),
      rotation: getFrameRotation(corners),
    };
  }

  const bounds = normalizeBounds(
    getGroupBoundsInViewportSpace({ elements, viewport }),
  );
  return {
    mode: 'axis-aligned',
    bounds,
    corners: getAxisAlignedCorners(bounds),
    center: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    rotation: 0,
  };
};

/**
 * Builds resize context for the current selection.
 * Returns `null` when resize cannot start (no selection, no viewport, or no
 * resizable elements).
 *
 * @param {object} params
 * @param {PIXI.DisplayObject[]} params.elements
 * @param {import('pixi-viewport').Viewport | null} params.viewport
 * @returns {{ elements: PIXI.DisplayObject[], bounds: Bounds, frame: object } | null}
 */
export const buildResizeContext = ({ elements, viewport }) => {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  const resizableElements = getResizableElements(elements, viewport);
  if (resizableElements.length === 0) return null;

  const bounds = getGroupBoundsInViewportSpace({
    elements: resizableElements,
    viewport,
  });
  if (!bounds) return null;

  const frame = buildResizeFrame({ elements: resizableElements, viewport });
  if (!frame) return null;

  return {
    elements: resizableElements,
    bounds: normalizeBounds(bounds),
    frame,
  };
};

const getCenter = (corners) => ({
  x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
  y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
});

const getFrameRotation = (corners) => {
  if (corners.length < 2) return 0;
  return Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x);
};

const getAxisAlignedCorners = (bounds) => [
  { x: bounds.x, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  { x: bounds.x, y: bounds.y + bounds.height },
];
