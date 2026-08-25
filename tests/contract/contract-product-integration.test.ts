import catalogProfiles from '../../contracts/evidence/catalog-fixture-profiles.v1.json';
import normalizedExpectedCatalog from '../../contracts/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';

interface ContractAction {
  readonly index: number;
  readonly type: string;
  readonly operands: Readonly<Record<string, unknown>>;
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
  readonly actionDefinitions: readonly Readonly<Record<string, unknown>>[];
  readonly cases: readonly CatalogCase[];
}

interface ContractExecution {
  readonly caseId: string;
  readonly status: string;
  readonly actionResults: readonly Readonly<Record<string, unknown>>[];
  readonly eventJournal: readonly Readonly<{
    readonly generation: number;
    readonly role: string;
    readonly event: string;
    readonly actual: unknown;
  }>[];
  readonly eventJournalFailures: readonly unknown[];
  readonly datasetObservations: Readonly<Record<string, unknown>>;
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: unknown;
}

interface FoldResult {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

interface ContractComparison {
  readonly passed: number;
  readonly failed: number;
  readonly assertions: readonly Readonly<{
    readonly path: string;
    readonly passed: boolean;
    readonly failure: Readonly<{ readonly code: string }> | null;
  }>[];
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
    route: Readonly<{ size: string; seed: string }>,
  ): MaterializedCase;
}

interface WorkerRuntime {
  executeContractCase(this: void, options: Readonly<Record<string, unknown>>): Promise<ContractExecution>;
}

interface FoldRuntime {
  foldFoundationExecution(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): FoldResult;
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): ContractComparison;
}

