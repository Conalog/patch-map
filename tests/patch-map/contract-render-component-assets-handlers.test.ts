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
  readonly routeParams: Readonly<{ readonly size: string; readonly seed: number }>;
}

interface ExecutorCatalog {
  readonly actionDefinitions: readonly Readonly<{ readonly type: string }>[];
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
  readonly RENDER_COMPONENT_ASSETS_HANDLER_REVISION: string;
  readonly RENDER_COMPONENT_ASSETS_CASE_IDS: readonly string[];
  readonly RENDER_COMPONENT_ASSETS_ACTION_TYPES: readonly string[];
  createRenderComponentAssetHandlerEntries(
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
  readonly cleanup: Readonly<JsonRecord>;
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: ExecutorCatalog['actionDefinitions'];
      engineFactory: () => FakeComponentAssetEngine;
      datasets: ReadonlyMap<string, unknown>;
      clock: ClockContract;
      handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<CaseExecution>;
}

const [catalogRuntime, materializeRuntime, handlerRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/render-component-assets.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  RENDER_COMPONENT_ASSETS_HANDLER_REVISION,
  RENDER_COMPONENT_ASSETS_CASE_IDS,
  RENDER_COMPONENT_ASSETS_ACTION_TYPES,
  createRenderComponentAssetHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap REN-008 / REN-010 component-asset actual-only handlers', () => {
  it('registers one exact browser-safe handler surface behind the answer-evidence firewall', async () => {
    const harness = createHarness('REN-008');
    const entries = createRenderComponentAssetHandlerEntries(harness.product);
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/render-component-assets.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_COMPONENT_ASSETS_HANDLER_REVISION)
      .toBe('core-v2-render-component-assets-handlers/2');
    expect(RENDER_COMPONENT_ASSETS_CASE_IDS).toEqual(['REN-008', 'REN-010']);
    expect(RENDER_COMPONENT_ASSETS_ACTION_TYPES).toEqual([
      'loadDataset',
      'replaceComponentSource',
      'setComponentVisibility',
      'replaceSource',
      'patch',
    ]);
    expect(entries.map(([id]) => id)).toEqual(
      RENDER_COMPONENT_ASSETS_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/\.expected\b/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('handlers/render-component-assets.mjs', 'handler');
    expect(source).toContain("callSync(engine, 'componentVisualProbe'");
    expect(source).toContain("call(engine, 'patch'");
  });

  it.each(['REN-008', 'REN-010'] as const)(
    'rejects %s action and fixture drift before allocating an Engine',
    async (caseId) => {
      const plan = selectedCase(caseId);
      const harness = createHarness(caseId);
      const entries = new Map(createRenderComponentAssetHandlerEntries(harness.product));
      const load = entries.get('contract/loadDataset');
      if (!load) throw new Error('Missing loadDataset component-asset handler');
      let allocations = 0;
      const baseContext = {
        caseId,
        actionIndex: 0,
        fixtureParams: plan.fixture.setup.params,
        routeParams: plan.routeParams,
        signal: new AbortController().signal,
        clock: new ManualClock(),
        ensureMainEngine() {
          allocations += 1;
          return Promise.reject(new Error('must not initialize'));
        },
        resolveDataset: () => Promise.reject(new Error('must not resolve')),
        fingerprint: () => 'unused',
      };
      const firstAction = plan.actionTrace[0];
      if (!firstAction) throw new Error(`Missing ${caseId} first action`);
      const action = structuredClone(firstAction);
      (action.operands as JsonRecord).datasetId = 'nearby-dataset';
      await expect(load(baseContext, action)).rejects.toThrow(/action 0 operands/u);

      const fixtureDrift = structuredClone(plan.fixture.setup.params) as JsonRecord;
      fixtureDrift.nearby = true;
      await expect(load({ ...baseContext, fixtureParams: fixtureDrift }, firstAction))
        .rejects.toThrow(/fixture/u);
      expect(allocations).toBe(0);
      expect(harness.engines).toHaveLength(0);
    },
  );

  it('executes all four REN-008 actions with owner-qualified identity and one product capture', async () => {
    const plan = selectedCase('REN-008');
    const harness = createHarness('REN-008');
    const beforePlan = JSON.stringify(plan);
    const beforeInput = JSON.stringify(harness.dataset);
    const clock = new ManualClock();
    const execution = await execute(plan, harness, clock);

    expect(execution.status).toBe('completed');
    expect(execution.error).toBeNull();
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual([
        'loadDataset',
        'replaceComponentSource',
        'setComponentVisibility',
        'setComponentVisibility',
      ].map((type, index) => ({ index, type, status: 'completed' })));
    expect(actualAt(execution, 0)).toMatchObject({
      caseId: 'REN-008',
      datasetId: 'background',
      target: { kind: 'component', ownerId: 'item', id: 'bg' },
      input: { unchanged: true },
      product: {
        component: {
          entityId: 'item::background:bg',
          logicalIdentity: 'component:item:bg',
          renderRole: 'background-geometry',
        },
      },
    });
    expect(actualAt(execution, 1)).toMatchObject({
      target: { kind: 'component', ownerId: 'item', id: 'bg' },
      source: 'fixture-image',
      timeMs: 20,
      mutation: { status: 'committed', changed: true },
      after: {
        component: {
          entityId: 'item::background:bg',
          renderRole: 'background-asset',
          sceneImage: { authoredSource: 'fixture-image', renderObjectCount: 1 },
        },
      },
    });
    expect(actualAt(execution, 2)).toMatchObject({
      show: false,
      after: {
        component: {
          semantic: { show: false },
          sceneImage: { renderObjectCount: 0 },
        },
      },
    });
    expect(actualAt(execution, 3)).toMatchObject({
      show: true,
      after: {
        component: {
          semantic: { componentId: 'bg', show: true },
          sceneImage: { renderObjectCount: 1 },
        },
      },
    });
    expect(execution.captures).toEqual([{
      id: 'initial',
      phase: 'after-action',
      afterActionIndex: 0,
      values: { id: 'bg' },
    }]);
    expect(harness.patchCalls).toEqual([
      {
        target: { kind: 'component', ownerId: 'item', id: 'bg' },
        changes: { source: 'fixture-image' },
      },
      {
        target: { kind: 'component', ownerId: 'item', id: 'bg' },
        changes: { show: false },
      },
      {
        target: { kind: 'component', ownerId: 'item', id: 'bg' },
        changes: { show: true },
      },
    ]);
    expect(harness.adapterCalls.settle).toHaveLength(3);
    expect(harness.engines[0]?.sceneImageSettlementFrames).toEqual([1, 2, 3, 4]);
    expect(clock.milestones).toEqual([20]);
    expect(harness.engines[0]?.destroyed).toBe(true);
    expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(JSON.stringify(plan)).toBe(beforePlan);
    expect(JSON.stringify(harness.dataset)).toBe(beforeInput);
  });

  it('executes all three REN-010 actions and keeps tint-only changes off the asset settlement path', async () => {
    const plan = selectedCase('REN-010');
    const harness = createHarness('REN-010');
    const beforeInput = JSON.stringify(harness.dataset);
    const clock = new ManualClock();
    const execution = await execute(plan, harness, clock);

    expect(execution.actionResults).toHaveLength(3);
    expect(execution.captures).toEqual([]);
    expect(actualAt(execution, 0)).toMatchObject({
      target: { kind: 'component', ownerId: 'item-a', id: 'icon' },
      product: {
        component: {
          geometry: { worldBounds: [47, 12, 40, 15] },
          sceneImage: { authoredSource: 'fixture-icon', generation: 1 },
        },
      },
    });
    expect(actualAt(execution, 1)).toMatchObject({
      target: { kind: 'component', ownerId: 'item-a', id: 'icon' },
      source: 'fixture-icon-2',
      timeMs: 20,
      after: {
        component: {
          geometry: { worldBounds: [47, 12, 40, 15] },
          sceneImage: { authoredSource: 'fixture-icon-2', generation: 2 },
        },
      },
    });
    expect(actualAt(execution, 2)).toMatchObject({
      target: { kind: 'component', ownerId: 'item-a', id: 'icon' },
      changes: { tint: '#00ff00ff' },
      after: {
        component: {
          semantic: { tint: '#00ff00ff' },
          rendererPaint: {
            packedTint: 0x00ff00ff,
            rgbTint: 0x00ff00,
            alpha: 1,
          },
          sceneImage: { generation: 2 },
        },
      },
    });
    expect(harness.patchCalls).toEqual([
      {
        target: { kind: 'component', ownerId: 'item-a', id: 'icon' },
        changes: { source: 'fixture-icon-2' },
      },
      {
        target: { kind: 'component', ownerId: 'item-a', id: 'icon' },
        changes: { tint: '#00ff00ff' },
      },
    ]);
    expect(harness.adapterCalls.settle).toHaveLength(2);
    expect(harness.engines[0]?.sceneImageSettlementFrames).toEqual([1, 2, 3]);
    expect(clock.milestones).toEqual([20]);
    expect(JSON.stringify(harness.dataset)).toBe(beforeInput);
  });

  it('copies action operands before patch delegation and never fabricates a changed product fact', async () => {
    const plan = selectedCase('REN-010');
    const harness = createHarness('REN-010', { terminalTint: '#11223344' });
    const execution = await execute(plan, harness, new ManualClock());
    const tintAction = plan.actionTrace[2];
    const tintCall = harness.patchReferences[1];
    if (!tintAction || !tintCall) throw new Error('Missing tint action/call');
    const fixtureChanges = requireRecord(tintAction.operands.changes, 'fixture changes');

    expect(tintCall.changes).not.toBe(fixtureChanges);
    expect(valueAt(actualAt(execution, 2), ['after', 'component', 'semantic', 'tint']))
      .toBe('#11223344');
  });

  it('lets executor finally cleanup destroy the Engine when settlement rejects', async () => {
    const plan = selectedCase('REN-010');
    const harness = createHarness('REN-010', { rejectSettlementCall: 2 });
    let failure: unknown;
    try {
      await execute(plan, harness, new ManualClock());
    } catch (error) {
      failure = error;
    }
    const partial = requireRecord(requireRecord(failure, 'execution error').partialExecution, 'partial');
    const cleanup = requireRecord(partial.cleanup, 'partial cleanup');

    expect(failure).toBeInstanceOf(Error);
    expect(cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(harness.engines).toHaveLength(1);
    expect(harness.engines[0]?.destroyed).toBe(true);
  });
});

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

function selectedCase(caseId: 'REN-008' | 'REN-010'): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!selected) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function execute(
  plan: MaterializedCase,
  harness: ReturnType<typeof createHarness>,
  clock: ManualClock,
): Promise<CaseExecution> {
  return executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: harness.engineFactory,
    datasets: new Map([[harness.datasetId, harness.dataset]]),
    clock,
    handlerEntries: createRenderComponentAssetHandlerEntries(harness.product),
  });
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const actual = execution.actionResults[index]?.delta.actual;
  if (!actual) throw new Error(`Missing action ${index}`);
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
  caseId: 'REN-008' | 'REN-010',
  options: Readonly<{
    readonly rejectSettlementCall?: number;
    readonly terminalTint?: string;
  }> = {},
) {
  const datasetId = caseId === 'REN-008' ? 'background' : 'icon';
  const dataset = caseId === 'REN-008' ? backgroundDataset() : iconDataset();
  const engines: FakeComponentAssetEngine[] = [];
  const patchCalls: { target: JsonRecord; changes: JsonRecord }[] = [];
  const patchReferences: { target: JsonRecord; changes: JsonRecord }[] = [];
  const adapterCalls = { register: [] as unknown[], settle: [] as unknown[] };
  const journal: JsonRecord[] = [];
  let sequence = 0;
  let currentEngine: FakeComponentAssetEngine | null = null;
  let settlementCount = 0;

  const append = (event: string, extra: JsonRecord = {}) => {
    journal.push({ sequence: ++sequence, event, ...structuredClone(extra) });
  };
  const product: JsonRecord = {
    registerFixtureAssets(engineValue: unknown, input: unknown) {
      if (!(engineValue instanceof FakeComponentAssetEngine)) throw new Error('Unexpected engine');
      currentEngine = engineValue;
      adapterCalls.register.push(structuredClone(input));
      append('register', { caseId });
      return caseId === 'REN-008'
        ? { registeredAliases: ['fixture-image'] }
        : { registeredAliases: ['fixture-icon', 'fixture-icon-2'] };
    },
    settleComponentAsset(engineValue: unknown, input: unknown) {
      if (engineValue !== currentEngine) throw new Error('Settlement engine drift');
      settlementCount += 1;
      adapterCalls.settle.push(structuredClone(input));
      if (settlementCount === options.rejectSettlementCall) {
        return Promise.reject(new Error('fixture settlement rejected'));
      }
      append('settle', { call: settlementCount });
      return Promise.resolve({ settled: true, call: settlementCount });
    },
    resourceProbe(input: unknown) {
      const request = requireRecord(input, 'resource probe request');
      if (request.caseId !== caseId) throw new Error('Resource case drift');
      const engine = currentEngine;
      return {
        revision: 'core-v2-component-assets-resource-probe/1',
        caseId,
        counts: resourceCounts(engine),
        journal: structuredClone(journal),
      };
    },
  };

  const engineFactory = () => {
    const engine = new FakeComponentAssetEngine(caseId, patchCalls, patchReferences, options);
    engines.push(engine);
    return engine;
  };
  return {
    datasetId,
    dataset,
    engines,
    patchCalls,
    patchReferences,
    adapterCalls,
    product,
    engineFactory,
  };
}

