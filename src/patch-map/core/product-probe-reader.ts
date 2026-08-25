import type { ParsePatchMapResult, PatchMapComponentVisualProjection, PatchMapProjectionIndex, PatchMapTextProjection } from '../contracts';
import type { PatchMapScene } from '../scene';
import type { PatchMapSceneImageController } from '../scene-images';
import type {
  PatchMapPresentationProbe,
  PatchMapPresentationSnapshot,
} from '../presentation';
import {
  createPatchMapPaintOrderProductProbe,
  type PatchMapPaintOrderProductProbe,
} from '../paint-order-product';
import { patchMapEntityWorldAabb } from '../semantic/entity-hit-index';
import { freezePatchMapBounds } from '../semantic/geometry';
import type {
  PatchMapEntityPaintProbe,
  PatchMapRenderLaneSnapshot,
  PatchMapTextAttachedSignatures,
  PatchMapTextRendererProbe,
  PatchMapTextSemanticSignatures,
} from '../renderers/types';
import {
  normalizePatchMapComponentVisualTarget,
  normalizePatchMapTextTarget,
  type PatchMapBarPresentationProductProbe,
  type PatchMapComponentVisualProductProbe,
  type PatchMapComponentVisualTarget,
  type PatchMapTextProductProbe,
  type PatchMapTextProductPublicationStatus,
  type PatchMapTextRendererProductProbe,
  type PatchMapTextTarget,
} from './contracts';
import type {
  PatchMapIndexedComponentTarget,
  PatchMapIndexedTextTarget,
} from './published-scene-state';
import {
  patchMapComponentProbeTargetKey,
} from './component-target-key';
import type { PatchMapRuntimeRendererPort } from './runtime-renderer-port';
export {
  patchMapComponentProbeTargetKey,
  patchMapComponentTargetKey,
} from './component-target-key';

export function indexPatchMapComponentProbeTargets(
  parse: ParsePatchMapResult,
): Map<string, PatchMapIndexedComponentTarget | null> {
  const targets = new Map<string, PatchMapIndexedComponentTarget | null>();
  const entityIndices = new Map<string, number>();
  for (let index = 0; index < parse.document.entities.length; index += 1) {
    const entity = parse.document.entities[index];
    if (entity !== undefined) entityIndices.set(entity.id, index);
  }
  const indexedByEntityId = new Map<string, PatchMapIndexedComponentTarget | null>();
  const resolveIndexed = (
    entityId: string,
    semanticOwnerId: string,
  ): PatchMapIndexedComponentTarget | null => {
    const cached = indexedByEntityId.get(entityId);
    if (cached !== undefined) return cached;
    const indexed = indexedComponentTarget(
      parse,
      entityId,
      semanticOwnerId,
      entityIndices,
    );
    indexedByEntityId.set(entityId, indexed);
    return indexed;
  };
  const components = parse.projection.componentsByEntityId;
  for (const entityId of Object.keys(components)) {
    const component = components[entityId];
    if (!component) continue;
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      component.ownerId;
    const indexed = resolveIndexed(entityId, semanticOwnerId);
    if (indexed === null) continue;
    indexComponentTarget(targets, component.ownerId, component.componentId, indexed);
    if (semanticOwnerId !== component.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, component.componentId, indexed);
    }
  }
  const bars = parse.projection.barsByEntityId;
  for (const entityId of Object.keys(bars)) {
    if (components[entityId] !== undefined) continue;
    const bar = bars[entityId];
    if (!bar) continue;
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      bar.ownerId;
    const indexed = resolveIndexed(entityId, semanticOwnerId);
    if (indexed === null) continue;
    indexComponentTarget(targets, bar.ownerId, bar.componentId, indexed);
    if (semanticOwnerId !== bar.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, bar.componentId, indexed);
    }
  }
  const texts = parse.projection.textsByEntityId;
  for (const entityId of Object.keys(texts)) {
    if (components[entityId] !== undefined) continue;
    const text = texts[entityId];
    if (
      text?.targetKind !== 'component' ||
      text.ownerId === undefined ||
      text.componentId === undefined
    ) {
      continue;
    }
    const semanticOwnerId = parse.identity.entitySourceById[entityId]?.sourceElementId ??
      text.ownerId;
    const indexed = resolveIndexed(entityId, semanticOwnerId);
    if (indexed === null) continue;
    indexComponentTarget(targets, text.ownerId, text.componentId, indexed);
    if (semanticOwnerId !== text.ownerId) {
      indexComponentTarget(targets, semanticOwnerId, text.componentId, indexed);
    }
  }
  return targets;
}

