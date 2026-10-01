import type {
  CoreView,
  SlotRange,
  } from '../dense/contracts';
import type {
  CoreRenderer,
  RenderStoreView,
  } from '../dense/renderer-types';
import type { PatchMapProjectionIndex } from '../parsing/contracts';
import type { PatchMapPresentationLayerRenderUpdate } from '../presentation/layer-contracts';
import type {
  PatchMapPresentationSlotVisibility,
  } from '../presentation';
import type {
  PatchMapRendererPresentationEntityProbe,
  PatchMapResolvedPresentationPolicy,
  } from '../presentation/policy';
import type {
  PatchMapEntityPaintProbe,
  PatchMapInteractionOverlayPolicy,
  PatchMapOverlayPaintProbe,
  PatchMapRendererDebug,
  PatchMapRendererStrategy,
  PatchMapRenderLaneSnapshot,
  PatchMapTextRendererProbe,
  PatchMapRendererEntityPresentationOverride,
} from '../rendering-port';
import type {
  PatchMapWorldOrientation,
} from '../geometry/render-quads';
import type { PatchMapSceneImageRendererBridge } from '../scene-images/contracts';
import type { PatchMapRootInteractionBinder } from './root-interaction-authority';

export interface PatchMapRuntimeInitializationMetrics {
  readonly applicationInitMs: number;
  readonly rendererBuildMs: number;
}

/** Opaque renderer-owned CPU publication state used only for atomic rollback. */
export interface PatchMapRuntimeRendererPublicationCheckpoint {
  readonly opaqueState: unknown;
}

/** Exact renderer publication checkpoint used by the load transaction. */
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
export interface PatchMapRuntimeRendererPort extends
  CoreRenderer,
  PatchMapSceneImageRendererBridge,
  PatchMapRootInteractionBinder {
  readonly initializationMetrics: PatchMapRuntimeInitializationMetrics;
  readonly strategy: PatchMapRendererStrategy;
  readonly publicationCheckpoint: PatchMapRuntimeRendererPublicationCheckpointCapability;
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
  setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
    changedRanges?: readonly SlotRange[],
  ): boolean;
  setAggregateCullPrecision(precise: boolean): number;
  markOverlayChanges(ranges: readonly SlotRange[], reason: string): void;
  setInteractionOverlayPolicy?(policy: PatchMapInteractionOverlayPolicy): boolean;
  setSelectionMarquee?(input: Readonly<{
    readonly start: readonly [number, number];
    readonly current: readonly [number, number];
  }> | null): boolean;
  setPresentationPolicy?(policy: PatchMapResolvedPresentationPolicy | null): boolean;
  presentationEntityProbe(entityId: string): PatchMapRendererPresentationEntityProbe | null;
  setWorldOrientation(world: PatchMapWorldOrientation): boolean;
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
  loadAsset(alias: string, url: string): Promise<void>;
  unloadAsset(alias: string): Promise<boolean>;
  captureBase64(): Promise<string>;
  interactionOwnershipProbe(): Readonly<{
    readonly rootBindingCount: number;
    readonly rootListenerCount?: number;
    readonly entityCallbackCount: number;
  }>;
  whenDestroyed(): Promise<void>;
  debugSnapshot(): PatchMapRendererDebug;
}

/**
 * Construction-only renderer shape. The checkpoint remains opaque to Core;
 * concrete adapters decide how to capture and restore their publication state.
 */
export interface PatchMapRuntimeRendererBackend extends
  Omit<PatchMapRuntimeRendererPort, 'publicationCheckpoint'> {
  capturePublicationCheckpoint(): unknown;
  restorePublicationCheckpoint(checkpoint: unknown): void;
}

