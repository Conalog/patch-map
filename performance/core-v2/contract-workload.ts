import productionShapedWorkloadJson from '../../docs/reference/core-v2-functional-contract/evidence/production-shaped-workload.v1.json';
import {
  CoreV2DatasetError,
  CoreV2Engine,
  createCoreV2SemanticProbe,
  materializeCoreV2Dataset,
  validateCoreV2DatasetReferences,
  type CoreV2EngineGeometryProbe,
  type CoreV2MutationOperation,
  type CoreV2SemanticProductProbe,
} from '../../src/core-v2';
import { buildCoreV2SeededScenarioScene } from '../../lab/performance-v2/contract/seeded-scene';

export const CORE_V2_CONTRACT_PERFORMANCE_WORKLOAD_REVISION =
  'core-v2-contract-performance-workload/1' as const;
export const CORE_V2_CONTRACT_PERFORMANCE_SEED = 319;
export const CORE_V2_CONTRACT_PERFORMANCE_WARMUPS = 2;
export const CORE_V2_CONTRACT_PERFORMANCE_SAMPLES = 7;
export const CORE_V2_CONTRACT_PERFORMANCE_SIZES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production-shaped-workload-v1',
] as const);

export type CoreV2ContractPerformanceSize =
  (typeof CORE_V2_CONTRACT_PERFORMANCE_SIZES)[number];

export interface CoreV2VisibleMeasurement<Result> {
  readonly result: Result;
  readonly actionToVisibleMs: number;
  readonly frameGapMs: number;
  readonly frameTimeMs: number;
}

export interface CoreV2PerformanceBarState {
  readonly targets: readonly Readonly<{
    readonly ownerId: string;
    readonly componentId: 'bar';
    readonly destinationHeight: number;
  }>[];
  readonly actionToVisibleMs: readonly number[];
  readonly frameGapsMs: readonly number[];
  readonly retargetAtMs: number;
  readonly settleAtMs: number;
}

export interface CoreV2PerformanceTextObservation {
  readonly targetCount: number;
  readonly staleLayoutCountAfterFrame: number;
  readonly normalizedLinesExact: boolean;
  readonly unresolvedIntentCount: number;
  readonly nonFiniteCount: number;
  readonly actionToVisibleMs: number;
  readonly frameGapMs: number;
  readonly sceneRevisionDelta: number;
}

export interface CoreV2PerformanceBulkObservation {
  readonly targetCount: number;
  readonly actionToVisibleMs: number;
  readonly frameGapMs: number;
  readonly sceneRevisionDelta: number;
  readonly status: string;
  readonly changed: boolean;
  readonly invalidNodeCount: number;
  readonly nonFiniteCount: number;
}

export interface CoreV2PerformanceInteractionObservation {
  readonly gestures: readonly string[];
  readonly inputToVisibleMs: readonly number[];
  readonly frameGapsMs: readonly number[];
  readonly transformedHitMismatchCount: number;
  readonly staleGestureCount: number;
  readonly nonFiniteCount: number;
  readonly finalSelectionIds: readonly string[];
}

