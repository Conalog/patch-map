import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  type CoreV2EngineSurface,
  type CoreV2EngineSurfaceFactory,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
} from '../../src/core-v2/engine';

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

interface LifecycleRuntime {
  readonly LIFECYCLE_DESTROY_ACTION_TYPES: readonly string[];
  createLifecycleDestroyHandlerEntries(
    this: void,
    product: Readonly<JsonRecord>,
  ): readonly HandlerEntry[];
}

interface LifecycleFoldRuntime {
  foldLifecycleDestroyExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: JsonRecord;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
    }>,
  ): Readonly<{
    actual: JsonRecord;
    fixtures: JsonRecord;
    captures: JsonRecord;
  }>;
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
  }>;
}

interface NormalizedEvidence {
  readonly cases: readonly JsonRecord[];
}

interface EngineFactoryMetadata {
  readonly caseId: string;
  readonly caseType: string;
  readonly role: string;
  readonly generation: number;
}

interface ManualClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface CaseExecution {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly status: string;
    readonly delta: Readonly<{ readonly actual: JsonRecord; readonly semanticProbe: unknown }>;
  }>[];
  readonly eventJournal: readonly Readonly<{
    readonly generation: number;
    readonly role: string;
    readonly event: string;
  }>[];
  readonly eventJournalFailures: readonly unknown[];
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: unknown;
  readonly error: unknown;
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: readonly ActionDefinition[];
      engineFactory: (metadata: EngineFactoryMetadata) => CoreV2Engine;
      datasets: ReadonlyMap<string, unknown>;
      clock: ManualClockContract;
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

const [
  catalogRuntime,
  materializeRuntime,
  lifecycleRuntime,
  lifecycleFoldRuntime,
  comparisonRuntime,
  workerRuntime,
] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<LifecycleRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/lifecycle-destroy.mjs',
  ),
  loadRuntime<LifecycleFoldRuntime>(
    '../../scripts/verification/core-v2-contract/fold-lifecycle-destroy.mjs',
  ),
  loadRuntime<ComparisonRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { LIFECYCLE_DESTROY_ACTION_TYPES, createLifecycleDestroyHandlerEntries } = lifecycleRuntime;
const { foldLifecycleDestroyExecution } = lifecycleFoldRuntime;
const { compareObservation } = comparisonRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;
let normalized: NormalizedEvidence;

beforeAll(async () => {
  [catalog, normalized] = await Promise.all([
    loadExecutorCatalog(),
    readNormalizedEvidence(),
  ]);
});

