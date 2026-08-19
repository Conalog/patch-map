import { Assets, Cache, Matrix, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { RenderFlags, RenderKind } from '../../src/patch-map/dense/renderer-types';
import {
  PATCH_MAP_ASSET_RUNTIME,
  PatchMapAssetRuntime,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
} from '../../src/patch-map/assets';
import { AggregateLeafLayer } from '../../src/patch-map/renderers/leaf-layer';

let layerSequence = 0;

function createAssetLayer(): AggregateLeafLayer {
  const session = PATCH_MAP_ASSET_RUNTIME.createSession({
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

describe('PatchMap aggregate leaf policy', () => {
  it('starts empty and has an idempotent asynchronous lifecycle', async () => {
    const layer = new AggregateLeafLayer();
    expect(layer.container.label).toBe('patch-map:text-and-assets');
    expect(layer.debugSnapshot()).toEqual({
      bitmapTextCount: 0,
      pixiTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
      pendingAssetCount: 0,
      failedAssetCount: 0,
      placeholderCount: 0,
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
    await layer.destroy();
    await layer.destroy();
  });

  it('culls object-backed leaves from stored quads under the current world transform', async () => {
    const layer = new AggregateLeafLayer();
    layer.sync(createTextStoreAt([0, 500, 2_000]), { fullRebuildEpoch: 1 });

    expect(layer.cull(new Matrix(), 120, 100, 0)).toBe(1);
    expect(layer.textContainer.children.map(({ visible }) => visible)).toEqual([
      true,
      false,
      false,
    ]);

    expect(layer.cull(new Matrix(1, 0, 0, 1, -450, 0), 120, 100, 0)).toBe(1);
    expect(layer.textContainer.children.map(({ visible }) => visible)).toEqual([
      false,
      true,
      false,
    ]);
    await layer.destroy();
  });

  it('includes zoom scale in text viewport culling', async () => {
    const layer = new AggregateLeafLayer();
    layer.sync(createTextStoreAt([0, 500, 2_000]), { fullRebuildEpoch: 1 });

    expect(layer.cull(new Matrix(0.1, 0, 0, 0.1, 0, 0), 120, 100, 0)).toBe(2);
    expect(layer.textContainer.children.map(({ visible }) => visible)).toEqual([
      true,
      true,
      false,
    ]);
    expect(layer.cull(new Matrix(4, 0, 0, 4, 0, 0), 120, 100, 0)).toBe(1);
    expect(layer.textContainer.children.map(({ visible }) => visible)).toEqual([
      true,
      false,
      false,
    ]);
    await layer.destroy();
  });

  it('publishes a text frame only after the culled leaf becomes visible', async () => {
    const layer = new AggregateLeafLayer();
    layer.sync(createTextStoreAt([0, 500]), { fullRebuildEpoch: 1 });
    layer.cull(new Matrix(), 120, 100, 0);
    layer.confirmRenderedFrame(1);

    expect(layer.textRendererProbe('text-0')).toMatchObject({
      publicationStatus: 'current',
      lastRenderedFrame: 1,
    });
    expect(layer.textRendererProbe('text-1')).toMatchObject({
      publicationStatus: 'pending',
      lastRenderedFrame: null,
    });

    layer.cull(new Matrix(1, 0, 0, 1, -450, 0), 120, 100, 0);
    layer.confirmRenderedFrame(2);
    expect(layer.textRendererProbe('text-1')).toMatchObject({
      publicationStatus: 'current',
      lastRenderedFrame: 2,
    });
    await layer.destroy();
  });

  it('chunks large Pixi Text lanes so offscreen groups leave Pixi traversal', async () => {
    const layer = new AggregateLeafLayer();
    const positions = Array.from({ length: 1_025 }, (_value, index) => index * 50);
    layer.sync(createTextStoreAt(positions), { fullRebuildEpoch: 1 });

    expect(layer.renderLaneProbe().text).toMatchObject({
      role: 'text',
      renderObjectCount: 1_025,
    });
    expect(layer.textContainer.children.length).toBeLessThan(20);
    expect(layer.cull(new Matrix(), 120, 100, 0)).toBe(3);
    expect(layer.textContainer.children.filter(({ visible }) => visible)).toHaveLength(1);
    layer.confirmRenderedFrame(1);
    expect(layer.textRendererProbe('text-0')).toMatchObject({
      publicationStatus: 'current',
    });
    expect(layer.textRendererProbe('text-1024')).toMatchObject({
      publicationStatus: 'pending',
    });

    expect(
      layer.cull(new Matrix(1, 0, 0, 1, -positions[1024]!, 0), 120, 100, 0),
    ).toBe(1);
    layer.confirmRenderedFrame(2);
    expect(layer.textRendererProbe('text-1024')).toMatchObject({
      publicationStatus: 'current',
      lastRenderedFrame: 2,
    });
    await layer.destroy();
  });

  it('materializes only viewport-near text chunks on initial sync', async () => {
    const layer = new AggregateLeafLayer();
    const positions = Array.from({ length: 1_025 }, (_value, index) => index * 50);
    const initial = layer.sync(createTextStoreAt(positions), {
      fullRebuildEpoch: 1,
      textMaterializationViewport: {
        worldMatrix: new Matrix(),
        width: 120,
        height: 100,
        padding: 0,
      },
    });

    expect(initial.pixiTextCount).toBe(3);
    expect(layer.cull(new Matrix(), 120, 100, 0)).toBe(3);
    expect(layer.debugSnapshot().pixiTextCount).toBe(64);
    expect(layer.textRendererProbe('text-1024')).toBeNull();

    expect(
      layer.cull(new Matrix(1, 0, 0, 1, -positions[1_024]!, 0), 120, 100, 0),
    ).toBe(1);
    expect(layer.debugSnapshot().pixiTextCount).toBe(65);
    expect(layer.textRendererProbe('text-1024')).toMatchObject({
      publicationStatus: 'pending',
      lastRenderedFrame: null,
    });
    await layer.destroy();
  });

  it('materializes an initially absent text object after deferred geometry moves into view', async () => {
    const layer = new AggregateLeafLayer();
    const positions = Array.from({ length: 1_025 }, (_value, index) => index * 50);
    const initial = createTextStoreAt(positions);
    layer.sync(initial, {
      fullRebuildEpoch: 1,
      textMaterializationViewport: {
        worldMatrix: new Matrix(),
        width: 120,
        height: 100,
        padding: 0,
      },
    });
    layer.cull(new Matrix(), 120, 100, 0);
    const retained = layer as unknown as {
      readonly texts: Map<number, Readonly<{ readonly object: { readonly text: string } }>>;
      readonly deferredTextSlots: ReadonlySet<number>;
    };
    expect(retained.texts.has(1_024)).toBe(false);

    const updated = {
      ...initial,
      x: Float64Array.from(initial.x, (value, index) => index === 1_024 ? 0 : value),
      text: initial.text.map((value, index) => index === 1_024 ? 'moved-in' : value),
    };
    layer.sync(updated, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 1_024, end: 1_025 }],
    });
    expect(retained.texts.has(1_024)).toBe(false);
    expect(retained.deferredTextSlots.has(1_024)).toBe(true);

    expect(layer.cull(new Matrix(), 120, 100, 0)).toBe(4);
    expect(retained.texts.get(1_024)?.object.text).toBe('moved-in');
    expect(retained.deferredTextSlots.has(1_024)).toBe(false);
    await layer.destroy();
  });

  it('defers offscreen text texture regeneration until its chunk becomes visible', async () => {
    const layer = new AggregateLeafLayer();
    const positions = Array.from({ length: 1_025 }, (_value, index) => index * 50);
    const initial = createTextStoreAt(positions);
    layer.sync(initial, { fullRebuildEpoch: 1 });
    layer.cull(new Matrix(), 120, 100, 0);
    const retained = layer as unknown as {
      readonly texts: Map<number, Readonly<{ readonly object: { readonly text: string } }>>;
      readonly deferredTextSlots: ReadonlySet<number>;
    };
    const previous = retained.texts.get(1_024)?.object;
    const updated = {
      ...initial,
      text: initial.text.map((value, index) => index === 1_024 ? 'updated' : value),
      fontSize: Float64Array.from(initial.fontSize, (value, index) =>
        index === 1_024 ? 20 : value),
    };

    layer.sync(updated, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 1_024, end: 1_025 }],
    });
    expect(retained.texts.get(1_024)?.object).toBe(previous);
    expect(retained.texts.get(1_024)?.object.text).toBe('label-1024');
    expect(retained.deferredTextSlots.has(1_024)).toBe(true);

    expect(
      layer.cull(new Matrix(1, 0, 0, 1, -positions[1_024]!, 0), 120, 100, 0),
    ).toBe(1);
    expect(retained.texts.get(1_024)?.object).not.toBe(previous);
    expect(retained.texts.get(1_024)?.object.text).toBe('updated');
    expect(retained.deferredTextSlots.has(1_024)).toBe(false);
    await layer.destroy();
  });

  it('publishes deferred text geometry before culling a moved chunk into view', async () => {
    const layer = new AggregateLeafLayer();
    const positions = Array.from({ length: 1_025 }, (_value, index) => index * 50);
    const initial = createTextStoreAt(positions);
    layer.sync(initial, { fullRebuildEpoch: 1 });
    layer.cull(new Matrix(), 120, 100, 0);
    const retained = layer as unknown as {
      readonly texts: Map<number, Readonly<{ readonly object: { readonly text: string } }>>;
      readonly deferredTextSlots: ReadonlySet<number>;
    };
    const previous = retained.texts.get(1_024)?.object;
    const updated = {
      ...initial,
      x: Float64Array.from(initial.x, (value, index) => index === 1_024 ? 0 : value),
      text: initial.text.map((value, index) => index === 1_024 ? 'moved-in' : value),
      fontSize: Float64Array.from(initial.fontSize, (value, index) =>
        index === 1_024 ? 20 : value),
    };

    layer.sync(updated, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 1_024, end: 1_025 }],
    });
    expect(retained.texts.get(1_024)?.object).toBe(previous);
    expect(retained.texts.get(1_024)?.object.text).toBe('label-1024');
    expect(retained.deferredTextSlots.has(1_024)).toBe(true);

    expect(layer.cull(new Matrix(), 120, 100, 0)).toBe(4);
    expect(retained.texts.get(1_024)?.object).not.toBe(previous);
    expect(retained.texts.get(1_024)?.object.text).toBe('moved-in');
    expect(retained.deferredTextSlots.has(1_024)).toBe(false);
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
    expect(unload).toHaveBeenCalledWith(expect.stringMatching(/^patch-map-asset:/));
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

  it('maps host alias loads onto the canonical scene binding key', async () => {
    mockOwnedAssetTransport();
    vi.spyOn(Assets, 'get').mockReturnValue(undefined as never);
    vi.spyOn(Assets, 'load').mockResolvedValue(Texture.WHITE as never);
    vi.spyOn(Assets, 'unload').mockResolvedValue(undefined as never);
    const layer = createAssetLayer();
    const store = createImageStore('fixture-alias');
    const projectionContext = {
      index: {
        byEntityId: Object.freeze({}),
        imagesByEntityId: Object.freeze({
          'image-0': Object.freeze({
            entityId: 'image-0',
            authoredSource: 'fixture-alias',
            bindingKey: 'alias:fixture-alias',
            cacheIdentity: 'alias:fixture-alias',
            sourceKind: 'alias' as const,
            authoredSize: true,
            dimensionMode: 'authored' as const,
          }),
        }),
      },
      revision: 1,
      world: { rotationDegrees: 0, flipX: false, flipY: false },
    };

    expect(layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext,
    })).toMatchObject({
      unresolvedAssetCount: 1,
      placeholderCount: 0,
    });

    await layer.loadAsset('fixture-alias', 'core-v2-test://fixture-alias.png');
    expect(layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [],
      projectionContext,
    })).toMatchObject({
      loadedAssetCount: 1,
      unresolvedAssetCount: 0,
      placeholderCount: 0,
    });
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      bindingKey: 'alias:fixture-alias',
      role: 'image',
      renderObjectCount: 1,
    });

    await expect(layer.unloadAsset('fixture-alias')).resolves.toBe(true);
    expect(layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [],
      projectionContext,
    })).toMatchObject({
      loadedAssetCount: 0,
      unresolvedAssetCount: 1,
      placeholderCount: 0,
    });
    await layer.finalizeAssetUnloads();
    await layer.destroy();
  });

  it('borrows a texture already present in the external Assets cache', async () => {
    const url = 'core-v2-test://external-texture.png';
    vi.spyOn(Cache, 'has').mockReturnValue(true);
    vi.spyOn(Cache, 'get').mockReturnValue(Texture.WHITE as never);
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

  it('preserves typed alias, URL, data URI, and complete descriptor bindings', async () => {
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'typed-sources', policy: () => undefined });
    session.registerAssets([{
      alias: 'registered-image',
      descriptor: 'https://assets.example.test/registered.png',
    }]);
    const layer = new AggregateLeafLayer(session, true);
    const descriptor = {
      src: 'https://assets.example.test/image.svg',
      data: { resolution: 2, nested: { mode: 'exact' } },
    } as const;

    await Promise.all([
      layer.bindSceneAsset('alias-key', { kind: 'alias', alias: 'registered-image' }),
      layer.bindSceneAsset('url-key', {
        kind: 'source',
        source: 'https://assets.example.test/direct.png',
      }),
      layer.bindSceneAsset('data-key', {
        kind: 'source',
        source: 'data:image/svg+xml,%3Csvg/%3E',
      }),
      layer.bindSceneAsset('descriptor-key', { kind: 'source', source: descriptor }),
    ]);

    expect(layer.sceneAssetBindingProbe('alias-key')).toMatchObject({
      sourceKind: 'alias',
      state: 'resolved',
      request: { kind: 'alias', alias: 'registered-image' },
    });
    expect(layer.sceneAssetBindingProbe('url-key')).toMatchObject({
      sourceKind: 'url',
      state: 'resolved',
      request: { kind: 'source', source: 'https://assets.example.test/direct.png' },
    });
    expect(layer.sceneAssetBindingProbe('data-key')).toMatchObject({
      sourceKind: 'data-uri',
      state: 'resolved',
    });
    expect(layer.sceneAssetBindingProbe('descriptor-key')).toMatchObject({
      sourceKind: 'descriptor',
      state: 'resolved',
      request: {
        kind: 'source',
        source: {
          src: descriptor.src,
          data: { nested: { mode: 'exact' }, resolution: 2 },
        },
      },
      normalizedResourceIdentity: 'decoded:image.svg',
      cacheIdentity: 'fixture:image.svg',
    });
    expect(descriptor).toEqual({
      src: 'https://assets.example.test/image.svg',
      data: { resolution: 2, nested: { mode: 'exact' } },
    });

    await layer.destroy();
  });

  it('derives reuse from semantic consumers rather than shared Texture identity', async () => {
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({
      instanceId: 'semantic-reuse-evidence',
      policy: () => undefined,
    });
    const layer = new AggregateLeafLayer(session, true);

    await Promise.all([
      layer.bindSceneAsset('first', {
        kind: 'source',
        source: 'https://assets.example.test/first.png',
      }),
      layer.bindSceneAsset('second', {
        kind: 'source',
        source: 'https://assets.example.test/second.png',
      }),
    ]);
    layer.sync(createImageStoreForSources(['first', 'second']), { fullRebuildEpoch: 1 });

    expect(layer.sceneAssetBindingProbe('first')).toMatchObject({
      normalizedResourceIdentity: 'decoded:first.png',
      consumerCount: 1,
      reusedResolvedResource: false,
    });
    expect(layer.sceneAssetBindingProbe('second')).toMatchObject({
      normalizedResourceIdentity: 'decoded:second.png',
      consumerCount: 1,
      reusedResolvedResource: false,
    });

    await layer.bindSceneAsset('shared', {
      kind: 'source',
      source: 'https://assets.example.test/shared.png',
    });
    layer.sync(createImageStoreForSources(['shared', 'shared']), { fullRebuildEpoch: 2 });
    expect(layer.sceneAssetBindingProbe('shared')).toMatchObject({
      consumerCount: 2,
      reusedResolvedResource: true,
    });

    await layer.destroy();
  });

  it('suppresses and releases an old generation that settles after source replacement', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'generation-race', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);

    const oldCompletion = layer.bindSceneAsset('descriptor', {
      kind: 'source',
      source: { src: 'https://assets.example.test/old.svg', data: { resolution: 2 } },
    });
    session.registerAssets([{
      alias: 'replacement',
      descriptor: 'https://assets.example.test/replacement.png',
    }]);
    const newCompletion = layer.bindSceneAsset('descriptor', {
      kind: 'alias',
      alias: 'replacement',
    });
    const sharedStore = createImageStoreForSources(['descriptor', 'descriptor']);
    layer.sync(sharedStore, { fullRebuildEpoch: 1 });

    await vi.waitFor(() => {
      expect(backend.hasPending('https://assets.example.test/replacement.png')).toBe(true);
      expect(backend.hasPending('https://assets.example.test/old.svg')).toBe(true);
    });
    backend.resolve('https://assets.example.test/replacement.png');
    await expect(newCompletion).resolves.toMatchObject({ status: 'attached', generation: 2 });
    layer.sync(sharedStore, { fullRebuildEpoch: 1, changedRanges: [] });
    backend.resolve('https://assets.example.test/old.svg');
    await expect(oldCompletion).resolves.toMatchObject({
      status: 'stale',
      generation: 1,
      normalizedResourceIdentity: 'decoded:old.svg',
    });

    expect(layer.sceneAssetBindingProbe('descriptor')).toMatchObject({
      generation: 2,
      sourceKind: 'alias',
      state: 'resolved',
      staleAttachCount: 0,
      staleCompletionCount: 1,
    });
    expect(layer.debugSnapshot()).toMatchObject({
      staleAttachCount: 0,
      staleCompletionCount: 1,
    });
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
    expect(layer.sceneImageProbe('image-1')).toMatchObject({
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
    expect(backend.unloadedSources).toContain('https://assets.example.test/old.svg');

    await layer.destroy();
  });

  it('bounds unique-key stale churn to scalar counters and clears retained state on destroy', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'bounded-binding-churn', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const churnCount = 256;
    const churn = Array.from({ length: churnCount }, (_value, index) => {
      const key = `churn-${index}`;
      const source = `https://assets.example.test/${key}.png`;
      const completion = layer.bindSceneAsset(key, { kind: 'source', source });
      return { key, source, completion, generation: index + 1 };
    });
    await vi.waitFor(() => {
      expect(churn.every(({ source }) => backend.hasPending(source))).toBe(true);
    });
    await Promise.all(churn.map(async ({ key }) => {
      await expect(layer.unbindSceneAsset(key)).resolves.toBe(true);
    }));
    churn.forEach(({ source }) => backend.resolve(source));
    const observations = await Promise.all(churn.map(({ completion }) => completion));
    expect(observations.map(({ status, generation }) => ({ status, generation }))).toEqual(
      churn.map(({ generation }) => ({ status: 'stale', generation })),
    );

    const retained = leafRetentionAccess(layer);
    expect(Object.hasOwn(retained, 'bindingGenerations')).toBe(false);
    expect(Object.hasOwn(retained, 'staleCompletionsByBinding')).toBe(false);
    expect(retained.nextBindingGeneration).toBe(churnCount);
    expect(retained.staleCompletionCount).toBe(churnCount);
    expectLeafCollectionsEmpty(retained);
    expect(layer.debugSnapshot()).toMatchObject({
      loadedAssetCount: 0,
      pendingAssetCount: 0,
      failedAssetCount: 0,
      staleCompletionCount: churnCount,
    });

    await layer.destroy();

    expect(retained.nextBindingGeneration).toBe(0);
    expect(retained.staleCompletionCount).toBe(0);
    expect(retained.storeEpoch).toBe(-1);
    expectLeafCollectionsEmpty(retained);
    expect(layer.debugSnapshot()).toMatchObject({
      imageCount: 0,
      loadedAssetCount: 0,
      pendingAssetCount: 0,
      failedAssetCount: 0,
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
  });

  it('rejects a stale successful completion when its release fails without double counting it', async () => {
    const backend = new DeferredTextureBackend();
    backend.unloadFailuresRemaining = 1;
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'generation-release-failure', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);

    const oldCompletion = layer.bindSceneAsset('descriptor', {
      kind: 'source',
      source: 'https://assets.example.test/old-release-failure.png',
    });
    const newCompletion = layer.bindSceneAsset('descriptor', {
      kind: 'source',
      source: 'https://assets.example.test/replacement-release-failure.png',
    });

    await vi.waitFor(() => {
      expect(backend.hasPending('https://assets.example.test/old-release-failure.png')).toBe(true);
      expect(backend.hasPending('https://assets.example.test/replacement-release-failure.png')).toBe(true);
    });
    backend.resolve('https://assets.example.test/replacement-release-failure.png');
    await expect(newCompletion).resolves.toMatchObject({ status: 'attached', generation: 2 });
    backend.resolve('https://assets.example.test/old-release-failure.png');

    await expect(oldCompletion).rejects.toMatchObject({
      code: 'INTERNAL_FAILURE',
      category: 'INTERNAL_FAILURE',
    });
    expect(backend.unloadAttempts).toBe(1);
    expect(layer.sceneAssetBindingProbe('descriptor')).toMatchObject({
      generation: 2,
      staleAttachCount: 0,
      staleCompletionCount: 1,
    });
    expect(layer.debugSnapshot()).toMatchObject({
      staleAttachCount: 0,
      staleCompletionCount: 1,
    });

    await layer.destroy();
    expect(backend.unloadAttempts).toBe(3);
  });

  it('detects and repairs a live texture attachment mismatch exactly once', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'stale-attachment-invariant', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const completion = layer.bindSceneAsset('image', {
      kind: 'source',
      source: 'https://assets.example.test/current.png',
    });
    const store = createImageStore('image');
    layer.sync(store, { fullRebuildEpoch: 1 });
    expect(layer.sceneAssetBindingProbe('image')).toMatchObject({
      state: 'pending',
      renderRole: 'none',
      staleAttachCount: 0,
    });

    await vi.waitFor(() => {
      expect(backend.hasPending('https://assets.example.test/current.png')).toBe(true);
    });
    backend.resolve('https://assets.example.test/current.png', Texture.EMPTY);
    await completion;
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [{ start: 0, end: 1 }] });
    expect(layer.sceneAssetBindingProbe('image')).toMatchObject({
      state: 'resolved',
      renderRole: 'image',
      staleAttachCount: 0,
    });

    const sprite = layer.imageContainer.children[0];
    expect(sprite).toBeDefined();
    if (!sprite || !('texture' in sprite)) throw new Error('expected image Sprite');
    sprite.texture = Texture.WHITE;
    expect(layer.debugSnapshot().staleAttachCount).toBe(0);

    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [{ start: 0, end: 1 }] });
    expect(layer.sceneAssetBindingProbe('image')).toMatchObject({
      staleAttachCount: 1,
      staleCompletionCount: 0,
    });
    expect(layer.debugSnapshot().staleAttachCount).toBe(1);

    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [{ start: 0, end: 1 }] });
    expect(layer.debugSnapshot().staleAttachCount).toBe(1);
    await layer.destroy();
  });

  it('keeps hidden images object-free and releases an attached texture only after a frame', async () => {
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'frame-release', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    await layer.bindSceneAsset('shared', {
      kind: 'source',
      source: 'https://assets.example.test/shared.png',
    });
    const store = createImageStoreForSources(
      ['shared', 'shared'],
      [true, true],
      [true, false],
    );

    layer.sync(store, { fullRebuildEpoch: 1 });
    expect(layer.sceneImageProbe('image-0')).toEqual({
      entityId: 'image-0',
      renderObjectCount: 1,
      role: 'image',
      bindingKey: 'shared',
      bindingGeneration: 1,
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
    expect(layer.sceneImageProbe('image-1')).toEqual({
      entityId: 'image-1',
      renderObjectCount: 0,
      role: 'none',
      bindingKey: 'shared',
      bindingGeneration: 1,
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
    expect(layer.sceneAssetBindingProbe('shared')).toMatchObject({
      consumerCount: 1,
      renderObjectCount: 1,
      placeholderCount: 0,
      renderRole: 'image',
    });

    await layer.unbindSceneAsset('shared');
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      renderObjectCount: 0,
      role: 'none',
      bindingKey: 'shared',
    });
    await layer.finalizeAssetUnloads();
    expect(backend.unloadedSources).toEqual([]);
    layer.confirmRenderedFrame();
    await layer.finalizeAssetUnloads();
    expect(backend.unloadedSources).toEqual(['https://assets.example.test/shared.png']);

    await layer.destroy();
  });

  it('keeps a new pending image hidden and materializes exactly one resolved Sprite', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'pending-hidden', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const source = 'https://assets.example.test/pending-hidden.png';
    const completion = layer.bindSceneAsset('pending-hidden', { kind: 'source', source });
    await vi.waitFor(() => expect(backend.hasPending(source)).toBe(true));

    layer.sync(createImageStore('pending-hidden'), { fullRebuildEpoch: 1 });
    expect(layer.imageContainer.children).toHaveLength(0);
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      renderObjectCount: 0,
      role: 'none',
      bindingKey: 'pending-hidden',
    });
    expect(layer.debugSnapshot()).toMatchObject({
      imageCount: 0,
      pendingAssetCount: 1,
      placeholderCount: 0,
    });

    backend.resolve(source, Texture.EMPTY);
    await completion;
    layer.sync(createImageStore('pending-hidden'), {
      fullRebuildEpoch: 1,
      changedRanges: [],
    });
    expect(layer.imageContainer.children).toHaveLength(1);
    expect(layer.imageContainer.children[0]).toMatchObject({ texture: Texture.EMPTY });
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      renderObjectCount: 1,
      role: 'image',
    });
    await layer.destroy();
  });

  it('retains the last resolved texture across a full-rebuild retarget and releases it after swap', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'full-rebuild-retarget', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const firstSource = 'https://assets.example.test/retarget-a.png';
    const secondSource = 'https://assets.example.test/retarget-b.png';
    const first = layer.bindSceneAsset('a', { kind: 'source', source: firstSource });
    await vi.waitFor(() => expect(backend.hasPending(firstSource)).toBe(true));
    backend.resolve(firstSource, Texture.EMPTY);
    await first;
    layer.sync(createImageStore('a'), { fullRebuildEpoch: 1 });
    const sprite = layer.imageContainer.children[0];
    expect(sprite).toMatchObject({ texture: Texture.EMPTY });

    await layer.unbindSceneAsset('a');
    const second = layer.bindSceneAsset('b', { kind: 'source', source: secondSource });
    await vi.waitFor(() => expect(backend.hasPending(secondSource)).toBe(true));
    layer.sync(createImageStore('b'), { fullRebuildEpoch: 2 });
    expect(layer.imageContainer.children).toEqual([sprite]);
    expect(sprite).toMatchObject({ texture: Texture.EMPTY });
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      bindingKey: 'b',
      role: 'image',
      renderObjectCount: 1,
    });
    expect(layer.sceneAssetBindingProbe('b')).toMatchObject({
      state: 'pending',
      renderRole: 'image',
      placeholderCount: 0,
    });
    await layer.finalizeAssetUnloads();
    expect(backend.unloadedSources).toEqual([]);

    backend.resolve(secondSource, Texture.WHITE);
    await second;
    layer.sync(createImageStore('b'), { fullRebuildEpoch: 2, changedRanges: [] });
    expect(layer.imageContainer.children).toEqual([sprite]);
    expect(sprite).toMatchObject({ texture: Texture.WHITE });
    await layer.finalizeAssetUnloads();
    expect(backend.unloadedSources).toEqual([]);
    layer.confirmRenderedFrame();
    await layer.finalizeAssetUnloads();
    expect(backend.unloadedSources).toEqual([firstSource]);

    await layer.destroy();
    expect(backend.unloadedSources).toEqual([firstSource, secondSource]);
  });

  it('keeps A visible through rapid A to B to C and ignores the stale B completion', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'rapid-retarget', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const sourceA = 'https://assets.example.test/rapid-a.png';
    const sourceB = 'https://assets.example.test/rapid-b.png';
    const sourceC = 'https://assets.example.test/rapid-c.png';
    const completionA = layer.bindSceneAsset('rapid', { kind: 'source', source: sourceA });
    await vi.waitFor(() => expect(backend.hasPending(sourceA)).toBe(true));
    backend.resolve(sourceA, Texture.EMPTY);
    await completionA;
    const store = createImageStore('rapid');
    layer.sync(store, { fullRebuildEpoch: 1 });
    const sprite = layer.imageContainer.children[0];

    const completionB = layer.bindSceneAsset('rapid', { kind: 'source', source: sourceB });
    const completionC = layer.bindSceneAsset('rapid', { kind: 'source', source: sourceC });
    await vi.waitFor(() => {
      expect(backend.hasPending(sourceB)).toBe(true);
      expect(backend.hasPending(sourceC)).toBe(true);
    });
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expect(layer.imageContainer.children).toEqual([sprite]);
    expect(sprite).toMatchObject({ texture: Texture.EMPTY });

    backend.resolve(sourceB, Texture.WHITE);
    await expect(completionB).resolves.toMatchObject({ status: 'stale' });
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expect(sprite).toMatchObject({ texture: Texture.EMPTY });
    expect(layer.sceneAssetBindingProbe('rapid')).toMatchObject({
      state: 'pending',
      generation: 3,
      staleCompletionCount: 1,
    });

    backend.resolve(sourceC, Texture.WHITE);
    await expect(completionC).resolves.toMatchObject({ status: 'attached' });
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expect(layer.imageContainer.children).toEqual([sprite]);
    expect(sprite).toMatchObject({ texture: Texture.WHITE });
    expect(layer.sceneAssetBindingProbe('rapid')).toMatchObject({
      state: 'resolved',
      generation: 3,
      staleCompletionCount: 1,
    });
    layer.confirmRenderedFrame();
    await layer.finalizeAssetUnloads();
    await layer.destroy();
    expect(backend.unloadedSources).toEqual(expect.arrayContaining([sourceA, sourceB, sourceC]));
  });

  it('keeps equal-z image order stable through resolve, failure, and source replacement', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'stable-equal-z-order', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const firstSource = 'https://assets.example.test/order-first.png';
    const secondSource = 'https://assets.example.test/order-second.png';
    const failedSource = 'https://assets.example.test/order-failed.png';
    const recoveredSource = 'https://assets.example.test/order-recovered.png';
    const store = createPositionedEqualZImageStore(['first', 'second']);

    const firstCompletion = layer.bindSceneAsset('first', {
      kind: 'source',
      source: firstSource,
    });
    const secondCompletion = layer.bindSceneAsset('second', {
      kind: 'source',
      source: secondSource,
    });
    await vi.waitFor(() => {
      expect(backend.hasPending(firstSource)).toBe(true);
      expect(backend.hasPending(secondSource)).toBe(true);
    });

    layer.sync(store, { fullRebuildEpoch: 1 });
    expectImageChildOrder(layer, []);

    // Resolving slot zero first recreates it after slot one in insertion time.
    // The explicit stable-slot tie-breaker must move it back in front.
    backend.resolve(firstSource, Texture.EMPTY);
    await firstCompletion;
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expectImageChildOrder(layer, [5]);

    backend.resolve(secondSource);
    await secondCompletion;
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expectImageChildOrder(layer, [5, 105]);

    const failedCompletion = layer.bindSceneAsset('first', {
      kind: 'source',
      source: failedSource,
    });
    await vi.waitFor(() => expect(backend.hasPending(failedSource)).toBe(true));
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expectImageChildOrder(layer, [5, 105]);
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      role: 'image',
      bindingGeneration: 3,
    });
    backend.reject(failedSource);
    await expect(failedCompletion).resolves.toMatchObject({
      status: 'attached',
      generation: 3,
    });
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expectImageChildOrder(layer, [5, 105]);
    expect(layer.sceneAssetBindingProbe('first')).toMatchObject({
      state: 'failed',
      renderRole: 'image',
    });

    const recoveredCompletion = layer.bindSceneAsset('first', {
      kind: 'source',
      source: recoveredSource,
    });
    await vi.waitFor(() => expect(backend.hasPending(recoveredSource)).toBe(true));
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expectImageChildOrder(layer, [5, 105]);
    backend.resolve(recoveredSource);
    await recoveredCompletion;
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expectImageChildOrder(layer, [5, 105]);
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      role: 'image',
      bindingGeneration: 4,
    });

    layer.confirmRenderedFrame();
    await layer.finalizeAssetUnloads();
    await layer.destroy();
  });

  it('reorders 5,000 reverse-z images in one detach/append pass without changing semantic counts', async () => {
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'reverse-z-order', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const imageCount = 5_000;
    const bindingKey = 'reverse-z';
    await layer.bindSceneAsset(bindingKey, {
      kind: 'source',
      source: 'https://assets.example.test/reverse-z.png',
    });
    const initialStore = createZOrderedImageStore(bindingKey, new Int32Array(imageCount));
    layer.sync(initialStore, { fullRebuildEpoch: 1 });
    expectImageSlotOrder(
      layer,
      Array.from({ length: imageCount }, (_value, slot) => slot),
    );

    const zIndices = Int32Array.from(
      { length: imageCount },
      (_value, slot) => imageCount - slot,
    );
    const store = createZOrderedImageStore(bindingKey, zIndices);
    const removeChildren = vi.spyOn(layer.imageContainer, 'removeChildren');
    const setChildIndex = vi.spyOn(layer.imageContainer, 'setChildIndex');

    layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: imageCount }],
    });

    expect(removeChildren).toHaveBeenCalledTimes(1);
    expect(setChildIndex).not.toHaveBeenCalled();
    expectImageSlotOrder(
      layer,
      Array.from({ length: imageCount }, (_value, index) => imageCount - index - 1),
    );
    expect(layer.imageContainer.sortableChildren).toBe(false);
    expect(layer.sceneAssetBindingProbe(bindingKey)).toMatchObject({
      consumerCount: imageCount,
      renderObjectCount: imageCount,
      placeholderCount: 0,
      renderRole: 'image',
      reusedResolvedResource: true,
    });
    expectImageProbeInvariant(layer, bindingKey, 0);
    expectImageProbeInvariant(layer, bindingKey, Math.floor(imageCount / 2));
    expectImageProbeInvariant(layer, bindingKey, imageCount - 1);
    expect(layer.debugSnapshot()).toMatchObject({
      imageCount,
      loadedAssetCount: 1,
      placeholderCount: 0,
      staleAttachCount: 0,
    });

    await layer.destroy();
  }, 15_000);

  it('reorders 5,000 existing images by seeded random z while preserving stable-slot ties', async () => {
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'seeded-random-z-order', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const imageCount = 5_000;
    const bindingKey = 'seeded-random-z';
    await layer.bindSceneAsset(bindingKey, {
      kind: 'source',
      source: 'https://assets.example.test/seeded-random-z.png',
    });
    const initialStore = createZOrderedImageStore(bindingKey, new Int32Array(imageCount));
    layer.sync(initialStore, { fullRebuildEpoch: 1 });
    expectImageSlotOrder(
      layer,
      Array.from({ length: imageCount }, (_value, slot) => slot),
    );

    const zIndices = createSeededZIndices(imageCount, 0x5eed_005);
    const expectedSlots = Array.from({ length: imageCount }, (_value, slot) => slot)
      .sort((leftSlot, rightSlot) => (
        (zIndices[leftSlot] ?? 0) - (zIndices[rightSlot] ?? 0) ||
        leftSlot - rightSlot ||
        `image-${leftSlot}`.localeCompare(`image-${rightSlot}`)
      ));
    expect(expectedSlots).not.toEqual(
      Array.from({ length: imageCount }, (_value, slot) => slot),
    );
    const randomStore = createZOrderedImageStore(bindingKey, zIndices);
    const removeChildren = vi.spyOn(layer.imageContainer, 'removeChildren');
    const setChildIndex = vi.spyOn(layer.imageContainer, 'setChildIndex');

    layer.sync(randomStore, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: imageCount }],
    });

    expect(removeChildren).toHaveBeenCalledTimes(1);
    expect(setChildIndex).not.toHaveBeenCalled();
    expectImageSlotOrder(layer, expectedSlots);
    expect(layer.imageContainer.sortableChildren).toBe(false);
    expect(layer.sceneAssetBindingProbe(bindingKey)).toMatchObject({
      consumerCount: imageCount,
      renderObjectCount: imageCount,
      placeholderCount: 0,
      renderRole: 'image',
      reusedResolvedResource: true,
    });
    expectImageProbeInvariant(layer, bindingKey, 0);
    expectImageProbeInvariant(layer, bindingKey, Math.floor(imageCount / 2));
    expectImageProbeInvariant(layer, bindingKey, imageCount - 1);
    expect(layer.debugSnapshot()).toMatchObject({
      imageCount,
      loadedAssetCount: 1,
      placeholderCount: 0,
      staleAttachCount: 0,
    });

    await layer.destroy();
  }, 15_000);

  it('probes 5,000 shared image consumers from O(1) binding counters', async () => {
    const backend = new DeferredTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'constant-time-binding-probe', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const source = 'https://assets.example.test/shared-5000.png';
    const replacementSource = 'https://assets.example.test/shared-5000-replacement.png';
    const imageCount = 5_000;
    const sources = Array.from({ length: imageCount }, () => 'shared-5000');
    const allVisible = Array.from({ length: imageCount }, () => true);
    const pending = layer.bindSceneAsset('shared-5000', { kind: 'source', source });
    await vi.waitFor(() => expect(backend.hasPending(source)).toBe(true));

    const store = createImageStoreForSources(sources);
    layer.sync(store, { fullRebuildEpoch: 1 });
    const retained = leafRetentionAccess(layer);
    expectBindingCounters(retained, 'shared-5000', {
      consumerCount: imageCount,
      renderObjectCount: 0,
      placeholderCount: 0,
    });
    expect(probeWithoutImageScan(layer, retained, 'shared-5000')).toMatchObject({
      state: 'pending',
      consumerCount: imageCount,
      renderObjectCount: 0,
      placeholderCount: 0,
      renderRole: 'none',
    });

    backend.resolve(source, Texture.EMPTY);
    await pending;
    layer.sync(store, { fullRebuildEpoch: 1, changedRanges: [] });
    expectBindingCounters(retained, 'shared-5000', {
      consumerCount: imageCount,
      renderObjectCount: imageCount,
      placeholderCount: 0,
    });
    expect(probeWithoutImageScan(layer, retained, 'shared-5000')).toMatchObject({
      state: 'resolved',
      consumerCount: imageCount,
      renderObjectCount: imageCount,
      placeholderCount: 0,
      renderRole: 'image',
    });

    const staleEntitySlot = 1_234;
    const staleSprite = layer.imageContainer.children[staleEntitySlot];
    expect(staleSprite).toBeDefined();
    if (!staleSprite || !('texture' in staleSprite)) throw new Error('expected shared image Sprite');
    staleSprite.texture = Texture.WHITE;
    layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: staleEntitySlot, end: staleEntitySlot + 1 }],
    });
    expect(layer.sceneAssetBindingProbe('shared-5000')).toMatchObject({
      staleAttachCount: 1,
    });
    expect(layer.sceneImageProbe(`image-${staleEntitySlot}`)).toMatchObject({
      staleAttachCount: 1,
      staleCompletionCount: 0,
    });
    expect(layer.sceneImageProbe(`image-${staleEntitySlot + 1}`)).toMatchObject({
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });

    const visible = allVisible.map((_value, index) => index % 4 !== 0);
    const visibleCount = visible.filter(Boolean).length;
    const hiddenStore = createImageStoreForSources(sources, allVisible, visible);
    layer.sync(hiddenStore, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: imageCount }],
    });
    expect(probeWithoutImageScan(layer, retained, 'shared-5000')).toMatchObject({
      consumerCount: visibleCount,
      renderObjectCount: visibleCount,
      placeholderCount: 0,
    });

    const replacement = layer.bindSceneAsset('shared-5000', {
      kind: 'source',
      source: replacementSource,
    });
    await vi.waitFor(() => expect(backend.hasPending(replacementSource)).toBe(true));
    expect(probeWithoutImageScan(layer, retained, 'shared-5000')).toMatchObject({
      state: 'pending',
      consumerCount: visibleCount,
      renderObjectCount: 0,
      placeholderCount: 0,
      renderRole: 'none',
    });
    layer.sync(hiddenStore, { fullRebuildEpoch: 1, changedRanges: [] });
    expect(probeWithoutImageScan(layer, retained, 'shared-5000')).toMatchObject({
      state: 'pending',
      consumerCount: visibleCount,
      renderObjectCount: visibleCount,
      placeholderCount: 0,
      renderRole: 'image',
    });

    backend.resolve(replacementSource);
    await replacement;
    layer.sync(hiddenStore, { fullRebuildEpoch: 1, changedRanges: [] });
    expect(probeWithoutImageScan(layer, retained, 'shared-5000')).toMatchObject({
      state: 'resolved',
      consumerCount: visibleCount,
      renderObjectCount: visibleCount,
      placeholderCount: 0,
      renderRole: 'image',
    });
    expect(layer.sceneImageProbe(`image-${staleEntitySlot}`)).toMatchObject({
      staleAttachCount: 1,
      staleCompletionCount: 0,
    });

    layer.confirmRenderedFrame();
    await layer.finalizeAssetUnloads();
    await layer.destroy();
    expect(layer.sceneAssetBindingProbe('shared-5000')).toBeNull();
    expectLeafCollectionsEmpty(retained);
  }, 15_000);

  it('bulk probes and retires 5,000 unique bindings without visiting the Sprite collection', async () => {
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'constant-time-unique-probes', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const bindingCount = 5_000;
    const keys = Array.from({ length: bindingCount }, (_value, index) => `unique-${index}`);
    const sharedSource = 'https://assets.example.test/unique-probes-shared-resource.png';

    await Promise.all(keys.map(async (key) => layer.bindSceneAsset(key, {
      kind: 'source',
      source: sharedSource,
    })));
    layer.sync(createImageStoreForSources(keys), { fullRebuildEpoch: 1 });
    const retained = leafRetentionAccess(layer);
    const imageValues = vi.spyOn(retained.images, 'values');

    try {
      const probes = keys.map((key) => layer.sceneAssetBindingProbe(key));
      expect(imageValues).not.toHaveBeenCalled();
      expect(probes.every((probe) => (
        probe?.consumerCount === 1 &&
        probe.renderObjectCount === 1 &&
        probe.placeholderCount === 0
      ))).toBe(true);

      await Promise.all(keys.map(async (key) => layer.unbindSceneAsset(key)));
      expect(imageValues).not.toHaveBeenCalled();
      expect(retained.bindings.size).toBe(0);
    } finally {
      imageValues.mockRestore();
    }

    await layer.destroy();
    expectLeafCollectionsEmpty(retained);
  }, 15_000);

  it('keeps a failed image pixel-free while preserving its diagnostic placeholder role', async () => {
    const backend = new ImmediateTextureBackend();
    backend.failedSources.add('https://assets.example.test/fail.png');
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'failed-binding', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);

    await layer.bindSceneAsset('failed', {
      kind: 'source',
      source: 'https://assets.example.test/fail.png',
    });
    layer.sync(createImageStore('failed'), { fullRebuildEpoch: 1 });

    expect(layer.sceneAssetBindingProbe('failed')).toMatchObject({
      state: 'failed',
      attached: false,
      consumerCount: 1,
      renderObjectCount: 0,
      placeholderCount: 0,
      renderRole: 'none',
    });
    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      renderObjectCount: 0,
      role: 'asset-placeholder',
      bindingKey: 'failed',
    });
    expect(layer.debugSnapshot()).toMatchObject({
      failedAssetCount: 1,
      placeholderCount: 0,
      unresolvedAssetCount: 1,
    });
    expect(layer.imageContainer.children).toHaveLength(0);

    await layer.destroy();
  });

  it('uses the lossless projection binding key instead of the dense authored src', async () => {
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'projection-binding', policy: () => undefined });
    const layer = new AggregateLeafLayer(session, true);
    const bindingKey = 'descriptor:{"data":{"resolution":2},"src":"fixture.svg"}';
    const authoredSource = Object.freeze({
      src: 'fixture.svg',
      data: Object.freeze({ resolution: 2 }),
    });
    await layer.bindSceneAsset(bindingKey, { kind: 'source', source: authoredSource });

    layer.sync(createImageStore('fixture.svg'), {
      fullRebuildEpoch: 1,
      projectionContext: {
        index: {
          byEntityId: Object.freeze({}),
          imagesByEntityId: Object.freeze({
            'image-0': Object.freeze({
              entityId: 'image-0',
              authoredSource,
              bindingKey,
              cacheIdentity: bindingKey,
              sourceKind: 'descriptor',
              authoredSize: true,
              dimensionMode: 'authored',
            }),
          }),
        },
        revision: 1,
        world: { rotationDegrees: 0, flipX: false, flipY: false },
      },
    });

    expect(layer.sceneImageProbe('image-0')).toMatchObject({
      bindingKey,
      role: 'image',
      renderObjectCount: 1,
    });
    expect(layer.sceneAssetBindingProbe(bindingKey)).toMatchObject({
      consumerCount: 1,
      renderObjectCount: 1,
    });

    await layer.destroy();
  });
});

