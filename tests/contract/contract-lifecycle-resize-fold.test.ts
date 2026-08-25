import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../contracts/evidence/catalog-fixture-profiles.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from '../support/contract-verifier-import-firewall';

type JsonRecord = Record<string, unknown>;
type Point = readonly [number, number];
type Bounds = readonly [number, number, number, number];

interface ContractAction {
  index: number;
  type: string;
  operands: JsonRecord;
}

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
    readonly actionTrace: readonly Readonly<ContractAction>[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

interface MaterializedCase extends CatalogCase {
  readonly rootTestId: string;
  readonly fixtureSha256: string;
  readonly actionTrace: readonly Readonly<ContractAction>[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ExecutorCatalog {
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

interface FoldResult {
  readonly actual: JsonRecord;
  readonly fixtures: JsonRecord;
  readonly captures: JsonRecord;
}

interface FoldRuntime {
  readonly LIFECYCLE_RESIZE_FOLD_REVISION: string;
  foldLifecycleResizeExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: JsonRecord;
      provenance: Readonly<JsonRecord>;
      environment: Readonly<JsonRecord>;
    }>,
  ): FoldResult;
}

interface ObservationRuntime {
  createSemanticObservation(
    this: void,
    options: Readonly<{ observation: JsonRecord }>,
  ): Readonly<{ actualSemanticSha256: string; actualObservationSha256: string }>;
}

interface ComparisonRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      expectedCase: JsonRecord;
      actual: JsonRecord;
      fixtures: JsonRecord;
      captures: JsonRecord;
    }>,
  ): Readonly<{
    passed: number;
    failed: number;
    assertions: readonly Readonly<{
      path: string;
      passed: boolean;
      failure: Readonly<{ code: string }> | null;
    }>[];
  }>;
}

interface NormalizedEvidence {
  readonly cases: readonly JsonRecord[];
}

