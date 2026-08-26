import type {
  MaterializedPatchMapDataset,
  NormalizedPatchMapElement,
} from '../semantic/dataset';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationOperation,
} from '../semantic/transaction';
import type {
  PatchMapHistoryTransition,
  PatchMapSemanticHistorySnapshotInput,
} from '../history';
import {
  isPatchMapHistoryCompanionRecord,
  isPatchMapInteractionMode,
} from './input-contracts';
import type {
  PatchMapEngineHistoryCompanionState,
} from './contracts/history-transformer';
import type { PatchMapSceneStateAuthority } from './scene-state-authority';

export type PatchMapEngineHistoryCompanion = PatchMapEngineHistoryCompanionState;

export type PatchMapEngineHistoryTransition = PatchMapHistoryTransition<
  readonly NormalizedPatchMapElement[],
  PatchMapEngineHistoryCompanion
>;

export type PatchMapEngineHistorySnapshot = PatchMapSemanticHistorySnapshotInput<
  readonly NormalizedPatchMapElement[],
  PatchMapEngineHistoryCompanion
>;

export function createPatchMapEngineHistoryCompanion(
  selectionIds: readonly string[],
  mode: PatchMapEngineHistoryCompanion['mode'],
  hostCompanion: PatchMapMutationJsonValue | null,
): PatchMapEngineHistoryCompanion {
  return Object.freeze({
    selectionIds: Object.freeze([...selectionIds]),
    mode,
    hostCompanion,
  });
}

export function createPatchMapEngineHistorySnapshot(
  dataset: readonly NormalizedPatchMapElement[],
  companion: PatchMapEngineHistoryCompanion,
): PatchMapEngineHistorySnapshot {
  return Object.freeze({
    dataset,
    companion,
  });
}

export function planPatchMapEngineHistoryCompanion(
  value: PatchMapMutationJsonValue | undefined,
  fallbackSelectionIds: readonly string[],
  materialized: MaterializedPatchMapDataset,
  stableIdentity: boolean,
  structuralIdentity: boolean,
  mode: PatchMapEngineHistoryCompanion['mode'],
  hostCompanion: PatchMapMutationJsonValue | null,
  sceneState: PatchMapSceneStateAuthority,
): PatchMapEngineHistoryCompanion {
  const record = isPatchMapHistoryCompanionRecord(value) ? value : null;
  const selectedValue = record?.selectedIds;
  if (
    selectedValue !== undefined &&
    (
      !Array.isArray(selectedValue) ||
      selectedValue.some((entry) => typeof entry !== 'string')
    )
  ) {
    throw new TypeError('history companion selectedIds must be an array of strings');
  }
  const modeValue = record?.mode;
  if (modeValue !== undefined && !isPatchMapInteractionMode(modeValue)) {
    throw new TypeError('history companion mode is unsupported');
  }
  const requestedIds = selectedValue === undefined
    ? fallbackSelectionIds
    : selectedValue as readonly string[];
  const selectedIds = validPatchMapEngineHistorySelection(
    requestedIds,
    materialized,
    stableIdentity,
    structuralIdentity,
    sceneState,
  );
  return Object.freeze({
    selectionIds: selectedIds,
    mode: modeValue === undefined ? mode : modeValue,
    hostCompanion: value === undefined ? hostCompanion : value,
  });
}

export function resolvePatchMapEngineHistoryTransitionMode(
  transition: PatchMapEngineHistoryTransition,
): PatchMapEngineHistoryCompanion['mode'] {
  const mode = transition.snapshot.companion?.mode ?? 'select';
  if (!isPatchMapInteractionMode(mode)) {
    throw new TypeError('history companion mode is unsupported');
  }
  return mode;
}

export function resolvePatchMapEngineHistoryTransitionSelection(
  transition: PatchMapEngineHistoryTransition,
  materialized: MaterializedPatchMapDataset,
  stableIdentity: boolean,
  structuralIdentity: boolean,
  sceneState: PatchMapSceneStateAuthority,
): readonly string[] {
  const requestedSelection = transition.snapshot.companion?.selectionIds ?? Object.freeze([]);
  return validPatchMapEngineHistorySelection(
    requestedSelection,
    materialized,
    stableIdentity,
    structuralIdentity,
    sceneState,
  );
}

export function validPatchMapEngineHistorySelection(
  ids: readonly string[],
  materialized: MaterializedPatchMapDataset,
  stableIdentity: boolean,
  structuralIdentity: boolean,
  sceneState: PatchMapSceneStateAuthority,
): readonly string[] {
  return stableIdentity
    ? sceneState.validOwnedStableSelection(ids, materialized)
    : structuralIdentity
      ? sceneState.validOwnedStructuralSelection(ids, materialized)
      : sceneState.validLogicalSelection(ids, materialized);
}

export function patchMapEngineHistoryTransactionSelection(
  selectionIds: readonly string[],
  operations: readonly PatchMapMutationOperation[],
): readonly string[] {
  const removed = new Set(
    operations.flatMap((operation) =>
      operation.op === 'remove' && operation.target.kind === 'element'
        ? [operation.target.id]
        : []),
  );
  return Object.freeze(selectionIds.filter((id) => !removed.has(id)));
}
