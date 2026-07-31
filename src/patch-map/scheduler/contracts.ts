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

export interface PatchMapAdaptiveFrameBudgetOptions {
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

export interface PatchMapAdaptiveFrameInput {
  readonly wallTimeMs: number;
  readonly activeAnimationCount: number;
  readonly workloadSize: number;
  readonly viewportGestureActive: boolean;
}

export interface PatchMapAdaptiveFramePlan {
  readonly sequence: number;
  readonly wallTimeMs: number;
  readonly activeAnimationCount: number;
  readonly viewportGestureActive: boolean;
  readonly presentationAdvanced: boolean;
  readonly presentationDeltaMs: number;
  readonly deferredPresentationMs: number;
  readonly viewportFramesSincePresentation: number;
}

export interface PatchMapAdaptiveFrameBudgetDebug {
  readonly sequence: number;
  readonly pendingPresentationMs: number;
  readonly viewportFramesSincePresentation: number;
  readonly lastPresentationCompletedAtMs: number | null;
  readonly destroyed: boolean;
}

export interface PatchMapFrameLoopTarget {
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

export interface PatchMapFrameLoopObservation {
  readonly wallTimeMs: number;
  readonly completedAtMs: number;
  readonly logicalTimeMs: number;
  readonly activeAnimationsBefore: number;
  readonly activeAnimationsAfter: number;
  readonly viewportGestureActive: boolean;
  readonly presentationAdvanced: boolean;
  readonly presentationDeltaMs: number;
}

export interface PatchMapFrameLoopDebug {
  readonly pending: boolean;
  readonly paused: boolean;
  readonly viewportGestureActive: boolean;
  readonly workloadSize: number;
  readonly logicalTimeMs: number;
  readonly frameCount: number;
  readonly destroyed: boolean;
  readonly budget: PatchMapAdaptiveFrameBudgetDebug;
}

export interface PatchMapFrameLoopOptions {
  readonly driver?: FrameDriver;
  readonly budget?: PatchMapAdaptiveFrameBudgetOptions;
  readonly onFrame?: (observation: PatchMapFrameLoopObservation) => void;
}
