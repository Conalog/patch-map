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
  public frameCount = 0;
  public lastInput: unknown = null;
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
        subscriptions: { active: 1, duplicates: 0 },
      },
    });
  });

  it('publishes only the newest authoritative async dataset and retains it after a failed later load', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new CoreV2Engine({ surfaceFactory: factory });
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

    engine.publishFrame(16.666667);
    expect(engine.snapshot().publishedTuple).toEqual({ scene: 1, view: 0, interaction: 0 });
    expect(surfaces[0]?.frameCount).toBe(1);
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
