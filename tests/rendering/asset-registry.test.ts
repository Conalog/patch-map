import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Assets, Cache } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import {
  PATCH_MAP_BUILTIN_ASSETS,
  PatchMapAssetError,
  PatchMapAssetRuntime,
  createPatchMapPixiAssetBackend,
  normalizePatchMapAssetDescriptor,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapAssetPolicyContext,
} from '../../src/assets';
import {
  BUILTIN_IMAGE_SVGS,
  builtinImageSvg,
} from '../../src/assets/builtin-image-glyphs';
import {
  BUILTIN_FIRA_CODE_FACES,
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  it('binds every built-in Fira Code weight to its exact package-owned face', () => {
    expect(BUILTIN_FIRA_CODE_FACES.map(({ fontWeight }) => fontWeight)).toEqual([
      300, 400, 500, 600, 700,
    ]);
    expect(new Set(BUILTIN_FIRA_CODE_FACES.map(({ descriptorSource }) => descriptorSource)).size)
      .toBe(BUILTIN_FIRA_CODE_FACES.length);

    for (const [index, face] of BUILTIN_FIRA_CODE_FACES.entries()) {
      const bytes = readFileSync(new URL(
        `../../src/resources/fonts/${face.fileName}`,
        import.meta.url,
      ));
      const registration = PATCH_MAP_BUILTIN_FONT_ASSETS[index];
      expect(bytes.byteLength).toBe(face.byteLength);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(face.sha256);
      expect(face.descriptorSource).toContain(`${face.fileName}?sha256=${face.sha256}`);
      expect(registration).toMatchObject({
        alias: `FiraCode-${face.fontWeight}`,
        kind: 'font',
        fontWeight: face.fontWeight,
        descriptor: {
          src: face.descriptorSource,
          parser: 'web-font',
          data: { family: 'FiraCode', weights: [String(face.fontWeight)] },
        },
      });
    }
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

  it('trusts only the exact package catalog identity and uses closed invalid-input codes', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'device' });
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'catalog-identity' });

    session.registerAssets([{
      alias: 'spoofed-device',
      descriptor: 'patch-map-builtin://images/device.svg',
    }]);
    await expect(session.acquire('spoofed-device')).rejects.toMatchObject({
      code: 'ASSET_POLICY_REJECTED',
      category: 'ASSET_FAILURE',
    });
    expect(backend.loadRequests).toHaveLength(0);

    session.registerAssets();
    await expect(session.acquire('device')).resolves.toMatchObject({
      resource: { texture: 'device' },
    });
    expect(backend.loadRequests[0]).toMatchObject({ packageOwned: true });

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
    const host = runtime.createSession({ instanceId: 'host', policy: () => undefined });
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
    const policyDescriptors: unknown[] = [];
    const session = runtime.createSession({
      instanceId: 'immutable',
      policy: ({ descriptor }) => {
        policyDescriptors.push(descriptor);
      },
    });
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
    expect(policyDescriptors).toEqual([{
      src: 'https://assets.example.test/icon.svg',
      data: { nested: { scaleMode: 'linear' }, resolution: 2 },
      format: 'svg',
      parser: 'svg',
    }]);
    expect(Object.isFrozen(policyDescriptors[0])).toBe(true);
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

  it('deduplicates pending work, revalidates each instance, and unloads after the final lease', async () => {
    const backend = new FakeAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const policyCalls: PatchMapAssetPolicyContext[] = [];
    const policy = (context: PatchMapAssetPolicyContext): void => {
      policyCalls.push(context);
    };
    const sessionA = runtime.createSession({ instanceId: 'A', policy });
    const sessionB = runtime.createSession({ instanceId: 'B', policy });
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
    expect(policyCalls.map(({ instanceId }) => instanceId)).toEqual(['A', 'B']);
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
    const sessionA = runtimeA.createSession({ instanceId: 'runtime-A', policy: () => undefined });
    const sessionB = runtimeB.createSession({ instanceId: 'runtime-B', policy: () => undefined });
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

  it('does not let a denied instance borrow an already resolved shared resource', async () => {
    const backend = new FakeAssetBackend();
    backend.immediate = Object.freeze({ texture: 'device' });
    const runtime = new PatchMapAssetRuntime(backend);
    const allowed = runtime.createSession({ instanceId: 'allowed', policy: () => undefined });
    const denied = runtime.createSession({
      instanceId: 'denied',
      policy: () => {
        throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', true);
      },
    });
    const registration = [{ alias: 'device', descriptor: 'https://assets.example.test/device.png' }];
    allowed.registerAssets(registration);
    denied.registerAssets(registration);
    await allowed.acquire('device');

    await expect(denied.acquire('device')).rejects.toMatchObject({
      code: 'ASSET_POLICY_REJECTED',
    });
    expect(backend.loadRequests).toHaveLength(1);
    expect(runtime.probe('device').resource).toMatchObject({ leaseCount: 1, pendingCount: 0 });
    await allowed.destroy();
  });

  it('releases a late core-owned success after its only pending session is destroyed', async () => {
    const backend = new FakeAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'late', policy: () => undefined });
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
    const session = runtime.createSession({ instanceId: 'transient', policy: () => undefined });
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
    const session = runtime.createSession({ instanceId: 'persistent', policy: () => undefined });
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
    const owner = runtime.createSession({ instanceId: 'owner', policy: () => undefined });
    owner.registerAssets([{
      alias: 'owned-by-a',
      descriptor: 'https://assets.example.test/owned-by-a.png',
    }]);
    await owner.acquire('owned-by-a');
    await expect(owner.destroy()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });
    expect(backend.unloadKeys).toHaveLength(2);

    const unrelated = runtime.createSession({ instanceId: 'unrelated', policy: () => undefined });
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
    const first = runtime.createSession({ instanceId: 'first', policy: () => undefined });
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
    const second = runtime.createSession({ instanceId: 'second', policy: () => undefined });
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
    const first = runtime.createSession({ instanceId: 'first', policy: () => undefined });
    first.registerAssets(registration);
    await first.acquire('quarantined-race');
    await expect(first.destroy()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });

    const cleanup = deferred<void>();
    backend.unloadBarrier = cleanup.promise;
    const second = runtime.createSession({ instanceId: 'second', policy: () => undefined });
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
    const first = runtime.createSession({ instanceId: 'first', policy: () => undefined });
    const second = runtime.createSession({ instanceId: 'second', policy: () => undefined });
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
    const session = runtime.createSession({ instanceId: 'external', policy: () => undefined });
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

  it('uses public Pixi cache keys for exact external borrowing and maps package builtins', async () => {
    const fetchedSources: string[] = [];
    let objectUrlSequence = 0;
    const backend = createPatchMapPixiAssetBackend({
      fetchAsset: (src) => {
        fetchedSources.push(src);
        return Promise.resolve(new Blob(['fixture'], {
          type: src.includes('FiraCode') ? 'font/woff2' : 'image/svg+xml',
        }));
      },
      createObjectURL: () => `blob:patch-map/builtin-${++objectUrlSequence}`,
      revokeObjectURL: () => undefined,
    });
    const pixiAssets = Assets as unknown as {
      load(descriptor: unknown): Promise<unknown>;
      unload(id: string): Promise<void>;
    };
    const pixiCache = Cache as unknown as {
      has(id: string): boolean;
      get(id: string): unknown;
    };
    const external = Object.freeze({ texture: 'external' });
    const has = vi.spyOn(pixiCache, 'has').mockReturnValueOnce(true);
    const get = vi.spyOn(pixiCache, 'get').mockReturnValueOnce(external);
    const externalRequest: PatchMapAssetBackendRequest = Object.freeze({
      key: 'patch-map-asset:external',
      descriptor: Object.freeze({ src: 'https://assets.example.test/external.png' }),
      cacheIdentity: 'descriptor:external',
      packageOwned: false,
    });

    expect(backend.get(externalRequest)).toBe(external);
    expect(has.mock.calls.map(([key]) => key)).toEqual([externalRequest.descriptor.src]);
    expect(get.mock.calls.map(([key]) => key)).toEqual([externalRequest.descriptor.src]);

    has.mockReset();
    get.mockReset();
    const optionedRequest: PatchMapAssetBackendRequest = Object.freeze({
      ...externalRequest,
      descriptor: Object.freeze({
        src: externalRequest.descriptor.src,
        data: Object.freeze({ resolution: 2 }),
      }),
    });
    expect(backend.get(optionedRequest)).toBeUndefined();
    expect(has).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();

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
        data: { family: 'FiraCode', weights: [String(registration.fontWeight)] },
      });
      expect(fetchedSources[index + 1]).toMatch(/^file:.*FiraCode-[A-Za-z]+\.woff2$/u);
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
      src: 'blob:patch-map/builtin-7',
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
    let objectUrlSequence = 0;
    const backend = createPatchMapPixiAssetBackend({
      fetchAsset: () => Promise.resolve(new Blob(['fixture'], { type: 'image/svg+xml' })),
      createObjectURL: () => `blob:patch-map-builtin/${++objectUrlSequence}`,
      revokeObjectURL: () => undefined,
    });
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

  it('does not borrow an unverified external Pixi cache entry under ingestion policy', () => {
    const pixiAssets = Assets as unknown as { get(id: string): unknown };
    const get = vi.spyOn(pixiAssets, 'get').mockReturnValue(
      Object.freeze({ texture: 'unverified-external' }),
    );
    const backend = createPatchMapPixiAssetBackend({
      ingestionPolicy: {
        protocols: ['https:'],
        origins: ['https://assets.example.test'],
        redirects: 'revalidate',
        credentials: 'omit',
        mediaTypes: ['image/png'],
        maxEncodedBytes: 1024,
        maxDecodedWidth: 64,
        maxDecodedHeight: 64,
      },
    });

    expect(backend.get(Object.freeze({
      key: 'patch-map-asset:policy-cache',
      descriptor: Object.freeze({ src: 'https://assets.example.test/external.png' }),
      cacheIdentity: 'descriptor:policy-cache',
      packageOwned: false,
    }))).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('fails closed when image decoded-size inspection is absent under ingestion policy', async () => {
    const pixiAssets = Assets as unknown as { load(descriptor: unknown): Promise<unknown> };
    const load = vi.spyOn(pixiAssets, 'load').mockResolvedValue(Object.freeze({ texture: 'unsafe' }));
    const createObjectURL = vi.fn(() => 'blob:unsafe');
    const backend = createPatchMapPixiAssetBackend({
      ingestionPolicy: {
        protocols: ['https:'],
        origins: ['https://assets.example.test'],
        redirects: 'revalidate',
        credentials: 'omit',
        mediaTypes: ['image/png'],
        maxEncodedBytes: 1024,
        maxDecodedWidth: 64,
        maxDecodedHeight: 64,
      },
      fetchAsset: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
      createObjectURL,
    });

    await expect(backend.load(Object.freeze({
      key: 'patch-map-asset:missing-inspector',
      descriptor: Object.freeze({ src: 'https://assets.example.test/external.png' }),
      cacheIdentity: 'descriptor:missing-inspector',
      packageOwned: false,
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
    const created: string[] = [];
    const revoked: string[] = [];
    const backend = createPatchMapPixiAssetBackend({
      fetchAsset: (src) => {
        fetched.push(src);
        return Promise.resolve(new Blob(['fixture'], { type: 'image/svg+xml' }));
      },
      createObjectURL: () => {
        const url = `blob:patch-map/${created.length + 1}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url) => revoked.push(url),
    });
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
    expect(created).toEqual(['blob:patch-map/1', 'blob:patch-map/2']);
    expect(load.mock.calls.map(([descriptor]) => descriptor)).toMatchObject([
      { alias: first.key, src: 'blob:patch-map/1', parser: 'svg', data: { resolution: 1 } },
      { alias: second.key, src: 'blob:patch-map/2', parser: 'svg', data: { resolution: 2 } },
    ]);

    unload.mockRejectedValueOnce(new Error('fixture Pixi unload failure'));
    await expect(backend.unload(first.key)).rejects.toThrow('fixture Pixi unload failure');
    expect(revoked).toEqual([]);
    await backend.unload(first.key);
    expect(unload).toHaveBeenCalledWith(first.key);
    expect(revoked).toEqual(['blob:patch-map/1']);
    await backend.unload(second.key);
    expect(revoked).toEqual(['blob:patch-map/1', 'blob:patch-map/2']);
  });
});
