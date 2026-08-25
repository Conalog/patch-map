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
  hitTestPatchMapSurfaceRelations,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapRelationHit,
  type PatchMapRelationHitOptions,
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

interface HandlerRuntime {
  readonly RENDER_RELATIONS_ACTION_TYPES: readonly string[];
  readonly RENDER_RELATIONS_CASE_IDS: readonly string[];
  createRenderRelationsHandlerEntries(this: void): readonly HandlerEntry[];
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
  readonly datasetObservations: Readonly<Record<string, unknown>>;
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
  loadRuntime<HandlerRuntime>('../../verification/contract/handlers/render-relations.mjs'),
  loadRuntime<WorkerRuntime>('../../verification/contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  RENDER_RELATIONS_ACTION_TYPES,
  RENDER_RELATIONS_CASE_IDS,
  createRenderRelationsHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap REN-007 render-relations actual-only handlers', () => {
  it('registers five exact browser-safe handlers without consuming answer evidence', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../verification/contract/handlers/render-relations.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const compact = source.replaceAll(/\s/gu, '');
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_RELATIONS_ACTION_TYPES).toEqual([
      'loadDataset',
      'observeRelationPath',
      'patch',
      'setVisibility',
      'observeRelationContractMatrix',
    ]);
    expect(RENDER_RELATIONS_CASE_IDS).toEqual(['REN-007']);
    expect(createRenderRelationsHandlerEntries().map(([handlerId]) => handlerId)).toEqual(
      RENDER_RELATIONS_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/\.expected\b/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('handlers/render-relations.mjs', 'handler');
    expect(compact).not.toContain('[[10,0],[30,-10],[40,10],[30,30],[10,20]]');
    expect(compact).not.toContain('[170,260]');
    expect(compact).not.toContain('[230,440]');
    expect(source).toContain("callSync(engine, 'relationProbe'");
    expect(source).toContain("'relationHitTestScreen'");
    expect(source).toContain("call(engine, 'setWorldTransform'");
    expect(source).toContain("call(engine, 'setViewport'");
    expect(source).toContain("'resize',");
  });

  it('rejects adjacent trace drift before allocating an Engine', async () => {
    const plan = selectedCase();
    const entry = createRenderRelationsHandlerEntries()[0];
    if (entry === undefined) throw new Error('Missing loadDataset handler');
    const handler = entry[1];
    const context = {
      caseId: 'REN-007',
      actionIndex: 0,
      fixtureParams: plan.fixture.setup.params,
      signal: new AbortController().signal,
      clock: new ManualClock(),
      ensureMainEngine: () => Promise.reject(new Error('must not initialize')),
      currentMainEngine: () => null,
      ensureSessionEngine: () => Promise.reject(new Error('must not create session')),
      releaseEngine: () => Promise.reject(new Error('must not release')),
      fingerprint: () => 'unused',
    };

    await expect(handler(context, {
      index: 0,
      type: 'loadDataset',
      operands: { datasetId: 'nearby-relations' },
    })).rejects.toThrow(/action 0 operands/u);
  });

