import { describe, expect, it } from 'vitest';

import { parsePatchMap } from '../../src/parsing';
import {
  normalizePatchMapTextStylePatch,
  type PatchMapDatasetError,
} from '../../src/semantic/dataset';
import {
  normalizeAssetSource,
  normalizeRectTexture,
  normalizeStrokeStyle,
  normalizeTextStyle,
} from '../../src/semantic/dataset/style-normalization';

describe('PatchMap authored style normalization', () => {
  it('detaches and freezes authored asset, stroke, and nested text-style values', () => {
    const assetInput = {
      src: '/asset.png',
      data: { parserOptions: { resolution: 2 } },
      parser: 'texture',
    };
    const strokeInput = {
      color: '#102030',
      fill: { color: '#405060' },
      texture: { source: '/stroke.png' },
      matrix: [1, 0, 0, 1, 4, 8],
    };
    const styleInput = {
      fill: 'primary.default',
      stroke: strokeInput,
      dropShadow: { color: '#000000', alpha: 0.4, blur: 7 },
      tagStyles: {
        strong: { fontWeight: 700, fill: '#ffffff' },
      },
      filters: [{ kind: 'outline', width: 2 }],
    };

    const asset = normalizeAssetSource(assetInput, '$.source');
    const stroke = normalizeStrokeStyle(strokeInput, '$.stroke');
    const style = normalizeTextStyle(styleInput, '$.style', true, true);

    expect(asset).toEqual(assetInput);
    expect(asset).not.toBe(assetInput);
    expect(Object.isFrozen(asset)).toBe(true);
    expect(Object.isFrozen(typeof asset === 'string' ? null : asset.data?.parserOptions)).toBe(true);
    expect(stroke).toMatchObject({
      color: '#102030',
      fill: { color: '#405060' },
      texture: { source: '/stroke.png' },
      matrix: [1, 0, 0, 1, 4, 8],
    });
    expect(Object.isFrozen(stroke.fill)).toBe(true);
    expect(Object.isFrozen(stroke.texture)).toBe(true);
    expect(Object.isFrozen(stroke.matrix)).toBe(true);
    expect(style).toMatchObject({
      fontFamily: 'FiraCode',
      fontSize: 16,
      fontWeight: 400,
      fill: 'primary.default',
      dropShadow: { color: '#000000', alpha: 0.4, blur: 7 },
      tagStyles: { strong: { fontWeight: 700, fill: '#ffffff' } },
      filters: [{ kind: 'outline', width: 2 }],
    });
    expect(Object.isFrozen(style)).toBe(true);
    expect(Object.isFrozen(style.dropShadow)).toBe(true);
    expect(Object.isFrozen(style.tagStyles)).toBe(true);
    expect(Object.isFrozen(style.filters)).toBe(true);
  });

  it('preserves defaults and exact closed-schema diagnostic precedence', () => {
    expect(normalizeRectTexture({ type: 'rect' }, '$.source')).toEqual({
      type: 'rect',
      fill: '#00000000',
      borderWidth: 0,
      borderColor: '#1a1a1aff',
      radius: 0,
    });
    expect(normalizeRectTexture({}, '$.source')).toEqual({
      type: 'rect',
      fill: '#00000000',
      borderWidth: 0,
      borderColor: '#1a1a1aff',
      radius: 0,
    });
    const parsed = parsePatchMap([{
      type: 'item',
      id: 'item',
      size: 20,
      components: [
        {
          type: 'background',
          id: 'background',
          source: { fill: '#ff0000' },
        },
        {
          type: 'bar',
          id: 'bar',
          source: { fill: '#ffffff' },
          size: 10,
        },
      ],
    }]);
    expect(parsed.document.entities.find(({ id }) => id === 'item::background:background'))
      .toMatchObject({ kind: 'rect', fill: 0xff0000ff });
    expect(parsed.document.entities.find(({ id }) => id === 'item::bar:bar')).toMatchObject({
      kind: 'bar',
      fill: 0xffffffff,
    });
    expect(normalizeStrokeStyle(undefined, '$.style')).toEqual({
      color: '#1a1a1aff',
      alpha: 1,
      width: 1,
      cap: 'butt',
      join: 'miter',
      miterLimit: 10,
      alignment: 0.5,
      pixelLine: false,
    });
    expect(() => normalizeAssetSource({
      src: 42,
      zUnknown: true,
      aUnknown: true,
    }, '$.source')).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'UNKNOWN_FIELD',
        datasetPath: '$.source.aUnknown',
      }),
    );
    const unknownDescriptorField = 'unsupportedLoader';
    expect(() => normalizeAssetSource({
      src: '/unknown-descriptor-field',
      [unknownDescriptorField]: 'loadTextures',
    }, '$.source')).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'UNKNOWN_FIELD',
        datasetPath: `$.source.${unknownDescriptorField}`,
      }),
    );
    expect(normalizeAssetSource({
      src: '/legacy-parser',
      loadParser: 'loadTextures',
    }, '$.source')).toEqual({
      src: '/legacy-parser',
      loadParser: 'loadTextures',
    });
    expect(() => normalizeTextStyle({
      alpha: 2,
      zUnknown: true,
      aUnknown: true,
    }, '$.style', true, false)).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'UNKNOWN_FIELD',
        datasetPath: '$.style.aUnknown',
      }),
    );
  });

  it('keeps the public item-text patch path default-free with exact nested errors', () => {
    const patch = normalizePatchMapTextStylePatch({
      fontSize: '12px',
      dropShadow: { blur: 4 },
      tagStyles: { emphasis: { fontStyle: 'italic' } },
    }, '$.styles[3]');

    expect(patch).toEqual({
      fontSize: '12px',
      dropShadow: { blur: 4 },
      tagStyles: { emphasis: { fontStyle: 'italic' } },
    });
    expect(Object.isFrozen(patch)).toBe(true);
    expect(() => normalizePatchMapTextStylePatch({
      dropShadow: { opacity: 0.5, blur: 'soft' },
    }, '$.styles[3]')).toThrowError(
      expect.objectContaining<Partial<PatchMapDatasetError>>({
        code: 'UNKNOWN_FIELD',
        datasetPath: '$.styles[3].dropShadow.opacity',
      }),
    );
  });
});
