import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  materializeCoreV2Dataset,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
} from '../../src/core-v2';

type JsonRecord = Record<string, unknown>;
type Handler = (context: unknown, action: unknown) => unknown;
type HandlerEntry = readonly [string, Handler];

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<JsonRecord>;
}

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
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

interface CaseExecution {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly status: string;
    readonly delta: Readonly<{ readonly actual: JsonRecord }>;
  }>[];
  readonly eventJournal: readonly Readonly<{ readonly event: string }>[];
  readonly eventJournalFailures: readonly unknown[];
  readonly terminalSnapshot: unknown;
  readonly cleanup: Readonly<{ readonly status: string; readonly releases: readonly unknown[] }>;
  readonly error: unknown;
}

interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
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
    options: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface HandlerRuntime {
  readonly DATA_CLOSURE_ACTION_TYPES: readonly string[];
  createDataClosureHandlerEntries(
    this: void,
    product: Readonly<JsonRecord>,
  ): readonly HandlerEntry[];
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: readonly ActionDefinition[];
      engineFactory: (metadata: Readonly<JsonRecord>) => CoreV2Engine;
      datasets: ReadonlyMap<string, unknown>;
      clock: ManualClockContract;
      handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<CaseExecution>;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, handlerRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/data-closure.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { DATA_CLOSURE_ACTION_TYPES, createDataClosureHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('Core v2 data-closure actual-only handlers', () => {
  it('registers the exact browser-safe action surface behind the dependency firewall', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/data-closure.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');
    const entries = createDataClosureHandlerEntries(productAdapter());

    expect(DATA_CLOSURE_ACTION_TYPES).toEqual([
      'ingestLegacyRoot',
      'snapshot',
      'loadDataset',
      'select',
      'applyInvalidCases',
      'query',
      'loadFreshSessions',
      'validateDuplicateIdentityMatrix',
      'retainTarget',
      'remove',
      'add',
      'patchStaleTarget',
    ]);
    expect(entries.map(([handlerId]) => handlerId)).toEqual(
      DATA_CLOSURE_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it('observes unsupported legacy roots without synthesizing a canonical conversion', async () => {
    const { execution, engines, surfaces } = await runCase('DAT-006');

    expectCompleted(execution, [
      'ingestLegacyRoot',
      'snapshot',
      'loadDataset',
      'snapshot',
      'ingestLegacyRoot',
    ]);
    expect(actualAt(execution, 0, 'accepted')).toBe(false);
    expect(actualAt(execution, 0, 'canonical')).toBeNull();
    expect(actualAt(execution, 0, 'diagnostic.code')).toBe('INVALID_VALUE');
    expect(actualAt(execution, 0, 'diagnostic.datasetPath')).toBe('$');
    expect(actualAt(execution, 0, 'inputObservation.unchanged')).toBe(true);
    expect(actualAt(execution, 2, 'canonical.0.id')).toBe('legacy-a');
    expect(actualAt(execution, 2, 'sceneRevision')).toBe(1);
    expect(actualAt(execution, 4, 'diagnostic.code')).toBe('INVALID_VALUE');
    expect(actualAt(execution, 4, 'diagnostic.datasetPath')).toBe('$');
    expect(engines).toHaveLength(1);
    expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
  });

  it('rejects the complete DAT-007 invalid matrix without partial publication', async () => {
    const { execution } = await runCase('DAT-007');

    expectCompleted(execution, ['loadDataset', 'select', 'applyInvalidCases', 'query']);
    expect(execution.eventJournal.filter(({ event }) => event === 'drawComplete')).toHaveLength(1);
    expect(actualAt(execution, 2, 'count')).toBe(10);
    expect(actualAt(execution, 2, 'pathAwareCount')).toBe(10);
    expect(actualAt(execution, 2, 'acceptedCount')).toBe(0);
    expect(actualAt(execution, 2, 'partialPublicationCount')).toBe(0);
    expect(actualAt(execution, 2, 'results.5.id')).toBe('bad-color');
    expect(actualAt(execution, 2, 'results.5.applied')).toBe(false);
    expect(actualAt(execution, 2, 'results.5.diagnostic.code')).toBe('INVALID_VALUE');
    expect(actualAt(execution, 2, 'results.5.diagnostic.datasetPath')).toBe('$[0].fill');
    expect(actualAt(execution, 2, 'results.9.diagnostic.code')).toBe('INVALID_VALUE');
    expect(actualAt(execution, 2, 'results.9.diagnostic.datasetPath')).toBe('$[0].attrs');
    expect(actualAt(execution, 3, 'value.id')).toBe('rect-b');
    expect(actualAt(execution, 3, 'snapshot.revisions.sceneRevision')).toBe(1);
    expect(actualAt(execution, 3, 'snapshot.selectionIds')).toEqual(['rect-b']);
  });

  it('records deterministic product identity while exposing unsupported mutation semantics', async () => {
    await expect(runCase('DAT-008')).rejects.toThrow(/retainTarget binding operand as/u);
    const { execution, engines } = await runDirectData008();

    expectCompleted(execution, [
      'loadFreshSessions',
      'validateDuplicateIdentityMatrix',
      'retainTarget',
      'remove',
      'add',
      'patchStaleTarget',
    ]);
    expect(engines).toHaveLength(5);
    expect(actualAt(execution, 0, 'generatedIdsStable')).toBe(true);
    expect(actualAt(execution, 0, 'equalZOrder')).toEqual([
      'explicit-a',
      '@element:$[1]',
      'duplicate',
    ]);
    const hashes = actualAt(execution, 0, 'semanticHashes');
    expect(hashes).toEqual(Array(5).fill((hashes as readonly string[])[0]));
    expect((hashes as readonly string[])[0]).toMatch(/^fnv1a64:[a-f0-9]{16}$/u);
    expect(actualAt(execution, 1, 'element.code')).toBe('INVALID_VALUE');
    expect(actualAt(execution, 1, 'component.code')).toBe('INVALID_VALUE');
    expect(actualAt(execution, 1, 'authoritativeSceneUnchanged')).toBe(true);
    expect(actualAt(execution, 3, 'supported')).toBe(false);
    expect(actualAt(execution, 4, 'supported')).toBe(false);
    expect(actualAt(execution, 4, 'replacement.id')).toBe('explicit-a');
    expect(actualAt(execution, 4, 'replacement.attrs.x')).toEqual({ _availability: 'missing' });
    expect(actualAt(execution, 5, 'diagnostic.code')).toBe('UNSUPPORTED_OPERATION');
    expect(actualAt(execution, 5, 'staleByIdentity')).toBe(false);
  });
});

async function runDirectData008(): Promise<{
  execution: CaseExecution;
  engines: CoreV2Engine[];
}> {
  const plan = selectedCase('DAT-008');
  const engines: CoreV2Engine[] = [];
  const datasetMap = datasets();
  const clock = new ManualClock();
  const entries = new Map(createDataClosureHandlerEntries(productAdapter()));
  const resolveDataset = (reference: string): Promise<unknown> => {
    if (!datasetMap.has(reference)) throw new Error(`Missing dataset ${reference}`);
    return Promise.resolve(structuredClone(datasetMap.get(reference)));
  };
  const context = Object.freeze({
    caseId: plan.id,
    caseType: plan.caseType,
    fixtureParams: plan.fixture.setup.params,
    routeParams: plan.routeParams,
    clock,
    signal: new AbortController().signal,
    ensureMainEngine: () => Promise.reject(new Error('DAT-008 does not use a main engine')),
    ensureSessionEngine: (_session: number) => {
      const engine = new CoreV2Engine({
        surfaceFactory: (options) => Promise.resolve(new TestSurface(options)),
      });
      engines.push(engine);
      return Promise.resolve(engine);
    },
    resolveDataset,
    fingerprint,
  });
  const actionResults = [];
  for (const action of plan.actionTrace) {
    const handler = entries.get(`contract/${action.type}`);
    if (handler === undefined) throw new Error(`Missing handler ${action.type}`);
    const output = await handler(context, action) as Readonly<{ actual: JsonRecord }>;
    actionResults.push({
      index: action.index,
      type: action.type,
      status: 'completed',
      delta: { actual: output.actual },
    });
  }
  await Promise.all(engines.map((engine) => engine.destroy()));
  return {
    execution: {
      caseId: plan.id,
      status: 'completed',
      actionResults,
      eventJournal: [],
      eventJournalFailures: [],
      terminalSnapshot: null,
      cleanup: { status: 'completed', releases: [] },
      error: null,
    },
    engines,
  };
}

async function runCase(caseId: string): Promise<{
  execution: CaseExecution;
  engines: CoreV2Engine[];
  surfaces: TestSurface[];
}> {
  const plan = selectedCase(caseId);
  const before = JSON.stringify(plan);
  const engines: CoreV2Engine[] = [];
  const surfaces: TestSurface[] = [];
  const execution = await executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory() {
      const engine = new CoreV2Engine({
        surfaceFactory: (options) => {
          const surface = new TestSurface(options);
          surfaces.push(surface);
          return Promise.resolve(surface);
        },
      });
      engines.push(engine);
      return engine;
    },
    datasets: datasets(),
    clock: new ManualClock(),
    handlerEntries: createDataClosureHandlerEntries(productAdapter()),
  });
  expect(JSON.stringify(plan)).toBe(before);
  return { execution, engines, surfaces };
}

function selectedCase(id: string): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [id] })[0];
  if (selected === undefined) throw new Error(`Missing approved case ${id}`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function productAdapter(): Readonly<JsonRecord> {
  return Object.freeze({ materializeDataset: materializeCoreV2Dataset });
}

function datasets(): ReadonlyMap<string, unknown> {
  const profiles = fixtureProfiles.datasets as Readonly<Record<string, unknown>>;
  const interactive = profiles['interactive-scene'];
  const identity = profiles['identity-order'];
  if (interactive === undefined || identity === undefined) throw new Error('Missing dataset profiles');
  return new Map([
    ['interactive-scene', structuredClone(interactive)],
    ['identity-order', structuredClone(identity)],
  ]);
}

function expectCompleted(execution: CaseExecution, types: readonly string[]): void {
  expect(execution.status).toBe('completed');
  expect(execution.error).toBeNull();
  expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
    .toEqual(types.map((type, index) => ({ index, type, status: 'completed' })));
  expect(execution.eventJournalFailures).toEqual([]);
  expect(execution.cleanup.status).toBe('completed');
}

function actualAt(execution: CaseExecution, actionIndex: number, path: string): unknown {
  let cursor: unknown = execution.actionResults[actionIndex]?.delta.actual;
  for (const segment of path.split('.')) {
    if ((!isRecord(cursor) && !Array.isArray(cursor)) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`Missing action ${actionIndex} path ${path}`);
    }
    cursor = Reflect.get(cursor, segment) as unknown;
  }
  return cursor;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key: string, nested: unknown): unknown => (
    isRecord(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)))
      : nested
  ));
}

class TestSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  readonly #width: number;
  readonly #height: number;
  readonly #pixelRatio: number;
  #rootIds = new Set<string>();
  #selectionIds: readonly string[] = [];

  public constructor(options: CoreV2SurfaceOptions) {
    this.#width = options.width;
    this.#height = options.height;
    this.#pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    const values = Array.isArray(input) ? input : [];
    this.#rootIds = new Set(values.flatMap((value) => (
      isRecord(value) && typeof value.id === 'string' ? [value.id] : []
    )));
    this.#selectionIds = [];
  }

  public publishFrame(_timeMs: number): void {}

  public resize(_width: number, _height: number, _pixelRatio: number): boolean {
    return false;
  }

  public setView(_view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {}

  public select(ids: readonly string[]): void {
    this.#selectionIds = Object.freeze(ids.filter((id) => this.#rootIds.has(id)));
  }

  public hitTestScreen(_point: CoreV2Point): string | null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return point;
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.#width, this.#height] as const),
      backingSize: Object.freeze([
        this.#width * this.#pixelRatio,
        this.#height * this.#pixelRatio,
      ] as const),
      selectionIds: this.#selectionIds,
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

class ManualClock implements ManualClockContract {
  #time = 0;

  public now(): number {
    return this.#time;
  }

  public async advanceTo(timeMs: number): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < this.#time) throw new Error(`Invalid time ${timeMs}`);
    this.#time = timeMs;
    await Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}
