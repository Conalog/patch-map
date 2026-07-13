import { describe, expect, it, vi } from 'vitest';

import {
  collectSceneAssetSources,
  ManagedAssets,
  ManagedSceneAssets,
  type PublicAssetCacheApi,
  type PublicAssetsApi,
} from '../src/assets';

const deferred = <T = unknown>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
};

const fakeApi = (overrides: Partial<PublicAssetsApi> = {}): PublicAssetsApi => ({
  add: vi.fn(),
  addBundle: vi.fn(),
  load: vi.fn(() => Promise.resolve(undefined)),
  loadBundle: vi.fn(() => Promise.resolve(undefined)),
  unload: vi.fn(() => Promise.resolve()),
  unloadBundle: vi.fn(() => Promise.resolve()),
  ...overrides,
});

describe('ManagedAssets', () => {
  it('registers alias maps and unloads only their public keys', async () => {
    const api = fakeApi();
    const assets = new ManagedAssets(api);
    await assets.register({
      loading: '/loading.svg',
      device: { src: '/device.svg', data: { resolution: 2 } },
    });

    expect(Reflect.get(api, 'add')).toHaveBeenCalledWith([
      { alias: 'loading', src: '/loading.svg' },
      {
        alias: 'device',
        src: '/device.svg',
        data: { resolution: 2 },
      },
    ]);
    expect(Reflect.get(api, 'load')).toHaveBeenCalledWith(['loading', 'device']);
    await assets.clear();
    expect(Reflect.get(api, 'unload')).toHaveBeenCalledWith(['loading', 'device']);
  });

  it('registers and loads Pixi-style bundles', async () => {
    const api = fakeApi();
    const assets = new ManagedAssets(api);
    const definitions = [{ alias: 'icon', src: '/icon.svg' }];
    await assets.register({ bundles: [{ name: 'ui', assets: definitions }] });

    expect(Reflect.get(api, 'addBundle')).toHaveBeenCalledWith('ui', definitions);
    expect(Reflect.get(api, 'loadBundle')).toHaveBeenCalledWith(['ui']);
    await assets.clear();
    expect(Reflect.get(api, 'unloadBundle')).toHaveBeenCalledWith(['ui']);
  });

  it('unloads a completed registration made stale by clear', async () => {
    const loading = deferred();
    const api = fakeApi({ load: vi.fn(() => loading.promise) });
    const assets = new ManagedAssets(api);
    const registration = assets.register({ icon: '/icon.svg' });
    const clearing = assets.clear();
    loading.resolve(undefined);
    await Promise.all([registration, clearing]);

    expect(Reflect.get(api, 'unload')).toHaveBeenCalledWith(['icon']);
  });

  it('releases partial registrations when loading fails', async () => {
    const api = fakeApi({
      load: vi.fn(() => Promise.reject(new Error('asset failed'))),
    });
    const assets = new ManagedAssets(api);

    await expect(assets.register({ icon: '/bad.svg' })).rejects.toThrow('asset failed');
    expect(Reflect.get(api, 'unload')).toHaveBeenCalledWith(['icon']);
  });
});

