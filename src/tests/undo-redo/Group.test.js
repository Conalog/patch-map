import { describe, expect, it } from 'vitest';
import { setupPatchmapTests } from '../render/patchmap.setup';

describe('Undo/Redo: Group Element', () => {
  const { getPatchmap } = setupPatchmapTests();

  // Base data structure with a Group containing other Elements.
  const initialMapData = [
    {
      type: 'group',
      id: 'group-1',
      children: [
        { type: 'item', id: 'item-1', size: 50, label: 'Initial Item 1' },
        { type: 'item', id: 'item-2', size: 60, label: 'Initial Item 2' },
      ],
      attrs: { x: 100, y: 100 },
    },
  ];

  const getGroup = (patchmap) => {
    return patchmap.selector('$..[?(@.id=="group-1")]')[0];
  };

  const getItem = (patchmap, id) => {
    return patchmap.selector(`$..[?(@.id=="${id}")]`)[0];
  };

  it('should undo/redo adding a new child Element to the group', () => {
    const patchmap = getPatchmap();
    patchmap.draw(initialMapData);

    const group = getGroup(patchmap);
    expect(group.children.length).toBe(2);

    const newItem = { type: 'item', id: 'item-3', size: 70 };
    patchmap.update({
      path: '$..[?(@.id=="group-1")]',
      changes: { children: [newItem] },
      history: true,
    });

    const groupAfterUpdate = getGroup(patchmap);
    expect(groupAfterUpdate.children.length).toBe(3);
    expect(getItem(patchmap, 'item-3')).toBeDefined();

    // --- Undo ---
    patchmap.undoRedoManager.undo();
    const groupAfterUndo = getGroup(patchmap);
    expect(groupAfterUndo.children.length).toBe(2);
    expect(getItem(patchmap, 'item-3')).toBeUndefined();

    // --- Redo ---
    patchmap.undoRedoManager.redo();
    const groupAfterRedo = getGroup(patchmap);
    expect(groupAfterRedo.children.length).toBe(3);
    expect(getItem(patchmap, 'item-3')).toBeDefined();
  });

  it('should undo/redo removing a child Element from the group', () => {
    const patchmap = getPatchmap();
    patchmap.draw(initialMapData);

    expect(getGroup(patchmap).children.length).toBe(2);

    // Remove item-2
    const updatedChildren = [
      { type: 'item', id: 'item-1', size: 50, label: 'Initial Item 1' },
    ];

    patchmap.update({
      path: '$..[?(@.id=="group-1")]',
      changes: { children: updatedChildren },
      history: true,
      mergeStrategy: 'replace', // Use replace to correctly handle array removal
    });

    expect(getGroup(patchmap).children.length).toBe(1);
    expect(getItem(patchmap, 'item-2')).toBeUndefined();

    // --- Undo ---
    patchmap.undoRedoManager.undo();
    expect(getGroup(patchmap).children.length).toBe(2);
    expect(getItem(patchmap, 'item-2')).toBeDefined();

    // --- Redo ---
    patchmap.undoRedoManager.redo();
    expect(getGroup(patchmap).children.length).toBe(1);
    expect(getItem(patchmap, 'item-2')).toBeUndefined();
  });

  it('should undo/redo a property change on a nested child Element', () => {
    const patchmap = getPatchmap();
    patchmap.draw(initialMapData);

    const item1 = getItem(patchmap, 'item-1');
    const originalLabel = item1.label;
    expect(originalLabel).toBe('Initial Item 1');

    patchmap.update({
      path: '$..[?(@.id=="item-1")]',
      changes: { label: 'Updated Label' },
      history: true,
    });

    expect(getItem(patchmap, 'item-1').label).toBe('Updated Label');
    // Ensure the group's internal props reflect this change for history
    expect(getGroup(patchmap).props.children[0].label).toBe('Updated Label');

    // --- Undo ---
    patchmap.undoRedoManager.undo();
    expect(getItem(patchmap, 'item-1').label).toBe(originalLabel);
    expect(getGroup(patchmap).props.children[0].label).toBe(originalLabel);

    // --- Redo ---
    patchmap.undoRedoManager.redo();
    expect(getItem(patchmap, 'item-1').label).toBe('Updated Label');
    expect(getGroup(patchmap).props.children[0].label).toBe('Updated Label');
  });

  it('should correctly handle undo/redo in a deeply nested group structure', () => {
    const patchmap = getPatchmap();
    const deepData = [
      {
        type: 'group',
        id: 'group-1',
        children: [
          {
            type: 'group',
            id: 'group-2',
            children: [
              { type: 'item', id: 'item-deep', size: 30, label: 'Deep Item' },
            ],
          },
        ],
      },
    ];
    patchmap.draw(deepData);

    const deepItem = getItem(patchmap, 'item-deep');
    expect(deepItem.label).toBe('Deep Item');

    patchmap.update({
      path: '$..[?(@.id=="item-deep")]',
      changes: { label: 'Updated Deep' },
      history: true,
    });

    expect(getItem(patchmap, 'item-deep').label).toBe('Updated Deep');

    patchmap.undoRedoManager.undo();
    expect(getItem(patchmap, 'item-deep').label).toBe('Deep Item');

    patchmap.undoRedoManager.redo();
    expect(getItem(patchmap, 'item-deep').label).toBe('Updated Deep');
  });
});
