import { describe, expect, it, vi } from 'vitest';

import { InvalidationScheduler, type FrameDriver } from '../../src/core-v2/scheduler';

function fakeDriver(): FrameDriver & { fire(time: number): void; pending(): number } {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    now: () => 42,
    request: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => callbacks.delete(handle),
    fire: (time) => {
      const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) throw new Error('no pending frame');
      callbacks.delete(entry[0]);
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
