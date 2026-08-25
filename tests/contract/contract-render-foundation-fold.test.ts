import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../contracts/evidence/catalog-fixture-profiles.v1.json';
import normalizedExpectedCatalog from '../../contracts/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from '../support/contract-verifier-import-firewall';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceGeometrySnapshot,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceReconcileResult,
} from '../../src/engine';

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
  createRenderFoundationHandlerEntries(this: void): readonly HandlerEntry[];
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

interface FoldResult {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

interface FoldRuntime {
  readonly RENDER_FOUNDATION_FOLD_REVISION: string;
  foldRenderFoundationExecution(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): FoldResult;
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
    readonly failure: Readonly<{ readonly code: string }> | null;
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
  loadRuntime<CatalogRuntime>('../../verification/contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../verification/contract/materialize.mjs'),
  loadRuntime<HandlerRuntime>(
    '../../verification/contract/handlers/render-foundation.mjs',
  ),
  loadRuntime<WorkerRuntime>('../../verification/contract/execute-worker.mjs'),
  loadRuntime<FoldRuntime>('../../verification/contract/fold-render-foundation.mjs'),
  loadRuntime<CompareRuntime>('../../verification/contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { createRenderFoundationHandlerEntries } = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { RENDER_FOUNDATION_FOLD_REVISION, foldRenderFoundationExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

const CASE_IDS = ['LAY-001', 'REN-001', 'REN-004', 'REN-003', 'REN-002'] as const;
const UNAVAILABLE_PATHS: Readonly<Record<(typeof CASE_IDS)[number], readonly string[]>> = {
  'LAY-001': [],
  'REN-001': ['/interaction/activeGestureCount'],
  'REN-004': ['/paint/commandCount', '/interaction/activeGestureCount'],
  'REN-003': ['/interaction/activeGestureCount'],
  'REN-002': [],
};
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

describe('PatchMap render-foundation actual-only fold', () => {
  it('is browser-safe, expected-blind, and declares a durable revision', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../verification/contract/fold-render-foundation.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_FOUNDATION_FOLD_REVISION).toBe('patch-map-render-foundation-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('fold-render-foundation.mjs', 'fold');
  });

  it.each(CASE_IDS)('folds %s into all fourteen object domains', async (caseId) => {
    const { plan, execution } = await executeCase(caseId);
    const folded = fold(plan, execution);

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    for (const domain of DOMAIN_NAMES) expect(folded.actual[domain]).toBeTypeOf('object');
    expect(folded.actual).toMatchObject({
      $schema: 'patch-map-semantic-observation/1',
      case: { id: caseId, caseType: 'capability' },
      resources: { cleanup: { status: 'completed', errors: [] } },
    });
    expect(readObservationPath(folded.actual, 'scene.revision')).toBeTypeOf('number');
    expect(readObservationPath(folded.actual, 'geometry.finiteValueCount')).toBeTypeOf('number');
    expect(readObservationPath(folded.actual, 'revisions.frame.revision')).toBeTypeOf('number');
    expect(Object.isFrozen(folded)).toBe(true);
    expect(Object.isFrozen(folded.actual)).toBe(true);
    expect(Object.isFrozen(folded.fixtures)).toBe(true);
    expect(Object.isFrozen(folded.captures)).toBe(true);

    if (caseId === 'REN-003') {
      expect(folded.captures).toEqual({ initial: { icon: { id: 'icon' } } });
    } else if (caseId === 'REN-004') {
      expect(folded.captures).toEqual({
        rect: { worldBounds: { x: -30, y: 5, width: 20, height: 60 } },
      });
    } else {
      expect(folded.captures).toEqual({});
    }
  });

  it('matches 45 of 49 Node-observable leaves and names the four unavailable leaves', async () => {
    let passed = 0;
    let failed = 0;
    const failedPaths: string[] = [];

    for (const caseId of CASE_IDS) {
      const { plan, execution } = await executeCase(caseId);
      const folded = fold(plan, execution);
      const comparison = compare(caseId, folded);
      passed += comparison.passed;
      failed += comparison.failed;
      failedPaths.push(...comparison.assertions.filter(({ passed: assertionPassed }) => (
        !assertionPassed
      )).map(({ path }) => path));
      expect(comparison.failed).toBe(UNAVAILABLE_PATHS[caseId].length);
      expect(comparison.assertions.filter(({ passed: assertionPassed }) => !assertionPassed)
        .map(({ path }) => path)).toEqual(UNAVAILABLE_PATHS[caseId]);
    }

    expect({ passed, failed }).toEqual({ passed: 45, failed: 4 });
    expect(failedPaths).toEqual([
      '/interaction/activeGestureCount',
      '/paint/commandCount',
      '/interaction/activeGestureCount',
      '/interaction/activeGestureCount',
    ]);
  });

  it('closes all 49 leaves when an independent browser probe supplies renderer-only facts', async () => {
    let passed = 0;
    let failed = 0;

    for (const caseId of CASE_IDS) {
      const { plan, execution } = await executeCase(caseId);
      const folded = fold(plan, execution, browserProbe(caseId));
      const comparison = compare(caseId, folded);
      passed += comparison.passed;
      failed += comparison.failed;
      expect(comparison.failed).toBe(0);
    }

    expect({ passed, failed }).toEqual({ passed: 49, failed: 0 });
  });

  it('prefers public Engine gesture and rendering-resource facts when the surface exposes them', async () => {
    let passed = 0;

    for (const caseId of CASE_IDS) {
      const { plan, execution } = await executeCase(caseId);
      const observedExecution = structuredClone(execution);
      const unavailable = UNAVAILABLE_PATHS[caseId];
      if (unavailable.includes('/interaction/activeGestureCount')) {
        const semantic = requireRecord(
          observedExecution.terminalSemanticProbe,
          `${caseId} terminal semantic probe`,
        );
        const interaction = requireRecord(semantic.interaction, `${caseId} interaction probe`);
        interaction.activeGestureCount = 0;
      }
      if (unavailable.includes('/paint/commandCount')) {
        const snapshot = requireRecord(observedExecution.terminalSnapshot, `${caseId} snapshot`);
        const resources = requireRecord(snapshot.resources, `${caseId} resources`);
        const rendering = requireRecord(resources.rendering, `${caseId} rendering resources`);
        rendering.commandCount = 1;
        rendering.visiblePrimitiveCount = 1;
      }
      const comparison = compare(caseId, fold(plan, observedExecution));
      passed += comparison.passed;
      expect(comparison.failed).toBe(0);
    }

    expect(passed).toBe(49);
  });

  it('rejects an execution whose ordered action trace no longer matches the selected plan', async () => {
    const { plan, execution } = await executeCase('REN-001');
    const drifted = structuredClone(execution);
    const first = drifted.actionResults as JsonRecord[];
    const firstAction = first[0];
    const secondAction = first[1];
    if (firstAction === undefined || secondAction === undefined) {
      throw new Error('Missing REN-001 actions');
    }
    first[0] = secondAction;
    first[1] = firstAction;

    expect(() => fold(plan, drifted)).toThrow(/execution action 0 index/u);
  });
});

async function executeCase(caseId: (typeof CASE_IDS)[number]): Promise<{
  readonly plan: MaterializedCase;
  readonly execution: ContractExecution;
}> {
  const plan = selectedCase(caseId);
  const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => (
    Promise.resolve(new ProjectionSurface(options))
  );
  const execution = await executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new PatchMap({ surfaceFactory }),
    datasets: datasets(),
    clock: new ManualClock(),
    handlerEntries: createRenderFoundationHandlerEntries(),
  });
  return { plan, execution };
}

