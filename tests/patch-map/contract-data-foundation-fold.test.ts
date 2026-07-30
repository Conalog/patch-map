import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Color } from 'pixi.js';
import type { ColorSource } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createPatchMapColorResolver,
  materializePatchMapGrid,
  resolvePatchMapComponentSize,
  resolvePatchMapContentBox,
  setPatchMapGridCell,
} from '../../src/patch-map';

interface JsonRecord {
  [key: string]: unknown;
}

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<JsonRecord>;
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

interface ActionExecution {
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
}

interface CaseExecution extends JsonRecord {
  readonly $schema: string;
  readonly caseId: string;
  readonly caseType: string;
  readonly status: string;
  readonly actionResults: readonly ActionExecution[];
  readonly bindings: Readonly<JsonRecord>;
  readonly captures: readonly JsonRecord[];
  readonly eventJournal: readonly unknown[];
  readonly eventJournalFailures: readonly unknown[];
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: Readonly<JsonRecord>;
  readonly error: unknown;
}

interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

type Handler = (context: unknown, action: unknown) => unknown;
type HandlerEntry = readonly [string, Handler];

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

interface HandlerRuntime {
  createDataFoundationHandlerEntries(
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
      engineFactory: (metadata: unknown) => never;
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
  readonly DATA_FOUNDATION_FOLD_REVISION: string;
  foldDataFoundationExecution(
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

interface ObservationRuntime {
  createSemanticObservation(
    this: void,
    options: Readonly<{ observation: JsonRecord }>,
  ): Readonly<{
    actualSemanticSha256: string;
    actualObservationSha256: string;
  }>;
}

interface ComparisonResult {
  readonly passed: number;
  readonly failed: number;
  readonly assertions: readonly Readonly<{
    readonly path: string;
    readonly passed: boolean;
  }>[];
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
  ): ComparisonResult;
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
  observationRuntime,
  compareRuntime,
] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/data-foundation.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>(
    '../../scripts/verification/core-v2-contract/fold-data-foundation.mjs',
  ),
  loadRuntime<ObservationRuntime>('../../scripts/verification/core-v2-contract/observe.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { createDataFoundationHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { DATA_FOUNDATION_FOLD_REVISION, foldDataFoundationExecution } = foldRuntime;
const { createSemanticObservation } = observationRuntime;
const { compareObservation } = compareRuntime;

const DOMAINS = Object.freeze([
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
]);

let catalog: ExecutorCatalog;
let normalizedEvidence: NormalizedEvidence;

beforeAll(async () => {
  [catalog, normalizedEvidence] = await Promise.all([
    loadExecutorCatalog(),
    readNormalizedEvidence(),
  ]);
});

describe('PatchMap data-foundation actual-only fold', () => {
  it('is import-free and browser-safe behind the verifier dependency firewall', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-data-foundation.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(DATA_FOUNDATION_FOLD_REVISION).toBe('core-v2-data-foundation-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*observe\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it.each([
    ['DAT-003', 9, 0],
    ['DAT-004', 23, 3],
    ['DAT-005', 18, 0],
  ] as const)(
    'folds %s through the real product adapter and reports %i passing and %i failing assertions',
    async (caseId, passed, failed) => {
      const run = await executeAndFold(caseId);
      const observed = createSemanticObservation({ observation: run.folded.actual });
      const comparison = compareObservation({
        expectedCase: normalizedCase(caseId),
        actual: run.folded.actual,
        fixtures: run.folded.fixtures,
        captures: run.folded.captures,
      });

      expect(run.engineFactoryCalls).toBe(0);
      expect(run.execution.status).toBe('completed');
      expect(run.execution.eventJournal).toEqual([]);
      expect(run.execution.eventJournalFailures).toEqual([]);
      expect(run.execution.terminalSnapshot).toBeNull();
      expect(run.execution.terminalSemanticProbe).toBeNull();
      expect(valueAt(run.folded.actual, 'resources.cleanup.status')).toBe('completed');
      expect(DOMAINS.every((domain) => isRecord(run.folded.actual[domain]))).toBe(true);
      expect(observed.actualSemanticSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(observed.actualObservationSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(comparison.passed).toBe(passed);
      expect(comparison.failed).toBe(failed);
      expect(isDeepFrozen(run.folded)).toBe(true);
      expect(JSON.stringify(run.folded.actual)).not.toContain('"status":"pass"');
    },
  );

  it('projects DAT-003 geometry and both direct closed-registry validation diagnostics', async () => {
    const { folded } = await executeAndFold('DAT-003');

    expect(valueAt(folded.actual, 'geometry.contentBox')).toEqual([10, 7, 180, 88]);
    expect(valueAt(folded.actual, 'scene.components.pct-string.width')).toBe(90);
    expect(valueAt(folded.actual, 'scene.components.pct-object.width')).toBe(90);
    expect(valueAt(folded.actual, 'scene.components.calc.width')).toBe(160);
    expect(valueAt(folded.actual, 'geometry.equivalentForms')).toBe(true);
    expect(valueAt(folded.actual, 'outcome.validation.partial-size.code')).toBe('INVALID_VALUE');
    expect(valueAt(folded.actual, 'outcome.validation.partial-size.path')).toBe(
      '$.validation.partial-size.height',
    );
    expect(valueAt(folded.actual, 'outcome.validation.non-finite.code')).toBe('INVALID_VALUE');
    expect(valueAt(folded.actual, 'outcome.validation.non-finite.path')).toBe(
      '$.validation.non-finite.width',
    );
    expect(valueAt(folded.actual, 'outcome.validation.partial-size.authoritativeSceneUnchanged'))
      .toBe(true);
    expect(valueAt(folded.actual, 'outcome.validation.non-finite.authoritativeSceneUnchanged'))
      .toBe(true);
    expect(valueAt(folded.actual, 'scene.revision')).toBe(1);
    expect(valueAt(folded.actual, 'outcome.recorded')).toBe(true);
  });

  it('projects DAT-004 colors while preserving all three immutable diagnostic disagreements', async () => {
    const { folded } = await executeAndFold('DAT-004');
    const comparison = compareObservation({
      expectedCase: normalizedCase('DAT-004'),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });
    const failedPaths = comparison.assertions
      .filter(({ passed }) => !passed)
      .map(({ path }) => path);

    expect(valueAt(folded.actual, 'scene.A.colors.primary.default')).toBe('#0c73bfff');
    expect(valueAt(folded.actual, 'scene.B.colors.primary.default')).toBe('#112233ff');
    expect(valueAt(folded.actual, 'scene.A.theme')).toEqual({
      'primary.default': '#0c73bfff',
    });
    expect(valueAt(folded.actual, 'scene.B.theme')).toEqual({
      'primary.default': '#112233ff',
    });
    expect(valueAt(folded.actual, 'paint.colorInputs.typed-array.rgba')).toBe('#ff800080');
    expect(valueAt(folded.actual, 'paint.colorInputs.pixijs-color-object.rgba')).toBe(
      '#0c223840',
    );
    expect(valueAt(folded.actual, 'paint.commandCount')).toBe(0);
    expect(valueAt(folded.actual, 'paint._availability.commandCount')).toBe(
      'derived-from-zero-engine-and-publications',
    );
    expect(valueAt(folded.actual, 'outcome.colorInputs.callerValuesUnchanged')).toBe(true);

    for (const id of ['non-finite-typed-array', 'infinite-color-object']) {
      expect(valueAt(folded.actual, `outcome.colorInputs.${id}.applied`)).toBe(false);
      expect(valueAt(folded.actual, `outcome.colorInputs.${id}.code`)).toBe('INVALID_VALUE');
      expect(valueAt(folded.actual, `outcome.colorInputs.${id}.publicationCount`)).toBe(0);
      expect(valueAt(folded.actual, `scene.colorInputs.${id}.authoritativeSceneUnchanged`))
        .toBe(true);
    }
    expect(valueAt(folded.actual, 'outcome.validation.missing.path.code')).toBe('INVALID_VALUE');
    expect(valueAt(folded.actual, 'outcome.validation.missing.path.path')).toBe('$[0].fill');
    expect(failedPaths).toEqual([
      '/outcome/validation/missing/path/code',
      '/outcome/colorInputs/non-finite-typed-array/code',
      '/outcome/colorInputs/infinite-color-object/code',
    ]);
    expect(JSON.stringify(folded.actual)).not.toContain('INVALID_COLOR');
  });

  it('projects DAT-005 cell IDs into pointer-safe nested segments and retains transition stages', async () => {
    const { folded } = await executeAndFold('DAT-005');

    expect(valueAt(folded.actual, 'scene.grid.activeIds.initial')).toEqual([
      'grid.0.0',
      'grid.0.2',
      'grid.1.0',
      'grid.1.1',
    ]);
    expect(valueAt(folded.actual, 'scene.grid.cells.grid.0.2.label')).toBe('B');
    expect(valueAt(folded.actual, 'scene.grid.cells.grid.1.0.localPosition')).toEqual([0, 13]);
    expect(valueAt(folded.actual, 'scene.grid.cells.grid.0.1.afterActivate.visible')).toBe(true);
    expect(valueAt(folded.actual, 'scene.grid.cells.grid.0.1.afterDeactivate.visible')).toBe(false);
    expect(valueAt(folded.actual, 'scene.grid.cells.grid.0.1.afterDeactivate.logicalCount')).toBe(1);
    expect(valueAt(folded.actual, 'scene.grid.edge.ragged.positions')).toEqual([
      [0, 0],
      [44, 0],
      [0, 13],
    ]);
    expect(valueAt(folded.actual, 'scene.grid.edge.empty.localBounds')).toEqual([0, 0, 0, 0]);
    expect(valueAt(folded.actual, 'scene.grid.edge.duplicateLabels.identityCollisionCount')).toBe(0);
    expect(valueAt(folded.actual, 'outcome.input.gridTemplate')).toEqual(
      valueAt(folded.fixtures, 'grid'),
    );
    expect(valueAt(folded.actual, 'scene.hierarchy.nodeCount')).toBeGreaterThanOrEqual(0);
    expect(valueAt(folded.actual, 'geometry.finiteValueCount')).toBeGreaterThanOrEqual(0);
    expect(valueAt(folded.actual, 'scene.revision')).toBe(3);
  });

  it('leaves unobserved facts unavailable instead of inventing semantic values', async () => {
    const { folded } = await executeAndFold('DAT-003');

    expect(valueAt(folded.actual, 'text._availability.status')).toBe('not-exercised');
    expect(folded.actual.text).not.toHaveProperty('sourceCount');
    expect(folded.actual.paint).not.toHaveProperty('commandCount');
    expect(folded.actual.interaction).not.toHaveProperty('selectionIds');
    expect(folded.actual.history).not.toHaveProperty('depth');
    expect(folded.actual.resources).not.toHaveProperty('canvasCount');
  });

  it('is deterministic, deeply frozen, and detached from all caller-owned roots', async () => {
    const firstRun = await executeAndFold('DAT-003', true);
    const secondRun = await executeAndFold('DAT-003', true);

    expect(JSON.stringify(secondRun.folded)).toBe(JSON.stringify(firstRun.folded));
    expect(isDeepFrozen(firstRun.folded)).toBe(true);

    const params = firstRun.plan.fixture.setup.params as JsonRecord;
    const componentSizes = params.componentSizes as unknown[];
    componentSizes.push('caller-mutation');
    const diagnostic = valueAt(
      firstRun.executionInput,
      'actionResults.2.delta.actual.diagnostic',
    );
    if (!isRecord(diagnostic)) throw new Error('Missing mutable diagnostic input');
    diagnostic.code = 'CALLER_MUTATION';

    expect(firstRun.folded.fixtures.componentSizes).not.toContain('caller-mutation');
    expect(valueAt(firstRun.folded.actual, 'outcome.validation.partial-size.code')).toBe(
      'INVALID_VALUE',
    );
  });

  it('rejects capture collisions, duplicate captures, action drift, and browser collisions', async () => {
    const run = await executeAndFold('DAT-003', true);
    const checkpoint = {
      id: 'collision',
      phase: 'after-action',
      afterActionIndex: 0,
      paths: ['contentBox'],
    };
    const plan = structuredClone(run.plan) as unknown as MutablePlan;
    plan.fixture.captureCheckpoints = [checkpoint];

    const collisionExecution = structuredClone(run.executionInput) as unknown as MutableExecution;
    collisionExecution.bindings = { collision: { source: 'binding' } };
    collisionExecution.captures = [{
      id: 'collision',
      phase: 'after-action',
      afterActionIndex: 0,
      values: { contentBox: [10, 7, 180, 88] },
    }];
    expect(() => fold(plan, collisionExecution)).toThrow(/collides/u);

    const duplicateExecution = structuredClone(run.executionInput) as unknown as MutableExecution;
    duplicateExecution.captures = [
      {
        id: 'collision',
        phase: 'after-action',
        afterActionIndex: 0,
        values: { contentBox: [10, 7, 180, 88] },
      },
      {
        id: 'collision',
        phase: 'after-action',
        afterActionIndex: 0,
        values: { contentBox: [10, 7, 180, 88] },
      },
    ];
    expect(() => fold(plan, duplicateExecution)).toThrow(/duplicate capture/u);

    const drifted = structuredClone(run.plan) as unknown as MutablePlan;
    const firstAction = drifted.fixture.actionTrace[0];
    if (firstAction === undefined) throw new Error('Missing drift action');
    firstAction.type = 'resolveColors';
    expect(() => fold(drifted, run.executionInput)).toThrow(/materialized actionTrace drift|action 0 type/u);

    expect(() => fold(run.plan, run.executionInput, {
      $schema: 'patch-map-browser-probe/1',
      caseId: 'DAT-003',
      geometry: { contentBox: [0, 0, 0, 0] },
    })).toThrow(/collides/u);
  });
});

interface MutablePlan extends MaterializedCase {
  fixture: MaterializedCase['fixture'] & {
    actionTrace: Array<{ index: number; type: string; operands: JsonRecord }>;
    captureCheckpoints: JsonRecord[];
  };
}

interface MutableExecution extends CaseExecution {
  bindings: JsonRecord;
  captures: JsonRecord[];
}

async function executeAndFold(
  caseId: string,
  mutableInputs = false,
): Promise<{
  plan: MaterializedCase;
  execution: CaseExecution;
  executionInput: CaseExecution;
  folded: FoldResult;
  engineFactoryCalls: number;
}> {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (selected === undefined) throw new Error(`Missing approved case ${caseId}`);
  const materialized = materializeCase(selected, { size: '100', seed: '319' });
  const plan = mutableInputs ? structuredClone(materialized) : materialized;
  const instrumentation = { pixiConstructionCount: 0 };
  const handlers = createDataFoundationHandlerEntries(createProductAdapter(instrumentation));
  let engineFactoryCalls = 0;
  const execution = await executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory() {
      engineFactoryCalls += 1;
      throw new Error('data-foundation fold must not allocate an engine');
    },
    datasets: new Map(),
    clock: new ManualClock(),
    handlerEntries: handlers,
  });
  const executionInput = mutableInputs ? structuredClone(execution) : execution;
  const folded = fold(plan, executionInput);
  return { plan, execution, executionInput, folded, engineFactoryCalls };
}

function fold(
  plan: MaterializedCase,
  execution: CaseExecution,
  browserProbe?: Readonly<JsonRecord>,
): FoldResult {
  return foldDataFoundationExecution({
    casePlan: plan,
    execution,
    provenance: {
      runner: 'contract-data-foundation-fold-test',
      packageBinding: 'source-product-adapter',
      codeCommit: 'test-source-tree',
      packedPackageSha256: 'not-packed-in-targeted-unit-test',
    },
    environment: {
      runtime: 'vitest',
      renderer: 'not-allocated',
      browserVersion: 'not-headed-in-targeted-unit-test',
    },
    ...(browserProbe === undefined ? {} : { browserProbe }),
  });
}

function createProductAdapter(
  instrumentation: { pixiConstructionCount: number },
): Readonly<JsonRecord> {
  return Object.freeze({
    createColorResolver: createPatchMapColorResolver,
    constructPixiColor(value: unknown) {
      instrumentation.pixiConstructionCount += 1;
      return new Color(value as ColorSource);
    },
    resolveComponentSize: resolvePatchMapComponentSize,
    resolveContentBox: resolvePatchMapContentBox,
    materializeGrid: materializePatchMapGrid,
    setGridCell: setPatchMapGridCell,
  });
}

function normalizedCase(caseId: string): JsonRecord {
  const record = normalizedEvidence.cases.find(({ id }) => id === caseId);
  if (record === undefined) throw new Error(`Missing normalized record ${caseId}`);
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

function valueAt(root: unknown, path: string): unknown {
  let cursor = root;
  for (const segment of path.split('.')) {
    if (!isRecord(cursor) && !Array.isArray(cursor)) throw new Error(`Missing ${path}`);
    if (!Object.hasOwn(cursor, segment)) throw new Error(`Missing ${path}`);
    cursor = Reflect.get(cursor, segment) as unknown;
  }
  return cursor;
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

class ManualClock implements ManualClockContract {
  #time = 0;

  public now(): number {
    return this.#time;
  }

  public async advanceTo(timeMs: number): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < this.#time) {
      throw new Error(`invalid clock advance ${timeMs}`);
    }
    this.#time = timeMs;
    await Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}