export interface CoreV2PerformanceSemanticProjection {
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

export function buildCoreV2ContractPerformanceDataset(
  size: CoreV2ContractPerformanceSize,
  seed = CORE_V2_CONTRACT_PERFORMANCE_SEED,
  actionIndex = 0,
): readonly Readonly<Record<string, unknown>>[] {
  const dataset = size === 'production-shaped-workload-v1'
    ? structuredClone(productionShapedWorkloadJson)
    : structuredClone(buildCoreV2SeededScenarioScene(size, seed, actionIndex));
  return deepFreeze(dataset) as readonly Readonly<Record<string, unknown>>[];
}

export async function canonicalCoreV2DatasetSha256(input: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(sortJson(input))),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function validateCoreV2ContractPerformanceDataset(
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
  const materialized = materializeCoreV2Dataset(input);
  const strictReferenceDiagnostics: Array<Readonly<{
    code: string;
    datasetPath: string;
  }>> = [];
  try {
    validateCoreV2DatasetReferences(materialized.dataset);
  } catch (error) {
    if (!(error instanceof CoreV2DatasetError) || error.code !== 'MISSING_TARGET') throw error;
    strictReferenceDiagnostics.push(Object.freeze({
      code: error.code,
      datasetPath: error.datasetPath,
    }));
  }
  const semantic = createCoreV2SemanticProbe(materialized, {
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

export async function initializeCoreV2ContractPerformanceEngine(
  engine: CoreV2Engine,
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

export async function measureCoreV2VisibleAction<Result>(
  engine: CoreV2Engine,
  timeMs: number,
  operation: () => Result | Promise<Result>,
): Promise<CoreV2VisibleMeasurement<Result>> {
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

export async function startCoreV2BarAnimation(
  engine: CoreV2Engine,
  input: Readonly<{
    size: number;
    seed: number;
    targetFraction: number;
    durationMs: number;
    retargetAtMs: number;
  }>,
): Promise<CoreV2PerformanceBarState> {
  const targetIndices = seededIndices(input.size, input.targetFraction, input.seed);
  const firstDestinations = targetIndices.map((index, ordinal) =>
    40 + ((index * 17 + ordinal * 13 + input.seed) % 21));
  const finalDestinations = targetIndices.map((index, ordinal) =>
    14 + ((index * 11 + ordinal * 7 + input.seed) % 19));
  const first = await measureCoreV2VisibleAction(engine, 0, () =>
    engine.transact({
      strict: true,
      actionId: `prf-bar-start-${input.seed}`,
      operations: barOperations(targetIndices, firstDestinations),
    }));
  requireCommitted(first.result, 'initial bar animation transaction');
  const midpoint = await measureCoreV2VisibleAction(engine, input.retargetAtMs, () =>
    engine.transact({
      strict: true,
      actionId: `prf-bar-retarget-${input.seed}`,
      operations: barOperations(targetIndices, finalDestinations),
    }));
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
  });
}

export async function panZoomAndSettleCoreV2BarAnimation(
  engine: CoreV2Engine,
  state: CoreV2PerformanceBarState,
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
}>> {
  const actionToVisibleMs = [...state.actionToVisibleMs];
  const frameGapsMs = [...state.frameGapsMs];
  const pan = await measureCoreV2VisibleAction(engine, state.retargetAtMs + 16, () =>
    engine.panViewport(input.panCss, 'pointer'));
  actionToVisibleMs.push(pan.actionToVisibleMs);
  frameGapsMs.push(pan.frameGapMs);
  const zoom = await measureCoreV2VisibleAction(engine, state.retargetAtMs + 32, () =>
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
    const frame = await measureCoreV2VisibleAction(engine, timeMs, () => undefined);
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
  });
}

export async function updateCoreV2RandomText(
  engine: CoreV2Engine,
  input: Readonly<{
    size: number;
    seed: number;
    actionIndex: number;
    targetFraction: number;
    includeWordWrapWidth: boolean;
    timeMs: number;
  }>,
): Promise<CoreV2PerformanceTextObservation> {
  const targetIndices = seededIndices(input.size, input.targetFraction, input.seed ^ input.actionIndex);
  const operations: CoreV2MutationOperation[] = targetIndices.map((index, ordinal) => ({
    op: 'merge',
    target: { kind: 'component', ownerId: `node-${index}`, id: 'label' },
    changes: [
      {
        path: ['text'],
        value: `${index}:${input.actionIndex}:${(input.seed + ordinal * 37) % 10_000}`,
      },
      {
        path: ['style', 'fontSize'],
        value: 11 + ((index + ordinal + input.actionIndex) % 4),
      },
      {
        path: ['style', 'fill'],
        value: rgbaHex(
          32 + ((index * 29 + ordinal) % 192),
          32 + ((index * 13 + ordinal * 3) % 192),
          32 + ((index * 7 + ordinal * 5) % 192),
        ),
      },
      ...(input.includeWordWrapWidth
        ? [{ path: ['style', 'wordWrapWidth'] as const, value: 48 + ((index + ordinal) % 80) }]
        : []),
    ],
  }));
  const before = engine.snapshot().revisions.sceneRevision;
  const measurement = await measureCoreV2VisibleAction(engine, input.timeMs, () =>
    engine.transact({
      strict: true,
      actionId: `prf-text-${input.actionIndex}-${input.seed}`,
      operations,
    }));
  requireCommitted(measurement.result, 'text transaction');
  let staleLayoutCountAfterFrame = 0;
  let normalizedLinesExact = true;
  let unresolvedIntentCount = 0;
  let nonFiniteCount = 0;
  for (const [ordinal, index] of targetIndices.entries()) {
    const expectedSource = `${index}:${input.actionIndex}:${(input.seed + ordinal * 37) % 10_000}`;
    const probe = engine.textProbe({
      kind: 'component',
      ownerId: `node-${index}`,
      id: 'label',
    });
    if (probe?.publication.status !== 'current') staleLayoutCountAfterFrame += 1;
    if (probe?.semantic?.source !== expectedSource) normalizedLinesExact = false;
    if (probe?.rendererPaint === null || probe?.rendererPaint === undefined) {
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
  });
}

export async function applyCoreV2PerformanceBulkPatch(
  engine: CoreV2Engine,
  input: Readonly<{
    size: number;
    seed: number;
    targetFraction: number;
    strict: boolean;
    timeMs: number;
    actionId: string;
  }>,
): Promise<CoreV2PerformanceBulkObservation> {
  const targetIndices = seededIndices(input.size, input.targetFraction, input.seed);
  const before = engine.snapshot().revisions.sceneRevision;
  const measurement = await measureCoreV2VisibleAction(engine, input.timeMs, () =>
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
  });
}

export async function runCoreV2ContinuousInteraction(
  engine: CoreV2Engine,
  input: Readonly<{
    size: number;
    seed: number;
    durationMs: number;
    gestureSequence: readonly string[];
  }>,
): Promise<CoreV2PerformanceInteractionObservation> {
  const inputToVisibleMs: number[] = [];
  const frameGapsMs: number[] = [];
  let transformedHitMismatchCount = 0;
  const selectionId = 'node-0';
  const timeStep = input.durationMs / Math.max(1, input.gestureSequence.length);

  for (const [index, gesture] of input.gestureSequence.entries()) {
    const timeMs = Math.min(input.durationMs, Math.round(index * timeStep));
    const geometry = requiredEntityGeometry(engine.geometryProbe(), selectionId);
    const point = boundsCenter(geometry.screenBounds);
    const measurement = await measureCoreV2VisibleAction(engine, timeMs, () => {
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
          return engine.applyTransformerEdit({
            kind: 'move',
            selectionIds: [selectionId],
            deltaWorld: [1, 1],
          }, { actionId: 'prf-interaction-move' });
        case 'resize':
          return engine.applyTransformerEdit({
            kind: 'resize',
            selectionIds: [selectionId],
            handle: 'se',
            deltaWorld: [1, 1],
          }, { actionId: 'prf-interaction-resize' });
        case 'rotate':
          return engine.applyTransformerEdit({
            kind: 'rotate',
            selectionIds: [selectionId],
            deltaDegrees: 1,
          }, { actionId: 'prf-interaction-rotate' });
        case 'edge-auto-pan':
          return engine.edgeAutoPanTransformer([799, 300], [4, 0]);
        case 'hover':
          return engine.hoverTooltipAtScreen(point, [160, 80]);
        default:
          throw new Error(`unsupported PRF interaction gesture: ${gesture}`);
      }
    });
    inputToVisibleMs.push(measurement.actionToVisibleMs);
    frameGapsMs.push(measurement.frameGapMs);
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
  });
}

