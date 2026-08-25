import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../contracts/patch-map/evidence/catalog-fixture-profiles.v1.json';
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
type Handler = (context: unknown, action: unknown) => unknown;
type HandlerEntry = readonly [string, Handler];
type Bounds = readonly [number, number, number, number];

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
  readonly RENDER_BOUNDS_ACTION_TYPES: readonly string[];
  readonly RENDER_BOUNDS_CASE_IDS: readonly string[];
  createRenderBoundsHandlerEntries(this: void): readonly HandlerEntry[];
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

const [catalogRuntime, materializeRuntime, handlerRuntime, workerRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/patch-map-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/patch-map-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>('../../scripts/verification/patch-map-contract/handlers/render-bounds.mjs'),
  loadRuntime<WorkerRuntime>('../../scripts/verification/patch-map-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  RENDER_BOUNDS_ACTION_TYPES,
  RENDER_BOUNDS_CASE_IDS,
  createRenderBoundsHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap LAY-005 render-bounds actual-only handlers', () => {
  it('registers four exact browser-safe handlers without expected evidence', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/patch-map-contract/handlers/render-bounds.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_BOUNDS_ACTION_TYPES).toEqual([
      'loadBoundsMatrix',
      'queryBounds',
      'hitTest',
      'destroyTarget',
    ]);
    expect(RENDER_BOUNDS_CASE_IDS).toEqual(['LAY-005']);
    expect(createRenderBoundsHandlerEntries().map(([handlerId]) => handlerId)).toEqual(
      RENDER_BOUNDS_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('handlers/render-bounds.mjs', 'handler');
    expect(source).toContain("call(engine, 'destroyTarget'");
    expect(source).not.toContain("call(engine, 'remove'");
  });

  it('observes bounds, hit-testing, and one atomic target destruction through a real Engine', async () => {
    const plan = selectedCase();
    const planBefore = JSON.stringify(plan);
    const inputBefore = JSON.stringify(boundsDataset());
    const surfaces: BoundsSurface[] = [];
    const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
      const surface = new BoundsSurface(options);
      surfaces.push(surface);
      return Promise.resolve(surface);
    };
    const execution = await executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: () => new PatchMap({ surfaceFactory }),
      datasets: new Map([['bounds', boundsDataset()]]),
      clock: new ManualClock(),
      handlerEntries: createRenderBoundsHandlerEntries(),
    });

    expect(execution).toMatchObject({
      caseId: 'LAY-005',
      status: 'completed',
      error: null,
      terminalSnapshot: {
        lifecycle: 'scene-ready',
        frameRevision: 2,
        revisions: { sceneRevision: 2 },
      },
      terminalSemanticProbe: {
        lifecycle: 'scene-ready',
        interaction: { activeGestureCount: 0 },
      },
      cleanup: { status: 'completed', errors: [] },
    });
    expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
      .toEqual(RENDER_BOUNDS_ACTION_TYPES.map((type, index) => ({
        index,
        type,
        status: 'completed',
      })));

    const loaded = actualAt(execution, 0);
    expect(loaded.input).toMatchObject({ unchanged: true });
    const queried = actualAt(execution, 1);
    expect(at(queried, ['bounds', 'rotated'])).toMatchObject({
      localBounds: [0, 0, 40, 20],
      visible: true,
      scaleX: 1,
    });
    expect(at(queried, ['bounds', 'flipped'])).toMatchObject({
      localBounds: [0, 0, 40, 20],
      worldBounds: [40, 0, 40, 20],
      scaleX: -1,
    });
    expect(at(queried, ['bounds', 'hidden'])).toMatchObject({
      visible: false,
      visibleBounds: null,
    });
    expect(queried).toMatchObject({
      geometryRevision: 1,
      revisionLags: { scene: 0, view: 0, interaction: 0 },
    });

    expect(actualAt(execution, 2).probes).toEqual([
      { point: [10, 10], targetId: null },
      { point: [210, 10], targetId: 'transparent-interactive' },
    ]);
    expect(actualAt(execution, 3)).toMatchObject({
      id: 'rotated',
      removal: { status: 'committed', changed: true, publication: 'pending' },
      query: { semanticCount: 0, geometryCount: 0 },
    });
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({
      loadCount: 1,
      reconcileCount: 1,
      destroyed: true,
      canvasCount: 0,
    });
    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(boundsDataset())).toBe(inputBefore);
    expect(execution.datasetObservations.bounds?.unchanged).toBe(true);
  });
});

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['LAY-005'] })[0];
  if (selected === undefined) throw new Error('Missing approved LAY-005 case');
  return materializeCase(selected, { size: '100', seed: '319' });
}

function boundsDataset(): unknown {
  const profiles = fixtureProfiles as Readonly<{ datasets: Readonly<Record<string, unknown>> }>;
  const dataset = profiles.datasets.bounds;
  if (dataset === undefined) throw new Error('Missing bounds dataset');
  return structuredClone(dataset);
}

function actualAt(execution: CaseExecution, index: number): JsonRecord {
  const result = execution.actionResults[index];
  if (result === undefined) throw new Error(`Missing action ${index}`);
  return result.delta.actual;
}

function at(root: JsonRecord, path: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`Missing path ${path.join('.')}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

class BoundsSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public reconcileCount = 0;

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

  public load(input: unknown): void {
    this.loadCount += 1;
    this.replaceDataset(input);
  }

  public reconcile(input: unknown): PatchMapSurfaceReconcileResult {
    this.reconcileCount += 1;
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

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({ ...point });
  }

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
      renderCommandCount: this.entities().filter(({ visible }) => visible).length,
      visiblePrimitiveCount: this.entities().filter(({ visible }) => visible).length,
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

function geometryEntity(element: JsonRecord): BoundsGeometryEntity {
  const id = String(element.id);
  const kind = String(element.type);
  const attrs = isRecord(element.attrs) ? element.attrs : {};
  const x = numberOr(attrs.x, 0);
  const y = numberOr(attrs.y, 0);
  const scaleX = numberOr(attrs.scaleX, 1);
  const scaleY = numberOr(attrs.scaleY, 1);
  const angle = numberOr(attrs.angle ?? attrs.rotation, 0);
  const size = renderedSize(element);
  const localBounds = freezeBounds(0, 0, size.width, size.height);
  const worldBounds = transformedBounds(x, y, size.width, size.height, scaleX, scaleY, angle);
  const visible = element.show !== false;
  const interactive = element.eventMode === 'static';
  return Object.freeze({
    id,
    kind,
    localBounds,
    worldBounds,
    screenBounds: worldBounds,
    visibleBounds: visible ? worldBounds : null,
    visible,
    interactive,
    scaleX,
    scaleY,
  });
}

function renderedSize(element: JsonRecord): Readonly<{ width: number; height: number }> {
  const authored = fixedSize(element.size);
  if (element.type !== 'text' || element.overflow !== 'visible') return authored;
  const style = isRecord(element.style) ? element.style : {};
  const fontSize = numberOr(style.fontSize, 16);
  const text = typeof element.text === 'string' ? element.text : '';
  return { width: text.length * fontSize / 2, height: authored.height };
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
