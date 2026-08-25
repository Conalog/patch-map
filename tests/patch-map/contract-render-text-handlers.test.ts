import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../contracts/patch-map/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from './support/contract-verifier-import-firewall';

import { createPatchMapRenderTextSpecimens } from '../../lab/patch-map/contract/render-text-fixtures';

type JsonRecord = Record<string, unknown>;
type HandlerEntry = readonly [string, (context: unknown, action: unknown) => unknown];

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
  actionTrace: ContractAction[];
  fixture: {
    setup: { params: JsonRecord };
    actionTrace: ContractAction[];
    captureCheckpoints: unknown[];
    cleanupTrace: unknown[];
  };
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
}

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
    options: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface HandlerRuntime {
  readonly RENDER_TEXT_HANDLER_REVISION: string;
  readonly RENDER_TEXT_CASE_IDS: readonly string[];
  readonly RENDER_TEXT_ACTION_TYPES: readonly string[];
  createRenderTextHandlerEntries(
    this: void,
    product: Readonly<JsonRecord>,
  ): readonly HandlerEntry[];
}

interface EngineFactoryMetadata {
  readonly caseId: string;
  readonly caseType: string;
  readonly role: string;
  readonly generation: number;
}

interface ClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface CaseExecution extends JsonRecord {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly status: string;
    readonly delta: Readonly<{ readonly actual: JsonRecord }>;
  }>[];
  readonly captures: readonly unknown[];
  readonly cleanup: Readonly<{
    readonly status: string;
    readonly releases: readonly Readonly<{ readonly role: string }>[];
  }>;
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: readonly ActionDefinition[];
      engineFactory: (metadata: EngineFactoryMetadata) => FakeTextEngine;
      datasets: ReadonlyMap<string, unknown>;
      clock: ClockContract;
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
  loadRuntime<CatalogRuntime>('../../scripts/verification/patch-map-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/patch-map-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/patch-map-contract/handlers/render-text.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/patch-map-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  RENDER_TEXT_ACTION_TYPES,
  RENDER_TEXT_CASE_IDS,
  RENDER_TEXT_HANDLER_REVISION,
  createRenderTextHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap REN-006 / REN-011 actual-only handlers', () => {
  it('exports the exact browser-safe handler family without answer-evidence imports', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-contract/handlers/render-text.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_TEXT_HANDLER_REVISION).toBe('patch-map-render-text-handlers/1');
    expect(RENDER_TEXT_CASE_IDS).toEqual(['REN-006', 'REN-011']);
    expect(RENDER_TEXT_ACTION_TYPES).toEqual([
      'loadDataset',
      'snapshot-observation',
      'patch',
      'publishFrame',
      'observeItemTextMatrix',
    ]);
    const harness = createHarness();
    expect(createRenderTextHandlerEntries(harness.product).map(([id]) => id)).toEqual(
      RENDER_TEXT_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    await assertCommittedVerifierEntryImportFirewall('handlers/render-text.mjs', 'handler');
    expect(source).not.toMatch(/\b(?:chosen|screenAngle|rgba)\b/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toContain('ensureSessionEngine');
  });

  it('keeps both rapid replacements pending and publishes only the final REN-006 signature', async () => {
    const harness = createHarness();
    const execution = await execute(selectedCase('REN-006'), harness);

    expect(execution.status).toBe('completed');
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual([
        { index: 0, type: 'loadDataset', status: 'completed' },
        { index: 1, type: 'snapshot-observation', status: 'completed' },
        { index: 2, type: 'patch', status: 'completed' },
        { index: 3, type: 'patch', status: 'completed' },
        { index: 4, type: 'patch', status: 'completed' },
        { index: 5, type: 'publishFrame', status: 'completed' },
      ]);
    expect(probeAt(actualAt(execution, 3), ['after'], 'rapid-text')).toMatchObject({
      projection: { source: 'intermediate' },
      publication: { status: 'pending' },
    });
    expect(probeAt(actualAt(execution, 4), ['after'], 'rapid-text')).toMatchObject({
      projection: { source: 'final中' },
      publication: { status: 'pending' },
    });
    expect(probeAt(actualAt(execution, 5), ['after'], 'rapid-text')).toMatchObject({
      projection: { source: 'final中' },
      publication: { status: 'current' },
    });
    expect(execution.captures).toEqual([expect.objectContaining({
      id: 'text',
      values: { worldBounds: { x: 10, y: 20, width: 40, height: 20 } },
    })]);
    expect(harness.engines).toHaveLength(1);
    expect(harness.engines[0]).toMatchObject({ destroyed: true, publishCount: 3 });
    expect(execution.cleanup).toMatchObject({
      status: 'completed',
      releases: [{ role: 'main' }],
    });
  });

  it('reuses one main Engine for seven REN-011 specimens and restores canonical state before patch', async () => {
    const harness = createHarness();
    const execution = await execute(selectedCase('REN-011'), harness);
    const observed = actualAt(execution, 1);
    const specimenDatasetRefs = createPatchMapRenderTextSpecimens().map(({ datasetId }) => datasetId);
    const observedSpecimens = arrayAt(observed.supplemental, 'supplemental');

    expect(observed.valueRef).toBe('itemTextContractMatrix');
    expect(observedSpecimens.map((entry) => (
      requireRecord(entry, 'supplemental entry').id
    ))).toEqual([
      'placed',
      'auto',
      'wrap',
      'overflow-visible',
      'overflow-hidden',
      'overflow-ellipsis',
      'upright',
    ]);
    expect(requireRecord(
      requireRecord(observedSpecimens[0], 'placed specimen').authored,
      'placed authored facts',
    )).toMatchObject({
      revision: 'patch-map-render-text-authored-facts/1',
      datasetId: 'patch-map-ren011-specimen-placed',
      ownerId: 'patch-map-ren011-placed',
      componentId: 'placed',
      source: 'AB',
      frame: [240, 160],
      placement: 'right-bottom',
      margin: { top: 5, right: 5, bottom: 5, left: 5 },
      tint: '#ff0000',
    });
    expect(harness.specimenFactoryCalls).toEqual([[]]);
    expect(harness.metadata.map(({ role, generation }) => ({ role, generation }))).toEqual([
      { role: 'main', generation: 1 },
    ]);
    expect(harness.engines).toHaveLength(1);
    expect(harness.engines[0]).toMatchObject({
      loadCount: 9,
      loadAttempts: 9,
      publishCount: 10,
      destroyed: true,
      loadDatasetRefs: ['item-text-corpus', ...specimenDatasetRefs, 'item-text-corpus'],
    });
    expect(probeAt(actualAt(execution, 2), ['before'], 'item-a:bidi')).toMatchObject({
      projection: { source: 'ABC مرحبا 😀' },
      publication: { status: 'current' },
    });
    expect(probeAt(actualAt(execution, 2), ['after'], 'item-a:bidi')).toMatchObject({
      publication: { status: 'pending' },
    });
    expect(probeAt(actualAt(execution, 3), ['after'], 'item-a:bidi')).toMatchObject({
      projection: { source: '中😀é\nمرحبا' },
      publication: { status: 'current' },
    });
    expect(execution.cleanup.releases.map(({ role }) => role)).toEqual(['main']);
  });

  it('restores and publishes the canonical REN-011 source when specimen observation fails', async () => {
    const harness = createHarness({ failLoadAttempts: [4] });
    const failure = await captureFailure(execute(selectedCase('REN-011'), harness));
    const partial = requireRecord(failure.partialExecution, 'partial execution') as CaseExecution;
    const main = harness.engines[0];
    if (!main) throw new Error('Missing main Engine');

    expect(failure.message).toContain('synthetic load failure');
    expect(harness.engines).toHaveLength(1);
    expect(main).toMatchObject({
      loadAttempts: 5,
      loadCount: 4,
      publishCount: 4,
      destroyed: true,
    });
    expect(main.loadDatasetRefs.at(-1)).toBe('item-text-corpus');
    expect(canonicalBidiSource(main.exportDataset())).toBe('ABC مرحبا 😀');
    expect(partial.cleanup.releases.map(({ role }) => role)).toEqual(['main']);
    expect(requireRecord(partial.datasetObservations, 'dataset observations'))
      .toMatchObject({ 'item-text-corpus': { unchanged: true } });
  });

  it('preserves the observation error when canonical restoration also fails', async () => {
    const harness = createHarness({ failLoadAttempts: [4, 5] });
    const failure = await captureFailure(execute(selectedCase('REN-011'), harness));
    const combined = failure.cause;

    expect(combined).toBeInstanceOf(AggregateError);
    expect((combined as AggregateError).errors.map(String)).toEqual([
      expect.stringContaining('patch-map-ren011-specimen-wrap'),
      expect.stringContaining('item-text-corpus'),
    ]);
    expect(failure.message).toContain('observation failed');
    expect(failure.message).toContain('canonical restoration also failed');
    expect(harness.engines).toHaveLength(1);
  });

  it('does not let poisoned result-looking fixture rows influence REN-011 actuals', async () => {
    const baselinePlan = selectedCase('REN-011');
    const poisonedPlan = structuredClone(baselinePlan);
    poisonedPlan.fixture.setup.params.itemTextContractMatrix = [{
      chosen: -99,
      lines: ['poison'],
      visibleText: 'poison',
      layoutBounds: [999, 999, 999, 999],
      screenAngle: 123,
      rgba: '#00ff00ff',
    }];
    const first = await execute(baselinePlan, createHarness());
    const second = await execute(poisonedPlan, createHarness());

    expect(first.actionResults.map(({ delta }) => delta.actual)).toEqual(
      second.actionResults.map(({ delta }) => delta.actual),
    );
  });

  it('rejects canonical trace drift before allocating an Engine', async () => {
    const plan = structuredClone(selectedCase('REN-006'));
    plan.actionTrace[0] = {
      index: 0,
      type: 'loadDataset',
      operands: { datasetId: 'item-text-corpus' },
    };
    plan.fixture.actionTrace[0] = structuredClone(plan.actionTrace[0]);
    const harness = createHarness();

    await expect(execute(plan, harness)).rejects.toBeInstanceOf(Error);
    expect(harness.engines).toEqual([]);
  });
});