export function indexPatchMapTextProbeTargets(
  parse: ParsePatchMapResult,
): Map<string, PatchMapIndexedTextTarget | null> {
  const targets = new Map<string, PatchMapIndexedTextTarget | null>();
  const texts = parse.projection.textsByEntityId;
  for (const entityId of Object.keys(texts)) {
    const text = texts[entityId];
    if (!text) continue;
    const source = parse.identity.entitySourceById[entityId];
    if (text.targetKind === 'element') {
      const sourceId = source?.sourceElementId ?? entityId;
      indexTextTarget(
        targets,
        { kind: 'element', id: sourceId },
        Object.freeze({ entityId, semanticOwnerId: sourceId }),
      );
      continue;
    }
    if (!text.ownerId || !text.componentId) continue;
    const semanticOwnerId = source?.sourceElementId ?? text.ownerId;
    const indexed = Object.freeze({ entityId, semanticOwnerId });
    indexTextTarget(
      targets,
      { kind: 'component', ownerId: text.ownerId, id: text.componentId },
      indexed,
    );
    if (semanticOwnerId !== text.ownerId) {
      indexTextTarget(
        targets,
        { kind: 'component', ownerId: semanticOwnerId, id: text.componentId },
        indexed,
      );
    }
  }
  return targets;
}

export function createPatchMapComponentVisualProductProbe(
  target: PatchMapComponentVisualTarget,
  targets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  semanticProjection: PatchMapProjectionIndex | null,
  visibleProjection: PatchMapProjectionIndex | null,
  scene: PatchMapScene,
  renderer: PatchMapRuntimeRendererPort,
  sceneImages: PatchMapSceneImageController,
  rendererFactsPublished: boolean,
): PatchMapComponentVisualProductProbe | null {
  const normalizedTarget = normalizePatchMapComponentVisualTarget(target);
  const indexed = targets.get(patchMapComponentProbeTargetKey(normalizedTarget));
  if (!indexed) return null;
  const component = componentVisualProjection(semanticProjection, indexed.entityId);
  const projection = visibleProjection?.byEntityId[indexed.entityId];
  const entity = scene.get(indexed.entityId);
  if (
    !component ||
    !projection ||
    !entity ||
    (component.ownerId !== normalizedTarget.ownerId &&
      indexed.semanticOwnerId !== normalizedTarget.ownerId) ||
    component.componentId !== normalizedTarget.componentId
  ) {
    return null;
  }
  const worldBounds = patchMapEntityWorldAabb(entity, projection);
  if (worldBounds === null) return null;
  return Object.freeze({
    target: normalizedTarget,
    semanticOwnerId: indexed.semanticOwnerId,
    entityId: component.entityId,
    logicalIdentity: component.logicalIdentity,
    componentType: component.componentType,
    renderRole: component.renderRole,
    entityKind: entity.kind,
    geometry: Object.freeze({
      localBounds: projection.localBounds,
      worldBounds,
      visibleBounds: entity.visible ? worldBounds : null,
      visible: entity.visible,
      interactive: entity.interactive,
    }),
    publication: Object.freeze({
      rendererFacts: rendererFactsPublished ? 'current' : 'pending',
    }),
    image: rendererFactsPublished
      ? sceneImages.imageProbe(indexed.entityId, true)
      : null,
    rendererPaint: rendererFactsPublished
      ? renderer.entityPaintProbe(indexed.entityId)
      : null,
    renderLanes: rendererFactsPublished ? renderer.renderLaneProbe() : null,
  });
}

