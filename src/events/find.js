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

const POINT_CANDIDATE_CACHE = new WeakMap();
const DEFAULT_WARM_FRAME_BUDGET_MS = 2;

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

const getIndexedSelectableCandidates = (parent, config) => {
  const sceneIndex = getSceneIndex(parent);
  if (!sceneIndex) return null;

  const candidates = [];
  for (const candidate of sceneIndex.selectable) {
    if (
      candidate?.destroyed ||
      !isDescendantOf(candidate, parent) ||
      !isSelectableCandidate(candidate, parent) ||
      !canResolveCandidate(candidate, config)
    ) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
};

const getSceneIndex = (parent) =>
  parent?.store?.sceneIndex ??
  parent?.children?.find((child) => child?.type === 'canvas')?.store
    ?.sceneIndex ??
  null;

const isDescendantOf = (candidate, parent) => {
  let current = candidate;
  while (current) {
    if (current === parent) return true;
    current = current.parent ?? null;
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
  const indexedPointCandidates = getIndexedPointCandidates(parent, point, {
    filter,
    selectUnit,
  });
  const candidates =
    indexedPointCandidates ??
    getSelectableCandidates(parent, { filter, selectUnit }).sort((a, b) =>
      compareCandidatesByDisplayOrder(parent, a, b),
    );
  const mayContainPoint = createCandidatePointBoundsFilter(parent, selectUnit);
  const resolveSelection = createFindSelectionResolver(parent, {
    filter,
    selectUnit,
    filterParent,
  });

  return collectPointHit({
    candidates,
    point,
    intersectsPoint: intersectPoint,
    mayContainPoint: indexedPointCandidates ? undefined : mayContainPoint,
    resolveSelection,
  });
};

export const findIntersectObjects = (
  parent,
  selectionBox,
  { filter, selectUnit, filterParent } = {},
) => {
  const selectionPolygon = toFlatPoints(
    getObjectLocalCorners(selectionBox, parent),
  );
  const selectionBounds = getFlatBounds(selectionPolygon);
  const indexedPolygonCandidates = getIndexedPolygonCandidates(
    parent,
    selectionBounds,
    { filter, selectUnit },
  );
  const candidates =
    indexedPolygonCandidates ??
    getSelectableCandidates(parent, { filter, selectUnit });
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
    mayIntersectPolygon: indexedPolygonCandidates
      ? undefined
      : mayIntersectPolygon,
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

const getIndexedPointCandidates = (parent, point, config = {}) => {
  if (config.selectUnit !== 'entity') {
    return null;
  }
  const sceneIndex = getSceneIndex(parent);
  if (!sceneIndex) {
    return null;
  }

  const entries = getBoundsCandidateEntries(parent, sceneIndex);
  const candidates = [];
  for (const entry of entries) {
    const candidate = entry.candidate;
    if (
      candidate?.destroyed ||
      !canResolveCandidate(candidate, config) ||
      !boundsContainPoint(entry.bounds, point)
    ) {
      continue;
    }
    candidates.push(candidate);
  }

  return candidates.sort((a, b) =>
    compareCandidatesByDisplayOrder(parent, a, b),
  );
};

const getIndexedPolygonCandidates = (parent, selectionBounds, config = {}) => {
  if (config.selectUnit !== 'entity') {
    return null;
  }
  const sceneIndex = getSceneIndex(parent);
  if (!sceneIndex) {
    return null;
  }

  const entries = getBoundsCandidateEntries(parent, sceneIndex);
  const candidates = [];
  for (const entry of entries) {
    const candidate = entry.candidate;
    if (
      candidate?.destroyed ||
      !canResolveCandidate(candidate, config) ||
      !boundsIntersect(selectionBounds, entry.bounds)
    ) {
      continue;
    }
    candidates.push(candidate);
  }

  return candidates;
};

const getBoundsCandidateEntries = (parent, sceneIndex) => {
  const cached = POINT_CANDIDATE_CACHE.get(parent);
  if (
    cached?.sceneIndex === sceneIndex &&
    cached.version === sceneIndex.version
  ) {
    return cached.entries;
  }

  const entries = [];
  for (const candidate of sceneIndex.selectable) {
    if (
      candidate?.destroyed ||
      !isDescendantOf(candidate, parent) ||
      !isSelectableCandidate(candidate, parent)
    ) {
      continue;
    }
    entries.push({
      candidate,
      bounds: getObjectSizeLocalBounds(candidate, parent),
    });
  }

  POINT_CANDIDATE_CACHE.set(parent, {
    sceneIndex,
    version: sceneIndex.version,
    entries,
  });
  return entries;
};

export const warmFindBoundsCache = (
  parent,
  { frameBudgetMs = DEFAULT_WARM_FRAME_BUDGET_MS } = {},
) => {
  const sceneIndex = getSceneIndex(parent);
  if (!sceneIndex) return;

  const cached = POINT_CANDIDATE_CACHE.get(parent);
  if (
    cached?.sceneIndex === sceneIndex &&
    cached.version === sceneIndex.version
  ) {
    return;
  }

  const candidates = [...sceneIndex.selectable];
  const version = sceneIndex.version;
  const entries = [];
  let index = 0;

  const schedule =
    globalThis.requestAnimationFrame ??
    ((callback) => globalThis.setTimeout(callback, 16));
  const now = () => globalThis.performance?.now?.() ?? Date.now();

  const step = () => {
    if (sceneIndex.version !== version || parent.destroyed) {
      return;
    }

    const startedAt = now();
    while (index < candidates.length) {
      const candidate = candidates[index++];
      if (
        !candidate?.destroyed &&
        isDescendantOf(candidate, parent) &&
        isSelectableCandidate(candidate, parent)
      ) {
        entries.push({
          candidate,
          bounds: getObjectSizeLocalBounds(candidate, parent),
        });
      }

      if (now() - startedAt >= frameBudgetMs) {
        schedule(step);
        return;
      }
    }

    POINT_CANDIDATE_CACHE.set(parent, {
      sceneIndex,
      version,
      entries,
    });
  };

  schedule(step);
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
