import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js';

import type { CoreView, SlotRange } from '../../core-v1/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../core-v1/renderer/types';
import {
  createCoreV2ResolvedRenderQuadScratch,
  resolveCoreV2SlotQuad,
  writeCoreV2SlotQuad,
  type CoreV2ProjectionRenderContext,
  type CoreV2QuadVertices,
  type CoreV2ResolvedRenderQuadScratch,
} from './types';
import {
  resolveCoreV2RelationPath,
  type CoreV2RelationEndpointGeometry,
} from '../semantic/relations';

export const DEFAULT_AGGREGATE_MESH_CHUNK_SIZE = 512;

const RECT_PASS = 0;
const BAR_TRACK_PASS = 1;
const BAR_FILL_PASS = 2;
const RELATION_PASS = 0;
const PASSES_PER_Z_INDEX = 4;

export interface AggregateQuad {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Clockwise degrees, matching the Core store contract. */
  readonly rotation?: number;
  /** Optional entity pivot; bar fill geometry rotates around the complete bar. */
  readonly pivotX?: number;
  readonly pivotY?: number;
  /** Exact scene-space corners from the shared affine projection sidecar. */
  readonly vertices?: CoreV2QuadVertices;
}

export interface AggregateLine {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly width: number;
}

export interface AggregateGeometryData {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly primitiveCount: number;
  readonly byteLength: number;
}

export interface AggregateGeometryGroup extends AggregateGeometryData {
  readonly key: string;
  readonly tint: number;
  readonly alpha: number;
  readonly drawOrder: number;
}

export interface AggregateChunkGeometry {
  readonly quadGroups: readonly AggregateGeometryGroup[];
  readonly relationGroups: readonly AggregateGeometryGroup[];
  readonly visibleQuads: number;
  readonly visibleRelations: number;
}

export interface AggregateMeshLayerOptions {
  readonly chunkSize?: number;
  readonly label?: string;
  /** Disable when a parent RenderGroup owns the shared world transform. */
  readonly applyStoreView?: boolean;
}

export interface AggregateMeshSyncOptions {
  /** Core dirty ranges use an inclusive start and exclusive end. */
  readonly changedRanges?: readonly SlotRange[];
  /** Increment this whenever a load replaces the logical store contents. */
  readonly fullRebuildEpoch?: number;
  readonly force?: boolean;
  readonly projectionContext?: CoreV2ProjectionRenderContext;
}

export interface AggregateMeshLayerDebug {
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly meshCount: number;
  readonly visibleQuads: number;
  readonly visibleRelations: number;
  /** Dirty chunks whose GPU-facing geometry changed in the most recent sync. */
  readonly uploadedChunks: number;
  /** Bytes scheduled for upload in the most recent sync. */
  readonly uploadedBytes: number;
  /** Store slots visited by geometry update code in the most recent sync. */
  readonly geometrySlotsVisited: number;
  readonly totalUploadedChunks: number;
  readonly totalUploadedBytes: number;
  readonly revision: number;
  readonly fullRebuildEpoch: number;
}

interface PackedMeshStyle {
  readonly tint: number;
  readonly alpha: number;
}

interface MutableQuadGroup extends PackedMeshStyle {
  readonly key: string;
  readonly drawOrder: number;
  readonly primitives: AggregateQuad[];
}

interface MutableLineGroup extends PackedMeshStyle {
  readonly key: string;
  readonly drawOrder: number;
  readonly primitives: AggregateLine[];
}

interface MeshRecord {
  readonly mesh: Mesh<MeshGeometry>;
  readonly geometry: MeshGeometry;
  primitiveCount: number;
}

interface BarPrimitiveBinding {
  readonly key: string;
  readonly primitiveIndex: number;
  readonly packed: number;
  readonly opacity: number;
  readonly zIndex: number;
}

interface BarSlotBinding {
  readonly track: BarPrimitiveBinding | null;
  readonly fill: BarPrimitiveBinding | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  progress: number;
  projectionRevision: number;
}

interface ChunkRecord {
  readonly rectMeshes: Map<string, MeshRecord>;
  readonly barMeshes: Map<string, MeshRecord>;
  readonly relationMeshes: Map<string, MeshRecord>;
  readonly barSlots: number[];
  readonly barBindings: Map<number, BarSlotBinding>;
  visibleRects: number;
  visibleBars: number;
  visibleRelations: number;
}

interface AggregateChunkLaneGeometry {
  readonly rectGroups: readonly AggregateGeometryGroup[];
  readonly barGroups: readonly AggregateGeometryGroup[];
  readonly relationGroups: readonly AggregateGeometryGroup[];
  readonly barSlots: readonly number[];
  readonly barBindings: ReadonlyMap<number, BarSlotBinding>;
  readonly visibleRects: number;
  readonly visibleBars: number;
  readonly visibleRelations: number;
}

interface AggregateBarLaneGeometry {
  readonly groups: readonly AggregateGeometryGroup[];
  readonly bindings: ReadonlyMap<number, BarSlotBinding>;
  readonly visibleBars: number;
}

interface UploadDelta {
  bytes: number;
  changed: boolean;
  visitedSlots: number;
}

interface GroupUploadDelta {
  bytes: number;
  changed: boolean;
}

