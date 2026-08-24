import type {
  CoreView,
  SlotRange,
} from '../dense/contracts';
import type { RenderStoreView } from '../dense/renderer-types';
import type { PatchMapProjectionIndex } from '../contracts';
import type { PatchMapPresentationLayerRenderUpdate } from '../presentation-layer-contracts';
import type { PatchMapPresentationSlotVisibility } from '../presentation';
import type { PatchMapRendererEntityPresentationOverride } from '../renderers/presentation-store';
import type {
  PatchMapEntityPaintProbe,
  PatchMapOverlayPaintProbe,
  PatchMapRendererStrategy,
  PatchMapRenderLaneSnapshot,
  PatchMapTextRendererProbe,
} from '../renderers/types';

/** Opaque renderer-owned CPU publication state used only for atomic rollback. */
export interface PatchMapRuntimeRendererPublicationCheckpoint {
  readonly opaqueState: unknown;
}

/** Optional exact-checkpoint capability supplied by a concrete renderer adapter. */
export interface PatchMapRuntimeRendererPublicationCheckpointCapability {
  readonly capture: () => PatchMapRuntimeRendererPublicationCheckpoint;
  readonly restore: (
    checkpoint: PatchMapRuntimeRendererPublicationCheckpoint,
  ) => void;
}

export interface PatchMapRuntimeRendererDebugProbe {
  readonly frame: number;
  readonly aggregateRenderObjects: number;
}

/**
 * Core-owned renderer boundary for semantic publication, frame preparation,
 * and detached product observations. Concrete renderer state and classes stay
 * behind the composition-root adapter.
 */
export interface PatchMapRuntimeRendererPort {
  readonly strategy: PatchMapRendererStrategy;
  readonly publicationCheckpoint?: PatchMapRuntimeRendererPublicationCheckpointCapability;
  markChanges(
    ranges: readonly SlotRange[],
    reason: string,
    options?: Readonly<{
      readonly fullRebuild?: boolean;
      readonly domain?: 'bar-only' | 'text-only';
    }>,
  ): void;
  setProjection(
    projection: PatchMapProjectionIndex,
    changedRanges?: readonly SlotRange[],
    staleEntityIds?: ReadonlySet<string>,
    updateKind?: 'bar-presentation' | 'text',
    sourceStore?: RenderStoreView,
  ): boolean;
  setPresentationLayerMultipliers(
    update: PatchMapPresentationLayerRenderUpdate,
  ): boolean;
  setInstancePresentationOverrides?(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
    changedRanges?: readonly SlotRange[],
  ): boolean;
  setAggregateCullPrecision(precise: boolean): number;
  prepareBarPresentationVisibility?(view: CoreView): Readonly<{
    readonly revision: number;
    readonly visibility: PatchMapPresentationSlotVisibility | null;
  }>;
  synchronizeNextFlush(): void;
  prepareGpu(): Promise<void>;
  textRendererProbe(entityId: string): PatchMapTextRendererProbe | null;
  renderLaneProbe(): PatchMapRenderLaneSnapshot;
  entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null;
  overlayPaintProbe(): PatchMapOverlayPaintProbe;
  debugSnapshot(): PatchMapRuntimeRendererDebugProbe;
}
