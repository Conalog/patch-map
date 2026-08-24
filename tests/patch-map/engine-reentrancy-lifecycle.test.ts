import { afterEach, describe, expect, it } from 'vitest';

import {
  PatchMap,
  PatchMapError,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/patch-map/engine';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class ReentrantSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loaded: unknown = null;
  public readonly loadedRootHistory: string[] = [];
  public nextLoadCallback: (() => void) | null = null;
  public nextReconcileCallback: (() => void) | null = null;
  public destroyCallCount = 0;
  private nextAsyncLoadGate: Promise<void> | null = null;
  private nextAsyncLoadEntered: (() => void) | null = null;
  private destroyFailuresRemaining = 0;
  private destroyGate: Promise<void> | null = null;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public deferDestroyUntil(gate: Promise<void>): void {
    this.destroyGate = gate;
  }

  public failNextDestroyAttempts(count: number): void {
    this.destroyFailuresRemaining = count;
  }

  public deferNextAsyncLoadUntil(
    gate: Promise<void>,
    entered: () => void,
  ): void {
    this.nextAsyncLoadGate = gate;
    this.nextAsyncLoadEntered = entered;
  }

  public load(input: unknown): void {
    this.loaded = input;
    this.loadedRootHistory.push(rootIds(input)[0] ?? '<empty>');
    const callback = this.nextLoadCallback;
    this.nextLoadCallback = null;
    callback?.();
  }

  public async loadAsync(input: unknown): Promise<void> {
    const gate = this.nextAsyncLoadGate;
    const entered = this.nextAsyncLoadEntered;
    this.nextAsyncLoadGate = null;
    this.nextAsyncLoadEntered = null;
    entered?.();
    if (gate !== null) await gate;
    this.load(input);
  }

  public reconcile(input: unknown): PatchMapSurfaceReconcileResult {
    this.loaded = input;
    const callback = this.nextReconcileCallback;
    this.nextReconcileCallback = null;
    callback?.();
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(_timeMs: number): void {}

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

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }

  public async destroy(): Promise<boolean> {
    this.destroyCallCount += 1;
    if (this.destroyFailuresRemaining > 0) {
      this.destroyFailuresRemaining -= 1;
      throw new Error('injected destroy failure');
    }
    if (this.destroyed) return false;
    if (this.destroyGate !== null) await this.destroyGate;
    this.destroyed = true;
    this.canvasCount = 0;
    return true;
  }
}

