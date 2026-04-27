import { isRotatableCandidate } from '../utils/interaction-locks';
import {
  getBoundsFromPoints,
  getCentroid,
  getObjectLocalCorners,
} from '../utils/transform';
import { normalizeBounds } from './resize-context';

/**
 * Returns whether an element is rotatable by Transformer.
 * Rotatability is controlled by the static `isRotatable` flag on the class.
 *
 * @param {PIXI.DisplayObject} element
 * @returns {boolean}
 */
export const isRotatableElement = (element, stopAt = null) =>
  isRotatableCandidate(element, stopAt);

/**
 * Filters an element list to only rotatable elements.
 *
 * @param {PIXI.DisplayObject[]} elements
 * @returns {PIXI.DisplayObject[]}
 */
export const getRotatableElements = (elements, stopAt = null) => {
  if (!Array.isArray(elements) || elements.length === 0) return [];
  return elements.filter((element) => isRotatableElement(element, stopAt));
};

export const buildTransformFrame = ({ elements, viewport }) => {
  if (!viewport || !elements || elements.length === 0) return null;

  if (elements.length === 1) {
    const corners = getObjectLocalCorners(elements[0], viewport);
    if (corners.length === 0) return null;
    const bounds = normalizeBounds(getBoundsFromPoints(corners));
    const center = getCentroid(corners);
    return {
      mode: 'oriented',
      bounds,
      corners,
      center,
      rotation: getFrameRotation(corners),
    };
  }

  const allCorners = elements.flatMap((element) =>
    getObjectLocalCorners(element, viewport),
  );
  if (allCorners.length === 0) return null;

  const bounds = normalizeBounds(getBoundsFromPoints(allCorners));
  const corners = getAxisAlignedCorners(bounds);
  return {
    mode: 'axis-aligned',
    bounds,
    corners,
    center: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    rotation: 0,
  };
};

/**
 * Builds rotate context for the current selection.
 * Returns `null` when rotation cannot start.
 *
 * @param {object} params
 * @param {PIXI.DisplayObject[]} params.elements
 * @param {import('pixi-viewport').Viewport | null} params.viewport
 * @returns {{ elements: PIXI.DisplayObject[], frame: object } | null}
 */
export const buildRotateContext = ({ elements, viewport }) => {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  const rotatableElements = getRotatableElements(elements, viewport);
  if (rotatableElements.length === 0) return null;

  const frame = buildTransformFrame({ elements, viewport });
  if (!frame) return null;

  return {
    elements: rotatableElements,
    frame,
  };
};

export const getAxisAlignedCorners = (bounds) => [
  { x: bounds.x, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y },
  { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  { x: bounds.x, y: bounds.y + bounds.height },
];

const getFrameRotation = (corners) => {
  if (corners.length < 2) return 0;
  return Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x);
};
