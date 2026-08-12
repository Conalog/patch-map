import type { SlotRange } from '../../dense/contracts';
import {
  RenderKind,
  type RenderStoreView,
} from '../../dense/renderer-types';
import {
  writePatchMapSlotQuad,
  type PatchMapProjectionRenderContext,
  type PatchMapResolvedRenderQuadScratch,
} from '../types';
import {
  isDrawable,
  resolveBarProgress,
  writeRoundedBarPositionValues,
  type BarPrimitiveBinding,
  type BarSlotBinding,
} from './chunk-geometry';
import {
  clamp01,
  writeExactQuadPositionValues,
} from './geometry';

interface RetainedBarPositionRecord {
  readonly geometry: {
    readonly positions: Float32Array;
  };
}

export function dirtyChunkIndices(
  capacity: number,
  chunkSize: number,
  changedRanges: readonly SlotRange[],
): readonly number[] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError('chunkSize must be a positive safe integer');
  }
  const resolvedCapacity = Math.max(0, Math.floor(capacity));
  const chunks = new Set<number>();
  for (const range of changedRanges) {
    const start = Math.max(0, Math.min(resolvedCapacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(resolvedCapacity, Math.ceil(range.end)));
    if (start === end) continue;
    const first = Math.floor(start / chunkSize);
    const last = Math.floor((end - 1) / chunkSize);
    for (let chunk = first; chunk <= last; chunk += 1) chunks.add(chunk);
  }
  return [...chunks].sort((left, right) => left - right);
}

export function dirtyBarSlotsByChunk(
  store: RenderStoreView,
  chunkSize: number,
  changedRanges: readonly SlotRange[],
): ReadonlyMap<number, readonly number[]> {
  const slotsByChunk = new Map<number, Set<number>>();
  for (const range of changedRanges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      if (
        (store.alive[slot] as number) === 0 ||
        (store.kind[slot] as number) !== RenderKind.Bar
      ) {
        continue;
      }
      const chunkIndex = Math.floor(slot / chunkSize);
      const slots = slotsByChunk.get(chunkIndex) ?? new Set<number>();
      slots.add(slot);
      slotsByChunk.set(chunkIndex, slots);
    }
  }
  return new Map(
    [...slotsByChunk].map(([chunkIndex, slots]) => [
      chunkIndex,
      Object.freeze([...slots]),
    ] as const),
  );
}

export function barOnlyDirtyChunkSlots(
  store: RenderStoreView,
  chunkSize: number,
  changedRanges: readonly SlotRange[],
  previousAlive: Uint8Array,
  previousKind: Uint8Array,
): ReadonlyMap<number, readonly number[]> {
  const classifications = new Map<
    number,
    { readonly slots: Set<number>; barOnly: boolean }
  >();

  for (const range of changedRanges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      const chunkIndex = Math.floor(slot / chunkSize);
      let classification = classifications.get(chunkIndex);
      if (classification === undefined) {
        classification = { slots: new Set(), barOnly: true };
        classifications.set(chunkIndex, classification);
      }
      if (
        (store.alive[slot] as number) !== 0 &&
        (store.kind[slot] as number) === RenderKind.Bar &&
        (previousAlive[slot] ?? 0) !== 0 &&
        (previousKind[slot] ?? -1) === RenderKind.Bar
      ) {
        classification.slots.add(slot);
      } else if (
        (store.alive[slot] as number) !== 0 &&
        ((store.kind[slot] as number) === RenderKind.Image ||
          (store.kind[slot] as number) === RenderKind.Text) &&
        (previousAlive[slot] ?? 0) !== 0 &&
        (previousKind[slot] ?? -1) === (store.kind[slot] as number)
      ) {
        // Image and text slots are owned by the leaf renderer. Presentation
        // batches commonly interleave them with aggregate Bar slots in one
        // dense range; retaining an empty classification prevents that leaf
        // work from escalating the whole aggregate chunk to a rebuild.
      } else {
        // A dead slot can represent a removal, and a newly live Bar can reuse
        // a slot that previously held another kind. Both must take the full
        // structural path so obsolete lane meshes are pruned.
        classification.barOnly = false;
      }
    }
  }

  const result = new Map<number, readonly number[]>();
  for (const [chunkIndex, classification] of classifications) {
    if (classification.barOnly) {
      result.set(chunkIndex, [...classification.slots]);
    }
  }
  return result;
}

function hasVisiblePackedAlpha(packed: number, opacity: number): boolean {
  return ((packed >>> 0) & 0xff) !== 0 && clamp01(opacity) > 0;
}

function isFiniteBarQuad(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    Number.isFinite(rotation) &&
    Number.isFinite(x + width / 2) &&
    Number.isFinite(y + height / 2)
  );
}

