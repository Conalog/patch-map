import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: Relations Element', () => {
  const { getPatchmap } = setupPatchmapTests();

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const baseComponents = [
    {
      type: 'background',
      source: { type: 'rect', fill: 'white' },
      tint: 'gray.default',
    },
  ];

  // Base data with items to be connected by the Relations element
  const baseMapData = [
    {
      type: 'item',
      id: 'item-A',
      size: 50,
      attrs: { x: 100, y: 100 },
      components: baseComponents,
    },
    {
      type: 'item',
      id: 'item-B',
      size: 50,
      attrs: { x: 300, y: 100 },
      components: baseComponents,
    },
    {
      type: 'item',
      id: 'item-C',
      size: 50,
      attrs: { x: 200, y: 300 },
      components: baseComponents,
    },
    {
      type: 'relations',
      id: 'rel-1',
      links: [{ source: 'item-A', target: 'item-B' }],
      style: { width: 2, color: 'primary.default' },
    },
  ];

  const getRelations = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="rel-1")]')[0];
  };

  const getPath = (patchmap) => {
    // The actual line is a Graphics object child of the Relations element
    return getRelations(patchmap).children[0];
  };

  it('should undo/redo changes to the "links" property', () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);

    const originalLinks = getRelations(patchmap).props.links;
    expect(originalLinks.length).toBe(1);

    const newLinks = [{ source: 'item-B', target: 'item-C' }];

    patchmap.update({
      path: '$..[?(@.id=="rel-1")]',
      changes: { links: newLinks },
      history: true,
    });

    const updatedLinks = getRelations(patchmap).props.links;
    expect(updatedLinks.length).toBe(2);

    patchmap.undoRedoManager.undo();
    expect(getRelations(patchmap).props.links.length).toBe(1);
    expect(getRelations(patchmap).props.links).toEqual(originalLinks);

    patchmap.undoRedoManager.redo();
    expect(getRelations(patchmap).props.links.length).toBe(2);
    expect(getRelations(patchmap).props.links).toEqual([
      ...originalLinks,
      ...newLinks,
    ]);
  });

  it('should undo/redo changes to the "style" property', () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);

    const path = getPath(patchmap);
    const originalStyle = { ...path.strokeStyle };

    expect(originalStyle.width).toBe(2);
    // Note: The color is resolved from the theme
    expect(originalStyle.color).toBe(0x0c73bf);

    patchmap.update({
      path: '$..[?(@.id=="rel-1")]',
      changes: { style: { width: 5, color: 'primary.accent' } },
      history: true,
    });

    const updatedStyle = getPath(patchmap).strokeStyle;
    expect(updatedStyle.width).toBe(5);
    expect(updatedStyle.color).toBe(0xef4444);

    patchmap.undoRedoManager.undo();
    const undoneStyle = getPath(patchmap).strokeStyle;
    expect(undoneStyle.width).toBe(originalStyle.width);
    expect(undoneStyle.color).toBe(originalStyle.color);

    patchmap.undoRedoManager.redo();
    const redoneStyle = getPath(patchmap).strokeStyle;
    expect(redoneStyle.width).toBe(5);
    expect(redoneStyle.color).toBe(0xef4444);
  });

  it('should correctly undo/redo adding a style property when it was initially undefined', async () => {
    const patchmap = getPatchmap();
    const dataWithoutStyle = JSON.parse(JSON.stringify(baseMapData));
    dataWithoutStyle[3].style = undefined;

    patchmap.draw(dataWithoutStyle);
    await vi.advanceTimersByTimeAsync(100);

    const relations = getRelations(patchmap);
    const path = getPath(patchmap);

    expect(relations.props.style).toStrictEqual({ color: '#1A1A1A' });
    const initialStrokeStyle = { ...path.strokeStyle };
    expect(initialStrokeStyle.width).toBe(1);

    const newStyle = { width: 3, color: 'red', cap: 'round' };
    patchmap.update({
      path: '$..[?(@.id=="rel-1")]',
      changes: { style: newStyle },
      history: true,
    });

    const updatedStrokeStyle = getPath(patchmap).strokeStyle;
    expect(getRelations(patchmap).props.style).toEqual(newStyle);
    expect(updatedStrokeStyle.width).toBe(3);
    expect(updatedStrokeStyle.color).toBe(0xff0000);
    expect(updatedStrokeStyle.cap).toBe('round');

    patchmap.undoRedoManager.undo();
    const undoneRelations = getRelations(patchmap);
    const undonePath = getPath(patchmap);
    expect(undoneRelations.props.style).toStrictEqual({ color: '#1A1A1A' });
    expect(undonePath.strokeStyle.width).toBe(initialStrokeStyle.width);
    expect(undonePath.strokeStyle.color).toBe(initialStrokeStyle.color);
    expect(undonePath.strokeStyle.cap).not.toBe('round');

    patchmap.undoRedoManager.redo();
    const redoneRelations = getRelations(patchmap);
    const redonePath = getPath(patchmap);
    expect(redoneRelations.props.style).toEqual(newStyle);
    expect(redonePath.strokeStyle.width).toBe(3);
    expect(redonePath.strokeStyle.color).toBe(0xff0000);
    expect(redonePath.strokeStyle.cap).toBe('round');
  });

  it('should redraw correctly after a linked item is moved and then undone', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    const path = getPath(patchmap);
    const originalPathSize = path.getSize();
    expect(originalPathSize.width).toBeGreaterThan(0);
    expect(originalPathSize.height).toBeGreaterThan(0);

    patchmap.update({
      path: '$..[?(@.id=="item-B")]',
      changes: { attrs: { x: 400, y: 200 } },
      history: true,
    });

    await vi.advanceTimersByTimeAsync(100);
    const updatedPathSize = path.getSize();
    expect(updatedPathSize.width).not.toBe(originalPathSize.width);
    expect(updatedPathSize.height).not.toBe(originalPathSize.height);

    // --- Undo the movement of item-B ---
    patchmap.undoRedoManager.undo();
    await vi.advanceTimersByTimeAsync(100);
    const undonePathSize = path.getSize();

    const itemB = patchmap.selector('$..[?(@.id=="item-B")]')[0];
    expect(itemB.x).toBe(300); // Back to original position

    // The path should be redrawn to its original state.
    // Due to graphics rendering intricacies, we check for approximate equality.
    expect(undonePathSize.width).toBeCloseTo(originalPathSize.width);
    expect(undonePathSize.height).toBeCloseTo(originalPathSize.height);

    // --- Redo the movement ---
    patchmap.undoRedoManager.redo();
    await vi.advanceTimersByTimeAsync(100);
    const redonePathSize = path.getSize();
    expect(redonePathSize.width).toBeCloseTo(updatedPathSize.width);
    expect(redonePathSize.height).toBeCloseTo(updatedPathSize.height);
  });

  it('should handle additional stroke properties like "cap" and "join" in style', async () => {
    const patchmap = getPatchmap();
    patchmap.draw(baseMapData);
    await vi.advanceTimersByTimeAsync(100);

    const path = getPath(patchmap);
    // PixiJS's default for cap is 'butt'
    const originalCap = path.strokeStyle.cap;
    const originalJoin = path.strokeStyle.join;
    expect(originalCap).toBe('butt');
    expect(originalJoin).toBe('miter');

    patchmap.update({
      path: '$..[?(@.id=="rel-1")]',
      changes: {
        style: {
          cap: 'round',
          join: 'round',
        },
      },
      history: true,
    });

    const updatedStyle = getPath(patchmap).strokeStyle;
    expect(updatedStyle.cap).toBe('round');
    expect(updatedStyle.join).toBe('round');

    patchmap.undoRedoManager.undo();
    const undoneStyle = getPath(patchmap).strokeStyle;
    expect(undoneStyle.cap).toBe(originalCap);
    expect(undoneStyle.join).not.toBe('round'); // It should revert to its default

    patchmap.undoRedoManager.redo();
    const redoneStyle = getPath(patchmap).strokeStyle;
    expect(redoneStyle.cap).toBe('round');
    expect(redoneStyle.join).toBe('round');
  });
});
