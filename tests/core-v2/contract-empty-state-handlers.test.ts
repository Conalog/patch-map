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
    readonly producesFields?: readonly string[];
    readonly consumesFields?: readonly string[];
    readonly capturePaths?: readonly string[];
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
  readonly hostSeamDelta: unknown;
  readonly terminalSnapshot: unknown;
  readonly cleanup: unknown;
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
  readonly engineFactory: (metadata: EngineFactoryMetadata) => FakeEmptyStateEngine;
  readonly datasets: ReadonlyMap<string, unknown>;
  readonly clock: ManualClockContract;
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

interface EmptyStateRuntime {
  readonly EMPTY_STATE_ACTION_TYPES: readonly string[];
  createEmptyStateHandlerEntries(this: void): readonly HandlerEntry[];
}

interface FoundationRuntime {
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

const [catalogRuntime, materializeRuntime, emptyStateRuntime, foundationRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<EmptyStateRuntime>('../../scripts/verification/core-v2-contract/handlers/empty-state.mjs'),
  loadRuntime<FoundationRuntime>('../../scripts/verification/core-v2-contract/handlers/foundation.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { EMPTY_STATE_ACTION_TYPES, createEmptyStateHandlerEntries } = emptyStateRuntime;
const { createFoundationHandlerEntries } = foundationRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('empty-state actual-only handler registry', () => {
  it('registers exactly the approved set-host-state and query-target actions behind the expected firewall', async () => {
    expect(EMPTY_STATE_ACTION_TYPES).toEqual(['set-host-state', 'query-target']);
    expect(createEmptyStateHandlerEntries().map(([handlerId]) => handlerId)).toEqual([
      'contract/set-host-state',
      'contract/query-target',
    ]);

    const forbiddenFile = 'catalog-normalized-expected.v1.json';
    const sources = await Promise.all([
      '../../scripts/verification/core-v2-contract/execute-worker.mjs',
      '../../scripts/verification/core-v2-contract/handlers/empty-state.mjs',
      '../../scripts/verification/core-v2-contract/handlers/foundation.mjs',
    ].map(async (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')));
    for (const source of sources) {
      expect(source).not.toContain(forbiddenFile);
      expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/);
    }
  });
});

describe('CSM-003 empty-state consumer journey', () => {
  it('keeps host-only UI canvas-free, loads and queries empty state, and records isolated rollback facts', async () => {
    const caseRecord = selectedCase('CSM-003');
    const actionTraceBefore = JSON.stringify(caseRecord.actionTrace);
    const emptyDataset = Object.freeze([]);
    const harness = createHarness();
    const execution = await executeContractCase({
      caseRecord,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: new Map([['empty-scene', emptyDataset]]),
      clock: new ManualClock(),
    });

    expect(execution.status).toBe('completed');
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status }))).toEqual([
      { index: 0, type: 'set-host-state', status: 'completed' },
      { index: 1, type: 'set-host-state', status: 'completed' },
      { index: 2, type: 'load-scene', status: 'completed' },
      { index: 3, type: 'query-target', status: 'completed' },
      { index: 4, type: 'probe-declared-failure', status: 'completed' },
    ]);

    for (const actionIndex of [0, 1]) {
      expect(valueAt(execution, `actionResults.${actionIndex}.delta.actual.ownership`)).toEqual({
        owner: 'host',
        ownsUi: true,
      });
      expect(valueAt(execution, `actionResults.${actionIndex}.delta.actual.resources`)).toEqual({
        engineAllocationCount: 0,
        activeEngineCount: 0,
        canvasCount: 0,
      });
    }
    expect(valueAt(execution, 'actionResults.0.delta.actual.transition')).toEqual({ from: null, to: 'loading' });
    expect(valueAt(execution, 'actionResults.1.delta.actual.transition')).toEqual({
      from: 'loading',
      to: 'no-blueprint',
    });

    expect(harness.metadata.map(({ role, generation }) => ({ role, generation }))).toEqual([
      { role: 'main', generation: 1 },
      { role: 'declared-failure:CSM-003', generation: 2 },
    ]);
    expect(valueAt(execution, 'actionResults.2.delta.actual.result')).toMatchObject({
      lifecycle: 'ready-empty',
      sceneRevision: 1,
      rootIds: [],
    });
    expect(valueAt(execution, 'actionResults.2.delta.actual.snapshot')).toMatchObject({
      lifecycle: 'ready-empty',
      historyDepth: 0,
      rootIds: [],
      resources: { canvasCount: 1 },
    });
    expect(valueAt(execution, 'actionResults.3.delta.actual')).toMatchObject({
      target: { id: 'missing' },
      result: null,
      found: false,
    });
    expect(harness.engines[0]?.queryTargets).toEqual([{ id: 'missing' }]);

    expect(valueAt(execution, 'actionResults.4.delta.actual.diagnostic')).toMatchObject({
      code: 'DECLARED_FAILURE',
      id: 'priorSceneRevision',
      source: 'declared-host-injection',
    });
    expect(valueAt(execution, 'actionResults.4.delta.actual.rollback')).toMatchObject({
      priorSceneRevision: 0,
      historyDepth: 0,
      hostOwnsEmptyUi: true,
      sceneRevisionUnchanged: true,
      partialPublicationCount: 0,
    });

    expect(valueAt(execution.hostSeamDelta, '$schema')).toBe('core-v2-host-seam-delta/1');
    expect(valueAt(execution.hostSeamDelta, 'capabilityPassInherited')).toBe(false);
    expect(valueAt(execution.hostSeamDelta, 'actions')).toHaveLength(5);
    expect(valueAt(execution.hostSeamDelta, 'terminalHost')).toMatchObject({
      state: 'no-blueprint',
      owner: 'host',
      ownsUi: true,
      resources: { engineAllocationCount: 2, activeEngineCount: 1, canvasCount: 1 },
    });
    expect(execution.terminalSnapshot).toMatchObject({
      lifecycle: 'ready-empty',
      revisions: { sceneRevision: 1 },
      historyDepth: 0,
      selectionIds: [],
      mode: 'select',
      resources: { canvasCount: 1 },
    });

    expect(valueAt(execution.cleanup, 'status')).toBe('completed');
    expect(valueAt(execution.cleanup, 'releases')).toHaveLength(2);
    expect(valueAt(execution.cleanup, 'releases.0.remainingResources.canvasCount')).toBe(0);
    expect(valueAt(execution.cleanup, 'releases.1.remainingResources.canvasCount')).toBe(0);
    expect(harness.engines.every((engine) => engine.destroyCalls === 1)).toBe(true);
    expect(JSON.stringify(execution)).not.toContain('"status":"pass"');
    expect(JSON.stringify(caseRecord.actionTrace)).toBe(actionTraceBefore);
    expect(Object.isFrozen(emptyDataset)).toBe(true);
  });

  it('preflights every CSM-003 action kind before allocating an engine', async () => {
    const harness = createHarness();
    const handlerEntries = [
      ...createFoundationHandlerEntries(),
      ...createEmptyStateHandlerEntries(),
    ].filter(([handlerId]) => handlerId !== 'contract/query-target');

    await expect(executeContractCase({
      caseRecord: selectedCase('CSM-003'),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: new Map([['empty-scene', []]]),
      clock: new ManualClock(),
      handlerEntries,
    })).rejects.toThrow(/missing selected handlers: contract\/query-target/);
    expect(harness.engines).toHaveLength(0);
  });
});

function selectedCase(id: string): MaterializedCase {
  const record = selectCatalogCases(catalog, { caseIds: [id] })[0];
  if (!record) throw new Error(`missing approved case ${id}`);
  return materializeCase(record, { size: '100', seed: '319' });
}

interface EngineHarness {
  readonly engines: FakeEmptyStateEngine[];
  readonly metadata: EngineFactoryMetadata[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => FakeEmptyStateEngine;
}

function createHarness(): EngineHarness {
  const engines: FakeEmptyStateEngine[] = [];
  const metadata: EngineFactoryMetadata[] = [];
  return {
    engines,
    metadata,
    engineFactory: (factoryMetadata) => {
      metadata.push(structuredClone(factoryMetadata));
      const engine = new FakeEmptyStateEngine();
      engines.push(engine);
      return engine;
    },
  };
}

type Lifecycle = 'new' | 'ready-empty' | 'scene-ready' | 'destroyed';

class FakeEmptyStateEngine {
  public readonly queryTargets: Readonly<Record<string, unknown>>[] = [];
  public destroyCalls = 0;

