import {
  PatchMapFrameLoop,
  type PatchMapFrameLoopOptions,
  type PatchMapFrameLoopObservation,
  type PatchMapFrameLoopTarget,
} from '../scheduler';

/**
 * Owns the one package-managed manual frame loop and the reason for an
 * authority-issued pause. The PatchMap facade retains lifecycle validation,
 * public diagnostics, and renderer/page transition ordering.
 */
export class PatchMapManagedFrameLoopAuthority {
  private frameLoop: PatchMapFrameLoop | null = null;
  private pausedForVisibility = false;

  public get hasFrameLoop(): boolean {
    return this.frameLoop !== null;
  }

  public create(
    target: PatchMapFrameLoopTarget,
    options: PatchMapFrameLoopOptions,
  ): PatchMapFrameLoop | null {
    if (this.frameLoop !== null && !this.frameLoop.isDestroyed) return null;
    this.frameLoop = new PatchMapFrameLoop(target, options);
    this.pausedForVisibility = false;
    return this.frameLoop;
  }

  public discardDestroyed(): void {
    if (!this.frameLoop?.isDestroyed) return;
    this.frameLoop = null;
    this.pausedForVisibility = false;
  }

  public pauseForVisibility(): void {
    const frameLoop = this.frameLoop;
    if (frameLoop === null || frameLoop.isPaused) return;
    frameLoop.pause();
    this.pausedForVisibility = true;
  }

  public resumeFromVisibility(timeMs: number): void {
    const frameLoop = this.frameLoop;
    if (frameLoop === null) return;
    frameLoop.synchronizeLogicalTime(timeMs);
    if (this.pausedForVisibility) frameLoop.resume();
    this.pausedForVisibility = false;
  }

  public request(): void {
    const frameLoop = this.frameLoop;
    if (frameLoop === null) return;
    if (frameLoop.isDestroyed) {
      this.frameLoop = null;
      return;
    }
    frameLoop.request();
  }

  public publishNow(): PatchMapFrameLoopObservation | null {
    const frameLoop = this.frameLoop;
    if (frameLoop === null || frameLoop.isDestroyed) return null;
    return frameLoop.publishNow();
  }

  public pause(): boolean {
    const frameLoop = this.frameLoop;
    if (frameLoop === null || frameLoop.isDestroyed || frameLoop.isPaused) return false;
    return frameLoop.pause();
  }

  public resume(): boolean {
    const frameLoop = this.frameLoop;
    if (frameLoop === null || frameLoop.isDestroyed || !frameLoop.isPaused) return false;
    return frameLoop.resume();
  }

  public destroy(): void {
    this.frameLoop?.destroy();
    this.frameLoop = null;
    this.pausedForVisibility = false;
  }
}
