import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from './support/contract-verifier-import-firewall';

type JsonRecord = Record<string, unknown>;
type Handler = (context: unknown, action: unknown) => unknown;
type HandlerEntry = readonly [string, Handler];

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<JsonRecord>;
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
  readonly actionDefinitions: readonly Readonly<{ readonly type: string; readonly handlerId: string }>[];
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
    options: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface AssetRuntime {
  readonly ASSET_ACTION_TYPES: readonly string[];
  readonly ASSET_CASE_IDS: readonly string[];
  createAssetHandlerEntries(this: void, product: Readonly<JsonRecord>): readonly HandlerEntry[];
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: ExecutorCatalog['actionDefinitions'];
      engineFactory: (metadata: Readonly<JsonRecord>) => FakeEngine;
      datasets: ReadonlyMap<string, unknown>;
      clock: ManualClock;
      handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<JsonRecord>;
}

const [catalogRuntime, materializeRuntime, assetRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<AssetRuntime>('../../scripts/verification/core-v2-contract/handlers/assets.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { ASSET_ACTION_TYPES, ASSET_CASE_IDS, createAssetHandlerEntries } = assetRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('AST-001 actual-only asset handlers', () => {
  it('registers the exact five action types behind an import-free dependency firewall', async () => {
    const harness = createHarness();
    const entries = createAssetHandlerEntries(harness.product);
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/assets.mjs',
        import.meta.url,
      )),
      'utf8',
    );

    expect(ASSET_CASE_IDS).toEqual(['AST-001']);
    expect(ASSET_ACTION_TYPES).toEqual([
      'registerAssets',
      'initializeWithRequiredAssetFailure',
      'acquireAsset',
      'destroy',
      'registerAlias',
    ]);
    expect(entries.map(([handlerId]) => handlerId)).toEqual([
      'contract/registerAssets',
      'contract/initializeWithRequiredAssetFailure',
      'contract/acquireAsset',
      'contract/destroy',
      'contract/registerAlias',
    ]);
    await assertCommittedVerifierEntryImportFirewall('handlers/assets.mjs', 'handler');
    expect(source).not.toMatch(/node:|readFile|compareObservation|catalog-normalized/u);
    expect(source).not.toMatch(/expectedCode\s*(?:===|!==)/u);
  });

  it('records one shared resource, stage-specific leases, clean failure, and the actual closed-registry code', async () => {
    const plan = selectedCase();
    const before = JSON.stringify(plan);
    const harness = createHarness();
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: new Map(),
      clock: new ManualClock(),
      handlerEntries: createAssetHandlerEntries(harness.product),
    });

    expect(execution.status).toBe('completed');
    expect(execution.error).toBeNull();
    expect(actionResults(execution).map(({ index, type, status }) => ({ index, type, status })))
      .toEqual([
        { index: 0, type: 'registerAssets', status: 'completed' },
        { index: 1, type: 'registerAssets', status: 'completed' },
        { index: 2, type: 'initializeWithRequiredAssetFailure', status: 'completed' },
        { index: 3, type: 'acquireAsset', status: 'completed' },
        { index: 4, type: 'acquireAsset', status: 'completed' },
        { index: 5, type: 'destroy', status: 'completed' },
        { index: 6, type: 'destroy', status: 'completed' },
        { index: 7, type: 'registerAlias', status: 'completed' },
      ]);

    expect(actualAt(execution, 0, 'snapshot.lifecycle')).toBe('new');
    expect(actualAt(execution, 1, 'snapshot.revisions.lifecycleGeneration')).toBe(0);
    expect(actualAt(execution, 2, 'initState')).toBe('rejected');
    expect(actualAt(execution, 2, 'error.code')).toBe('ASSET_LOAD_FAILED');
    expect(actualAt(execution, 2, 'readyCount')).toBe(0);
    expect(actualAt(execution, 2, 'snapshot.resources.canvasCount')).toBe(0);
    expect(actualAt(execution, 2, 'probe.totals.pendingCount')).toBe(0);
    expect(actualAt(execution, 2, 'probe.selected.leaseCount')).toBe(0);
    expect(actualAt(execution, 4, 'probe.selected.resourceCount')).toBe(1);
    expect(actualAt(execution, 4, 'probe.selected.leaseCount')).toBe(2);
    expect(actualAt(execution, 3, 'probe.selected.cacheKey'))
      .toBe(actualAt(execution, 4, 'probe.selected.cacheKey'));
    expect(actualAt(execution, 3, 'probe.selected.resourceToken'))
      .toBe(actualAt(execution, 4, 'probe.selected.resourceToken'));
    expect(actualAt(execution, 5, 'probe.selected.leaseCount')).toBe(1);
    expect(actualAt(execution, 6, 'probe.selected.leaseCount')).toBe(0);
    expect(actualAt(execution, 6, 'probe.totals')).toEqual({
      resourceCount: 0,
      leaseCount: 0,
      pendingCount: 0,
    });
    expect(actualAt(execution, 7, 'settlement')).toBe('rejected');
    expect(actualAt(execution, 7, 'error.code')).toBe('CONFLICT');
    expect(actualAt(execution, 7, 'input.unchanged')).toBe(true);
    expect(valueAt(execution, 'cleanup.status')).toBe('completed');
    expect(valueAt(execution, 'cleanup.errors')).toEqual([]);
    expect(valueAt(execution, 'cleanup.releases')).toHaveLength(3);
    expect(harness.unloadCount).toBe(1);
    expect(harness.engines).toHaveLength(3);
    expect(harness.engines.every((engine) => engine.destroyed)).toBe(true);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('keeps actual product errors and fresh-run action evidence deterministic', async () => {
    const firstHarness = createHarness({ requiredFailureCode: 'ACTUAL_LOAD_CODE' });
    const secondHarness = createHarness({ requiredFailureCode: 'ACTUAL_LOAD_CODE' });
    const run = (harness: ReturnType<typeof createHarness>) => executeContractCase({
      caseRecord: selectedCase(),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: new Map(),
      clock: new ManualClock(),
      handlerEntries: createAssetHandlerEntries(harness.product),
    });
    const [first, second] = await Promise.all([run(firstHarness), run(secondHarness)]);

    expect(actualAt(first, 2, 'error.code')).toBe('ACTUAL_LOAD_CODE');
    expect(actualAt(first, 2, 'error.code')).not.toBe('ASSET_LOAD_FAILED');
    expect(actionResults(first).map(({ delta }) => delta.actual)).toEqual(
      actionResults(second).map(({ delta }) => delta.actual),
    );
  });

  it('allowlists failure diagnostics without retaining raw sources or credentials', async () => {
    const secretSource = 'data:image/png;base64,super-secret-token';
    const credentialUrl = 'https://user:password@assets.example.test/private.png?token=secret';
    const harness = createHarness({
      requiredFailureCode: 'ACTUAL_LOAD_CODE',
      requiredFailureMessage: `Failed ${credentialUrl} from ${secretSource}`,
      requiredFailureDiagnostic: {
        code: 'ACTUAL_LOAD_CODE',
        category: 'ASSET_FAILURE',
        retryable: true,
        operation: 'initialize',
        source: credentialUrl,
        token: 'secret',
      },
    });
    const execution = await executeContractCase({
      caseRecord: selectedCase(),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: new Map(),
      clock: new ManualClock(),
      handlerEntries: createAssetHandlerEntries(harness.product),
    });
    const error = actualAt(execution, 2, 'error') as JsonRecord;

    expect(error).toMatchObject({
      name: 'Error',
      code: 'ACTUAL_LOAD_CODE',
      category: 'ASSET_FAILURE',
      retryable: true,
      operation: 'initialize',
      message: 'Core v2 asset operation failed',
    });
    expect(error.fingerprint).toMatch(/^fnv1a64:/u);
    expect(error).not.toHaveProperty('diagnostic');
    expect(JSON.stringify(error)).not.toContain(secretSource);
    expect(JSON.stringify(error)).not.toContain(credentialUrl);
    expect(JSON.stringify(error)).not.toContain('password');
    expect(JSON.stringify(error)).not.toContain('token=secret');
  });

  it('fails fast when the injected product omits an observable command', () => {
    const product = { ...createHarness().product };
    delete product.inspectAssetState;
    expect(() => createAssetHandlerEntries(product)).toThrow(/inspectAssetState/u);
  });
});

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['AST-001'] })[0];
  if (selected === undefined) throw new Error('Missing AST-001 case');
  return materializeCase(selected, { size: '100', seed: '319' });
}

