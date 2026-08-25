import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from '../support/contract-verifier-import-firewall';
import { createTestProjectionIndex } from '../support/projection-index';

import type { SceneDocument } from '../../src/dense/contracts';
import { CoreScene } from '../../src/dense/scene';
import type { PatchMapProjectionIndex } from '../../src/parsing/contracts';
import {
  PatchMap,
  createPatchMapSurfaceGeometrySnapshot,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceGeometrySnapshot,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileResult,
  type PatchMapSurfaceView,
} from '../../src/engine';
import { parsePatchMap } from '../../src/parsing';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import { planPatchMapSceneReconcile } from '../../src/core/reconcile';

type JsonRecord = Record<string, unknown>;
type HandlerEntry = readonly [string, (context: unknown, action: unknown) => unknown];

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

interface HandlerRuntime {
  readonly RENDER_ORIENTATION_ACTION_TYPES: readonly string[];
  readonly RENDER_ORIENTATION_CASE_IDS: readonly string[];
  createRenderOrientationHandlerEntries(this: void): readonly HandlerEntry[];
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
    readonly delta: Readonly<{ readonly actual: JsonRecord; readonly semanticProbe: unknown }>;
  }>[];
  readonly datasetObservations: Readonly<Record<string, Readonly<{ readonly unchanged: boolean }>>>;
  readonly terminalSnapshot: unknown;
  readonly terminalSemanticProbe: unknown;
  readonly cleanup: unknown;
  readonly captures: readonly unknown[];
  readonly error: unknown;
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

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, handlerRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../verification/contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../verification/contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>('../../verification/contract/handlers/render-orientation.mjs'),
  loadRuntime<WorkerRuntime>('../../verification/contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  RENDER_ORIENTATION_ACTION_TYPES,
  RENDER_ORIENTATION_CASE_IDS,
  createRenderOrientationHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap LAY-004 render-orientation actual-only handlers', () => {
  it('registers four exact browser-safe handlers without consuming answer fields', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../verification/contract/handlers/render-orientation.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');
    const forbiddenBasisField = ['expected', 'Basis'].join('');
    const forbiddenCenterField = ['expected', 'Visible', 'Center'].join('');

    expect(RENDER_ORIENTATION_ACTION_TYPES).toEqual([
      'loadOrientationMatrix',
      'setWorldTransform',
      'setContentOrientation',
      'observeOrientationMatrix',
    ]);
    expect(RENDER_ORIENTATION_CASE_IDS).toEqual(['LAY-004']);
    expect(createRenderOrientationHandlerEntries().map(([handlerId]) => handlerId)).toEqual(
      RENDER_ORIENTATION_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toContain(forbiddenBasisField);
    expect(source).not.toContain(forbiddenCenterField);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('handlers/render-orientation.mjs', 'handler');
    expect(source).toContain("call(engine, 'setWorldTransform'");
    expect(source).toContain("call(engine, 'patch'");
    expect(source).toContain('entity.screenAngle');
    expect(source).not.toContain('entity.rotationDegrees');
    expect(source).not.toContain("call(engine, 'loadDataset', mutation");
  });

  it('rejects an adjacent trace operand before any Engine method can run', async () => {
    const plan = selectedCase();
    const entry = createRenderOrientationHandlerEntries()[0];
    if (entry === undefined) throw new Error('Missing loadOrientationMatrix handler');
    const handler = entry[1];
    const context = {
      caseId: 'LAY-004',
      actionIndex: 0,
      fixtureParams: plan.fixture.setup.params,
      signal: new AbortController().signal,
      clock: new ManualClock(),
      ensureMainEngine: () => Promise.reject(new Error('must not initialize')),
      currentMainEngine: () => null,
      fingerprint: () => 'unused',
    };

    await expect(handler(context, {
      index: 0,
      type: 'loadOrientationMatrix',
      operands: { itemId: 'nearby-item' },
    })).rejects.toThrow(/action 0 operands/u);
  });

  it('loads authored rows once, applies one view transform and one incremental mode patch', async () => {
    const plan = selectedCase();
    const planBefore = JSON.stringify(plan);
    const fixtureBefore = JSON.stringify(plan.fixture.setup.params);
    const surfaces: OrientationSurface[] = [];
    const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
      const surface = new OrientationSurface(options);
      surfaces.push(surface);
      return Promise.resolve(surface);
    };
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: () => new PatchMap({ surfaceFactory }),
      datasets: new Map(),
      clock: new ManualClock(),
      handlerEntries: createRenderOrientationHandlerEntries(),
    });

    expect(execution).toMatchObject({
      caseId: 'LAY-004',
      status: 'completed',
      error: null,
      terminalSnapshot: {
        lifecycle: 'scene-ready',
        frameRevision: 8,
        revisions: { sceneRevision: 2, viewRevision: 6 },
        viewport: { scale: 1 },
      },
      cleanup: { status: 'completed', errors: [] },
    });
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual(RENDER_ORIENTATION_ACTION_TYPES.map((type, index) => ({
        index,
        type,
        status: 'completed',
      })));

    expect(actualAt(execution, 0)).toMatchObject({
      item: { id: 'item' },
      rowCount: 11,
      input: { unchanged: true },
    });
    expect(actualAt(execution, 1)).toMatchObject({
      transform: { rotationDegrees: 90, flipX: true, flipY: false },
      item: {
        ownerItemId: 'item',
        componentId: 'central-content',
        componentType: 'text',
        contentOrientation: 'follow-item',
        screenAngle: 90,
      },
    });
    expect(actualAt(execution, 2)).toMatchObject({
      itemId: 'item',
      mode: 'upright',
      mutation: {
        status: 'committed',
        changed: true,
        denseChanged: false,
      },
      identity: { before: 'item', after: 'item' },
      item: {
        contentOrientation: 'upright',
        screenAngle: 270,
        visibleCenter: [50, 40],
      },
    });
    const observed = actualAt(execution, 3);
    expect(observed).toMatchObject({
      valueRef: 'orientationMatrix',
      complete: true,
      deterministic: true,
      input: { unchanged: true },
    });
    const matrix = observed.orientationMatrix as readonly JsonRecord[];
    expect(matrix).toHaveLength(11);
    expect(matrix.map(({ id, kind, mode }) => ({ id, kind, mode }))).toEqual([
      { id: 'text-0', kind: 'text', mode: 'follow-item' },
      { id: 'icon-90', kind: 'icon', mode: 'follow-item' },
      { id: 'bar-180', kind: 'bar', mode: 'follow-item' },
      { id: 'text-270', kind: 'text', mode: 'follow-item' },
      { id: 'text-37', kind: 'text', mode: 'follow-item' },
      { id: 'nested-67', kind: 'icon', mode: 'follow-item' },
      { id: 'flip-x', kind: 'bar', mode: 'follow-item' },
      { id: 'flip-y', kind: 'icon', mode: 'follow-item' },
      { id: 'flip-xy', kind: 'text', mode: 'follow-item' },
      { id: 'negative-scale-37', kind: 'bar', mode: 'follow-item' },
      { id: 'upright-nested', kind: 'text', mode: 'upright' },
    ]);
    for (const row of matrix) {
      expect(finiteTuple(4)(row.screenBasis)).toBe(true);
      expect(finiteTuple(2)(row.visibleCenter)).toBe(true);
    }
    expect(observed.repeatOrientationMatrix).toEqual(matrix);
    const flipSweep = observed.worldFlipSweep as readonly JsonRecord[];
    expect(flipSweep.map(({ mode }) => mode)).toEqual(['none', 'x', 'y', 'xy']);
    expect(flipSweep.map(({ transform }) => transform)).toEqual([
      { rotationDegrees: 90, flipX: false, flipY: false },
      { rotationDegrees: 90, flipX: true, flipY: false },
      { rotationDegrees: 90, flipX: false, flipY: true },
      { rotationDegrees: 90, flipX: true, flipY: true },
    ]);
    for (const row of flipSweep) {
      expect(row.state).toEqual(row.transform);
      expect((row.upright as JsonRecord).screenBasis).toEqual([0, -1, 1, 0]);
      expect((row.upright as JsonRecord).visibleCenter).toEqual([50, 40]);
    }

    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({
      loadCount: 1,
      reconcileCount: 1,
      destroyed: true,
      canvasCount: 0,
      stableIdentity: true,
    });
    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(plan.fixture.setup.params)).toBe(fixtureBefore);
    expect(execution.captures).toEqual([{
      id: 'before',
      phase: 'after-action',
      afterActionIndex: 0,
      values: { 'item/id': 'item' },
    }]);
    expect(execution.datasetObservations).toEqual({});
  });
});

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['LAY-004'] })[0];
  if (selected === undefined) throw new Error('Missing approved LAY-004 case');
  return materializeCase(selected, { size: '100', seed: '319' });
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const result = execution.actionResults[index];
  if (result === undefined) throw new Error(`Missing action ${index}`);
  return result.delta.actual;
}

