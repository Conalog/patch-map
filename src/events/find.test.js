import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/intersects/intersect-point', () => ({
  intersectPoint: vi.fn((target) => Boolean(target.hit)),
}));

vi.mock('../utils/intersects/intersect', () => ({
  intersect: vi.fn((selectionBox, target) => Boolean(target.hit)),
}));

vi.mock('../utils/intersects/segment-polygon-t', () => ({
  getSegmentEntryT: vi.fn((target) =>
    target.hit ? (target.entryT ?? 0) : null,
  ),
}));

vi.mock('../utils/transform', () => ({
  getObjectLocalCorners: vi.fn(() => []),
}));

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
});

describe('findIntersectObjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

describe('findIntersectObjectsBySegment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
