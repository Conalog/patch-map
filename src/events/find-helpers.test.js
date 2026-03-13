import { describe, expect, it } from 'vitest';
import {
  collectPointHit,
  collectPolygonHits,
  collectSegmentHits,
} from './find-helpers';

const createNode = ({
  id,
  hitScope = 'self',
  children = [],
  pointHit = false,
  polygonHit = false,
  entryT = null,
} = {}) => {
  const node = {
    id,
    children: [],
    parent: null,
    pointHit,
    polygonHit,
    entryT,
  };

  node.constructor = { hitScope };

  children.forEach((child) => {
    child.parent = node;
    node.children.push(child);
  });

  return node;
};

describe('find-helpers', () => {
  it('should return the first matching point-hit selection', () => {
    const childTarget = createNode({ id: 'child-target', pointHit: true });
    const skipped = createNode({ id: 'skipped' });
    const candidate = createNode({
      id: 'candidate',
      hitScope: 'children',
      children: [skipped, childTarget],
    });

    const result = collectPointHit({
      candidates: [candidate],
      point: { x: 0, y: 0 },
      intersectsPoint: (target) => target.pointHit,
      resolveSelection: (current) => current,
    });

    expect(result).toBe(candidate);
  });

  it('should collect unique polygon-hit selections', () => {
    const duplicateTarget = createNode({
      id: 'duplicate-target',
      polygonHit: true,
    });
    const candidate = createNode({
      id: 'candidate',
      hitScope: 'children',
      children: [
        duplicateTarget,
        createNode({ id: 'extra', polygonHit: true }),
      ],
    });

    const result = collectPolygonHits({
      candidates: [candidate, candidate],
      polygon: {},
      intersectsPolygon: (_polygon, target) => target.polygonHit,
      resolveSelection: (current) => current,
    });

    expect(result).toEqual([candidate]);
  });

  it('should collect segment hits ordered by entry t', () => {
    const near = createNode({ id: 'near', entryT: 0.1 });
    const far = createNode({ id: 'far', entryT: 0.6 });

    const result = collectSegmentHits({
      candidates: [far, near],
      segmentStart: { x: 0, y: 0 },
      segmentEnd: { x: 1, y: 1 },
      getEntryT: (target) => target.entryT,
      getCorners: () => [],
      resolveSelection: (current) => current,
    });

    expect(result).toEqual([near, far]);
  });
});
