import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  materializeCoreV2CompatibilityDataset,
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
    readonly captureCheckpoints: readonly Readonly<{
      readonly id: string;
      readonly phase: string;
      readonly afterActionIndex: number;
      readonly paths: readonly string[];
    }>[];
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

interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface CaseExecution extends JsonRecord {
  readonly $schema: string;
  readonly caseId: string;
  readonly caseType: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly handlerId: string;
    readonly status: string;
    readonly startedAtMs: number;
    readonly completedAtMs: number;
    readonly delta: Readonly<{
      readonly $schema: string;
      readonly caseId: string;
      readonly actionIndex: number;
      readonly actionType: string;
      readonly actual: JsonRecord;
      readonly semanticProbe: unknown;
    }>;
  }>[];
  readonly bindings: Readonly<JsonRecord>;
  readonly captures: readonly JsonRecord[];
  readonly eventJournal: readonly JsonRecord[];
  readonly eventJournalFailures: readonly unknown[];
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: Readonly<JsonRecord>;
  readonly hostSeamDelta: unknown;
  readonly error: unknown;
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

interface FoldResult {
  readonly actual: JsonRecord;
  readonly fixtures: JsonRecord;
  readonly captures: JsonRecord;
}

interface FoldRuntime {
  readonly DATA_CLOSURE_FOLD_REVISION: string;
  foldDataClosureExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: CaseExecution;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
      browserProbe?: Readonly<JsonRecord>;
    }>,
  ): FoldResult;
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      expectedCase: JsonRecord;
      actual: JsonRecord;
      fixtures: JsonRecord;
      captures: JsonRecord;
    }>,
  ): Readonly<{
    passed: number;
    failed: number;
    assertions: readonly Readonly<{ path: string; passed: boolean }>[];
  }>;
}

interface ObservationRuntime {
  createSemanticObservation(
    this: void,
    options: Readonly<{ observation: JsonRecord }>,
  ): Readonly<{ actualSemanticSha256: string; actualObservationSha256: string }>;
}

