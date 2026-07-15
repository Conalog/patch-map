import { Assets, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RenderStoreView } from '../../src/core-v1/renderer/types';
import { RenderFlags, RenderKind } from '../../src/core-v1/renderer/types';
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

  it('recomputes unresolved aliases across full reload and final image removal', async () => {
    const layer = new AggregateLeafLayer();

    expect(layer.sync(createImageStore('missing-a'), { fullRebuildEpoch: 1 }).unresolvedAssetCount).toBe(1);
    expect(layer.sync(createImageStore('missing-b'), { fullRebuildEpoch: 2 }).unresolvedAssetCount).toBe(1);

    const removed = createImageStore('missing-b', false);
    expect(layer.sync(removed, { changedRanges: [{ start: 0, end: 1 }] }).unresolvedAssetCount).toBe(0);

    await layer.destroy();
  });
});

function createImageStore(source: string, alive = true): RenderStoreView {
  const zeros = () => new Float64Array(1);
  return {
    capacity: 1,
    liveCount: alive ? 1 : 0,
    revision: 1,
    alive: Uint8Array.from([alive ? 1 : 0]),
    kind: Uint8Array.from([RenderKind.Image]),
    flags: Uint8Array.from([RenderFlags.Visible]),
    zIndex: new Int32Array(1),
    x: zeros(),
    y: zeros(),
    width: Float64Array.from([10]),
    height: Float64Array.from([10]),
    rotation: zeros(),
    opacity: Float64Array.from([1]),
    fill: new Uint32Array(1),
    stroke: new Uint32Array(1),
    strokeWidth: zeros(),
    radius: zeros(),
    text: [''],
    color: new Uint32Array(1),
    fontSize: zeros(),
    fontFamily: [''],
    fontWeight: new Uint16Array(1),
    align: new Uint8Array(1),
    maxLines: new Uint16Array(1),
    source: [source],
    tint: Uint32Array.from([0xffffffff]),
    fit: new Uint8Array(1),
    value: zeros(),
    min: zeros(),
    max: zeros(),
    trackFill: new Uint32Array(1),
    relationFrom: Int32Array.from([-1]),
    relationTo: Int32Array.from([-1]),
    lineWidth: zeros(),
    ids: ['image'],
    view: { x: 0, y: 0, scale: 1 },
    background: 0,
    renderOrder: () => Uint32Array.from([0]),
  };
}
