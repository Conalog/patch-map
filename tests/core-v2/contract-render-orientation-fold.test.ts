import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import type { SceneDocument } from '../../src/core-v1/contracts';
import { CoreScene } from '../../src/core-v1/scene';
import type { CoreV2ProjectionIndex } from '../../src/core-v2/contracts';
import {
  CoreV2Engine,
  createCoreV2SurfaceGeometrySnapshot,
  type CoreV2EngineSurface,
  type CoreV2EngineSurfaceFactory,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceGeometrySnapshot,
  type CoreV2SurfaceOptions,
  type CoreV2SurfaceReconcileResult,
  type CoreV2SurfaceView,
} from '../../src/core-v2/engine';
import { parsePatchMapV010 } from '../../src/core-v2/parser';
import { materializeCoreV2Dataset } from '../../src/core-v2/semantic/dataset';
import { planCoreV2SceneReconcile } from '../../src/core-v2/semantic/reconcile';

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
  createRenderOrientationHandlerEntries(this: void): readonly HandlerEntry[];
}

interface FoldResult {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

interface FoldRuntime {
  readonly RENDER_ORIENTATION_FOLD_REVISION: string;
  foldRenderOrientationExecution(
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
      engineFactory: () => CoreV2Engine;
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
  loadRuntime<HandlerRuntime>('../../scripts/verification/core-v2-contract/handlers/render-orientation.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-render-orientation.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { createRenderOrientationHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { RENDER_ORIENTATION_FOLD_REVISION, foldRenderOrientationExecution } = foldRuntime;
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

describe('Core v2 LAY-004 render-orientation actual-only fold', () => {
  it('is import-free, browser-safe, expected-blind, and revisioned', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-render-orientation.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');
    const forbiddenBasisField = ['expected', 'Basis'].join('');
    const forbiddenCenterField = ['expected', 'Visible', 'Center'].join('');

    expect(RENDER_ORIENTATION_FOLD_REVISION).toBe('core-v2-render-orientation-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toContain(forbiddenBasisField);
    expect(source).not.toContain(forbiddenCenterField);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it('folds the real Engine execution into fourteen frozen domains and nested capture paths', async () => {
    const { plan, execution } = await executeCase();
    const folded = fold(plan, execution);

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    for (const domain of DOMAIN_NAMES) expect(folded.actual[domain]).toBeTypeOf('object');
    expect(folded.actual).toMatchObject({
      $schema: 'core-v2-semantic-observation/1',
      case: { id: 'LAY-004', caseType: 'capability' },
      scene: { revision: 2 },
      geometry: {
        'follow-item': { screenAngle: { at90: 90 } },
      },
      text: { upright: { screenAngle: { at90: 270 }, visibleCenter: [50, 40] } },
      interaction: { modeChange: { identity: 'item' }, viewport: { scale: 1 } },
      outcome: {
        matrix: { allAnglesFinite: true, allFlipCentersStable: true },
        orientationMatrix: { allRowsExact: true },
      },
      resources: { cleanup: { status: 'completed', errors: [] } },
    });
    expect(valueAt(folded.actual, ['geometry', 'orientationMatrix'])).toContainEqual({
      id: 'text-0',
      kind: 'text',
      mode: 'follow-item',
      screenBasis: [1, 0, 0, 1],
      visibleCenter: [50, 40],
    });
    expect(folded.fixtures.orientationMatrix).toHaveLength(11);
    expect(folded.captures).toEqual({ before: { item: { id: 'item' } } });
    expect(Object.isFrozen(folded)).toBe(true);
    expect(Object.isFrozen(folded.actual)).toBe(true);
    expect(Object.isFrozen(folded.fixtures)).toBe(true);
    expect(Object.isFrozen(folded.captures)).toBe(true);
  });

  it('reports the immutable screen-lock conflicts independently', async () => {
    const { plan, execution } = await executeCase();
    const folded = fold(plan, execution);
    const expectedCase = (normalizedExpectedCatalog.cases as readonly ExpectedCase[])
      .find(({ id }) => id === 'LAY-004');
    if (expectedCase === undefined) throw new Error('Missing LAY-004 expected record');
    const comparison = compareObservation({
      expectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(expectedCase.expected.assertions).toHaveLength(11);
    expect(comparison).toMatchObject({ passed: 9, failed: 2 });
    expect(
      comparison.assertions
        .filter(({ passed }) => !passed)
        .map(({ path }) => path),
    ).toEqual([
      '/text/upright/screenAngle/at90',
      '/geometry/orientationMatrix',
    ]);
  });

  it('derives row exactness from completeness and repeated product parity', async () => {
    const { plan, execution } = await executeCase();
    const drifted = structuredClone(execution);
    const results = drifted.actionResults as JsonRecord[];
    const observed = results[3]?.delta as JsonRecord | undefined;
    const actual = observed?.actual as JsonRecord | undefined;
    const repeated = actual?.repeatOrientationMatrix as JsonRecord[] | undefined;
    if (actual === undefined || repeated === undefined || repeated[0] === undefined) {
      throw new Error('Missing repeated orientation row');
    }
    repeated[0].visibleCenter = [51, 40];
    actual.deterministic = true;

    expect(fold(plan, drifted).actual).toMatchObject({
      outcome: { orientationMatrix: { allRowsExact: false } },
    });
  });

  it('derives flip and input truth from the swept Engine observations', async () => {
    const { plan, execution } = await executeCase();
    const driftedFlip = structuredClone(execution);
    const flipActual = ((driftedFlip.actionResults as JsonRecord[])[3]?.delta as JsonRecord | undefined)
      ?.actual as JsonRecord | undefined;
    const sweep = flipActual?.worldFlipSweep as JsonRecord[] | undefined;
    const noneFollow = sweep?.[0]?.follow as JsonRecord | undefined;
    const yFollow = sweep?.[2]?.follow as JsonRecord | undefined;
    if (noneFollow === undefined || yFollow === undefined) throw new Error('Missing world flip sweep');
    yFollow.screenBasis = structuredClone(noneFollow.screenBasis);

    expect(fold(plan, driftedFlip).actual).toMatchObject({
      outcome: { matrix: { allFlipCentersStable: false } },
    });

    const driftedInput = structuredClone(execution);
    const inputActual = ((driftedInput.actionResults as JsonRecord[])[3]?.delta as JsonRecord | undefined)
      ?.actual as JsonRecord | undefined;
    const input = inputActual?.input as JsonRecord | undefined;
    if (input === undefined) throw new Error('Missing terminal input fingerprint');
    input.unchanged = false;
    expect(fold(plan, driftedInput).actual).toMatchObject({
      outcome: { orientationMatrix: { allRowsExact: false } },
    });
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

    const driftedExecution = structuredClone(execution);
    const cleanup = driftedExecution.cleanup as JsonRecord;
    const releases = cleanup.releases as JsonRecord[];
    const remaining = releases[0]?.remainingResources as JsonRecord | undefined;
    if (remaining === undefined) throw new Error('Missing cleanup resources');
    remaining.canvasCount = 1;
    expect(() => fold(plan, driftedExecution)).toThrow(/cleanup resource delta/u);
  });

  it('rejects action-order drift rather than folding a nearby observation', async () => {
    const { plan, execution } = await executeCase();
    const drifted = structuredClone(execution);
    const actions = drifted.actionResults as JsonRecord[];
    const second = actions[1];
    const third = actions[2];
    if (second === undefined || third === undefined) throw new Error('Missing LAY-004 actions');
    actions[1] = third;
    actions[2] = second;

    expect(() => fold(plan, drifted)).toThrow(/result 1 index/u);
  });
});

async function executeCase(): Promise<{
  readonly plan: MaterializedCase;
  readonly execution: ContractExecution;
}> {
  const selected = selectCatalogCases(catalog, { caseIds: ['LAY-004'] })[0];
  if (selected === undefined) throw new Error('Missing approved LAY-004 case');
  const plan = materializeCase(selected, { size: '100', seed: '319' });
  const surfaceFactory: CoreV2EngineSurfaceFactory = (options) => (
    Promise.resolve(new OrientationSurface(options))
  );
  const execution = await executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new CoreV2Engine({ surfaceFactory }),
    datasets: new Map(),
    clock: new ManualClock(),
    handlerEntries: createRenderOrientationHandlerEntries(),
  });
  return { plan, execution };
}

function fold(plan: MaterializedCase, execution: ContractExecution): FoldResult {
  return foldRenderOrientationExecution({
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class OrientationSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;

  private readonly scene = new CoreScene();
  private readonly width: number;
  private readonly height: number;
  private readonly pixelRatio: number;
  private document: SceneDocument = Object.freeze({ version: 1, entities: Object.freeze([]) });
  private projection: CoreV2ProjectionIndex = Object.freeze({ byEntityId: Object.freeze({}) });
  private geometryRevision = 0;
  private surfaceView: CoreV2SurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(options: CoreV2SurfaceOptions) {
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

  public reconcile(input: unknown): CoreV2SurfaceReconcileResult {
    const next = parseDataset(input);
    const plan = planCoreV2SceneReconcile(this.document, next.document);
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
  public resize(_width: number, _height: number, _pixelRatio: number): boolean { return false; }
  public setView(view: CoreV2SurfaceView): void { this.surfaceView = Object.freeze({ ...view }); }
  public select(_ids: readonly string[]): void {}
  public hitTestScreen(_point: CoreV2Point): string | null { return null; }
  public screenToWorld(point: CoreV2Point): CoreV2Point { return Object.freeze({ ...point }); }

  public debugSnapshot(): CoreV2SurfaceDebug {
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

  public geometrySnapshot(): CoreV2SurfaceGeometrySnapshot {
    return Object.freeze({
      ...createCoreV2SurfaceGeometrySnapshot(
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
  projection: CoreV2ProjectionIndex;
}> {
  const materialized = materializeCoreV2Dataset(input);
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
