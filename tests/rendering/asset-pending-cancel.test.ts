import { describe, expect, it, vi } from 'vitest';

import {
  PatchMapAssetRuntime,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
} from '../../src/assets';

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}

class PendingAssetBackend implements PatchMapAssetBackend {
  public readonly pending = deferred<unknown>();
  public readonly loadRequests: PatchMapAssetBackendRequest[] = [];
  public readonly unloadKeys: string[] = [];
  public unloadFailuresRemaining = 0;

  public get(): unknown {
    return undefined;
  }

  public load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    this.loadRequests.push(request);
    return this.pending.promise;
  }

  public unload(key: string): Promise<void> {
    this.unloadKeys.push(key);
    if (this.unloadFailuresRemaining > 0) {
      this.unloadFailuresRemaining -= 1;
      return Promise.reject(new Error('fixture unload failure'));
    }
    return Promise.resolve();
  }
}

describe('PatchMap pending asset cancellation', () => {
  it('publishes decoder identities once without replacing the coordinator cache identity', async () => {
    const resource = Object.freeze({ texture: 'fixture-image' });
    const describeResource = vi.fn((request: PatchMapAssetBackendRequest, value: unknown) => {
      expect(request.descriptor).toEqual({ src: 'https://assets.example.test/image.png' });
      expect(value).toBe(resource);
      return Object.freeze({
        normalizedResourceIdentity: 'fixture-url-image-64x32@1',
        cacheIdentity: 'url:https://assets.example.test/image.png',
      });
    });
    const unloadKeys: string[] = [];
    const backend: PatchMapAssetBackend = {
      get: () => undefined,
      load: () => Promise.resolve(resource),
      describe: describeResource,
      unload: (key) => {
        unloadKeys.push(key);
        return Promise.resolve();
      },
    };
    const runtime = new PatchMapAssetRuntime(backend);
    const first = runtime.createSession({ instanceId: 'first', policy: () => undefined });
    const second = runtime.createSession({ instanceId: 'second', policy: () => undefined });
    const registration = [{
      alias: 'image',
      descriptor: 'https://assets.example.test/image.png',
    }] as const;
    first.registerAssets(registration);
    second.registerAssets(registration);

    const [firstAcquisition, secondAcquisition] = await Promise.all([
      first.acquire('image'),
      second.acquire('image'),
    ]);

    expect(firstAcquisition.normalizedResourceIdentity).toBe('fixture-url-image-64x32@1');
    expect(secondAcquisition.normalizedResourceIdentity).toBe('fixture-url-image-64x32@1');
    expect(firstAcquisition.describedCacheIdentity).toBe(
      'url:https://assets.example.test/image.png',
    );
    expect(secondAcquisition.describedCacheIdentity).toBe(
      'url:https://assets.example.test/image.png',
    );
    expect(firstAcquisition.cacheIdentity).toBe(secondAcquisition.cacheIdentity);
    expect(firstAcquisition.cacheIdentity).not.toBe(firstAcquisition.describedCacheIdentity);
    expect(describeResource).toHaveBeenCalledTimes(1);

    await first.destroy();
    expect(unloadKeys).toHaveLength(0);
    await second.destroy();
    expect(unloadKeys).toHaveLength(1);
  });

  it('falls back to the coordinator cache identity when the backend has no decoder metadata', async () => {
    const backend: PatchMapAssetBackend = {
      get: () => undefined,
      load: () => Promise.resolve(Object.freeze({ texture: 'fallback' })),
      unload: () => Promise.resolve(),
    };
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'fallback', policy: () => undefined });

    const acquisition = await session.acquireSource('https://assets.example.test/fallback.png');

    expect(acquisition.normalizedResourceIdentity).toBe(acquisition.cacheIdentity);
    expect(acquisition).not.toHaveProperty('describedCacheIdentity');
    await session.destroy();
  });

  it('does not await an abandoned load and collects its late success exactly once', async () => {
    const backend = new PendingAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'late-success', policy: () => undefined });
    session.registerAssets([{
      alias: 'late-success',
      descriptor: 'https://assets.example.test/late-success.png',
    }]);
    const acquisition = session.acquire('late-success');
    const cancelled = acquisition.catch((error: unknown) => error);
    await vi.waitFor(() => expect(backend.loadRequests).toHaveLength(1));

    await expect(session.destroy()).resolves.toBeUndefined();
    expect(runtime.probe('late-success').resource).toMatchObject({
      resourceCount: 1,
      pendingCount: 0,
      leaseCount: 0,
      state: 'pending',
    });
    expect(backend.unloadKeys).toHaveLength(0);

    backend.pending.resolve(Object.freeze({ texture: 'late-success' }));
    await expect(cancelled).resolves.toMatchObject({ code: 'CANCELLED', category: 'CANCELLED' });
    await vi.waitFor(() => {
      expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
      expect(backend.unloadKeys).toHaveLength(1);
    });
    await session.destroy();
    expect(backend.unloadKeys).toHaveLength(1);
  });

  it('observes an abandoned late failure while removing the failed coordinator entry', async () => {
    const backend = new PendingAssetBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'late-failure', policy: () => undefined });
    session.registerAssets([{
      alias: 'late-failure',
      descriptor: 'https://assets.example.test/late-failure.png',
    }]);
    const unhandledReasons: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandledReasons.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      void session.acquire('late-failure');
      await vi.waitFor(() => expect(backend.loadRequests).toHaveLength(1));
      await expect(session.destroy()).resolves.toBeUndefined();

      backend.pending.reject(new Error('fixture late backend failure'));
      await vi.waitFor(() => {
        expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(unhandledReasons).toEqual([]);
      expect(backend.unloadKeys).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('quarantines a failed orphan cleanup for explicit runtime retry', async () => {
    const backend = new PendingAssetBackend();
    backend.unloadFailuresRemaining = 1;
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'late-cleanup', policy: () => undefined });
    session.registerAssets([{
      alias: 'late-cleanup',
      descriptor: 'https://assets.example.test/late-cleanup.png',
    }]);
    const acquisition = session.acquire('late-cleanup');
    const cancelled = acquisition.catch((error: unknown) => error);
    await vi.waitFor(() => expect(backend.loadRequests).toHaveLength(1));
    await session.destroy();

    backend.pending.resolve(Object.freeze({ texture: 'late-cleanup' }));
    await expect(cancelled).resolves.toMatchObject({ code: 'CANCELLED' });
    await vi.waitFor(() => {
      expect(runtime.probe('late-cleanup').resource).toMatchObject({
        resourceCount: 1,
        pendingCount: 0,
        leaseCount: 0,
        state: 'cleanup-failed',
        cleanupPending: true,
        cleanupRetryOwner: 'runtime',
      });
      expect(backend.unloadKeys).toHaveLength(1);
    });

    await runtime.retryCleanup();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, cleanupPendingCount: 0 });
    expect(backend.unloadKeys).toHaveLength(2);
  });
});
