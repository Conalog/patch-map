import catalogProfiles from '../../contracts/patch-map/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';
import type { FrameDriver } from '../../src/patch-map/scheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createSurfaceFactory() {
  const surfaces: FakeSurface[] = [];
  const options: PatchMapSurfaceOptions[] = [];
  const factory: PatchMapEngineSurfaceFactory = (nextOptions) => {
    options.push(nextOptions);
    const surface = new FakeSurface(nextOptions);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
  return { factory, options, surfaces };
}

function createFrameDriver(): FrameDriver & { pending(): number } {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    now: () => 10,
    request: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      callbacks.delete(handle);
    },
    pending: () => callbacks.size,
  };
}

class FakeSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public prepareCount = 0;
  public frameCount = 0;
  public debugSnapshotCount = 0;
  public activeAnimationCountValue = 0;
  public frameWorkloadSizeValue = 0;
  public lastInput: unknown = null;
  public activeGestureCount = 0;
  public renderCommandCount = 0;
  public visiblePrimitiveCount = 0;
  public selectionIds: readonly string[] = Object.freeze([]);
  public view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private width: number;
  private height: number;
  private pixelRatio: number;

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'> = {
    width: 800,
    height: 600,
    pixelRatio: 1,
  }) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loadCount += 1;
    this.lastInput = input;
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(input: unknown) {
    this.lastInput = input;
    return Object.freeze({
      status: 'committed' as const,
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public prepare(): Promise<Readonly<{ storeSyncMs: number; gpuPrepareMs: number }>> {
    this.prepareCount += 1;
    return Promise.resolve(Object.freeze({
      storeSyncMs: 1.25,
      gpuPrepareMs: 2.5,
    }));
  }

  public publishFrame(): void {
    this.frameCount += 1;
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.view = Object.freeze({ ...view });
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public frameLoopActiveAnimations(): number {
    return this.activeAnimationCountValue;
  }

  public frameLoopWorkloadSize(): number {
    return this.frameWorkloadSizeValue;
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    this.debugSnapshotCount += 1;
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as [number, number]),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as [number, number]),
      selectionIds: this.selectionIds,
      activeAnimationCount: this.activeAnimationCountValue,
      activeGestureCount: this.activeGestureCount,
      renderCommandCount: this.renderCommandCount,
      visiblePrimitiveCount: this.visiblePrimitiveCount,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

class RetryingFakeSurface extends FakeSurface {
  private remainingFailures: number;

  public constructor(destroyFailures: number) {
    super();
    this.remainingFailures = destroyFailures;
  }

  public override destroy(): Promise<boolean> {
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      return Promise.reject(new Error('surface destroy failed'));
    }
    return super.destroy();
  }
}

describe('PatchMap lifecycle authority', () => {
  it('publishes initialization ownership before a surface factory can reenter', async () => {
    const surfaces: FakeSurface[] = [];
    let reentrant: Promise<unknown> | null = null;
    const owner: { engine: PatchMap | null } = { engine: null };
    const engine = new PatchMap({
      surfaceFactory: (options) => {
        reentrant = owner.engine!.initialize({
          instanceId: 'reentrant-initialize',
          width: 800,
          height: 600,
        });
        const surface = new FakeSurface(options);
        surfaces.push(surface);
        return Promise.resolve(surface);
      },
    });
    owner.engine = engine;

    const initializing = engine.initialize({
      instanceId: 'reentrant-initialize',
      width: 800,
      height: 600,
    });
    await expect(initializing).resolves.toMatchObject({ lifecycle: 'ready-empty' });
    expect(reentrant).toBe(initializing);
    expect(surfaces).toHaveLength(1);

    await engine.destroy();
    expect(surfaces[0]).toMatchObject({ destroyed: true, canvasCount: 0 });
  });

  it('does not deadlock when a surface factory awaits reentrant destroy', async () => {
    const surface = new FakeSurface();
    const owner: { engine: PatchMap | null } = { engine: null };
    const engine = new PatchMap({
      surfaceFactory: async () => {
        await owner.engine!.destroy();
        return surface;
      },
    });
    owner.engine = engine;

    await expect(engine.initialize({
      instanceId: 'reentrant-destroy',
      width: 800,
      height: 600,
    })).rejects.toMatchObject({ diagnostic: { code: 'DESTROYED' } });
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 0 },
    });
  });

  it('reports failed bootstrap cleanup and retains the surface for destroy retry', async () => {
    const surface = new RetryingFakeSurface(2);
    const owner: { engine: PatchMap | null } = { engine: null };
    const engine = new PatchMap({
      surfaceFactory: async () => {
        await owner.engine!.destroy();
        return surface;
      },
    });
    owner.engine = engine;

    await expect(engine.initialize({
      instanceId: 'reentrant-destroy-cleanup-failure',
      width: 800,
      height: 600,
    })).rejects.toMatchObject({
      diagnostic: { code: 'INTERNAL_FAILURE', operation: 'initialize' },
    });
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      resources: { canvasCount: 1 },
    });

    await expect(engine.destroy()).resolves.toBe(false);
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0 });
  });

  it('reads frame-loop facts without allocating a surface debug snapshot', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'frame-facts', width: 800, height: 600 });
    const surface = surfaces[0]!;
    surface.activeAnimationCountValue = 5_000;
    surface.frameWorkloadSizeValue = 12_345;
    const debugSnapshotCount = surface.debugSnapshotCount;

    expect(engine.activeAnimations).toBe(5_000);
    expect(engine.frameWorkloadSize).toBe(12_345);
    expect(surface.debugSnapshotCount).toBe(debugSnapshotCount);

    await engine.destroy();
  });

  it('owns and cancels its public manual frame loop before surface teardown', async () => {
    const { factory } = createSurfaceFactory();
    const driver = createFrameDriver();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'managed-frames', width: 800, height: 600 });

    const loop = engine.createFrameLoop({ driver });
    engine.loadDataset(catalogProfiles.datasets['interactive-scene']);
    expect(driver.pending()).toBe(1);
    expect(() => engine.createFrameLoop({ driver })).toThrow();

    engine.setDocumentVisibility({ state: 'hidden', timeMs: 10 });
    expect(driver.pending()).toBe(0);
    engine.setDocumentVisibility({ state: 'visible', timeMs: 20 });
    expect(driver.pending()).toBe(1);

    await engine.destroy();
    expect(driver.pending()).toBe(0);
    expect(loop.debugSnapshot().destroyed).toBe(true);
  });

  it('bridges asynchronous surface invalidation into the product frame loop', async () => {
    const { factory, options } = createSurfaceFactory();
    const driver = createFrameDriver();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'async-frame-wake', width: 800, height: 600 });
    engine.createFrameLoop({ driver });

    expect(driver.pending()).toBe(0);
    options[0]?.requestFrame?.();
    expect(driver.pending()).toBe(1);

    await engine.destroy();
    expect(driver.pending()).toBe(0);
    options[0]?.requestFrame?.();
    expect(driver.pending()).toBe(0);
  });

  it('destroys the managed frame loop when a surface enters terminal publication state', async () => {
    const { factory, options } = createSurfaceFactory();
    const driver = createFrameDriver();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'terminal-frame-owner', width: 800, height: 600 });
    const loop = engine.createFrameLoop({ driver });
    loop.request(100);
    expect(driver.pending()).toBe(1);

    const terminal = new Error('surface publication is not coherent');
    options[0]?.onTerminalFailure?.(terminal);

    expect(driver.pending()).toBe(0);
    expect(loop.isDestroyed).toBe(true);
    expect(engine.activeAnimations).toBe(0);
    expect(() => engine.createFrameLoop({ driver })).toThrow(terminal);
    expect(() => engine.publishFrame(20)).toThrow(terminal);
    options[0]?.requestFrame?.();
    expect(driver.pending()).toBe(0);

    await engine.destroy();
  });

  it('starts a late-owned frame loop paused while the document is hidden', async () => {
    const { factory } = createSurfaceFactory();
    const driver = createFrameDriver();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'hidden-frames', width: 800, height: 600 });
    engine.setDocumentVisibility({ state: 'hidden', timeMs: 10 });

    const loop = engine.createFrameLoop({ driver });
    loop.request(100);
    expect(loop.isPaused).toBe(true);
    expect(driver.pending()).toBe(0);

    engine.setDocumentVisibility({ state: 'visible', timeMs: 20 });
    expect(loop.isPaused).toBe(false);
    expect(driver.pending()).toBe(1);

    await engine.destroy();
  });

  it('deduplicates repeated initialization and publishes one ready event', async () => {
    const { factory, options, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    const ready: unknown[] = [];
    engine.on('ready', (event) => ready.push(event));

    const first = engine.initialize({
      instanceId: 'map-1',
      width: 800,
      height: 600,
      pixelRatio: 2,
      background: '#FAFAFA',
      zoomLimits: [0.5, 30],
    });
    const second = engine.initialize({
      instanceId: 'map-1',
      width: 800,
      height: 600,
      pixelRatio: 2,
      background: '#FAFAFA',
      zoomLimits: [0.5, 30],
    });

    expect(await second).toEqual(await first);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ antialias: true, background: 0xfafafaff, pixelRatio: 2 });
    expect(surfaces).toHaveLength(1);
    expect(ready).toHaveLength(1);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'ready-empty',
      revisions: { lifecycleGeneration: 1, sceneRevision: 0, viewRevision: 0, interactionRevision: 0 },
      zoomLimits: [0.5, 30],
      facilities: ['renderer', 'viewport', 'world', 'state', 'history', 'resize', 'assets'],
      resources: {
        canvasCount: 1,
        renderer: { resolution: 2, antialias: true, background: '#fafafaff', backend: 'webgl' },
        rendering: { commandCount: 0, visiblePrimitiveCount: 0 },
        subscriptions: { active: 1, duplicates: 0 },
      },
    });
    expect(engine.semanticProbe().interaction.activeGestureCount).toBe(0);
  });

  it('publishes only the newest authoritative async dataset and retains it after a failed later load', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    const drawComplete: unknown[] = [];
    engine.on('drawComplete', (event) => drawComplete.push(event));
    await engine.initialize({ instanceId: 'map-1', width: 800, height: 600 });
    const first = deferred<unknown>();
    const second = deferred<unknown>();

    const drawA = engine.submitDataset({ requestId: 'draw-a', datasetRef: 'all-kinds-scene', input: first.promise });
    const drawB = engine.submitDataset({
      requestId: 'draw-b',
      datasetRef: 'interactive-scene-revision-2',
      input: second.promise,
    });
    second.resolve(catalogProfiles.datasets['interactive-scene-revision-2']);
    expect(await drawB).toMatchObject({ status: 'committed', requestId: 'draw-b', sceneRevision: 1 });
    first.resolve(catalogProfiles.datasets['all-kinds-scene']);
    expect(await drawA).toMatchObject({ status: 'superseded', requestId: 'draw-a' });

    const beforeFailure = engine.snapshot();
    const failed = await engine.submitDataset({
      requestId: 'draw-invalid',
      datasetRef: 'malformed',
      input: Promise.resolve(catalogProfiles.datasets.malformed),
    });
    expect(failed).toMatchObject({ status: 'rejected', diagnostic: { category: 'INVALID_INPUT' } });
    expect(engine.snapshot().semanticHash).toBe(beforeFailure.semanticHash);
    expect(engine.snapshot().datasetRef).toBe('interactive-scene-revision-2');
    expect(surfaces[0]?.loadCount).toBe(1);
    expect(drawComplete).toEqual([{
      requestId: 'draw-b',
      sceneRevision: 1,
      semanticHash: engine.snapshot().semanticHash,
      datasetRef: 'interactive-scene-revision-2',
    }]);

    engine.publishFrame(16.666667);
    expect(engine.snapshot().publishedTuple).toEqual({ scene: 1, view: 0, interaction: 0 });
    expect(surfaces[0]?.frameCount).toBe(1);
  });

  it('uses one replacement generation across submissions and direct loads', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'shared-replacement-generation', width: 800, height: 600 });

    const staleInput = deferred<unknown>();
    const staleSubmission = engine.submitDataset({
      requestId: 'stale-submission',
      datasetRef: 'all-kinds-scene',
      input: staleInput.promise,
    });
    engine.loadDataset(catalogProfiles.datasets['interactive-scene-revision-2'], {
      datasetRef: 'direct-replacement',
    });
    staleInput.resolve(catalogProfiles.datasets['all-kinds-scene']);

    await expect(staleSubmission).resolves.toMatchObject({
      status: 'superseded',
      requestId: 'stale-submission',
    });
    expect(engine.snapshot()).toMatchObject({
      datasetRef: 'direct-replacement',
      revisions: { sceneRevision: 1 },
    });
    expect(surfaces[0]?.loadCount).toBe(1);

    const staleDirectLoad = engine.loadDatasetAsync(
      catalogProfiles.datasets['all-kinds-scene'],
      { datasetRef: 'stale-direct-async' },
    );
    const latestSubmission = engine.submitDataset({
      requestId: 'latest-submission',
      datasetRef: 'interactive-scene',
      input: Promise.resolve(catalogProfiles.datasets['interactive-scene']),
    });

    await expect(latestSubmission).resolves.toMatchObject({
      status: 'committed',
      requestId: 'latest-submission',
      sceneRevision: 2,
    });
    await expect(staleDirectLoad).rejects.toMatchObject({
      diagnostic: { code: 'SUPERSEDED', operation: 'loadDatasetAsync' },
    });
    expect(engine.snapshot()).toMatchObject({
      datasetRef: 'interactive-scene',
      revisions: { sceneRevision: 2 },
    });
    expect(surfaces[0]?.loadCount).toBe(2);
    await engine.destroy();
  });

  it('prepares aggregate GPU resources without publishing a visible frame', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'prepare-scene', width: 800, height: 600 });
    engine.loadDataset(catalogProfiles.datasets['interactive-scene']);
    const before = engine.snapshot();

    await expect(engine.prepareScene()).resolves.toEqual({
      status: 'prepared',
      storeSyncMs: 1.25,
      gpuPrepareMs: 2.5,
      revisions: before.revisions,
      publishedTuple: before.publishedTuple,
    });
    expect(surfaces[0]?.prepareCount).toBe(1);
    expect(surfaces[0]?.frameCount).toBe(0);
    expect(engine.snapshot().frameRevision).toBe(before.frameRevision);
    expect(engine.snapshot().publishedTuple).toEqual(before.publishedTuple);
  });

  it('classifies resolved invalid input before staleness and obsolete transport failure as superseded', async () => {
    const { factory } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-async-classification', width: 800, height: 600 });
    engine.loadDataset(catalogProfiles.datasets['interactive-scene'], {
      datasetRef: 'interactive-scene',
    });

    const invalidA = deferred<unknown>();
    const validB = deferred<unknown>();
    const requestA = engine.submitDataset({
      requestId: 'A',
      sourceRevision: 2,
      input: invalidA.promise,
    });
    const requestB = engine.submitDataset({
      requestId: 'B',
      sourceRevision: 3,
      datasetRef: 'interactive-scene-revision-2',
      input: validB.promise,
    });
    invalidA.resolve(catalogProfiles.datasets.malformed);
    await expect(requestA).resolves.toMatchObject({
      status: 'rejected',
      requestId: 'A',
      diagnostic: { code: 'INVALID_VALUE' },
    });
    validB.resolve(catalogProfiles.datasets['interactive-scene-revision-2']);
    await expect(requestB).resolves.toMatchObject({
      status: 'committed',
      requestId: 'B',
      sourceRevision: 3,
      sceneRevision: 2,
    });

    const failedC = deferred<unknown>();
    const validD = deferred<unknown>();
    const requestC = engine.submitDataset({
      requestId: 'C',
      sourceRevision: 4,
      input: failedC.promise,
    });
    const requestD = engine.submitDataset({
      requestId: 'D',
      sourceRevision: 5,
      datasetRef: 'interactive-scene',
      input: validD.promise,
    });
    validD.resolve(catalogProfiles.datasets['interactive-scene']);
    await expect(requestD).resolves.toMatchObject({
      status: 'committed',
      requestId: 'D',
      sourceRevision: 5,
      sceneRevision: 3,
    });
    failedC.reject(new Error('obsolete transport failure'));
    await expect(requestC).resolves.toMatchObject({
      status: 'superseded',
      requestId: 'C',
      sourceRevision: 4,
      diagnostic: { code: 'SUPERSEDED' },
    });
    expect(engine.snapshot()).toMatchObject({
      pendingWork: 0,
      revisions: { sceneRevision: 3 },
    });

    await engine.destroy();
  });

  it('releases every async revision once while suppressing superseded and post-destroy publication', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    const drawComplete: unknown[] = [];
    const releases: Array<Readonly<{ requestId: string; status: string }>> = [];
    engine.on('drawComplete', (event) => drawComplete.push(event));
    await engine.initialize({ instanceId: 'map-async-order', width: 800, height: 600 });
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const third = deferred<unknown>();
    const release = (requestId: string) => (
      result: Readonly<{ readonly status: string }>,
    ): void => {
      releases.push(Object.freeze({ requestId, status: result.status }));
    };

    const drawA = engine.submitDataset({
      requestId: 'A',
      sourceRevision: 2,
      input: first.promise,
      release: release('A'),
    });
    const drawB = engine.submitDataset({
      requestId: 'B',
      sourceRevision: 3,
      input: second.promise,
      release: release('B'),
    });
    const drawC = engine.submitDataset({
      requestId: 'C',
      sourceRevision: 4,
      input: third.promise,
      release: release('C'),
    });

    second.resolve(catalogProfiles.datasets['all-kinds-scene']);
    await expect(drawB).resolves.toMatchObject({
      status: 'superseded',
      requestId: 'B',
      sourceRevision: 3,
    });
    third.resolve(catalogProfiles.datasets['interactive-scene-revision-2']);
    await expect(drawC).resolves.toMatchObject({
      status: 'committed',
      requestId: 'C',
      sourceRevision: 4,
      sceneRevision: 1,
    });
    expect(drawComplete).toEqual([
      expect.objectContaining({ requestId: 'C', sourceRevision: 4, sceneRevision: 1 }),
    ]);

    await engine.destroy();
    first.resolve(catalogProfiles.datasets['interactive-scene']);
    await expect(drawA).resolves.toMatchObject({
      status: 'superseded',
      requestId: 'A',
      sourceRevision: 2,
    });

    expect(drawComplete).toHaveLength(1);
    expect(surfaces[0]?.loadCount).toBe(1);
    expect(surfaces[0]?.frameCount).toBe(0);
    expect(releases).toEqual([
      { requestId: 'B', status: 'superseded' },
      { requestId: 'C', status: 'committed' },
      { requestId: 'A', status: 'superseded' },
    ]);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      pendingWork: 0,
      resources: { canvasCount: 0 },
    });
  });

  it('releases rejected submissions once and retains pending ownership until async release settles', async () => {
    const { factory } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    const releases: Array<Readonly<{ requestId: string; status: string }>> = [];
    const notReadyReleaseStarted = deferred<void>();
    const notReadyReleaseGate = deferred<void>();
    const recordRelease = (requestId: string) => (
      result: Readonly<{ readonly status: string }>,
    ): void => {
      releases.push(Object.freeze({ requestId, status: result.status }));
    };

    await expect(engine.submitDataset({
      requestId: 'invalid-source-revision',
      sourceRevision: 0,
      input: Promise.resolve([]),
      release: recordRelease('invalid-source-revision'),
    })).resolves.toMatchObject({
      status: 'rejected',
      requestId: 'invalid-source-revision',
    });
    const notReady = engine.submitDataset({
      requestId: 'not-ready',
      sourceRevision: 1,
      input: Promise.resolve([]),
      release: async (result) => {
        releases.push(Object.freeze({ requestId: 'not-ready', status: result.status }));
        notReadyReleaseStarted.resolve();
        await notReadyReleaseGate.promise;
      },
    });
    await notReadyReleaseStarted.promise;
    expect(engine.snapshot().pendingWork).toBe(1);
    notReadyReleaseGate.resolve();
    await expect(notReady).resolves.toMatchObject({
      status: 'rejected',
      requestId: 'not-ready',
    });
    expect(engine.snapshot().pendingWork).toBe(0);

    await engine.initialize({ instanceId: 'map-async-release', width: 800, height: 600 });
    const releaseStarted = deferred<void>();
    const releaseGate = deferred<void>();
    const committed = engine.submitDataset({
      requestId: 'committed',
      sourceRevision: 2,
      input: Promise.resolve(catalogProfiles.datasets['interactive-scene']),
      release: async (result) => {
        releases.push(Object.freeze({ requestId: 'committed', status: result.status }));
        releaseStarted.resolve();
        await releaseGate.promise;
      },
    });

    await releaseStarted.promise;
    expect(engine.snapshot().pendingWork).toBe(1);
    releaseGate.resolve();
    await expect(committed).resolves.toMatchObject({
      status: 'committed',
      requestId: 'committed',
      sourceRevision: 2,
    });
    expect(engine.snapshot().pendingWork).toBe(0);
    expect(releases).toEqual([
      { requestId: 'invalid-source-revision', status: 'rejected' },
      { requestId: 'not-ready', status: 'rejected' },
      { requestId: 'committed', status: 'committed' },
    ]);
    await engine.destroy();
  });

  it('keeps caller input immutable and returns deterministic empty/missing results', async () => {
    const { factory } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-1', width: 800, height: 600 });
    const input: unknown[] = [];
    Object.freeze(input);

    const result = engine.loadDataset(input, { datasetRef: 'empty-scene' });

    expect(result).toMatchObject({ sceneRevision: 1, lifecycle: 'ready-empty' });
    expect(engine.query({ id: 'missing' })).toBeNull();
    expect(engine.snapshot()).toMatchObject({ lifecycle: 'ready-empty', rootIds: [], historyDepth: 0, pendingWork: 0 });
  });

  it('keeps compatibility projection permissive while strict loads reject dangling references atomically', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-strict-references', width: 800, height: 600 });
    const baseline = structuredClone(catalogProfiles.datasets['interactive-scene']);
    engine.loadDataset(baseline, { datasetRef: 'baseline', strict: true });
    const before = engine.snapshot();
    const beforeDataset = engine.exportDataset();
    const dangling = structuredClone(baseline);
    const relation = dangling.find((element) => element.type === 'relations');
    if (relation?.type !== 'relations') throw new Error('Missing relation fixture');
    relation.links = [{ source: 'item-a', target: 'absent' }];
    const inputBefore = JSON.stringify(dangling);

    expect(() => engine.loadDataset(dangling, {
      datasetRef: 'strict-dangling',
      strict: true,
    })).toThrowError(expect.objectContaining({
      code: 'MISSING_TARGET',
      category: 'MISSING_TARGET',
      datasetPath: '$[3].links[0].target',
    }));
    expect(engine.snapshot()).toEqual(before);
    expect(engine.exportDataset()).toBe(beforeDataset);
    expect(surfaces[0]?.loadCount).toBe(1);
    expect(JSON.stringify(dangling)).toBe(inputBefore);

    expect(engine.loadDataset(dangling, {
      datasetRef: 'compatibility-dangling',
    })).toMatchObject({
      sceneRevision: 2,
    });
    expect(engine.snapshot().datasetRef).toBe('compatibility-dangling');
    expect(surfaces[0]?.loadCount).toBe(2);
    expect(JSON.stringify(dangling)).toBe(inputBefore);
  });

  it('classifies duplicate IDs exactly and keeps strict async validation before surface publication', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-strict-async', width: 800, height: 600 });
    const baseline = structuredClone(catalogProfiles.datasets['interactive-scene']);
    engine.loadDataset(baseline, { datasetRef: 'baseline', strict: true });
    const before = engine.snapshot();
    const beforeDataset = engine.exportDataset();
    const duplicate = [
      { type: 'rect', id: 'dup', size: 10 },
      { type: 'rect', id: 'dup', size: 10 },
    ];
    const dangling = structuredClone(baseline);
    const relation = dangling.find((element) => element.type === 'relations');
    if (relation?.type !== 'relations') throw new Error('Missing relation fixture');
    relation.links = [{ source: 'item-a', target: 'absent' }];

    expect(() => engine.loadDataset(duplicate, {
      datasetRef: 'duplicate',
      strict: true,
    })).toThrowError(expect.objectContaining({
      code: 'DUPLICATE_ID',
      datasetPath: '$[1].id',
    }));
    await expect(engine.loadDatasetAsync(dangling, {
      datasetRef: 'strict-async-dangling',
      strict: true,
    })).rejects.toMatchObject({
      code: 'MISSING_TARGET',
      datasetPath: '$[3].links[0].target',
    });
    expect(engine.snapshot()).toEqual(before);
    expect(engine.exportDataset()).toBe(beforeDataset);
    expect(surfaces[0]?.loadCount).toBe(1);
  });

  it('does not supersede a valid async load when a later request fails strict validation', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-invalid-does-not-supersede', width: 800, height: 600 });
    const valid = structuredClone(catalogProfiles.datasets['lifecycle-scene-b']);
    const dangling = structuredClone(catalogProfiles.datasets['interactive-scene']);
    const relation = dangling.find((element) => element.type === 'relations');
    if (relation?.type !== 'relations') throw new Error('Missing relation fixture');
    relation.links = [{ source: 'item-a', target: 'absent' }];

    const validLoad = engine.loadDatasetAsync(valid, {
      datasetRef: 'valid-predecessor',
      strict: true,
    });
    const invalidLoad = engine.loadDatasetAsync(dangling, {
      datasetRef: 'invalid-successor',
      strict: true,
    });

    await expect(invalidLoad).rejects.toMatchObject({
      code: 'MISSING_TARGET',
      datasetPath: '$[3].links[0].target',
    });
    await expect(validLoad).resolves.toMatchObject({ sceneRevision: 1 });
    expect(engine.snapshot()).toMatchObject({
      datasetRef: 'valid-predecessor',
      pendingWork: 0,
      revisions: { sceneRevision: 1 },
    });
    expect(surfaces[0]?.loadCount).toBe(1);
  });

  it('clears selection identity on authoritative dataset replacement', async () => {
    const { factory } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-replacement', width: 800, height: 600 });
    engine.loadDataset(catalogProfiles.datasets['interactive-scene'], { datasetRef: 'interactive-scene' });

    expect(engine.select(['item-a'])).toEqual(['item-a']);
    expect(engine.snapshot()).toMatchObject({ selectionIds: ['item-a'], revisions: { interactionRevision: 1 } });

    engine.loadDataset(catalogProfiles.datasets['lifecycle-scene-b'], { datasetRef: 'lifecycle-scene-b' });
    expect(engine.snapshot()).toMatchObject({
      datasetRef: 'lifecycle-scene-b',
      selectionIds: [],
      historyDepth: 0,
      revisions: { sceneRevision: 2, interactionRevision: 2 },
    });
  });

  it('preserves the world center across DPR-aware host resize', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-view', width: 800, height: 600, pixelRatio: 2 });

    expect(engine.setViewport({ centerWorld: [200, 150], scale: 2 })).toMatchObject({
      centerWorld: [200, 150],
      scale: 2,
      screenBounds: [0, 0, 800, 600],
    });
    expect(surfaces[0]?.view).toEqual({ x: 0, y: 0, scale: 2, rotation: 0 });

    expect(engine.resize(1024, 768, 2)).toBe(true);
    expect(surfaces[0]?.view).toEqual({ x: 112, y: 84, scale: 2, rotation: 0 });
    expect(engine.screenToWorld({ x: 512, y: 384 })).toEqual({ x: 200, y: 150 });
    expect(engine.snapshot()).toMatchObject({
      revisions: { viewRevision: 2 },
      viewport: { centerWorld: [200, 150], scale: 2, screenBounds: [0, 0, 1024, 768] },
      resources: { canvas: { cssSize: [1024, 768], backingSize: [2048, 1536] } },
    });
  });

  it('destroys once and releases the surface', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-1', width: 800, height: 600 });

    expect(await engine.destroy()).toBe(true);
    expect(await engine.destroy()).toBe(false);
    expect(surfaces[0]).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(engine.snapshot()).toMatchObject({ lifecycle: 'destroyed', resources: { canvasCount: 0 } });
  });

  it('waits for and releases a renderer that resolves after destroy starts', async () => {
    const allocation = deferred<PatchMapEngineSurface>();
    const surface = new FakeSurface();
    const engine = new PatchMap({ surfaceFactory: () => allocation.promise });
    const initializing = engine.initialize({ instanceId: 'map-late', width: 800, height: 600 });

    const destroying = engine.destroy();
    allocation.resolve(surface);

    await expect(initializing).rejects.toMatchObject({ diagnostic: { code: 'DESTROYED' } });
    await expect(destroying).resolves.toBe(true);
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(engine.snapshot()).toMatchObject({ lifecycle: 'destroyed', resources: { canvasCount: 0 } });
  });
});
