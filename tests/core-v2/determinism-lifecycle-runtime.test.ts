import { describe, expect, it } from 'vitest';

import {
  CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS,
  CORE_V2_DETERMINISM_LIFECYCLE_CLEANUP_REVISION,
  createCoreV2DeterminismLifecycleRuntime,
} from '../../lab/performance-v2/contract/determinism-lifecycle-runtime';
import {
  createCoreV2UpdateTransactionsRuntime,
} from '../../lab/performance-v2/contract/update-transactions-runtime';

describe('Core v2 determinism/lifecycle focused Lab runtime', () => {
  it('exposes the exact five-case family with zero retained runtime ownership', () => {
    expect(CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS).toEqual([
      'DET-001',
      'DET-002',
      'DET-003',
      'ANI-003',
      'LIF-006',
    ]);

    for (const caseId of CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS) {
      expect(createCoreV2DeterminismLifecycleRuntime(caseId)
        .postDestroyProductProbe()).toMatchObject({
        revision: CORE_V2_DETERMINISM_LIFECYCLE_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
      });
    }
  });

  it('keeps the shared action-zero generator identical to the UPD-007 control', () => {
    const determinism = createCoreV2DeterminismLifecycleRuntime('DET-003');
    const update = createCoreV2UpdateTransactionsRuntime('UPD-007');

    const generated = determinism.product.createSeededScene({
      caseId: 'DET-003',
      size: 100,
      seed: 319,
      actionIndex: 0,
    });
    const control = update.product.createSyntheticScene({
      caseId: 'UPD-007',
      size: 100,
      seed: 319,
    });

    expect(generated).toEqual(control);
    expect(isDeepFrozen(generated)).toBe(true);
  });

  it('is deterministic per action index without mutating its request', () => {
    const first = createCoreV2DeterminismLifecycleRuntime('DET-003');
    const repeat = createCoreV2DeterminismLifecycleRuntime('DET-003');
    const request = {
      caseId: 'DET-003' as const,
      size: 100,
      seed: 319,
      actionIndex: 2,
    };
    const before = structuredClone(request);

    const firstDataset = first.product.createSeededScene(request);
    const repeatDataset = repeat.product.createSeededScene(structuredClone(request));
    const actionZero = first.product.createSeededScene({
      ...request,
      actionIndex: 0,
    });

    expect(request).toEqual(before);
    expect(repeatDataset).toEqual(firstDataset);
    expect(actionZero).not.toEqual(firstDataset);
    expect(firstDataset).toHaveLength(100);
    expect(isDeepFrozen(firstDataset)).toBe(true);
    expect(first.postDestroyProductProbe()).toMatchObject({
      stats: {
        generatedSceneCount: 2,
        generatedEntityCount: 200,
        observationCount: 0,
      },
    });
  });

  it('fails closed for cross-case generation and post-cleanup use', () => {
    const nonGenerator = createCoreV2DeterminismLifecycleRuntime('DET-001');
    expect(() => nonGenerator.product.createSeededScene({
      caseId: 'DET-003',
      size: 1,
      seed: 319,
      actionIndex: 0,
    })).toThrow(/case identity/u);

    const runtime = createCoreV2DeterminismLifecycleRuntime('DET-003');
    const cleanup = runtime.postDestroyProductProbe();
    expect(runtime.postDestroyProductProbe()).toBe(cleanup);
    expect(() => runtime.product.createSeededScene({
      caseId: 'DET-003',
      size: 1,
      seed: 319,
      actionIndex: 0,
    })).toThrow(/active runtime/u);
  });
});

function zeroOwnership(): Readonly<Record<string, number>> {
  return {
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    pendingPromiseCount: 0,
    pendingTimerCount: 0,
    pendingWorkCount: 0,
  };
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((entry) => isDeepFrozen(entry, seen));
}