function primitiveBindingMatches<TRecord extends RetainedBarPositionRecord>(
  binding: BarPrimitiveBinding | null,
  expected: boolean,
  expectedGeometryKind: BarPrimitiveBinding['geometryKind'],
  packed: number,
  opacity: number,
  zIndex: number,
  records: ReadonlyMap<string, TRecord>,
): boolean {
  if (!expected) return binding === null;
  if (
    binding === null ||
    binding.geometryKind !== expectedGeometryKind ||
    binding.packed !== (packed >>> 0) ||
    binding.opacity !== opacity ||
    binding.zIndex !== zIndex
  ) {
    return false;
  }
  const record = records.get(binding.key);
  const positionValuesPerPrimitive =
    binding.geometryKind === 'rounded' ? 42 : 8;
  return (
    record !== undefined &&
    binding.primitiveIndex * positionValuesPerPrimitive +
      positionValuesPerPrimitive <= record.geometry.positions.length
  );
}

export function barSlotBindingMatches<TRecord extends RetainedBarPositionRecord>(
  store: RenderStoreView,
  slot: number,
  binding: BarSlotBinding | undefined,
  records: ReadonlyMap<string, TRecord>,
): boolean {
  const radius = Math.max(0, store.radius[slot] as number);
  const geometryKind: BarPrimitiveBinding['geometryKind'] =
    radius > 0 ? 'rounded' : 'quad';
  if (
    binding === undefined ||
    binding.entityId !== (store.ids[slot] ?? `@slot:${slot}`) ||
    binding.radius !== radius ||
    (store.alive[slot] as number) === 0 ||
    (store.kind[slot] as number) !== RenderKind.Bar
  ) {
    return false;
  }
  const opacity = store.opacity[slot] as number;
  const zIndex = store.zIndex[slot] as number;
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const drawable = isDrawable(store, slot) &&
    isFiniteBarQuad(x, y, width, height, rotation);
  const trackPacked = store.trackFill[slot] as number;
  const trackExpected = drawable && hasVisiblePackedAlpha(trackPacked, opacity);

  const progress = resolveBarProgress(store, slot);
  const fillWidth = width * progress;
  const fillPacked = store.fill[slot] as number;
  const fillExpected =
    drawable &&
    Number.isFinite(fillWidth) &&
    fillWidth > 0 &&
    hasVisiblePackedAlpha(fillPacked, opacity);

  return (
    primitiveBindingMatches(
      binding.track,
      trackExpected,
      geometryKind,
      trackPacked,
      opacity,
      zIndex,
      records,
    ) &&
    primitiveBindingMatches(
      binding.fill,
      fillExpected,
      geometryKind,
      fillPacked,
      opacity,
      zIndex,
      records,
    )
  );
}

export function updateBoundBarSlotPositions<
  TRecord extends RetainedBarPositionRecord,
>(
  store: RenderStoreView,
  slot: number,
  binding: BarSlotBinding,
  records: ReadonlyMap<string, TRecord>,
  dirtyRecords: Set<TRecord>,
  trackQuad: PatchMapResolvedRenderQuadScratch,
  fillQuad: PatchMapResolvedRenderQuadScratch,
  projectionContext?: PatchMapProjectionRenderContext,
): void {
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const progress = resolveBarProgress(store, slot);
  writePatchMapSlotQuad(trackQuad, store, slot, projectionContext);
  writePatchMapSlotQuad(fillQuad, store, slot, projectionContext, progress);
  const transformChanged =
    binding.x !== x ||
    binding.y !== y ||
    binding.width !== width ||
    binding.height !== height ||
    binding.rotation !== rotation ||
    binding.projectionRevision !== (projectionContext?.revision ?? -1);
  if (binding.track !== null && transformChanged) {
    const record = records.get(binding.track.key) as TRecord;
    const changed = binding.track.geometryKind === 'rounded'
      ? writeRoundedBarPositionValues(
          record.geometry.positions,
          binding.track.primitiveIndex,
          trackQuad,
          binding.radius,
          1,
        )
      : writeExactQuadPositionValues(
        record.geometry.positions,
        binding.track.primitiveIndex,
        trackQuad.vertices,
      );
    if (changed) dirtyRecords.add(record);
  }
  if (binding.fill !== null && (transformChanged || binding.progress !== progress)) {
    const record = records.get(binding.fill.key) as TRecord;
    const fillRadius = Math.min(
      binding.radius,
      width * progress / 2,
      height / 2,
    );
    const changed = binding.fill.geometryKind === 'rounded'
      ? writeRoundedBarPositionValues(
          record.geometry.positions,
          binding.fill.primitiveIndex,
          fillQuad,
          fillRadius,
          progress,
        )
      : writeExactQuadPositionValues(
        record.geometry.positions,
        binding.fill.primitiveIndex,
        fillQuad.vertices,
      );
    if (changed) dirtyRecords.add(record);
  }
  binding.x = x;
  binding.y = y;
  binding.width = width;
  binding.height = height;
  binding.rotation = rotation;
  binding.progress = progress;
  binding.projectionRevision = projectionContext?.revision ?? -1;
}
