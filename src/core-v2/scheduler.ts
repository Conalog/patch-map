export interface FrameDriver {
  readonly now: () => number;
  readonly request: (callback: FrameRequestCallback) => number;
  readonly cancel: (handle: number) => void;
}

export interface FrameSchedulerDebug {
  readonly pending: boolean;
  readonly continuous: boolean;
  readonly frameCount: number;
  readonly lastReason: string;
  readonly destroyed: boolean;
}

export interface CoreV2AdaptiveFrameBudgetOptions {
  /** Scene/workload size at which viewport-first publication becomes useful. */
  readonly minimumWorkloadSize?: number;
  /** Active animations at which the larger upload cadence is selected. */
  readonly largeAnimationCount?: number;
  readonly normalPresentationIntervalMs?: number;
  readonly largePresentationIntervalMs?: number;
  readonly normalViewportFramesPerPresentation?: number;
  readonly largeViewportFramesPerPresentation?: number;
  /** Bound a single foreground frame delta without hiding accumulated work. */
  readonly maximumFrameDeltaMs?: number;
}

export interface CoreV2AdaptiveFrameInput {
  readonly wallTimeMs: number;
  readonly activeAnimationCount: number;
  readonly workloadSize: number;
  readonly viewportGestureActive: boolean;
}

export interface CoreV2AdaptiveFramePlan {
  readonly sequence: number;
  readonly wallTimeMs: number;
  readonly activeAnimationCount: number;
  readonly viewportGestureActive: boolean;
  readonly presentationAdvanced: boolean;
  readonly presentationDeltaMs: number;
  readonly deferredPresentationMs: number;
  readonly viewportFramesSincePresentation: number;
}

export interface CoreV2AdaptiveFrameBudgetDebug {
  readonly sequence: number;
  readonly pendingPresentationMs: number;
  readonly viewportFramesSincePresentation: number;
  readonly lastPresentationCompletedAtMs: number | null;
  readonly destroyed: boolean;
}

/**
 * Shared product policy for keeping viewport manipulation responsive while a
 * large aggregate animation would otherwise upload every dirty chunk on every
 * frame. It owns timing only; semantic destinations remain committed by the
 * caller before the first presentation frame.
 */
export class CoreV2AdaptiveFrameBudget {
  private readonly options: Required<CoreV2AdaptiveFrameBudgetOptions>;
  private sequence = 0;
  private lastWallTimeMs: number | null = null;
  private pendingPresentationMs = 0;
  private viewportFramesSincePresentation = 0;
  private lastPresentationCompletedAtMs: number | null = null;
  private destroyed = false;

  public constructor(options: CoreV2AdaptiveFrameBudgetOptions = {}) {
    this.options = Object.freeze({
      minimumWorkloadSize: nonnegativeInteger(
        options.minimumWorkloadSize ?? 2_000,
        'minimumWorkloadSize',
      ),
      largeAnimationCount: nonnegativeInteger(
        options.largeAnimationCount ?? 2_000,
        'largeAnimationCount',
      ),
      normalPresentationIntervalMs: nonnegativeFinite(
        options.normalPresentationIntervalMs ?? 50,
        'normalPresentationIntervalMs',
      ),
      largePresentationIntervalMs: nonnegativeFinite(
        options.largePresentationIntervalMs ?? 75,
        'largePresentationIntervalMs',
      ),
      normalViewportFramesPerPresentation: nonnegativeInteger(
        options.normalViewportFramesPerPresentation ?? 1,
        'normalViewportFramesPerPresentation',
      ),
      largeViewportFramesPerPresentation: nonnegativeInteger(
        options.largeViewportFramesPerPresentation ?? 3,
        'largeViewportFramesPerPresentation',
      ),
      maximumFrameDeltaMs: nonnegativeFinite(
        options.maximumFrameDeltaMs ?? 50,
        'maximumFrameDeltaMs',
      ),
    });
  }

