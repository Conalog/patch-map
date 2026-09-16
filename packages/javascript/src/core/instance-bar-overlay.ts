import type {
  PatchMapBarProjection,
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import {
  freezePatchMapAffine,
  freezePatchMapBounds,
  patchMapAffineBasis,
  patchMapAffineCenter,
} from '../semantic/geometry';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from '../semantic/stable-record-overlay';
import type {
  PatchMapInstanceBarTarget,
} from './contracts';
import type {
  PatchMapIndexedComponentTarget,
} from './published-scene-state';
import { patchMapComponentTargetKey } from './component-target-key';

export interface PatchMapInstanceBarOverlayUpdate {
  readonly target: PatchMapInstanceBarTarget;
  readonly height: number | null;
}

export interface PatchMapInstanceBarOverlayPlan {
  readonly projection: PatchMapProjectionIndex;
  readonly changedEntityIds: readonly string[];
  readonly appliedTargets: readonly PatchMapInstanceBarTarget[];
  readonly missingTargets: readonly PatchMapInstanceBarTarget[];
}

/**
 * Resolve instance-qualified component IDs through the load-time target index
 * and patch only the selected projection records. The Engine-owned overlay
 * record strategy makes this O(changed targets), without per-cell scene nodes.
 */
export function planPatchMapInstanceBarOverlay(
  current: PatchMapProjectionIndex,
  authored: PatchMapProjectionIndex,
  updates: readonly PatchMapInstanceBarOverlayUpdate[],
  componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  recordStrategy: PatchMapStableRecordStrategy,
  options: Readonly<{
    readonly comparison?: PatchMapProjectionIndex;
    readonly strictMissing?: boolean;
  }> = {},
): PatchMapInstanceBarOverlayPlan {
  if (updates.length === 0) {
    return Object.freeze({
      projection: current,
      changedEntityIds: Object.freeze([]),
      appliedTargets: Object.freeze([]),
      missingTargets: Object.freeze([]),
    });
  }

  const selectedEntities = Object.create(null) as Record<
    string,
    PatchMapEntityProjection
  >;
  const selectedBars = Object.create(null) as Record<string, PatchMapBarProjection>;
  const patchedEntityIds: string[] = [];
  const changedEntityIds: string[] = [];
  const appliedTargets: PatchMapInstanceBarTarget[] = [];
  const missingTargets: PatchMapInstanceBarTarget[] = [];
  const seen = new Set<string>();

  for (const update of updates) {
    const key = patchMapComponentTargetKey(
      update.target.id,
      update.target.componentId,
    );
    if (seen.has(key)) {
      throw new TypeError(`duplicate instance bar target: ${update.target.id}/${update.target.componentId}`);
    }
    seen.add(key);
    const indexed = componentTargets.get(key);
    const bar = indexed
      ? authored.barsByEntityId[indexed.entityId]
      : undefined;
    const entity = indexed
      ? authored.byEntityId[indexed.entityId]
      : undefined;
    const owner = bar ? authored.byEntityId[bar.ownerId] : undefined;
    if (
      !indexed ||
      !bar ||
      !entity ||
      !owner ||
      bar.ownerId !== update.target.id ||
      bar.componentId !== update.target.componentId
    ) {
      missingTargets.push(update.target);
      continue;
    }
    appliedTargets.push(update.target);
    const height = update.height ?? bar.destinationHeight;
    const destination = projectPatchMapBarDestinationHeight(
      entity,
      owner,
      bar,
      height,
    );
    const currentBar = current.barsByEntityId[indexed.entityId];
    if (!currentBar || !Object.is(currentBar.destinationHeight, height)) {
      selectedEntities[indexed.entityId] = destination;
      selectedBars[indexed.entityId] = Object.freeze({
        ...bar,
        destinationHeight: height,
      });
      patchedEntityIds.push(indexed.entityId);
    }
    const comparison = options.comparison ?? current;
    if (!sameBarDestination(
      comparison.byEntityId[indexed.entityId],
      comparison.barsByEntityId[indexed.entityId],
      destination,
      height,
    )) {
      changedEntityIds.push(indexed.entityId);
    }
  }

  if ((options.strictMissing ?? true) && missingTargets.length > 0) {
    return Object.freeze({
      projection: current,
      changedEntityIds: Object.freeze([]),
      appliedTargets: Object.freeze(appliedTargets),
      missingTargets: Object.freeze(missingTargets),
    });
  }
  if (patchedEntityIds.length === 0) {
    return Object.freeze({
      projection: current,
      changedEntityIds: Object.freeze(changedEntityIds),
      appliedTargets: Object.freeze(appliedTargets),
      missingTargets: Object.freeze(missingTargets),
    });
  }
  const byEntityId = patchPatchMapStableRecord(
    current.byEntityId,
    selectedEntities,
    patchedEntityIds,
    recordStrategy,
    true,
  );
  const barsByEntityId = patchPatchMapStableRecord(
    current.barsByEntityId,
    selectedBars,
    patchedEntityIds,
    recordStrategy,
    true,
  );
  if (byEntityId === null || barsByEntityId === null) {
    throw new Error('instance bar overlay could not preserve projection membership');
  }
  return Object.freeze({
    projection: Object.freeze({ ...current, byEntityId, barsByEntityId }),
    changedEntityIds: Object.freeze(changedEntityIds),
    appliedTargets: Object.freeze(appliedTargets),
    missingTargets: Object.freeze([]),
  });
}

function sameBarDestination(
  currentEntity: PatchMapEntityProjection | undefined,
  currentBar: PatchMapBarProjection | undefined,
  nextEntity: PatchMapEntityProjection,
  nextHeight: number,
): boolean {
  if (!currentEntity || !currentBar || !Object.is(currentBar.destinationHeight, nextHeight)) {
    return false;
  }
  return sameNumbers(currentEntity.localBounds, nextEntity.localBounds) &&
    sameNumbers(currentEntity.affine, nextEntity.affine);
}

function sameNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.length === right.length && left.every((value, index) =>
    Object.is(value, right[index]));
}

/** Resolve an absolute bar height from its authored placement without drift. */
export function projectPatchMapBarDestinationHeight(
  entity: PatchMapEntityProjection,
  owner: PatchMapEntityProjection,
  bar: PatchMapBarProjection,
  heightValue: number,
): PatchMapEntityProjection {
  if (!Number.isFinite(heightValue) || heightValue < 0) {
    throw new RangeError('instance bar height must be finite and non-negative');
  }
  const height = Object.is(heightValue, -0) ? 0 : heightValue;
  const oldHeight = entity.localBounds[3];
  if (Object.is(oldHeight, height)) return entity;
  const localDeltaY = barPlacementDeltaY(bar.placement, height - oldHeight);
  const affine = freezePatchMapAffine(
    entity.affine[0],
    entity.affine[1],
    entity.affine[2],
    entity.affine[3],
    entity.affine[4] + owner.affine[2] * localDeltaY,
    entity.affine[5] + owner.affine[3] * localDeltaY,
  );
  const localBounds = freezePatchMapBounds(
    entity.localBounds[0],
    entity.localBounds[1],
    entity.localBounds[2],
    height,
  );
  return Object.freeze({
    ...entity,
    localBounds,
    affine,
    worldBasis: patchMapAffineBasis(affine),
    visibleCenter: patchMapAffineCenter(affine, localBounds),
  });
}

function barPlacementDeltaY(
  placement: PatchMapBarProjection['placement'],
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
