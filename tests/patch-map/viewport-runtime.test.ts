import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_VIEWPORT_CASE_IDS,
  createPatchMapViewportRuntime,
} from '../../lab/patch-map/contract/viewport-runtime';

describe('PatchMap viewport actual-only runtime', () => {
  it('owns no product or observer resource after every case runtime releases', () => {
    for (const caseId of PATCH_MAP_VIEWPORT_CASE_IDS) {
      const runtime = createPatchMapViewportRuntime(caseId);
      const cleanup = runtime.postDestroyProductProbe();

      expect(cleanup).toMatchObject({
        revision: 'patch-map-viewport-cleanup/1',
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
    const runtime = createPatchMapViewportRuntime('CSM-010');
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