  public plan(input: CoreV2AdaptiveFrameInput): CoreV2AdaptiveFramePlan {
    this.assertAlive();
    const wallTimeMs = finite(input.wallTimeMs, 'wallTimeMs');
    const activeAnimationCount = nonnegativeInteger(
      input.activeAnimationCount,
      'activeAnimationCount',
    );
    const workloadSize = nonnegativeInteger(input.workloadSize, 'workloadSize');
    if (typeof input.viewportGestureActive !== 'boolean') {
      throw new TypeError('viewportGestureActive must be a boolean');
    }
    const rawDeltaMs = this.lastWallTimeMs === null
      ? 0.01
      : Math.max(0.01, wallTimeMs - this.lastWallTimeMs);
    const elapsedMs = Math.min(this.options.maximumFrameDeltaMs, rawDeltaMs);
    this.lastWallTimeMs = wallTimeMs;
    this.sequence += 1;

    const adaptive = (
      input.viewportGestureActive &&
      activeAnimationCount > 0 &&
      workloadSize >= this.options.minimumWorkloadSize
    );
    const large = activeAnimationCount >= this.options.largeAnimationCount;
    const requiredViewportFrames = large
      ? this.options.largeViewportFramesPerPresentation
      : this.options.normalViewportFramesPerPresentation;
    const minimumIntervalMs = large
      ? this.options.largePresentationIntervalMs
      : this.options.normalPresentationIntervalMs;
    const sinceCompleted = this.lastPresentationCompletedAtMs === null
      ? Number.POSITIVE_INFINITY
      : wallTimeMs - this.lastPresentationCompletedAtMs;
    const deferPresentation = adaptive && (
      this.viewportFramesSincePresentation < requiredViewportFrames ||
      sinceCompleted < minimumIntervalMs
    );

    let presentationDeltaMs = elapsedMs;
    if (activeAnimationCount === 0) {
      this.pendingPresentationMs = 0;
      this.viewportFramesSincePresentation = 0;
    } else if (deferPresentation) {
      this.pendingPresentationMs += elapsedMs;
      this.viewportFramesSincePresentation += 1;
      presentationDeltaMs = 0;
    } else {
      presentationDeltaMs += this.pendingPresentationMs;
      this.pendingPresentationMs = 0;
      this.viewportFramesSincePresentation = 0;
    }

    return Object.freeze({
      sequence: this.sequence,
      wallTimeMs,
      activeAnimationCount,
      viewportGestureActive: input.viewportGestureActive,
      presentationAdvanced: presentationDeltaMs > 0,
      presentationDeltaMs,
      deferredPresentationMs: this.pendingPresentationMs,
      viewportFramesSincePresentation: this.viewportFramesSincePresentation,
    });
  }

  public complete(
    plan: CoreV2AdaptiveFramePlan,
    completedAtMs: number,
  ): void {
    this.assertAlive();
    if (plan.sequence !== this.sequence) {
      throw new Error('adaptive frame plans must complete in sequence');
    }
    const completed = finite(completedAtMs, 'completedAtMs');
    if (plan.presentationAdvanced) {
      this.lastPresentationCompletedAtMs = completed;
    }
  }

  public reset(wallTimeMs: number | null = null): void {
    this.assertAlive();
    this.lastWallTimeMs = wallTimeMs === null ? null : finite(wallTimeMs, 'wallTimeMs');
    this.pendingPresentationMs = 0;
    this.viewportFramesSincePresentation = 0;
    this.lastPresentationCompletedAtMs = wallTimeMs;
  }

