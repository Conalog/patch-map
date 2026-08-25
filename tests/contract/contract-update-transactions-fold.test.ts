import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../contracts/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from '../support/contract-verifier-import-firewall';

type JsonRecord = Record<string, unknown>;

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly rootTestId: string;
  readonly fixtureSha256: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
    readonly actionTrace: readonly Readonly<{
      readonly index: number;
      readonly type: string;
      readonly operands: Readonly<JsonRecord>;
    }>[];
    readonly captureCheckpoints: readonly Readonly<{
      readonly id: string;
      readonly phase: string;
      readonly afterActionIndex: number;
      readonly paths: readonly string[];
    }>[];
  }>;
  readonly actionTrace: readonly Readonly<{
    readonly index: number;
    readonly type: string;
    readonly operands: Readonly<JsonRecord>;
  }>[];
  readonly routeParams: Readonly<{ readonly size: string; readonly seed: number }>;
}

interface ExecutorCatalog {
  readonly cases: readonly CatalogCase[];
}

interface CatalogRuntime {
  loadExecutorCatalog(this: void): Promise<ExecutorCatalog>;
  selectCatalogCases(
    this: void,
    catalog: ExecutorCatalog,
    selection: Readonly<{ readonly caseIds: readonly string[] }>,
  ): readonly CatalogCase[];
}

interface MaterializeRuntime {
  materializeCase(
    this: void,
    record: CatalogCase,
    options: Readonly<{ readonly size: string; readonly seed: string }>,
  ): CatalogCase;
}

interface FoldResult {
  readonly actual: Readonly<JsonRecord>;
  readonly fixtures: Readonly<JsonRecord>;
  readonly captures: Readonly<JsonRecord>;
}

interface FoldRuntime {
  readonly UPDATE_TRANSACTIONS_FOLD_REVISION: string;
  foldUpdateTransactionExecution(
    this: void,
    options: Readonly<{
      readonly casePlan: CatalogCase;
      readonly execution: Readonly<JsonRecord>;
      readonly provenance: Readonly<JsonRecord>;
      readonly environment: Readonly<JsonRecord>;
    }>,
  ): FoldResult;
}

