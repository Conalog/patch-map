import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PATCH_MAP_PAGE_LIFECYCLE_REVISION,
  PatchMap,
  PatchMapPageLifecycleAuthority,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapPresentationLifecycleResult,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceView,
} from '../../src/patch-map';

describe('PatchMap page lifecycle authority', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('invalidates cancellable work generations and accepts only authoritative tokens', () => {
    const authority = new PatchMapPageLifecycleAuthority();
    const asset = authority.register('asset', 'asset-a');
    const extraction = authority.register('extraction', 'extract-a');

    expect(authority.probe()).toMatchObject({
      schemaRevision: PATCH_MAP_PAGE_LIFECYCLE_REVISION,
      state: 'visible',
      pendingAssetCount: 1,
      pendingExtractionCount: 1,
    });
    const hidden = authority.transition('hidden', 40);
    expect(hidden).toMatchObject({
      changed: true,
      cancelledAssetCount: 1,
      cancelledExtractionCount: 1,
      probe: {
        pendingWorkCount: 0,
        cancelledAssetCount: 1,
        cancelledExtractionCount: 1,
      },
    });
    expect(authority.complete(asset)).toMatchObject({
      status: 'obsolete',
      applied: false,
    });
    expect(authority.complete({ ...extraction })).toMatchObject({
      status: 'rejected',
      applied: false,
    });
    expect(authority.transition('visible', 10_040).probe).toMatchObject({
      resumeFramePending: true,
      resumePublishedFrameCount: 0,
    });
    expect(authority.publishedFrame()).toBe(true);
    expect(authority.publishedFrame()).toBe(false);
    expect(authority.probe()).toMatchObject({
      resumeFramePending: false,
      resumePublishedFrameCount: 1,
      obsoleteCompletionCount: 1,
    });
  });

  it('cancels motion and root gesture ownership and publishes one resume frame', async () => {
    const surface = new PageLifecycleSurface();
    const engine = new PatchMap({
      surfaceFactory: (_options: PatchMapSurfaceOptions) => Promise.resolve(surface),
    });
    engines.push(engine);
    await engine.initialize({
      instanceId: 'page-lifecycle',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });
    engine.loadDataset(catalogProfiles.datasets['interactive-scene'], {
      datasetRef: 'interactive-scene',
    });
    engine.publishFrame(0);

    engine.registerPageLifecycleWork({
      kind: 'asset',
      requestId: 'asset-before-suspend',
    });
    engine.registerPageLifecycleWork({
      kind: 'extraction',
      requestId: 'extract-before-suspend',
    });
    expect(engine.startViewportDeceleration([0.18, -0.06])).toBe(true);
    engine.dispatchPointerInput(pointerDown(1));
    engine.beginOwnedPointerGesture('move', 1);
    surface.activeAnimationCount = 1;

    expect(engine.pageLifecycleProbe()).toMatchObject({
      state: 'visible',
      pendingAssetCount: 1,
      pendingExtractionCount: 1,
      decelerationActive: true,
      activeGestureCount: 1,
      pointerCaptureCount: 1,
      activeAnimationCount: 1,
    });

    const hidden = engine.setDocumentVisibility({ state: 'hidden', timeMs: 40 });
    expect(hidden).toMatchObject({
      transition: {
        changed: true,
        cancelledAssetCount: 1,
        cancelledExtractionCount: 1,
      },
      presentation: {
        state: 'suspended',
        timeMs: 40,
        settledCount: 1,
        activeAnimationCount: 0,
      },
      probe: {
        state: 'hidden',
        pendingAssetCount: 0,
        pendingExtractionCount: 0,
        decelerationActive: false,
        activeGestureCount: 0,
        pointerCaptureCount: 0,
        activeAnimationCount: 0,
      },
    });
    expect(() => engine.registerPageLifecycleWork({
      kind: 'asset',
      requestId: 'hidden-work',
    })).toThrow(/visible document/u);
    const frameBeforeResume = engine.snapshot().frameRevision;
    engine.publishFrame(1_000);
    expect(engine.snapshot().frameRevision).toBe(frameBeforeResume);

    expect(engine.setDocumentVisibility({
      state: 'visible',
      timeMs: 10_040,
    }).probe).toMatchObject({
      state: 'visible',
      resumeFramePending: true,
      resumePublishedFrameCount: 0,
    });
    engine.publishFrame(10_056.666667);
    engine.publishFrame(10_073.333334);
    expect(engine.pageLifecycleProbe()).toMatchObject({
      resumeFramePending: false,
      resumePublishedFrameCount: 1,
      obsoleteCompletionCount: 0,
    });
    expect(surface.suspendCount).toBe(1);
    expect(surface.resumeCount).toBe(1);
  });

  it('does not transition lifecycle state when the presentation surface rejects suspension', async () => {
    const surface = new PageLifecycleSurface();
    surface.rejectSuspend = true;
    const engine = new PatchMap({
      surfaceFactory: (_options: PatchMapSurfaceOptions) => Promise.resolve(surface),
    });
    engines.push(engine);
    await engine.initialize({
      instanceId: 'page-lifecycle-atomic-failure',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });
    const token = engine.registerPageLifecycleWork({
      kind: 'asset',
      requestId: 'asset-retained-after-rejection',
    });

    expect(() => engine.setDocumentVisibility({
      state: 'hidden',
      timeMs: 40,
    })).toThrow(/surface suspension rejected/u);
    expect(engine.pageLifecycleProbe()).toMatchObject({
      state: 'visible',
      clockMs: 0,
      lifecycleGeneration: 1,
      pendingAssetCount: 1,
      cancelledAssetCount: 0,
    });
    expect(engine.completePageLifecycleWork(token)).toMatchObject({
      status: 'completed',
      applied: true,
    });
  });
});

class PageLifecycleSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public activeAnimationCount = 0;
  public suspendCount = 0;
  public resumeCount = 0;
  public rejectSuspend = false;
  private view: PatchMapSurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  });

  public load(_input: unknown): void {}
  public publishFrame(_timeMs: number): void {}
  public resize(_width: number, _height: number, _pixelRatio: number): boolean {
    return false;
  }
  public setView(view: PatchMapSurfaceView): void {
    this.view = Object.freeze({ ...view });
  }
  public select(_ids: readonly string[]): void {}
  public hitTestScreen(_point: PatchMapPoint): string | null {
    return 'rect-b';
  }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }
  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([800, 600] as const),
      backingSize: Object.freeze([800, 600] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: this.activeAnimationCount,
      activeGestureCount: 0,
      renderCommandCount: 1,
      visiblePrimitiveCount: 1,
    });
  }
  public suspendPresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    if (this.rejectSuspend) throw new Error('surface suspension rejected');
    this.suspendCount += 1;
    const settledCount = this.activeAnimationCount;
    this.activeAnimationCount = 0;
    return Object.freeze({
      state: 'suspended',
      timeMs,
      settledCount,
      activeAnimationCount: 0,
    });
  }
  public resumePresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    this.resumeCount += 1;
    return Object.freeze({
      state: 'running',
      timeMs,
      settledCount: 0,
      activeAnimationCount: this.activeAnimationCount,
    });
  }
  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

function pointerDown(pointerId: number) {
  return Object.freeze({
    type: 'down' as const,
    pointerId,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    screen: Object.freeze([10, 10] as const),
    timeMs: 10,
    modifiers: Object.freeze({
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
    }),
  });
}
