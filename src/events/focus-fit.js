import { isValidationError } from 'zod-validation-error';
import { getScaleBounds } from './bounds';
import { focusFitIdsSchema } from './schema';
import { selector } from './selector/selector';
import { validate } from './validator';

export const focus = (viewport, ids) => centerViewport(viewport, ids, false);
export const fit = (viewport, ids) => centerViewport(viewport, ids, true);

/**
 * Centers and optionally fits the viewport to given object IDs.
 * @param {Viewport} viewport - The viewport instance.
 * @param {string|string[]} ids - ID or IDs of objects to center on.
 * @param {boolean} shouldFit - Whether to fit the viewport to the objects' bounds.
 * @returns {void|null} Returns null if no objects found.
 */
const centerViewport = (viewport, ids, shouldFit = false) => {
  checkValidate(ids);
  const objects = getObjectsById(viewport, ids);
  if (!objects.length) return null;
  const bounds = calculateBounds(viewport, objects);
  if (bounds) {
    viewport.moveCenter(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    if (shouldFit) {
      viewport.fit(true, bounds.width, bounds.height);
    }
  }
};

const checkValidate = (ids) => {
  const validated = validate(ids, focusFitIdsSchema);
  if (isValidationError(validated)) {
    throw validated;
  }
};

const getObjectsById = (viewport, ids) => {
  if (!ids) return [viewport];
  const idsArr = Array.isArray(ids) ? ids : [ids];
  const objs = selector(
    viewport,
    '$..children[?(@.type != null && @.parent.type !== "item" && @.parent.type !== "relations")]',
  ).reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});
  return idsArr.flatMap((i) => objs[i]).filter((obj) => obj);
};

const calculateBounds = (viewport, objects) => {
  const boundsArray = objects.map((obj) => getScaleBounds(viewport, obj));
  const minX = Math.min(...boundsArray.map((b) => b.x));
  const minY = Math.min(...boundsArray.map((b) => b.y));
  const maxX = Math.max(...boundsArray.map((b) => b.x + b.width));
  const maxY = Math.max(...boundsArray.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};
