import type {
  PatchMapEngineHistoryVisibleEvent,
} from './contracts/history-transformer';
import type {
  PatchMapGeometryRevisionTuple,
} from './contracts/rendering';
import type {
  PatchMapLiveOverlayProbe,
  PatchMapLiveOverlayPublishedTuple,
  PatchMapLiveOverlayTuple,
} from './contracts/mutation';
import type {
  PatchMapPublishedTuple,
  PatchMapRevisionStamp,
} from './contracts/lifecycle';

export type PatchMapPublicationHistoryDirection = 'undo' | 'redo';

export interface PatchMapLifecycleRebindPlan {
  readonly previousGeneration: number;
  readonly requestedGeneration: number;
}

export type PatchMapOverlayAcceptancePlan =
  | Readonly<{
      readonly status: 'superseded';
      readonly sourceRevision: number;
      readonly payloadHash: string;
    }>
  | Readonly<{
      readonly status: 'accepted';
      readonly sourceRevision: number;
      readonly payloadHash: string;
    }>;

interface PendingPatchMapHistoryPublication {
  readonly direction: PatchMapPublicationHistoryDirection;
  readonly sceneRevision: number;
}

export interface PatchMapFramePublicationEffect {
  readonly frameRevision: number;
  readonly publishedTuple: PatchMapPublishedTuple;
}

const EMPTY_HISTORY_VISIBLE = Object.freeze([] as PatchMapEngineHistoryVisibleEvent[]);

/**
 * Owns the monotonic revision clock and publication ledgers. Renderer and
 * host side effects stay in PatchMap; this authority only commits immutable
 * publication state after those side effects succeed.
 */
export class PatchMapPublicationAuthority {
  private lifecycleGenerationValue = 0;
  private sceneRevisionValue = 0;
  private viewRevisionValue = 0;
  private interactionRevisionValue = 0;
  private frameRevisionValue = 0;
  private frameClockMsValue = 0;
  private publishedTupleValue: PatchMapPublishedTuple = Object.freeze({
    scene: 0,
    view: 0,
    interaction: 0,
  });
  private geometryRevisionCorrelation: Readonly<{
    readonly surfaceRevision: number;
    readonly representedRevisions: PatchMapGeometryRevisionTuple;
  }> | null = null;
  private pendingHistoryPublications: readonly PendingPatchMapHistoryPublication[] =
    Object.freeze([]);
  private latestOverlayAccepted: PatchMapLiveOverlayTuple | null = null;
  private latestOverlayPublished: PatchMapLiveOverlayPublishedTuple | null = null;
  private pendingOverlayPublication: PatchMapLiveOverlayTuple | null = null;
  private overlayAcceptedCount = 0;
  private overlayPublicationCount = 0;

  public get lifecycleGeneration(): number {
    return this.lifecycleGenerationValue;
  }

  public get sceneRevision(): number {
    return this.sceneRevisionValue;
  }

  public get viewRevision(): number {
    return this.viewRevisionValue;
  }

  public get interactionRevision(): number {
    return this.interactionRevisionValue;
  }

  public get frameRevision(): number {
    return this.frameRevisionValue;
  }

  public get frameClockMs(): number {
    return this.frameClockMsValue;
  }

  public get publishedTuple(): PatchMapPublishedTuple {
    return this.publishedTupleValue;
  }

