import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from './support/contract-verifier-import-firewall';

import { createPatchMapLayoutOrderRuntime } from '../../lab/patch-map/contract/layout-order-runtime';
import { createPatchMapExecutableLabBridge } from '../../lab/patch-map/contract/executable-bridge';
import type { CoreView, SceneDocument, SlotRange } from '../../src/patch-map/dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RendererFlushResult,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import { CoreScene } from '../../src/patch-map/dense/scene';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/patch-map/core';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import {
  PatchMap,
  PixiEngineSurface,
  createPatchMapSurfaceGeometrySnapshot,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceGeometrySnapshot,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileResult,
  type PatchMapSurfaceView,
} from '../../src/patch-map/engine';
import {
  createPatchMapPaintOrderProductProbe,
  type PatchMapPaintOrderProductProbe,
} from '../../src/patch-map/paint-order-product';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type {
  PatchMapEntityPaintProbe,
  PatchMapOverlayPaintProbe,
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
} from '../../src/patch-map/renderers/types';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { planPatchMapSceneReconcile } from '../../src/patch-map/semantic/reconcile';

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
  readonly actionTrace: readonly ContractAction[];
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
  readonly LAYOUT_ORDER_ACTION_TYPES: readonly string[];
  readonly LAYOUT_ORDER_CASE_IDS: readonly string[];
  readonly LAYOUT_ORDER_EXTENSION_CASE_IDS: readonly string[];
  createLayoutOrderHandlerEntries(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
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
  readonly cleanup: Readonly<JsonRecord>;
  readonly datasetObservations: Readonly<JsonRecord>;
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<{
      caseRecord: MaterializedCase;
      actionDefinitions: readonly ActionDefinition[];
      engineFactory: () => PatchMap;
      datasets: ReadonlyMap<string, unknown>;
      clock: ClockContract;
      handlerEntries: readonly HandlerEntry[];
    }>,
  ): Promise<CaseExecution>;
}

interface FoldResult {
  readonly actual: Readonly<JsonRecord>;
  readonly fixtures: Readonly<JsonRecord>;
  readonly captures: Readonly<JsonRecord>;
}

interface FoldRuntime {
  foldLayoutOrderExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: Readonly<JsonRecord>;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
    }>,
  ): FoldResult;
}

interface ExpectedCase {
  readonly id: string;
  readonly caseType: string;
  readonly expected: Readonly<{
    readonly assertions: readonly Readonly<{
      readonly path: string;
      readonly operator: string;
      readonly value?: unknown;
    }>[];
  }>;
  readonly volatileFields: readonly string[];
}