function actionResults(execution: JsonRecord): readonly Readonly<{
  readonly index: number;
  readonly type: string;
  readonly status: string;
  readonly delta: Readonly<{ readonly actual: JsonRecord }>;
}>[] {
  return execution.actionResults as ReturnType<typeof actionResults>;
}

function actualAt(execution: JsonRecord, actionIndex: number, path: string): unknown {
  return valueAt(actionResults(execution)[actionIndex]?.delta.actual, path);
}

function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (
    current !== null && typeof current === 'object'
      ? (current as JsonRecord)[key]
      : undefined
  ), value);
}

function createHarness(options: Readonly<{
  readonly requiredFailureCode?: string;
  readonly requiredFailureMessage?: string;
  readonly requiredFailureDiagnostic?: JsonRecord;
}> = {}) {
  const engines: FakeEngine[] = [];
  const owners = new Map<FakeEngine, { readonly instanceId: string; readonly leases: Set<string> }>();
  const registered = new Map<string, JsonRecord>();
  const resources = new Map<string, { readonly cacheKey: string; readonly token: string }>();
  let unloadCount = 0;
  const imageAliases = ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'];
  const fontWeights = [300, 400, 500, 600, 700];

  const releaseOwner = (engine: FakeEngine) => {
    const owner = owners.get(engine);
    if (owner === undefined) return;
    owners.delete(engine);
    for (const alias of owner.leases) {
      const stillLeased = [...owners.values()].some((candidate) => candidate.leases.has(alias));
      if (!stillLeased && resources.delete(alias)) unloadCount += 1;
    }
  };

  const product: JsonRecord = {
    registerAssets(engineValue: unknown, inputValue: unknown) {
      const engine = requireEngine(engineValue);
      const input = requireRecord(inputValue, 'register input');
      const instanceId = requireString(input.instanceId, 'register instance');
      const aliases = input.aliases as readonly string[];
      owners.set(engine, { instanceId, leases: new Set() });
      for (const alias of aliases) {
        if (alias.startsWith('FiraCode-')) continue;
        const descriptor = { src: `builtin://${alias}` };
        const prior = registered.get(alias);
        if (prior === undefined) registered.set(alias, descriptor);
      }
      engine.on('destroyed', () => releaseOwner(engine));
      return { instanceId, registration: 'accepted' };
    },
    initializeWithRequiredAssetFailure(_engineValue: unknown, inputValue: unknown): never {
      const input = requireRecord(inputValue, 'required input');
      const error = new Error(
        options.requiredFailureMessage ?? `Failed ${requireString(input.alias, 'required alias')}`,
      ) as Error & { code: string; diagnostic?: JsonRecord };
      error.code = options.requiredFailureCode ?? 'ASSET_LOAD_FAILED';
      if (options.requiredFailureDiagnostic !== undefined) {
        error.diagnostic = structuredClone(options.requiredFailureDiagnostic);
      }
      throw error;
    },
    acquireAsset(engineValue: unknown, inputValue: unknown) {
      const engine = requireEngine(engineValue);
      const input = requireRecord(inputValue, 'acquire input');
      const alias = requireString(input.alias, 'acquire alias');
      const owner = owners.get(engine);
      if (owner === undefined) throw new Error('Missing asset owner');
      owner.leases.add(alias);
      if (!resources.has(alias)) {
        resources.set(alias, { cacheKey: `cache:${alias}`, token: `resource:${alias}` });
      }
      return { alias, cacheKey: resources.get(alias)?.cacheKey };
    },
    registerAlias(inputValue: unknown) {
      const input = requireRecord(inputValue, 'alias input');
      const alias = requireString(input.alias, 'alias');
      const descriptor = structuredClone(requireRecord(input.descriptor, 'descriptor'));
      const prior = registered.get(alias);
      if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(descriptor)) {
        const error = new Error(`Closed alias ${alias}`) as Error & { code: string };
        error.code = 'CONFLICT';
        throw error;
      }
      registered.set(alias, descriptor);
      return { alias, registration: prior === undefined ? 'created' : 'duplicate' };
    },
    inspectAssetState(inputValue: unknown) {
      const input = requireRecord(inputValue, 'probe input');
      const alias = input.alias === null ? null : requireString(input.alias, 'probe alias');
      const resource = alias === null ? undefined : resources.get(alias);
      const leaseCount = alias === null
        ? 0
        : [...owners.values()].filter((owner) => owner.leases.has(alias)).length;
      return {
        catalog: { imageAliases: [...imageAliases], fontWeights: [...fontWeights] },
        selected: {
          alias,
          cacheKey: resource?.cacheKey ?? null,
          resourceToken: resource?.token ?? null,
          resourceCount: resource === undefined ? 0 : 1,
          leaseCount,
          pendingUserCount: 0,
        },
        totals: {
          resourceCount: resources.size,
          leaseCount: [...owners.values()].reduce((sum, owner) => sum + owner.leases.size, 0),
          pendingCount: 0,
        },
      };
    },
  };

  return {
    engines,
    product,
    get unloadCount() {
      return unloadCount;
    },
    engineFactory: () => {
      const engine = new FakeEngine();
      engines.push(engine);
      return engine;
    },
  };
}

