import { describe, expect, it } from 'vitest';
import {
  hasLockedAncestor,
  isInteractionLocked,
  isLocked,
  isResizableCandidate,
  isSelectableCandidate,
} from './interaction-locks';

const createNode = ({
  id,
  locked = false,
  isSelectable = false,
  isResizable = false,
  children = [],
} = {}) => {
  const node = {
    id,
    props: { locked },
    children: [],
    parent: null,
  };

  node.constructor = { isSelectable, isResizable };

  children.forEach((child) => {
    child.parent = node;
    node.children.push(child);
  });

  return node;
};

describe('interaction-locks', () => {
  it('should detect whether the current object is locked', () => {
    expect(isLocked(createNode({ id: 'locked', locked: true }))).toBe(true);
    expect(isLocked(createNode({ id: 'unlocked' }))).toBe(false);
    expect(isLocked(null)).toBe(false);
  });

  it('should detect a locked ancestor unless stopAt is reached', () => {
    const leaf = createNode({ id: 'leaf' });
    const middle = createNode({ id: 'middle', children: [leaf] });
    const root = createNode({ id: 'root', locked: true, children: [middle] });

    expect(hasLockedAncestor(leaf)).toBe(true);
    expect(hasLockedAncestor(leaf, middle)).toBe(false);
    expect(hasLockedAncestor(leaf, root)).toBe(false);
  });

  it('should treat the current object or its ancestors as interaction-locked', () => {
    const child = createNode({ id: 'child' });
    const lockedParent = createNode({
      id: 'locked-parent',
      locked: true,
      children: [child],
    });

    expect(isInteractionLocked(lockedParent)).toBe(true);
    expect(isInteractionLocked(child)).toBe(true);
    expect(isInteractionLocked(child, lockedParent)).toBe(false);
  });

  it('should only mark unlocked selectable objects as selectable candidates', () => {
    const selectable = createNode({ id: 'selectable', isSelectable: true });
    const lockedSelectable = createNode({
      id: 'locked-selectable',
      isSelectable: true,
      locked: true,
    });

    expect(isSelectableCandidate(selectable)).toBe(true);
    expect(isSelectableCandidate(lockedSelectable)).toBe(false);
  });

  it('should only mark unlocked resizable objects as resizable candidates', () => {
    const resizable = createNode({ id: 'resizable', isResizable: true });
    const lockedParent = createNode({
      id: 'locked-parent',
      locked: true,
      children: [resizable],
    });

    expect(isResizableCandidate(resizable)).toBe(false);
    expect(isResizableCandidate(resizable, lockedParent)).toBe(true);
  });
});
