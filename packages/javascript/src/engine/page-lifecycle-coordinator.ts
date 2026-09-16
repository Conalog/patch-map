import {
  PATCH_MAP_PAGE_LIFECYCLE_REVISION,
  type PatchMapPageLifecycleAuthority,
  type PatchMapPageLifecycleWorkCompletion,
  type PatchMapPageLifecycleWorkToken,
} from './page-lifecycle';
import type {
  PatchMapEngineSurface,
} from './contracts';
import type {
  PatchMapEngineDocumentVisibilityInput,
  PatchMapEngineDocumentVisibilityResult,
  PatchMapEnginePageLifecycleProbe,
  PatchMapEnginePageLifecycleWorkInput,
} from './contracts/lifecycle';
import type { PatchMapManagedFrameLoopAuthority } from './managed-frame-loop-authority';
import type { PatchMapPublicationAuthority } from './publication-authority';

interface PatchMapPageLifecycleCoordinatorPort {
  requireSurface(operation: string): PatchMapEngineSurface;
  activeAnimationCount(): number;
  motionActive(): boolean;
  pointerProbe(): Readonly<{
    readonly activePointerCount: number;
    readonly activeGestureCount: number;
    readonly pointerCaptureCount: number;
  }>;
  cancelMotion(): void;
  cancelTransformerForBlur(): void;
  interruptPointerForBlur(): void;
  clearTooltipForRedraw(): void;
  emitDocumentVisibilityChanged(result: PatchMapEngineDocumentVisibilityResult): void;
}

/** Coordinates visibility transitions while the authority retains lifecycle state. */
export class PatchMapPageLifecycleCoordinator {
  public constructor(
    private readonly authority: PatchMapPageLifecycleAuthority,
    private readonly managedFrameLoop: PatchMapManagedFrameLoopAuthority,
    private readonly publication: PatchMapPublicationAuthority,
    private readonly port: PatchMapPageLifecycleCoordinatorPort,
  ) {}

  public get hidden(): boolean {
    return this.authority.probe().state === 'hidden';
  }

  public register(
    input: PatchMapEnginePageLifecycleWorkInput,
  ): PatchMapPageLifecycleWorkToken {
    this.port.requireSurface('registerPageLifecycleWork');
    return this.authority.register(input.kind, input.requestId);
  }

  public complete(
    token: PatchMapPageLifecycleWorkToken,
  ): PatchMapPageLifecycleWorkCompletion {
    return this.authority.complete(token);
  }

  public setDocumentVisibility(
    input: PatchMapEngineDocumentVisibilityInput,
  ): PatchMapEngineDocumentVisibilityResult {
    const surface = this.port.requireSurface('setDocumentVisibility');
    const before = this.authority.probe();
    if (input.state !== 'visible' && input.state !== 'hidden') {
      throw new TypeError('document visibility state must be visible or hidden');
    }
    if (!Number.isFinite(input.timeMs) || input.timeMs < before.clockMs) {
      throw new RangeError('page lifecycle time must be finite and monotonic');
    }

    const pointerBefore = this.port.pointerProbe();
    const motionBefore = this.port.motionActive();
    let presentation: PatchMapEngineDocumentVisibilityResult['presentation'] = null;
    const changed = input.state !== before.state;
    this.managedFrameLoop.discardDestroyed();
    if (changed && input.state === 'hidden') {
      this.managedFrameLoop.pauseForVisibility();
      presentation = surface.suspendPresentation?.(input.timeMs) ?? null;
    } else if (changed) {
      presentation = surface.resumePresentation?.(input.timeMs) ?? null;
    }

    const transition = this.authority.transition(input.state, input.timeMs);
    if (changed) this.publication.setFrameClock(input.timeMs);
    if (transition.changed && transition.state === 'hidden') {
      this.port.cancelMotion();
      this.port.cancelTransformerForBlur();
      this.port.interruptPointerForBlur();
      this.port.clearTooltipForRedraw();
      if (
        motionBefore
        || pointerBefore.activePointerCount > 0
        || pointerBefore.activeGestureCount > 0
      ) {
        this.publication.advanceInteraction();
      }
    }

    const result = Object.freeze({
      schemaRevision: PATCH_MAP_PAGE_LIFECYCLE_REVISION,
      transition,
      presentation,
      probe: this.probe(),
    } satisfies PatchMapEngineDocumentVisibilityResult);
    if (transition.changed && transition.state === 'visible') {
      this.managedFrameLoop.resumeFromVisibility(input.timeMs);
    }
    if (transition.changed) this.port.emitDocumentVisibilityChanged(result);
    return result;
  }

  public probe(): PatchMapEnginePageLifecycleProbe {
    const lifecycle = this.authority.probe();
    const pointer = this.port.pointerProbe();
    return Object.freeze({
      ...lifecycle,
      activeAnimationCount: this.port.activeAnimationCount(),
      decelerationActive: this.port.motionActive(),
      activeGestureCount: pointer.activeGestureCount,
      pointerCaptureCount: pointer.pointerCaptureCount,
    });
  }

  public publishedFrame(): void {
    this.authority.publishedFrame();
  }

  public destroy(): void {
    this.authority.destroy();
  }
}