const EMPTY_DEBUG: AggregateMeshLayerDebug = Object.freeze({
  chunkSize: DEFAULT_AGGREGATE_MESH_CHUNK_SIZE,
  chunkCount: 0,
  meshCount: 0,
  visibleQuads: 0,
  visibleRelations: 0,
  uploadedChunks: 0,
  uploadedBytes: 0,
  geometrySlotsVisited: 0,
  totalUploadedChunks: 0,
  totalUploadedBytes: 0,
  revision: -1,
  fullRebuildEpoch: -1,
});

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function isFiniteQuad(quad: AggregateQuad): boolean {
  const verticesFinite = quad.vertices === undefined ||
    (quad.vertices.length === 8 && quad.vertices.every(Number.isFinite));
  return (
    Number.isFinite(quad.x) &&
    Number.isFinite(quad.y) &&
    Number.isFinite(quad.width) &&
    Number.isFinite(quad.height) &&
    quad.width > 0 &&
    quad.height > 0 &&
    Number.isFinite(quad.rotation ?? 0) &&
    Number.isFinite(quad.pivotX ?? quad.x + quad.width / 2) &&
    Number.isFinite(quad.pivotY ?? quad.y + quad.height / 2) &&
    verticesFinite
  );
}

function isFiniteLine(line: AggregateLine): boolean {
  return (
    Number.isFinite(line.fromX) &&
    Number.isFinite(line.fromY) &&
    Number.isFinite(line.toX) &&
    Number.isFinite(line.toY) &&
    Number.isFinite(line.width) &&
    line.width > 0 &&
    (line.fromX !== line.toX || line.fromY !== line.toY)
  );
}

function writeUvsAndIndices(
  uvs: Float32Array,
  indices: Uint32Array,
  primitiveIndex: number,
): void {
  const positionOffset = primitiveIndex * 8;
  uvs.set([0, 0, 1, 0, 1, 1, 0, 1], positionOffset);
  const vertexOffset = primitiveIndex * 4;
  indices.set(
    [
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 3,
    ],
    primitiveIndex * 6,
  );
}

function finishGeometry(
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
  primitiveCount: number,
): AggregateGeometryData {
  return {
    positions,
    uvs,
    indices,
    primitiveCount,
    byteLength: positions.byteLength + uvs.byteLength + indices.byteLength,
  };
}

function writeRotatedCorner(
  positions: Float32Array,
  offset: number,
  targetOffset: number,
  sourceX: number,
  sourceY: number,
  pivotX: number,
  pivotY: number,
  cos: number,
  sin: number,
): boolean {
  const deltaX = sourceX - pivotX;
  const deltaY = sourceY - pivotY;
  const nextX = Math.fround(pivotX + deltaX * cos - deltaY * sin);
  const nextY = Math.fround(pivotY + deltaX * sin + deltaY * cos);
  const changed =
    positions[offset + targetOffset] !== nextX ||
    positions[offset + targetOffset + 1] !== nextY;
  positions[offset + targetOffset] = nextX;
  positions[offset + targetOffset + 1] = nextY;
  return changed;
}

function writeQuadPositionValues(
  positions: Float32Array,
  primitiveIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  pivotX: number,
  pivotY: number,
): boolean {
  const right = x + width;
  const bottom = y + height;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const offset = primitiveIndex * 8;
  const corner0 = writeRotatedCorner(
    positions, offset, 0, x, y, pivotX, pivotY, cos, sin,
  );
  const corner1 = writeRotatedCorner(
    positions, offset, 2, right, y, pivotX, pivotY, cos, sin,
  );
  const corner2 = writeRotatedCorner(
    positions, offset, 4, right, bottom, pivotX, pivotY, cos, sin,
  );
  const corner3 = writeRotatedCorner(
    positions, offset, 6, x, bottom, pivotX, pivotY, cos, sin,
  );
  return corner0 || corner1 || corner2 || corner3;
}

function writeExactQuadPositionValues(
  positions: Float32Array,
  primitiveIndex: number,
  vertices: CoreV2QuadVertices,
): boolean {
  const offset = primitiveIndex * 8;
  let changed = false;
  for (let index = 0; index < 8; index += 1) {
    const next = Math.fround(vertices[index]!);
    if (positions[offset + index] !== next) changed = true;
    positions[offset + index] = next;
  }
  return changed;
}

/** Convert Core's packed 0xRRGGBBAA color into Pixi's tint plus alpha. */
export function packedRgbaToMeshStyle(packed: number, opacity = 1): PackedMeshStyle {
  const normalized = packed >>> 0;
  return {
    tint: normalized >>> 8,
    alpha: ((normalized & 0xff) / 0xff) * clamp01(opacity),
  };
}

/** Build top-left-addressed quads, rotating around each supplied entity pivot. */
export function buildQuadGeometry(quads: readonly AggregateQuad[]): AggregateGeometryData {
  const drawable = quads.filter(isFiniteQuad);
  const positions = new Float32Array(drawable.length * 8);
  const uvs = new Float32Array(drawable.length * 8);
  const indices = new Uint32Array(drawable.length * 6);

  for (let primitiveIndex = 0; primitiveIndex < drawable.length; primitiveIndex += 1) {
    const quad = drawable[primitiveIndex] as AggregateQuad;
    const pivotX = quad.pivotX ?? quad.x + quad.width / 2;
    const pivotY = quad.pivotY ?? quad.y + quad.height / 2;
    if (quad.vertices) {
      writeExactQuadPositionValues(positions, primitiveIndex, quad.vertices);
    } else {
      writeQuadPositionValues(
        positions,
        primitiveIndex,
        quad.x,
        quad.y,
        quad.width,
        quad.height,
        quad.rotation ?? 0,
        pivotX,
        pivotY,
      );
    }
    writeUvsAndIndices(uvs, indices, primitiveIndex);
  }

  return finishGeometry(positions, uvs, indices, drawable.length);
}

