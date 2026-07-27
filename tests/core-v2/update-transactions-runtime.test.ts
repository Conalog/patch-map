import { afterEach, describe, expect, it } from 'vitest';

import {
  CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS,
  CORE_V2_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
  CORE_V2_UPDATE_TRANSACTIONS_RUNTIME_REVISION,
  createCoreV2UpdateTransactionsRuntime,
} from '../../lab/performance-v2/contract/update-transactions-runtime';
import {
  CoreV2Engine,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
} from '../../src/core-v2/engine';

class RuntimeProbeSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: Pick<CoreV2SurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(): void {}

  public publishFrame(): void {}

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

  public select(): void {}

  public hitTestScreen(): null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public interactionOwnershipProbe(): Readonly<{
    rootBindingCount: number;
    entityCallbackCount: number;
  }> {
    return Object.freeze({ rootBindingCount: 6, entityCallbackCount: 0 });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 3,
      visiblePrimitiveCount: 3,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

describe('Core v2 update-transactions focused Lab runtime', () => {
  const engines: CoreV2Engine[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('exposes the exact nineteen-case runtime family', () => {
    expect(CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS).toEqual([
      'ERR-001',
      'UPD-001',
      'UPD-002',
      'UPD-003',
      'UPD-004',
      'UPD-006',
      'UPD-007',
      'UPD-008',
      'UPD-009',
      'UPD-010',
      'UPD-011',
      'UPD-012',
      'UPD-013',
      'UPD-014',
      'CSM-005',
      'CSM-006',
      'CSM-007',
      'CSM-008',
      'CSM-014',
    ]);
    for (const caseId of CORE_V2_UPDATE_TRANSACTIONS_CASE_IDS) {
      expect(createCoreV2UpdateTransactionsRuntime(caseId).postDestroyProductProbe())
        .toMatchObject({
          revision: CORE_V2_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
          caseId,
          runtimeCounts: zeroOwnership(),
        });
    }
  });

  it('builds deterministic frozen UPD-007 inputs without retaining caller aliases', () => {
    const first = createCoreV2UpdateTransactionsRuntime('UPD-007');
    const repeat = createCoreV2UpdateTransactionsRuntime('UPD-007');
    const different = createCoreV2UpdateTransactionsRuntime('UPD-007');
    const request = { caseId: 'UPD-007', size: 100, seed: 319 };
    const before = structuredClone(request);

    const firstDataset = first.product.createSyntheticScene(request);
    const repeatDataset = repeat.product.createSyntheticScene(structuredClone(request));
    const differentDataset = different.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 100,
      seed: 320,
    });

    expect(request).toEqual(before);
    expect(repeatDataset).toEqual(firstDataset);
    expect(differentDataset).not.toEqual(firstDataset);
    expect(firstDataset).toHaveLength(100);
    expect(firstDataset[0]).toMatchObject({
      type: 'item',
      id: 'node-0',
      components: [
        { type: 'background', id: 'bg' },
        { type: 'bar', id: 'bar', animation: true, animationDuration: 200 },
        { type: 'text', id: 'label', text: '0' },
      ],
    });
    expect(firstDataset[99]).toMatchObject({ id: 'node-99' });
    expect(isDeepFrozen(firstDataset)).toBe(true);
    expect(first.postDestroyProductProbe()).toMatchObject({
      stats: {
        syntheticBuildCount: 1,
        syntheticEntityCount: 100,
        resourceProbeCount: 0,
      },
    });
  });

  it('observes only detached public Engine facts and releases idempotently', async () => {
    const runtime = createCoreV2UpdateTransactionsRuntime('UPD-007');
    const engine = await createEngine(engines);
    const dataset = runtime.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 3,
      seed: 319,
    });
    engine.loadDataset(dataset, { datasetRef: 'upd-007-synthetic' });

    const observed = runtime.product.resourceProbe({ caseId: 'UPD-007', engine });
    expect(observed).toMatchObject({
      revision: CORE_V2_UPDATE_TRANSACTIONS_RUNTIME_REVISION,
      caseId: 'UPD-007',
      engine: {
        snapshot: {
          lifecycle: 'scene-ready',
          datasetRef: 'upd-007-synthetic',
          rootIds: ['node-0', 'node-1', 'node-2'],
          revisions: { sceneRevision: 1 },
        },
        semantic: {
          dataset: { rootIds: ['node-0', 'node-1', 'node-2'] },
        },
        interactionOwnership: { rootBindingCount: 6, entityCallbackCount: 0 },
      },
      runtime: {
        ownership: zeroOwnership(),
        stats: {
          syntheticBuildCount: 1,
          syntheticEntityCount: 3,
          resourceProbeCount: 1,
        },
      },
    });
    expect(isDeepFrozen(observed)).toBe(true);

    engine.loadDataset([], { datasetRef: 'replacement' });
    expect(observed).toMatchObject({
      engine: {
        snapshot: {
          lifecycle: 'scene-ready',
          datasetRef: 'upd-007-synthetic',
          revisions: { sceneRevision: 1 },
        },
      },
    });

    const cleanup = runtime.postDestroyProductProbe();
    expect(cleanup).toMatchObject({
      revision: CORE_V2_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
      caseId: 'UPD-007',
      runtimeCounts: zeroOwnership(),
      stats: { resourceProbeCount: 1 },
    });
    expect(runtime.postDestroyProductProbe()).toBe(cleanup);
    expect(() => runtime.product.resourceProbe({ caseId: 'UPD-007', engine }))
      .toThrow(/active runtime/u);
    expect(() => runtime.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 1,
      seed: 319,
    })).toThrow(/active runtime/u);
  });

  it('fails closed for answer-shaped, malformed, and cross-case requests', async () => {
    const engine = await createEngine(engines);
    const runtime = createCoreV2UpdateTransactionsRuntime('UPD-007');

    expect(() => runtime.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 100,
      seed: 319,
      answer: ['node-0'],
    })).toThrow(/unknown key answer/u);
    expect(() => runtime.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 5_001,
      seed: 319,
    })).toThrow(/must not exceed 5000/u);
    expect(() => runtime.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 100,
      seed: -1,
    })).toThrow(/must be non-negative/u);
    expect(() => createCoreV2UpdateTransactionsRuntime('UPD-001')
      .product.createSyntheticScene({ caseId: 'UPD-007', size: 100, seed: 319 }))
      .toThrow(/belong to UPD-007/u);
    expect(() => runtime.product.resourceProbe({ caseId: 'UPD-002', engine }))
      .toThrow(/case identity/u);
  });
});

async function createEngine(engines: CoreV2Engine[]): Promise<CoreV2Engine> {
  const engine = new CoreV2Engine({
    surfaceFactory: (options) => Promise.resolve(new RuntimeProbeSurface(options)),
  });
  engines.push(engine);
  await engine.initialize({
    instanceId: `update-runtime-${engines.length}`,
    width: 800,
    height: 600,
    pixelRatio: 1,
  });
  return engine;
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return {
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    assetLeaseCount: 0,
    pendingWorkCount: 0,
  };
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((nested) => (
    isDeepFrozen(nested, seen)
  ));
}