interface CompareResult {
  readonly passed: number;
  readonly failed: number;
  readonly assertions: readonly Readonly<{ readonly passed: boolean }>[];
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      expectedCase: ExpectedCase;
      actual: Readonly<JsonRecord>;
      fixtures: Readonly<JsonRecord>;
      captures: Readonly<JsonRecord>;
    }>,
  ): CompareResult;
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
] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>('../../scripts/verification/core-v2-contract/handlers/layout-order.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-layout-order.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  LAYOUT_ORDER_ACTION_TYPES,
  LAYOUT_ORDER_CASE_IDS,
  LAYOUT_ORDER_EXTENSION_CASE_IDS,
  createLayoutOrderHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { foldLayoutOrderExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap LAY-002 layout-order actual-only handlers', () => {
  it('registers one shared descriptor without importing answer evidence', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/layout-order.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');
    const runtime = createPatchMapLayoutOrderRuntime('LAY-002');

    expect(LAYOUT_ORDER_ACTION_TYPES).toEqual([
      'loadPlacementMatrix',
      'observeBounds',
      'observePlacementMatrix',
      'loadDataset',
      'patch',
      'undo',
      'redo',
    ]);
    expect(LAYOUT_ORDER_CASE_IDS).toEqual(['LAY-002', 'LAY-003']);
    expect(LAYOUT_ORDER_EXTENSION_CASE_IDS).toEqual([]);
    expect(createLayoutOrderHandlerEntries(
      runtime.product as unknown as Readonly<Record<string, unknown>>,
    ).map(([handlerId]) => handlerId)).toEqual(
      LAYOUT_ORDER_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    await assertCommittedVerifierEntryImportFirewall('handlers/layout-order.mjs', 'handler');
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toContain('fixtureParams.placementMatrix');
    expect(source).not.toContain('params.placementMatrix');
    expect(source).toContain("call(engine, 'loadDataset'");
    expect(source).toContain("callSync(engine, 'geometryProbe'");
    expect(source).toContain("callSync(engine, 'semanticProbe'");
    expect(source).toContain("callSync(engine, 'exportDataset'");
    expect(source).toContain("callSync(engine, 'paintOrderProbe'");
    expect(source).toContain("callSync(engine, 'patch'");
    expect(source).toContain("callSync(engine, direction)");
  });

  it('rejects adjacent trace operands before initializing an Engine', async () => {
    const plan = selectedCase();
    const runtime = createPatchMapLayoutOrderRuntime('LAY-002');
    const entry = createLayoutOrderHandlerEntries(
      runtime.product as unknown as Readonly<Record<string, unknown>>,
    )[0];
    if (entry === undefined) throw new Error('Missing loadPlacementMatrix handler');
    const handler = entry[1];
    const context = {
      caseId: 'LAY-002',
      actionIndex: 0,
      fixtureParams: plan.fixture.setup.params,
      routeParams: plan.routeParams,
      signal: new AbortController().signal,
      clock: new ManualClock(),
      ensureMainEngine: () => Promise.reject(new Error('must not initialize')),
      currentMainEngine: () => null,
      fingerprint: () => 'unused',
    };

    await expect(handler(context, {
      index: 0,
      type: 'loadPlacementMatrix',
      operands: { itemId: 'nearby-item' },
    })).rejects.toThrow(/action 0 operands/u);
  });

  it('builds, loads, publishes, and observes the exact public geometry matrix', async () => {
    const plan = selectedCase();
    const before = JSON.stringify(plan);
    const runtime = createPatchMapLayoutOrderRuntime('LAY-002');
    const surfaces: LayoutSurface[] = [];
    const execution = await execute(plan, runtime.product, surfaces);

    expect(execution).toMatchObject({
      caseId: 'LAY-002',
      status: 'completed',
      cleanup: { status: 'completed', errors: [] },
    });
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual(LAYOUT_ORDER_ACTION_TYPES.slice(0, 3).map((type, index) => ({
        index,
        type,
        status: 'completed',
      })));
    expect(actualAt(execution, 0)).toMatchObject({
      caseId: 'LAY-002',
      itemId: 'item',
      componentCount: 10,
      input: { unchanged: true },
    });
    const bounds = requireRecord(actualAt(execution, 1).placements, 'bounds placements');
    const observed = actualAt(execution, 2);
    const placements = requireRecord(observed.placements, 'observed placements');
    expect(bounds.order).toEqual(placementOrder());
    expect(placements.order).toEqual(placementOrder());
    expect(placements.owner).toMatchObject({
      id: 'item',
      worldBounds: [10, 20, 100, 80],
      visible: true,
    });
    expect(row(placements, 'left')).toMatchObject({
      localBounds: [26, 32, 30, 10],
      worldBounds: [36, 52, 30, 10],
    });
    expect(row(placements, 'right-top')).toMatchObject({
      localBounds: [54, 10, 30, 10],
      worldBounds: [64, 30, 30, 10],
      right: 84,
      top: 10,
    });
    expect(row(placements, 'center')).toMatchObject({
      localBounds: [38, 32, 30, 10],
      center: [53, 37],
    });
    expect(row(placements, 'none')).toMatchObject({
      localBounds: [0, 0, 30, 10],
      worldBounds: [10, 20, 30, 10],
    });
    expect(observed).toMatchObject({
      valueRef: 'placementMatrix',
      complete: true,
      deterministic: true,
      input: { unchanged: true },
    });
    expect(observed.repeatPlacements).toEqual(observed.placements);
    expect(execution.datasetObservations).toEqual({});
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({
      loadCount: 1,
      publishCount: 1,
      destroyed: true,
      canvasCount: 0,
    });
    expect(JSON.stringify(plan)).toBe(before);

    const productCleanup = runtime.postDestroyProductProbe();
    expect(productCleanup).toMatchObject({
      caseId: 'LAY-002',
      runtimeCounts: zeroOwnership(),
      stats: { datasetBuildCount: 1 },
    });
    const foldExecution = structuredClone(execution);
    const cleanup = requireRecord(foldExecution.cleanup, 'execution cleanup');
    cleanup.productResources = productCleanup;
    const folded = foldLayoutOrderExecution({
      casePlan: plan,
      execution: foldExecution,
      provenance: {
        contractRevision: 'core-v2-functional-contract/2026-07-16.2',
        codeCommit: 'unit',
        packedPackageSha256: 'unit',
      },
      environment: {
        browser: 'vitest',
        browserVersion: 'unit',
        os: 'unit',
        backend: 'webgl2',
        routeSize: '100',
      },
    });
    const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === 'LAY-002');
    if (expectedCase === undefined) throw new Error('Missing approved LAY-002 observations');
    const comparison = compareObservation({
      expectedCase: expectedCase as unknown as ExpectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });
    expect(expectedCase.expected.assertions).toHaveLength(28);
    expect(comparison).toMatchObject({ passed: 28, failed: 0 });
    expect(comparison.assertions.every(({ passed }) => passed)).toBe(true);
    expect(runtime.postDestroyProductProbe()).toBe(productCleanup);
  });

  it('does not let a poisoned setup matrix influence the direct dataset or public observations', async () => {
    const cleanPlan = selectedCase();
    const poisonedPlan = structuredClone(cleanPlan);
    const poisonedParams = poisonedPlan.fixture.setup.params as JsonRecord;
    poisonedParams.placementMatrix = {
      left: { localBounds: [999, 999, 999, 999], worldBounds: [-999, -999, -999, -999] },
      poison: 'placement-matrix-oracle-poison',
    };
    const cleanRuntime = createPatchMapLayoutOrderRuntime('LAY-002');
    const poisonedRuntime = createPatchMapLayoutOrderRuntime('LAY-002');
    const clean = await execute(cleanPlan, cleanRuntime.product, []);
    const poisoned = await execute(poisonedPlan, poisonedRuntime.product, []);

    expect(actualAt(poisoned, 1).placements).toEqual(actualAt(clean, 1).placements);
    expect(actualAt(poisoned, 2).placements).toEqual(actualAt(clean, 2).placements);
    expect(JSON.stringify(actualAt(poisoned, 0).product)).not.toContain('oracle-poison');
  });

  it('publishes stable LAY-003 paint order through patch, undo, and redo', async () => {
    const plan = selectedCase('LAY-003');
    const before = JSON.stringify(plan);
    const runtime = createPatchMapLayoutOrderRuntime('LAY-003');
    const surfaces: LayoutSurface[] = [];
    const execution = await execute(plan, runtime.product, surfaces);

    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual(LAYOUT_ORDER_ACTION_TYPES.slice(3).map((type, index) => ({
        index,
        type,
        status: 'completed',
      })));
    expect(paintOrderAt(execution, 0)).toEqual([
      'low',
      'first',
      'second',
      'high',
      'selection',
      'transformer',
    ]);
    expect(paintOrderAt(execution, 1)).toEqual([
      'first',
      'second',
      'low',
      'high',
      'selection',
      'transformer',
    ]);
    expect(paintOrderAt(execution, 2)).toEqual(paintOrderAt(execution, 0));
    expect(paintOrderAt(execution, 3)).toEqual(paintOrderAt(execution, 1));
    expect(actualAt(execution, 1).mutation).toMatchObject({
      status: 'committed',
      changed: true,
    });
    expect(actualAt(execution, 2).transition).toMatchObject({
      status: 'committed',
      direction: 'undo',
    });
    expect(actualAt(execution, 3).transition).toMatchObject({
      status: 'committed',
      direction: 'redo',
    });
    expect(execution.datasetObservations).toEqual({});
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({
      loadCount: 1,
      reconcileCount: 3,
      publishCount: 4,
      destroyed: true,
      canvasCount: 0,
    });
    expect(JSON.stringify(plan)).toBe(before);
    const productCleanup = runtime.postDestroyProductProbe();
    expect(productCleanup).toMatchObject({
      caseId: 'LAY-003',
      runtimeCounts: zeroOwnership(),
      stats: { stackingDatasetBuildCount: 1, resourceProbeCount: 4 },
    });
    const foldExecution = structuredClone(execution);
    requireRecord(foldExecution.cleanup, 'stacking execution cleanup').productResources =
      productCleanup;
    const folded = foldLayoutOrderExecution({
      casePlan: plan,
      execution: foldExecution,
      provenance: {
        contractRevision: 'core-v2-functional-contract/2026-07-16.2',
        codeCommit: 'unit',
        packedPackageSha256: 'unit',
      },
      environment: {
        browser: 'vitest',
        browserVersion: 'unit',
        os: 'unit',
        backend: 'webgl2',
        routeSize: '100',
      },
    });
    const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === 'LAY-003');
    if (expectedCase === undefined) throw new Error('Missing approved LAY-003 observations');
    const comparison = compareObservation({
      expectedCase: expectedCase as unknown as ExpectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });
    expect(expectedCase.expected.assertions).toHaveLength(9);
    expect(comparison).toMatchObject({ passed: 9, failed: 0 });
    expect(comparison.assertions.every(({ passed }) => passed)).toBe(true);
  });

  it.each(['LAY-002', 'LAY-003'] as const)(
    'runs and repeats %s through the focused Lab bridge with the PatchMapRuntime product surface',
    async (caseId) => {
      const renderers: LayoutOrderRendererTestDouble[] = [];
      const bridge = createPatchMapExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
        size: '100',
        seed: 319,
        surfaceHost: {
          querySelector(): null { return null; },
        } as unknown as HTMLElement,
        surfaceFactory: productSurfaceFactory(renderers),
        environment: { browser: 'vitest', backend: 'webgl2', routeSize: '100' },
      });

      const first = await bridge.runCase();
      const repeated = await bridge.repeatCase();

      expect(first.status).toBe('observed');
      expect(repeated.status).toBe('observed');
      expect(first.actualObservation.case).toMatchObject({ id: caseId });
      expect(repeated.actualObservation).toEqual(first.actualObservation);
      expect(first.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(repeated.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(renderers).toHaveLength(2);
      expect(renderers.every(({ destroyed }) => destroyed)).toBe(true);
      await expect(bridge.destroyCase()).resolves.toMatchObject({
        status: 'completed',
        runCount: 2,
        completedRunCount: 2,
        retainedCanvasCount: 0,
        retainedSubscriptionCount: 0,
        retainedPendingWork: 0,
      });
    },
  );
});

