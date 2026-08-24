import type {
  AdvanceResult,
  CoreView,
  FrameReport,
} from '../dense/contracts';
import type { PatchMapProjectionIndex } from '../contracts';
import type { PatchMapPresentationSlotVisibility } from '../presentation';
import {
  InvalidationScheduler,
  PatchMapAdaptiveFrameBudget,
  PatchMapFrameLoop,
  type FrameSchedulerDebug,
  type PatchMapFrameLoopOptions,
  type PatchMapFrameLoopTarget,
} from '../scheduler';
import type { PatchMapScene } from '../scene';
import type {
  PatchMapPrepareResult,
  PatchMapPresentationLifecycleResult,
} from './contracts';
import type {
  PatchMapBarPresentationAuthority,
  PatchMapBarPresentationPublicationFrame,
} from './bar-presentation-authority';
import type { PatchMapSpatialHitAuthority } from './spatial-hit-authority';
import { mergeSlotRanges } from './slot-ranges';
import type { PatchMapRuntimeRendererPort } from './runtime-renderer-port';

interface PatchMapFramePublicationPort {
  readonly assertAlive: () => void;
  readonly assertPublicationHealthy: () => void;
  readonly isRuntimeDestroyed: () => boolean;
  readonly readScene: () => PatchMapScene;
  readonly readProjection: () => PatchMapProjectionIndex | null;
  readonly readSpatialHit: () => PatchMapSpatialHitAuthority;
  readonly readFrameWorkloadSize: () => number;
  readonly readViewportGestureActive: () => boolean;
  readonly applyPendingIntrinsicImageSizes: () => void;
  readonly cancelRootGesture: () => void;
  readonly finalizeSceneImagesAfterRenderedFrame: () => void;
}

interface PatchMapFramePublicationOptions {
  readonly autoRender: boolean;
  readonly requestFrame?: () => void;
}

/**
 * Owns the one runtime frame clock, scheduler, and renderer-fact publication.
 * Semantic mutation and rollback remain in PatchMapRuntime; bar and spatial
 * authorities provide their current state through stable runtime ports.
 */
export class PatchMapFramePublicationAuthority implements PatchMapFrameLoopTarget {
  private readonly scheduler: InvalidationScheduler;
  private readonly adaptiveFrameBudget = new PatchMapAdaptiveFrameBudget();
  private externalFrameLoop: PatchMapFrameLoop | null = null;
  private automaticAnimationFramesActiveValue = false;
  private lastFrameReport: FrameReport | null = null;
  private suspendedValue = false;
  private terminalValue = false;
  private destroyedValue = false;
  private componentRendererFactsPublishedValue = false;
  private textRendererFactsPublishedValue = false;
  private renderedSceneRevisionValue: number | null = null;
  private barVisibilityRevision = -1;

  public constructor(
    private readonly renderer: PatchMapRuntimeRendererPort,
    private readonly barPresentation: PatchMapBarPresentationAuthority,
    private readonly port: PatchMapFramePublicationPort,
    private readonly options: PatchMapFramePublicationOptions,
  ) {
    this.scheduler = new InvalidationScheduler((timeMs) => this.renderScheduledFrame(timeMs));
  }

  public get destroyed(): boolean {
    return this.destroyedValue || this.port.isRuntimeDestroyed();
  }

  public get activeAnimations(): number {
    if (this.destroyed || this.terminalValue) return 0;
    return this.port.readScene().activeAnimations + this.barPresentation.activeCount;
  }

  public get frameWorkloadSize(): number {
    this.port.assertPublicationHealthy();
    return this.port.readFrameWorkloadSize();
  }

  public get frameTimeMs(): number {
    this.port.assertPublicationHealthy();
    return this.barPresentation.clockMs;
  }

  public get viewportGestureActive(): boolean {
    return !this.destroyed &&
      !this.terminalValue &&
      this.port.readViewportGestureActive();
  }

  public get presentationRevision(): number {
    this.port.assertPublicationHealthy();
    return this.barPresentation.presentationRevision;
  }

  public get reducedMotion(): boolean {
    this.port.assertPublicationHealthy();
    return this.barPresentation.reducedMotion;
  }

  public get suspended(): boolean {
    return this.suspendedValue;
  }

  public get automaticAnimationFramesActive(): boolean {
    return this.automaticAnimationFramesActiveValue;
  }