class FakeComponentAssetEngine {
  public destroyed = false;
  public readonly sceneImageSettlementFrames: number[] = [];

  private readonly listeners = new Map<string, Set<(actual: unknown) => void>>();
  private readonly caseId: 'REN-008' | 'REN-010';
  private readonly patchCalls: { target: JsonRecord; changes: JsonRecord }[];
  private readonly patchReferences: { target: JsonRecord; changes: JsonRecord }[];
  private readonly options: Readonly<{ readonly terminalTint?: string }>;
  private lifecycle = 'new';
  private sceneRevision = 0;
  private frameRevision = 0;
  private dataset: JsonRecord[] = [];
  private generation = 0;

  public constructor(
    caseId: 'REN-008' | 'REN-010',
    patchCalls: { target: JsonRecord; changes: JsonRecord }[],
    patchReferences: { target: JsonRecord; changes: JsonRecord }[],
    options: Readonly<{ readonly terminalTint?: string }>,
  ) {
    this.caseId = caseId;
    this.patchCalls = patchCalls;
    this.patchReferences = patchReferences;
    this.options = options;
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

  public loadDataset(value: unknown): JsonRecord {
    if (!Array.isArray(value)) throw new Error('Dataset must be an array');
    this.dataset = structuredClone(value) as JsonRecord[];
    this.generation = this.caseId === 'REN-010' ? 1 : 0;
    this.lifecycle = 'scene-ready';
    this.sceneRevision += 1;
    this.emit('sceneCommitted', { sceneRevision: this.sceneRevision });
    return { status: 'committed', entityCount: 1 };
  }

  public patch(targetValue: unknown, changesValue: unknown): JsonRecord {
    const target = requireRecord(targetValue, 'patch target');
    const changes = requireRecord(changesValue, 'patch changes');
    this.patchReferences.push({ target, changes });
    this.patchCalls.push({ target: structuredClone(target), changes: structuredClone(changes) });
    if (
      target.kind !== 'component' ||
      target.ownerId !== this.ownerId() ||
      target.id !== this.componentId()
    ) {
      throw new Error('Owner-qualified component target required');
    }
    const component = this.component();
    if (Object.hasOwn(changes, 'source')) {
      component.source = structuredClone(changes.source);
      this.generation += 1;
    }
    if (Object.hasOwn(changes, 'show')) component.show = changes.show;
    if (Object.hasOwn(changes, 'tint')) {
      component.tint = this.options.terminalTint ?? changes.tint;
    }
    this.sceneRevision += 1;
    this.emit('sceneCommitted', { sceneRevision: this.sceneRevision });
    return { status: 'committed', changed: true, sceneRevision: this.sceneRevision };
  }

  public publishFrame(_timeMs: number): void {
    this.frameRevision += 1;
    this.emit('frame', { frameRevision: this.frameRevision });
  }

  public settleSceneImages(): Promise<void> {
    this.sceneImageSettlementFrames.push(this.frameRevision);
    return Promise.resolve();
  }

  public snapshot(): JsonRecord {
    const active = [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
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
        rendering: { commandCount: this.destroyed ? 0 : 3 },
      },
      pendingWork: 0,
    };
  }

