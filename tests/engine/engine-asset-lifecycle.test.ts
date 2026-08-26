import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import {
  PatchMapAssetRuntime,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
} from '../../src/assets';
import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceView,
} from '../../src/engine';
import { AggregateLeafLayer } from '../../src/rendering/leaf-layer';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class SequencedBackend implements PatchMapAssetBackend {
  public readonly requests: PatchMapAssetBackendRequest[] = [];
  public readonly unloads: string[] = [];
  public failuresRemaining = 0;
  public unloadFailuresRemaining = 0;
  public resource: unknown = Object.freeze({ texture: 'asset' });

  public get(): undefined {
    return undefined;
  }

  public load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Promise.reject(new Error('fixture backend failure'));
    }
    return Promise.resolve(this.resource);
  }

  public unload(key: string): Promise<void> {
    this.unloads.push(key);
    if (this.unloadFailuresRemaining > 0) {
      this.unloadFailuresRemaining -= 1;
      return Promise.reject(new Error('fixture unload failure'));
    }
    return Promise.resolve();
  }
}

class FakeSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  private width: number;
  private height: number;
  private pixelRatio: number;

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(): void {}
  public reconcile(_input: unknown) {
    return Object.freeze({
      status: 'committed' as const,
      operationCount: 0,
      denseChanged: false,
      diagnostics: Object.freeze([]),
    });
  }
  public publishFrame(): void {}
  public setView(_view: PatchMapSurfaceView): void {}
  public select(): void {}
  public hitTestScreen(): string | null { return null; }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint { return point; }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

class LeafBackedSurface extends FakeSurface {
  public readonly leaf: AggregateLeafLayer;

  public constructor(options: PatchMapSurfaceOptions) {
    super(options);
    if (!options.assetSession) throw new Error('fixture requires the engine asset session');
    this.leaf = new AggregateLeafLayer(options.assetSession, false);
  }

  public override async destroy(): Promise<boolean> {
    if (this.destroyed) return false;
    this.destroyed = true;
    try {
      await this.leaf.destroy();
      return true;
    } finally {
      this.canvasCount = 0;
    }
  }
}

class RetryingDestroySurface extends FakeSurface {
  public destroyCalls = 0;

  public constructor(
    options: PatchMapSurfaceOptions,
    public failuresRemaining: number,
  ) {
    super(options);
  }

  public override destroy(): Promise<boolean> {
    this.destroyCalls += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Promise.reject(new Error('fixture late surface destroy failure'));
    }
    return super.destroy();
  }
}

