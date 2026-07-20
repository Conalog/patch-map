import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

type JsonRecord = Record<string, unknown>;

interface ContractAction {
  index: number;
  type: string;
  operands: JsonRecord;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
    readonly actionTrace: readonly Readonly<ContractAction>[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

interface MaterializedCase extends CatalogCase {
  readonly rootTestId: string;
  readonly fixtureSha256: string;
  readonly actionTrace: readonly Readonly<ContractAction>[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ExecutorCatalog {
  readonly actionDefinitions: readonly unknown[];
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

interface FoldResult {
  readonly actual: JsonRecord;
  readonly fixtures: JsonRecord;
  readonly captures: JsonRecord;
}

interface FoldRuntime {
  readonly LIFECYCLE_DESTROY_FOLD_REVISION: string;
  foldLifecycleDestroyExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: JsonRecord;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
    }>,
  ): FoldResult;
}

interface ObservationRuntime {
  createSemanticObservation(
    this: void,
    options: Readonly<{ observation: JsonRecord }>,
  ): Readonly<{ actualSemanticSha256: string; actualObservationSha256: string }>;
}

interface ComparisonRuntime {
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
    assertions: readonly Readonly<{
      path: string;
      passed: boolean;
      failure: Readonly<{ code: string }> | null;
    }>[];
  }>;
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

const [catalogRuntime, materializeRuntime, foldRuntime, observationRuntime, comparisonRuntime] =
  await Promise.all([
    loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
    loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
    loadRuntime<FoldRuntime>(
      '../../scripts/verification/core-v2-contract/fold-lifecycle-destroy.mjs',
    ),
    loadRuntime<ObservationRuntime>('../../scripts/verification/core-v2-contract/observe.mjs'),
    loadRuntime<ComparisonRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
  ]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { LIFECYCLE_DESTROY_FOLD_REVISION, foldLifecycleDestroyExecution } = foldRuntime;
const { createSemanticObservation } = observationRuntime;
const { compareObservation } = comparisonRuntime;

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

let plan: MaterializedCase;
let normalized: NormalizedEvidence;

beforeAll(async () => {
  const [catalog, evidence] = await Promise.all([
    loadExecutorCatalog(),
    readNormalizedEvidence(),
  ]);
  const selected = selectCatalogCases(catalog, { caseIds: ['LIF-005'] })[0];
  if (selected === undefined) throw new Error('Missing approved LIF-005 case');
  plan = materializeCase(selected, { size: '100', seed: '319' });
  normalized = evidence;
});

describe('LIF-005 actual-only lifecycle fold', () => {
  it('is import-free and browser-safe behind the verifier dependency firewall', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-lifecycle-destroy.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceStem = ['normalized', 'expected'].join('-');

    expect(LIFECYCLE_DESTROY_FOLD_REVISION).toBe('core-v2-lifecycle-destroy-fold/1');
    expect(source).not.toContain(forbiddenEvidenceStem);
    expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*observe\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it('projects all twelve immutable assertions from actual lifecycle facts', () => {
    const folded = fold(makeExecution());
    const observed = createSemanticObservation({ observation: folded.actual });
    const comparison = compareObservation({
      expectedCase: normalizedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(DOMAINS.every((domain) => isRecord(folded.actual[domain]))).toBe(true);
    expect(observed.actualSemanticSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(observed.actualObservationSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(comparison.passed).toBe(12);
    expect(comparison.failed).toBe(0);
    expect(valueAt(folded.actual, 'events.destroyed.perGeneration')).toBe(1);
    expect(valueAt(folded.actual, 'events.destroyed.generationCount')).toBe(11);
    expect(valueAt(folded.actual, 'resources.afterDestroy')).toEqual(zeroResources());
    expect(valueAt(folded.actual, 'scene.afterCycles.dom.canvasCount')).toBe(1);
    expect(valueAt(folded.actual, 'scene.afterCycles.callbackMultiplier')).toBe(1);
    expect(valueAt(folded.actual, 'scene.afterCycles.resources')).toEqual(zeroResources());
    expect(valueAt(folded.actual, 'revisions.lifecycle.generation')).toBe(1);
    expect(valueAt(folded.actual, 'history.depth')).toBe(0);
    expect(valueAt(folded.actual, 'resources.retainedDelta')).toEqual({ hostReferences: 0 });
    expect(valueAt(folded.actual, 'outcome.destroy')).toEqual({
      firstReturned: true,
      repeatedReturned: false,
      sameTerminalResources: true,
    });
    expect(isDeepFrozen(folded)).toBe(true);
    expect(JSON.stringify(folded.actual)).not.toContain('"status":"pass"');
  });

  it('retains a non-zero resource mismatch without changing or masking it', () => {
    const execution = makeExecution();
    const firstDestroy = actionActual(execution, 2);
    const resources = requireRecord(firstDestroy.resources, 'first destroy resources');
    const tickerTasks = requireRecord(resources.tickerTasks, 'ticker tasks');
    tickerTasks.count = 1;
    const folded = fold(execution);
    const comparison = compareObservation({
      expectedCase: normalizedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(valueAt(folded.actual, 'resources.afterDestroy.tickerTasks.count')).toBe(1);
    expect(comparison.passed).toBe(11);
    expect(comparison.failed).toBe(1);
    expect(comparison.assertions.filter(({ passed }) => !passed).map(({ path, failure }) => (
      `${path}:${failure?.code ?? 'UNKNOWN'}`
    ))).toEqual(['/resources/afterDestroy/tickerTasks/count:VALUE_MISMATCH']);
  });

  it('leaves missing destroyed-event evidence unresolved rather than deriving a count', () => {
    const execution = makeExecution();
    execution.eventJournal = [];
    const folded = fold(execution);
    const comparison = compareObservation({
      expectedCase: normalizedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(valueAt(folded.actual, 'events.destroyed')).not.toHaveProperty('perGeneration');
    expect(comparison.passed).toBe(11);
    expect(comparison.failed).toBe(1);
    expect(comparison.assertions.filter(({ passed }) => !passed).map(({ path, failure }) => (
      `${path}:${failure?.code ?? 'UNKNOWN'}`
    ))).toEqual(['/events/destroyed/perGeneration:UNRESOLVED_PATH']);
  });

  it('counts absent generations as zero when the destroyed-event journal is only partial', () => {
    const execution = makeExecution();
    const journal = execution.eventJournal;
    if (!Array.isArray(journal)) throw new Error('Missing event journal');
    execution.eventJournal = journal.filter((entry) => (
      isRecord(entry) && entry.generation === 1
    ));
    const folded = fold(execution);
    const comparison = compareObservation({
      expectedCase: normalizedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(valueAt(folded.actual, 'events.destroyed.perGeneration')).toBeNull();
    expect(valueAt(folded.actual, 'events.destroyed.countsByGeneration')).toEqual({
      1: 1,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
    });
    expect(comparison.passed).toBe(11);
    expect(comparison.failed).toBe(1);
    expect(comparison.assertions.filter(({ passed }) => !passed).map(({ path, failure }) => (
      `${path}:${failure?.code ?? 'UNKNOWN'}`
    ))).toEqual(['/events/destroyed/perGeneration:VALUE_MISMATCH']);
  });

  it('is deterministic, detached, deeply frozen, and rejects action drift', () => {
    const callerPlan = structuredClone(plan);
    const callerExecution = makeExecution();
    const first = foldLifecycleDestroyExecution({
      casePlan: callerPlan,
      execution: callerExecution,
      provenance: provenance(),
      environment: environment(),
    });
    const second = fold(makeExecution());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(isDeepFrozen(first)).toBe(true);
    requireRecord(actionActual(callerExecution, 2).resources, 'caller resources').callerMutation = 1;
    expect(first.actual.resources).not.toHaveProperty('callerMutation');

    const drifted = structuredClone(plan) as unknown as MutablePlan;
    const firstAction = drifted.fixture.actionTrace[0];
    if (firstAction === undefined) throw new Error('Missing first action');
    firstAction.type = 'destroy';
    drifted.actionTrace = structuredClone(drifted.fixture.actionTrace);
    expect(() => foldLifecycleDestroyExecution({
      casePlan: drifted,
      execution: makeExecution(),
      provenance: provenance(),
      environment: environment(),
    })).toThrow(/action 0 type/u);
  });
});

interface MutablePlan extends MaterializedCase {
  actionTrace: ContractAction[];
  fixture: MaterializedCase['fixture'] & { actionTrace: ContractAction[] };
}

function fold(execution: JsonRecord): FoldResult {
  return foldLifecycleDestroyExecution({
    casePlan: plan,
    execution,
    provenance: provenance(),
    environment: environment(),
  });
}

function provenance(): JsonRecord {
  return {
    implementation: 'core-v2',
    codeCommit: 'test-code-commit',
    packedPackageSha256: 'test-packed-package-sha256',
  };
}

function environment(): JsonRecord {
  return { runtime: 'vitest', browserVersion: 'test-browser' };
}

function makeExecution(): JsonRecord {
  const resources = zeroResources();
  const actions = [
    actionResult(0, 'initialize', {
      requestedAtMs: 0,
      result: { lifecycle: 'ready-empty' },
      snapshot: snapshot('ready-empty', 1),
    }),
    actionResult(1, 'loadDataset', {
      datasetRef: 'interactive-scene',
      loadedAtMs: 1,
      result: { lifecycle: 'scene-ready', sceneRevision: 1 },
      snapshot: snapshot('scene-ready', 1),
      input: { beforeFingerprint: 'fnv1a64:0000000000000001', afterFingerprint: 'fnv1a64:0000000000000001', unchanged: true },
    }),
    actionResult(2, 'destroy', {
      call: 1,
      requestedAtMs: 2,
      returned: true,
      before: snapshot('scene-ready', 1),
      after: snapshot('destroyed', 0),
      resources,
    }),
    actionResult(3, 'destroy', {
      call: 2,
      requestedAtMs: 3,
      returned: false,
      before: snapshot('destroyed', 0),
      after: snapshot('destroyed', 0),
      resources: structuredClone(resources),
    }),
    actionResult(4, 'repeatLifecycle', {
      cycles: 10,
      startTimeMs: 10,
      datasetRef: 'interactive-scene',
      callbackCount: 10,
      callbackMultiplier: 1,
      cycleRecords: Array.from({ length: 10 }, (_, index) => ({
        cycle: index + 1,
        readyCallbackCount: 1,
      })),
      afterCycles: snapshot('scene-ready', 1),
      activeResources: activeResources(),
      releasedLeakBudget: structuredClone(resources),
      retainedDelta: { hostReferences: 0 },
      input: { beforeFingerprint: 'fnv1a64:0000000000000001', afterFingerprint: 'fnv1a64:0000000000000001', unchanged: true },
    }),
  ];
  const eventJournal = [];
  let sequence = 0;
  for (let generation = 1; generation <= 11; generation += 1) {
    eventJournal.push({
      sequence: ++sequence,
      generation,
      role: generation === 1 ? 'main' : `session:${generation - 1}`,
      event: 'ready',
      actual: { lifecycle: 'ready-empty' },
    });
    eventJournal.push({
      sequence: ++sequence,
      generation,
      role: generation === 1 ? 'main' : `session:${generation - 1}`,
      event: 'destroyed',
      actual: { lifecycleGeneration: 1 },
    });
  }
  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId: 'LIF-005',
    caseType: 'capability',
    status: 'completed',
    actionResults: actions,
    captures: [],
    bindings: {},
    eventJournal,
    eventJournalFailures: [],
    datasetObservations: {},
    hostSeamDelta: null,
    terminalSnapshot: snapshot('scene-ready', 1),
    terminalSemanticProbe: { revision: 'core-v2-semantic-probe/1' },
    cleanup: { status: 'completed', declaredActions: ['destroy-case'], releases: [], errors: [] },
    error: null,
  };
}

function actionResult(index: number, type: string, actual: JsonRecord): JsonRecord {
  return {
    index,
    type,
    handlerId: `contract/${type}`,
    status: 'completed',
    startedAtMs: index,
    completedAtMs: index,
    delta: {
      $schema: 'core-v2-semantic-observation-delta/1',
      caseId: 'LIF-005',
      actionIndex: index,
      actionType: type,
      actual,
      semanticProbe: {},
    },
  };
}

function snapshot(lifecycle: string, canvasCount: number): JsonRecord {
  return {
    lifecycle,
    revisions: { lifecycleGeneration: 1, sceneRevision: lifecycle === 'scene-ready' ? 1 : 0 },
    historyDepth: 0,
    pendingWork: 0,
    resources: { canvasCount, subscriptions: { active: canvasCount === 0 ? 0 : 6 } },
  };
}

function zeroResources(): JsonRecord {
  return {
    dom: { canvasCount: 0 },
    subscriptions: { count: 0 },
    tickerTasks: { count: 0 },
    animations: { count: 0 },
    history: { depth: 0 },
    retained: { hostReferences: 0 },
  };
}

function activeResources(): JsonRecord {
  return {
    dom: { canvasCount: 1 },
    subscriptions: { count: 6 },
    tickerTasks: { count: 0 },
    animations: { count: 0 },
    history: { depth: 0 },
    retained: { hostReferences: 1 },
  };
}

function actionActual(execution: JsonRecord, index: number): JsonRecord {
  const results = execution.actionResults;
  if (!Array.isArray(results)) throw new Error('Missing action results');
  const result = requireRecord(results[index], `action ${index}`);
  const delta = requireRecord(result.delta, `action ${index} delta`);
  return requireRecord(delta.actual, `action ${index} actual`);
}

function normalizedCase(): JsonRecord {
  const record = normalized.cases.find((candidate) => candidate.id === 'LIF-005');
  if (record === undefined) throw new Error('Missing normalized LIF-005 case');
  return record;
}

async function readNormalizedEvidence(): Promise<NormalizedEvidence> {
  const source = await readFile(
    fileURLToPath(new URL(
      '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json',
      import.meta.url,
    )),
    'utf8',
  );
  return JSON.parse(source) as NormalizedEvidence;
}

function valueAt(root: JsonRecord, path: string): unknown {
  let value: unknown = root;
  for (const segment of path.split('.')) {
    if (!isRecord(value) || !Object.hasOwn(value, segment)) {
      throw new Error(`Missing path ${path}`);
    }
    value = value[segment];
  }
  return value;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be a record`);
  return value;
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((nested) => isDeepFrozen(nested, seen));
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