function finiteTuple(length: number): (value: unknown) => boolean {
  return (value) => Array.isArray(value)
    && value.length === length
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

class OrientationSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public reconcileCount = 0;
  public stableIdentity = false;

  private readonly scene = new CoreScene();
  private readonly width: number;
  private readonly height: number;
  private readonly pixelRatio: number;
  private document: SceneDocument = Object.freeze({ version: 1, entities: Object.freeze([]) });
  private projection: PatchMapProjectionIndex = createTestProjectionIndex();
  private geometryRevision = 0;
  private surfaceView: PatchMapSurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });
  private stableRef: Readonly<{ readonly slot: number; readonly generation: number }> | null = null;

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loadCount += 1;
    const next = parseDataset(input);
    this.scene.load(next.document);
    this.document = next.document;
    this.projection = next.projection;
    this.geometryRevision += 1;
    this.stableRef = this.scene.ref('item::text:central-content');
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
    const currentRef = this.scene.ref('item::text:central-content');
    this.stableIdentity = this.stableRef !== null
      && currentRef !== null
      && currentRef.slot === this.stableRef.slot
      && currentRef.generation === this.stableRef.generation;
    return Object.freeze({
      status: 'committed',
      operationCount: plan.summary.operationCount,
      denseChanged: plan.summary.operationCount > 0,
      diagnostics: plan.diagnostics,
    });
  }

  public publishFrame(_timeMs: number): void {}
  public resize(_width: number, _height: number, _pixelRatio: number): boolean { return false; }
  public setView(view: PatchMapSurfaceView): void { this.surfaceView = Object.freeze({ ...view }); }
  public select(_ids: readonly string[]): void {}
  public hitTestScreen(_point: PatchMapPoint): string | null { return null; }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint { return Object.freeze({ ...point }); }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: Object.freeze([]),
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

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.document = Object.freeze({ version: 1, entities: Object.freeze([]) });
    this.projection = createTestProjectionIndex();
    return Promise.resolve(true);
  }
}

function parseDataset(input: unknown): Readonly<{
  document: SceneDocument;
  projection: PatchMapProjectionIndex;
}> {
  const materialized = materializePatchMapDataset(input);
  const parsed = parsePatchMap(materialized.dataset);
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
