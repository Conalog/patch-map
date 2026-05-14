import { describe, expect, it } from 'vitest';
import { LogicalSceneIndex } from './LogicalSceneIndex';

const selectableType = { isSelectable: true };
const inertType = { isSelectable: false };

const createNode = ({
  id,
  type,
  display,
  parent = null,
  selectable = false,
  children = [],
}) => {
  const node = {
    id,
    type,
    display,
    parent,
    props: {
      attrs: display ? { display } : {},
    },
    children,
    constructor: selectable ? selectableType : inertType,
  };
  for (const child of children) {
    child.parent = node;
  }
  return node;
};

describe('LogicalSceneIndex', () => {
  it('indexes node records by id, type, display, selectable id, and parent child contract', () => {
    const index = new LogicalSceneIndex();
    const child = createNode({
      id: 'child-1',
      type: 'item',
      display: 'panelItem',
      selectable: true,
    });
    const parent = createNode({
      id: 'parent-1',
      type: 'grid',
      display: 'panelGroup',
      children: [child],
    });

    index.addFromNode(parent);
    index.addFromNode(child);

    expect(index.getById('child-1')).toMatchObject({
      id: 'child-1',
      type: 'item',
      display: 'panelItem',
      parentId: 'parent-1',
      selectable: true,
    });
    expect(index.getRefsByType('item')).toEqual([child]);
    expect(index.getRefsByDisplay('panelGroup')).toEqual([parent]);
    expect(index.getChildren('parent-1').map((record) => record.id)).toEqual([
      'child-1',
    ]);
    expect(index.selectableIds.has('child-1')).toBe(true);
  });

  it('moves updated records between buckets without leaving stale ids', () => {
    const index = new LogicalSceneIndex();
    const node = createNode({
      id: 'item-1',
      type: 'item',
      display: 'panelItem',
      selectable: true,
    });

    index.addFromNode(node);
    node.id = 'item-2';
    node.display = 'panelItemActive';
    node.props.attrs.display = 'panelItemActive';
    index.updateFromNode(node);

    expect(index.getById('item-1')).toBe(null);
    expect(index.getById('item-2')?.ref).toBe(node);
    expect(index.getRefsByDisplay('panelItem')).toEqual([]);
    expect(index.getRefsByDisplay('panelItemActive')).toEqual([node]);
    expect(index.selectableIds.has('item-1')).toBe(false);
    expect(index.selectableIds.has('item-2')).toBe(true);
  });

  it('removes records and parent child links', () => {
    const index = new LogicalSceneIndex();
    const parent = createNode({ id: 'parent-1', type: 'grid' });
    const child = createNode({
      id: 'child-1',
      type: 'item',
      parent,
      selectable: true,
    });

    index.addFromNode(parent);
    index.addFromNode(child);
    index.removeFromNode(child);

    expect(index.getById('child-1')).toBe(null);
    expect(index.getRefsByType('item')).toEqual([]);
    expect(index.getChildren('parent-1')).toEqual([]);
    expect(index.selectableIds.has('child-1')).toBe(false);
  });
});
