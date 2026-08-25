import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../contracts/patch-map/evidence/catalog-fixture-profiles.v1.json';
import normalizedExpectedCatalog from '../../contracts/patch-map/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from './support/contract-verifier-import-firewall';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceGeometrySnapshot,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/patch-map/engine';

type JsonRecord = Record<string, unknown>;
type Bounds = readonly [number, number, number, number];
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
  createRenderBoundsHandlerEntries(this: void): readonly HandlerEntry[];
}

interface FoldResult {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

interface FoldRuntime {
  readonly RENDER_BOUNDS_FOLD_REVISION: string;
  foldRenderBoundsExecution(
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

interface BoundsGeometryEntity {
  readonly id: string;
  readonly kind: string;
  readonly localBounds: Bounds;
  readonly worldBounds: Bounds;
  readonly screenBounds: Bounds;
  readonly visibleBounds: Bounds | null;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly scaleX: number;
  readonly scaleY: number;
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
  loadRuntime<CatalogRuntime>('../../scripts/verification/patch-map-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/patch-map-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>('../../scripts/verification/patch-map-contract/handlers/render-bounds.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/patch-map-contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/patch-map-contract/fold-render-bounds.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/patch-map-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { createRenderBoundsHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { RENDER_BOUNDS_FOLD_REVISION, foldRenderBoundsExecution } = foldRuntime;
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

describe('PatchMap LAY-005 render-bounds actual-only fold', () => {
  it('is import-free, browser-safe, expected-blind, and revisioned', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-contract/fold-render-bounds.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_BOUNDS_FOLD_REVISION).toBe('patch-map-render-bounds-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('fold-render-bounds.mjs', 'fold');
  });

  it('folds the real Engine execution into fourteen frozen domains', async () => {
    const { plan, execution } = await executeCase();
    const folded = fold(plan, execution);

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    for (const domain of DOMAIN_NAMES) expect(folded.actual[domain]).toBeTypeOf('object');
    expect(folded.actual).toMatchObject({
      $schema: 'patch-map-semantic-observation/1',
      case: { id: 'LAY-005', caseType: 'capability' },
      scene: {
        revision: 2,
        destroyed: { rotated: { queryCount: 0, renderQueryCount: 0 } },
      },
      geometry: {
        bounds: { revision: 1, revisionLags: { scene: 0, view: 0, interaction: 0 } },
        flipped: { worldBounds: [40, 0, 40, 20] },
        'overflow-text': { worldBounds: [0, 80, 272, 20] },
      },
      interaction: {
        'transparent-interactive': { hitCount: 1 },
        activeGestureCount: 0,
      },
      resources: { cleanup: { status: 'completed', errors: [] } },
    });
    expect(folded.fixtures).toEqual({
      targets: [
        'rotated',
        'flipped',
        'overflow-text',
        'hidden',
        'transparent-interactive',
        'zero-size',
      ],
      coordinateSpaces: ['local', 'world', 'screen'],
    });
    expect(folded.captures).toEqual({});
    expect(Object.isFrozen(folded)).toBe(true);
    expect(Object.isFrozen(folded.actual)).toBe(true);
    expect(Object.isFrozen(folded.fixtures)).toBe(true);
    expect(Object.isFrozen(folded.captures)).toBe(true);
  });

  it('matches all immutable normalized expected assertions independently', async () => {
    const { plan, execution } = await executeCase();
    const folded = fold(plan, execution);
    const expectedCase = (normalizedExpectedCatalog.cases as readonly ExpectedCase[])
      .find(({ id }) => id === 'LAY-005');
    if (expectedCase === undefined) throw new Error('Missing LAY-005 expected record');
    const comparison = compareObservation({
      expectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(expectedCase.expected.assertions).toHaveLength(14);
    expect(comparison).toMatchObject({ passed: 14, failed: 0 });
    expect(comparison.assertions.filter(({ passed }) => !passed)).toEqual([]);
  });

  it('rejects action-order drift rather than folding a nearby observation', async () => {
    const { plan, execution } = await executeCase();
    const drifted = structuredClone(execution);
    const actions = drifted.actionResults as JsonRecord[];
    const second = actions[1];
    const third = actions[2];
    if (second === undefined || third === undefined) throw new Error('Missing LAY-005 actions');
    actions[1] = third;
    actions[2] = second;

    expect(() => fold(plan, drifted)).toThrow(/result 1 index/u);
  });
});

async function executeCase(): Promise<{
  readonly plan: MaterializedCase;
  readonly execution: ContractExecution;
}> {
  const selected = selectCatalogCases(catalog, { caseIds: ['LAY-005'] })[0];
  if (selected === undefined) throw new Error('Missing approved LAY-005 case');
  const plan = materializeCase(selected, { size: '100', seed: '319' });
  const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => (
    Promise.resolve(new BoundsSurface(options))
  );
  const execution = await executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new PatchMap({ surfaceFactory }),
    datasets: new Map([['bounds', boundsDataset()]]),
    clock: new ManualClock(),
    handlerEntries: createRenderBoundsHandlerEntries(),
  });
  return { plan, execution };
}

function fold(plan: MaterializedCase, execution: ContractExecution): FoldResult {
  return foldRenderBoundsExecution({
    casePlan: plan,
    execution,
    provenance: { codeCommit: 'test-commit', packedPackageSha256: 'test-package' },
    environment: { browserVersion: 'node-vitest', runtime: 'node' },
  });
}

function boundsDataset(): unknown {
  const profiles = fixtureProfiles as Readonly<{ datasets: Readonly<Record<string, unknown>> }>;
  const dataset = profiles.datasets.bounds;
  if (dataset === undefined) throw new Error('Missing bounds dataset');
  return structuredClone(dataset);
}

class BoundsSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;

  private readonly width: number;
  private readonly height: number;
  private readonly pixelRatio: number;
  private dataset: readonly JsonRecord[] = Object.freeze([]);
  private geometryRevision = 0;

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void { this.replaceDataset(input); }
  public reconcile(input: unknown): PatchMapSurfaceReconcileResult {
    this.replaceDataset(input);
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }
  public publishFrame(_timeMs: number): void {}
  public resize(_width: number, _height: number, _pixelRatio: number): boolean { return false; }
  public setView(_view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {}
  public select(_ids: readonly string[]): void {}
  public hitTestScreen(point: PatchMapPoint): string | null {
    return this.entities().filter((entity) => (
      entity.visible && entity.interactive && contains(entity.worldBounds, point)
    )).at(-1)?.id ?? null;
  }
  public screenToWorld(point: PatchMapPoint): PatchMapPoint { return Object.freeze({ ...point }); }
  public debugSnapshot(): PatchMapSurfaceDebug {
    const visibleCount = this.entities().filter(({ visible }) => visible).length;
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: visibleCount,
      visiblePrimitiveCount: visibleCount,
    });
  }
  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    return Object.freeze({
      revision: this.geometryRevision,
      entities: Object.freeze(this.entities()),
      relations: Object.freeze([]),
      selectionOverlay: null,
    }) as unknown as PatchMapSurfaceGeometrySnapshot;
  }
  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.dataset = Object.freeze([]);
    return Promise.resolve(true);
  }