class FakeEngine {
  public destroyed = false;
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  public on(event: string, listener: (payload: unknown) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  public initialize(): Promise<JsonRecord> {
    return Promise.resolve({ lifecycle: 'ready-empty' });
  }

  public loadDataset(): JsonRecord {
    return { status: 'committed' };
  }

  public publishFrame(): Promise<JsonRecord> {
    return Promise.resolve({ status: 'published' });
  }

  public snapshot(): JsonRecord {
    const active = [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
    return {
      lifecycle: this.destroyed ? 'destroyed' : 'new',
      revisions: { lifecycleGeneration: 0, sceneRevision: 0 },
      frameRevision: 0,
      resources: { canvasCount: 0, subscriptions: { active } },
      pendingWork: 0,
    };
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    for (const listener of [...(this.listeners.get('destroyed') ?? [])]) {
      listener({ generation: 0 });
    }
    this.listeners.clear();
    return Promise.resolve(true);
  }
}

class ManualClock {
  public now(): number {
    return 0;
  }

  public advanceTo(): Promise<void> {
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return promise;
  }
}

function requireEngine(value: unknown): FakeEngine {
  if (!(value instanceof FakeEngine)) throw new Error('Unexpected engine');
  return value;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a record`);
  }
  return value as JsonRecord;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a string`);
  return value;
}
