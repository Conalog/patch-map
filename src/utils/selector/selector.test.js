import { describe, expect, it, vi } from 'vitest';
import { selector } from './selector';

describe('selector indexed canvas paths', () => {
  it('uses logical model index before scene index for exact id paths', () => {
    const modelElement = { id: 'model-item' };
    const sceneElement = { id: 'scene-item' };
    const canvas = {
      type: 'canvas',
      store: {
        modelIndex: {
          getRefById: vi.fn(() => modelElement),
        },
        sceneIndex: {
          getById: vi.fn(() => sceneElement),
        },
      },
    };

    expect(selector(canvas, '$..[?(@.id=="item-1")]')).toEqual([modelElement]);
    expect(canvas.store.modelIndex.getRefById).toHaveBeenCalledWith('item-1');
    expect(canvas.store.sceneIndex.getById).not.toHaveBeenCalled();
  });

  it('uses logical model index for exact display children paths', () => {
    const child = { id: 'child-1' };
    const panelGroup = { id: 'group-1', children: [child] };
    const canvas = {
      type: 'canvas',
      store: {
        modelIndex: {
          getRefsByDisplay: vi.fn(() => [panelGroup]),
        },
      },
    };

    expect(
      selector(canvas, '$..children[?(@.display=="panelGroup")].children'),
    ).toEqual([child]);
    expect(canvas.store.modelIndex.getRefsByDisplay).toHaveBeenCalledWith(
      'panelGroup',
    );
  });

  it('falls back to scene index when the logical model index is unavailable', () => {
    const element = { id: 'scene-item' };
    const canvas = {
      type: 'canvas',
      store: {
        sceneIndex: {
          getByType: vi.fn(() => [element]),
        },
      },
    };

    expect(selector(canvas, '$..children[?(@.type=="item")]')).toEqual([
      element,
    ]);
    expect(canvas.store.sceneIndex.getByType).toHaveBeenCalledWith('item');
  });
});
