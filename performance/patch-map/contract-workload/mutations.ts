import type {
  PatchMap,
  PatchMapEngineTextProbe,
  PatchMapEngineTransactionPerformanceProbe,
  PatchMapSurfaceEntityGeometry,
} from '../../../src/patch-map';

import { measurePatchMapVisibleAction } from './measurement';
import {
  countNonFinite,
  deepFreeze,
  rgbaHex,
  sameNumber,
  seededIndices,
  staleGestureCount,
} from './semantics';

export interface PatchMapPerformanceBarState {
  readonly targets: readonly Readonly<{
    readonly ownerId: string;
    readonly componentId: 'bar';
    readonly destinationHeight: number;
  }>[];
  readonly actionToVisibleMs: readonly number[];
  readonly frameGapsMs: readonly number[];
  readonly retargetAtMs: number;
  readonly settleAtMs: number;
  readonly diagnosticTransactionPhases?: readonly (
    PatchMapEngineTransactionPerformanceProbe | null
  )[];
}
export interface PatchMapPerformanceTextObservation {
  readonly targetCount: number;
  readonly staleLayoutCountAfterFrame: number;
  readonly normalizedLinesExact: boolean;
  readonly unresolvedIntentCount: number;
  readonly nonFiniteCount: number;
  readonly actionToVisibleMs: number;
  readonly frameGapMs: number;
  readonly sceneRevisionDelta: number;
  readonly diagnosticTransactionPhase?: PatchMapEngineTransactionPerformanceProbe | null;
}

export interface PatchMapTextUpdatePublicationClassification {
  readonly visibleFrameRequired: boolean;
  readonly attachmentCurrent: boolean;
  readonly staleLayout: boolean;
  readonly unresolvedPaintIntent: boolean;
}

export interface PatchMapPerformanceBulkObservation {
  readonly targetCount: number;
  readonly actionToVisibleMs: number;
  readonly frameGapMs: number;
  readonly sceneRevisionDelta: number;
  readonly status: string;
  readonly changed: boolean;
  readonly invalidNodeCount: number;
  readonly nonFiniteCount: number;
  readonly diagnosticTransactionPhase?: PatchMapEngineTransactionPerformanceProbe | null;
}

export async function startPatchMapBarAnimation(
  engine: PatchMap,
  input: Readonly<{
    size: number;
    seed: number;
    targetFraction: number;
    durationMs: number;
    retargetAtMs: number;
    diagnostics?: boolean;
  }>,
): Promise<PatchMapPerformanceBarState> {
  const targetIndices = seededIndices(input.size, input.targetFraction, input.seed);
  const firstDestinations = targetIndices.map((index, ordinal) =>
    40 + ((index * 17 + ordinal * 13 + input.seed) % 21));
  const finalDestinations = targetIndices.map((index, ordinal) =>
    14 + ((index * 11 + ordinal * 7 + input.seed) % 19));
  const targets = targetIndices.map((index) => ({
    ownerId: `node-${index}`,
    componentId: 'bar' as const,
  }));
  const first = await measurePatchMapVisibleAction(engine, 0, () =>
    engine.updateBarHeights({
      actionId: `prf-bar-start-${input.seed}`,
      targets,
      heights: new Float64Array(firstDestinations),
    }));
  const firstTransactionProbe = input.diagnostics === true
    ? engine.transactionPerformanceProbe()
    : null;
  requireCommitted(first.result, 'initial bar animation transaction');
  const midpoint = await measurePatchMapVisibleAction(engine, input.retargetAtMs, () =>
    engine.updateBarHeights({
      actionId: `prf-bar-retarget-${input.seed}`,
      targets,
      heights: new Float64Array(finalDestinations),
    }));
  const midpointTransactionProbe = input.diagnostics === true
    ? engine.transactionPerformanceProbe()
    : null;
  requireCommitted(midpoint.result, 'retargeted bar animation transaction');
  return deepFreeze({
    targets: targetIndices.map((index, ordinal) => ({
      ownerId: `node-${index}`,
      componentId: 'bar' as const,
      destinationHeight: finalDestinations[ordinal]!,
    })),
    actionToVisibleMs: [first.actionToVisibleMs, midpoint.actionToVisibleMs],
    frameGapsMs: [first.frameGapMs, midpoint.frameGapMs],
    retargetAtMs: input.retargetAtMs,
    settleAtMs: input.retargetAtMs + input.durationMs,
    ...(input.diagnostics === true
      ? {
          diagnosticTransactionPhases: [
            firstTransactionProbe,
            midpointTransactionProbe,
          ],
        }
      : {}),
  });
}

