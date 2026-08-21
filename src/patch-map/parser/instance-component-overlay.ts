import type { EntityInput } from '../dense/contracts';
import { RenderFlags, type RenderStoreView } from '../dense/renderer-types';
import type {
  ParsePatchMapOptions,
  PatchMapBackgroundPaintProjection,
  PatchMapComponentVisualProjection,
  PatchMapEntityProjection,
  PatchMapImageProjection,
  PatchMapTextProjection,
} from '../contracts';
import { PATCH_MAP_IDENTITY_AFFINE } from '../semantic/geometry';
import type {
  PatchMapBackgroundComponent,
  PatchMapGridItemTemplate,
  PatchMapTextComponent,
} from '../semantic/dataset';
import type { PatchMapTextLayout } from '../semantic/text-layout';
import { parseComponent } from './component-text-lowering';
import { createElementIdentity } from './lowering-state';
import {
  createPatchMapParseState,
  type PatchMapMutableExpandedItemIdentity,
} from './parse-state';
import type { PatchMapParserTransform } from './transform-projection';

export interface PatchMapProjectedInstanceComponentOverlay {
  readonly entity: EntityInput;
  readonly entityProjection: PatchMapEntityProjection;
  readonly componentProjection?: PatchMapComponentVisualProjection;
  readonly backgroundProjection?: PatchMapBackgroundPaintProjection;
  readonly imageProjection?: PatchMapImageProjection;
  readonly textProjection?: PatchMapTextProjection;
}

interface PatchMapCachedTextComponentProjection {
  readonly ownerId: string;
  readonly ownerTranslation: readonly [number, number];
  readonly projected: PatchMapProjectedInstanceComponentOverlay;
}

export interface PatchMapInstanceComponentProjectionCache {
  readonly textLayouts: Map<string, PatchMapTextLayout>;
  readonly textComponents: Map<
    PatchMapTextComponent,
    Map<string, PatchMapCachedTextComponentProjection>
  >;
}

/**
 * Re-project one already validated grid-template component at a concrete cell.
 * The helper reuses the canonical component parser but does not construct a
 * second scene or retain any parser state after the selected entity returns.
 */
export function projectPatchMapInstanceComponentOverlay(
  component: PatchMapBackgroundComponent | PatchMapTextComponent,
  componentPath: string,
  item: PatchMapGridItemTemplate,
  ownerId: string,
  semanticOwnerId: string,
  ownerProjection: PatchMapEntityProjection,
  store: RenderStoreView,
  ownerSlot: number,
  options: ParsePatchMapOptions = {},
  cache?: PatchMapInstanceComponentProjectionCache,
): PatchMapProjectedInstanceComponentOverlay {
  const ownerVisible = store.alive[ownerSlot] === 1 &&
    ((store.flags[ownerSlot] ?? 0) & RenderFlags.Visible) !== 0;
  const ownerOpacity = store.opacity[ownerSlot] ?? 1;
  const entityId = `${ownerId}::${component.type}:${component.id}`;
  const textCacheKey = component.type === 'text' && cache !== undefined
    ? JSON.stringify([
        ownerProjection.affine[0],
        ownerProjection.affine[1],
        ownerProjection.affine[2],
        ownerProjection.affine[3],
        ownerProjection.rotationDegrees,
        ownerProjection.scaleX,
        ownerProjection.scaleY,
        ownerProjection.contentOrientation,
        ownerVisible,
        ownerOpacity,
      ])
    : null;
  const cached = textCacheKey === null || component.type !== 'text'
    ? undefined
    : cache?.textComponents.get(component)?.get(textCacheKey);
  if (cached !== undefined) {
    return rebaseCachedTextComponentProjection(cached, entityId, ownerId, ownerProjection);
  }

  const state = createPatchMapParseState(options, cache?.textLayouts);
  const sourcePath = sourceElementPath(componentPath);
  const element = createElementIdentity(
    { type: 'grid', id: semanticOwnerId },
    semanticOwnerId,
    sourcePath,
    'grid',
  );
  const instance: PatchMapMutableExpandedItemIdentity = {
    instanceId: ownerId,
    sourceElementId: semanticOwnerId,
    sourcePath: itemPath(componentPath),
    entityIds: [],
  };
  const content = {
    x: item.padding.left,
    y: item.padding.top,
    width: Math.max(0, item.size.width - item.padding.left - item.padding.right),
    height: Math.max(0, item.size.height - item.padding.top - item.padding.bottom),
  };

  parseComponent(
    component,
    componentPath,
    ownerId,
    semanticOwnerId,
    parserTransform(ownerProjection),
    item.size,
    content,
    item.contentOrientation,
    ownerVisible,
    {
      element,
      ancestors: [],
      opacity: ownerOpacity,
      instance,
    },
    state,
  );

  const entity = state.entities.find((candidate) => candidate.id === entityId);
  const entityProjection = state.projectionByEntityId[entityId];
  const componentProjection = state.componentVisualProjectionByEntityId[entityId];
  if (entity === undefined || entityProjection === undefined) {
    throw new Error(`instance ${component.type} overlay did not project ${entityId}`);
  }
  const projected = Object.freeze({
    entity,
    entityProjection,
    ...(componentProjection === undefined ? {} : { componentProjection }),
    ...(state.backgroundPaintProjectionByEntityId[entityId] === undefined
      ? {}
      : { backgroundProjection: state.backgroundPaintProjectionByEntityId[entityId] }),
    ...(state.imageProjectionByEntityId[entityId] === undefined
      ? {}
      : { imageProjection: state.imageProjectionByEntityId[entityId] }),
    ...(state.textProjectionByEntityId[entityId] === undefined
      ? {}
      : { textProjection: state.textProjectionByEntityId[entityId] }),
  });
  if (textCacheKey !== null && component.type === 'text' && cache !== undefined) {
    let componentCache = cache.textComponents.get(component);
    if (componentCache === undefined) {
      componentCache = new Map();
      cache.textComponents.set(component, componentCache);
    }
    componentCache.set(textCacheKey, Object.freeze({
      ownerId,
      ownerTranslation: Object.freeze([
        ownerProjection.affine[4],
        ownerProjection.affine[5],
      ] as const),
      projected,
    }));
  }
  return projected;
}

