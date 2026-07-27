import {
  type CoreV2Engine,
} from '../../../src/core-v2';
import {
  buildCoreV2SeededScenarioScene,
  CORE_V2_SEEDED_SCENE_REVISION,
} from './seeded-scene';

export const CORE_V2_DETERMINISM_LIFECYCLE_RUNTIME_REVISION =
  'core-v2-determinism-lifecycle-runtime/1' as const;
export const CORE_V2_DETERMINISM_LIFECYCLE_CLEANUP_REVISION =
  'core-v2-determinism-lifecycle-cleanup/1' as const;

export const CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS = Object.freeze([
  'DET-001',
  'DET-002',
  'DET-003',
  'ANI-003',
  'LIF-006',
] as const);

export type CoreV2DeterminismLifecycleCaseId =
  (typeof CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS)[number];

interface SeededSceneInput {
  readonly caseId: 'DET-003';
  readonly size: number;
  readonly seed: number;
  readonly actionIndex: number;
}

interface ObserveInput {
  readonly caseId: CoreV2DeterminismLifecycleCaseId;
  readonly engine: CoreV2Engine;
}

export interface CoreV2DeterminismLifecycleProductAdapter {
  createSeededScene(
    input: SeededSceneInput,
  ): readonly Readonly<Record<string, unknown>>[];
  observe(input: ObserveInput): Readonly<Record<string, unknown>>;
}