export async function panZoomAndSettlePatchMapBarAnimation(
  engine: PatchMap,
  state: PatchMapPerformanceBarState,
  input: Readonly<{
    panCss: readonly [number, number];
    zoomFactor: number;
    anchorCss: readonly [number, number];
  }>,
): Promise<Readonly<{
  actionToVisibleMs: readonly number[];
  frameGapsMs: readonly number[];
  barDestinationsExact: boolean;
  activeAnimationsAfterSettle: number;
  nonFiniteCount: number;
  staleGestureCount: number;
  diagnosticTransactionPhases?: readonly (
    PatchMapEngineTransactionPerformanceProbe | null
  )[];
}>> {
  const actionToVisibleMs = [...state.actionToVisibleMs];
  const frameGapsMs = [...state.frameGapsMs];
  const pan = await measurePatchMapVisibleAction(engine, state.retargetAtMs + 16, () =>
    engine.panViewport(input.panCss, 'pointer'));
  actionToVisibleMs.push(pan.actionToVisibleMs);
  frameGapsMs.push(pan.frameGapMs);
  const zoom = await measurePatchMapVisibleAction(engine, state.retargetAtMs + 32, () =>
    engine.zoomViewportAt({
      factor: input.zoomFactor,
      anchorCss: input.anchorCss,
      source: 'wheel',
    }));
  actionToVisibleMs.push(zoom.actionToVisibleMs);
  frameGapsMs.push(zoom.frameGapMs);
  for (const timeMs of [
    state.retargetAtMs + 64,
    state.retargetAtMs + 128,
    state.settleAtMs,
  ]) {
    const frame = await measurePatchMapVisibleAction(engine, timeMs, () => undefined);
    actionToVisibleMs.push(frame.actionToVisibleMs);
    frameGapsMs.push(frame.frameGapMs);
  }
  const destinationsExact = state.targets.every((target) => {
    const probe = engine.barPresentationProbe({
      ownerId: target.ownerId,
      componentId: target.componentId,
    });
    return probe !== null
      && probe.active === false
      && sameNumber(probe.semanticHeight, target.destinationHeight)
      && sameNumber(probe.destinationHeight, target.destinationHeight)
      && sameNumber(probe.presentationHeight, target.destinationHeight);
  });
  const semantic = engine.semanticProbe();
  return deepFreeze({
    actionToVisibleMs,
    frameGapsMs,
    barDestinationsExact: destinationsExact,
    activeAnimationsAfterSettle: semantic.interaction.activeAnimationCount ?? 0,
    nonFiniteCount: semantic.geometry.nonFiniteValueCount,
    staleGestureCount: staleGestureCount(engine),
    ...(state.diagnosticTransactionPhases === undefined
      ? {}
      : { diagnosticTransactionPhases: state.diagnosticTransactionPhases }),
  });
}

