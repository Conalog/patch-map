import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/validator';
import { fitOptionsSchema, focusFitIdsSchema } from './schema';

const DEFAULT_FIT_PADDING = Object.freeze({
  top: 16,
  right: 16,
  bottom: 16,
  left: 16,
});

const ZERO_MARGIN = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export const focus = (viewport, ids) => centerViewport(viewport, ids, false);
export const fit = (viewport, ids, opts) =>
  centerViewport(viewport, ids, true, opts);

/**
 * Centers and optionally fits the viewport to given object IDs.
 * @param {Viewport} viewport - The viewport instance.
 * @param {string|string[]} ids - ID or IDs of objects to center on.
 * @param {boolean} shouldFit - Whether to fit the viewport to the objects' bounds.
 * @param {{padding?: number|{x?: number, y?: number}|{top?: number, right?: number, bottom?: number, left?: number}}} opts
 * @returns {void|null} Returns null if no objects found.
 */
const centerViewport = (viewport, ids, shouldFit = false, opts = {}) => {
  const fitOptions = checkValidate(ids, opts);
  const objects = getObjectsById(viewport, ids);
  if (!objects.length) return null;
  const bounds = calcGroupOrientedBounds(objects);
  const center = viewport.toLocal(bounds.center);
  if (bounds) {
    viewport.moveCenter(center.x, center.y);
    if (shouldFit) {
      const padding = fitOptions?.padding ?? ZERO_MARGIN;
      viewport.fit(
        true,
        bounds.innerBounds.width / viewport.scale.x +
          (padding.left + padding.right),
        bounds.innerBounds.height / viewport.scale.y +
          (padding.top + padding.bottom),
      );
    }
  }
};

const checkValidate = (ids, opts) => {
  const validated = validate(ids, focusFitIdsSchema);
  if (isValidationError(validated)) {
    throw validated;
  }

  const validatedOptions = validate(opts, fitOptionsSchema);
  if (isValidationError(validatedOptions)) {
    throw validatedOptions;
  }

  return resolveFitOptions(validatedOptions);
};

const resolveFitOptions = (options = {}) => ({
  padding: { ...DEFAULT_FIT_PADDING, ...options?.padding },
});

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
