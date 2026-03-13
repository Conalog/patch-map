import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/validator';
import {
  focusFitIdsSchema,
  focusFitOptionsSchema,
  parseFitOptions,
} from './schema';

const FOCUS_FIT_SELECTOR =
  '$..children[?(@.type != null && @.parent.type !== "item" && @.parent.type !== "relations")]';

export const focus = (viewport, ids, opts) => {
  validateIds(ids);
  validateFocusOptions(opts);
  const bounds = getBoundsForIds(viewport, ids, opts?.filter);
  if (!bounds) return null;

  moveViewportToBounds(viewport, bounds);
};

export const fit = (viewport, ids, opts) => {
  validateIds(ids);
  const { filter, padding } = parseFitOptions(opts);
  const bounds = getBoundsForIds(viewport, ids, filter);
  if (!bounds) return null;

  moveViewportToBounds(viewport, bounds);
  fitViewportToBounds(viewport, bounds, padding);
};

/**
 * @param {Viewport} viewport
 * @param {string|string[]|null|undefined} ids
 * @param {(obj: object) => boolean} [filter]
 * @returns {void|null} Returns null if no objects found.
 */
const getBoundsForIds = (viewport, ids, filter) => {
  const objects = getObjectsById(viewport, ids, filter);
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

const validateFocusOptions = (opts) => {
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
  if (!node || seen.has(node)) {
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

  if (filter && !filter(node)) {
    return;
  }

  seen.add(node);
  collected.push(node);
};

const isManagedViewportElement = (node) =>
  Boolean(node?.constructor?.isElement);