/** Build butt-capped relation segments as triangle quads. */
export function buildLineGeometry(lines: readonly AggregateLine[]): AggregateGeometryData {
  const drawable = lines.filter(isFiniteLine);
  const positions = new Float32Array(drawable.length * 8);
  const uvs = new Float32Array(drawable.length * 8);
  const indices = new Uint32Array(drawable.length * 6);

  for (let primitiveIndex = 0; primitiveIndex < drawable.length; primitiveIndex += 1) {
    const line = drawable[primitiveIndex] as AggregateLine;
    const deltaX = line.toX - line.fromX;
    const deltaY = line.toY - line.fromY;
    const length = Math.hypot(deltaX, deltaY);
    const normalX = (-deltaY / length) * (line.width / 2);
    const normalY = (deltaX / length) * (line.width / 2);
    const offset = primitiveIndex * 8;
    positions.set(
      [
        line.fromX + normalX,
        line.fromY + normalY,
        line.toX + normalX,
        line.toY + normalY,
        line.toX - normalX,
        line.toY - normalY,
        line.fromX - normalX,
        line.fromY - normalY,
      ],
      offset,
    );
    writeUvsAndIndices(uvs, indices, primitiveIndex);
  }

  return finishGeometry(positions, uvs, indices, drawable.length);
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

function barOnlyDirtyChunkSlots(
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
    if (classification.barOnly && classification.slots.size > 0) {
      result.set(chunkIndex, [...classification.slots]);
    }
  }
  return result;
}

function isDrawable(store: RenderStoreView, slot: number): boolean {
  return (
    slot >= 0 &&
    slot < store.capacity &&
    (store.alive[slot] as number) !== 0 &&
    ((store.flags[slot] as number) & RenderFlags.Visible) !== 0 &&
    (store.opacity[slot] as number) > 0
  );
}

function isEndpoint(store: RenderStoreView, slot: number): boolean {
  return slot >= 0 && slot < store.capacity && (store.alive[slot] as number) !== 0;
}

function styleKey(style: PackedMeshStyle, drawOrder: number): string {
  return `${drawOrder}:${style.tint.toString(16).padStart(6, '0')}:${style.alpha}`;
}

function getQuadGroup(
  groups: Map<string, MutableQuadGroup>,
  packed: number,
  opacity: number,
  zIndex: number,
  pass: number,
): MutableQuadGroup | null {
  const style = packedRgbaToMeshStyle(packed, opacity);
  if (style.alpha <= 0) return null;
  const drawOrder = zIndex * PASSES_PER_Z_INDEX + pass;
  const key = styleKey(style, drawOrder);
  let group = groups.get(key);
  if (group === undefined) {
    group = { key, ...style, drawOrder, primitives: [] };
    groups.set(key, group);
  }
  return group;
}

function getLineGroup(
  groups: Map<string, MutableLineGroup>,
  packed: number,
  opacity: number,
  zIndex: number,
): MutableLineGroup | null {
  const style = packedRgbaToMeshStyle(packed, opacity);
  if (style.alpha <= 0) return null;
  const drawOrder = zIndex * PASSES_PER_Z_INDEX + RELATION_PASS;
  const key = styleKey(style, drawOrder);
  let group = groups.get(key);
  if (group === undefined) {
    group = { key, ...style, drawOrder, primitives: [] };
    groups.set(key, group);
  }
  return group;
}

function geometryGroup(
  group: MutableQuadGroup,
  geometry: AggregateGeometryData,
): AggregateGeometryGroup;
function geometryGroup(
  group: MutableLineGroup,
  geometry: AggregateGeometryData,
): AggregateGeometryGroup;
function geometryGroup(
  group: MutableQuadGroup | MutableLineGroup,
  geometry: AggregateGeometryData,
): AggregateGeometryGroup {
  return {
    key: group.key,
    tint: group.tint,
    alpha: group.alpha,
    drawOrder: group.drawOrder,
    ...geometry,
  };
}

function appendBarPrimitive(
  groups: Map<string, MutableQuadGroup>,
  packed: number,
  opacity: number,
  zIndex: number,
  pass: number,
  quad: AggregateQuad,
): BarPrimitiveBinding | null {
  if (!isFiniteQuad(quad)) return null;
  const group = getQuadGroup(groups, packed, opacity, zIndex, pass);
  if (group === null) return null;
  const primitiveIndex = group.primitives.length;
  group.primitives.push(quad);
  return {
    key: group.key,
    primitiveIndex,
    packed: packed >>> 0,
    opacity,
    zIndex,
  };
}

function resolveBarProgress(store: RenderStoreView, slot: number): number {
  const min = store.min[slot] as number;
  const max = store.max[slot] as number;
  return max > min
    ? clamp01(((store.value[slot] as number) - min) / (max - min))
    : 0;
}

