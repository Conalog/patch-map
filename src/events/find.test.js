import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/intersects/intersect-point', () => ({
  intersectPoint: vi.fn((target) => Boolean(target.hit)),
}));

vi.mock('../utils/intersects/intersect', () => ({
  boundsContainPoint: vi.fn(
    (bounds, point) =>
      !bounds ||
      (point.x >= bounds.minX &&
        point.x <= bounds.maxX &&
        point.y >= bounds.minY &&
        point.y <= bounds.maxY),
  ),
  boundsIntersect: vi.fn(
    (left, right) =>
      !left ||
      !right ||
      (left.minX <= right.maxX &&
        left.maxX >= right.minX &&
        left.minY <= right.maxY &&
        left.maxY >= right.minY),
  ),
  getFlatBounds: vi.fn((points) => {
    if (!points.length) return null;
    return {
      minX: Math.min(...points.filter((_, index) => index % 2 === 0)),
      minY: Math.min(...points.filter((_, index) => index % 2 === 1)),
      maxX: Math.max(...points.filter((_, index) => index % 2 === 0)),
      maxY: Math.max(...points.filter((_, index) => index % 2 === 1)),
    };
  }),
  intersect: vi.fn((_selectionBox, target) => Boolean(target.hit)),
  intersectLocalPoints: vi.fn((_selectionBox, target) => Boolean(target.hit)),
  toFlatPoints: vi.fn(() => []),
}));

vi.mock('../utils/intersects/segment-polygon-t', () => ({
  getSegmentEntryT: vi.fn((target) =>
    target.hit ? (target.entryT ?? 0) : null,
  ),
}));

vi.mock('../utils/transform', () => ({
  getObjectLocalCorners: vi.fn(() => []),
  getObjectSizeLocalBounds: vi.fn(() => null),
}));

import {
  intersectLocalPoints,
  toFlatPoints,
} from '../utils/intersects/intersect';
import { intersectPoint } from '../utils/intersects/intersect-point';
import { getObjectSizeLocalBounds } from '../utils/transform';
import {
  findIntersectObject,
  findIntersectObjects,
  findIntersectObjectsBySegment,
} from './find';

const createNode = ({
  id,
  type = 'rect',
  locked = false,
  isSelectable = true,
  hitScope = 'self',
  zIndex = 0,
  hit = false,
  children = [],
} = {}) => {
  const node = {
    id,
    type,
    zIndex,
    hit,
    props: { locked },
    children: [],
    parent: null,
    getChildIndex(child) {
      return this.children.indexOf(child);
    },
  };

  node.constructor = { isSelectable, hitScope };

  children.forEach((child) => {
    child.parent = node;
    node.children.push(child);
  });

  return node;
};

describe('findIntersectObject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getObjectSizeLocalBounds).mockReturnValue(null);
    vi.mocked(toFlatPoints).mockReturnValue([]);
  });

  it('should return null when the search root itself is locked', () => {
    const unlockedChild = createNode({
      id: 'unlocked-child',
      hit: true,
    });
    const lockedGroup = createNode({
      id: 'locked-group',
      type: 'group',
      locked: true,
      isSelectable: false,
      children: [unlockedChild],
    });

    const result = findIntersectObject(lockedGroup, { x: 0, y: 0 });

    expect(result).toBeNull();
  });

  it('should ignore a directly locked selectable object', () => {
    const lockedRect = createNode({
      id: 'locked-rect',
      locked: true,
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [lockedRect],
    });

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBeNull();
  });

  it('should ignore a selectable object under a locked ancestor', () => {
    const unlockedRect = createNode({
      id: 'unlocked-rect',
      hit: true,
    });
    const lockedChild = createNode({
      id: 'locked-child',
      hit: true,
    });
    const lockedGroup = createNode({
      id: 'locked-group',
      type: 'group',
      locked: true,
      isSelectable: false,
      children: [lockedChild],
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [unlockedRect, lockedGroup],
    });

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBe(unlockedRect);
  });

  it('should resolve the selected group before applying the filter', () => {
    const child = createNode({
      id: 'child',
      hit: true,
    });
    const group = createNode({
      id: 'group',
      type: 'group',
      children: [child],
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [group],
    });

    const result = findIntersectObject(
      root,
      { x: 0, y: 0 },
      {
        selectUnit: 'closestGroup',
        filter: (target) => target.type === 'group',
      },
    );

    expect(result).toBe(group);
  });

  it('should skip filtered entity candidates before point hit-testing', () => {
    const skippedChild = createNode({
      id: 'skipped-child',
      type: 'rect',
      hit: true,
    });
    const target = createNode({
      id: 'target',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [skippedChild, target],
    });

    const result = findIntersectObject(
      root,
      { x: 0, y: 0 },
      {
        selectUnit: 'entity',
        filter: (candidate) => candidate.type === 'item',
      },
    );

    expect(result).toBe(target);
    expect(intersectPoint).not.toHaveBeenCalledWith(
      skippedChild,
      expect.anything(),
    );
  });

  it('should skip out-of-bounds entity candidates before point hit-testing', () => {
    const farTarget = createNode({
      id: 'far-target',
      type: 'item',
      hit: true,
    });
    const target = createNode({
      id: 'target',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [target, farTarget],
    });
    vi.mocked(getObjectSizeLocalBounds).mockImplementation((candidate) =>
      candidate === farTarget
        ? { minX: 0, minY: 0, maxX: 10, maxY: 10 }
        : { minX: 40, minY: 40, maxX: 60, maxY: 60 },
    );

    const result = findIntersectObject(
      root,
      { x: 50, y: 50 },
      {
        selectUnit: 'entity',
        filter: (candidate) => candidate.type === 'item',
      },
    );

    expect(result).toBe(target);
    expect(intersectPoint).not.toHaveBeenCalledWith(
      farTarget,
      expect.anything(),
    );
  });
});

