import {
  createCoreV2,
  worldToScreen,
  type CoreV2,
  type CoreV2RendererStrategy,
  type EntitySnapshot,
} from '../../src/core-v2';
import {
  CORE_V2_SYNTHETIC_ASSET_ALIAS,
  CORE_V2_SYNTHETIC_ASSET_DATA_URL,
  createSyntheticPatchMap,
  seededRandom,
} from './workloads';
import { percentile, type CoreV2Trial, type CoreV2Scale } from './protocol';

interface BenchmarkSpec {
  readonly strategy: CoreV2RendererStrategy;
  readonly scale: CoreV2Scale;
  readonly seed: number;
  readonly warmups: number;
  readonly measured: number;
}

interface BenchmarkResult {
  readonly warmupRaw: readonly CoreV2Trial[];
  readonly measuredRaw: readonly CoreV2Trial[];
  readonly environment: Readonly<Record<string, unknown>>;
}

declare global {
  interface Window {
    __PATCH_MAP_CORE_V2_BENCHMARK__: {
      readonly selectedStrategy: CoreV2RendererStrategy;
      run(spec: BenchmarkSpec): Promise<BenchmarkResult>;
    };
    gc?: () => void;
  }
}

const surface = requiredElement<HTMLDivElement>('surface');
const status = requiredElement<HTMLPreElement>('status');
let productionInputPromise: Promise<unknown> | null = null;

window.__PATCH_MAP_CORE_V2_BENCHMARK__ = {
  selectedStrategy: 'mesh',
  async run(spec): Promise<BenchmarkResult> {
    validateSpec(spec);
    status.textContent = `${spec.strategy}/${spec.scale}: preparing input`;
    const source = await sourceFor(spec.scale, spec.seed);
    const warmupRaw: CoreV2Trial[] = [];
    const measuredRaw: CoreV2Trial[] = [];

    for (let index = 0; index < spec.warmups; index += 1) {
      status.textContent = `${spec.strategy}/${spec.scale}: warmup ${index + 1}/${spec.warmups}`;
      warmupRaw.push(await runMeasuredTrial(source, spec, index, spec.seed + index));
    }
    for (let index = 0; index < spec.measured; index += 1) {
      status.textContent = `${spec.strategy}/${spec.scale}: measured ${index + 1}/${spec.measured}`;
      measuredRaw.push(await runMeasuredTrial(source, spec, index, spec.seed + spec.warmups + index));
    }
    status.textContent = `${spec.strategy}/${spec.scale}: complete`;
    return Object.freeze({
      warmupRaw: Object.freeze(warmupRaw),
      measuredRaw: Object.freeze(measuredRaw),
      environment: Object.freeze({
        userAgent: navigator.userAgent,
        devicePixelRatio,
        heapMethod: heapMethod(),
        gpuPrepare: 'Pixi PrepareSystem public upload wall time',
        presentation: 'manual Application.render followed by requestAnimationFrame',
      }),
    });
  },
};

async function runMeasuredTrial(
  source: unknown,
  spec: BenchmarkSpec,
  trial: number,
  seed: number,
): Promise<CoreV2Trial> {
  await forceGc();
  const heapBefore = usedHeap();
  const result = await runTrial(source, spec, trial, seed);

  // Measure only after runTrial's input clone, serialized fingerprint, CoreV2
  // instance, and Pixi application have left their lexical scope. The returned
  // numeric/raw evidence remains live by design and is included in this delta.
  await forceGc();
  const retainedJsHeapBytes = Math.max(0, usedHeap() - heapBefore);
  return Object.freeze({
    ...result,
    phases: Object.freeze({ ...result.phases, retainedJsHeapBytes }),
  });
}