interface GeometryFacts {
  readonly entities: readonly JsonRecord[];
  readonly relations: readonly JsonRecord[];
  readonly selectionOverlay: JsonRecord | null;
  readonly worldProbe: Point;
  readonly hitIds: readonly string[];
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, foldRuntime, observationRuntime, comparisonRuntime] =
  await Promise.all([
    loadRuntime<CatalogRuntime>('../../verification/contract/catalog.mjs'),
    loadRuntime<MaterializeRuntime>('../../verification/contract/materialize.mjs'),
    loadRuntime<FoldRuntime>(
      '../../verification/contract/fold-lifecycle-resize.mjs',
    ),
    loadRuntime<ObservationRuntime>('../../verification/contract/observe.mjs'),
    loadRuntime<ComparisonRuntime>('../../verification/contract/compare.mjs'),
  ]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { LIFECYCLE_RESIZE_FOLD_REVISION, foldLifecycleResizeExecution } = foldRuntime;
const { createSemanticObservation } = observationRuntime;
const { compareObservation } = comparisonRuntime;

const DOMAINS = Object.freeze([
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
]);

let plan: MaterializedCase;
let normalized: NormalizedEvidence;

beforeAll(async () => {
  const [catalog, evidence] = await Promise.all([
    loadExecutorCatalog(),
    readNormalizedEvidence(),
  ]);
  const selected = selectCatalogCases(catalog, { caseIds: ['LIF-004'] })[0];
  if (selected === undefined) throw new Error('Missing approved LIF-004 case');
  plan = materializeCase(selected, { size: '100', seed: '319' });
  normalized = evidence;
});

describe('LIF-004 actual-only lifecycle resize fold', () => {
  it('is import-free and browser-safe behind the verifier dependency firewall', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../verification/contract/fold-lifecycle-resize.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(LIFECYCLE_RESIZE_FOLD_REVISION).toBe('patch-map-lifecycle-resize-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*compare\.mjs['"]/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*observe\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    await assertCommittedVerifierEntryImportFirewall('fold-lifecycle-resize.mjs', 'fold');
  });

  it('projects all twelve immutable assertions from product-shaped facts', () => {
    const folded = fold(makeExecution());
    const observed = createSemanticObservation({ observation: folded.actual });
    const comparison = compare(folded);

    expect(DOMAINS.every((domain) => isRecord(folded.actual[domain]))).toBe(true);
    expect(observed.actualSemanticSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(observed.actualObservationSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(comparison).toMatchObject({ passed: 12, failed: 0 });
    expect(isDeepFrozen(folded)).toBe(true);
    expect(JSON.stringify(folded.actual)).not.toContain('"status":"pass"');
  });

  it('retains a transformed hit-test mismatch without masking it', () => {
    const execution = makeExecution();
    const hitActual = actionActual(execution, 5);
    hitActual.resizeHitIds = [];
    const folded = fold(execution);
    const comparison = compare(folded);

    expect(valueAt(folded.actual, 'interaction.resizeHitIds')).toEqual([]);
    expect(comparison).toMatchObject({ passed: 11, failed: 1 });
    expect(comparison.assertions.filter(({ passed }) => !passed).map(({ path, failure }) => (
      `${path}:${failure?.code ?? 'UNKNOWN'}`
    ))).toEqual(['/interaction/resizeHitIds:VALUE_MISMATCH']);
  });

  it('keeps absent renderer geometry unresolved instead of filling it', () => {
    const execution = makeExecution();
    actionActual(execution, 6).geometry = null;
    const folded = fold(execution);
    const comparison = compare(folded);

    expect(valueAt(folded.actual, 'geometry.relation.links')).toEqual([]);
    expect(valueAt(folded.actual, 'geometry.selectionOverlay')).toBeNull();
    expect(comparison).toMatchObject({ passed: 9, failed: 3 });
    expect(comparison.assertions.filter(({ passed }) => !passed).map(({ path }) => path)).toEqual([
      '/geometry/relation/links/0/worldEndpoints',
      '/geometry/relation/links/0/screenEndpoints',
      '/geometry/selectionOverlay/screenBounds',
    ]);
  });

  it('is deterministic, detached, deeply frozen, and rejects action drift', () => {
    const callerPlan = structuredClone(plan);
    const callerExecution = makeExecution();
    const planBefore = JSON.stringify(callerPlan);
    const executionBefore = JSON.stringify(callerExecution);
    const first = foldLifecycleResizeExecution({
      casePlan: callerPlan,
      execution: callerExecution,
      provenance: provenance(),
      environment: environment(),
    });
    const second = fold(makeExecution());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(isDeepFrozen(first)).toBe(true);
    expect(JSON.stringify(callerPlan)).toBe(planBefore);
    expect(JSON.stringify(callerExecution)).toBe(executionBefore);
    actionActual(callerExecution, 6).callerMutation = true;
    expect(first.actual.outcome).not.toHaveProperty('callerMutation');

    const drifted = structuredClone(plan) as unknown as MutablePlan;
    const action = drifted.fixture.actionTrace[1];
    if (action === undefined) throw new Error('Missing set-view action');
    action.type = 'resizeHost';
    drifted.actionTrace = structuredClone(drifted.fixture.actionTrace);
    expect(() => foldLifecycleResizeExecution({
      casePlan: drifted,
      execution: makeExecution(),
      provenance: provenance(),
      environment: environment(),
    })).toThrow(/action 1 type/u);
  });
});

interface MutablePlan extends MaterializedCase {
  actionTrace: ContractAction[];
  fixture: MaterializedCase['fixture'] & { actionTrace: ContractAction[] };
}

function fold(execution: JsonRecord): FoldResult {
  return foldLifecycleResizeExecution({
    casePlan: plan,
    execution,
    provenance: provenance(),
    environment: environment(),
  });
}

function compare(folded: FoldResult): ReturnType<ComparisonRuntime['compareObservation']> {
  return compareObservation({
    expectedCase: normalizedCase(),
    actual: folded.actual,
    fixtures: folded.fixtures,
    captures: folded.captures,
  });
}

function provenance(): JsonRecord {
  return {
    implementation: 'patch-map',
    codeCommit: 'test-code-commit',
    packedPackageSha256: 'test-packed-package-sha256',
  };
}

function environment(): JsonRecord {
  return { runtime: 'vitest', browserVersion: 'test-browser' };
}

function normalizedCase(): JsonRecord {
  const record = normalized.cases.find((candidate) => candidate.id === 'LIF-004');
  if (record === undefined) throw new Error('Missing normalized LIF-004 case');
  return record;
}

async function readNormalizedEvidence(): Promise<NormalizedEvidence> {
  const source = await readFile(
    fileURLToPath(new URL(
      '../../contracts/evidence/catalog-normalized-expected.v1.json',
      import.meta.url,
    )),
    'utf8',
  );
  return JSON.parse(source) as NormalizedEvidence;
}

function makeExecution(): JsonRecord {
  const facts = deriveFacts();
  const datasetRef = stringOperand(0, 'datasetRef');
  const snapshot = makeSnapshot(facts, datasetRef);
  const geometry = {
    entities: structuredClone(facts.entities),
    relations: structuredClone(facts.relations),
    selectionOverlay: structuredClone(facts.selectionOverlay),
  };
  const actions = [
    actionResult(0, {
      datasetRef,
      loadedAtMs: numberOperand(0, 'timeMs'),
      initialized: { lifecycle: 'ready-empty' },
      loaded: { lifecycle: 'scene-ready', sceneRevision: 1 },
      input: {
        beforeFingerprint: 'fnv1a64:0000000000000001',
        afterFingerprint: 'fnv1a64:0000000000000001',
        unchanged: true,
      },
      snapshot,
    }),
    actionResult(1, {
      requested: structuredClone(plan.fixture.actionTrace[1]?.operands),
      viewport: structuredClone(snapshot.viewport),
      snapshot,
    }),
    actionResult(2, {
      requestedIds: stringArrayOperand(2, 'ids'),
      selectedIds: stringArrayOperand(2, 'ids'),
      snapshot,
    }),
    actionResult(3, {
      requestedAtMs: numberOperand(3, 'timeMs'),
      requested: {
        widthCssPx: numberOperand(3, 'widthCssPx'),
        heightCssPx: numberOperand(3, 'heightCssPx'),
        devicePixelRatio: numberOperand(3, 'devicePixelRatio'),
      },
      changed: true,
      snapshot,
    }),
    actionResult(4, {
      publishedAtMs: numberOperand(4, 'timeMs'),
      snapshot,
      geometry,
    }),
    actionResult(5, {
      points: structuredClone(plan.fixture.actionTrace[5]?.operands.points),
      results: facts.hitIds.map((id, index) => ({
        point: pointArrayOperand(5, 'points')[index],
        id,
      })),
      resizeHitIds: structuredClone(facts.hitIds),
      snapshot,
    }),
    actionResult(6, {
      screen: pointOperand(6, 'screen'),
      world: structuredClone(facts.worldProbe),
      geometry,
      snapshot,
    }),
  ];
  return {
    $schema: 'patch-map-contract-case-execution/1',
    caseId: plan.id,
    caseType: plan.caseType,
    status: 'completed',
    error: null,
    hostSeamDelta: null,
    actionResults: actions,
    eventJournal: [],
    eventJournalFailures: [],
    bindings: {},
    captures: [],
    terminalSnapshot: structuredClone(snapshot),
    terminalSemanticProbe: { lifecycle: 'scene-ready' },
    cleanup: { status: 'completed', errors: [], releases: [] },
  };
}

function actionResult(index: number, actual: JsonRecord): JsonRecord {
  const action = plan.fixture.actionTrace[index];
  if (action === undefined) throw new Error(`Missing action ${index}`);
  return {
    index,
    type: action.type,
    handlerId: `contract/${action.type}`,
    status: 'completed',
    startedAtMs: 0,
    completedAtMs: numberOrZero(action.operands.timeMs),
    delta: {
      $schema: 'patch-map-semantic-observation-delta/1',
      caseId: plan.id,
      actionIndex: index,
      actionType: action.type,
      actual,
      semanticProbe: {},
    },
  };
}

function deriveFacts(): GeometryFacts {
  const dataset = interactiveDataset();
  const dimensions = pointFromOperands(3, 'widthCssPx', 'heightCssPx');
  const centerWorld = pointOperand(1, 'centerWorld');
  const scale = numberOperand(1, 'scale');
  const view = {
    x: dimensions[0] / 2 - centerWorld[0] * scale,
    y: dimensions[1] / 2 - centerWorld[1] * scale,
    scale,
  };
  const entities = dataset.flatMap((record) => elementFacts(record, view));
  const byId = new Map(entities.map((entity) => [String(entity.id), entity]));
  const relations = dataset.flatMap((record) => relationFacts(record, byId, view));
  const selectedIds = stringArrayOperand(2, 'ids');
  const selectedBounds = entities.flatMap((entity) => (
    selectedIds.includes(String(entity.id)) ? [boundsValue(entity.screenBounds)] : []
  ));
  const probeScreen = pointOperand(6, 'screen');
  const worldProbe = screenToWorld(probeScreen, view);
  const hitIds = pointArrayOperand(5, 'points').flatMap((point) => {
    const world = screenToWorld(point, view);
    const hit = entities.filter((entity) => contains(boundsValue(entity.worldBounds), world)).at(-1);
    return hit === undefined ? [] : [String(hit.id)];
  });
  return {
    entities,
    relations,
    selectionOverlay: selectedBounds.length === 0
      ? null
      : { screenBounds: unionBounds(selectedBounds) },
    worldProbe,
    hitIds,
  };
}

function makeSnapshot(facts: GeometryFacts, datasetRef: string): JsonRecord {
  const dimensions = pointFromOperands(3, 'widthCssPx', 'heightCssPx');
  const pixelRatio = numberOperand(3, 'devicePixelRatio');
  return {
    lifecycle: 'scene-ready',
    instanceId: 'lif-004-engine',
    revisions: {
      lifecycleGeneration: 1,
      sceneRevision: 1,
      viewRevision: 2,
      interactionRevision: 1,
    },
    publishedTuple: { scene: 1, view: 2, interaction: 1 },
    frameRevision: 1,
    datasetRef,
    semanticHash: 'fnv1a64:0000000000000001',
    rootIds: interactiveDataset().map((record) => String(record.id)),
    historyDepth: 0,
    pendingWork: 0,
    zoomLimits: [0.5, 30],
    viewport: {
      centerWorld: pointOperand(1, 'centerWorld'),
      scale: numberOperand(1, 'scale'),
      screenBounds: [0, 0, dimensions[0], dimensions[1]],
    },
    selectionIds: stringArrayOperand(2, 'ids'),
    facilities: [],
    resources: {
      canvasCount: facts.entities.length >= 0 ? 1 : 0,
      canvas: {
        cssSize: dimensions,
        backingSize: [dimensions[0] * pixelRatio, dimensions[1] * pixelRatio],
      },
      renderer: null,
      subscriptions: { active: 0, duplicates: 0 },
    },
  };
}

function elementFacts(
  record: JsonRecord,
  view: Readonly<{ x: number; y: number; scale: number }>,
): JsonRecord[] {
  if (record.type === 'relations') return [];
  const attrs = isRecord(record.attrs) ? record.attrs : {};
  const size = isRecord(record.size) ? record.size : {};
  const bounds: Bounds = [
    numberOrZero(attrs.x),
    numberOrZero(attrs.y),
    numberOrZero(size.width),
    numberOrZero(size.height),
  ];
  const own = {
    id: String(record.id),
    kind: String(record.type),
    worldBounds: bounds,
    screenBounds: screenBounds(bounds, view),
    visible: record.show !== false,
    interactive: record.show !== false && record.locked !== true,
  };
  const children = record.type === 'group' && Array.isArray(record.children)
    ? record.children.flatMap((child) => (isRecord(child) ? elementFacts(child, view) : []))
    : [];
  return [own, ...children];
}

function relationFacts(
  record: JsonRecord,
  entities: ReadonlyMap<string, JsonRecord>,
  view: Readonly<{ x: number; y: number; scale: number }>,
): JsonRecord[] {
  if (record.type !== 'relations' || !Array.isArray(record.links)) return [];
  return record.links.flatMap((link, index) => {
    if (!isRecord(link)) return [];
    const source = entities.get(String(link.source));
    const target = entities.get(String(link.target));
    if (source === undefined || target === undefined) return [];
    const sourceWorld = boundsCenter(boundsValue(source.worldBounds));
    const targetWorld = boundsCenter(boundsValue(target.worldBounds));
    return [{
      id: `${String(record.id)}:${index}`,
      sourceId: String(source.id),
      targetId: String(target.id),
      worldEndpoints: [sourceWorld, targetWorld],
      screenEndpoints: [worldToScreen(sourceWorld, view), worldToScreen(targetWorld, view)],
    }];
  });
}

function interactiveDataset(): JsonRecord[] {
  const profiles = fixtureProfiles as Readonly<{
    datasets: Readonly<Record<string, unknown>>;
  }>;
  const dataset = profiles.datasets['interactive-scene'];
  if (!Array.isArray(dataset) || !dataset.every(isRecord)) {
    throw new Error('Missing interactive-scene dataset');
  }
  return structuredClone(dataset);
}

function worldToScreen(
  point: Point,
  view: Readonly<{ x: number; y: number; scale: number }>,
): Point {
  return [view.x + point[0] * view.scale, view.y + point[1] * view.scale];
}

function screenToWorld(
  point: Point,
  view: Readonly<{ x: number; y: number; scale: number }>,
): Point {
  return [(point[0] - view.x) / view.scale, (point[1] - view.y) / view.scale];
}

function screenBounds(
  bounds: Bounds,
  view: Readonly<{ x: number; y: number; scale: number }>,
): Bounds {
  const topLeft = worldToScreen([bounds[0], bounds[1]], view);
  return [topLeft[0], topLeft[1], bounds[2] * view.scale, bounds[3] * view.scale];
}

function boundsCenter(bounds: Bounds): Point {
  return [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2];
}

function unionBounds(bounds: readonly Bounds[]): Bounds {
  const minX = Math.min(...bounds.map((entry) => entry[0]));
  const minY = Math.min(...bounds.map((entry) => entry[1]));
  const maxX = Math.max(...bounds.map((entry) => entry[0] + entry[2]));
  const maxY = Math.max(...bounds.map((entry) => entry[1] + entry[3]));
  return [minX, minY, maxX - minX, maxY - minY];
}

function contains(bounds: Bounds, point: Point): boolean {
  return point[0] >= bounds[0]
    && point[1] >= bounds[1]
    && point[0] <= bounds[0] + bounds[2]
    && point[1] <= bounds[1] + bounds[3];
}

function actionActual(execution: JsonRecord, index: number): JsonRecord {
  const actions = execution.actionResults;
  if (!Array.isArray(actions) || !isRecord(actions[index])) throw new Error(`Missing action ${index}`);
  const delta = actions[index].delta;
  if (!isRecord(delta) || !isRecord(delta.actual)) throw new Error(`Missing action ${index} actual`);
  return delta.actual;
}

function actionOperands(index: number): JsonRecord {
  const action = plan.fixture.actionTrace[index];
  if (action === undefined) throw new Error(`Missing action ${index}`);
  return action.operands;
}

function pointFromOperands(index: number, xKey: string, yKey: string): Point {
  return [numberOperand(index, xKey), numberOperand(index, yKey)];
}

function pointOperand(index: number, key: string): Point {
  const value = actionOperands(index)[key];
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
    throw new Error(`Invalid action ${index} point ${key}`);
  }
  return [Number(value[0]), Number(value[1])];
}

function pointArrayOperand(index: number, key: string): Point[] {
  const value = actionOperands(index)[key];
  if (!Array.isArray(value)) throw new Error(`Invalid action ${index} points ${key}`);
  return (value as unknown[]).map((point, pointIndex) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      throw new Error(`Invalid action ${index} point ${key}[${pointIndex}]`);
    }
    return [Number(point[0]), Number(point[1])];
  });
}

function stringArrayOperand(index: number, key: string): string[] {
  const value = actionOperands(index)[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`Invalid action ${index} strings ${key}`);
  }
  return [...value];
}

function stringOperand(index: number, key: string): string {
  const value = actionOperands(index)[key];
  if (typeof value !== 'string') throw new Error(`Invalid action ${index} string ${key}`);
  return value;
}

function numberOperand(index: number, key: string): number {
  const value = actionOperands(index)[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid action ${index} number ${key}`);
  }
  return value;
}

function boundsValue(value: unknown): Bounds {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) {
    throw new Error('Invalid bounds');
  }
  return [Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])];
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function valueAt(value: JsonRecord, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      throw new Error(`Missing path ${path}`);
    }
    current = current[segment];
  }
  return current;
}

function isDeepFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((nested) => isDeepFrozen(nested, seen));
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
