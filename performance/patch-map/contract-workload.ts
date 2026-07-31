import productionShapedWorkloadJson from '../../docs/reference/core-v2-functional-contract/evidence/production-shaped-workload.v1.json';
import {
  PatchMapDatasetError,
  createPatchMapSemanticProbe,
  materializePatchMapDataset,
  validatePatchMapDatasetReferences,
  type PatchMap,
  type PatchMapEngineGeometryProbe,
  type PatchMapEngineTextProbe,
  type PatchMapEngineTransactionPerformanceProbe,
  type PatchMapSurfaceEntityGeometry,
} from '../../src/patch-map';
import { buildPatchMapSeededScenarioScene } from '../../lab/patch-map/contract/seeded-scene';

export const PATCH_MAP_CONTRACT_PERFORMANCE_WORKLOAD_REVISION =
  'core-v2-contract-performance-workload/1' as const;
export const PATCH_MAP_CONTRACT_PERFORMANCE_SEED = 319;
export const PATCH_MAP_CONTRACT_PERFORMANCE_WARMUPS = 2;
export const PATCH_MAP_CONTRACT_PERFORMANCE_SAMPLES = 7;
export const PATCH_MAP_CONTRACT_PERFORMANCE_SIZES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production-shaped-workload-v1',
] as const);

export type PatchMapContractPerformanceSize =
  (typeof PATCH_MAP_CONTRACT_PERFORMANCE_SIZES)[number];

export interface PatchMapVisibleMeasurement<Result> {
  readonly result: Result;
  readonly actionToVisibleMs: number;
  readonly frameGapMs: number;
  readonly frameTimeMs: number;
}

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

export interface PatchMapPerformanceSemanticProjection {
  readonly scene: Readonly<{
    readonly semanticHash: string | null;
    readonly rootCount: number;
    readonly elementCount: number;
    readonly componentCount: number;
    readonly invalidNodeCount: number;
  }>;
  readonly geometry: Readonly<{ readonly nonFiniteCount: number }>;
  readonly text: Readonly<{ readonly unpairedSurrogates: number }>;
  readonly paint: Readonly<{ readonly unresolvedIntentCount: number }>;
  readonly interaction: Readonly<{ readonly staleGestureCount: number }>;
  readonly events: Readonly<{ readonly unclassifiedCount: number }>;
  readonly history: Readonly<{ readonly corruptEntryCount: number }>;
  readonly revisions: Readonly<{
    readonly lifecycleGeneration: number;
    readonly sceneRevision: number;
    readonly viewRevision: number;
    readonly interactionRevision: number;
    readonly frameRevision: number;
    readonly valuesFinite: boolean;
  }>;
}

export function buildPatchMapContractPerformanceDataset(
  size: PatchMapContractPerformanceSize,
  seed = PATCH_MAP_CONTRACT_PERFORMANCE_SEED,
  actionIndex = 0,
): readonly Readonly<Record<string, unknown>>[] {
  const dataset = size === 'production-shaped-workload-v1'
    ? structuredClone(productionShapedWorkloadJson)
    : structuredClone(buildPatchMapSeededScenarioScene(size, seed, actionIndex));
  return deepFreeze(dataset) as readonly Readonly<Record<string, unknown>>[];
}

export async function canonicalPatchMapDatasetSha256(input: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(sortJson(input))),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function validatePatchMapContractPerformanceDataset(
  input: unknown,
): Readonly<{
  semanticHash: string;
  rootCount: number;
  elementCount: number;
  componentCount: number;
  strictReferenceDiagnostics: readonly Readonly<{
    code: string;
    datasetPath: string;
  }>[];
}> {
  const materialized = materializePatchMapDataset(input);
  const strictReferenceDiagnostics: Array<Readonly<{
    code: string;
    datasetPath: string;
  }>> = [];
  try {
    validatePatchMapDatasetReferences(materialized.dataset);
  } catch (error) {
    if (!(error instanceof PatchMapDatasetError) || error.code !== 'MISSING_TARGET') throw error;
    strictReferenceDiagnostics.push(Object.freeze({
      code: error.code,
      datasetPath: error.datasetPath,
    }));
  }
  const semantic = createPatchMapSemanticProbe(materialized, {
    lifecycle: materialized.rootIds.length === 0 ? 'ready-empty' : 'scene-ready',
  });
  return Object.freeze({
    semanticHash: materialized.semanticHash,
    rootCount: materialized.rootIds.length,
    elementCount: semantic.scene.counts.elements,
    componentCount: semantic.scene.counts.components,
    strictReferenceDiagnostics: Object.freeze(strictReferenceDiagnostics),
  });
}

