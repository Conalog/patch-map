import {
  CoreV2Engine,
  materializeCoreV2Dataset,
} from '../../src/core-v2';
import {
  CORE_V2_CONTRACT_PERFORMANCE_SAMPLES,
  CORE_V2_CONTRACT_PERFORMANCE_SEED,
  CORE_V2_CONTRACT_PERFORMANCE_WARMUPS,
  applyCoreV2PerformanceBulkPatch,
  buildCoreV2ContractPerformanceDataset,
  canonicalCoreV2DatasetSha256,
  initializeCoreV2ContractPerformanceEngine,
  measureCoreV2VisibleAction,
  panZoomAndSettleCoreV2BarAnimation,
  projectCoreV2PerformanceSemantics,
  runCoreV2ContinuousInteraction,
  startCoreV2BarAnimation,
  updateCoreV2RandomText,
  validateCoreV2ContractPerformanceDataset,
  type CoreV2ContractPerformanceSize,
  type CoreV2PerformanceBulkObservation,
  type CoreV2PerformanceInteractionObservation,
  type CoreV2PerformanceTextObservation,
} from './contract-workload';

interface ContractHarnessSpec {
  readonly size: CoreV2ContractPerformanceSize;
  readonly seed: number;
  readonly warmups: number;
  readonly measured: number;
  readonly mode?: 'contract' | 'smoke';
}

interface ContractHarnessResult {
  readonly warmupRaw: readonly Readonly<Record<string, unknown>>[];
  readonly measuredRaw: readonly Readonly<Record<string, unknown>>[];
  readonly environment: Readonly<Record<string, unknown>>;
}

declare global {
  interface Window {
    __PATCH_MAP_CORE_V2_CONTRACT_PERFORMANCE__: {
      run(spec: ContractHarnessSpec): Promise<ContractHarnessResult>;
    };
    gc?: () => void;
  }
}

const surface = requiredElement<HTMLDivElement>('surface');
const status = requiredElement<HTMLPreElement>('status');

window.__PATCH_MAP_CORE_V2_CONTRACT_PERFORMANCE__ = Object.freeze({
  async run(spec: ContractHarnessSpec): Promise<ContractHarnessResult> {
    validateSpec(spec);
    const warmupRaw: Readonly<Record<string, unknown>>[] = [];
    const measuredRaw: Readonly<Record<string, unknown>>[] = [];
    for (let index = 0; index < spec.warmups; index += 1) {
      status.textContent =
        `${String(spec.size)} warmup ${index + 1}/${spec.warmups}`;
      warmupRaw.push(await runMeasuredTrial(spec, index, true));
    }
    for (let index = 0; index < spec.measured; index += 1) {
      status.textContent =
        `${String(spec.size)} measured ${index + 1}/${spec.measured}`;
      measuredRaw.push(await runMeasuredTrial(spec, index, false));
    }
    status.textContent = `${String(spec.size)} complete`;
    return deepFreeze({
      warmupRaw,
      measuredRaw,
      environment: {
        userAgent: navigator.userAgent,
        devicePixelRatio,
        heapMethod: heapMethod(),
        backendRequest: 'webgl2',
        rendererPreference: 'webgl',
        framePublication: 'manual Engine.publishFrame plus requestAnimationFrame',
      },
    });
  },
});

async function runMeasuredTrial(
  spec: ContractHarnessSpec,
  trial: number,
  warmup: boolean,
): Promise<Readonly<Record<string, unknown>>> {
  await forceGc();
  const heapBefore = usedHeap();
  const trialResult = await runTrial(spec, trial, warmup);
  await forceGc();
  return deepFreeze({
    ...trialResult,
    retainedJsHeapBytes: Math.max(0, usedHeap() - heapBefore),
  });
}

