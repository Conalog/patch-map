import { describe, expect, it, vi } from 'vitest';

import {
  PatchMapAdaptiveFrameBudget,
  PatchMapFrameLoop,
  InvalidationScheduler,
  type PatchMapFrameLoopTarget,
  type FrameDriver,
} from '../../src/patch-map/scheduler';

function fakeDriver(): FrameDriver & { fire(time: number): void; pending(): number } {
  let nextHandle = 1;
  let currentTime = 42;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    now: () => currentTime,
    request: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => callbacks.delete(handle),
    fire: (time) => {
      const entry = callbacks.entries().next().value;
      if (!entry) throw new Error('no pending frame');
      callbacks.delete(entry[0]);
      currentTime = time;
      entry[1](time);
    },
    pending: () => callbacks.size,
  };
}

describe('InvalidationScheduler', () => {
  it('coalesces idle invalidations into one frame', () => {
    const driver = fakeDriver();
    const render = vi.fn(() => false);
    const scheduler = new InvalidationScheduler(render, driver);
    scheduler.invalidate('load');
    scheduler.invalidate('selection');
    expect(driver.pending()).toBe(1);
    driver.fire(10);
    expect(render).toHaveBeenCalledOnce();
    expect(driver.pending()).toBe(0);
    expect(scheduler.debugSnapshot().lastReason).toBe('selection');
  });

  it('runs continuously only while the owner requests more frames', () => {
    const driver = fakeDriver();
    let remaining = 2;
    const scheduler = new InvalidationScheduler(() => --remaining > 0, driver);
    scheduler.invalidate('animation');
    driver.fire(10);
    expect(driver.pending()).toBe(1);
    driver.fire(20);
    expect(driver.pending()).toBe(0);
    scheduler.setContinuous(true, 'gesture');
    driver.fire(30);
    expect(driver.pending()).toBe(1);
    scheduler.setContinuous(false, 'gesture-end');
    driver.fire(40);
    expect(driver.pending()).toBe(0);
  });

  it('cancels the only pending callback on destroy', () => {
    const driver = fakeDriver();
    const scheduler = new InvalidationScheduler(() => false, driver);
    scheduler.invalidate('resize');
    expect(scheduler.destroy()).toBe(true);
    expect(driver.pending()).toBe(0);
    expect(scheduler.destroy()).toBe(false);
  });

  it('lets an owner cancel a pending frame without rendering it', () => {
    const driver = fakeDriver();
    const render = vi.fn(() => false);
    const scheduler = new InvalidationScheduler(render, driver);
    scheduler.invalidate('manual-control');
    expect(scheduler.cancelPending()).toBe(true);
    expect(scheduler.cancelPending()).toBe(false);
    expect(driver.pending()).toBe(0);
    expect(render).not.toHaveBeenCalled();
  });
});

describe('PatchMapAdaptiveFrameBudget', () => {
  it('publishes viewport-only frames before the next large presentation upload', () => {
    const budget = new PatchMapAdaptiveFrameBudget();
    const inputs = [0, 16, 32].map((wallTimeMs) =>
      budget.plan({
        wallTimeMs,
        activeAnimationCount: 5_000,
        workloadSize: 5_000,
        viewportGestureActive: true,
      }));

    expect(inputs.map(({ presentationAdvanced }) => presentationAdvanced))
      .toEqual([false, false, false]);
    expect(inputs.at(-1)?.viewportFramesSincePresentation).toBe(3);

    const presentation = budget.plan({
      wallTimeMs: 80,
      activeAnimationCount: 5_000,
      workloadSize: 5_000,
      viewportGestureActive: true,
    });
    expect(presentation.presentationAdvanced).toBe(true);
    expect(presentation.presentationDeltaMs).toBeGreaterThan(79);
    expect(presentation.deferredPresentationMs).toBe(0);
    budget.complete(presentation, 92);

    const next = budget.plan({
      wallTimeMs: 96,
      activeAnimationCount: 5_000,
      workloadSize: 5_000,
      viewportGestureActive: true,
    });
    expect(next.presentationAdvanced).toBe(false);
  });

  it('catches up deferred animation time as soon as the viewport gesture ends', () => {
    const budget = new PatchMapAdaptiveFrameBudget();
    const deferred = budget.plan({
      wallTimeMs: 10,
      activeAnimationCount: 500,
      workloadSize: 5_000,
      viewportGestureActive: true,
    });
    expect(deferred.presentationAdvanced).toBe(false);

    const resumed = budget.plan({
      wallTimeMs: 26,
      activeAnimationCount: 500,
      workloadSize: 5_000,
      viewportGestureActive: false,
    });
    expect(resumed.presentationAdvanced).toBe(true);
    expect(resumed.presentationDeltaMs).toBeCloseTo(16.01, 5);
  });
});

