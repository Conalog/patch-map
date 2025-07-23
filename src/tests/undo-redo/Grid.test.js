import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: Grid Element', () => {
  const { getPatchmap } = setupPatchmapTests();

  const baseGridData = [
    {
      type: 'grid',
      id: 'grid-1',
      cells: [
        [1, 0, 1],
        [1, 1, 0],
      ],
      gap: 10,
      item: {
        size: { width: 50, height: 50 },
        components: [
          {
            type: 'background',
            id: 'bg-component',
            label: 'bg-component',
            source: { type: 'rect', fill: 'white' },
            tint: 'primary.default',
          },
        ],
      },
      attrs: { x: 100, y: 100 },
    },
  ];

  const getGrid = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="grid-1")]')[0];
  };

  const getGridItems = (patchmap) => {
    return getGrid(patchmap).children;
  };

  it('should undo/redo changes to the "cells" property, altering the number of items', () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseGridData);

    expect(getGridItems(patchmap).length).toBe(4);

    const newCells = [
      [1, 1, 1],
      [1, 1, 1],
    ];
    patchmap.update({
      path: '$..[?(@.id=="grid-1")]',
      changes: { cells: newCells },
      history: true,
    });
    expect(getGridItems(patchmap).length).toBe(6);

    patchmap.undoRedoManager.undo();
    expect(getGridItems(patchmap).length).toBe(4);

    patchmap.undoRedoManager.redo();
    expect(getGridItems(patchmap).length).toBe(6);
  });

  it('should undo/redo changes to the "gap" property, altering item positions', () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseGridData);

    const item1_1 = getGrid(patchmap).children.find(
      (item) => item.id === 'grid-1.1.1',
    );
    const originalPosition = { x: item1_1.x, y: item1_1.y };
    // size (50) + gap (10) = 60. So position is (60, 60).
    expect(originalPosition).toEqual({ x: 60, y: 60 });

    patchmap.update({
      path: '$..[?(@.id=="grid-1")]',
      changes: { gap: 20 },
      history: true,
    });
    const updatedPosition = { x: item1_1.x, y: item1_1.y };
    // size (50) + gap (20) = 70. So position is (70, 70).
    expect(updatedPosition).toEqual({ x: 70, y: 70 });

    patchmap.undoRedoManager.undo();
    expect({ x: item1_1.x, y: item1_1.y }).toEqual(originalPosition);

    patchmap.undoRedoManager.redo();
    expect({ x: item1_1.x, y: item1_1.y }).toEqual(updatedPosition);
  });

  it('should undo/redo changes to the "item.size" property, altering item size and positions', () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseGridData);

    const items = getGridItems(patchmap);
    const item1_1 = items.find((c) => c.id === 'grid-1.1.1');
    const originalSize = { width: items[0].width, height: items[0].height };
    const originalPosition = { x: item1_1.x, y: item1_1.y };
    expect(originalSize).toEqual({ width: 50, height: 50 });
    expect(originalPosition).toEqual({ x: 60, y: 60 });

    patchmap.update({
      path: '$..[?(@.id=="grid-1")]',
      changes: { item: { size: { width: 60, height: 40 } } },
      history: true,
    });
    const updatedSize = { width: items[0].width, height: items[0].height };
    const updatedPosition = { x: item1_1.x, y: item1_1.y };
    expect(updatedSize).toEqual({ width: 60, height: 40 });
    // new pos: x = 60 + 10 = 70; y = 40 + 10 = 50
    expect(updatedPosition).toEqual({ x: 70, y: 50 });

    patchmap.undoRedoManager.undo();
    expect({ width: items[0].width, height: items[0].height }).toEqual(
      originalSize,
    );
    expect({ x: item1_1.x, y: item1_1.y }).toEqual(originalPosition);

    patchmap.undoRedoManager.redo();
    expect({ width: items[0].width, height: items[0].height }).toEqual(
      updatedSize,
    );
    expect({ x: item1_1.x, y: item1_1.y }).toEqual(updatedPosition);
  });

  it('should undo/redo changes to "item.components", altering all items style', () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseGridData);

    const getItemBackground = (item) => item.getChildByLabel('bg-component');

    const originalTint = getItemBackground(getGridItems(patchmap)[0]).tint;
    expect(originalTint).toBe(0x0c73bf); // primary.default

    const newComponents = [
      {
        type: 'background',
        id: 'bg-component',
        source: { type: 'rect', fill: 'red' },
        tint: 'primary.accent', // #EF4444
      },
    ];

    patchmap.update({
      path: '$..[?(@.id=="grid-1")]',
      changes: { item: { components: newComponents } },
      history: true,
    });

    const updatedTint = getItemBackground(getGridItems(patchmap)[0]).tint;
    expect(updatedTint).toBe(0xef4444);

    patchmap.undoRedoManager.undo();
    expect(getItemBackground(getGridItems(patchmap)[0]).tint).toBe(
      originalTint,
    );

    patchmap.undoRedoManager.redo();
    expect(getItemBackground(getGridItems(patchmap)[0]).tint).toBe(updatedTint);
  });

  it('should handle simultaneous changes to multiple properties correctly', () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseGridData);

    const originalState = {
      itemCount: getGridItems(patchmap).length,
      itemSize: { ...getGrid(patchmap).props.item.size },
      gap: getGrid(patchmap).props.gap,
      tint: getGridItems(patchmap)[0].getChildByLabel('bg-component').tint,
    };

    patchmap.update({
      path: '$..[?(@.id=="grid-1")]',
      changes: {
        cells: [
          [1, 1],
          [1, 1],
        ], // Change structure
        gap: 20, // Change layout
        item: {
          // Change item properties
          size: { width: 40, height: 40 },
          components: [
            {
              type: 'background',
              id: 'bg-component',
              source: { type: 'rect', fill: 'blue' },
              tint: 'primary.accent',
            },
          ],
        },
      },
      history: true,
    });

    // Verify updated state
    const updatedGrid = getGrid(patchmap);
    const updatedItems = updatedGrid.children;
    expect(updatedItems.length).toBe(4);
    expect(updatedGrid.props.gap).toStrictEqual({ x: 20, y: 20 });
    expect(updatedGrid.props.item.size.width).toBe(40);
    expect(updatedItems[0].getChildByLabel('bg-component').tint).toBe(0xef4444);

    // --- Undo ---
    patchmap.undoRedoManager.undo();
    const undoneGrid = getGrid(patchmap);
    const undoneItems = undoneGrid.children;
    expect(undoneItems.length).toBe(originalState.itemCount);
    expect(undoneGrid.props.gap).toStrictEqual(originalState.gap);
    expect(undoneGrid.props.item.size.width).toBe(originalState.itemSize.width);
    expect(undoneItems[0].getChildByLabel('bg-component').tint).toBe(
      originalState.tint,
    );

    // --- Redo ---
    patchmap.undoRedoManager.redo();
    const redoneGrid = getGrid(patchmap);
    const redoneItems = redoneGrid.children;
    expect(redoneItems.length).toBe(4);
    expect(redoneGrid.props.gap).toStrictEqual({ x: 20, y: 20 });
    expect(redoneGrid.props.item.size.width).toBe(40);
    expect(redoneItems[0].getChildByLabel('bg-component').tint).toBe(0xef4444);
  });
});
