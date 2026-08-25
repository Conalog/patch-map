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
  readonly actionDefinitions: readonly Readonly<{ readonly type: string }> [];
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

interface HandlerRuntime {
  readonly RENDER_IMAGES_HANDLER_REVISION: string;
  createRenderImageHandlerEntries(
    this: void,
    product: Readonly<JsonRecord>,
  ): readonly HandlerEntry[];
}

interface ClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface CaseExecution extends JsonRecord {
  readonly status: string;
  readonly error: unknown;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly status: string;
    readonly delta: Readonly<{ readonly actual: JsonRecord }>;
  }>[];
  readonly captures: readonly unknown[];
  readonly datasetObservations: Readonly<Record<string, JsonRecord>>;
  readonly cleanup: Readonly<{ readonly status: string; readonly errors: readonly unknown[] }>;
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: ExecutorCatalog['actionDefinitions'];
      engineFactory: () => FakeImageEngine;
      datasets: ReadonlyMap<string, unknown>;
      clock: ClockContract;
      handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<CaseExecution>;
}

const [catalogRuntime, materializeRuntime, handlerRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/patch-map-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/patch-map-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/patch-map-contract/handlers/render-images.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/patch-map-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { RENDER_IMAGES_HANDLER_REVISION, createRenderImageHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap REN-005 render-images actual-only handlers', () => {
  it('registers the exact four browser-safe handlers behind an answer-evidence firewall', async () => {
    const harness = createHarness();
    const entries = createRenderImageHandlerEntries(harness.product);
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-contract/handlers/render-images.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_IMAGES_HANDLER_REVISION).toBe('patch-map-render-images-handlers/1');
    expect(entries.map(([handlerId]) => handlerId)).toEqual([
      'contract/loadDataset',
      'contract/resolveAsset',
      'contract/replaceSource',
      'contract/completeAsset',
    ]);
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/\.expected\b/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('handlers/render-images.mjs', 'handler');
    expect(source).toContain("call(engine, 'patch'");
    expect(source).toContain("callSync(engine, 'sceneImageProbe'");
    expect(source).toContain("callSync(engine, 'hitTest'");
  });

  it('rejects action-trace drift before allocating an Engine', async () => {
    const plan = selectedCase();
    const harness = createHarness();
    const entry = createRenderImageHandlerEntries(harness.product)[0];
    if (entry === undefined) throw new Error('Missing REN-005 loadDataset handler');

    await expect(entry[1]({
      caseId: 'REN-005',
      actionIndex: 0,
      fixtureParams: plan.fixture.setup.params,
      signal: new AbortController().signal,
      clock: new ManualClock(),
      ensureMainEngine: () => Promise.reject(new Error('must not initialize')),
      resolveDataset: () => Promise.reject(new Error('must not resolve')),
      fingerprint: () => 'unused',
    }, {
      index: 0,
      type: 'loadDataset',
      operands: { datasetId: 'nearby-image-dataset' },
    })).rejects.toThrow(/action 0 operands/u);

    expect(harness.engines).toHaveLength(0);
  });

  it('preserves input while a replaced descriptor discards its controlled late completion', async () => {
    const plan = selectedCase();
    const planBefore = JSON.stringify(plan);
    const harness = createHarness(plan.fixture.setup.params.images);
    const datasetBefore = JSON.stringify(harness.sourceDataset);
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: new Map([['image-specimens', harness.sourceDataset]]),
      clock: new ManualClock(),
      handlerEntries: createRenderImageHandlerEntries(harness.product),
    });

    expect(execution.status).toBe('completed');
    expect(execution.error).toBeNull();
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual([
        'loadDataset',
        'resolveAsset',
        'replaceSource',
        'completeAsset',
      ].map((type, index) => ({ index, type, status: 'completed' })));

    expect(actualAt(execution, 0)).toMatchObject({
      datasetId: 'image-specimens',
      input: { unchanged: true },
    });
    expect(actualAt(execution, 1)).toMatchObject({
      targetId: 'descriptor',
      requestId: 'old',
      completeAtMs: 100,
      request: { state: 'pending', attached: false },
    });
    expect(actualAt(execution, 2)).toMatchObject({
      targetId: 'descriptor',
      source: 'fixture-image',
      timeMs: 20,
      mutation: { status: 'committed', changed: true },
      after: {
        imageProbe: {
          images: {
            descriptor: {
              authoredSource: 'fixture-image',
              staleAttachCount: 0,
              initial: { state: 'pending' },
            },
          },
        },
      },
    });
    expect(actualAt(execution, 3)).toMatchObject({
      requestId: 'old',
      timeMs: 100,
      completion: { state: 'stale-discarded', attached: false },
      product: {
        imageProbe: {
          images: {
            descriptor: {
              authoredSource: 'fixture-image',
              staleAttachCount: 0,
              initial: {
                authoredSource: {
                  src: 'https://assets.example.test/image.svg',
                  data: { resolution: 2 },
                },
                state: 'resolved',
              },
            },
          },
          abandonedRequests: {
            pendingCount: 0,
            leaseCount: 0,
            resourceCount: 0,
          },
        },
        requests: {
          pendingCount: 0,
          completedCount: 1,
          staleCompletionCount: 1,
          attachedCount: 0,
        },
      },
    });
    expect(execution.captures).toEqual([{
      id: 'images',
      phase: 'after-action',
      afterActionIndex: 3,
      values: { 'descriptor/worldBounds': [0, 0, 32, 32] },
    }]);
    expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(execution.datasetObservations['image-specimens']).toMatchObject({ unchanged: true });
    expect(harness.engines).toHaveLength(1);
    expect(harness.engines[0]).toMatchObject({ destroyed: true });
    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(harness.sourceDataset)).toBe(datasetBefore);
  });

  it('does not synthesize approved values when the product reports a different resource fact', async () => {
    const plan = selectedCase();
    const harness = createHarness(plan.fixture.setup.params.images, {
      aliasResourceIdentity: 'actual-decoder-resource@7',
    });
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: new Map([['image-specimens', harness.sourceDataset]]),
      clock: new ManualClock(),
      handlerEntries: createRenderImageHandlerEntries(harness.product),
    });

    expect(valueAt(actualAt(execution, 3), [
      'product',
      'imageProbe',
      'images',
      'alias',
      'normalizedResourceIdentity',
    ])).toBe('actual-decoder-resource@7');
  });
});

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['REN-005'] })[0];
  if (selected === undefined) throw new Error('Missing approved REN-005 case');
  return materializeCase(selected, { size: '100', seed: '319' });
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const actual = execution.actionResults[index]?.delta.actual;
  if (actual === undefined) throw new Error(`Missing REN-005 action ${index}`);
  return actual;
}

