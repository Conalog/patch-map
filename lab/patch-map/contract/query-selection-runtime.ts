import type { PatchMap } from '../../../src/patch-map';

export const PATCH_MAP_QUERY_SELECTION_RUNTIME_REVISION =
  'core-v2-query-selection-runtime/1' as const;
export const PATCH_MAP_QUERY_SELECTION_CLEANUP_REVISION =
  'core-v2-query-selection-cleanup/1' as const;

export const PATCH_MAP_QUERY_SELECTION_CASE_IDS = Object.freeze([
  'QRY-001',
  'QRY-002',
  'SEL-001',
  'SEL-002',
  'SEL-003',
  'SEL-004',
] as const);

export type PatchMapQuerySelectionCaseId =
  (typeof PATCH_MAP_QUERY_SELECTION_CASE_IDS)[number];

interface PatchMapQuerySelectionResourceProbeInput {
  readonly caseId: PatchMapQuerySelectionCaseId;
  readonly engine: PatchMap;
}

export interface PatchMapQuerySelectionProductAdapter {
  resourceProbe(
    input: Readonly<PatchMapQuerySelectionResourceProbeInput>,
  ): Readonly<Record<string, unknown>>;
}

export interface PatchMapQuerySelectionRuntime {
  readonly product: PatchMapQuerySelectionProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind transport for the shared query/selection substrate.
 *
 * It owns no Engine, renderer, listener, timer, or observer. The executor owns
 * every Engine and the action handler releases its temporary selection
 * subscription before returning.
 */
export function createPatchMapQuerySelectionRuntime(
  caseId: PatchMapQuerySelectionCaseId,
): PatchMapQuerySelectionRuntime {
  if (!PATCH_MAP_QUERY_SELECTION_CASE_IDS.includes(caseId)) {
    throw new TypeError(`unsupported query/selection case ${String(caseId)}`);
  }
  let probeCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapQuerySelectionProductAdapter = Object.freeze({
    resourceProbe(input: Readonly<PatchMapQuerySelectionResourceProbeInput>) {
      if (released) throw new Error('query/selection runtime is released');
      if (input.caseId !== caseId) {
        throw new Error('query/selection runtime case identity mismatch');
      }
      probeCount += 1;
      return deepFreeze({
        revision: PATCH_MAP_QUERY_SELECTION_RUNTIME_REVISION,
        caseId,
        probeCount,
        snapshot: structuredClone(input.engine.snapshot()),
        semantic: structuredClone(input.engine.semanticProbe()),
        geometry: structuredClone(input.engine.geometryProbe()),
        interactionOwnership: structuredClone(input.engine.interactionOwnershipProbe()),
        runtimeCounts: runtimeCounts(),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanup !== null) return cleanup;
      released = true;
      cleanup = deepFreeze({
        revision: PATCH_MAP_QUERY_SELECTION_CLEANUP_REVISION,
        caseId,
        probeCount,
        runtimeCounts: runtimeCounts(),
      });
      return cleanup;
    },
  });
}

function runtimeCounts(): Readonly<Record<string, 0>> {
  return Object.freeze({
    engines: 0,
    renderers: 0,
    listeners: 0,
    observers: 0,
    timers: 0,
    pendingWork: 0,
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