export async function updatePatchMapRandomText(
  engine: PatchMap,
  input: Readonly<{
    size: number;
    seed: number;
    actionIndex: number;
    targetFraction: number;
    includeWordWrapWidth: boolean;
    timeMs: number;
    diagnostics?: boolean;
  }>,
): Promise<PatchMapPerformanceTextObservation> {
  const targetIndices = seededIndices(input.size, input.targetFraction, input.seed ^ input.actionIndex);
  const targets = targetIndices.map((index) => ({
    ownerId: `node-${index}`,
    componentId: 'label',
  }));
  const texts = targetIndices.map((index, ordinal) =>
    `${index}:${input.actionIndex}:${(input.seed + ordinal * 37) % 10_000}`);
  const styles = targetIndices.map((index, ordinal) => ({
    fontSize: 11 + ((index + ordinal + input.actionIndex) % 4),
    fill: rgbaHex(
          32 + ((index * 29 + ordinal) % 192),
          32 + ((index * 13 + ordinal * 3) % 192),
          32 + ((index * 7 + ordinal * 5) % 192),
        ),
    ...(input.includeWordWrapWidth
      ? { wordWrapWidth: 48 + ((index + ordinal) % 80) }
      : {}),
  }));
  const before = engine.snapshot().revisions.sceneRevision;
  const measurement = await measurePatchMapVisibleAction(engine, input.timeMs, () =>
    engine.updateTexts({
      actionId: `prf-text-${input.actionIndex}-${input.seed}`,
      targets,
      texts,
      styles,
    }));
  requireCommitted(measurement.result, 'text transaction');
  const diagnosticTransactionPhase = input.diagnostics === true
    ? engine.transactionPerformanceProbe()
    : null;
  let staleLayoutCountAfterFrame = 0;
  let normalizedLinesExact = true;
  let unresolvedIntentCount = 0;
  let nonFiniteCount = 0;
  const geometryByEntityId = new Map(
    (engine.geometryProbe()?.entities ?? []).map((entity) => [entity.id, entity] as const),
  );
  const viewportScreenBounds = engine.viewportProbe().screenBounds;
  for (const [ordinal, index] of targetIndices.entries()) {
    const expectedSource = `${index}:${input.actionIndex}:${(input.seed + ordinal * 37) % 10_000}`;
    const probe = engine.textProbe({
      kind: 'component',
      ownerId: `node-${index}`,
      id: 'label',
    });
    const publication = classifyPatchMapTextUpdatePublication(
      probe,
      probe?.entityId === null || probe?.entityId === undefined
        ? undefined
        : geometryByEntityId.get(probe.entityId),
      viewportScreenBounds,
    );
    if (publication.staleLayout) staleLayoutCountAfterFrame += 1;
    if (probe?.semantic?.source !== expectedSource) normalizedLinesExact = false;
    if (publication.unresolvedPaintIntent) {
      unresolvedIntentCount += 1;
    }
    nonFiniteCount += countNonFinite(probe?.geometry ?? null);
  }
  const semantic = engine.semanticProbe();
  unresolvedIntentCount += semantic.paint.unresolvedCount;
  nonFiniteCount += semantic.geometry.nonFiniteValueCount;
  return deepFreeze({
    targetCount: targetIndices.length,
    staleLayoutCountAfterFrame,
    normalizedLinesExact,
    unresolvedIntentCount,
    nonFiniteCount,
    actionToVisibleMs: measurement.actionToVisibleMs,
    frameGapMs: measurement.frameGapMs,
    sceneRevisionDelta: engine.snapshot().revisions.sceneRevision - before,
    ...(input.diagnostics === true ? { diagnosticTransactionPhase } : {}),
  });
}

/**
 * Distinguish a genuinely stale visible text leaf from an intentionally
 * culled leaf. A culled leaf may remain frame-pending, but its current
 * semantic/layout/renderer signature must already be attached so the next
 * visible frame cannot expose the prior glyphs.
 */
