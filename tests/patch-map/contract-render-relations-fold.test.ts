import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/patch-map/dense/contracts';
import { CoreScene } from '../../src/patch-map/dense/scene';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
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
} from '../../src/patch-map/engine';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { planPatchMapSceneReconcile } from '../../src/patch-map/semantic/reconcile';

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
  createRenderRelationsHandlerEntries(this: void): readonly HandlerEntry[];
}

interface FoldResult {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

interface FoldRuntime {
  readonly RENDER_RELATIONS_FOLD_REVISION: string;
  foldRenderRelationsExecution(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): FoldResult;
}

interface ClockContract {
  now(): number;
  advanceTo(timeMs: number): Promise<void>;
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
}

interface ContractExecution extends JsonRecord {
  readonly caseId: string;
  readonly status: string;
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
  ): Promise<ContractExecution>;
}

interface ExpectedCase {
  readonly id: string;
  readonly caseType: string;
  readonly expected: Readonly<{
    readonly assertions: readonly Readonly<{ readonly path: string }>[];
  }>;
  readonly volatileFields: readonly string[];
}

interface CompareResult {
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
      expectedCase: ExpectedCase;
      actual: Readonly<Record<string, unknown>>;
      fixtures: Readonly<Record<string, unknown>>;
      captures: Readonly<Record<string, unknown>>;
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
  loadRuntime<HandlerRuntime>('../../scripts/verification/core-v2-contract/handlers/render-relations.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-render-relations.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { createRenderRelationsHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { RENDER_RELATIONS_FOLD_REVISION, foldRenderRelationsExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

const DOMAIN_NAMES = [
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
] as const;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap REN-007 render-relations actual-only fold', () => {
  it('is import-free, browser-safe, expected-blind, and revisioned', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-render-relations.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const compact = source.replaceAll(/\s/gu, '');
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_RELATIONS_FOLD_REVISION).toBe('core-v2-render-relations-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/\.expected\b/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
    expect(compact).not.toContain('[[10,0],[30,-10],[40,10],[30,30],[10,20]]');
    expect(compact).not.toContain('[170,260]');
    expect(compact).not.toContain('[230,440]');
  });

  it('folds a real two-session execution into fourteen frozen relation domains', async () => {
    const { plan, execution } = await executeCase();
    const folded = fold(plan, execution);

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    for (const domain of DOMAIN_NAMES) expect(folded.actual[domain]).toBeTypeOf('object');
    expect(folded.actual).toMatchObject({
      $schema: 'core-v2-semantic-observation/1',
      case: { id: 'REN-007', caseType: 'capability' },
      scene: {
        relations: {
          segmentKeys: { initial: ['a>a', 'a>b', 'b>a'] },
          hiddenB: { visibleSegments: ['a>a'] },
        },
      },
      geometry: {
        relations: {
          selfLink: { kind: 'polyline' },
        },
      },
      interaction: { activeGestureCount: 0 },
      outcome: { deterministic: true, inputUnchanged: true },
      resources: { cleanup: { status: 'completed', errors: [] } },
    });
    for (const path of [
      ['scene', 'revision'],
      ['scene', 'hierarchy', 'nodeCount'],
      ['scene', 'relations', 'duplicatePairCount'],
      ['scene', 'relations', 'staleSegments'],
      ['geometry', 'finiteValueCount'],
      ['paint', 'commandCount'],
    ] as const) {
      expect(valueAt(folded.actual, path)).toBeTypeOf('number');
    }
    expect(Array.isArray(valueAt(
      folded.actual,
      ['geometry', 'relations', 'selfLink', 'worldPoints'],
    ))).toBe(true);
    expect(Array.isArray(valueAt(
      folded.actual,
      ['geometry', 'relations', 'contractMatrix', 'initialSegmentKeys'],
    ))).toBe(true);
    const relationFixtures = folded.fixtures.relationContractMatrix as JsonRecord;
    expect(relationFixtures).not.toHaveProperty('expected');
    const selfFixtures = folded.fixtures.selfLinkContract as JsonRecord;
    expect(Object.keys(selfFixtures)).toEqual(['relationId', 'pair', 'hitTolerance']);
    expect(folded.captures).toEqual({});
    expect(Object.isFrozen(folded)).toBe(true);
    expect(Object.isFrozen(folded.actual)).toBe(true);
    expect(Object.isFrozen(folded.fixtures)).toBe(true);
    expect(Object.isFrozen(folded.captures)).toBe(true);
  });