describe('findIntersectObjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getObjectSizeLocalBounds).mockReturnValue(null);
    vi.mocked(toFlatPoints).mockReturnValue([]);
  });

  it('should return an empty list when the search root itself is locked', () => {
    const unlockedChild = createNode({
      id: 'unlocked-child',
      hit: true,
    });
    const lockedGroup = createNode({
      id: 'locked-group',
      type: 'group',
      locked: true,
      isSelectable: false,
      children: [unlockedChild],
    });

    const result = findIntersectObjects(lockedGroup, {});

    expect(result).toEqual([]);
  });

  it('should exclude locked objects from box selection results', () => {
    const unlockedRect = createNode({
      id: 'unlocked-rect',
      hit: true,
    });
    const lockedRect = createNode({
      id: 'locked-rect',
      locked: true,
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [unlockedRect, lockedRect],
    });

    const result = findIntersectObjects(root, {});

    expect(result).toEqual([unlockedRect]);
  });

  it('should skip filtered entity candidates before final box hit-testing', () => {
    const skippedChild = createNode({
      id: 'skipped-child',
      type: 'rect',
      hit: true,
    });
    const target = createNode({
      id: 'target',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [skippedChild, target],
    });

    const result = findIntersectObjects(
      root,
      {},
      {
        selectUnit: 'entity',
        filter: (candidate) => candidate.type === 'item',
      },
    );

    expect(result).toEqual([target]);
    expect(intersectLocalPoints).not.toHaveBeenCalledWith(
      expect.anything(),
      skippedChild,
      expect.anything(),
    );
  });

  it('should skip out-of-bounds entity candidates before final box hit-testing', () => {
    const farTarget = createNode({
      id: 'far-target',
      type: 'item',
      hit: true,
    });
    const target = createNode({
      id: 'target',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [target, farTarget],
    });
    vi.mocked(getObjectSizeLocalBounds).mockImplementation((candidate) =>
      candidate === farTarget
        ? { minX: 0, minY: 0, maxX: 10, maxY: 10 }
        : { minX: 40, minY: 40, maxX: 60, maxY: 60 },
    );
    vi.mocked(toFlatPoints).mockReturnValue([45, 45, 55, 45, 55, 55, 45, 55]);

    const result = findIntersectObjects(
      root,
      {},
      {
        selectUnit: 'entity',
        filter: (candidate) => candidate.type === 'item',
      },
    );

    expect(result).toEqual([target]);
    expect(intersectLocalPoints).not.toHaveBeenCalledWith(
      expect.anything(),
      farTarget,
      expect.anything(),
    );
  });
});

describe('findIntersectObjectsBySegment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getObjectSizeLocalBounds).mockReturnValue(null);
    vi.mocked(toFlatPoints).mockReturnValue([]);
  });

  it('should return an empty list when the search root itself is locked', () => {
    const unlockedChild = createNode({
      id: 'unlocked-child',
      hit: true,
      entryT: 0.1,
    });
    const lockedGroup = createNode({
      id: 'locked-group',
      type: 'group',
      locked: true,
      isSelectable: false,
      children: [unlockedChild],
    });

    const result = findIntersectObjectsBySegment(
      lockedGroup,
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );

    expect(result).toEqual([]);
  });

  it('should exclude descendants of locked ancestors from segment selection', () => {
    const unlockedRect = createNode({
      id: 'unlocked-rect',
      hit: true,
      entryT: 0.5,
    });
    const lockedChild = createNode({
      id: 'locked-child',
      hit: true,
      entryT: 0.1,
    });
    const lockedGroup = createNode({
      id: 'locked-group',
      type: 'group',
      locked: true,
      isSelectable: false,
      children: [lockedChild],
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [unlockedRect, lockedGroup],
    });

    const result = findIntersectObjectsBySegment(
      root,
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );

    expect(result).toEqual([unlockedRect]);
  });
});
