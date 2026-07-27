import {
  type CoreV2EditorWorkflowAction,
  type CoreV2EditorMutationKind,
  type CoreV2Engine,
  type CoreV2EngineEditorMutationMatrixResult,
  type CoreV2EngineEditorWorkflowResult,
  type CoreV2MutationJsonValue,
} from '../../../src/core-v2';

export const CORE_V2_EDITOR_WORKFLOW_RUNTIME_REVISION =
  'core-v2-editor-workflow-runtime/1' as const;
export const CORE_V2_EDITOR_WORKFLOW_CLEANUP_REVISION =
  'core-v2-editor-workflow-cleanup/1' as const;

export const CORE_V2_EDITOR_WORKFLOW_CASE_IDS = Object.freeze([
  'CSM-025',
  'CSM-026',
  'CSM-027',
  'CSM-033',
  'CSM-034',
] as const);

export type CoreV2EditorWorkflowCaseId =
  (typeof CORE_V2_EDITOR_WORKFLOW_CASE_IDS)[number];

interface WorkflowInput {
  readonly caseId: CoreV2EditorWorkflowCaseId;
  readonly engine: CoreV2Engine;
  readonly action: CoreV2EditorWorkflowAction;
}

interface LoadDatasetInput {
  readonly caseId: CoreV2EditorWorkflowCaseId;
  readonly engine: CoreV2Engine;
  readonly datasetRef: string;
  readonly dataset: unknown;
}

interface MatrixInput {
  readonly caseId: CoreV2EditorWorkflowCaseId;
  readonly engine: CoreV2Engine;
  readonly mutationKinds: readonly CoreV2EditorMutationKind[];
  readonly oneActionEach: true;
  readonly companion: CoreV2MutationJsonValue;
}

interface ObservationInput {
  readonly caseId: CoreV2EditorWorkflowCaseId;
  readonly engine: CoreV2Engine;
}

interface HistoryInput {
  readonly caseId: CoreV2EditorWorkflowCaseId;
  readonly engine: CoreV2Engine;
  readonly direction: 'undo' | 'redo';
}

interface PublishInput {
  readonly caseId: CoreV2EditorWorkflowCaseId;
  readonly engine: CoreV2Engine;
  readonly timeMs: number;
}

export interface CoreV2EditorWorkflowProductAdapter {
  loadDataset(input: LoadDatasetInput): Readonly<Record<string, unknown>>;
  workflow(input: WorkflowInput): CoreV2EngineEditorWorkflowResult;
  runMutationMatrix(input: MatrixInput): CoreV2EngineEditorMutationMatrixResult;
  history(input: HistoryInput): Readonly<Record<string, unknown>>;
  publish(input: PublishInput): void;
  observe(input: ObservationInput): Readonly<Record<string, unknown>>;
}

export interface CoreV2EditorWorkflowRuntime {
  readonly product: CoreV2EditorWorkflowProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind transport for five editor journeys.
 *
 * The runtime calls public Engine actions/probes only. It owns no semantic
 * dataset, renderer, Pixi object, listener, timer, history entry, or expected
 * observation.
 */
export function createCoreV2EditorWorkflowRuntime(
  caseId: CoreV2EditorWorkflowCaseId,
): CoreV2EditorWorkflowRuntime {
  requireCaseId(caseId);
  let workflowCallCount = 0;
  let matrixCallCount = 0;
  let loadCallCount = 0;
  let historyCallCount = 0;
  let publishCallCount = 0;
  let observationCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2EditorWorkflowProductAdapter = Object.freeze({
    loadDataset(input: LoadDatasetInput): Readonly<Record<string, unknown>> {
      assertActive(released, 'editor dataset load');
      const request = loadDatasetRequest(input);
      invariant(request.caseId === caseId, 'load case identity');
      loadCallCount += 1;
      return detach(request.engine.loadDataset(detach(request.dataset), {
        datasetRef: request.datasetRef,
      })) as unknown as Readonly<Record<string, unknown>>;
    },

    workflow(input: WorkflowInput): CoreV2EngineEditorWorkflowResult {
      assertActive(released, 'editor workflow action');
      const request = workflowRequest(input);
      invariant(request.caseId === caseId, 'workflow case identity');
      workflowCallCount += 1;
      return detach(request.engine.editorWorkflow(detach(request.action)));
    },

    runMutationMatrix(input: MatrixInput): CoreV2EngineEditorMutationMatrixResult {
      assertActive(released, 'editor mutation matrix');
      const request = matrixRequest(input);
      invariant(request.caseId === caseId, 'matrix case identity');
      matrixCallCount += 1;
      return detach(request.engine.runEditorMutationMatrix({
        mutationKinds: request.mutationKinds,
        oneActionEach: true,
        companion: detach(request.companion),
      }));
    },

    history(input: HistoryInput): Readonly<Record<string, unknown>> {
      assertActive(released, 'editor history action');
      const request = historyRequest(input);
      invariant(request.caseId === caseId, 'history case identity');
      historyCallCount += 1;
      return detach(
        request.direction === 'undo'
          ? request.engine.undo()
          : request.engine.redo(),
      ) as Readonly<Record<string, unknown>>;
    },

    publish(input: PublishInput): void {
      assertActive(released, 'editor frame publication');
      const request = publishRequest(input);
      invariant(request.caseId === caseId, 'publish case identity');
      publishCallCount += 1;
      request.engine.publishFrame(request.timeMs);
    },

    observe(input: ObservationInput): Readonly<Record<string, unknown>> {
      assertActive(released, 'editor product observation');
      const request = observationRequest(input);
      invariant(request.caseId === caseId, 'observation case identity');
      observationCount += 1;
      return deepFreeze({
        revision: CORE_V2_EDITOR_WORKFLOW_RUNTIME_REVISION,
        caseId,
        snapshot: detach(request.engine.snapshot()),
        semantic: detach(request.engine.semanticProbe()),
        geometry: detach(request.engine.geometryProbe()),
        relations: detach(request.engine.relationProbe()),
        history: detach(request.engine.historyInspection()),
        companion: detach(request.engine.historyCompanionState()),
        interactionMode: detach(request.engine.interactionModeProbe()),
        editorWorkflow: detach(request.engine.editorWorkflowProbe()),
        dataset: detach(request.engine.exportDataset()),
        runtime: {
          ownership: zeroOwnership(),
          stats: runtimeStats(
            workflowCallCount,
            matrixCallCount,
            loadCallCount,
            historyCallCount,
            publishCallCount,
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
        revision: CORE_V2_EDITOR_WORKFLOW_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
        stats: runtimeStats(
          workflowCallCount,
          matrixCallCount,
          loadCallCount,
          historyCallCount,
          publishCallCount,
          observationCount,
        ),
      });
      return cleanup;
    },
  });
}

function loadDatasetRequest(value: unknown): LoadDatasetInput {
  const request = requireRecord(value, 'load dataset request');
  assertExactKeys(
    request,
    ['caseId', 'dataset', 'datasetRef', 'engine'],
    'load dataset request',
  );
  invariant(
    typeof request.datasetRef === 'string' && request.datasetRef.length > 0,
    'load dataset reference',
  );
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
    datasetRef: request.datasetRef,
    dataset: request.dataset,
  });
}

function workflowRequest(value: unknown): WorkflowInput {
  const request = requireRecord(value, 'workflow request');
  assertExactKeys(request, ['action', 'caseId', 'engine'], 'workflow request');
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
    action: requireRecord(request.action, 'workflow action') as CoreV2EditorWorkflowAction,
  });
}