async function runTrial(
  source: unknown,
  spec: BenchmarkSpec,
  trial: number,
  seed: number,
): Promise<CoreV2Trial> {
  surface.replaceChildren();
  const input = structuredClone(source);
  const serializedBefore = JSON.stringify(input);
  const core = await createCoreV2({
    target: surface,
    width: 960,
    height: 540,
    pixelRatio: 1,
    strategy: spec.strategy,
    preference: 'webgl',
    autoRender: false,
    antialias: false,
  });
  let destroyed = false;
  try {
    await core.loadAsset(CORE_V2_SYNTHETIC_ASSET_ALIAS, CORE_V2_SYNTHETIC_ASSET_DATA_URL);
    await core.loadAsset('inverter', CORE_V2_SYNTHETIC_ASSET_DATA_URL);
    const load = core.load(input);
    if (JSON.stringify(input) !== serializedBefore) throw new Error('Core v2 mutated benchmark input');

    const prepared = await core.prepare();
    const firstVisibleStarted = performance.now();
    core.flush('first-visible-frame');
    await nextAnimationFrame();
    const firstVisibleFrameMs = performance.now() - firstVisibleStarted;
    const initialTextDebug = core.renderer.debugSnapshot();
    let uploadChunks = core.renderer.debugSnapshot().uploadedChunks;
    let uploadBytes = core.renderer.debugSnapshot().uploadedBytes;

    const panZoom = measurePanZoom(core);
    const barVisibility = ensureBarsVisible(core);
    uploadChunks += barVisibility.uploadedChunks;
    uploadBytes += barVisibility.uploadedBytes;
    const fullAnimation = measureBarAnimation(core, seed ^ 0xba11, 1, 0);
    uploadChunks += fullAnimation.uploadedChunks;
    uploadBytes += fullAnimation.uploadedBytes;
    const partialAnimation = measureBarAnimation(core, seed ^ 0x10ba, 0.1, fullAnimation.clockMs);
    uploadChunks += partialAnimation.uploadedChunks;
    uploadBytes += partialAnimation.uploadedBytes;

    const firstText = measureFirstText(core, seed);
    const randomText = measureRandomText(core, seed ^ 0x7e57, firstText.entityId);
    const hit = measureHits(core);
    const selection = measureSelection(core, hit.target);
    const resizeStarted = performance.now();
    core.resize(1_024, 576, 1);
    core.flush('resize');
    const resizeMs = performance.now() - resizeStarted;
    const finalDebug = core.debugSnapshot();
    uploadChunks += finalDebug.renderer.uploadedChunks;
    uploadBytes += finalDebug.renderer.uploadedBytes;

    await core.unloadAsset(CORE_V2_SYNTHETIC_ASSET_ALIAS);
    await core.unloadAsset('inverter');
    const destroyStarted = performance.now();
    await core.destroy();
    destroyed = true;
    const destroyMs = performance.now() - destroyStarted;
    const destroyedDebug = core.debugSnapshot();

    const reinitializeStarted = performance.now();
    const reinitialized = await createCoreV2({
      target: surface,
      width: 320,
      height: 180,
      pixelRatio: 1,
      strategy: spec.strategy,
      preference: 'webgl',
      autoRender: false,
    });
    await reinitialized.destroy();
    const reinitializeMs = performance.now() - reinitializeStarted;
    const lifecycleCanvasCount = surface.querySelectorAll('canvas').length;

    return Object.freeze({
      trial,
      seed,
      phases: Object.freeze({
        applicationInitMs: core.initializationMetrics.applicationInitMs,
        normalizeMs: load.normalizeMs,
        storeLoadMs: load.storeLoadMs,
        rendererBuildMs: core.initializationMetrics.rendererBuildMs + prepared.storeSyncMs,
        gpuPrepareMs: prepared.gpuPrepareMs,
        firstVisibleFrameMs,
        panZoom: framePhase(panZoom),
        barVisibilitySetup: barVisibility.phase,
        fullBarAnimation: animationPhase(fullAnimation),
        partialBarAnimation: animationPhase(partialAnimation),
        cjkFallbackFirstRender: firstText.phase,
        randomTextChange: randomText.phase,
        hitTestBatchMs: hit.batchMs,
        hitTestPerOperationMs: hit.batchMs / hit.operations,
        selection,
        resizeMs,
        destroyMs,
        reinitializeMs,
        retainedJsHeapBytes: null,
      }),
      diagnostics: Object.freeze({
        sourceRecordCount: load.parse.identity.counts.sourceElements,
        expandedEntityCount: load.parse.identity.counts.entities,
        componentCount: load.parse.identity.counts.sourceComponents,
        relationCount: load.parse.identity.counts.relationLinks,
        aggregateRenderObjects: finalDebug.renderer.aggregateRenderObjects,
        uploadedChunks: Math.max(0, Math.round(uploadChunks)),
        uploadedBytes: Math.max(0, Math.round(uploadBytes)),
        dynamicFullUploadCount: finalDebug.renderer.dynamicFullUploadCount,
        staticInvalidatedUploadCount: finalDebug.renderer.staticInvalidatedUploadCount,
        particleFullUploadCount: finalDebug.renderer.particleFullUploadCount,
        sourceVisibleBarCount: barVisibility.sourceVisibleCount,
        barVisibilitySetupCount: barVisibility.revealedCount,
        animatedVisibleBarCount: barVisibility.animatedVisibleCount,
        fullBarAnimationUploadedChunks: fullAnimation.uploadedChunks,
        fullBarAnimationUploadedBytes: fullAnimation.uploadedBytes,
        partialBarAnimationUploadedChunks: partialAnimation.uploadedChunks,
        partialBarAnimationUploadedBytes: partialAnimation.uploadedBytes,
        uploadObservation: finalDebug.renderer.uploadObservation,
        backend: finalDebug.renderer.backend,
        strategy: spec.strategy,
        checksum: fnv1a(serializedBefore),
        hitCount: hit.hitCount,
        selectedCount: selection.selectedCount,
        diagnosticsCount: load.parse.diagnostics.length,
        bitmapTextCount: finalDebug.renderer.bitmapTextCount,
        fallbackTextCount: finalDebug.renderer.fallbackTextCount,
        cjkFallbackFirstRenderCount: firstText.renderedCount,
        randomTextChangeCount: randomText.changedCount,
        initialBitmapTextCount: initialTextDebug.bitmapTextCount,
        initialFallbackTextCount: initialTextDebug.fallbackTextCount,
        runtimeDestroyed: destroyedDebug.destroyed,
        rendererDestroyed: destroyedDebug.renderer.destroyed,
        schedulerDestroyed: destroyedDebug.scheduler.destroyed,
        lifecycleCanvasCount,
      }),
    });
  } finally {
    if (!destroyed) await core.destroy();
    surface.replaceChildren();
  }
}