async function runTrial(
  spec: ContractHarnessSpec,
  trial: number,
  warmup: boolean,
): Promise<Readonly<Record<string, unknown>>> {
  surface.replaceChildren();
  const source = buildCoreV2ContractPerformanceDataset(spec.size, spec.seed);
  const input = structuredClone(source);
  const serializedBefore = JSON.stringify(input);
  const longTaskDurationsMs: number[] = [];
  const observer = createLongTaskObserver(longTaskDurationsMs);
  const engine = new CoreV2Engine();
  let destroyed = false;
  const actionToVisibleMs: number[] = [];
  const frameGapsMs: number[] = [];
  let bar: Readonly<Record<string, unknown>> | null = null;
  const text: CoreV2PerformanceTextObservation[] = [];
  const bulk: CoreV2PerformanceBulkObservation[] = [];
  let interaction: CoreV2PerformanceInteractionObservation | null = null;

  try {
    const validateStarted = performance.now();
    const validation = validateCoreV2ContractPerformanceDataset(input);
    const validateMs = performance.now() - validateStarted;

    const materializeStarted = performance.now();
    const materialized = materializeCoreV2Dataset(input);
    const materializeMs = performance.now() - materializeStarted;
    const canonicalDatasetSha256 = await canonicalCoreV2DatasetSha256(input);

    const assetStarted = performance.now();
    await initializeCoreV2ContractPerformanceEngine(engine, {
      instanceId:
        `contract-${String(spec.size)}-${warmup ? 'warmup' : 'measured'}-${trial}`,
      target: surface,
    });
    const assetMs = performance.now() - assetStarted;

    const storeStarted = performance.now();
    const load = engine.loadDataset(input, {
      datasetRef: `contract-performance:${String(spec.size)}:${spec.seed}`,
    });
    const storeLoadMs = performance.now() - storeStarted;

    const prepareStarted = performance.now();
    const prepare = await engine.prepareScene();
    const uploadPrepareMs = performance.now() - prepareStarted;

    const firstFrameStarted = performance.now();
    engine.publishFrame(0);
    await nextAnimationFrame();
    const firstUsefulFrameMs = performance.now() - firstFrameStarted;

    if (spec.size === 2_000) {
      const barState = await startCoreV2BarAnimation(engine, {
        size: spec.size,
        seed: spec.seed,
        targetFraction: 0.1,
        durationMs: 200,
        retargetAtMs: 100,
      });
      const settled = await panZoomAndSettleCoreV2BarAnimation(engine, barState, {
        panCss: [40, -20],
        zoomFactor: 1.5,
        anchorCss: [400, 300],
      });
      actionToVisibleMs.push(...settled.actionToVisibleMs);
      frameGapsMs.push(...settled.frameGapsMs);
      bar = {
        targetCount: barState.targets.length,
        ...settled,
      };
      for (const [actionIndex, includeWordWrapWidth] of [false, true].entries()) {
        const observation = await updateCoreV2RandomText(engine, {
          size: spec.size,
          seed: spec.seed,
          actionIndex,
          targetFraction: 0.333,
          includeWordWrapWidth,
          timeMs: 320 + actionIndex * 16,
        });
        actionToVisibleMs.push(observation.actionToVisibleMs);
        frameGapsMs.push(observation.frameGapMs);
        text.push(observation);
      }
      const bulkObservation = await applyCoreV2PerformanceBulkPatch(engine, {
        size: spec.size,
        seed: spec.seed,
        targetFraction: 0.1,
        strict: true,
        timeMs: 352,
        actionId: 'contract-performance-bulk-2000',
      });
      actionToVisibleMs.push(bulkObservation.actionToVisibleMs);
      frameGapsMs.push(bulkObservation.frameGapMs);
      bulk.push(bulkObservation);
    } else if (spec.size === 5_000) {
      const interactionObservation = await runCoreV2ContinuousInteraction(engine, {
        size: spec.size,
        seed: spec.seed,
        durationMs: 5_000,
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
      actionToVisibleMs.push(...interactionObservation.inputToVisibleMs);
      frameGapsMs.push(...interactionObservation.frameGapsMs);
      interaction = interactionObservation;
      for (const options of [
        {
          targetFraction: 0.1,
          strict: true,
          timeMs: 5_016,
          actionId: 'contract-performance-bulk',
          seed: spec.seed,
        },
        {
          targetFraction: 1,
          strict: false,
          timeMs: 5_032,
          actionId: 'contract-performance-overlay',
          seed: spec.seed + 1,
        },
      ] as const) {
        const observation = await applyCoreV2PerformanceBulkPatch(engine, {
          size: spec.size,
          ...options,
        });
        actionToVisibleMs.push(observation.actionToVisibleMs);
        frameGapsMs.push(observation.frameGapMs);
        bulk.push(observation);
      }
    } else {
      const pan = await measureCoreV2VisibleAction(engine, 16, () =>
        engine.panViewport([4, -2], 'pointer'));
      const zoom = await measureCoreV2VisibleAction(engine, 32, () =>
        engine.zoomViewportAt({
          factor: 1.01,
          anchorCss: [400, 300],
          source: 'wheel',
        }));
      actionToVisibleMs.push(pan.actionToVisibleMs, zoom.actionToVisibleMs);
      frameGapsMs.push(pan.frameGapMs, zoom.frameGapMs);
      if (typeof spec.size === 'number') {
        const observation = await applyCoreV2PerformanceBulkPatch(engine, {
          size: spec.size,
          seed: spec.seed,
          targetFraction: 0.1,
          strict: true,
          timeMs: 48,
          actionId: `contract-performance-bulk-${spec.size}`,
        });
        actionToVisibleMs.push(observation.actionToVisibleMs);
        frameGapsMs.push(observation.frameGapMs);
        bulk.push(observation);
      }
    }

    const projection = projectCoreV2PerformanceSemantics(engine);
    const active = engine.snapshot();
    const destroyStarted = performance.now();
    const destroyReturned = await engine.destroy();
    destroyed = true;
    const destroyMs = performance.now() - destroyStarted;
    await nextAnimationFrame();
    if (observer !== null) {
      for (const entry of observer.takeRecords()) {
        longTaskDurationsMs.push(entry.duration);
      }
    }
    const terminal = engine.snapshot();

    return deepFreeze({
      trial,
      warmup,
      seed: spec.seed,
      size: spec.size,
      phases: {
        validateMs,
        materializeMs,
        assetMs,
        storeLoadMs,
        uploadPrepareMs,
        firstUsefulFrameMs,
        destroyMs,
      },
      visible: {
        actionToVisibleMs,
        frameGapsMs,
        bar,
        text,
        bulk,
        interaction,
      },
      longTaskDurationsMs,
      diagnostics: {
        inputUnchanged: JSON.stringify(input) === serializedBefore,
        canonicalDatasetSha256,
        validation,
        materializedSemanticHash: materialized.semanticHash,
        load,
        prepare,
        projection,
        requestedBackend: 'webgl2',
        rendererBackend: active.resources.renderer?.backend ?? null,
        lifecycleBeforeDestroy: active.lifecycle,
        destroyReturned,
        lifecycleAfterDestroy: terminal.lifecycle,
        canvasCountAfterDestroy: terminal.resources.canvasCount,
        pendingWorkAfterDestroy: terminal.pendingWork,
        subscriptionCountAfterDestroy: terminal.resources.subscriptions.active,
        surfaceChildCountAfterDestroy: surface.childElementCount,
        revisionValuesFinite: Object.values(active.revisions).every(Number.isFinite)
          && Number.isFinite(active.frameRevision),
      },
    });
  } finally {
    observer?.disconnect();
    if (!destroyed) await engine.destroy().catch(() => undefined);
    surface.replaceChildren();
  }
}

function createLongTaskObserver(durations: number[]): PerformanceObserver | null {
  if (typeof PerformanceObserver !== 'function') return null;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
    return observer;
  } catch {
    return null;
  }
}

function validateSpec(spec: ContractHarnessSpec): void {
  if (
    ![100, 500, 1_000, 2_000, 5_000, 'production-shaped-workload-v1']
      .includes(spec.size)
  ) {
    throw new Error(`unsupported contract performance size ${String(spec.size)}`);
  }
  const validCounts = spec.mode === 'smoke'
    ? spec.warmups === 0 && spec.measured === 1
    : (
        spec.warmups === CORE_V2_CONTRACT_PERFORMANCE_WARMUPS
        && spec.measured === CORE_V2_CONTRACT_PERFORMANCE_SAMPLES
      );
  if (spec.seed !== CORE_V2_CONTRACT_PERFORMANCE_SEED || !validCounts) {
    throw new Error('contract performance protocol drift');
  }
}

async function forceGc(): Promise<void> {
  window.gc?.();
  await Promise.resolve();
  window.gc?.();
}

function usedHeap(): number {
  const memory = (
    performance as Performance & {
      memory?: Readonly<{ usedJSHeapSize: number }>;
    }
  ).memory;
  return memory?.usedJSHeapSize ?? 0;
}

function heapMethod(): string {
  return typeof window.gc === 'function' && usedHeap() > 0
    ? 'performance.memory after exposed GC'
    : 'unavailable';
}

function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function requiredElement<ElementType extends HTMLElement>(id: string): ElementType {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing contract performance element #${id}`);
  }
  return element as ElementType;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