function valueAt(root: unknown, path: readonly string[]): unknown {
  let cursor = root;
  for (const segment of path) {
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function createHarness(
  fixtureImages: unknown = defaultFixtureImages(),
  options: Readonly<{ readonly aliasResourceIdentity?: string }> = {},
) {
  const sourceDataset = structuredClone(fixtureImages);
  const engines: FakeImageEngine[] = [];
  const requests = new Map<string, {
    readonly targetId: string;
    state: 'pending' | 'stale-discarded';
    attached: boolean;
  }>();
  let currentDescriptorSource: unknown = {
    src: 'https://assets.example.test/image.svg',
    data: { resolution: 2 },
  };
  let initialDescriptorState: 'pending' | 'resolved' = 'pending';
  let staleCompletionCount = 0;

  const product: JsonRecord = {
    registerFixtureAssets(engineValue: unknown) {
      if (!(engineValue instanceof FakeImageEngine)) throw new Error('Unexpected image engine');
      return { registeredAliases: ['fixture-image'], failureFixtures: ['failed-image'] };
    },
    settleImmediateAssets() {
      return Promise.resolve({ settled: true });
    },
    bindControlledRequest(inputValue: unknown) {
      const input = requireRecord(inputValue, 'controlled request');
      const requestId = requireString(input.requestId, 'request ID');
      const targetId = requireString(input.targetId, 'request target');
      const request = { targetId, state: 'pending' as const, attached: false };
      requests.set(requestId, request);
      return { requestId, targetId, state: request.state, attached: request.attached };
    },
    completeControlledRequest(inputValue: unknown) {
      const input = requireRecord(inputValue, 'controlled completion');
      const requestId = requireString(input.requestId, 'completion request ID');
      const request = requests.get(requestId);
      if (request === undefined) throw new Error(`Missing controlled request ${requestId}`);
      request.state = 'stale-discarded';
      request.attached = false;
      initialDescriptorState = 'resolved';
      staleCompletionCount += 1;
      return { requestId, state: request.state, attached: request.attached };
    },
    requestProbe() {
      const values = [...requests.values()];
      return {
        pendingCount: values.filter(({ state }) => state === 'pending').length,
        completedCount: values.filter(({ state }) => state === 'stale-discarded').length,
        staleCompletionCount,
        attachedCount: values.filter(({ attached }) => attached).length,
      };
    },
  };

  const engineFactory = () => {
    const engine = new FakeImageEngine({
      imageProbe: () => imageProbe({
        currentDescriptorSource,
        initialDescriptorState,
        aliasResourceIdentity: options.aliasResourceIdentity ?? 'fixture-image@1',
        pendingCount: [...requests.values()].filter(({ state }) => state === 'pending').length,
      }),
      replaceDescriptorSource(source) {
        currentDescriptorSource = structuredClone(source);
      },
    });
    engines.push(engine);
    return engine;
  };

  return { sourceDataset, engines, product, engineFactory };
}

class FakeImageEngine {
  public destroyed = false;

  private readonly listeners = new Map<string, Set<(actual: unknown) => void>>();
  private readonly observation: Readonly<{
    imageProbe(): JsonRecord;
    replaceDescriptorSource(source: unknown): void;
  }>;
  private lifecycle = 'new';
  private sceneRevision = 0;
  private frameRevision = 0;
  private dataset: unknown[] = [];

  public constructor(observation: Readonly<{
    imageProbe(): JsonRecord;
    replaceDescriptorSource(source: unknown): void;
  }>) {
    this.observation = observation;
  }

  public on(event: string, listener: (actual: unknown) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  public initialize(_options: unknown): Promise<void> {
    this.lifecycle = 'ready-empty';
    this.emit('ready', { lifecycle: this.lifecycle });
    return Promise.resolve();
  }

  public loadDataset(dataset: unknown): Readonly<JsonRecord> {
    if (!Array.isArray(dataset)) throw new Error('Image fixture dataset must be an array');
    this.dataset = structuredClone(dataset);
    this.lifecycle = 'scene-ready';
    this.sceneRevision += 1;
    this.emit('sceneCommitted', { sceneRevision: this.sceneRevision });
    return { status: 'committed', entityCount: this.dataset.length };
  }

  public patch(targetValue: unknown, changesValue: unknown): Readonly<JsonRecord> {
    const target = requireRecord(targetValue, 'patch target');
    const changes = requireRecord(changesValue, 'patch changes');
    const id = requireString(target.id, 'patch target ID');
    const entity = this.dataset.find((candidate) => isRecord(candidate) && candidate.id === id);
    if (!isRecord(entity)) throw new Error(`Missing image ${id}`);
    entity.source = structuredClone(changes.source);
    this.observation.replaceDescriptorSource(changes.source);
    this.sceneRevision += 1;
    return { status: 'committed', changed: true, sceneRevision: this.sceneRevision };
  }

  public publishFrame(_timeMs: number): void {
    this.frameRevision += 1;
    this.emit('frame', { frameRevision: this.frameRevision });
  }

  public snapshot(): JsonRecord {
    const active = [...this.listeners.values()].reduce((total, listeners) => (
      total + listeners.size
    ), 0);
    return {
      lifecycle: this.lifecycle,
      revisions: {
        sceneRevision: this.sceneRevision,
        viewRevision: 0,
        interactionRevision: 0,
      },
      frameRevision: this.frameRevision,
      publishedTuple: {
        sceneRevision: this.sceneRevision,
        viewRevision: 0,
        interactionRevision: 0,
        frameRevision: this.frameRevision,
      },
      resources: {
        canvasCount: this.destroyed || this.lifecycle === 'new' ? 0 : 1,
        subscriptions: { active },
        rendering: { commandCount: this.destroyed ? 0 : 6 },
      },
      pendingWork: 0,
    };
  }

  public semanticProbe(): JsonRecord {
    return {
      lifecycle: this.lifecycle,
      geometry: { finiteValueCount: 56 },
      interaction: { activeGestureCount: 0 },
      history: { depth: 0 },
    };
  }

  public geometryProbe(): JsonRecord {
    return {
      entities: IMAGE_GEOMETRY.map(([id, worldBounds]) => ({
        id,
        kind: 'image',
        worldBounds: [...worldBounds],
      })),
    };
  }

  public sceneImageProbe(): JsonRecord {
    return this.observation.imageProbe();
  }

  public exportDataset(): unknown[] {
    return structuredClone(this.dataset);
  }

  public hitTest(pointValue: unknown): string | null {
    const point = requireRecord(pointValue, 'hit point');
    if (point.x === 236 && point.y === 56) return 'failed-image';
    return null;
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.lifecycle = 'destroyed';
    this.emit('destroyed', { lifecycle: this.lifecycle });
    this.listeners.clear();
    return Promise.resolve(true);
  }

  private emit(event: string, actual: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(actual);
  }
}

const IMAGE_GEOMETRY = [
  ['alias', [0, 0, 80, 40]],
  ['url', [0, 0, 64, 32]],
  ['descriptor', [0, 0, 32, 32]],
  ['data-uri', [100, 120, 16, 8]],
  ['transformed', [145, 115, 10, 20]],
  ['hidden-image', [180, 120, 20, 10]],
  ['failed-image', [220, 40, 32, 32]],
] as const;

function imageProbe(options: Readonly<{
  readonly currentDescriptorSource: unknown;
  readonly initialDescriptorState: 'pending' | 'resolved';
  readonly aliasResourceIdentity: string;
  readonly pendingCount: number;
}>): JsonRecord {
  return {
    images: {
      alias: {
        authoredSource: 'fixture-image',
        normalizedResourceIdentity: options.aliasResourceIdentity,
        cacheIdentity: 'alias:fixture-image',
        state: 'resolved',
      },
      url: {
        authoredSource: 'https://assets.example.test/image.png',
        normalizedResourceIdentity: 'fixture-url-image-64x32@1',
        cacheIdentity: 'url:https://assets.example.test/image.png',
        state: 'resolved',
      },
      descriptor: {
        authoredSource: structuredClone(options.currentDescriptorSource),
        staleAttachCount: 0,
        hitBounds: [0, 0, 32, 32],
        initial: {
          authoredSource: {
            src: 'https://assets.example.test/image.svg',
            data: { resolution: 2 },
          },
          normalizedResourceIdentity: 'fixture-svg-image@resolution-2',
          cacheIdentity: 'descriptor:https://assets.example.test/image.svg?resolution=2',
          state: options.initialDescriptorState,
        },
      },
      'data-uri': {
        authoredSourceKind: 'data-uri',
        sourceKind: 'data-uri',
        normalizedResourceIdentity: 'fixture-data-uri-svg-16x8@1',
        cacheIdentity: 'data-uri:fixture-data-uri-svg-16x8',
        state: 'resolved',
        opacity: 0.5,
        zIndex: 3,
      },
      transformed: {
        authoredSource: 'fixture-image',
        normalizedResourceIdentity: options.aliasResourceIdentity,
        cacheIdentity: 'alias:fixture-image',
        reusedResolvedResource: true,
        state: 'resolved',
        zIndex: 4,
      },
      'hidden-image': {
        renderObjectCount: 0,
        opacity: 0.25,
      },
      'failed-image': {
        role: 'asset-placeholder',
        diagnosticCount: 1,
      },
    },
    abandonedRequests: {
      pendingCount: options.pendingCount,
      leaseCount: 0,
      resourceCount: 0,
    },
  };
}

function defaultFixtureImages(): readonly JsonRecord[] {
  return IMAGE_GEOMETRY.map(([id, bounds]) => ({
    id,
    source: id === 'descriptor'
      ? { src: 'https://assets.example.test/image.svg', data: { resolution: 2 } }
      : 'fixture-image',
    size: [bounds[2], bounds[3]],
  }));
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class ManualClock implements ClockContract {
  private time = 0;

  public now(): number { return this.time; }

  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.time) throw new Error('Clock cannot move backwards');
    this.time = timeMs;
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}
