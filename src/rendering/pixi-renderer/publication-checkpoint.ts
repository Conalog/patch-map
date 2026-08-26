import type { PatchMapProjectionIndex } from '../../parsing/contracts';
import type { SlotRange } from '../../dense/contracts';
import type { RenderStoreView } from '../../dense/renderer-types';
import type { PatchMapResolvedPresentationPolicy } from '../../presentation/policy';
import type { PatchMapScenePaintOrder } from '../scene-paint-order';
import type {
  PatchMapPresentationStoreCheckpoint,
  PatchMapPresentationStoreView,
  PatchMapRendererEntityPresentationOverride,
} from '../contracts/presentation-store';

/**
 * CPU-only renderer publication state that a scene load may replace before
 * its authoritative publication succeeds. The checkpoint deliberately keeps
 * exact retained references where publication replaces state. Keyed alpha and
 * the materialized presentation view mutate retained columns in place, so the
 * checkpoint owns value snapshots for only those renderer-owned columns while
 * retaining dense base, policy, and override references.
 *
 * This is an internal rollback seam, not a serialized or public package API.
 */
export interface PatchMapPixiRendererPublicationCheckpoint {
  readonly scenePaintOrder?: PatchMapScenePaintOrder;
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
  readonly barPresentationVisibilityConservative: boolean;
  readonly presentationPolicy: PatchMapResolvedPresentationPolicy | null;
  readonly presentationLayerRevision: number;
  readonly presentationLayerCount: number;
  readonly presentationAlphaMultipliers: Float32Array<ArrayBufferLike>;
  readonly presentationAlphaMultiplierValues: Float32Array<ArrayBufferLike>;
  readonly instancePresentationOverrides: ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  >;
  readonly presentationStore: PatchMapPresentationStoreView | null;
  readonly presentationStoreState: PatchMapPresentationStoreCheckpoint | null;
  readonly presentationBaseStore: RenderStoreView | null;
  readonly pendingSourceStore: RenderStoreView | null;
}