describe('LIF-005 actual-only lifecycle handler', () => {
  it('registers the exact action surface behind a browser-safe dependency firewall', async () => {
    const harness = createHarness();
    const entries = createLifecycleDestroyHandlerEntries(harness.product);
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/lifecycle-destroy.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceStem = ['normalized', 'expected'].join('-');

    expect(LIFECYCLE_DESTROY_ACTION_TYPES).toEqual([
      'initialize',
      'loadDataset',
      'destroy',
      'repeatLifecycle',
    ]);
    expect(entries.map(([handlerId]) => handlerId)).toEqual([
      'contract/initialize',
      'contract/loadDataset',
      'contract/destroy',
      'contract/repeatLifecycle',
    ]);
    expect(source).not.toContain(forbiddenEvidenceStem);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it('executes the approved trace on eleven fresh CoreV2Engine generations', async () => {
    const plan = selectedCase();
    const planBefore = JSON.stringify(plan);
    const harness = createHarness();
    const clock = new ManualClock();
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock,
      handlerEntries: createLifecycleDestroyHandlerEntries(harness.product),
    });

    expect(execution.status).toBe('completed');
    expect(execution.error).toBeNull();
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual([
        { index: 0, type: 'initialize', status: 'completed' },
        { index: 1, type: 'loadDataset', status: 'completed' },
        { index: 2, type: 'destroy', status: 'completed' },
        { index: 3, type: 'destroy', status: 'completed' },
        { index: 4, type: 'repeatLifecycle', status: 'completed' },
      ]);
    expect(clock.timeline).toEqual([0, 1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(harness.engines).toHaveLength(11);
    expect(harness.metadata.map(({ role, generation }) => ({ role, generation }))).toEqual([
      { role: 'main', generation: 1 },
      ...Array.from({ length: 10 }, (_, index) => ({
        role: `session:${index + 1}`,
        generation: index + 2,
      })),
    ]);

    expect(actualAt(execution, 1, 'input.unchanged')).toBe(true);
    expect(actualAt(execution, 2, 'returned')).toBe(true);
    expect(actualAt(execution, 3, 'returned')).toBe(false);
    expect(actualAt(execution, 2, 'resources')).toEqual(zeroResourceInspection());
    expect(actualAt(execution, 3, 'resources')).toEqual(zeroResourceInspection());
    expect(actualAt(execution, 4, 'cycles')).toBe(10);
    expect(actualAt(execution, 4, 'callbackCount')).toBe(10);
    expect(actualAt(execution, 4, 'callbackMultiplier')).toBe(1);
    expect(actualAt(execution, 4, 'input.unchanged')).toBe(true);
    expect(actualAt(execution, 4, 'activeResources.dom.canvasCount')).toBe(1);
    expect(actualAt(execution, 4, 'releasedLeakBudget')).toEqual(zeroResourceInspection());
    expect(actualAt(execution, 4, 'retainedDelta')).toEqual({ hostReferences: 0 });
    expect(actualAt(execution, 4, 'afterCycles.lifecycle')).toBe('scene-ready');
    expect(actualAt(execution, 4, 'afterCycles.revisions.lifecycleGeneration')).toBe(1);
    expect(actualAt(execution, 4, 'afterCycles.historyDepth')).toBe(0);

    const destroyed = execution.eventJournal.filter(({ event }) => event === 'destroyed');
    expect(destroyed).toHaveLength(11);
    expect(destroyed.map(({ generation }) => generation)).toEqual(
      Array.from({ length: 11 }, (_, index) => index + 1),
    );
    expect(new Set(destroyed.map(({ generation }) => generation)).size).toBe(11);
    expect(execution.eventJournalFailures).toEqual([]);
    expect(execution.terminalSnapshot).toMatchObject({
      lifecycle: 'scene-ready',
      historyDepth: 0,
      resources: { canvasCount: 1 },
    });
    expect(execution.terminalSemanticProbe).toMatchObject({
      lifecycle: 'scene-ready',
      history: { depth: 0 },
    });
    expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(harness.surfaces.every(({ destroyed: surfaceDestroyed }) => surfaceDestroyed)).toBe(true);
    expect(harness.surfaces.every(({ canvasCount }) => canvasCount === 0)).toBe(true);
    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(execution)).not.toContain('"status":"pass"');

    const folded = foldLifecycleDestroyExecution({
      casePlan: plan,
      execution: execution as unknown as JsonRecord,
      provenance: {
        implementation: 'core-v2',
        codeCommit: 'test-code-commit',
        packedPackageSha256: 'test-packed-package-sha256',
      },
      environment: { runtime: 'vitest', browserVersion: 'test-browser' },
    });
    const comparison = compareObservation({
      expectedCase: normalizedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });
    expect(comparison).toMatchObject({ passed: 12, failed: 0 });
  });

  it('keeps handler state isolated and deterministic across two fresh executions', async () => {
    const harness = createHarness();
    const entries = createLifecycleDestroyHandlerEntries(harness.product);
    const first = await executeContractCase({
      caseRecord: selectedCase(),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock: new ManualClock(),
      handlerEntries: entries,
    });
    const second = await executeContractCase({
      caseRecord: selectedCase(),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock: new ManualClock(),
      handlerEntries: entries,
    });

    expect(first.actionResults.map(({ delta }) => delta.actual)).toEqual(
      second.actionResults.map(({ delta }) => delta.actual),
    );
    expect(actualAt(first, 2, 'call')).toBe(1);
    expect(actualAt(second, 2, 'call')).toBe(1);
    expect(actualAt(first, 3, 'call')).toBe(2);
    expect(actualAt(second, 3, 'call')).toBe(2);
  });

  it('rejects a vacuous retained-reference inspection instead of passing noLeak by omission', async () => {
    const harness = createHarness({ retainedInspection: {} });

    await expect(executeContractCase({
      caseRecord: selectedCase(),
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock: new ManualClock(),
      handlerEntries: createLifecycleDestroyHandlerEntries(harness.product),
    })).rejects.toThrow(/retained must expose at least one numeric counter/u);
  });
});

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['LIF-005'] })[0];
  if (selected === undefined) throw new Error('Missing approved LIF-005 case');
  return materializeCase(selected, { size: '100', seed: '319' });
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