  it('executes relation movement, visibility, transform, link reconciliation, and a fresh repeat', async () => {
    const plan = selectedCase();
    const planBefore = JSON.stringify(plan);
    const fixtureBefore = JSON.stringify(plan.fixture.setup.params);
    const surfaces: RelationSurface[] = [];
    const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
      const surface = new RelationSurface(options);
      surfaces.push(surface);
      return Promise.resolve(surface);
    };
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: () => new PatchMap({ surfaceFactory }),
      datasets: new Map(),
      clock: new ManualClock(),
      handlerEntries: createRenderRelationsHandlerEntries(),
    });

    expect(execution).toMatchObject({
      caseId: 'REN-007',
      status: 'completed',
      error: null,
      terminalSnapshot: {
        lifecycle: 'scene-ready',
      },
      terminalSemanticProbe: {
        lifecycle: 'scene-ready',
        interaction: { activeGestureCount: 0 },
      },
      cleanup: { status: 'completed', errors: [], declaredActions: ['destroy-case'] },
    });
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual([
        'loadDataset',
        'observeRelationPath',
        'patch',
        'setVisibility',
        'setVisibility',
        'observeRelationContractMatrix',
      ].map((type, index) => ({ index, type, status: 'completed' })));

    expect(actualAt(execution, 0)).toMatchObject({
      datasetId: 'relations',
      input: { unchanged: true },
    });
    expect(actualAt(execution, 1)).toMatchObject({
      relationId: 'links',
      segmentKeys: ['a>a', 'a>b', 'b>a'],
      duplicatePairCount: 0,
      selfLink: { kind: 'polyline' },
      hitProbe: { target: 'a>a' },
      missProbe: { target: null },
    });
    expect(actualAt(execution, 2)).toMatchObject({
      targetId: 'b',
      mutation: { status: 'committed', changed: true },
      staleSegmentCount: 0,
    });
    expect(actualAt(execution, 3)).toMatchObject({
      targetId: 'b',
      show: false,
      visibleSegmentKeys: ['a>a'],
    });
    expect(actualAt(execution, 4)).toMatchObject({
      targetId: 'b',
      show: true,
      staleSegmentCount: 0,
    });
    const matrix = actualAt(execution, 5);
    expect(matrix).toMatchObject({
      valueRef: 'relationContractMatrix',
      relationId: 'nested-links',
      complete: true,
      deterministic: true,
      input: { unchanged: true },
    });
    expect(matrix.repeatContractMatrix).toEqual(matrix.contractMatrix);
    const matrixObservation = matrix.contractMatrix;
    if (!isRecord(matrixObservation)) throw new Error('Missing contract matrix observation');
    expect(Array.isArray(matrixObservation.initialSegmentKeys)).toBe(true);
    expect(Array.isArray(matrixObservation.finalSegmentKeys)).toBe(true);
    expect(typeof matrixObservation.omittedMissingEndpointSegments).toBe('number');
    const style = matrixObservation.style;
    if (!isRecord(style)) throw new Error('Missing contract matrix style');
    expect(typeof style.color).toBe('string');
    expect(typeof style.visible).toBe('boolean');

    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]).toMatchObject({
      loadCount: 2,
      reconcileCount: 7,
      resizeCount: 1,
      destroyed: true,
      canvasCount: 0,
    });
    expect(surfaces[1]).toMatchObject({
      loadCount: 1,
      reconcileCount: 4,
      resizeCount: 1,
      destroyed: true,
      canvasCount: 0,
    });
    const cleanup = execution.cleanup as JsonRecord;
    const releases = cleanup.releases as readonly JsonRecord[];
    expect(releases).toHaveLength(2);
    expect(releases.every((release) => {
      const remaining = release.remainingResources as JsonRecord;
      return remaining.canvasCount === 0
        && remaining.subscriptions === 0
        && remaining.pendingWork === 0;
    })).toBe(true);
    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(plan.fixture.setup.params)).toBe(fixtureBefore);
    expect(execution.captures).toEqual([]);
    expect(execution.datasetObservations).toEqual({});
  });
});

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['REN-007'] })[0];
  if (selected === undefined) throw new Error('Missing approved REN-007 case');
  return materializeCase(selected, { size: '100', seed: '319' });
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const result = execution.actionResults[index];
  if (result === undefined) throw new Error(`Missing action ${index}`);
  return result.delta.actual;
}

class RelationSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public reconcileCount = 0;
  public resizeCount = 0;

  private readonly scene = new CoreScene();
  private width: number;
  private height: number;
  private pixelRatio: number;
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
    return Object.freeze({
      status: 'committed',
      operationCount: plan.summary.operationCount,
      denseChanged: plan.summary.operationCount > 0,
      diagnostics: plan.diagnostics,
    });
  }

  public publishFrame(_timeMs: number): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    if (changed) this.resizeCount += 1;
    return changed;
  }

  public setView(view: PatchMapSurfaceView): void {
    this.surfaceView = Object.freeze({ ...view });
  }

  public select(_ids: readonly string[]): void {}
  public hitTestScreen(_point: PatchMapPoint): string | null { return null; }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint { return Object.freeze({ ...point }); }

  public relationHitTestScreen(
    point: PatchMapPoint,
    options?: PatchMapRelationHitOptions,
  ): PatchMapRelationHit | null {
    return hitTestPatchMapSurfaceRelations(this.geometrySnapshot().relations, point, options);
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    const geometry = this.geometrySnapshot();
    const visibleRelationCount = geometry.relations.filter(({ visible }) => visible).length;
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: this.document.entities.length + visibleRelationCount,
      visiblePrimitiveCount: this.document.entities.length + visibleRelationCount,
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

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