  public get componentRendererFactsPublished(): boolean {
    return this.componentRendererFactsPublishedValue;
  }

  public get textRendererFactsPublished(): boolean {
    return this.textRendererFactsPublishedValue;
  }

  public get renderedSceneRevision(): number | null {
    return this.renderedSceneRevisionValue;
  }

  public schedulerDebugSnapshot(): FrameSchedulerDebug {
    return this.scheduler.debugSnapshot();
  }

  /** Build aggregate CPU/GPU resources without presenting a visible frame. */
  public async prepare(): Promise<PatchMapPrepareResult> {
    this.port.assertAlive();
    this.port.applyPendingIntrinsicImageSizes();
    this.renderer.synchronizeNextFlush();
    this.scheduler.cancelPending();
    const syncStarted = now();
    this.lastFrameReport = this.flushScene();
    const storeSyncMs = now() - syncStarted;
    const frame = this.requireFrameReport();
    const prepareStarted = now();
    await this.renderer.prepareGpu();
    const gpuPrepareMs = now() - prepareStarted;
    return Object.freeze({ storeSyncMs, gpuPrepareMs, frame });
  }

  public flush(reason = 'manual'): FrameReport {
    this.port.assertAlive();
    this.port.applyPendingIntrinsicImageSizes();
    this.scheduler.cancelPending();
    this.lastFrameReport = this.flushScene();
    if (this.lastFrameReport.rendered) this.port.finalizeSceneImagesAfterRenderedFrame();
    if (this.options.autoRender && this.activeAnimations > 0) {
      this.scheduler.invalidate(reason);
    }
    return this.requireFrameReport();
  }

  /** Advance the deterministic presentation clock and publish one manual frame. */
  public publishFrame(timeMs: number): FrameReport {
    this.port.assertAlive();
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs must be finite');
    this.port.applyPendingIntrinsicImageSizes();
    this.scheduler.cancelPending();
    if (timeMs !== this.barPresentation.clockMs) {
      if (this.port.readScene().activeAnimations > 0) {
        this.advance(timeMs);
      } else {
        this.advanceBarPresentation(timeMs);
      }
    }
    this.adaptiveFrameBudget.reset(now());
    this.automaticAnimationFramesActiveValue = false;
    this.lastFrameReport = this.flushScene();
    if (this.lastFrameReport.rendered) this.port.finalizeSceneImagesAfterRenderedFrame();
    if (this.options.autoRender && this.activeAnimations > 0) {
      this.scheduler.invalidate('presentation');
    }
    return this.requireFrameReport();
  }

  public setReducedMotion(enabled: boolean): boolean {
    this.port.assertAlive();
    if (!this.barPresentation.setReducedMotion(enabled)) return false;
    const projection = this.port.readProjection();
    if (enabled && projection !== null) {
      const presentation = this.barPresentation.reconcile(
        projection,
        projection,
        this.port.readScene(),
        false,
      );
      this.renderer.setProjection(presentation);
      const spatialHit = this.port.readSpatialHit();
      spatialHit.clearSpatialAnimations();
      spatialHit.invalidate();
      this.invalidate('reduced-motion');
    }
    return true;
  }

