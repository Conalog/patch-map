import type { PatchMapAssetSessionProbe } from '../assets';
import {
  normalizePatchMapComponentVisualTarget,
  normalizePatchMapTextTarget,
  type PatchMapComponentVisualTarget,
  type PatchMapTextTarget,
} from '../core/contracts';
import type { PatchMapComponentRenderRole } from '../contracts';
import type { PatchMapHistoryState } from '../history';
import type { PatchMapInteractionMode } from '../host-interaction';
import type { PatchMapLogicalTargetSnapshot } from '../query-selection';
import type { PatchMapPresentationLayerSnapshot } from '../presentation-layers';
import type { PatchMapPixiRendererLossProbe, PatchMapRenderLaneRole } from '../renderers/types';
import type { MaterializedPatchMapDataset } from '../semantic/dataset';
import {
  createPatchMapSemanticProbe,
  type PatchMapSemanticProductProbe,
} from '../semantic/probe';
import type {
  PatchMapEngineSceneImagesProbe,
  PatchMapEngineSurface,
  PatchMapInteractionOwnershipProbe,
  PatchMapSurfaceDebug,
} from './contracts';
import type {
  IndexedEngineTextSemantic,
  PatchMapEngineComponentSemanticProbe,
} from './semantic-index';
import { resolvePatchMapTextPublicationStatus } from './text-probe-publication-policy';
import type {
  PatchMapAggregateRenderOwnerProbe,
  PatchMapEngineBarPresentationProbe,
  PatchMapEngineComponentVisualProbe,
  PatchMapEnginePaintOrderProbe,
  PatchMapEnginePixiPublicSurfaceProbe,
  PatchMapEngineRendererLossProbe,
  PatchMapEngineSnapshot,
  PatchMapEngineTextProbe,
  PatchMapEngineTextRevisionTuple,
  PatchMapLifecycle,
  PatchMapPublishedTuple,
  PatchMapRevisionStamp,
} from './public-contracts';
import type { PatchMapViewportAuthoritySnapshot } from './viewport-authority';

export const PATCH_MAP_ENGINE_FACILITIES = Object.freeze([
  'renderer',
  'viewport',
  'world',
  'state',
  'history',
  'resize',
  'assets',
] as const);

export interface PatchMapEngineProductProbeReadPort {
  lifecycle(): PatchMapLifecycle;
  instanceId(): string | null;
  viewportSnapshot(): PatchMapViewportAuthoritySnapshot;
  surfaceDebug(): PatchMapSurfaceDebug | null;
  revisionStamp(): PatchMapRevisionStamp;
  publishedTuple(): PatchMapPublishedTuple;
  frameRevision(): number;
  sceneRevision(): number;
  viewRevision(): number;
  interactionRevision(): number;
  materialized(): MaterializedPatchMapDataset | null;
  datasetRef(): string | null;
  selectionIds(): readonly string[];
  presentationSnapshot(): PatchMapPresentationLayerSnapshot;
  componentSemantic(
    ownerId: string,
    componentId: string,
  ): PatchMapEngineComponentSemanticProbe | null;
  textSemantic(target: PatchMapTextTarget): IndexedEngineTextSemantic | null;
  historyState(): PatchMapHistoryState;
  interactionMode(): PatchMapInteractionMode;
  staleGestureCount(): number;
  pendingWork(): number;
  rendererConfiguration(): Readonly<{
    resolution: number;
    antialias: boolean;
    background: string;
    backend: 'webgl' | 'webgpu';
  }> | null;
  assetProbe(): PatchMapAssetSessionProbe | null;
  canvasCount(): number;
  subscriptionCount(): number;
  sceneImageProbe(): PatchMapEngineSceneImagesProbe | null;
  componentVisualProbe(
    target: PatchMapComponentVisualTarget,
  ): ReturnType<NonNullable<PatchMapEngineSurface['componentVisualProbe']>>;
  barPresentationProbe(
    target: PatchMapComponentVisualTarget,
  ): ReturnType<NonNullable<PatchMapEngineSurface['barPresentationProbe']>>;
  paintOrderProbe(): ReturnType<NonNullable<PatchMapEngineSurface['paintOrderProbe']>> | null;
  textProbe(
    target: PatchMapTextTarget,
  ): ReturnType<NonNullable<PatchMapEngineSurface['textProbe']>>;
  interactionOwnershipProbe(): ReturnType<
    NonNullable<PatchMapEngineSurface['interactionOwnershipProbe']>
  > | null;
  pixiPublicSurfaceRead(): Readonly<{
    probe: ReturnType<NonNullable<PatchMapEngineSurface['pixiPublicSurfaceProbe']>> | null;
    canvasCount: number;
  }>;
  rendererLossSurfaceRead(): Readonly<{
    probe: ReturnType<NonNullable<PatchMapEngineSurface['rendererLossProbe']>> | null;
    canvasCount: number;
  }>;
  terminalRendererLossProbe(): PatchMapPixiRendererLossProbe | null;
  logicalComponentTarget(
    ownerId: string,
    componentId: string,
  ): PatchMapLogicalTargetSnapshot | null;
}

