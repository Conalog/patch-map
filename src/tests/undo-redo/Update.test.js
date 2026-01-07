import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: UpdateCommand Attrs Preservation', () => {
  const { getPatchmap } = setupPatchmapTests();

  it('should preserve other attributes when undoing a partial attrs update', async () => {
    const patchmap = getPatchmap();

    // 1. Initial data with multiple attributes
    const initialData = [
      {
        type: 'item',
        id: 'item-1',
        label: 'item-1',
        components: [
          {
            type: 'background',
            id: 'bg-component',
            source: { type: 'rect', fill: 'white' },
          },
        ],
        size: { width: 50, height: 50 },
        attrs: { x: 100, y: 100, width: 50, height: 50 },
      },
    ];

    patchmap.draw(initialData);
    const item = patchmap.selector('$..[?(@.id=="item-1")]')[0];

    // Verify initial state
    expect(item.props.attrs).toEqual({ x: 100, y: 100, width: 50, height: 50 });

    // 2. Update only 'x' attribute with history: true
    patchmap.update({
      path: '$..[?(@.id=="item-1")]',
      changes: { attrs: { x: 200 } },
      history: true,
    });

    // Verify update applied correctly
    expect(item.props.attrs.x).toBe(200);
    expect(item.props.attrs.y).toBe(100);
    expect(item.props.attrs.width).toBe(50);
    expect(item.props.attrs.height).toBe(50);

    // 3. Undo the change
    patchmap.undoRedoManager.undo();

    // 4. Verify that ALL attributes are restored to original state
    // Before the fix, y, width, and height would have been lost because undo used 'replace' strategy
    // with a slice that only contained 'x'.
    expect(item.props.attrs).toEqual({ x: 100, y: 100, width: 50, height: 50 });

    // 5. Redo and verify
    patchmap.undoRedoManager.redo();
    expect(item.props.attrs.x).toBe(200);
    expect(item.props.attrs.y).toBe(100);
    expect(item.props.attrs.width).toBe(50);
    expect(item.props.attrs.height).toBe(50);
  });

  it('should correctly capture initial instance values if not present in props', async () => {
    const patchmap = getPatchmap();

    // Background normally has x, y in props, but let's test a case where something might be missing
    const initialData = [
      {
        type: 'item',
        id: 'item-2',
        label: 'item-2',
        size: { width: 50, height: 50 },
        attrs: { width: 50, height: 50 }, // x, y (0,0) implied but not in props
      },
    ];

    patchmap.draw(initialData);
    const item = patchmap.selector('$..[?(@.id=="item-2")]')[0];

    // In this case, props.attrs only has width/height
    expect(item.props.attrs).not.toHaveProperty('x');
    expect(item.x).toBe(0);

    // Update x
    patchmap.update({
      path: '$..[?(@.id=="item-2")]',
      changes: { attrs: { x: 100 } },
      history: true,
    });

    expect(item.x).toBe(100);

    // Undo
    patchmap.undoRedoManager.undo();

    // Verify x is back to 0
    expect(item.x).toBe(0);

    // And props.attrs should now ideally have captured x: 0
    expect(item.props.attrs.x).toBe(0);
  });
});