function measurePanZoom(core: CoreV2): readonly number[] {
  const frames: number[] = [];
  for (let index = 0; index < 24; index += 1) {
    const started = performance.now();
    if (index % 2 === 0) core.panBy({ x: index % 4 === 0 ? 3 : -3, y: index % 3 - 1 });
    else core.zoomAt({ x: 480, y: 270 }, index % 4 === 1 ? 1.012 : 1 / 1.012);
    core.flush('pan-zoom');
    frames.push(performance.now() - started);
  }
  return Object.freeze(frames);
}

function ensureBarsVisible(core: CoreV2): {
  readonly sourceVisibleCount: number;
  readonly revealedCount: number;
  readonly animatedVisibleCount: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
  readonly phase: SplitPhase;
} {
  const operations: Array<{
    readonly type: 'visibility';
    readonly target: EntitySnapshot['ref'];
    readonly visible: true;
  }> = [];
  let sourceVisibleCount = 0;
  for (const ref of core.query({ kinds: ['bar'] })) {
    const entity = core.get(ref);
    if (!entity) continue;
    if (entity.visible) sourceVisibleCount += 1;
    else operations.push({ type: 'visibility', target: ref, visible: true });
  }
  if (operations.length === 0) {
    return Object.freeze({
      sourceVisibleCount,
      revealedCount: 0,
      animatedVisibleCount: sourceVisibleCount,
      uploadedChunks: 0,
      uploadedBytes: 0,
      phase: Object.freeze({ commitMs: 0, renderMs: 0, totalMs: 0 }),
    });
  }

  const started = performance.now();
  const commitStarted = performance.now();
  const committed = core.commit({ operations });
  const commitMs = performance.now() - commitStarted;
  const renderStarted = performance.now();
  core.flush('bar-visibility-setup');
  const renderMs = performance.now() - renderStarted;
  const renderer = core.renderer.debugSnapshot();
  return Object.freeze({
    sourceVisibleCount,
    revealedCount: committed.changed,
    animatedVisibleCount: sourceVisibleCount + committed.changed,
    uploadedChunks: renderer.uploadedChunks,
    uploadedBytes: renderer.uploadedBytes,
    phase: splitPhase(commitMs, renderMs, started),
  });
}

