import {
  PATCH_MAP_COMPONENT_TYPES,
  PATCH_MAP_ELEMENT_TYPES,
  type MaterializedPatchMapDataset,
} from './dataset';
import {
  PATCH_MAP_SEMANTIC_PROBE_REVISION,
  type PatchMapSemanticProbeContext,
  type PatchMapSemanticProbeDatasetState,
  type PatchMapSemanticProbeLifecycle,
  type PatchMapSemanticProductProbe,
} from './probe/contracts';
import { collectPatchMapSemanticDatasetObservation } from './probe/dataset-observation';

export * from './probe/contracts';

/**
 * Build an implementation-owned semantic observation without consulting a scenario,
 * case ID, expected record, renderer object graph, or event trace.
 */
export function createPatchMapSemanticProbe(
  materialized: MaterializedPatchMapDataset | null,
  context: PatchMapSemanticProbeContext,
): PatchMapSemanticProductProbe {
  validateContext(context);
  const accumulator = collectPatchMapSemanticDatasetObservation(materialized);

  const elementTypes = PATCH_MAP_ELEMENT_TYPES.filter(
    (type) => (accumulator.elementCounts.get(type) ?? 0) > 0,
  );
  const componentTypes = PATCH_MAP_COMPONENT_TYPES.filter(
    (type) => (accumulator.componentCounts.get(type) ?? 0) > 0,
  );
  const resolvedPaintCount = accumulator.paintIntents.reduce(
    (count, intent) => count + Number(intent.resolved),
    0,
  );
  const rootCount = materialized?.dataset.length ?? 0;

  return deepFreeze({
    revision: PATCH_MAP_SEMANTIC_PROBE_REVISION,
    lifecycle: context.lifecycle,
    dataset: {
      state: datasetState(materialized, context.lifecycle),
      ref: context.datasetRef ?? null,
      semanticHash: materialized?.semanticHash ?? null,
      rootIds: materialized?.rootIds ?? [],
      graphDeepFrozen: materialized ? isDeepFrozen(materialized) : true,
    },
    scene: {
      nodes: accumulator.nodes,
      elementTypes,
      componentTypes,
      elementTypeCounts: PATCH_MAP_ELEMENT_TYPES.map((type) => ({
        type,
        count: accumulator.elementCounts.get(type) ?? 0,
      })),
      componentTypeCounts: PATCH_MAP_COMPONENT_TYPES.map((type) => ({
        type,
        count: accumulator.componentCounts.get(type) ?? 0,
      })),
      counts: {
        rootElements: rootCount,
        elements: accumulator.elementCount,
        components: accumulator.componentCount,
        hierarchyEdges: accumulator.elementCount + accumulator.componentCount - rootCount,
        maxDepth: accumulator.maxDepth,
        hiddenLogicalComponents: accumulator.hiddenLogicalComponentCount,
      },
    },
    geometry: {
      finiteValueCount: accumulator.finiteGeometryValueCount,
      nonFiniteValueCount: accumulator.nonFiniteGeometryValueCount,
      allFinite: accumulator.nonFiniteGeometryValueCount === 0,
    },
    text: {
      sourceCount: accumulator.textSourceCount,
      codeUnitCount: accumulator.textCodeUnitCount,
      sourcesWithUnpairedSurrogate: accumulator.textSourcesWithUnpairedSurrogate,
      unpairedSurrogateCount: accumulator.unpairedSurrogateCount,
    },
    paint: {
      intentCount: accumulator.paintIntents.length,
      resolvedCount: resolvedPaintCount,
      unresolvedCount: accumulator.paintIntents.length - resolvedPaintCount,
      intents: accumulator.paintIntents,
    },
    interaction: {
      ...(context.interactionMode === undefined ? {} : { mode: context.interactionMode }),
      selectionIds: context.selectionIds ? [...context.selectionIds] : [],
      ...(context.activeAnimationCount === undefined
        ? {}
        : { activeAnimationCount: context.activeAnimationCount }),
      ...(context.activeGestureCount === undefined
        ? {}
        : { activeGestureCount: context.activeGestureCount }),
    },
    history: {
      ...(context.historyDepth === undefined ? {} : { depth: context.historyDepth }),
      ...(context.historyCorruptCount === undefined
        ? {}
        : { corruptCount: context.historyCorruptCount }),
    },
  });
}

function datasetState(
  materialized: MaterializedPatchMapDataset | null,
  lifecycle: PatchMapSemanticProbeLifecycle,
): PatchMapSemanticProbeDatasetState {
  if (lifecycle === 'destroyed') return 'destroyed';
  if (lifecycle === 'destroying') return 'destroying';
  if (!materialized) return 'absent';
  return materialized.dataset.length === 0 ? 'empty' : 'loaded';
}

function validateContext(context: PatchMapSemanticProbeContext): void {
  for (const [name, value] of [
    ['activeAnimationCount', context.activeAnimationCount],
    ['activeGestureCount', context.activeGestureCount],
    ['historyDepth', context.historyDepth],
    ['historyCorruptCount', context.historyCorruptCount],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError(`${name} must be a nonnegative safe integer when observed`);
    }
  }
  for (const id of context.selectionIds ?? []) {
    if (typeof id !== 'string') throw new TypeError('selectionIds must contain strings');
  }
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => isDeepFrozen(Reflect.get(value, key), seen));
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), seen);
  return Object.freeze(value);
}