interface NormalizedEvidence {
  readonly cases: readonly JsonRecord[];
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [
  catalogRuntime,
  materializeRuntime,
  handlerRuntime,
  workerRuntime,
  foldRuntime,
  compareRuntime,
  observationRuntime,
] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/data-closure.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-data-closure.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
  loadRuntime<ObservationRuntime>('../../scripts/verification/core-v2-contract/observe.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { createDataClosureHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { DATA_CLOSURE_FOLD_REVISION, foldDataClosureExecution } = foldRuntime;
const { compareObservation } = compareRuntime;
const { createSemanticObservation } = observationRuntime;

let catalog: ExecutorCatalog;
let normalizedEvidence: NormalizedEvidence;

beforeAll(async () => {
  [catalog, normalizedEvidence] = await Promise.all([
    loadExecutorCatalog(),
    readNormalizedEvidence(),
  ]);
});

describe('Core v2 data-closure actual-only fold', () => {
  it('is import-free and browser-safe behind the verifier dependency firewall', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-data-closure.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(DATA_CLOSURE_FOLD_REVISION).toBe('core-v2-data-closure-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it.each([
    ['DAT-006', 9, 0],
    ['DAT-007', 10, 0],
    ['DAT-008', 13, 3],
  ] as const)(
    'folds %s actual observations with %i passing and %i failing assertions',
    async (caseId, passed, failed) => {
      const run = await executeAndFold(caseId);
      const observed = createSemanticObservation({ observation: run.folded.actual });
      const comparison = compareObservation({
        expectedCase: normalizedCase(caseId),
        actual: run.folded.actual,
        fixtures: run.folded.fixtures,
        captures: run.folded.captures,
      });

      expect(run.execution.status).toBe('completed');
      expect(run.execution.eventJournalFailures).toEqual([]);
      expect(valueAt(run.folded.actual, 'resources.cleanup.status')).toBe('completed');
      expect(observed.actualSemanticSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(observed.actualObservationSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(comparison.passed).toBe(passed);
      expect(comparison.failed).toBe(failed);
      expect(isDeepFrozen(run.folded)).toBe(true);
      expect(JSON.stringify(run.folded.actual)).not.toContain('"status":"pass"');
    },
  );

  it('projects DAT-006 product compatibility without fold-side normalization', async () => {
    const { folded } = await executeAndFold('DAT-006');
    const comparison = compareObservation({
      expectedCase: normalizedCase('DAT-006'),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(valueAt(folded.actual, 'scene.legacy.input')).toEqual(
      valueAt(folded.fixtures, 'legacyRoot'),
    );
    expect(valueAt(folded.actual, 'scene.legacy.accepted')).toBe(true);
    expect(valueAt(folded.actual, 'scene.legacy.canonical')).toEqual(
      valueAt(folded.fixtures, 'canonicalDataset'),
    );
    expect(valueAt(folded.actual, 'outcome.malformed.code')).toBe('INVALID_LEGACY_ROOT');
    expect(valueAt(folded.actual, 'outcome.malformed.path')).toBe('$.height');
    expect(failedPaths(comparison)).toEqual([]);
  });

  it('projects DAT-007 atomic rejection with preserved authority', async () => {
    const { folded } = await executeAndFold('DAT-007');
    const comparison = compareObservation({
      expectedCase: normalizedCase('DAT-007'),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(valueAt(folded.actual, 'scene.revision')).toBe(1);
    expect(valueAt(folded.actual, 'scene.query.rect-b.id')).toBe('rect-b');
    expect(valueAt(folded.actual, 'interaction.selection.ids')).toEqual(['rect-b']);
    expect(valueAt(folded.actual, 'outcome.invalidCases.count')).toBe(10);
    expect(valueAt(folded.actual, 'outcome.invalidCases.pathAwareCount')).toBe(10);
    expect(valueAt(folded.actual, 'outcome.invalidCases.acceptedCount')).toBe(0);
    expect(valueAt(folded.actual, 'revisions.publication.partialCount')).toBe(0);
    expect(valueAt(folded.actual, 'events.drawComplete.count')).toBe(1);
    expect(valueAt(folded.actual, 'scene.view')).toEqual(valueAt(folded.captures, 'before.view'));
    expect(failedPaths(comparison)).toEqual([]);
  });

  it('projects DAT-008 literal/hash and mutation gaps while retaining exact duplicate facts', async () => {
    const { folded } = await executeAndFold('DAT-008');
    const comparison = compareObservation({
      expectedCase: normalizedCase('DAT-008'),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(valueAt(folded.actual, 'outcome.sessions.semanticHashes.0'))
      .toMatch(/^fnv1a64:[a-f0-9]{16}$/u);
    expect(valueAt(folded.actual, 'scene.equalZOrder')).toEqual([
      'explicit-a',
      '@element:$[1]',
      'duplicate',
    ]);
    expect(valueAt(folded.actual, 'outcome.staleTarget.code')).toBe('UNSUPPORTED_OPERATION');
    expect(valueAt(folded.actual, 'outcome.duplicates.element.code')).toBe('DUPLICATE_ID');
    expect(valueAt(folded.actual, 'outcome.duplicates.component.code')).toBe('DUPLICATE_ID');
    expect(valueAt(folded.actual, 'scene.replacement.attrs.x')).toEqual({
      _availability: 'missing',
    });
    expect(valueAt(folded.actual, 'scene.replacement.attrs.x')).toEqual(
      valueAt(folded.captures, 'before.replacement.attrs.x'),
    );
    expect(failedPaths(comparison)).toEqual([
      '/outcome/sessions/semanticHashes',
      '/scene/equalZOrder',
      '/outcome/staleTarget/code',
    ]);
  });

  it('documents the immutable DAT-008 action-definition binding inconsistency', async () => {
    const plan = selectedCase('DAT-008');
    await expect(executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: engineFactory([]),
      datasets: datasets(),
      clock: new ManualClock(),
      handlerEntries: createDataClosureHandlerEntries(productAdapter()),
    })).rejects.toThrow(/retainTarget binding operand as/u);
  });
});

async function executeAndFold(caseId: string): Promise<{
  plan: MaterializedCase;
  execution: CaseExecution;
  folded: FoldResult;
}> {
  const plan = selectedCase(caseId);
  const engines: CoreV2Engine[] = [];
  const execution = caseId === 'DAT-008'
    ? await executeData008Direct(plan, engines)
    : await executeContractCase({
        caseRecord: plan,
        actionDefinitions: catalog.actionDefinitions,
        engineFactory: engineFactory(engines),
        datasets: datasets(),
        clock: new ManualClock(),
        handlerEntries: createDataClosureHandlerEntries(productAdapter()),
      });
  const folded = foldDataClosureExecution({
    casePlan: plan,
    execution,
    provenance: {
      runner: 'contract-data-closure-fold-test',
      packageBinding: 'source-product-adapter',
      codeCommit: 'test-source-tree',
      packedPackageSha256: 'not-packed-in-targeted-unit-test',
    },
    environment: {
      runtime: 'vitest',
      renderer: 'test-surface',
      browserVersion: 'not-headed-in-targeted-unit-test',
    },
  });
  return { plan, execution, folded };
}

async function executeData008Direct(
  plan: MaterializedCase,
  engines: CoreV2Engine[],
): Promise<CaseExecution> {
  const entries = new Map(createDataClosureHandlerEntries(productAdapter()));
  const datasetMap = datasets();
  const clock = new ManualClock();
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
      const engine = engineFactory(engines)({});
      return Promise.resolve(engine);
    },
    resolveDataset,
    fingerprint,
  });
  const actionResults: Array<CaseExecution['actionResults'][number]> = [];
  let addCapture: unknown = null;

  for (const action of plan.actionTrace) {
    const handler = entries.get(`contract/${action.type}`);
    if (handler === undefined) throw new Error(`Missing handler ${action.type}`);
    const output = await handler(context, action) as Readonly<{
      actual: JsonRecord;
      captureSource?: JsonRecord;
    }>;
    if (action.index === 4) addCapture = valueAt(output.captureSource, 'replacement.attrs.x');
    actionResults.push({
      index: action.index,
      type: action.type,
      handlerId: `contract/${action.type}`,
      status: 'completed',
      startedAtMs: clock.now(),
      completedAtMs: clock.now(),
      delta: {
        $schema: 'core-v2-semantic-observation-delta/1',
        caseId: plan.id,
        actionIndex: action.index,
        actionType: action.type,
        actual: output.actual,
        semanticProbe: null,
      },
    });
  }

  const terminalEngine = engines.at(-1);
  if (terminalEngine === undefined) throw new Error('Missing DAT-008 terminal engine');
  const terminalSnapshot = structuredClone(terminalEngine.snapshot());
  const terminalSemanticProbe = structuredClone(terminalEngine.semanticProbe());
  await Promise.all(engines.map((engine) => engine.destroy()));
  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId: plan.id,
    caseType: plan.caseType,
    status: 'completed',
    actionResults,
    bindings: {},
    captures: [{
      id: 'before',
      phase: 'after-action',
      afterActionIndex: 4,
      values: { 'replacement/attrs/x': addCapture },
    }],
    eventJournal: [],
    eventJournalFailures: [],
    terminalSnapshot,
    terminalSemanticProbe,
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: [],
      errors: [],
    },
    hostSeamDelta: null,
    error: null,
  };
}

function selectedCase(id: string): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [id] })[0];
  if (selected === undefined) throw new Error(`Missing approved case ${id}`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function productAdapter(): Readonly<JsonRecord> {
  return Object.freeze({
    materializeDataset(input: unknown): Readonly<JsonRecord> {
      const compatible = materializeCoreV2CompatibilityDataset(input);
      return Object.freeze({
        dataset: compatible.canonicalDataset,
        semanticHash: compatible.semanticHash,
      });
    },
  });
}

function engineFactory(engines: CoreV2Engine[]): (_metadata: Readonly<JsonRecord>) => CoreV2Engine {
  return (_metadata) => {
    const engine = new CoreV2Engine({
      surfaceFactory: (options) => Promise.resolve(new TestSurface(options)),
    });
    engines.push(engine);
    return engine;
  };
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

function normalizedCase(caseId: string): JsonRecord {
  const record = normalizedEvidence.cases.find(({ id }) => id === caseId);
  if (record === undefined) throw new Error(`Missing normalized case ${caseId}`);
  return record;
}

async function readNormalizedEvidence(): Promise<NormalizedEvidence> {
  const content = await readFile(
    fileURLToPath(new URL(
      '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json',
      import.meta.url,
    )),
    'utf8',
  );
  return JSON.parse(content) as NormalizedEvidence;
}

function failedPaths(comparison: Readonly<{
  assertions: readonly Readonly<{ path: string; passed: boolean }>[];
}>): readonly string[] {
  return comparison.assertions.filter(({ passed }) => !passed).map(({ path }) => path);
}

function valueAt(root: unknown, path: string): unknown {
  let cursor = root;
  for (const segment of path.split('.')) {
    if ((!isRecord(cursor) && !Array.isArray(cursor)) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`Missing ${path}`);
    }
    cursor = Reflect.get(cursor, segment) as unknown;
  }
  return cursor;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key: string, nested: unknown): unknown => (
    isRecord(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)))
      : nested
  ));
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((nested) => isDeepFrozen(nested, seen));
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
  public resize(_width: number, _height: number, _pixelRatio: number): boolean { return false; }
  public setView(_view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {}

  public select(ids: readonly string[]): void {
    this.#selectionIds = Object.freeze(ids.filter((id) => this.#rootIds.has(id)));
  }

  public hitTestScreen(_point: CoreV2Point): string | null { return null; }
  public screenToWorld(point: CoreV2Point): CoreV2Point { return point; }

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

  public now(): number { return this.#time; }

  public async advanceTo(timeMs: number): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < this.#time) throw new Error(`Invalid time ${timeMs}`);
    this.#time = timeMs;
    await Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}