interface ExpectedCase extends JsonRecord {
  readonly id: string;
  readonly expected: Readonly<{ readonly assertions: readonly JsonRecord[] }>;
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<{
      readonly expectedCase: ExpectedCase;
      readonly actual: Readonly<JsonRecord>;
      readonly fixtures: Readonly<JsonRecord>;
      readonly captures: Readonly<JsonRecord>;
    }>,
  ): Readonly<{
    readonly passed: number;
    readonly failed: number;
    readonly assertions: readonly Readonly<{
      readonly path: string;
      readonly passed: boolean;
    }>[];
  }>;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, foldRuntime, compareRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../verification/contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../verification/contract/materialize.mjs'),
  loadRuntime<FoldRuntime>(
    '../../verification/contract/fold-update-transactions.mjs',
  ),
  loadRuntime<CompareRuntime>('../../verification/contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { UPDATE_TRANSACTIONS_FOLD_REVISION, foldUpdateTransactionExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

const CASE_IDS = [
  'UPD-001',
  'UPD-002',
  'UPD-003',
  'UPD-004',
  'UPD-006',
  'UPD-007',
  'UPD-008',
  'UPD-009',
  'UPD-010',
  'UPD-011',
  'UPD-012',
  'UPD-013',
  'UPD-014',
] as const;
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
const EXPECTED_RESULTS: Readonly<Record<(typeof CASE_IDS)[number], readonly [number, number]>> = {
  'UPD-001': [8, 0],
  'UPD-002': [11, 0],
  'UPD-003': [12, 1],
  'UPD-004': [12, 0],
  'UPD-006': [11, 0],
  'UPD-007': [13, 2],
  'UPD-008': [13, 0],
  'UPD-009': [13, 1],
  'UPD-010': [12, 0],
  'UPD-011': [10, 0],
  'UPD-012': [10, 0],
  'UPD-013': [8, 0],
  'UPD-014': [10, 0],
};

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap update-transaction actual-only fold', () => {
  it('is import-free, browser-safe, expected-blind, and revisioned', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../verification/contract/fold-update-transactions.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(UPDATE_TRANSACTIONS_FOLD_REVISION).toBe('patch-map-update-transactions-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/\.expected\b/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    await assertCommittedVerifierEntryImportFirewall('fold-update-transactions.mjs', 'fold');
    expect(source).not.toMatch(/node:/u);
  });

  it.each(CASE_IDS)(
    'folds %s into fourteen frozen domains without changing unfavorable observations',
    (caseId) => {
      const plan = selectedCase(caseId);
      const execution = executionFor(plan);
      const folded = fold(plan, execution);
      const expectedCase = normalizedCase(caseId);
      const comparison = compareObservation({
        expectedCase,
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      });
      const [passed, failed] = EXPECTED_RESULTS[caseId];

      expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
      expect(folded.actual).toMatchObject({
        $schema: 'patch-map-semantic-observation/1',
        case: { id: caseId, caseType: 'capability', executionStatus: 'completed' },
        outcome: { recorded: true, inputUnchanged: true },
        resources: { cleanup: { status: 'completed', errors: [] } },
      });
      expect(expectedCase.expected.assertions).toHaveLength(passed + failed);
      expect(comparison).toMatchObject({ passed, failed });
      expect(Object.isFrozen(folded)).toBe(true);
      expect(Object.isFrozen(folded.actual)).toBe(true);

      if (caseId === 'UPD-003') {
        expect(comparison.assertions.filter(({ passed }) => !passed)).toEqual([
          expect.objectContaining({ path: '/outcome/invalidCrossScope/code' }),
        ]);
        expect(valueAt(folded.actual, 'outcome.invalidCrossScope.code'))
          .toBe('INVALID_RECORD_KIND');
      } else if (caseId === 'UPD-007') {
        expect(comparison.assertions.filter(({ passed }) => !passed)).toEqual([
          expect.objectContaining({ path: '/outcome/valid/queryRevision' }),
          expect.objectContaining({ path: '/outcome/valid/eventRevision' }),
        ]);
        expect(valueAt(folded.actual, 'outcome.valid.queryRevision')).toBe(2);
        expect(valueAt(folded.actual, 'outcome.valid.eventRevision')).toBe(2);
        expect(valueAt(folded.actual, 'revisions.frame.revision')).toBe(1);
        expect(valueAt(folded.captures, 'valid.frameRevision')).toBe(1);
      } else if (caseId === 'UPD-009') {
        expect(comparison.assertions.filter(({ passed }) => !passed)).toEqual([
          expect.objectContaining({ path: '/outcome/cycle/code' }),
        ]);
        expect(valueAt(folded.actual, 'outcome.cycle.code')).toBe('CONFLICT');
      } else {
        expect(comparison.assertions.every(({ passed }) => passed)).toBe(true);
      }
    },
  );

  it('projects declared slash-path captures and produced bindings without flattening', () => {
    const partial = fold(selectedCase('UPD-002'), executionFor(selectedCase('UPD-002')));
    const components = fold(selectedCase('UPD-008'), executionFor(selectedCase('UPD-008')));

    expect(partial.captures).toMatchObject({
      before: {
        target: { size: { width: 60 }, source: { type: 'rect', fill: '#00aa66' } },
      },
    });
    expect(components.captures).toEqual({ initial: { bar: { id: 'bar' } } });
  });

  it('fails closed on terminal drift, input mutation, and incomplete capture evidence', () => {
    const plan = selectedCase('UPD-007');

    const terminalDrift = executionFor(plan);
    requireRecord(terminalDrift.terminalSnapshot, 'terminal').frameRevision = 99;
    expect(() => fold(plan, terminalDrift)).toThrow(/terminal snapshot correlation/u);

    const inputMutation = executionFor(plan);
    const firstActual = actionActual(inputMutation, 0);
    requireRecord(firstActual.input, 'input').afterFingerprint = 'fnv1a64:changed';
    expect(() => fold(plan, inputMutation)).toThrow(/input fingerprint correlation/u);

    const captureDrift = executionFor(plan);
    const capture = requireRecord(requireArray(captureDrift.captures, 'captures')[0], 'capture');
    delete requireRecord(capture.values, 'capture values').frameRevision;
    expect(() => fold(plan, captureDrift)).toThrow(/capture valid missing frameRevision/u);
  });

  it('keeps UPD-007 scene revision correlation separate from the frame counter', () => {
    const plan = selectedCase('UPD-007');
    const valid = fold(plan, executionFor(plan));

    expect(valid.actual).toMatchObject({
      revisions: { scene: { revision: 2 }, frame: { revision: 1 } },
      outcome: { valid: { queryRevision: 2, eventRevision: 2 } },
    });
    expect(valid.captures).toMatchObject({ valid: { frameRevision: 1 } });

    const queryDrift = executionFor(plan);
    actionActual(queryDrift, 1).queryRevision = 3;
    expect(() => fold(plan, queryDrift)).toThrow(/query\/product scene revision correlation/u);

    const eventDrift = executionFor(plan);
    actionActual(eventDrift, 1).eventRevision = 3;
    expect(() => fold(plan, eventDrift)).toThrow(/event\/query scene revision correlation/u);

    const publishedDrift = executionFor(plan);
    const frameProduct = requireRecord(actionActual(publishedDrift, 2).product, 'frame product');
    const frameSnapshot = requireRecord(frameProduct.snapshot, 'frame snapshot');
    requireRecord(frameSnapshot.publishedTuple, 'published tuple').scene = 3;
    expect(() => fold(plan, publishedDrift)).toThrow(/published scene revision correlation/u);
  });

  it('keeps a public diagnostic change visible rather than substituting the approved label', () => {
    const plan = selectedCase('UPD-003');
    const execution = executionFor(plan);
    const invalid = actionActual(execution, 2);
    const result = requireRecord(invalid.result, 'invalid result');
    const diagnostic = requireRecord(result.transactionDiagnostic, 'invalid diagnostic');
    diagnostic.code = 'SOME_OTHER_PUBLIC_CODE';
    const folded = fold(plan, execution);

    expect(valueAt(folded.actual, 'outcome.invalidCrossScope.code'))
      .toBe('SOME_OTHER_PUBLIC_CODE');
  });
});

