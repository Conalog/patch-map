import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/validator';
import {
  focusFitIdsSchema,
  focusFitOptionsSchema,
  parseFitOptions,
} from './schema';

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
  const objects = resolveFocusFitTargets(viewport, ids, filter);
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

const resolveFocusFitTargets = (viewport, ids, filter) => {
  if (!ids) {
    return collectTopLevelViewportTargets(viewport, filter);
  }

  const objects = selector(viewport, '$..children[?(@.type != null)]').filter(
    isAddressableFocusFitElement,
  );
  const idsArr = Array.isArray(ids) ? ids : [ids];
  const objs = objects.reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});
  const selected = idsArr.flatMap((i) => resolveExplicitTarget(objs[i], objs));
  return collectBoundsContributors(selected, filter);
};

const resolveExplicitTarget = (node, objectById) => {
  if (!node) return [];
  if (node.type !== 'relations') return [node];

  // Relations may not have stable rendered bounds until a later refresh tick,
  // so focus/fit should resolve through the linked endpoints instead.
  const linkedTargets = resolveRelationTargets(node, objectById);
  return linkedTargets.length > 0 ? linkedTargets : [node];
};

const resolveRelationTargets = (relations, objectById) => {
  const links = relations?.props?.links ?? [];
  const linkedIds = new Set(
    links.flatMap(({ source, target }) => [source, target]),
  );

  return [...linkedIds].map((linkedId) => objectById[linkedId]).filter(Boolean);
};

const collectTopLevelViewportTargets = (viewport, filter) =>
  collectBoundsContributors(
    (viewport?.children ?? []).filter(isDefaultFocusFitElement),
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
    isAddressableFocusFitElement,
  );
  if (managedChildren.length > 0 && node?.type !== 'grid') {
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

const isAddressableFocusFitElement = (node) =>
  node?.type && Boolean(node?.constructor?.isElement);

const isDefaultFocusFitElement = (node) =>
  isAddressableFocusFitElement(node) && node.type !== 'relations';