export function createPatchMapBarPresentationProductProbe(
  target: PatchMapComponentVisualTarget,
  targets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  semanticProjection: PatchMapProjectionIndex | null,
  presentation: Readonly<{
    readonly ghostPublicationCount: number;
    snapshot(): PatchMapPresentationSnapshot;
    probe(entityId: string): PatchMapPresentationProbe | null;
    visibleHeight(entityId: string): number | null;
  }>,
): PatchMapBarPresentationProductProbe | null {
  const normalizedTarget = normalizePatchMapComponentVisualTarget(target);
  const indexed = targets.get(patchMapComponentProbeTargetKey(normalizedTarget));
  if (!indexed) return null;
  const bar = semanticProjection?.barsByEntityId[indexed.entityId];
  if (
    bar === undefined ||
    (bar.ownerId !== normalizedTarget.ownerId &&
      indexed.semanticOwnerId !== normalizedTarget.ownerId) ||
    bar.componentId !== normalizedTarget.componentId
  ) {
    return null;
  }
  const controller = presentation.snapshot();
  const active = presentation.probe(indexed.entityId);
  const presentationHeight = presentation.visibleHeight(indexed.entityId) ??
    bar.destinationHeight;
  return Object.freeze({
    target: normalizedTarget,
    entityId: indexed.entityId,
    policy: Object.freeze({
      enabled: bar.animation,
      durationMs: bar.animationDuration,
    }),
    semanticHeight: bar.destinationHeight,
    presentationHeight,
    active: active !== null,
    startHeight: active?.startValue ?? presentationHeight,
    destinationHeight: active?.destinationValue ?? bar.destinationHeight,
    startTimeMs: active?.startTimeMs ?? null,
    controller,
    ghostPublicationCount: presentation.ghostPublicationCount,
  });
}

export function createPatchMapRuntimePaintOrderProbe(
  scene: PatchMapScene,
  renderer: PatchMapRuntimeRendererPort,
  visibleProjection: PatchMapProjectionIndex | null,
  renderedSceneRevision: number | null,
): PatchMapPaintOrderProductProbe {
  return createPatchMapPaintOrderProductProbe({
    snapshot: scene.snapshot(),
    projection: visibleProjection,
    overlays: renderer.overlayPaintProbe(),
    renderer: renderer.debugSnapshot(),
    renderedSceneRevision,
    paintForEntity: (entityId) => renderer.entityPaintProbe(entityId),
  });
}