  public semanticProbe(): JsonRecord {
    return {
      lifecycle: this.lifecycle,
      geometry: { finiteValueCount: 12 },
      history: { depth: 0 },
    };
  }

  public geometryProbe(): JsonRecord {
    const probe = this.componentVisualProbe({
      ownerId: this.ownerId(),
      componentId: this.componentId(),
    });
    const component = requireRecord(probe, 'component probe');
    const geometry = requireRecord(component.geometry, 'component geometry');
    return {
      revision: this.sceneRevision,
      revisionLag: 0,
      entities: [{
        id: component.entityId,
        kind: component.entityKind,
        worldBounds: structuredClone(geometry.worldBounds),
        visibleBounds: structuredClone(geometry.visibleBounds),
        visible: geometry.visible,
        interactive: geometry.interactive,
      }],
      relations: [],
      selectionOverlay: null,
    };
  }

  public sceneImageProbe(): JsonRecord {
    const source = this.component().source;
    if (typeof source !== 'string') return { images: {} };
    const image = this.imageRecord();
    return { images: { [this.entityId()]: image } };
  }

  public componentVisualProbe(targetValue: unknown): JsonRecord | null {
    const target = requireRecord(targetValue, 'component target');
    if (target.ownerId !== this.ownerId() || target.componentId !== this.componentId()) return null;
    const component = this.component();
    const source = component.source;
    const show = component.show !== false;
    const isImage = typeof source === 'string';
    const bounds = this.caseId === 'REN-008' ? [0, 0, 100, 80] : [47, 12, 40, 15];
    const renderRole = this.caseId === 'REN-008'
      ? (isImage ? 'background-asset' : 'background-geometry')
      : 'content-asset';
    const tint = typeof component.tint === 'string' ? component.tint : null;
    const packed = tint ? Number.parseInt(tint.slice(1), 16) >>> 0 : 0xffff_ffff;
    return {
      target: { ownerId: this.ownerId(), componentId: this.componentId() },
      semantic: {
        target: { kind: 'component', ownerId: this.ownerId(), id: this.componentId() },
        ownerId: this.ownerId(),
        componentId: this.componentId(),
        componentType: component.type,
        authoredSize: structuredClone(component.size ?? null),
        source: structuredClone(source ?? null),
        tint,
        show,
      },
      entityId: this.entityId(),
      logicalIdentity: `component:${this.ownerId()}:${this.componentId()}`,
      componentType: component.type,
      renderRole,
      entityKind: isImage ? 'image' : 'rect',
      geometry: {
        localBounds: [...bounds],
        worldBounds: [...bounds],
        visibleBounds: show ? [...bounds] : null,
        visible: show,
        interactive: show,
      },
      sceneImage: isImage ? this.imageRecord() : null,
      rendererPaint: {
        entityId: this.entityId(),
        lane: renderRole === 'background-asset'
          ? 'background-assets'
          : renderRole === 'content-asset'
            ? 'content-assets'
            : renderRole,
        rendererKind: isImage && show ? 'sprite' : isImage ? 'none' : 'graphics',
        primitiveCount: show ? 1 : 0,
        renderObjectCount: show ? 1 : 0,
        packedTint: packed,
        rgbTint: packed >>> 8,
        alpha: (packed & 0xff) / 0xff,
      },
      renderLanes: renderLanes(),
      revisions: {
        lifecycleGeneration: 1,
        sceneRevision: this.sceneRevision,
        viewRevision: 0,
        interactionRevision: 0,
      },
      availability: {
        semantic: true,
        surface: true,
        rendererPaint: true,
        renderLanes: true,
      },
    };
  }

