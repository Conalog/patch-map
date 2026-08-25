import { afterEach, describe, expect, it } from 'vitest';

import {
  PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS,
  PATCH_MAP_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
  PATCH_MAP_UPDATE_TRANSACTIONS_RUNTIME_REVISION,
  createPatchMapUpdateTransactionsRuntime,
} from '../../lab/contract/update-transactions-runtime';
import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';

class RuntimeProbeSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: Pick<PatchMapSurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
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

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
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

  public debugSnapshot(): PatchMapSurfaceDebug {
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

describe('PatchMap update-transactions focused Lab runtime', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('exposes the exact nineteen-case runtime family', () => {
    expect(PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS).toEqual([
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
    for (const caseId of PATCH_MAP_UPDATE_TRANSACTIONS_CASE_IDS) {
      expect(createPatchMapUpdateTransactionsRuntime(caseId).postDestroyProductProbe())
        .toMatchObject({
          revision: PATCH_MAP_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
          caseId,
          runtimeCounts: zeroOwnership(),
        });
    }
  });

  it('builds deterministic frozen UPD-007 inputs without retaining caller aliases', () => {
    const first = createPatchMapUpdateTransactionsRuntime('UPD-007');
    const repeat = createPatchMapUpdateTransactionsRuntime('UPD-007');
    const different = createPatchMapUpdateTransactionsRuntime('UPD-007');
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
    const runtime = createPatchMapUpdateTransactionsRuntime('UPD-007');
    const engine = await createEngine(engines);
    const dataset = runtime.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 3,
      seed: 319,
    });
    engine.loadDataset(dataset, { datasetRef: 'upd-007-synthetic' });

    const observed = runtime.product.resourceProbe({ caseId: 'UPD-007', engine });
    expect(observed).toMatchObject({
      revision: PATCH_MAP_UPDATE_TRANSACTIONS_RUNTIME_REVISION,
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
      revision: PATCH_MAP_UPDATE_TRANSACTIONS_CLEANUP_REVISION,
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
    const runtime = createPatchMapUpdateTransactionsRuntime('UPD-007');

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
    expect(() => createPatchMapUpdateTransactionsRuntime('UPD-001')
      .product.createSyntheticScene({ caseId: 'UPD-007', size: 100, seed: 319 }))
      .toThrow(/belong to UPD-007/u);
    expect(() => runtime.product.resourceProbe({ caseId: 'UPD-002', engine }))
      .toThrow(/case identity/u);
  });
});

async function createEngine(engines: PatchMap[]): Promise<PatchMap> {
  const engine = new PatchMap({
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
