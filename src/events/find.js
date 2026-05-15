import { collectCandidates } from '../utils/get';
import {
  isInteractionLocked,
  isSelectableCandidate,
} from '../utils/interaction-locks';
import {
  boundsContainPoint,
  boundsIntersect,
  getFlatBounds,
  intersectLocalPoints,
  toFlatPoints,
} from '../utils/intersects/intersect';
import { intersectPoint } from '../utils/intersects/intersect-point';
import { getSegmentEntryT } from '../utils/intersects/segment-polygon-t';
import {
  getObjectLocalCorners,
  getObjectSizeLocalBounds,
} from '../utils/transform';
import {
  collectPointHit,
  collectPolygonHits,
  collectSegmentHits,
} from './find-helpers';
import { getSelectObject } from './utils';

const getSelectableCandidates = (parent, config = {}) => {
  if (isInteractionLocked(parent)) {
    return [];
  }

  const indexedCandidates = getIndexedSelectableCandidates(parent, config);
  if (indexedCandidates) {
    return indexedCandidates;
  }

  return collectCandidates(
    parent,
    (child) =>
      isSelectableCandidate(child, parent) &&
      canResolveCandidate(child, config),
    { shouldDescend: (child) => !isInteractionLocked(child, parent) },
  );
};

const getIndexedSelectableCandidates = (parent, config = {}) => {
  const indexedRoot = getIndexedSceneRoot(parent);
  const sceneIndex = indexedRoot?.store?.sceneIndex;
  if (!sceneIndex?.selectable) {
    return null;
  }

  const candidates = [...sceneIndex.selectable].filter(
    (child) =>
      isDescendantOf(child, parent) &&
      isSelectableCandidate(child, parent) &&
      canResolveCandidate(child, config),
  );

  const extraRoots =
    indexedRoot === parent
      ? []
      : (parent?.children?.filter((child) => child !== indexedRoot) ?? []);
  if (extraRoots.length === 0) {
    return candidates;
  }

  candidates.push(
    ...collectCandidates(
      { children: extraRoots },
      (child) =>
        isSelectableCandidate(child, parent) &&
        canResolveCandidate(child, config),
      { shouldDescend: (child) => !isInteractionLocked(child, parent) },
    ),
  );
  return candidates;
};

const getIndexedSceneRoot = (parent) => {
  if (parent?.store?.sceneIndex) {
    return parent;
  }
  return parent?.children?.find((child) => child?.store?.sceneIndex) ?? null;
};

const isDescendantOf = (candidate, parent) => {
  let current = candidate;
  while (current) {
    if (current === parent) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const canResolveCandidate = (candidate, { filter, selectUnit } = {}) => {
  if (selectUnit !== 'entity' || !filter) {
    return true;
  }
  return filter(candidate);
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
  const candidates = getSelectableCandidates(parent, { filter, selectUnit });
  const mayContainPoint = createCandidatePointBoundsFilter(parent, selectUnit);
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
    mayContainPoint,
    resolveSelection,
  });
};

export const findIntersectObjects = (
  parent,
  selectionBox,
  { filter, selectUnit, filterParent } = {},
) => {
  const candidates = getSelectableCandidates(parent, { filter, selectUnit });
  const selectionPolygon = toFlatPoints(
    getObjectLocalCorners(selectionBox, parent),
  );
  const selectionBounds = getFlatBounds(selectionPolygon);
  const mayIntersectPolygon = createCandidatePolygonBoundsFilter(
    parent,
    selectUnit,
    selectionBounds,
  );
  const resolveSelection = createFindSelectionResolver(parent, {
    filter,
    selectUnit,
    filterParent,
  });
  return collectPolygonHits({
    candidates,
    polygon: selectionPolygon,
    intersectsPolygon: (polygon, target) =>
      intersectLocalPoints(polygon, target, parent),
    mayIntersectPolygon,
    resolveSelection,
  });
};

export const findIntersectObjectsBySegment = (
  parent,
  p1,
  p2,
  { filter, selectUnit, filterParent } = {},
) => {
  const candidates = getSelectableCandidates(parent, { filter, selectUnit });
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

const createCandidatePointBoundsFilter = (viewport, selectUnit) => {
  if (selectUnit !== 'entity') {
    return undefined;
  }

  return (candidate, point) =>
    boundsContainPoint(getObjectSizeLocalBounds(candidate, viewport), point);
};

const createCandidatePolygonBoundsFilter = (
  viewport,
  selectUnit,
  selectionBounds,
) => {
  if (selectUnit !== 'entity') {
    return undefined;
  }

  return (candidate) =>
    boundsIntersect(
      selectionBounds,
      getObjectSizeLocalBounds(candidate, viewport),
    );
};
