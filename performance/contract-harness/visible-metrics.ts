import type { PatchMap } from '../../src/engine';
import {
  applyPatchMapPerformanceBulkPatch,
  measurePatchMapVisibleAction,
  panZoomAndSettlePatchMapBarAnimation,
  runPatchMapContinuousInteraction,
  startPatchMapBarAnimation,
  updatePatchMapRandomText,
  type PatchMapPerformanceBulkObservation,
  type PatchMapPerformanceInteractionObservation,
  type PatchMapPerformanceTextObservation,
} from '../contract-workload';
import type { ContractHarnessSpec } from './contracts';

export interface ContractVisibleMetrics {
  readonly actionToVisibleMs: number[];
  readonly frameGapsMs: number[];
  bar: Readonly<Record<string, unknown>> | null;
  readonly text: PatchMapPerformanceTextObservation[];
  readonly bulk: PatchMapPerformanceBulkObservation[];
  interaction: PatchMapPerformanceInteractionObservation | null;
}

export function createContractVisibleMetrics(): ContractVisibleMetrics {
  return {
    actionToVisibleMs: [],
    frameGapsMs: [],
    bar: null,
    text: [],
    bulk: [],
    interaction: null,
  };
}

export async function measureContractVisibleMetrics(
  engine: PatchMap,
  spec: ContractHarnessSpec,
  visible: ContractVisibleMetrics,
): Promise<void> {
  if (spec.size === 2_000) {
    const barState = await startPatchMapBarAnimation(engine, {
      size: spec.size,
      seed: spec.seed,
      targetFraction: 0.1,
      durationMs: 200,
      retargetAtMs: 100,
      diagnostics: spec.mode === 'smoke',
    });
    const settled = await panZoomAndSettlePatchMapBarAnimation(engine, barState, {
      panCss: [40, -20],
      zoomFactor: 1.5,
      anchorCss: [400, 300],
    });
    visible.actionToVisibleMs.push(...settled.actionToVisibleMs);
    visible.frameGapsMs.push(...settled.frameGapsMs);
    visible.bar = {
      targetCount: barState.targets.length,
      ...settled,
    };
    for (const [actionIndex, includeWordWrapWidth] of [false, true].entries()) {
      const observation = await updatePatchMapRandomText(engine, {
        size: spec.size,
        seed: spec.seed,
        actionIndex,
        targetFraction: 0.333,
        includeWordWrapWidth,
        timeMs: 320 + actionIndex * 16,
        diagnostics: spec.mode === 'smoke',
      });
      visible.actionToVisibleMs.push(observation.actionToVisibleMs);
      visible.frameGapsMs.push(observation.frameGapMs);
      visible.text.push(observation);
    }
    const bulkObservation = await applyPatchMapPerformanceBulkPatch(engine, {
      size: spec.size,
      seed: spec.seed,
      targetFraction: 0.1,
      strict: true,
      timeMs: 352,
      actionId: 'contract-performance-bulk-2000',
      diagnostics: spec.mode === 'smoke',
    });
    visible.actionToVisibleMs.push(bulkObservation.actionToVisibleMs);
    visible.frameGapsMs.push(bulkObservation.frameGapMs);
    visible.bulk.push(bulkObservation);
    return;
  }

  if (spec.size === 5_000) {
    const interactionObservation = await runPatchMapContinuousInteraction(engine, {
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
      diagnostics: spec.mode === 'smoke',
    });
    visible.actionToVisibleMs.push(...interactionObservation.inputToVisibleMs);
    visible.frameGapsMs.push(...interactionObservation.frameGapsMs);
    visible.interaction = interactionObservation;
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
      const observation = await applyPatchMapPerformanceBulkPatch(engine, {
        size: spec.size,
        ...options,
        diagnostics: spec.mode === 'smoke',
      });
      visible.actionToVisibleMs.push(observation.actionToVisibleMs);
      visible.frameGapsMs.push(observation.frameGapMs);
      visible.bulk.push(observation);
    }
    return;
  }

  const pan = await measurePatchMapVisibleAction(engine, 16, () =>
    engine.panViewport([4, -2], 'pointer'));
  const zoom = await measurePatchMapVisibleAction(engine, 32, () =>
    engine.zoomViewportAt({
      factor: 1.01,
      anchorCss: [400, 300],
      source: 'wheel',
    }));
  visible.actionToVisibleMs.push(pan.actionToVisibleMs, zoom.actionToVisibleMs);
  visible.frameGapsMs.push(pan.frameGapMs, zoom.frameGapMs);
  if (typeof spec.size !== 'number') return;

  const observation = await applyPatchMapPerformanceBulkPatch(engine, {
    size: spec.size,
    seed: spec.seed,
    targetFraction: 0.1,
    strict: true,
    timeMs: 48,
    actionId: `contract-performance-bulk-${spec.size}`,
    diagnostics: spec.mode === 'smoke',
  });
  visible.actionToVisibleMs.push(observation.actionToVisibleMs);
  visible.frameGapsMs.push(observation.frameGapMs);
  visible.bulk.push(observation);
}
