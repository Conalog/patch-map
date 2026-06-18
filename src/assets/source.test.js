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

  it('does not treat reused data objects as cycles', () => {
    const sharedOptions = { scaleMode: 'linear', mipmap: false };
    const sharedObjectKey = assetSourceCacheKey({
      src: 'icon.svg',
      data: { left: sharedOptions, right: sharedOptions },
    });
    const duplicatedObjectKey = assetSourceCacheKey({
      src: 'icon.svg',
      data: {
        left: { scaleMode: 'linear', mipmap: false },
        right: { scaleMode: 'linear', mipmap: false },
      },
    });

    expect(sharedObjectKey).toBe(duplicatedObjectKey);
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
    const source = {
      src: 'mock://icon',
      alias: 'public-alias',
      data: { resolution: 3 },
    };
    const loadable = toLoadableAssetSource(source);

    expect(loadable.alias).toBe(assetSourceCacheKey(source));
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

  it('preserves existing URL fragments when scoping image loader URLs', () => {
    const loadable = toLoadableAssetSource({
      src: 'https://example.com/icons.svg#router',
      data: { resolution: 3 },
    });

    expect(loadable.src).toContain('https://example.com/icons.svg?');
    expect(loadable.src).toContain('patchmapAssetSource=');
    expect(loadable.src.endsWith('#router')).toBe(true);
    expect(loadable.parser).toBe('svg');
  });

  it('preserves existing query strings and fragments together', () => {
    const loadable = toLoadableAssetSource({
      src: 'https://example.com/icons.svg?token=abc#router',
      data: { resolution: 3 },
    });

    expect(loadable.src).toContain(
      'https://example.com/icons.svg?token=abc&patchmapAssetSource=',
    );
    expect(loadable.src.endsWith('#router')).toBe(true);
    expect(loadable.parser).toBe('svg');
  });
});
