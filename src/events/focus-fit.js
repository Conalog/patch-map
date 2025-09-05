import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/validator';
import { focusFitIdsSchema } from './schema';

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
  const bounds = calcGroupOrientedBounds(objects);
  const center = viewport.toLocal(bounds.center);
  if (bounds) {
    viewport.moveCenter(center.x, center.y);
    if (shouldFit) {
      viewport.fit(
        true,
        bounds.innerBounds.width / viewport.scale.x,
        bounds.innerBounds.height / viewport.scale.y,
      );
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