export function createPatchMapTextProductProbe(
  target: PatchMapTextTarget,
  textTargets: ReadonlyMap<string, PatchMapIndexedTextTarget | null>,
  semanticProjection: PatchMapProjectionIndex | null,
  visibleProjection: PatchMapProjectionIndex | null,
  scene: PatchMapScene,
  renderer: PatchMapRuntimeRendererPort,
  rendererFactsPublished: boolean,
  renderedSceneRevision: number | null,
): PatchMapTextProductProbe | null {
  const normalizedTarget = normalizePatchMapTextTarget(target);
  const indexed = textTargets.get(patchMapTextProbeTargetKey(normalizedTarget));
  if (!indexed) return null;
  const semantic = semanticProjection?.textsByEntityId[indexed.entityId];
  const projection = visibleProjection?.byEntityId[indexed.entityId];
  const entity = scene.get(indexed.entityId);
  if (
    !semantic ||
    !projection ||
    !entity ||
    entity.kind !== 'text' ||
    !textProjectionMatchesTarget(semantic, normalizedTarget, indexed.semanticOwnerId)
  ) {
    return null;
  }
  const worldBounds = patchMapEntityWorldAabb(entity, projection);
  if (worldBounds === null) return null;
  const rendererProbe = renderer.textRendererProbe(indexed.entityId);
  const rendererPaint = renderer.entityPaintProbe(indexed.entityId);
  const renderLanes = renderer.renderLaneProbe();
  const semanticSignatures = freezeTextSemanticSignatures(semantic);
  const rendererCorrelated = rendererTextProbeCorrelates(
    rendererProbe,
    indexed.entityId,
    semanticSignatures,
  );
  const current = entity.visible &&
    rendererFactsPublished &&
    rendererCorrelated &&
    rendererTextPaintCorrelates(
      rendererPaint,
      indexed.entityId,
      semantic.color,
      entity.opacity,
    ) &&
    rendererTextLaneCorrelates(renderLanes) &&
    renderedSceneRevision === scene.revision;
  const absent = !entity.visible &&
    rendererFactsPublished &&
    rendererTextAbsenceCorrelates(
      rendererProbe,
      indexed.entityId,
      semanticSignatures,
    ) &&
    renderedSceneRevision === scene.revision;
  const status: PatchMapTextProductPublicationStatus = absent
    ? 'absent'
    : current
      ? 'current'
      : 'pending';
  const retainedHiddenRenderer = !entity.visible &&
    !absent &&
    rendererProbe !== null &&
    rendererProbe.attachedRoute !== 'none' &&
    rendererProbe.objectKind !== 'none' &&
    rendererProbe.lastRenderedSignatures !== null &&
    rendererProbe.lastRenderedFrame !== null;
  const productRendererProbe = absent
    ? null
    : entity.visible || retainedHiddenRenderer
      ? rendererProbe
      : null;
  const productRenderer = freezeTextRendererProductProbe(
    semantic,
    semanticSignatures,
    productRendererProbe,
  );
  return Object.freeze({
    target: normalizedTarget,
    semanticOwnerId: indexed.semanticOwnerId,
    entityId: indexed.entityId,
    semantic,
    geometry: Object.freeze({
      localBounds: projection.localBounds,
      ownerLocalBounds: freezePatchMapBounds(
        semantic.ownerLocalBounds.x,
        semantic.ownerLocalBounds.y,
        semantic.ownerLocalBounds.width,
        semantic.ownerLocalBounds.height,
      ),
      worldBounds,
      hitBounds: worldBounds,
      visibleBounds: entity.visible ? worldBounds : null,
    }),
    state: Object.freeze({
      visible: entity.visible,
      interactive: entity.interactive,
      zIndex: entity.zIndex,
      opacity: entity.opacity,
    }),
    transform: Object.freeze({
      affine: projection.affine,
      worldBasis: projection.worldBasis,
      visibleCenter: projection.visibleCenter,
      rotationDegrees: projection.rotationDegrees,
      scaleX: projection.scaleX,
      scaleY: projection.scaleY,
      contentOrientation: projection.contentOrientation,
    }),
    renderer: productRenderer,
    rendererPaint: current || retainedHiddenRenderer ? rendererPaint : null,
    renderLanes: current || retainedHiddenRenderer ? renderLanes : null,
    publication: Object.freeze({
      status,
      sceneRevision: scene.revision,
      renderedSceneRevision,
      rendererFrame: productRenderer.lastRenderedFrame,
    }),
  });
}

function indexedComponentTarget(
  parse: ParsePatchMapResult,
  entityId: string,
  semanticOwnerId: string,
  entityIndices: ReadonlyMap<string, number>,
): PatchMapIndexedComponentTarget | null {
  const entityIndex = entityIndices.get(entityId);
  if (entityIndex === undefined) return null;
  const source = parse.identity.entitySourceById[entityId];
  const rootIndex = directTopLevelSourceIndex(source?.sourceElementPath);
  const componentSlots = directTopLevelComponentSourceSlots(source?.componentPath);
  return Object.freeze({
    entityId,
    entityIndex,
    semanticOwnerId,
    rootIndex:
      rootIndex !== null && rootIndex === componentSlots?.rootIndex
        ? rootIndex
        : null,
    componentIndex: componentSlots?.componentIndex ?? null,
    componentPath: source?.componentPath ?? null,
  });
}