  public revisionStamp(): PatchMapRevisionStamp {
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGenerationValue,
      sceneRevision: this.sceneRevisionValue,
      viewRevision: this.viewRevisionValue,
      interactionRevision: this.interactionRevisionValue,
    });
  }

  public advanceLifecycle(): number {
    this.lifecycleGenerationValue += 1;
    return this.lifecycleGenerationValue;
  }

  public planLifecycleRebind(
    requestedGeneration: number,
  ): PatchMapLifecycleRebindPlan {
    if (
      !Number.isSafeInteger(requestedGeneration) ||
      requestedGeneration !== this.lifecycleGenerationValue + 1
    ) {
      throw new RangeError('host lifecycle generation must advance by exactly one');
    }
    return Object.freeze({
      previousGeneration: this.lifecycleGenerationValue,
      requestedGeneration,
    });
  }

  public commitLifecycleRebind(plan: PatchMapLifecycleRebindPlan): number {
    if (plan.previousGeneration !== this.lifecycleGenerationValue) {
      throw new Error('host lifecycle rebind plan is stale');
    }
    this.lifecycleGenerationValue = plan.requestedGeneration;
    return this.lifecycleGenerationValue;
  }

  public advanceScene(): number {
    this.sceneRevisionValue += 1;
    return this.sceneRevisionValue;
  }

  public advanceView(): number {
    this.viewRevisionValue += 1;
    return this.viewRevisionValue;
  }

  public advanceInteraction(): number {
    this.interactionRevisionValue += 1;
    return this.interactionRevisionValue;
  }

  public setFrameClock(timeMs: number): void {
    this.frameClockMsValue = timeMs;
  }

  public resetGeometryCorrelation(): void {
    this.geometryRevisionCorrelation = null;
  }

  public correlateGeometryRevision(surfaceRevision: number | null): Readonly<{
    readonly revision: number | null;
    readonly surfaceRevision: number | null;
    readonly representedRevisions: PatchMapGeometryRevisionTuple | null;
    readonly revisionLags: PatchMapGeometryRevisionTuple | null;
  }> {
    if (surfaceRevision === null || !Number.isFinite(surfaceRevision)) {
      return Object.freeze({
        revision: null,
        surfaceRevision: null,
        representedRevisions: null,
        revisionLags: null,
      });
    }
    if (this.geometryRevisionCorrelation?.surfaceRevision !== surfaceRevision) {
      this.geometryRevisionCorrelation = Object.freeze({
        surfaceRevision,
        representedRevisions: Object.freeze({
          scene: this.sceneRevisionValue,
          view: this.viewRevisionValue,
          interaction: this.interactionRevisionValue,
        }),
      });
    }
    const representedRevisions = this.geometryRevisionCorrelation.representedRevisions;
    const revisionLags = Object.freeze({
      scene: this.sceneRevisionValue - representedRevisions.scene,
      view: this.viewRevisionValue - representedRevisions.view,
      interaction: this.interactionRevisionValue - representedRevisions.interaction,
    });
    return Object.freeze({
      revision: representedRevisions.scene,
      surfaceRevision,
      representedRevisions,
      revisionLags,
    });
  }

  public planOverlayAcceptance(
    sourceRevision: number,
    payloadHash: string,
  ): PatchMapOverlayAcceptancePlan {
    if (
      this.latestOverlayAccepted !== null &&
      sourceRevision <= this.latestOverlayAccepted.sourceRevision
    ) {
      return Object.freeze({ status: 'superseded', sourceRevision, payloadHash });
    }
    return Object.freeze({ status: 'accepted', sourceRevision, payloadHash });
  }

  public commitOverlayAcceptance(
    plan: Extract<PatchMapOverlayAcceptancePlan, { readonly status: 'accepted' }>,
  ): PatchMapLiveOverlayTuple {
    const tuple = Object.freeze({
      sourceRevision: plan.sourceRevision,
      payloadHash: plan.payloadHash,
      sceneRevision: this.sceneRevisionValue,
    });
    this.latestOverlayAccepted = tuple;
    this.pendingOverlayPublication = tuple;
    this.overlayAcceptedCount += 1;
    return tuple;
  }

  public overlayProbe(): PatchMapLiveOverlayProbe {
    return Object.freeze({
      latestAccepted: this.latestOverlayAccepted,
      latestPublished: this.latestOverlayPublished,
      pendingPublicationCount: this.pendingOverlayPublication === null ? 0 : 1,
      acceptedCount: this.overlayAcceptedCount,
      publicationCount: this.overlayPublicationCount,
    });
  }

  public resetOverlay(): void {
    this.latestOverlayAccepted = null;
    this.latestOverlayPublished = null;
    this.pendingOverlayPublication = null;
    this.overlayAcceptedCount = 0;
    this.overlayPublicationCount = 0;
  }

  public queueHistoryPublication(
    direction: PatchMapPublicationHistoryDirection,
  ): void {
    this.pendingHistoryPublications = Object.freeze([
      ...this.pendingHistoryPublications,
      Object.freeze({
        direction,
        sceneRevision: this.sceneRevisionValue,
      }),
    ]);
  }

  public clearHistoryPublications(): void {
    this.pendingHistoryPublications = Object.freeze([]);
  }

  public commitFrame(): PatchMapFramePublicationEffect {
    this.frameRevisionValue += 1;
    this.publishedTupleValue = Object.freeze({
      scene: this.sceneRevisionValue,
      view: this.viewRevisionValue,
      interaction: this.interactionRevisionValue,
    });
    return Object.freeze({
      frameRevision: this.frameRevisionValue,
      publishedTuple: this.publishedTupleValue,
    });
  }

  public publishPendingHistory(): readonly PatchMapEngineHistoryVisibleEvent[] {
    const pending = this.pendingHistoryPublications;
    if (pending.length === 0) return EMPTY_HISTORY_VISIBLE;
    this.pendingHistoryPublications = Object.freeze([]);
    const visible: PatchMapEngineHistoryVisibleEvent[] = [];
    for (const entry of pending) {
      if (entry.sceneRevision !== this.publishedTupleValue.scene) continue;
      visible.push(Object.freeze({
        direction: entry.direction,
        sceneRevision: entry.sceneRevision,
        frameRevision: this.frameRevisionValue,
        publication: 'published',
      }));
    }
    return visible.length === 0 ? EMPTY_HISTORY_VISIBLE : Object.freeze(visible);
  }

  public publishPendingOverlay(): PatchMapLiveOverlayPublishedTuple | null {
    const pendingOverlay = this.pendingOverlayPublication;
    if (pendingOverlay === null) return null;
    const published = Object.freeze({
      ...pendingOverlay,
      frameRevision: this.frameRevisionValue,
    });
    this.latestOverlayPublished = published;
    this.pendingOverlayPublication = null;
    this.overlayPublicationCount += 1;
    return published;
  }
}
