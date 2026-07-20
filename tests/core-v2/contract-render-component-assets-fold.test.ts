import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

type JsonRecord = Record<string, unknown>;
type CaseId = 'REN-008' | 'REN-010';

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
  readonly fixtureSha256: string;
  readonly rootTestId: string;
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
  readonly RENDER_COMPONENT_ASSETS_FOLD_REVISION: string;
  foldRenderComponentAssetExecution(
    this: void,
    options: Readonly<{
      casePlan: MaterializedCase;
      execution: JsonRecord;
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
    readonly failure: Readonly<{ readonly code: string }> | null;
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

const [catalogRuntime, materializeRuntime, foldRuntime, compareRuntime] = await Promise.all([
  loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
  loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
  loadRuntime<FoldRuntime>(
    '../../scripts/verification/core-v2-contract/fold-render-component-assets.mjs',
  ),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { RENDER_COMPONENT_ASSETS_FOLD_REVISION, foldRenderComponentAssetExecution } = foldRuntime;
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

describe('Core v2 REN-008 / REN-010 component-asset actual-only fold', () => {
  it('is import-free, browser-safe, expected-blind, and revisioned', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-render-component-assets.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_COMPONENT_ASSETS_FOLD_REVISION)
      .toBe('core-v2-render-component-assets-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/\.expected\b/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it.each(['REN-008', 'REN-010'] as const)(
    'projects %s into fourteen deeply frozen product-derived domains',
    (caseId) => {
      const folded = fold(caseId, createExecution(caseId));

      expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
      for (const domain of DOMAIN_NAMES) expect(folded.actual[domain]).toBeTypeOf('object');
      expect(folded.actual).toMatchObject({
        $schema: 'core-v2-semantic-observation/1',
        case: { id: caseId, caseType: 'capability' },
        geometry: { finiteValueCount: 12 },
        paint: { commandCount: 3 },
        resources: {
          retainedDelta: {
            executor: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
          },
        },
      });
      if (caseId === 'REN-008') {
        expect(folded.actual).toMatchObject({
          scene: {
            hidden: { renderObjectCount: 0 },
            shown: { id: 'bg' },
          },
          paint: {
            background: {
              data: { size: [20, 10] },
              visibleBounds: [0, 0, 100, 80],
              source: 'fixture-image',
              staleTextureCount: 0,
            },
          },
        });
        expect(folded.captures).toEqual({ initial: { id: 'bg' } });
      } else {
        expect(folded.actual).toMatchObject({
          paint: {
            icon: {
              bounds: { width: 40, height: 15, right: 87, top: 12 },
              source: 'fixture-icon-2',
              tint: '#00ff00ff',
              staleTextureCount: 0,
            },
          },
        });
        expect(folded.captures).toEqual({});
      }
      expect(zeroTreeLeaves(valueAtRecord(folded.actual, ['resources', 'retainedDelta'])))
        .toSatisfy((values: unknown[]) => values.length > 0 && values.every((value) => value === 0));
      expect(Object.isFrozen(folded)).toBe(true);
      expect(Object.isFrozen(folded.actual)).toBe(true);
      expect(Object.isFrozen(folded.fixtures)).toBe(true);
      expect(Object.isFrozen(folded.captures)).toBe(true);
    },
  );

  it('passes all 21 approved assertions with no new parent overlap or comparator conflict', () => {
    let total = 0;
    for (const caseId of ['REN-008', 'REN-010'] as const) {
      const expected = approvedExpectedCase(caseId);
      const folded = fold(caseId, createExecution(caseId));
      const comparison = compareObservation({
        expectedCase: expected,
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      });
      total += expected.expected.assertions.length;
      expect(comparison).toMatchObject({
        passed: caseId === 'REN-008' ? 10 : 11,
        failed: 0,
      });
      expect(comparison.assertions.every(({ passed, failure }) => passed && failure === null))
        .toBe(true);
      expect(parentChildOverlaps(expected.expected.assertions.map(({ path }) => path))).toEqual([]);
    }
    expect(total).toBe(21);
  });

  it('lets the independent comparator expose internally consistent background and icon mutations', () => {
    const backgroundExecution = createExecution('REN-008');
    mutateTerminalBounds(backgroundExecution, 'REN-008', [0, 0, 99, 80]);
    const backgroundFold = fold('REN-008', backgroundExecution);
    const backgroundComparison = compareObservation({
      expectedCase: approvedExpectedCase('REN-008'),
      actual: backgroundFold.actual,
      fixtures: backgroundFold.fixtures,
      captures: backgroundFold.captures,
    });
    expect(failedPaths(backgroundComparison)).toEqual(['/paint/background/visibleBounds']);

    const iconExecution = createExecution('REN-010');
    mutateTerminalBounds(iconExecution, 'REN-010', [48, 12, 40, 15]);
    const iconFold = fold('REN-010', iconExecution);
    const iconComparison = compareObservation({
      expectedCase: approvedExpectedCase('REN-010'),
      actual: iconFold.actual,
      fixtures: iconFold.fixtures,
      captures: iconFold.captures,
    });
    expect(failedPaths(iconComparison)).toEqual(['/paint/icon/bounds/right']);
  });

  it('fails closed on missing authored facts, source disagreement, hidden objects, and tint disagreement', () => {
    const missingSize = createExecution('REN-008');
    const initial = productAt(missingSize, 0, 'product');
    delete requireRecord(requireRecord(initial.component, 'component').semantic, 'semantic').authoredSize;
    expect(() => fold('REN-008', missingSize)).toThrow(/authored size cross-link/u);

    const sourceDrift = createExecution('REN-008');
    const sourceTerminal = productAt(sourceDrift, 3, 'after');
    requireRecord(
      requireRecord(sourceTerminal.component, 'component').sceneImage,
      'scene image',
    ).authoredSource = 'wrong-source';
    expect(() => fold('REN-008', sourceDrift)).toThrow(/image source cross-link/u);

    const hiddenObject = createExecution('REN-008');
    const hidden = productAt(hiddenObject, 2, 'after');
    const hiddenComponent = requireRecord(hidden.component, 'hidden component');
    requireRecord(hiddenComponent.sceneImage, 'hidden image').renderObjectCount = 1;
    requireRecord(hiddenComponent.rendererPaint, 'hidden paint').renderObjectCount = 1;
    const hiddenImages = requireRecord(requireRecord(hidden.imageProbe, 'image probe').images, 'images');
    requireRecord(hiddenImages['item::background:bg'], 'global image').renderObjectCount = 1;
    const showBefore = productAt(hiddenObject, 3, 'before');
    const showBeforeComponent = requireRecord(showBefore.component, 'show before component');
    requireRecord(showBeforeComponent.sceneImage, 'show before image').renderObjectCount = 1;
    requireRecord(showBeforeComponent.rendererPaint, 'show before paint').renderObjectCount = 1;
    const showBeforeImages = requireRecord(
      requireRecord(showBefore.imageProbe, 'show before image probe').images,
      'show before images',
    );
    requireRecord(showBeforeImages['item::background:bg'], 'show before global image')
      .renderObjectCount = 1;
    expect(() => fold('REN-008', hiddenObject)).toThrow(/hidden renderer drain/u);

    const tintDrift = createExecution('REN-010');
    const tinted = productAt(tintDrift, 2, 'after');
    requireRecord(requireRecord(tinted.component, 'component').rendererPaint, 'paint').rgbTint = 1;
    expect(() => fold('REN-010', tintDrift)).toThrow(/RGB tint agreement/u);
  });

  it('rejects unstable owner-qualified identity and non-finite product geometry', () => {
    const identityDrift = createExecution('REN-010');
    const terminal = productAt(identityDrift, 2, 'after');
    rewriteProductEntityIdentity(terminal, 'item-a::icon:nearby');
    expect(() => fold('REN-010', identityDrift)).toThrow(/component identity entity ID/u);

    const nonFinite = createExecution('REN-010');
    const nonFiniteTerminal = productAt(nonFinite, 2, 'after');
    const component = requireRecord(nonFiniteTerminal.component, 'component');
    const geometry = requireRecord(component.geometry, 'geometry');
    const bounds = requireArray(geometry.worldBounds, 'world bounds');
    bounds[0] = Number.NaN;
    expect(() => fold('REN-010', nonFinite)).toThrow(/non-finite number/u);
  });

  it('enforces exact REN-008 capture ownership and forbids any REN-010 capture', () => {
    const wrongCapture = createExecution('REN-008');
    requireRecord(requireArray(wrongCapture.captures, 'captures')[0], 'capture').afterActionIndex = 1;
    expect(() => fold('REN-008', wrongCapture)).toThrow(/capture action/u);

    const extraCapture = createExecution('REN-010');
    extraCapture.captures = [{
      id: 'initial',
      phase: 'after-action',
      afterActionIndex: 0,
      values: { id: 'icon' },
    }];
    expect(() => fold('REN-010', extraCapture)).toThrow(/capture count/u);
  });

  it('rejects retained runtime, backend, controller, renderer, and executor resources', () => {
    const drifts: readonly Readonly<{
      mutate(execution: JsonRecord): void;
      error: RegExp;
    }>[] = [
      {
        mutate(execution) {
          cleanupCounts(execution, 'runtimeCounts').leaseCount = 1;
        },
        error: /runtimeCounts leaseCount drain/u,
      },
      {
        mutate(execution) {
          cleanupCounts(execution, 'runtimeCounts').rendererObjectCount = 1;
        },
        error: /runtimeCounts rendererObjectCount drain/u,
      },
      {
        mutate(execution) {
          cleanupCounts(execution, 'backendCounts').resolvedLiveResourceCount = 1;
        },
        error: /backendCounts resolvedLiveResourceCount drain/u,
      },
      {
        mutate(execution) {
          cleanupCounts(execution, 'controllerCounts').pendingReleaseCount = 1;
        },
        error: /controllerCounts pendingReleaseCount drain/u,
      },
      {
        mutate(execution) {
          const cleanup = requireRecord(execution.cleanup, 'cleanup');
          const release = requireRecord(requireArray(cleanup.releases, 'releases')[0], 'release');
          requireRecord(release.remainingResources, 'remaining').pendingWork = 1;
        },
        error: /cleanup pendingWork drain/u,
      },
      {
        mutate(execution) {
          delete cleanupCounts(execution, 'controllerCounts').bindingCount;
        },
        error: /controllerCounts keys/u,
      },
    ];

    for (const drift of drifts) {
      const execution = createExecution('REN-010');
      drift.mutate(execution);
      expect(() => fold('REN-010', execution)).toThrow(drift.error);
    }
  });

  it('rejects a cleanup journal that is not linked to the terminal product journal', () => {
    const execution = createExecution('REN-008');
    const cleanup = requireRecord(execution.cleanup, 'cleanup');
    const product = requireRecord(cleanup.productResources, 'product cleanup');
    const journal = requireArray(product.journal, 'cleanup journal');
    requireRecord(journal[0], 'cleanup journal entry').event = 'mutated';
    expect(() => fold('REN-008', execution)).toThrow(/cleanup journal extends/u);
  });
});

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

function selectedCase(caseId: CaseId): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!selected) throw new Error(`Missing approved ${caseId} case`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

function approvedExpectedCase(caseId: CaseId): ExpectedCase {
  const record = (normalizedExpectedCatalog.cases as unknown as readonly ExpectedCase[])
    .find(({ id }) => id === caseId);
  if (!record) throw new Error(`Missing approved ${caseId} expected record`);
  return record;
}

function fold(caseId: CaseId, execution: JsonRecord): FoldResult {
  return foldRenderComponentAssetExecution({
    casePlan: selectedCase(caseId),
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

function createExecution(caseId: CaseId): JsonRecord {
  const products = caseId === 'REN-008'
    ? [
        product(caseId, {
          revision: 1,
          frameRevision: 1,
          source: rectSource(),
          show: true,
          generation: 0,
          journalLength: 2,
        }),
        product(caseId, {
          revision: 2,
          frameRevision: 2,
          source: 'fixture-image',
          show: true,
          generation: 1,
          journalLength: 4,
        }),
        product(caseId, {
          revision: 3,
          frameRevision: 3,
          source: 'fixture-image',
          show: false,
          generation: 1,
          journalLength: 6,
        }),
        product(caseId, {
          revision: 4,
          frameRevision: 4,
          source: 'fixture-image',
          show: true,
          generation: 1,
          journalLength: 8,
        }),
      ]
    : [
        product(caseId, {
          revision: 1,
          frameRevision: 1,
          source: 'fixture-icon',
          show: true,
          generation: 1,
          journalLength: 2,
        }),
        product(caseId, {
          revision: 2,
          frameRevision: 2,
          source: 'fixture-icon-2',
          show: true,
          generation: 2,
          journalLength: 4,
        }),
        product(caseId, {
          revision: 3,
          frameRevision: 3,
          source: 'fixture-icon-2',
          show: true,
          generation: 2,
          tint: '#00ff00ff',
          journalLength: 5,
        }),
      ];
  const actionTypes = caseId === 'REN-008'
    ? ['loadDataset', 'replaceComponentSource', 'setComponentVisibility', 'setComponentVisibility']
    : ['loadDataset', 'replaceSource', 'patch'];
  const actuals = caseId === 'REN-008'
    ? [
        loadActual(caseId, products[0]),
        mutationActual(caseId, products[0], products[1], {
          source: 'fixture-image',
          timeMs: 20,
          settlement: { settled: true, call: 2 },
        }),
        mutationActual(caseId, products[1], products[2], { show: false }),
        mutationActual(caseId, products[2], products[3], {
          show: true,
          settlement: { settled: true, call: 3 },
        }),
      ]
    : [
        loadActual(caseId, products[0]),
        mutationActual(caseId, products[0], products[1], {
          source: 'fixture-icon-2',
          timeMs: 20,
          settlement: { settled: true, call: 2 },
        }),
        mutationActual(caseId, products[1], products[2], {
          changes: { tint: '#00ff00ff' },
        }),
      ];
  const times = caseId === 'REN-008' ? [0, 20, 20, 20] : [0, 20, 20];
  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId,
    caseType: 'capability',
    status: 'completed',
    actionResults: actionTypes.map((type, index) => ({
      index,
      type,
      handlerId: `contract/${type}`,
      status: 'completed',
      startedAtMs: times[index],
      completedAtMs: times[index],
      delta: {
        $schema: 'core-v2-semantic-observation-delta/1',
        caseId,
        actionIndex: index,
        actionType: type,
        actual: actuals[index],
        semanticProbe: structuredClone(products.at(-1)?.semanticProbe),
      },
    })),
    captures: caseId === 'REN-008'
      ? [{
          id: 'initial',
          phase: 'after-action',
          afterActionIndex: 0,
          values: { id: 'bg' },
        }]
      : [],
    bindings: {},
    eventJournal: [],
    eventJournalFailures: [],
    datasetObservations: {},
    hostSeamDelta: null,
    terminalSnapshot: structuredClone(products.at(-1)?.snapshot),
    terminalSemanticProbe: structuredClone(products.at(-1)?.semanticProbe),
    cleanup: cleanup(caseId, products.at(-1)),
    error: null,
  };
}

function loadActual(caseId: CaseId, value: JsonRecord | undefined): JsonRecord {
  const productValue = requireRecord(value, 'load product');
  return {
    caseId,
    datasetId: caseId === 'REN-008' ? 'background' : 'icon',
    target: actionTarget(caseId),
    registration: {
      registeredAliases: caseId === 'REN-008'
        ? ['fixture-image']
        : ['fixture-icon', 'fixture-icon-2'],
    },
    settlement: { settled: true, call: 1 },
    loaded: { status: 'committed', entityCount: 1 },
    input: inputEvidence(),
    product: structuredClone(productValue),
  };
}

function mutationActual(
  caseId: CaseId,
  before: JsonRecord | undefined,
  after: JsonRecord | undefined,
  fields: JsonRecord,
): JsonRecord {
  return {
    target: actionTarget(caseId),
    ...structuredClone(fields),
    mutation: { status: 'committed', changed: true },
    input: inputEvidence(),
    before: structuredClone(requireRecord(before, 'mutation before')),
    after: structuredClone(requireRecord(after, 'mutation after')),
  };
}

function product(
  caseId: CaseId,
  options: Readonly<{
    revision: number;
    frameRevision: number;
    source: unknown;
    show: boolean;
    generation: number;
    tint?: string;
    journalLength: number;
  }>,
): JsonRecord {
  const ownerId = caseId === 'REN-008' ? 'item' : 'item-a';
  const componentId = caseId === 'REN-008' ? 'bg' : 'icon';
  const componentType = caseId === 'REN-008' ? 'background' : 'icon';
  const entityId = `${ownerId}::${componentType}:${componentId}`;
  const isImage = typeof options.source === 'string';
  const bounds = caseId === 'REN-008' ? [0, 0, 100, 80] : [47, 12, 40, 15];
  const visibleBounds = options.show ? [...bounds] : null;
  const renderRole = caseId === 'REN-008'
    ? (isImage ? 'background-asset' : 'background-geometry')
    : 'content-asset';
  const laneRole = renderRole === 'background-asset'
    ? 'background-assets'
    : renderRole === 'content-asset'
      ? 'content-assets'
      : 'background-geometry';
  const packedTint = options.tint
    ? Number.parseInt(options.tint.slice(1), 16) >>> 0
    : 0xffff_ffff;
  const image = isImage
    ? {
        entityId,
        active: options.show,
        generation: options.generation,
        authoredSource: options.source,
        sourceKind: 'alias',
        dimensionMode: 'authored',
        bindingKey: `alias:${String(options.source)}:generation:${options.generation}`,
        sourceCacheIdentity: `alias:${String(options.source)}`,
        state: 'resolved',
        attachmentState: 'current',
        cacheIdentity: `alias:${String(options.source)}`,
        normalizedResourceIdentity: `${String(options.source)}@1`,
        naturalSize: [16, 16],
        reusedResolvedResource: false,
        renderObjectCount: options.show ? 1 : 0,
        placeholderCount: 0,
        bindingConsumerCount: options.show ? 1 : 0,
        role: options.show ? 'image' : 'none',
        rendererGeneration: options.generation,
        staleAttachCount: 0,
        staleCompletionCount: 0,
        diagnosticCount: 0,
        attempts: [],
      }
    : null;
  const semantic = {
    target: { kind: 'component', ownerId, id: componentId },
    ownerId,
    componentId,
    componentType,
    authoredSize: caseId === 'REN-008'
      ? { width: 20, height: 10 }
      : { width: '50%', height: '25%' },
    source: structuredClone(options.source),
    tint: options.tint ?? null,
    show: options.show,
  };
  const geometry = {
    localBounds: [...bounds],
    worldBounds: [...bounds],
    visibleBounds,
    visible: options.show,
    interactive: options.show,
  };
  const component = {
    target: { ownerId, componentId },
    semantic,
    entityId,
    logicalIdentity: `component:${ownerId}:${componentId}`,
    componentType,
    renderRole,
    entityKind: isImage ? 'image' : 'rect',
    geometry,
    sceneImage: image,
    rendererPaint: {
      entityId,
      lane: laneRole,
      rendererKind: isImage && options.show ? 'sprite' : isImage ? 'none' : 'graphics',
      primitiveCount: options.show ? 1 : 0,
      renderObjectCount: options.show ? 1 : 0,
      packedTint,
      rgbTint: packedTint >>> 8,
      alpha: (packedTint & 0xff) / 0xff,
    },
    renderLanes: renderLanes(),
    revisions: {
      lifecycleGeneration: 1,
      sceneRevision: options.revision,
      viewRevision: 0,
      interactionRevision: 0,
    },
    availability: {
      semantic: true,
      surface: true,
      rendererPaint: true,
      renderLanes: true,
    },
  };
  const journal = resourceJournal(options.journalLength);
  return {
    snapshot: {
      lifecycle: 'scene-ready',
      revisions: {
        sceneRevision: options.revision,
        viewRevision: 0,
        interactionRevision: 0,
      },
      frameRevision: options.frameRevision,
      publishedTuple: {
        sceneRevision: options.revision,
        viewRevision: 0,
        interactionRevision: 0,
        frameRevision: options.frameRevision,
      },
      resources: {
        canvasCount: 1,
        subscriptions: { active: 6 },
        rendering: { commandCount: 3 },
      },
      pendingWork: 0,
    },
    semanticProbe: {
      lifecycle: 'scene-ready',
      geometry: { finiteValueCount: 12 },
      history: { depth: 0 },
    },
    geometry: {
      revision: options.revision,
      revisionLag: 0,
      entities: [{
        id: entityId,
        kind: isImage ? 'image' : 'rect',
        worldBounds: [...bounds],
        visibleBounds,
        visible: options.show,
        interactive: options.show,
      }],
      relations: [],
      selectionOverlay: null,
    },
    imageProbe: { images: image ? { [entityId]: structuredClone(image) } : {} },
    dataset: dataset(caseId, options.source, options.show, options.tint),
    component,
    resources: {
      revision: 'core-v2-component-assets-resource-probe/1',
      caseId,
      counts: {
        canvasCount: 1,
        subscriptionCount: 6,
        pendingWorkCount: 0,
        bindingCount: isImage ? 1 : 0,
        resourceCount: isImage ? 1 : 0,
        leaseCount: isImage ? 1 : 0,
        pendingSettlementCount: 0,
        pendingReleaseCount: 0,
        staleAttachmentCount: 0,
        rendererObjectCount: isImage && options.show ? 1 : 0,
        cleanupFailureCount: 0,
      },
      journal,
    },
  };
}

function cleanup(caseId: CaseId, terminalValue: JsonRecord | undefined): JsonRecord {
  const terminal = requireRecord(terminalValue, 'cleanup terminal product');
  const resources = requireRecord(terminal.resources, 'terminal resources');
  const journal = structuredClone(requireArray(resources.journal, 'terminal journal'));
  journal.push({ sequence: journal.length + 1, event: 'destroy' });
  journal.push({ sequence: journal.length + 1, event: 'unload' });
  return {
    status: 'completed',
    declaredActions: ['destroy-case'],
    releases: [{
      role: 'main',
      remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
    }],
    productResources: {
      revision: 'core-v2-component-assets-product-cleanup/1',
      caseId,
      runtimeCounts: zeroCounts([
        'canvasCount',
        'subscriptionCount',
        'pendingWorkCount',
        'bindingCount',
        'resourceCount',
        'leaseCount',
        'pendingSettlementCount',
        'pendingReleaseCount',
        'staleAttachmentCount',
        'rendererObjectCount',
        'cleanupFailureCount',
      ]),
      backendCounts: zeroCounts([
        'pendingRequestCount',
        'resolvedLiveResourceCount',
        'retainedLeaseCount',
        'pendingReleaseCount',
      ]),
      controllerCounts: zeroCounts([
        'targetCount',
        'bindingCount',
        'pendingSettlementCount',
        'pendingReleaseCount',
        'staleAttachmentCount',
      ]),
      journal,
    },
    errors: [],
  };
}

function dataset(
  caseId: CaseId,
  source: unknown,
  show: boolean,
  tint: string | undefined,
): JsonRecord[] {
  if (caseId === 'REN-008') {
    return [{
      type: 'item',
      id: 'item',
      size: { width: 100, height: 80 },
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      components: [{
        type: 'background',
        id: 'bg',
        source: structuredClone(source),
        size: { width: 20, height: 10 },
        show,
      }],
    }];
  }
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
    components: [{
      type: 'icon',
      id: 'icon',
      source: structuredClone(source),
      size: { width: '50%', height: '25%' },
      placement: 'right-top',
      margin: { top: 2, right: 3, bottom: 0, left: 0 },
      show,
      ...(tint ? { tint } : {}),
    }],
  }];
}

function actionTarget(caseId: CaseId): JsonRecord {
  return caseId === 'REN-008'
    ? { kind: 'component', ownerId: 'item', id: 'bg' }
    : { kind: 'component', ownerId: 'item-a', id: 'icon' };
}

function inputEvidence(): JsonRecord {
  return {
    beforeFingerprint: 'fnv1a64:0000000000000001',
    afterFingerprint: 'fnv1a64:0000000000000001',
    unchanged: true,
  };
}

function rectSource(): JsonRecord {
  return { type: 'rect', fill: '#ff0000', borderWidth: 2, radius: 8 };
}

function resourceJournal(length: number): JsonRecord[] {
  return Array.from({ length }, (_, index) => ({
    sequence: index + 1,
    event: ['register', 'settle', 'patch', 'settle', 'tint', 'release', 'show', 'settle'][index]
      ?? `event-${index + 1}`,
  }));
}

function renderLanes(): JsonRecord {
  return {
    backgroundGeometry: lane('background-geometry'),
    backgroundAssets: lane('background-assets'),
    ordinaryGeometry: lane('ordinary-geometry'),
    relationsDynamic: lane('relations-dynamic'),
    contentAssets: lane('content-assets'),
    text: lane('text'),
    interactionOverlay: lane('interaction-overlay'),
  };
}

function lane(role: string): JsonRecord {
  return {
    role,
    label: `PatchMap/${role}`,
    renderObjectCount: 1,
    visiblePrimitiveCount: 1,
  };
}

function zeroCounts(fields: readonly string[]): JsonRecord {
  return Object.fromEntries(fields.map((field) => [field, 0]));
}

function productAt(
  execution: JsonRecord,
  index: number,
  field: 'product' | 'before' | 'after',
): JsonRecord {
  const results = requireArray(execution.actionResults, 'action results');
  const result = requireRecord(results[index], `result ${index}`);
  const delta = requireRecord(result.delta, `result ${index} delta`);
  const actual = requireRecord(delta.actual, `result ${index} actual`);
  return requireRecord(actual[field], `result ${index} ${field}`);
}

function mutateTerminalBounds(
  execution: JsonRecord,
  caseId: CaseId,
  bounds: [number, number, number, number],
): void {
  const products = caseId === 'REN-008'
    ? [productAt(execution, 3, 'after')]
    : [
        productAt(execution, 0, 'product'),
        productAt(execution, 1, 'before'),
        productAt(execution, 1, 'after'),
        productAt(execution, 2, 'before'),
        productAt(execution, 2, 'after'),
      ];
  for (const terminal of products) {
    const component = requireRecord(terminal.component, 'component');
    const geometry = requireRecord(component.geometry, 'component geometry');
    geometry.localBounds = [...bounds];
    geometry.worldBounds = [...bounds];
    geometry.visibleBounds = [...bounds];
    const geometryProbe = requireRecord(terminal.geometry, 'geometry probe');
    const entity = requireRecord(requireArray(geometryProbe.entities, 'entities')[0], 'entity');
    entity.worldBounds = [...bounds];
    entity.visibleBounds = [...bounds];
  }
}

function rewriteProductEntityIdentity(productValue: JsonRecord, entityId: string): void {
  const component = requireRecord(productValue.component, 'component');
  component.entityId = entityId;
  const paint = requireRecord(component.rendererPaint, 'paint');
  paint.entityId = entityId;
  const image = requireRecord(component.sceneImage, 'scene image');
  image.entityId = entityId;
  const geometryProbe = requireRecord(productValue.geometry, 'geometry probe');
  requireRecord(requireArray(geometryProbe.entities, 'entities')[0], 'entity').id = entityId;
  const imageProbe = requireRecord(productValue.imageProbe, 'image probe');
  const images = requireRecord(imageProbe.images, 'images');
  const oldKey = Object.keys(images)[0];
  if (!oldKey) throw new Error('Missing old image key');
  const record = images[oldKey];
  requireRecord(record, 'global image record').entityId = entityId;
  delete images[oldKey];
  images[entityId] = record;
}

function cleanupCounts(execution: JsonRecord, field: string): JsonRecord {
  const cleanup = requireRecord(execution.cleanup, 'cleanup');
  const productCleanup = requireRecord(cleanup.productResources, 'product cleanup');
  return requireRecord(productCleanup[field], field);
}

function failedPaths(comparison: CompareResult): string[] {
  return comparison.assertions.filter(({ passed }) => !passed).map(({ path }) => path).sort();
}

function parentChildOverlaps(paths: readonly string[]): string[] {
  const sorted = [...paths].sort();
  return sorted.filter((candidate, index) => sorted.some((other, otherIndex) => (
    index !== otherIndex && candidate.startsWith(`${other}/`)
  )));
}

function valueAtRecord(root: unknown, path: readonly string[]): JsonRecord {
  let cursor = root;
  for (const segment of path) {
    cursor = requireRecord(cursor, segment)[segment];
  }
  return requireRecord(cursor, path.join('/'));
}

function zeroTreeLeaves(value: Readonly<JsonRecord>): unknown[] {
  return Object.values(value).flatMap((entry) => (
    isRecord(entry) ? zeroTreeLeaves(entry) : [entry]
  ));
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
