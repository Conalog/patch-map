import { describe, expect, it } from 'vitest';
import {
  collectCandidates,
  hasLockedAncestor,
  isInteractionLocked,
  isLocked,
} from './get';

const createNode = ({ id, locked = false, children = [] } = {}) => {
  const node = {
    id,
    props: { locked },
    children: [],
    parent: null,
  };

  children.forEach((child) => {
    child.parent = node;
    node.children.push(child);
  });

  return node;
};

describe('locking helpers', () => {
  it('should detect whether the current object is locked', () => {
    const lockedNode = createNode({ id: 'locked-node', locked: true });
    const unlockedNode = createNode({ id: 'unlocked-node' });

    expect(isLocked(lockedNode)).toBe(true);
    expect(isLocked(unlockedNode)).toBe(false);
    expect(isLocked(null)).toBe(false);
  });

  it('should detect a locked ancestor in a deep tree', () => {
    const leaf = createNode({ id: 'leaf' });
    const middle = createNode({ id: 'middle', children: [leaf] });
    createNode({ id: 'root', locked: true, children: [middle] });

    expect(hasLockedAncestor(leaf)).toBe(true);
    expect(hasLockedAncestor(middle)).toBe(true);
  });

  it('should stop ancestor traversal when stopAt is reached', () => {
    const leaf = createNode({ id: 'leaf' });
    const unlockedParent = createNode({
      id: 'unlocked-parent',
      children: [leaf],
    });
    const lockedRoot = createNode({
      id: 'locked-root',
      locked: true,
      children: [unlockedParent],
    });

    expect(hasLockedAncestor(leaf, unlockedParent)).toBe(false);
    expect(hasLockedAncestor(leaf, lockedRoot)).toBe(false);
    expect(hasLockedAncestor(leaf)).toBe(true);
  });

  it('should treat the current object or any ancestor as interaction-locked', () => {
    const child = createNode({ id: 'child' });
    const lockedParent = createNode({
      id: 'locked-parent',
      locked: true,
      children: [child],
    });
    const directlyLocked = createNode({ id: 'directly-locked', locked: true });

    expect(isInteractionLocked(directlyLocked)).toBe(true);
    expect(isInteractionLocked(child)).toBe(true);
    expect(isInteractionLocked(child, lockedParent)).toBe(false);
  });
});

describe('collectCandidates', () => {
  it('should stop traversing descendants when shouldDescend returns false', () => {
    const visited = [];
    const lockedGrandchild = createNode({ id: 'locked-grandchild' });
    const lockedChild = createNode({
      id: 'locked-child',
      children: [lockedGrandchild],
    });
    const lockedGroup = createNode({
      id: 'locked-group',
      locked: true,
      children: [lockedChild],
    });
    const unlockedRect = createNode({ id: 'unlocked-rect' });
    const root = createNode({
      id: 'canvas',
      children: [unlockedRect, lockedGroup],
    });

    const candidates = collectCandidates(
      root,
      (child) => {
        visited.push(child.id);
        return !child.props.locked;
      },
      {
        shouldDescend: (child) => !child.props.locked,
      },
    );

    expect(visited).toEqual(
      expect.arrayContaining(['locked-group', 'unlocked-rect']),
    );
    expect(visited).not.toEqual(
      expect.arrayContaining(['locked-child', 'locked-grandchild']),
    );
    expect(candidates).toEqual([unlockedRect]);
  });
});