function createSurfaceHarness() {
  const options: PatchMapSurfaceOptions[] = [];
  const surfaces: FakeSurface[] = [];
  const factory: PatchMapEngineSurfaceFactory = (surfaceOptions) => {
    options.push(surfaceOptions);
    const surface = new FakeSurface(surfaceOptions);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
  return { factory, options, surfaces };
}

function createLeafSurfaceHarness() {
  const options: PatchMapSurfaceOptions[] = [];
  const surfaces: LeafBackedSurface[] = [];
  const factory: PatchMapEngineSurfaceFactory = (surfaceOptions) => {
    options.push(surfaceOptions);
    const surface = new LeafBackedSurface(surfaceOptions);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
  return { factory, options, surfaces };
}

describe('PatchMap asset lifecycle', () => {
  it('registers and acquires shared assets in new without allocating a surface', async () => {
    const backend = new SequencedBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const harness = createSurfaceHarness();
    const policyCalls: string[] = [];
    const create = (instanceId: string): PatchMap => {
      const engine = new PatchMap({
        assetRuntime: runtime,
        assetPolicy: ({ instanceId: policyInstanceId }) => {
          policyCalls.push(policyInstanceId);
        },
        surfaceFactory: harness.factory,
      });
      engine.registerAssets(instanceId);
      return engine;
    };
    const engineA = create('A');
    const engineB = create('B');

    await Promise.all([engineA.acquireAsset('device'), engineB.acquireAsset('device')]);
    expect(harness.options).toHaveLength(0);
    expect(engineA.snapshot()).toMatchObject({
      lifecycle: 'new',
      resources: { canvasCount: 0, assets: { leaseCount: 1, pendingCount: 0 } },
    });
    expect(runtime.probe('device').resource).toMatchObject({ resourceCount: 1, leaseCount: 2 });
    expect(backend.requests).toHaveLength(1);
    expect(policyCalls).toEqual(['A', 'B']);

    await engineA.destroy();
    expect(runtime.probe('device').resource).toMatchObject({ resourceCount: 1, leaseCount: 1 });
    await engineB.destroy();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
    expect(backend.unloads).toHaveLength(1);
  });

  it('preflights required assets before surface allocation and retries the same new engine', async () => {
    const backend = new SequencedBackend();
    backend.failuresRemaining = 1;
    const runtime = new PatchMapAssetRuntime(backend);
    const harness = createSurfaceHarness();
    const engine = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: harness.factory,
    });
    const ready: unknown[] = [];
    engine.on('ready', (event) => ready.push(event));
    const initialization = {
      instanceId: 'required-failure',
      width: 800,
      height: 600,
      requiredAssets: [{
        alias: 'required-fixture',
        descriptor: 'fixture://required-init-failure.png',
      }],
    } as const;

    await expect(engine.initialize(initialization)).rejects.toMatchObject({
      diagnostic: {
        code: 'ASSET_LOAD_FAILED',
        category: 'ASSET_FAILURE',
        operation: 'initialize',
        retryable: true,
      },
    });
    expect(ready).toHaveLength(0);
    expect(harness.options).toHaveLength(0);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'new',
      revisions: { lifecycleGeneration: 0, sceneRevision: 0 },
      resources: {
        canvasCount: 0,
        renderer: null,
        assets: { pendingCount: 0, leaseCount: 0 },
      },
    });
    expect(engine.assetProbe()).toMatchObject({
      runtime: { resourceCount: 0, pendingCount: 0, leaseCount: 0 },
    });

    await expect(engine.initialize(initialization)).resolves.toMatchObject({
      lifecycle: 'ready-empty',
      instanceId: 'required-failure',
      revisions: { lifecycleGeneration: 1 },
    });
    expect(ready).toHaveLength(1);
    expect(harness.options).toHaveLength(1);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'ready-empty',
      resources: { canvasCount: 1, assets: { pendingCount: 0, leaseCount: 1 } },
    });

    await engine.destroy();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
    expect(harness.surfaces[0]).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(backend.requests).toHaveLength(2);
    expect(backend.unloads).toHaveLength(1);
  });

  it('rolls initialize back to new when required asset release fails and retries cleanly', async () => {
    const backend = new SequencedBackend();
    backend.unloadFailuresRemaining = 1;
    const runtime = new PatchMapAssetRuntime(backend);
    const surfaces: FakeSurface[] = [];
    let factoryFailuresRemaining = 1;
    const factory: PatchMapEngineSurfaceFactory = (options) => {
      if (factoryFailuresRemaining > 0) {
        factoryFailuresRemaining -= 1;
        return Promise.reject(new Error('fixture surface initialization failure'));
      }
      const surface = new FakeSurface(options);
      surfaces.push(surface);
      return Promise.resolve(surface);
    };
    const engine = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: factory,
    });
    const initialization = {
      instanceId: 'rollback-release',
      width: 800,
      height: 600,
      requiredAssets: [{
        alias: 'required',
        descriptor: 'https://assets.example.test/required-rollback.png',
      }],
    } as const;

    const first = engine.initialize(initialization);
    await expect(first).rejects.toMatchObject({
      diagnostic: {
        code: 'INTERNAL_FAILURE',
        category: 'INTERNAL_FAILURE',
        operation: 'initialize',
      },
    });
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'new',
      resources: {
        canvasCount: 0,
        renderer: null,
        assets: { pendingCount: 0, leaseCount: 0 },
      },
    });
    expect(engine.assetProbe('required').runtime).toMatchObject({
      cleanupPendingCount: 1,
      resource: { state: 'cleanup-failed', cleanupRetryOwner: 'runtime' },
    });

    const second = engine.initialize(initialization);
    expect(second).not.toBe(first);
    await expect(second).resolves.toMatchObject({
      lifecycle: 'ready-empty',
      revisions: { lifecycleGeneration: 1 },
    });
    expect(engine.assetProbe()).toMatchObject({
      session: { cleanupPendingCount: 0, leaseCount: 1 },
      runtime: { cleanupPendingCount: 0 },
    });
    expect(backend.requests).toHaveLength(2);
    expect(backend.unloads).toHaveLength(2);
    expect(surfaces).toHaveLength(1);
    await engine.destroy();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, cleanupPendingCount: 0 });
    expect(backend.unloads).toHaveLength(3);
  });

  it('cancels a pending required acquisition on destroy and releases its late success', async () => {
    const backend = new SequencedBackend();
    const pending = deferred<unknown>();
    backend.resource = pending.promise;
    const runtime = new PatchMapAssetRuntime(backend);
    const harness = createSurfaceHarness();
    const engine = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: harness.factory,
    });
    const initialization = engine.initialize({
      instanceId: 'destroy-pending',
      width: 800,
      height: 600,
      requiredAssets: [{
        alias: 'required-fixture',
        descriptor: 'fixture://required-init-pending.png',
      }],
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'initializing',
      resources: { canvasCount: 0, assets: { pendingCount: 1, leaseCount: 0 } },
    });

    const destroying = engine.destroy();
    pending.resolve(Object.freeze({ texture: 'late-required' }));
    await expect(initialization).rejects.toMatchObject({
      diagnostic: { code: 'CANCELLED', category: 'CANCELLED', operation: 'initialize' },
    });
    await expect(destroying).resolves.toBe(true);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 0, assets: null },
    });
    expect(harness.options).toHaveLength(0);
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, pendingCount: 0, leaseCount: 0 });
    expect(backend.requests).toHaveLength(1);
    expect(backend.unloads).toHaveLength(1);
  });

  it('retries a transient late-surface teardown without changing the initialize DESTROYED cause', async () => {
    const backend = new SequencedBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const pendingSurface = deferred<PatchMapEngineSurface>();
    let receivedOptions: PatchMapSurfaceOptions | null = null;
    const engine = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: (options) => {
        receivedOptions = options;
        return pendingSurface.promise;
      },
    });
    const initializing = engine.initialize({
      instanceId: 'late-transient',
      width: 800,
      height: 600,
    });
    const destroying = engine.destroy();
    if (!receivedOptions) throw new Error('missing late surface options');
    const surface = new RetryingDestroySurface(receivedOptions, 1);
    pendingSurface.resolve(surface);

    await expect(initializing).rejects.toMatchObject({
      diagnostic: { code: 'DESTROYED', category: 'DESTROYED', operation: 'initialize' },
    });
    await expect(destroying).resolves.toBe(true);
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0, destroyCalls: 2 });
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 0, renderer: null, assets: null },
    });
  });

  it('retains a persistently failing late surface until a later destroy retry releases it', async () => {
    const backend = new SequencedBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const pendingSurface = deferred<PatchMapEngineSurface>();
    let receivedOptions: PatchMapSurfaceOptions | null = null;
    const engine = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: (options) => {
        receivedOptions = options;
        return pendingSurface.promise;
      },
    });
    const initializing = engine.initialize({
      instanceId: 'late-persistent',
      width: 800,
      height: 600,
    });
    const destroying = engine.destroy();
    if (!receivedOptions) throw new Error('missing late surface options');
    const surface = new RetryingDestroySurface(receivedOptions, 2);
    pendingSurface.resolve(surface);

    await expect(initializing).rejects.toMatchObject({
      diagnostic: { code: 'DESTROYED', category: 'DESTROYED', operation: 'initialize' },
    });
    await expect(destroying).rejects.toMatchObject({
      diagnostic: { code: 'INTERNAL_FAILURE', operation: 'destroy' },
    });
    expect(surface).toMatchObject({ destroyed: false, canvasCount: 1, destroyCalls: 2 });
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 1, renderer: null, assets: null },
    });

    await expect(engine.destroy()).resolves.toBe(false);
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0, destroyCalls: 3 });
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 0, renderer: null, assets: null },
    });
  });

  it('binds registration identity and rejects a later initialize mismatch as CONFLICT', async () => {
    const backend = new SequencedBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const harness = createSurfaceHarness();
    const engine = new PatchMap({ assetRuntime: runtime, surfaceFactory: harness.factory });
    engine.registerAssets('A');

    await expect(engine.initialize({ instanceId: 'B', width: 800, height: 600 })).rejects.toMatchObject({
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT', operation: 'initialize' },
    });
    expect(engine.snapshot()).toMatchObject({ lifecycle: 'new', resources: { canvasCount: 0 } });
    expect(harness.options).toHaveLength(0);
    await expect(engine.initialize({ instanceId: 'A', width: 800, height: 600 })).resolves.toMatchObject({
      instanceId: 'A',
      lifecycle: 'ready-empty',
    });
    await expect(engine.initialize({ instanceId: 'B', width: 800, height: 600 })).rejects.toMatchObject({
      diagnostic: { code: 'CONFLICT', category: 'CONFLICT', operation: 'initialize' },
    });
    expect(harness.options).toHaveLength(1);
    await engine.destroy();
  });

  it('fails closed for an external required source when no explicit policy is supplied', async () => {
    const backend = new SequencedBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const harness = createSurfaceHarness();
    const engine = new PatchMap({ assetRuntime: runtime, surfaceFactory: harness.factory });

    await expect(engine.initialize({
      instanceId: 'fail-closed',
      width: 800,
      height: 600,
      requiredAssets: [{
        alias: 'external',
        descriptor: 'https://assets.example.test/external.png',
      }],
    })).rejects.toMatchObject({
      diagnostic: { code: 'ASSET_POLICY_REJECTED', category: 'ASSET_FAILURE' },
    });
    expect(backend.requests).toHaveLength(0);
    expect(harness.options).toHaveLength(0);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'new',
      resources: { canvasCount: 0, assets: { pendingCount: 0, leaseCount: 0 } },
    });
    await engine.destroy();
  });

  it('reaches destroyed with an INTERNAL_FAILURE diagnostic while retaining failed unload ownership', async () => {
    const backend = new SequencedBackend();
    backend.unloadFailuresRemaining = 2;
    const runtime = new PatchMapAssetRuntime(backend);
    const engine = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: createSurfaceHarness().factory,
    });
    engine.registerAssets('unload-failure', [{
      alias: 'owned',
      descriptor: 'https://assets.example.test/owned.png',
    }]);
    await engine.acquireAsset('owned');

    await expect(engine.destroy()).rejects.toMatchObject({
      diagnostic: {
        code: 'INTERNAL_FAILURE',
        category: 'INTERNAL_FAILURE',
        operation: 'destroy',
        retryable: false,
      },
    });
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: {
        canvasCount: 0,
        assets: { destroyed: true, pendingCount: 0, leaseCount: 0 },
      },
    });
    expect(engine.assetProbe('owned').runtime.resource).toMatchObject({
      resourceCount: 1,
      leaseCount: 0,
      state: 'cleanup-failed',
      ownership: 'patch-map',
      cleanupPending: true,
      cleanupRetryOwner: 'runtime',
    });
    expect(engine.assetProbe()).toMatchObject({ runtime: { cleanupPendingCount: 1 } });
    await expect(engine.destroy()).resolves.toBe(false);

    await runtime.retryCleanup();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, leaseCount: 0 });
    expect(backend.unloads).toHaveLength(3);
  });

  it('does not transfer another session cleanup failure to an asset-empty engine', async () => {
    const backend = new SequencedBackend();
    backend.unloadFailuresRemaining = 3;
    const runtime = new PatchMapAssetRuntime(backend);
    const owner = runtime.createSession({ instanceId: 'owner', policy: () => undefined });
    owner.registerAssets([{
      alias: 'owner-only',
      descriptor: 'https://assets.example.test/owner-only.png',
    }]);
    await owner.acquire('owner-only');
    await expect(owner.destroy()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });
    expect(backend.unloads).toHaveLength(2);

    const harness = createSurfaceHarness();
    const unrelated = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: harness.factory,
    });
    await unrelated.initialize({ instanceId: 'unrelated', width: 800, height: 600 });
    await expect(unrelated.destroy()).resolves.toBe(true);
    expect(unrelated.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 0, assets: null },
    });
    expect(backend.unloads).toHaveLength(2);
    expect(runtime.probe()).toMatchObject({ resourceCount: 1, cleanupPendingCount: 1 });

    await expect(runtime.retryCleanup()).rejects.toMatchObject({ code: 'INTERNAL_FAILURE' });
    await runtime.retryCleanup();
    expect(backend.unloads).toHaveLength(4);
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, cleanupPendingCount: 0 });
  });

  it('propagates a leaf unload failure through surface teardown without retaining its canvas', async () => {
    const backend = new SequencedBackend();
    backend.resource = Texture.WHITE;
    const runtime = new PatchMapAssetRuntime(backend);
    const harness = createLeafSurfaceHarness();
    const engine = new PatchMap({
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      surfaceFactory: harness.factory,
    });
    const descriptor = 'https://assets.example.test/leaf-chain.png';
    engine.registerAssets('leaf-chain', [{ alias: 'leaf-chain', descriptor }]);
    await engine.initialize({ instanceId: 'leaf-chain', width: 800, height: 600 });
    const surface = harness.surfaces[0];
    if (!surface) throw new Error('missing leaf-backed surface');
    await surface.leaf.loadAsset('leaf-chain', descriptor);
    expect(surface.leaf.debugSnapshot()).toMatchObject({ loadedAssetCount: 1 });
    backend.unloadFailuresRemaining = 2;

    await expect(engine.destroy()).rejects.toMatchObject({
      diagnostic: {
        code: 'INTERNAL_FAILURE',
        category: 'INTERNAL_FAILURE',
        operation: 'destroy',
      },
    });
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(surface.leaf.container.destroyed).toBe(true);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 0, assets: { destroyed: true, leaseCount: 0 } },
    });
    expect(engine.assetProbe('leaf-chain').runtime).toMatchObject({
      cleanupPendingCount: 1,
      resource: {
        state: 'cleanup-failed',
        cleanupPending: true,
        cleanupRetryOwner: 'runtime',
      },
    });

    await runtime.retryCleanup();
    expect(runtime.probe()).toMatchObject({ resourceCount: 0, cleanupPendingCount: 0 });
    expect(backend.unloads).toHaveLength(3);
  });
});
