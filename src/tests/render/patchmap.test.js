import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPatchmapTests } from './patchmap.setup';

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
        cells: [
          [1, 1, 1],
          [0, 1, 1],
        ],
        gap: 5,
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
        attrs: { x: 100, y: 100 },
      },
      {
        type: 'item',
        id: 'item-1',
        label: 'item-label-1',
        size: 50,
        components: [
          {
            type: 'background',
            id: 'item-background',
            source: {
              type: 'rect',
              fill: 'white',
              borderWidth: 2,
              borderColor: 'primary.default',
              radius: 6,
            },
          },
          { type: 'text', text: 'text-1' },
          { type: 'text', text: 'text-2' },
          { type: 'text', id: 'new-text' },
        ],
        attrs: { x: 200, y: 300 },
      },
    ],
  },
  {
    type: 'relations',
    id: 'relations-1',
    label: 'relations-label-1',
    links: [
      { source: 'grid-1.0.0', target: 'grid-1.0.1' },
      { source: 'grid-1.0.1', target: 'grid-1.0.2' },
      { source: 'grid-1.0.2', target: 'grid-1.1.1' },
      { source: 'grid-1.1.1', target: 'grid-1.1.2' },
      { source: 'grid-1.1.2', target: 'item-1' },
    ],
    style: { width: 5 },
  },
];

