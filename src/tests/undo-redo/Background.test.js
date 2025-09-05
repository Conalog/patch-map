import { describe, expect, it } from 'vitest';
import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: Background Component', () => {
  const { getPatchmap } = setupPatchmapTests();

  const baseItemData = {
    type: 'item',
    id: 'item-with-background',
    size: { width: 100, height: 100 },
    components: [
      {
        type: 'background',
        id: 'background-1',
        source: {
          type: 'rect',
          fill: 'white',
          borderColor: 'black',
          borderWidth: 2,
          radius: 4,
        },
        tint: 'gray.default', // 0xd9d9d9
      },
    ],
  };

  const getBackground = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="background-1")]')[0];
  };

  it('should correctly undo/redo a single property change (tint)', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const background = getBackground(patchmap);
    const originalTint = background.tint;
    expect(originalTint).toBe(0xd9d9d9);

    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes: { tint: 'primary.accent' }, // #EF4444
      history: true,
    });
    const updatedTint = getBackground(patchmap).tint;
    expect(updatedTint).toBe(0xef4444);

    patchmap.undoRedoManager.undo();
    expect(getBackground(patchmap).tint).toBe(originalTint);

    patchmap.undoRedoManager.redo();
    expect(getBackground(patchmap).tint).toBe(updatedTint);
  });

  it('should correctly undo/redo a nested property change (source.fill)', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const background = getBackground(patchmap);
    const originalFill = background.props.source.fill;
    expect(originalFill).toBe('white');

    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes: { source: { fill: 'red' } },
      history: true,
    });
    const updatedFill = background.props.source.fill;
    expect(updatedFill).toBe('red');

    patchmap.undoRedoManager.undo();
    expect(getBackground(patchmap).props.source.fill).toBe(originalFill);

    patchmap.undoRedoManager.redo();
    expect(getBackground(patchmap).props.source.fill).toBe(updatedFill);
  });

  it('should correctly undo/redo multiple property changes simultaneously', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const background = getBackground(patchmap);
    const originalState = {
      tint: background.tint,
      borderWidth: background.props.source.borderWidth,
      fill: background.props.source.fill,
    };

    const changes = {
      tint: 'primary.dark', // #083967
      source: {
        borderWidth: 5,
        fill: 'blue',
      },
    };
    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes,
      history: true,
    });

    const updatedState = {
      tint: background.tint,
      borderWidth: background.props.source.borderWidth,
      fill: background.props.source.fill,
    };
    expect(updatedState.tint).toBe(0x083967);
    expect(updatedState.borderWidth).toBe(5);
    expect(updatedState.fill).toBe('blue');

    patchmap.undoRedoManager.undo();
    const undoneState = {
      tint: getBackground(patchmap).tint,
      borderWidth: getBackground(patchmap).props.source.borderWidth,
      fill: getBackground(patchmap).props.source.fill,
    };
    expect(undoneState).toEqual(originalState);

    patchmap.undoRedoManager.redo();
    const redoneState = {
      tint: getBackground(patchmap).tint,
      borderWidth: getBackground(patchmap).props.source.borderWidth,
      fill: getBackground(patchmap).props.source.fill,
    };
    expect(redoneState).toEqual(updatedState);
  });

  it('should correctly undo/redo replacing the entire source object', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const background = getBackground(patchmap);
    const originalSource = JSON.parse(JSON.stringify(background.props.source));

    const newSource = { type: 'rect', fill: 'green', radius: 10 };
    const expectedMergedSource = deepMerge(originalSource, newSource);

    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes: { source: newSource },
      history: true,
    });
    expect(background.props.source).toEqual(expectedMergedSource);

    patchmap.undoRedoManager.undo();
    expect(background.props.source).toEqual(originalSource);

    patchmap.undoRedoManager.redo();
    expect(background.props.source).toEqual(expectedMergedSource);
  });

  it('should correctly undo/redo pixi attributes (alpha, angle) via attrs', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const background = getBackground(patchmap);
    const originalAlpha = background.alpha;
    const originalAngle = background.angle;

    expect(originalAlpha).toBe(1);
    expect(originalAngle).toBe(0);

    const changes = { attrs: { alpha: 0.5, angle: 45 } };
    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes,
      history: true,
    });

    const updatedBackground = getBackground(patchmap);
    expect(updatedBackground.alpha).toBe(0.5);
    expect(updatedBackground.angle).toBe(45);

    // Undo
    patchmap.undoRedoManager.undo();
    const undoneBackground = getBackground(patchmap);
    expect(undoneBackground.alpha).toBe(originalAlpha);
    expect(undoneBackground.angle).toBe(originalAngle);

    // Redo
    patchmap.undoRedoManager.redo();
    const redoneBackground = getBackground(patchmap);
    expect(redoneBackground.alpha).toBe(0.5);
    expect(redoneBackground.angle).toBe(45);
  });

  it('should correctly undo/redo custom metadata via attrs', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const background = getBackground(patchmap);
    expect(background?.customMeta).toBeUndefined();

    const customData = { version: 1, author: 'test' };
    const changes = { attrs: { customMeta: customData } };

    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes,
      history: true,
    });

    const updatedBackground = getBackground(patchmap);
    expect(updatedBackground.customMeta).toEqual(customData);

    // Undo
    patchmap.undoRedoManager.undo();
    const undoneBackground = getBackground(patchmap);
    expect(undoneBackground?.customMeta).toBeUndefined();

    // Redo
    patchmap.undoRedoManager.redo();
    const redoneBackground = getBackground(patchmap);
    expect(redoneBackground.customMeta).toEqual(customData);
  });
});
