import type { CoreV2Engine } from '../../../src/core-v2';

export const CORE_V2_QUERY_SELECTION_RUNTIME_REVISION =
  'core-v2-query-selection-runtime/1' as const;
export const CORE_V2_QUERY_SELECTION_CLEANUP_REVISION =
  'core-v2-query-selection-cleanup/1' as const;

export const CORE_V2_QUERY_SELECTION_CASE_IDS = Object.freeze([
  'QRY-001',
  'QRY-002',
  'SEL-001',
  'SEL-002',
  'SEL-003',
  'SEL-004',
] as const);

export type CoreV2QuerySelectionCaseId =
  (typeof CORE_V2_QUERY_SELECTION_CASE_IDS)[number];

interface CoreV2QuerySelectionResourceProbeInput {
  readonly caseId: CoreV2QuerySelectionCaseId;
  readonly engine: CoreV2Engine;
}

export interface CoreV2QuerySelectionProductAdapter {
  resourceProbe(
    input: Readonly<CoreV2QuerySelectionResourceProbeInput>,
  ): Readonly<Record<string, unknown>>;
}

export interface CoreV2QuerySelectionRuntime {
  readonly product: CoreV2QuerySelectionProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind transport for the shared query/selection substrate.
 *
 * It owns no Engine, renderer, listener, timer, or observer. The executor owns
 * every Engine and the action handler releases its temporary selection
 * subscription before returning.
 */
export function createCoreV2QuerySelectionRuntime(
  caseId: CoreV2QuerySelectionCaseId,
): CoreV2QuerySelectionRuntime {
  if (!CORE_V2_QUERY_SELECTION_CASE_IDS.includes(caseId)) {
    throw new TypeError(`unsupported query/selection case ${String(caseId)}`);
  }
  let probeCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2QuerySelectionProductAdapter = Object.freeze({
    resourceProbe(input: Readonly<CoreV2QuerySelectionResourceProbeInput>) {
      if (released) throw new Error('query/selection runtime is released');
      if (input.caseId !== caseId) {
        throw new Error('query/selection runtime case identity mismatch');
      }
      probeCount += 1;
      return deepFreeze({
        revision: CORE_V2_QUERY_SELECTION_RUNTIME_REVISION,
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
        revision: CORE_V2_QUERY_SELECTION_CLEANUP_REVISION,
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
