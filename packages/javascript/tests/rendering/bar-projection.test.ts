import { describe, expect, it } from 'vitest';

import { PatchMapParseError } from '../../src/parsing/contracts';
import { parsePatchMap } from '../../src/parsing';

describe('PatchMap bar projection sidecar', () => {
  it('retains exact stable identity, placement policy, and semantic destination without aliases', () => {
    const margin = { top: 1, right: 2, bottom: 3, left: 4 };
    const input = [{
      type: 'item',
      id: 'meter',
      size: { width: 120, height: 100 },
      padding: { top: 5, right: 7, bottom: 11, left: 13 },
      contentOrientation: 'follow-item',
      components: [{
        type: 'bar',
        id: 'level',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 30, height: '50%' },
        placement: 'right-bottom',
        margin,
        animation: false,
        animationDuration: 350,
      }],
    }];
    const before = structuredClone(input);

    const parsed = parsePatchMap(input);
    const bars = parsed.projection.barsByEntityId;
    const projection = bars?.['meter::bar:level'];

    expect(projection).toEqual({
      entityId: 'meter::bar:level',
      ownerId: 'meter',
      componentId: 'level',
      placement: 'right-bottom',
      margin: { top: 1, right: 2, bottom: 3, left: 4 },
      contentOrientation: 'follow-item',
      animation: false,
      animationDuration: 350,
      destinationHeight: 42,
      trackFill: 0x336699ff,
      tint: 0xffffffff,
      radius: 0,
      percentageReferenceHeight: 84,
    });
    expect(parsed.document.entities.find((entity) => entity.id === projection?.entityId)).toMatchObject({
      kind: 'bar',
      height: 42,
    });
    expect(input).toEqual(before);
    expect(projection?.margin).not.toBe(margin);
    expect(Object.isFrozen(parsed.projection)).toBe(true);
    expect(Object.isFrozen(bars)).toBe(true);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection?.margin)).toBe(true);

    margin.bottom = 99;
    input[0]!.components[0]!.animationDuration = 999;
    expect(projection?.margin.bottom).toBe(3);
    expect(projection?.animationDuration).toBe(350);
  });

  it('applies direct-load defaults and deterministic grid component identity', () => {
    const input = [{
      type: 'grid',
      id: 'rack',
      cells: [[1, 1]],
      item: {
        size: { width: 40, height: 80 },
        components: [{
          type: 'bar',
          id: 'level',
          source: { type: 'rect' },
          size: { width: 20, height: 10 },
        }],
      },
    }];
    const before = structuredClone(input);

    const first = parsePatchMap(input);
    const second = parsePatchMap(input);

    expect(first.projection.barsByEntityId).toEqual({
      'rack.0.0::bar:level': {
        entityId: 'rack.0.0::bar:level',
        ownerId: 'rack.0.0',
        componentId: 'level',
        placement: 'bottom',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        contentOrientation: 'upright',
        animation: true,
        animationDuration: 200,
        destinationHeight: 10,
        trackFill: 0,
        tint: 0xffffffff,
        radius: 0,
        percentageReferenceHeight: 80,
      },
      'rack.0.1::bar:level': {
        entityId: 'rack.0.1::bar:level',
        ownerId: 'rack.0.1',
        componentId: 'level',
        placement: 'bottom',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        contentOrientation: 'upright',
        animation: true,
        animationDuration: 200,
        destinationHeight: 10,
        trackFill: 0,
        tint: 0xffffffff,
        radius: 0,
        percentageReferenceHeight: 80,
      },
    });
    expect(first.projection.barsByEntityId).toEqual(second.projection.barsByEntityId);
    expect(first.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'component-animation-unsupported',
    }));
    expect(input).toEqual(before);
  });

  it('accepts disabled and zero-duration bar presentation as explicit immediate policy', () => {
    const parsed = parsePatchMap([itemWithBar({
      animation: false,
      animationDuration: 0,
    })]);

    expect(parsed.projection.barsByEntityId?.['item::bar:bar']).toMatchObject({
      animation: false,
      animationDuration: 0,
      destinationHeight: 10,
    });
    expect(parsed.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'component-animation-unsupported',
    }));
  });

  it.each([
    {
      label: 'string animation',
      changes: { animation: 'true' },
      code: 'invalid-component-animation',
      path: '$[0].components[0].animation',
    },
    {
      label: 'null animation',
      changes: { animation: null },
      code: 'invalid-component-animation',
      path: '$[0].components[0].animation',
    },
    {
      label: 'negative duration',
      changes: { animationDuration: -1 },
      code: 'invalid-animation-duration',
      path: '$[0].components[0].animationDuration',
    },
    {
      label: 'non-finite duration',
      changes: { animationDuration: Number.POSITIVE_INFINITY },
      code: 'invalid-animation-duration',
      path: '$[0].components[0].animationDuration',
    },
    {
      label: 'string duration',
      changes: { animationDuration: '200' },
      code: 'invalid-animation-duration',
      path: '$[0].components[0].animationDuration',
    },
  ])('fails atomically for $label without mutating caller input', ({ changes, code, path }) => {
    const input = [itemWithBar(changes)];
    const before = structuredClone(input);

    try {
      parsePatchMap(input);
      throw new Error('expected bar animation validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(PatchMapParseError);
      expect((error as PatchMapParseError).diagnostics).toContainEqual(expect.objectContaining({
        level: 'error',
        code,
        path,
        sourceId: 'item',
      }));
    }
    expect(input).toEqual(before);
  });

  it('keeps animation fields on non-bar components explicitly unsupported', () => {
    const parsed = parsePatchMap([{
      type: 'item',
      id: 'item',
      size: 20,
      components: [{
        type: 'icon',
        id: 'icon',
        source: 'fixture-icon',
        size: 10,
        animation: true,
        animationDuration: 200,
      }],
    }]);

    expect(parsed.projection.barsByEntityId).toEqual({});
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'component-animation-unsupported',
      path: '$[0].components[0]',
    }));
  });
});

function itemWithBar(changes: Readonly<Record<string, unknown>>) {
  return {
    type: 'item',
    id: 'item',
    size: 20,
    components: [{
      type: 'bar',
      id: 'bar',
      source: { type: 'rect' },
      size: { width: 10, height: 10 },
      ...changes,
    }],
  };
}
