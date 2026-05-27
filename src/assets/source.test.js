import { describe, expect, it } from 'vitest';
import {
  assetSourceCacheKey,
  isAssetSource,
  toLoadableAssetSource,
} from './source';

describe('asset source helpers', () => {
  it('detects inline asset source descriptors', () => {
    expect(isAssetSource({ src: 'icon.svg' })).toBe(true);
    expect(isAssetSource({ type: 'rect', fill: 'white' })).toBe(false);
    expect(isAssetSource('icon.svg')).toBe(false);
  });

  it('builds stable cache keys for equivalent descriptor data', () => {
    const left = {
      src: 'icon.svg',
      data: { resolution: 3, options: { scaleMode: 'linear', mipmap: false } },
    };
    const right = {
      data: { options: { mipmap: false, scaleMode: 'linear' }, resolution: 3 },
      src: 'icon.svg',
    };

    expect(assetSourceCacheKey(left)).toBe(assetSourceCacheKey(right));
  });

  it('keeps descriptors with different loader options separated', () => {
    const source = { src: 'icon.svg', data: { resolution: 2 } };
    const higherResolution = { src: 'icon.svg', data: { resolution: 3 } };

    expect(assetSourceCacheKey(source)).not.toBe(
      assetSourceCacheKey(higherResolution),
    );
  });

  it('normalizes parser and loadParser when building cache keys', () => {
    expect(assetSourceCacheKey({ src: 'icon.svg', parser: 'svg' })).toBe(
      assetSourceCacheKey({ src: 'icon.svg', loadParser: 'svg' }),
    );
  });

  it('uses an internal alias and never forwards caller-provided alias', () => {
    const loadable = toLoadableAssetSource({
      src: 'mock://icon',
      alias: 'public-alias',
      data: { resolution: 3 },
    });

    expect(loadable.alias).toBe(assetSourceCacheKey(loadable));
    expect(loadable.alias).not.toBe('public-alias');
    expect(loadable.src).toBe('mock://icon');
    expect(loadable.data).toEqual({ resolution: 3 });
  });

  it('scopes image loader URLs while preserving the original parser type', () => {
    const loadable = toLoadableAssetSource({
      src: 'https://example.com/icon.svg?token=abc',
      data: { resolution: 3 },
    });

    expect(loadable.src).toContain('https://example.com/icon.svg?token=abc#');
    expect(loadable.src).toContain('patchmapAssetSource=');
    expect(loadable.parser).toBe('svg');
  });
});
