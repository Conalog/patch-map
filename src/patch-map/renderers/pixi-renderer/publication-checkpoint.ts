import type { PatchMapProjectionIndex } from '../../contracts';
import type { SlotRange } from '../../dense/contracts';
import type { RenderStoreView } from '../../dense/renderer-types';
import type { PatchMapResolvedPresentationPolicy } from '../../presentation-policy';
import type {
  PatchMapPresentationStoreView,
  PatchMapRendererEntityPresentationOverride,
} from '../presentation-store';

/**
 * CPU-only renderer publication state that a scene load may replace before
 * its authoritative publication succeeds. The checkpoint deliberately keeps
 * exact retained references where publication replaces state. The keyed
 * multiplier map is the one mutable retained column, so its checkpoint is an
 * owned copy that is replayed into the stable renderer map on rollback.
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
  readonly presentationLayerRevision: number;
  readonly presentationLayerCount: number;
  readonly presentationAlphaMultipliers: ReadonlyMap<string, number>;
  readonly instancePresentationOverrides: ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  >;
  readonly presentationStore: PatchMapPresentationStoreView | null;
  readonly presentationBaseStore: RenderStoreView | null;
}
