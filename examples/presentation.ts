import type { PatchMap, PatchMapTargetSet } from '@conalog/patch-map';

/** PlantMap owns the union of selection, filtering, related projection, and external focus. */
export function presentPlantMapFocus(
  patchMap: PatchMap,
  scope: PatchMapTargetSet,
  activeIds: readonly string[],
): void {
  patchMap.presentation.set('plant-map:focus', {
    scope,
    targets: activeIds,
    matched: { alphaMultiplier: 1 },
    unmatched: { alphaMultiplier: 0.32 },
  });
}

/** A neutral consumer uses the same partition without PatchMap learning search semantics. */
export function presentSearchResults(
  patchMap: PatchMap,
  scope: PatchMapTargetSet,
  resultIds: readonly string[],
): void {
  patchMap.presentation.set('search:results', {
    scope,
    targets: resultIds,
    unmatched: { alphaMultiplier: 0.2 },
  });
}