function selectedCase(caseId: (typeof CASE_IDS)[number]): CatalogCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (selected === undefined) throw new Error(`Missing ${caseId}`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function normalizedCase(caseId: string): ExpectedCase {
  const record = normalizedExpectedCatalog.cases.find(({ id }) => id === caseId);
  if (record === undefined) throw new Error(`Missing expected ${caseId}`);
  return record as unknown as ExpectedCase;
}

function fold(plan: CatalogCase, execution: JsonRecord): FoldResult {
  return foldUpdateTransactionExecution({
    casePlan: plan,
    execution,
    provenance: {
      codeCommit: 'test-commit',
      packedPackageSha256: 'test-package',
    },
    environment: { browserVersion: 'test-browser', renderer: 'webgl' },
  });
}

function executionFor(plan: CatalogCase): JsonRecord {
  const shape = caseShape(plan.id);
  if (shape.actuals.length !== plan.actionTrace.length) {
    throw new Error(`${plan.id} test action shape drift`);
  }
  const actionResults = plan.actionTrace.map((action, index) => ({
    index,
    type: action.type,
    handlerId: `contract/${action.type}`,
    status: 'completed',
    startedAtMs: index,
    completedAtMs: index + 0.5,
    delta: {
      $schema: 'patch-map-semantic-observation-delta/1',
      caseId: plan.id,
      actionIndex: index,
      actionType: action.type,
      actual: shape.actuals[index],
      semanticProbe: shape.actuals[index]?.product
        ? requireRecord(shape.actuals[index]?.product, 'action product').semantic
        : null,
    },
  }));
  const finalProduct = requireRecord(shape.actuals.at(-1)?.product, 'final product');
  return {
    $schema: 'patch-map-contract-case-execution/1',
    caseId: plan.id,
    caseType: plan.caseType,
    status: 'completed',
    actionResults,
    captures: shape.captures,
    bindings: shape.bindings,
    eventJournal: [],
    eventJournalFailures: [],
    datasetObservations: {},
    hostSeamDelta: null,
    terminalSnapshot: structuredClone(requireRecord(finalProduct.snapshot, 'snapshot')),
    terminalSemanticProbe: structuredClone(requireRecord(finalProduct.semantic, 'semantic')),
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: [],
      errors: [],
      productResources: { retained: { logicalDatasetRootCount: 0 } },
    },
    error: null,
  };
}

function caseShape(caseId: string): Readonly<{
  actuals: JsonRecord[];
  captures: JsonRecord[];
  bindings: JsonRecord;
}> {
  switch (caseId) {
    case 'UPD-001':
      return stableTargetShape();
    case 'UPD-002':
      return partialMergeShape();
    case 'UPD-003':
      return replacementShape();
    case 'UPD-004':
      return geometryShape();
    case 'UPD-006':
      return missingTargetsShape();
    case 'UPD-007':
      return atomicBulkShape();
    case 'UPD-008':
      return componentShape();
    case 'UPD-009':
      return structureShape();
    case 'UPD-010':
      return relationShape();
    case 'UPD-011':
      return asyncRevisionShape();
    case 'UPD-012':
      return hostPresentationShape();
    case 'UPD-013':
      return liveOverlayShape();
    case 'UPD-014':
      return semanticRefreshShape();
    default:
      throw new Error(`Unsupported shape ${caseId}`);
  }
}

function stableTargetShape() {
  const dataset = [item('item-a', [bar(20)]), rect('rect-c', 220, 60)];
  const productValue = product(dataset, { lifecycleGeneration: 2, sceneRevision: 2 });
  const currentTarget = {
    ...bar(20),
    ownerId: 'item-a',
    lifecycleGeneration: 2,
    sceneRevision: 2,
  };
  return {
    actuals: [
      actual(productValue, { datasetRef: 'all-kinds-scene' }),
      actual(productValue, { target: { kind: 'component', ownerId: 'item-a', id: 'bar' } }),
      actual(productValue, { datasetRef: 'replacement-interactive-scene' }),
      actual(productValue, { currentTarget }),
      actual(productValue, {
        targetRef: 'oldBar',
        result: rejected('STALE_TARGET'),
        diagnostic: { code: 'STALE_TARGET' },
        before: structuredClone(productValue),
      }),
    ],
    captures: [capture('before', 'after-action', 3, {
      'currentTarget/size/height': 20,
    })],
    bindings: { oldBar: { target: { ...currentTarget } } },
  };
}

function partialMergeShape() {
  const sibling = text('label', 'Alpha');
  const dataset = [item('item-a', [bar(30), sibling]), rect('rect-b', 160, 40)];
  const productValue = product(dataset, { sceneRevision: 2 });
  return {
    actuals: [
      actual(productValue, {
        patchId: 'height',
        patch: { size: { height: 30 } },
        frozen: true,
      }),
      actual(productValue, {
        result: committed([{ kind: 'component', ownerId: 'item-a', id: 'bar' }]),
        revisionDelta: 1,
        events: { change: [{}], frame: [] },
        record: bar(30),
        siblings: [sibling],
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        result: unchanged([{ kind: 'component', ownerId: 'item-a', id: 'bar' }]),
        revisionDelta: 0,
        events: { change: [], frame: [] },
        record: bar(30),
        siblings: [sibling],
        before: structuredClone(productValue),
      }),
    ],
    captures: [capture('before', 'before-actions', -1, {
      siblings: [sibling],
      'target/size/width': 60,
      'target/source': { type: 'rect', fill: '#00aa66' },
    })],
    bindings: {},
  };
}

function replacementShape() {
  const rectangle = { type: 'rect', id: 'rect-b', size: { width: 60, height: 20 }, fill: '#00ff00' };
  const replacement = { type: 'text', id: 'rect-b', text: 'Replaced', size: { width: 60, height: 20 } };
  const rectangleProduct = product([rectangle], { sceneRevision: 2 });
  const replacementProduct = product([replacement], { sceneRevision: 3 });
  return {
    actuals: [
      actual(rectangleProduct, { record: rectangle, result: committed([{ kind: 'element', id: 'rect-b' }]) }),
      actual(replacementProduct, { record: replacement, result: committed([{ kind: 'element', id: 'rect-b' }]) }),
      actual(replacementProduct, {
        record: replacement,
        result: rejected('INVALID_RECORD_KIND'),
        publicationCount: 0,
        before: structuredClone(replacementProduct),
      }),
    ],
    captures: [capture('afterRect', 'after-action', 0, { id: 'rect-b' })],
    bindings: {},
  };
}

