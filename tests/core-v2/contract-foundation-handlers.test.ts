import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
}

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
  readonly binding?: Readonly<{
    producesFields?: readonly string[];
    consumesFields?: readonly string[];
    capturePaths?: readonly string[];
  }>;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<Record<string, unknown>> }>;
    readonly actionTrace: readonly ContractAction[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly ContractAction[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ExecutorCatalog {
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly cases: readonly CatalogCase[];
}

type Handler = (context: unknown, action: unknown) => unknown;
type HandlerEntry = readonly [string, Handler];

interface ActionExecution {
  readonly index: number;
  readonly type: string;
  readonly status: string;
  readonly delta: unknown;
}

interface CaseExecution {
  readonly caseId: string;
  readonly caseType: string;
  readonly status: string;
  readonly actionResults: readonly ActionExecution[];
  readonly captures: readonly unknown[];
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly hostSeamDelta: unknown;
  readonly terminalSnapshot: unknown;
  readonly cleanup: unknown;
  readonly error: unknown;
}

interface EngineFactoryMetadata {
  readonly caseId: string;
  readonly caseType: string;
  readonly role: string;
  readonly generation: number;
}

interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface ExecuteOptions {
  readonly caseRecord: MaterializedCase;
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => FakeEngine | Promise<FakeEngine>;
  readonly datasets: ReadonlyMap<string, unknown>;
  readonly clock: ManualClockContract;
  readonly actionTimeoutMs?: number;
  readonly handlerEntries?: readonly HandlerEntry[];
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

interface WorkerRuntime {
  executeContractCase(this: void, options: ExecuteOptions): Promise<CaseExecution>;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

const [catalogRuntime, materializeRuntime, foundationRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<FoundationRuntime>('../../scripts/verification/core-v2-contract/handlers/foundation.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
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

const SUPPORTED_TYPES = new Set(['group', 'grid', 'item', 'relations', 'image', 'text', 'rect']);

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
      '../../scripts/verification/core-v2-contract/execute-worker.mjs',
      '../../scripts/verification/core-v2-contract/handlers/foundation.mjs',
    ].map(async (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')));
    for (const source of sources) {
      expect(source).not.toContain(forbiddenFile);
      expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/);
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
      'core-v2-semantic-observation-delta/1',
      'core-v2-semantic-observation-delta/1',
    ]);
    expect(harness.engines).toHaveLength(1);
    expect(harness.engines[0]?.initializeCalls).toBe(2);
    expect(harness.engines[0]?.destroyCalls).toBe(1);
    expect(valueAt(execution.cleanup, 'status')).toBe('completed');
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
      activeBefore: 0,
      activeDuring: 1,
      activeAfter: 0,
    });
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
    expect(valueAt(execution, 'captures.0.id')).toBe('session2');
    expect(valueAt(execution, 'captures.0.afterActionIndex')).toBe(4);
    expect(valueAt(execution, 'captures.0.values.semanticHash')).toBe(
      valueAt(execution, 'actionResults.4.delta.actual.snapshot.semanticHash'),
    );
    expect(JSON.stringify(caseRecord.fixture.setup.params)).toBe(fixtureBefore);
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
    expect(valueAt(execution.hostSeamDelta, '$schema')).toBe('core-v2-host-seam-delta/1');
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

interface FakeEngineOptions {
  readonly failInitialize?: boolean;
  readonly hangInitialize?: boolean;
}

interface EngineHarness {
  readonly engines: FakeEngine[];
  readonly metadata: EngineFactoryMetadata[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => FakeEngine;
}

function createEngineHarness(options: FakeEngineOptions = {}): EngineHarness {
  const engines: FakeEngine[] = [];
  const metadata: EngineFactoryMetadata[] = [];
  return {
    engines,
    metadata,
    engineFactory: (factoryMetadata) => {
      metadata.push(structuredClone(factoryMetadata));
      const engine = new FakeEngine(factoryMetadata, options);
      engines.push(engine);
      return engine;
    },
  };
}

type Lifecycle = 'new' | 'initializing' | 'ready-empty' | 'scene-ready' | 'destroyed';

interface FrameEvent {
  readonly frameRevision: number;
  readonly publishedTuple: Readonly<{ scene: number; view: number; interaction: number }>;
}

class FakeProductError extends Error {
  public readonly code: string;
  public readonly category: string;
  public readonly datasetPath?: string;
  public readonly recoverable = false;
  public readonly retryable = false;
  public readonly appliedCount = 0;
  public readonly missingCount = 0;
  public readonly unchangedCount = 0;
  public readonly diagnostic: Readonly<Record<string, unknown>>;

  public constructor(code: string, operation: string, datasetPath?: string) {
    super(`${code}: ${operation}`);
    this.name = 'FakeProductError';
    this.code = code;
    this.category = code === 'NOT_READY' || code === 'SUPERSEDED' ? code : 'INVALID_INPUT';
    if (datasetPath !== undefined) this.datasetPath = datasetPath;
    this.diagnostic = diagnostic(code, operation);
  }
}

class FakeEngine {
  public readonly role: string;
  public initializeCalls = 0;
  public destroyCalls = 0;

  private readonly options: FakeEngineOptions;
  private lifecycle: Lifecycle = 'new';
  private instanceId: string | null = null;
  private lifecycleGeneration = 0;
  private sceneRevision = 0;
  private frameRevision = 0;
  private publishedSceneRevision = 0;
  private datasetRef: string | null = null;
  private semanticHash: string | null = null;
  private dataset: readonly Readonly<Record<string, unknown>>[] = [];
  private submissionSequence = 0;
  private pendingWork = 0;
  private canvasCount = 0;
  private readonly eventListeners = new Map<string, Set<(event: unknown) => void>>();

  public constructor(metadata: EngineFactoryMetadata, options: FakeEngineOptions) {
    this.role = metadata.role;
    this.options = options;
  }

  public async initialize(options: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    this.initializeCalls += 1;
    if (this.options.failInitialize) throw new FakeProductError('ENGINE_INIT_FAILURE', 'initialize');
    if (this.options.hangInitialize) {
      this.lifecycle = 'initializing';
      return new Promise(() => undefined);
    }
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'initialize');
    if (this.lifecycle === 'new' || this.lifecycle === 'initializing') {
      this.lifecycleGeneration += 1;
      this.lifecycle = this.dataset.length > 0 ? 'scene-ready' : 'ready-empty';
      this.canvasCount = 1;
      this.instanceId = typeof options.instanceId === 'string' ? options.instanceId : null;
    }
    return {
      lifecycle: this.lifecycle,
      instanceId: this.instanceId,
      revisions: this.revisions(),
      facilities: ['renderer', 'state'],
    };
  }

  public loadDataset(
    input: unknown,
    options: Readonly<{ datasetRef?: string }> = {},
  ): Readonly<Record<string, unknown>> {
    if (this.lifecycle === 'new' || this.lifecycle === 'initializing') {
      throw new FakeProductError('NOT_READY', 'loadDataset');
    }
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'loadDataset');
    const dataset = normalizeFakeDataset(input);
    this.dataset = dataset;
    this.datasetRef = options.datasetRef ?? null;
    this.semanticHash = `fake:${JSON.stringify(dataset)}`;
    this.sceneRevision += 1;
    this.lifecycle = dataset.length > 0 ? 'scene-ready' : 'ready-empty';
    return {
      lifecycle: this.lifecycle,
      sceneRevision: this.sceneRevision,
      semanticHash: this.semanticHash,
      rootIds: this.rootIds(),
    };
  }

  public async submitDataset(submission: Readonly<{
    requestId: string;
    datasetRef?: string;
    input: Promise<unknown>;
  }>): Promise<Readonly<Record<string, unknown>>> {
    if (this.lifecycle === 'new' || this.lifecycle === 'initializing') {
      return {
        status: 'rejected',
        requestId: submission.requestId,
        diagnostic: diagnostic('NOT_READY', 'loadDataset'),
      };
    }
    const sequence = ++this.submissionSequence;
    this.pendingWork += 1;
    try {
      const input = await submission.input;
      if (sequence !== this.submissionSequence || this.lifecycle === 'destroyed') {
        return {
          status: 'superseded',
          requestId: submission.requestId,
          diagnostic: diagnostic('SUPERSEDED', 'loadDataset'),
        };
      }
      try {
        const result = this.loadDataset(input, {
          ...(submission.datasetRef ? { datasetRef: submission.datasetRef } : {}),
        });
        this.emit('drawComplete', {
          requestId: submission.requestId,
          sceneRevision: this.sceneRevision,
          semanticHash: this.semanticHash,
          datasetRef: submission.datasetRef ?? null,
        });
        return {
          status: 'committed',
          requestId: submission.requestId,
          sceneRevision: result.sceneRevision,
          semanticHash: result.semanticHash,
        };
      } catch (error) {
        return {
          status: 'rejected',
          requestId: submission.requestId,
          diagnostic: diagnosticFromError(error, 'loadDataset'),
        };
      }
    } finally {
      this.pendingWork -= 1;
    }
  }

  public publishFrame(_timeMs: number): void {
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'publishFrame');
    this.frameRevision += 1;
    this.publishedSceneRevision = this.sceneRevision;
    const event: FrameEvent = {
      frameRevision: this.frameRevision,
      publishedTuple: { scene: this.sceneRevision, view: 0, interaction: 0 },
    };
    this.emit('frame', event);
  }

  public on(event: string, listener: (event: unknown) => void): () => void {
    if (event !== 'frame' && event !== 'drawComplete') throw new FakeProductError('UNKNOWN_EVENT', event);
    const listeners = this.eventListeners.get(event) ?? new Set<(value: unknown) => void>();
    listeners.add(listener);
    this.eventListeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  public exportDataset(): readonly Readonly<Record<string, unknown>>[] {
    if (this.lifecycle === 'destroyed') throw new FakeProductError('DESTROYED', 'exportDataset');
    return structuredClone(this.dataset);
  }

  public snapshot(): Readonly<Record<string, unknown>> {
    return {
      lifecycle: this.lifecycle,
      instanceId: this.instanceId,
      revisions: this.revisions(),
      publishedTuple: { scene: this.publishedSceneRevision, view: 0, interaction: 0 },
      frameRevision: this.frameRevision,
      datasetRef: this.datasetRef,
      semanticHash: this.semanticHash,
      rootIds: this.rootIds(),
      historyDepth: 0,
      pendingWork: this.pendingWork,
      resources: {
        canvasCount: this.canvasCount,
        subscriptions: { active: this.subscriptionCount(), duplicates: 0 },
      },
    };
  }

  public destroy(): Promise<boolean> {
    if (this.lifecycle === 'destroyed') return Promise.resolve(false);
    this.destroyCalls += 1;
    this.submissionSequence += 1;
    this.lifecycle = 'destroyed';
    this.canvasCount = 0;
    this.dataset = [];
    this.datasetRef = null;
    this.semanticHash = null;
    this.eventListeners.clear();
    return Promise.resolve(true);
  }

  private emit(event: string, value: unknown): void {
    for (const listener of [...(this.eventListeners.get(event) ?? [])]) listener(value);
  }

  private subscriptionCount(): number {
    return [...this.eventListeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  private revisions(): Readonly<Record<string, number>> {
    return {
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
      viewRevision: 0,
      interactionRevision: 0,
    };
  }

  private rootIds(): readonly string[] {
    return this.dataset.map((record, index) => (
      typeof record.id === 'string' ? record.id : `@root:${index}`
    ));
  }
}

class ManualTimeoutError extends Error {
  public readonly code = 'ACTION_TIMEOUT';

  public constructor(label: string) {
    super(`manual timeout: ${label}`);
    this.name = 'ManualTimeoutError';
  }
}

class ManualClock implements ManualClockContract {
  public readonly timeline: number[] = [];
  private current = 0;
  private readonly timeOut: boolean;

  public constructor(timeOut = false) {
    this.timeOut = timeOut;
  }

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.current) throw new Error(`manual clock moved backwards to ${timeMs}`);
    this.current = timeMs;
    this.timeline.push(timeMs);
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, label: string): Promise<T> {
    if (!this.timeOut) return promise;
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    throw new ManualTimeoutError(label);
  }
}

function normalizeFakeDataset(input: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(input)) throw new FakeProductError('INVALID_VALUE', 'loadDataset');
  for (const [index, record] of input.entries()) {
    if (!isRecord(record) || typeof record.type !== 'string' || !SUPPORTED_TYPES.has(record.type)) {
      throw new FakeProductError('INVALID_RECORD_KIND', 'loadDataset', `$[${index}].type`);
    }
  }
  return structuredClone(input) as readonly Readonly<Record<string, unknown>>[];
}

function diagnostic(code: string, operation: string): Readonly<Record<string, unknown>> {
  return {
    code,
    category: code === 'NOT_READY' || code === 'SUPERSEDED' ? code : 'INVALID_INPUT',
    operation,
    appliedCount: 0,
    missingCount: 0,
    unchangedCount: 0,
  };
}

function diagnosticFromError(error: unknown, operation: string): Readonly<Record<string, unknown>> {
  if (error instanceof FakeProductError) return error.diagnostic;
  return diagnostic(error instanceof Error ? error.name : 'UNKNOWN_FAILURE', operation);
}

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected execution to fail');
}

function valueAt(value: unknown, path: string): unknown {
  let cursor = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        throw new Error(`unresolved array path ${path}`);
      }
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`unresolved object path ${path}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
