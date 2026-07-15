import { Assets, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AggregateLeafLayer, isBitmapTextSafe } from '../../src/core-v2/renderers/leaf-layer';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Core v2 aggregate leaf policy', () => {
  it('routes short ASCII labels to BitmapText and guards CJK/emoji/rich content', () => {
    expect(isBitmapTextSafe('CPU 42%')).toBe(true);
    expect(isBitmapTextSafe('line one\nline two')).toBe(true);
    expect(isBitmapTextSafe('인버터 42')).toBe(false);
    expect(isBitmapTextSafe('ready ✅')).toBe(false);
    expect(isBitmapTextSafe('x'.repeat(129))).toBe(false);
  });

  it('starts empty and has an idempotent asynchronous lifecycle', async () => {
    const layer = new AggregateLeafLayer();
    expect(layer.container.label).toBe('core-v2:text-and-assets');
    expect(layer.debugSnapshot()).toEqual({
      bitmapTextCount: 0,
      fallbackTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
    });
    await layer.destroy();
    await layer.destroy();
  });

  it('reference-counts a concurrent shared URL across leaf layers', async () => {
    const url = 'core-v2-test://shared-texture.png';
    vi.spyOn(Assets, 'get').mockReturnValue(undefined as never);
    let resolveLoad: ((texture: Texture) => void) | undefined;
    const loaded = new Promise<Texture>((resolve) => {
      resolveLoad = resolve;
    });
    const load = vi.spyOn(Assets, 'load').mockImplementation(() => loaded as never);
    const unload = vi.spyOn(Assets, 'unload').mockResolvedValue(undefined as never);
    const first = new AggregateLeafLayer();
    const second = new AggregateLeafLayer();

    const firstLoad = first.loadAsset('shared', url);
    const secondLoad = second.loadAsset('shared', url);
    expect(load).toHaveBeenCalledTimes(1);
    resolveLoad?.(Texture.WHITE);
    await Promise.all([firstLoad, secondLoad]);

    expect(first.debugSnapshot().loadedAssetCount).toBe(1);
    expect(second.debugSnapshot().loadedAssetCount).toBe(1);
    await first.destroy();
    expect(unload).not.toHaveBeenCalled();
    expect(second.debugSnapshot().loadedAssetCount).toBe(1);

    expect(await second.unloadAsset('shared')).toBe(true);
    expect(unload).not.toHaveBeenCalled();
    await second.finalizeAssetUnloads();
    expect(unload).toHaveBeenCalledTimes(1);
    expect(unload).toHaveBeenCalledWith(url);
    await second.destroy();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('borrows a texture already present in the external Assets cache', async () => {
    const url = 'core-v2-test://external-texture.png';
    vi.spyOn(Assets, 'get').mockReturnValue(Texture.WHITE as never);
    const load = vi.spyOn(Assets, 'load').mockRejectedValue(new Error('must not reload') as never);
    const unload = vi.spyOn(Assets, 'unload').mockResolvedValue(undefined as never);
    const layer = new AggregateLeafLayer();

    await layer.loadAsset('external', url);
    expect(load).not.toHaveBeenCalled();
    expect(await layer.unloadAsset('external')).toBe(true);
    await layer.finalizeAssetUnloads();
    await layer.destroy();

    expect(unload).not.toHaveBeenCalled();
  });
});
