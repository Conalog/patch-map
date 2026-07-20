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
  readonly RENDER_IMAGES_FOLD_REVISION: string;
  foldRenderImageExecution(
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
    readonly assertions: readonly Readonly<{ readonly path: string }> [];
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
  loadRuntime<FoldRuntime>('../../scripts/verification/core-v2-contract/fold-render-images.mjs'),
  loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const { RENDER_IMAGES_FOLD_REVISION, foldRenderImageExecution } = foldRuntime;
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

const IMMUTABLE_PARENT_CONFLICTS = [
  '/resources/images/alias',
  '/resources/images/data-uri',
  '/resources/images/url',
] as const;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('Core v2 REN-005 render-images actual-only fold', () => {
  it('is import-free, browser-safe, expected-blind, and revisioned', async () => {
    const source = await readFile(
      fileURLToPath(new URL(
        '../../scripts/verification/core-v2-contract/fold-render-images.mjs',
        import.meta.url,
      )),
      'utf8',
    );
    const forbiddenEvidenceName = ['catalog', 'normalized', 'expected', 'v1', 'json'].join('-');

    expect(RENDER_IMAGES_FOLD_REVISION).toBe('core-v2-render-images-fold/1');
    expect(source).not.toContain(forbiddenEvidenceName);
    expect(source).not.toMatch(/\.expected\b/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(source).not.toMatch(/node:/u);
    expect(source).not.toMatch(/^\s*import\s/mu);
  });

  it('folds the controlled race into fourteen frozen semantic domains', () => {
    const folded = fold(createExecution());

    expect(Object.keys(folded.actual)).toEqual(['$schema', ...DOMAIN_NAMES]);
    for (const domain of DOMAIN_NAMES) expect(folded.actual[domain]).toBeTypeOf('object');
    expect(folded.actual).toMatchObject({
      $schema: 'core-v2-semantic-observation/1',
      case: { id: 'REN-005', caseType: 'capability' },
      scene: {
        images: {
          'data-uri': { zIndex: 3 },
          transformed: { zIndex: 4 },
          'hidden-image': { renderObjectCount: 0 },
        },
      },
      geometry: {
        images: {
          'data-uri': { worldBounds: [100, 120, 16, 8] },
          transformed: { worldBounds: [145, 115, 10, 20] },
          'failed-image': { placeholderBounds: [220, 40, 32, 32] },
        },
      },
      paint: {
        images: {
          'data-uri': { opacity: 0.5 },
          'hidden-image': { opacity: 0.25 },
          'failed-image': { role: 'asset-placeholder' },
        },
      },
      interaction: {
        images: {
          'hidden-image': { hit: false },
          'failed-image': { hitProbe: { point: [236, 56], target: 'failed-image' } },
        },
      },
      outcome: { images: { 'failed-image': { diagnosticCount: 1 } } },
      resources: {
        images: {
          descriptor: {
            source: 'fixture-image',
            staleAttachCount: 0,
            hitBounds: [0, 0, 32, 32],
            initial: { state: 'resolved' },
          },
        },
        abandonedRequests: { pendingCount: 0, leaseCount: 0, resourceCount: 0 },
      },
    });
    expect(folded.captures).toEqual({
      images: { descriptor: { worldBounds: [0, 0, 32, 32] } },
    });
    const resources = requireRecord(folded.actual.resources, 'actual resources');
    const abandoned = requireRecord(resources.abandonedRequests, 'abandoned requests');
    expect(zeroTreeLeaves(abandoned)).not.toHaveLength(0);
    expect(zeroTreeLeaves(abandoned).every((value) => value === 0)).toBe(true);
    expect(Object.isFrozen(folded)).toBe(true);
    expect(Object.isFrozen(folded.actual)).toBe(true);
    expect(Object.isFrozen(folded.fixtures)).toBe(true);
    expect(Object.isFrozen(folded.captures)).toBe(true);
  });

  it('passes 25 of 28 approved assertions and exposes only the three immutable parent conflicts', () => {
    const expectedCase = approvedExpectedCase();
    const folded = fold(createExecution());
    const comparison = compareObservation({
      expectedCase,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(expectedCase.expected.assertions).toHaveLength(28);
    expect(comparison).toMatchObject({ passed: 25, failed: 3 });
    expect(failedPaths(comparison)).toEqual(IMMUTABLE_PARENT_CONFLICTS);
    expect(comparison.assertions.filter(({ passed }) => !passed).every(({ failure }) => (
      failure?.code === 'VALUE_MISMATCH'
    ))).toBe(true);
  });

  it('lets the independent comparator expose a negative product-value mutation', () => {
    const execution = createExecution();
    const terminal = actionActual(execution, 3);
    const product = requireRecord(terminal.product, 'terminal product');
    const imageProbe = requireRecord(product.imageProbe, 'terminal image probe');
    const images = requireRecord(imageProbe.images, 'terminal image records');
    const dataUri = requireRecord(images['data-uri'], 'data URI record');
    dataUri.opacity = 0.75;
    const folded = fold(execution);
    const comparison = compareObservation({
      expectedCase: approvedExpectedCase(),
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(comparison).toMatchObject({ passed: 24, failed: 4 });
    expect(failedPaths(comparison)).toEqual([
      '/paint/images/data-uri/opacity',
      ...IMMUTABLE_PARENT_CONFLICTS,
    ].sort());
  });

  it('rejects action-order and capture-source drift before producing an observation', () => {
    const actionDrift = createExecution();
    const actions = actionDrift.actionResults as JsonRecord[];
    const second = actions[1];
    const third = actions[2];
    if (second === undefined || third === undefined) throw new Error('Missing REN-005 actions');
    actions[1] = third;
    actions[2] = second;
    expect(() => fold(actionDrift)).toThrow(/result 1 identity/u);

    const captureDrift = createExecution();
    const captures = captureDrift.captures as JsonRecord[];
    const capture = captures[0];
    if (capture === undefined) throw new Error('Missing REN-005 capture');
    capture.afterActionIndex = 2;
    expect(() => fold(captureDrift)).toThrow(/capture action/u);
  });

  it('rejects action evidence that does not prove the controlled stale-completion race', () => {
    const drifts: readonly Readonly<{
      mutate(execution: JsonRecord): void;
      error: RegExp;
    }>[] = [
      {
        mutate(execution) {
          requireRecord(actionActual(execution, 0).input, 'load input').unchanged = false;
        },
        error: /initial input unchanged/u,
      },
      {
        mutate(execution) {
          requireRecord(actionActual(execution, 1).request, 'pending request').attached = true;
        },
        error: /pending request state/u,
      },
      {
        mutate(execution) {
          requireRecord(actionActual(execution, 2).mutation, 'replacement mutation').changed = false;
        },
        error: /replacement mutation result/u,
      },
      {
        mutate(execution) {
          actionActual(execution, 2).timeMs = 21;
        },
        error: /replacement time/u,
      },
      {
        mutate(execution) {
          requireRecord(actionActual(execution, 3).completion, 'completion').attached = true;
        },
        error: /completed request state/u,
      },
      {
        mutate(execution) {
          requireRecord(actionActual(execution, 3).completion, 'completion').generation = 2;
        },
        error: /completion generation identity/u,
      },
      {
        mutate(execution) {
          actionActual(execution, 3).timeMs = 99;
        },
        error: /completed request time/u,
      },
      {
        mutate(execution) {
          const product = requireRecord(actionActual(execution, 3).product, 'terminal product');
          requireRecord(product.requests, 'terminal requests').pendingCount = 1;
        },
        error: /terminal request drain/u,
      },
      {
        mutate(execution) {
          const product = requireRecord(actionActual(execution, 3).product, 'terminal product');
          requireRecord(product.requests, 'terminal requests').staleCompletionCount = 0;
        },
        error: /terminal stale completion count/u,
      },
      {
        mutate(execution) {
          const product = requireRecord(actionActual(execution, 3).product, 'terminal product');
          const requests = requireRecord(product.requests, 'terminal requests');
          if (!Array.isArray(requests.controlledRequests)) throw new Error('Missing controlled requests');
          requireRecord(requests.controlledRequests[0], 'controlled request').retainedLeaseCount = 1;
        },
        error: /terminal controlled request retained lease drain/u,
      },
    ];

    for (const drift of drifts) {
      const execution = createExecution();
      drift.mutate(execution);
      expect(() => fold(execution)).toThrow(drift.error);
    }
  });

  it('rejects cleanup declaration, release, and remaining-resource drift', () => {
    const declarationDrift = createExecution();
    const declarationCleanup = requireRecord(declarationDrift.cleanup, 'cleanup');
    declarationCleanup.declaredActions = ['destroy-case', 'destroy-case'];
    expect(() => fold(declarationDrift)).toThrow(/cleanup declared actions/u);

    const releaseDrift = createExecution();
    const releaseCleanup = requireRecord(releaseDrift.cleanup, 'cleanup');
    releaseCleanup.releases = [];
    expect(() => fold(releaseDrift)).toThrow(/cleanup release count/u);

    const retainedResource = createExecution();
    const retainedCleanup = requireRecord(retainedResource.cleanup, 'cleanup');
    const retainedReleases = retainedCleanup.releases;
    if (!Array.isArray(retainedReleases)) throw new Error('Missing cleanup releases');
    const retainedRelease = requireRecord(retainedReleases[0], 'cleanup release');
    requireRecord(retainedRelease.remainingResources, 'remaining resources').pendingWork = 1;
    expect(() => fold(retainedResource)).toThrow(/pendingWork resource delta/u);

    const resourceShapeDrift = createExecution();
    const shapeCleanup = requireRecord(resourceShapeDrift.cleanup, 'cleanup');
    const shapeReleases = shapeCleanup.releases;
    if (!Array.isArray(shapeReleases)) throw new Error('Missing cleanup releases');
    const shapeRelease = requireRecord(shapeReleases[0], 'cleanup release');
    requireRecord(shapeRelease.remainingResources, 'remaining resources').textureCount = 0;
    expect(() => fold(resourceShapeDrift)).toThrow(/remaining resources keys/u);

    const runtimeLeaseDrift = createExecution();
    const runtimeCleanup = requireRecord(runtimeLeaseDrift.cleanup, 'cleanup');
    const runtimeProduct = requireRecord(runtimeCleanup.productResources, 'productResources');
    requireRecord(runtimeProduct.assetRuntime, 'assetRuntime').leaseCount = 1;
    expect(() => fold(runtimeLeaseDrift)).toThrow(/cleanup assetRuntime leaseCount drain/u);

    const oldRequestLeaseDrift = createExecution();
    const oldRequestCleanup = requireRecord(oldRequestLeaseDrift.cleanup, 'cleanup');
    const oldRequestProduct = requireRecord(oldRequestCleanup.productResources, 'productResources');
    if (!Array.isArray(oldRequestProduct.controlledRequests)) {
      throw new Error('Missing cleanup controlled requests');
    }
    requireRecord(
      oldRequestProduct.controlledRequests[0],
      'cleanup controlled request',
    ).retainedLeaseCount = 1;
    expect(() => fold(oldRequestLeaseDrift)).toThrow(/cleanup controlled lease drain/u);

    const cleanupTokenDrift = createExecution();
    const tokenCleanup = requireRecord(cleanupTokenDrift.cleanup, 'cleanup');
    const tokenProduct = requireRecord(tokenCleanup.productResources, 'productResources');
    if (!Array.isArray(tokenProduct.controlledRequests)) {
      throw new Error('Missing cleanup controlled requests');
    }
    requireRecord(
      tokenProduct.controlledRequests[0],
      'cleanup controlled request',
    ).backendToken = 'image-request-5';
    expect(() => fold(cleanupTokenDrift)).toThrow(/cleanup controlled backendToken identity/u);

    const unloadLinkDrift = createExecution();
    const unloadCleanup = requireRecord(unloadLinkDrift.cleanup, 'cleanup');
    const unloadProduct = requireRecord(unloadCleanup.productResources, 'productResources');
    const unloadJournal = requireRecord(unloadProduct.journal, 'journal');
    const journalEntries = requireArray(unloadJournal.entries, 'cleanup journal entries');
    const descriptorUnload = journalEntries.find((entry) => (
      requireRecord(entry, 'journal entry').requestToken === 'image-request-3'
    ));
    requireRecord(descriptorUnload, 'descriptor unload').requestKey = 'wrong-backend-key';
    expect(() => fold(unloadLinkDrift)).toThrow(/cleanup controlled unload journal link/u);
  });
});

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

function selectedCase(): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: ['REN-005'] })[0];
  if (selected === undefined) throw new Error('Missing approved REN-005 case');
  return materializeCase(selected, { size: '100', seed: '319' });
}

function approvedExpectedCase(): ExpectedCase {
  const expectedCase = (normalizedExpectedCatalog.cases as unknown as readonly ExpectedCase[])
    .find(({ id }) => id === 'REN-005');
  if (expectedCase === undefined) throw new Error('Missing approved REN-005 expected record');
  return expectedCase;
}

function fold(execution: JsonRecord): FoldResult {
  return foldRenderImageExecution({
    casePlan: selectedCase(),
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

function createExecution(): JsonRecord {
  const initial = createProduct({ descriptorSource: initialDescriptorSource(), initialState: 'pending' });
  const replaced = createProduct({ descriptorSource: 'fixture-image', initialState: 'pending' });
  const terminal = createProduct({ descriptorSource: 'fixture-image', initialState: 'resolved' });
  const actionActuals = [
    {
      datasetId: 'image-specimens',
      registration: { registeredAliases: ['fixture-image'] },
      loaded: { status: 'committed', entityCount: 7 },
      input: {
        beforeFingerprint: 'fnv1a64:0000000000000001',
        afterFingerprint: 'fnv1a64:0000000000000001',
        unchanged: true,
      },
      product: initial,
    },
    {
      targetId: 'descriptor',
      requestId: 'old',
      completeAtMs: 100,
      request: pendingControlledRequest(),
      product: initial,
    },
    {
      targetId: 'descriptor',
      source: 'fixture-image',
      timeMs: 20,
      mutation: { status: 'committed', changed: true },
      before: initial,
      after: replaced,
    },
    {
      requestId: 'old',
      timeMs: 100,
      completion: terminalControlledRequest(),
      product: terminal,
    },
  ];
  const actionTypes = ['loadDataset', 'resolveAsset', 'replaceSource', 'completeAsset'];
  const actionTimes = [0, 0, 20, 100];

  return {
    $schema: 'core-v2-contract-case-execution/1',
    caseId: 'REN-005',
    caseType: 'capability',
    status: 'completed',
    actionResults: actionTypes.map((type, index) => ({
      index,
      type,
      handlerId: `contract/${type}`,
      status: 'completed',
      startedAtMs: actionTimes[index],
      completedAtMs: actionTimes[index],
      delta: {
        $schema: 'core-v2-semantic-observation-delta/1',
        caseId: 'REN-005',
        actionIndex: index,
        actionType: type,
        actual: actionActuals[index],
        semanticProbe: terminal.semanticProbe,
      },
    })),
    captures: [{
      id: 'images',
      phase: 'after-action',
      afterActionIndex: 3,
      values: { 'descriptor/worldBounds': [0, 0, 32, 32] },
    }],
    bindings: {},
    eventJournal: [],
    eventJournalFailures: [],
    datasetObservations: {},
    hostSeamDelta: null,
    terminalSnapshot: terminal.snapshot,
    terminalSemanticProbe: terminal.semanticProbe,
    cleanup: {
      status: 'completed',
      declaredActions: ['destroy-case'],
      releases: [{
        role: 'main',
        remainingResources: { canvasCount: 0, subscriptions: 0, pendingWork: 0 },
      }],
      productResources: postDestroyProductResources(),
      errors: [],
    },
    error: null,
  };
}

function createProduct(options: Readonly<{
  readonly descriptorSource: unknown;
  readonly initialState: 'pending' | 'resolved';
}>): JsonRecord {
  const snapshot = {
    lifecycle: 'scene-ready',
    revisions: { sceneRevision: 2, viewRevision: 0, interactionRevision: 0 },
    frameRevision: 3,
    publishedTuple: {
      sceneRevision: 2,
      viewRevision: 0,
      interactionRevision: 0,
      frameRevision: 3,
    },
    resources: {
      canvasCount: 1,
      subscriptions: { active: 6 },
      rendering: { commandCount: 6 },
    },
    pendingWork: 0,
  };
  const semanticProbe = {
    lifecycle: 'scene-ready',
    geometry: { finiteValueCount: 56 },
    interaction: { activeGestureCount: 0 },
    history: { depth: 0 },
  };
  return {
    snapshot,
    semanticProbe,
    geometry: {
      entities: IMAGE_GEOMETRY.map(([id, worldBounds]) => ({
        id,
        kind: 'image',
        worldBounds: [...worldBounds],
      })),
    },
    imageProbe: {
      images: {
        alias: {
          authoredSource: 'fixture-image',
          normalizedResourceIdentity: 'fixture-image@1',
          cacheIdentity: 'alias:fixture-image',
          state: 'resolved',
        },
        url: {
          authoredSource: 'https://assets.example.test/image.png',
          normalizedResourceIdentity: 'fixture-url-image-64x32@1',
          cacheIdentity: 'url:https://assets.example.test/image.png',
          state: 'resolved',
        },
        descriptor: {
          authoredSource: structuredClone(options.descriptorSource),
          staleAttachCount: 0,
          hitBounds: [0, 0, 32, 32],
          initial: {
            authoredSource: initialDescriptorSource(),
            normalizedResourceIdentity: 'fixture-svg-image@resolution-2',
            cacheIdentity: 'descriptor:https://assets.example.test/image.svg?resolution=2',
            state: options.initialState,
          },
        },
        'data-uri': {
          authoredSourceKind: 'data-uri',
          sourceKind: 'data-uri',
          normalizedResourceIdentity: 'fixture-data-uri-svg-16x8@1',
          cacheIdentity: 'data-uri:fixture-data-uri-svg-16x8',
          state: 'resolved',
          opacity: 0.5,
          zIndex: 3,
        },
        transformed: {
          authoredSource: 'fixture-image',
          normalizedResourceIdentity: 'fixture-image@1',
          cacheIdentity: 'alias:fixture-image',
          reusedResolvedResource: true,
          state: 'resolved',
          zIndex: 4,
        },
        'hidden-image': { renderObjectCount: 0, opacity: 0.25 },
        'failed-image': { role: 'asset-placeholder', diagnosticCount: 1 },
      },
      abandonedRequests: { pendingCount: 0, leaseCount: 0, resourceCount: 0 },
    },
    dataset: [],
    hits: {
      hidden: { point: [190, 125], target: null },
      failed: { point: [236, 56], target: 'failed-image' },
    },
    requests: {
      pendingCount: 0,
      completedCount: options.initialState === 'resolved' ? 1 : 0,
      staleCompletionCount: options.initialState === 'resolved' ? 1 : 0,
      attachedCount: 0,
      retainedPendingCount: 0,
      controlledRequests: options.initialState === 'resolved'
        ? [terminalControlledRequest()]
        : [],
    },
  };
}

function pendingControlledRequest(): JsonRecord {
  return {
    requestId: 'old',
    targetId: 'descriptor',
    completeAtMs: 100,
    generation: 1,
    bindingKey: 'descriptor:{"data":{"resolution":2},"src":"https://assets.example.test/image.svg"}',
    sourceCacheIdentity: 'descriptor:https://assets.example.test/image.svg?resolution=2',
    backendToken: 'image-request-3',
    backendKey: 'backend-request-key-3',
    backendState: 'pending',
    attemptState: 'pending',
    attachmentState: 'current',
    state: 'pending',
    attached: false,
    retainedPendingCount: 1,
    retainedLeaseCount: 1,
  };
}

function terminalControlledRequest(): JsonRecord {
  return {
    ...pendingControlledRequest(),
    backendState: 'unloaded',
    attemptState: 'resolved',
    attachmentState: 'stale',
    state: 'stale-discarded',
    retainedPendingCount: 0,
    retainedLeaseCount: 0,
  };
}

function postDestroyProductResources(): JsonRecord {
  const requests = [
    backendRequest('image-request-1', 'alias', 'unloaded'),
    backendRequest('image-request-2', 'data-uri', 'unloaded'),
    backendRequest('image-request-3', 'descriptor', 'unloaded'),
    backendRequest('image-request-4', 'failed', 'rejected'),
    backendRequest('image-request-5', 'url', 'unloaded'),
  ];
  const unloadRequestTokens = ['image-request-1', 'image-request-2', 'image-request-3', 'image-request-5'];
  const rejectedRequestTokens = ['image-request-4'];
  return {
    revision: 'core-v2-ren-005-product-cleanup/1',
    assetRuntime: {
      resourceCount: 0,
      pendingCount: 0,
      leaseCount: 0,
      cleanupPendingCount: 0,
    },
    backend: {
      requestCount: 5,
      pendingCount: 0,
      resolvedLiveResourceCount: 0,
      unloadedCount: 4,
      rejectedCount: 1,
      requests,
    },
    controlledRequests: [cleanupControlledRequest()],
    journal: {
      unloadRequestTokens,
      rejectedRequestTokens,
      entries: [
        ...unloadRequestTokens.map((requestToken, index) => ({
          sequence: index + 1,
          event: 'unload',
          requestToken,
          requestKey: requestToken === 'image-request-3'
            ? 'backend-request-key-3'
            : `backend-${requestToken}`,
        })),
        {
          sequence: 5,
          event: 'load-rejected',
          requestToken: 'image-request-4',
          requestKey: 'backend-image-request-4',
        },
      ],
    },
  };
}

function cleanupControlledRequest(): JsonRecord {
  const terminal = terminalControlledRequest();
  return {
    requestId: terminal.requestId,
    targetId: terminal.targetId,
    generation: terminal.generation,
    bindingKey: terminal.bindingKey,
    sourceCacheIdentity: terminal.sourceCacheIdentity,
    backendToken: terminal.backendToken,
    backendKey: terminal.backendKey,
    backendState: terminal.backendState,
    attemptState: terminal.attemptState,
    attachmentState: terminal.attachmentState,
    retainedPendingCount: terminal.retainedPendingCount,
    retainedLeaseCount: terminal.retainedLeaseCount,
  };
}

function backendRequest(token: string, kind: string, state: string): JsonRecord {
  return {
    token,
    key: token === 'image-request-3' ? 'backend-request-key-3' : `backend-${token}`,
    kind,
    state,
  };
}

const IMAGE_GEOMETRY = [
  ['alias', [0, 0, 80, 40]],
  ['url', [0, 0, 64, 32]],
  ['descriptor', [0, 0, 32, 32]],
  ['data-uri', [100, 120, 16, 8]],
  ['transformed', [145, 115, 10, 20]],
  ['hidden-image', [180, 120, 20, 10]],
  ['failed-image', [220, 40, 32, 32]],
] as const;

function initialDescriptorSource(): JsonRecord {
  return {
    src: 'https://assets.example.test/image.svg',
    data: { resolution: 2 },
  };
}

function actionActual(execution: JsonRecord, index: number): JsonRecord {
  const results = execution.actionResults;
  if (!Array.isArray(results)) throw new Error('Missing REN-005 action results');
  const result = requireRecord(results[index], `action ${index}`);
  const delta = requireRecord(result.delta, `action ${index} delta`);
  return requireRecord(delta.actual, `action ${index} actual`);
}

function failedPaths(comparison: CompareResult): string[] {
  return comparison.assertions
    .filter(({ passed }) => !passed)
    .map(({ path }) => path)
    .sort();
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value as unknown[];
}

function zeroTreeLeaves(value: Readonly<JsonRecord>): unknown[] {
  return Object.values(value).flatMap((entry) => (
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? zeroTreeLeaves(entry as JsonRecord)
      : [entry]
  ));
}
