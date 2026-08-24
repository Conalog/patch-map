import type { PatchMap } from '../../../src/patch-map';

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

export function seededIndices(size: number, fraction: number, seed: number): readonly number[] {
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

export function staleGestureCount(engine: PatchMap): number {
  const pointer = engine.pointerGestureProbe();
  const transformer = engine.transformerEditProbe();
  return pointer.staleGestureCount + transformer.staleCompletionCount;
}

export function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

export function countNonFinite(value: unknown, seen = new WeakSet<object>()): number {
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

export function rgbaHex(red: number, green: number, blue: number): string {
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}ff`;
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

export function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