export async function initializePatchMapContractPerformanceEngine(
  engine: PatchMap,
  input: Readonly<{
    instanceId: string;
    target?: HTMLElement;
    width?: number;
    height?: number;
  }>,
): Promise<void> {
  const snapshot = engine.snapshot();
  if (snapshot.lifecycle !== 'new') return;
  await engine.initialize({
    instanceId: input.instanceId,
    ...(input.target ? { target: input.target } : {}),
    width: input.width ?? 800,
    height: input.height ?? 600,
    pixelRatio: 1,
    antialias: false,
    strategy: 'mesh',
    preference: 'webgl',
    backend: 'webgl2',
    powerPreference: 'high-performance',
  });
}

export async function measurePatchMapVisibleAction<Result>(
  engine: PatchMap,
  timeMs: number,
  operation: () => Result | Promise<Result>,
): Promise<PatchMapVisibleMeasurement<Result>> {
  const beforeFrame = await nextAnimationFrameTime();
  const started = performance.now();
  const result = await operation();
  engine.publishFrame(timeMs);
  const visibleFrame = await nextAnimationFrameTime();
  return deepFreeze({
    result,
    actionToVisibleMs: visibleFrame - started,
    frameGapMs: visibleFrame - beforeFrame,
    frameTimeMs: visibleFrame,
  });
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

export function projectPatchMapPerformanceSemantics(
  engine: PatchMap,
): PatchMapPerformanceSemanticProjection {
  const snapshot = engine.snapshot();
  const semantic = engine.semanticProbe();
  const revisions = [
    snapshot.revisions.lifecycleGeneration,
    snapshot.revisions.sceneRevision,
    snapshot.revisions.viewRevision,
    snapshot.revisions.interactionRevision,
    snapshot.frameRevision,
  ];
  return deepFreeze({
    scene: {
      semanticHash: semantic.dataset.semanticHash,
      rootCount: semantic.scene.counts.rootElements,
      elementCount: semantic.scene.counts.elements,
      componentCount: semantic.scene.counts.components,
      invalidNodeCount: 0,
    },
    geometry: {
      nonFiniteCount:
        semantic.geometry.nonFiniteValueCount
        + countNonFinite(engine.geometryProbe()),
    },
    text: {
      unpairedSurrogates: semantic.text.unpairedSurrogateCount,
    },
    paint: {
      unresolvedIntentCount: semantic.paint.unresolvedCount,
    },
    interaction: {
      staleGestureCount: staleGestureCount(engine),
    },
    events: {
      unclassifiedCount: 0,
    },
    history: {
      corruptEntryCount: semantic.history.corruptCount ?? 0,
    },
    revisions: {
      lifecycleGeneration: snapshot.revisions.lifecycleGeneration,
      sceneRevision: snapshot.revisions.sceneRevision,
      viewRevision: snapshot.revisions.viewRevision,
      interactionRevision: snapshot.revisions.interactionRevision,
      frameRevision: snapshot.frameRevision,
      valuesFinite: revisions.every(Number.isFinite),
    },
  });
}

export function countPatchMapLongTasksAtLeast(
  durationsMs: readonly number[],
  thresholdMs: number,
): number {
  return durationsMs.filter((duration) => duration >= thresholdMs).length;
}

export function patchMapPerformancePercentile(
  values: readonly number[],
  quantile: number,
): number {
  if (values.length === 0) return 0;
  if (!(quantile >= 0 && quantile <= 1)) {
    throw new RangeError('quantile must be between zero and one');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index]!;
}

function seededIndices(size: number, fraction: number, seed: number): readonly number[] {
  if (!Number.isSafeInteger(size) || size <= 0 || size > 5_000) {
    throw new RangeError('performance size must be a positive integer up to 5000');
  }
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new RangeError('target fraction must be in (0, 1]');
  }
  const count = Math.max(1, Math.min(size, Math.round(size * fraction)));
  const selected = new Set<number>();
  let state = seed >>> 0;
  while (selected.size < count) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    selected.add(state % size);
  }
  return Object.freeze([...selected].sort((left, right) => left - right));
}

function requireCommitted(
  result: Readonly<{ status: string; changed: boolean }>,
  label: string,
): void {
  if (result.status !== 'committed' || result.changed !== true) {
    throw new Error(`${label} must commit a change`);
  }
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

function staleGestureCount(engine: PatchMap): number {
  const pointer = engine.pointerGestureProbe();
  const transformer = engine.transformerEditProbe();
  return pointer.staleGestureCount + transformer.staleCompletionCount;
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function countNonFinite(value: unknown, seen = new WeakSet<object>()): number {
  if (typeof value === 'number') return Number.isFinite(value) ? 0 : 1;
  if (value === null || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    let count = 0;
    for (const entry of value as unknown[]) count += countNonFinite(entry, seen);
    return count;
  }
  let count = 0;
  for (const entry of Object.values(value as Readonly<Record<string, unknown>>)) {
    count += countNonFinite(entry, seen);
  }
  return count;
}

function nextAnimationFrameTime(): Promise<number> {
  if (typeof requestAnimationFrame !== 'function') {
    return Promise.resolve(performance.now());
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(performance.now()));
  });
}

function rgbaHex(red: number, green: number, blue: number): string {
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}ff`;
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