describe('PatchMapFrameLoop', () => {
  it('owns one RAF and applies the shared viewport-first budget to a target', () => {
    const driver = fakeDriver();
    const published: number[] = [];
    let animations = 5_000;
    let gestureActive = true;
    let destroyed = false;
    const target: PatchMapFrameLoopTarget = {
      get activeAnimations() {
        return animations;
      },
      frameWorkloadSize: 5_000,
      frameTimeMs: 0,
      get viewportGestureActive() {
        return gestureActive;
      },
      get destroyed() {
        return destroyed;
      },
      publishFrame: (timeMs) => {
        published.push(timeMs);
      },
    };
    const loop = new PatchMapFrameLoop(target, { driver });
    loop.request();
    expect(driver.pending()).toBe(1);

    driver.fire(0);
    driver.fire(16);
    driver.fire(32);
    expect(published).toEqual([0, 0, 0]);

    driver.fire(80);
    expect(published[3]).toBeGreaterThan(79);
    expect(driver.pending()).toBe(1);

    animations = 0;
    gestureActive = false;
    loop.request();
    driver.fire(96);
    expect(driver.pending()).toBe(0);
    expect(loop.debugSnapshot().frameCount).toBe(5);

    destroyed = true;
    expect(loop.destroy()).toBe(true);
    expect(loop.destroy()).toBe(false);
  });

  it('cancels pending ownership while paused and after destroy', () => {
    const driver = fakeDriver();
    const target: PatchMapFrameLoopTarget = {
      activeAnimations: 0,
      frameWorkloadSize: 0,
      frameTimeMs: 0,
      viewportGestureActive: false,
      destroyed: false,
      publishFrame: vi.fn(),
    };
    const loop = new PatchMapFrameLoop(target, { driver });
    expect(loop.isPaused).toBe(false);
    expect(loop.isDestroyed).toBe(false);
    loop.request(100);
    expect(driver.pending()).toBe(1);
    expect(loop.pause()).toBe(true);
    expect(loop.isPaused).toBe(true);
    expect(driver.pending()).toBe(0);
    expect(loop.resume(100)).toBe(true);
    expect(loop.isPaused).toBe(false);
    expect(driver.pending()).toBe(1);
    expect(loop.destroy()).toBe(true);
    expect(loop.isDestroyed).toBe(true);
    expect(driver.pending()).toBe(0);
  });

  it('continues from the target clock when ownership starts after manual frames', () => {
    const driver = fakeDriver();
    const published: number[] = [];
    let animations = 1;
    const target: PatchMapFrameLoopTarget = {
      get activeAnimations() {
        return animations;
      },
      frameWorkloadSize: 1,
      frameTimeMs: 250,
      viewportGestureActive: false,
      destroyed: false,
      publishFrame: (timeMs) => {
        published.push(timeMs);
        animations = 0;
      },
    };
    const loop = new PatchMapFrameLoop(target, { driver });

    loop.request();
    driver.fire(300);

    expect(published).toEqual([250.01]);
    expect(loop.debugSnapshot()).toMatchObject({
      logicalTimeMs: 250.01,
      pending: false,
    });
  });
});