function measureBarAnimation(
  core: CoreV2,
  seed: number,
  fraction: number,
  startClockMs: number,
): {
  readonly scheduleMs: number;
  readonly scheduledCount: number;
  readonly framesMs: readonly number[];
  readonly clockMs: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
} {
  const scheduleStarted = performance.now();
  const scheduled = core.animateBarHeights({
    seed,
    fraction,
    durationMs: 240,
    minScale: 0.3,
    maxScale: 1.2,
  });
  const scheduleMs = performance.now() - scheduleStarted;
  const frames: number[] = [];
  let clockMs = startClockMs;
  let uploadedChunks = 0;
  let uploadedBytes = 0;
  for (let frame = 0; frame < 32 && core.activeAnimations > 0; frame += 1) {
    clockMs += frame === 0 ? 0 : 16.667;
    const started = performance.now();
    core.advance(clockMs);
    core.flush(fraction === 1 ? 'bar-animation-full' : 'bar-animation-partial');
    frames.push(performance.now() - started);
    const debug = core.renderer.debugSnapshot();
    uploadedChunks += debug.uploadedChunks;
    uploadedBytes += debug.uploadedBytes;
  }
  if (frames.length === 0) frames.push(0);
  return Object.freeze({
    scheduleMs,
    scheduledCount: scheduled.operationCount,
    framesMs: Object.freeze(frames),
    clockMs,
    uploadedChunks,
    uploadedBytes,
  });
}

function measureFirstText(
  core: CoreV2,
  seed: number,
): { readonly entityId: string; readonly renderedCount: number; readonly phase: SplitPhase } {
  const entityId = `__core_v2_benchmark_cjk_${seed}`;
  const started = performance.now();
  const commitStarted = performance.now();
  const committed = core.commit({
    operations: [{
      type: 'add',
      entity: {
        kind: 'text',
        id: entityId,
        x: 8,
        y: 8,
        width: 160,
        height: 24,
        text: `상태 ${seed % 100}`,
        color: 0x102040ff,
        fontSize: 16,
        fontFamily: 'Arial',
        visible: true,
        interactive: false,
        zIndex: 1_000,
      },
    }],
  });
  const commitMs = performance.now() - commitStarted;
  const renderStarted = performance.now();
  core.flush('first-text-render');
  const renderMs = performance.now() - renderStarted;
  return Object.freeze({
    entityId,
    renderedCount: committed.added,
    phase: splitPhase(commitMs, renderMs, started),
  });
}

function measureRandomText(
  core: CoreV2,
  seed: number,
  requiredEntityId: string,
): { readonly changedCount: number; readonly phase: SplitPhase } {
  const random = seededRandom(seed);
  const updates: Record<string, string> = {};
  let ordinal = 0;
  for (const ref of core.query({ kinds: ['text'] })) {
    if (random() > 0.1) continue;
    const entity = core.get(ref);
    if (!entity) continue;
    updates[entity.id] = `v2-${seed}-${ordinal}`;
    ordinal += 1;
  }
  // Production v0.10 currently contains no source text. Always mutate the
  // freshly inserted CJK fallback so this phase can never become a no-op.
  updates[requiredEntityId] = `변경 ${seed}`;
  const started = performance.now();
  const commitStarted = performance.now();
  const committed = core.updateTexts(updates);
  const commitMs = performance.now() - commitStarted;
  const renderStarted = performance.now();
  core.flush('random-text-change');
  const renderMs = performance.now() - renderStarted;
  return Object.freeze({
    changedCount: committed.changed,
    phase: splitPhase(commitMs, renderMs, started),
  });
}

