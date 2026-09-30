import { describe, expect, it } from 'vitest';

import { parsePatchMap } from '../../src/parsing';

describe('PatchMap component visual projection', () => {
  it('keeps stable background ownership and full-item geometry', () => {
    const source = {
      type: 'rect',
      fill: '#ff000080',
      borderWidth: 2,
      borderColor: '#11223344',
      radius: 8,
    };
    const input = [{
      type: 'item',
      id: 'item',
      size: { width: 100, height: 80 },
      components: [{
        type: 'background',
        id: 'bg',
        source,
        tint: '#80ffffff',
      }],
    }];
    const before = JSON.stringify(input);

    const result = parsePatchMap(input);
    const entityId = 'item::background:bg';
    const visual = result.projection.componentsByEntityId?.[entityId];
    const paint = result.projection.backgroundsByEntityId?.[entityId];

    expect(JSON.stringify(input)).toBe(before);
    expect(visual).toEqual({
      entityId,
      ownerId: 'item',
      componentId: 'bg',
      componentType: 'background',
      logicalIdentity: entityId,
      renderRole: 'background-geometry',
    });
    expect(paint).toEqual({
      entityId,
      sourceKind: 'rect',
      fill: 0xff000080,
      borderWidth: 2,
      borderColor: 0x11223344,
      radius: [8, 8, 8, 8],
      tint: 0x80ffffff,
    });
    expect(result.document.entities.find((entity) => entity.id === entityId)).toMatchObject({
      kind: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    expect(result.projection.byEntityId[entityId]?.localBounds).toEqual([0, 0, 100, 80]);
    expect(Object.isFrozen(result.projection.componentsByEntityId)).toBe(true);
    expect(Object.isFrozen(result.projection.backgroundsByEntityId)).toBe(true);
    expect(Object.isFrozen(visual)).toBe(true);
    expect(Object.isFrozen(paint)).toBe(true);
    expect(Object.isFrozen(paint?.radius)).toBe(true);

    source.radius = 99;
    expect(paint?.radius).toEqual([8, 8, 8, 8]);
  });

  it('accepts and ignores compatibility background size', () => {
    const result = parsePatchMap([{
      type: 'item',
      id: 'item',
      size: { width: 100, height: 80 },
      components: [{
        type: 'background',
        id: 'bg',
        source: { type: 'rect' },
        size: 20,
      }],
    }]);

    expect(result.document.entities.find((entity) => entity.id === 'item::background:bg'))
      .toMatchObject({ width: 100, height: 80 });
    expect(result.projection.componentsByEntityId?.['item::background:bg']?.authoredSize)
      .toBeUndefined();
  });

  it('retains scalar, tuple, and named-corner background radii without maximum reduction', () => {
    const result = parsePatchMap([{
      type: 'item',
      id: 'item',
      size: 40,
      components: [
        {
          type: 'background',
          id: 'scalar',
          source: { type: 'rect', fill: 'transparent', radius: 3 },
        },
        {
          type: 'background',
          id: 'tuple',
          source: {
            type: 'rect',
            fill: 'transparent',
            borderWidth: 4,
            borderColor: '#abcdef80',
            radius: [1, 2, 3, 4],
          },
        },
        {
          type: 'background',
          id: 'named',
          source: {
            type: 'rect',
            fill: 'transparent',
            radius: {
              topLeft: 5,
              topRight: 6,
              bottomRight: 7,
              bottomLeft: 8,
            },
          },
        },
      ],
    }]);
    const backgrounds = result.projection.backgroundsByEntityId;

    expect(backgrounds?.['item::background:scalar']?.radius).toEqual([3, 3, 3, 3]);
    expect(backgrounds?.['item::background:tuple']).toMatchObject({
      fill: 0x00000000,
      borderWidth: 4,
      borderColor: 0xabcdef80,
      radius: [1, 2, 3, 4],
    });
    expect(backgrounds?.['item::background:named']?.radius).toEqual([5, 6, 7, 8]);
    expect(result.document.entities.find(
      (entity) => entity.id === 'item::background:tuple',
    )).not.toHaveProperty('radius');
    expect(result.document.entities.find(
      (entity) => entity.id === 'item::background:named',
    )).not.toHaveProperty('radius');
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'corner-radius-degraded',
    }));
  });

  it('classifies asset backgrounds and icons by semantic role while keeping source authority separate', () => {
    const input = [{
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      padding: 10,
      components: [
        {
          type: 'background',
          id: 'surface',
          source: { src: 'fixture-background', data: { resolution: 2 } },
          tint: '#ffffff80',
        },
        {
          type: 'icon',
          id: 'icon',
          source: 'fixture-icon',
          size: { width: '50%', height: '25%' },
          placement: 'right-top',
          margin: { top: 2, right: 3 },
        },
      ],
    }];

    const first = parsePatchMap(input);
    const second = parsePatchMap(input);
    const backgroundId = 'item-a::background:surface';
    const iconId = 'item-a::icon:icon';
    const background = first.projection.componentsByEntityId?.[backgroundId];
    const icon = first.projection.componentsByEntityId?.[iconId];

    expect(first.projection.componentsByEntityId).toEqual(second.projection.componentsByEntityId);
    expect(first.projection.backgroundsByEntityId).toEqual(second.projection.backgroundsByEntityId);
    expect(background).toEqual({
      entityId: backgroundId,
      ownerId: 'item-a',
      componentId: 'surface',
      componentType: 'background',
      logicalIdentity: backgroundId,
      renderRole: 'background-asset',
    });
    expect(first.projection.backgroundsByEntityId?.[backgroundId]).toEqual({
      entityId: backgroundId,
      sourceKind: 'asset',
      fill: 0x00000000,
      borderWidth: 0,
      borderColor: 0x000000ff,
      radius: [0, 0, 0, 0],
      tint: 0xffffff80,
    });
    expect(icon).toEqual({
      entityId: iconId,
      ownerId: 'item-a',
      componentId: 'icon',
      componentType: 'icon',
      logicalIdentity: iconId,
      renderRole: 'content-asset',
      authoredSize: { width: '50%', height: '25%' },
    });
    expect(first.projection.backgroundsByEntityId?.[iconId]).toBeUndefined();
    expect(first.document.entities.find((entity) => entity.id === iconId)).toMatchObject({
      kind: 'image',
      x: 47,
      y: 12,
      width: 40,
      height: 15,
    });
    expect(first.projection.byEntityId[iconId]?.localBounds).toEqual([0, 0, 40, 15]);
    expect(first.projection.imagesByEntityId?.[backgroundId]).toMatchObject({
      authoredSource: { src: 'fixture-background', data: { resolution: 2 } },
      sourceKind: 'descriptor',
    });
    expect(first.projection.imagesByEntityId?.[iconId]).toMatchObject({
      authoredSource: 'fixture-icon',
      sourceKind: 'alias',
    });
    expect(background).not.toHaveProperty('source');
    expect(background).not.toHaveProperty('bindingKey');
    expect(icon).not.toHaveProperty('source');
    expect(icon).not.toHaveProperty('bindingKey');
  });
});
