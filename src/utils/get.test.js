import { describe, expect, it } from 'vitest';
import { collectCandidates } from './get';

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
