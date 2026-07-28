import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CORE_V2_CONTRACT_PERFORMANCE_SIZES,
  buildCoreV2ContractPerformanceDataset,
  canonicalCoreV2DatasetSha256,
  coreV2PerformancePercentile,
  countCoreV2LongTasksAtLeast,
  measureCoreV2VisibleAction,
  validateCoreV2ContractPerformanceDataset,
} from '../../performance/core-v2/contract-workload';
import type { CoreV2Engine } from '../../src/core-v2/engine';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Core v2 contract performance workload', () => {
  it('builds deterministic detached frozen synthetic PATCH MAP input', () => {
    const first = buildCoreV2ContractPerformanceDataset(100, 319);
    const second = buildCoreV2ContractPerformanceDataset(100, 319);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(validateCoreV2ContractPerformanceDataset(first)).toMatchObject({
      rootCount: 100,
      elementCount: 100,
      componentCount: 300,
    });
  });

  it('binds the approved production-shaped matrix row to its canonical SHA-256', async () => {
    const production = buildCoreV2ContractPerformanceDataset(
      'production-shaped-workload-v1',
      319,
    );

    expect(CORE_V2_CONTRACT_PERFORMANCE_SIZES).toEqual([
      100,
      500,
      1_000,
      2_000,
      5_000,
      'production-shaped-workload-v1',
    ]);
    expect(await canonicalCoreV2DatasetSha256(production)).toBe(
      '4bc16c65500b4f305114162fdc4472b45997eea7498020496072ca0b741e95c3',
    );
    expect(validateCoreV2ContractPerformanceDataset(production)).toMatchObject({
      rootCount: 21,
      strictReferenceDiagnostics: [{
        code: 'MISSING_TARGET',
        datasetPath: '$[20].children[0].links[0].source',
      }],
    });
  });

  it('keeps threshold and nearest-rank percentile accounting explicit', () => {
    expect(countCoreV2LongTasksAtLeast([99.9, 100, 140], 100)).toBe(2);
    expect(coreV2PerformancePercentile([1, 2, 3, 4, 5, 6, 7], 0.95)).toBe(7);
    expect(coreV2PerformancePercentile([], 0.95)).toBe(0);
  });

  it('uses one monotonic clock when a throttled rAF timestamp trails performance.now', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(-1_000);
      return 1;
    });
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(30);
    const engine = {
      publishFrame: vi.fn(),
    } as unknown as CoreV2Engine;

    const measurement = await measureCoreV2VisibleAction(
      engine,
      123,
      () => 'visible',
    );

    expect(measurement).toMatchObject({
      result: 'visible',
      actionToVisibleMs: 10,
      frameGapMs: 20,
      frameTimeMs: 30,
    });
    expect(engine.publishFrame).toHaveBeenCalledWith(123);
  });
});