  public exportDataset(): JsonRecord[] {
    return structuredClone(this.dataset);
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.lifecycle = 'destroyed';
    this.emit('destroyed', { lifecycle: this.lifecycle });
    this.listeners.clear();
    return Promise.resolve(true);
  }

  public hasImage(): boolean {
    return typeof this.component().source === 'string';
  }

  public visible(): boolean {
    return this.component().show !== false;
  }

  private ownerId(): string {
    return this.caseId === 'REN-008' ? 'item' : 'item-a';
  }

  private componentId(): string {
    return this.caseId === 'REN-008' ? 'bg' : 'icon';
  }

  private entityId(): string {
    return `${this.ownerId()}::${this.caseId === 'REN-008' ? 'background' : 'icon'}:${this.componentId()}`;
  }

  private component(): JsonRecord {
    const owner = this.dataset.find((entry) => entry.id === this.ownerId());
    if (!owner || !Array.isArray(owner.components)) throw new Error('Missing component owner');
    const components: unknown[] = owner.components;
    const component: unknown = components.find(
      (entry) => isRecord(entry) && entry.id === this.componentId(),
    );
    return requireRecord(component, 'component');
  }

  private imageRecord(): JsonRecord {
    const component = this.component();
    const source = requireString(component.source, 'image source');
    const show = component.show !== false;
    return {
      entityId: this.entityId(),
      active: show,
      generation: this.generation,
      authoredSource: source,
      sourceKind: 'alias',
      dimensionMode: 'authored',
      bindingKey: `alias:${source}:generation:${this.generation}`,
      sourceCacheIdentity: `alias:${source}`,
      state: 'resolved',
      attachmentState: 'current',
      cacheIdentity: `alias:${source}`,
      normalizedResourceIdentity: `${source}@1`,
      naturalSize: [16, 16],
      reusedResolvedResource: false,
      renderObjectCount: show ? 1 : 0,
      placeholderCount: 0,
      bindingConsumerCount: show ? 1 : 0,
      role: show ? 'image' : 'none',
      rendererGeneration: this.generation,
      staleAttachCount: 0,
      staleCompletionCount: 0,
      diagnosticCount: 0,
      attempts: [],
    };
  }

