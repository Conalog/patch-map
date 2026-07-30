import manifestJson from '../../../docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json';
import {
  applyPatchMapPerformanceBulkPatch,
  buildPatchMapContractPerformanceDataset,
  initializePatchMapContractPerformanceEngine,
  panZoomAndSettlePatchMapBarAnimation,
  projectPatchMapPerformanceSemantics,
  runPatchMapContinuousInteraction,
  startPatchMapBarAnimation,
  updatePatchMapRandomText,
  validatePatchMapContractPerformanceDataset,
  type PatchMapContractPerformanceSize,
  type PatchMapPerformanceBarState,
  type PatchMapPerformanceSemanticProjection,
} from '../../../performance/core-v2/contract-workload';
import type { PatchMap } from '../../../src/patch-map';

export const PATCH_MAP_PERFORMANCE_RUNTIME_REVISION =
  'core-v2-performance-runtime/1' as const;
export const PATCH_MAP_PERFORMANCE_CLEANUP_REVISION =
  'core-v2-performance-runtime-cleanup/1' as const;
export const PATCH_MAP_PERFORMANCE_EVIDENCE_PATH =
  '/performance/core-v2/results/contract-performance.json' as const;

export const PATCH_MAP_PERFORMANCE_CASE_IDS = Object.freeze([
  'PRF-001',
  'PRF-002',
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-009',
] as const);

export type PatchMapPerformanceCaseId =
  (typeof PATCH_MAP_PERFORMANCE_CASE_IDS)[number];

export interface PatchMapPerformanceRuntimeOptions {
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly readEvidence?: () => Promise<unknown>;
}

export interface PatchMapPerformanceProductAdapter {
  readPerformanceEvidence(): Promise<Readonly<Record<string, unknown>>>;
  loadSyntheticScene(input: Readonly<{
    engine: PatchMap;
    instanceId: string;
    size: number;
    seed: number;
    actionIndex?: number;
  }>): Promise<Readonly<Record<string, unknown>>>;
  startBarAnimation(input: Readonly<{
    engine: PatchMap;
    size: number;
    seed: number;
    targetFraction: number;
    durationMs: number;
    retargetAtMs: number;
  }>): Promise<PatchMapPerformanceBarState>;
  settleBarAnimation(input: Readonly<{
    engine: PatchMap;
    state: PatchMapPerformanceBarState;
    panCss: readonly [number, number];
    zoomFactor: number;
    anchorCss: readonly [number, number];
  }>): Promise<Readonly<Record<string, unknown>>>;
  updateRandomText(input: Readonly<{
    engine: PatchMap;
    size: number;
    seed: number;
    actionIndex: number;
    includeWordWrapWidth: boolean;
    timeMs: number;
  }>): Promise<Readonly<Record<string, unknown>>>;
  applyBulkPatch(input: Readonly<{
    engine: PatchMap;
    instanceId: string;
    size: number;
    seed: number;
    targetFraction: number;
    strict: boolean;
    timeMs: number;
    actionId: string;
    ensureScene: boolean;
  }>): Promise<Readonly<Record<string, unknown>>>;
  runContinuousInteraction(input: Readonly<{
    engine: PatchMap;
    instanceId: string;
    size: number;
    seed: number;
    durationMs: number;
    gestureSequence: readonly string[];
    ensureScene: boolean;
    startTimeMs?: number;
  }>): Promise<Readonly<Record<string, unknown>>>;
  runOptimizedScenarioSuite(input: Readonly<{
    engine: PatchMap;
    instanceId: string;
    seed: number;
  }>): Promise<PatchMapPerformanceSemanticProjection>;
  expectedEvidenceDigest(): string;
  runtimeProbe(): Readonly<Record<string, unknown>>;
}