describe('ManagedSceneAssets', () => {
  const cache = (...keys: string[]): PublicAssetCacheApi => ({
    has: (key) => keys.includes(key),
  });

  it('deduplicates identical sources while preserving distinct descriptor semantics', () => {
    expect(collectSceneAssetSources([
      { type: 'image', source: '/a.png' },
      { type: 'icon', source: { src: '/a.png', parser: 'texture' } },
      { type: 'background', source: { type: 'rect', fill: '#fff' } },
      { type: 'image', source: { src: '/b', parser: 'texture' } },
    ])).toEqual([
      { key: '/a.png', load: '/a.png', descriptor: false },
      {
        key: 'patch-map:inline:%7B%22parser%22%3A%22texture%22%2C%22src%22%3A%22%2Fa.png%22%7D',
        load: {
          src: '/a.png',
          parser: 'texture',
          alias: 'patch-map:inline:%7B%22parser%22%3A%22texture%22%2C%22src%22%3A%22%2Fa.png%22%7D',
        },
        descriptor: true,
      },
      {
        key: 'patch-map:inline:%7B%22parser%22%3A%22texture%22%2C%22src%22%3A%22%2Fb%22%7D',
        load: {
          src: '/b',
          parser: 'texture',
          alias: 'patch-map:inline:%7B%22parser%22%3A%22texture%22%2C%22src%22%3A%22%2Fb%22%7D',
        },
        descriptor: true,
      },
    ]);
  });

  it('uses distinct deterministic cache aliases for different loader options', () => {
    const first = collectSceneAssetSources([{
      source: { src: '/same.svg', data: { resolution: 1 }, parser: 'svg' },
    }])[0]!;
    const reordered = collectSceneAssetSources([{
      source: { parser: 'svg', data: { resolution: 1 }, src: '/same.svg' },
    }])[0]!;
    const second = collectSceneAssetSources([{
      source: { src: '/same.svg', data: { resolution: 2 }, parser: 'svg' },
    }])[0]!;

    expect(reordered.key).toBe(first.key);
    expect(second.key).not.toBe(first.key);
    expect(first.load).toMatchObject({ alias: first.key, src: '/same.svg' });
    expect(second.load).toMatchObject({ alias: second.key, src: '/same.svg' });
  });

  it('loads each missing public URL once and notifies the current scene', async () => {
    const first = deferred();
    const api = fakeApi({ load: vi.fn(() => first.promise) });
    const ready = vi.fn();
    const assets = new ManagedSceneAssets(api, cache());

    const refreshing = assets.refresh([
      { type: 'image', source: '/icon.png' },
      { type: 'icon', source: '/icon.png' },
    ], ready);
    first.resolve(undefined);
    await refreshing;

    expect(Reflect.get(api, 'load')).toHaveBeenCalledTimes(1);
    expect(Reflect.get(api, 'load')).toHaveBeenCalledWith('/icon.png');
    expect(ready).toHaveBeenCalledTimes(1);
    await assets.clear();
    expect(Reflect.get(api, 'unload')).toHaveBeenCalledWith(['/icon.png']);
  });

  it('does not reload cached aliases or guess unknown bare aliases as URLs', async () => {
    const api = fakeApi();
    const assets = new ManagedSceneAssets(api, cache('registered'));
    await assets.refresh([
      { type: 'icon', source: 'registered' },
      { type: 'icon', source: 'device' },
      { type: 'background', source: { type: 'rect', fill: '#fff' } },
    ], vi.fn());

    expect(Reflect.get(api, 'load')).not.toHaveBeenCalled();
  });

  it('suppresses completion from a stale scene while reusing the pending load', async () => {
    const loading = deferred();
    const api = fakeApi({ load: vi.fn(() => loading.promise) });
    const stale = vi.fn();
    const current = vi.fn();
    const assets = new ManagedSceneAssets(api, cache());

    const firstRefresh = assets.refresh(
      [{ type: 'image', source: '/same.png' }],
      stale,
    );
    const secondRefresh = assets.refresh(
      [{ type: 'image', source: '/same.png' }],
      current,
    );
    loading.resolve(undefined);
    await Promise.all([firstRefresh, secondRefresh]);

    expect(Reflect.get(api, 'load')).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('unloads manager-owned sources that leave the current scene', async () => {
    const api = fakeApi();
    const assets = new ManagedSceneAssets(api, cache());
    await assets.refresh([{ type: 'image', source: '/first.png' }], vi.fn());
    await assets.refresh([{ type: 'image', source: '/second.png' }], vi.fn());

    expect(Reflect.get(api, 'unload')).toHaveBeenCalledWith(['/first.png']);
    await assets.clear();
    expect(Reflect.get(api, 'unload')).toHaveBeenLastCalledWith(['/second.png']);
  });

  it('unloads a stale pending source as soon as its load completes', async () => {
    const loading = deferred();
    const api = fakeApi({ load: vi.fn(() => loading.promise) });
    const assets = new ManagedSceneAssets(api, cache());
    const stale = assets.refresh([{ type: 'image', source: '/stale.png' }], vi.fn());
    await assets.refresh([], vi.fn());
    loading.resolve(undefined);
    await stale;

    expect(Reflect.get(api, 'unload')).toHaveBeenCalledWith('/stale.png');
  });

  it('invalidates and unloads a load that completes after clear starts', async () => {
    const loading = deferred();
    const api = fakeApi({ load: vi.fn(() => loading.promise) });
    const ready = vi.fn();
    const assets = new ManagedSceneAssets(api, cache());
    void assets.refresh(
      [{ type: 'image', source: { src: '/late', parser: 'texture' } }],
      ready,
    );

    const clearing = assets.clear();
    loading.resolve(undefined);
    await clearing;

    expect(ready).not.toHaveBeenCalled();
    expect(Reflect.get(api, 'unload')).toHaveBeenCalledWith(
      expect.stringMatching(/^patch-map:inline:/),
    );
  });

  it('absorbs scene load failures without a callback or owned unload', async () => {
    const api = fakeApi({
      load: vi.fn(() => Promise.reject(new Error('scene asset failed'))),
    });
    const ready = vi.fn();
    const assets = new ManagedSceneAssets(api, cache());
    await assets.refresh([{ type: 'image', source: 'icon.svg' }], ready);

    expect(ready).not.toHaveBeenCalled();
    await assets.clear();
    expect(Reflect.get(api, 'unload')).not.toHaveBeenCalled();
  });
});