function geometryShape() {
  const absolute = rect('rect-b', 200, 100);
  const relative = { ...rect('rect-b', 210, 95), attrs: { x: 210, y: 95, angle: 45 } };
  const resized = {
    ...relative,
    size: { width: 80, height: 50 },
    attrs: { x: 202.9289321881, y: 73.7867965644, angle: 45 },
  };
  const center = [213.5355339059, 119.7487373415];
  const absoluteProduct = product([absolute], { sceneRevision: 2 });
  const relativeProduct = product([relative], {
    sceneRevision: 3,
    geometry: geometry('rect-b', [210, 95, 40, 30], center),
  });
  const resizedProduct = product([resized], {
    sceneRevision: 4,
    frameRevision: 4,
    geometry: geometry('rect-b', [200, 100, 80, 50], center, [200, 100, 80, 50]),
    relations: relations([], []),
  });
  return {
    actuals: [
      actual(absoluteProduct, { record: absolute, result: committed([{ kind: 'element', id: 'rect-b' }]) }),
      actual(relativeProduct, { record: relative, result: committed([{ kind: 'element', id: 'rect-b' }]) }),
      actual(resizedProduct, {
        record: resized,
        result: committed([{ kind: 'element', id: 'rect-b' }]),
        targetId: 'rect-b',
        before: relativeProduct,
        centerBefore: center,
        centerAfter: center,
        worldBounds: [200, 100, 80, 50],
        hit: { id: 'rect-b' },
      }),
    ],
    captures: [capture('target', 'after-action', 2, {
      worldBounds: [200, 100, 80, 50],
    })],
    bindings: {},
  };
}

function missingTargetsShape() {
  const dataset = [rect('rect-b', 180, 40)];
  const productValue = product(dataset, { sceneRevision: 2 });
  return {
    actuals: [
      actual(productValue, {
        targets: ['missing'],
        result: committed([], [{ kind: 'element', id: 'missing' }]),
        revisionDelta: 0,
        events: { change: [], frame: [] },
        records: { missing: null },
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        targets: ['rect-b', 'missing'],
        result: committed(
          [{ kind: 'element', id: 'rect-b' }],
          [{ kind: 'element', id: 'missing' }],
        ),
        revisionDelta: 1,
        events: { change: [{}], frame: [] },
        records: { 'rect-b': rect('rect-b', 180, 40), missing: null },
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        targets: [],
        result: unchanged([]),
        revisionDelta: 0,
        events: { change: [], frame: [] },
        records: {},
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        targets: ['rect-b', 'missing'],
        result: rejected('MISSING_TARGET'),
        revisionDelta: 0,
        events: { change: [], frame: [] },
        records: { 'rect-b': rect('rect-b', 180, 40), missing: null },
        before: structuredClone(productValue),
      }),
    ],
    captures: [capture('before', 'after-action', 2, {
      'strictMixed/rect-b/x': 180,
    })],
    bindings: {},
  };
}

function atomicBulkShape() {
  const dataset = [rect('node-0', 10, 10)];
  const productValue = product(dataset, {
    sceneRevision: 2,
    frameRevision: 1,
    semanticHash: 'sha256:bulk-scene',
    historyDepth: 1,
  });
  return {
    actuals: [
      actual(productValue, { size: 1000, seed: 319, datasetRef: 'synthetic:1000:319' }),
      actual(productValue, {
        targets: ['node-0'],
        result: committed([{ kind: 'element', id: 'node-0' }], [], 1),
        revisionDelta: 1,
        intermediatePublicationCount: 0,
        queryRevision: 2,
        eventRevision: 2,
        events: { change: [{ revisions: { sceneRevision: 2 } }], frame: [] },
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        timeMs: 16.666667,
        result: { status: 'published', frameRevision: 1 },
        queryRevision: 2,
        eventRevision: 2,
      }),
      actual(productValue, {
        targets: ['node-0', 'missing'],
        result: rejected('MISSING_TARGET'),
        revisionDelta: 0,
        events: { change: [], frame: [] },
        before: structuredClone(productValue),
      }),
    ],
    captures: [
      capture('valid', 'after-action', 2, { frameRevision: 1 }),
      capture('before', 'after-action', 2, { 'invalid/scene': 'sha256:bulk-scene' }),
    ],
    bindings: {},
  };
}

function componentShape() {
  const initial = [
    background('bg'),
    bar(10),
    { type: 'icon', id: 'icon', src: 'fixture://icon' },
    text('label', 'Alpha'),
    { ...text('hidden-label', 'Hidden'), show: false },
  ];
  const next = [text('label', 'Alpha'), bar(10), background('bg'), text('status', 'Ready')];
  const initialProduct = product([item('item-a', initial)], { sceneRevision: 1 });
  const finalProduct = product([item('item-a', next)], { sceneRevision: 4 });
  return {
    actuals: [
      actual(initialProduct, { source: { ownerId: 'item-a', id: 'bar' }, binding: { bar: { id: 'bar' } } }),
      actual(finalProduct, {
        ownerId: 'item-a',
        components: { order: ['label', 'bar', 'bg', 'status'] },
        removed: {
          icon: {
            resources: {
              before: { canvasCount: 1, subscriptionCount: 0, pendingWork: 0 },
              after: { canvasCount: 1, subscriptionCount: 0, pendingWork: 0 },
              retainedDelta: 0,
            },
            eventCallbacks: 0,
          },
        },
        retainedDelta: 0,
        result: committed([{ kind: 'element', id: 'item-a' }]),
        before: initialProduct,
      }),
      actual(finalProduct, {
        componentVisual: { logicalCount: 1, renderObjectCount: 0 },
        currentTarget: { id: 'bar' },
        components: { order: ['label', 'bar', 'bg', 'status'] },
        result: committed([{ kind: 'component', ownerId: 'item-a', id: 'bar' }]),
        before: finalProduct,
      }),
      actual(finalProduct, {
        componentVisual: { logicalCount: 1, renderObjectCount: 1 },
        currentTarget: { id: 'bar' },
        components: { order: ['label', 'bar', 'bg', 'status'] },
        result: committed([{ kind: 'component', ownerId: 'item-a', id: 'bar' }]),
        before: finalProduct,
      }),
    ],
    captures: [],
    bindings: { initial: { bar: { id: 'bar' } } },
  };
}

