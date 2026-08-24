import type { EntitySnapshot, SceneSnapshot } from './dense/contracts';
import type { PatchMapEntityProjection, PatchMapProjectionIndex } from './contracts';
import type {
  PatchMapEntityPaintProbe,
  PatchMapOverlayPaintProbe,
  PatchMapPixiRendererDebug,
} from './renderers/types';
import {
  planPatchMapPaintOrder,
  type PatchMapPaintLane,
  type PatchMapPaintPlan,
  type PatchMapPaintPrimitiveInput,
  type PatchMapScenePaintKind,
} from './semantic/paint-order';

export interface PatchMapPaintOrderProductProbe {
  readonly sceneRevision: number;
  readonly rendererFrame: number;
  readonly publication: 'pending' | 'current';
  readonly hierarchyNodeCount: number;
  readonly rendererCommandCount: number;
  readonly overlays: PatchMapOverlayPaintProbe;
  readonly plan: PatchMapPaintPlan;
}

export interface PatchMapPaintOrderProductInput {
  readonly snapshot: SceneSnapshot;
  readonly projection: PatchMapProjectionIndex | null;
  readonly overlays: PatchMapOverlayPaintProbe;
  readonly renderer: Pick<PatchMapPixiRendererDebug, 'frame' | 'aggregateRenderObjects'>;
  readonly renderedSceneRevision: number | null;
  readonly paintForEntity: (entityId: string) => PatchMapEntityPaintProbe | null;
}

/**
 * Join stable dense scene order to detached aggregate-renderer facts. The
 * result is a product observation: no Pixi child traversal and no fixture or
 * expected value participates in the ordering decision.
 */
export function createPatchMapPaintOrderProductProbe(
  input: PatchMapPaintOrderProductInput,
): PatchMapPaintOrderProductProbe {
  const primitives = input.snapshot.entities.map((entity, authoredOrder) => {
    const projection = input.projection?.byEntityId[entity.id];
    const paint = input.paintForEntity(entity.id);
    return primitiveFor(entity, projection, paint, authoredOrder);
  });
  const plan = planPatchMapPaintOrder(primitives, {
    overlays: {
      selection: input.overlays.selection,
      transformer: input.overlays.transformer,
    },
  });
  return Object.freeze({
    sceneRevision: input.snapshot.revision,
    rendererFrame: input.renderer.frame,
    publication: input.renderedSceneRevision === input.snapshot.revision
      ? 'current'
      : 'pending',
    hierarchyNodeCount: input.snapshot.entityCount,
    rendererCommandCount: input.renderer.aggregateRenderObjects,
    overlays: input.overlays,
    plan,
  });
}

function primitiveFor(
  entity: EntitySnapshot,
  projection: PatchMapEntityProjection | undefined,
  paint: PatchMapEntityPaintProbe | null,
  authoredOrder: number,
): PatchMapPaintPrimitiveInput {
  const kind = paintKind(entity, projection);
  const lane = paint?.lane ?? defaultLane(kind);
  return Object.freeze({
    publicId: entity.id,
    entityId: entity.id,
    kind,
    lane,
    zIndex: entity.zIndex,
    authoredOrder,
    pass: 0,
    visible: entity.visible,
    compatibilityKey: paint === null
      ? `pending:${kind}:${lane}`
      : [
          paint.rendererKind,
          paint.packedTint ?? 'none',
          paint.alpha ?? 'none',
        ].join(':'),
  });
}

function paintKind(
  entity: EntitySnapshot,
  projection: PatchMapEntityProjection | undefined,
): PatchMapScenePaintKind {
  if (projection?.componentType === 'background') return 'background';
  if (projection?.componentType === 'icon') return 'icon';
  return entity.kind;
}

function defaultLane(
  kind: PatchMapScenePaintKind,
): PatchMapPaintLane {
  if (kind === 'background') return 'background-geometry';
  if (kind === 'relation') return 'relations-dynamic';
  if (kind === 'image' || kind === 'icon') return 'content-assets';
  if (kind === 'text') return 'text';
  return 'ordinary-geometry';
}
