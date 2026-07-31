import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import fixtureProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import normalizedExpectedCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertCommittedVerifierEntryImportFirewall } from './support/contract-verifier-import-firewall';

import type { CoreView, SlotRange } from '../../src/patch-map/dense/contracts';
import type { RendererFlushResult, RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { createPatchMapExecutableLabBridge } from '../../lab/patch-map/contract/executable-bridge';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/patch-map/core';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import {
  PatchMap,
  PixiEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';
import { createPatchMapPresentationDynamicsRuntime } from '../../lab/patch-map/contract/presentation-dynamics-runtime';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type {
  LeafAssetBindingObservation,
  LeafAssetBindingProbe,
  LeafAssetBindingRequest,
  LeafSceneImageProbe,
} from '../../src/patch-map/renderers/leaf-layer';
import type {
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
} from '../../src/patch-map/renderers/types';

type CaseId = 'UPD-005' | 'REN-009' | 'ANI-001' | 'ANI-002';
type JsonRecord = Record<string, unknown>;
type HandlerEntry = readonly [string, (context: unknown, action: unknown) => unknown];

interface CatalogCase {
  readonly id: string;
  readonly caseType: string;
  readonly fixture: Readonly<{
    readonly setup: Readonly<{ readonly params: Readonly<JsonRecord> }>;
    readonly actionTrace: readonly Readonly<JsonRecord>[];
    readonly captureCheckpoints: readonly unknown[];
    readonly cleanupTrace: readonly unknown[];
  }>;
}

interface MaterializedCase extends CatalogCase {
  readonly actionTrace: readonly Readonly<JsonRecord>[];
  readonly routeParams: Readonly<{ size: string; seed: number }>;
}

interface ExecutorCatalog {
  readonly actionDefinitions: readonly Readonly<JsonRecord>[];
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
  readonly PRESENTATION_DYNAMICS_ACTION_TYPES: readonly string[];
  readonly PRESENTATION_DYNAMICS_CASE_IDS: readonly string[];
  createPresentationDynamicsHandlerEntries(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly HandlerEntry[];
}

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Promise<JsonRecord>;
}

interface FoldRuntime {
  foldPresentationDynamicsExecution(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Readonly<{
    actual: Readonly<JsonRecord>;
    fixtures: Readonly<JsonRecord>;
    captures: Readonly<JsonRecord>;
  }>;
}

interface ExpectedCase {
  readonly id: string;
  readonly expected: Readonly<{
    readonly assertions: readonly Readonly<{ readonly path: string }>[];
  }>;
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Readonly<{
    passed: number;
    failed: number;
    assertions: readonly Readonly<{ path: string; passed: boolean }>[];
  }>;
}

async function loadRuntime<T>(relativePath: string): Promise<T> {
  const namespace: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  return namespace as T;
}

const [catalogRuntime, materializeRuntime, handlerRuntime, workerRuntime, foldRuntime, compareRuntime] =
  await Promise.all([
    loadRuntime<CatalogRuntime>('../../scripts/verification/core-v2-contract/catalog.mjs'),
    loadRuntime<MaterializeRuntime>('../../scripts/verification/core-v2-contract/materialize.mjs'),
    loadRuntime<HandlerRuntime>(
      '../../scripts/verification/core-v2-contract/handlers/presentation-dynamics.mjs',
    ),
    loadRuntime<WorkerRuntime>('../../scripts/verification/core-v2-contract/execute-worker.mjs'),
    loadRuntime<FoldRuntime>(
      '../../scripts/verification/core-v2-contract/fold-presentation-dynamics.mjs',
    ),
    loadRuntime<CompareRuntime>('../../scripts/verification/core-v2-contract/compare.mjs'),
  ]);

const { loadExecutorCatalog, selectCatalogCases } = catalogRuntime;
const { materializeCase } = materializeRuntime;
const {
  PRESENTATION_DYNAMICS_ACTION_TYPES,
  PRESENTATION_DYNAMICS_CASE_IDS,
  createPresentationDynamicsHandlerEntries,
} = handlerRuntime;
const { executeContractCase } = workerRuntime;
const { foldPresentationDynamicsExecution } = foldRuntime;
const { compareObservation } = compareRuntime;

let catalog: ExecutorCatalog;

beforeAll(async () => {
  catalog = await loadExecutorCatalog();
});

describe('PatchMap shared presentation dynamics contract runtime', () => {
  it('registers one expected-blind handler family and one zero-resource runtime', async () => {
    const runtime = createPatchMapPresentationDynamicsRuntime('ANI-002');
    const entries = createPresentationDynamicsHandlerEntries(
      runtime.product as unknown as Readonly<Record<string, unknown>>,
    );
    const moduleSources = await Promise.all([
      {
        relativePath:
          '../../scripts/verification/core-v2-contract/handlers/presentation-dynamics.mjs',
        verifierEntry: ['handlers/presentation-dynamics.mjs', 'handler'] as const,
      },
      {
        relativePath:
          '../../scripts/verification/core-v2-contract/fold-presentation-dynamics.mjs',
        verifierEntry: ['fold-presentation-dynamics.mjs', 'fold'] as const,
      },
      {
        relativePath: '../../lab/patch-map/contract/presentation-dynamics-runtime.ts',
        verifierEntry: null,
      },
    ].map(async ({ relativePath, verifierEntry }) => ({
      relativePath,
      verifierEntry,
      source: await readFile(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        'utf8',
      ),
    })));
    const forbiddenProductTokens = /(?:\b(?:catalog|comparator|comparison|evidence|expected|normalized)\b|catalog-normalized-expected|catalog-evidence|normalizedExpected|approvedExpected|compareObservation|\/evidence\/)/u;

    expect(PRESENTATION_DYNAMICS_CASE_IDS).toEqual([
      'UPD-005',
      'REN-009',
      'ANI-001',
      'ANI-002',
    ]);
    expect(entries.map(([id]) => id)).toEqual(
      PRESENTATION_DYNAMICS_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    for (const { relativePath, verifierEntry, source } of moduleSources) {
      expect(source, relativePath).not.toMatch(forbiddenProductTokens);
      expect(source, relativePath).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
      if (verifierEntry === null) {
        expect(source, relativePath).not.toMatch(/^\s*import\s/mu);
      } else {
        await assertCommittedVerifierEntryImportFirewall(...verifierEntry);
      }
    }
    expect(runtime.product.resourceProbe({ caseId: 'ANI-002' })).toMatchObject({
      ownership: zeroOwnership(),
    });
    expect(runtime.postDestroyProductProbe()).toMatchObject({
      runtimeCounts: zeroOwnership(),
      postDestroy: { publications: 0 },
    });
  });

  it('derives post-destroy publications from public frame observations instead of a constant', () => {
    const runtime = createPatchMapPresentationDynamicsRuntime('ANI-002');
    runtime.product.markDestroyed({ caseId: 'ANI-002', lifecycleGeneration: 1 });
    const observed = runtime.product.observePostDestroyAdvance({
      caseId: 'ANI-002',
      timeMs: 300,
      before: publicationObservation(4),
      after: publicationObservation(5),
      frameEventCount: 1,
      attemptedCall: { status: 'completed' },
    });

    expect(observed).toMatchObject({
      publications: 1,
      frameEventCount: 1,
      attemptedCall: { status: 'completed' },
      correlation: { frameRevisionDelta: 1, publishedTupleChanged: false },
    });
    expect(runtime.postDestroyProductProbe()).toMatchObject({
      postDestroy: { publications: 1, observations: [{ publications: 1 }] },
      state: { publicationsAfterDestroy: 1 },
    });
  });

  it.each<CaseId>(['UPD-005', 'REN-009', 'ANI-001', 'ANI-002'])(
    'executes, folds, and independently compares %s through real Engine product paths',
    async (caseId) => {
      const plan = selectedCase(caseId);
      const planBefore = JSON.stringify(plan);
      const runtime = createPatchMapPresentationDynamicsRuntime(caseId);
      const allEntries = createPresentationDynamicsHandlerEntries(
        runtime.product as unknown as Readonly<Record<string, unknown>>,
      );
      const required = new Set(plan.actionTrace.map((action) => `contract/${String(action.type)}`));
      const execution = await executeContractCase({
        caseRecord: plan,
        actionDefinitions: catalog.actionDefinitions,
        engineFactory: () => new PatchMap({ surfaceFactory: testSurfaceFactory() }),
        datasets: new Map([['interactive-scene', interactiveDataset()]]),
        clock: new ManualClock(),
        handlerEntries: allEntries.filter(([id]) => required.has(id)),
      });
      const productResources = runtime.postDestroyProductProbe();
      const executionWithProduct = attachProductResources(execution, productResources);
      const folded = foldPresentationDynamicsExecution({
        casePlan: plan,
        execution: executionWithProduct,
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
      const expectedCase = approvedExpected(caseId);
      const comparison = compareObservation({
        expectedCase,
        actual: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
      });

      expect(execution.status).toBe('completed');
      expect(execution.eventJournalFailures).toEqual([]);
      expect(execution.datasetObservations).toMatchObject({
        'interactive-scene': { unchanged: true },
      });
      expect(execution.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(productResources).toMatchObject({ runtimeCounts: zeroOwnership() });
      expect(JSON.stringify(plan)).toBe(planBefore);
      expect(Object.isFrozen(folded.actual)).toBe(true);

      if (caseId === 'ANI-002') {
        expect(comparison).toMatchObject({ passed: 10, failed: 1 });
        expect(comparison.assertions.filter(({ passed }) => !passed).map(({ path }) => path))
          .toEqual(['/outcome/backwardTime/code']);
        expect(folded.actual).toMatchObject({
          paint: {
            schedule0: { values: [10, 36.25, 40] },
            schedule1: { values: [10, 36.25, 40] },
            at200: { activeAnimations: 0 },
          },
          outcome: { backwardTime: { code: 'CONFLICT' } },
          resources: { postDestroy: { publications: 0 } },
        });
      } else {
        expect(comparison).toMatchObject({
          passed: expectedCase.expected.assertions.length,
          failed: 0,
        });
      }
    },
  );

  it('fails closed when ANI-001 retarget start or its action probe is tampered', async () => {
    const execution = await executeObservedCase('ANI-001');
    const startDrift = structuredClone(execution);
    const retargetAfter = requireRecord(
      actionActualMutable(startDrift, 2).after,
      'ANI-001 retarget after',
    );
    requireRecord(retargetAfter.bar, 'ANI-001 retarget bar').startHeight = 35;
    expect(() => foldObservedCase('ANI-001', startDrift))
      .toThrow(/retarget start must equal the observed pre-retarget presentation/u);

    const probeDrift = structuredClone(execution);
    const result = requireRecord(requireArray(probeDrift.actionResults, 'action results')[4], 'action result');
    const delta = requireRecord(result.delta, 'action delta');
    const semantic = requireRecord(delta.semanticProbe, 'action semantic probe');
    requireRecord(semantic.dataset, 'semantic dataset').ref = 'tampered-scene';
    expect(() => foldObservedCase('ANI-001', probeDrift))
      .toThrow(/product\/semantic probe correlation/u);
  });

  it('records ANI-002 post-destroy refusal and rejects fabricated publication evidence', async () => {
    const execution = await executeObservedCase('ANI-002');
    const postDestroy = requireRecord(
      actionActualMutable(execution, 6).postDestroy,
      'ANI-002 postDestroy',
    );
    expect(postDestroy).toMatchObject({
      publications: 0,
      frameEventCount: 0,
      attemptedCall: {
        status: 'rejected',
        error: { code: 'DESTROYED', category: 'DESTROYED', operation: 'publishFrame' },
      },
      correlation: { frameRevisionDelta: 0, publishedTupleChanged: false },
    });

    const publicationDrift = structuredClone(execution);
    requireRecord(
      actionActualMutable(publicationDrift, 6).postDestroy,
      'postDestroy drift',
    ).publications = 1;
    const publicationCleanup = cleanupProduct(publicationDrift);
    requireRecord(publicationCleanup.state, 'cleanup state').publicationsAfterDestroy = 1;
    const publicationPostDestroy = requireRecord(
      publicationCleanup.postDestroy,
      'cleanup postDestroy',
    );
    publicationPostDestroy.publications = 1;
    requireRecord(
      requireArray(publicationPostDestroy.observations, 'cleanup observations')[0],
      'cleanup observation',
    ).publications = 1;
    expect(() => foldObservedCase('ANI-002', publicationDrift))
      .toThrow(/postDestroy publications derivation/u);

    const missingError = structuredClone(execution);
    const attemptedCall = requireRecord(
      requireRecord(actionActualMutable(missingError, 6).postDestroy, 'postDestroy').attemptedCall,
      'attemptedCall',
    );
    delete attemptedCall.error;
    const cleanupAttempt = requireRecord(
      requireRecord(
        requireArray(
          requireRecord(cleanupProduct(missingError).postDestroy, 'cleanup postDestroy').observations,
          'cleanup observations',
        )[0],
        'cleanup observation',
      ).attemptedCall,
      'cleanup attemptedCall',
    );
    delete cleanupAttempt.error;
    expect(() => foldObservedCase('ANI-002', missingError))
      .toThrow(/rejected attempt keys/u);

    const cleanupDrift = structuredClone(execution);
    const cleanup = requireRecord(cleanupDrift.cleanup, 'cleanup');
    const product = requireRecord(cleanup.productResources, 'cleanup product');
    const observations = requireArray(
      requireRecord(product.postDestroy, 'cleanup postDestroy').observations,
      'cleanup observations',
    );
    requireRecord(observations[0], 'cleanup observation').publications = 1;
    expect(() => foldObservedCase('ANI-002', cleanupDrift))
      .toThrow(/cleanup postDestroy publication sum/u);
  });

  it('rejects action, input, terminal, release, and product-cleanup evidence drift', async () => {
    const execution = await executeObservedCase('UPD-005');
    const drifts: readonly Readonly<{
      mutate(candidate: JsonRecord): void;
      error: RegExp;
    }>[] = [
      {
        mutate(candidate) { actionActualMutable(candidate, 2).timeMs = 17; },
        error: /action 2 time correlation/u,
      },
      {
        mutate(candidate) {
          requireRecord(actionActualMutable(candidate, 0).input, 'input').afterFingerprint =
            'fnv1a64:0000000000000000';
        },
        error: /action 0 input fingerprint correlation/u,
      },
      {
        mutate(candidate) {
          requireRecord(candidate.terminalSnapshot, 'terminal snapshot').frameRevision = 99;
          requireRecord(cleanupRelease(candidate).before, 'release before').frameRevision = 99;
        },
        error: /terminal product\/snapshot correlation/u,
      },
      {
        mutate(candidate) {
          requireRecord(candidate.cleanup, 'cleanup').declaredActions = [];
        },
        error: /cleanup declared actions/u,
      },
      {
        mutate(candidate) {
          const release = cleanupRelease(candidate);
          requireRecord(release.remainingResources, 'remaining resources').pendingWork = 1;
        },
        error: /remaining resources pendingWork zero/u,
      },
      {
        mutate(candidate) { cleanupProduct(candidate).revision = 'tampered-revision'; },
        error: /cleanup product revision/u,
      },
      {
        mutate(candidate) { cleanupProduct(candidate).caseId = 'ANI-001'; },
        error: /cleanup product case/u,
      },
      {
        mutate(candidate) { cleanupProduct(candidate).runtimeCounts = {}; },
        error: /cleanup runtimeCounts keys/u,
      },
      {
        mutate(candidate) {
          requireRecord(cleanupProduct(candidate).runtimeCounts, 'runtimeCounts').listenerCount = 1;
        },
        error: /cleanup runtimeCounts listenerCount zero/u,
      },
    ];

    for (const drift of drifts) {
      const candidate = structuredClone(execution);
      drift.mutate(candidate);
      expect(() => foldObservedCase('UPD-005', candidate)).toThrow(drift.error);
    }
  });

  it.each<CaseId>(['UPD-005', 'REN-009', 'ANI-001', 'ANI-002'])(
    'runs and repeats %s through the focused Lab bridge with a product-backed surface',
    async (caseId) => {
      const bridge = createPatchMapExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
        size: '100',
        seed: 319,
        surfaceHost: {
          querySelector(): null { return null; },
        } as unknown as HTMLElement,
        surfaceFactory: testSurfaceFactory(),
        environment: { browser: 'vitest', backend: 'webgl2', routeSize: '100' },
      });

      const first = await bridge.runCase();
      const repeated = await bridge.repeatCase();

      expect(first.status).toBe('observed');
      expect(repeated.status).toBe('observed');
      expect(first.actualObservation.case).toMatchObject({ id: caseId });
      expect(repeated.actualObservation).toEqual(first.actualObservation);
      expect(first.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(repeated.cleanup).toMatchObject({ status: 'completed', errors: [] });
      await expect(bridge.destroyCase()).resolves.toMatchObject({
        status: 'completed',
        runCount: 2,
        completedRunCount: 2,
        retainedCanvasCount: 0,
        retainedSubscriptionCount: 0,
        retainedPendingWork: 0,
      });
    },
  );
});

function selectedCase(caseId: CaseId): MaterializedCase {
  const selected = selectCatalogCases(catalog, { caseIds: [caseId] })[0];
  if (!selected) throw new Error(`Missing ${caseId}`);
  return materializeCase(selected, { size: '100', seed: '319' });
}

async function executeObservedCase(caseId: CaseId): Promise<JsonRecord> {
  const plan = selectedCase(caseId);
  const runtime = createPatchMapPresentationDynamicsRuntime(caseId);
  const entries = createPresentationDynamicsHandlerEntries(
    runtime.product as unknown as Readonly<Record<string, unknown>>,
  );
  const required = new Set(plan.actionTrace.map((action) => `contract/${String(action.type)}`));
  const execution = await executeContractCase({
    caseRecord: plan,
    actionDefinitions: catalog.actionDefinitions,
    engineFactory: () => new PatchMap({ surfaceFactory: testSurfaceFactory() }),
    datasets: new Map([['interactive-scene', interactiveDataset()]]),
    clock: new ManualClock(),
    handlerEntries: entries.filter(([id]) => required.has(id)),
  });
  return attachProductResources(execution, runtime.postDestroyProductProbe());
}

function foldObservedCase(caseId: CaseId, execution: JsonRecord): Readonly<JsonRecord> {
  return foldPresentationDynamicsExecution({
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
  }).actual;
}

function actionActualMutable(execution: JsonRecord, index: number): JsonRecord {
  const result = requireRecord(requireArray(execution.actionResults, 'action results')[index], 'action result');
  return requireRecord(requireRecord(result.delta, 'action delta').actual, 'action actual');
}

function cleanupProduct(execution: JsonRecord): JsonRecord {
  return requireRecord(
    requireRecord(execution.cleanup, 'cleanup').productResources,
    'cleanup product resources',
  );
}

function cleanupRelease(execution: JsonRecord): JsonRecord {
  return requireRecord(
    requireArray(requireRecord(execution.cleanup, 'cleanup').releases, 'cleanup releases')[0],
    'cleanup release',
  );
}

function publicationObservation(frameRevision: number): Readonly<{
  lifecycle: string;
  frameRevision: number;
  publishedTuple: Readonly<{ scene: number; view: number; interaction: number }>;
}> {
  return {
    lifecycle: 'destroyed',
    frameRevision,
    publishedTuple: { scene: 1, view: 0, interaction: 0 },
  };
}

function approvedExpected(caseId: CaseId): ExpectedCase {
  const selected = (normalizedExpectedCatalog.cases as unknown as readonly ExpectedCase[])
    .find(({ id }) => id === caseId);
  if (!selected) throw new Error(`Missing expected ${caseId}`);
  return selected;
}

function interactiveDataset(): unknown {
  const profiles = fixtureProfiles as unknown as Readonly<{
    datasets: Readonly<Record<string, unknown>>;
  }>;
  return structuredClone(profiles.datasets['interactive-scene']);
}

function attachProductResources(execution: JsonRecord, productResources: Readonly<JsonRecord>): JsonRecord {
  const clone = structuredClone(execution);
  const cleanup = requireRecord(clone.cleanup, 'cleanup');
  cleanup.productResources = structuredClone(productResources);
  return clone;
}

function testSurfaceFactory(): PatchMapEngineSurfaceFactory {
  return (options: PatchMapSurfaceOptions) => {
    const renderer = new RendererTestDouble(options.width, options.height, options.pixelRatio);
    const TestPatchMap = PatchMapRuntime as unknown as new (
      renderer: PatchMapPixiRenderer,
      coreOptions: PatchMapRuntimeOptions,
    ) => PatchMapRuntime;
    const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
      autoRender: false,
    });
    return Promise.resolve(new PixiEngineSurface(core));
  };
}

class RendererTestDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public destroyed = false;
  private frame = 0;
  private entityCount = 0;
  private readonly bindings = new Map<string, Readonly<{
    request: LeafAssetBindingRequest;
    probe: LeafAssetBindingProbe;
  }>>();
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(
    public width: number,
    public height: number,
    public pixelRatio: number,
  ) {}

  public markChanges(): void {}
  public markOverlayChanges(): void {}
  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    const normalizedResourceIdentity = `test-resource:${key}`;
    const sourceKind = request.kind === 'alias'
      ? 'alias'
      : typeof request.source === 'string' && request.source.startsWith('data:')
        ? 'data-uri'
        : typeof request.source === 'string'
          ? 'url'
          : 'descriptor';
    const probe = Object.freeze({
      key,
      generation: 1,
      request,
      sourceKind,
      state: 'resolved' as const,
      attached: true,
      cacheIdentity: key,
      normalizedResourceIdentity,
      reusedResolvedResource: false,
      naturalSize: Object.freeze([16, 16] as const),
      consumerCount: 1,
      renderObjectCount: 1,
      placeholderCount: 0,
      renderRole: 'image' as const,
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
    this.bindings.set(key, Object.freeze({ request, probe }));
    return Promise.resolve(Object.freeze({
      key,
      generation: 1,
      status: 'attached' as const,
      cacheIdentity: key,
      normalizedResourceIdentity,
      reusedResolvedResource: false,
      naturalSize: Object.freeze([16, 16] as const),
    }));
  }
  public unbindSceneAsset(key: string): Promise<boolean> {
    return Promise.resolve(this.bindings.delete(key));
  }
  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    return this.bindings.get(key)?.probe ?? null;
  }
  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    const [key, binding] = this.bindings.entries().next().value ?? [];
    if (typeof key !== 'string' || binding === undefined) return null;
    return Object.freeze({
      entityId,
      renderObjectCount: 1,
      role: 'image',
      bindingKey: key,
      bindingGeneration: binding.probe.generation,
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
  }
  public setProjection(
    _index: PatchMapProjectionIndex,
    _ranges?: readonly SlotRange[],
  ): boolean { return true; }
  public setWorldOrientation(): boolean { return true; }
  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(store: RenderStoreView): RendererFlushResult {
    this.frame += 1;
    this.entityCount = store.liveCount;
    return Object.freeze({ rendered: true, commandCount: Math.max(1, store.liveCount) });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(): Promise<void> { return Promise.resolve(); }
  public unloadAsset(): Promise<boolean> { return Promise.resolve(false); }
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapPixiRendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 1,
      entityCount: this.entityCount,
      aggregateRenderObjects: Math.max(1, this.entityCount),
      visiblePrimitives: this.entityCount,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      fallbackTextCount: 0,
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
      view: this.view,
      lastInvalidation: 'presentation-dynamics-test',
      destroyed: this.destroyed,
    });
  }
  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.entityCount = 0;
    this.bindings.clear();
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

class ManualClock {
  private value = 0;

  public now(): number { return this.value; }
  public advanceTo(timeMs: number): Promise<void> {
    if (timeMs < this.value) throw new Error('manual clock cannot move backwards');
    this.value = timeMs;
    return Promise.resolve();
  }
  public withTimeout<T>(promise: Promise<T>): Promise<T> { return promise; }
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return {
    activeSessionCount: 0,
    tickerCount: 0,
    schedulerCount: 0,
    listenerCount: 0,
    animationClosureCount: 0,
    pendingWorkCount: 0,
  };
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