  public suspendPresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    this.port.assertAlive();
    if (!Number.isFinite(timeMs) || timeMs < this.barPresentation.clockMs) {
      throw new RangeError('suspend timeMs must be finite and monotonic');
    }
    this.scheduler.cancelPending();
    this.scheduler.setContinuous(false, 'page-suspend');
    this.port.cancelRootGesture();
    const frame = this.publishBarPresentationFrame(
      this.barPresentation.settle(
        timeMs,
        this.port.readScene(),
        this.port.readProjection(),
      ),
    );
    this.adaptiveFrameBudget.reset(now());
    this.automaticAnimationFramesActiveValue = false;
    this.suspendedValue = true;
    return Object.freeze({
      state: 'suspended',
      timeMs,
      settledCount: frame.settledCount,
      activeAnimationCount: this.activeAnimations,
    });
  }

  public resumePresentation(timeMs: number): PatchMapPresentationLifecycleResult {
    this.port.assertAlive();
    if (!Number.isFinite(timeMs) || timeMs < this.barPresentation.clockMs) {
      throw new RangeError('resume timeMs must be finite and monotonic');
    }
    const frame = this.publishBarPresentationFrame(
      this.barPresentation.settle(
        timeMs,
        this.port.readScene(),
        this.port.readProjection(),
      ),
    );
    this.adaptiveFrameBudget.reset(now());
    this.automaticAnimationFramesActiveValue = false;
    this.suspendedValue = false;
    return Object.freeze({
      state: 'running',
      timeMs,
      settledCount: frame.settledCount,
      activeAnimationCount: this.activeAnimations,
    });
  }

  public advance(timeMs: number): AdvanceResult {
    this.port.assertAlive();
    // Preserve the monotonic-clock guard before mutating dense animations.
    const presentation = this.advanceBarPresentation(timeMs);
    const scene = this.port.readScene();
    const result = scene.advance(timeMs);
    if (result.changed > 0) this.markRendererFactsStale();
    const spatialHit = this.port.readSpatialHit();
    if (result.changed > 0 && spatialHit.hasSpatialAnimations) spatialHit.invalidate();
    spatialHit.pruneCompletedSpatialAnimations(timeMs);
    this.renderer.markChanges(result.changedRanges, 'animation');
    if (presentation.changedCount === 0 && presentation.activeCount === 0) return result;
    return Object.freeze({
      ...result,
      activeAnimations: result.activeAnimations + presentation.activeCount,
      changed: result.changed + presentation.changedCount,
      changedRanges: mergeSlotRanges(result.changedRanges, presentation.dirtyRanges),
    });
  }

  public createFrameLoop(options: PatchMapFrameLoopOptions = {}): PatchMapFrameLoop {
    this.port.assertAlive();
    if (this.options.autoRender) {
      throw new Error('createFrameLoop requires autoRender: false');
    }
    if (this.externalFrameLoop !== null && !this.externalFrameLoop.isDestroyed) {
      throw new Error('PatchMapRuntime already owns an active frame loop');
    }
    this.externalFrameLoop = new PatchMapFrameLoop(this, options);
    return this.externalFrameLoop;
  }

  public setContinuous(enabled: boolean, reason: string): void {
    this.scheduler.setContinuous(enabled, reason);
  }

  public requestExternalFrameLoop(): void {
    if (this.terminalValue) return;
    if (this.externalFrameLoop === null) return;
    if (this.externalFrameLoop.isDestroyed) {
      this.externalFrameLoop = null;
      return;
    }
    this.externalFrameLoop.request();
  }

  public invalidate(reason: string): void {
    if (this.terminalValue) return;
    this.markRendererFactsStale();
    this.requestExternalFrameLoop();
    this.options.requestFrame?.();
    if (this.options.autoRender && !this.suspendedValue) this.scheduler.invalidate(reason);
  }

  public markRendererFactsStale(): void {
    this.componentRendererFactsPublishedValue = false;
    this.textRendererFactsPublishedValue = false;
  }

  public markProjectionFactsStale(): void {
    this.markRendererFactsStale();
    this.renderedSceneRevisionValue = null;
  }

  public markComponentRendererFactsStale(): void {
    this.componentRendererFactsPublishedValue = false;
  }

  public resetAdaptiveBudget(): void {
    this.adaptiveFrameBudget.reset();
  }

  public installAutomaticAnimationFramesActive(value: boolean): void {
    this.automaticAnimationFramesActiveValue = value;
  }

  public sealTerminal(): void {
    if (this.terminalValue) return;
    this.terminalValue = true;
    this.suspendedValue = true;
    this.port.cancelRootGesture();
    this.automaticAnimationFramesActiveValue = false;
    this.scheduler.setContinuous(false, 'load-rollback-terminal');
    this.scheduler.cancelPending();
    try {
      if (this.externalFrameLoop !== null && !this.externalFrameLoop.isDestroyed) {
        this.externalFrameLoop.pause();
      }
    } catch {
      // Terminal state already prevents any later publication.
    }
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.suspendedValue = false;
    this.port.cancelRootGesture();
    this.externalFrameLoop?.destroy();
    this.externalFrameLoop = null;
    this.scheduler.destroy();
    this.adaptiveFrameBudget.destroy();
    this.markProjectionFactsStale();
    return true;
  }

  private renderScheduledFrame(timeMs: number): boolean {
    if (this.destroyed || this.suspendedValue || this.terminalValue) return false;
    this.port.applyPendingIntrinsicImageSizes();
    const activeAnimationsBefore = this.activeAnimations;
    if (activeAnimationsBefore > 0) {
      if (!this.automaticAnimationFramesActiveValue) {
        this.adaptiveFrameBudget.reset(timeMs);
        this.automaticAnimationFramesActiveValue = true;
      }
      const plan = this.adaptiveFrameBudget.plan({
        wallTimeMs: timeMs,
        activeAnimationCount: activeAnimationsBefore,
        workloadSize: this.frameWorkloadSize,
        viewportGestureActive: this.viewportGestureActive,
      });
      if (plan.presentationAdvanced) {
        const presentationTimeMs = this.barPresentation.clockMs + plan.presentationDeltaMs;
        const scene = this.port.readScene();
        if (scene.activeAnimations > 0) {
          const spatialHit = this.port.readSpatialHit();
          const spatialAnimationActive = spatialHit.hasSpatialAnimations;
          const advanced = scene.advance(presentationTimeMs);
          if (advanced.changed > 0 && spatialAnimationActive) spatialHit.invalidate();
          this.renderer.markChanges(advanced.changedRanges, 'animation');
        }
        this.advanceBarPresentation(presentationTimeMs);
        this.port.readSpatialHit().pruneCompletedSpatialAnimations(presentationTimeMs);
      }
      this.lastFrameReport = this.flushScene();
      this.adaptiveFrameBudget.complete(plan, now());
    } else {
      this.adaptiveFrameBudget.reset(timeMs);
      this.lastFrameReport = this.flushScene();
    }
    if (this.lastFrameReport.rendered) this.port.finalizeSceneImagesAfterRenderedFrame();
    const active = this.activeAnimations > 0;
    if (!active) this.automaticAnimationFramesActiveValue = false;
    return active;
  }

  private flushScene(): FrameReport {
    const scene = this.port.readScene();
    const visibility = this.prepareBarPresentationVisibility(scene.view);
    const visibilityChanged = visibility.revision !== this.barVisibilityRevision;
    if (
      (this.barPresentation.activeCount > 0 ||
        this.barPresentation.hasDeferredSettlement) &&
      visibilityChanged
    ) {
      this.barVisibilityRevision = visibility.revision;
      this.publishBarPresentationFrame(this.barPresentation.advance(
        this.barPresentation.clockMs,
        scene,
        this.port.readProjection(),
        visibility.visibility ?? undefined,
        true,
      ));
    }
    const report = scene.flush();
    this.componentRendererFactsPublishedValue = true;
    if (report.rendered) {
      this.textRendererFactsPublishedValue = true;
      this.renderedSceneRevisionValue = report.revision;
    }
    return report;
  }

  private advanceBarPresentation(
    timeMs: number,
  ): PatchMapBarPresentationPublicationFrame {
    const scene = this.port.readScene();
    const visibility = this.prepareBarPresentationVisibility(scene.view);
    const visibilityChanged = visibility.revision !== this.barVisibilityRevision;
    this.barVisibilityRevision = visibility.revision;
    return this.publishBarPresentationFrame(
      this.barPresentation.advance(
        timeMs,
        scene,
        this.port.readProjection(),
        visibility.visibility ?? undefined,
        visibilityChanged,
      ),
    );
  }

  private prepareBarPresentationVisibility(view: CoreView): Readonly<{
    revision: number;
    visibility: PatchMapPresentationSlotVisibility | null;
  }> {
    return this.renderer.prepareBarPresentationVisibility?.(view) ?? {
      revision: 0,
      visibility: null,
    };
  }

  private publishBarPresentationFrame(
    frame: PatchMapBarPresentationPublicationFrame,
  ): PatchMapBarPresentationPublicationFrame {
    this.port.readSpatialHit().settlePresentationIndex(frame.activeCount);
    if (this.barPresentation.publicationChangedCount === 0) return frame;
    const projection = this.barPresentation.visibleProjection;
    if (projection === null) return frame;
    this.renderer.setProjection(
      projection,
      this.barPresentation.publicationDirtyRanges,
      undefined,
      'bar-presentation',
    );
    this.componentRendererFactsPublishedValue = false;
    return frame;
  }

  private requireFrameReport(): FrameReport {
    const report = this.lastFrameReport;
    if (!report) throw new Error('PatchMap has not produced a frame report');
    return report;
  }
}


function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}
