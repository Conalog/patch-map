import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  ManualClock,
  captureFailure,
  createAccessorPayload,
  createCyclicPayload,
  createEngineHarness,
  createSparseArrayPayload,
  createSymbolPropertyPayload,
  valueAt,
  type ActionDefinition,
  type CatalogCase,
  type EngineHarness,
  type ExecuteOptions,
  type HandlerEntry,
  type MaterializedCase,
  type WorkerRuntime,
} from './support/contract-foundation-execution-harness';

interface ExecutorCatalog {
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly cases: readonly CatalogCase[];
}

interface CatalogRuntime {
  loadExecutorCatalog(this: void): Promise<ExecutorCatalog>;
  selectCatalogCases(
    this: void,
    catalog: ExecutorCatalog,
    selection: Readonly<{ caseIds: readonly string[] }>,
  ): readonly CatalogCase[];
}

interface MaterializeRuntime {
  materializeCase(
    this: void,
    record: CatalogCase,
    routeOptions: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface FoundationRuntime {
  readonly FOUNDATION_ACTION_TYPES: readonly string[];
  createFoundationHandlerEntries(this: void): readonly HandlerEntry[];
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

const [catalogRuntime, materializeRuntime, foundationRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/patch-map-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/patch-map-contract/materialize.mjs'),
  loadRuntime<FoundationRuntime>('../../scripts/verification/patch-map-contract/handlers/foundation.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/patch-map-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { FOUNDATION_ACTION_TYPES, createFoundationHandlerEntries } = foundationRuntime;
const { executeContractCase } = workerRuntime;

const EXPECTED_FOUNDATION_TYPES = [
  'initialize',
  'snapshot-resolved-dataset',
  'exercise-authoritative-draw-races',
  'publishFrame',
  'loadDataset',
  'queryAll',
  'attemptStrictLoadVariant',
  'freezeInput',
  'snapshot',
  'initialize-engine',
  'load-scene',
  'await-first-useful-frame',
  'probe-declared-failure',
];

const UNSAFE_EVENT_PAYLOADS = [
  { label: 'undefined', create: () => undefined },
  { label: 'non-finite number', create: () => ({ value: Number.POSITIVE_INFINITY }) },
  { label: 'bigint', create: () => ({ value: 1n }) },
  { label: 'symbol property', create: createSymbolPropertyPayload },
  { label: 'sparse array', create: createSparseArrayPayload },
  { label: 'cyclic record', create: createCyclicPayload },
  { label: 'Map', create: () => new Map([['value', 1]]) },
  { label: 'accessor property', create: createAccessorPayload },
] satisfies readonly Readonly<{ label: string; create: () => unknown }>[];

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('foundation actual-only handler registry', () => {
  it('registers exactly the 13 approved action kinds and stays behind the expected-value firewall', async () => {
    expect(FOUNDATION_ACTION_TYPES).toEqual(EXPECTED_FOUNDATION_TYPES);
    expect(createFoundationHandlerEntries().map(([handlerId]) => handlerId)).toEqual(
      EXPECTED_FOUNDATION_TYPES.map((type) => `contract/${type}`),
    );

    const forbiddenFile = 'catalog-normalized-expected.v1.json';
    const sources = await Promise.all([
      '../../scripts/verification/patch-map-contract/execute-worker.mjs',
      '../../scripts/verification/patch-map-contract/handlers/foundation.mjs',
    ].map(async (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')));
    for (const source of sources) {
      expect(source).not.toContain(forbiddenFile);
      expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/);
      expect(source).not.toContain('node:crypto');
    }
  });
});

describe('foundation capability execution', () => {
  it('executes LIF-001 in exact order with one idempotent engine and finally cleanup', async () => {
    const harness = createEngineHarness();
    const clock = new ManualClock();
    const caseRecord = selectedCase('LIF-001');
    const actionBefore = JSON.stringify(caseRecord.actionTrace);
    const execution = await executeContractCase(executionOptions(caseRecord, harness, clock));

    expect(execution.status).toBe('completed');
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status }))).toEqual([
      { index: 0, type: 'initialize', status: 'completed' },
      { index: 1, type: 'initialize', status: 'completed' },
    ]);
    expect(execution.actionResults.map((result) => valueAt(result.delta, '$schema'))).toEqual([
      'patch-map-semantic-observation-delta/1',
      'patch-map-semantic-observation-delta/1',
    ]);
    expect(harness.engines).toHaveLength(1);
    expect(harness.engines[0]?.initializeCalls).toBe(2);
    expect(harness.engines[0]?.destroyCalls).toBe(1);
    expect(execution.eventJournal.map(({ sequence, generation, role, event }) => ({
      sequence,
      generation,
      role,
      event,
    }))).toEqual([
      { sequence: 1, generation: 1, role: 'main', event: 'ready' },
      { sequence: 2, generation: 1, role: 'main', event: 'destroyed' },
    ]);
    expect(execution.eventJournal.filter(({ event }) => event === 'ready')).toHaveLength(1);
    expect(execution.eventJournal[0]?.actual).toMatchObject({
      lifecycle: 'ready-empty',
      instanceId: 'map-1',
      revisions: { lifecycleGeneration: 1 },
    });
    expect(execution.actionResults.map((result) => valueAt(result.delta, 'semanticProbe'))).toEqual([null, null]);
    expect(execution.terminalSemanticProbe).toBeNull();
    expect(valueAt(execution.cleanup, 'status')).toBe('completed');
    expect(valueAt(execution.cleanup, 'releases.0.journalSubscriptions')).toEqual({
      registeredCount: 6,
      releasedCount: 6,
    });
    expect(valueAt(execution.cleanup, 'releases.0.remainingResources.canvasCount')).toBe(0);
    expect(valueAt(execution.cleanup, 'releases.0.remainingResources.pendingWork')).toBe(0);
    expect(JSON.stringify(caseRecord.actionTrace)).toBe(actionBefore);
    expect(JSON.stringify(execution)).not.toContain('"status":"pass"');
    expect(Object.isFrozen(execution)).toBe(true);
  });

  it('executes the LIF-002 authoritative race and retains the product diagnostic verbatim', async () => {
    const datasets = createDatasets();
    const allKindsBefore = JSON.stringify(datasets.get('all-kinds-scene'));
    const harness = createEngineHarness();
    const clock = new ManualClock();
    const execution = await executeContractCase(
      executionOptions(selectedCase('LIF-002'), harness, clock, { datasets }),
    );

    expect(execution.actionResults.map(({ index, type }) => [index, type])).toEqual([
      [0, 'initialize'],
      [1, 'snapshot-resolved-dataset'],
      [2, 'exercise-authoritative-draw-races'],
      [3, 'publishFrame'],
    ]);
    expect(clock.timeline).toEqual([0, 1, 2, 8, 12, 20]);
    expect(valueAt(execution, 'actionResults.2.delta.actual.preReady.status')).toBe('rejected');
    expect(valueAt(execution, 'actionResults.2.delta.actual.preReady.diagnostic.code')).toBe('NOT_READY');
    expect(valueAt(execution, 'actionResults.2.delta.actual.pending.0.result.status')).toBe('superseded');
    expect(valueAt(execution, 'actionResults.2.delta.actual.pending.1.result.status')).toBe('committed');
    expect(valueAt(execution, 'actionResults.2.delta.actual.completionOrder')).toMatchObject([
      { requestId: 'draw-b', settlement: 'fulfilled', result: { status: 'committed' } },
      { requestId: 'draw-a', settlement: 'fulfilled', result: { status: 'superseded' } },
    ]);
    expect(valueAt(execution, 'actionResults.2.delta.actual.authoritativeSubmittedInput')).toMatchObject({
      requestId: 'draw-b',
      datasetRef: 'interactive-scene-revision-2',
      unchanged: true,
      postUseGraph: [{ type: 'item', id: 'item-b' }],
      deeplyFrozen: false,
    });
    expect(valueAt(
      execution,
      'actionResults.2.delta.actual.authoritativeSubmittedInput.postUseFingerprint',
    )).toBe(valueAt(
      execution,
      'actionResults.2.delta.actual.authoritativeSubmittedInput.beforeFingerprint',
    ));
    expect(valueAt(execution, 'actionResults.2.delta.actual.failedLater.status')).toBe('rejected');
    expect(valueAt(execution, 'actionResults.2.delta.actual.failedLater.diagnostic.code')).toBe('INVALID_RECORD_KIND');
    expect(valueAt(execution, 'actionResults.2.delta.actual.failedLater.diagnostic.code')).not.toBe('INVALID_DATASET');
    expect(valueAt(execution, 'actionResults.2.delta.actual.drawCompleteEvents')).toEqual([{
      requestId: 'draw-b',
      sceneRevision: 1,
      semanticHash: valueAt(execution, 'actionResults.2.delta.actual.authoritative.sceneSemanticHash'),
      datasetRef: 'interactive-scene-revision-2',
    }]);
    expect(valueAt(execution, 'actionResults.2.delta.actual.drawCompleteSubscription')).toEqual({
      activeBefore: 6,
      activeDuring: 7,
      activeAfter: 6,
    });
    expect(execution.eventJournal.map(({ sequence, generation, role, event }) => ({
      sequence,
      generation,
      role,
      event,
    }))).toEqual([
      { sequence: 1, generation: 1, role: 'main', event: 'ready' },
      { sequence: 2, generation: 2, role: 'pre-ready-submission', event: 'destroyed' },
      { sequence: 3, generation: 1, role: 'main', event: 'sceneCommitted' },
      { sequence: 4, generation: 1, role: 'main', event: 'drawComplete' },
      { sequence: 5, generation: 1, role: 'main', event: 'diagnostic' },
      { sequence: 6, generation: 1, role: 'main', event: 'frame' },
      { sequence: 7, generation: 1, role: 'main', event: 'destroyed' },
    ]);
    const drawCompleteJournal = execution.eventJournal.filter(({ event }) => event === 'drawComplete');
    expect(drawCompleteJournal).toHaveLength(1);
    expect(drawCompleteJournal[0]).toMatchObject({ generation: 1, role: 'main' });
    expect(drawCompleteJournal[0]?.actual).toMatchObject({ requestId: 'draw-b' });
    expect(execution.eventJournal.filter(({ event }) => event === 'destroyed').map(({ generation }) => generation))
      .toEqual([2, 1]);
    expect(execution.actionResults.map((result) => valueAt(result.delta, 'semanticProbe')))
      .toEqual([null, null, null, null]);
    expect(valueAt(execution, 'datasetObservations.all-kinds-scene.unchanged')).toBe(true);
    expect(valueAt(execution, 'datasetObservations.interactive-scene-revision-2.unchanged')).toBe(true);
    expect(valueAt(execution, 'datasetObservations.malformed.unchanged')).toBe(true);
    expect(valueAt(execution, 'datasetObservations.all-kinds-scene.beforeFingerprint'))
      .toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(valueAt(execution, 'datasetObservations.all-kinds-scene.currentGraph')).toEqual(
      valueAt(execution, 'datasetObservations.all-kinds-scene.beforeGraph'),
    );
    expect(valueAt(execution.bindings, 'afterLatestSuccess.datasetRef')).toBe('interactive-scene-revision-2');
    expect(JSON.stringify(datasets.get('all-kinds-scene'))).toBe(allKindsBefore);
    expect(harness.engines.every((engine) => engine.destroyCalls === 1)).toBe(true);
  });

  it('records DAT-001 strict-load rejection and actual atomic scene retention', async () => {
    const harness = createEngineHarness();
    const execution = await executeContractCase(
      executionOptions(selectedCase('DAT-001'), harness, new ManualClock()),
    );

    expect(execution.actionResults.map(({ type }) => type)).toEqual([
      'loadDataset',
      'queryAll',
      'attemptStrictLoadVariant',
    ]);
    expect(valueAt(execution, 'actionResults.1.delta.actual.count')).toBe(7);
    expect(valueAt(execution, 'actionResults.2.delta.actual.accepted')).toBe(false);
    expect(valueAt(execution, 'actionResults.2.delta.actual.diagnostic.code')).toBe('INVALID_RECORD_KIND');
    expect(valueAt(execution, 'actionResults.2.delta.actual.diagnostic')).toMatchObject({
      category: 'INVALID_INPUT',
      datasetPath: '$[7].type',
      recoverable: false,
      retryable: false,
      appliedCount: 0,
      missingCount: 0,
      unchangedCount: 0,
    });
    expect(valueAt(execution, 'actionResults.2.delta.actual.diagnostic.diagnostic')).not.toHaveProperty('datasetPath');
    expect(valueAt(execution, 'actionResults.2.delta.actual.atomicRetained')).toBe(true);
    expect(valueAt(execution, 'actionResults.2.delta.actual.before.semanticHash')).toBe(
      valueAt(execution, 'actionResults.2.delta.actual.after.semanticHash'),
    );
  });

  it('keeps DAT-002 caller input frozen and captures session 2 only after action 4 succeeds', async () => {
    const caseRecord = selectedCase('DAT-002');
    const fixtureBefore = JSON.stringify(caseRecord.fixture.setup.params);
    const harness = createEngineHarness();
    const execution = await executeContractCase(
      executionOptions(caseRecord, harness, new ManualClock()),
    );

    expect(execution.actionResults.map(({ index, type }) => [index, type])).toEqual([
      [0, 'freezeInput'],
      [1, 'loadDataset'],
      [2, 'snapshot'],
      [3, 'loadDataset'],
      [4, 'snapshot'],
    ]);
    expect(valueAt(execution, 'actionResults.0.delta.actual.deeplyFrozen')).toBe(true);
    expect(valueAt(execution, 'actionResults.1.delta.actual.input.unchanged')).toBe(true);
    expect(valueAt(execution, 'actionResults.1.delta.actual.input.deeplyFrozen')).toBe(true);
    expect(valueAt(execution, 'actionResults.3.delta.actual.input.unchanged')).toBe(true);
    expect(valueAt(execution, 'actionResults.3.delta.actual.input.deeplyFrozen')).toBe(true);
    expect(valueAt(execution, 'actionResults.1.delta.actual.exportedDataset')).toEqual(
      valueAt(execution, 'datasetObservations.minimal.currentGraph'),
    );
    expect(valueAt(execution, 'actionResults.3.delta.actual.exportedDataset')).toEqual(
      valueAt(execution, 'datasetObservations.minimal.currentGraph'),
    );
    expect(valueAt(execution, 'actionResults.1.delta.actual.exportedDatasetDeeplyFrozen')).toBe(false);
    expect(valueAt(execution, 'actionResults.3.delta.actual.exportedDatasetDeeplyFrozen')).toBe(false);
    expect(valueAt(execution, 'actionResults.1.delta.actual.input.beforeFingerprint')).toBe(
      valueAt(execution, 'actionResults.3.delta.actual.input.beforeFingerprint'),
    );
    expect(harness.metadata.map(({ role, generation }) => ({ role, generation }))).toEqual([
      { role: 'session:1', generation: 1 },
      { role: 'session:2', generation: 2 },
    ]);
    expect(harness.engines).toHaveLength(2);
    expect(harness.engines.every((engine) => engine.initializeCalls === 1 && engine.destroyCalls === 1)).toBe(true);
    expect(execution.eventJournal.map(({ sequence, generation, role, event }) => ({
      sequence,
      generation,
      role,
      event,
    }))).toEqual([
      { sequence: 1, generation: 1, role: 'session:1', event: 'ready' },
      { sequence: 2, generation: 1, role: 'session:1', event: 'sceneCommitted' },
      { sequence: 3, generation: 1, role: 'session:1', event: 'destroyed' },
      { sequence: 4, generation: 2, role: 'session:2', event: 'ready' },
      { sequence: 5, generation: 2, role: 'session:2', event: 'sceneCommitted' },
      { sequence: 6, generation: 2, role: 'session:2', event: 'destroyed' },
    ]);
    expect(valueAt(execution, 'captures.0.id')).toBe('session2');
    expect(valueAt(execution, 'captures.0.afterActionIndex')).toBe(4);
    expect(valueAt(execution, 'captures.0.values.semanticHash')).toBe(
      valueAt(execution, 'actionResults.4.delta.actual.snapshot.semanticHash'),
    );
    expect(valueAt(execution, 'terminalSnapshot.semanticHash')).toBe(
      valueAt(execution, 'actionResults.4.delta.actual.snapshot.semanticHash'),
    );
    expect(valueAt(execution, 'terminalSnapshot.revisions.sceneRevision')).toBe(1);
    expect(execution.actionResults.map((result) => valueAt(result.delta, 'semanticProbe')))
      .toEqual([null, null, null, null, null]);
    expect(execution.terminalSemanticProbe).toBeNull();
    expect(valueAt(execution, 'datasetObservations.minimal')).toMatchObject({
      reference: 'minimal',
      unchanged: true,
      currentDeeplyFrozen: true,
    });
    expect(valueAt(execution, 'datasetObservations.minimal.beforeFingerprint')).toBe(
      valueAt(execution, 'datasetObservations.minimal.currentFingerprint'),
    );
    expect(valueAt(execution, 'datasetObservations.minimal.beforeFingerprint'))
      .toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(valueAt(execution, 'datasetObservations.minimal.beforeGraph')).toEqual(
      valueAt(execution, 'datasetObservations.minimal.currentGraph'),
    );
    expect(valueAt(execution.cleanup, 'releases.0.remainingResources.canvasCount')).toBe(0);
    expect(valueAt(execution.cleanup, 'releases.1.remainingResources.canvasCount')).toBe(0);
    expect(JSON.stringify(caseRecord.fixture.setup.params)).toBe(fixtureBefore);
  });

  it('retains detached input observations for every LIF-002 pending submission', async () => {
    const datasets = createDatasets();
    const execution = await executeContractCase(
      executionOptions(selectedCase('LIF-002'), createEngineHarness(), new ManualClock(), { datasets }),
    );
    const observationPath = 'actionResults.2.delta.actual.submittedInputs';
    const drawA = valueAt(execution, `${observationPath}.0`);
    const drawB = valueAt(execution, `${observationPath}.1`);

    expect(valueAt(execution, observationPath)).toMatchObject([
      {
        requestId: 'draw-a',
        datasetRef: 'all-kinds-scene',
        unchanged: true,
        postUseGraph: datasets.get('all-kinds-scene'),
        deeplyFrozen: false,
      },
      {
        requestId: 'draw-b',
        datasetRef: 'interactive-scene-revision-2',
        unchanged: true,
        postUseGraph: datasets.get('interactive-scene-revision-2'),
        deeplyFrozen: false,
      },
    ]);

    for (const [observation, source] of [
      [drawA, datasets.get('all-kinds-scene')],
      [drawB, datasets.get('interactive-scene-revision-2')],
    ]) {
      const postUseGraph = valueAt(observation, 'postUseGraph');
      expect(valueAt(observation, 'postUseFingerprint')).toBe(valueAt(observation, 'beforeFingerprint'));
      expect(postUseGraph).toEqual(source);
      expect(postUseGraph).not.toBe(source);
      expect(valueAt(postUseGraph, '0')).not.toBe(valueAt(source, '0'));
      expect(Object.isFrozen(postUseGraph)).toBe(true);
    }

    expect(valueAt(execution, 'actionResults.2.delta.actual.authoritativeSubmittedInput')).toBe(drawB);
  });

  it('uses a canonical browser-safe fingerprint independent of object key insertion order', async () => {
    const ordered = createDatasets();
    const reordered = new Map(createDatasets());
    reordered.set('all-kinds-scene', [
      { id: 'group-a', type: 'group' },
      { id: 'grid-a', type: 'grid' },
      { id: 'item-a', type: 'item' },
      { id: 'links', type: 'relations' },
      { id: 'image-a', type: 'image' },
      { id: 'text-a', type: 'text' },
      { id: 'rect-a', type: 'rect' },
    ]);
    const orderedExecution = await executeContractCase(
      executionOptions(selectedCase('LIF-002'), createEngineHarness(), new ManualClock(), { datasets: ordered }),
    );
    const reorderedExecution = await executeContractCase(
      executionOptions(selectedCase('LIF-002'), createEngineHarness(), new ManualClock(), { datasets: reordered }),
    );

    const orderedFingerprint = valueAt(
      orderedExecution,
      'datasetObservations.all-kinds-scene.beforeFingerprint',
    );
    expect(orderedFingerprint).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(valueAt(reorderedExecution, 'datasetObservations.all-kinds-scene.beforeFingerprint'))
      .toBe(orderedFingerprint);
  });
});

describe('foundation consumer host seam', () => {
  it('executes CSM-001 independently with an isolated actual host delta and failure generation', async () => {
    const harness = createEngineHarness();
    const execution = await executeContractCase(
      executionOptions(selectedCase('CSM-001'), harness, new ManualClock()),
    );

    expect(execution.caseType).toBe('consumer-journey');
    expect(execution.actionResults.map(({ index, type }) => [index, type])).toEqual([
      [0, 'initialize-engine'],
      [1, 'load-scene'],
      [2, 'await-first-useful-frame'],
      [3, 'probe-declared-failure'],
    ]);
    expect(valueAt(execution.hostSeamDelta, '$schema')).toBe('patch-map-host-seam-delta/1');
    expect(valueAt(execution.hostSeamDelta, 'capabilityPassInherited')).toBe(false);
    expect(valueAt(execution.hostSeamDelta, 'actions')).toHaveLength(4);
    expect(valueAt(execution, 'actionResults.3.delta.actual.diagnostic.code')).toBe('DECLARED_FAILURE');
    expect(valueAt(execution, 'actionResults.3.delta.actual.diagnostic.source')).toBe('declared-host-injection');
    expect(valueAt(execution, 'actionResults.3.delta.actual.rollback.retainedSceneRevision')).toBe(0);
    expect(valueAt(execution, 'terminalSnapshot.revisions.sceneRevision')).toBe(1);
    expect(valueAt(execution, 'terminalSnapshot.datasetRef')).toBe('interactive-scene');
    expect(JSON.stringify(execution)).not.toContain('"status":"pass"');
    expect(harness.engines).toHaveLength(2);
    expect(harness.engines.every((engine) => engine.destroyCalls === 1)).toBe(true);
  });
});

describe('foundation executor failure authority', () => {
  it('rejects a drifted canonical action index before creating an engine', async () => {
    const approved = selectedCase('LIF-001');
    const driftedActions = approved.actionTrace.map((action, index) => (
      index === 1 ? { ...action, index: 7 } : action
    ));
    const drifted: MaterializedCase = {
      ...approved,
      actionTrace: driftedActions,
      fixture: { ...approved.fixture, actionTrace: driftedActions },
    };
    const harness = createEngineHarness();

    await expect(executeContractCase(
      executionOptions(drifted, harness, new ManualClock()),
    )).rejects.toThrow(/action index 1/);
    expect(harness.engines).toHaveLength(0);
  });

  it('rejects missing and unknown handler registration before creating an engine', async () => {
    const caseRecord = selectedCase('LIF-001');
    const missingHarness = createEngineHarness();
    const missingEntries = createFoundationHandlerEntries().filter(
      ([handlerId]) => handlerId !== 'contract/initialize',
    );
    await expect(executeContractCase(
      executionOptions(caseRecord, missingHarness, new ManualClock(), { handlerEntries: missingEntries }),
    )).rejects.toThrow(/missing selected handlers/);
    expect(missingHarness.engines).toHaveLength(0);

    const unknownHarness = createEngineHarness();
    const unknownEntries: readonly HandlerEntry[] = [
      ...createFoundationHandlerEntries(),
      ['contract/not-approved', () => undefined],
    ];
    await expect(executeContractCase(
      executionOptions(caseRecord, unknownHarness, new ManualClock(), { handlerEntries: unknownEntries }),
    )).rejects.toThrow(/unknown handler ID/);
    expect(unknownHarness.engines).toHaveLength(0);
  });

  it('does not commit a produced binding until handler output validation succeeds', async () => {
    const caseRecord = selectedCase('LIF-002');
    const harness = createEngineHarness();
    const entries = createFoundationHandlerEntries().map(([handlerId, handler]) => (
      handlerId === 'contract/snapshot-resolved-dataset'
        ? [handlerId, () => ({
            actual: { attempted: true },
            bindings: { inputBefore: { dataset: [] } },
          })] as const
        : [handlerId, handler] as const
    ));
    const error = await captureFailure(executeContractCase(
      executionOptions(caseRecord, harness, new ManualClock(), { handlerEntries: entries }),
    ));

    expect(valueAt(error, 'partialExecution.status')).toBe('failed');
    expect(valueAt(error, 'partialExecution.actionResults.1.status')).toBe('failed');
    expect(valueAt(error, 'partialExecution.bindings')).toEqual({});
    expect(valueAt(error, 'partialExecution.cleanup.status')).toBe('completed');
    expect(harness.engines[0]?.destroyCalls).toBe(1);
  });

  it.each(UNSAFE_EVENT_PAYLOADS)(
    'rejects a $label public event payload while retaining cleanup events',
    async ({ create }) => {
      const harness = createEngineHarness({ readyEventPayload: create });
      const error = await captureFailure(executeContractCase(
        executionOptions(selectedCase('LIF-001'), harness, new ManualClock()),
      ));

      expect(valueAt(error, 'code')).toBe('UNSERIALIZABLE_ENGINE_EVENT');
      expect(valueAt(error, 'partialExecution.status')).toBe('failed');
      expect(valueAt(error, 'partialExecution.actionResults.0.status')).toBe('failed');
      expect(valueAt(error, 'partialExecution.eventJournal')).toEqual([{
        sequence: 1,
        generation: 1,
        role: 'main',
        event: 'destroyed',
        actual: { lifecycleGeneration: 1 },
      }]);
      expect(valueAt(error, 'partialExecution.eventJournalFailures')).toHaveLength(1);
      expect(valueAt(error, 'partialExecution.eventJournalFailures.0')).toMatchObject({
        generation: 1,
        role: 'main',
        event: 'ready',
      });
      expect(valueAt(error, 'partialExecution.eventJournalFailures.0.error.code'))
        .toBe('UNSERIALIZABLE_ENGINE_EVENT');
      expect(valueAt(error, 'partialExecution.terminalSnapshot.lifecycle')).toBe('ready-empty');
      expect(valueAt(error, 'partialExecution.cleanup.status')).toBe('completed');
      expect(valueAt(error, 'partialExecution.cleanup.releases.0.journalSubscriptions')).toEqual({
        registeredCount: 6,
        releasedCount: 6,
      });
      expect(harness.engines[0]?.destroyCalls).toBe(1);
    },
  );

  it('rejects non-JSON-safe semantic probe evidence and still cleans up', async () => {
    const harness = createEngineHarness({
      semanticProbePayload: () => new Map([['value', 1]]),
    });
    const error = await captureFailure(executeContractCase(
      executionOptions(selectedCase('LIF-001'), harness, new ManualClock()),
    ));

    expect(valueAt(error, 'code')).toBe('UNSERIALIZABLE_SEMANTIC_PROBE');
    expect(valueAt(error, 'partialExecution.status')).toBe('failed');
    expect(valueAt(error, 'partialExecution.actionResults.0.status')).toBe('failed');
    expect(valueAt(error, 'partialExecution.actionResults.0.delta.actual.error.code'))
      .toBe('UNSERIALIZABLE_SEMANTIC_PROBE');
    expect(valueAt(error, 'partialExecution.eventJournal')).toMatchObject([
      { sequence: 1, event: 'ready' },
      { sequence: 2, event: 'destroyed' },
    ]);
    expect(valueAt(error, 'partialExecution.eventJournalFailures')).toEqual([]);
    expect(valueAt(error, 'partialExecution.terminalSemanticProbe')).toBeNull();
    expect(valueAt(error, 'partialExecution.cleanup.status')).toBe('completed');
    expect(harness.engines[0]?.destroyCalls).toBe(1);
  });

  it('turns a swallowed unserializable destroyed event into a cleanup failure', async () => {
    const harness = createEngineHarness({ unserializableDestroyedEvent: true });
    const error = await captureFailure(executeContractCase(
      executionOptions(selectedCase('LIF-001'), harness, new ManualClock()),
    ));

    expect(valueAt(error, 'code')).toBe('CLEANUP_FAILED');
    expect(valueAt(error, 'partialExecution.actionResults.0.status')).toBe('completed');
    expect(valueAt(error, 'partialExecution.actionResults.1.status')).toBe('completed');
    expect(valueAt(error, 'partialExecution.cleanup.status')).toBe('failed');
    expect(valueAt(error, 'partialExecution.cleanup.errors.0.code')).toBe('UNSERIALIZABLE_ENGINE_EVENT');
    expect(valueAt(error, 'partialExecution.eventJournalFailures.0')).toMatchObject({
      generation: 1,
      role: 'main',
      event: 'destroyed',
    });
    expect(valueAt(error, 'partialExecution.eventJournalFailures.0.error.code'))
      .toBe('UNSERIALIZABLE_ENGINE_EVENT');
    expect(harness.engines[0]?.destroyCalls).toBe(1);
  });

  it('keeps timeout and engine failure non-passing while cleanup runs in finally', async () => {
    const timeoutHarness = createEngineHarness({ hangInitialize: true });
    const timeoutError = await captureFailure(executeContractCase(
      executionOptions(selectedCase('LIF-001'), timeoutHarness, new ManualClock(true), { actionTimeoutMs: 1 }),
    ));
    expect(valueAt(timeoutError, 'code')).toBe('ACTION_TIMEOUT');
    expect(valueAt(timeoutError, 'partialExecution.status')).toBe('failed');
    expect(valueAt(timeoutError, 'partialExecution.cleanup.status')).toBe('completed');
    expect(JSON.stringify(valueAt(timeoutError, 'partialExecution'))).not.toContain('"status":"pass"');
    expect(timeoutHarness.engines[0]?.destroyCalls).toBe(1);

    const failureHarness = createEngineHarness({ failInitialize: true });
    const engineError = await captureFailure(executeContractCase(
      executionOptions(selectedCase('LIF-001'), failureHarness, new ManualClock()),
    ));
    expect(valueAt(engineError, 'code')).toBe('ENGINE_INIT_FAILURE');
    expect(valueAt(engineError, 'partialExecution.actionResults.0.delta.actual.error.code')).toBe('ENGINE_INIT_FAILURE');
    expect(valueAt(engineError, 'partialExecution.cleanup.status')).toBe('completed');
    expect(failureHarness.engines[0]?.destroyCalls).toBe(1);
  });
});

function selectedCase(id: string): MaterializedCase {
  const record = selectCatalogCases(catalog, { caseIds: [id] })[0];
  if (!record) throw new Error(`missing approved case ${id}`);
  return materializeCase(record, { size: '100', seed: '319' });
}

interface ExecutionOverrides {
  readonly datasets?: ReadonlyMap<string, unknown>;
  readonly handlerEntries?: readonly HandlerEntry[];
  readonly actionTimeoutMs?: number;
}

function executionOptions(
  caseRecord: MaterializedCase,
  harness: EngineHarness,
  clock: ManualClock,
  overrides: ExecutionOverrides = {},
): ExecuteOptions {
  return {
    caseRecord,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: harness.engineFactory,
    datasets: overrides.datasets ?? createDatasets(),
    clock,
    ...(overrides.handlerEntries ? { handlerEntries: overrides.handlerEntries } : {}),
    ...(overrides.actionTimeoutMs ? { actionTimeoutMs: overrides.actionTimeoutMs } : {}),
  };
}

function createDatasets(): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>([
    ['all-kinds-scene', [
      { type: 'group', id: 'group-a' },
      { type: 'grid', id: 'grid-a' },
      { type: 'item', id: 'item-a' },
      { type: 'relations', id: 'links' },
      { type: 'image', id: 'image-a' },
      { type: 'text', id: 'text-a' },
      { type: 'rect', id: 'rect-a' },
    ]],
    ['interactive-scene-revision-2', [{ type: 'item', id: 'item-b' }]],
    ['malformed', [{ type: 'unsupported', id: 'invalid' }]],
    ['interactive-scene', [
      { type: 'item', id: 'item-a' },
      { type: 'rect', id: 'rect-b' },
      { type: 'text', id: 'text-c' },
      { type: 'relations', id: 'links' },
    ]],
  ]);
}