function matrixRequest(value: unknown): MatrixInput {
  const request = requireRecord(value, 'matrix request');
  assertExactKeys(
    request,
    ['caseId', 'companion', 'engine', 'mutationKinds', 'oneActionEach'],
    'matrix request',
  );
  invariant(Array.isArray(request.mutationKinds), 'matrix mutation kinds');
  invariant(request.oneActionEach === true, 'matrix one action each');
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
    mutationKinds: Object.freeze(
      request.mutationKinds.map((kind) => {
        invariant(typeof kind === 'string', 'matrix mutation kind');
        return kind as CoreV2EditorMutationKind;
      }),
    ),
    oneActionEach: true,
    companion: detach(
      requireRecord(request.companion, 'matrix companion'),
    ) as CoreV2MutationJsonValue,
  });
}

function observationRequest(value: unknown): ObservationInput {
  const request = requireRecord(value, 'observation request');
  assertExactKeys(request, ['caseId', 'engine'], 'observation request');
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
  });
}

function historyRequest(value: unknown): HistoryInput {
  const request = requireRecord(value, 'history request');
  assertExactKeys(request, ['caseId', 'direction', 'engine'], 'history request');
  invariant(
    request.direction === 'undo' || request.direction === 'redo',
    'history direction',
  );
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
    direction: request.direction,
  });
}

function publishRequest(value: unknown): PublishInput {
  const request = requireRecord(value, 'publish request');
  assertExactKeys(request, ['caseId', 'engine', 'timeMs'], 'publish request');
  invariant(
    typeof request.timeMs === 'number' && Number.isFinite(request.timeMs),
    'publish time',
  );
  return Object.freeze({
    caseId: requireCaseId(request.caseId),
    engine: requireEngine(request.engine),
    timeMs: request.timeMs,
  });
}

function requireEngine(value: unknown): CoreV2Engine {
  invariant(value !== null && typeof value === 'object', 'Core v2 Engine');
  for (const method of [
    'loadDataset',
    'editorWorkflow',
    'runEditorMutationMatrix',
    'undo',
    'redo',
    'publishFrame',
    'editorWorkflowProbe',
    'snapshot',
    'semanticProbe',
    'geometryProbe',
    'relationProbe',
    'historyInspection',
    'historyCompanionState',
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
  workflowCallCount: number,
  matrixCallCount: number,
  loadCallCount: number,
  historyCallCount: number,
  publishCallCount: number,
  observationCount: number,
): Readonly<Record<string, number>> {
  return Object.freeze({
    workflowCallCount,
    matrixCallCount,
    loadCallCount,
    historyCallCount,
    publishCallCount,
    observationCount,
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
    editorSessions: 0,
  });
}

function requireCaseId(value: unknown): CoreV2EditorWorkflowCaseId {
  invariant(
    typeof value === 'string'
      && CORE_V2_EDITOR_WORKFLOW_CASE_IDS.includes(
        value as CoreV2EditorWorkflowCaseId,
      ),
    'unsupported editor workflow case identity',
  );
  return value as CoreV2EditorWorkflowCaseId;
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
  if (!condition) throw new Error(`Invalid Core v2 editor workflow runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
