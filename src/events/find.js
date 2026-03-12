import { collectCandidates, isInteractionLocked } from '../utils/get';
import { intersect } from '../utils/intersects/intersect';
import { intersectPoint } from '../utils/intersects/intersect-point';
import { getSegmentEntryT } from '../utils/intersects/segment-polygon-t';
import { getObjectLocalCorners } from '../utils/transform';
import {
  collectPointHit,
  collectPolygonHits,
  collectSegmentHits,
} from './find-helpers';
import { getSelectObject } from './utils';

const getSelectableCandidates = (parent) => {
  if (isInteractionLocked(parent)) {
    return [];
  }

  return collectCandidates(
    parent,
    (child) =>
      child.constructor.isSelectable && !isInteractionLocked(child, parent),
    { shouldDescend: (child) => !isInteractionLocked(child, parent) },
  );
};

export const findIntersectObject = (
  parent,
  point,
  { filter, selectUnit, filterParent } = {},
) => {
  const allCandidates = getSelectableCandidates(parent);
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
  return collectPointHit({
    candidates: sortedCandidates,
    point,
    intersectsPoint: intersectPoint,
    resolveSelection: (candidate) => {
      const selectObject = getSelectObject(
        parent,
        candidate,
        selectUnit,
        filterParent,
      );
      return selectObject && (!filter || filter(selectObject))
        ? selectObject
        : null;
    },
  });
};

export const findIntersectObjects = (
  parent,
  selectionBox,
  { filter, selectUnit, filterParent } = {},
) => {
  const allCandidates = getSelectableCandidates(parent);
  return collectPolygonHits({
    candidates: allCandidates,
    polygon: selectionBox,
    intersectsPolygon: intersect,
    resolveSelection: (candidate) => {
      const selectObject = getSelectObject(
        parent,
        candidate,
        selectUnit,
        filterParent,
      );
      return selectObject && (!filter || filter(selectObject))
        ? selectObject
        : null;
    },
  });
};

export const findIntersectObjectsBySegment = (
  parent,
  p1,
  p2,
  { filter, selectUnit, filterParent } = {},
) => {
  const allCandidates = getSelectableCandidates(parent);
  return collectSegmentHits({
    candidates: allCandidates,
    segmentStart: p1,
    segmentEnd: p2,
    getEntryT: getSegmentEntryT,
    getCorners: (target) => getObjectLocalCorners(target, parent),
    resolveSelection: (candidate) => {
      const selectObject = getSelectObject(
        parent,
        candidate,
        selectUnit,
        filterParent,
      );
      return selectObject && (!filter || filter(selectObject))
        ? selectObject
        : null;
    },
  });
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
