import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
}

interface ContractFixture {
  readonly setup: {
    readonly params: Readonly<Record<string, unknown>> & { readonly hostCssPx?: number[] };
  };
  readonly actionTrace: readonly ContractAction[];
  readonly cleanupTrace: readonly unknown[];
  readonly captureCheckpoints: readonly unknown[];
  readonly requiredObservationDomains: readonly string[];
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly title: string;
  readonly priority: 'P0' | 'P1';
  readonly capabilities: readonly string[];
  readonly labRoute: string;
  readonly rootTestId: string;
  readonly fixtureSha256: string;
  readonly expected: Readonly<{ ref: string; sha256: string }>;
  readonly fixture: ContractFixture;
}

interface ActionDefinition {
  readonly type: string;
  readonly handlerId: string;
}

interface ExecutorCatalog {
  readonly contractRevision: string;
  readonly observationRevision: string;
  readonly manifestSha256: string;
  readonly inventory: Readonly<Record<string, unknown>>;
  readonly tranches: Readonly<{ T1: readonly string[] }>;
  readonly opaqueBindings: Readonly<{
    expectedFile: Readonly<{ path: string; sha256: string }>;
  }>;
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly cases: readonly CatalogCase[];
}

interface MaterializedCase extends CatalogCase {
  readonly route: string;
  readonly routeParams: Readonly<{ size: string; seed: number }>;
  readonly actionTrace: readonly ContractAction[];
}

interface ExecutorPlan {
  readonly selection: Readonly<{ tranche: string | null; caseIds: readonly string[] }>;
  readonly routeParams: Readonly<{ size: string; seed: number }>;
  readonly routes: readonly Readonly<{ id: string; route: string; rootTestId: string }>[];
  readonly cases: readonly MaterializedCase[];
}

type Handler = (...args: unknown[]) => unknown;
type HandlerEntries = ReadonlyMap<string, unknown> | readonly (readonly [string, unknown])[];

interface HandlerCoverage {
  readonly requiredCount: number;
  readonly registeredCount: number;
  readonly handlerIds: readonly string[];
}

interface CatalogRuntime {
  readonly EXECUTOR_EVIDENCE_FILES: readonly string[];
  readonly T1_CASE_IDS: readonly string[];
  assertExecutorEvidenceFileAllowed(this: void, fileName: string): string;
  loadExecutorCatalog(this: void): Promise<ExecutorCatalog>;
  selectCatalogCases(
    this: void,
    catalog: ExecutorCatalog,
    selection?: Readonly<{ tranche?: string; caseIds?: readonly string[] }>,
  ): readonly CatalogCase[];
}

interface RegistryRuntime {
  assertExactHandlerCoverage(
    this: void,
    definitions: readonly ActionDefinition[],
    cases: readonly CatalogCase[],
    handlers: HandlerEntries,
  ): HandlerCoverage;
  createActionRegistry(this: void, definitions: readonly ActionDefinition[], handlers: HandlerEntries): Readonly<{
    assertCoverage(cases: readonly CatalogCase[]): HandlerCoverage;
    resolve(action: ContractAction): Handler;
  }>;
  requiredHandlerIds(
    this: void,
    definitions: readonly ActionDefinition[],
    cases: readonly CatalogCase[],
  ): readonly string[];
}

