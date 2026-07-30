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

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
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
    readonly setup: Readonly<{ readonly params: Readonly<Record<string, unknown>> }>;
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

type Handler = (context: unknown, action: unknown) => unknown;
type HandlerEntry = readonly [string, Handler];

interface ActionExecution {
  readonly index: number;
  readonly type: string;
  readonly status: string;
  readonly delta: Readonly<{ readonly actual: unknown }>;
}

interface CaseExecution {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly ActionExecution[];
  readonly eventJournal: readonly unknown[];
  readonly eventJournalFailures: readonly unknown[];
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: unknown;
  readonly error: unknown;
}

interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface ExecuteOptions {
  readonly caseRecord: MaterializedCase;
  readonly actionDefinitions: readonly ActionDefinition[];
  readonly engineFactory: (metadata: unknown) => never;
  readonly datasets: ReadonlyMap<string, unknown>;
  readonly clock: ManualClockContract;
  readonly handlerEntries: readonly HandlerEntry[];
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
    routeOptions: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface ActionRegistryRuntime {
  assertExactHandlerCoverage(
    this: void,
    definitions: readonly ActionDefinition[],
    cases: readonly MaterializedCase[],
    handlers: readonly HandlerEntry[],
  ): Readonly<{ requiredCount: number; registeredCount: number; handlerIds: readonly string[] }>;
}

interface DataFoundationRuntime {
  readonly DATA_FOUNDATION_ACTION_TYPES: readonly string[];
  createDataFoundationHandlerEntries(this: void, product: unknown): readonly HandlerEntry[];
}

interface WorkerRuntime {
  executeContractCase(this: void, options: ExecuteOptions): Promise<CaseExecution>;
}

interface ProductInstrumentation {
  readonly resolverInstances: object[];
  pixiConstructionCount: number;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

const [
  catalogRuntime,
  materializeRuntime,
  actionRegistryRuntime,
  dataFoundationRuntime,
  workerRuntime,
] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<ActionRegistryRuntime>('../../scripts/verification/core-v2-contract/action-registry.mjs'),
  loadRuntime<DataFoundationRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/data-foundation.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { assertExactHandlerCoverage } = actionRegistryRuntime;
const { DATA_FOUNDATION_ACTION_TYPES, createDataFoundationHandlerEntries } = dataFoundationRuntime;
const { executeContractCase } = workerRuntime;

const CASE_IDS = Object.freeze(['DAT-003', 'DAT-004', 'DAT-005']);
const EXPECTED_ACTION_TYPES = Object.freeze([
  'loadShorthandMatrix',
  'observeGeometry',
  'validate',
  'initializeInstances',
  'resolveColors',
  'resolveColorInputMatrix',
  'resolveColor',
  'loadGrid',
  'exerciseGridEdgeMatrix',
  'setGridCell',
]);

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap data-foundation actual-only registry', () => {
  it('covers every approved DAT-003/004/005 action with a browser-safe product-injected handler', async () => {
    const instrumentation = createInstrumentation();
    const entries = createDataFoundationHandlerEntries(createProductAdapter(instrumentation));
    const cases = CASE_IDS.map(selectedCase);
    const coverage = assertExactHandlerCoverage(catalog.actionDefinitions, cases, entries);

    expect(DATA_FOUNDATION_ACTION_TYPES).toEqual(EXPECTED_ACTION_TYPES);
    expect(entries.map(([handlerId]) => handlerId)).toEqual(
      EXPECTED_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(coverage).toEqual({
      requiredCount: EXPECTED_ACTION_TYPES.length,
      registeredCount: EXPECTED_ACTION_TYPES.length,
      handlerIds: [...EXPECTED_ACTION_TYPES].map((type) => `contract/${type}`).sort(),
    });

    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/data-foundation.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    expect(source).not.toContain('node:');
    expect(source).not.toContain('catalog-normalized-expected');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
  });
});

describe('DAT-003 shorthand and dimension execution', () => {
  it('derives geometry through the product API and keeps both invalid probes atomic', async () => {
    const caseRecord = selectedCase('DAT-003');
    const caseBefore = JSON.stringify(caseRecord);
    const harness = createExecutionHarness();
    const execution = await runCase(caseRecord, harness.entries, harness);

    expectCompletedActions(execution, [
      'loadShorthandMatrix',
      'observeGeometry',
      'validate',
      'validate',
    ]);
    expect(at(execution, 0, ['geometry', 'contentBox'])).toEqual([10, 7, 180, 88]);
    expect(at(execution, 0, ['components', 'pct-string', 'width'])).toBe(90);
    expect(at(execution, 0, ['components', 'pct-object', 'width'])).toBe(90);
    expect(at(execution, 0, ['components', 'calc', 'width'])).toBe(160);
    expect(at(execution, 1, ['equivalentForms'])).toBe(true);
    expect(at(execution, 1, ['finite'])).toBe(true);

    expect(at(execution, 2, ['accepted'])).toBe(false);
    expect(at(execution, 2, ['diagnostic', 'code'])).toBe('INVALID_VALUE');
    expect(at(execution, 2, ['diagnostic', 'path'])).toBe('$.validation.partial-size.height');
    expect(at(execution, 2, ['authoritativeSceneUnchanged'])).toBe(true);
    expect(at(execution, 2, ['beforeFingerprint'])).toBe(at(execution, 2, ['afterFingerprint']));
    expect(at(execution, 3, ['diagnostic', 'code'])).toBe('INVALID_VALUE');
    expect(at(execution, 3, ['diagnostic', 'path'])).toBe('$.validation.non-finite.width');
    expect(at(execution, 3, ['authoritativeSceneUnchanged'])).toBe(true);
    expect(at(execution, 3, ['sceneRevision'])).toBe(1);
    expect(at(execution, 0, ['input', 'unchanged'])).toBe(true);
    expect(JSON.stringify(caseRecord)).toBe(caseBefore);
    expectNoRuntimeResources(execution, harness);
  });

  it('is deterministic and execution-isolated when one handler registry serves fresh runs', async () => {
    const instrumentation = createInstrumentation();
    const entries = createDataFoundationHandlerEntries(createProductAdapter(instrumentation));
    const firstHarness = { engineFactoryCalls: 0, entries };
    const secondHarness = { engineFactoryCalls: 0, entries };
    const first = await runCase(selectedCase('DAT-003'), entries, firstHarness);
    const second = await runCase(selectedCase('DAT-003'), entries, secondHarness);

    expect(first.actionResults.map(({ delta }) => delta.actual)).toEqual(
      second.actionResults.map(({ delta }) => delta.actual),
    );
    expect(at(first, 0, ['sceneRevision'])).toBe(1);
    expect(at(second, 0, ['sceneRevision'])).toBe(1);
    expectNoRuntimeResources(first, firstHarness);
    expectNoRuntimeResources(second, secondHarness);
  });
});

describe('DAT-004 PixiJS color execution', () => {
  it('isolates two real resolver instances and preserves invalid diagnostic mismatches honestly', async () => {
    const caseRecord = selectedCase('DAT-004');
    const caseBefore = JSON.stringify(caseRecord);
    const harness = createExecutionHarness();
    const execution = await runCase(caseRecord, harness.entries, harness);

    expectCompletedActions(execution, [
      'initializeInstances',
      'resolveColors',
      'resolveColors',
      'resolveColorInputMatrix',
      'resolveColor',
    ]);
    expect(at(execution, 0, ['isolatedResolvers'])).toBe(true);
    expect(harness.instrumentation.resolverInstances).toHaveLength(2);
    expect(harness.instrumentation.resolverInstances[0]).not.toBe(
      harness.instrumentation.resolverInstances[1],
    );
    expect(at(execution, 1, ['colors', 'primary', 'default'])).toBe('#0c73bfff');
    expect(at(execution, 2, ['colors', 'primary', 'default'])).toBe('#112233ff');
    expect(at(execution, 1, ['colors', '#ff0000'])).toBe('#ff0000ff');
    expect(at(execution, 1, ['colors', '65280'])).toBe('#00ff00ff');
    expect(at(execution, 1, ['colors', 'array'])).toBe('#0000ff80');
    expect(at(execution, 1, ['themeInput', 'unchanged'])).toBe(true);
    expect(at(execution, 2, ['themeInput', 'unchanged'])).toBe(true);

    expect(at(execution, 3, ['results', 'typed-array', 'rgba'])).toBe('#ff800080');
    expect(at(execution, 3, ['results', 'typed-array', 'constructor'])).toBe('Uint8Array');
    expect(at(execution, 3, ['results', 'pixijs-color-object', 'rgba'])).toBe('#0c223840');
    expect(at(execution, 3, ['results', 'pixijs-color-object', 'constructor'])).toBe(
      'PixiJS.Color',
    );
    expect(harness.instrumentation.pixiConstructionCount).toBe(1);
    expect(at(execution, 3, ['callerValuesUnchanged'])).toBe(true);
    expect(at(execution, 3, ['authoritativeSceneUnchanged'])).toBe(true);

    for (const id of ['non-finite-typed-array', 'infinite-color-object']) {
      expect(at(execution, 3, ['results', id, 'applied'])).toBe(false);
      // The immutable expected says INVALID_COLOR, but the closed product
      // diagnostic registry emits INVALID_VALUE; actual evidence must retain it.
      expect(at(execution, 3, ['results', id, 'diagnostic', 'code'])).toBe('INVALID_VALUE');
      expect(at(execution, 3, ['results', id, 'publicationCount'])).toBe(0);
      expect(at(execution, 3, ['results', id, 'callerValueUnchanged'])).toBe(true);
    }
    expect(at(execution, 3, ['results', 'non-finite-typed-array', 'diagnostic', 'path'])).toBe(
      '$[0].fill',
    );
    expect(at(execution, 3, ['results', 'infinite-color-object', 'diagnostic', 'path'])).toBe(
      '$[1].fill',
    );
    expect(at(
      execution,
      3,
      ['results', 'infinite-color-object', 'rejectedBeforeLossyConstruction'],
    )).toBe(true);

    expect(at(execution, 4, ['accepted'])).toBe(false);
    expect(at(execution, 4, ['diagnostic', 'code'])).toBe('INVALID_VALUE');
    expect(at(execution, 4, ['diagnostic', 'path'])).toBe('$[0].fill');
    expect(at(execution, 4, ['publicationCount'])).toBe(0);
    expect(at(execution, 4, ['authoritativeSceneUnchanged'])).toBe(true);
    expect(JSON.stringify(caseRecord)).toBe(caseBefore);
    expectNoRuntimeResources(execution, harness);
  });
});

describe('DAT-005 grid execution', () => {
  it('preserves deterministic cell identity through edge matrices, hide, reactivate, and hide again', async () => {
    const caseRecord = selectedCase('DAT-005');
    const caseBefore = JSON.stringify(caseRecord);
    const harness = createExecutionHarness();
    const execution = await runCase(caseRecord, harness.entries, harness);

    expectCompletedActions(execution, [
      'loadGrid',
      'exerciseGridEdgeMatrix',
      'setGridCell',
      'setGridCell',
    ]);
    expect(at(execution, 0, ['grid', 'activeIds'])).toEqual([
      'grid.0.0',
      'grid.0.2',
      'grid.1.0',
      'grid.1.1',
    ]);
    expect(at(execution, 0, ['grid', 'cells', 'grid.0.2', 'label'])).toBe('B');
    expect(at(execution, 0, ['grid', 'cells', 'grid.1.0', 'localPosition'])).toEqual([0, 13]);
    expect(at(execution, 0, ['determinism', 'equal'])).toBe(true);
    expect(at(execution, 0, ['input', 'unchanged'])).toBe(true);

    expect(at(execution, 1, ['edge', 'ragged', 'activeIds'])).toEqual([
      'grid.0.0',
      'grid.0.2',
      'grid.1.0',
    ]);
    expect(at(execution, 1, ['edge', 'ragged', 'positions'])).toEqual([
      [0, 0],
      [44, 0],
      [0, 13],
    ]);
    expect(at(execution, 1, ['edge', 'empty', 'activeIds'])).toEqual([]);
    expect(at(execution, 1, ['edge', 'empty', 'localBounds'])).toEqual([0, 0, 0, 0]);
    expect(at(execution, 1, ['edge', 'duplicateLabels', 'ids'])).toEqual([
      'grid.0.0',
      'grid.0.1',
    ]);
    expect(at(execution, 1, ['edge', 'duplicateLabels', 'labels'])).toEqual(['A', 'A']);
    expect(at(execution, 1, ['edge', 'duplicateLabels', 'identityCollisionCount'])).toBe(0);
    expect(at(execution, 1, ['input', 'unchanged'])).toBe(true);

    expect(at(execution, 2, ['cellId'])).toBe('grid.0.1');
    expect(at(execution, 2, ['current', 'id'])).toBe('grid.0.1');
    expect(at(execution, 2, ['current', 'visible'])).toBe(true);
    expect(at(execution, 2, ['identityStable'])).toBe(true);
    expect(at(execution, 3, ['previous', 'id'])).toBe('grid.0.1');
    expect(at(execution, 3, ['current', 'id'])).toBe('grid.0.1');
    expect(at(execution, 3, ['current', 'visible'])).toBe(false);
    expect(at(execution, 3, ['current', 'logicalCount'])).toBe(1);
    expect(at(execution, 3, ['identityStable'])).toBe(true);
    expect(at(execution, 2, ['input', 'unchanged'])).toBe(true);
    expect(at(execution, 3, ['input', 'unchanged'])).toBe(true);
    expect(at(execution, 3, ['sceneRevision'])).toBe(3);
    expect(JSON.stringify(caseRecord)).toBe(caseBefore);
    expectNoRuntimeResources(execution, harness);
  });
});

function createInstrumentation(): ProductInstrumentation {
  return { resolverInstances: [], pixiConstructionCount: 0 };
}

function createProductAdapter(instrumentation: ProductInstrumentation): Readonly<Record<string, unknown>> {
  return Object.freeze({
    createColorResolver(theme: Readonly<Record<string, unknown>>) {
      const resolver = createPatchMapColorResolver(theme);
      instrumentation.resolverInstances.push(resolver);
      return resolver;
    },
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

function createExecutionHarness(): {
  engineFactoryCalls: number;
  readonly instrumentation: ProductInstrumentation;
  readonly entries: readonly HandlerEntry[];
} {
  const instrumentation = createInstrumentation();
  return {
    engineFactoryCalls: 0,
    instrumentation,
    entries: createDataFoundationHandlerEntries(createProductAdapter(instrumentation)),
  };
}

async function runCase(
  caseRecord: MaterializedCase,
  entries: readonly HandlerEntry[],
  harness: { engineFactoryCalls: number },
): Promise<CaseExecution> {
  return executeContractCase({
    caseRecord,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory() {
      harness.engineFactoryCalls += 1;
      throw new Error('data-foundation actions must not allocate an engine');
    },
    datasets: new Map(),
    clock: new ManualClock(),
    handlerEntries: entries,
  });
}

function selectedCase(id: string): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [id] })[0];
  if (selected === undefined) throw new Error(`Missing approved case ${id}`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function expectCompletedActions(execution: CaseExecution, types: readonly string[]): void {
  expect(execution.status).toBe('completed');
  expect(execution.error).toBeNull();
  expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status }))).toEqual(
    types.map((type, index) => ({ index, type, status: 'completed' })),
  );
}

function expectNoRuntimeResources(
  execution: CaseExecution,
  harness: { readonly engineFactoryCalls: number },
): void {
  expect(harness.engineFactoryCalls).toBe(0);
  expect(execution.eventJournal).toEqual([]);
  expect(execution.eventJournalFailures).toEqual([]);
  expect(execution.terminalSnapshot).toBeNull();
  expect(execution.terminalSemanticProbe).toBeNull();
  expect(execution.cleanup).toEqual({
    status: 'completed',
    declaredActions: ['destroy-case'],
    releases: [],
    errors: [],
  });
}

function at(execution: CaseExecution, actionIndex: number, path: readonly string[]): unknown {
  const result = execution.actionResults[actionIndex];
  if (result === undefined) throw new Error(`Missing action ${actionIndex}`);
  let cursor: unknown = result.delta.actual;
  for (const segment of path) {
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`Missing action ${actionIndex} actual path ${path.join('/')}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
