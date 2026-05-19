const getTargets = (candidate) =>
  candidate.constructor.hitScope === 'children'
    ? candidate.children
    : [candidate];

const selectCandidate = (candidate) => candidate;

export const collectPointHit = ({
  candidates,
  point,
  intersectsPoint,
  mayContainPoint = () => true,
  resolveSelection = selectCandidate,
  compareCandidates = null,
}) => {
  let bestCandidate = null;
  let bestSelection = null;

  for (const candidate of candidates) {
    if (!mayContainPoint(candidate, point)) {
      continue;
    }

    const targets = getTargets(candidate);

    for (const target of targets) {
      if (!intersectsPoint(target, point)) {
        continue;
      }

      const selection = resolveSelection(candidate);
      if (selection) {
        if (!compareCandidates) {
          return selection;
        }
        if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
          bestCandidate = candidate;
          bestSelection = selection;
        }
        break;
      }
    }
  }

  return bestSelection;
};

export const collectPolygonHits = ({
  candidates,
  polygon,
  intersectsPolygon,
  mayIntersectPolygon = () => true,
  resolveSelection = selectCandidate,
}) => {
  const found = [];

  for (const candidate of candidates) {
    if (!mayIntersectPolygon(candidate, polygon)) {
      continue;
    }

    const targets = getTargets(candidate);

    for (const target of targets) {
      if (!intersectsPolygon(polygon, target)) {
        continue;
      }

      const selection = resolveSelection(candidate);
      if (selection) {
        found.push(selection);
        break;
      }
    }
  }

  return Array.from(new Set(found));
};

export const collectSegmentHits = ({
  candidates,
  segmentStart,
  segmentEnd,
  getEntryT,
  getCorners,
  resolveSelection = selectCandidate,
}) => {
  const foundMap = new Map();

  for (const candidate of candidates) {
    const targets = getTargets(candidate);

    for (const target of targets) {
      const corners = getCorners(target);
      const t = getEntryT(target, segmentStart, segmentEnd, corners);

      if (t === null) {
        continue;
      }

      const selection = resolveSelection(candidate);
      if (selection) {
        const currentT = foundMap.get(selection);
        if (currentT === undefined || t < currentT) {
          foundMap.set(selection, t);
        }
        break;
      }
    }
  }

  return Array.from(foundMap.entries())
    .toSorted((a, b) => a[1] - b[1])
    .map((entry) => entry[0]);
};
