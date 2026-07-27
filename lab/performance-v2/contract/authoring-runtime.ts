import {
  createCoreV2ColorResolver,
  type CoreV2AuthoringAction,
  type CoreV2Engine,
  type CoreV2EngineAuthoringResult,
} from '../../../src/core-v2';

export const CORE_V2_AUTHORING_RUNTIME_REVISION =
  'core-v2-authoring-runtime/1' as const;
export const CORE_V2_AUTHORING_CLEANUP_REVISION =
  'core-v2-authoring-cleanup/1' as const;

export const CORE_V2_AUTHORING_CASE_IDS = Object.freeze([
  'CSM-019',
  'CSM-028',
  'CSM-029',
  'CSM-030',
  'CSM-031',
] as const);

export type CoreV2AuthoringCaseId =
  (typeof CORE_V2_AUTHORING_CASE_IDS)[number];

type CoreV2AuthoringAdapterActionInput = Readonly<{
  readonly caseId: CoreV2AuthoringCaseId;
  readonly engine: CoreV2Engine;
  readonly action: CoreV2AuthoringAction;
}>;

type CoreV2AuthoringAdapterObservationInput = Readonly<{
  readonly caseId: CoreV2AuthoringCaseId;
  readonly engine: CoreV2Engine;
}>;

type CoreV2AuthoringAdapterColorInput = Readonly<{
  readonly value: unknown;
  readonly path: string;
}>;

export interface CoreV2AuthoringProductAdapter {
  author(input: CoreV2AuthoringAdapterActionInput): CoreV2EngineAuthoringResult;
  observe(input: CoreV2AuthoringAdapterObservationInput): Readonly<Record<string, unknown>>;
  resolveColor(input: CoreV2AuthoringAdapterColorInput): string;
}

export interface CoreV2AuthoringRuntime {
  readonly product: CoreV2AuthoringProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind product transport shared by five authoring journeys.
 *
 * It calls only public Core v2 authoring/probe boundaries and owns no Engine,
 * Pixi object, asset lease, listener, timer, dataset alias, or expected value.
 */
export function createCoreV2AuthoringRuntime(
  caseId: CoreV2AuthoringCaseId,
): CoreV2AuthoringRuntime {
  requireCaseId(caseId);
  const colorResolver = createCoreV2ColorResolver();
  let authoringCallCount = 0;
  let observationCount = 0;
  let colorResolutionCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2AuthoringProductAdapter = Object.freeze({
    author(input: CoreV2AuthoringAdapterActionInput) {
      assertActive(released, 'authoring action');
      const request = authoringRequest(input);
      invariant(request.caseId === caseId, 'authoring case identity');
      authoringCallCount += 1;
      return detach(request.engine.author(detach(request.action)));
    },

    observe(input: CoreV2AuthoringAdapterObservationInput) {
      assertActive(released, 'product observation');
      const request = observationRequest(input);
      invariant(request.caseId === caseId, 'observation case identity');
      observationCount += 1;
      return deepFreeze({
        revision: CORE_V2_AUTHORING_RUNTIME_REVISION,
        caseId,
        snapshot: detach(request.engine.snapshot()),
        semantic: detach(request.engine.semanticProbe()),
        geometry: detach(request.engine.geometryProbe()),
        relations: detach(request.engine.relationProbe()),
        history: detach(request.engine.historyInspection()),
        interactionMode: detach(request.engine.interactionModeProbe()),
        dataset: detach(request.engine.exportDataset()),
        runtime: {
          ownership: zeroOwnership(),
          stats: runtimeStats(
            authoringCallCount,
            observationCount,
            colorResolutionCount,
          ),
        },
      });
    },

    resolveColor(input: CoreV2AuthoringAdapterColorInput) {
      assertActive(released, 'color resolution');
      invariant(
        input !== null && typeof input === 'object' && !Array.isArray(input),
        'color resolution request',
      );
      invariant(typeof input.path === 'string' && input.path.length > 0, 'color path');
      colorResolutionCount += 1;
      return colorResolver.resolve(input.value, input.path).rgba;
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanup !== null) return cleanup;
      released = true;
      cleanup = deepFreeze({
        revision: CORE_V2_AUTHORING_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
        stats: runtimeStats(
          authoringCallCount,
          observationCount,
          colorResolutionCount,
        ),
      });
      return cleanup;
    },
  });
}

function authoringRequest(value: unknown): Readonly<{
  readonly caseId: CoreV2AuthoringCaseId;
  readonly engine: CoreV2Engine;
  readonly action: CoreV2AuthoringAction;
}> {
  const request = requireRecord(value, 'authoring request');
  assertExactKeys(request, ['action', 'caseId', 'engine'], 'authoring request');
  const caseId = requireCaseId(request.caseId);
  const engine = requireEngine(request.engine);
  const action = requireRecord(request.action, 'authoring action') as CoreV2AuthoringAction;
  return Object.freeze({ caseId, engine, action });
}

function observationRequest(value: unknown): Readonly<{
  readonly caseId: CoreV2AuthoringCaseId;
  readonly engine: CoreV2Engine;
}> {
  const request = requireRecord(value, 'observation request');
  assertExactKeys(request, ['caseId', 'engine'], 'observation request');
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
  });
}

function requireEngine(value: unknown): CoreV2Engine {
  invariant(value !== null && typeof value === 'object', 'Core v2 Engine');
  for (const method of [
    'author',
    'snapshot',
    'semanticProbe',
    'geometryProbe',
    'relationProbe',
    'historyInspection',
    'interactionModeProbe',
    'exportDataset',
  ]) {
    invariant(
      typeof (value as Readonly<Record<string, unknown>>)[method] === 'function',
      `Core v2 Engine ${method}()`,
    );
  }
  return value as CoreV2Engine;
}

function runtimeStats(
  authoringCallCount: number,
  observationCount: number,
  colorResolutionCount: number,
): Readonly<Record<string, number>> {
  return Object.freeze({
    authoringCallCount,
    observationCount,
    colorResolutionCount,
  });
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return Object.freeze({
    engines: 0,
    renderers: 0,
    listeners: 0,
    observers: 0,
    timers: 0,
    pendingWork: 0,
    retainedDatasets: 0,
    assetLeases: 0,
  });
}

function requireCaseId(value: unknown): CoreV2AuthoringCaseId {
  invariant(
    typeof value === 'string'
      && CORE_V2_AUTHORING_CASE_IDS.includes(value as CoreV2AuthoringCaseId),
    'unsupported authoring case identity',
  );
  return value as CoreV2AuthoringCaseId;
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), label);
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
    actual.length === expected.length
      && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function detach<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 authoring runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
