import type {
  ParsePatchMapOptions,
  ParsePatchMapResult,
  PatchMapProjectionIndex,
} from '../contracts';
import {
  isOwnedPatchMapDataset,
  ownedPatchMapExactPatchIndices,
} from '../semantic/dataset';
import type { PatchMapDenseReconcilePlan } from '../semantic/reconcile';
import type { PatchMapScene } from '../scene';
import type { PatchMapDirectTextParseTargetIndex } from '../parser';
import type {
  PatchMapDirectBarHeightUpdate,
  PatchMapDirectElementAngleUpdate,
  PatchMapDirectTextUpdate,
  PatchMapReconcileFacts,
  PatchMapReconcileOptions,
  PatchMapReconcileResult,
} from './contracts';
import type {
  PatchMapIndexedComponentTarget,
  PatchMapIndexedTextTarget,
  PatchMapPublishedSceneState,
} from './published-scene-state';
import { isPlainRecord } from './projection-records';
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

export function matchesOwnedIncrementalInput(
  input: unknown,
  dirtyRootIds: readonly string[],
  options: ParsePatchMapOptions,
  state: PatchMapPublishedSceneState,
): boolean {
  const optionsKey = incrementalParseOptionsKey(options);
  if (
    !isOwnedPatchMapDataset(input) ||
    state.ownedInputDataset === null ||
    optionsKey === null ||
    optionsKey !== state.ownedParseOptionsKey ||
    input.length !== state.ownedInputDataset.length
  ) {
    return false;
  }
  const dirty = new Set(dirtyRootIds);
  const exactDirtyIndices = ownedPatchMapExactPatchIndices(
    input,
    state.ownedInputDataset,
  );
  if (exactDirtyIndices !== null) {
    for (const index of exactDirtyIndices) {
      const rootId = input[index]?.id;
      if (typeof rootId !== 'string' || !dirty.has(rootId)) return false;
    }
    return true;
  }
  for (let index = 0; index < input.length; index += 1) {
    const root = input[index];
    const rootId = root?.id;
    if (typeof rootId !== 'string') return false;
    if (!dirty.has(rootId) && root !== state.ownedInputDataset[index]) return false;
  }
  return true;
}

export function matchesOwnedStructuralInput(
  input: unknown,
  options: ParsePatchMapOptions,
  state: PatchMapPublishedSceneState,
): input is readonly unknown[] {
  const optionsKey = incrementalParseOptionsKey(options);
  return (
    isOwnedPatchMapDataset(input) &&
    state.ownedInputDataset !== null &&
    optionsKey !== null &&
    optionsKey === state.ownedParseOptionsKey
  );
}

export function cachedTransientSelectedParse(
  input: unknown,
  base: ParsePatchMapResult,
  dirtyRootIds: readonly string[],
  options: ParsePatchMapOptions,
  state: PatchMapPublishedSceneState,
): ParsePatchMapResult | null {
  const cached = state.transientIncrementalParse;
  if (
    cached === null ||
    cached.base !== base ||
    !Array.isArray(input) ||
    incrementalParseOptionsKey(options) !== cached.optionsKey ||
    !sameStringArray(dirtyRootIds, cached.dirtyRootIds) ||
    cached.dirtyIndices.length !== cached.dirtyRoots.length
  ) {
    return null;
  }
  for (let index = 0; index < cached.dirtyIndices.length; index += 1) {
    const rootIndex = cached.dirtyIndices[index];
    if (
      rootIndex === undefined ||
      input[rootIndex] !== cached.dirtyRoots[index]
    ) {
      return null;
    }
  }
  return cached.selected;
}

export function retainedOwnedInputDataset(
  input: unknown,
  options: ParsePatchMapOptions,
): Readonly<{
  dataset: readonly unknown[] | null;
  optionsKey: string | null;
}> {
  const optionsKey = incrementalParseOptionsKey(options);
  const dataset = isOwnedPatchMapDataset(input) && optionsKey !== null
    ? input
    : null;
  return Object.freeze({
    dataset,
    optionsKey: dataset === null ? null : optionsKey,
  });
}

/**
 * Conservative key for parser configuration reused by the incremental path.
 * Unsupported runtime shapes deliberately disable reuse; the canonical parser
 * remains authoritative for them.
 */
export function incrementalParseOptionsKey(options: ParsePatchMapOptions): string | null {
  const colors = options.colors;
  if (colors === undefined) return 'colors:default';
  if (!isPlainRecord(colors)) return null;
  const entries: string[] = [];
  for (const key of Object.keys(colors).sort()) {
    const value = colors[key];
    if (typeof value === 'string') {
      entries.push(JSON.stringify([key, 'string', value]));
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      entries.push(JSON.stringify([key, 'number', Object.is(value, -0) ? 0 : value]));
    } else if (value === undefined) {
      entries.push(JSON.stringify([key, 'undefined']));
    } else {
      return null;
    }
  }
  return `colors:${entries.join('|')}`;
}

export interface PatchMapReconcileFactStamp {
  readonly revision: number;
  readonly entityCount: number;
  readonly selectionCount: number;
}

export function reconcileFactStamp(scene: PatchMapScene): PatchMapReconcileFactStamp {
  return Object.freeze({
    revision: scene.revision,
    entityCount: scene.entityCount,
    selectionCount: scene.selection().refs.length,
  });
}

export function reconcileFacts(
  plan: PatchMapDenseReconcilePlan,
  semanticChanged: boolean,
  before: PatchMapReconcileFactStamp,
  after: PatchMapReconcileFactStamp,
): PatchMapReconcileFacts {
  return Object.freeze({
    semanticChanged,
    denseChanged: plan.batch.operations.length > 0,
    structuralChanged: plan.summary.added > 0 || plan.summary.removed > 0,
    structuralReplacement: plan.summary.replaced > 0,
    fullRebuild: false,
    revisionBefore: before.revision,
    revisionAfter: after.revision,
    entityCountBefore: before.entityCount,
    entityCountAfter: after.entityCount,
    selectionCountBefore: before.selectionCount,
    selectionCountAfter: after.selectionCount,
  });
}

export function freezeReconcileResult<T extends PatchMapReconcileResult>(result: T): T {
  return Object.freeze({
    ...result,
    timings: Object.freeze(result.timings),
    facts: Object.freeze(result.facts),
  }) as T;
}

export function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