  private replaceDataset(input: unknown): void {
    if (!Array.isArray(input)) throw new Error('BoundsSurface requires an array dataset');
    this.dataset = input as readonly JsonRecord[];
    this.geometryRevision += 1;
  }

  private entities(): BoundsGeometryEntity[] {
    return this.dataset.map((element) => geometryEntity(element));
  }
}

class ManualClock implements ClockContract {
  public now(): number { return 0; }
  public advanceTo(_timeMs: number): Promise<void> { return Promise.resolve(); }
  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}

function geometryEntity(element: JsonRecord): BoundsGeometryEntity {
  const attrs = isRecord(element.attrs) ? element.attrs : {};
  const x = numberOr(attrs.x, 0);
  const y = numberOr(attrs.y, 0);
  const scaleX = numberOr(attrs.scaleX, 1);
  const scaleY = numberOr(attrs.scaleY, 1);
  const size = renderedSize(element);
  const localBounds = freezeBounds(0, 0, size.width, size.height);
  const worldBounds = transformedBounds(
    x,
    y,
    size.width,
    size.height,
    scaleX,
    scaleY,
    numberOr(attrs.angle ?? attrs.rotation, 0),
  );
  const visible = element.show !== false;
  return Object.freeze({
    id: String(element.id),
    kind: String(element.type),
    localBounds,
    worldBounds,
    screenBounds: worldBounds,
    visibleBounds: visible ? worldBounds : null,
    visible,
    interactive: element.eventMode === 'static',
    scaleX,
    scaleY,
  });
}

function renderedSize(element: JsonRecord): Readonly<{ width: number; height: number }> {
  const authored = fixedSize(element.size);
  if (element.type !== 'text' || element.overflow !== 'visible') return authored;
  const style = isRecord(element.style) ? element.style : {};
  const text = typeof element.text === 'string' ? element.text : '';
  return {
    width: text.length * numberOr(style.fontSize, 16) / 2,
    height: authored.height,
  };
}

function transformedBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  angle: number,
): Bounds {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners: readonly (readonly [number, number])[] = ([
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const).map(([localX, localY]) => {
    const scaledX = localX * scaleX;
    const scaledY = localY * scaleY;
    return [
      x + scaledX * cosine - scaledY * sine,
      y + scaledX * sine + scaledY * cosine,
    ] as const;
  });
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return freezeBounds(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
}

function fixedSize(value: unknown): Readonly<{ width: number; height: number }> {
  if (typeof value === 'number') return { width: value, height: value };
  if (!isRecord(value)) return { width: 0, height: 0 };
  return { width: numberOr(value.width, 0), height: numberOr(value.height, 0) };
}

function freezeBounds(x: number, y: number, width: number, height: number): Bounds {
  return Object.freeze([cleanNumber(x), cleanNumber(y), cleanNumber(width), cleanNumber(height)]);
}

function contains(bounds: Bounds, point: PatchMapPoint): boolean {
  return point.x >= bounds[0]
    && point.y >= bounds[1]
    && point.x <= bounds[0] + bounds[2]
    && point.y <= bounds[1] + bounds[3];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cleanNumber(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
