const getTargets = (candidate) =>
  candidate.constructor.hitScope === 'children'
    ? candidate.children
    : [candidate];

const selectCandidate = (candidate) => candidate;

export const collectPointHit = ({
  candidates,
  point,
  intersectsPoint,
  resolveSelection = selectCandidate,
}) => {
  for (const candidate of candidates) {
    const targets = getTargets(candidate);

    for (const target of targets) {
      if (!intersectsPoint(target, point)) {
        continue;
      }

      const selection = resolveSelection(candidate);
      if (selection) {
        return selection;
      }
    }
  }

  return null;
};

export const collectPolygonHits = ({
  candidates,
  polygon,
  intersectsPolygon,
  resolveSelection = selectCandidate,
}) => {
  const found = [];

  for (const candidate of candidates) {
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