describe('patchmap test', () => {
  const { getPatchmap } = setupPatchmapTests();

  it('draw', () => {
    const patchmap = getPatchmap();
    patchmap.draw(sampleData);
    expect(patchmap.viewport.children.length).toBe(2);

    const group = patchmap.selector('$..[?(@.id=="group-1")]')[0];
    expect(group).toBeDefined();
    expect(group.id).toBe('group-1');
    expect(group.type).toBe('group');
    expect(group.x).toBe(0);
    expect(group.y).toBe(0);

    const grid = patchmap.selector('$..[?(@.id=="grid-1")]')[0];
    expect(grid).toBeDefined();
    expect(grid.id).toBe('grid-1');
    expect(grid.type).toBe('grid');

    const item = patchmap.selector('$..[?(@.id=="item-1")]')[0];
    expect(item).toBeDefined();
    expect(item.id).toBe('item-1');

    const itemChildren = [...item.children];
    expect(itemChildren.length).toBe(4);
    expect(itemChildren[0].type).toBe('background');
    expect(itemChildren[1].type).toBe('text');
    expect(itemChildren[2].type).toBe('text');

    const gridItems = grid.children;
    expect(gridItems.length).toBe(5);
  });

  describe('update', () => {
    let patchmap = null;
    beforeEach(() => {
      patchmap = getPatchmap();
      patchmap.draw(sampleData);
    });

    it('should update a single property', () => {
      patchmap.update({
        path: '$..[?(@.id=="group-1")]',
        changes: { attrs: { x: 200 } },
      });
      const group = patchmap.selector('$..[?(@.id=="group-1")]')[0];
      expect(group.x).toBe(200);
      expect(group.y).toBe(0);
    });

    it('should update multiple properties simultaneously', () => {
      patchmap.update({
        path: '$..[?(@.id=="group-1")]',
        changes: { attrs: { x: 300, y: 300 } },
      });
      const group = patchmap.selector('$..[?(@.id=="group-1")]')[0];
      expect(group.x).toBe(300);
      expect(group.y).toBe(300);
    });

    it('should update a property of a nested object', () => {
      patchmap.update({
        path: '$..[?(@.id=="grid-1")]',
        changes: {
          item: {
            components: [{ type: 'background', source: { fill: 'blue' } }],
          },
        },
      });
      const background = patchmap.selector(
        '$..[?(@.id=="grid-1")]..[?(@.type=="background")]',
      )[0];
      expect(background.props.source.fill).toBe('blue');
    });

    it('should replace an array completely when arrayMerge is "replace"', () => {
      const initialGridItemCount = patchmap.selector(
        '$..[?(@.id=="grid-1")]',
      )[0].children.length;
      expect(initialGridItemCount).toBe(5);
      patchmap.update({
        path: '$..[?(@.id=="grid-1")]',
        changes: {
          cells: [[1, 1, 1, 1]],
        },
        arrayMerge: 'replace',
      });
      const gridItems = patchmap.selector('$..[?(@.id=="grid-1")]')[0].children;
      expect(gridItems.length).toBe(4);
    });

    it('should fail silently when updating a non-existent element', () => {
      expect(() => {
        patchmap.update({
          path: '$..[?(@.id=="non-existent-id")]',
          changes: { attrs: { x: 999 } },
        });
      }).not.toThrow();
    });

    it('should update an element using a direct reference via the "elements" property', () => {
      const itemToUpdate = patchmap.selector('$..[?(@.id=="item-1")]')[0];
      patchmap.update({
        elements: itemToUpdate,
        changes: { label: 'updated-label' },
      });
      expect(itemToUpdate.label).toBe('updated-label');
    });

    it('should apply a relative transform with relativeTransform: true', () => {
      patchmap.update({
        path: '$..[?(@.id=="group-1")]',
        changes: { attrs: { x: 300, y: 300 } },
      });
      patchmap.update({
        path: '$..[?(@.id=="group-1")]',
        changes: { attrs: { x: 50, y: -50 } },
        relativeTransform: true,
      });
      const group = patchmap.selector('$..[?(@.id=="group-1")]')[0];
      expect(group.x).toBe(350);
      expect(group.y).toBe(250);
    });

    it('should handle array updates with duplicate ids correctly', () => {
      patchmap.update({
        path: '$..[?(@.id=="item-1")]',
        changes: {
          components: [
            { type: 'text', id: 'new-text', text: '2' },
            { type: 'text', id: 'B', text: '99' },
            { type: 'text', id: 'new-text', text: '3' },
          ],
        },
      });

      const item = patchmap.selector('$..[?(@.id=="item-1")]')[0];
      expect(item.children.length).toBe(6);

      const newTextChildren = item.children.filter((c) => c.id === 'new-text');
      expect(newTextChildren.length).toBe(2);
      expect(newTextChildren.map((c) => c.text).sort()).toEqual(['2', '3']);

      const childB = item.children.find((c) => c.id === 'B');
      expect(childB).toBeDefined();
      expect(childB.text).toBe('99');
    });
  });

  describe('select', () => {
    let patchmap;
    let onSelect;
    let onOver;
    let onDragSelect;

    beforeEach(() => {
      vi.useFakeTimers();
      patchmap = getPatchmap();
      patchmap.draw(sampleData);
      onSelect = vi.fn();
      onOver = vi.fn();
      onDragSelect = vi.fn();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('when draggable is false', () => {
      beforeEach(() => {
        patchmap.select({
          enabled: true,
          draggable: false,
          selectUnit: 'grid',
          onSelect,
          onOver,
          onDragSelect,
        });
      });

      describe.each([
        {
          state: 'default viewport',
          transform: () => {},
        },
        {
          state: 'scaled 0.5 viewport',
          transform: (viewport) => viewport.setZoom(0.5, true),
        },
        {
          state: 'scaled 5 viewport',
          transform: (viewport) => viewport.setZoom(5, true),
        },
        {
          state: 'panned viewport',
          transform: (viewport) => viewport.position.set(400, 400),
        },
        {
          state: 'scaled and panned viewport #2',
          transform: (viewport) => {
            viewport.setZoom(5, true);
            patchmap.viewport.moveCenter(200, 200);
          },
        },
      ])('with $state', ({ transform }) => {
        it.each([
          {
            case: 'clicking inside the Grid #1',
            position: { x: 100, y: 100 },
            expectedId: 'grid-1',
          },
          {
            case: 'clicking inside the Grid #2',
            position: { x: 229, y: 100 },
            expectedId: 'grid-1',
          },
          {
            case: 'clicking inside the Grid #3',
            position: { x: 229, y: 140 },
            expectedId: 'grid-1',
          },
          {
            case: 'clicking inside the Item',
            position: { x: 215, y: 315 },
            expectedId: 'item-1',
          },
          {
            case: 'clicking on an empty area #1',
            position: { x: 0, y: 0 },
            expectedId: null,
          },
          {
            case: 'clicking on an empty area #2',
            position: { x: 231, y: 100 },
            expectedId: null,
          },
          {
            case: 'clicking on an empty area #3',
            position: { x: 235, y: 100 },
            expectedId: null,
          },
          {
            case: 'clicking on an empty area #4',
            position: { x: 235, y: 220 },
            expectedId: null,
          },
          {
            case: 'clicking on an empty area #5',
            position: { x: 210, y: 266 },
            expectedId: null,
          },
          {
            case: 'clicking on an empty area #6',
            position: { x: 200, y: 280 },
            expectedId: null,
          },
          {
            case: 'clicking inside the Relations',
            position: { x: 220, y: 280 },
            expectedId: 'relations-1',
          },
        ])(
          'should select the correct element when $case',
          async ({ position, expectedId }) => {
            const viewport = patchmap.viewport;
            transform(viewport);
            await vi.advanceTimersByTimeAsync(100);

            viewport.emit('mousedown', {
              global: viewport.toGlobal(position),
              stopPropagation: () => {},
            });
            viewport.emit('mouseup', {
              global: viewport.toGlobal(position),
              stopPropagation: () => {},
            });

            expect(onSelect).toHaveBeenCalledTimes(1);
            const receivedElement = onSelect.mock.calls[0][0];

            if (expectedId === null) {
              expect(receivedElement).toBeNull();
            } else {
              expect(receivedElement).toBeDefined();
              expect(receivedElement.id).toBe(expectedId);
            }

            expect(onDragSelect).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('with selectUnit option', () => {
      it.each([
        {
          selectUnit: 'entity',
          clickPosition: { x: 105, y: 105 },
          expectedId: 'grid-1.0.0',
        },
        {
          selectUnit: 'grid',
          clickPosition: { x: 105, y: 105 },
          expectedId: 'grid-1',
        },
        {
          selectUnit: 'closestGroup',
          clickPosition: { x: 105, y: 105 },
          expectedId: 'group-1',
        },
        {
          selectUnit: 'highestGroup',
          clickPosition: { x: 105, y: 105 },
          expectedId: 'group-2',
        },
        {
          selectUnit: 'entity',
          clickPosition: { x: 210, y: 310 },
          expectedId: 'item-1',
        },
        {
          selectUnit: 'closestGroup',
          clickPosition: { x: 210, y: 310 },
          expectedId: 'group-1',
        },
        {
          selectUnit: 'highestGroup',
          clickPosition: { x: 210, y: 310 },
          expectedId: 'group-2',
        },
      ])(
        'should return the correct object when selectUnit is "$selectUnit"',
        async ({ selectUnit, clickPosition, expectedId }) => {
          const patchmap = getPatchmap();
          patchmap.draw([
            { type: 'group', id: 'group-2', children: sampleData },
          ]);
          await vi.advanceTimersByTimeAsync(100);

          const onSelect = vi.fn();

          patchmap.select({
            enabled: true,
            selectUnit: selectUnit,
            onSelect: onSelect,
          });

          const viewport = patchmap.viewport;
          viewport.emit('mousedown', {
            global: viewport.toGlobal(clickPosition),
            stopPropagation: () => {},
          });
          viewport.emit('mouseup', {
            global: viewport.toGlobal(clickPosition),
            stopPropagation: () => {},
          });

          expect(onSelect).toHaveBeenCalledTimes(1);
          const selectedObject = onSelect.mock.calls[0][0];

          if (expectedId) {
            expect(selectedObject).toBeDefined();
            expect(selectedObject.id).toBe(expectedId);
          } else {
            expect(selectedObject).toBeNull();
          }
        },
      );
    });
  });
});
