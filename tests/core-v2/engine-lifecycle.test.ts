import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  type CoreV2EngineSurface,
  type CoreV2EngineSurfaceFactory,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
} from '../../src/core-v2/engine';

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
  const options: CoreV2SurfaceOptions[] = [];
  const factory: CoreV2EngineSurfaceFactory = (nextOptions) => {
    options.push(nextOptions);
    const surface = new FakeSurface(nextOptions);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
  return { factory, options, surfaces };
}

class FakeSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public prepareCount = 0;
  public frameCount = 0;
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

  public constructor(options: Pick<CoreV2SurfaceOptions, 'width' | 'height' | 'pixelRatio'> = {
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

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as [number, number]),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as [number, number]),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
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

describe('CoreV2Engine lifecycle authority', () => {
  it('deduplicates repeated initialization and publishes one ready event', async () => {
    const { factory, options, surfaces } = createSurfaceFactory();
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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

  it('prepares aggregate GPU resources without publishing a visible frame', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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

  it('clears selection identity on authoritative dataset replacement', async () => {
    const { factory } = createSurfaceFactory();
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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
    const engine = new CoreV2Engine({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'map-1', width: 800, height: 600 });

    expect(await engine.destroy()).toBe(true);
    expect(await engine.destroy()).toBe(false);
    expect(surfaces[0]).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(engine.snapshot()).toMatchObject({ lifecycle: 'destroyed', resources: { canvasCount: 0 } });
  });

  it('waits for and releases a renderer that resolves after destroy starts', async () => {
    const allocation = deferred<CoreV2EngineSurface>();
    const surface = new FakeSurface();
    const engine = new CoreV2Engine({ surfaceFactory: () => allocation.promise });
    const initializing = engine.initialize({ instanceId: 'map-late', width: 800, height: 600 });

    const destroying = engine.destroy();
    allocation.resolve(surface);

    await expect(initializing).rejects.toMatchObject({ diagnostic: { code: 'DESTROYED' } });
    await expect(destroying).resolves.toBe(true);
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0 });
    expect(engine.snapshot()).toMatchObject({ lifecycle: 'destroyed', resources: { canvasCount: 0 } });
  });
});
