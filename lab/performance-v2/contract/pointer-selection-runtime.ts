import type {
  CoreV2Engine,
  CoreV2PointerGestureProbe,
} from '../../../src/core-v2';

export const CORE_V2_POINTER_SELECTION_RUNTIME_REVISION =
  'core-v2-pointer-selection-runtime/1' as const;
export const CORE_V2_POINTER_SELECTION_CLEANUP_REVISION =
  'core-v2-pointer-selection-cleanup/1' as const;

export const CORE_V2_POINTER_SELECTION_CASE_IDS = Object.freeze([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-005',
  'EVT-006',
  'EVT-007',
  'EVT-008',
  'EVT-009',
  'SEL-005',
  'SEL-006',
  'SEL-008',
] as const);

export type CoreV2PointerSelectionCaseId =
  (typeof CORE_V2_POINTER_SELECTION_CASE_IDS)[number];

interface CoreV2PointerSelectionResourceProbeInput {
  readonly caseId: CoreV2PointerSelectionCaseId;
  readonly engine: CoreV2Engine;
}

interface CoreV2PointerSelectionReleasedProbeInput {
  readonly caseId: CoreV2PointerSelectionCaseId;
  readonly pointerGesture: CoreV2PointerGestureProbe;
  readonly hostInteraction?: Readonly<Record<string, unknown>>;
}

export interface CoreV2PointerSelectionProductAdapter {
  resourceProbe(
    input: Readonly<CoreV2PointerSelectionResourceProbeInput>,
  ): Readonly<Record<string, unknown>>;
  releasedResourceProbe(
    input: Readonly<CoreV2PointerSelectionReleasedProbeInput>,
  ): Readonly<Record<string, unknown>>;
}

export interface CoreV2PointerSelectionRuntime {
  readonly product: CoreV2PointerSelectionProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind transport for one root pointer/selection authority. It owns
 * no renderer, pointer listener, timer, observer, or per-entity callback.
 */
export function createCoreV2PointerSelectionRuntime(
  caseId: CoreV2PointerSelectionCaseId,
): CoreV2PointerSelectionRuntime {
  if (!CORE_V2_POINTER_SELECTION_CASE_IDS.includes(caseId)) {
    throw new TypeError(`unsupported pointer/selection case ${String(caseId)}`);
  }
  let probeCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2PointerSelectionProductAdapter = Object.freeze({
    resourceProbe(input: Readonly<CoreV2PointerSelectionResourceProbeInput>) {
      assertLiveCase(input.caseId, caseId, released);
      probeCount += 1;
      return deepFreeze({
        revision: CORE_V2_POINTER_SELECTION_RUNTIME_REVISION,
        caseId,
        probeCount,
        snapshot: structuredClone(input.engine.snapshot()),
        semantic: structuredClone(input.engine.semanticProbe()),
        geometry: structuredClone(input.engine.geometryProbe()),
        pointerGesture: structuredClone(input.engine.pointerGestureProbe()),
        hostInteraction: structuredClone(input.engine.hostInteractionProbe()),
        interactionOwnership: structuredClone(input.engine.interactionOwnershipProbe()),
        runtimeCounts: runtimeCounts(),
      });
    },
    releasedResourceProbe(input: Readonly<CoreV2PointerSelectionReleasedProbeInput>) {
      if (input.caseId !== caseId) {
        throw new Error('pointer/selection released probe case identity mismatch');
      }
      return deepFreeze({
        revision: CORE_V2_POINTER_SELECTION_RUNTIME_REVISION,
        caseId,
        pointerGesture: structuredClone(input.pointerGesture),
        hostInteraction: structuredClone(input.hostInteraction ?? null),
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
        revision: CORE_V2_POINTER_SELECTION_CLEANUP_REVISION,
        caseId,
        probeCount,
        runtimeCounts: runtimeCounts(),
      });
      return cleanup;
    },
  });
}

function assertLiveCase(
  actual: CoreV2PointerSelectionCaseId,
  expected: CoreV2PointerSelectionCaseId,
  released: boolean,
): void {
  if (released) throw new Error('pointer/selection runtime is released');
  if (actual !== expected) {
    throw new Error('pointer/selection runtime case identity mismatch');
  }
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
