import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Patchmap } from '../../patchmap';

const sampleData = [
  {
    type: 'group',
    id: 'group-1',
    label: 'group-label-1',
    children: [
      {
        type: 'grid',
        id: 'grid-1',
        label: 'grid-label-1',
        cells: [[1, 0, 1]],
        gap: 4,
        item: {
          size: { width: 40, height: 80 },
          components: [
            {
              type: 'background',
              source: { type: 'rect', fill: 'white' },
              tint: 'red',
            },
          ],
        },
      },
      {
        type: 'item',
        id: 'item-1',
        label: 'item-label-1',
        size: 50,
        components: [],
      },
    ],
    attrs: { x: 100, y: 100 },
  },
];

describe('patchmap test', () => {
  let patchmap;
  let element;

  beforeEach(async () => {
    element = document.createElement('div');
    element.style.height = '100svh';
    document.body.appendChild(element);

    patchmap = new Patchmap();
    await patchmap.init(element);
  });

  afterEach(() => {
    // patchmap.destroy();
    // document.body.removeChild(element);
  });

  it('draw', () => {
    patchmap.draw(sampleData);
    expect(patchmap.viewport.children.length).toBe(1);

    const group = patchmap.selector('$..[?(@.id=="group-1")]')[0];
    expect(group).toBeDefined();
    expect(group.id).toBe('group-1');
    expect(group.type).toBe('group');
    expect(group.x).toBe(100);
    expect(group.y).toBe(100);

    const grid = patchmap.selector('$..[?(@.id=="grid-1")]')[0];
    expect(grid).toBeDefined();
    expect(grid.id).toBe('grid-1');
    expect(grid.type).toBe('grid');

    const item = patchmap.selector('$..[?(@.id=="item-1")]')[0];
    expect(item).toBeDefined();
    expect(item.id).toBe('item-1');

    const gridItems = grid.children;
    expect(gridItems.length).toBe(2);
  });
});