function createImageStore(source: string, alive = true): RenderStoreView {
  return createImageStoreForSources([source], [alive]);
}

function createImageStoreForSources(
  sources: readonly string[],
  aliveValues: readonly boolean[] = sources.map(() => true),
  visibleValues: readonly boolean[] = sources.map(() => true),
): RenderStoreView {
  const capacity = sources.length;
  const zeros = () => new Float64Array(capacity);
  return {
    capacity,
    liveCount: aliveValues.filter(Boolean).length,
    revision: 1,
    alive: Uint8Array.from(aliveValues.map((alive) => alive ? 1 : 0)),
    kind: new Uint8Array(capacity).fill(RenderKind.Image),
    flags: Uint8Array.from(visibleValues.map((visible) => visible ? RenderFlags.Visible : 0)),
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

function createTextStoreAt(xValues: readonly number[]): RenderStoreView {
  const store = createImageStoreForSources(xValues.map((_value, index) => `label-${index}`));
  return {
    ...store,
    kind: new Uint8Array(xValues.length).fill(RenderKind.Text),
    x: Float64Array.from(xValues),
    y: new Float64Array(xValues.length).fill(10),
    width: new Float64Array(xValues.length).fill(40),
    height: new Float64Array(xValues.length).fill(20),
    text: xValues.map((_value, index) => `label-${index}`),
    color: new Uint32Array(xValues.length).fill(0xffffffff),
    fontSize: new Float64Array(xValues.length).fill(12),
    fontFamily: xValues.map(() => 'Arial'),
    fontWeight: new Uint16Array(xValues.length).fill(400),
    ids: xValues.map((_value, index) => `text-${index}`),
  };
}

function createPositionedEqualZImageStore(sources: readonly string[]): RenderStoreView {
  const store = createImageStoreForSources(sources);
  return {
    ...store,
    zIndex: new Int32Array(sources.length).fill(7),
    x: Float64Array.from(sources.map((_source, index) => index * 100)),
  };
}

function createZOrderedImageStore(bindingKey: string, zIndices: Int32Array): RenderStoreView {
  const store = createImageStoreForSources(
    Array.from({ length: zIndices.length }, () => bindingKey),
  );
  return {
    ...store,
    zIndex: zIndices,
    x: Float64Array.from({ length: zIndices.length }, (_value, slot) => slot),
  };
}

function createSeededZIndices(count: number, seed: number): Int32Array {
  let state = seed >>> 0;
  return Int32Array.from({ length: count }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    // A deliberately small range creates many equal-z ties, exercising the
    // stable-slot ordering rule instead of relying on unique random values.
    return (state % 97) - 48;
  });
}

function expectImageSlotOrder(
  layer: AggregateLeafLayer,
  expectedSlots: readonly number[],
): void {
  expect(layer.imageContainer.children).toHaveLength(expectedSlots.length);
  for (let index = 0; index < expectedSlots.length; index += 1) {
    const expectedSlot = expectedSlots[index];
    if (expectedSlot === undefined) throw new Error(`missing expected slot at ${index}`);
    const child = layer.imageContainer.children[index];
    if (child?.x !== expectedSlot + 5) {
      throw new Error(
        `image order mismatch at ${index}: expected slot ${expectedSlot}, got center ${child?.x}`,
      );
    }
  }
}

function expectImageProbeInvariant(
  layer: AggregateLeafLayer,
  bindingKey: string,
  slot: number,
): void {
  expect(layer.sceneImageProbe(`image-${slot}`)).toEqual({
    entityId: `image-${slot}`,
    renderObjectCount: 1,
    role: 'image',
    bindingKey,
    bindingGeneration: 1,
    staleAttachCount: 0,
    staleCompletionCount: 0,
  });
}

function expectImageChildOrder(layer: AggregateLeafLayer, expectedCenters: readonly number[]): void {
  expect(layer.imageContainer.sortableChildren).toBe(false);
  expect(layer.imageContainer.children.map((child) => child.x)).toEqual(expectedCenters);
  expect(layer.imageContainer.children.map((child) => child.zIndex)).toEqual(
    expectedCenters.map(() => 7),
  );
}

interface LeafRetentionAccess {
  readonly texts: Map<unknown, unknown>;
  readonly textEntityIdBySlot: readonly unknown[];
  readonly textVerticesBySlot: readonly unknown[];
  readonly images: Map<unknown, unknown>;
  readonly imageBindingBySlot: Map<unknown, unknown>;
  readonly imageSlotsByBinding: Map<unknown, unknown>;
  readonly imageEntityIdBySlot: Map<unknown, unknown>;
  readonly imageProbesByEntityId: Map<unknown, unknown>;
  readonly bindings: Map<string, Readonly<{
    readonly consumerCount: number;
    readonly renderObjectCount: number;
    readonly placeholderCount: number;
  }>>;
  readonly framePendingAssetReleases: unknown[];
  readonly readyAssetReleases: unknown[];
  readonly dirtyAssetSlots: Set<unknown>;
  readonly nextBindingGeneration: number;
  readonly staleCompletionCount: number;
  readonly storeEpoch: number;
}

function leafRetentionAccess(layer: AggregateLeafLayer): LeafRetentionAccess {
  return layer as unknown as LeafRetentionAccess;
}

function expectLeafCollectionsEmpty(retained: LeafRetentionAccess): void {
  expect(retained.texts.size).toBe(0);
  expect(retained.textEntityIdBySlot).toHaveLength(0);
  expect(retained.textVerticesBySlot).toHaveLength(0);
  expect(retained.images.size).toBe(0);
  expect(retained.imageBindingBySlot.size).toBe(0);
  expect(retained.imageSlotsByBinding.size).toBe(0);
  expect(retained.imageEntityIdBySlot.size).toBe(0);
  expect(retained.imageProbesByEntityId.size).toBe(0);
  expect(retained.bindings.size).toBe(0);
  expect(retained.framePendingAssetReleases).toHaveLength(0);
  expect(retained.readyAssetReleases).toHaveLength(0);
  expect(retained.dirtyAssetSlots.size).toBe(0);
}

function expectBindingCounters(
  retained: LeafRetentionAccess,
  key: string,
  expected: Readonly<{
    readonly consumerCount: number;
    readonly renderObjectCount: number;
    readonly placeholderCount: number;
  }>,
): void {
  expect(retained.bindings.get(key)).toMatchObject(expected);
}

function probeWithoutImageScan(
  layer: AggregateLeafLayer,
  retained: LeafRetentionAccess,
  key: string,
): NonNullable<ReturnType<AggregateLeafLayer['sceneAssetBindingProbe']>> {
  const values = vi.spyOn(retained.images, 'values');
  try {
    const probe = layer.sceneAssetBindingProbe(key);
    expect(values).not.toHaveBeenCalled();
    if (!probe) throw new Error(`missing binding probe: ${key}`);
    return probe;
  } finally {
    values.mockRestore();
  }
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

class ImmediateTextureBackend implements PatchMapAssetBackend {
  public readonly keyNamespace = `leaf-immediate-${++layerSequence}`;
  public readonly failedSources = new Set<string>();
  public readonly unloadedSources: string[] = [];
  public unloadAttempts = 0;
  public unloadFailuresRemaining = 0;
  protected readonly sourceByKey = new Map<string, string>();

  public get(): undefined {
    return undefined;
  }

  public load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    this.sourceByKey.set(request.key, request.descriptor.src);
    if (this.failedSources.has(request.descriptor.src)) {
      return Promise.reject(new Error('fixture load failure'));
    }
    return Promise.resolve(Texture.WHITE);
  }

  public describe(request: PatchMapAssetBackendRequest): Readonly<{
    normalizedResourceIdentity: string;
    cacheIdentity: string;
  }> {
    const name = request.descriptor.src.split('/').at(-1) ?? request.descriptor.src;
    return Object.freeze({
      normalizedResourceIdentity: `decoded:${name}`,
      cacheIdentity: `fixture:${name}`,
    });
  }

  public unload(key: string): Promise<void> {
    this.unloadAttempts += 1;
    const source = this.sourceByKey.get(key);
    if (source) this.unloadedSources.push(source);
    if (this.unloadFailuresRemaining > 0) {
      this.unloadFailuresRemaining -= 1;
      return Promise.reject(new Error('fixture unload failure'));
    }
    return Promise.resolve();
  }
}

class DeferredTextureBackend extends ImmediateTextureBackend {
  private readonly pending = new Map<string, Readonly<{
    resolve(texture: Texture): void;
    reject(error: Error): void;
  }>>();

  public override load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    this.sourceByKey.set(request.key, request.descriptor.src);
    return new Promise<Texture>((resolve, reject) => {
      this.pending.set(request.descriptor.src, { resolve, reject });
    });
  }

  public resolve(source: string, texture: Texture = Texture.WHITE): void {
    const pending = this.pending.get(source);
    if (!pending) throw new Error(`missing deferred source: ${source}`);
    this.pending.delete(source);
    pending.resolve(texture);
  }

  public reject(source: string): void {
    const pending = this.pending.get(source);
    if (!pending) throw new Error(`missing deferred source: ${source}`);
    this.pending.delete(source);
    pending.reject(new Error(`fixture load failure: ${source}`));
  }

  public hasPending(source: string): boolean {
    return this.pending.has(source);
  }
}