function selectedCase(caseId: 'REN-006' | 'REN-011'): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!selected) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function execute(
  plan: MaterializedCase,
  harness: ReturnType<typeof createHarness>,
): Promise<CaseExecution> {
  const engineFactory = (metadata: EngineFactoryMetadata) => harness.engineFactory(metadata);
  return executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory,
    datasets: new Map([
      ['standalone-text', structuredClone(dataset('standalone-text'))],
      ['item-text-corpus', structuredClone(dataset('item-text-corpus'))],
    ]),
    clock: new ManualClock(),
    handlerEntries: createRenderTextHandlerEntries(harness.product),
  });
}

function dataset(id: 'standalone-text' | 'item-text-corpus'): unknown {
  const profiles = fixtureProfiles as Readonly<{ datasets: Readonly<Record<string, unknown>> }>;
  const value = profiles.datasets[id];
  if (value === undefined) throw new Error(`Missing fixture profile ${id}`);
  return value;
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const actual = execution.actionResults[index]?.delta.actual;
  if (!actual) throw new Error(`Missing action ${index}`);
  return actual;
}

function probeAt(actual: JsonRecord, path: readonly string[], key: string): JsonRecord {
  let cursor: unknown = actual;
  for (const segment of path) cursor = requireRecord(cursor, segment)[segment];
  const product = requireRecord(cursor, 'product');
  const probes = arrayAt(product.textProbes, 'text probes');
  const entry = probes.find((value) => isRecord(value) && value.key === key);
  return requireRecord(requireRecord(entry, `probe ${key}`).probe, `probe ${key}`);
}