/** Adapts a construction-only backend to the capability surface retained by Core. */
export function createPatchMapRuntimeRendererPort(
  renderer: PatchMapRuntimeRendererBackend,
): PatchMapRuntimeRendererPort {
  const port: PatchMapRuntimeRendererPort = {
    initializationMetrics: renderer.initializationMetrics,
    strategy: renderer.strategy,
    get width() { return renderer.width; },
    get height() { return renderer.height; },
    get pixelRatio() { return renderer.pixelRatio; },
    get destroyed() { return renderer.destroyed; },
    publicationCheckpoint: Object.freeze({
      capture: (): PatchMapRuntimeRendererPublicationCheckpoint => Object.freeze({
        opaqueState: renderer.capturePublicationCheckpoint(),
      }),
      restore: (checkpoint: PatchMapRuntimeRendererPublicationCheckpoint): void => {
        renderer.restorePublicationCheckpoint(checkpoint.opaqueState);
      },
    }),
    resize: (width, height, pixelRatio) => renderer.resize(width, height, pixelRatio),
    setView: (view) => renderer.setView(view),
    flush: (store) => renderer.flush(store),
    destroy: () => renderer.destroy(),
    bindSceneAsset: (key, request) => renderer.bindSceneAsset(key, request),
    unbindSceneAsset: (key) => renderer.unbindSceneAsset(key),
    sceneAssetBindingProbe: (key) => renderer.sceneAssetBindingProbe(key),
    sceneImageProbe: (entityId) => renderer.sceneImageProbe(entityId),
    finalizeAssetUnloads: () => renderer.finalizeAssetUnloads(),
    bindRootInteractions: (handlers) => renderer.bindRootInteractions(handlers),
    markChanges: (ranges, reason, options) => {
      renderer.markChanges(ranges, reason, options);
    },
    setProjection: (projection, changedRanges, staleEntityIds, updateKind, sourceStore) =>
      renderer.setProjection(
        projection,
        changedRanges,
        staleEntityIds,
        updateKind,
        sourceStore,
      ),
    setPresentationLayerMultipliers: (update) =>
      renderer.setPresentationLayerMultipliers(update),
    setInstancePresentationOverrides: (overrides, changedRanges) =>
      renderer.setInstancePresentationOverrides(overrides, changedRanges),
    setAggregateCullPrecision: (precise) => renderer.setAggregateCullPrecision(precise),
    markOverlayChanges: (ranges, reason) => renderer.markOverlayChanges(ranges, reason),
    ...(renderer.setInteractionOverlayPolicy === undefined
      ? {}
      : {
          setInteractionOverlayPolicy: (policy) =>
            renderer.setInteractionOverlayPolicy!(policy),
        }),
    ...(renderer.setSelectionMarquee === undefined
      ? {}
      : {
          setSelectionMarquee: (input) => renderer.setSelectionMarquee!(input),
        }),
    ...(renderer.setPresentationPolicy === undefined
      ? {}
      : {
          setPresentationPolicy: (policy) => renderer.setPresentationPolicy!(policy),
        }),
    presentationEntityProbe: (entityId) => renderer.presentationEntityProbe(entityId),
    setWorldOrientation: (world) => renderer.setWorldOrientation(world),
    ...(renderer.prepareBarPresentationVisibility === undefined
      ? {}
      : {
          prepareBarPresentationVisibility: (view) =>
            renderer.prepareBarPresentationVisibility!(view),
        }),
    synchronizeNextFlush: () => renderer.synchronizeNextFlush(),
    prepareGpu: () => renderer.prepareGpu(),
    textRendererProbe: (entityId) => renderer.textRendererProbe(entityId),
    renderLaneProbe: () => renderer.renderLaneProbe(),
    entityPaintProbe: (entityId) => renderer.entityPaintProbe(entityId),
    overlayPaintProbe: () => renderer.overlayPaintProbe(),
    loadAsset: (alias, url) => renderer.loadAsset(alias, url),
    unloadAsset: (alias) => renderer.unloadAsset(alias),
    captureBase64: () => renderer.captureBase64(),
    interactionOwnershipProbe: () => renderer.interactionOwnershipProbe(),
    whenDestroyed: () => renderer.whenDestroyed(),
    debugSnapshot: () => renderer.debugSnapshot(),
  };
  return Object.freeze(port);
}