  private emit(event: string, actual: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(actual);
  }
}

function resourceCounts(engine: FakeComponentAssetEngine | null): JsonRecord {
  const live = engine !== null && !engine.destroyed;
  const hasImage = live && engine.hasImage();
  const visible = hasImage && engine.visible();
  return {
    canvasCount: live ? 1 : 0,
    subscriptionCount: live ? 6 : 0,
    pendingWorkCount: 0,
    bindingCount: hasImage ? 1 : 0,
    resourceCount: hasImage ? 1 : 0,
    leaseCount: hasImage ? 1 : 0,
    pendingSettlementCount: 0,
    pendingReleaseCount: 0,
    staleAttachmentCount: 0,
    rendererObjectCount: visible ? 1 : 0,
    cleanupFailureCount: 0,
  };
}

function renderLanes(): JsonRecord {
  return {
    backgroundGeometry: lane('background-geometry'),
    backgroundAssets: lane('background-assets'),
    ordinaryGeometry: lane('ordinary-geometry'),
    relationsDynamic: lane('relations-dynamic'),
    contentAssets: lane('content-assets'),
    text: lane('text'),
    interactionOverlay: lane('interaction-overlay'),
  };
}

function lane(role: string): JsonRecord {
  return {
    role,
    label: `PatchMap/${role}`,
    renderObjectCount: 1,
    visiblePrimitiveCount: 1,
  };
}

function backgroundDataset(): JsonRecord[] {
  return [{
    type: 'item',
    id: 'item',
    size: { width: 100, height: 80 },
    padding: 10,
    components: [{
      type: 'background',
      id: 'bg',
      source: { type: 'rect', fill: '#ff0000', borderWidth: 2, radius: 8 },
      size: { width: 20, height: 10 },
    }],
  }];
}

function iconDataset(): JsonRecord[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    padding: 10,
    components: [{
      type: 'icon',
      id: 'icon',
      source: 'fixture-icon',
      size: { width: '50%', height: '25%' },
      placement: 'right-top',
      margin: { top: 2, right: 3 },
    }],
  }];
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
  public readonly milestones: number[] = [];
  private time = 0;

  public now(): number { return this.time; }

  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.time) throw new Error('Clock cannot move backwards');
    this.time = timeMs;
    this.milestones.push(timeMs);
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}