function appendBarSlot(
  store: RenderStoreView,
  slot: number,
  groups: Map<string, MutableQuadGroup>,
  bindings: Map<number, BarSlotBinding>,
  projectionContext?: CoreV2ProjectionRenderContext,
): number {
  let track: BarPrimitiveBinding | null = null;
  let fill: BarPrimitiveBinding | null = null;
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const progress = resolveBarProgress(store, slot);
  const trackQuad = resolveCoreV2SlotQuad(store, slot, projectionContext);
  const fillQuad = resolveCoreV2SlotQuad(store, slot, projectionContext, progress);
  if (isDrawable(store, slot)) {
    if (width > 0 && height > 0) {
      const opacity = store.opacity[slot] as number;
      const zIndex = store.zIndex[slot] as number;
      const pivotX = x + width / 2;
      const pivotY = y + height / 2;
      track = appendBarPrimitive(
        groups,
        store.trackFill[slot] as number,
        opacity,
        zIndex,
        BAR_TRACK_PASS,
        { x, y, width, height, rotation, pivotX, pivotY, vertices: trackQuad.vertices },
      );

      const fillWidth = width * progress;
      if (fillWidth > 0) {
        fill = appendBarPrimitive(
          groups,
          store.fill[slot] as number,
          opacity,
          zIndex,
          BAR_FILL_PASS,
          {
            x,
            y,
            width: fillWidth,
            height,
            rotation,
            pivotX,
            pivotY,
            vertices: fillQuad.vertices,
          },
        );
      }
    }
  }
  bindings.set(slot, {
    track,
    fill,
    x,
    y,
    width,
    height,
    rotation,
    progress,
    projectionRevision: projectionContext?.revision ?? -1,
  });
  return (track === null ? 0 : 1) + (fill === null ? 0 : 1);
}

function buildAggregateBarLaneGeometry(
  store: RenderStoreView,
  barSlots: readonly number[],
  projectionContext?: CoreV2ProjectionRenderContext,
): AggregateBarLaneGeometry {
  const groups = new Map<string, MutableQuadGroup>();
  const bindings = new Map<number, BarSlotBinding>();
  let visibleBars = 0;
  for (const slot of barSlots) {
    if (
      slot < 0 ||
      slot >= store.capacity ||
      (store.alive[slot] as number) === 0 ||
      (store.kind[slot] as number) !== RenderKind.Bar
    ) {
      continue;
    }
    visibleBars += appendBarSlot(store, slot, groups, bindings, projectionContext);
  }
  return {
    groups: [...groups.values()].map((group) =>
      geometryGroup(group, buildQuadGeometry(group.primitives)),
    ),
    bindings,
    visibleBars,
  };
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

function primitiveBindingMatches(
  binding: BarPrimitiveBinding | null,
  expected: boolean,
  packed: number,
  opacity: number,
  zIndex: number,
  records: ReadonlyMap<string, MeshRecord>,
): boolean {
  if (!expected) return binding === null;
  if (
    binding === null ||
    binding.packed !== (packed >>> 0) ||
    binding.opacity !== opacity ||
    binding.zIndex !== zIndex
  ) {
    return false;
  }
  const record = records.get(binding.key);
  return (
    record !== undefined &&
    binding.primitiveIndex * 8 + 8 <= record.geometry.positions.length
  );
}

function barSlotBindingMatches(
  store: RenderStoreView,
  slot: number,
  binding: BarSlotBinding | undefined,
  records: ReadonlyMap<string, MeshRecord>,
): boolean {
  if (
    binding === undefined ||
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
      trackPacked,
      opacity,
      zIndex,
      records,
    ) &&
    primitiveBindingMatches(
      binding.fill,
      fillExpected,
      fillPacked,
      opacity,
      zIndex,
      records,
    )
  );
}

function updateBoundBarSlotPositions(
  store: RenderStoreView,
  slot: number,
  binding: BarSlotBinding,
  records: ReadonlyMap<string, MeshRecord>,
  dirtyRecords: Set<MeshRecord>,
  trackQuad: CoreV2ResolvedRenderQuadScratch,
  fillQuad: CoreV2ResolvedRenderQuadScratch,
  projectionContext?: CoreV2ProjectionRenderContext,
): void {
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const progress = resolveBarProgress(store, slot);
  writeCoreV2SlotQuad(trackQuad, store, slot, projectionContext);
  writeCoreV2SlotQuad(fillQuad, store, slot, projectionContext, progress);
  const transformChanged =
    binding.x !== x ||
    binding.y !== y ||
    binding.width !== width ||
    binding.height !== height ||
    binding.rotation !== rotation ||
    binding.projectionRevision !== (projectionContext?.revision ?? -1);
  if (binding.track !== null && transformChanged) {
    const record = records.get(binding.track.key) as MeshRecord;
    if (
      writeExactQuadPositionValues(
        record.geometry.positions,
        binding.track.primitiveIndex,
        trackQuad.vertices,
      )
    ) {
      dirtyRecords.add(record);
    }
  }
  if (binding.fill !== null && (transformChanged || binding.progress !== progress)) {
    const record = records.get(binding.fill.key) as MeshRecord;
    if (
      writeExactQuadPositionValues(
        record.geometry.positions,
        binding.fill.primitiveIndex,
        fillQuad.vertices,
      )
    ) {
      dirtyRecords.add(record);
    }
  }
  binding.x = x;
  binding.y = y;
  binding.width = width;
  binding.height = height;
  binding.rotation = rotation;
  binding.progress = progress;
  binding.projectionRevision = projectionContext?.revision ?? -1;
}

