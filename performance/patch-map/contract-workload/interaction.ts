import type {
  PatchMap,
  PatchMapEngineGeometryProbe,
  PatchMapEngineTransactionPerformanceProbe,
} from '../../../src/patch-map';

import { measurePatchMapVisibleAction } from './measurement';
import { countNonFinite, deepFreeze, staleGestureCount } from './semantics';

export interface PatchMapPerformanceInteractionObservation {
  readonly gestures: readonly string[];
  readonly inputToVisibleMs: readonly number[];
  readonly frameGapsMs: readonly number[];
  readonly transformedHitMismatchCount: number;
  readonly staleGestureCount: number;
  readonly nonFiniteCount: number;
  readonly finalSelectionIds: readonly string[];
  readonly diagnosticOperationMs?: readonly number[];
  readonly diagnosticTransactionPhases?: readonly (
    PatchMapEngineTransactionPerformanceProbe | null
  )[];
}
export async function runPatchMapContinuousInteraction(
  engine: PatchMap,
  input: Readonly<{
    size: number;
    seed: number;
    durationMs: number;
    gestureSequence: readonly string[];
    startTimeMs?: number;
    diagnostics?: boolean;
  }>,
): Promise<PatchMapPerformanceInteractionObservation> {
  const inputToVisibleMs: number[] = [];
  const frameGapsMs: number[] = [];
  const diagnosticOperationMs: number[] = [];
  const diagnosticTransactionPhases: Array<
    PatchMapEngineTransactionPerformanceProbe | null
  > = [];
  let transformedHitMismatchCount = 0;
  const selectionId = 'node-0';
  const timeStep = input.durationMs / Math.max(1, input.gestureSequence.length);
  const startTimeMs = input.startTimeMs ?? 0;

  for (const [index, gesture] of input.gestureSequence.entries()) {
    const timeMs = startTimeMs
      + Math.min(input.durationMs, Math.round(index * timeStep));
    const geometry = requiredEntityGeometry(engine.geometryProbe(), selectionId);
    const point = boundsCenter(geometry.screenBounds);
    let operationMs = 0;
    const measurement = await measurePatchMapVisibleAction(engine, timeMs, () => {
      const operationStarted = performance.now();
      try {
        switch (gesture) {
        case 'pan':
          return engine.panViewport([4, -2], 'pointer');
        case 'zoom':
          return engine.zoomViewportAt({
            factor: 1.01,
            anchorCss: [point.x, point.y],
            source: 'wheel',
          });
        case 'point-hit': {
          const hit = engine.selectionHitTestScreen(point);
          const hitId = hit.target?.ownerId ?? hit.target?.selectionId ?? null;
          if (hitId !== selectionId) transformedHitMismatchCount += 1;
          return hit;
        }
        case 'box-select':
          return engine.selectBox(
            [geometry.screenBounds[0] - 2, geometry.screenBounds[1] - 2],
            [
              geometry.screenBounds[0] + geometry.screenBounds[2] + 2,
              geometry.screenBounds[1] + geometry.screenBounds[3] + 2,
            ],
          );
        case 'paint-select':
          return engine.selectPaint([
            [[point.x - 10, point.y - 10], [point.x + 10, point.y + 10]],
          ]);
        case 'move':
          return runPerformanceTransformerGesture(
            engine,
            10_000 + index,
            'prf-interaction-move',
            'frame',
            {
              kind: 'move',
              selectionIds: [selectionId],
              deltaWorld: [1, 1],
            },
          );
        case 'resize':
          return runPerformanceTransformerGesture(
            engine,
            10_000 + index,
            'prf-interaction-resize',
            'se',
            {
              kind: 'resize',
              selectionIds: [selectionId],
              handle: 'se',
              deltaWorld: [1, 1],
            },
          );
        case 'rotate':
          return runPerformanceTransformerGesture(
            engine,
            10_000 + index,
            'prf-interaction-rotate',
            'rotate',
            {
              kind: 'rotate',
              selectionIds: [selectionId],
              deltaDegrees: 1,
            },
          );
        case 'edge-auto-pan':
          return engine.edgeAutoPanTransformer([799, 300], [4, 0]);
        case 'hover':
          return engine.hoverTooltipAtScreen(point, [160, 80]);
          default:
            throw new Error(`unsupported PRF interaction gesture: ${gesture}`);
        }
      } finally {
        operationMs = performance.now() - operationStarted;
      }
    });
    inputToVisibleMs.push(measurement.actionToVisibleMs);
    frameGapsMs.push(measurement.frameGapMs);
    if (input.diagnostics === true) {
      diagnosticOperationMs.push(operationMs);
      diagnosticTransactionPhases.push(
        gesture === 'move' || gesture === 'rotate'
          ? engine.transactionPerformanceProbe()
          : null,
      );
    }
  }

  const semantic = engine.semanticProbe();
  return deepFreeze({
    gestures: [...input.gestureSequence],
    inputToVisibleMs,
    frameGapsMs,
    transformedHitMismatchCount,
    staleGestureCount: staleGestureCount(engine),
    nonFiniteCount:
      semantic.geometry.nonFiniteValueCount
      + countNonFinite(engine.geometryProbe()),
    finalSelectionIds: [...engine.snapshot().selectionIds],
    ...(input.diagnostics === true
      ? { diagnosticOperationMs, diagnosticTransactionPhases }
      : {}),
  });
}

function requiredEntityGeometry(
  geometry: PatchMapEngineGeometryProbe | null,
  id: string,
): PatchMapEngineGeometryProbe['entities'][number] {
  const entity = geometry?.entities.find((candidate) => candidate.id === id);
  if (entity === undefined) throw new Error(`missing aggregate geometry for ${id}`);
  return entity;
}

function runPerformanceTransformerGesture(
  engine: PatchMap,
  pointerId: number,
  actionId: string,
  handle: 'frame' | 'se' | 'rotate',
  request: Parameters<PatchMap['previewTransformerEdit']>[1],
): unknown {
  engine.beginTransformerEdit({
    pointerId,
    actionId,
    kind: request.kind,
    handle,
    selectionIds: request.selectionIds,
  });
  const preview = engine.previewTransformerEdit(pointerId, request);
  if (preview.status === 'rejected' || preview.status === 'refused') {
    return engine.cancelTransformerEdit(pointerId, 'redraw');
  }
  return engine.completeTransformerEdit(pointerId);
}

function boundsCenter(bounds: readonly [number, number, number, number]): Readonly<{
  x: number;
  y: number;
}> {
  return Object.freeze({
    x: bounds[0] + bounds[2] / 2,
    y: bounds[1] + bounds[3] / 2,
  });
}