export function classifyPatchMapTextUpdatePublication(
  probe: Pick<
    PatchMapEngineTextProbe,
    'entityId' | 'publication' | 'renderer' | 'rendererPaint'
  > | null,
  geometry: Pick<PatchMapSurfaceEntityGeometry, 'screenBounds'> | undefined,
  viewportScreenBounds: readonly [number, number, number, number],
  cullPadding = 32,
): PatchMapTextUpdatePublicationClassification {
  const visibleFrameRequired = geometry === undefined ||
    boundsIntersectExpandedViewport(
      geometry.screenBounds,
      viewportScreenBounds,
      cullPadding,
    );
  const renderer = probe?.renderer ?? null;
  const attached = renderer?.attachedSignatures ?? null;
  const semantic = renderer?.semanticSignatures ?? null;
  const attachmentCurrent = renderer !== null &&
    renderer.route !== null &&
    renderer.route !== 'none' &&
    renderer.rendererKind !== 'none' &&
    renderer.objectCount === 1 &&
    attached !== null &&
    semantic !== null &&
    attached.content === semantic.content &&
    attached.style === semantic.style &&
    attached.layout === semantic.layout;
  const publicationCurrent = probe?.publication.status === 'current';
  return Object.freeze({
    visibleFrameRequired,
    attachmentCurrent,
    staleLayout: visibleFrameRequired && !publicationCurrent,
    unresolvedPaintIntent:
      probe?.rendererPaint === null || probe?.rendererPaint === undefined
        ? visibleFrameRequired || !attachmentCurrent
        : false,
  });
}

function boundsIntersectExpandedViewport(
  bounds: readonly [number, number, number, number],
  viewport: readonly [number, number, number, number],
  padding: number,
): boolean {
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError('text cull padding must be finite and non-negative');
  }
  const [x, y, width, height] = bounds;
  const [viewportX, viewportY, viewportWidth, viewportHeight] = viewport;
  return x + width >= viewportX - padding &&
    x <= viewportX + viewportWidth + padding &&
    y + height >= viewportY - padding &&
    y <= viewportY + viewportHeight + padding;
}

export async function applyPatchMapPerformanceBulkPatch(
  engine: PatchMap,
  input: Readonly<{
    size: number;
    seed: number;
    targetFraction: number;
    strict: boolean;
    timeMs: number;
    actionId: string;
    diagnostics?: boolean;
  }>,
): Promise<PatchMapPerformanceBulkObservation> {
  const targetIndices = seededIndices(input.size, input.targetFraction, input.seed);
  const before = engine.snapshot().revisions.sceneRevision;
  const measurement = await measurePatchMapVisibleAction(engine, input.timeMs, () =>
    engine.bulkPatch({
      strict: input.strict,
      actionId: input.actionId,
      targets: targetIndices.map((index) => ({ kind: 'element' as const, id: `node-${index}` })),
      changes: [{
        path: ['attrs', 'angle'],
        value: 1 + (input.seed % 7),
      }],
    }));
  if (measurement.result.status !== 'committed' && measurement.result.status !== 'unchanged') {
    throw new Error(`bulk transaction did not publish: ${measurement.result.status}`);
  }
  const diagnosticTransactionPhase = input.diagnostics === true
    ? engine.transactionPerformanceProbe()
    : null;
  const semantic = engine.semanticProbe();
  return deepFreeze({
    targetCount: targetIndices.length,
    actionToVisibleMs: measurement.actionToVisibleMs,
    frameGapMs: measurement.frameGapMs,
    sceneRevisionDelta: engine.snapshot().revisions.sceneRevision - before,
    status: measurement.result.status,
    changed: measurement.result.changed,
    invalidNodeCount: 0,
    nonFiniteCount: semantic.geometry.nonFiniteValueCount,
    ...(input.diagnostics === true ? { diagnosticTransactionPhase } : {}),
  });
}

function requireCommitted(
  result: Readonly<{ status: string; changed: boolean }>,
  label: string,
): void {
  if (result.status !== 'committed' || result.changed !== true) {
    throw new Error(`${label} must commit a change`);
  }
}