function measureHits(core: CoreV2): {
  readonly target: EntitySnapshot | null;
  readonly operations: number;
  readonly batchMs: number;
  readonly hitCount: number;
} {
  const target = core.snapshot().entities.find((entity) => entity.visible && entity.interactive) ?? null;
  const targetPoint = target
    ? worldToScreen(
        { x: target.bounds.x + target.bounds.width / 2, y: target.bounds.y + target.bounds.height / 2 },
        core.view,
      )
    : { x: 0, y: 0 };
  const operations = 1_000;
  let hitCount = 0;
  const started = performance.now();
  for (let index = 0; index < operations; index += 1) {
    const point = index % 2 === 0 ? targetPoint : { x: -10_000 - index, y: -10_000 };
    if (core.hitTestScreen(point, { interactiveOnly: true })) hitCount += 1;
  }
  return Object.freeze({ target, operations, batchMs: performance.now() - started, hitCount });
}

interface SplitWithSelection {
  readonly commitMs: number;
  readonly renderMs: number;
  readonly totalMs: number;
  readonly selectedCount: number;
}

interface SplitPhase {
  readonly commitMs: number;
  readonly renderMs: number;
  readonly totalMs: number;
}

function splitPhase(commitMs: number, renderMs: number, started: number): SplitPhase {
  return Object.freeze({ commitMs, renderMs, totalMs: performance.now() - started });
}

function measureSelection(core: CoreV2, target: EntitySnapshot | null): SplitWithSelection {
  const point = target
    ? worldToScreen(
        { x: target.bounds.x + target.bounds.width / 2, y: target.bounds.y + target.bounds.height / 2 },
        core.view,
      )
    : { x: -10_000, y: -10_000 };
  const started = performance.now();
  const commitStarted = performance.now();
  core.selectAtScreen(point);
  const commitMs = performance.now() - commitStarted;
  const renderStarted = performance.now();
  core.flush('selection');
  const renderMs = performance.now() - renderStarted;
  const selectedCount = core.selection().refs.length;
  return Object.freeze({ commitMs, renderMs, totalMs: performance.now() - started, selectedCount });
}

function framePhase(framesMs: readonly number[]): { readonly framesMs: readonly number[]; readonly p95Ms: number } {
  return Object.freeze({ framesMs: Object.freeze([...framesMs]), p95Ms: percentile(framesMs, 0.95) });
}

function animationPhase(
  sample: {
    readonly scheduleMs: number;
    readonly scheduledCount: number;
    readonly framesMs: readonly number[];
  },
): {
  readonly scheduleMs: number;
  readonly scheduledCount: number;
  readonly framesMs: readonly number[];
  readonly p95Ms: number;
} {
  return Object.freeze({
    ...framePhase(sample.framesMs),
    scheduleMs: sample.scheduleMs,
    scheduledCount: sample.scheduledCount,
  });
}

async function sourceFor(scale: CoreV2Scale, seed: number): Promise<unknown> {
  if (scale !== 'production') return createSyntheticPatchMap(scale, seed);
  productionInputPromise ??= fetch('/lab/fixtures/production-like.json').then(async (response) => {
    if (!response.ok) throw new Error(`production fixture failed with HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  });
  return productionInputPromise;
}

function validateSpec(spec: BenchmarkSpec): void {
  if (spec.strategy !== 'mesh' && spec.strategy !== 'particle') throw new Error('invalid renderer strategy');
  if (!Number.isInteger(spec.seed)) throw new Error('benchmark seed must be an integer');
  if (spec.warmups !== 2 || spec.measured !== 7) throw new Error('benchmark protocol requires 2 warmups and 7 measured trials');
  if (spec.scale !== 'production' && ![100, 500, 1_000, 2_000, 5_000].includes(spec.scale)) {
    throw new Error('invalid benchmark scale');
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function forceGc(): Promise<void> {
  window.gc?.();
  await Promise.resolve();
  window.gc?.();
}

function usedHeap(): number {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return Number(memory?.usedJSHeapSize ?? 0);
}

function heapMethod(): string {
  return window.gc && usedHeap() > 0 ? 'window.gc + performance.memory.usedJSHeapSize' : 'unavailable-zero';
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