describe('PatchMap synchronous reentrancy and lifecycle settlement', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('refuses a stale outer load when surface.load synchronously publishes a nested load', async () => {
    const { engine, surface } = await createEngine(engines, 'nested-load');
    surface.nextLoadCallback = () => {
      engine.loadDataset(scene('nested', 200), { datasetRef: 'nested' });
    };

    let failure: unknown = null;
    try {
      engine.loadDataset(scene('outer', 100), { datasetRef: 'outer' });
    } catch (error) {
      failure = error;
    }

    expect(rootIds(engine.exportDataset())).toEqual(['nested']);
    expect(rootIds(surface.loaded)).toEqual(['nested']);
    expectStructuredReentrancyFailure(failure, 'loadDataset');
  });

  it('restores the authoritative scene when a synchronous load crosses a lifecycle rebind', async () => {
    const { engine, surface } = await createEngine(engines, 'lifecycle-load');
    engine.loadDataset(scene('baseline', 20), { datasetRef: 'baseline' });
    surface.nextLoadCallback = () => {
      engine.rebindHostLifecycle(2);
    };

    let failure: unknown = null;
    try {
      engine.loadDataset(scene('stale-candidate', 300), { datasetRef: 'stale' });
    } catch (error) {
      failure = error;
    }

    expect(rootIds(engine.exportDataset())).toEqual(['baseline']);
    expect(rootIds(surface.loaded)).toEqual(['baseline']);
    expectStructuredReentrancyFailure(failure, 'loadDataset');
  });

  it('restores the authoritative scene after a late async surface load is superseded', async () => {
    const { engine, surface } = await createEngine(engines, 'superseded-async-load');
    engine.loadDataset(scene('baseline', 20), { datasetRef: 'baseline' });
    const gate = deferred<void>();
    const entered = deferred<void>();
    surface.deferNextAsyncLoadUntil(gate.promise, entered.resolve);

    const stale = engine.loadDatasetAsync(
      scene('stale-candidate', 300),
      { datasetRef: 'stale' },
    );
    await entered.promise;
    engine.loadDataset(scene('latest', 200), { datasetRef: 'latest' });
    gate.resolve();

    await expect(stale).rejects.toMatchObject({
      diagnostic: { category: 'SUPERSEDED', operation: 'loadDatasetAsync' },
    });
    expect(rootIds(engine.exportDataset())).toEqual(['latest']);
    expect(rootIds(surface.loaded)).toEqual(['latest']);
    expect(engine.snapshot()).toMatchObject({
      datasetRef: 'latest',
      revisions: { sceneRevision: 2 },
    });
  });

  it('does not let a superseded async load restore over a newer in-flight load owner', async () => {
    const { engine, surface } = await createEngine(engines, 'overlapping-async-loads');
    engine.loadDataset(scene('baseline', 20), { datasetRef: 'baseline' });
    const firstGate = deferred<void>();
    const firstEntered = deferred<void>();
    surface.deferNextAsyncLoadUntil(firstGate.promise, firstEntered.resolve);
    const first = engine.loadDatasetAsync(scene('first', 100), { datasetRef: 'first' });
    await firstEntered.promise;

    const secondGate = deferred<void>();
    const secondEntered = deferred<void>();
    surface.deferNextAsyncLoadUntil(secondGate.promise, secondEntered.resolve);
    const second = engine.loadDatasetAsync(scene('second', 200), { datasetRef: 'second' });
    await secondEntered.promise;

    firstGate.resolve();
    await expect(first).rejects.toMatchObject({
      diagnostic: { category: 'SUPERSEDED', operation: 'loadDatasetAsync' },
    });
    expect(surface.loadedRootHistory.at(-1)).toBe('first');
    expect(surface.loadedRootHistory.slice(-2)).not.toEqual(['first', 'baseline']);

    secondGate.resolve();
    await expect(second).resolves.toMatchObject({ lifecycle: 'scene-ready' });
    expect(rootIds(engine.exportDataset())).toEqual(['second']);
    expect(rootIds(surface.loaded)).toEqual(['second']);
  });

  it('refuses a stale outer transaction when surface.reconcile synchronously commits a nested one', async () => {
    const { engine, surface } = await createEngine(engines, 'nested-transaction');
    engine.loadDataset(scene('rect-a', 0));
    let nestedResult: ReturnType<PatchMap['transact']> | null = null;
    surface.nextReconcileCallback = () => {
      nestedResult = engine.transact(setRectX('rect-a', 200, 'nested'));
    };

    let outerResult: ReturnType<PatchMap['transact']> | null = null;
    let failure: unknown = null;
    try {
      outerResult = engine.transact(setRectX('rect-a', 100, 'outer'));
    } catch (error) {
      failure = error;
    }

    expect(nestedResult).toMatchObject({ status: 'committed', changed: true });
    expect(rectX(engine.exportDataset(), 'rect-a')).toBe(200);
    expect(rectX(surface.loaded, 'rect-a')).toBe(200);
    if (failure !== null) {
      expectStructuredReentrancyFailure(failure, 'transact');
    } else {
      expect(outerResult).toMatchObject({ status: 'refused', changed: false });
      expect(outerResult?.history.state).toEqual(engine.historyState());
    }
  });

  it('restores scene and preserves a reentrant selection before refusing the stale transaction', async () => {
    const { engine, surface } = await createEngine(engines, 'selection-transaction');
    engine.loadDataset(scene('rect-a', 0));
    surface.nextReconcileCallback = () => {
      engine.applySelection({
        op: 'replace',
        ids: ['rect-a'],
        source: 'programmatic',
      });
    };

    const outerResult = engine.transact(setRectX('rect-a', 100, 'outer-selection'));

    expect(outerResult).toMatchObject({
      status: 'refused',
      changed: false,
      history: { state: engine.historyState() },
    });
    expect(rectX(engine.exportDataset(), 'rect-a')).toBe(0);
    expect(rectX(surface.loaded, 'rect-a')).toBe(0);
    expect(engine.snapshot().selectionIds).toEqual(['rect-a']);
    expect(surface.debugSnapshot().selectionIds).toEqual(['rect-a']);
  });

  it('refuses before scene commit when reentrant history work invalidates the prepared record', async () => {
    const { engine, surface } = await createEngine(engines, 'history-transaction');
    engine.loadDataset(scene('rect-a', 0));
    expect(engine.transact(setRectX('rect-a', 10, 'seed-history'))).toMatchObject({
      status: 'committed',
      history: { state: { undoDepth: 1 } },
    });
    surface.nextReconcileCallback = () => {
      engine.clearHistory();
    };

    const outerResult = engine.transact(setRectX('rect-a', 100, 'outer-history'));

    expect(outerResult).toMatchObject({
      status: 'refused',
      changed: false,
      history: { state: { undoDepth: 0, redoDepth: 0 } },
    });
    expect(rectX(engine.exportDataset(), 'rect-a')).toBe(10);
    expect(rectX(surface.loaded, 'rect-a')).toBe(10);
    expect(engine.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
  });

  it('restores the nested authoritative patch before refusing a stale outer patch', async () => {
    const { engine, surface } = await createEngine(engines, 'nested-patch');
    engine.loadDataset(scene('rect-a', 0));
    surface.nextReconcileCallback = () => {
      expect(engine.patch(
        { kind: 'element', id: 'rect-a' },
        { attrs: { x: 200 } },
      )).toMatchObject({ status: 'committed', changed: true });
    };

    expect(engine.patch(
      { kind: 'element', id: 'rect-a' },
      { attrs: { x: 100 } },
    )).toMatchObject({
      status: 'refused',
      changed: false,
      diagnostic: { category: 'CONFLICT' },
    });
    expect(rectX(engine.exportDataset(), 'rect-a')).toBe(200);
    expect(rectX(surface.loaded, 'rect-a')).toBe(200);
  });

  it('preserves a nested mutation before refusing a stale destroy', async () => {
    const { engine, surface } = await createEngine(engines, 'nested-destroy');
    engine.loadDataset([
      ...scene('rect-a', 0),
      ...scene('rect-b', 10),
    ]);
    surface.nextReconcileCallback = () => {
      expect(engine.patch(
        { kind: 'element', id: 'rect-b' },
        { attrs: { x: 200 } },
      )).toMatchObject({ status: 'committed', changed: true });
    };

    expect(engine.destroyTarget({ kind: 'element', id: 'rect-a' })).toMatchObject({
      status: 'refused',
      changed: false,
      diagnostic: { category: 'CONFLICT' },
    });
    expect(rootIds(engine.exportDataset())).toEqual(['rect-a', 'rect-b']);
    expect(rootIds(surface.loaded)).toEqual(['rect-a', 'rect-b']);
    expect(rectX(engine.exportDataset(), 'rect-b')).toBe(200);
    expect(rectX(surface.loaded, 'rect-b')).toBe(200);
  });

  it('preserves reentrant interaction state before refusing stale history application', async () => {
    const { engine, surface } = await createEngine(engines, 'selection-history');
    engine.loadDataset(scene('rect-a', 0));
    expect(engine.patch(
      { kind: 'element', id: 'rect-a' },
      { attrs: { x: 10 } },
    )).toMatchObject({ status: 'committed', changed: true });
    surface.nextReconcileCallback = () => {
      engine.applySelection({
        op: 'replace',
        ids: ['rect-a'],
        source: 'programmatic',
      });
    };

    expect(engine.undo()).toMatchObject({
      status: 'refused',
      changed: false,
      diagnostic: { category: 'CONFLICT' },
    });
    expect(rectX(engine.exportDataset(), 'rect-a')).toBe(10);
    expect(rectX(surface.loaded, 'rect-a')).toBe(10);
    expect(engine.snapshot().selectionIds).toEqual(['rect-a']);
    expect(surface.debugSnapshot().selectionIds).toEqual(['rect-a']);
    expect(engine.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
  });

  it('makes concurrent destroy callers wait for the shared cleanup settlement', async () => {
    const { engine, surface } = await createEngine(engines, 'concurrent-destroy');
    const cleanup = deferred<void>();
    surface.deferDestroyUntil(cleanup.promise);

    const first = engine.destroy();
    let secondSettled = false;
    const second = engine.destroy().then((result) => {
      secondSettled = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    const secondSettledBeforeCleanup = secondSettled;

    cleanup.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(secondSettledBeforeCleanup).toBe(false);
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
    expect(surface).toMatchObject({ destroyed: true, canvasCount: 0 });
  });

  it('serializes concurrent cleanup retries after the first destroy fails', async () => {
    const { engine, surface } = await createEngine(engines, 'destroy-retry');
    surface.failNextDestroyAttempts(2);

    await expect(engine.destroy()).rejects.toBeInstanceOf(PatchMapError);
    expect(surface).toMatchObject({ destroyed: false, canvasCount: 1, destroyCallCount: 2 });

    const cleanup = deferred<void>();
    surface.deferDestroyUntil(cleanup.promise);
    const firstRetry = engine.destroy();
    let secondRetrySettled = false;
    const secondRetry = engine.destroy().then((result) => {
      secondRetrySettled = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(secondRetrySettled).toBe(false);

    cleanup.resolve();
    await expect(Promise.all([firstRetry, secondRetry])).resolves.toEqual([false, false]);
    expect(surface).toMatchObject({
      destroyed: true,
      canvasCount: 0,
      destroyCallCount: 3,
    });
  });
});

async function createEngine(
  engines: PatchMap[],
  instanceId: string,
): Promise<Readonly<{ engine: PatchMap; surface: ReentrantSurface }>> {
  let surface: ReentrantSurface | null = null;
  const engine = new PatchMap({
    surfaceFactory: (options) => {
      surface = new ReentrantSurface(options);
      return Promise.resolve(surface);
    },
  });
  engines.push(engine);
  await engine.initialize({ instanceId, width: 320, height: 240 });
  if (surface === null) throw new Error('Expected injected surface');
  return Object.freeze({ engine, surface });
}

function scene(id: string, x: number): readonly unknown[] {
  return Object.freeze([{
    type: 'rect',
    id,
    size: { width: 40, height: 30 },
    fill: '#ff8800',
    attrs: { x, y: 0, zIndex: 1 },
  }]);
}

function setRectX(id: string, x: number, actionId: string) {
  return {
    strict: true,
    actionId,
    operations: [{
      op: 'merge' as const,
      target: { kind: 'element' as const, id },
      changes: [{ path: ['attrs', 'x'], value: x }],
    }],
  };
}

function rootIds(input: unknown): readonly string[] {
  if (!Array.isArray(input)) return Object.freeze([]);
  const values = input as readonly unknown[];
  return Object.freeze(values.flatMap((value) => {
    if (!isUnknownRecord(value)) return [];
    return typeof value.id === 'string' ? [value.id] : [];
  }));
}

function rectX(input: unknown, id: string): number | null {
  if (!Array.isArray(input)) return null;
  const values = input as readonly unknown[];
  const element = values.find((value) => (
    isUnknownRecord(value) && value.id === id
  ));
  if (!isUnknownRecord(element)) return null;
  const attrs = element.attrs;
  if (!isUnknownRecord(attrs)) return null;
  return typeof attrs.x === 'number' ? attrs.x : null;
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectStructuredReentrancyFailure(error: unknown, operation: string): void {
  expect(error).toBeInstanceOf(PatchMapError);
  const diagnostic = (error as PatchMapError).diagnostic;
  expect(['CONFLICT', 'SUPERSEDED']).toContain(diagnostic.category);
  expect(diagnostic.operation).toBe(operation);
  expect(diagnostic.recoverable).toBe(true);
}
