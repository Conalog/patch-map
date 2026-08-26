import { describe, expect, it } from 'vitest';

import { PatchMapParseError } from '../../src/parsing/contracts';
import type { ElementAttributes } from '../../src/public/input';
import { parsePatchMap } from '../../src/parsing';
import {
  materializePatchMapDataset,
  PatchMapDatasetError,
} from '../../src/semantic/dataset';

describe('PatchMap semantic transform input', () => {
  it('preserves release-compatible transform attrs without projecting them', () => {
    const attrs = {
      scale: { x: 2, y: 3 },
      skew: 0.25,
      pivot: { x: 4, y: 5 },
      skewX: 0.1,
      skewY: 0.2,
      pivotX: 6,
      pivotY: 7,
      display: 'host-owned',
    };
    const input = [{ type: 'rect', id: 'compat', attrs, size: 10 }];

    const materialized = materializePatchMapDataset(input);
    const parsed = parsePatchMap(materialized.dataset);

    expect(materialized.dataset[0]?.attrs).toEqual(attrs);
    expect(materialized.dataset[0]?.attrs).not.toBe(attrs);
    expect(parsed.identity.elements[0]?.rawAttrs).toEqual(attrs);
    expect(parsed.projection.byEntityId.compat).toMatchObject({
      scaleX: 1,
      scaleY: 1,
    });
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'attribute-preserved-only',
      path: '$[0].attrs.scale',
    }));
  });

  it('preserves the same compatibility attrs on item components', () => {
    const attrs = {
      scale: 2,
      skew: { x: 0.1, y: 0.2 },
      pivot: 3,
      pivotX: 4,
      metadata: { owner: 'host' },
    };
    const input = [{
      type: 'item',
      id: 'owner',
      size: 20,
      components: [{
        type: 'icon',
        id: 'compat',
        attrs,
        source: 'icon',
        size: 10,
      }],
    }];

    const materialized = materializePatchMapDataset(input);
    const parsed = parsePatchMap(materialized.dataset);

    expect(materialized.dataset[0]?.type === 'item'
      ? materialized.dataset[0].components[0]?.attrs
      : undefined).toEqual(attrs);
    expect(parsed.identity.components[0]?.rawAttrs).toEqual(attrs);
  });

  it('keeps canonical signed-axis transforms identical, detached, and deeply immutable', () => {
    const attrs = {
      x: 10,
      y: 20,
      angle: 30,
      scaleX: -2,
      scaleY: 0.5,
      display: 'host-owned',
      metadata: { owner: 'caller' },
    };
    const input = [{ type: 'rect', id: 'canonical', attrs, size: { width: 40, height: 20 } }];
    const before = structuredClone(input);

    const materialized = materializePatchMapDataset(input);
    const direct = parsePatchMap(input);
    const normalized = parsePatchMap(materialized.dataset);
    const materializedAttrs = materialized.dataset[0]?.attrs;

    expect(input).toEqual(before);
    expect(materializedAttrs).toEqual(attrs);
    expect(materializedAttrs).not.toBe(attrs);
    expect(Object.isFrozen(materializedAttrs)).toBe(true);
    expect(Object.isFrozen(materializedAttrs?.metadata)).toBe(true);
    expect(direct.projection.byEntityId.canonical).toEqual(
      normalized.projection.byEntityId.canonical,
    );
    expect(direct.projection.byEntityId.canonical).toMatchObject({
      rotationDegrees: 30,
      scaleX: -2,
      scaleY: 0.5,
    });
    expect(direct.identity.elements[0]?.rawAttrs).toEqual(attrs);
    expect(direct.identity.elements[0]?.rawAttrs).not.toBe(attrs);
    expect(Object.isFrozen(direct.identity.elements[0]?.rawAttrs)).toBe(true);
    expect(Object.isFrozen(direct.identity.elements[0]?.rawMetadata)).toBe(true);
  });

  it('keeps host attrs open while exposing compatibility transform spellings in public types', () => {
    const attrs = {
      x: 1,
      scaleX: -1,
      scale: 2,
      skew: { x: 0, y: 1 },
      pivot: { x: 2, y: 3 },
      display: 'block',
      metadata: { product: 'host' },
    } satisfies ElementAttributes;

    expect(attrs.display).toBe('block');
    expect(attrs.scale).toBe(2);
  });

  it.each([
    ['scale', { x: 1 }],
    ['skew', Number.POSITIVE_INFINITY],
    ['pivot', { x: 0, y: Number.NaN }],
  ] as const)('rejects malformed compatibility attrs.%s during materialization', (key, value) => {
    const input = [{ type: 'rect', id: `invalid-${key}`, attrs: { [key]: value }, size: 10 }];
    expect(() => materializePatchMapDataset(input)).toThrowError(PatchMapDatasetError);
  });

  it.each([
    ['x', 'bad'],
    ['y', Number.NaN],
    ['angle', null],
    ['rotation', Number.POSITIVE_INFINITY],
    ['scaleX', 'bad'],
    ['scaleY', null],
    ['zIndex', Number.NEGATIVE_INFINITY],
    ['alpha', -0.1],
    ['alpha', 1.1],
  ] as const)('rejects invalid canonical attrs.%s at both admission boundaries', (key, value) => {
    const input = [{ type: 'rect', id: `invalid-${key}`, attrs: { [key]: value }, size: 10 }];
    expect(() => materializePatchMapDataset(input)).toThrowError(PatchMapDatasetError);
    expect(() => parsePatchMap(input)).toThrowError(PatchMapParseError);
  });

  it('rejects authored angle and rotation together at both admission boundaries', () => {
    const input = [{
      type: 'rect',
      id: 'rotation-conflict',
      attrs: { angle: 90, rotation: Math.PI / 2 },
      size: 10,
    }];
    expect(() => materializePatchMapDataset(input)).toThrowError(PatchMapDatasetError);
    expect(() => parsePatchMap(input)).toThrowError(PatchMapParseError);
  });
});
