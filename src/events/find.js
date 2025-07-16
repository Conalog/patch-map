import { intersect } from '../utils/intersects/intersect';
import { intersectPoint } from '../utils/intersects/intersect-point';
import { getSelectObject } from './utils';

export const findIntersectObject = (viewport, state, options) => {
  const allCandidates = collectCandidates(
    viewport,
    (child) => child.constructor.isSelectable,
  );

  const sortedCandidates = allCandidates.sort((a, b) => {
    const zDiff = (b.zIndex || 0) - (a.zIndex || 0);
    if (zDiff !== 0) return zDiff;

    const pathA = getAncestorPath(a, viewport);
    const pathB = getAncestorPath(b, viewport);

    const minLength = Math.min(pathA.length, pathB.length);
    for (let i = 0; i < minLength; i++) {
      if (pathA[i] !== pathB[i]) {
        const commonParent = pathA[i].parent;
        return (
          commonParent.getChildIndex(pathB[i]) -
          commonParent.getChildIndex(pathA[i])
        );
      }
    }
    return pathB.length - pathA.length;
  });

  for (const candidate of sortedCandidates) {
    const targets =
      candidate.constructor.hitScope === 'children'
        ? candidate.children
        : [candidate];

    for (const target of targets) {
      const isIntersecting = intersectPoint(target, state.point);
      if (isIntersecting) {
        const selectObject = getSelectObject(candidate, options);
        if (selectObject && (!options.filter || options.filter(selectObject))) {
          return selectObject;
        }
      }
    }
  }

  return null;
};

export const findIntersectObjects = (viewport, state, options) => {
  const allCandidates = collectCandidates(
    viewport,
    (child) => child.constructor.isSelectable,
  );
  const found = [];

  for (const candidate of allCandidates) {
    const targets =
      candidate.constructor.hitScope === 'children'
        ? candidate.children
        : [candidate];

    for (const target of targets) {
      const isIntersecting = intersect(state.box, target);
      if (isIntersecting) {
        const selectObject = getSelectObject(candidate, options);
        if (selectObject && (!options.filter || options.filter(selectObject))) {
          found.push(selectObject);
          break;
        }
      }
    }
  }

  return Array.from(new Set(found));
};

const collectCandidates = (parent, filterFn) => {
  let candidates = [];
  for (const child of parent.children) {
    if (filterFn(child)) {
      candidates.push(child);
    }
    candidates = candidates.concat(collectCandidates(child, filterFn));
  }
  return candidates;
};

const getAncestorPath = (obj, stopAt) => {
  const path = [];
  let current = obj;
  while (current && current !== stopAt) {
    path.unshift(current);
    current = current.parent;
  }
  return path;
};