function rebaseCachedTextComponentProjection(
  cached: PatchMapCachedTextComponentProjection,
  entityId: string,
  ownerId: string,
  ownerProjection: PatchMapEntityProjection,
): PatchMapProjectedInstanceComponentOverlay {
  const entity = cached.projected.entity;
  const textProjection = cached.projected.textProjection;
  if (entity.kind !== 'text' || textProjection === undefined) {
    throw new Error('cached instance text projection is invalid');
  }
  const deltaX = ownerProjection.affine[4] - cached.ownerTranslation[0];
  const deltaY = ownerProjection.affine[5] - cached.ownerTranslation[1];
  const projection = cached.projected.entityProjection;
  const componentProjection = cached.projected.componentProjection;
  return Object.freeze({
    entity: Object.freeze({
      ...entity,
      id: entityId,
      x: entity.x + deltaX,
      y: entity.y + deltaY,
    }),
    entityProjection: Object.freeze({
      ...projection,
      entityId,
      affine: Object.freeze([
        projection.affine[0],
        projection.affine[1],
        projection.affine[2],
        projection.affine[3],
        projection.affine[4] + deltaX,
        projection.affine[5] + deltaY,
      ] as const),
      visibleCenter: Object.freeze([
        projection.visibleCenter[0] + deltaX,
        projection.visibleCenter[1] + deltaY,
      ] as const),
      ...(projection.ownerItemId === undefined ? {} : { ownerItemId: ownerId }),
    }),
    ...(componentProjection === undefined
      ? {}
      : {
          componentProjection: Object.freeze({
            ...componentProjection,
            entityId,
            ownerId,
            logicalIdentity: entityId,
          }),
        }),
    textProjection: Object.freeze({
      ...textProjection,
      entityId,
      ownerId,
    }),
  });
}

function parserTransform(projection: PatchMapEntityProjection): PatchMapParserTransform {
  return Object.freeze({
    x: projection.affine[4],
    y: projection.affine[5],
    rotation: projection.rotationDegrees,
    scaleX: projection.scaleX,
    scaleY: projection.scaleY,
    affine: projection.affine,
    imageIntrinsicTransform: Object.freeze({
      parentAffine: PATCH_MAP_IDENTITY_AFFINE,
      localTranslationAffine: PATCH_MAP_IDENTITY_AFFINE,
      localRotationScaleAffine: PATCH_MAP_IDENTITY_AFFINE,
      localPivotScaleAffine: PATCH_MAP_IDENTITY_AFFINE,
    }),
  });
}

function itemPath(componentPath: string): string {
  return componentPath.replace(/\.components\[\d+\]$/u, '');
}

function sourceElementPath(componentPath: string): string {
  const match = /^\$\[\d+\]/u.exec(componentPath);
  return match?.[0] ?? '$';
}