const [catalogRuntime, materializeRuntime, workerRuntime, foldRuntime, compareRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../verification/contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../verification/contract/materialize.mjs'),
  loadRuntime<WorkerRuntime>('../../verification/contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>('../../verification/contract/fold-foundation.mjs'),
  loadRuntime<CompareRuntime>('../../verification/contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { executeContractCase } = workerRuntime;
const { foldFoundationExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap approved foundation executor against the product engine', () => {
  it('runs the six-case foundation slice through PatchMap without a contract-aware fake', async () => {
    const executions = new Map<string, ContractExecution>();
    const comparisons = new Map<string, ContractComparison>();
    for (const caseId of ['LIF-001', 'LIF-002', 'DAT-001', 'DAT-002', 'CSM-001', 'CSM-003']) {
      const casePlan = selectedCase(caseId);
      const execution = await executeContractCase({
        caseRecord: casePlan,
        actionDefinitions: catalog.actionDefinitions,
        engineFactory: () => new PatchMap({ surfaceFactory: createSurfaceFactory() }),
        datasets: {
          resolve(reference: string): unknown {
            return (catalogProfiles.datasets as Readonly<Record<string, unknown>>)[reference];
          },
        },
        clock: new ManualClock(),
      });
      executions.set(caseId, execution);
      const folded = foldFoundationExecution({
        casePlan,
        execution,
        provenance: {
          codeCommit: 'working-tree',
          packedPackageSha256: 'not-packed-unit-product-source',
          runnerRevision: 'patch-map-foundation-fold/1',
        },
        environment: { browser: 'vitest', browserVersion: 'unit', os: 'unit', backend: 'webgl2' },
      });
      const expectedCase = normalizedExpectedCatalog.cases.find((candidate) => candidate.id === caseId);
      if (!expectedCase) throw new Error(`missing approved expected case ${caseId}`);
      comparisons.set(caseId, compareObservation({
        expectedCase,
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      }));
      expect(execution.status, caseId).toBe('completed');
      expect(execution.actionResults.every((action) => action.status === 'completed'), caseId).toBe(true);
      expect(JSON.stringify(execution), caseId).not.toContain('"status":"pass"');
      expect(execution.eventJournalFailures, caseId).toEqual([]);
      expect(execution.terminalSemanticProbe, caseId).not.toBeNull();
      expect(valueAt(execution.cleanup, 'status'), caseId).toBe('completed');
      expect(valueAt(execution.cleanup, 'errors'), caseId).toEqual([]);
      for (const release of valueAt(execution.cleanup, 'releases') as readonly unknown[]) {
        expect(valueAt(release, 'journalSubscriptions'), caseId).toEqual({
          registeredCount: 6,
          releasedCount: 6,
        });
      }
    }

    expect(valueAt(executions.get('LIF-002'), 'actionResults.2.delta.actual.drawCompleteEvents')).toEqual([
      expect.objectContaining({ requestId: 'draw-b', sceneRevision: 1 }),
    ]);
    expect(valueAt(executions.get('LIF-002'), 'actionResults.2.delta.actual.failedLater.diagnostic.code')).toBe(
      'INVALID_VALUE',
    );
    const drawCompleteJournal = executions.get('LIF-002')?.eventJournal.filter(
      ({ event }) => event === 'drawComplete',
    ) ?? [];
    expect(drawCompleteJournal).toHaveLength(1);
    expect(drawCompleteJournal[0]).toMatchObject({ generation: 1, role: 'main' });
    expect(drawCompleteJournal[0]?.actual).toMatchObject({ requestId: 'draw-b', sceneRevision: 1 });
    expect(valueAt(
      executions.get('LIF-002'),
      'actionResults.2.delta.actual.authoritativeSubmittedInput.unchanged',
    )).toBe(true);
    expect(valueAt(executions.get('DAT-001'), 'actionResults.2.delta.actual.diagnostic.code')).toBe(
      'INVALID_RECORD_KIND',
    );
    expect(valueAt(executions.get('DAT-001'), 'actionResults.2.delta.actual.atomicRetained')).toBe(true);
    expect(valueAt(executions.get('DAT-001'), 'datasetObservations.all-kinds-scene.unchanged')).toBe(true);
    expect(valueAt(executions.get('DAT-002'), 'actionResults.0.delta.semanticProbe')).toBeNull();
    expect(valueAt(executions.get('DAT-002'), 'actionResults.1.delta.semanticProbe')).not.toBeNull();
    expect(valueAt(executions.get('DAT-002'), 'actionResults.3.delta.semanticProbe')).not.toBeNull();
    expect(valueAt(executions.get('DAT-002'), 'actionResults.1.delta.actual.exportedDataset')).toEqual(
      valueAt(executions.get('DAT-002'), 'actionResults.3.delta.actual.exportedDataset'),
    );
    expect(executions.get('DAT-002')?.eventJournal.filter(({ event }) => event === 'ready').map(
      ({ generation, role }) => ({ generation, role }),
    )).toEqual([
      { generation: 1, role: 'session:1' },
      { generation: 2, role: 'session:2' },
    ]);
    expect(executions.get('DAT-002')?.eventJournal.filter(({ event }) => event === 'destroyed').map(
      ({ generation, role }) => ({ generation, role }),
    )).toEqual([
      { generation: 1, role: 'session:1' },
      { generation: 2, role: 'session:2' },
    ]);
    expect(valueAt(executions.get('CSM-001'), 'terminalSnapshot.datasetRef')).toBe('interactive-scene');
    expect(valueAt(executions.get('CSM-003'), 'terminalSnapshot.lifecycle')).toBe('ready-empty');
    expect(valueAt(executions.get('CSM-003'), 'actionResults.3.delta.actual.result')).toBeNull();

    expect(comparisonSummary(comparisons)).toEqual({
      'LIF-001': { passed: 11, failed: [] },
      'LIF-002': {
        passed: 18,
        failed: [
          '/paint/render/hiddenComponent/objectCount:UNRESOLVED_PATH',
          '/outcome/failedLater/code:VALUE_MISMATCH',
        ],
      },
      'DAT-001': {
        passed: 7,
        failed: [
          '/scene/visibleBoundsFinite:UNRESOLVED_PATH',
          '/scene/orderHash:UNRESOLVED_PATH',
          '/outcome/validation/unsupportedType/code:VALUE_MISMATCH',
        ],
      },
      'DAT-002': { passed: 13, failed: [] },
      'CSM-001': {
        passed: 8,
        failed: [
          '/outcome/hostEngineSeam/engineReturns/lifecycle:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/sceneRevision:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/publishedTuple/scene:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/publishedTuple/view:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/publishedTuple/interaction:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/rootIds:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/failureRollback/retainedSceneRevision:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/failureRollback/partialPublicationCount:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/failureRollback/hostRetryRequired:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/lifecycle:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/sceneRevision:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/selectedIds:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/mode:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/datasetRef:UNRESOLVED_PATH',
          '/interaction/staleGestureCount:UNRESOLVED_PATH',
          '/history/corruptEntryCount:UNRESOLVED_PATH',
        ],
      },
      'CSM-003': {
        passed: 9,
        failed: [
          '/outcome/hostEngineSeam/engineReturns/loadingCanvasCount:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/noBlueprintCanvasCount:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/emptySceneNodeCount:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/engineReturns/missingQuery:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/failureRollback/priorSceneRevision:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/failureRollback/historyDepth:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/failureRollback/hostOwnsEmptyUi:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/lifecycle:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/sceneRevision:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/selectedIds:UNRESOLVED_PATH',
          '/outcome/hostEngineSeam/finalState/mode:UNRESOLVED_PATH',
          '/interaction/staleGestureCount:UNRESOLVED_PATH',
        ],
      },
    });
  });
});

function comparisonSummary(
  comparisons: ReadonlyMap<string, ContractComparison>,
): Readonly<Record<string, Readonly<{ passed: number; failed: readonly string[] }>>> {
  return Object.fromEntries([...comparisons].map(([caseId, comparison]) => [caseId, {
    passed: comparison.passed,
    failed: comparison.assertions
      .filter((assertion) => !assertion.passed)
      .map((assertion) => `${assertion.path}:${assertion.failure?.code ?? 'UNKNOWN'}`),
  }]));
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const moduleNamespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return moduleNamespace as T;
}

function selectedCase(caseId: string): MaterializedCase {
  const record = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!record) throw new Error(`missing approved case ${caseId}`);
  return materializeCase(record, { size: '100', seed: '319' });
}

function createSurfaceFactory(): PatchMapEngineSurfaceFactory {
  return (options) => Promise.resolve(new ContractProductSurface(options));
}

class ContractProductSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;

  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(_input: unknown) {
    return Object.freeze({
      status: 'committed' as const,
      operationCount: 0,
      denseChanged: false,
      diagnostics: Object.freeze([]),
    });
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

  public hitTestScreen(_point: PatchMapPoint): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.selectionIds = Object.freeze([]);
    return Promise.resolve(true);
  }
}

class ManualClock {
  private current = 0;

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.current) throw new Error(`manual clock cannot rewind to ${timeMs}`);
    this.current = timeMs;
    return Promise.resolve();
  }

  public withTimeout<T>(promise: Promise<T>): Promise<T> {
    return promise;
  }
}

function valueAt(value: unknown, path: string): unknown {
  let cursor = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        throw new Error(`unresolved array path ${path}`);
      }
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`unresolved object path ${path}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
