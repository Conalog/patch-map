import { readFile } from 'node:fs/promises';

import expectedJson from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_PERFORMANCE_CASE_IDS,
  PATCH_MAP_PERFORMANCE_CLEANUP_REVISION,
  PATCH_MAP_PERFORMANCE_RUNTIME_REVISION,
  createPatchMapPerformanceRuntime,
} from '../../lab/patch-map/contract/performance-runtime';
import {
  materializePatchMapExecutableCase,
} from '../../lab/patch-map/contract/executable-cases';
// @ts-expect-error -- browser-safe contract handlers are authored as ESM JavaScript.
import * as handlerModule from '../../scripts/verification/core-v2-contract/handlers/performance.mjs';
// @ts-expect-error -- browser-safe contract folds are authored as ESM JavaScript.
import * as foldModule from '../../scripts/verification/core-v2-contract/fold-performance.mjs';
// @ts-expect-error -- independent comparison is authored as ESM JavaScript.
import * as compareModule from '../../scripts/verification/core-v2-contract/compare.mjs';

interface HandlerRuntime {
  readonly PERFORMANCE_HANDLER_REVISION: string;
  readonly PERFORMANCE_CASE_IDS: readonly string[];
  readonly PERFORMANCE_ACTION_TYPES: readonly string[];
  createPerformanceHandlerEntries(
    this: void,
    product: Readonly<Record<string, unknown>>,
  ): readonly (readonly [
    string,
    (
      context: Readonly<Record<string, unknown>>,
      action: Readonly<Record<string, unknown>>,
    ) => Promise<Readonly<Record<string, unknown>>>,
  ])[];
}

