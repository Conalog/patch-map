import type {
  ParsePatchMapResult,
  PatchMapProjectionIndex,
} from '../contracts';
import type { PatchMapDirectTextParseTargetIndex } from '../parser';
import type {
  PatchMapDirectBarHeightUpdate,
  PatchMapDirectElementAngleUpdate,
  PatchMapDirectTextUpdate,
  PatchMapReconcileOptions,
} from './contracts';
import type {
  PatchMapIndexedComponentTarget,
  PatchMapIndexedTextTarget,
} from './published-scene-state';
import {
  patchMapComponentProbeTargetKey,
  patchMapTextProbeTargetKey,
} from './product-probe-reader';

/** Resolve owned incremental roots to the dense entities eligible for reuse. */
export function incrementalDenseEntityIds(
  parse: ParsePatchMapResult,
  rootIds: readonly string[],
): readonly string[] {
  const ids = new Set<string>();
  for (const rootId of rootIds) {
    for (const entityId of parse.identity.entityIdsBySourceId[rootId] ?? []) {
      ids.add(entityId);
    }
  }
  return Object.freeze([...ids]);
}

export function directElementAngleEntityIds(
  parse: ParsePatchMapResult,
  updates: readonly PatchMapDirectElementAngleUpdate[],
): readonly string[] | undefined {
  const ids = new Set<string>();
  for (const update of updates) {
    const entityIds = parse.identity.entityIdsBySourceId[update.id];
    if (entityIds === undefined || entityIds.length === 0) return undefined;
    for (const entityId of entityIds) ids.add(entityId);
  }
  return ids.size === 0 ? undefined : Object.freeze([...ids]);
}

export function directTextEntityIds(
  updates: readonly PatchMapDirectTextUpdate[],
  targets: ReadonlyMap<string, PatchMapIndexedTextTarget | null>,
): readonly string[] | undefined {
  const ids = new Set<string>();
  for (const update of updates) {
    const indexed = targets.get(patchMapTextProbeTargetKey({
      kind: 'component',
      ownerId: update.ownerId,
      id: update.componentId,
    }));
    if (indexed === undefined || indexed === null) return undefined;
    ids.add(indexed.entityId);
  }
  return ids.size === 0 ? undefined : Object.freeze([...ids]);
}

/** Reuse the pre-indexed component positions required by direct text parsing. */
export function directTextParseTargetHints(
  updates: readonly PatchMapDirectTextUpdate[],
  targets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
): readonly PatchMapDirectTextParseTargetIndex[] | undefined {
  const hints: PatchMapDirectTextParseTargetIndex[] = [];
  for (const update of updates) {
    const indexed = targets.get(patchMapComponentProbeTargetKey(update));
    if (
      indexed === undefined ||
      indexed === null ||
      indexed.rootIndex === null ||
      indexed.componentIndex === null ||
      indexed.componentPath === null
    ) {
      return undefined;
    }
    hints.push(indexed as PatchMapDirectTextParseTargetIndex);
  }
  return hints.length === 0 ? undefined : Object.freeze(hints);
}

export function directBarEntityIds(
  updates: readonly PatchMapDirectBarHeightUpdate[],
  targets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
): readonly string[] | undefined {
  const ids = new Set<string>();
  for (const update of updates) {
    const indexed = targets.get(patchMapComponentProbeTargetKey(update));
    if (indexed === undefined || indexed === null) return undefined;
    ids.add(indexed.entityId);
  }
  return ids.size === 0 ? undefined : Object.freeze([...ids]);
}

/** Find the structural presentation window using immutable projection identity. */
export function changedProjectionEntityIds(
  previous: PatchMapProjectionIndex,
  next: PatchMapProjectionIndex,
): readonly string[] {
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const entityId of Object.keys(previous.byEntityId)) {
    seen.add(entityId);
    if (previous.byEntityId[entityId] !== next.byEntityId[entityId]) {
      changed.push(entityId);
    }
  }
  for (const entityId of Object.keys(next.byEntityId)) {
    if (!seen.has(entityId)) changed.push(entityId);
  }
  return Object.freeze(changed);
}

/** Confirm whether a structural parse preserved every indexed target identity. */
export function structuralTargetMappingsReusable(
  current: ParsePatchMapResult,
  candidate: ParsePatchMapResult,
  options: PatchMapReconcileOptions,
): boolean {
  if (
    (options.allowedElementOrderIds?.length ?? 0) === 0 ||
    current.identity.counts.entities !== candidate.identity.counts.entities ||
    current.identity.counts.sourceComponents !==
      candidate.identity.counts.sourceComponents
  ) {
    return false;
  }
  for (const entityId of candidate.identity.entityIds) {
    const before = current.identity.entitySourceById[entityId];
    const after = candidate.identity.entitySourceById[entityId];
    if (
      before === undefined ||
      after === undefined ||
      before.sourceElementId !== after.sourceElementId ||
      before.instanceId !== after.instanceId ||
      before.componentId !== after.componentId
    ) {
      return false;
    }
  }
  return true;
}
