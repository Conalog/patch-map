import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/validator';
import { focusFitIdsSchema, focusFitOptionsSchema } from './schema';

const FOCUS_FIT_SELECTOR =
  '$..children[?(@.type != null && @.parent.type !== "item" && @.parent.type !== "relations")]';

export const focus = (viewport, ids, opts) =>
  centerViewport(viewport, ids, false, opts);
export const fit = (viewport, ids, opts) =>
  centerViewport(viewport, ids, true, opts);

/**
 * Centers and optionally fits the viewport to given object IDs.
 * @param {Viewport} viewport - The viewport instance.
 * @param {string|string[]|null|undefined} ids - ID(s) for target resolution.
 * @param {boolean} shouldFit - Whether to fit the viewport to the objects' bounds.
 * @param {{filter?: (obj: object) => boolean}} [opts] - Optional viewport target filter options.
 * @returns {void|null} Returns null if no objects found.
 */
const centerViewport = (viewport, ids, shouldFit = false, opts) => {
  checkValidateIds(ids);
  checkValidateOptions(opts);
  const objects = getObjectsById(viewport, ids, opts?.filter);
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

const checkValidateIds = (ids) => {
  const validated = validate(ids, focusFitIdsSchema);
  if (isValidationError(validated)) {
    throw validated;
  }
};

const checkValidateOptions = (opts) => {
  const validated = validate(opts, focusFitOptionsSchema);
  if (isValidationError(validated)) {
    throw validated;
  }
};

const getObjectsById = (viewport, ids, filter) => {
  if (!ids) {
    return collectTopLevelViewportTargets(viewport, filter);
  }

  const objects = selector(viewport, FOCUS_FIT_SELECTOR).filter(
    isManagedViewportElement,
  );
  const idsArr = Array.isArray(ids) ? ids : [ids];
  const objs = objects.reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});
  const selected = idsArr.flatMap((i) => objs[i]).filter((obj) => obj);
  return collectBoundsContributors(selected, filter);
};

const collectTopLevelViewportTargets = (viewport, filter) =>
  collectBoundsContributors(
    (viewport?.children ?? []).filter(isManagedViewportElement),
    filter,
  );

const collectBoundsContributors = (targets, filter) => {
  const collected = [];
  const seen = new Set();

  targets.forEach((target) => {
    collectNodeContributors(target, filter, collected, seen);
  });

  return collected;
};

const collectNodeContributors = (node, filter, collected, seen) => {
  if (!node || seen.has(node) || (filter && !filter(node))) {
    return;
  }

  const managedChildren = (node.children ?? []).filter(
    isManagedViewportElement,
  );
  if (managedChildren.length > 0) {
    managedChildren.forEach((child) =>
      collectNodeContributors(child, filter, collected, seen),
    );
    return;
  }

  seen.add(node);
  collected.push(node);
};

const isManagedViewportElement = (node) =>
  Boolean(node?.constructor?.isElement);
