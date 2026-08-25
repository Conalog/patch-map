import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from './support/contract-verifier-import-firewall';

type JsonRecord = Record<string, unknown>;

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

interface CatalogRuntime {
  loadExecutorCatalog(this: void): Promise<Readonly<{ readonly cases: readonly CatalogCase[] }>>;
  selectCatalogCases(
    this: void,
    catalog: Readonly<{ readonly cases: readonly CatalogCase[] }>,
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

interface FoldRuntime {
  readonly ASSET_FOLD_REVISION: string;
  foldAssetExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: JsonRecord;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
    }>,
  ): Readonly<{ actual: JsonRecord; fixtures: JsonRecord; captures: JsonRecord }>;
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

const [catalogRuntime, materializeRuntime, foldRuntime, compareRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/patch-map-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/patch-map-contract/materialize.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/patch-map-contract/fold-assets.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/patch-map-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { ASSET_FOLD_REVISION, foldAssetExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

let catalog: Awaited<ReturnType<CatalogRuntime['loadExecutorCatalog']>>;
let normalized: NormalizedEvidence;

beforeAll(async () => {
  [catalog, normalized] = await Promise.all([
    loadExecutorCatalog(),
    readNormalizedEvidence(),
  ]);
});

describe('AST-001 actual-only asset fold', () => {
  it('is import-free and projects all stage-specific product facts into fourteen domains', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-contract/fold-assets.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    expect(ASSET_FOLD_REVISION).toBe('patch-map-assets-fold/1');
    await assertCommittedVerifierEntryImportFirewall('fold-assets.mjs', 'fold');
    expect(source).not.toMatch(/node:|readFile|compareObservation|catalog-normalized/u);

    const folded = fold();
    expect(Object.keys(folded.actual)).toEqual([
      '$schema',
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
    expect(valueAt(folded.actual, 'paint.builtins.aliases')).toEqual(IMAGE_ALIASES);
    expect(valueAt(folded.actual, 'text.fonts.weights')).toEqual(FONT_WEIGHTS);
    expect(valueAt(folded.actual, 'resources.cache.device.resourceCount')).toBe(1);
    expect(valueAt(folded.actual, 'resources.cache.device.leaseCount.afterA')).toBe(1);
    expect(valueAt(folded.actual, 'resources.cache.device.leaseCount.afterB')).toBe(0);
    expect(valueAt(folded.actual, 'resources.afterDestroy')).toEqual({
      resourceCount: 0,
      leaseCount: 0,
      pendingCount: 0,
    });
    expect(valueAt(folded.actual, 'outcome.requiredFailure')).toEqual({
      code: 'ASSET_LOAD_FAILED',
      initState: 'rejected',
    });
    expect(valueAt(folded.actual, 'events.requiredFailure.readyCount')).toBe(0);
    expect(valueAt(folded.actual, 'resources.requiredFailure')).toEqual({
      canvasCount: 0,
      pendingCount: 0,
      leaseCount: 0,
    });
    expect(valueAt(folded.actual, 'outcome.aliasConflict.code')).toBe('CONFLICT');
    expect(Object.isFrozen(folded)).toBe(true);
    expect(Object.isFrozen(folded.actual.resources)).toBe(true);
  });

  it('honestly compares 17/18 and preserves only the closed-registry conflict mismatch', () => {
    const folded = fold();
    const comparison = compareObservation({
      expectedCase: normalizedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(comparison.assertions).toHaveLength(18);
    expect(comparison).toMatchObject({ passed: 17, failed: 1 });
    const failures = comparison.assertions.filter(({ passed }) => !passed);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.path).toBe('/outcome/aliasConflict/code');
    expect(failures[0]?.failure?.code).toBe('VALUE_MISMATCH');
    expect(comparison.assertions.filter(({ path }) => (
      path === '/outcome/requiredFailure/initState'
    ))).toHaveLength(2);
    expect(comparison.assertions.filter(({ path }) => (
      path === '/outcome/requiredFailure/initState'
    )).every(({ passed }) => passed)).toBe(true);
  });

  it('rejects trace drift, mutated descriptors, and incomplete resource proofs', () => {
    const driftedPlan: MaterializedCase = structuredClone(selectedCase());
    (driftedPlan.fixture.actionTrace[4]?.operands as JsonRecord).alias = 'other';
    expect(() => foldAssetExecution(foldOptions({ casePlan: driftedPlan })))
      .toThrow(/actionTrace drift|action 4 operands/u);

    const changedInput = executionFixture();
    (actionActual(changedInput, 7).input as JsonRecord).unchanged = false;
    expect(() => foldAssetExecution(foldOptions({ execution: changedInput })))
      .toThrow(/descriptor changed/u);

    const incomplete = executionFixture();
    delete ((actionActual(incomplete, 6).probe as JsonRecord).totals as JsonRecord).pendingCount;
    expect(() => foldAssetExecution(foldOptions({ execution: incomplete })))
      .toThrow(/totals keys/u);

    const missingIdentity = executionFixture();
    for (const index of [3, 4]) {
      const selected = ((actionActual(missingIdentity, index).probe as JsonRecord).selected as JsonRecord);
      selected.cacheKey = null;
      selected.resourceToken = null;
    }
    expect(() => foldAssetExecution(foldOptions({ execution: missingIdentity })))
      .toThrow(/acquire A cacheKey/u);
  });

  it('detaches and freezes output without mutating the execution input', () => {
    const execution = executionFixture();
    const before = JSON.stringify(execution);
    const folded = foldAssetExecution(foldOptions({ execution }));
    expect(JSON.stringify(execution)).toBe(before);
    (actionActual(execution, 4).probe as JsonRecord).callerMutation = true;

    expect(valueAt(folded.actual, 'resources.cache.device.resourceCount')).toBe(1);
    expect(folded.actual.resources).not.toHaveProperty('callerMutation');
  });
});

const IMAGE_ALIASES = ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'];
const FONT_WEIGHTS = [300, 400, 500, 600, 700];

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

function normalizedCase(): JsonRecord {
  const record = normalized.cases.find((candidate) => candidate.id === 'AST-001');
  if (record === undefined) throw new Error('Missing normalized AST-001 case');
  return record;
}

async function readNormalizedEvidence(): Promise<NormalizedEvidence> {
  const source = await readFile(
    fileURLToPath(new URL(
      '../../contracts/patch-map/evidence/catalog-normalized-expected.v1.json',
      import.meta.url,
    )),
    'utf8',
  );
  return JSON.parse(source) as NormalizedEvidence;
}

function fold() {
  return foldAssetExecution(foldOptions());
}

function foldOptions(overrides: Readonly<{
  readonly casePlan?: MaterializedCase;
  readonly execution?: JsonRecord;
}> = {}) {
  return {
    casePlan: overrides.casePlan ?? selectedCase(),
    execution: overrides.execution ?? executionFixture(),
    provenance: {
      implementation: 'patch-map',
      codeCommit: 'working-tree',
      packedPackageSha256: 'not-packed',
    },
    environment: { runtime: 'vitest', browserVersion: 'not-browser' },
  };
}

function executionFixture(): JsonRecord {
  const plan = selectedCase();
  const actuals = [
    registration('A'),
    registration('B'),
    requiredFailure(),
    acquisition('A', 1),
    acquisition('B', 2),
    destruction('A', 1, 1),
    destruction('B', 0, 0),
    aliasConflict(),
  ];
  return {
    $schema: 'patch-map-contract-case-execution/1',
    caseId: 'AST-001',
    caseType: 'capability',
    status: 'completed',
    actionResults: plan.actionTrace.map((action, index) => ({
      index,
      type: action.type,
      handlerId: `contract/${action.type}`,
      status: 'completed',
      startedAtMs: index,
      completedAtMs: index,
      delta: {
        $schema: 'patch-map-semantic-observation-delta/1',
        caseId: 'AST-001',
        actionIndex: index,
        actionType: action.type,
        actual: actuals[index],
        semanticProbe: null,
      },
    })),
    captures: [],
    bindings: {},
    eventJournal: [],
    eventJournalFailures: [],
    datasetObservations: {},
    hostSeamDelta: null,
    terminalSnapshot: engineSnapshot('destroyed'),
    terminalSemanticProbe: null,
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: Array.from({ length: 3 }, (_, index) => ({
        role: `asset:${index}`,
        remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
      })),
      errors: [],
    },
    error: null,
  };
}

function registration(instanceId: string): JsonRecord {
  return {
    instanceId,
    result: { registration: 'accepted' },
    snapshot: engineSnapshot('new'),
    probe: probe('device', 0, 0, 0),
  };
}

function requiredFailure(): JsonRecord {
  return {
    request: { alias: 'required-fixture', sourceFingerprint: 'fnv1a64:required' },
    initState: 'rejected',
    result: null,
    error: { name: 'Error', code: 'ASSET_LOAD_FAILED', message: 'load failed' },
    readyCount: 0,
    snapshot: engineSnapshot('new'),
    probe: probe('required-fixture', 0, 0, 0),
    release: {},
    afterReleaseProbe: probe('required-fixture', 0, 0, 0),
  };
}

function acquisition(instanceId: string, leaseCount: number): JsonRecord {
  return {
    instanceId,
    alias: 'device',
    result: { cacheKey: 'cache:device' },
    probe: probe('device', 1, leaseCount, 0),
  };
}

function destruction(instanceId: string, resourceCount: number, leaseCount: number): JsonRecord {
  return {
    instanceId,
    release: { remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 } },
    probe: probe('device', resourceCount, leaseCount, 0),
  };
}

function aliasConflict(): JsonRecord {
  return {
    alias: 'device',
    settlement: 'rejected',
    result: null,
    error: { name: 'Error', code: 'CONFLICT', message: 'closed registry' },
    input: {
      beforeFingerprint: 'fnv1a64:descriptor',
      afterFingerprint: 'fnv1a64:descriptor',
      unchanged: true,
    },
    probe: probe('device', 0, 0, 0),
  };
}

function probe(alias: string, resourceCount: number, leaseCount: number, pendingCount: number): JsonRecord {
  return {
    catalog: { imageAliases: [...IMAGE_ALIASES], fontWeights: [...FONT_WEIGHTS] },
    selected: {
      alias,
      cacheKey: resourceCount === 0 ? null : 'cache:device',
      resourceToken: resourceCount === 0 ? null : 'resource:device',
      resourceCount,
      leaseCount,
      pendingUserCount: pendingCount,
    },
    totals: { resourceCount, leaseCount, pendingCount },
  };
}

function engineSnapshot(lifecycle: string): JsonRecord {
  return {
    lifecycle,
    revisions: { lifecycleGeneration: 0, sceneRevision: 0 },
    frameRevision: 0,
    resources: { canvasCount: 0, subscriptions: { active: 0 } },
    pendingWork: 0,
  };
}

function actionActual(execution: JsonRecord, index: number): JsonRecord {
  const results = execution.actionResults as JsonRecord[];
  const delta = results[index]?.delta as JsonRecord | undefined;
  if (delta === undefined || delta.actual === undefined) throw new Error(`Missing action ${index}`);
  return delta.actual as JsonRecord;
}

function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (
    current !== null && typeof current === 'object'
      ? (current as JsonRecord)[key]
      : undefined
  ), value);
}
