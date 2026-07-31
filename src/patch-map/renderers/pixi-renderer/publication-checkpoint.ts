import type { PatchMapProjectionIndex } from '../../contracts';
import type { SlotRange } from '../../dense/contracts';
import type { RenderStoreView } from '../../dense/renderer-types';
import type { PatchMapResolvedPresentationPolicy } from '../../presentation-policy';
import type { PatchMapPixiRenderer } from '../pixi-renderer';
import type { PatchMapPresentationStoreView } from '../presentation-store';

/**
 * CPU-only renderer publication state that a scene load may replace before
 * its authoritative publication succeeds. The checkpoint deliberately keeps
 * the exact retained references: none of these values are mutated in place by
 * the load-side publication methods.
 *
 * This is an internal rollback seam, not a serialized or public package API.
 */
export interface PatchMapPixiRendererPublicationCheckpoint {
  readonly projectionIndex: PatchMapProjectionIndex;
  readonly staleProjectionEntityIds: ReadonlySet<string>;
  readonly projectionRevision: number;
  readonly pendingRanges: SlotRange[] | undefined;
  readonly pendingOverlayRanges: SlotRange[] | undefined;
  readonly pendingProjectionTransformOnly: boolean;
  readonly pendingBarPresentationOnly: boolean;
  readonly pendingTextOnly: boolean;
  readonly lastInvalidation: string;
  readonly storeEpoch: number;
  readonly presentationPolicy: PatchMapResolvedPresentationPolicy | null;
  readonly presentationStore: PatchMapPresentationStoreView | null;
  readonly presentationBaseStore: RenderStoreView | null;
}

type PatchMapPixiRendererPublicationState = {
  -readonly [Key in keyof PatchMapPixiRendererPublicationCheckpoint]:
    PatchMapPixiRendererPublicationCheckpoint[Key];
};

/** Capture exact load-side CPU publication state without touching Pixi/GPU state. */
export function capturePatchMapPixiRendererPublication(
  renderer: PatchMapPixiRenderer,
): PatchMapPixiRendererPublicationCheckpoint {
  if (renderer.destroyed) throw new Error('PatchMapPixiRenderer is destroyed');
  const state = renderer as unknown as PatchMapPixiRendererPublicationState;
  return Object.freeze({
    projectionIndex: state.projectionIndex,
    staleProjectionEntityIds: state.staleProjectionEntityIds,
    projectionRevision: state.projectionRevision,
    pendingRanges: state.pendingRanges,
    pendingOverlayRanges: state.pendingOverlayRanges,
    pendingProjectionTransformOnly: state.pendingProjectionTransformOnly,
    pendingBarPresentationOnly: state.pendingBarPresentationOnly,
    pendingTextOnly: state.pendingTextOnly,
    lastInvalidation: state.lastInvalidation,
    storeEpoch: state.storeEpoch,
    presentationPolicy: state.presentationPolicy,
    presentationStore: state.presentationStore,
    presentationBaseStore: state.presentationBaseStore,
  });
}

/**
 * Restore a captured publication checkpoint using assignments only. This is
 * intentionally non-throwing so rollback cannot mask the original load
 * failure with validation, allocation, renderer, or GPU work.
 */
export function restorePatchMapPixiRendererPublication(
  renderer: PatchMapPixiRenderer,
  checkpoint: PatchMapPixiRendererPublicationCheckpoint,
): void {
  const state = renderer as unknown as PatchMapPixiRendererPublicationState;
  state.projectionIndex = checkpoint.projectionIndex;
  state.staleProjectionEntityIds = checkpoint.staleProjectionEntityIds;
  state.projectionRevision = checkpoint.projectionRevision;
  state.pendingRanges = checkpoint.pendingRanges;
  state.pendingOverlayRanges = checkpoint.pendingOverlayRanges;
  state.pendingProjectionTransformOnly = checkpoint.pendingProjectionTransformOnly;
  state.pendingBarPresentationOnly = checkpoint.pendingBarPresentationOnly;
  state.pendingTextOnly = checkpoint.pendingTextOnly;
  state.lastInvalidation = checkpoint.lastInvalidation;
  state.storeEpoch = checkpoint.storeEpoch;
  state.presentationPolicy = checkpoint.presentationPolicy;
  state.presentationStore = checkpoint.presentationStore;
  state.presentationBaseStore = checkpoint.presentationBaseStore;
}
