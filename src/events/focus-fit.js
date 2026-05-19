import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds } from '../utils/bounds';
import { selector } from '../utils/selector/selector';
import { validate } from '../utils/validator';
import {
  focusFitIdsSchema,
  focusFitOptionsSchema,
  parseFitOptions,
} from './schema';

export const focus = (viewport, world, ids, opts) => {
  validateIds(ids);
  validateFocusOptions(opts);
  const bounds = getBoundsForIds(world, ids, opts?.filter);
  if (!bounds) return null;

  moveViewportToBounds(viewport, bounds);
};

export const fit = (viewport, world, ids, opts) => {
  validateIds(ids);
  const { filter, padding } = parseFitOptions(opts);
  const bounds = getBoundsForIds(world, ids, filter);
  if (!bounds) return null;

  moveViewportToBounds(viewport, bounds);
  fitViewportToBounds(viewport, bounds, padding);
};

/**
 * @param {PIXI.Container} world
 * @param {string|string[]|null|undefined} ids
 * @param {(obj: object) => unknown} [filter]
 * @returns {void|null} Returns null if no objects found.
 */
const getBoundsForIds = (world, ids, filter) => {
  const objects = resolveFocusFitTargets(world, ids, filter);
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

const resolveFocusFitTargets = (world, ids, filter) => {
  if (!ids) {
    return collectTopLevelWorldTargets(world, filter);
  }

  const resolveById = createFocusFitIdResolver(world);
  const idsArr = Array.isArray(ids) ? ids : [ids];
  const selected = idsArr.flatMap((i) =>
    resolveExplicitTarget(resolveById(i), resolveById),
  );
  return collectBoundsContributors(selected, filter);
};

const createFocusFitIdResolver = (world) => {
  const sceneIndex = world?.store?.sceneIndex;
  if (sceneIndex?.getAllById) {
    return (id) => {
      const matches = sceneIndex
        .getAllById(id)
        .filter(isAddressableFocusFitElement);
      return matches[matches.length - 1] ?? null;
    };
  }

  const objects = selector(world, '$..children[?(@.type != null)]').filter(
    isAddressableFocusFitElement,
  );
  const objectById = objects.reduce((acc, curr) => {
    acc[curr.id] = curr;
    return acc;
  }, {});
  return (id) => objectById[id] ?? null;
};

const resolveExplicitTarget = (node, resolveById) => {
  if (!node) return [];
  if (node.type !== 'relations') return [node];

  // Relations may not have stable rendered bounds until a later refresh tick,
  // so focus/fit should resolve through the linked endpoints instead.
  const linkedTargets = resolveRelationTargets(node, resolveById);
  return linkedTargets.length > 0 ? linkedTargets : [node];
};

const resolveRelationTargets = (relations, resolveById) => {
  const links = relations?.props?.links ?? [];
  const linkedIds = new Set(
    links.flatMap(({ source, target }) => [source, target]),
  );

  return [...linkedIds]
    .map((linkedId) => resolveById(linkedId))
    .filter(Boolean);
};

const collectTopLevelWorldTargets = (world, filter) =>
  collectBoundsContributors(
    (world?.children ?? []).filter(isDefaultFocusFitElement),
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

  if (filter && !filter(node)) {
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

  seen.add(node);
  collected.push(node);
};

const isAddressableFocusFitElement = (node) =>
  node?.type && Boolean(node?.constructor?.isElement);

const isDefaultFocusFitElement = (node) =>
  isAddressableFocusFitElement(node) && node.type !== 'relations';