interface MaterializeRuntime {
  readonly CANONICAL_DATASET_SIZES: readonly string[];
  createExecutorPlan(
    this: void,
    catalog: ExecutorCatalog,
    options: Readonly<{ tranche?: string; caseIds?: readonly string[]; size: unknown; seed: unknown }>,
  ): ExecutorPlan;
  materializeCase(
    this: void,
    record: CatalogCase,
    routeOptions: Readonly<{ size: unknown; seed: unknown }>,
  ): MaterializedCase;
  parseCanonicalSeed(this: void, value: unknown): number;
  parseCanonicalSize(this: void, value: unknown): string;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

const [catalogRuntime, registryRuntime, materializeRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<RegistryRuntime>('../../scripts/verification/core-v2-contract/action-registry.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
]);

const {
  EXECUTOR_EVIDENCE_FILES,
  T1_CASE_IDS,
  assertExecutorEvidenceFileAllowed,
  loadExecutorCatalog,
  selectCatalogCases,
} = catalogRuntime;
const {
  assertExactHandlerCoverage,
  createActionRegistry,
  requiredHandlerIds,
} = registryRuntime;
const {
  CANONICAL_DATASET_SIZES,
  createExecutorPlan,
  materializeCase,
  parseCanonicalSeed,
  parseCanonicalSize,
} = materializeRuntime;

const EXPECTED_T1_IDS = [
  'LIF-001', 'LIF-002', 'LIF-003', 'LIF-004', 'LIF-005', 'LIF-006',
  'DAT-001', 'DAT-002', 'DAT-003', 'DAT-004', 'DAT-005', 'DAT-006', 'DAT-007', 'DAT-008',
  'DET-001', 'DET-002', 'DET-003', 'DET-004',
];

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('executor-safe Core v2 catalog', () => {
  it('validates the approved inventory without loading expected contents', () => {
    expect(catalog.inventory).toEqual({
      cases: 173,
      capabilityCases: 135,
      consumerJourneys: 38,
      priorities: { P0: 121, P1: 52 },
      actionDefinitions: 381,
      actionSteps: 646,
      routes: 173,
      rootTestIds: 173,
    });
    expect(catalog.cases).toHaveLength(173);
    expect(catalog.actionDefinitions).toHaveLength(381);
    expect(new Set(catalog.cases.map((record) => record.labRoute)).size).toBe(173);
    expect(new Set(catalog.cases.map((record) => record.rootTestId)).size).toBe(173);

    for (const record of catalog.cases) {
      expect(record.labRoute).toBe(`/lab/core-v2?scenario=${record.id}&size=<SIZE>&seed=<SEED>`);
      expect(record.rootTestId).toBe(`scenario-${record.id.toLowerCase()}`);
      expect(Object.keys(record.expected).sort()).toEqual(['ref', 'sha256']);
    }
  });

  it('owns an exact, ordered T1 tranche and deterministic case selection', () => {
    expect(T1_CASE_IDS).toEqual(EXPECTED_T1_IDS);
    expect(catalog.tranches.T1).toEqual(EXPECTED_T1_IDS);
    expect(selectCatalogCases(catalog, { tranche: 'T1' }).map((record) => record.id)).toEqual(EXPECTED_T1_IDS);
    expect(
      selectCatalogCases(catalog, { caseIds: ['PIX-001', 'LIF-001'] }).map((record) => record.id),
    ).toEqual(['PIX-001', 'LIF-001']);
    expect(selectCatalogCases(catalog)).toHaveLength(173);
  });

  it('rejects ambiguous, duplicate, malformed, and unknown selections', () => {
    expect(() => selectCatalogCases(catalog, { tranche: 'T1', caseIds: ['LIF-001'] })).toThrow(/either tranche or case IDs/);
    expect(() => selectCatalogCases(catalog, { tranche: 'T2' })).toThrow(/unknown tranche/);
    expect(() => selectCatalogCases(catalog, { caseIds: [] })).toThrow(/non-empty array/);
    expect(() => selectCatalogCases(catalog, { caseIds: ['LIF-001', 'LIF-001'] })).toThrow(/duplicate case ID/);
    expect(() => selectCatalogCases(catalog, { caseIds: ['lif-001'] })).toThrow(/invalid case ID/);
    expect(() => selectCatalogCases(catalog, { caseIds: ['ZZZ-999'] })).toThrow(/unknown case ID/);
  });

  it('enforces a positive executor evidence allowlist and source dependency firewall', async () => {
    const forbiddenFile = 'catalog-normalized-expected.v1.json';
    expect(EXECUTOR_EVIDENCE_FILES).not.toContain(forbiddenFile);
    expect(assertExecutorEvidenceFileAllowed('catalog-fixtures.v1.json')).toBe('catalog-fixtures.v1.json');
    expect(() => assertExecutorEvidenceFileAllowed(forbiddenFile)).toThrow(/read is not allowed/);
    expect(catalog.opaqueBindings.expectedFile.path).toBe(`evidence/${forbiddenFile}`);
    expect(catalog.opaqueBindings.expectedFile.sha256).toMatch(/^[a-f0-9]{64}$/);

    const executorSources = await Promise.all([
      '../../scripts/verification/core-v2-contract/catalog.mjs',
      '../../scripts/verification/core-v2-contract/materialize.mjs',
      '../../scripts/verification/core-v2-contract/action-registry.mjs',
    ].map(async (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')));

    for (const source of executorSources) {
      expect(source).not.toContain(forbiddenFile);
      expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/);
    }
  });
});

describe('executor-safe route materialization', () => {
  it.each(CANONICAL_DATASET_SIZES.map((size) => [size]))('accepts canonical size %s', (size) => {
    expect(parseCanonicalSize(size)).toBe(size);
  });

  it.each<[unknown]>([[100], [''], ['0100'], ['Production'], ['5000 '], ['production/']])('rejects non-canonical size %j', (size) => {
    expect(() => parseCanonicalSize(size)).toThrow(/size must be one of/);
  });

  it.each<[string, number]>([
    ['0', 0],
    ['319', 319],
    ['4294967295', 4_294_967_295],
  ])('accepts canonical seed %s', (seed, expected) => {
    expect(parseCanonicalSeed(seed)).toBe(expected);
  });

  it.each<[unknown]>([[319], [''], ['00'], ['01'], ['-1'], ['3.19'], [' 319'], ['319 '], ['4294967296']])('rejects non-canonical seed %j', (seed) => {
    expect(() => parseCanonicalSeed(seed)).toThrow(/seed must/);
  });

  it('creates the exact frozen T1 route plan', () => {
    const plan = createExecutorPlan(catalog, { tranche: 'T1', size: '500', seed: '319' });
    expect(plan.selection).toEqual({ tranche: 'T1', caseIds: EXPECTED_T1_IDS });
    expect(plan.routeParams).toEqual({ size: '500', seed: 319 });
    expect(plan.routes).toHaveLength(18);
    expect(plan.routes[0]).toEqual({
      id: 'LIF-001',
      route: '/lab/core-v2?scenario=LIF-001&size=500&seed=319',
      rootTestId: 'scenario-lif-001',
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.routes)).toBe(true);
    expect(Object.isFrozen(plan.cases[0]?.fixture)).toBe(true);
  });

  it('deep-clones and freezes caller-owned fixture/action data', () => {
    const source = structuredClone(selectCatalogCases(catalog, { caseIds: ['LIF-001'] })[0]!);
    const before = JSON.stringify(source);
    const materialized = materializeCase(source, { size: '100', seed: '0' });
    const hostCssPx = materialized.fixture.setup.params.hostCssPx;

    expect(materialized.fixture).not.toBe(source.fixture);
    expect(materialized.fixture.actionTrace).not.toBe(source.fixture.actionTrace);
    expect(materialized.actionTrace).toBe(materialized.fixture.actionTrace);
    expect(hostCssPx).toBeDefined();
    if (hostCssPx === undefined) throw new Error('LIF-001 must define hostCssPx');
    expect(Object.isFrozen(hostCssPx)).toBe(true);
    expect(() => {
      hostCssPx[0] = 1;
    }).toThrow(TypeError);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('exact selected action-handler coverage', () => {
  it('requires all 55 exact T1 handler IDs', () => {
    const selectedCases = selectCatalogCases(catalog, { tranche: 'T1' });
    const required = requiredHandlerIds(catalog.actionDefinitions, selectedCases);
    const handlers = new Map(required.map((handlerId) => [handlerId, () => undefined]));
    const coverage = assertExactHandlerCoverage(catalog.actionDefinitions, selectedCases, handlers);

    expect(required).toHaveLength(55);
    expect(coverage).toEqual({
      requiredCount: 55,
      registeredCount: 55,
      handlerIds: required,
    });

    const registry = createActionRegistry(catalog.actionDefinitions, handlers);
    expect(registry.assertCoverage(selectedCases)).toEqual(coverage);
    const firstAction = selectedCases[0]!.fixture.actionTrace[0]!;
    expect(registry.resolve(firstAction)).toBe(handlers.get(`contract/${firstAction.type}`));
  });

  it('fails missing, aliased, unknown, and non-function handlers', () => {
    const selectedCases = selectCatalogCases(catalog, { tranche: 'T1' });
    const required = requiredHandlerIds(catalog.actionDefinitions, selectedCases);
    const complete = new Map(required.map((handlerId) => [handlerId, () => undefined]));

    const missing = new Map(complete);
    missing.delete(required[0]!);
    expect(() => assertExactHandlerCoverage(catalog.actionDefinitions, selectedCases, missing)).toThrow(/missing selected handlers/);

    expect(() => assertExactHandlerCoverage(
      catalog.actionDefinitions,
      selectedCases,
      new Map([['initialize', () => undefined]]),
    )).toThrow(/unknown handler ID initialize/);

    const unknown = new Map(complete);
    unknown.set('contract/not-approved', () => undefined);
    expect(() => assertExactHandlerCoverage(catalog.actionDefinitions, selectedCases, unknown)).toThrow(/unknown handler ID/);

    expect(() => createActionRegistry(
      catalog.actionDefinitions,
      [[required[0]!, 'not-a-function']],
    )).toThrow(/handler must be a function/);
  });
});
