import { Assets, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RenderStoreView } from '../../src/core-v1/renderer/types';
import { RenderFlags, RenderKind } from '../../src/core-v1/renderer/types';
import { CORE_V2_ASSET_RUNTIME } from '../../src/core-v2/assets';
import { AggregateLeafLayer, isBitmapTextSafe } from '../../src/core-v2/renderers/leaf-layer';

let layerSequence = 0;

function createAssetLayer(): AggregateLeafLayer {
  const session = CORE_V2_ASSET_RUNTIME.createSession({
    instanceId: `leaf-test-${++layerSequence}`,
    policy: () => undefined,
  });
  return new AggregateLeafLayer(session, true);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockOwnedAssetTransport(): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
    new Blob(['fixture'], { type: 'image/png' }),
    { status: 200 },
  ))));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:core-v2/leaf-fixture');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

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
    mockOwnedAssetTransport();
    vi.spyOn(Assets, 'get').mockReturnValue(undefined as never);
    let resolveLoad: ((texture: Texture) => void) | undefined;
    const loaded = new Promise<Texture>((resolve) => {
      resolveLoad = resolve;
    });
    const load = vi.spyOn(Assets, 'load').mockImplementation(() => loaded as never);
    const unload = vi.spyOn(Assets, 'unload').mockResolvedValue(undefined as never);
    const first = createAssetLayer();
    const second = createAssetLayer();

    const firstLoad = first.loadAsset('shared', url);
    const secondLoad = second.loadAsset('shared', url);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
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
    expect(unload).toHaveBeenCalledWith(expect.stringMatching(/^core-v2-asset:/));
    await second.destroy();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('invalidates an in-flight alias when it is unloaded before resolution', async () => {
    const url = 'core-v2-test://pending-unload.png';
    mockOwnedAssetTransport();
    vi.spyOn(Assets, 'get').mockReturnValue(undefined as never);
    let resolveLoad: ((texture: Texture) => void) | undefined;
    const loaded = new Promise<Texture>((resolve) => {
      resolveLoad = resolve;
    });
    const load = vi.spyOn(Assets, 'load').mockImplementation(() => loaded as never);
    const unload = vi.spyOn(Assets, 'unload').mockResolvedValue(undefined as never);
    const layer = createAssetLayer();

    const pending = layer.loadAsset('pending', url);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await expect(layer.unloadAsset('pending')).resolves.toBe(true);

    resolveLoad?.(Texture.WHITE);
    await pending;
    expect(layer.debugSnapshot().loadedAssetCount).toBe(0);
    expect(unload).toHaveBeenCalledTimes(1);

    await layer.destroy();
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('syncs only slots indexed by an asset alias after load and unload', async () => {
    mockOwnedAssetTransport();
    vi.spyOn(Assets, 'get').mockReturnValue(undefined as never);
    vi.spyOn(Assets, 'load').mockResolvedValue(Texture.WHITE as never);
    vi.spyOn(Assets, 'unload').mockResolvedValue(undefined as never);
    const layer = createAssetLayer();
    const store = createImageStoreForSources(['target', 'other-a', 'target', 'other-b']);

    layer.sync(store, { fullRebuildEpoch: 1 });
    await layer.loadAsset('target', 'core-v2-test://indexed-target.png');

    const afterLoadReads: number[] = [];
    layer.sync(trackAliveReads(store, afterLoadReads), {
      fullRebuildEpoch: 1,
      changedRanges: [],
    });
    expect(afterLoadReads).toEqual([0, 2]);

    await expect(layer.unloadAsset('target')).resolves.toBe(true);
    const afterUnloadReads: number[] = [];
    layer.sync(trackAliveReads(store, afterUnloadReads), {
      fullRebuildEpoch: 1,
      changedRanges: [],
    });
    expect(afterUnloadReads).toEqual([0, 2]);

    await layer.finalizeAssetUnloads();
    await layer.destroy();
  });

  it('borrows a texture already present in the external Assets cache', async () => {
    const url = 'core-v2-test://external-texture.png';
    vi.spyOn(Assets, 'get').mockReturnValue(Texture.WHITE as never);
    const load = vi.spyOn(Assets, 'load').mockRejectedValue(new Error('must not reload') as never);
    const unload = vi.spyOn(Assets, 'unload').mockResolvedValue(undefined as never);
    const layer = createAssetLayer();

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
  return createImageStoreForSources([source], [alive]);
}

function createImageStoreForSources(
  sources: readonly string[],
  aliveValues: readonly boolean[] = sources.map(() => true),
): RenderStoreView {
  const capacity = sources.length;
  const zeros = () => new Float64Array(capacity);
  return {
    capacity,
    liveCount: aliveValues.filter(Boolean).length,
    revision: 1,
    alive: Uint8Array.from(aliveValues.map((alive) => alive ? 1 : 0)),
    kind: new Uint8Array(capacity).fill(RenderKind.Image),
    flags: new Uint8Array(capacity).fill(RenderFlags.Visible),
    zIndex: new Int32Array(capacity),
    x: zeros(),
    y: zeros(),
    width: new Float64Array(capacity).fill(10),
    height: new Float64Array(capacity).fill(10),
    rotation: zeros(),
    opacity: new Float64Array(capacity).fill(1),
    fill: new Uint32Array(capacity),
    stroke: new Uint32Array(capacity),
    strokeWidth: zeros(),
    radius: zeros(),
    text: sources.map(() => ''),
    color: new Uint32Array(capacity),
    fontSize: zeros(),
    fontFamily: sources.map(() => ''),
    fontWeight: new Uint16Array(capacity),
    align: new Uint8Array(capacity),
    maxLines: new Uint16Array(capacity),
    source: [...sources],
    tint: new Uint32Array(capacity).fill(0xffffffff),
    fit: new Uint8Array(capacity),
    value: zeros(),
    min: zeros(),
    max: zeros(),
    trackFill: new Uint32Array(capacity),
    relationFrom: new Int32Array(capacity).fill(-1),
    relationTo: new Int32Array(capacity).fill(-1),
    lineWidth: zeros(),
    ids: sources.map((_source, index) => `image-${index}`),
    view: { x: 0, y: 0, scale: 1 },
    background: 0,
    renderOrder: () => Uint32Array.from(sources.map((_source, index) => index)),
  };
}

function trackAliveReads(store: RenderStoreView, reads: number[]): RenderStoreView {
  const alive = new Proxy(store.alive, {
    get(target, property): unknown {
      if (typeof property === 'string' && /^\d+$/.test(property)) reads.push(Number(property));
      return Reflect.get(target, property);
    },
  });
  return { ...store, alive };
}
