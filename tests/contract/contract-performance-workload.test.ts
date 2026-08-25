import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PATCH_MAP_CONTRACT_PERFORMANCE_SIZES,
  buildPatchMapContractPerformanceDataset,
  canonicalPatchMapDatasetSha256,
  classifyPatchMapTextUpdatePublication,
  patchMapPerformancePercentile,
  countPatchMapLongTasksAtLeast,
  measurePatchMapVisibleAction,
  validatePatchMapContractPerformanceDataset,
} from '../../performance/contract-workload';
import type { PatchMap } from '../../src/patch-map/engine';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PatchMap contract performance workload', () => {
  it('builds deterministic detached frozen synthetic PATCH MAP input', () => {
    const first = buildPatchMapContractPerformanceDataset(100, 319);
    const second = buildPatchMapContractPerformanceDataset(100, 319);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(validatePatchMapContractPerformanceDataset(first)).toMatchObject({
      rootCount: 100,
      elementCount: 100,
      componentCount: 300,
    });
  });

  it('binds the approved production-shaped matrix row to its canonical SHA-256', async () => {
    const production = buildPatchMapContractPerformanceDataset(
      'production-shaped-workload-v1',
      319,
    );

    expect(PATCH_MAP_CONTRACT_PERFORMANCE_SIZES).toEqual([
      100,
      500,
      1_000,
      2_000,
      5_000,
      'production-shaped-workload-v1',
    ]);
    expect(await canonicalPatchMapDatasetSha256(production)).toBe(
      'e9d91e96f239663a88f54ce54a8dcb933f813d5b156d734a99c20d1ae2a749fa',
    );
    expect(validatePatchMapContractPerformanceDataset(production)).toMatchObject({
      rootCount: 21,
      strictReferenceDiagnostics: [{
        code: 'MISSING_TARGET',
        datasetPath: '$[20].children[0].links[0].source',
      }],
    });
  });

  it('keeps threshold and nearest-rank percentile accounting explicit', () => {
    expect(countPatchMapLongTasksAtLeast([99.9, 100, 140], 100)).toBe(2);
    expect(patchMapPerformancePercentile([1, 2, 3, 4, 5, 6, 7], 0.95)).toBe(7);
    expect(patchMapPerformancePercentile([], 0.95)).toBe(0);
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
    } as unknown as PatchMap;

    const measurement = await measurePatchMapVisibleAction(
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

  it('distinguishes current offscreen text attachments from visible stale frames', () => {
    const pendingAttached = {
      entityId: 'node-99::text:label',
      publication: { status: 'pending' },
      renderer: {
        plannedRoute: 'pixi-text',
        attachedRoute: 'pixi-text',
        objectKind: 'pixi-text',
        objectCount: 1,
        semanticSignatures: { content: 'next', style: 'style', layout: 'layout' },
        attachedSignatures: {
          content: 'next',
          style: 'style',
          layout: 'layout',
          renderer: 'fallback:next',
        },
      },
      rendererPaint: null,
    } as const;
    const viewport = [0, 0, 800, 600] as const;

    expect(classifyPatchMapTextUpdatePublication(
      pendingAttached as never,
      { screenBounds: [2_000, 2_000, 80, 20] },
      viewport,
    )).toEqual({
      visibleFrameRequired: false,
      attachmentCurrent: true,
      staleLayout: false,
      unresolvedPaintIntent: false,
    });
    expect(classifyPatchMapTextUpdatePublication(
      pendingAttached as never,
      { screenBounds: [100, 100, 80, 20] },
      viewport,
    )).toMatchObject({
      visibleFrameRequired: true,
      staleLayout: true,
      unresolvedPaintIntent: true,
    });
    expect(classifyPatchMapTextUpdatePublication(
      {
        ...pendingAttached,
        renderer: {
          ...pendingAttached.renderer,
          attachedSignatures: {
            ...pendingAttached.renderer.attachedSignatures,
            content: 'old',
          },
        },
      } as never,
      { screenBounds: [2_000, 2_000, 80, 20] },
      viewport,
    )).toMatchObject({
      visibleFrameRequired: false,
      attachmentCurrent: false,
      unresolvedPaintIntent: true,
    });
  });
});
