import type { EntitySnapshot, SceneSnapshot } from '../core-v1/contracts';
import type { CoreV2EntityProjection, CoreV2ProjectionIndex } from './contracts';
import type {
  CoreV2EntityPaintProbe,
  CoreV2OverlayPaintProbe,
  PixiCoreV2RendererDebug,
} from './renderers/types';
import {
  planCoreV2PaintOrder,
  type CoreV2PaintLane,
  type CoreV2PaintPlan,
  type CoreV2PaintPrimitiveInput,
  type CoreV2ScenePaintKind,
} from './semantic/paint-order';

export interface CoreV2PaintOrderProductProbe {
  readonly sceneRevision: number;
  readonly rendererFrame: number;
  readonly publication: 'pending' | 'current';
  readonly hierarchyNodeCount: number;
  readonly rendererCommandCount: number;
  readonly overlays: CoreV2OverlayPaintProbe;
  readonly plan: CoreV2PaintPlan;
}

export interface CoreV2PaintOrderProductInput {
  readonly snapshot: SceneSnapshot;
  readonly projection: CoreV2ProjectionIndex | null;
  readonly overlays: CoreV2OverlayPaintProbe;
  readonly renderer: Pick<PixiCoreV2RendererDebug, 'frame' | 'aggregateRenderObjects'>;
  readonly renderedSceneRevision: number | null;
  readonly paintForEntity: (entityId: string) => CoreV2EntityPaintProbe | null;
}

/**
 * Join stable dense scene order to detached aggregate-renderer facts. The
 * result is a product observation: no Pixi child traversal and no fixture or
 * expected value participates in the ordering decision.
 */
export function createCoreV2PaintOrderProductProbe(
  input: CoreV2PaintOrderProductInput,
): CoreV2PaintOrderProductProbe {
  const primitives = input.snapshot.entities.map((entity, authoredOrder) => {
    const projection = input.projection?.byEntityId[entity.id];
    const paint = input.paintForEntity(entity.id);
    return primitiveFor(entity, projection, paint, authoredOrder);
  });
  const plan = planCoreV2PaintOrder(primitives, {
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
  projection: CoreV2EntityProjection | undefined,
  paint: CoreV2EntityPaintProbe | null,
  authoredOrder: number,
): CoreV2PaintPrimitiveInput {
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
  projection: CoreV2EntityProjection | undefined,
): CoreV2ScenePaintKind {
  if (projection?.componentType === 'background') return 'background';
  if (projection?.componentType === 'icon') return 'icon';
  return entity.kind;
}

function defaultLane(
  kind: CoreV2ScenePaintKind,
): CoreV2PaintLane {
  if (kind === 'background') return 'background-geometry';
  if (kind === 'relation') return 'relations-dynamic';
  if (kind === 'image' || kind === 'icon') return 'content-assets';
  if (kind === 'text') return 'text';
  return 'ordinary-geometry';
}
