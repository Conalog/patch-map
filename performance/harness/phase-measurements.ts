import {
  worldToScreen,
  type EntitySnapshot,
} from '../../src/patch-map';
import type { PatchMapRuntime } from '../../src/patch-map/core';
import { percentile } from '../protocol';
import { seededRandom } from '../workloads';

export function measurePanZoom(core: PatchMapRuntime): readonly number[] {
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

export function ensureBarsVisible(core: PatchMapRuntime): {
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

export function measureBarAnimation(
  core: PatchMapRuntime,
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

export function measureFirstText(
  core: PatchMapRuntime,
  seed: number,
): { readonly entityId: string; readonly renderedCount: number; readonly phase: SplitPhase } {
  const entityId = `__patch_map_benchmark_cjk_${seed}`;
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

export function measureRandomText(
  core: PatchMapRuntime,
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
  // The current production dataset contains no source text. Always mutate the
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

export function measureHits(core: PatchMapRuntime): {
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

export function measureSelection(
  core: PatchMapRuntime,
  target: EntitySnapshot | null,
): SplitWithSelection {
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

export function framePhase(
  framesMs: readonly number[],
): { readonly framesMs: readonly number[]; readonly p95Ms: number } {
  return Object.freeze({
    framesMs: Object.freeze([...framesMs]),
    p95Ms: percentile(framesMs, 0.95),
  });
}

export function animationPhase(
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
