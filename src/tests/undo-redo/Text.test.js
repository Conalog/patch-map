import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: Text Component', () => {
  const { getPatchmap } = setupPatchmapTests();

  const baseItemData = {
    type: 'item',
    id: 'item-with-text',
    size: { width: 200, height: 100 },
    components: [
      {
        type: 'text',
        id: 'text-1',
        text: 'Initial Text',
        placement: 'center',
        tint: 0xffffff, // white
        style: {
          fill: 'black',
          fontSize: 24,
        },
      },
    ],
  };

  const baseItemDataWithoutOptionals = {
    type: 'item',
    id: 'item-with-text-minimal',
    size: { width: 200, height: 100 },
    components: [
      {
        type: 'background',
        source: { type: 'rect', borderWidth: 2, borderColor: 'black' },
      },
      {
        type: 'text',
        id: 'text-1',
        text: 'Initial Text0',
      },
    ],
  };

  const getText = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="text-1")]')[0];
  };

  it('should correctly undo/redo a simple property change (text)', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const textComponent = getText(patchmap);
    const originalText = textComponent.text;
    expect(originalText).toBe('Initial Text');

    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes: { text: 'Updated Text' },
      history: true,
    });

    const updatedText = getText(patchmap).text;
    expect(updatedText).toBe('Updated Text');

    // Undo
    patchmap.undoRedoManager.undo();
    expect(getText(patchmap).text).toBe(originalText);

    // Redo
    patchmap.undoRedoManager.redo();
    expect(getText(patchmap).text).toBe(updatedText);
  });

  it('should correctly undo/redo a placement change and verify rendered position', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const textComponent = getText(patchmap);
    const originalPosition = { x: textComponent.x, y: textComponent.y };

    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes: { placement: 'left-top' },
      history: true,
    });

    const updatedPosition = { x: getText(patchmap).x, y: getText(patchmap).y };
    expect(updatedPosition.x).not.toBe(originalPosition.x);
    expect(updatedPosition.y).not.toBe(originalPosition.y);
    expect(getText(patchmap).props.placement).toBe('left-top');

    // Undo
    patchmap.undoRedoManager.undo();
    expect(getText(patchmap).props.placement).toBe('center');
    expect(getText(patchmap).x).toBe(originalPosition.x);
    expect(getText(patchmap).y).toBe(originalPosition.y);

    // Redo
    patchmap.undoRedoManager.redo();
    expect(getText(patchmap).props.placement).toBe('left-top');
    expect(getText(patchmap).x).toBe(updatedPosition.x);
    expect(getText(patchmap).y).toBe(updatedPosition.y);
  });

  it('should correctly undo/redo a tint color change', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const textComponent = getText(patchmap);
    const originalTint = textComponent.tint;
    expect(originalTint).toBe(0xffffff);

    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes: { tint: 0xff0000 }, // red
      history: true,
    });
    expect(getText(patchmap).tint).toBe(0xff0000);

    // Undo
    patchmap.undoRedoManager.undo();
    expect(getText(patchmap).tint).toBe(originalTint);

    // Redo
    patchmap.undoRedoManager.redo();
    expect(getText(patchmap).tint).toBe(0xff0000);
  });

  it('should correctly undo/redo a split change', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const textComponent = getText(patchmap);
    const originalText = textComponent.text;
    expect(textComponent.props.split).toBe(0);

    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes: { split: 4 },
      history: true,
    });
    const updatedText = getText(patchmap).text;
    expect(updatedText).toBe('Init\nial \nText');

    // Undo
    patchmap.undoRedoManager.undo();
    expect(getText(patchmap).text).toBe(originalText);

    // Redo
    patchmap.undoRedoManager.redo();
    expect(getText(patchmap).text).toBe(updatedText);
  });

  describe('style property undo/redo', () => {
    it('should correctly undo/redo a nested style property change (fill)', () => {
      const patchmap = getPatchmap();
      patchmap.draw([baseItemData]);

      const originalFill = getText(patchmap).style.fill;
      expect(originalFill).toBe('black');

      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: { style: { fill: 'red' } },
        history: true,
      });
      expect(getText(patchmap).style.fill).toBe('red');

      // Undo
      patchmap.undoRedoManager.undo();
      expect(getText(patchmap).style.fill).toBe(originalFill);

      // Redo
      patchmap.undoRedoManager.redo();
      expect(getText(patchmap).style.fill).toBe('red');
    });

    it('should correctly undo/redo multiple style property changes', () => {
      const patchmap = getPatchmap();
      patchmap.draw([baseItemData]);

      const textComponent = getText(patchmap);
      const originalStyle = {
        fill: textComponent.style.fill,
        fontSize: textComponent.style.fontSize,
        fontWeight: textComponent.style.fontWeight,
      };

      expect(originalStyle.fill).toBe('black');
      expect(originalStyle.fontSize).toBe(24);
      expect(originalStyle.fontWeight).toBe('400');

      const newStyle = { fill: 'blue', fontSize: 48, fontWeight: 'bold' };
      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: { style: newStyle },
        history: true,
      });

      const updatedStyle = getText(patchmap).style;
      expect(updatedStyle.fill).toBe('blue');
      expect(updatedStyle.fontSize).toBe(48);
      expect(updatedStyle.fontWeight).toBe('700');

      // Undo
      patchmap.undoRedoManager.undo();
      const undoneStyle = getText(patchmap).style;
      expect(undoneStyle.fill).toBe(originalStyle.fill);
      expect(undoneStyle.fontSize).toBe(originalStyle.fontSize);
      expect(undoneStyle.fontWeight).toBe('400');

      // Redo
      patchmap.undoRedoManager.redo();
      const redoneStyle = getText(patchmap).style;
      expect(redoneStyle.fill).toBe('blue');
      expect(redoneStyle.fontSize).toBe(48);
      expect(redoneStyle.fontWeight).toBe('700');
    });
  });

  describe('when optional properties are initially undefined', async () => {
    it('should correctly add a new property (margin) and undo to its default state', () => {
      const patchmap = getPatchmap();
      patchmap.draw([baseItemDataWithoutOptionals]);

      const textComponent = getText(patchmap);
      const originalMargin = textComponent.props.margin;
      const originalPosition = { x: textComponent.x, y: textComponent.y };
      expect(originalMargin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });

      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: {
          margin: { left: 20, top: 10 },
          style: { fontWeight: 'bold' },
        },
        history: true,
      });

      const updatedBar = getText(patchmap);
      expect(updatedBar.props.margin).toEqual({
        top: 10,
        right: 0,
        bottom: 0,
        left: 20,
      });
      expect(updatedBar.x).not.toBe(originalPosition.x);
      expect(updatedBar.y).not.toBe(originalPosition.y);

      patchmap.undoRedoManager.undo();
      const undoneBar = getText(patchmap);
      expect(undoneBar.props.margin).toEqual(originalMargin);
      expect(undoneBar.x).toBe(originalPosition.x);
      expect(undoneBar.y).toBe(originalPosition.y);

      patchmap.undoRedoManager.redo();
      const redoneBar = getText(patchmap);
      expect(redoneBar.props.margin).toEqual({
        top: 10,
        right: 0,
        bottom: 0,
        left: 20,
      });
      expect(redoneBar.x).not.toBe(originalPosition.x);
      expect(redoneBar.y).not.toBe(originalPosition.y);
    });

    it('should correctly add a new property (style) and undo to its initial state', () => {
      const patchmap = getPatchmap();
      patchmap.draw([baseItemDataWithoutOptionals]);

      const textComponent = getText(patchmap);
      const originalFill = textComponent.style.fill;
      const originalFontSize = textComponent.style.fontSize;

      const newStyle = { fill: 'green', fontSize: 16 };

      patchmap.update({
        path: '$..[?(@.id=="text-1")]',
        changes: { style: newStyle },
        history: true,
      });

      const updatedStyle = getText(patchmap).style;
      expect(updatedStyle.fill).toBe('green');
      expect(updatedStyle.fontSize).toBe(16);
      expect(getText(patchmap).props.style).toBeDefined();

      // Undo
      patchmap.undoRedoManager.undo();
      const undoneStyle = getText(patchmap).style;
      expect(undoneStyle.fill).toBe(originalFill);
      expect(undoneStyle.fontSize).toBe(originalFontSize);

      // Redo
      patchmap.undoRedoManager.redo();
      const redoneStyle = getText(patchmap).style;
      expect(redoneStyle.fill).toBe('green');
      expect(redoneStyle.fontSize).toBe(16);
      expect(getText(patchmap).props.style).toBeDefined();
    });
  });

  it('should correctly undo/redo multiple different properties simultaneously', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const textComponent = getText(patchmap);
    const originalState = {
      text: textComponent.text,
      tint: textComponent.tint,
      fill: textComponent.style.fill,
      fontSize: textComponent.style.fontSize,
    };

    const changes = {
      text: 'Multi-update',
      tint: 0x0000ff, // blue
      style: { fill: 'yellow', fontSize: 12 },
    };
    patchmap.update({
      path: '$..[?(@.id=="text-1")]',
      changes,
      history: true,
    });

    const updatedComponent = getText(patchmap);
    const updatedState = {
      text: updatedComponent.text,
      tint: updatedComponent.tint,
      fill: updatedComponent.style.fill,
      fontSize: updatedComponent.style.fontSize,
    };
    expect(updatedState.text).toBe('Multi-update');
    expect(updatedState.tint).toBe(255);
    expect(updatedState.fill).toBe('yellow');
    expect(updatedState.fontSize).toBe(12);

    // Undo
    patchmap.undoRedoManager.undo();
    const undoneComponent = getText(patchmap);
    const undoneState = {
      text: undoneComponent.text,
      tint: undoneComponent.tint,
      fill: undoneComponent.style.fill,
      fontSize: undoneComponent.style.fontSize,
    };
    expect(undoneState).toEqual(originalState);

    // Redo
    patchmap.undoRedoManager.redo();
    const redoneComponent = getText(patchmap);
    const redoneState = {
      text: redoneComponent.text,
      tint: redoneComponent.tint,
      fill: redoneComponent.style.fill,
      fontSize: redoneComponent.style.fontSize,
    };
    expect(redoneState).toEqual(updatedState);
  });
});