export interface CoreV2DeterminismLifecycleRuntime {
  readonly product: CoreV2DeterminismLifecycleProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind product transport for deterministic replay, animation
 * lifecycle, and page suspension. It reads only public Engine probes and owns
 * no Engine, Pixi object, listener, timer, Promise, or expected observation.
 */
export function createCoreV2DeterminismLifecycleRuntime(
  caseId: CoreV2DeterminismLifecycleCaseId,
): CoreV2DeterminismLifecycleRuntime {
  requireCaseId(caseId);
  let generatedSceneCount = 0;
  let generatedEntityCount = 0;
  let observationCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2DeterminismLifecycleProductAdapter = Object.freeze({
    createSeededScene(inputValue: SeededSceneInput) {
      assertActive(released, 'seeded scene generation');
      const input = seededSceneInput(inputValue);
      invariant(caseId === input.caseId, 'seeded scene case identity');
      const dataset = buildCoreV2SeededScenarioScene(
        input.size,
        input.seed,
        input.actionIndex,
      );
      generatedSceneCount += 1;
      generatedEntityCount += dataset.length;
      return dataset;
    },

    observe(inputValue: ObserveInput): Readonly<Record<string, unknown>> {
      assertActive(released, 'determinism lifecycle observation');
      const input = observeInput(inputValue);
      invariant(caseId === input.caseId, 'observation case identity');
      const snapshot = input.engine.snapshot();
      const active =
        snapshot.lifecycle !== 'destroyed' &&
        snapshot.lifecycle !== 'destroying' &&
        snapshot.lifecycle !== 'new';
      const exported = active ? input.engine.exportDataset() : Object.freeze([]);
      observationCount += 1;
      return deepFreeze({
        revision: CORE_V2_DETERMINISM_LIFECYCLE_RUNTIME_REVISION,
        caseId,
        snapshot: detach(snapshot),
        semantic: detach(input.engine.semanticProbe()),
        geometry: active ? detach(input.engine.geometryProbe()) : null,
        history: active ? detach(input.engine.historyInspection()) : null,
        companion: active ? detach(input.engine.historyCompanionState()) : null,
        pageLifecycle: detach(input.engine.pageLifecycleProbe()),
        pointer: detach(input.engine.pointerGestureProbe()),
        viewportPolicy: detach(input.engine.viewportPolicyProbe()),
        bar: active
          ? detach(input.engine.componentVisualProbe({
              ownerId: 'item-a',
              componentId: 'bar',
            }))
          : null,
        barPresentation: active
          ? detach(input.engine.barPresentationProbe({
              ownerId: 'item-a',
              componentId: 'bar',
            }))
          : null,
        labelText: active
          ? detach(input.engine.textProbe({
              kind: 'component',
              ownerId: 'item-a',
              id: 'label',
            }))
          : null,
        dataset: detach(exported),
        datasetDeepFrozen: deepFrozen(exported),
        runtime: {
          ownership: zeroOwnership(),
          stats: runtimeStats(
            generatedSceneCount,
            generatedEntityCount,
            observationCount,
          ),
        },
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanup !== null) return cleanup;
      released = true;
      cleanup = deepFreeze({
        revision: CORE_V2_DETERMINISM_LIFECYCLE_CLEANUP_REVISION,
        caseId,
        seededSceneRevision: CORE_V2_SEEDED_SCENE_REVISION,
        runtimeCounts: zeroOwnership(),
        stats: runtimeStats(
          generatedSceneCount,
          generatedEntityCount,
          observationCount,
        ),
      });
      return cleanup;
    },
  });
}

function seededSceneInput(value: unknown): SeededSceneInput {
  const input = requireRecord(value, 'seeded scene request');
  assertExactKeys(
    input,
    ['actionIndex', 'caseId', 'seed', 'size'],
    'seeded scene request',
  );
  invariant(input.caseId === 'DET-003', 'seeded scene case ID');
  return Object.freeze({
    caseId: 'DET-003',
    size: positiveInteger(input.size, 'seeded scene size'),
    seed: uint32(input.seed, 'seeded scene seed'),
    actionIndex: nonNegativeInteger(input.actionIndex, 'seeded action index'),
  });
}

function observeInput(value: unknown): ObserveInput {
  const input = requireRecord(value, 'determinism lifecycle observation');
  assertExactKeys(input, ['caseId', 'engine'], 'determinism lifecycle observation');
  const engine = input.engine;
  invariant(engine !== null && typeof engine === 'object', 'observation engine');
  for (const method of [
    'snapshot',
    'semanticProbe',
    'pageLifecycleProbe',
    'pointerGestureProbe',
    'viewportPolicyProbe',
  ]) {
    invariant(
      typeof (engine as Record<string, unknown>)[method] === 'function',
      `observation engine ${method}()`,
    );
  }
  return Object.freeze({
    caseId: requireCaseId(input.caseId),
    engine: engine as CoreV2Engine,
  });
}

function runtimeStats(
  generatedSceneCount: number,
  generatedEntityCount: number,
  observationCount: number,
): Readonly<Record<string, number>> {
  return Object.freeze({
    generatedSceneCount,
    generatedEntityCount,
    observationCount,
  });
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return Object.freeze({
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    pendingPromiseCount: 0,
    pendingTimerCount: 0,
    pendingWorkCount: 0,
  });
}

function requireCaseId(value: unknown): CoreV2DeterminismLifecycleCaseId {
  invariant(
    typeof value === 'string' &&
      CORE_V2_DETERMINISM_LIFECYCLE_CASE_IDS.includes(
        value as CoreV2DeterminismLifecycleCaseId,
      ),
    'unsupported determinism lifecycle case',
  );
  return value as CoreV2DeterminismLifecycleCaseId;
}

function positiveInteger(value: unknown, label: string): number {
  invariant(Number.isSafeInteger(value) && Number(value) > 0, `${label} positive`);
  invariant(Number(value) <= 5_000, `${label} maximum`);
  return Number(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  invariant(Number.isSafeInteger(value) && Number(value) >= 0, `${label} non-negative`);
  return Number(value);
}

function uint32(value: unknown, label: string): number {
  const number = nonNegativeInteger(value, label);
  invariant(number <= 0xffff_ffff, `${label} uint32`);
  return number;
}

function deepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  if (Array.isArray(value)) return value.every((entry) => deepFrozen(entry, seen));
  return Object.values(value as Record<string, unknown>)
    .every((entry) => deepFrozen(entry, seen));
}

function detach<T>(value: T): T {
  return structuredClone(value);
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  invariant(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} object`,
  );
  return value as Readonly<Record<string, unknown>>;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  invariant(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry, seen);
  } else {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      deepFreeze(entry, seen);
    }
  }
  return Object.freeze(value);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Core v2 determinism lifecycle runtime invalid: ${message}`);
  }
}
