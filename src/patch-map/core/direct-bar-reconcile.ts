import type {
  ParsePatchMapResult,
  PatchMapBarProjection,
  PatchMapComponentVisualProjection,
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from '../contracts';
import { isOwnedPatchMapDataset } from '../semantic/dataset';
import {
  freezePatchMapAffine,
  freezePatchMapBounds,
  patchMapAffineBasis,
  patchMapAffineCenter,
  projectPatchMapSignedRect,
} from '../semantic/geometry';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from '../semantic/stable-record-overlay';
import type { PatchMapDirectBarHeightUpdate } from './contracts';
import type {
  PatchMapIndexedComponentTarget as IndexedComponentTarget,
} from './published-scene-state';
import { patchMapComponentProbeTargetKey as componentTargetKey } from './product-probe-reader';

export function reconcileDirectBarHeightParse(
  input: unknown,
  previous: ParsePatchMapResult,
  updates: readonly PatchMapDirectBarHeightUpdate[],
  componentTargets: ReadonlyMap<string, IndexedComponentTarget | null>,
  recordStrategy: PatchMapStableRecordStrategy,
): ParsePatchMapResult | null {
  if (!isOwnedPatchMapDataset(input) || updates.length === 0) return null;
  const entities = [...previous.document.entities];
  const selectedEntityProjections = Object.create(null) as Record<
    string,
    PatchMapEntityProjection
  >;
  const selectedBarProjections = Object.create(null) as Record<
    string,
    PatchMapBarProjection
  >;
  const selectedComponentProjections = Object.create(null) as Record<
    string,
    PatchMapComponentVisualProjection
  >;
  const entityIds: string[] = [];
  const seenTargets = new Set<string>();

  for (const update of updates) {
    if (!Number.isFinite(update.height) || update.height < 0) return null;
    const targetKey = componentTargetKey(update);
    if (seenTargets.has(targetKey)) return null;
    seenTargets.add(targetKey);
    const indexed = componentTargets.get(targetKey);
    if (
      indexed === undefined ||
      indexed === null ||
      indexed.rootIndex === null ||
      indexed.componentIndex === null
    ) {
      return null;
    }
    const root = input[indexed.rootIndex];
    if (root?.type !== 'item' || root.id !== update.ownerId) return null;
    const component = root.components[indexed.componentIndex];
    if (
      component?.type !== 'bar' ||
      component.id !== update.componentId ||
      typeof component.size !== 'object' ||
      component.size === null ||
      !('height' in component.size) ||
      typeof component.size.height !== 'number' ||
      component.size.height !== update.height
    ) {
      return null;
    }

    const entityIndex = indexed.entityIndex;
    const entity = previous.document.entities[entityIndex];
    const bar = previous.projection.barsByEntityId?.[indexed.entityId];
    const projection = previous.projection.byEntityId[indexed.entityId];
    const ownerProjection = bar === undefined
      ? undefined
      : previous.projection.byEntityId[bar.ownerId];
    if (
      entity?.id !== indexed.entityId ||
      entity.kind !== 'bar' ||
      bar === undefined ||
      projection === undefined ||
      ownerProjection === undefined
    ) {
      return null;
    }

    const oldHeight = projection.localBounds[3];
    const deltaHeight = update.height - oldHeight;
    const localDeltaY = directBarPlacementDeltaY(bar.placement, deltaHeight);
    const ownerAffine = ownerProjection.affine;
    const affine = freezePatchMapAffine(
      projection.affine[0],
      projection.affine[1],
      projection.affine[2],
      projection.affine[3],
      projection.affine[4] + ownerAffine[2] * localDeltaY,
      projection.affine[5] + ownerAffine[3] * localDeltaY,
    );
    const dense = projectPatchMapSignedRect(
      {
        x: affine[4],
        y: affine[5],
        rotation: projection.rotationDegrees,
        scaleX: projection.scaleX,
        scaleY: projection.scaleY,
      },
      projection.localBounds[2],
      update.height,
    );
    const localBounds = freezePatchMapBounds(
      projection.localBounds[0],
      projection.localBounds[1],
      projection.localBounds[2],
      update.height,
    );
    entities[entityIndex] = Object.freeze({
      ...entity,
      x: dense.x,
      y: dense.y,
      width: dense.width,
      height: dense.height,
    });
    selectedEntityProjections[indexed.entityId] = Object.freeze({
      ...projection,
      localBounds,
      affine,
      worldBasis: patchMapAffineBasis(affine),
      visibleCenter: patchMapAffineCenter(affine, localBounds),
    });
    selectedBarProjections[indexed.entityId] = Object.freeze({
      ...bar,
      destinationHeight: update.height,
    });
    const componentProjection =
      previous.projection.componentsByEntityId?.[indexed.entityId];
    if (componentProjection !== undefined) {
      selectedComponentProjections[indexed.entityId] = Object.freeze({
        ...componentProjection,
        authoredSize: component.size,
      });
    }
    entityIds.push(indexed.entityId);
  }

  const entityProjections = patchPatchMapStableRecord(
    previous.projection.byEntityId,
    selectedEntityProjections,
    entityIds,
    recordStrategy,
    true,
  );
  const barProjections = patchPatchMapStableRecord(
    previous.projection.barsByEntityId,
    selectedBarProjections,
    entityIds,
    recordStrategy,
    true,
  );
  const componentProjections = patchPatchMapStableRecord(
    previous.projection.componentsByEntityId,
    selectedComponentProjections,
    entityIds,
    recordStrategy,
    true,
  );
  if (
    entityProjections === null ||
    barProjections === null ||
    componentProjections === null
  ) {
    return null;
  }
  const document = Object.freeze({
    ...previous.document,
    entities: Object.freeze(entities),
  });
  const projection = Object.freeze({
    ...previous.projection,
    byEntityId: entityProjections,
    componentsByEntityId: componentProjections,
    barsByEntityId: barProjections,
  });
  return Object.freeze({
    ...previous,
    document,
    projection,
  });
}

function directBarPlacementDeltaY(
  placement: NonNullable<PatchMapProjectionIndex['barsByEntityId']>[string]['placement'],
  deltaHeight: number,
): number {
  if (
    placement === 'bottom' ||
    placement === 'left-bottom' ||
    placement === 'right-bottom'
  ) {
    return -deltaHeight;
  }
  if (placement === 'left' || placement === 'right' || placement === 'center') {
    return -deltaHeight / 2;
  }
  return 0;
}