function selectedCase(caseId: string): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (selected === undefined) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function fold(
  plan: MaterializedCase,
  execution: ContractExecution,
  browserProbeValue?: Readonly<Record<string, unknown>>,
): FoldResult {
  return foldRenderFoundationExecution({
    casePlan: plan,
    execution,
    provenance: { codeCommit: 'test-commit', packedPackageSha256: 'test-package' },
    environment: { browserVersion: 'node-vitest', runtime: 'node' },
    ...(browserProbeValue ? { browserProbe: browserProbeValue } : {}),
  });
}

function compare(caseId: string, folded: FoldResult): CompareResult {
  const expectedCase = (normalizedExpectedCatalog.cases as readonly ExpectedCase[])
    .find((candidate) => candidate.id === caseId);
  if (expectedCase === undefined) throw new Error(`Missing expected ${caseId}`);
  return compareObservation({
    expectedCase,
    actual: folded.actual,
    fixtures: folded.fixtures,
    captures: folded.captures,
  });
}

function browserProbe(caseId: (typeof CASE_IDS)[number]): Readonly<Record<string, unknown>> {
  return {
    $schema: 'patch-map-browser-probe/1',
    caseId,
    ...(UNAVAILABLE_PATHS[caseId].includes('/interaction/activeGestureCount')
      ? { interaction: { activeGestureCount: 0 } }
      : {}),
    ...(UNAVAILABLE_PATHS[caseId].includes('/paint/commandCount')
      ? { paint: { commandCount: 1 } }
      : {}),
  };
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

class ProjectionSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
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
    this.load(input);
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
    });
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    return Object.freeze({
      revision: 1,
      sceneRevision: 1,
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
        isRecord(child) ? this.elementGeometry(child, { x, y, visible, interactive }) : []
      )));
    }
    if (element.type === 'grid') return this.gridGeometry(element, { x, y, visible, interactive });
    if (element.type === 'item') return this.itemGeometry(element, { x, y, visible, interactive });
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
    const cells = Array.isArray(grid.cells) ? grid.cells : [];
    return Object.freeze(cells.flatMap((row, rowIndex) => (
      Array.isArray(row) ? row.flatMap((cell, columnIndex) => {
        if (cell === 0 && grid.inactiveCellStrategy === 'destroy') return [];
        const instanceId = `${String(grid.id)}.${rowIndex}.${columnIndex}`;
        return this.itemGeometry(
          { ...item, id: instanceId },
          {
            x: state.x + columnIndex * (size.width + numberOr(gap.x, 0)),
            y: state.y + rowIndex * (size.height + numberOr(gap.y, 0)),
            visible: state.visible && cell !== 0,
            interactive: state.interactive && cell !== 0,
          },
          instanceId,
        );
      }) : []
    )));
  }
}

class ManualClock implements ClockContract {
  public now(): number { return 0; }
  public advanceTo(_timeMs: number): Promise<void> { return Promise.resolve(); }
  public async withTimeout<T>(promise: Promise<T>, _timeoutMs: number, _label: string): Promise<T> {
    return promise;
  }
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

function readObservationPath(root: Readonly<Record<string, unknown>>, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split('.')) {
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw new Error(`Missing observation path ${path}`);
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}