export function projectCoreV2PerformanceSemantics(
  engine: CoreV2Engine,
): CoreV2PerformanceSemanticProjection {
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

export function countCoreV2LongTasksAtLeast(
  durationsMs: readonly number[],
  thresholdMs: number,
): number {
  return durationsMs.filter((duration) => duration >= thresholdMs).length;
}

export function coreV2PerformancePercentile(
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

function barOperations(
  targetIndices: readonly number[],
  destinations: readonly number[],
): readonly CoreV2MutationOperation[] {
  return targetIndices.map((index, ordinal) => ({
    op: 'merge',
    target: { kind: 'component', ownerId: `node-${index}`, id: 'bar' },
    changes: [{
      path: ['size', 'height'],
      value: destinations[ordinal]!,
    }],
  }));
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
  geometry: CoreV2EngineGeometryProbe | null,
  id: string,
): CoreV2EngineGeometryProbe['entities'][number] {
  const entity = geometry?.entities.find((candidate) => candidate.id === id);
  if (entity === undefined) throw new Error(`missing aggregate geometry for ${id}`);
  return entity;
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

function staleGestureCount(engine: CoreV2Engine): number {
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
    return value.reduce((count, entry) => count + countNonFinite(entry, seen), 0);
  }
  return Object.values(value).reduce(
    (count, entry) => count + countNonFinite(entry, seen),
    0,
  );
}

function nextAnimationFrameTime(): Promise<number> {
  if (typeof requestAnimationFrame !== 'function') {
    return Promise.resolve(performance.now());
  }
  return new Promise((resolve) => requestAnimationFrame(resolve));
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
