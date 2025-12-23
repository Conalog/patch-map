import { collectCandidates } from '../utils/get';
import { intersect, intersectSegment } from '../utils/intersects/intersect';
import { intersectPoint } from '../utils/intersects/intersect-point';
import { getSelectObject } from './utils';

export const findIntersectObject = (
  parent,
  point,
  { filter, selectUnit, filterParent } = {},
) => {
  const allCandidates = collectCandidates(
    parent,
    (child) => child.constructor.isSelectable,
  );

  const sortedCandidates = allCandidates.sort((a, b) => {
    const zDiff = (b.zIndex || 0) - (a.zIndex || 0);
    if (zDiff !== 0) return zDiff;

    const pathA = getAncestorPath(a, parent);
    const pathB = getAncestorPath(b, parent);

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
      const isIntersecting = intersectPoint(target, point);
      if (isIntersecting) {
        const selectObject = getSelectObject(
          parent,
          candidate,
          selectUnit,
          filterParent,
        );
        if (selectObject && (!filter || filter(selectObject))) {
          return selectObject;
        }
      }
    }
  }

  return null;
};

export const findIntersectObjects = (
  parent,
  selectionBox,
  { filter, selectUnit, filterParent } = {},
) => {
  const allCandidates = collectCandidates(
    parent,
    (child) => child.constructor.isSelectable,
  );
  const found = [];

  for (const candidate of allCandidates) {
    const targets =
      candidate.constructor.hitScope === 'children'
        ? candidate.children
        : [candidate];

    for (const target of targets) {
      const isIntersecting = intersect(selectionBox, target);
      if (isIntersecting) {
        const selectObject = getSelectObject(
          parent,
          candidate,
          selectUnit,
          filterParent,
        );
        if (selectObject && (!filter || filter(selectObject))) {
          found.push(selectObject);
          break;
        }
      }
    }
  }

  return Array.from(new Set(found));
};

export const findIntersectObjectsBySegment = (
  parent,
  p1,
  p2,
  { filter, selectUnit, filterParent } = {},
) => {
  const allCandidates = collectCandidates(
    parent,
    (child) => child.constructor.isSelectable,
  );
  const found = [];
  const segment = [p1, p2];

  for (const candidate of allCandidates) {
    const targets =
      candidate.constructor.hitScope === 'children'
        ? candidate.children
        : [candidate];

    for (const target of targets) {
      const isIntersecting = intersectSegment(segment, target);
      if (isIntersecting) {
        const selectObject = getSelectObject(
          parent,
          candidate,
          selectUnit,
          filterParent,
        );
        if (selectObject && (!filter || filter(selectObject))) {
          found.push(selectObject);
          break;
        }
      }
    }
  }

  return Array.from(new Set(found));
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
