import type {
  PatchMap,
  PatchMapPointerGestureProbe,
} from '../../../src/patch-map';

export const PATCH_MAP_POINTER_SELECTION_RUNTIME_REVISION =
  'patch-map-pointer-selection-runtime/1' as const;
export const PATCH_MAP_POINTER_SELECTION_CLEANUP_REVISION =
  'patch-map-pointer-selection-cleanup/1' as const;

export const PATCH_MAP_POINTER_SELECTION_CASE_IDS = Object.freeze([
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
  'SEL-007',
  'SEL-008',
  'SEL-009',
  'TRN-001',
  'TRN-002',
  'TRN-003',
  'TRN-004',
  'TRN-005',
  'TRN-006',
  'TRN-007',
  'TRN-008',
  'TRN-009',
  'TRN-010',
  'CSM-011',
  'CSM-012',
  'CSM-015',
  'CSM-016',
  'CSM-020',
  'CSM-021',
] as const);

export type PatchMapPointerSelectionCaseId =
  (typeof PATCH_MAP_POINTER_SELECTION_CASE_IDS)[number];

interface PatchMapPointerSelectionResourceProbeInput {
  readonly caseId: PatchMapPointerSelectionCaseId;
  readonly engine: PatchMap;
}

interface PatchMapPointerSelectionReleasedProbeInput {
  readonly caseId: PatchMapPointerSelectionCaseId;
  readonly pointerGesture: PatchMapPointerGestureProbe;
  readonly hostInteraction?: Readonly<Record<string, unknown>>;
}

export interface PatchMapPointerSelectionProductAdapter {
  resourceProbe(
    input: Readonly<PatchMapPointerSelectionResourceProbeInput>,
  ): Readonly<Record<string, unknown>>;
  releasedResourceProbe(
    input: Readonly<PatchMapPointerSelectionReleasedProbeInput>,
  ): Readonly<Record<string, unknown>>;
}

export interface PatchMapPointerSelectionRuntime {
  readonly product: PatchMapPointerSelectionProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind transport for one root pointer/selection authority. It owns
 * no renderer, pointer listener, timer, observer, or per-entity callback.
 */
export function createPatchMapPointerSelectionRuntime(
  caseId: PatchMapPointerSelectionCaseId,
): PatchMapPointerSelectionRuntime {
  if (!PATCH_MAP_POINTER_SELECTION_CASE_IDS.includes(caseId)) {
    throw new TypeError(`unsupported pointer/selection case ${String(caseId)}`);
  }
  let probeCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapPointerSelectionProductAdapter = Object.freeze({
    resourceProbe(input: Readonly<PatchMapPointerSelectionResourceProbeInput>) {
      assertLiveCase(input.caseId, caseId, released);
      probeCount += 1;
      return deepFreeze({
        revision: PATCH_MAP_POINTER_SELECTION_RUNTIME_REVISION,
        caseId,
        probeCount,
        snapshot: structuredClone(input.engine.snapshot()),
        semantic: structuredClone(input.engine.semanticProbe()),
        geometry: structuredClone(input.engine.geometryProbe()),
        pointerGesture: structuredClone(input.engine.pointerGestureProbe()),
        transformerGesture: structuredClone(input.engine.transformerGestureProbe()),
        hostInteraction: structuredClone(input.engine.hostInteractionProbe()),
        interactionOwnership: structuredClone(input.engine.interactionOwnershipProbe()),
        runtimeCounts: runtimeCounts(),
      });
    },
    releasedResourceProbe(input: Readonly<PatchMapPointerSelectionReleasedProbeInput>) {
      if (input.caseId !== caseId) {
        throw new Error('pointer/selection released probe case identity mismatch');
      }
      return deepFreeze({
        revision: PATCH_MAP_POINTER_SELECTION_RUNTIME_REVISION,
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
        revision: PATCH_MAP_POINTER_SELECTION_CLEANUP_REVISION,
        caseId,
        probeCount,
        runtimeCounts: runtimeCounts(),
      });
      return cleanup;
    },
  });
}

function assertLiveCase(
  actual: PatchMapPointerSelectionCaseId,
  expected: PatchMapPointerSelectionCaseId,
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