  public debugSnapshot(): CoreV2AdaptiveFrameBudgetDebug {
    return Object.freeze({
      sequence: this.sequence,
      pendingPresentationMs: this.pendingPresentationMs,
      viewportFramesSincePresentation: this.viewportFramesSincePresentation,
      lastPresentationCompletedAtMs: this.lastPresentationCompletedAtMs,
      destroyed: this.destroyed,
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.pendingPresentationMs = 0;
    this.viewportFramesSincePresentation = 0;
    return true;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('CoreV2AdaptiveFrameBudget is destroyed');
  }
}

export interface CoreV2FrameLoopTarget {
  readonly activeAnimations: number;
  /** O(1) count of source records that can participate in a bulk frame. */
  readonly frameWorkloadSize: number;
  /** Current monotonic product presentation clock. */
  readonly frameTimeMs: number;
  /** Product-owned gesture state; hosts do not mirror pointer bookkeeping. */
  readonly viewportGestureActive: boolean;
  readonly destroyed: boolean;
  publishFrame(timeMs: number): unknown;
}

export interface CoreV2FrameLoopObservation {
  readonly wallTimeMs: number;
  readonly completedAtMs: number;
  readonly logicalTimeMs: number;
  readonly activeAnimationsBefore: number;
  readonly activeAnimationsAfter: number;
  readonly viewportGestureActive: boolean;
  readonly presentationAdvanced: boolean;
  readonly presentationDeltaMs: number;
}

export interface CoreV2FrameLoopDebug {
  readonly pending: boolean;
  readonly paused: boolean;
  readonly viewportGestureActive: boolean;
  readonly workloadSize: number;
  readonly logicalTimeMs: number;
  readonly frameCount: number;
  readonly destroyed: boolean;
  readonly budget: CoreV2AdaptiveFrameBudgetDebug;
}

export interface CoreV2FrameLoopOptions {
  readonly driver?: FrameDriver;
  readonly budget?: CoreV2AdaptiveFrameBudgetOptions;
  readonly onFrame?: (observation: CoreV2FrameLoopObservation) => void;
}

/**
 * One reusable, lifecycle-owned frame loop for CoreV2 and CoreV2Engine. Labs
 * and package consumers supply only activity signals; cadence and animation
 * budgeting stay inside the published library.
 */
export class CoreV2FrameLoop {
  private readonly driver: FrameDriver;
  private readonly budget: CoreV2AdaptiveFrameBudget;
  private readonly onFrame: ((observation: CoreV2FrameLoopObservation) => void) | null;
  private handle: number | null = null;
  private monitorUntilMs = 0;
  private logicalTimeMs: number;
  private frameCount = 0;
  private paused = false;
  private destroyed = false;
  private readonly onAnimationFrame = (wallTimeMs: number): void => {
    this.handle = null;
    if (this.destroyed || this.paused || this.target.destroyed) return;
    this.publishAt(wallTimeMs);
    if (this.shouldContinue()) this.schedule();
  };

  public constructor(
    private readonly target: CoreV2FrameLoopTarget,
    options: CoreV2FrameLoopOptions = {},
  ) {
    this.driver = options.driver ?? browserFrameDriver();
    this.budget = new CoreV2AdaptiveFrameBudget(options.budget);
    this.onFrame = options.onFrame ?? null;
    this.logicalTimeMs = nonnegativeFinite(target.frameTimeMs, 'target.frameTimeMs');
  }

  public request(monitorDurationMs = 0): void {
    this.assertAlive();
    const duration = nonnegativeFinite(monitorDurationMs, 'monitorDurationMs');
    this.monitorUntilMs = Math.max(this.monitorUntilMs, this.driver.now() + duration);
    if (!this.paused && !this.target.destroyed) this.schedule();
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  public get isDestroyed(): boolean {
    return this.destroyed;
  }

  public publishNow(): CoreV2FrameLoopObservation | null {
    this.assertAlive();
    if (this.paused || this.target.destroyed) return null;
    if (this.handle !== null) {
      this.driver.cancel(this.handle);
      this.handle = null;
    }
    const observation = this.publishAt(this.driver.now());
    if (this.shouldContinue()) this.schedule();
    return observation;
  }

  /**
   * Align the loop after an explicit lifecycle clock transition without
   * publishing an extra frame or integrating the hidden wall-clock gap.
   */
  public synchronizeLogicalTime(timeMs: number): void {
    this.assertAlive();
    this.logicalTimeMs = nonnegativeFinite(timeMs, 'timeMs');
    this.budget.reset(this.driver.now());
  }

  public pause(): boolean {
    this.assertAlive();
    if (this.paused) return false;
    this.paused = true;
    this.cancelPending();
    this.budget.reset();
    return true;
  }

  public resume(monitorDurationMs = 0): boolean {
    this.assertAlive();
    if (!this.paused) return false;
    this.paused = false;
    this.budget.reset();
    this.request(monitorDurationMs);
    return true;
  }

  public debugSnapshot(): CoreV2FrameLoopDebug {
    return Object.freeze({
      pending: this.handle !== null,
      paused: this.paused,
      viewportGestureActive: this.target.viewportGestureActive,
      workloadSize: this.target.frameWorkloadSize,
      logicalTimeMs: this.logicalTimeMs,
      frameCount: this.frameCount,
      destroyed: this.destroyed,
      budget: this.budget.debugSnapshot(),
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.cancelPending();
    this.monitorUntilMs = 0;
    this.budget.destroy();
    return true;
  }

  private publishAt(wallTimeMs: number): CoreV2FrameLoopObservation {
    const activeAnimationsBefore = this.target.activeAnimations;
    const plan = this.budget.plan({
      wallTimeMs,
      activeAnimationCount: activeAnimationsBefore,
      workloadSize: this.target.frameWorkloadSize,
      viewportGestureActive: this.target.viewportGestureActive,
    });
    this.logicalTimeMs += plan.presentationDeltaMs;
    this.target.publishFrame(this.logicalTimeMs);
    const completedAtMs = this.driver.now();
    this.budget.complete(plan, completedAtMs);
    this.frameCount += 1;
    const observation = Object.freeze({
      wallTimeMs,
      completedAtMs,
      logicalTimeMs: this.logicalTimeMs,
      activeAnimationsBefore,
      activeAnimationsAfter: this.target.activeAnimations,
      viewportGestureActive: this.target.viewportGestureActive,
      presentationAdvanced: plan.presentationAdvanced,
      presentationDeltaMs: plan.presentationDeltaMs,
    });
    this.onFrame?.(observation);
    return observation;
  }

  private shouldContinue(): boolean {
    return (
      !this.destroyed &&
      !this.paused &&
      !this.target.destroyed &&
      (
        this.target.activeAnimations > 0 ||
        this.target.viewportGestureActive ||
        this.driver.now() < this.monitorUntilMs
      )
    );
  }

  private schedule(): void {
    if (this.handle !== null || this.destroyed || this.paused || this.target.destroyed) return;
    this.handle = this.driver.request(this.onAnimationFrame);
  }

  private cancelPending(): boolean {
    if (this.handle === null) return false;
    this.driver.cancel(this.handle);
    this.handle = null;
    return true;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('CoreV2FrameLoop is destroyed');
  }
}

export class InvalidationScheduler {
  private readonly driver: FrameDriver;
  private readonly render: (timeMs: number) => boolean;
  private handle: number | null = null;
  private continuous = false;
  private frameCount = 0;
  private lastReason = 'init';
  private destroyed = false;
  private readonly onFrame = (timeMs: number): void => {
    this.handle = null;
    if (this.destroyed) return;
    this.frameCount += 1;
    const continueRendering = this.render(timeMs);
    if (this.continuous || continueRendering) this.schedule();
  };

  public constructor(render: (timeMs: number) => boolean, driver = browserFrameDriver()) {
    this.render = render;
    this.driver = driver;
  }

  public invalidate(reason: string): void {
    if (this.destroyed) return;
    this.lastReason = reason;
    this.schedule();
  }

  public setContinuous(value: boolean, reason: string): void {
    if (this.destroyed || this.continuous === value) return;
    this.continuous = value;
    this.lastReason = reason;
    if (value) this.schedule();
  }

  public flushNow(reason = 'manual'): void {
    if (this.destroyed) return;
    this.lastReason = reason;
    if (this.handle !== null) {
      this.driver.cancel(this.handle);
      this.handle = null;
    }
    this.frameCount += 1;
    const continueRendering = this.render(this.driver.now());
    if (this.continuous || continueRendering) this.schedule();
  }

  public cancelPending(): boolean {
    if (this.handle === null) return false;
    this.driver.cancel(this.handle);
    this.handle = null;
    return true;
  }

  public debugSnapshot(): FrameSchedulerDebug {
    return Object.freeze({
      pending: this.handle !== null,
      continuous: this.continuous,
      frameCount: this.frameCount,
      lastReason: this.lastReason,
      destroyed: this.destroyed,
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.continuous = false;
    this.cancelPending();
    return true;
  }

  private schedule(): void {
    if (this.handle !== null || this.destroyed) return;
    this.handle = this.driver.request(this.onFrame);
  }
}

export function browserFrameDriver(): FrameDriver {
  const fallback = fallbackFrameDriver();
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  if (typeof request !== 'function' || typeof cancel !== 'function') return fallback;
  return {
    now: () => globalThis.performance?.now() ?? Date.now(),
    request: (callback) => request(callback),
    cancel: (handle) => cancel(handle),
  };
}

function fallbackFrameDriver(): FrameDriver {
  let nextHandle = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  return {
    now: () => globalThis.performance?.now() ?? Date.now(),
    request: (callback) => {
      const handle = nextHandle++;
      const timer = setTimeout(() => {
        timers.delete(handle);
        callback(globalThis.performance?.now() ?? Date.now());
      }, 16);
      timers.set(handle, timer);
      return handle;
    },
    cancel: (handle) => {
      const timer = timers.get(handle);
      if (timer) clearTimeout(timer);
      timers.delete(handle);
    },
  };
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function nonnegativeFinite(value: number, name: string): number {
  const normalized = finite(value, name);
  if (normalized < 0) throw new RangeError(`${name} must be nonnegative`);
  return normalized;
}

function nonnegativeInteger(value: number, name: string): number {
  const normalized = nonnegativeFinite(value, name);
  if (!Number.isSafeInteger(normalized)) {
    throw new RangeError(`${name} must be a safe integer`);
  }
  return normalized;
}
