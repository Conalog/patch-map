import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

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
  readonly RENDER_FOUNDATION_ACTION_TYPES: readonly string[];
  readonly RENDER_FOUNDATION_CASE_IDS: readonly string[];
  createRenderFoundationHandlerEntries(this: void): readonly HandlerEntry[];
}

interface EngineFactoryMetadata {
  readonly caseId: string;
  readonly caseType: string;
  readonly role: string;
  readonly generation: number;
}

interface ClockContract {
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
  readonly captures: readonly Readonly<{
    readonly id: string;
    readonly values: Readonly<Record<string, unknown>>;
  }>[];
  readonly eventJournalFailures: readonly unknown[];
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
      engineFactory: (metadata: EngineFactoryMetadata) => PatchMap;
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
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../scripts/verification/core-v2-contract/handlers/render-foundation.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  RENDER_FOUNDATION_ACTION_TYPES,
  RENDER_FOUNDATION_CASE_IDS,
  createRenderFoundationHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap render-foundation actual-only handlers', () => {
  it('registers the six exact browser-safe action handlers for five exact cases', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/handlers/render-foundation.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_FOUNDATION_ACTION_TYPES).toEqual([
      'loadDataset',
      'loadGrid',
      'patch',
      'reloadGrid',
      'setComponentVisibility',
      'snapshotGrid',
    ]);
    expect(RENDER_FOUNDATION_CASE_IDS).toEqual([
      'LAY-001',
      'REN-001',
      'REN-004',
      'REN-003',
      'REN-002',
    ]);
    expect(createRenderFoundationHandlerEntries().map(([handlerId]) => handlerId)).toEqual(
      RENDER_FOUNDATION_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it.each([
    ['LAY-001', ['loadDataset', 'patch'], 1],
    ['REN-001', ['loadDataset', 'patch', 'patch'], 2],
    ['REN-004', ['loadDataset', 'patch'], 1],
    ['REN-003', ['loadDataset', 'setComponentVisibility', 'setComponentVisibility'], 2],
    ['REN-002', ['loadGrid', 'snapshotGrid', 'reloadGrid'], 0],
  ] as const)(
    'executes %s in order through one real PatchMap',
    async (caseId, actionTypes, reconcileCount) => {
      const plan = selectedCase(caseId);
      const planBefore = JSON.stringify(plan);
      const harness = createHarness();
      const execution = await executeContractCase({
        caseRecord: plan,
        actionDefinitions: catalog.actionDefinitions,
        engineFactory: harness.engineFactory,
        datasets: datasets(),
        clock: new ManualClock(),
        handlerEntries: createRenderFoundationHandlerEntries(),
      });

      expect(execution).toMatchObject({
        caseId,
        status: 'completed',
        error: null,
        eventJournalFailures: [],
        terminalSnapshot: { lifecycle: 'scene-ready', resources: { canvasCount: 1 } },
        terminalSemanticProbe: { lifecycle: 'scene-ready' },
        cleanup: { status: 'completed', errors: [] },
      });
      expect(execution.actionResults.map(({ index, type, status }) => ({ index, type, status })))
        .toEqual(actionTypes.map((type, index) => ({ index, type, status: 'completed' })));
      for (const result of execution.actionResults) {
        expect(result.delta.semanticProbe).toMatchObject({ lifecycle: 'scene-ready' });
        const product = actionProduct(result.delta.actual);
        expect(product).toMatchObject({
          snapshot: { lifecycle: 'scene-ready' },
          semanticProbe: { lifecycle: 'scene-ready' },
        });
        expect(isRecord(product.geometry) && Array.isArray(product.geometry.entities)).toBe(true);
        expect(Array.isArray(product.dataset)).toBe(true);
      }
      expect(harness.metadata).toEqual([{
        caseId,
        caseType: 'capability',
        role: 'main',
        generation: 1,
      }]);
      expect(harness.surfaces).toHaveLength(1);
      expect(harness.surfaces[0]).toMatchObject({
        reconcileCount,
        destroyed: true,
        canvasCount: 0,
      });
      expect(JSON.stringify(plan)).toBe(planBefore);
      expect(Object.values(execution.datasetObservations).every(({ unchanged }) => unchanged)).toBe(true);

      if (caseId === 'REN-003') {
        expect(execution.captures).toEqual([expect.objectContaining({
          id: 'initial',
          values: { 'icon/id': 'icon' },
        })]);
      } else if (caseId === 'REN-004') {
        expect(execution.captures).toEqual([expect.objectContaining({
          id: 'rect',
          values: { worldBounds: { x: -30, y: 5, width: 20, height: 60 } },
        })]);
      } else {
        expect(execution.captures).toEqual([]);
      }
    },
  );

  it('rejects a case trace whose operands drift before mutating the surface', async () => {
    const plan = structuredClone(selectedCase('LAY-001')) as MutableCase;
    const originalAction = plan.actionTrace[0];
    if (originalAction === undefined) throw new Error('Missing LAY-001 load action');
    const driftedAction: ContractAction = {
      ...originalAction,
      operands: { datasetId: 'nested-groups' },
    };
    plan.actionTrace[0] = driftedAction;
    plan.fixture.actionTrace[0] = structuredClone(driftedAction);
    const harness = createHarness();

    await expect(executeContractCase({
      caseRecord: plan,
      actionDefinitions: catalog.actionDefinitions,
      engineFactory: harness.engineFactory,
      datasets: datasets(),
      clock: new ManualClock(),
      handlerEntries: createRenderFoundationHandlerEntries(),
    })).rejects.toMatchObject({ code: 'Error' });
    expect(harness.surfaces).toEqual([]);
  });
});