export function readPatchMapEngineSnapshot(
  state: PatchMapEngineProductProbeReadPort,
): PatchMapEngineSnapshot {
  const viewport = state.viewportSnapshot();
  const surfaceDebug = state.surfaceDebug() ?? emptyPatchMapEngineSurfaceDebug(
    viewport.width,
    viewport.height,
    viewport.pixelRatio,
  );
  return Object.freeze({
    lifecycle: state.lifecycle(),
    instanceId: state.instanceId(),
    revisions: state.revisionStamp(),
    publishedTuple: state.publishedTuple(),
    frameRevision: state.frameRevision(),
    datasetRef: state.datasetRef(),
    semanticHash: state.materialized()?.semanticHash ?? null,
    rootIds: state.materialized()?.rootIds ?? Object.freeze([]),
    historyDepth: state.historyState().undoDepth,
    pendingWork: state.pendingWork(),
    zoomLimits: viewport.zoomLimits,
    viewport: viewport.viewport,
    selectionIds: state.selectionIds(),
    presentation: state.presentationSnapshot(),
    interaction: Object.freeze({
      mode: state.interactionMode(),
      staleGestureCount: state.staleGestureCount(),
    }),
    facilities: PATCH_MAP_ENGINE_FACILITIES,
    resources: Object.freeze({
      canvasCount: state.canvasCount(),
      canvas: Object.freeze({
        cssSize: surfaceDebug.cssSize,
        backingSize: surfaceDebug.backingSize,
      }),
      renderer: state.rendererConfiguration(),
      rendering: Object.freeze({
        commandCount: surfaceDebug.renderCommandCount ?? null,
        visiblePrimitiveCount: surfaceDebug.visiblePrimitiveCount ?? null,
      }),
      assets: state.assetProbe(),
      subscriptions: Object.freeze({ active: state.subscriptionCount(), duplicates: 0 }),
    }),
  });
}

export function readPatchMapEngineSemanticProbe(
  state: PatchMapEngineProductProbeReadPort,
): PatchMapSemanticProductProbe {
  const viewport = state.viewportSnapshot();
  const surfaceDebug = state.surfaceDebug() ?? emptyPatchMapEngineSurfaceDebug(
    viewport.width,
    viewport.height,
    viewport.pixelRatio,
  );
  return createPatchMapSemanticProbe(state.materialized(), {
    lifecycle: state.lifecycle(),
    datasetRef: state.datasetRef(),
    interactionMode: state.interactionMode(),
    selectionIds: state.selectionIds(),
    activeAnimationCount: surfaceDebug.activeAnimationCount,
    ...(surfaceDebug.activeGestureCount === undefined
      ? {}
      : { activeGestureCount: surfaceDebug.activeGestureCount }),
    historyDepth: state.historyState().undoDepth,
  });
}

export function readPatchMapEngineSceneImageProbe(
  state: PatchMapEngineProductProbeReadPort,
): PatchMapEngineSceneImagesProbe | null {
  return state.sceneImageProbe();
}

