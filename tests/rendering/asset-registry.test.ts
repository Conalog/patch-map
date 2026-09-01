import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Assets } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PATCH_MAP_BUILTIN_ASSETS,
  PatchMapAssetRuntime,
  createPatchMapPixiAssetBackend,
  normalizePatchMapAssetDescriptor,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
} from '../../src/assets';
import {
  BUILTIN_IMAGE_SVGS,
  builtinImageSvg,
} from '../../src/assets/builtin-image-glyphs';
import {
  BUILTIN_FIRA_CODE_ASSET,
  BUILTIN_FIRA_CODE_FACES,
  BUILTIN_FONT_WEIGHTS,
  BUILTIN_IMAGE_ALIASES,
  PATCH_MAP_BUILTIN_FONT_ASSETS,
  builtinImageDataUri,
} from '../../src/assets/registration-normalization';
import { stableHash64Hex } from '../../src/shared/stable-hash';

const PATCH_MAP_BUILTIN_SHA256 = Object.freeze({
  object: 'e87c2ae562c7a3941a0c79249aa4c37494ef6222de31e57779d2aaa31d79e4d4',
  inverter: 'd7527c15410edb84e560a9dcd763edf4914be13494c5a99509c373dff803992d',
  combiner: '2965f5e1c28bd8779d7f02e967cefa43893d4171046708243b1ab03451ed1ee5',
  device: 'a11ac1f84f74afb9a2e888d615c79d45312f2194c64510e64e10db7c8eb70680',
  edge: '46cc54309389013808f40bcbfaa8574fdfec78521b52e3178b3a53eb7f7c3c84',
  loading: '30645d95659f451df9d847f9dadf4d7a641e421c158c54619d7c817057ea00a5',
  warning: '8d485f34e7fa054c787a6775a76a7e62f04e18b93f4741dab3137db15e45f1e8',
  wifi: 'ef2c14fd831d067d559737b7f281be6e550605024a8d9e01a23579e4ccac206c',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockAssetFetch(
  blobForSource: (src: string) => Blob | Promise<Blob>,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const src = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const blob = await blobForSource(src);
    return new Response(blob, {
      status: 200,
      headers: { 'content-type': blob.type },
    });
  });
}

function mockObjectUrls(prefix: string) {
  const created: string[] = [];
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const objectUrl = `${prefix}${created.length + 1}`;
    created.push(objectUrl);
    return objectUrl;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((objectUrl) => {
    revoked.push(objectUrl);
  });
  return { created, revoked };
}

function mockSvgDecoder(width: number, height: number) {
  const decode = vi.fn(() => Promise.resolve());
  class FixtureImage {
    public readonly naturalWidth = width;
    public readonly naturalHeight = height;
    public src = '';
    public readonly decode = decode;
  }
  vi.stubGlobal('Image', FixtureImage);
  return decode;
}

function mockRasterDecoder(width: number, height: number) {
  const close = vi.fn();
  const createImageBitmap = vi.fn(() => Promise.resolve({
    width,
    height,
    close,
  } as unknown as ImageBitmap));
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  return { close, createImageBitmap };
}

class FakeAssetBackend implements PatchMapAssetBackend {
  public readonly lookupRequests: PatchMapAssetBackendRequest[] = [];
  public readonly loadRequests: PatchMapAssetBackendRequest[] = [];
  public readonly unloadKeys: string[] = [];
  public readonly pending = deferred<unknown>();
  public cached: unknown = undefined;
  public immediate: unknown = undefined;
  public unloadFailuresRemaining = 0;
  public unloadBarrier: Promise<void> | null = null;

  public get(request: PatchMapAssetBackendRequest): unknown {
    this.lookupRequests.push(request);
    return this.cached;
  }

  public load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    this.loadRequests.push(request);
    return this.immediate === undefined
      ? this.pending.promise
      : Promise.resolve(this.immediate);
  }

  public unload(key: string): Promise<void> {
    this.unloadKeys.push(key);
    if (this.unloadFailuresRemaining > 0) {
      this.unloadFailuresRemaining -= 1;
      return Promise.reject(new Error('fixture unload failure'));
    }
    if (this.unloadBarrier) {
      const barrier = this.unloadBarrier;
      this.unloadBarrier = null;
      return barrier;
    }
    return Promise.resolve();
  }
}