interface MutableCase extends Omit<MaterializedCase, 'actionTrace' | 'fixture'> {
  actionTrace: ContractAction[];
  fixture: {
    setup: { params: JsonRecord };
    actionTrace: ContractAction[];
    captureCheckpoints: unknown[];
    cleanupTrace: unknown[];
  };
}

function selectedCase(caseId: string): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (selected === undefined) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function datasets(): ReadonlyMap<string, unknown> {
  const profiles = fixtureProfiles as Readonly<{
    datasets: Readonly<Record<string, unknown>>;
  }>;
  return new Map([
    ['content-box', structuredClone(requiredDataset(profiles.datasets, 'content-box'))],
    ['nested-groups', structuredClone(requiredDataset(profiles.datasets, 'nested-groups'))],
    ['rect-specimen', structuredClone(requiredDataset(profiles.datasets, 'rect-specimen'))],
    ['item-components', structuredClone(requiredDataset(profiles.datasets, 'item-components'))],
  ]);
}

function requiredDataset(datasetsRecord: Readonly<Record<string, unknown>>, id: string): unknown {
  const dataset = datasetsRecord[id];
  if (dataset === undefined) throw new Error(`Missing ${id} fixture`);
  return dataset;
}

function createHarness(): {
  readonly surfaces: ProjectionSurface[];
  readonly metadata: EngineFactoryMetadata[];
  readonly engineFactory: (metadata: EngineFactoryMetadata) => PatchMap;
} {
  const surfaces: ProjectionSurface[] = [];
  const metadata: EngineFactoryMetadata[] = [];
  const engineFactory = (nextMetadata: EngineFactoryMetadata): PatchMap => {
    metadata.push(nextMetadata);
    const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
      const surface = new ProjectionSurface(options);
      surfaces.push(surface);
      return Promise.resolve(surface);
    };
    return new PatchMap({ surfaceFactory });
  };
  return { surfaces, metadata, engineFactory };
}

class ProjectionSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public reconcileCount = 0;
  private readonly width: number;
  private readonly height: number;
  private readonly pixelRatio: number;
  private dataset: readonly JsonRecord[] = Object.freeze([]);

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    if (!Array.isArray(input)) throw new Error('ProjectionSurface requires an array dataset');
    this.dataset = input as readonly JsonRecord[];
  }

  public reconcile(input: unknown): PatchMapSurfaceReconcileResult {
    this.reconcileCount += 1;
    this.load(input);
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(_timeMs: number): void {}

  public resize(_width: number, _height: number, _pixelRatio: number): boolean {
    return false;
  }

  public setView(_view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {}

  public select(_ids: readonly string[]): void {}

  public hitTestScreen(_point: PatchMapPoint): string | null {
    return null;
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
    });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    return Object.freeze({
      entities: Object.freeze(this.dataset.flatMap((element) => (
        this.elementGeometry(element, { x: 0, y: 0, visible: true, interactive: true })
      ))),
      relations: Object.freeze([]),
      selectionOverlay: null,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.dataset = Object.freeze([]);
    return Promise.resolve(true);
  }

  private elementGeometry(
    element: JsonRecord,
    parent: Readonly<{ x: number; y: number; visible: boolean; interactive: boolean }>,
  ): PatchMapSurfaceGeometrySnapshot['entities'] {
    const attrs = isRecord(element.attrs) ? element.attrs : {};
    const x = parent.x + numberOr(attrs.x, 0);
    const y = parent.y + numberOr(attrs.y, 0);
    const visible = parent.visible && element.show !== false;
    const interactive = parent.interactive && element.locked !== true;
    const id = String(element.id);

    if (element.type === 'group') {
      return Object.freeze((Array.isArray(element.children) ? element.children : []).flatMap((child) => (
        isRecord(child)
          ? this.elementGeometry(child, { x, y, visible, interactive })
          : []
      )));
    }
    if (element.type === 'grid') {
      return this.gridGeometry(element, { x, y, visible, interactive });
    }
    if (element.type === 'item') {
      return this.itemGeometry(element, { x, y, visible, interactive });
    }
    if (element.type === 'relations') return Object.freeze([]);

    const size = fixedSize(element.size);
    const bounds = element.type === 'rect'
      ? rotatedBounds(x, y, size, numberOr(attrs.angle ?? attrs.rotation, 0))
      : ([x, y, size.width, size.height] as const);
    return Object.freeze([geometryEntity(id, String(element.type), bounds, visible, interactive)]);
  }

  private itemGeometry(
    item: JsonRecord,
    state: Readonly<{ x: number; y: number; visible: boolean; interactive: boolean }>,
    instanceId = String(item.id),
  ): PatchMapSurfaceGeometrySnapshot['entities'] {
    const size = fixedSize(item.size);
    const itemBounds = [state.x, state.y, size.width, size.height] as const;
    const result = [geometryEntity(instanceId, 'rect', itemBounds, state.visible, state.interactive)];
    const padding = edges(item.padding);
    const content = {
      x: state.x + padding.left,
      y: state.y + padding.top,
      width: Math.max(0, size.width - padding.left - padding.right),
      height: Math.max(0, size.height - padding.top - padding.bottom),
    };
    for (const component of Array.isArray(item.components) ? item.components : []) {
      if (!isRecord(component)) continue;
      const componentId = `${instanceId}::${String(component.type)}:${String(component.id)}`;
      const componentVisible = state.visible && component.show !== false;
      if (component.type === 'background') {
        result.push(geometryEntity(componentId, 'rect', itemBounds, componentVisible, false));
        continue;
      }
      const componentDimensions = component.type === 'text'
        ? { width: content.width, height: 16 }
        : resolvedComponentSize(component.size, content.width, content.height);
      result.push(geometryEntity(
        componentId,
        String(component.type),
        [content.x, content.y, componentDimensions.width, componentDimensions.height],
        componentVisible,
        false,
      ));
    }
    return Object.freeze(result);
  }

  private gridGeometry(
    grid: JsonRecord,
    state: Readonly<{ x: number; y: number; visible: boolean; interactive: boolean }>,
  ): PatchMapSurfaceGeometrySnapshot['entities'] {
    const item = isRecord(grid.item) ? grid.item : {};
    const size = fixedSize(item.size);
    const gap = isRecord(grid.gap) ? grid.gap : {};
    const strategy = String(grid.inactiveCellStrategy);
    const cells = Array.isArray(grid.cells) ? grid.cells : [];
    return Object.freeze(cells.flatMap((row, rowIndex) => (
      Array.isArray(row) ? row.flatMap((cell, columnIndex) => {
        if (cell === 0 && strategy === 'destroy') return [];
        const cellVisible = state.visible && cell !== 0;
        const instanceId = `${String(grid.id)}.${rowIndex}.${columnIndex}`;
        return this.itemGeometry(
          { ...item, id: instanceId },
          {
            x: state.x + columnIndex * (size.width + numberOr(gap.x, 0)),
            y: state.y + rowIndex * (size.height + numberOr(gap.y, 0)),
            visible: cellVisible,
            interactive: state.interactive && cell !== 0,
          },
          instanceId,
        );
      }) : []
    )));
  }
}

class ManualClock implements ClockContract {
  public now(): number {
    return 0;
  }

  public advanceTo(_timeMs: number): Promise<void> {
    return Promise.resolve();
  }

  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
}

function actionProduct(actual: JsonRecord): JsonRecord {
  if (isRecord(actual.product)) return actual.product;
  if (isRecord(actual.after)) return actual.after;
  throw new Error('Missing product observation');
}

function geometryEntity(
  id: string,
  kind: string,
  bounds: readonly [number, number, number, number],
  visible: boolean,
  interactive: boolean,
): PatchMapSurfaceGeometrySnapshot['entities'][number] {
  return Object.freeze({
    id,
    kind,
    worldBounds: Object.freeze([...bounds] as [number, number, number, number]),
    screenBounds: Object.freeze([...bounds] as [number, number, number, number]),
    visible,
    interactive,
  });
}

function rotatedBounds(
  x: number,
  y: number,
  size: Readonly<{ width: number; height: number }>,
  angle: number,
): readonly [number, number, number, number] {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners: readonly (readonly [number, number])[] = ([
    [0, 0],
    [size.width, 0],
    [0, size.height],
    [size.width, size.height],
  ] as const).map(([localX, localY]) => [
    x + localX * cosine - localY * sine,
    y + localX * sine + localY * cosine,
  ] as const);
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const left = cleanNumber(Math.min(...xs));
  const top = cleanNumber(Math.min(...ys));
  const right = cleanNumber(Math.max(...xs));
  const bottom = cleanNumber(Math.max(...ys));
  return Object.freeze([left, top, cleanNumber(right - left), cleanNumber(bottom - top)]);
}

function fixedSize(value: unknown): Readonly<{ width: number; height: number }> {
  if (typeof value === 'number') return { width: value, height: value };
  if (!isRecord(value)) return { width: 0, height: 0 };
  return { width: numberOr(value.width, 0), height: numberOr(value.height, 0) };
}

function edges(value: unknown): Readonly<{ top: number; right: number; bottom: number; left: number }> {
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
  if (!isRecord(value)) return { top: 0, right: 0, bottom: 0, left: 0 };
  const x = numberOr(value.x, 0);
  const y = numberOr(value.y, 0);
  return {
    top: numberOr(value.top, y),
    right: numberOr(value.right, x),
    bottom: numberOr(value.bottom, y),
    left: numberOr(value.left, x),
  };
}

function resolvedComponentSize(
  value: unknown,
  referenceWidth: number,
  referenceHeight: number,
): Readonly<{ width: number; height: number }> {
  if (!isRecord(value) || Object.hasOwn(value, 'unit')) {
    const length = resolveDimension(value, Math.min(referenceWidth, referenceHeight));
    return { width: length, height: length };
  }
  return {
    width: resolveDimension(value.width, referenceWidth),
    height: resolveDimension(value.height, referenceHeight),
  };
}

function resolveDimension(value: unknown, reference: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.endsWith('%')) {
    return Number.parseFloat(value) * reference / 100;
  }
  if (isRecord(value) && value.unit === '%') return numberOr(value.value, 0) * reference / 100;
  if (isRecord(value) && value.unit === 'px') return numberOr(value.value, 0);
  return 0;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cleanNumber(value: number): number {
  const integer = Math.round(value);
  if (Math.abs(value - integer) < 1e-9) return integer === 0 ? 0 : integer;
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
