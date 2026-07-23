import { describe, expect, it } from 'vitest';

import {
  CORE_V2_VIEWPORT_CASE_IDS,
  createCoreV2ViewportRuntime,
} from '../../lab/performance-v2/contract/viewport-runtime';

describe('Core v2 viewport actual-only runtime', () => {
  it('owns no product or observer resource after every case runtime releases', () => {
    for (const caseId of CORE_V2_VIEWPORT_CASE_IDS) {
      const runtime = createCoreV2ViewportRuntime(caseId);
      const cleanup = runtime.postDestroyProductProbe();

      expect(cleanup).toMatchObject({
        revision: 'core-v2-viewport-cleanup/1',
        caseId,
        runtimeCounts: {
          activeSessionCount: 0,
          retainedDatasetCount: 0,
          rendererObjectCount: 0,
          subscriptionCount: 0,
          assetLeaseCount: 0,
          pendingWorkCount: 0,
          activeObserverCount: 0,
        },
      });
      expect(runtime.postDestroyProductProbe()).toBe(cleanup);
    }
  });

  it('builds detached immutable production-shaped input without retaining it', () => {
    const runtime = createCoreV2ViewportRuntime('CSM-010');
    const first = runtime.product.productionDataset({
      caseId: 'CSM-010',
      generatorRef: 'production-shaped',
    });
    const second = runtime.product.productionDataset({
      caseId: 'CSM-010',
      generatorRef: 'production-shaped',
    });

    expect(first).toHaveLength(21);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(runtime.postDestroyProductProbe()).toMatchObject({
      runtimeCounts: {
        retainedDatasetCount: 0,
        activeObserverCount: 0,
      },
      stats: {
        productionDatasetBuildCount: 2,
        productionEntityCount: 42,
      },
    });
  });
});