export interface PatchMapPerformanceRuntime {
  readonly product: PatchMapPerformanceProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only performance adapter. It reads independently generated raw-bound
 * evidence and drives public Engine methods; normalized expected observations
 * and the contract comparator never enter this runtime.
 */
export function createPatchMapPerformanceRuntime(
  caseId: PatchMapPerformanceCaseId,
  options: PatchMapPerformanceRuntimeOptions = {},
): PatchMapPerformanceRuntime {
  requireCaseId(caseId);
  const journal: Readonly<Record<string, unknown>>[] = [];
  let sequence = 0;
  let evidenceReadCount = 0;
  let datasetBuildCount = 0;
  let productActionCount = 0;
  let released = false;
  let evidencePromise: Promise<Readonly<Record<string, unknown>>> | null = null;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const append = (event: string, details: Readonly<Record<string, unknown>>): void => {
    sequence += 1;
    journal.push(deepFreeze({ sequence, event, ...details }));
  };

  const readEvidence = options.evidence === undefined
    ? options.readEvidence ?? defaultEvidenceReader
    : () => Promise.resolve(structuredClone(options.evidence));

  const ensureEvidence = (): Promise<Readonly<Record<string, unknown>>> => {
    assertActive(released, 'read performance evidence');
    evidencePromise ??= (async () => {
      const evidence = validateEvidence(await readEvidence());
      evidenceReadCount += 1;
      append('performance-evidence-read', {
        caseId,
        evidenceRevision: evidence.revision,
        evidenceReadCount,
      });
      return evidence;
    })();
    return evidencePromise;
  };

  const ensureSyntheticScene = async (
    engine: PatchMap,
    instanceId: string,
    size: number,
    seed: number,
    actionIndex = 0,
    publicationTimeMs = 0,
  ): Promise<Readonly<Record<string, unknown>>> => {
    await initializePatchMapContractPerformanceEngine(engine, { instanceId });
    const dataset = buildPatchMapContractPerformanceDataset(
      performanceSize(size),
      seed,
      actionIndex,
    );
    datasetBuildCount += 1;
    const serializedBefore = JSON.stringify(dataset);
    const validation = validatePatchMapContractPerformanceDataset(dataset);
    const load = engine.loadDataset(dataset, {
      datasetRef: `performance:${size}:${seed}:${actionIndex}`,
    });
    const prepare = await engine.prepareScene();
    engine.publishFrame(publicationTimeMs);
    await nextAnimationFrame();
    invariant(JSON.stringify(dataset) === serializedBefore, 'performance input immutability');
    append('synthetic-scene-loaded', {
      caseId,
      size,
      seed,
      actionIndex,
      sceneRevision: load.sceneRevision,
      datasetBuildCount,
    });
    return deepFreeze({
      datasetRef: `performance:${size}:${seed}:${actionIndex}`,
      inputUnchanged: true,
      validation,
      load,
      prepare,
      product: observeEngine(engine),
    });
  };

  const product: PatchMapPerformanceProductAdapter = Object.freeze({
    readPerformanceEvidence: ensureEvidence,

    async loadSyntheticScene(
      input: Parameters<PatchMapPerformanceProductAdapter['loadSyntheticScene']>[0],
    ) {
      assertActive(released, 'load synthetic scene');
      productActionCount += 1;
      return ensureSyntheticScene(
        input.engine,
        input.instanceId,
        input.size,
        input.seed,
        input.actionIndex ?? 0,
      );
    },

    async startBarAnimation(
      input: Parameters<PatchMapPerformanceProductAdapter['startBarAnimation']>[0],
    ) {
      assertActive(released, 'start bar animation');
      productActionCount += 1;
      const state = await startPatchMapBarAnimation(input.engine, input);
      append('bar-animation-started', {
        caseId,
        targetCount: state.targets.length,
        retargetAtMs: state.retargetAtMs,
      });
      return state;
    },

    async settleBarAnimation(
      input: Parameters<PatchMapPerformanceProductAdapter['settleBarAnimation']>[0],
    ) {
      assertActive(released, 'settle bar animation');
      productActionCount += 1;
      const result = await panZoomAndSettlePatchMapBarAnimation(
        input.engine,
        input.state,
        input,
      );
      append('bar-animation-settled', {
        caseId,
        targetCount: input.state.targets.length,
        destinationsExact: result.barDestinationsExact,
      });
      return deepFreeze({
        ...result,
        product: observeEngine(input.engine),
      });
    },

    async updateRandomText(
      input: Parameters<PatchMapPerformanceProductAdapter['updateRandomText']>[0],
    ) {
      assertActive(released, 'update random text');
      productActionCount += 1;
      const result = await updatePatchMapRandomText(input.engine, {
        ...input,
        targetFraction: 0.333,
      });
      append('random-text-updated', {
        caseId,
        actionIndex: input.actionIndex,
        targetCount: result.targetCount,
      });
      return deepFreeze({
        ...result,
        product: observeEngine(input.engine),
      });
    },

    async applyBulkPatch(
      input: Parameters<PatchMapPerformanceProductAdapter['applyBulkPatch']>[0],
    ) {
      assertActive(released, 'apply bulk patch');
      productActionCount += 1;
      const setup = input.ensureScene
        ? await ensureSyntheticScene(
            input.engine,
            input.instanceId,
            input.size,
            input.seed,
          )
        : null;
      const result = await applyPatchMapPerformanceBulkPatch(input.engine, input);
      append('bulk-patch-applied', {
        caseId,
        actionId: input.actionId,
        targetCount: result.targetCount,
        sceneRevisionDelta: result.sceneRevisionDelta,
      });
      return deepFreeze({
        setup,
        ...result,
        product: observeEngine(input.engine),
      });
    },

    async runContinuousInteraction(
      input: Parameters<PatchMapPerformanceProductAdapter['runContinuousInteraction']>[0],
    ) {
      assertActive(released, 'run continuous interaction');
      productActionCount += 1;
      const setup = input.ensureScene
        ? await ensureSyntheticScene(
            input.engine,
            input.instanceId,
            input.size,
            input.seed,
          )
        : null;
      const result = await runPatchMapContinuousInteraction(input.engine, input);
      append('continuous-interaction-completed', {
        caseId,
        gestureCount: result.gestures.length,
        transformedHitMismatchCount: result.transformedHitMismatchCount,
      });
      return deepFreeze({
        setup,
        ...result,
        product: observeEngine(input.engine),
      });
    },

    async runOptimizedScenarioSuite(
      input: Parameters<PatchMapPerformanceProductAdapter['runOptimizedScenarioSuite']>[0],
    ) {
      assertActive(released, 'run optimized scenario suite');
      productActionCount += 1;
      await ensureSyntheticScene(input.engine, input.instanceId, 2_000, input.seed);
      const bar = await startPatchMapBarAnimation(input.engine, {
        size: 2_000,
        seed: input.seed,
        targetFraction: 0.1,
        durationMs: 200,
        retargetAtMs: 100,
      });
      await panZoomAndSettlePatchMapBarAnimation(input.engine, bar, {
        panCss: [40, -20],
        zoomFactor: 1.5,
        anchorCss: [400, 300],
      });
      await updatePatchMapRandomText(input.engine, {
        size: 2_000,
        seed: input.seed,
        actionIndex: 0,
        targetFraction: 0.333,
        includeWordWrapWidth: false,
        timeMs: 320,
      });
      await updatePatchMapRandomText(input.engine, {
        size: 2_000,
        seed: input.seed,
        actionIndex: 1,
        targetFraction: 0.333,
        includeWordWrapWidth: true,
        timeMs: 336,
      });
      await ensureSyntheticScene(
        input.engine,
        input.instanceId,
        5_000,
        input.seed,
        0,
        344,
      );
      await applyPatchMapPerformanceBulkPatch(input.engine, {
        size: 5_000,
        seed: input.seed,
        targetFraction: 0.1,
        strict: true,
        timeMs: 352,
        actionId: 'prf-semantic-bulk',
      });
      await applyPatchMapPerformanceBulkPatch(input.engine, {
        size: 5_000,
        seed: input.seed + 1,
        targetFraction: 1,
        strict: false,
        timeMs: 368,
        actionId: 'prf-semantic-overlay',
      });
      await runPatchMapContinuousInteraction(input.engine, {
        size: 5_000,
        seed: input.seed,
        durationMs: 5_000,
        startTimeMs: 384,
        gestureSequence: [
          'pan',
          'zoom',
          'point-hit',
          'box-select',
          'paint-select',
          'move',
          'resize',
          'rotate',
          'edge-auto-pan',
          'hover',
        ],
      });
      const projection = projectPatchMapPerformanceSemantics(input.engine);
      append('optimized-scenario-suite-completed', {
        caseId,
        instanceId: input.instanceId,
        semanticHash: projection.scene.semanticHash,
      });
      return projection;
    },

    expectedEvidenceDigest() {
      assertActive(released, 'expected evidence digest');
      return PRF_009_EXPECTED_EVIDENCE_DIGEST;
    },

    runtimeProbe() {
      assertActive(released, 'runtime probe');
      return runtimeProbe(
        caseId,
        evidenceReadCount,
        datasetBuildCount,
        productActionCount,
        journal,
      );
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      evidencePromise = null;
      append('performance-runtime-released', {
        caseId,
        evidenceReadCount,
        datasetBuildCount,
        productActionCount,
      });
      cleanupProbe = deepFreeze({
        revision: PATCH_MAP_PERFORMANCE_CLEANUP_REVISION,
        caseId,
        ownership: zeroOwnership(),
        stats: {
          evidenceReadCount,
          datasetBuildCount,
          productActionCount,
        },
        journal: journal.map((entry) => deepFreeze({ ...entry })),
      });
      return cleanupProbe;
    },
  });
}

const PRF_009_EXPECTED_EVIDENCE_DIGEST = (() => {
  const manifest = manifestJson as Readonly<{
    cases: readonly Readonly<Record<string, unknown>>[];
  }>;
  const record = manifest.cases.find((entry) => entry.id === 'PRF-009');
  invariant(record !== undefined, 'PRF-009 manifest record');
  const digest = record.expectedRecordSha256;
  invariant(
    typeof digest === 'string' && /^[a-f0-9]{64}$/u.test(digest),
    'PRF-009 expected evidence digest',
  );
  return digest;
})();

async function defaultEvidenceReader(): Promise<unknown> {
  const response = await fetch(PATCH_MAP_PERFORMANCE_EVIDENCE_PATH, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(
      `PatchMap performance evidence failed with HTTP ${response.status}`,
    );
  }
  return response.json();
}

function validateEvidence(value: unknown): Readonly<Record<string, unknown>> {
  const evidence = recordValue(value, 'performance evidence');
  invariant(
    evidence.revision === 'core-v2-contract-performance-evidence/1',
    'performance evidence revision',
  );
  const protocol = recordValue(evidence.protocol, 'performance evidence protocol');
  invariant(protocol.warmups === 2, 'performance warmup count');
  invariant(protocol.samples === 7, 'performance sample count');
  const sizes = arrayValue(protocol.sizes, 'performance sizes');
  invariant(
    JSON.stringify(sizes)
      === JSON.stringify([100, 500, 1_000, 2_000, 5_000, 'production-shaped-workload-v1']),
    'performance workload matrix',
  );
  const cases = recordValue(evidence.cases, 'performance case evidence');
  for (const id of PATCH_MAP_PERFORMANCE_CASE_IDS.filter((id) => id !== 'PRF-009')) {
    invariant(recordValue(cases[id], `${id} evidence`) !== undefined, `${id} evidence`);
  }
  return deepFreeze(structuredClone(evidence));
}

function observeEngine(engine: PatchMap): Readonly<Record<string, unknown>> {
  return deepFreeze({
    snapshot: structuredClone(engine.snapshot()),
    semantic: structuredClone(engine.semanticProbe()),
    geometry: structuredClone(engine.geometryProbe()),
    projection: structuredClone(projectPatchMapPerformanceSemantics(engine)),
  });
}

function runtimeProbe(
  caseId: PatchMapPerformanceCaseId,
  evidenceReadCount: number,
  datasetBuildCount: number,
  productActionCount: number,
  journal: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    revision: PATCH_MAP_PERFORMANCE_RUNTIME_REVISION,
    caseId,
    ownership: zeroOwnership(),
    stats: {
      evidenceReadCount,
      datasetBuildCount,
      productActionCount,
    },
    journal: journal.map((entry) => deepFreeze({ ...entry })),
  });
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return Object.freeze({
    engineCount: 0,
    observerCount: 0,
    timerCount: 0,
    animationFrameCount: 0,
    listenerCount: 0,
    workerCount: 0,
  });
}

function performanceSize(value: number): PatchMapContractPerformanceSize {
  invariant(
    [100, 500, 1_000, 2_000, 5_000].includes(value),
    'synthetic performance size',
  );
  return value as PatchMapContractPerformanceSize;
}

function requireCaseId(value: string): asserts value is PatchMapPerformanceCaseId {
  invariant(
    PATCH_MAP_PERFORMANCE_CASE_IDS.includes(value as PatchMapPerformanceCaseId),
    `unsupported performance case ${value}`,
  );
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} after runtime release`);
}

function recordValue(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), label);
  return value as Readonly<Record<string, unknown>>;
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  invariant(Array.isArray(value), label);
  return value;
}

function nextAnimationFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap performance runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