function createHarness(options: Readonly<{ failLoadAttempts?: readonly number[] }> = {}) {
  const engines: FakeTextEngine[] = [];
  const metadata: EngineFactoryMetadata[] = [];
  const specimenFactoryCalls: unknown[][] = [];
  const product = {
    createSupplementalSpecimens(...args: unknown[]) {
      specimenFactoryCalls.push(args);
      return createPatchMapRenderTextSpecimens();
    },
    resourceProbe(input: unknown) {
      const request = requireRecord(input, 'resource probe request');
      return {
        revision: 'patch-map-text-runtime-probe/1',
        caseId: request.caseId,
        counts: {
          liveEngineCount: engines.filter(({ destroyed }) => !destroyed).length,
          textObjectCount: engines.reduce((sum, engine) => sum + engine.textCount(), 0),
          fontLeaseCount: 0,
          pendingFontCount: 0,
        },
        journal: [],
      };
    },
  };
  const engineFactory = (meta: EngineFactoryMetadata) => {
    metadata.push(structuredClone(meta));
    const engine = new FakeTextEngine(meta, options.failLoadAttempts ?? []);
    engines.push(engine);
    return engine;
  };
  return {
    engines,
    metadata,
    specimenFactoryCalls,
    product,
    engineFactory,
  };
}