  private lifecycle: Lifecycle = 'new';
  private lifecycleGeneration = 0;
  private sceneRevision = 0;
  private frameRevision = 0;
  private datasetRef: string | null = null;
  private semanticHash: string | null = null;
  private dataset: readonly Readonly<Record<string, unknown>>[] = [];
  private canvasCount = 0;

  public initialize(): Promise<Readonly<Record<string, unknown>>> {
    if (this.lifecycle === 'destroyed') throw new Error('destroyed');
    if (this.lifecycle === 'new') {
      this.lifecycle = 'ready-empty';
      this.lifecycleGeneration += 1;
      this.canvasCount = 1;
    }
    return Promise.resolve({
      lifecycle: this.lifecycle,
      revisions: this.revisions(),
      facilities: ['renderer', 'state'],
    });
  }

  public loadDataset(
    input: unknown,
    options: Readonly<{ datasetRef?: string }> = {},
  ): Readonly<Record<string, unknown>> {
    if (this.lifecycle === 'new') throw new Error('not ready');
    if (this.lifecycle === 'destroyed') throw new Error('destroyed');
    if (!Array.isArray(input)) throw new TypeError('dataset must be an array');
    this.dataset = structuredClone(input) as readonly Readonly<Record<string, unknown>>[];
    this.datasetRef = options.datasetRef ?? null;
    this.semanticHash = `fake:${JSON.stringify(this.dataset)}`;
    this.sceneRevision += 1;
    this.lifecycle = this.dataset.length === 0 ? 'ready-empty' : 'scene-ready';
    return {
      lifecycle: this.lifecycle,
      sceneRevision: this.sceneRevision,
      semanticHash: this.semanticHash,
      rootIds: this.rootIds(),
    };
  }

