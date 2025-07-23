import gsap from 'gsap';
import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: Bar Component', () => {
  const { getPatchmap } = setupPatchmapTests();

  const baseItemData = {
    type: 'item',
    id: 'item-with-bar',
    size: { width: 200, height: 100 },
    components: [
      {
        type: 'bar',
        id: 'bar-1',
        source: { type: 'rect', fill: 'blue', radius: 2 },
        size: { width: '50%', height: 20 }, // width: 100, height: 20
        placement: 'bottom',
        margin: 5,
        tint: 0xffffff, // white
        animation: true,
        animationDuration: 200,
      },
    ],
  };

  const baseItemDataWithoutOptionals = {
    type: 'item',
    id: 'item-with-bar',
    size: { width: 200, height: 100 },
    components: [
      {
        type: 'bar',
        id: 'bar-1',
        source: { type: 'rect', fill: 'blue' },
        size: { width: '50%', height: 20 },
      },
    ],
  };

  const getBar = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="bar-1")]')[0];
  };

  it('should correctly undo/redo a size change and verify rendered dimensions', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);
    gsap.exportRoot().totalProgress(1);

    const bar = getBar(patchmap);
    const originalSizeProps = JSON.parse(JSON.stringify(bar.props.size));
    const originalDimensions = { width: bar.width, height: bar.height };
    expect(originalDimensions).toEqual({ width: 100, height: 20 });

    const newSize = { width: '80%', height: 30 };
    patchmap.update({
      path: '$..[?(@.id=="bar-1")]',
      changes: { size: newSize },
      history: true,
    });
    gsap.exportRoot().totalProgress(1);

    const updatedBar = getBar(patchmap);
    expect(updatedBar.props.size).toEqual({
      width: { value: 80, unit: '%' },
      height: { value: 30, unit: 'px' },
    });
    expect(updatedBar.width).toBe(160); // 200 * 80%
    expect(updatedBar.height).toBe(30);

    patchmap.undoRedoManager.undo();
    gsap.exportRoot().totalProgress(1);
    const undoneBar = getBar(patchmap);
    expect(undoneBar.props.size).toEqual(originalSizeProps);
    expect(undoneBar.width).toBe(originalDimensions.width);
    expect(undoneBar.height).toBe(originalDimensions.height);

    patchmap.undoRedoManager.redo();
    gsap.exportRoot().totalProgress(1);
    const redoneBar = getBar(patchmap);
    expect(redoneBar.props.size).toEqual({
      width: { value: 80, unit: '%' },
      height: { value: 30, unit: 'px' },
    });
    expect(redoneBar.width).toBe(160);
    expect(redoneBar.height).toBe(30);
  });

  it('should correctly undo/redo a placement change and verify rendered position', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);
    gsap.exportRoot().totalProgress(1);

    const bar = getBar(patchmap);
    const originalPosition = { x: bar.x, y: bar.y };
    expect(originalPosition).toEqual({ x: 50, y: 75 });

    patchmap.update({
      path: '$..[?(@.id=="bar-1")]',
      changes: { placement: 'left-top' },
      history: true,
    });

    const updatedBar = getBar(patchmap);
    expect(updatedBar.props.placement).toBe('left-top');
    expect(updatedBar.x).toBe(5);
    expect(updatedBar.y).toBe(5);

    patchmap.undoRedoManager.undo();
    const undoneBar = getBar(patchmap);
    expect(undoneBar.props.placement).toBe('bottom');
    expect(undoneBar.x).toBe(originalPosition.x);
    expect(undoneBar.y).toBe(originalPosition.y);

    patchmap.undoRedoManager.redo();
    const redoneBar = getBar(patchmap);
    expect(redoneBar.props.placement).toBe('left-top');
    expect(redoneBar.x).toBe(5);
    expect(redoneBar.y).toBe(5);
  });

  it('should correctly undo/redo a margin change and verify rendered position', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);
    gsap.exportRoot().totalProgress(1);

    const bar = getBar(patchmap);
    const originalPosition = { x: bar.x, y: bar.y };
    expect(originalPosition).toEqual({ x: 50, y: 75 });

    patchmap.update({
      path: '$..[?(@.id=="bar-1")]',
      changes: { margin: 20 },
      history: true,
    });

    const updatedBar = getBar(patchmap);
    expect(updatedBar.props.margin).toEqual({
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    });
    expect(updatedBar.x).toBe(50);
    expect(updatedBar.y).toBe(60);

    patchmap.undoRedoManager.undo();
    const undoneBar = getBar(patchmap);
    expect(undoneBar.props.margin).toEqual({
      top: 5,
      right: 5,
      bottom: 5,
      left: 5,
    });
    expect(undoneBar.x).toBe(originalPosition.x);
    expect(undoneBar.y).toBe(originalPosition.y);

    patchmap.undoRedoManager.redo();
    const redoneBar = getBar(patchmap);
    expect(redoneBar.props.margin).toEqual({
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    });
    expect(redoneBar.x).toBe(50);
    expect(redoneBar.y).toBe(60);
  });

  it('should correctly undo/redo a single property change (tint)', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const bar = getBar(patchmap);
    const originalTint = bar.tint;
    expect(originalTint).toBe(0xffffff);

    patchmap.update({
      path: '$..[?(@.id=="bar-1")]',
      changes: { tint: 0xff0000 },
      history: true,
    });
    const updatedTint = getBar(patchmap).tint;
    expect(updatedTint).toBe(0xff0000);

    patchmap.undoRedoManager.undo();
    expect(getBar(patchmap).tint).toBe(originalTint);

    patchmap.undoRedoManager.redo();
    expect(getBar(patchmap).tint).toBe(updatedTint);
  });

  it('should correctly undo/redo a nested property change (source.fill)', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const bar = getBar(patchmap);
    const originalFill = bar.props.source.fill;
    expect(originalFill).toBe('blue');

    patchmap.update({
      path: '$..[?(@.id=="bar-1")]',
      changes: { source: { fill: 'green' } },
      history: true,
    });
    const updatedFill = getBar(patchmap).props.source.fill;
    expect(updatedFill).toBe('green');

    patchmap.undoRedoManager.undo();
    expect(getBar(patchmap).props.source.fill).toBe(originalFill);

    patchmap.undoRedoManager.redo();
    expect(getBar(patchmap).props.source.fill).toBe(updatedFill);
  });

  describe('when optional properties are initially undefined', () => {
    it('should correctly add a new property (margin) and undo to its default state', () => {
      const patchmap = getPatchmap();
      patchmap.draw([baseItemDataWithoutOptionals]);
      gsap.exportRoot().totalProgress(1);

      const bar = getBar(patchmap);
      const originalMargin = bar.props.margin;
      const originalPosition = { x: bar.x, y: bar.y };

      expect(originalMargin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(originalPosition).toEqual({ x: 50, y: 80 });

      patchmap.update({
        path: '$..[?(@.id=="bar-1")]',
        changes: { margin: 15 },
        history: true,
      });
      gsap.exportRoot().totalProgress(1);

      const updatedBar = getBar(patchmap);
      expect(updatedBar.props.margin).toEqual({
        top: 15,
        right: 15,
        bottom: 15,
        left: 15,
      });
      expect(updatedBar.x).toBe(50);
      expect(updatedBar.y).toBe(65);

      patchmap.undoRedoManager.undo();
      gsap.exportRoot().totalProgress(1);
      const undoneBar = getBar(patchmap);
      expect(undoneBar.props.margin).toEqual(originalMargin);
      expect(undoneBar.x).toBe(originalPosition.x);
      expect(undoneBar.y).toBe(originalPosition.y);

      patchmap.undoRedoManager.redo();
      gsap.exportRoot().totalProgress(1);
      const redoneBar = getBar(patchmap);
      expect(redoneBar.props.margin).toEqual({
        top: 15,
        right: 15,
        bottom: 15,
        left: 15,
      });
      expect(redoneBar.x).toBe(50);
      expect(redoneBar.y).toBe(65);
    });

    it('should correctly add a new property (placement) and undo to its default state', () => {
      const patchmap = getPatchmap();
      patchmap.draw([baseItemDataWithoutOptionals]);
      gsap.exportRoot().totalProgress(1);

      const bar = getBar(patchmap);
      const originalPlacement = bar.props.placement;
      const originalPosition = { x: bar.x, y: bar.y };

      expect(originalPlacement).toBe('bottom');
      expect(originalPosition).toEqual({ x: 50, y: 80 });

      patchmap.update({
        path: '$..[?(@.id=="bar-1")]',
        changes: { placement: 'center' },
        history: true,
      });
      gsap.exportRoot().totalProgress(1);

      const updatedBar = getBar(patchmap);
      expect(updatedBar.props.placement).toBe('center');
      expect(updatedBar.x).toBe(50);
      expect(updatedBar.y).toBe(40);

      patchmap.undoRedoManager.undo();
      gsap.exportRoot().totalProgress(1);
      const undoneBar = getBar(patchmap);
      expect(undoneBar.props.placement).toBe(originalPlacement);
      expect(undoneBar.x).toBe(originalPosition.x);
      expect(undoneBar.y).toBe(originalPosition.y);

      patchmap.undoRedoManager.redo();
      gsap.exportRoot().totalProgress(1);
      const redoneBar = getBar(patchmap);
      expect(redoneBar.props.placement).toBe('center');
      expect(redoneBar.x).toBe(50);
      expect(redoneBar.y).toBe(40);
    });
  });
});
