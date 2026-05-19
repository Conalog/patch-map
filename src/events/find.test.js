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
import {
  getObjectLocalCorners,
  getObjectSizeLocalBounds,
} from '../utils/transform';
import {
  createFindGeometryCache,
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

  it('should use indexed selectable candidates when a scene index is available', () => {
    const target = createNode({
      id: 'indexed-target',
      type: 'item',
      hit: true,
    });
    const skipped = createNode({
      id: 'skipped',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [target, skipped],
    });
    root.store = {
      sceneIndex: {
        selectable: new Set([target]),
      },
    };

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBe(target);
    expect(intersectPoint).not.toHaveBeenCalledWith(skipped, expect.anything());
  });

  it('should ignore stale indexed candidates that are no longer descendants', () => {
    const staleTarget = createNode({
      id: 'stale-target',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [],
    });
    root.store = {
      sceneIndex: {
        selectable: new Set([staleTarget]),
      },
    };

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBeNull();
    expect(intersectPoint).not.toHaveBeenCalledWith(
      staleTarget,
      expect.anything(),
    );
  });

  it('should keep unindexed overlay candidates such as transformer wireframes selectable', () => {
    const world = createNode({
      id: 'world',
      type: 'canvas',
      isSelectable: false,
      children: [],
    });
    world.store = {
      sceneIndex: {
        selectable: new Set(),
      },
    };
    const wireframe = createNode({
      id: 'wireframe',
      type: 'wireframe',
      hit: true,
    });
    const transformer = createNode({
      id: 'transformer',
      type: 'transformer',
      isSelectable: false,
      children: [wireframe],
    });
    const viewport = createNode({
      id: 'viewport',
      type: 'viewport',
      isSelectable: false,
      children: [world, transformer],
    });

    const result = findIntersectObject(viewport, { x: 0, y: 0 });

    expect(result).toBe(wireframe);
  });

  it('should prefer a higher zIndex candidate during point selection', () => {
    const lower = createNode({
      id: 'lower',
      type: 'item',
      zIndex: 1,
      hit: true,
    });
    const higher = createNode({
      id: 'higher',
      type: 'item',
      zIndex: 2,
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [higher, lower],
    });

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBe(higher);
  });

  it('should prefer the later sibling when point candidates share zIndex', () => {
    const first = createNode({
      id: 'first',
      type: 'item',
      hit: true,
    });
    const second = createNode({
      id: 'second',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [first, second],
    });
    root.store = {
      sceneIndex: {
        selectable: new Set([first, second]),
      },
    };

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBe(second);
  });

  it('should preserve nested sibling display order during point selection', () => {
    const earlierChild = createNode({
      id: 'earlier-child',
      type: 'item',
      hit: true,
    });
    const laterChild = createNode({
      id: 'later-child',
      type: 'item',
      hit: true,
    });
    const earlierGroup = createNode({
      id: 'earlier-group',
      type: 'group',
      isSelectable: false,
      children: [earlierChild],
    });
    const laterGroup = createNode({
      id: 'later-group',
      type: 'group',
      isSelectable: false,
      children: [laterChild],
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [earlierGroup, laterGroup],
    });
    root.store = {
      sceneIndex: {
        selectable: new Set([earlierChild, laterChild]),
      },
    };

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBe(laterChild);
  });

  it('should avoid display-order sibling index work for non-hit candidates', () => {
    const missed = createNode({
      id: 'missed',
      type: 'item',
      hit: false,
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
      children: [missed, target],
    });
    root.getChildIndex = vi.fn(root.getChildIndex.bind(root));
    root.store = {
      sceneIndex: {
        selectable: new Set([missed, target]),
      },
    };

    const result = findIntersectObject(root, { x: 0, y: 0 });

    expect(result).toBe(target);
    expect(root.getChildIndex).not.toHaveBeenCalled();
  });

  it('should reuse entity size bounds only within a provided geometry cache', () => {
    const target = createNode({
      id: 'target',
      type: 'item',
      hit: true,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [target],
    });
    vi.mocked(getObjectSizeLocalBounds).mockReturnValue({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });

    const geometryCache = createFindGeometryCache(root);
    findIntersectObject(
      root,
      { x: 5, y: 5 },
      {
        selectUnit: 'entity',
        geometryCache,
      },
    );
    findIntersectObject(
      root,
      { x: 5, y: 5 },
      {
        selectUnit: 'entity',
        geometryCache,
      },
    );

    expect(getObjectSizeLocalBounds).toHaveBeenCalledTimes(1);

    findIntersectObject(
      root,
      { x: 5, y: 5 },
      {
        selectUnit: 'entity',
        geometryCache: createFindGeometryCache(root),
      },
    );

    expect(getObjectSizeLocalBounds).toHaveBeenCalledTimes(2);
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

  it('should not cache mutable selection box geometry across searches', () => {
    const target = createNode({
      id: 'target',
      type: 'item',
      hit: true,
    });
    const selectionBox = createNode({
      id: 'selection-box',
      type: 'selection-box',
      isSelectable: false,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [target],
    });
    vi.mocked(getObjectLocalCorners).mockImplementation((node) =>
      node === selectionBox ? node.corners : [],
    );
    vi.mocked(toFlatPoints).mockImplementation((points) =>
      points.flatMap((point) => [point.x, point.y]),
    );

    const geometryCache = createFindGeometryCache(root);
    selectionBox.corners = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    findIntersectObjects(root, selectionBox, { geometryCache });

    selectionBox.corners = [
      { x: 20, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
    ];
    findIntersectObjects(root, selectionBox, { geometryCache });

    const selectionBoxCalls = vi
      .mocked(getObjectLocalCorners)
      .mock.calls.filter(([node]) => node === selectionBox);
    expect(selectionBoxCalls).toHaveLength(2);
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

  it('should reuse segment target corners only within a provided geometry cache', () => {
    const target = createNode({
      id: 'target',
      type: 'item',
      hit: true,
      entryT: 0.1,
    });
    const root = createNode({
      id: 'canvas',
      type: 'canvas',
      isSelectable: false,
      children: [target],
    });

    const geometryCache = createFindGeometryCache(root);
    findIntersectObjectsBySegment(
      root,
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { geometryCache },
    );
    findIntersectObjectsBySegment(
      root,
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { geometryCache },
    );

    const targetCalls = vi
      .mocked(getObjectLocalCorners)
      .mock.calls.filter(([node]) => node === target);
    expect(targetCalls).toHaveLength(1);

    findIntersectObjectsBySegment(
      root,
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { geometryCache: createFindGeometryCache(root) },
    );

    const nextTargetCalls = vi
      .mocked(getObjectLocalCorners)
      .mock.calls.filter(([node]) => node === target);
    expect(nextTargetCalls).toHaveLength(2);
  });
});
