import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/validator';
import { focusFitIdsSchema, parseFitOptions } from './schema';

export const focus = (viewport, ids) => {
  validateIds(ids);
  const bounds = getBoundsForIds(viewport, ids);
  if (!bounds) return null;

  moveViewportToBounds(viewport, bounds);
};

export const fit = (viewport, ids, opts) => {
  validateIds(ids);
  const padding = parseFitOptions(opts).padding;
  const bounds = getBoundsForIds(viewport, ids);
  if (!bounds) return null;

  moveViewportToBounds(viewport, bounds);
  fitViewportToBounds(viewport, bounds, padding);
};

/**
 * @param {Viewport} viewport
 * @param {string|string[]} ids
 * @returns {void|null} Returns null if no objects found.
 */
const getBoundsForIds = (viewport, ids) => {
  const objects = getObjectsById(viewport, ids);
  if (!objects.length) return null;

  return calcGroupOrientedBounds(objects);
};

const moveViewportToBounds = (viewport, bounds) => {
  const center = viewport.toLocal(bounds.center);
  viewport.moveCenter(center.x, center.y);
};

const fitViewportToBounds = (viewport, bounds, padding) => {
  viewport.fit(
    true,
    bounds.innerBounds.width / viewport.scale.x + padding.x * 2,
    bounds.innerBounds.height / viewport.scale.y + padding.y * 2,
  );
};

const validateIds = (ids) => {
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