async function execute(
  plan: MaterializedCase,
  product: ReturnType<typeof createPatchMapLayoutOrderRuntime>['product'],
  surfaces: LayoutSurface[],
): Promise<CaseExecution> {
  const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
    const surface = new LayoutSurface(options);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
  return executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new PatchMap({ surfaceFactory }),
    datasets: new Map(),
    clock: new ManualClock(),
    handlerEntries: createLayoutOrderHandlerEntries(
      product as unknown as Readonly<Record<string, unknown>>,
    ),
  });
}

function selectedCase(caseId: 'LAY-002' | 'LAY-003' = 'LAY-002'): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (selected === undefined) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const result = execution.actionResults[index];
  if (result === undefined) throw new Error(`Missing action ${index}`);
  return result.delta.actual;
}

function paintOrderAt(execution: CaseExecution, index: number): readonly unknown[] {
  const paint = requireRecord(actualAt(execution, index).paint, `action ${index} paint`);
  return requireArray(paint.renderOrder, `action ${index} render order`);
}

function row(placements: JsonRecord, placement: string): JsonRecord {
  const rows = requireArray(placements.rows, 'placement rows');
  const selected = rows.find((entry) => (
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      && (entry as JsonRecord).placement === placement
  ));
  return requireRecord(selected, `placement row ${placement}`);
}

