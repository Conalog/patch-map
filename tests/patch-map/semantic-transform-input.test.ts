import { describe, expect, it } from 'vitest';

import { PatchMapParseError } from '../../src/patch-map/contracts';
import type { ElementAttributes } from '../../src/patch-map/input';
import { parsePatchMap } from '../../src/patch-map/parser';
import {
  materializePatchMapDataset,
  PatchMapDatasetError,
} from '../../src/patch-map/semantic/dataset';

const RESERVED_TRANSFORM_ATTRS = [
  'scale',
  'skew',
  'pivot',
  'skewX',
  'skewY',
  'pivotX',
  'pivotY',
] as const;

describe('PatchMap semantic transform input', () => {
  it.each(RESERVED_TRANSFORM_ATTRS)(
    'rejects reserved attrs.%s at both semantic admission boundaries',
    (key) => {
      const input = [{
        type: 'rect',
        id: `reserved-${key}`,
        attrs: { [key]: 1, display: 'host-owned' },
        size: 10,
      }];

      expect(() => materializePatchMapDataset(input)).toThrowError(
        expect.objectContaining<Partial<PatchMapDatasetError>>({
          code: 'INVALID_VALUE',
          datasetPath: `$[0].attrs.${key}`,
        }),
      );

      try {
        parsePatchMap(input);
        expect.unreachable('direct parser must reject reserved transform attrs');
      } catch (error) {
        expect(error).toBeInstanceOf(PatchMapParseError);
        expect((error as PatchMapParseError).diagnostics).toContainEqual({
          level: 'error',
          code: 'unsupported-transform-attribute',
          path: `$[0].attrs.${key}`,
          message: `${key} is not a supported PatchMap transform attribute`,
        });
      }
    },
  );

  it.each(RESERVED_TRANSFORM_ATTRS)(
    'rejects reserved component attrs.%s without closing host attrs',
    (key) => {
      const input = [{
        type: 'item',
        id: 'owner',
        size: 20,
        components: [{
          type: 'icon',
          id: `reserved-${key}`,
          attrs: { [key]: 1, metadata: { owner: 'host' } },
          source: 'icon',
          size: 10,
        }],
      }];
      const path = `$[0].components[0].attrs.${key}`;

      expect(() => materializePatchMapDataset(input)).toThrowError(
        expect.objectContaining<Partial<PatchMapDatasetError>>({
          code: 'INVALID_VALUE',
          datasetPath: path,
        }),
      );
      expect(() => parsePatchMap(input)).toThrowError(PatchMapParseError);
      try {
        parsePatchMap(input);
      } catch (error) {
        expect((error as PatchMapParseError).diagnostics.at(-1)).toMatchObject({
          level: 'error',
          code: 'unsupported-transform-attribute',
          path,
        });
      }
    },
  );

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

  it('keeps host attrs open while excluding reserved transform spellings from public types', () => {
    const attrs = {
      x: 1,
      scaleX: -1,
      display: 'block',
      metadata: { product: 'host' },
    } satisfies ElementAttributes;

    // @ts-expect-error attrs.scale is reserved and cannot be authored.
    const rejected = { scale: 2 } satisfies ElementAttributes;
    expect(attrs.display).toBe('block');
    expect(rejected.scale).toBe(2);
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