class FakeTextEngine {
  public destroyed = false;
  public publishCount = 0;
  public loadCount = 0;
  public loadAttempts = 0;
  public readonly loadDatasetRefs: string[] = [];

  private readonly metadata: EngineFactoryMetadata;
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  private lifecycle = 'new';
  private sceneRevision = 0;
  private frameRevision = 0;
  private publishedScene = 0;
  private datasetValue: JsonRecord[] = [];
  private readonly failLoadAttempts: ReadonlySet<number>;

  public constructor(metadata: EngineFactoryMetadata, failLoadAttempts: readonly number[]) {
    this.metadata = metadata;
    this.failLoadAttempts = new Set(failLoadAttempts);
  }

  public on(event: string, listener: (payload: unknown) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  public initialize(_options: unknown): Promise<void> {
    this.lifecycle = 'ready-empty';
    this.emit('ready', { lifecycle: 'ready-empty' });
    return Promise.resolve();
  }

  public loadDataset(input: unknown, optionsValue: unknown): JsonRecord {
    if (!Array.isArray(input)) throw new Error('Dataset must be an array');
    const options = requireRecord(optionsValue, 'loadDataset options');
    const datasetRef = requireString(options.datasetRef, 'loadDataset datasetRef');
    this.loadAttempts += 1;
    this.loadDatasetRefs.push(datasetRef);
    if (this.failLoadAttempts.has(this.loadAttempts)) {
      throw new Error(`synthetic load failure ${datasetRef} at attempt ${this.loadAttempts}`);
    }
    this.datasetValue = structuredClone(input) as JsonRecord[];
    this.loadCount += 1;
    this.sceneRevision += 1;
    this.lifecycle = 'scene-ready';
    this.emit('sceneCommitted', { sceneRevision: this.sceneRevision });
    return { lifecycle: 'scene-ready', sceneRevision: this.sceneRevision };
  }

  public patch(targetValue: unknown, changesValue: unknown): JsonRecord {
    const target = requireRecord(targetValue, 'patch target');
    const changes = requireRecord(changesValue, 'patch changes');
    if (typeof changes.text !== 'string') throw new Error('Text patch required');
    const text = this.textRecord(target);
    text.text = changes.text;
    this.sceneRevision += 1;
    this.emit('sceneCommitted', { sceneRevision: this.sceneRevision });
    return {
      status: 'committed',
      changed: true,
      publication: 'pending',
      revisions: { sceneRevision: this.sceneRevision },
    };
  }

  public publishFrame(_timeMs: number): void {
    this.publishCount += 1;
    this.frameRevision += 1;
    this.publishedScene = this.sceneRevision;
    this.emit('frame', {
      frameRevision: this.frameRevision,
      publishedTuple: { scene: this.publishedScene, view: 0, interaction: 0 },
    });
  }

  public snapshot(): JsonRecord {
    const subscriptions = [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
    return {
      lifecycle: this.lifecycle,
      instanceId: `${this.metadata.role}-${this.metadata.generation}`,
      revisions: {
        lifecycleGeneration: 1,
        sceneRevision: this.sceneRevision,
        viewRevision: 0,
        interactionRevision: 0,
      },
      publishedTuple: { scene: this.publishedScene, view: 0, interaction: 0 },
      frameRevision: this.frameRevision,
      datasetRef: null,
      semanticHash: `scene-${this.sceneRevision}`,
      rootIds: this.datasetValue.map((entry) => (
        typeof entry.id === 'string' ? entry.id : ''
      )),
      historyDepth: 0,
      pendingWork: 0,
      zoomLimits: [0.5, 30],
      viewport: { centerWorld: [0, 0], scale: 1, screenBounds: [0, 0, 800, 600] },
      selectionIds: [],
      facilities: ['renderer'],
      resources: {
        canvasCount: this.destroyed || this.lifecycle === 'new' ? 0 : 1,
        canvas: { cssSize: [800, 600], backingSize: [800, 600] },
        renderer: this.destroyed ? null : {
          resolution: 1,
          antialias: true,
          background: '#00000000',
          backend: 'webgl',
        },
        rendering: {
          commandCount: this.destroyed ? 0 : this.textCount(),
          visiblePrimitiveCount: this.destroyed ? 0 : this.textCount(),
        },
        assets: null,
        subscriptions: { active: subscriptions, duplicates: 0 },
      },
    };
  }

  public semanticProbe(): JsonRecord {
    return {
      lifecycle: this.lifecycle,
      geometry: { finiteValueCount: this.textCount() * 4 },
      paint: { intentCount: this.textCount(), resolvedCount: this.textCount(), unresolvedCount: 0 },
      interaction: { activeGestureCount: 0 },
      history: { depth: 0 },
    };
  }

  public geometryProbe(): JsonRecord {
    return { revision: this.sceneRevision, entities: [], relations: [] };
  }

  public exportDataset(): JsonRecord[] {
    return structuredClone(this.datasetValue);
  }

  public textProbe(targetValue: unknown): JsonRecord | null {
    const target = requireRecord(targetValue, 'text target');
    const record = this.textRecord(target);
    const source = typeof record.text === 'string' ? record.text : '';
    const current = this.publishedScene === this.sceneRevision;
    const kind = target.kind;
    const id = requireString(target.id, 'text target id');
    const ownerId = kind === 'component'
      ? requireString(target.ownerId, 'text target ownerId')
      : null;
    return {
      target: structuredClone(target),
      semanticOwnerId: ownerId ?? id,
      entityId: ownerId === null ? id : `${ownerId}::text:${id}`,
      semantic: { source },
      projection: { source },
      geometry: { worldBounds: this.bounds(target) },
      publication: { status: current ? 'current' : 'pending' },
    };
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.lifecycle = 'destroyed';
    this.emit('destroyed', { lifecycleGeneration: 1 });
    return Promise.resolve(true);
  }

  public textCount(): number {
    let count = 0;
    for (const entry of this.datasetValue) {
      if (entry.type === 'text') count += 1;
      if (Array.isArray(entry.components)) {
        count += entry.components.filter((component) => (
          isRecord(component) && component.type === 'text'
        )).length;
      }
    }
    return this.destroyed ? 0 : count;
  }

  private textRecord(target: JsonRecord): JsonRecord {
    if (target.kind === 'element') {
      const entry = this.datasetValue.find((candidate) => candidate.id === target.id);
      return requireRecord(entry, `element text ${String(target.id)}`);
    }
    if (target.kind !== 'component') throw new Error('Unsupported text target');
    const owner = this.datasetValue.find((candidate) => candidate.id === target.ownerId);
    const components = requireRecord(owner, `text owner ${String(target.ownerId)}`).components;
    const component = arrayAt(components, 'text components').find((candidate) => (
      isRecord(candidate) && candidate.id === target.id
    ));
    return requireRecord(component, `component text ${String(target.id)}`);
  }

  private bounds(target: JsonRecord): number[] {
    if (target.kind === 'element' && target.id === 'text') return [10, 20, 40, 20];
    return [0, 0, 32, 20];
  }

  private emit(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

async function captureFailure(promise: Promise<CaseExecution>): Promise<Error & {
  cause?: unknown;
  partialExecution?: unknown;
}> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error('Execution rejected with a non-Error value');
  }
  throw new Error('Execution unexpectedly completed');
}

function canonicalBidiSource(datasetValue: JsonRecord[]): unknown {
  const owner = datasetValue.find(({ id }) => id === 'item-a');
  const components = arrayAt(requireRecord(owner, 'item-a').components, 'item-a components');
  return requireRecord(
    components.find((component) => isRecord(component) && component.id === 'bidi'),
    'bidi component',
  ).text;
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

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
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
