import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

type JsonRecord = Record<string, unknown>;

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
  readonly actual: Readonly<JsonRecord>;
  readonly fixtures: Readonly<JsonRecord>;
  readonly captures: Readonly<JsonRecord>;
}

interface FoldRuntime {
  readonly LAYOUT_ORDER_FOLD_REVISION: string;
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

const [catalogRuntime, materializeRuntime, foldRuntime, compareRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-layout-order.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { LAYOUT_ORDER_FOLD_REVISION, foldLayoutOrderExecution } = foldRuntime;
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

const LOCAL_BOUNDS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  left: [26, 32, 30, 10],
  'left-top': [26, 10, 30, 10],
  'left-bottom': [26, 50, 30, 10],
  top: [38, 10, 30, 10],
  right: [54, 32, 30, 10],
  'right-top': [54, 10, 30, 10],
  'right-bottom': [54, 50, 30, 10],
  bottom: [38, 50, 30, 10],
  center: [38, 32, 30, 10],
  none: [0, 0, 30, 10],
};

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('Core v2 LAY-002 actual-only layout-order fold', () => {
  it('is browser-safe, import-free, and independent of answer evidence', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-layout-order.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(LAYOUT_ORDER_FOLD_REVISION).toBe('core-v2-layout-order-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toContain('params.placementMatrix');
    expect(source).not.toContain('fixtureParams.placementMatrix');
  });

  it('produces all exact LAY-002 paths from observed geometry', () => {
    const plan = selectedCase();
    const folded = fold(plan, execution());
    const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === 'LAY-002');
    if (expectedCase === undefined) throw new Error('Missing approved LAY-002 observations');
    const comparison = compareObservation({
      expectedCase: expectedCase as unknown as ExpectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    expect(folded.actual).toMatchObject({
      $schema: 'core-v2-semantic-observation/1',
      case: { id: 'LAY-002', caseType: 'capability' },
      scene: { revision: 1 },
      geometry: {
        placements: {
          order: placementOrder(),
          none: {
            localBounds: [0, 0, 30, 10],
            worldBounds: [10, 20, 30, 10],
          },
          center: {
            localBounds: [38, 32, 30, 10],
            worldBounds: [48, 52, 30, 10],
            center: [53, 37],
          },
          'right-top': { right: 84, top: 10 },
        },
        validation: {
          complete: true,
          deterministic: true,
          boundsStable: true,
          inputUnchanged: true,
          allRelationsExact: true,
        },
      },
      outcome: {
        layoutOrder: {
          complete: true,
          deterministic: true,
          boundsStable: true,
          inputUnchanged: true,
          allRelationsExact: true,
        },
      },
    });
    expect(expectedCase.expected.assertions).toHaveLength(28);
    expect(comparison).toMatchObject({ passed: 28, failed: 0 });
    expect(comparison.assertions.every(({ passed }) => passed)).toBe(true);
    expect(folded.fixtures).not.toHaveProperty('placementMatrix');
    expect(folded.captures).toEqual({});
    expect(Object.isFrozen(folded)).toBe(true);
  });

  it('does not read a poisoned setup matrix as an oracle or output fixture', () => {
    const cleanPlan = selectedCase();
    const poisonedPlan = structuredClone(cleanPlan);
    const params = poisonedPlan.fixture.setup.params as JsonRecord;
    params.placementMatrix = {
      poison: 'placement-matrix-oracle-poison',
      center: { localBounds: [999, 999, 999, 999] },
    };

    const clean = fold(cleanPlan, execution());
    const poisoned = fold(poisonedPlan, execution());

    expect(poisoned.actual).toEqual(clean.actual);
    expect(poisoned.fixtures).toEqual(clean.fixtures);
    expect(JSON.stringify(poisoned)).not.toContain('oracle-poison');
  });

  it('keeps unfavorable observed geometry visible instead of correcting it in the fold', () => {
    const poisonedExecution = execution();
    const actual = requireActionActual(poisonedExecution, 2);
    const placements = requireRecord(actual.placements, 'poison placements');
    const rows = requireArray(placements.rows, 'poison rows') as JsonRecord[];
    const center = requireRecord(rows.find((row) => row.placement === 'center'), 'center row');
    center.localBounds = [39, 32, 30, 10];
    center.worldBounds = [49, 52, 30, 10];
    center.center = [54, 37];
    center.right = 69;
    const product = requireRecord(actual.product, 'poison product');
    const geometryProbe = requireRecord(product.geometryProbe, 'poison geometry probe');
    const entities = requireArray(geometryProbe.entities, 'poison geometry entities') as JsonRecord[];
    const centerEntity = requireRecord(
      entities.find((entity) => entity.componentId === 'center'),
      'poison center entity',
    );
    centerEntity.worldBounds = [49, 52, 30, 10];
    const folded = fold(selectedCase(), poisonedExecution);
    const geometry = requireRecord(folded.actual.geometry, 'geometry');
    const projected = requireRecord(geometry.placements, 'projected placements');
    const validation = requireRecord(geometry.validation, 'validation');

    expect(requireRecord(projected.center, 'projected center')).toMatchObject({
      localBounds: [39, 32, 30, 10],
      worldBounds: [49, 52, 30, 10],
      center: [54, 37],
      right: 69,
      top: 32,
    });
    expect(validation).toMatchObject({
      deterministic: false,
      boundsStable: false,
      allRelationsExact: false,
    });
  });

  it('derives relation validity from authored padding and margins, not the setup matrix', () => {
    const plan = structuredClone(selectedCase());
    const params = plan.fixture.setup.params as JsonRecord;
    params.margin = { top: 4, right: 5, bottom: 7, left: 9 };
    params.placementMatrix = { poison: 'still-not-read' };
    const folded = fold(plan, execution());
    const geometry = requireRecord(folded.actual.geometry, 'geometry');
    const validation = requireRecord(geometry.validation, 'validation');

    expect(validation).toMatchObject({ allRelationsExact: false });
    expect(requireRecord(
      requireRecord(geometry.placements, 'placements')['left-top'],
      'left-top',
    ).localBounds).toEqual([26, 10, 30, 10]);
  });

  it('fails closed for structurally incomplete product geometry', () => {
    const incomplete = execution();
    const actual = requireActionActual(incomplete, 2);
    const placements = requireRecord(actual.placements, 'placements');
    const rows = requireArray(placements.rows, 'rows') as JsonRecord[];
    rows.pop();

    expect(() => fold(selectedCase(), incomplete)).toThrow(/row count/u);
  });

  it('fails closed when action metadata or cross-action fingerprints drift', () => {
    const metadataDrift = execution();
    requireActionActual(metadataDrift, 0).componentCount = 9;
    expect(() => fold(selectedCase(), metadataDrift)).toThrow(/component count correlation/u);

    const fingerprintDrift = execution();
    const input = requireRecord(requireActionActual(fingerprintDrift, 1).input, 'drift input');
    input.fixtureBefore = 'fnv1a64:different-fixture';
    input.fixtureAfter = 'fnv1a64:different-fixture';
    expect(() => fold(selectedCase(), fingerprintDrift)).toThrow(/fingerprint correlation/u);
  });

  it('requires a correlated published frame and disjoint owner/component identities', () => {
    const unpublished = execution();
    const product = requireRecord(requireActionActual(unpublished, 1).product, 'unpublished product');
    requireRecord(product.snapshot, 'unpublished snapshot').frameRevision = 0;
    expect(() => fold(selectedCase(), unpublished)).toThrow(/published frame/u);

    const collision = execution();
    const placements = requireRecord(
      requireActionActual(collision, 2).placements,
      'collision placements',
    );
    const rows = requireArray(placements.rows, 'collision rows') as JsonRecord[];
    requireRecord(rows[0], 'collision row').entityId = 'item';
    expect(() => fold(selectedCase(), collision)).toThrow(/entity identities/u);
  });
});

describe('Core v2 LAY-003 actual-only layout-order fold', () => {
  it('projects the nine canonical paths from observed public paint order', () => {
    const plan = selectedCase('LAY-003');
    const folded = fold(plan, stackingExecution());
    const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === 'LAY-003');
    if (expectedCase === undefined) throw new Error('Missing approved LAY-003 observations');
    const comparison = compareObservation({
      expectedCase: expectedCase as unknown as ExpectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    expect(expectedCase.expected.assertions).toHaveLength(9);
    expect(comparison).toMatchObject({ passed: 9, failed: 0 });
    expect(comparison.assertions.every(({ passed }) => passed)).toBe(true);
    expect(folded.fixtures).toEqual({
      siblings: [
        { id: 'low', zIndex: -1 },
        { id: 'first', zIndex: 4 },
        { id: 'second', zIndex: 4 },
        { id: 'high', zIndex: 10 },
      ],
      overlays: ['selection', 'transformer'],
    });
  });

  it('keeps an unfavorable observed equal-z order visible to comparison', () => {
    const execution = stackingExecution();
    setStackingOrder(execution, 1, [
      'second',
      'first',
      'low',
      'high',
      'selection',
      'transformer',
    ]);
    const folded = fold(selectedCase('LAY-003'), execution);
    const expectedCase = normalizedExpectedCatalog.cases.find(({ id }) => id === 'LAY-003');
    if (expectedCase === undefined) throw new Error('Missing approved LAY-003 observations');
    const comparison = compareObservation({
      expectedCase: expectedCase as unknown as ExpectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });
    const scene = requireRecord(folded.actual.scene, 'stacking scene');
    const afterPatch = requireRecord(scene.afterPatch, 'stacking afterPatch');
    const outcome = requireRecord(folded.actual.outcome, 'stacking outcome');
    const validation = requireRecord(outcome.layoutOrder, 'stacking validation');

    expect(afterPatch.renderOrder).toEqual([
      'second',
      'first',
      'low',
      'high',
      'selection',
      'transformer',
    ]);
    expect(validation).toMatchObject({ allOrdersExact: false });
    expect(comparison.failed).toBe(1);
  });
});

function fold(plan: MaterializedCase, value: JsonRecord): FoldResult {
  return foldLayoutOrderExecution({
    casePlan: plan,
    execution: value,
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
}

function selectedCase(caseId: 'LAY-002' | 'LAY-003' = 'LAY-002'): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (selected === undefined) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function execution(): JsonRecord {
  const placements = placementEvidence();
  const terminalSnapshot = terminalSnapshotEvidence();
  const semanticProbe = { scene: { nodeCount: 11, revision: 1 } };
  const actionActuals = [
    {
      caseId: 'LAY-002',
      itemId: 'item',
      componentCount: 10,
      input: inputEvidence(),
      product: productEvidence(placements, terminalSnapshot, semanticProbe, 1),
    },
    {
      ownerId: 'item',
      owner: structuredClone(placements.owner),
      placements: structuredClone(placements),
      input: inputEvidence(),
      product: productEvidence(placements, terminalSnapshot, semanticProbe, 2),
    },
    {
      valueRef: 'placementMatrix',
      placements: structuredClone(placements),
      repeatPlacements: structuredClone(placements),
      complete: true,
      deterministic: true,
      input: inputEvidence(),
      product: productEvidence(placements, terminalSnapshot, semanticProbe, 3),
    },
  ];
  const types = ['loadPlacementMatrix', 'observeBounds', 'observePlacementMatrix'];
  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId: 'LAY-002',
    caseType: 'capability',
    status: 'completed',
    actionResults: types.map((type, index) => ({
      index,
      type,
      handlerId: `contract/${type}`,
      status: 'completed',
      startedAtMs: index,
      completedAtMs: index,
      delta: {
        $schema: 'core-v2-semantic-observation-delta/1',
        caseId: 'LAY-002',
        actionIndex: index,
        actionType: type,
        actual: actionActuals[index],
        semanticProbe: structuredClone(semanticProbe),
      },
    })),
    captures: [],
    bindings: {},
    eventJournal: [],
    eventJournalFailures: [],
    datasetObservations: {},
    hostSeamDelta: null,
    terminalSnapshot,
    terminalSemanticProbe: structuredClone(semanticProbe),
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: [{
        remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
      }],
      errors: [],
      productResources: {
        revision: 'core-v2-layout-order-cleanup/1',
        caseId: 'LAY-002',
        runtimeCounts: zeroOwnership(),
        stats: { datasetBuildCount: 1, resourceProbeCount: 3 },
        journal: [],
      },
    },
    error: null,
  };
}

function inputEvidence(): JsonRecord {
  return {
    fixtureBefore: 'fnv1a64:fixture',
    fixtureAfter: 'fnv1a64:fixture',
    authoredBefore: 'fnv1a64:authored',
    authoredAfter: 'fnv1a64:authored',
    datasetBefore: 'fnv1a64:dataset',
    datasetAfter: 'fnv1a64:dataset',
    unchanged: true,
  };
}

function productEvidence(
  placements: JsonRecord,
  snapshot: JsonRecord,
  semanticProbe: JsonRecord,
  resourceProbeCount: number,
): JsonRecord {
  const rows = requireArray(placements.rows, 'product placement rows').map((value) => {
    const row = requireRecord(value, 'product placement row');
    return {
      id: row.entityId,
      kind: 'rect',
      ownerItemId: 'item',
      componentId: row.placement,
      componentType: row.componentType,
      localBounds: structuredClone(row.entityLocalBounds),
      worldBounds: structuredClone(row.worldBounds),
      screenBounds: structuredClone(row.worldBounds),
      visible: row.visible,
    };
  });
  return {
    snapshot: structuredClone(snapshot),
    semanticProbe: structuredClone(semanticProbe),
    geometryProbe: {
      revision: 1,
      revisionLag: 0,
      entities: [{
        id: 'item',
        kind: 'rect',
        localBounds: [0, 0, 100, 80],
        worldBounds: [10, 20, 100, 80],
        screenBounds: [10, 20, 100, 80],
        visible: true,
      }, ...rows],
      relations: [],
    },
    exportedDataset: [{ type: 'item', id: 'item' }],
    datasetFidelity: {
      loadedProfileFingerprint: 'fnv1a64:dataset-profile',
      exportedProfileFingerprint: 'fnv1a64:dataset-profile',
      unchanged: true,
    },
    runtime: {
      revision: 'core-v2-layout-order-runtime/1',
      caseId: 'LAY-002',
      ownership: zeroOwnership(),
      stats: { datasetBuildCount: 1, resourceProbeCount },
      journal: [],
    },
  };
}

function terminalSnapshotEvidence(): JsonRecord {
  return {
    lifecycle: 'scene-ready',
    revisions: {
      lifecycleGeneration: 1,
      sceneRevision: 1,
      viewRevision: 0,
      interactionRevision: 0,
    },
    publishedTuple: { scene: 1, view: 0, interaction: 0 },
    frameRevision: 1,
    rootIds: ['item'],
    historyDepth: 0,
    resources: {
      canvasCount: 1,
      subscriptions: { active: 6 },
      rendering: { visiblePrimitiveCount: 11 },
    },
  };
}

function stackingExecution(): JsonRecord {
  const initial = [
    { id: 'low', zIndex: -1, authoredOrder: 0 },
    { id: 'first', zIndex: 4, authoredOrder: 1 },
    { id: 'second', zIndex: 4, authoredOrder: 2 },
    { id: 'high', zIndex: 10, authoredOrder: 3 },
  ];
  const patched = initial.map((entry) => (
    entry.id === 'low' ? { ...entry, zIndex: 6 } : { ...entry }
  ));
  const states = [
    stackingState(initial, 1, 1, { depth: 0, cursor: 0, undoDepth: 0, redoDepth: 0 }),
    stackingState(patched, 2, 2, { depth: 1, cursor: 1, undoDepth: 1, redoDepth: 0 }),
    stackingState(initial, 3, 3, { depth: 1, cursor: 0, undoDepth: 0, redoDepth: 1 }),
    stackingState(patched, 4, 4, { depth: 1, cursor: 1, undoDepth: 1, redoDepth: 0 }),
  ];
  const actionActuals = [
    {
      caseId: 'LAY-003',
      datasetId: 'stacking',
      selectionId: 'low',
      loaded: { lifecycle: 'scene-ready', sceneRevision: 1 },
      paint: structuredClone(states[0]?.paint),
      input: inputEvidence(),
      product: structuredClone(states[0]?.product),
    },
    {
      targetId: 'low',
      changes: { attrs: { zIndex: 6 } },
      mutation: { status: 'committed', changed: true },
      paint: structuredClone(states[1]?.paint),
      input: inputEvidence(),
      product: structuredClone(states[1]?.product),
    },
    {
      direction: 'undo',
      timeMs: 10,
      transition: { status: 'committed', changed: true, direction: 'undo' },
      paint: structuredClone(states[2]?.paint),
      input: inputEvidence(),
      product: structuredClone(states[2]?.product),
    },
    {
      direction: 'redo',
      timeMs: 20,
      transition: { status: 'committed', changed: true, direction: 'redo' },
      paint: structuredClone(states[3]?.paint),
      input: inputEvidence(),
      product: structuredClone(states[3]?.product),
    },
  ];
  const types = ['loadDataset', 'patch', 'undo', 'redo'];
  const timings = [[0, 0], [0, 0], [0, 10], [10, 20]];
  const finalState = states[3];
  if (finalState === undefined) throw new Error('Missing final stacking state');
  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId: 'LAY-003',
    caseType: 'capability',
    status: 'completed',
    actionResults: types.map((type, index) => {
      const timing = timings[index];
      const state = states[index];
      if (timing === undefined || state === undefined) throw new Error(`Missing stacking action ${index}`);
      return {
        index,
        type,
        handlerId: `contract/${type}`,
        status: 'completed',
        startedAtMs: timing[0],
        completedAtMs: timing[1],
        delta: {
          $schema: 'core-v2-semantic-observation-delta/1',
          caseId: 'LAY-003',
          actionIndex: index,
          actionType: type,
          actual: actionActuals[index],
          semanticProbe: structuredClone(state.semanticProbe),
        },
      };
    }),
    captures: [],
    bindings: {},
    eventJournal: [],
    eventJournalFailures: [],
    datasetObservations: {},
    hostSeamDelta: null,
    terminalSnapshot: structuredClone(finalState.snapshot),
    terminalSemanticProbe: structuredClone(finalState.semanticProbe),
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: [{
        remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
      }],
      errors: [],
      productResources: {
        revision: 'core-v2-layout-order-cleanup/1',
        caseId: 'LAY-003',
        runtimeCounts: zeroOwnership(),
        stats: { datasetBuildCount: 0, stackingDatasetBuildCount: 1, resourceProbeCount: 4 },
        journal: [],
      },
    },
    error: null,
  };
}

function stackingState(
  siblings: readonly Readonly<{ id: string; zIndex: number; authoredOrder: number }>[],
  sceneRevision: number,
  frameRevision: number,
  history: Readonly<{ depth: number; cursor: number; undoDepth: number; redoDepth: number }>,
): Readonly<{ paint: JsonRecord; product: JsonRecord; snapshot: JsonRecord; semanticProbe: JsonRecord }> {
  const sorted = [...siblings].sort((left, right) => (
    left.zIndex - right.zIndex || left.authoredOrder - right.authoredOrder
  ));
  const entries = [
    ...sorted.map((entry, paintIndex) => ({
      publicId: entry.id,
      entityId: entry.id,
      kind: 'rect',
      lane: 'ordinary-geometry',
      zIndex: entry.zIndex,
      authoredOrder: entry.authoredOrder,
      pass: 0,
      phase: 'scene',
      paintIndex,
      visible: true,
    })),
    ...['selection', 'transformer'].map((publicId, overlayIndex) => ({
      publicId,
      entityId: `overlay:${publicId}`,
      kind: publicId,
      lane: 'interaction-overlay',
      zIndex: Number.MAX_SAFE_INTEGER,
      authoredOrder: overlayIndex,
      pass: overlayIndex,
      phase: 'overlay',
      paintIndex: sorted.length + overlayIndex,
      visible: true,
    })),
  ];
  const renderOrder = entries.map(({ publicId }) => publicId);
  const revisions = {
    lifecycleGeneration: 1,
    sceneRevision,
    viewRevision: 0,
    interactionRevision: 1,
  };
  const publishedTuple = { scene: sceneRevision, view: 0, interaction: 1 };
  const historyState = {
    ...history,
    capacity: 50,
    canUndo: history.undoDepth > 0,
    canRedo: history.redoDepth > 0,
  };
  const snapshot = {
    lifecycle: 'scene-ready',
    revisions,
    publishedTuple,
    frameRevision,
    rootIds: ['low', 'first', 'second', 'high'],
    historyDepth: history.undoDepth,
    resources: {
      canvasCount: 1,
      subscriptions: { active: 6 },
      rendering: { visiblePrimitiveCount: 4 },
    },
  };
  const semanticProbe = { scene: { revision: sceneRevision }, history: { depth: history.undoDepth } };
  const overlays = {
    order: ['selection', 'transformer'],
    selection: true,
    transformer: true,
    selectedEntityCount: 1,
    renderObjectCount: 2,
  };
  const paint = {
    sceneRevision,
    rendererFrame: frameRevision,
    publication: 'current',
    hierarchyNodeCount: 4,
    rendererCommandCount: 6,
    overlays,
    renderOrder,
    visibleEntries: entries,
    history: historyState,
    revisions,
    publishedTuple,
    frameRevision,
  };
  const product = {
    snapshot,
    semanticProbe,
    paintOrderProbe: {
      sceneRevision,
      rendererFrame: frameRevision,
      publication: 'current',
      hierarchyNodeCount: 4,
      rendererCommandCount: 6,
      overlays,
      plan: { renderOrder, visibleEntries: entries },
      history: historyState,
      revisions,
      publishedTuple,
      frameRevision,
    },
    exportedDataset: siblings.map(({ id, zIndex }) => ({ id, type: 'rect', attrs: { zIndex } })),
    datasetFidelity: {
      expectedProfileFingerprint: `fnv1a64:stacking-${sceneRevision}`,
      exportedProfileFingerprint: `fnv1a64:stacking-${sceneRevision}`,
      unchanged: true,
    },
    runtime: {
      revision: 'core-v2-layout-order-runtime/1',
      caseId: 'LAY-003',
      ownership: zeroOwnership(),
      stats: { datasetBuildCount: 0, stackingDatasetBuildCount: 1, resourceProbeCount: frameRevision },
      journal: [],
    },
  };
  return { paint, product, snapshot, semanticProbe };
}

function setStackingOrder(
  execution: JsonRecord,
  actionIndex: number,
  order: readonly string[],
): void {
  const actual = requireActionActual(execution, actionIndex);
  const paint = requireRecord(actual.paint, 'stacking poison paint');
  const product = requireRecord(actual.product, 'stacking poison product');
  const probe = requireRecord(product.paintOrderProbe, 'stacking poison probe');
  const plan = requireRecord(probe.plan, 'stacking poison plan');
  const currentEntries = requireArray(paint.visibleEntries, 'stacking poison entries') as JsonRecord[];
  const reordered = order.map((id) => requireRecord(
    currentEntries.find((entry) => entry.publicId === id),
    `stacking poison entry ${id}`,
  ));
  paint.renderOrder = [...order];
  paint.visibleEntries = structuredClone(reordered);
  plan.renderOrder = [...order];
  plan.visibleEntries = structuredClone(reordered);
}

function placementEvidence(): JsonRecord {
  const order = placementOrder();
  return {
    revision: 1,
    revisionLag: 0,
    owner: {
      id: 'item',
      kind: 'rect',
      worldBounds: [10, 20, 100, 80],
      screenBounds: [10, 20, 100, 80],
      visible: true,
    },
    order,
    rows: order.map((placement) => {
      const local = LOCAL_BOUNDS[placement];
      if (local === undefined) throw new Error(`Missing local bounds ${placement}`);
      const world = [local[0] + 10, local[1] + 20, local[2], local[3]];
      return {
        placement,
        entityId: `item::bar:${placement}`,
        componentType: 'bar',
        entityLocalBounds: [0, 0, 30, 10],
        localBounds: [...local],
        worldBounds: world,
        center: [local[0] + local[2] / 2, local[1] + local[3] / 2],
        right: local[0] + local[2],
        top: local[1],
        visible: true,
      };
    }),
  };
}

function placementOrder(): string[] {
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

function zeroOwnership(): JsonRecord {
  return {
    activeSessionCount: 0,
    retainedDatasetCount: 0,
    rendererObjectCount: 0,
    subscriptionCount: 0,
    pendingWorkCount: 0,
  };
}

function requireAction(value: JsonRecord, index: number): JsonRecord {
  const actions = requireArray(value.actionResults, 'action results');
  return requireRecord(actions[index], `action ${index}`);
}

function requireActionActual(value: JsonRecord, index: number): JsonRecord {
  const action = requireAction(value, index);
  const delta = requireRecord(action.delta, `action ${index} delta`);
  return requireRecord(delta.actual, `action ${index} actual`);
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing ${label}`);
  }
  return value as JsonRecord;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Missing ${label}`);
  return value;
}