describe('PatchMap shared asset runtime', () => {
  it('binds every built-in Fira Code weight to one exact package-owned variable face', () => {
    expect(BUILTIN_FIRA_CODE_FACES.map(({ fontWeight }) => fontWeight)).toEqual([
      300, 400, 500, 600, 700,
    ]);
    expect(new Set(BUILTIN_FIRA_CODE_FACES.map(({ descriptorSource }) => descriptorSource)).size)
      .toBe(1);

    const bytes = readFileSync(new URL(
      `../../src/resources/fonts/${BUILTIN_FIRA_CODE_ASSET.fileName}`,
      import.meta.url,
    ));
    expect(bytes.byteLength).toBe(BUILTIN_FIRA_CODE_ASSET.byteLength);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      BUILTIN_FIRA_CODE_ASSET.sha256,
    );
    expect(BUILTIN_FIRA_CODE_ASSET.descriptorSource).toContain(
      `${BUILTIN_FIRA_CODE_ASSET.fileName}?sha256=${BUILTIN_FIRA_CODE_ASSET.sha256}`,
    );

    for (const [index, face] of BUILTIN_FIRA_CODE_FACES.entries()) {
      const registration = PATCH_MAP_BUILTIN_FONT_ASSETS[index];
      expect(registration).toMatchObject({
        alias: `FiraCode-${face.fontWeight}`,
        kind: 'font',
        fontWeight: face.fontWeight,
        descriptor: {
          src: face.descriptorSource,
          parser: 'web-font',
          data: { family: 'FiraCode', weights: BUILTIN_FONT_WEIGHTS.map(String) },
        },
      });
    }
  });

  it('loads the shared built-in Fira Code resource once for all logical weights', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ font: 'FiraCode-VF' });
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'font-deduplication' });
    session.registerAssets();

    const acquisitions = await Promise.all(
      PATCH_MAP_BUILTIN_FONT_ASSETS.map(({ alias }) => session.acquire(alias)),
    );

    expect(backend.loadRequests).toHaveLength(1);
    expect(new Set(acquisitions.map(({ resource }) => resource)).size).toBe(1);
    expect(runtime.probe()).toMatchObject({ resourceCount: 1, leaseCount: 1 });
    await session.destroy();
    expect(backend.unloadKeys).toHaveLength(1);
  });

  it('owns the exact transparent PatchMap filled glyph sources', () => {
    expect(BUILTIN_IMAGE_ALIASES).toEqual([
      'object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi',
    ]);
    expect(Object.isFrozen(BUILTIN_IMAGE_SVGS)).toBe(true);
    expect(new Set(Object.values(BUILTIN_IMAGE_SVGS)).size).toBe(BUILTIN_IMAGE_ALIASES.length);

    for (const alias of BUILTIN_IMAGE_ALIASES) {
      const svg = builtinImageSvg(alias);
      expect(svg).toContain('width="72" height="72" viewBox="0 0 72 72"');
      expect(svg).toMatch(/fill="#(?:FFF|FFFFFF)"/u);
      expect(svg).not.toContain('<rect');
      expect(createHash('sha256').update(svg).digest('hex')).toBe(
        PATCH_MAP_BUILTIN_SHA256[alias],
      );
      expect(decodeURIComponent(builtinImageDataUri(alias).split(',', 2)[1] ?? '')).toBe(svg);
    }
    expect(() => builtinImageDataUri('unknown')).toThrowError(expect.objectContaining({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
    }));
  });

  it('registers immutable builtins without allocating resources and rejects conflicts by the closed code', () => {
    const backend = new FakeAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const sessionA = runtime.createSession({ instanceId: 'A' });
    const sessionB = runtime.createSession({ instanceId: 'B' });

    expect(sessionA.registerAssets()).toMatchObject({
      registeredAliases: PATCH_MAP_BUILTIN_ASSETS.map(({ alias }) => alias),
      duplicateAliases: [],
    });
    expect(sessionB.registerAssets()).toMatchObject({
      registeredAliases: [],
      duplicateAliases: PATCH_MAP_BUILTIN_ASSETS.map(({ alias }) => alias),
    });
    expect(runtime.probe()).toMatchObject({
      builtins: {
        aliases: ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'],
      },
      fonts: { weights: [300, 400, 500, 600, 700] },
      resourceCount: 0,
      pendingCount: 0,
      leaseCount: 0,
      cleanupPendingCount: 0,
    });
    expect(backend.loadRequests).toHaveLength(0);

    expect(() => runtime.registerAlias({
      alias: 'device',
      descriptor: { src: 'https://assets.example.test/other.png' },
    })).toThrowError(expect.objectContaining({
      name: 'PatchMapAssetError',
      code: 'CONFLICT',
      category: 'CONFLICT',
    }));
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
  });

  it('distinguishes package catalog identity from host registrations and uses closed invalid-input codes', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'device' });
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'catalog-identity' });

    session.registerAssets([{
      alias: 'spoofed-device',
      descriptor: 'patch-map-builtin://images/device.svg',
    }]);
    await expect(session.acquire('spoofed-device')).resolves.toMatchObject({
      resource: { texture: 'device' },
    });
    expect(backend.loadRequests[0]).toMatchObject({ packageOwned: false });

    session.registerAssets();
    await expect(session.acquire('device')).resolves.toMatchObject({
      resource: { texture: 'device' },
    });
    expect(backend.loadRequests[1]).toMatchObject({ packageOwned: true });

    expect(() => session.acquire('missing')).toThrowError(expect.objectContaining({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      retryable: false,
    }));
    expect(() => session.registerAssets([{ alias: 'bad', descriptor: '' }])).toThrowError(
      expect.objectContaining({ code: 'INVALID_VALUE', category: 'INVALID_INPUT' }),
    );
    await session.destroy();
  });

  it('does not let a permissive reserved-source acquisition occupy a package resource identity', async () => {
    const backend = new FakeAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const host = runtime.createSession({ instanceId: 'host' });
    const product = runtime.createSession({ instanceId: 'product' });
    host.registerAssets([{
      alias: 'host-device',
      descriptor: 'patch-map-builtin://images/device.svg',
    }]);
    product.registerAssets();

    const hostResource = Object.freeze({ texture: 'host-spoof' });
    backend.immediate = hostResource;
    const hostAcquisition = await host.acquire('host-device');
    const productResource = Object.freeze({ texture: 'package-device' });
    backend.immediate = productResource;
    const productAcquisition = await product.acquire('device');

    expect(hostAcquisition.resource).toBe(hostResource);
    expect(productAcquisition.resource).toBe(productResource);
    expect(backend.loadRequests).toHaveLength(2);
    expect(backend.loadRequests.map(({ packageOwned }) => packageOwned)).toEqual([false, true]);
    expect(runtime.probe()).toMatchObject({ resourceCount: 2, leaseCount: 2 });
    await Promise.all([host.destroy(), product.destroy()]);
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, leaseCount: 0 });
  });

  it('detaches and freezes descriptor options while including every field in identity', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'resolution-2' });
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'immutable' });
    const data = { resolution: 2, nested: { scaleMode: 'linear' } };
    const descriptor = {
      src: 'https://assets.example.test/icon.svg',
      data,
      format: 'svg',
      parser: 'svg',
    };
    session.registerAssets([{ alias: 'icon', descriptor }]);
    data.resolution = 4;
    data.nested.scaleMode = 'nearest';

    const acquired = await session.acquire('icon');
    expect(backend.loadRequests[0]?.descriptor).toEqual({
      src: 'https://assets.example.test/icon.svg',
      data: { nested: { scaleMode: 'linear' }, resolution: 2 },
      format: 'svg',
      parser: 'svg',
    });
    expect(Object.isFrozen(backend.loadRequests[0]?.descriptor)).toBe(true);
    expect(JSON.stringify(session.runtimeProbe('icon'))).not.toContain('assets.example.test');

    await acquired.release();
    expect(backend.unloadKeys).toHaveLength(1);
  });

  it('rejects unknown descriptor fields while preserving the parser descriptor', () => {
    expect(normalizePatchMapAssetDescriptor({
      src: 'https://assets.example.test/current.svg',
      parser: 'svg',
    })).toEqual({
      src: 'https://assets.example.test/current.svg',
      parser: 'svg',
    });
    const unknownDescriptorField = 'unsupportedLoader';
    expect(() => normalizePatchMapAssetDescriptor({
      src: 'https://assets.example.test/unknown-field.svg',
      [unknownDescriptorField]: 'loadSvg',
    } as never)).toThrowError(expect.objectContaining({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
    }));
  });

  it('deduplicates pending work across instances and unloads after the final lease', async () => {
    const backend = new FakeAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const sessionA = runtime.createSession({ instanceId: 'A' });
    const sessionB = runtime.createSession({ instanceId: 'B' });
    sessionA.registerAssets([{
      alias: 'device',
      descriptor: 'https://assets.example.test/device.png',
    }]);
    sessionB.registerAssets([{
      alias: 'device',
      descriptor: 'https://assets.example.test/device.png',
    }]);

    const pendingA = sessionA.acquire('device');
    const pendingB = sessionB.acquire('device');
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.loadRequests).toHaveLength(1);
    expect(runtime.probe('device').resource).toMatchObject({
      resourceCount: 1,
      pendingCount: 2,
      leaseCount: 0,
      state: 'pending',
    });

    backend.pending.resolve(Object.freeze({ texture: 'device' }));
    await Promise.all([pendingA, pendingB]);
    expect(runtime.probe('device').resource).toMatchObject({
      resourceCount: 1,
      pendingCount: 0,
      leaseCount: 2,
      state: 'resolved',
    });

    await sessionA.destroy();
    expect(runtime.probe('device').resource).toMatchObject({ resourceCount: 1, leaseCount: 1 });
    expect(backend.unloadKeys).toHaveLength(0);
    await sessionB.destroy();
    expect(runtime.probe('device').resource).toMatchObject({ resourceCount: 0, leaseCount: 0 });
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
    expect(backend.unloadKeys).toHaveLength(1);
  });

  it('coordinates leases across runtimes that share one physical backend', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'shared-runtime-resource' });
    const runtimeA = new PatchMapAssetRuntime(backend);
    const runtimeB = new PatchMapAssetRuntime(backend);
    const sessionA = runtimeA.createSession({ instanceId: 'runtime-A' });
    const sessionB = runtimeB.createSession({ instanceId: 'runtime-B' });
    const registration = [{
      alias: 'shared',
      descriptor: 'https://assets.example.test/shared-runtime.png',
    }] as const;
    sessionA.registerAssets(registration);
    sessionB.registerAssets(registration);

    const [acquisitionA, acquisitionB] = await Promise.all([
      sessionA.acquire('shared'),
      sessionB.acquire('shared'),
    ]);
    expect(acquisitionA.resource).toBe(acquisitionB.resource);
    expect(backend.loadRequests).toHaveLength(1);
    expect(runtimeA.probe('shared').resource).toMatchObject({ leaseCount: 2 });

    await sessionA.destroy();
    expect(backend.unloadKeys).toHaveLength(0);
    expect(runtimeB.probe('shared').resource).toMatchObject({ resourceCount: 1, leaseCount: 1 });
    await sessionB.destroy();
    expect(backend.unloadKeys).toHaveLength(1);
    expect(runtimeA.probe()).toMatchObject({ resourceCount: 0, leaseCount: 0 });
  });

  it('isolates shared resources when sessions use different asset policies', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'device' });
    const runtime = new PatchMapAssetRuntime(backend);
    const defaults = runtime.createSession({ instanceId: 'defaults' });
    const constrained = runtime.createSession({
      instanceId: 'constrained',
      policy: { maxEncodedBytes: 1024 },
    });
    const registration = [{ alias: 'device', descriptor: 'https://assets.example.test/device.png' }];
    defaults.registerAssets(registration);
    constrained.registerAssets(registration);
    await Promise.all([defaults.acquire('device'), constrained.acquire('device')]);

    expect(backend.loadRequests).toHaveLength(2);
    expect(backend.loadRequests.map(({ policy }) => policy?.maxEncodedBytes)).toEqual([
      20 * 1024 * 1024,
      1024,
    ]);
    expect(runtime.probe('device').resource).toMatchObject({ resourceCount: 2, leaseCount: 2 });
    await Promise.all([defaults.destroy(), constrained.destroy()]);
  });

  it('releases a late core-owned success after its only pending session is destroyed', async () => {
    const backend = new FakeAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'late' });
    session.registerAssets([{ alias: 'late', descriptor: 'https://assets.example.test/late.png' }]);
    const acquisition = session.acquire('late');
    await Promise.resolve();
    await Promise.resolve();

    const destroying = session.destroy();
    backend.pending.resolve(Object.freeze({ texture: 'late' }));
    await expect(acquisition).rejects.toMatchObject({ code: 'CANCELLED' });
    await destroying;
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
    expect(backend.unloadKeys).toHaveLength(1);
  });

  it('retries transient unload failure before completing session destruction', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'transient-unload' });
    backend.unloadFailuresRemaining = 1;
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'transient' });
    session.registerAssets([{
      alias: 'transient',
      descriptor: 'https://assets.example.test/transient.png',
    }]);
    await session.acquire('transient');

    await expect(session.destroy()).resolves.toBeUndefined();
    expect(backend.unloadKeys).toHaveLength(2);
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, leaseCount: 0 });
  });

  it('retains ownership after persistent unload failure and supports explicit cleanup retry', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'persistent-unload' });
    backend.unloadFailuresRemaining = 2;
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'persistent' });
    session.registerAssets([{
      alias: 'persistent',
      descriptor: 'https://assets.example.test/persistent.png',
    }]);
    await session.acquire('persistent');

    await expect(session.destroy()).rejects.toMatchObject({
      code: 'INTERNAL_FAILURE',
      category: 'INTERNAL_FAILURE',
    });
    expect(backend.unloadKeys).toHaveLength(2);
    expect(runtime.probe('persistent').resource).toMatchObject({
      resourceCount: 1,
      leaseCount: 0,
      pendingCount: 0,
      state: 'cleanup-failed',
      ownership: 'patch-map',
      cleanupPending: true,
      cleanupRetryOwner: 'runtime',
    });
    expect(runtime.probe()).toMatchObject({ cleanupPendingCount: 1 });

    await expect(runtime.retryCleanup()).resolves.toBeUndefined();
    expect(backend.unloadKeys).toHaveLength(3);
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, leaseCount: 0 });
  });

  it('does not make an unrelated empty session retry another session cleanup', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'owned-by-a' });
    backend.unloadFailuresRemaining = 3;
    const runtime = new PatchMapAssetRuntime(backend);
    const owner = runtime.createSession({ instanceId: 'owner' });
    owner.registerAssets([{
      alias: 'owned-by-a',
      descriptor: 'https://assets.example.test/owned-by-a.png',
    }]);
    await owner.acquire('owned-by-a');
    await expect(owner.destroy()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });
    expect(backend.unloadKeys).toHaveLength(2);

    const unrelated = runtime.createSession({ instanceId: 'unrelated' });
    await expect(unrelated.destroy()).resolves.toBeUndefined();
    expect(backend.unloadKeys).toHaveLength(2);
    expect(runtime.probe()).toMatchObject({ resourceCount: 1, cleanupPendingCount: 1 });

    await expect(runtime.retryCleanup()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });
    expect(backend.unloadKeys).toHaveLength(3);
    await runtime.retryCleanup();
    expect(backend.unloadKeys).toHaveLength(4);
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, cleanupPendingCount: 0 });
  });

  it('quarantines an unload failure and never leases the partly destroyed resource again', async () => {
    const backend = new FakeAssetBackend();
    const staleResource = Object.freeze({ texture: 'stale-after-unload-failure' });
    const replacementResource = Object.freeze({ texture: 'fresh-after-cleanup-retry' });
    backend.immediate = staleResource;
    backend.unloadFailuresRemaining = 2;
    const runtime = new PatchMapAssetRuntime(backend);
    const registration = [{
      alias: 'quarantined',
      descriptor: 'https://assets.example.test/quarantined.png',
    }] as const;
    const first = runtime.createSession({ instanceId: 'first' });
    first.registerAssets(registration);
    expect((await first.acquire('quarantined')).resource).toBe(staleResource);

    await expect(first.destroy()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });
    expect(runtime.probe('quarantined').resource).toMatchObject({
      state: 'cleanup-failed',
      leaseCount: 0,
      ownership: 'patch-map',
      cleanupPending: true,
      cleanupRetryOwner: 'runtime',
    });
    expect(runtime.probe()).toMatchObject({ cleanupPendingCount: 1 });

    backend.immediate = replacementResource;
    const second = runtime.createSession({ instanceId: 'second' });
    second.registerAssets(registration);
    const replacement = await second.acquire('quarantined');
    expect(replacement.resource).toBe(replacementResource);
    expect(replacement.resource).not.toBe(staleResource);
    expect(backend.loadRequests).toHaveLength(2);
    expect(backend.loadRequests[1]?.key).not.toBe(backend.loadRequests[0]?.key);
    expect(backend.unloadKeys).toHaveLength(3);
    await second.destroy();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, leaseCount: 0 });
  });

  it('cancels an acquire destroyed while it waits for quarantined cleanup', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'quarantined-race' });
    backend.unloadFailuresRemaining = 2;
    const runtime = new PatchMapAssetRuntime(backend);
    const registration = [{
      alias: 'quarantined-race',
      descriptor: 'https://assets.example.test/quarantined-race.png',
    }] as const;
    const first = runtime.createSession({ instanceId: 'first' });
    first.registerAssets(registration);
    await first.acquire('quarantined-race');
    await expect(first.destroy()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });

    const cleanup = deferred<void>();
    backend.unloadBarrier = cleanup.promise;
    const second = runtime.createSession({ instanceId: 'second' });
    second.registerAssets(registration);
    const acquiring = second.acquire('quarantined-race');
    await vi.waitFor(() => expect(backend.unloadKeys).toHaveLength(3));
    const destroying = second.destroy();
    cleanup.resolve();

    await expect(acquiring).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(destroying).resolves.toBeUndefined();
    expect(backend.loadRequests).toHaveLength(1);
    expect(runtime.probe()).toMatchObject({
      resourceCount: 0,
      pendingCount: 0,
      leaseCount: 0,
      cleanupPendingCount: 0,
    });
  });

  it('cancels an acquire destroyed while it waits for an in-flight release', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'releasing-race' });
    const cleanup = deferred<void>();
    backend.unloadBarrier = cleanup.promise;
    const runtime = new PatchMapAssetRuntime(backend);
    const registration = [{
      alias: 'releasing-race',
      descriptor: 'https://assets.example.test/releasing-race.png',
    }] as const;
    const first = runtime.createSession({ instanceId: 'first' });
    const second = runtime.createSession({ instanceId: 'second' });
    first.registerAssets(registration);
    second.registerAssets(registration);
    await first.acquire('releasing-race');
    const firstDestroying = first.destroy();
    await vi.waitFor(() => expect(backend.unloadKeys).toHaveLength(1));

    const acquiring = second.acquire('releasing-race');
    await Promise.resolve();
    const secondDestroying = second.destroy();
    cleanup.resolve();

    await expect(firstDestroying).resolves.toBeUndefined();
    await expect(acquiring).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(secondDestroying).resolves.toBeUndefined();
    expect(backend.loadRequests).toHaveLength(1);
    expect(runtime.probe()).toMatchObject({
      resourceCount: 0,
      pendingCount: 0,
      leaseCount: 0,
      cleanupPendingCount: 0,
    });
  });

  it('borrows an externally cached backend entry without unloading it', async () => {
    const backend = new FakeAssetBackend();
    backend.cached = Object.freeze({ texture: 'external' });
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'external' });
    session.registerAssets([{ alias: 'external', descriptor: 'https://assets.example.test/external.png' }]);

    await session.acquire('external');
    expect(runtime.probe('external').resource).toMatchObject({ ownership: 'external', leaseCount: 1 });
    await session.destroy();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, leaseCount: 0 });
    expect(backend.loadRequests).toHaveLength(0);
    expect(backend.unloadKeys).toHaveLength(0);
    expect(backend.lookupRequests[0]).toMatchObject({
      descriptor: { src: 'https://assets.example.test/external.png' },
      packageOwned: false,
    });
  });

  it('does not borrow host Pixi cache entries and maps package builtins', async () => {
    const fetchedSources: string[] = [];
    mockObjectUrls('blob:patch-map/builtin-');
    mockSvgDecoder(72, 72);
    mockAssetFetch((src) => {
      fetchedSources.push(src);
      return new Blob(['fixture'], {
        type: src.includes('FiraCode') ? 'font/woff2' : 'image/svg+xml',
      });
    });
    const backend = createPatchMapPixiAssetBackend();
    const pixiAssets = Assets as unknown as {
      load(descriptor: unknown): Promise<unknown>;
      unload(id: string): Promise<void>;
    };
    const externalRequest: PatchMapAssetBackendRequest = Object.freeze({
      key: 'patch-map-asset:external',
      descriptor: Object.freeze({ src: 'https://assets.example.test/external.png' }),
      cacheIdentity: 'descriptor:external',
      packageOwned: false,
    });

    expect(backend.get(externalRequest)).toBeUndefined();
    const optionedRequest: PatchMapAssetBackendRequest = Object.freeze({
      ...externalRequest,
      descriptor: Object.freeze({
        src: externalRequest.descriptor.src,
        data: Object.freeze({ resolution: 2 }),
      }),
    });
    expect(backend.get(optionedRequest)).toBeUndefined();

    const resource = Object.freeze({ texture: 'builtin' });
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(resource);
    const unload = vi.spyOn(pixiAssets, 'unload').mockResolvedValue(undefined);
    const builtinRequest: PatchMapAssetBackendRequest = Object.freeze({
      key: 'patch-map-asset:device',
      descriptor: Object.freeze({ src: 'patch-map-builtin://images/device.svg' }),
      cacheIdentity: 'descriptor:device',
      packageOwned: true,
    });
    await expect(backend.load(builtinRequest)).resolves.toBe(resource);
    const imageLoad = load.mock.calls[0]?.[0] as { readonly alias?: unknown } | undefined;
    expect(imageLoad).toMatchObject({
      parser: 'svg',
      src: 'blob:patch-map/builtin-1',
    });
    expect(imageLoad?.alias).toEqual(expect.stringMatching(
      /^patch-map-asset:device:content:[0-9a-f]{16}$/u,
    ));
    expect(fetchedSources[0]).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,/,
    );
    const deviceDataUri = fetchedSources[0] ?? '';
    expect(decodeURIComponent(deviceDataUri.split(',', 2)[1] ?? '')).toBe(
      builtinImageSvg('device'),
    );
    expect(imageLoad?.alias).toBe(
      `patch-map-asset:device:content:${stableHash64Hex(deviceDataUri)}`,
    );
    const croppedDeviceDataUri = deviceDataUri.replace(
      encodeURIComponent('viewBox="0 0 72 72"'),
      encodeURIComponent('viewBox="6 6 60 60"'),
    );
    expect(stableHash64Hex(deviceDataUri)).not.toBe(stableHash64Hex(croppedDeviceDataUri));
    await backend.unload(builtinRequest.key);
    expect(unload).toHaveBeenCalledWith(imageLoad?.alias);

    for (const [index, registration] of PATCH_MAP_BUILTIN_FONT_ASSETS.entries()) {
      load.mockClear();
      const descriptor = registration.descriptor;
      if (typeof descriptor === 'string') throw new Error('font descriptor fixture must be structured');
      await backend.load(Object.freeze({
        key: `patch-map-asset:font-${registration.fontWeight}`,
        descriptor,
        cacheIdentity: `descriptor:font-${registration.fontWeight}`,
        packageOwned: true,
      }));
      expect(load.mock.calls[0]?.[0]).toMatchObject({
        alias: `patch-map-asset:font-${registration.fontWeight}`,
        parser: 'web-font',
        src: `blob:patch-map/builtin-${index + 2}`,
        data: { family: 'FiraCode', weights: BUILTIN_FONT_WEIGHTS.map(String) },
      });
      expect(fetchedSources[index + 1]).toMatch(/^file:.*FiraCode-VF\.woff2$/u);
    }

    load.mockClear();
    const rawHostSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      builtinImageSvg('inverter'),
    )}`;
    const hostRequest: PatchMapAssetBackendRequest = Object.freeze({
      key: 'patch-map-asset:host-inverter-frame',
      descriptor: Object.freeze({ src: rawHostSvg }),
      cacheIdentity: 'descriptor:host-inverter-frame',
      packageOwned: false,
    });
    await backend.load(hostRequest);
    expect(fetchedSources[6]).toBe(rawHostSvg);
    expect(load.mock.calls[0]?.[0]).toMatchObject({
      alias: hostRequest.key,
      src: 'blob:patch-map/builtin-8',
    });
    await backend.unload(hostRequest.key);
    expect(unload).toHaveBeenLastCalledWith(hostRequest.key);
  });

  it('binds every builtin Pixi cache alias to its exact SVG content', async () => {
    const pixiAssets = Assets as unknown as {
      load(descriptor: unknown): Promise<unknown>;
      unload(id: string): Promise<void>;
    };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'glyph' }));
    const unload = vi.spyOn(pixiAssets, 'unload').mockResolvedValue(undefined);
    mockObjectUrls('blob:patch-map-builtin/');
    mockAssetFetch(() => new Blob(['fixture'], { type: 'image/svg+xml' }));
    const backend = createPatchMapPixiAssetBackend();
    const physicalKeys: string[] = [];

    for (const alias of BUILTIN_IMAGE_ALIASES) {
      const request = Object.freeze({
        key: 'patch-map-asset:reused-physical-alias',
        descriptor: Object.freeze({ src: `patch-map-builtin://images/${alias}.svg` }),
        cacheIdentity: `descriptor:${alias}`,
        packageOwned: true,
      });
      await backend.load(request);
      const descriptor = load.mock.calls.at(-1)?.[0] as { readonly alias?: unknown } | undefined;
      expect(descriptor?.alias).toEqual(expect.stringMatching(
        /^patch-map-asset:reused-physical-alias:content:[0-9a-f]{16}$/u,
      ));
      physicalKeys.push(String(descriptor?.alias));
      await backend.unload(request.key);
      expect(unload).toHaveBeenLastCalledWith(descriptor?.alias);
    }

    expect(new Set(physicalKeys).size).toBe(BUILTIN_IMAGE_ALIASES.length);
  });

  it('does not borrow an unverified external Pixi cache entry', () => {
    const pixiAssets = Assets as unknown as { get(id: string): unknown };
    const get = vi.spyOn(pixiAssets, 'get').mockReturnValue(
      Object.freeze({ texture: 'unverified-external' }),
    );
    const backend = createPatchMapPixiAssetBackend();

    expect(backend.get(Object.freeze({
      key: 'patch-map-asset:policy-cache',
      descriptor: Object.freeze({ src: 'https://assets.example.test/external.png' }),
      cacheIdentity: 'descriptor:policy-cache',
      packageOwned: false,
    }))).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('uses package-owned browser boundaries and ignores caller overrides', async () => {
    const source = 'https://assets.example.test/external.png';
    const fetchAsset = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      new Blob(['png'], { type: 'image/png' }),
      { status: 200, headers: { 'content-type': 'image/png' } },
    ));
    const pixiAssets = Assets as unknown as {
      load(descriptor: unknown): Promise<unknown>;
      unload(id: string): Promise<void>;
    };
    vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'external' }));
    vi.spyOn(pixiAssets, 'unload').mockResolvedValue(undefined);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:patch-map/fixed-fetch',
    );
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { createImageBitmap } = mockRasterDecoder(32, 16);
    const attemptedFetchOverride = vi.fn(() => Promise.resolve(new Blob([
      'bypassed',
    ], { type: 'image/png' })));
    const attemptedCreateObjectURL = vi.fn(() => source);
    const attemptedRevokeObjectURL = vi.fn();
    const attemptedInspectDecodedSize = vi.fn(() => Promise.resolve({ width: 1, height: 1 }));
    const createWithOverrides = createPatchMapPixiAssetBackend as unknown as (options: {
      readonly fetchAsset: typeof attemptedFetchOverride;
      readonly createObjectURL: typeof attemptedCreateObjectURL;
      readonly revokeObjectURL: typeof attemptedRevokeObjectURL;
      readonly inspectDecodedSize: typeof attemptedInspectDecodedSize;
    }) => PatchMapAssetBackend;
    const backend = createWithOverrides({
      fetchAsset: attemptedFetchOverride,
      createObjectURL: attemptedCreateObjectURL,
      revokeObjectURL: attemptedRevokeObjectURL,
      inspectDecodedSize: attemptedInspectDecodedSize,
    });

    await backend.load(Object.freeze({
      key: 'patch-map-asset:fixed-fetch',
      descriptor: Object.freeze({ src: source }),
      cacheIdentity: 'descriptor:fixed-fetch',
      packageOwned: false,
    }));

    expect(fetchAsset).toHaveBeenCalledWith(source, {
      credentials: 'omit',
      redirect: 'error',
    });
    expect(attemptedFetchOverride).not.toHaveBeenCalled();
    expect(attemptedCreateObjectURL).not.toHaveBeenCalled();
    expect(attemptedRevokeObjectURL).not.toHaveBeenCalled();
    expect(attemptedInspectDecodedSize).not.toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    await backend.unload('patch-map-asset:fixed-fetch');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:patch-map/fixed-fetch');
  });

  it.each([
    'font/woff2',
    'application/font-woff',
  ])('loads an extensionless %s font without image decoding', async (mediaType) => {
    const source = 'https://assets.example.test/external-font';
    const pixiAssets = Assets as unknown as {
      load(descriptor: unknown): Promise<unknown>;
      unload(id: string): Promise<void>;
    };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ font: 'external' }));
    vi.spyOn(pixiAssets, 'unload').mockResolvedValue(undefined);
    const { revoked } = mockObjectUrls('blob:patch-map/font-');
    const createImageBitmap = vi.fn(() => Promise.reject(new Error('not an image')));
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    mockAssetFetch(() => new Blob(['font'], { type: mediaType }));
    const backend = createPatchMapPixiAssetBackend();

    await backend.load(Object.freeze({
      key: `patch-map-asset:font:${mediaType}`,
      descriptor: Object.freeze({ src: source }),
      cacheIdentity: `descriptor:font:${mediaType}`,
      packageOwned: false,
    }));

    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({
      alias: `patch-map-asset:font:${mediaType}`,
      src: 'blob:patch-map/font-1',
      parser: 'web-font',
    }));
    await backend.unload(`patch-map-asset:font:${mediaType}`);
    expect(revoked).toEqual(['blob:patch-map/font-1']);
  });

  it.each([
    {
      label: 'raster',
      blob: new Blob(['oversized-raster'], { type: 'image/png' }),
      source: 'https://assets.example.test/oversized.png',
    },
    {
      label: 'SVG',
      blob: new Blob([
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"></svg>',
      ], { type: 'image/svg+xml' }),
      source: 'https://assets.example.test/oversized.svg',
    },
  ])('rejects an oversized $label before content inspection', async ({ blob, source }) => {
    const text = vi.spyOn(blob, 'text');
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:patch-map/oversized',
    );
    const createImageBitmap = vi.fn();
    const ImageConstructor = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    vi.stubGlobal('Image', ImageConstructor);
    const pixiAssets = Assets as unknown as { load(descriptor: unknown): Promise<unknown> };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(
      Object.freeze({ texture: 'oversized' }),
    );
    mockAssetFetch(() => blob);
    const backend = createPatchMapPixiAssetBackend();

    await expect(backend.load(Object.freeze({
      key: `patch-map-asset:oversized:${blob.type}`,
      descriptor: Object.freeze({ src: source }),
      cacheIdentity: `descriptor:oversized:${blob.type}`,
      packageOwned: false,
      policy: { maxEncodedBytes: 1, maxDecodedWidth: 64, maxDecodedHeight: 64 },
    }))).rejects.toMatchObject({ code: 'ASSET_POLICY_REJECTED' });

    expect(text).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(ImageConstructor).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('inspects SVG dimensions through the browser image decoder before Pixi loading', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"></svg>';
    const createImageBitmap = vi.fn(() => Promise.reject(new DOMException(
      'The source image could not be decoded.',
      'InvalidStateError',
    )));
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const decode = mockSvgDecoder(48, 48);

    const { created, revoked } = mockObjectUrls('blob:patch-map/svg-');
    const pixiAssets = Assets as unknown as {
      load(descriptor: unknown): Promise<unknown>;
      unload(id: string): Promise<void>;
    };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'svg' }));
    vi.spyOn(pixiAssets, 'unload').mockResolvedValue(undefined);
    mockAssetFetch(() => new Blob([svg], { type: 'image/svg+xml' }));
    const backend = createPatchMapPixiAssetBackend();
    const request: PatchMapAssetBackendRequest = Object.freeze({
      key: 'patch-map-asset:svg',
      descriptor: Object.freeze({
        src: 'https://assets.example.test/icon.svg',
        parser: 'svg',
        data: Object.freeze({ resolution: 3 }),
      }),
      cacheIdentity: 'descriptor:svg',
      packageOwned: false,
      policy: { maxEncodedBytes: 1024, maxDecodedWidth: 144, maxDecodedHeight: 144 },
    });

    await expect(backend.load(request)).resolves.toEqual({ texture: 'svg' });
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledOnce();
    expect(created).toEqual(['blob:patch-map/svg-1', 'blob:patch-map/svg-2']);
    expect(revoked).toEqual(['blob:patch-map/svg-1']);
    expect(load).toHaveBeenCalledWith({
      alias: request.key,
      src: 'blob:patch-map/svg-2',
      parser: 'svg',
      data: { resolution: 3 },
    });

    await backend.unload(request.key);
    expect(revoked).toEqual(['blob:patch-map/svg-1', 'blob:patch-map/svg-2']);
  });

  it('applies SVG rasterization options to decoded-size admission', async () => {
    const decode = mockSvgDecoder(48, 48);
    const { revoked } = mockObjectUrls('blob:patch-map/svg-policy-');
    const pixiAssets = Assets as unknown as { load(descriptor: unknown): Promise<unknown> };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'svg' }));
    mockAssetFetch(() => new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"></svg>',
    ], { type: 'image/svg+xml' }));
    const backend = createPatchMapPixiAssetBackend();

    await expect(backend.load(Object.freeze({
      key: 'patch-map-asset:oversized-svg',
      descriptor: Object.freeze({
        src: 'https://assets.example.test/oversized.svg',
        parser: 'svg',
        data: Object.freeze({ width: 72, height: 48, resolution: 2 }),
      }),
      cacheIdentity: 'descriptor:oversized-svg',
      packageOwned: false,
      policy: { maxEncodedBytes: 1024, maxDecodedWidth: 143, maxDecodedHeight: 143 },
    }))).rejects.toMatchObject({ code: 'ASSET_POLICY_REJECTED' });

    expect(decode).toHaveBeenCalledOnce();
    expect(revoked).toEqual(['blob:patch-map/svg-policy-1']);
    expect(load).not.toHaveBeenCalled();
  });

  it('rejects SVG parser and response MIME mismatches before Pixi loading', async () => {
    const pixiAssets = Assets as unknown as { load(descriptor: unknown): Promise<unknown> };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'svg' }));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue(
      'blob:patch-map/mismatched-svg',
    );
    mockAssetFetch(() => new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ], { type: 'font/woff2' }));
    const backend = createPatchMapPixiAssetBackend();

    await expect(backend.load(Object.freeze({
      key: 'patch-map-asset:mismatched-svg',
      descriptor: Object.freeze({
        src: 'https://assets.example.test/mismatched.svg',
        parser: 'svg',
      }),
      cacheIdentity: 'descriptor:mismatched-svg',
      packageOwned: false,
      policy: { maxEncodedBytes: 1024, maxDecodedWidth: 64, maxDecodedHeight: 64 },
    }))).rejects.toMatchObject({ code: 'ASSET_POLICY_REJECTED' });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('fails closed when image decoded-size inspection is absent', async () => {
    const pixiAssets = Assets as unknown as { load(descriptor: unknown): Promise<unknown> };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'unsafe' }));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:unsafe');
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', undefined);
    mockAssetFetch(() => new Blob(['png'], { type: 'image/png' }));
    const backend = createPatchMapPixiAssetBackend();

    await expect(backend.load(Object.freeze({
      key: 'patch-map-asset:missing-inspector',
      descriptor: Object.freeze({ src: 'https://assets.example.test/external.png' }),
      cacheIdentity: 'descriptor:missing-inspector',
      packageOwned: false,
      policy: { maxEncodedBytes: 1024, maxDecodedWidth: 64, maxDecodedHeight: 64 },
    }))).rejects.toMatchObject({ code: 'ASSET_POLICY_REJECTED' });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('isolates owned URL loads from Pixi source cache identity before unloading', async () => {
    const pixiAssets = Assets as unknown as {
      get(id: string): unknown;
      load(descriptor: unknown): Promise<unknown>;
      unload(id: string): Promise<void>;
    };
    vi.spyOn(pixiAssets, 'get').mockReturnValue(undefined);
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'owned' }));
    const unload = vi.spyOn(pixiAssets, 'unload').mockResolvedValue(undefined);
    const fetched: string[] = [];
    const { created, revoked } = mockObjectUrls('blob:patch-map/');
    mockSvgDecoder(72, 72);
    mockAssetFetch((src) => {
      fetched.push(src);
      return new Blob(['fixture'], { type: 'image/svg+xml' });
    });
    const backend = createPatchMapPixiAssetBackend();
    const first: PatchMapAssetBackendRequest = Object.freeze({
      key: 'patch-map-asset:first',
      descriptor: Object.freeze({
        src: 'https://assets.example.test/icon.svg',
        data: Object.freeze({ resolution: 1 }),
      }),
      cacheIdentity: 'descriptor:first',
      packageOwned: false,
    });
    const second: PatchMapAssetBackendRequest = Object.freeze({
      ...first,
      key: 'patch-map-asset:second',
      descriptor: Object.freeze({
        src: first.descriptor.src,
        data: Object.freeze({ resolution: 2 }),
      }),
      cacheIdentity: 'descriptor:second',
    });

    await Promise.all([backend.load(first), backend.load(second)]);
    expect(fetched).toEqual([first.descriptor.src, second.descriptor.src]);
    expect(created).toEqual([
      'blob:patch-map/1',
      'blob:patch-map/2',
      'blob:patch-map/3',
      'blob:patch-map/4',
    ]);
    const loadedDescriptors = load.mock.calls.map(([descriptor]) => descriptor as {
      readonly alias: string;
      readonly src: string;
      readonly parser: string;
      readonly data: Readonly<{ readonly resolution: number }>;
    });
    expect(loadedDescriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        alias: first.key,
        parser: 'svg',
        data: { resolution: 1 },
      }),
      expect.objectContaining({
        alias: second.key,
        parser: 'svg',
        data: { resolution: 2 },
      }),
    ]));
    const firstObjectUrl = loadedDescriptors.find(({ alias }) => alias === first.key)?.src;
    const secondObjectUrl = loadedDescriptors.find(({ alias }) => alias === second.key)?.src;
    if (firstObjectUrl === undefined || secondObjectUrl === undefined) {
      throw new Error('fixture Pixi descriptors were not loaded');
    }
    expect(firstObjectUrl).toMatch(/^blob:patch-map\/\d+$/u);
    expect(secondObjectUrl).toMatch(/^blob:patch-map\/\d+$/u);
    expect(firstObjectUrl).not.toBe(secondObjectUrl);
    const decodedObjectUrls = created.filter((objectUrl) => (
      objectUrl !== firstObjectUrl && objectUrl !== secondObjectUrl
    ));
    expect(decodedObjectUrls).toHaveLength(2);

    unload.mockRejectedValueOnce(new Error('fixture Pixi unload failure'));
    await expect(backend.unload(first.key)).rejects.toThrow('fixture Pixi unload failure');
    expect(new Set(revoked)).toEqual(new Set(decodedObjectUrls));
    await backend.unload(first.key);
    expect(unload).toHaveBeenCalledWith(first.key);
    expect(new Set(revoked)).toEqual(new Set([...decodedObjectUrls, firstObjectUrl]));
    await backend.unload(second.key);
    expect(new Set(revoked)).toEqual(new Set(created));
  });
});
