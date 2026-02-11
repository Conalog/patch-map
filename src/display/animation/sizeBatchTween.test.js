import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSizeBatcher } from './sizeBatchTween';

const gsapState = {
  tweens: [],
};

vi.mock('gsap', () => {
  const parseEase = vi.fn(() => (progress) => progress);

  const to = vi.fn((target, config) => {
    const tween = {
      _duration: config.duration,
      duration: vi.fn((nextDuration) => {
        if (typeof nextDuration === 'number') {
          tween._duration = nextDuration;
          return tween;
        }
        return tween._duration;
      }),
      kill: vi.fn(),
      tick: (progress) => {
        target.t = progress;
        config.onUpdate?.();
      },
      complete: () => {
        config.onComplete?.();
      },
      interrupt: () => {
        config.onInterrupt?.();
      },
    };

    gsapState.tweens.push({ target, config, tween });
    return tween;
  });

  return {
    default: { parseEase, to },
  };
});

const createTarget = () => {
  const target = {
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    destroyed: false,
    setSize: vi.fn((width, height) => {
      target.width = width;
      target.height = height;
    }),
    position: {
      set: vi.fn((x, y) => {
        target.x = x;
        target.y = y;
      }),
    },
  };

  return target;
};

const immediateAnimationContext = () => ({
  add: vi.fn((callback) => callback()),
});

describe('sizeBatchTween', () => {
  beforeEach(() => {
    gsapState.tweens.length = 0;
    vi.clearAllMocks();
  });

  it('returns null when store has no animation context', () => {
    expect(getSizeBatcher({})).toBeNull();
  });

  it('caches batcher per animation context', () => {
    const store = { animationContext: immediateAnimationContext() };

    const first = getSizeBatcher(store);
    const second = getSizeBatcher(store);

    expect(first).toBe(second);
  });

  it('applies end state immediately when duration is zero', () => {
    const batcher = getSizeBatcher({
      animationContext: immediateAnimationContext(),
    });
    const target = createTarget();
    const onDone = vi.fn();

    const job = batcher.enqueue({
      target,
      from: { w: 10, h: 20, x: 5, y: 6 },
      to: { w: 100, h: 200, x: 50, y: 60 },
      durationMs: 0,
      ease: 'none',
      onDone,
    });

    expect(job.done).toBe(true);
    expect(target.setSize).toHaveBeenCalledWith(100, 200);
    expect(target.position.set).toHaveBeenCalledWith(50, 60);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(gsapState.tweens).toHaveLength(0);
  });

  it('interpolates state on update ticks and completes once', () => {
    const batcher = getSizeBatcher({
      animationContext: immediateAnimationContext(),
    });
    const target = createTarget();
    const onDone = vi.fn();
    const onUpdate = vi.fn();

    const job = batcher.enqueue({
      target,
      from: { w: 0, h: 0, x: 0, y: 0 },
      to: { w: 100, h: 80, x: 40, y: 20 },
      durationMs: 1000,
      ease: 'none',
      onUpdate,
      onDone,
    });

    const [{ tween }] = gsapState.tweens;

    tween.tick(0.5);
    expect(target.setSize).toHaveBeenLastCalledWith(50, 40);
    expect(target.position.set).toHaveBeenLastCalledWith(20, 10);
    expect(onUpdate).toHaveBeenLastCalledWith({
      state: { w: 50, h: 40, x: 20, y: 10 },
      progress: 0.5,
    });
    expect(job.done).toBe(false);

    tween.tick(1);
    expect(job.done).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);

    tween.complete();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips position writes when positionMode is external', () => {
    const batcher = getSizeBatcher({
      animationContext: immediateAnimationContext(),
    });
    const target = createTarget();

    batcher.enqueue({
      target,
      from: { w: 0, h: 0, x: 10, y: 20 },
      to: { w: 100, h: 80, x: 40, y: 60 },
      durationMs: 1000,
      ease: 'none',
      positionMode: 'external',
    });

    const [{ tween }] = gsapState.tweens;
    tween.tick(0.5);

    expect(target.setSize).toHaveBeenLastCalledWith(50, 40);
    expect(target.position.set).not.toHaveBeenCalled();
  });

  it('cancels job without applying end state by default', () => {
    const batcher = getSizeBatcher({
      animationContext: immediateAnimationContext(),
    });
    const target = createTarget();
    const onDone = vi.fn();

    const job = batcher.enqueue({
      target,
      from: { w: 0, h: 0, x: 0, y: 0 },
      to: { w: 100, h: 80, x: 40, y: 20 },
      durationMs: 1000,
      ease: 'none',
      onDone,
    });

    batcher.cancel(job);

    expect(job.done).toBe(true);
    expect(target.setSize).not.toHaveBeenCalled();
    expect(target.position.set).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cancels job and applies end state when applyToEnd is true', () => {
    const batcher = getSizeBatcher({
      animationContext: immediateAnimationContext(),
    });
    const target = createTarget();
    const onDone = vi.fn();

    const job = batcher.enqueue({
      target,
      from: { w: 0, h: 0, x: 0, y: 0 },
      to: { w: 100, h: 80, x: 40, y: 20 },
      durationMs: 1000,
      ease: 'none',
      onDone,
    });

    batcher.cancel(job, { applyToEnd: true });

    expect(job.done).toBe(true);
    expect(target.setSize).toHaveBeenCalledWith(100, 80);
    expect(target.position.set).toHaveBeenCalledWith(40, 20);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('marks job done when target is destroyed during batch update', () => {
    const batcher = getSizeBatcher({
      animationContext: immediateAnimationContext(),
    });
    const target = createTarget();
    const onDone = vi.fn();

    const job = batcher.enqueue({
      target,
      from: { w: 0, h: 0, x: 0, y: 0 },
      to: { w: 100, h: 80, x: 40, y: 20 },
      durationMs: 1000,
      ease: 'none',
      onDone,
    });

    target.destroyed = true;
    const [{ tween }] = gsapState.tweens;

    tween.tick(0.2);

    expect(job.done).toBe(true);
    expect(target.setSize).not.toHaveBeenCalled();
    expect(target.position.set).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('extends running batch duration when a longer job is enqueued', () => {
    const batcher = getSizeBatcher({
      animationContext: immediateAnimationContext(),
    });

    const firstTarget = createTarget();
    const secondTarget = createTarget();

    const firstJob = batcher.enqueue({
      target: firstTarget,
      from: { w: 0, h: 0, x: 0, y: 0 },
      to: { w: 10, h: 10, x: 10, y: 10 },
      durationMs: 500,
      ease: 'none',
    });

    const [{ tween }] = gsapState.tweens;
    expect(gsapState.tweens).toHaveLength(1);
    expect(tween._duration).toBe(0.5);

    const secondJob = batcher.enqueue({
      target: secondTarget,
      from: { w: 0, h: 0, x: 0, y: 0 },
      to: { w: 20, h: 20, x: 20, y: 20 },
      durationMs: 1000,
      ease: 'none',
    });

    expect(gsapState.tweens).toHaveLength(1);
    expect(tween.duration).toHaveBeenCalledWith(1);

    tween.tick(0.5);
    expect(firstJob.done).toBe(true);
    expect(secondJob.done).toBe(false);

    tween.tick(1);
    expect(secondJob.done).toBe(true);
  });
});