  public query(target: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | null {
    this.queryTargets.push(structuredClone(target));
    const id = target.id;
    return typeof id === 'string'
      ? this.dataset.find((record) => record.id === id) ?? null
      : null;
  }

  public publishFrame(): void {
    this.frameRevision += 1;
  }

  public snapshot(): Readonly<Record<string, unknown>> {
    return {
      lifecycle: this.lifecycle,
      revisions: this.revisions(),
      frameRevision: this.frameRevision,
      datasetRef: this.datasetRef,
      semanticHash: this.semanticHash,
      rootIds: this.rootIds(),
      historyDepth: 0,
      pendingWork: 0,
      selectionIds: [],
      mode: 'select',
      resources: {
        canvasCount: this.canvasCount,
        subscriptions: { active: 0, duplicates: 0 },
      },
    };
  }

  public destroy(): Promise<boolean> {
    if (this.lifecycle === 'destroyed') return Promise.resolve(false);
    this.destroyCalls += 1;
    this.lifecycle = 'destroyed';
    this.canvasCount = 0;
    this.dataset = [];
    this.datasetRef = null;
    this.semanticHash = null;
    return Promise.resolve(true);
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

class ManualClock implements ManualClockContract {
  private current = 0;

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.current) throw new Error(`manual clock moved backwards to ${timeMs}`);
    this.current = timeMs;
    return Promise.resolve();
  }

  public withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