function buildAggregateChunkLaneGeometry(
  store: RenderStoreView,
  start: number,
  end: number,
  projectionContext?: CoreV2ProjectionRenderContext,
): AggregateChunkLaneGeometry {
  const rectGroups = new Map<string, MutableQuadGroup>();
  const barGroups = new Map<string, MutableQuadGroup>();
  const relationGroups = new Map<string, MutableLineGroup>();
  const barSlots: number[] = [];
  const barBindings = new Map<number, BarSlotBinding>();
  const resolvedStart = Math.max(0, Math.min(store.capacity, Math.floor(start)));
  const resolvedEnd = Math.max(resolvedStart, Math.min(store.capacity, Math.ceil(end)));
  let visibleRects = 0;
  let visibleBars = 0;
  let visibleRelations = 0;

  for (let slot = resolvedStart; slot < resolvedEnd; slot += 1) {
    if ((store.alive[slot] as number) === 0) continue;
    const kind = store.kind[slot] as number;
    if (kind === RenderKind.Bar) {
      barSlots.push(slot);
      visibleBars += appendBarSlot(store, slot, barGroups, barBindings, projectionContext);
      continue;
    }
    if (!isDrawable(store, slot)) continue;
    const opacity = store.opacity[slot] as number;
    const zIndex = store.zIndex[slot] as number;

    if (kind === RenderKind.Rect) {
      const width = store.width[slot] as number;
      const height = store.height[slot] as number;
      const group = width > 0 && height > 0
        ? getQuadGroup(rectGroups, store.fill[slot] as number, opacity, zIndex, RECT_PASS)
        : null;
      if (group !== null) {
        const quad = resolveCoreV2SlotQuad(store, slot, projectionContext);
        group.primitives.push({
          x: store.x[slot] as number,
          y: store.y[slot] as number,
          width,
          height,
          rotation: store.rotation[slot] as number,
          vertices: quad.vertices,
        });
        visibleRects += 1;
      }
      continue;
    }

    if (kind !== RenderKind.Relation) continue;
    const from = store.relationFrom[slot] as number;
    const to = store.relationTo[slot] as number;
    const width = store.lineWidth[slot] as number;
    if (!isEndpoint(store, from) || !isEndpoint(store, to) || width <= 0) continue;
    const relationId = store.ids[slot] ?? '';
    const relationProjection = projectionContext?.index.relationsByEntityId?.[relationId];
    const fromQuad = resolveCoreV2SlotQuad(store, from, projectionContext);
    const toQuad = resolveCoreV2SlotQuad(store, to, projectionContext);
    const lines: AggregateLine[] = [];
    if (relationProjection) {
      const path = resolveCoreV2RelationPath(
        relationProjection,
        endpointGeometry(store, from, fromQuad.vertices, fromQuad.center),
        endpointGeometry(store, to, toQuad.vertices, toQuad.center),
        {
          color: store.color[slot] as number,
          width,
          opacity,
          zIndex,
          visible: isDrawable(store, slot),
        },
      );
      if (!path.visible) continue;
      for (let pointIndex = 1; pointIndex < path.worldPoints.length; pointIndex += 1) {
        const startPoint = path.worldPoints[pointIndex - 1];
        const endPoint = path.worldPoints[pointIndex];
        if (!startPoint || !endPoint) continue;
        const line = {
          fromX: startPoint[0],
          fromY: startPoint[1],
          toX: endPoint[0],
          toY: endPoint[1],
          width: path.worldStrokeWidths[pointIndex - 1] ?? width,
        };
        if (isFiniteLine(line)) lines.push(line);
      }
    } else {
      const line = {
        fromX: fromQuad.center[0],
        fromY: fromQuad.center[1],
        toX: toQuad.center[0],
        toY: toQuad.center[1],
        width,
      };
      if (!isFiniteLine(line)) continue;
      lines.push(line);
    }
    if (lines.length === 0) continue;
    const group = getLineGroup(
      relationGroups,
      store.color[slot] as number,
      opacity,
      zIndex,
    );
    if (group === null) continue;
    group.primitives.push(...lines);
    visibleRelations += 1;
  }

  return {
    rectGroups: [...rectGroups.values()].map((group) =>
      geometryGroup(group, buildQuadGeometry(group.primitives)),
    ),
    barGroups: [...barGroups.values()].map((group) =>
      geometryGroup(group, buildQuadGeometry(group.primitives)),
    ),
    relationGroups: [...relationGroups.values()].map((group) =>
      geometryGroup(group, buildLineGeometry(group.primitives)),
    ),
    barSlots,
    barBindings,
    visibleRects,
    visibleBars,
    visibleRelations,
  };
}

function endpointGeometry(
  store: RenderStoreView,
  slot: number,
  vertices: CoreV2QuadVertices,
  center: readonly [number, number],
): CoreV2RelationEndpointGeometry {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index] as number;
    const y = vertices[index + 1] as number;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Object.freeze({
    id: store.ids[slot] ?? `@slot:${slot}`,
    center: Object.freeze([center[0], center[1]] as const),
    worldBounds: Object.freeze([minX, minY, maxX - minX, maxY - minY] as const),
    visible: ((store.flags[slot] as number) & RenderFlags.Visible) !== 0,
  });
}

/**
 * Normalize one fixed slot chunk into aggregate style meshes.
 *
 * Default Mesh material has one tint/alpha per mesh, so groups are keyed by
 * tint, alpha, z-index, and the rect/bar pass. This preserves colors without a
 * custom shader while keeping scene nodes proportional to styles per chunk.
 */
