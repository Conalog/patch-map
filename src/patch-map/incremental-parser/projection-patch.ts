import type { EntityInput } from '../dense/contracts';
import type { PatchMapProjectionIndex } from '../contracts';
import {
  patchPatchMapStableRecord,
  type PatchMapStableRecordStrategy,
} from '../semantic/stable-record-overlay';

import type { RootFragment } from './contracts';

export function patchStableProjection(
  previous: PatchMapProjectionIndex,
  fragments: readonly RootFragment[],
  dirtyIndices: readonly number[],
  entityIds: readonly string[],
  recordStrategy: PatchMapStableRecordStrategy,
): PatchMapProjectionIndex | null {
  const selected = emptyProjection();
  for (const rootIndex of dirtyIndices) {
    const fragment = fragments[rootIndex];
    if (fragment === undefined) return null;
    for (const entity of fragment.entities) {
      appendProjectionEntity(selected, fragment.projection, entity.id);
    }
  }
  const byEntityId = patchPatchMapStableRecord(
    previous.byEntityId,
    selected.byEntityId,
    entityIds,
    recordStrategy,
  );
  const componentsByEntityId = patchPatchMapStableRecord(
    previous.componentsByEntityId,
    selected.componentsByEntityId,
    entityIds,
    recordStrategy,
  );
  const backgroundsByEntityId = patchPatchMapStableRecord(
    previous.backgroundsByEntityId,
    selected.backgroundsByEntityId,
    entityIds,
    recordStrategy,
  );
  const imagesByEntityId = patchPatchMapStableRecord(
    previous.imagesByEntityId,
    selected.imagesByEntityId,
    entityIds,
    recordStrategy,
  );
  const textsByEntityId = patchPatchMapStableRecord(
    previous.textsByEntityId,
    selected.textsByEntityId,
    entityIds,
    recordStrategy,
  );
  const barsByEntityId = patchPatchMapStableRecord(
    previous.barsByEntityId,
    selected.barsByEntityId,
    entityIds,
    recordStrategy,
  );
  const relationsByEntityId = patchPatchMapStableRecord(
    previous.relationsByEntityId,
    selected.relationsByEntityId,
    entityIds,
    recordStrategy,
  );
  if (
    byEntityId === null ||
    componentsByEntityId === null ||
    backgroundsByEntityId === null ||
    imagesByEntityId === null ||
    textsByEntityId === null ||
    barsByEntityId === null ||
    relationsByEntityId === null
  ) {
    return null;
  }
  return Object.freeze({
    byEntityId,
    componentsByEntityId,
    backgroundsByEntityId,
    imagesByEntityId,
    textsByEntityId,
    barsByEntityId,
    relationsByEntityId,
    omittedRelations: previous.omittedRelations,
  });
}

export function projectionForEntities(
  source: PatchMapProjectionIndex,
  entities: readonly EntityInput[],
  omittedRelations: readonly NonNullable<
    PatchMapProjectionIndex['omittedRelations']
  >[number][] = [],
): PatchMapProjectionIndex {
  const projection = emptyProjection();
  for (const entity of entities) appendProjectionEntity(projection, source, entity.id);
  projection.omittedRelations.push(...omittedRelations);
  return freezeProjection(projection);
}

export function emptyProjection(): MutableProjection {
  return {
    byEntityId: Object.create(null) as MutableProjection['byEntityId'],
    componentsByEntityId:
      Object.create(null) as MutableProjection['componentsByEntityId'],
    backgroundsByEntityId:
      Object.create(null) as MutableProjection['backgroundsByEntityId'],
    imagesByEntityId: Object.create(null) as MutableProjection['imagesByEntityId'],
    textsByEntityId: Object.create(null) as MutableProjection['textsByEntityId'],
    barsByEntityId: Object.create(null) as MutableProjection['barsByEntityId'],
    relationsByEntityId:
      Object.create(null) as MutableProjection['relationsByEntityId'],
    omittedRelations: [],
  };
}

interface MutableProjection {
  readonly byEntityId: Record<string, NonNullable<PatchMapProjectionIndex['byEntityId'][string]>>;
  readonly componentsByEntityId: Record<string, NonNullable<
    NonNullable<PatchMapProjectionIndex['componentsByEntityId']>[string]
  >>;
  readonly backgroundsByEntityId: Record<string, NonNullable<
    NonNullable<PatchMapProjectionIndex['backgroundsByEntityId']>[string]
  >>;
  readonly imagesByEntityId: Record<string, NonNullable<
    NonNullable<PatchMapProjectionIndex['imagesByEntityId']>[string]
  >>;
  readonly textsByEntityId: Record<string, NonNullable<
    NonNullable<PatchMapProjectionIndex['textsByEntityId']>[string]
  >>;
  readonly barsByEntityId: Record<string, NonNullable<
    NonNullable<PatchMapProjectionIndex['barsByEntityId']>[string]
  >>;
  readonly relationsByEntityId: Record<string, NonNullable<
    NonNullable<PatchMapProjectionIndex['relationsByEntityId']>[string]
  >>;
  readonly omittedRelations: NonNullable<PatchMapProjectionIndex['omittedRelations']>[number][];
}

export function appendProjectionEntity(
  target: MutableProjection,
  source: PatchMapProjectionIndex,
  entityId: string,
): void {
  appendRecordValue(target.byEntityId, source.byEntityId, entityId);
  appendRecordValue(target.componentsByEntityId, source.componentsByEntityId, entityId);
  appendRecordValue(target.backgroundsByEntityId, source.backgroundsByEntityId, entityId);
  appendRecordValue(target.imagesByEntityId, source.imagesByEntityId, entityId);
  appendRecordValue(target.textsByEntityId, source.textsByEntityId, entityId);
  appendRecordValue(target.barsByEntityId, source.barsByEntityId, entityId);
  appendRecordValue(target.relationsByEntityId, source.relationsByEntityId, entityId);
}

function appendRecordValue<Value>(
  target: Record<string, Value>,
  source: Readonly<Record<string, Value>> | undefined,
  key: string,
): void {
  const value = source?.[key];
  if (value !== undefined) target[key] = value;
}

export function freezeProjection(projection: MutableProjection): PatchMapProjectionIndex {
  return Object.freeze({
    byEntityId: Object.freeze(projection.byEntityId),
    componentsByEntityId: Object.freeze(projection.componentsByEntityId),
    backgroundsByEntityId: Object.freeze(projection.backgroundsByEntityId),
    imagesByEntityId: Object.freeze(projection.imagesByEntityId),
    textsByEntityId: Object.freeze(projection.textsByEntityId),
    barsByEntityId: Object.freeze(projection.barsByEntityId),
    relationsByEntityId: Object.freeze(projection.relationsByEntityId),
    omittedRelations: Object.freeze(projection.omittedRelations),
  });
}