function structureShape() {
  const dataset = [
    { type: 'group', id: 'group-b', children: [rect('rect-b', -80, 40)] },
    { type: 'relations', id: 'links', links: [] },
  ];
  const loaded = product(dataset, { sceneRevision: 1, historyDepth: 0 });
  const selected = product(dataset, {
    sceneRevision: 1,
    historyDepth: 0,
    selectionIds: ['rect-b'],
  });
  const moved = product(dataset, {
    sceneRevision: 2,
    historyDepth: 1,
    selectionIds: ['rect-b'],
    relations: relations([], []),
  });
  const grouped = product(dataset, {
    sceneRevision: 3,
    historyDepth: 2,
    selectionIds: ['group-c'],
    relations: relations([], []),
  });
  const ungrouped = product(dataset, {
    sceneRevision: 4,
    historyDepth: 3,
    selectionIds: ['rect-b'],
    relations: relations([], []),
  });
  const finalProduct = product(dataset, {
    sceneRevision: 5,
    historyDepth: 3,
    selectionIds: ['rect-b'],
    relations: relations([], []),
  });
  return {
    actuals: [
      actual(loaded, { datasetRef: 'all-kinds-scene' }),
      actual(selected, { selectionIds: ['rect-b'], result: { status: 'selected' } }),
      actual(moved, {
        hierarchy: { parentId: 'group-b', worldPosition: [160, 40] },
        result: committed([{ kind: 'element', id: 'rect-b' }]),
        revisionDelta: 1,
        events: { change: [{}], frame: [] },
        before: selected,
      }),
      actual(grouped, {
        hierarchy: { 'rect-b': { parentId: 'group-c', worldPosition: [160, 40] } },
        selectionIds: ['group-c'],
        result: committed([{ kind: 'element', id: 'rect-b' }]),
        revisionDelta: 1,
        events: { change: [{}], frame: [] },
        before: moved,
      }),
      actual(ungrouped, {
        hierarchy: { parentId: 'group-b', worldPosition: [160, 40] },
        selectionIds: ['rect-b'],
        result: committed([{ kind: 'element', id: 'group-c' }]),
        revisionDelta: 1,
        events: { change: [{}], frame: [] },
        before: grouped,
      }),
      actual(finalProduct, {
        hierarchy: { parentId: 'group-b', worldPosition: [0, 0] },
        result: {
          status: 'committed',
          history: { recorded: false, depthDelta: 0, state: { undoDepth: 3, redoDepth: 0 } },
        },
        revisionDelta: 1,
        events: { change: [{}], frame: [] },
        before: ungrouped,
      }),
      actual(finalProduct, {
        hierarchy: { parentId: null, worldPosition: [240, 0] },
        result: rejected('CONFLICT'),
        diagnostic: { code: 'CONFLICT', category: 'CONFLICT' },
        revisionDelta: 0,
        events: { change: [], frame: [] },
        before: structuredClone(finalProduct),
      }),
    ],
    captures: [],
    bindings: {},
  };
}