export function buildAggregateChunkGeometry(
  store: RenderStoreView,
  start: number,
  end: number,
  projectionContext?: CoreV2ProjectionRenderContext,
): AggregateChunkGeometry {
  const built = buildAggregateChunkLaneGeometry(store, start, end, projectionContext);
  return {
    quadGroups: [...built.rectGroups, ...built.barGroups],
    relationGroups: built.relationGroups,
    visibleQuads: built.visibleRects + built.visibleBars,
    visibleRelations: built.visibleRelations,
  };
}

function destroyMeshRecord(record: MeshRecord): void {
  record.mesh.destroy();
  record.geometry.destroy(true);
}

function createChunkRecord(): ChunkRecord {
  return {
    rectMeshes: new Map(),
    barMeshes: new Map(),
    relationMeshes: new Map(),
    barSlots: [],
    barBindings: new Map(),
    visibleRects: 0,
    visibleBars: 0,
    visibleRelations: 0,
  };
}

/**
 * Fixed-slot-chunk Pixi Mesh spike for rects, bars, and relations.
 *
 * Pixi's public Buffer.update(sizeInBytes) can update only a prefix; it has no
 * public arbitrary byte-offset argument. Consequently a dirty slot updates the
 * complete position buffer for each style group in its fixed chunk. Clean
 * chunks retain their geometry and cause no upload. Structural/style-count
 * changes rebuild only the affected chunk group.
 */
export class AggregateMeshLayer {
  public readonly container: Container;
  public readonly quadContainer: Container;
  public readonly relationContainer: Container;
  public readonly chunkSize: number;

  readonly #baseLabel: string;
  readonly #applyStoreView: boolean;
  readonly #chunks = new Map<number, ChunkRecord>();
  #lastStore: RenderStoreView | null = null;
  #lastCapacity = 0;
  #lastRevision = -1;
  #fullRebuildEpoch: number | undefined;
  #previousAlive = new Uint8Array(0);
  #previousKind = new Uint8Array(0);
  #destroyed = false;
  #debug: AggregateMeshLayerDebug;
  #view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  #projectionContext: CoreV2ProjectionRenderContext | undefined;
  readonly #trackQuadScratch = createCoreV2ResolvedRenderQuadScratch();
  readonly #fillQuadScratch = createCoreV2ResolvedRenderQuadScratch();