export function readPatchMapEngineComponentVisualProbe(
  state: PatchMapEngineProductProbeReadPort,
  target: PatchMapComponentVisualTarget,
): PatchMapEngineComponentVisualProbe | null {
  const normalizedTarget = normalizePatchMapComponentVisualTarget(target);
  const visual = state.componentVisualProbe(normalizedTarget);
  const semanticOwnerId = visual?.semanticOwnerId ?? normalizedTarget.ownerId;
  const semantic = state.componentSemantic(
    semanticOwnerId,
    normalizedTarget.componentId,
  );
  if (semantic === null && visual === null) return null;
  return Object.freeze({
    target: normalizedTarget,
    semantic,
    entityId: visual?.entityId ?? null,
    logicalIdentity: visual?.logicalIdentity ?? null,
    componentType: visual?.componentType ?? semantic?.componentType ?? null,
    renderRole: visual?.renderRole ?? null,
    entityKind: visual?.entityKind ?? null,
    geometry: visual?.geometry ?? null,
    publication: visual?.publication ?? null,
    sceneImage: visual?.sceneImage ?? null,
    rendererPaint: visual?.rendererPaint ?? null,
    renderLanes: visual?.renderLanes ?? null,
    revisions: state.revisionStamp(),
    availability: Object.freeze({
      semantic: semantic !== null,
      surface: visual !== null,
      rendererPaint: visual?.rendererPaint !== null && visual?.rendererPaint !== undefined,
      renderLanes: visual?.renderLanes !== null && visual?.renderLanes !== undefined,
    }),
  });
}

export function readPatchMapEngineBarPresentationProbe(
  state: PatchMapEngineProductProbeReadPort,
  target: PatchMapComponentVisualTarget,
): PatchMapEngineBarPresentationProbe | null {
  const normalizedTarget = normalizePatchMapComponentVisualTarget(target);
  const probe = state.barPresentationProbe(normalizedTarget);
  if (probe === null) return null;
  return Object.freeze({
    ...probe,
    revisions: state.revisionStamp(),
    publishedTuple: state.publishedTuple(),
    frameRevision: state.frameRevision(),
  });
}

export function readPatchMapEnginePaintOrderProbe(
  state: PatchMapEngineProductProbeReadPort,
): PatchMapEnginePaintOrderProbe | null {
  const probe = state.paintOrderProbe();
  if (probe === null) return null;
  return Object.freeze({
    ...probe,
    revisions: state.revisionStamp(),
    publishedTuple: state.publishedTuple(),
    frameRevision: state.frameRevision(),
    history: state.historyState(),
  });
}

export function readPatchMapEngineTextProbe(
  state: PatchMapEngineProductProbeReadPort,
  target: PatchMapTextTarget,
): PatchMapEngineTextProbe | null {
  if (state.lifecycle() === 'destroyed' || state.lifecycle() === 'destroying') return null;
  const normalizedTarget = normalizePatchMapTextTarget(target);
  const requestedSemantic = state.textSemantic(normalizedTarget);
  const visual = state.textProbe(normalizedTarget);
  if (visual === null && requestedSemantic?.gridTemplate) return null;

  const semantic = visual?.semanticOwnerId && normalizedTarget.kind === 'component'
    ? state.textSemantic({
        kind: 'component',
        ownerId: visual.semanticOwnerId,
        id: normalizedTarget.id,
      }) ?? requestedSemantic
    : requestedSemantic;
  if (semantic === null && visual === null) return null;

  const currentRevisions = state.revisionStamp();
  const publishedTuple = state.publishedTuple();
  const publishedCurrent =
    publishedTuple.scene === state.sceneRevision() &&
    publishedTuple.view === state.viewRevision() &&
    publishedTuple.interaction === state.interactionRevision();
  const status = resolvePatchMapTextPublicationStatus(visual, publishedCurrent);
  const revisionTuple: PatchMapEngineTextRevisionTuple = Object.freeze({
    current: currentRevisions,
    published: publishedTuple,
    frameRevision: state.frameRevision(),
    surfaceSceneRevision: visual?.publication.sceneRevision ?? null,
    surfaceRenderedSceneRevision: visual?.publication.renderedSceneRevision ?? null,
    rendererFrame: visual?.publication.rendererFrame ?? null,
  });
  const rendererAvailable = visual !== null &&
    visual.renderer.attachedRoute !== null &&
    visual.renderer.attachedRoute !== 'none' &&
    visual.renderer.objectKind !== 'none' &&
    visual.renderer.plannedRoute === visual.renderer.attachedRoute &&
    visual.renderer.attachedRoute === visual.renderer.objectKind;
  return Object.freeze({
    target: normalizedTarget,
    semantic: semantic?.probe ?? null,
    semanticOwnerId: visual?.semanticOwnerId ?? semantic?.probe.semanticOwnerId ?? null,
    entityId: visual?.entityId ?? null,
    projection: visual?.semantic ?? null,
    geometry: visual?.geometry ?? null,
    state: visual?.state ?? null,
    transform: visual?.transform ?? null,
    renderer: visual?.renderer ?? null,
    rendererPaint: visual?.rendererPaint ?? null,
    renderLanes: visual?.renderLanes ?? null,
    publication: Object.freeze({ status, revisions: revisionTuple }),
    availability: Object.freeze({
      semantic: semantic !== null,
      surface: visual !== null,
      renderer: rendererAvailable,
      rendererPaint: visual?.rendererPaint !== null && visual?.rendererPaint !== undefined,
      renderLanes: visual?.renderLanes !== null && visual?.renderLanes !== undefined,
    }),
  });
}