function relationShape() {
  const movedRows = [
    relation('a>a', 'a', 'a', [10, 10], [10, 10], [10, 10, 0, 0]),
    relation('a>b', 'a', 'b', [10, 10], [150, 70], [10, 10, 140, 60]),
    relation('b>a', 'b', 'a', [150, 70], [10, 10], [10, 10, 140, 60]),
  ];
  const hiddenRows = movedRows.map((row) => ({
    ...row,
    visible: row.key === 'a>a',
  }));
  const removedRows = [movedRows[0]];
  const relationDataset = [rect('a', 0, 0), rect('b', 140, 60), {
    type: 'relations',
    id: 'links',
    links: [
      { source: 'a', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ],
  }];
  const movedProduct = product(relationDataset, {
    sceneRevision: 2,
    frameRevision: 2,
    relations: relations(movedRows, []),
  });
  const hiddenProduct = product(relationDataset, {
    sceneRevision: 3,
    frameRevision: 3,
    relations: relations(hiddenRows, []),
  });
  const shownProduct = product(relationDataset, {
    sceneRevision: 4,
    frameRevision: 4,
    relations: relations(movedRows, []),
  });
  const removedProduct = product([rect('a', 0, 0), relationDataset[2]], {
    sceneRevision: 5,
    frameRevision: 5,
    relations: relations(removedRows, [
      { id: 'links:1', relationId: 'links', key: 'a>b' },
      { id: 'links:2', relationId: 'links', key: 'b>a' },
    ]),
  });
  return {
    actuals: [
      actual(movedProduct, { datasetRef: 'relation-variants-scene' }),
      actual(movedProduct, { targetId: 'b', relationState: {}, before: movedProduct, result: committed([{ kind: 'element', id: 'b' }]) }),
      actual(hiddenProduct, { targetId: 'b', relationState: {}, before: movedProduct, result: committed([{ kind: 'element', id: 'b' }]) }),
      actual(shownProduct, { targetId: 'b', relationState: {}, before: hiddenProduct, result: committed([{ kind: 'element', id: 'b' }]) }),
      actual(removedProduct, { targetId: 'b', relationState: {}, before: shownProduct, result: committed([{ kind: 'element', id: 'b' }]) }),
    ],
    captures: [],
    bindings: {},
  };
}

function asyncRevisionShape() {
  const initialProduct = product([], { sceneRevision: 0, frameRevision: 0, historyDepth: 0 });
  const publishedProduct = product([rect('rect-b', 160, 40)], {
    sceneRevision: 1,
    frameRevision: 0,
    historyDepth: 0,
  });
  const started = (requestId: string, revision: number, allocated: number): JsonRecord => (
    actual(initialProduct, {
      requestId,
      revision,
      result: { status: 'started', requestId, revision },
      temporary: { allocated, released: 0, unreleased: allocated },
      before: structuredClone(initialProduct),
    })
  );
  return {
    actuals: [
      started('A', 2, 1),
      started('B', 3, 2),
      started('C', 4, 3),
      actual(initialProduct, {
        requestId: 'B',
        revision: 3,
        result: { status: 'superseded', requestId: 'B', sourceRevision: 3 },
        publicationEventDelta: 0,
        frameDelta: 0,
        published: { revisions: [], requestIds: [] },
        supersededEventCount: 0,
        postDestroy: { events: 0, frames: 0 },
        temporary: { allocated: 3, released: 1, unreleased: 2 },
      }),
      actual(publishedProduct, {
        requestId: 'C',
        revision: 4,
        result: { status: 'committed', requestId: 'C', sourceRevision: 4 },
        publicationEventDelta: 2,
        frameDelta: 0,
        published: { revisions: [4], requestIds: ['C'] },
        supersededEventCount: 0,
        postDestroy: { events: 0, frames: 0 },
        temporary: { allocated: 3, released: 2, unreleased: 1 },
      }),
      actual(publishedProduct, {
        result: { status: 'destroyed', returned: true },
        temporary: { allocated: 3, released: 2, unreleased: 1 },
        before: structuredClone(publishedProduct),
      }),
      actual(publishedProduct, {
        requestId: 'A',
        revision: 2,
        result: { status: 'superseded', requestId: 'A', sourceRevision: 2 },
        publicationEventDelta: 0,
        frameDelta: 0,
        published: { revisions: [4], requestIds: ['C'] },
        supersededEventCount: 0,
        postDestroy: { events: 0, frames: 0 },
        temporary: { allocated: 3, released: 3, unreleased: 0 },
      }),
    ],
    captures: [],
    bindings: {},
  };
}

function hostPresentationShape() {
  const elements = [
    item('item-a', [bar(10), text('label', 'Alpha')]),
    rect('rect-b', 160, 40),
    text('text-c', 'Bravo'),
  ];
  const links = [{
    type: 'relations',
    id: 'links',
    links: [{ source: 'item-a', target: 'rect-b' }],
  }];
  const productValue = product([...elements, ...links], {
    sceneRevision: 1,
    frameRevision: 2,
    historyDepth: 0,
  });
  const active = {
    schemaRevision: 'patch-map-presentation-policy/1',
    revision: 2,
    status: 'active',
    highlightIds: ['item-a', 'rect-b'],
    deEmphasisAlpha: 0.2,
    hiddenLayerIds: ['links'],
    entities: [
      presentationEntity('item-a', 1, true, 1),
      presentationEntity('rect-b', 1, true, 1),
      presentationEntity('text-c', 0.2, true, 1),
      presentationEntity('links', 0.2, false, 0),
    ],
  };
  const persisted = { elements, links };
  return {
    actuals: [
      actual(productValue, {
        presentation: {
          ...active,
          revision: 1,
          hiddenLayerIds: [],
          entities: active.entities.map((entity) => (
            entity.id === 'links' ? presentationEntity('links', 0.2, true, 1) : entity
          )),
        },
        result: { changed: true },
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        presentation: active,
        result: { changed: true },
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        presentation: {
          schemaRevision: 'patch-map-presentation-policy/1',
          revision: 3,
          status: 'normal',
          highlightIds: null,
          deEmphasisAlpha: 1,
          hiddenLayerIds: [],
          entities: active.entities.map((entity) => (
            presentationEntity(String(entity.id), 1, true, 1)
          )),
        },
        persisted,
        result: { changed: true },
        before: structuredClone(productValue),
      }),
    ],
    captures: [capture('before', 'before-actions', -1, {
      'persisted/elements': elements,
      'persisted/links': links,
    })],
    bindings: {},
  };
}

function liveOverlayShape() {
  const productValue = product([item('item-a', [bar(21), text('label', 'Overlay 319:13')])], {
    sceneRevision: 13,
    frameRevision: 1,
    historyDepth: 0,
  });
  const acceptedEvents = Array.from({ length: 12 }, (_, index) => ({
    sourceRevision: index + 2,
    payloadHash: `overlay-319-${index + 2}`,
    sceneRevision: index + 2,
  }));
  const latest = {
    sourceRevision: 13,
    payloadHash: 'overlay-319-13',
    sceneRevision: 13,
  };
  return {
    actuals: [
      actual(productValue, {
        result: { status: 'streamed', count: 12 },
        results: acceptedEvents.map((tuple) => ({ status: 'accepted', tuple })),
        acceptedEvents,
        overlay: {
          latestAccepted: latest,
          latestPublished: null,
          pendingPublicationCount: 1,
          acceptedCount: 12,
          publicationCount: 0,
        },
        before: structuredClone(productValue),
      }),
      actual(productValue, {
        result: { status: 'published', frameRevision: 1 },
        overlayBefore: {
          latestAccepted: latest,
          latestPublished: null,
          pendingPublicationCount: 1,
          acceptedCount: 12,
          publicationCount: 0,
        },
        overlay: {
          latestAccepted: latest,
          latestPublished: { ...latest, frameRevision: 1 },
          pendingPublicationCount: 0,
          acceptedCount: 12,
          publicationCount: 1,
        },
        publicationEvents: [{ ...latest, frameRevision: 1 }],
        before: structuredClone(productValue),
      }),
    ],
    captures: [],
    bindings: {},
  };
}

function semanticRefreshShape() {
  const dataset = [
    item('item-a', [bar(10), text('label', 'Alpha')]),
    rect('rect-b', 160, 40),
    {
      type: 'relations',
      id: 'links',
      links: [{ source: 'item-a', target: 'rect-b' }],
    },
  ];
  const beforeProduct = product(dataset, {
    sceneRevision: 1,
    frameRevision: 0,
    historyDepth: 0,
  });
  const refreshedProduct = product(dataset, {
    sceneRevision: 2,
    frameRevision: 1,
    historyDepth: 0,
  });
  const ids = ['item-a', 'item-a/bar', 'item-a/label', 'links', 'rect-b'];
  const beforeSnapshot = {
    scene: dataset,
    selection: [],
    history: { undoDepth: 0, redoDepth: 0 },
    ids,
  };
  return {
    actuals: [
      actual(beforeProduct, {
        result: { status: 'snapshotted' },
        snapshot: beforeSnapshot,
      }),
      actual(beforeProduct, {
        result: {
          changed: true,
          dependencyId: 'font-fixture',
          previousRevision: null,
          revision: 'font-fixture-2',
        },
        dependencies: { 'font-fixture': 'font-fixture-2' },
        before: structuredClone(beforeProduct),
      }),
      actual(refreshedProduct, {
        result: {
          status: 'committed',
          changed: true,
          previousRevisions: {
            lifecycleGeneration: 1,
            sceneRevision: 1,
            viewRevision: 0,
            interactionRevision: 0,
          },
          revisions: {
            lifecycleGeneration: 1,
            sceneRevision: 2,
            viewRevision: 0,
            interactionRevision: 0,
          },
          recomputedTargets: ['item-a/label', 'links'],
          missingTargets: [],
          dirtyRanges: [{ start: 0, end: 2 }],
          dataDiffCount: 0,
          history: { undoDepth: 0, redoDepth: 0 },
          selectionIds: [],
        },
        refreshEvents: [{}],
        ids,
        before: structuredClone(beforeProduct),
      }),
      actual(refreshedProduct, {
        result: { status: 'published', frameRevision: 1 },
        before: structuredClone(refreshedProduct),
      }),
    ],
    captures: [
      capture('before', 'after-action', 0, {
        history: beforeSnapshot.history,
        ids,
        selection: [],
      }),
      capture('refresh', 'after-action', 2, { revision: 2 }),
    ],
    bindings: {},
  };
}

function presentationEntity(
  id: string,
  emphasis: number,
  visible: boolean,
  renderObjectCount: number,
): JsonRecord {
  return { id, denseEntityIds: [id], emphasis, visible, renderObjectCount };
}

function actual(productValue: JsonRecord, fields: JsonRecord): JsonRecord {
  return {
    input: {
      beforeFingerprint: 'fnv1a64:unchanged',
      afterFingerprint: 'fnv1a64:unchanged',
      unchanged: true,
    },
    ...structuredClone(fields),
    product: structuredClone(productValue),
  };
}

function product(
  dataset: readonly unknown[],
  overrides: Readonly<{
    lifecycleGeneration?: number;
    sceneRevision?: number;
    frameRevision?: number;
    semanticHash?: string;
    historyDepth?: number;
    geometry?: JsonRecord;
    relations?: JsonRecord;
    selectionIds?: readonly string[];
  }> = {},
): JsonRecord {
  const sceneRevision = overrides.sceneRevision ?? 1;
  const frameRevision = overrides.frameRevision ?? sceneRevision;
  const historyDepth = overrides.historyDepth ?? Math.max(0, sceneRevision - 1);
  const selectionIds = [...(overrides.selectionIds ?? [])];
  const componentCount = dataset.reduce<number>((count, value) => {
    if (!isRecord(value) || !Array.isArray(value.components)) return count;
    return count + value.components.length;
  }, 0);
  const rootIds = dataset.flatMap((value) =>
    isRecord(value) && typeof value.id === 'string' ? [value.id] : []);
  const geometryValue = overrides.geometry ?? geometry(rootIds[0] ?? 'root', [0, 0, 10, 10], [5, 5]);
  return {
    snapshot: {
      lifecycle: 'ready',
      lifecycleGeneration: overrides.lifecycleGeneration ?? 1,
      revisions: {
        lifecycleGeneration: overrides.lifecycleGeneration ?? 1,
        sceneRevision,
        viewRevision: 0,
        interactionRevision: 0,
      },
      publishedTuple: { scene: sceneRevision, view: 0, interaction: 0 },
      frameRevision,
      datasetRef: null,
      semanticHash: overrides.semanticHash ?? `sha256:scene-${sceneRevision}`,
      rootIds,
      selectionIds,
      historyDepth,
      pendingWork: 0,
      resources: {
        canvasCount: 1,
        rendering: { commandCount: rootIds.length + componentCount, visiblePrimitiveCount: rootIds.length },
        subscriptions: { active: 0, duplicates: 0 },
      },
    },
    semantic: {
      revision: 'patch-map-semantic-product-probe/1',
      lifecycle: 'ready',
      dataset: { state: 'loaded', ref: null, semanticHash: overrides.semanticHash ?? `sha256:scene-${sceneRevision}`, rootIds, graphDeepFrozen: true },
      scene: {
        nodes: [],
        elementTypes: [],
        componentTypes: [],
        elementTypeCounts: [],
        componentTypeCounts: [],
        counts: {
          rootElements: dataset.length,
          elements: dataset.length,
          components: componentCount,
          hierarchyEdges: componentCount,
          maxDepth: componentCount > 0 ? 1 : 0,
          hiddenLogicalComponents: 0,
        },
      },
      geometry: { finiteValueCount: 4, nonFiniteValueCount: 0, allFinite: true },
      text: { sourceCount: 0, codeUnitCount: 0, sourcesWithUnpairedSurrogate: 0, unpairedSurrogateCount: 0 },
      paint: { intentCount: 0, resolvedCount: 0, unresolvedCount: 0, intents: [] },
      interaction: {
        mode: 'select',
        selectionIds,
        activeAnimationCount: 0,
        activeGestureCount: 0,
      },
      history: { depth: historyDepth },
    },
    dataset: {
      fingerprint: `fnv1a64:dataset-${sceneRevision}-${rootIds.join('-')}`,
      semanticHash: overrides.semanticHash ?? `sha256:scene-${sceneRevision}`,
      rootIds,
      rootCount: dataset.length,
    },
    geometry: structuredClone(geometryValue),
    relations: structuredClone(overrides.relations ?? relations([], [])),
    sceneImages: {},
    interactionOwnership: { rootBindingCount: 6, entityCallbackCount: 0 },
    history: { undoDepth: historyDepth, redoDepth: 0 },
    resources: { canvasCount: 1, pendingWork: 0, subscriptions: 0 },
  };
}

function geometry(
  id: string,
  worldBounds: readonly number[],
  visibleCenter: readonly number[],
  selectionBounds: readonly number[] | null = null,
): JsonRecord {
  return {
    revision: 1,
    surfaceRevision: 1,
    representedRevisions: { scene: 1, view: 0, interaction: 0 },
    revisionLags: { scene: 0, view: 0, interaction: 0 },
    entities: [{ id, kind: 'rect', worldBounds, screenBounds: worldBounds, visibleCenter, visible: true, interactive: true }],
    relations: [],
    omittedRelations: [],
    selectionOverlay: selectionBounds === null ? null : { screenBounds: selectionBounds },
  };
}

function relations(rows: readonly unknown[], omitted: readonly unknown[]): JsonRecord {
  return {
    revision: 1,
    surfaceRevision: 1,
    representedRevisions: { scene: 1, view: 0, interaction: 0 },
    revisionLags: { scene: 0, view: 0, interaction: 0 },
    relations: structuredClone(rows),
    omittedRelations: structuredClone(omitted),
  };
}

function relation(
  key: string,
  sourceId: string,
  targetId: string,
  start: readonly [number, number],
  end: readonly [number, number],
  worldBounds: readonly [number, number, number, number],
): JsonRecord {
  return {
    id: `links:${key}`,
    relationId: 'links',
    key,
    identityKey: key,
    sourceId,
    targetId,
    kind: sourceId === targetId ? 'polyline' : 'segment',
    worldEndpoints: [start, end],
    screenEndpoints: [start, end],
    worldBounds,
    screenBounds: worldBounds,
    visible: true,
  };
}

function capture(
  id: string,
  phase: string,
  afterActionIndex: number,
  values: JsonRecord,
): JsonRecord {
  return { id, phase, afterActionIndex, values: structuredClone(values) };
}

function committed(applied: unknown[], missing: unknown[] = [], depthDelta = 1): JsonRecord {
  return {
    status: 'committed',
    changed: true,
    applied,
    missing,
    unchanged: [],
    history: { recorded: true, depthDelta, state: { undoDepth: depthDelta, redoDepth: 0 } },
  };
}

function unchanged(targets: unknown[]): JsonRecord {
  return {
    status: 'unchanged',
    changed: false,
    applied: [],
    missing: [],
    unchanged: targets,
    history: { recorded: false, depthDelta: 0, state: { undoDepth: 0, redoDepth: 0 } },
  };
}

function rejected(code: string): JsonRecord {
  return {
    status: 'rejected',
    changed: false,
    applied: [],
    missing: code === 'MISSING_TARGET' ? [{ kind: 'element', id: 'missing' }] : [],
    unchanged: [],
    transactionDiagnostic: { code, category: 'INVALID_INPUT', operationIndex: 0 },
    history: { recorded: false, depthDelta: 0, state: { undoDepth: 0, redoDepth: 0 } },
  };
}

function item(id: string, components: readonly unknown[]): JsonRecord {
  return { type: 'item', id, size: { width: 100, height: 80 }, attrs: { x: 10, y: 20 }, components };
}

function rect(id: string, x: number, y: number): JsonRecord {
  return { type: 'rect', id, size: { width: 40, height: 30 }, attrs: { x, y } };
}

function bar(height: number): JsonRecord {
  return {
    type: 'bar',
    id: 'bar',
    source: { type: 'rect', fill: '#00aa66' },
    size: { width: 60, height },
    placement: 'bottom',
  };
}

function text(id: string, value: string): JsonRecord {
  return { type: 'text', id, text: value, placement: 'center' };
}

function background(id: string): JsonRecord {
  return { type: 'background', id, source: { type: 'rect', fill: '#336699' } };
}

function actionActual(execution: JsonRecord, index: number): JsonRecord {
  const action = requireRecord(requireArray(execution.actionResults, 'actions')[index], 'action');
  const delta = requireRecord(action.delta, 'delta');
  return requireRecord(delta.actual, 'actual');
}

function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    const record = requireRecord(current, path);
    if (!Object.hasOwn(record, segment)) throw new Error(`Missing ${path}`);
    return record[segment];
  }, value);
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