function datasets(): ReadonlyMap<string, unknown> {
  const profiles = fixtureProfiles as Readonly<{
    datasets: Readonly<Record<string, unknown>>;
  }>;
  const interactive = profiles.datasets['interactive-scene'];
  if (interactive === undefined) throw new Error('Missing interactive-scene fixture');
  return new Map([['interactive-scene', structuredClone(interactive)]]);
}

function createHarness(options: Readonly<{
  readonly retainedInspection?: Readonly<JsonRecord>;
}> = {}): {
  readonly engines: CoreV2Engine[];
  readonly surfaces: InstrumentedSurface[];
  readonly metadata: EngineFactoryMetadata[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => CoreV2Engine;
  readonly product: Readonly<JsonRecord>;
} {
  const engines: CoreV2Engine[] = [];
  const surfaces: InstrumentedSurface[] = [];
  const metadata: EngineFactoryMetadata[] = [];
  const surfaceSlotByEngine = new Map<
    CoreV2Engine,
    { current: InstrumentedSurface | null }
  >();

  const engineFactory = (nextMetadata: EngineFactoryMetadata): CoreV2Engine => {
    metadata.push(nextMetadata);
    const surfaceSlot = { current: null as InstrumentedSurface | null };
    const surfaceFactory: CoreV2EngineSurfaceFactory = (options) => {
      const surface = new InstrumentedSurface(options);
      surfaces.push(surface);
      surfaceSlot.current = surface;
      return Promise.resolve(surface);
    };
    const engine = new CoreV2Engine({ surfaceFactory });
    surfaceSlotByEngine.set(engine, surfaceSlot);
    engines.push(engine);
    return engine;
  };

  const product: Readonly<JsonRecord> = Object.freeze({
    inspectEngineResources(engine: unknown): JsonRecord {
      if (!(engine instanceof CoreV2Engine)) throw new Error('Unexpected lifecycle product engine');
      const snapshot = engine.snapshot();
      const surface = surfaceSlotByEngine.get(engine)?.current;
      const activeAnimationCount = surface?.activeAnimationCount ?? 0;
      return {
        dom: { canvasCount: snapshot.resources.canvasCount },
        subscriptions: { count: snapshot.resources.subscriptions.active },
        tickerTasks: { count: surface?.tickerTaskCount ?? 0 },
        animations: { count: activeAnimationCount },
        history: { depth: snapshot.historyDepth },
        retained: options.retainedInspection === undefined
          ? { hostReferences: surface?.retainedHostReferenceCount ?? 0 }
          : structuredClone(options.retainedInspection),
      };
    },
  });

  return { engines, surfaces, metadata, engineFactory, product };
}

class InstrumentedSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public tickerTaskCount = 0;
  public activeAnimationCount = 0;
  public retainedHostReferenceCount = 1;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: CoreV2SurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
  }

  public publishFrame(_timeMs: number): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.view = Object.freeze({ ...view });
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(_point: CoreV2Point): string | null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: this.activeAnimationCount,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.tickerTaskCount = 0;
    this.activeAnimationCount = 0;
    this.retainedHostReferenceCount = 0;
    return Promise.resolve(true);
  }
}

class ManualClock implements ManualClockContract {
  public readonly timeline: number[] = [];
  private current = 0;

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (!Number.isFinite(timeMs) || timeMs < this.current) {
      throw new Error(`Invalid manual clock advance ${timeMs}`);
    }
    this.current = timeMs;
    this.timeline.push(timeMs);
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}

function zeroResourceInspection(): JsonRecord {
  return {
    dom: { canvasCount: 0 },
    subscriptions: { count: 0 },
    tickerTasks: { count: 0 },
    animations: { count: 0 },
    history: { depth: 0 },
    retained: { hostReferences: 0 },
  };
}

function actualAt(execution: CaseExecution, actionIndex: number, path: string): unknown {
  const action = execution.actionResults[actionIndex];
  if (action === undefined) throw new Error(`Missing action ${actionIndex}`);
  let value: unknown = action.delta.actual;
  for (const segment of path.split('.')) {
    if (!isRecord(value) || !Object.hasOwn(value, segment)) {
      throw new Error(`Missing action ${actionIndex} path ${path}`);
    }
    value = value[segment];
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<JsonRecord> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