  public constructor(options: AggregateMeshLayerOptions = {}) {
    const chunkSize = options.chunkSize ?? DEFAULT_AGGREGATE_MESH_CHUNK_SIZE;
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('chunkSize must be a positive safe integer');
    }
    this.chunkSize = chunkSize;
    this.#baseLabel = options.label ?? 'PATCH MAP Core v2 aggregate mesh';
    this.#applyStoreView = options.applyStoreView ?? true;
    this.container = new Container({ label: this.#baseLabel });
    this.quadContainer = new Container({ label: `${this.#baseLabel}: rect/bar` });
    this.relationContainer = new Container({ label: `${this.#baseLabel}: relations` });
    this.container.eventMode = 'none';
    this.quadContainer.eventMode = 'none';
    this.relationContainer.eventMode = 'none';
    this.quadContainer.sortableChildren = true;
    this.relationContainer.sortableChildren = true;
    this.container.addChild(this.relationContainer, this.quadContainer);
    this.#debug = Object.freeze({ ...EMPTY_DEBUG, chunkSize });
  }

  public get destroyed(): boolean {
    return this.#destroyed;
  }

  public get debug(): AggregateMeshLayerDebug {
    return this.#debug;
  }

  public getDebugStats(): AggregateMeshLayerDebug {
    return this.#debug;
  }

  public setView(view: CoreView): boolean {
    this.#assertAlive();
    const next = {
      x: view.x,
      y: view.y,
      scale: view.scale,
      rotation: view.rotation ?? 0,
    };
    if (
      this.#view.x === next.x &&
      this.#view.y === next.y &&
      this.#view.scale === next.scale &&
      (this.#view.rotation ?? 0) === next.rotation
    ) {
      return false;
    }
    this.#view = Object.freeze(next);
    this.container.position.set(next.x, next.y);
    this.container.scale.set(next.scale);
    this.container.angle = next.rotation;
    return true;
  }

  public sync(
    store: RenderStoreView,
    options: AggregateMeshSyncOptions = {},
  ): AggregateMeshLayerDebug {
    this.#assertAlive();
    this.#projectionContext = options.projectionContext;
    const epochChanged =
      options.fullRebuildEpoch !== undefined &&
      options.fullRebuildEpoch !== this.#fullRebuildEpoch;
    const fullRebuild =
      options.force === true ||
      this.#lastStore !== store ||
      this.#lastRevision < 0 ||
      store.capacity < this.#lastCapacity ||
      epochChanged ||
      options.changedRanges === undefined;
    const maximumChunk = Math.ceil(Math.max(0, store.capacity) / this.chunkSize);
    const dirtyChunks = fullRebuild
      ? Array.from({ length: maximumChunk }, (_, chunk) => chunk)
      : [...dirtyChunkIndices(store.capacity, this.chunkSize, options.changedRanges ?? [])];
    const barOnlyChunks = fullRebuild
      ? new Map<number, readonly number[]>()
      : barOnlyDirtyChunkSlots(
        store,
        this.chunkSize,
        options.changedRanges ?? [],
        this.#previousAlive,
        this.#previousKind,
      );

    if (fullRebuild) {
      for (const chunk of this.#chunks.keys()) {
        if (chunk >= maximumChunk) this.#destroyChunk(chunk);
      }
    }

    let uploadedChunks = 0;
    let uploadedBytes = 0;
    let geometrySlotsVisited = 0;
    for (const chunk of dirtyChunks) {
      const changedBarSlots = barOnlyChunks.get(chunk);
      const delta = changedBarSlots !== undefined
        ? this.#syncBarChunk(store, chunk, changedBarSlots)
        : this.#syncChunk(store, chunk);
      if (delta.changed) uploadedChunks += 1;
      uploadedBytes += delta.bytes;
      geometrySlotsVisited += delta.visitedSlots;
    }
    this.#recordTopology(store, fullRebuild, options.changedRanges ?? []);

    if (options.fullRebuildEpoch !== undefined) {
      this.#fullRebuildEpoch = options.fullRebuildEpoch;
    }
    this.#lastStore = store;
    this.#lastCapacity = store.capacity;
    this.#lastRevision = store.revision;
    if (this.#applyStoreView) this.setView(store.view);

    let meshCount = 0;
    let visibleQuads = 0;
    let visibleRelations = 0;
    for (const chunk of this.#chunks.values()) {
      meshCount +=
        chunk.rectMeshes.size + chunk.barMeshes.size + chunk.relationMeshes.size;
      visibleQuads += chunk.visibleRects + chunk.visibleBars;
      visibleRelations += chunk.visibleRelations;
    }
    this.#debug = Object.freeze({
      chunkSize: this.chunkSize,
      chunkCount: this.#chunks.size,
      meshCount,
      visibleQuads,
      visibleRelations,
      uploadedChunks,
      uploadedBytes,
      geometrySlotsVisited,
      totalUploadedChunks: this.#debug.totalUploadedChunks + uploadedChunks,
      totalUploadedBytes: this.#debug.totalUploadedBytes + uploadedBytes,
      revision: store.revision,
      fullRebuildEpoch: this.#fullRebuildEpoch ?? -1,
    });
    this.container.label = `${this.#baseLabel} (${meshCount} meshes)`;
    this.quadContainer.label = `${this.#baseLabel}: rect/bar (${visibleQuads})`;
    this.relationContainer.label = `${this.#baseLabel}: relations (${visibleRelations})`;
    return this.#debug;
  }

  public clear(): boolean {
    this.#assertAlive();
    const changed = this.#chunks.size > 0;
    for (const chunk of [...this.#chunks.keys()]) this.#destroyChunk(chunk);
    this.#lastStore = null;
    this.#lastCapacity = 0;
    this.#lastRevision = -1;
    this.#previousAlive = new Uint8Array(0);
    this.#previousKind = new Uint8Array(0);
    this.#debug = Object.freeze({
      ...this.#debug,
      chunkCount: 0,
      meshCount: 0,
      visibleQuads: 0,
      visibleRelations: 0,
      uploadedChunks: 0,
      uploadedBytes: 0,
      geometrySlotsVisited: 0,
      revision: -1,
    });
    return changed;
  }

  public destroy(): boolean {
    if (this.#destroyed) return false;
    this.clear();
    this.quadContainer.destroy();
    this.relationContainer.destroy();
    this.container.destroy();
    this.#destroyed = true;
    return true;
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('AggregateMeshLayer is destroyed');
  }

  #recordTopology(
    store: RenderStoreView,
    fullRebuild: boolean,
    changedRanges: readonly SlotRange[],
  ): void {
    if (this.#previousAlive.length !== store.capacity) {
      const nextAlive = new Uint8Array(store.capacity);
      const nextKind = new Uint8Array(store.capacity);
      const retainedLength = Math.min(this.#previousAlive.length, store.capacity);
      nextAlive.set(this.#previousAlive.subarray(0, retainedLength));
      nextKind.set(this.#previousKind.subarray(0, retainedLength));
      this.#previousAlive = nextAlive;
      this.#previousKind = nextKind;
    }

    if (fullRebuild) {
      for (let slot = 0; slot < store.capacity; slot += 1) {
        this.#previousAlive[slot] = store.alive[slot] ?? 0;
        this.#previousKind[slot] = store.kind[slot] ?? 0;
      }
      return;
    }

    for (const range of changedRanges) {
      const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
      const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
      if (start === end) continue;
      for (let slot = start; slot < end; slot += 1) {
        this.#previousAlive[slot] = store.alive[slot] ?? 0;
        this.#previousKind[slot] = store.kind[slot] ?? 0;
      }
    }
  }

  #syncChunk(store: RenderStoreView, chunkIndex: number): UploadDelta {
    const start = chunkIndex * this.chunkSize;
    const end = Math.min(store.capacity, start + this.chunkSize);
    const built = buildAggregateChunkLaneGeometry(
      store,
      start,
      end,
      this.#projectionContext,
    );
    let chunk = this.#chunks.get(chunkIndex);
    if (
      built.rectGroups.length === 0 &&
      built.barGroups.length === 0 &&
      built.relationGroups.length === 0 &&
      built.barSlots.length === 0
    ) {
      const changed = chunk !== undefined;
      if (changed) this.#destroyChunk(chunkIndex);
      return { bytes: 0, changed, visitedSlots: end - start };
    }
    if (chunk === undefined) {
      chunk = createChunkRecord();
      this.#chunks.set(chunkIndex, chunk);
    }

    const rectDelta = this.#syncGroups(
      this.quadContainer,
      chunk.rectMeshes,
      built.rectGroups,
      chunkIndex,
      'rect',
    );
    const barDelta = this.#syncGroups(
      this.quadContainer,
      chunk.barMeshes,
      built.barGroups,
      chunkIndex,
      'bar',
    );
    const relationDelta = this.#syncGroups(
      this.relationContainer,
      chunk.relationMeshes,
      built.relationGroups,
      chunkIndex,
      'relation',
    );
    chunk.visibleRects = built.visibleRects;
    chunk.visibleBars = built.visibleBars;
    chunk.visibleRelations = built.visibleRelations;
    chunk.barSlots.length = 0;
    chunk.barSlots.push(...built.barSlots);
    chunk.barBindings.clear();
    for (const [slot, binding] of built.barBindings) {
      chunk.barBindings.set(slot, binding);
    }
    return {
      bytes: rectDelta.bytes + barDelta.bytes + relationDelta.bytes,
      changed: rectDelta.changed || barDelta.changed || relationDelta.changed,
      visitedSlots: end - start,
    };
  }