export function readPatchMapEngineInteractionOwnershipProbe(
  state: PatchMapEngineProductProbeReadPort,
): PatchMapInteractionOwnershipProbe | null {
  return state.interactionOwnershipProbe();
}

export function readPatchMapEnginePixiPublicSurfaceProbe(
  state: PatchMapEngineProductProbeReadPort,
): PatchMapEnginePixiPublicSurfaceProbe | null {
  const surfaceRead = state.pixiPublicSurfaceRead();
  const probe = surfaceRead.probe;
  if (probe === null) return null;
  return Object.freeze({
    ...probe,
    lifecycle: state.lifecycle(),
    revisions: state.revisionStamp(),
    canvasCount: surfaceRead.canvasCount,
  });
}

export function readPatchMapEngineAggregateRenderOwnerProbe(
  state: PatchMapEngineProductProbeReadPort,
  target: PatchMapComponentVisualTarget,
): PatchMapAggregateRenderOwnerProbe | null {
  const normalized = normalizePatchMapComponentVisualTarget(target);
  const logicalTarget = state.logicalComponentTarget(
    normalized.ownerId,
    normalized.componentId,
  );
  const visual = readPatchMapEngineComponentVisualProbe(state, normalized);
  if (
    logicalTarget === null ||
    visual === null ||
    visual.entityId === null ||
    visual.geometry === null
  ) {
    return null;
  }
  const laneRole = visual.rendererPaint?.lane ?? componentRenderLane(visual.renderRole);
  return Object.freeze({
    target: normalized,
    logicalTarget,
    entityId: visual.entityId,
    aggregateRenderOwnerId:
      `render-owner:${normalized.ownerId}/${normalized.componentId}`,
    rendererKind: visual.rendererPaint?.rendererKind ?? null,
    renderLane: laneRole === null ? null : visual.renderLanes?.[laneRole] ?? null,
    worldBounds: visual.geometry.worldBounds,
    visible: visual.geometry.visible,
    revisions: state.revisionStamp(),
    publishedTuple: state.publishedTuple(),
    frameRevision: state.frameRevision(),
  });
}

export function readPatchMapEngineRendererLossProbe(
  state: PatchMapEngineProductProbeReadPort,
): PatchMapEngineRendererLossProbe | null {
  const lifecycle = state.lifecycle();
  if (lifecycle === 'destroyed' || lifecycle === 'destroying') {
    const terminal = state.terminalRendererLossProbe();
    if (terminal !== null) {
      return Object.freeze({
        ...terminal,
        revisions: state.revisionStamp(),
        publishedTuple: state.publishedTuple(),
        canvasCount: 0,
      });
    }
  }
  const surfaceRead = state.rendererLossSurfaceRead();
  const probe = surfaceRead.probe;
  if (probe === null) return null;
  return Object.freeze({
    ...probe,
    revisions: state.revisionStamp(),
    publishedTuple: state.publishedTuple(),
    canvasCount: surfaceRead.canvasCount,
  });
}

export function emptyPatchMapEngineSurfaceDebug(
  width: number,
  height: number,
  pixelRatio: number,
): PatchMapSurfaceDebug {
  return Object.freeze({
    cssSize: Object.freeze([width, height] as [number, number]),
    backingSize: Object.freeze([
      Math.round(width * pixelRatio),
      Math.round(height * pixelRatio),
    ] as [number, number]),
    selectionIds: Object.freeze([] as string[]),
    activeAnimationCount: 0,
    activeGestureCount: 0,
    renderCommandCount: 0,
    visiblePrimitiveCount: 0,
  });
}

function componentRenderLane(
  role: PatchMapComponentRenderRole | null,
): PatchMapRenderLaneRole | null {
  if (role === null) return null;
  if (role === 'background-asset') return 'background-assets';
  if (role === 'content-asset') return 'content-assets';
  return role;
}
