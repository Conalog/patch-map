import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: Icon Component', () => {
  const { getPatchmap } = setupPatchmapTests();

  // A reusable factory for creating item data to reduce duplication
  const createItemWithIcon = (iconProps) => ({
    type: 'item',
    id: 'item-with-icon',
    size: { width: 200, height: 100 },
    padding: 10, // Add padding for more complex layout tests
    components: [
      {
        type: 'icon',
        id: 'icon-1',
        source: 'device',
        size: 50,
        placement: 'center',
        ...iconProps,
      },
    ],
  });

  const getIcon = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="icon-1")]')[0];
  };

  it('should correctly undo/redo a simple property change (tint)', () => {
    const patchmap = getPatchmap();
    patchmap.draw([createItemWithIcon({ tint: 'primary.default' })]);

    const icon = getIcon(patchmap);
    const originalTint = icon.tint;
    expect(originalTint).toBe(0x0c73bf); // 'primary.default'

    patchmap.update({
      path: '$..[?(@.id=="icon-1")]',
      changes: { tint: 'primary.accent' }, // #EF4444
      history: true,
    });
    const updatedTint = getIcon(patchmap).tint;
    expect(updatedTint).toBe(0xef4444);

    patchmap.undoRedoManager.undo();
    expect(getIcon(patchmap).tint).toBe(originalTint);

    patchmap.undoRedoManager.redo();
    expect(getIcon(patchmap).tint).toBe(updatedTint);
  });

  it('should correctly undo/redo a source change', () => {
    const patchmap = getPatchmap();
    patchmap.draw([createItemWithIcon({ source: 'device' })]);
    const originalSource = getIcon(patchmap).props.source;
    expect(originalSource).toBe('device');

    patchmap.update({
      path: '$..[?(@.id=="icon-1")]',
      changes: { source: 'wifi' },
      history: true,
    });
    const updatedSource = getIcon(patchmap).props.source;
    expect(updatedSource).toBe('wifi');

    patchmap.undoRedoManager.undo();
    expect(getIcon(patchmap).props.source).toBe(originalSource);

    patchmap.undoRedoManager.redo();
    expect(getIcon(patchmap).props.source).toBe(updatedSource);
  });

  describe('Edge cases for the "size" property', () => {
    it('should handle percentage-based size correctly within a padded parent', () => {
      // Parent content size: width=180 (200-2*10), height=80 (100-2*10)
      const patchmap = getPatchmap();
      patchmap.draw([createItemWithIcon({ size: '50%' })]);

      const icon = getIcon(patchmap);
      expect(icon.width).toBe(90); // 180 * 0.5
      expect(icon.height).toBe(40); // 80 * 0.5

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { size: '100%' },
        history: true,
      });

      expect(getIcon(patchmap).width).toBe(180);
      expect(getIcon(patchmap).height).toBe(80);

      patchmap.undoRedoManager.undo();
      expect(getIcon(patchmap).width).toBe(90);
      expect(getIcon(patchmap).height).toBe(40);
    });

    it('should handle mixed unit size object correctly', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        createItemWithIcon({ size: { width: 80, height: '25%' } }),
      ]);

      const icon = getIcon(patchmap);
      expect(icon.width).toBe(80);
      expect(icon.height).toBe(20); // 80 * 0.25

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { size: { width: '20%', height: 30 } },
        history: true,
      });

      expect(getIcon(patchmap).width).toBe(36); // 180 * 0.2
      expect(getIcon(patchmap).height).toBe(30);

      patchmap.undoRedoManager.undo();
      expect(getIcon(patchmap).width).toBe(80);
      expect(getIcon(patchmap).height).toBe(20);
    });

    it('should treat a partial size object as a merge, not a replacement', () => {
      const patchmap = getPatchmap();
      patchmap.draw([createItemWithIcon({ size: { width: 80, height: 40 } })]);

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { size: { width: '50%' } }, // Only width is provided
        history: true,
      });

      const icon = getIcon(patchmap);
      // Parent content width is 180, so 50% is 90
      expect(icon.width).toBe(90);
      // Height should remain unchanged from the initial state
      expect(icon.height).toBe(40);

      patchmap.undoRedoManager.undo();
      const undoneIcon = getIcon(patchmap);
      expect(undoneIcon.width).toBe(80);
      expect(undoneIcon.height).toBe(40);
    });
  });

  describe('Interaction between placement and margin', () => {
    it('should correctly position the icon with right-bottom placement and margin inside a padded item', () => {
      const patchmap = getPatchmap();
      patchmap.draw([
        createItemWithIcon({
          size: 40,
          placement: 'right-bottom',
          margin: 5,
        }),
      ]);

      const icon = getIcon(patchmap);
      // Item inner size: 180x80.
      // Right edge = padding.right(10) + contentWidth(180) = 190
      // Bottom edge = padding.top(10) + contentHeight(80) = 90
      // X = right_edge - margin.right(5) - icon.width(40) = 190 - 5 - 40 = 145
      // Y = bottom_edge - margin.bottom(5) - icon.height(40) = 90 - 5 - 40 = 45
      expect(icon.x).toBe(145);
      expect(icon.y).toBe(45);

      patchmap.update({
        path: '$..[?(@.id=="icon-1")]',
        changes: { margin: { x: 10, y: 15 } },
        history: true,
      });
      // X = 190 - 10 - 40 = 140
      // Y = 90 - 15 - 40 = 35
      expect(getIcon(patchmap).x).toBe(140);
      expect(getIcon(patchmap).y).toBe(35);

      patchmap.undoRedoManager.undo();
      expect(getIcon(patchmap).x).toBe(145);
      expect(getIcon(patchmap).y).toBe(45);
    });
  });

  it('should correctly add a new property (margin) from an undefined state and undo to default', () => {
    const patchmap = getPatchmap();
    // Create an icon without an explicit margin.
    patchmap.draw([createItemWithIcon({ size: 50, placement: 'left-top' })]);

    const icon = getIcon(patchmap);
    const originalPosition = { x: icon.x, y: icon.y };
    expect(icon.props.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    // Position with no margin inside a padded (10px) item.
    expect(originalPosition).toEqual({ x: 10, y: 10 });

    patchmap.update({
      path: '$..[?(@.id=="icon-1")]',
      changes: { margin: { left: 20, top: 5 } },
      history: true,
    });

    const updatedIcon = getIcon(patchmap);
    expect(updatedIcon.props.margin).toEqual({
      top: 5,
      right: 0,
      bottom: 0,
      left: 20,
    });
    // Position is padding + margin
    expect(updatedIcon.x).toBe(10 + 20); // 30
    expect(updatedIcon.y).toBe(10 + 5); // 15

    patchmap.undoRedoManager.undo();
    const undoneIcon = getIcon(patchmap);
    expect(undoneIcon.props.margin).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(undoneIcon.x).toBe(originalPosition.x);
    expect(undoneIcon.y).toBe(originalPosition.y);

    patchmap.undoRedoManager.redo();
    const redoneIcon = getIcon(patchmap);
    expect(redoneIcon.x).toBe(30);
    expect(redoneIcon.y).toBe(15);
  });
});