  #syncBarChunk(
    store: RenderStoreView,
    chunkIndex: number,
    changedSlots: readonly number[],
  ): UploadDelta {
    const chunk = this.#chunks.get(chunkIndex);
    if (chunk === undefined) return this.#syncChunk(store, chunkIndex);

    for (const slot of changedSlots) {
      if (
        !barSlotBindingMatches(
          store,
          slot,
          chunk.barBindings.get(slot),
          chunk.barMeshes,
        )
      ) {
        return this.#rebuildBarChunk(store, chunkIndex, chunk);
      }
    }

    const dirtyRecords = new Set<MeshRecord>();
    for (const slot of changedSlots) {
      updateBoundBarSlotPositions(
        store,
        slot,
        chunk.barBindings.get(slot) as BarSlotBinding,
        chunk.barMeshes,
        dirtyRecords,
        this.#trackQuadScratch,
        this.#fillQuadScratch,
        this.#projectionContext,
      );
    }
    let bytes = 0;
    for (const record of dirtyRecords) {
      record.geometry.getBuffer('aPosition').update(record.geometry.positions.byteLength);
      bytes += record.geometry.positions.byteLength;
    }
    return {
      bytes,
      changed: dirtyRecords.size > 0,
      visitedSlots: changedSlots.length,
    };
  }

  #rebuildBarChunk(
    store: RenderStoreView,
    chunkIndex: number,
    chunk: ChunkRecord,
  ): UploadDelta {
    const built = buildAggregateBarLaneGeometry(
      store,
      chunk.barSlots,
      this.#projectionContext,
    );
    const delta = this.#syncGroups(
      this.quadContainer,
      chunk.barMeshes,
      built.groups,
      chunkIndex,
      'bar',
    );
    chunk.visibleBars = built.visibleBars;
    chunk.barBindings.clear();
    for (const [slot, binding] of built.bindings) {
      chunk.barBindings.set(slot, binding);
    }
    return { ...delta, visitedSlots: chunk.barSlots.length };
  }

  #syncGroups(
    parent: Container,
    records: Map<string, MeshRecord>,
    groups: readonly AggregateGeometryGroup[],
    chunkIndex: number,
    lane: string,
  ): GroupUploadDelta {
    const desired = new Set(groups.map((group) => group.key));
    let changed = false;
    let bytes = 0;
    for (const [key, record] of records) {
      if (desired.has(key)) continue;
      destroyMeshRecord(record);
      records.delete(key);
      changed = true;
    }

    for (const group of groups) {
      const current = records.get(group.key);
      if (
        current !== undefined &&
        current.geometry.positions.length === group.positions.length &&
        current.geometry.indices.length === group.indices.length
      ) {
        current.geometry.positions.set(group.positions);
        // Buffer.update exposes a prefix size, not an arbitrary byte offset.
        // Upload the complete dirty chunk/style position buffer only.
        current.geometry.getBuffer('aPosition').update(current.geometry.positions.byteLength);
        current.mesh.tint = group.tint;
        current.mesh.alpha = group.alpha;
        current.mesh.zIndex = group.drawOrder;
        current.primitiveCount = group.primitiveCount;
        bytes += current.geometry.positions.byteLength;
        changed = true;
        continue;
      }

      if (current !== undefined) destroyMeshRecord(current);
      const geometry = new MeshGeometry({
        positions: group.positions,
        uvs: group.uvs,
        indices: group.indices,
        topology: 'triangle-list',
      });
      geometry.batchMode = 'no-batch';
      const mesh = new Mesh({ geometry, texture: Texture.WHITE, roundPixels: false });
      mesh.label = `${this.#baseLabel}: ${lane} chunk ${chunkIndex}`;
      mesh.eventMode = 'none';
      mesh.tint = group.tint;
      mesh.alpha = group.alpha;
      mesh.zIndex = group.drawOrder;
      parent.addChild(mesh);
      records.set(group.key, { mesh, geometry, primitiveCount: group.primitiveCount });
      bytes += group.byteLength;
      changed = true;
    }
    return { bytes, changed };
  }

  #destroyChunk(chunkIndex: number): void {
    const chunk = this.#chunks.get(chunkIndex);
    if (chunk === undefined) return;
    for (const record of chunk.rectMeshes.values()) destroyMeshRecord(record);
    for (const record of chunk.barMeshes.values()) destroyMeshRecord(record);
    for (const record of chunk.relationMeshes.values()) destroyMeshRecord(record);
    this.#chunks.delete(chunkIndex);
  }
}
