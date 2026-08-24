import {
  createPatchMapColorResolver,
  type PatchMapAuthoringAction,
  type PatchMap,
  type PatchMapEngineAuthoringResult,
} from '../../../src/patch-map';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  detachPatchMapLabValue as detach,
} from './runtime-values';

export const PATCH_MAP_AUTHORING_RUNTIME_REVISION =
  'core-v2-authoring-runtime/1' as const;
export const PATCH_MAP_AUTHORING_CLEANUP_REVISION =
  'core-v2-authoring-cleanup/1' as const;

export const PATCH_MAP_AUTHORING_CASE_IDS = Object.freeze([
  'CSM-019',
  'CSM-028',
  'CSM-029',
  'CSM-030',
  'CSM-031',
] as const);

export type PatchMapAuthoringCaseId =
  (typeof PATCH_MAP_AUTHORING_CASE_IDS)[number];

type PatchMapAuthoringAdapterActionInput = Readonly<{
  readonly caseId: PatchMapAuthoringCaseId;
  readonly engine: PatchMap;
  readonly action: PatchMapAuthoringAction;
}>;

type PatchMapAuthoringAdapterObservationInput = Readonly<{
  readonly caseId: PatchMapAuthoringCaseId;
  readonly engine: PatchMap;
}>;

type PatchMapAuthoringAdapterColorInput = Readonly<{
  readonly value: unknown;
  readonly path: string;
}>;

export interface PatchMapAuthoringProductAdapter {
  author(input: PatchMapAuthoringAdapterActionInput): PatchMapEngineAuthoringResult;
  observe(input: PatchMapAuthoringAdapterObservationInput): Readonly<Record<string, unknown>>;
  resolveColor(input: PatchMapAuthoringAdapterColorInput): string;
}

export interface PatchMapAuthoringRuntime {
  readonly product: PatchMapAuthoringProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind product transport shared by five authoring journeys.
 *
 * It calls only public PatchMap authoring/probe boundaries and owns no Engine,
 * Pixi object, asset lease, listener, timer, dataset alias, or expected value.
 */
export function createPatchMapAuthoringRuntime(
  caseId: PatchMapAuthoringCaseId,
): PatchMapAuthoringRuntime {
  requireCaseId(caseId);
  const colorResolver = createPatchMapColorResolver();
  let authoringCallCount = 0;
  let observationCount = 0;
  let colorResolutionCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapAuthoringProductAdapter = Object.freeze({
    author(input: PatchMapAuthoringAdapterActionInput) {
      assertActive(released, 'authoring action');
      const request = authoringRequest(input);
      invariant(request.caseId === caseId, 'authoring case identity');
      authoringCallCount += 1;
      return detach(request.engine.author(detach(request.action)));
    },

    observe(input: PatchMapAuthoringAdapterObservationInput) {
      assertActive(released, 'product observation');
      const request = observationRequest(input);
      invariant(request.caseId === caseId, 'observation case identity');
      observationCount += 1;
      return deepFreeze({
        revision: PATCH_MAP_AUTHORING_RUNTIME_REVISION,
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

    resolveColor(input: PatchMapAuthoringAdapterColorInput) {
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
        revision: PATCH_MAP_AUTHORING_CLEANUP_REVISION,
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
  readonly caseId: PatchMapAuthoringCaseId;
  readonly engine: PatchMap;
  readonly action: PatchMapAuthoringAction;
}> {
  const request = requireRecord(value, 'authoring request');
  assertExactKeys(request, ['action', 'caseId', 'engine'], 'authoring request');
  const caseId = requireCaseId(request.caseId);
  const engine = requireEngine(request.engine);
  const action = requireRecord(request.action, 'authoring action') as PatchMapAuthoringAction;
  return Object.freeze({ caseId, engine, action });
}

function observationRequest(value: unknown): Readonly<{
  readonly caseId: PatchMapAuthoringCaseId;
  readonly engine: PatchMap;
}> {
  const request = requireRecord(value, 'observation request');
  assertExactKeys(request, ['caseId', 'engine'], 'observation request');
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
  });
}

function requireEngine(value: unknown): PatchMap {
  invariant(value !== null && typeof value === 'object', 'PatchMap Engine');
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
      `PatchMap Engine ${method}()`,
    );
  }
  return value as PatchMap;
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

function requireCaseId(value: unknown): PatchMapAuthoringCaseId {
  invariant(
    typeof value === 'string'
      && PATCH_MAP_AUTHORING_CASE_IDS.includes(value as PatchMapAuthoringCaseId),
    'unsupported authoring case identity',
  );
  return value as PatchMapAuthoringCaseId;
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

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap authoring runtime: ${message}`);
}
