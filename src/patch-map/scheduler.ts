import {
  PatchMapAdaptiveFrameBudget,
  nonnegativeFinite,
} from './scheduler/adaptive-frame-budget';
import type {
  FrameDriver,
  FrameSchedulerDebug,
  PatchMapFrameLoopDebug,
  PatchMapFrameLoopObservation,
  PatchMapFrameLoopOptions,
  PatchMapFrameLoopTarget,
} from './scheduler/contracts';
import { browserFrameDriver } from './scheduler/frame-driver';

export { PatchMapAdaptiveFrameBudget } from './scheduler/adaptive-frame-budget';
export type * from './scheduler/contracts';
export { browserFrameDriver } from './scheduler/frame-driver';

/**
 * One reusable, lifecycle-owned frame loop for PatchMapRuntime and PatchMap. Labs
 * and package consumers supply only activity signals; cadence and animation
 * budgeting stay inside the published library.
 */
export class PatchMapFrameLoop {
  private readonly driver: FrameDriver;
  private readonly budget: PatchMapAdaptiveFrameBudget;
  private readonly onFrame: ((observation: PatchMapFrameLoopObservation) => void) | null;
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
    private readonly target: PatchMapFrameLoopTarget,
    options: PatchMapFrameLoopOptions = {},
  ) {
    this.driver = options.driver ?? browserFrameDriver();
    this.budget = new PatchMapAdaptiveFrameBudget(options.budget);
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

  public publishNow(): PatchMapFrameLoopObservation | null {
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

  public debugSnapshot(): PatchMapFrameLoopDebug {
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

  private publishAt(wallTimeMs: number): PatchMapFrameLoopObservation {
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
    if (this.destroyed) throw new Error('PatchMapFrameLoop is destroyed');
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
