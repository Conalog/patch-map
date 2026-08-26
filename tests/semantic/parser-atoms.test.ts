import { describe, expect, it } from 'vitest';

import {
  deterministicPatchMapTokenColor,
  multiplyPatchMapRgba,
  parsePatchMapCssColor,
} from '../../src/parsing/color';
import { normalizePatchMapImageSource } from '../../src/parsing/image-source';

describe('PatchMap parser atoms', () => {
  it.each([
    ['#abc', 0xaabbccff],
    ['#abcd', 0xaabbccdd],
    ['rgb(255, 0, 128)', 0xff0080ff],
    ['rgba(100%, 0%, 50%, 25%)', 0xff007f40],
    ['hsl(0, 100%, 50%)', 0xff0000ff],
    ['hsla(120, 100%, 25%, 0.5)', 0x00800080],
  ])('parses the pinned CSS color profile for %s', (source, expected) => {
    expect(parsePatchMapCssColor(source)).toBe(expected);
  });

  it('preserves deterministic packed RGBA multiplication and token fallback', () => {
    expect(multiplyPatchMapRgba(0x804020ff, 0x80808080)).toBe(0x40201080);
    expect(deterministicPatchMapTokenColor('unknown-theme-token')).toBe(
      deterministicPatchMapTokenColor('unknown-theme-token'),
    );
    expect(deterministicPatchMapTokenColor('unknown-theme-token')).not.toBe(
      deterministicPatchMapTokenColor('another-token'),
    );
  });

  it('normalizes aliases, URLs, data URIs, and descriptor key order deterministically', () => {
    expect(normalizePatchMapImageSource('icon-alias')).toMatchObject({
      sourceKind: 'alias',
      bindingKey: 'alias:icon-alias',
      cacheIdentity: 'alias:icon-alias',
    });
    expect(normalizePatchMapImageSource('https://example.test/a.png')).toMatchObject({
      sourceKind: 'url',
      bindingKey: 'url:https://example.test/a.png',
    });
    expect(normalizePatchMapImageSource('data:image/png;base64,AA==')).toMatchObject({
      sourceKind: 'data-uri',
    });

    const left = normalizePatchMapImageSource(Object.freeze({
      src: '/asset',
      data: Object.freeze({ z: 2, a: 1 }),
    }));
    const right = normalizePatchMapImageSource(Object.freeze({
      src: '/asset',
      data: Object.freeze({ a: 1, z: 2 }),
    }));

    expect(left.bindingKey).toBe(right.bindingKey);
    expect(left.cacheIdentity).toBe(right.cacheIdentity);
  });

  it('frames ambiguous descriptor identities instead of aliasing query-shaped sources', () => {
    const normalized = normalizePatchMapImageSource(Object.freeze({
      src: '/asset?parser=texture',
      parser: 'texture',
    }));

    expect(normalized.cacheIdentity).toMatch(/^descriptor-safe:/u);
  });
});