interface FoldRuntime {
  readonly PERFORMANCE_FOLD_REVISION: string;
  foldPerformanceExecution(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Readonly<{
    actual: Readonly<Record<string, unknown>>;
    fixtures: Readonly<Record<string, unknown>>;
    captures: Readonly<Record<string, unknown>>;
  }>;
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Readonly<{ passed: number; failed: number }>;
}

const handlers = handlerModule as unknown as HandlerRuntime;
const fold = foldModule as unknown as FoldRuntime;
const compare = compareModule as unknown as CompareRuntime;
const RAW_DIGEST = 'a'.repeat(64);

describe('PatchMap performance contract automation substrate', () => {
  it('shares one collision-free handler family across seven cases', () => {
    expect(PATCH_MAP_PERFORMANCE_RUNTIME_REVISION)
      .toBe('core-v2-performance-runtime/1');
    expect(PATCH_MAP_PERFORMANCE_CASE_IDS).toEqual([
      'PRF-001',
      'PRF-002',
      'PRF-003',
      'PRF-004',
      'PRF-005',
      'PRF-006',
      'PRF-009',
    ]);
    expect(handlers.PERFORMANCE_HANDLER_REVISION)
      .toBe('core-v2-performance-handlers/1');
    expect(handlers.PERFORMANCE_CASE_IDS).toEqual(PATCH_MAP_PERFORMANCE_CASE_IDS);
    expect(handlers.PERFORMANCE_ACTION_TYPES).toHaveLength(13);

    const runtime = createPatchMapPerformanceRuntime('PRF-001', {
      evidence: evidence(),
    });
    const entries = handlers.createPerformanceHandlerEntries(
      runtime.product as unknown as Readonly<Record<string, unknown>>,
    );
    expect(entries.map(([id]) => id)).toEqual(
      handlers.PERFORMANCE_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(new Set(entries.map(([id]) => id)).size).toBe(entries.length);
  });

  it('caches validated evidence and releases every runtime-owned handle', async () => {
    let readCount = 0;
    const runtime = createPatchMapPerformanceRuntime('PRF-001', {
      readEvidence: () => {
        readCount += 1;
        return Promise.resolve(evidence());
      },
    });

    const [first, second] = await Promise.all([
      runtime.product.readPerformanceEvidence(),
      runtime.product.readPerformanceEvidence(),
    ]);
    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(readCount).toBe(1);
    expect(runtime.product.runtimeProbe()).toMatchObject({
      revision: PATCH_MAP_PERFORMANCE_RUNTIME_REVISION,
      stats: { evidenceReadCount: 1, datasetBuildCount: 0 },
    });

    const cleanup = runtime.postDestroyProductProbe();
    expect(cleanup).toMatchObject({
      revision: PATCH_MAP_PERFORMANCE_CLEANUP_REVISION,
      ownership: {
        engineCount: 0,
        observerCount: 0,
        timerCount: 0,
        animationFrameCount: 0,
        listenerCount: 0,
        workerCount: 0,
      },
    });
    expect(runtime.postDestroyProductProbe()).toBe(cleanup);
    expect(() => runtime.product.readPerformanceEvidence())
      .toThrow(/after runtime release/u);
  });

  it('folds committed PRF-001 evidence and independently passes all approved assertions', async () => {
    const plan = materializePatchMapExecutableCase('PRF-001', '100', 319);
    const runtime = createPatchMapPerformanceRuntime('PRF-001', {
      evidence: evidence(),
    });
    const entries = new Map(handlers.createPerformanceHandlerEntries(
      runtime.product as unknown as Readonly<Record<string, unknown>>,
    ));
    const handler = entries.get('contract/run-performance-matrix');
    expect(handler).toBeTypeOf('function');
    const resolveDataset = () => undefined;
    const delta = await handler!({
      caseId: 'PRF-001',
      actionIndex: 0,
      signal: new AbortController().signal,
      resolveDataset,
      ensureMainEngine: () => Promise.reject(new Error('unexpected Engine request')),
      ensureSessionEngine: () => Promise.reject(new Error('unexpected session request')),
      fingerprint: (value: unknown) => JSON.stringify(value),
    }, plan.actionTrace[0]! as unknown as Readonly<Record<string, unknown>>);
    const execution = {
      caseId: 'PRF-001',
      status: 'completed',
      actionResults: [{
        index: 0,
        type: 'run-performance-matrix',
        status: 'completed',
        delta,
      }],
      eventJournal: [],
      captures: [],
      cleanup: {
        status: 'completed',
        releases: [],
        productResources: runtime.postDestroyProductProbe(),
      },
    };
    const folded = fold.foldPerformanceExecution({
      casePlan: plan,
      execution,
      provenance: { codeCommit: 'test' },
      environment: { backend: 'webgl2' },
    });
    const expected = expectedJson.cases.find(({ id }) => id === 'PRF-001');
    expect(expected).toBeDefined();
    const comparison = compare.compareObservation({
      expectedCase: expected,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    });

    expect(comparison).toMatchObject({ passed: 9, failed: 0 });
    expect(folded.actual).toMatchObject({
      provenance: { expectedEvidenceBound: true },
      environment: { contractProfileBound: true },
      outcome: {
        workloadCount: 6,
        samplesPerWorkload: 7,
        warmupsPerWorkload: 2,
      },
      resources: { leakDelta: 0 },
    });
  });

  it('folds PRF-009 semantic parity with explicit empty volatile inventories', () => {
    const plan = materializePatchMapExecutableCase('PRF-009', '100', 319);
    const digest = 'c'.repeat(64);
    const actionResults = plan.actionTrace.map((action, index) => ({
      index,
      type: action.type,
      status: 'completed',
      delta: {
        actual: index === plan.actionTrace.length - 1
          ? {
              semanticDiffCount: 0,
              expectedEvidenceDigest: digest,
              expectedEvidenceDigestBefore: digest,
              terminalProjection: {
                scene: { invalidNodeCount: 0 },
                geometry: { nonFiniteCount: 0 },
                text: { unpairedSurrogates: 0 },
                paint: { unresolvedIntentCount: 0 },
                interaction: { staleGestureCount: 0 },
                events: { unclassifiedCount: 0 },
                history: { corruptEntryCount: 0 },
              },
            }
          : {},
      },
    }));
    const folded = fold.foldPerformanceExecution({
      casePlan: plan,
      execution: {
        caseId: 'PRF-009',
        status: 'completed',
        actionResults,
        eventJournal: [],
        captures: [],
        cleanup: {
          status: 'completed',
          releases: [],
          productResources: {
            ownership: {
              engineCount: 0,
              observerCount: 0,
              timerCount: 0,
              animationFrameCount: 0,
              listenerCount: 0,
              workerCount: 0,
            },
          },
        },
      },
      provenance: {
        codeCommit: 'test',
        packedPackageSha256: 'd'.repeat(64),
      },
      environment: {
        backend: 'webgl2',
        browserVersion: 'Chromium test',
      },
    });
    const expected = expectedJson.cases.find(({ id }) => id === 'PRF-009');
    expect(expected).toBeDefined();
    expect(folded.actual).toMatchObject({
      environment: { runtimeResourceIds: [] },
      outcome: { rawTimingSamples: [] },
    });
    expect(compare.compareObservation({
      expectedCase: expected,
      actual: folded.actual,
      fixtures: folded.fixtures,
      captures: folded.captures,
    })).toMatchObject({ passed: 9, failed: 0 });
  });

  it('keeps product transport, handlers, and fold outside expected/comparator data', async () => {
    const urls = [
      new URL(
        '../../lab/patch-map/contract/performance-runtime.ts',
        import.meta.url,
      ),
      new URL(
        '../../scripts/verification/core-v2-contract/handlers/performance.mjs',
        import.meta.url,
      ),
      new URL(
        '../../scripts/verification/core-v2-contract/fold-performance.mjs',
        import.meta.url,
      ),
    ];
    const source = (await Promise.all(urls.map((url) => readFile(url, 'utf8')))).join('\n');

    expect(fold.PERFORMANCE_FOLD_REVISION).toBe('core-v2-performance-fold/1');
    expect(source).not.toMatch(
      /catalog-normalized-expected|normalizedExpected|approvedExpected|compareObservation|expectedCase/u,
    );
    expect(source).not.toMatch(/node:fs|readFile/u);
  });
});

function evidence(): Readonly<Record<string, unknown>> {
  const sizes = [100, 500, 1_000, 2_000, 5_000, 'production-shaped-workload-v1'];
  const rawTimingSamples = sizes.map((size) => ({
    size,
    warmups: [1, 1],
    samples: [1, 1, 1, 1, 1, 1, 1],
  }));
  return {
    revision: 'core-v2-contract-performance-evidence/1',
    status: 'pass',
    generatedAt: '2026-07-27T00:00:00.000Z',
    protocol: {
      warmups: 2,
      samples: 7,
      sizes,
      backend: 'webgl2',
    },
    provenance: {
      codeCommit: 'test',
      packedPackageSha256: 'b'.repeat(64),
      rawArtifactSha256: RAW_DIGEST,
      expectedEvidenceBound: true,
    },
    environment: {
      backend: 'webgl2',
      cpuProfile: 'windows-low-end-n100-8g-v1',
      contractProfileBound: true,
      browserVersion: 'Chromium test',
      runtimeResourceIds: [],
    },
    rawArtifact: {
      path: 'performance/core-v2/results/contract-performance-raw.test.json',
      sha256: RAW_DIGEST,
      sampleCount: 42,
    },
    browser: {
      actualMode: 'headless',
      requestedHeaded: true,
      errorCount: 0,
    },
    cases: {
      'PRF-001': {
        workloadCount: 6,
        samplesPerWorkload: 7,
        warmupsPerWorkload: 2,
        longTaskAtLeast100Ms: 0,
        frameGapP95Ms: 16,
        actionToVisibleP95Ms: 17,
        rawTimingSamples,
      },
      'PRF-002': {
        workloadsMeasured: sizes,
        samplesPerWorkload: 7,
        phaseCountPerWorkload: 5,
        allPhaseValuesFinite: true,
        firstUsefulFrame: {
          maxP95Ms: 120,
          semanticHash:
            '4bc16c65500b4f305114162fdc4472b45997eea7498020496072ca0b741e95c3',
        },
        longTaskAtLeast100Ms: 0,
        valuesFinite: true,
        rawTimingSamples,
      },
      'PRF-003': {
        longTaskAtLeast100Ms: 0,
        actionToVisibleP95Ms: 17,
        frameGapP95Ms: 17,
        rawTimingSamples,
      },
      'PRF-004': {
        longTaskAtLeast100Ms: 0,
        actionToVisibleP95Ms: 17,
        rawTimingSamples,
      },
      'PRF-005': {
        longTaskAtLeast100Ms: 0,
        actionToVisibleP95Ms: 17,
        complexityExponentMax: 1,
        rawTimingSamples,
      },
      'PRF-006': {
        longTaskAtLeast100Ms: 0,
        inputToVisibleP95Ms: 17,
        frameGapP95Ms: 17,
        rawTimingSamples,
      },
    },
  };
}
