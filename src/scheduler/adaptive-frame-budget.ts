import type {
  PatchMapAdaptiveFrameBudgetDebug,
  PatchMapAdaptiveFrameBudgetOptions,
  PatchMapAdaptiveFrameInput,
  PatchMapAdaptiveFramePlan,
} from './contracts';

/**
 * Shared product policy for keeping viewport manipulation responsive while a
 * large aggregate animation would otherwise upload every dirty chunk on every
 * frame. It owns timing only; semantic destinations remain committed by the
 * caller before the first presentation frame.
 */
export class PatchMapAdaptiveFrameBudget {
  private readonly options: Required<PatchMapAdaptiveFrameBudgetOptions>;
  private sequence = 0;
  private lastWallTimeMs: number | null = null;
  private pendingPresentationMs = 0;
  private viewportFramesSincePresentation = 0;
  private lastPresentationCompletedAtMs: number | null = null;
  private destroyed = false;

  public constructor(options: PatchMapAdaptiveFrameBudgetOptions = {}) {
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

  public plan(input: PatchMapAdaptiveFrameInput): PatchMapAdaptiveFramePlan {
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
    plan: PatchMapAdaptiveFramePlan,
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

  public debugSnapshot(): PatchMapAdaptiveFrameBudgetDebug {
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
    if (this.destroyed) throw new Error('PatchMapAdaptiveFrameBudget is destroyed');
  }
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

export function nonnegativeFinite(value: number, name: string): number {
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