function directTopLevelSourceIndex(path: string | undefined): number | null {
  if (
    path === undefined ||
    !path.startsWith('$[') ||
    !path.endsWith(']') ||
    path.indexOf(']', 2) !== path.length - 1
  ) {
    return null;
  }
  const index = Number(path.slice(2, -1));
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function directTopLevelComponentSourceSlots(
  path: string | undefined,
): Readonly<{ readonly rootIndex: number; readonly componentIndex: number }> | null {
  if (path === undefined || !path.startsWith('$[') || !path.endsWith(']')) return null;
  const rootEnd = path.indexOf(']', 2);
  const componentPrefix = '].components[';
  if (
    rootEnd < 3 ||
    path.slice(rootEnd, rootEnd + componentPrefix.length) !== componentPrefix
  ) {
    return null;
  }
  const rootIndex = Number(path.slice(2, rootEnd));
  const componentIndex = Number(path.slice(rootEnd + componentPrefix.length, -1));
  if (
    !Number.isSafeInteger(rootIndex) ||
    rootIndex < 0 ||
    !Number.isSafeInteger(componentIndex) ||
    componentIndex < 0
  ) {
    return null;
  }
  return Object.freeze({ rootIndex, componentIndex });
}

function componentVisualProjection(
  projection: PatchMapProjectionIndex | null,
  entityId: string,
): PatchMapComponentVisualProjection | null {
  if (projection === null) return null;
  const component = projection.componentsByEntityId[entityId];
  if (component !== undefined) return component;

  const bar = projection.barsByEntityId[entityId];
  if (bar !== undefined) {
    return Object.freeze({
      entityId,
      ownerId: bar.ownerId,
      componentId: bar.componentId,
      componentType: 'bar',
      logicalIdentity: entityId,
      renderRole: 'ordinary-geometry',
    });
  }

  const text = projection.textsByEntityId[entityId];
  if (
    text?.targetKind === 'component' &&
    text.ownerId !== undefined &&
    text.componentId !== undefined
  ) {
    return Object.freeze({
      entityId,
      ownerId: text.ownerId,
      componentId: text.componentId,
      componentType: 'text',
      logicalIdentity: entityId,
      renderRole: 'text',
    });
  }
  return null;
}

function indexComponentTarget(
  targets: Map<string, PatchMapIndexedComponentTarget | null>,
  ownerId: string,
  componentId: string,
  indexed: PatchMapIndexedComponentTarget,
): void {
  const key = patchMapComponentProbeTargetKey({ ownerId, componentId });
  const previous = targets.get(key);
  if (previous === undefined || previous?.entityId === indexed.entityId) {
    targets.set(key, indexed);
    return;
  }
  // A semantic grid template may expand to many component entities. The
  // source-owner target is deliberately unavailable instead of selecting an
  // arbitrary instance; callers can query an instance-qualified owner.
  targets.set(key, null);
}

function indexTextTarget(
  targets: Map<string, PatchMapIndexedTextTarget | null>,
  target: PatchMapTextTarget,
  indexed: PatchMapIndexedTextTarget,
): void {
  const key = patchMapTextProbeTargetKey(target);
  const previous = targets.get(key);
  if (previous === undefined || previous?.entityId === indexed.entityId) {
    targets.set(key, indexed);
    return;
  }
  // A source grid template can expand to many instance-qualified text leaves.
  // Keep the template target explicitly ambiguous instead of selecting one.
  targets.set(key, null);
}

export function patchMapTextProbeTargetKey(target: PatchMapTextTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}

function textProjectionMatchesTarget(
  projection: PatchMapTextProjection,
  target: PatchMapTextTarget,
  semanticOwnerId: string,
): boolean {
  if (target.kind === 'element') {
    return projection.targetKind === 'element' && semanticOwnerId === target.id;
  }
  return projection.targetKind === 'component' &&
    projection.componentId === target.id &&
    (projection.ownerId === target.ownerId || semanticOwnerId === target.ownerId);
}

function freezeTextSemanticSignatures(
  semantic: PatchMapTextProjection,
): PatchMapTextSemanticSignatures {
  return Object.freeze({
    content: semantic.contentSignature,
    style: semantic.styleSignature,
    layout: semantic.layoutSignature,
  });
}

function rendererTextProbeCorrelates(
  renderer: PatchMapTextRendererProbe | null,
  entityId: string,
  semantic: PatchMapTextSemanticSignatures,
): renderer is PatchMapTextRendererProbe {
  return renderer !== null &&
    renderer.entityId === entityId &&
    renderer.publicationStatus === 'current' &&
    renderer.objectCount === 1 &&
    renderer.staleGlyphCount === 0 &&
    renderer.attachedRoute !== 'none' &&
    renderer.objectKind !== 'none' &&
    renderer.attachedRoute === renderer.objectKind &&
    sameTextSemanticSignatures(renderer.semanticSignatures, semantic) &&
    sameTextAttachedSemantic(renderer.attachedSignatures, semantic) &&
    sameTextAttachedSemantic(renderer.lastRenderedSignatures, semantic) &&
    renderer.attachedSignatures?.renderer === renderer.lastRenderedSignatures?.renderer &&
    renderer.lastRenderedFrame !== null;
}

function rendererTextAbsenceCorrelates(
  renderer: PatchMapTextRendererProbe | null,
  entityId: string,
  semantic: PatchMapTextSemanticSignatures,
): renderer is PatchMapTextRendererProbe {
  return renderer !== null &&
    renderer.entityId === entityId &&
    renderer.publicationStatus === 'current' &&
    renderer.attachedRoute === 'none' &&
    renderer.objectKind === 'none' &&
    renderer.routeDecisionReason === 'not-attached' &&
    renderer.objectCount === 0 &&
    renderer.staleGlyphCount === 0 &&
    sameTextSemanticSignatures(renderer.semanticSignatures, semantic) &&
    renderer.attachedSignatures === null &&
    renderer.lastRenderedSignatures === null &&
    renderer.lastRenderedFrame !== null;
}

function sameTextSemanticSignatures(
  left: PatchMapTextSemanticSignatures,
  right: PatchMapTextSemanticSignatures,
): boolean {
  return left.content === right.content &&
    left.style === right.style &&
    left.layout === right.layout;
}

function sameTextAttachedSemantic(
  attached: PatchMapTextAttachedSignatures | null,
  semantic: PatchMapTextSemanticSignatures,
): boolean {
  return attached !== null && sameTextSemanticSignatures(attached, semantic);
}

function rendererTextPaintCorrelates(
  paint: PatchMapEntityPaintProbe | null,
  entityId: string,
  packedColor: number,
  opacity: number,
): paint is PatchMapEntityPaintProbe {
  const color = packedColor >>> 0;
  return paint !== null &&
    paint.entityId === entityId &&
    paint.lane === 'text' &&
    paint.rendererKind === 'text' &&
    paint.primitiveCount === 1 &&
    paint.renderObjectCount === 1 &&
    paint.packedTint === color &&
    paint.rgbTint === color >>> 8 &&
    paint.alpha === ((color & 0xff) / 255) * opacity;
}

function rendererTextLaneCorrelates(
  lanes: PatchMapRenderLaneSnapshot | null,
): lanes is PatchMapRenderLaneSnapshot {
  return lanes !== null &&
    lanes.text.role === 'text' &&
    lanes.text.renderObjectCount >= 1 &&
    lanes.text.visiblePrimitiveCount >= 1;
}

function freezeTextRendererProductProbe(
  semantic: PatchMapTextProjection,
  semanticSignatures: PatchMapTextSemanticSignatures,
  renderer: PatchMapTextRendererProbe | null,
): PatchMapTextRendererProductProbe {
  // The renderer decision owns the executable plan because BitmapText capability
  // is renderer-local. The parser route remains the detached semantic heuristic.
  const plannedRoute = renderer !== null && renderer.attachedRoute !== 'none'
    ? renderer.attachedRoute
    : semantic.rendererRoute;
  return Object.freeze({
    plannedRoute,
    attachedRoute: renderer?.attachedRoute ?? null,
    objectKind: renderer?.objectKind ?? 'none',
    routeDecisionReason: renderer?.routeDecisionReason ?? 'not-attached',
    objectCount: renderer?.objectCount ?? 0,
    semanticSignatures,
    attachedSignatures: renderer?.attachedSignatures ?? null,
    lastRenderedSignatures: renderer?.lastRenderedSignatures ?? null,
    lastRenderedFrame: renderer?.lastRenderedFrame ?? null,
    staleGlyphCount: renderer?.staleGlyphCount ?? 0,
  });
}
