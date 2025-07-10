import { Sprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { Base } from '../../../display/mixins/Base';
import { Sourceable } from '../../../display/mixins/Sourceable';
import { mixins } from '../../../display/mixins/utils';
import { setupPatchmapTests } from '../patchmap.setup';

describe('Background Component In Item', () => {
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
        tint: 'gray.default',
      },
    ],
    attrs: { x: 50, y: 50 },
  };

  it('should render the background component with initial properties', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const background = patchmap.selector('$..[?(@.id=="background-1")]')[0];
    expect(background).toBeDefined();
    expect(background.props.source.fill).toBe('white');
    expect(background.props.tint).toBe('gray.default');
    expect(background.tint).toBe(0xd9d9d9);
  });

  it('should update a single property: tint', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes: {
        tint: 'primary.accent', // #EF4444
      },
    });

    const background = patchmap.selector('$..[?(@.id=="background-1")]')[0];
    expect(background.props.tint).toBe('primary.accent');
    expect(background.tint).toBe(0xef4444);
    expect(background.props.source.fill).toBe('white');
  });

  it('should update a single property: source', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const newSource = { type: 'rect', fill: 'black', radius: 10 };
    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes: {
        source: newSource,
      },
    });

    const background = patchmap.selector('$..[?(@.id=="background-1")]')[0];
    expect(background.props.source).toEqual({
      ...baseItemData.components[0].source,
      ...newSource,
    });
    expect(background.tint).toBe(0xd9d9d9);
  });

  it('should update multiple properties simultaneously', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const newSource = { type: 'rect', fill: 'blue' };
    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes: {
        tint: 'primary.dark', // #083967
        source: newSource,
      },
    });

    const background = patchmap.selector('$..[?(@.id=="background-1")]')[0];
    expect(background.props.tint).toBe('primary.dark');
    expect(background.tint).toBe(0x083967);
    expect(background.props.source).toEqual({
      ...baseItemData.components[0].source,
      ...newSource,
    });
  });

  it('should replace the entire component array when arrayMerge is "replace"', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);

    const newBackground = {
      type: 'background',
      id: 'background-new',
      source: { type: 'rect', fill: 'green' },
    };
    patchmap.update({
      path: '$..[?(@.id=="item-with-background")]',
      changes: {
        components: [newBackground],
      },
      arrayMerge: 'replace',
    });

    const item = patchmap.selector('$..[?(@.id=="item-with-background")]')[0];
    expect(item.children.length).toBe(1);

    const background = item.children[0];
    expect(background.id).toBe('background-new');
    expect(background.props.source.fill).toBe('green');

    const oldText = patchmap.selector('$..[?(@.id=="text-1")]')[0];
    expect(oldText).toBeUndefined();
  });

  it('should re-render the background when refresh is true, even with same data', () => {
    const patchmap = getPatchmap();
    patchmap.draw([baseItemData]);
    const background = patchmap.selector('$..[?(@.id=="background-1")]')[0];
    const handlerSet = background.constructor._handlerMap.get('source');
    const handlerRegistry = background.constructor._handlerRegistry;

    const spy = vi.spyOn(
      mixins(Sprite, Base, Sourceable).prototype,
      '_applySource',
    );
    handlerSet.forEach((handler) => {
      if (handler.name === '_applySource') {
        const registry = handlerRegistry.get(handler);
        handlerRegistry.delete(handler);
        handlerRegistry.set(spy, registry);
        handlerSet.delete(handler);
      }
    });
    handlerSet.add(spy);

    patchmap.update({
      path: '$..[?(@.id=="background-1")]',
      changes: {
        source: baseItemData.components[0].source,
      },
      refresh: true,
    });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