function placementOrder(): readonly string[] {
  return [
    'left',
    'left-top',
    'left-bottom',
    'top',
    'right',
    'right-top',
    'right-bottom',
    'bottom',
    'center',
    'none',
  ];
}

function zeroOwnership(): Readonly<JsonRecord> {
  return {
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    pendingWorkCount: 0,
  };
}

class LayoutSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public publishCount = 0;
  public reconcileCount = 0;

  private readonly scene = new CoreScene();
  private readonly width: number;
  private readonly height: number;
  private readonly pixelRatio: number;
  private document: SceneDocument = Object.freeze({ version: 1, entities: Object.freeze([]) });
  private projection: PatchMapProjectionIndex = Object.freeze({ byEntityId: Object.freeze({}) });
  private geometryRevision = 0;
  private renderedSceneRevision: number | null = null;
  private selectionIds: readonly string[] = Object.freeze([]);
  private surfaceView: PatchMapSurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loadCount += 1;
    const parsed = parseDataset(input);
    this.scene.load(parsed.document);
    this.document = parsed.document;
    this.projection = parsed.projection;
    this.geometryRevision += 1;
    this.renderedSceneRevision = null;
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(input: unknown): PatchMapSurfaceReconcileResult {
    this.reconcileCount += 1;
    const next = parseDataset(input);
    const plan = planPatchMapSceneReconcile(this.document, next.document);
    if (!plan.safeToCommit) {
      return Object.freeze({
        status: 'refused',
        operationCount: 0,
        denseChanged: false,
        diagnostics: plan.diagnostics,
      });
    }
    this.scene.commit(plan.batch);
    this.document = next.document;
    this.projection = next.projection;
    this.geometryRevision += 1;
    this.renderedSceneRevision = null;
    return Object.freeze({
      status: 'committed',
      operationCount: plan.summary.operationCount,
      denseChanged: plan.summary.operationCount > 0,
      diagnostics: plan.diagnostics,
    });
  }

  public publishFrame(_timeMs: number): void {
    this.publishCount += 1;
    this.renderedSceneRevision = this.scene.snapshot().revision;
  }
  public resize(_width: number, _height: number, _pixelRatio: number): boolean { return false; }
  public setView(view: PatchMapSurfaceView): void { this.surfaceView = Object.freeze({ ...view }); }
  public select(ids: readonly string[]): void { this.selectionIds = Object.freeze([...ids]); }
  public hitTestScreen(_point: PatchMapPoint): string | null { return null; }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint { return Object.freeze({ ...point }); }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: this.document.entities.length,
      visiblePrimitiveCount: this.document.entities.length,
    });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    return Object.freeze({
      ...createPatchMapSurfaceGeometrySnapshot(
        this.scene.snapshot(),
        this.projection,
        this.surfaceView,
      ),
      revision: this.geometryRevision,
    });
  }

  public paintOrderProbe(): PatchMapPaintOrderProductProbe {
    const snapshot = this.scene.snapshot();
    const overlaysVisible = this.selectionIds.length > 0;
    const overlayCount = overlaysVisible ? 2 : 0;
    return createPatchMapPaintOrderProductProbe({
      snapshot,
      projection: this.projection,
      overlays: Object.freeze({
        order: Object.freeze(['selection', 'transformer'] as const),
        selection: overlaysVisible,
        transformer: overlaysVisible,
        selectedEntityCount: this.selectionIds.length,
        renderObjectCount: overlayCount,
      }),
      renderer: Object.freeze({
        frame: this.publishCount,
        aggregateRenderObjects: snapshot.entityCount + overlayCount,
      }),
      renderedSceneRevision: this.renderedSceneRevision,
      paintForEntity: (entityId) => paintProbe(entityId),
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.document = Object.freeze({ version: 1, entities: Object.freeze([]) });
    this.projection = Object.freeze({ byEntityId: Object.freeze({}) });
    this.selectionIds = Object.freeze([]);
    return Promise.resolve(true);
  }
}

function productSurfaceFactory(
  renderers: LayoutOrderRendererTestDouble[],
): PatchMapEngineSurfaceFactory {
  return (options) => {
    const renderer = new LayoutOrderRendererTestDouble(
      options.width,
      options.height,
      options.pixelRatio,
    );
    renderers.push(renderer);
    const TestPatchMap = PatchMapRuntime as unknown as new (
      renderer: PatchMapPixiRenderer,
      coreOptions: PatchMapRuntimeOptions,
    ) => PatchMapRuntime;
    const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
      autoRender: false,
    });
    return Promise.resolve(new PixiEngineSurface(core));
  };
}

class LayoutOrderRendererTestDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public destroyed = false;

  private frame = 0;
  private selectedCount = 0;
  private entityCount = 0;
  private readonly paintById = new Map<string, PatchMapEntityPaintProbe>();
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly pixelRatio: number,
  ) {}

  public markChanges(): void {}
  public markOverlayChanges(): void {}
  public setProjection(
    _index: PatchMapProjectionIndex,
    _ranges?: readonly SlotRange[],
  ): boolean { return true; }
  public setWorldOrientation(): boolean { return true; }
  public resize(): boolean { return false; }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(store: RenderStoreView): RendererFlushResult {
    this.frame += 1;
    this.selectedCount = 0;
    this.entityCount = store.liveCount;
    this.paintById.clear();
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if (store.alive[slot] !== 1) continue;
      if (((store.flags[slot] ?? 0) & RenderFlags.Selected) !== 0) this.selectedCount += 1;
      const entityId = store.ids[slot];
      if (!entityId) continue;
      this.paintById.set(entityId, Object.freeze({
        entityId,
        lane: store.kind[slot] === RenderKind.Relation
          ? 'relations-dynamic'
          : 'ordinary-geometry',
        rendererKind: 'mesh',
        primitiveCount: 1,
        renderObjectCount: 1,
        packedTint: store.fill[slot] ?? null,
        rgbTint: null,
        alpha: store.opacity[slot] ?? null,
      }));
    }
    return Object.freeze({ rendered: true, commandCount: this.entityCount });
  }
  public entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null {
    return this.paintById.get(entityId) ?? null;
  }
  public overlayPaintProbe(): PatchMapOverlayPaintProbe {
    const visible = this.selectedCount > 0;
    return Object.freeze({
      order: Object.freeze(['selection', 'transformer'] as const),
      selection: visible,
      transformer: visible,
      selectedEntityCount: this.selectedCount,
      renderObjectCount: visible ? 2 : 0,
    });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(): Promise<void> { return Promise.resolve(); }
  public unloadAsset(): Promise<boolean> { return Promise.resolve(false); }
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapPixiRendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 1,
      entityCount: this.entityCount,
      aggregateRenderObjects: this.entityCount + (this.selectedCount > 0 ? 2 : 0),
      visiblePrimitives: this.entityCount,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      pixiTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
      view: this.view,
      lastInvalidation: 'test',
      destroyed: this.destroyed,
    });
  }
  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.paintById.clear();
    this.selectedCount = 0;
    this.entityCount = 0;
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

function paintProbe(entityId: string): PatchMapEntityPaintProbe {
  return Object.freeze({
    entityId,
    lane: 'ordinary-geometry',
    rendererKind: 'mesh',
    primitiveCount: 1,
    renderObjectCount: 1,
    packedTint: null,
    rgbTint: null,
    alpha: 1,
  });
}

function parseDataset(input: unknown): Readonly<{
  document: SceneDocument;
  projection: PatchMapProjectionIndex;
}> {
  const materialized = materializePatchMapDataset(input);
  const parsed = parsePatchMapV010(materialized.dataset);
  return Object.freeze({ document: parsed.document, projection: parsed.projection });
}

class ManualClock implements ClockContract {
  private time = 0;
  public now(): number { return this.time; }
  public advanceTo(timeMs: number): Promise<void> {
    this.time = timeMs;
    return Promise.resolve();
  }
  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing ${label}`);
  }
  return value as JsonRecord;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Missing ${label}`);
  return value;
}