  it('matches all 26 immutable normalized expected assertions independently', async () => {
    const { plan, execution } = await executeCase();
    const folded = fold(plan, execution);
    const expectedCase = approvedExpectedCase();
    const comparison = compareObservation({
      expectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(expectedCase.expected.assertions).toHaveLength(26);
    expect(comparison).toMatchObject({ passed: 26, failed: 0 });
    expect(comparison.assertions.filter(({ passed }) => !passed)).toEqual([]);
  });

  it('lets the independent comparator expose product-value drift', async () => {
    const { plan, execution } = await executeCase();
    const drifted = structuredClone(execution);
    const matrixActual = actionActual(drifted, 5);
    const matrix = matrixActual.contractMatrix as JsonRecord;
    const repeat = matrixActual.repeatContractMatrix as JsonRecord;
    const matrixStyle = matrix.style as JsonRecord;
    const repeatStyle = repeat.style as JsonRecord;
    matrixStyle.color = '#000000ff';
    repeatStyle.color = '#000000ff';
    const folded = fold(plan, drifted);
    const comparison = compareObservation({
      expectedCase: approvedExpectedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(comparison.failed).toBeGreaterThan(0);
    expect(comparison.assertions.filter(({ passed }) => !passed).map(({ path }) => path))
      .toContain('/geometry/relations/contractMatrix');
  });

  it('rejects repeated-session, determinism, and input-fingerprint drift', async () => {
    const { plan, execution } = await executeCase();
    const repeatDrift = structuredClone(execution);
    const repeated = actionActual(repeatDrift, 5).repeatContractMatrix as JsonRecord;
    repeated.sourceCenterWorld = [1, 2];
    actionActual(repeatDrift, 5).deterministic = true;
    expect(() => fold(plan, repeatDrift)).toThrow(/matrix repeat drift/u);

    const deterministicDrift = structuredClone(execution);
    actionActual(deterministicDrift, 5).deterministic = false;
    expect(() => fold(plan, deterministicDrift)).toThrow(/matrix repeat drift/u);

    const inputDrift = structuredClone(execution);
    const input = actionActual(inputDrift, 5).input as JsonRecord;
    input.unchanged = false;
    expect(() => fold(plan, inputDrift)).toThrow(/matrix input changed/u);
  });

  it('rejects cleanup contract and retained-resource drift', async () => {
    const { plan, execution } = await executeCase();
    const driftedPlan = structuredClone(plan) as unknown as JsonRecord;
    const fixture = driftedPlan.fixture as JsonRecord;
    const cleanupTrace = fixture.cleanupTrace as JsonRecord[];
    const operands = cleanupTrace[0]?.operands as JsonRecord | undefined;
    if (operands === undefined) throw new Error('Missing cleanup operands');
    operands.expectedResourceDelta = 1;
    expect(() => fold(driftedPlan as unknown as MaterializedCase, execution))
      .toThrow(/cleanup trace drift/u);

    const retained = structuredClone(execution);
    const cleanup = retained.cleanup as JsonRecord;
    const releases = cleanup.releases as JsonRecord[];
    const remaining = releases[0]?.remainingResources as JsonRecord | undefined;
    if (remaining === undefined) throw new Error('Missing cleanup resources');
    remaining.canvasCount = 1;
    expect(() => fold(plan, retained)).toThrow(/resource delta/u);
  });

  it('rejects action-order drift rather than folding a nearby observation', async () => {
    const { plan, execution } = await executeCase();
    const drifted = structuredClone(execution);
    const actions = drifted.actionResults as JsonRecord[];
    const second = actions[1];
    const third = actions[2];
    if (second === undefined || third === undefined) throw new Error('Missing REN-007 actions');
    actions[1] = third;
    actions[2] = second;

    expect(() => fold(plan, drifted)).toThrow(/result 1 index/u);
  });
});

function approvedExpectedCase(): ExpectedCase {
  const expectedCase = (normalizedExpectedCatalog.cases as unknown as readonly ExpectedCase[])
    .find(({ id }) => id === 'REN-007');
  if (expectedCase === undefined) throw new Error('Missing REN-007 expected record');
  return expectedCase;
}

async function executeCase(): Promise<{
  readonly plan: MaterializedCase;
  readonly execution: ContractExecution;
}> {
  const selected = selectCatalogCases(catalog, { caseIds: ['REN-007'] })[0];
  if (selected === undefined) throw new Error('Missing approved REN-007 case');
  const plan = materializeCase(selected, { size: '100', seed: '319' });
  const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => (
    Promise.resolve(new RelationSurface(options))
  );
  const execution = await executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new PatchMap({ surfaceFactory }),
    datasets: new Map(),
    clock: new ManualClock(),
    handlerEntries: createRenderRelationsHandlerEntries(),
  });
  return { plan, execution };
}

function fold(plan: MaterializedCase, execution: ContractExecution): FoldResult {
  return foldRenderRelationsExecution({
    casePlan: plan,
    execution,
    provenance: {
      codeCommit: 'test-commit',
      packedPackageSha256: 'test-package',
      contractRevision: 'core-v2-functional-contract/2026-07-16.2',
    },
    environment: {
      browserVersion: 'unit-test',
      platform: process.platform,
      locale: 'en-US',
      devicePixelRatio: 1,
    },
  });
}

function actionActual(execution: ContractExecution, index: number): JsonRecord {
  const results = execution.actionResults as JsonRecord[];
  const delta = results[index]?.delta as JsonRecord | undefined;
  const actual = delta?.actual;
  if (!isRecord(actual)) throw new Error(`Missing action actual ${index}`);
  return actual;
}

function valueAt(root: Readonly<Record<string, unknown>>, path: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`Missing folded path ${path.join('.')}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class RelationSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;

  private readonly scene = new CoreScene();
  private width: number;
  private height: number;
  private pixelRatio: number;
  private document: SceneDocument = Object.freeze({ version: 1, entities: Object.freeze([]) });
  private projection: PatchMapProjectionIndex = Object.freeze({ byEntityId: Object.freeze({}) });
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
    const next = parseDataset(input);
    this.scene.load(next.document);
    this.document = next.document;
    this.projection = next.projection;
    this.geometryRevision += 1;
  }

  public reconcile(input: unknown): PatchMapSurfaceReconcileResult {
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
    this.projection = Object.freeze({ byEntityId: Object.freeze({}) });
    return Promise.resolve(true);
  }
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
