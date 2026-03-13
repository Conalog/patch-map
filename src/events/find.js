import { collectCandidates } from '../utils/get';
import {
  isInteractionLocked,
  isSelectableCandidate,
} from '../utils/interaction-locks';
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
    (child) => isSelectableCandidate(child, parent),
    { shouldDescend: (child) => !isInteractionLocked(child, parent) },
  );
};

const createFindSelectionResolver = (
  parent,
  { filter, selectUnit, filterParent } = {},
) => {
  return (candidate) => {
    const selection = getSelectObject(
      parent,
      candidate,
      selectUnit,
      filterParent,
    );

    return selection && (!filter || filter(selection)) ? selection : null;
  };
};

const compareCandidatesByDisplayOrder = (parent, a, b) => {
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
};

export const findIntersectObject = (
  parent,
  point,
  { filter, selectUnit, filterParent } = {},
) => {
  const candidates = getSelectableCandidates(parent);
  const resolveSelection = createFindSelectionResolver(parent, {
    filter,
    selectUnit,
    filterParent,
  });

  return collectPointHit({
    candidates: candidates.sort((a, b) =>
      compareCandidatesByDisplayOrder(parent, a, b),
    ),
    point,
    intersectsPoint: intersectPoint,
    resolveSelection,
  });
};

export const findIntersectObjects = (
  parent,
  selectionBox,
  { filter, selectUnit, filterParent } = {},
) => {
  const candidates = getSelectableCandidates(parent);
  const resolveSelection = createFindSelectionResolver(parent, {
    filter,
    selectUnit,
    filterParent,
  });
  return collectPolygonHits({
    candidates,
    polygon: selectionBox,
    intersectsPolygon: intersect,
    resolveSelection,
  });
};

export const findIntersectObjectsBySegment = (
  parent,
  p1,
  p2,
  { filter, selectUnit, filterParent } = {},
) => {
  const candidates = getSelectableCandidates(parent);
  const resolveSelection = createFindSelectionResolver(parent, {
    filter,
    selectUnit,
    filterParent,
  });
  return collectSegmentHits({
    candidates,
    segmentStart: p1,
    segmentEnd: p2,
    getEntryT: getSegmentEntryT,
    getCorners: (target) => getObjectLocalCorners(target, parent),
    resolveSelection,
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
