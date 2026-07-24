import type { CoreV2Engine } from '../../../src/core-v2';

export const CORE_V2_HISTORY_RUNTIME_REVISION =
  'core-v2-history-runtime/1' as const;
export const CORE_V2_HISTORY_CLEANUP_REVISION =
  'core-v2-history-cleanup/1' as const;

export const CORE_V2_HISTORY_CASE_IDS = Object.freeze([
  'HIS-001',
  'HIS-002',
  'HIS-003',
  'HIS-004',
  'HIS-005',
  'HIS-006',
] as const);

export type CoreV2HistoryCaseId = (typeof CORE_V2_HISTORY_CASE_IDS)[number];

export interface CoreV2HistoryProductAdapter {
  resourceProbe(input: Readonly<{
    readonly caseId: CoreV2HistoryCaseId;
    readonly engine: CoreV2Engine;
  }>): Readonly<Record<string, unknown>>;
}

export interface CoreV2HistoryRuntime {
  readonly product: CoreV2HistoryProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind transport for one shared history tranche.
 *
 * The executor owns Engine and Pixi lifecycle. This runtime retains only scalar
 * probe accounting and releases it once the executor destroys the case.
 */
export function createCoreV2HistoryRuntime(
  caseId: CoreV2HistoryCaseId,
): CoreV2HistoryRuntime {
  if (!CORE_V2_HISTORY_CASE_IDS.includes(caseId)) {
    throw new TypeError(`unsupported history case ${String(caseId)}`);
  }
  let probeCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2HistoryProductAdapter = Object.freeze({
    resourceProbe({
      caseId: observedCaseId,
      engine,
    }: Readonly<{
      readonly caseId: CoreV2HistoryCaseId;
      readonly engine: CoreV2Engine;
    }>) {
      if (released) throw new Error('history runtime is released');
      if (observedCaseId !== caseId) {
        throw new Error('history runtime case identity mismatch');
      }
      probeCount += 1;
      const snapshot = engine.snapshot();
      const alive = snapshot.lifecycle !== 'destroyed' &&
        snapshot.lifecycle !== 'destroying';
      return deepFreeze({
        revision: CORE_V2_HISTORY_RUNTIME_REVISION,
        caseId,
        probeCount,
        snapshot: structuredClone(snapshot),
        semantic: structuredClone(engine.semanticProbe()),
        history: alive ? structuredClone(engine.historyInspection()) : null,
        companion: alive ? structuredClone(engine.historyCompanionState()) : null,
        interactionMode: alive ? structuredClone(engine.interactionModeProbe()) : null,
        transformerGesture: structuredClone(engine.transformerGestureProbe()),
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
        revision: CORE_V2_HISTORY_CLEANUP_REVISION,
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
