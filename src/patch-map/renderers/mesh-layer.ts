import {
  Container,
  Graphics,
  GraphicsContext,
  Mesh,
  MeshGeometry,
  Texture,
  type Matrix,
} from 'pixi.js';

import type { CoreView, SlotRange } from '../dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';
import {
  createPatchMapResolvedRenderQuadScratch,
  resolvePatchMapSlotQuad,
  writePatchMapSlotQuad,
  type PatchMapEntityPaintProbe,
  type PatchMapProjectionRenderContext,
  type PatchMapRenderLaneProbe,
  type PatchMapResolvedRenderQuadScratch,
} from './types';
import type { PatchMapBackgroundPaintProjection } from '../contracts';
import {
  resolvePatchMapRelationPath,
} from '../semantic/relations';
import {
  resolvePatchMapRelationEndpointGeometry as endpointGeometry,
} from './relation-endpoint-geometry';
import {
  appendPatchMapRoundedRectPath,
  buildLineGeometry,
  buildQuadGeometry,
  clamp01,
  finishGeometry,
  fitPatchMapCornerRadii,
  isFiniteLine,
  isFiniteQuad,
  multiplyPackedRgba,
  packedRgbaToMeshStyle,
  writeExactQuadPositionValues,
  type AggregateGeometryData,
  type AggregateLine,
  type AggregateQuad,
  type PackedMeshStyle,
} from './mesh/geometry';

export {
  appendPatchMapRoundedRectPath,
  buildLineGeometry,
  buildQuadGeometry,
  fitPatchMapCornerRadii,
  multiplyPackedRgba,
  packedRgbaToMeshStyle,
  type AggregateGeometryData,
  type AggregateLine,
  type AggregateQuad,
  type PatchMapRoundedRectPathSink,
} from './mesh/geometry';

export const DEFAULT_AGGREGATE_MESH_CHUNK_SIZE = 512;

const RECT_PASS = 0;
const BAR_TRACK_PASS = 1;
const BAR_FILL_PASS = 2;
const RELATION_PASS = 0;
const PASSES_PER_Z_INDEX = 4;
const ROUNDED_BAR_CORNER_SEGMENTS = 4;
const ROUNDED_BAR_PERIMETER_VERTICES = 4 * (ROUNDED_BAR_CORNER_SEGMENTS + 1);
const ROUNDED_BAR_VERTICES_PER_PRIMITIVE = ROUNDED_BAR_PERIMETER_VERTICES + 1;
const ROUNDED_BAR_INDICES_PER_PRIMITIVE = ROUNDED_BAR_PERIMETER_VERTICES * 3;

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
  readonly projectionContext?: PatchMapProjectionRenderContext;
  /** World orientation changed while store topology and styles stayed fixed. */
  readonly projectionTransformOnly?: boolean;
}

export interface AggregateMeshLayerDebug {
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly meshCount: number;
  readonly backgroundMeshCount: number;
  readonly backgroundGraphicsObjectCount: number;
  readonly ordinaryMeshCount: number;
  readonly ordinaryGraphicsObjectCount: number;
  readonly relationMeshCount: number;
  readonly visibleBackgroundPrimitives: number;
  readonly visibleOrdinaryPrimitives: number;
  readonly visibleRelationsDynamicPrimitives: number;
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

interface MutableRoundedBarGroup extends PackedMeshStyle {
  readonly key: string;
  readonly drawOrder: number;
  readonly primitives: StyledBackgroundPrimitive[];
}

interface MeshRecord {
  readonly mesh: Mesh<MeshGeometry>;
  readonly geometry: MeshGeometry;
  readonly parent: Container;
  bounds: AggregateViewportBounds | null;
  primitiveCount: number;
}

interface GraphicsRecord {
  readonly graphics: Graphics;
  context: GraphicsContext;
  readonly parent: Container;
  bounds: AggregateViewportBounds | null;
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
  readonly entityId: string;
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
  readonly backgroundMeshes: Map<string, MeshRecord>;
  backgroundGraphics: Graphics | null;
  backgroundGraphicsContext: GraphicsContext | null;
  readonly rectMeshes: Map<string, MeshRecord>;
  readonly rectGraphics: Map<number, GraphicsRecord>;
  readonly barMeshes: Map<string, MeshRecord>;
  readonly barGraphics: Map<number, GraphicsRecord>;
  readonly relationMeshes: Map<string, MeshRecord>;
  readonly barSlots: number[];
  readonly barBindings: Map<number, BarSlotBinding>;
  readonly paintEntityIds: Set<string>;
  visibleBackgrounds: number;
  visibleRects: number;
  visibleBars: number;
  visibleRelations: number;
  geometryBounds: AggregateViewportBounds | null;
  geometryVisible: boolean | null;
}

interface AggregateViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface AggregateViewportCull {
  readonly matrix: Matrix;
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

interface AggregateChunkLaneGeometry {
  readonly backgroundGroups: readonly AggregateGeometryGroup[];
  readonly styledBackgrounds: readonly StyledBackgroundPrimitive[];
  readonly rectGroups: readonly AggregateGeometryGroup[];
  readonly styledRects: readonly StyledBackgroundPrimitive[];
  readonly barGroups: readonly AggregateGeometryGroup[];
  readonly styledBars: readonly StyledBackgroundPrimitive[];
  readonly relationGroups: readonly AggregateGeometryGroup[];
  readonly barSlots: readonly number[];
  readonly barBindings: ReadonlyMap<number, BarSlotBinding>;
  readonly paintProbes: ReadonlyMap<string, PatchMapEntityPaintProbe>;
  readonly visibleBackgrounds: number;
  readonly visibleRects: number;
  readonly visibleBars: number;
  readonly visibleRelations: number;
}

interface AggregateBarLaneGeometry {
  readonly groups: readonly AggregateGeometryGroup[];
  readonly styledBars: readonly StyledBackgroundPrimitive[];
  readonly bindings: ReadonlyMap<number, BarSlotBinding>;
  readonly paintProbes: ReadonlyMap<string, PatchMapEntityPaintProbe>;
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

interface StyledBackgroundPrimitive {
  readonly entityId: string;
  readonly quad: ReturnType<typeof resolvePatchMapSlotQuad>;
  readonly paint: PatchMapBackgroundPaintProjection;
  readonly fill: number;
  readonly borderColor: number;
  readonly opacity: number;
  readonly drawOrder: number;
}

const EMPTY_DEBUG: AggregateMeshLayerDebug = Object.freeze({
  chunkSize: DEFAULT_AGGREGATE_MESH_CHUNK_SIZE,
  chunkCount: 0,
  meshCount: 0,
  backgroundMeshCount: 0,
  backgroundGraphicsObjectCount: 0,
  ordinaryMeshCount: 0,
  ordinaryGraphicsObjectCount: 0,
  relationMeshCount: 0,
  visibleBackgroundPrimitives: 0,
  visibleOrdinaryPrimitives: 0,
  visibleRelationsDynamicPrimitives: 0,
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

function buildRoundedBarGeometry(
  primitives: readonly StyledBackgroundPrimitive[],
): AggregateGeometryData {
  const positions = new Float32Array(
    primitives.length * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2,
  );
  const uvs = new Float32Array(
    primitives.length * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2,
  );
  const indices = new Uint32Array(
    primitives.length * ROUNDED_BAR_INDICES_PER_PRIMITIVE,
  );

  for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
    const primitive = primitives[primitiveIndex] as StyledBackgroundPrimitive;
    const projection = primitive.quad.projection;
    const localWidth = projection?.localBounds[2] ?? primitive.quad.width;
    const localHeight = projection?.localBounds[3] ?? primitive.quad.height;
    if (!(localWidth > 0) || !(localHeight > 0)) continue;

    const scaleX = primitive.quad.width / localWidth;
    const scaleY = primitive.quad.height / localHeight;
    const [basisA, basisB, basisC, basisD] = primitive.quad.basis;
    const [topLeftX, topLeftY] = primitive.quad.vertices;
    const radii = fitPatchMapCornerRadii(
      localWidth,
      localHeight,
      primitive.paint.radius,
    );
    const vertexBase = primitiveIndex * ROUNDED_BAR_VERTICES_PER_PRIMITIVE;
    const positionBase = vertexBase * 2;
    const indexBase = primitiveIndex * ROUNDED_BAR_INDICES_PER_PRIMITIVE;

    const writeVertex = (vertexIndex: number, localX: number, localY: number): void => {
      const offset = positionBase + vertexIndex * 2;
      positions[offset] = Math.fround(
        topLeftX + basisA * scaleX * localX + basisC * scaleY * localY,
      );
      positions[offset + 1] = Math.fround(
        topLeftY + basisB * scaleX * localX + basisD * scaleY * localY,
      );
      uvs[offset] = localX / localWidth;
      uvs[offset + 1] = localY / localHeight;
    };

    writeVertex(0, localWidth / 2, localHeight / 2);
    let perimeterIndex = 0;
    const corners = [
      [localWidth - radii[1], radii[1], radii[1], -Math.PI / 2],
      [localWidth - radii[2], localHeight - radii[2], radii[2], 0],
      [radii[3], localHeight - radii[3], radii[3], Math.PI / 2],
      [radii[0], radii[0], radii[0], Math.PI],
    ] as const;
    for (const [centerX, centerY, radius, startAngle] of corners) {
      for (let segment = 0; segment <= ROUNDED_BAR_CORNER_SEGMENTS; segment += 1) {
        const angle = startAngle +
          (segment / ROUNDED_BAR_CORNER_SEGMENTS) * (Math.PI / 2);
        writeVertex(
          1 + perimeterIndex,
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
        );
        perimeterIndex += 1;
      }
    }

    for (let edge = 0; edge < ROUNDED_BAR_PERIMETER_VERTICES; edge += 1) {
      const offset = indexBase + edge * 3;
      indices[offset] = vertexBase;
      indices[offset + 1] = vertexBase + 1 + edge;
      indices[offset + 2] =
        vertexBase + 1 + ((edge + 1) % ROUNDED_BAR_PERIMETER_VERTICES);
    }
  }

  return finishGeometry(positions, uvs, indices, primitives.length);
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

function dirtyBarSlotsByChunk(
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

function buildRoundedBarGroups(
  primitives: readonly StyledBackgroundPrimitive[],
): readonly AggregateGeometryGroup[] {
  const groups = new Map<string, MutableRoundedBarGroup>();
  for (const primitive of primitives) {
    const style = packedRgbaToMeshStyle(primitive.fill, primitive.opacity);
    if (style.alpha <= 0) continue;
    const key = `rounded:${styleKey(style, primitive.drawOrder)}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        ...style,
        drawOrder: primitive.drawOrder,
        primitives: [],
      };
      groups.set(key, group);
    }
    group.primitives.push(primitive);
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    tint: group.tint,
    alpha: group.alpha,
    drawOrder: group.drawOrder,
    ...buildRoundedBarGeometry(group.primitives),
  }));
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

function isStyledBar(store: RenderStoreView, slot: number): boolean {
  return Math.max(0, store.radius[slot] as number) > 0;
}

function styledBarPaint(
  entityId: string,
  fill: number,
  radius: number,
): PatchMapBackgroundPaintProjection {
  return Object.freeze({
    entityId,
    sourceKind: 'rect',
    fill: fill >>> 0,
    borderWidth: 0,
    borderColor: 0,
    radius: Object.freeze([radius, radius, radius, radius] as const),
    tint: 0xffffffff,
  });
}

function appendStyledBarSlot(
  store: RenderStoreView,
  slot: number,
  primitives: StyledBackgroundPrimitive[],
  bindings: Map<number, BarSlotBinding>,
  projectionContext?: PatchMapProjectionRenderContext,
): number {
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const progress = resolveBarProgress(store, slot);
  const entityId = store.ids[slot] ?? `@slot:${slot}`;
  let count = 0;
  if (isDrawable(store, slot) && width > 0 && height > 0) {
    const opacity = store.opacity[slot] as number;
    const zIndex = store.zIndex[slot] as number;
    const radius = Math.max(0, store.radius[slot] as number);
    const trackFill = (store.trackFill[slot] as number) >>> 0;
    const trackStyle = packedRgbaToMeshStyle(trackFill, opacity);
    if (trackStyle.alpha > 0) {
      primitives.push({
        entityId,
        quad: resolvePatchMapSlotQuad(store, slot, projectionContext),
        paint: styledBarPaint(entityId, trackFill, radius),
        fill: trackFill,
        borderColor: 0,
        opacity,
        drawOrder: zIndex * PASSES_PER_Z_INDEX + BAR_TRACK_PASS,
      });
      count += 1;
    }

    const fillWidth = width * progress;
    const fill = (store.fill[slot] as number) >>> 0;
    const fillStyle = packedRgbaToMeshStyle(fill, opacity);
    if (fillWidth > 0 && fillStyle.alpha > 0) {
      const fillRadius = Math.min(radius, fillWidth / 2, height / 2);
      primitives.push({
        entityId,
        quad: resolvePatchMapSlotQuad(store, slot, projectionContext, progress),
        paint: styledBarPaint(entityId, fill, fillRadius),
        fill,
        borderColor: 0,
        opacity,
        drawOrder: zIndex * PASSES_PER_Z_INDEX + BAR_FILL_PASS,
      });
      count += 1;
    }
  }
  bindings.set(slot, {
    entityId,
    track: null,
    fill: null,
    x,
    y,
    width,
    height,
    rotation,
    progress,
    projectionRevision: projectionContext?.revision ?? -1,
  });
  return count;
}

function appendBarSlot(
  store: RenderStoreView,
  slot: number,
  groups: Map<string, MutableQuadGroup>,
  bindings: Map<number, BarSlotBinding>,
  projectionContext?: PatchMapProjectionRenderContext,
): number {
  let track: BarPrimitiveBinding | null = null;
  let fill: BarPrimitiveBinding | null = null;
  const x = store.x[slot] as number;
  const y = store.y[slot] as number;
  const width = store.width[slot] as number;
  const height = store.height[slot] as number;
  const rotation = store.rotation[slot] as number;
  const progress = resolveBarProgress(store, slot);
  const entityId = store.ids[slot] ?? `@slot:${slot}`;
  const trackQuad = resolvePatchMapSlotQuad(store, slot, projectionContext);
  const fillQuad = resolvePatchMapSlotQuad(store, slot, projectionContext, progress);
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
    entityId,
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
  projectionContext?: PatchMapProjectionRenderContext,
): AggregateBarLaneGeometry {
  const groups = new Map<string, MutableQuadGroup>();
  const styledBars: StyledBackgroundPrimitive[] = [];
  const bindings = new Map<number, BarSlotBinding>();
  const paintProbes = new Map<string, PatchMapEntityPaintProbe>();
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
    const styled = isStyledBar(store, slot);
    const primitives = styled
      ? appendStyledBarSlot(store, slot, styledBars, bindings, projectionContext)
      : appendBarSlot(store, slot, groups, bindings, projectionContext);
    visibleBars += primitives;
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    paintProbes.set(entityId, barEntityPaintProbe(entityId, primitives));
  }
  return {
    groups: [
      ...[...groups.values()].map((group) =>
        geometryGroup(group, buildQuadGeometry(group.primitives)),
      ),
      ...buildRoundedBarGroups(styledBars),
    ],
    styledBars: [],
    bindings,
    paintProbes,
    visibleBars,
  };
}

function barEntityPaintProbe(
  entityId: string,
  primitives: number,
): PatchMapEntityPaintProbe {
  return freezeEntityPaintProbe({
    entityId,
    lane: 'relations-dynamic',
    rendererKind: primitives > 0 ? 'mesh' : 'none',
    primitiveCount: primitives,
    renderObjectCount: 0,
    packedTint: null,
    rgbTint: null,
    alpha: null,
  });
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
    isStyledBar(store, slot) ||
    binding === undefined ||
    binding.entityId !== (store.ids[slot] ?? `@slot:${slot}`) ||
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
  projectionContext?: PatchMapProjectionRenderContext,
): AggregateChunkLaneGeometry {
  const backgroundGroups = new Map<string, MutableQuadGroup>();
  const styledBackgrounds: StyledBackgroundPrimitive[] = [];
  const rectGroups = new Map<string, MutableQuadGroup>();
  const styledRects: StyledBackgroundPrimitive[] = [];
  const barGroups = new Map<string, MutableQuadGroup>();
  const styledBars: StyledBackgroundPrimitive[] = [];
  const relationGroups = new Map<string, MutableLineGroup>();
  const barSlots: number[] = [];
  const barBindings = new Map<number, BarSlotBinding>();
  const paintProbes = new Map<string, PatchMapEntityPaintProbe>();
  const resolvedStart = Math.max(0, Math.min(store.capacity, Math.floor(start)));
  const resolvedEnd = Math.max(resolvedStart, Math.min(store.capacity, Math.ceil(end)));
  let visibleBackgrounds = 0;
  let visibleRects = 0;
  let visibleBars = 0;
  let visibleRelations = 0;

  for (let slot = resolvedStart; slot < resolvedEnd; slot += 1) {
    if ((store.alive[slot] as number) === 0) continue;
    const entityId = store.ids[slot] ?? `@slot:${slot}`;
    const kind = store.kind[slot] as number;
    if (kind === RenderKind.Bar) {
      barSlots.push(slot);
      const styled = isStyledBar(store, slot);
      const primitives = styled
        ? appendStyledBarSlot(store, slot, styledBars, barBindings, projectionContext)
        : appendBarSlot(store, slot, barGroups, barBindings, projectionContext);
      visibleBars += primitives;
      paintProbes.set(entityId, barEntityPaintProbe(entityId, primitives));
      continue;
    }
    if (
      kind === RenderKind.Rect &&
      projectionContext?.index.componentsByEntityId?.[entityId]?.renderRole ===
        'background-geometry'
    ) {
      const paint = projectionContext.index.backgroundsByEntityId?.[entityId];
      const opacity = store.opacity[slot] as number;
      const presentationFill = presentationFillOverride(store, entityId);
      const packedFill = presentationFill ?? (
        paint?.sourceKind === 'rect'
          ? multiplyPackedRgba(paint.fill, paint.tint)
          : (store.fill[slot] as number) >>> 0
      );
      const fillStyle = packedRgbaToMeshStyle(packedFill, opacity);
      const packedBorder = paint?.sourceKind === 'rect'
        ? multiplyPackedRgba(paint.borderColor, paint.tint)
        : (store.stroke[slot] as number) >>> 0;
      const borderStyle = packedRgbaToMeshStyle(
        packedBorder,
        opacity,
      );
      const drawable = isDrawable(store, slot);
      const styled = paint?.sourceKind === 'rect' && (
        paint.borderWidth > 0 || paint.radius.some((value) => value > 0)
      );
      const visiblePaint = drawable && (
        fillStyle.alpha > 0 ||
        (styled === true && paint.borderWidth > 0 && borderStyle.alpha > 0)
      );
      let rendererKind: PatchMapEntityPaintProbe['rendererKind'] = 'none';
      if (visiblePaint) {
        const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
        if (styled && paint) {
          styledBackgrounds.push({
            entityId,
            quad,
            paint,
            fill: packedFill,
            borderColor: packedBorder,
            opacity,
            drawOrder: (store.zIndex[slot] as number) * PASSES_PER_Z_INDEX + RECT_PASS,
          });
          rendererKind = 'graphics';
          visibleBackgrounds += 1;
        } else {
          const group = getQuadGroup(
            backgroundGroups,
            packedFill,
            opacity,
            store.zIndex[slot] as number,
            RECT_PASS,
          );
          if (group !== null) {
            group.primitives.push({
              x: store.x[slot] as number,
              y: store.y[slot] as number,
              width: store.width[slot] as number,
              height: store.height[slot] as number,
              rotation: store.rotation[slot] as number,
              vertices: quad.vertices,
            });
            rendererKind = 'mesh';
            visibleBackgrounds += 1;
          }
        }
      }
      paintProbes.set(entityId, freezeEntityPaintProbe({
        entityId,
        lane: 'background-geometry',
        rendererKind,
        primitiveCount: rendererKind === 'none' ? 0 : 1,
        renderObjectCount: 0,
        packedTint: packedFill,
        rgbTint: rendererKind === 'none' ? null : fillStyle.tint,
        alpha: rendererKind === 'none' ? null : fillStyle.alpha,
      }));
      continue;
    }
    if (!isDrawable(store, slot)) continue;
    const opacity = store.opacity[slot] as number;
    const zIndex = store.zIndex[slot] as number;

    if (kind === RenderKind.Rect) {
      const width = store.width[slot] as number;
      const height = store.height[slot] as number;
      const packedFill = (store.fill[slot] as number) >>> 0;
      const packedBorder = (store.stroke[slot] as number) >>> 0;
      const fillStyle = packedRgbaToMeshStyle(packedFill, opacity);
      const borderStyle = packedRgbaToMeshStyle(packedBorder, opacity);
      const borderWidth = Math.max(0, store.strokeWidth[slot] as number);
      const radius = Math.max(0, store.radius[slot] as number);
      const styled = radius > 0 || (borderWidth > 0 && borderStyle.alpha > 0);
      const visiblePaint = width > 0 && height > 0 && (
        fillStyle.alpha > 0 || (borderWidth > 0 && borderStyle.alpha > 0)
      );
      if (visiblePaint && styled) {
        const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
        styledRects.push({
          entityId,
          quad,
          paint: Object.freeze({
            entityId,
            sourceKind: 'rect',
            fill: packedFill,
            borderWidth,
            borderColor: packedBorder,
            radius: Object.freeze([radius, radius, radius, radius] as const),
            tint: 0xffffffff,
          }),
          fill: packedFill,
          borderColor: packedBorder,
          opacity,
          drawOrder: zIndex * PASSES_PER_Z_INDEX + RECT_PASS,
        });
        visibleRects += 1;
        paintProbes.set(entityId, freezeEntityPaintProbe({
          entityId,
          lane: 'ordinary-geometry',
          rendererKind: 'graphics',
          primitiveCount: 1,
          renderObjectCount: 0,
          packedTint: packedFill,
          rgbTint: fillStyle.tint,
          alpha: fillStyle.alpha,
        }));
      } else if (visiblePaint) {
        const group = getQuadGroup(rectGroups, packedFill, opacity, zIndex, RECT_PASS);
        if (group !== null) {
          const quad = resolvePatchMapSlotQuad(store, slot, projectionContext);
          group.primitives.push({
            x: store.x[slot] as number,
            y: store.y[slot] as number,
            width,
            height,
            rotation: store.rotation[slot] as number,
            vertices: quad.vertices,
          });
          visibleRects += 1;
          paintProbes.set(entityId, freezeEntityPaintProbe({
            entityId,
            lane: 'ordinary-geometry',
            rendererKind: 'mesh',
            primitiveCount: 1,
            renderObjectCount: 0,
            packedTint: packedFill,
            rgbTint: fillStyle.tint,
            alpha: fillStyle.alpha,
          }));
        }
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
    const fromQuad = resolvePatchMapSlotQuad(store, from, projectionContext);
    const toQuad = resolvePatchMapSlotQuad(store, to, projectionContext);
    const lines: AggregateLine[] = [];
    if (relationProjection) {
      const path = resolvePatchMapRelationPath(
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
    const style = packedRgbaToMeshStyle(store.color[slot] as number, opacity);
    paintProbes.set(entityId, freezeEntityPaintProbe({
      entityId,
      lane: 'relations-dynamic',
      rendererKind: 'mesh',
      primitiveCount: lines.length,
      renderObjectCount: 0,
      packedTint: (store.color[slot] as number) >>> 0,
      rgbTint: style.tint,
      alpha: style.alpha,
    }));
  }

  return {
    backgroundGroups: [...backgroundGroups.values()].map((group) =>
      geometryGroup(group, buildQuadGeometry(group.primitives)),
    ),
    styledBackgrounds,
    rectGroups: [...rectGroups.values()].map((group) =>
      geometryGroup(group, buildQuadGeometry(group.primitives)),
    ),
    styledRects,
    barGroups: [
      ...[...barGroups.values()].map((group) =>
        geometryGroup(group, buildQuadGeometry(group.primitives)),
      ),
      ...buildRoundedBarGroups(styledBars),
    ],
    styledBars: [],
    relationGroups: [...relationGroups.values()].map((group) =>
      geometryGroup(group, buildLineGeometry(group.primitives)),
    ),
    barSlots,
    barBindings,
    paintProbes,
    visibleBackgrounds,
    visibleRects,
    visibleBars,
    visibleRelations,
  };
}

function presentationFillOverride(
  store: RenderStoreView,
  entityId: string,
): number | null {
  const candidate = (
    store as RenderStoreView & {
      presentationFillOverride?: (id: string) => number | null;
    }
  ).presentationFillOverride;
  if (typeof candidate !== 'function') return null;
  const value = candidate.call(store, entityId);
  return value === null ? null : value >>> 0;
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
  projectionContext?: PatchMapProjectionRenderContext,
): AggregateChunkGeometry {
  const built = buildAggregateChunkLaneGeometry(store, start, end, projectionContext);
  return {
    quadGroups: [...built.backgroundGroups, ...built.rectGroups, ...built.barGroups],
    relationGroups: built.relationGroups,
    visibleQuads: built.visibleBackgrounds + built.visibleRects + built.visibleBars,
    visibleRelations: built.visibleRelations,
  };
}

function destroyMeshRecord(record: MeshRecord): void {
  record.mesh.destroy();
  record.geometry.destroy(true);
}

function createChunkRecord(): ChunkRecord {
  return {
    backgroundMeshes: new Map(),
    backgroundGraphics: null,
    backgroundGraphicsContext: null,
    rectMeshes: new Map(),
    rectGraphics: new Map(),
    barMeshes: new Map(),
    barGraphics: new Map(),
    relationMeshes: new Map(),
    barSlots: [],
    barBindings: new Map(),
    paintEntityIds: new Set(),
    visibleBackgrounds: 0,
    visibleRects: 0,
    visibleBars: 0,
    visibleRelations: 0,
    geometryBounds: null,
    geometryVisible: null,
  };
}

function aggregateLaneGeometryBounds(
  geometry: AggregateChunkLaneGeometry,
): AggregateViewportBounds | null {
  let bounds: AggregateViewportBounds | null = null;
  for (const group of [
    ...geometry.backgroundGroups,
    ...geometry.rectGroups,
    ...geometry.barGroups,
  ]) {
    bounds = includePositionBounds(bounds, group.positions);
  }
  for (const background of geometry.styledBackgrounds) {
    bounds = includePositionBounds(bounds, background.quad.vertices);
  }
  for (const rect of geometry.styledRects) {
    bounds = includePositionBounds(bounds, rect.quad.vertices);
  }
  for (const bar of geometry.styledBars) {
    bounds = includePositionBounds(bounds, bar.quad.vertices);
  }
  return bounds;
}

function includePositionBounds(
  bounds: AggregateViewportBounds | null,
  positions: ArrayLike<number>,
): AggregateViewportBounds | null {
  let next = bounds;
  for (let index = 0; index + 1 < positions.length; index += 2) {
    const x = positions[index];
    const y = positions[index + 1];
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    next ??= { minX: x, minY: y, maxX: x, maxY: y };
    next.minX = Math.min(next.minX, x);
    next.minY = Math.min(next.minY, y);
    next.maxX = Math.max(next.maxX, x);
    next.maxY = Math.max(next.maxY, y);
  }
  return next;
}

function chunkIntersectsViewport(
  chunk: ChunkRecord,
  viewport: AggregateViewportCull,
): boolean {
  const bounds = chunk.geometryBounds;
  if (bounds === null) return true;
  const { matrix, width, height, padding } = viewport;
  const corners = [
    bounds.minX, bounds.minY,
    bounds.maxX, bounds.minY,
    bounds.maxX, bounds.maxY,
    bounds.minX, bounds.maxY,
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < corners.length; index += 2) {
    const x = corners[index]!;
    const y = corners[index + 1]!;
    const screenX = matrix.a * x + matrix.c * y + matrix.tx;
    const screenY = matrix.b * x + matrix.d * y + matrix.ty;
    minX = Math.min(minX, screenX);
    minY = Math.min(minY, screenY);
    maxX = Math.max(maxX, screenX);
    maxY = Math.max(maxY, screenY);
  }
  return maxX >= -padding &&
    minX <= width + padding &&
    maxY >= -padding &&
    minY <= height + padding;
}

function setChunkGeometryVisible(
  chunk: ChunkRecord,
  visible: boolean,
  backgroundParent: Container,
  viewport: AggregateViewportCull,
  precise: boolean,
  force = false,
): void {
  if (
    !force &&
    chunk.geometryVisible === visible &&
    (!visible || !precise)
  ) {
    return;
  }
  for (const records of [
    chunk.backgroundMeshes,
    chunk.rectMeshes,
    chunk.barMeshes,
  ]) {
    for (const { mesh, parent, bounds } of records.values()) {
      const recordVisible =
        visible && (!precise || boundsIntersectsViewport(bounds, viewport));
      mesh.visible = recordVisible;
      if (recordVisible) {
        if (mesh.parent !== parent) parent.addChild(mesh);
      } else if (mesh.parent === parent) {
        parent.removeChild(mesh);
      }
    }
  }
  for (const record of chunk.rectGraphics.values()) {
    const recordVisible =
      visible && (!precise || boundsIntersectsViewport(record.bounds, viewport));
    record.graphics.visible = recordVisible;
    if (recordVisible) {
      if (record.graphics.parent !== record.parent) record.parent.addChild(record.graphics);
    } else if (record.graphics.parent === record.parent) {
      record.parent.removeChild(record.graphics);
    }
  }
  for (const record of chunk.barGraphics.values()) {
    const recordVisible =
      visible && (!precise || boundsIntersectsViewport(record.bounds, viewport));
    record.graphics.visible = recordVisible;
    if (recordVisible) {
      if (record.graphics.parent !== record.parent) record.parent.addChild(record.graphics);
    } else if (record.graphics.parent === record.parent) {
      record.parent.removeChild(record.graphics);
    }
  }
  if (chunk.backgroundGraphics !== null) {
    chunk.backgroundGraphics.visible = visible;
    if (visible) {
      if (chunk.backgroundGraphics.parent !== backgroundParent) {
        backgroundParent.addChild(chunk.backgroundGraphics);
      }
    } else if (chunk.backgroundGraphics.parent === backgroundParent) {
      backgroundParent.removeChild(chunk.backgroundGraphics);
    }
  }
  chunk.geometryVisible = visible;
}

function boundsIntersectsViewport(
  bounds: AggregateViewportBounds | null,
  viewport: AggregateViewportCull,
): boolean {
  if (bounds === null) return true;
  const { matrix, width, height, padding } = viewport;
  const x0 = bounds.minX;
  const y0 = bounds.minY;
  const x1 = bounds.maxX;
  const y1 = bounds.maxY;
  const screenX0 = matrix.a * x0 + matrix.c * y0 + matrix.tx;
  const screenY0 = matrix.b * x0 + matrix.d * y0 + matrix.ty;
  const screenX1 = matrix.a * x1 + matrix.c * y0 + matrix.tx;
  const screenY1 = matrix.b * x1 + matrix.d * y0 + matrix.ty;
  const screenX2 = matrix.a * x1 + matrix.c * y1 + matrix.tx;
  const screenY2 = matrix.b * x1 + matrix.d * y1 + matrix.ty;
  const screenX3 = matrix.a * x0 + matrix.c * y1 + matrix.tx;
  const screenY3 = matrix.b * x0 + matrix.d * y1 + matrix.ty;
  const minX = Math.min(screenX0, screenX1, screenX2, screenX3);
  const minY = Math.min(screenY0, screenY1, screenY2, screenY3);
  const maxX = Math.max(screenX0, screenX1, screenX2, screenX3);
  const maxY = Math.max(screenY0, screenY1, screenY2, screenY3);
  return maxX >= -padding &&
    minX <= width + padding &&
    maxY >= -padding &&
    minY <= height + padding;
}

function freezeEntityPaintProbe(
  probe: PatchMapEntityPaintProbe,
): PatchMapEntityPaintProbe {
  return Object.freeze({ ...probe });
}

function appendStyledBackground(
  context: GraphicsContext,
  primitive: StyledBackgroundPrimitive,
): void {
  const projection = primitive.quad.projection;
  const localWidth = projection?.localBounds[2] ?? primitive.quad.width;
  const localHeight = projection?.localBounds[3] ?? primitive.quad.height;
  if (!(localWidth > 0) || !(localHeight > 0)) return;
  const scaleX = primitive.quad.width / localWidth;
  const scaleY = primitive.quad.height / localHeight;
  const [basisA, basisB, basisC, basisD] = primitive.quad.basis;
  const [topLeftX, topLeftY] = primitive.quad.vertices;
  const fill = packedRgbaToMeshStyle(primitive.fill, primitive.opacity);
  const stroke = packedRgbaToMeshStyle(primitive.borderColor, primitive.opacity);

  context.save();
  context.setTransform(
    basisA * scaleX,
    basisB * scaleX,
    basisC * scaleY,
    basisD * scaleY,
    topLeftX,
    topLeftY,
  );
  context.beginPath();
  appendPatchMapRoundedRectPath(context, localWidth, localHeight, primitive.paint.radius);
  if (fill.alpha > 0) context.fill({ color: fill.tint, alpha: fill.alpha });
  if (primitive.paint.borderWidth > 0 && stroke.alpha > 0) {
    context.stroke({
      width: primitive.paint.borderWidth,
      color: stroke.tint,
      alpha: stroke.alpha,
      alignment: 0.5,
    });
  }
  context.restore();
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
  public readonly backgroundGeometryContainer: Container;
  public readonly ordinaryGeometryContainer: Container;
  public readonly relationsDynamicContainer: Container;
  /** Compatibility aliases retained for existing renderer tests and consumers. */
  public readonly quadContainer: Container;
  public readonly relationContainer: Container;
  public readonly chunkSize: number;

  readonly #baseLabel: string;
  readonly #applyStoreView: boolean;
  readonly #chunks = new Map<number, ChunkRecord>();
  readonly #paintProbesByEntityId = new Map<string, PatchMapEntityPaintProbe>();
  #lastStore: RenderStoreView | null = null;
  #lastCapacity = 0;
  #lastRevision = -1;
  #fullRebuildEpoch: number | undefined;
  #previousAlive = new Uint8Array(0);
  #previousKind = new Uint8Array(0);
  readonly #deferredBarChunks = new Set<number>();
  #destroyed = false;
  #debug: AggregateMeshLayerDebug;
  #view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  #projectionContext: PatchMapProjectionRenderContext | undefined;
  #viewportCull: AggregateViewportCull | null = null;
  #preciseViewportCull = true;
  readonly #trackQuadScratch = createPatchMapResolvedRenderQuadScratch();
  readonly #fillQuadScratch = createPatchMapResolvedRenderQuadScratch();

  public constructor(options: AggregateMeshLayerOptions = {}) {
    const chunkSize = options.chunkSize ?? DEFAULT_AGGREGATE_MESH_CHUNK_SIZE;
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('chunkSize must be a positive safe integer');
    }
    this.chunkSize = chunkSize;
    this.#baseLabel = options.label ?? 'PatchMap aggregate mesh';
    this.#applyStoreView = options.applyStoreView ?? true;
    this.container = new Container({ label: this.#baseLabel });
    this.backgroundGeometryContainer = new Container({
      label: 'PatchMap / background geometry (0)',
    });
    this.ordinaryGeometryContainer = new Container({ label: `${this.#baseLabel}: rect/bar` });
    this.relationsDynamicContainer = new Container({ label: `${this.#baseLabel}: relations` });
    this.quadContainer = this.ordinaryGeometryContainer;
    this.relationContainer = this.relationsDynamicContainer;
    this.container.eventMode = 'none';
    this.backgroundGeometryContainer.eventMode = 'none';
    this.quadContainer.eventMode = 'none';
    this.relationContainer.eventMode = 'none';
    this.backgroundGeometryContainer.interactiveChildren = false;
    this.quadContainer.sortableChildren = true;
    this.relationContainer.sortableChildren = true;
    this.backgroundGeometryContainer.sortableChildren = true;
    this.container.addChild(this.quadContainer, this.relationContainer);
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

  public entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null {
    return this.#paintProbesByEntityId.get(entityId) ?? null;
  }

  public renderLaneProbe(): Readonly<{
    readonly backgroundGeometry: PatchMapRenderLaneProbe;
    readonly ordinaryGeometry: PatchMapRenderLaneProbe;
    readonly relationsDynamic: PatchMapRenderLaneProbe;
  }> {
    return Object.freeze({
      backgroundGeometry: Object.freeze({
        role: 'background-geometry',
        label: this.backgroundGeometryContainer.label,
        renderObjectCount:
          this.#debug.backgroundMeshCount + this.#debug.backgroundGraphicsObjectCount,
        visiblePrimitiveCount: this.#debug.visibleBackgroundPrimitives,
      }),
      ordinaryGeometry: Object.freeze({
        role: 'ordinary-geometry',
        label: this.ordinaryGeometryContainer.label,
        renderObjectCount:
          this.#debug.ordinaryMeshCount + this.#debug.ordinaryGraphicsObjectCount,
        visiblePrimitiveCount: this.#debug.visibleOrdinaryPrimitives,
      }),
      relationsDynamic: Object.freeze({
        role: 'relations-dynamic',
        label: this.relationsDynamicContainer.label,
        renderObjectCount: this.#debug.relationMeshCount,
        visiblePrimitiveCount: this.#debug.visibleRelationsDynamicPrimitives,
      }),
    });
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
    this.backgroundGeometryContainer.position.set(next.x, next.y);
    this.backgroundGeometryContainer.scale.set(next.scale);
    this.backgroundGeometryContainer.angle = next.rotation;
    this.container.position.set(next.x, next.y);
    this.container.scale.set(next.scale);
    this.container.angle = next.rotation;
    return true;
  }

  /**
   * Cull fixed geometry chunks from their retained scene-space bounds. Relation
   * meshes stay visible because their endpoints may span multiple chunks.
   */
  public cull(
    worldMatrix: Matrix,
    viewportWidth: number,
    viewportHeight: number,
    padding = 48,
    precise = true,
  ): number {
    this.#assertAlive();
    if (
      !Number.isFinite(viewportWidth) ||
      viewportWidth <= 0 ||
      !Number.isFinite(viewportHeight) ||
      viewportHeight <= 0 ||
      !Number.isFinite(padding) ||
      padding < 0
    ) {
      throw new TypeError('aggregate culling viewport and padding must be finite and positive');
    }
    const viewport: AggregateViewportCull = {
      matrix: worldMatrix.clone(),
      width: viewportWidth,
      height: viewportHeight,
      padding,
    };
    const precisionChanged = this.#preciseViewportCull !== precise;
    this.#viewportCull = viewport;
    this.#preciseViewportCull = precise;
    let visibleChunks = 0;
    for (const chunk of this.#chunks.values()) {
      const visible = chunkIntersectsViewport(chunk, viewport);
      setChunkGeometryVisible(
        chunk,
        visible,
        this.backgroundGeometryContainer,
        viewport,
        precise,
        precisionChanged,
      );
      if (visible) visibleChunks += 1;
    }
    return visibleChunks;
  }

  /** True when a previously offscreen bar chunk has entered the viewport. */
  public hasVisibleDeferredBarUpdates(): boolean {
    if (this.#viewportCull === null) return false;
    for (const chunkIndex of this.#deferredBarChunks) {
      const chunk = this.#chunks.get(chunkIndex);
      if (chunk !== undefined && chunkIntersectsViewport(chunk, this.#viewportCull)) {
        return true;
      }
    }
    return false;
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
    const projectionBarChunks =
      !fullRebuild && options.projectionTransformOnly === true
        ? dirtyBarSlotsByChunk(
            store,
            this.chunkSize,
            options.changedRanges ?? [],
          )
        : null;
    const requestedDirtyChunks = new Set(fullRebuild
      ? Array.from({ length: maximumChunk }, (_, chunk) => chunk)
      : projectionBarChunks === null
        ? dirtyChunkIndices(store.capacity, this.chunkSize, options.changedRanges ?? [])
        : projectionBarChunks.keys());
    const barOnlyChunks = fullRebuild
      ? new Map<number, readonly number[]>()
      : projectionBarChunks ??
        barOnlyDirtyChunkSlots(
          store,
          this.chunkSize,
          options.changedRanges ?? [],
          this.#previousAlive,
          this.#previousKind,
        );

    if (fullRebuild) {
      this.#deferredBarChunks.clear();
      for (const chunk of this.#chunks.keys()) {
        if (chunk >= maximumChunk) this.#destroyChunk(chunk);
      }
    }
    const dirtyChunks = new Set(requestedDirtyChunks);
    if (!fullRebuild && this.#viewportCull !== null) {
      for (const chunkIndex of this.#deferredBarChunks) {
        const chunk = this.#chunks.get(chunkIndex);
        if (chunk !== undefined && chunkIntersectsViewport(chunk, this.#viewportCull)) {
          dirtyChunks.add(chunkIndex);
        }
      }
    }

    let uploadedChunks = 0;
    let uploadedBytes = 0;
    let geometrySlotsVisited = 0;
    for (const chunkIndex of [...dirtyChunks].sort((left, right) => left - right)) {
      const chunk = this.#chunks.get(chunkIndex);
      const requested = requestedDirtyChunks.has(chunkIndex);
      let changedBarSlots = requested
        ? barOnlyChunks.get(chunkIndex)
        : chunk?.barSlots;
      if (
        changedBarSlots !== undefined &&
        chunk !== undefined &&
        this.#viewportCull !== null
      ) {
        this.#expandBarChunkBounds(store, chunk, changedBarSlots);
        if (!chunkIntersectsViewport(chunk, this.#viewportCull)) {
          this.#deferredBarChunks.add(chunkIndex);
          continue;
        }
        if (this.#deferredBarChunks.has(chunkIndex)) {
          changedBarSlots = chunk.barSlots;
        }
      }
      const delta = changedBarSlots !== undefined
        ? this.#syncBarChunk(store, chunkIndex, changedBarSlots)
        : this.#syncChunk(store, chunkIndex);
      this.#deferredBarChunks.delete(chunkIndex);
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
    let backgroundMeshCount = 0;
    let backgroundGraphicsObjectCount = 0;
    let ordinaryMeshCount = 0;
    let ordinaryGraphicsObjectCount = 0;
    let relationMeshCount = 0;
    let visibleBackgroundPrimitives = 0;
    let visibleOrdinaryPrimitives = 0;
    let visibleRelationsDynamicPrimitives = 0;
    let visibleQuads = 0;
    let visibleRelations = 0;
    for (const chunk of this.#chunks.values()) {
      backgroundMeshCount += chunk.backgroundMeshes.size;
      backgroundGraphicsObjectCount += chunk.backgroundGraphics === null ? 0 : 1;
      ordinaryMeshCount += chunk.rectMeshes.size;
      ordinaryGraphicsObjectCount += chunk.rectGraphics.size;
      relationMeshCount +=
        chunk.barMeshes.size + chunk.barGraphics.size + chunk.relationMeshes.size;
      visibleBackgroundPrimitives += chunk.visibleBackgrounds;
      visibleOrdinaryPrimitives += chunk.visibleRects;
      visibleRelationsDynamicPrimitives += chunk.visibleBars + chunk.visibleRelations;
      visibleQuads += chunk.visibleBackgrounds + chunk.visibleRects + chunk.visibleBars;
      visibleRelations += chunk.visibleRelations;
    }
    meshCount =
      backgroundMeshCount +
      backgroundGraphicsObjectCount +
      ordinaryMeshCount +
      ordinaryGraphicsObjectCount +
      relationMeshCount;
    this.#debug = Object.freeze({
      chunkSize: this.chunkSize,
      chunkCount: this.#chunks.size,
      meshCount,
      backgroundMeshCount,
      backgroundGraphicsObjectCount,
      ordinaryMeshCount,
      ordinaryGraphicsObjectCount,
      relationMeshCount,
      visibleBackgroundPrimitives,
      visibleOrdinaryPrimitives,
      visibleRelationsDynamicPrimitives,
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
    this.container.label =
      `${this.#baseLabel} (${ordinaryMeshCount + relationMeshCount} meshes, ${ordinaryGraphicsObjectCount} graphics)`;
    this.backgroundGeometryContainer.label =
      `PatchMap / background geometry (${visibleBackgroundPrimitives})`;
    this.quadContainer.label =
      `${this.#baseLabel}: rect/bar (${visibleOrdinaryPrimitives})`;
    this.relationContainer.label =
      `${this.#baseLabel}: relations/dynamic (${visibleRelationsDynamicPrimitives})`;
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
    this.#deferredBarChunks.clear();
    this.#viewportCull = null;
    this.#paintProbesByEntityId.clear();
    this.#debug = Object.freeze({
      ...this.#debug,
      chunkCount: 0,
      meshCount: 0,
      backgroundMeshCount: 0,
      backgroundGraphicsObjectCount: 0,
      ordinaryMeshCount: 0,
      ordinaryGraphicsObjectCount: 0,
      relationMeshCount: 0,
      visibleBackgroundPrimitives: 0,
      visibleOrdinaryPrimitives: 0,
      visibleRelationsDynamicPrimitives: 0,
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
    this.backgroundGeometryContainer.destroy();
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
      built.backgroundGroups.length === 0 &&
      built.styledBackgrounds.length === 0 &&
      built.rectGroups.length === 0 &&
      built.styledRects.length === 0 &&
      built.barGroups.length === 0 &&
      built.styledBars.length === 0 &&
      built.relationGroups.length === 0 &&
      built.barSlots.length === 0 &&
      built.paintProbes.size === 0
    ) {
      const changed = chunk !== undefined;
      if (changed) this.#destroyChunk(chunkIndex);
      return { bytes: 0, changed, visitedSlots: end - start };
    }
    if (chunk === undefined) {
      chunk = createChunkRecord();
      this.#chunks.set(chunkIndex, chunk);
    }

    for (const entityId of chunk.paintEntityIds) this.#paintProbesByEntityId.delete(entityId);
    chunk.paintEntityIds.clear();

    const backgroundDelta = this.#syncGroups(
      this.backgroundGeometryContainer,
      chunk.backgroundMeshes,
      built.backgroundGroups,
      chunkIndex,
      'background',
    );
    const backgroundGraphicsChanged = this.#syncBackgroundGraphics(
      chunk,
      built.styledBackgrounds,
      chunkIndex,
    );

    const rectDelta = this.#syncGroups(
      this.quadContainer,
      chunk.rectMeshes,
      built.rectGroups,
      chunkIndex,
      'rect',
    );
    const rectGraphicsChanged = this.#syncRectGraphics(
      chunk,
      built.styledRects,
      chunkIndex,
    );
    const barDelta = this.#syncGroups(
      this.relationContainer,
      chunk.barMeshes,
      built.barGroups,
      chunkIndex,
      'bar',
    );
    const barGraphicsChanged = this.#syncBarGraphics(
      chunk,
      built.styledBars,
      chunkIndex,
    );
    const relationDelta = this.#syncGroups(
      this.relationContainer,
      chunk.relationMeshes,
      built.relationGroups,
      chunkIndex,
      'relation',
    );
    chunk.visibleRects = built.visibleRects;
    chunk.visibleBackgrounds = built.visibleBackgrounds;
    chunk.visibleBars = built.visibleBars;
    chunk.visibleRelations = built.visibleRelations;
    chunk.geometryBounds = aggregateLaneGeometryBounds(built);
    chunk.barSlots.length = 0;
    chunk.barSlots.push(...built.barSlots);
    chunk.barBindings.clear();
    for (const [slot, binding] of built.barBindings) {
      chunk.barBindings.set(slot, binding);
    }
    for (const [entityId, probe] of built.paintProbes) {
      chunk.paintEntityIds.add(entityId);
      this.#paintProbesByEntityId.set(entityId, probe);
    }
    if (this.#viewportCull !== null) {
      setChunkGeometryVisible(
        chunk,
        chunkIntersectsViewport(chunk, this.#viewportCull),
        this.backgroundGeometryContainer,
        this.#viewportCull,
        this.#preciseViewportCull,
        true,
      );
    }
    return {
      bytes:
        backgroundDelta.bytes + rectDelta.bytes + barDelta.bytes + relationDelta.bytes,
      changed:
        backgroundDelta.changed ||
        backgroundGraphicsChanged ||
        rectDelta.changed ||
        rectGraphicsChanged ||
        barDelta.changed ||
        barGraphicsChanged ||
        relationDelta.changed,
      visitedSlots: end - start,
    };
  }

  #expandBarChunkBounds(
    store: RenderStoreView,
    chunk: ChunkRecord,
    changedSlots: readonly number[],
  ): void {
    for (const slot of changedSlots) {
      if (
        slot < 0 ||
        slot >= store.capacity ||
        (store.alive[slot] as number) === 0 ||
        (store.kind[slot] as number) !== RenderKind.Bar
      ) {
        continue;
      }
      writePatchMapSlotQuad(
        this.#trackQuadScratch,
        store,
        slot,
        this.#projectionContext,
      );
      chunk.geometryBounds = includePositionBounds(
        chunk.geometryBounds,
        this.#trackQuadScratch.vertices,
      );
    }
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
      record.bounds = includePositionBounds(null, record.geometry.positions);
      chunk.geometryBounds = includePositionBounds(
        chunk.geometryBounds,
        record.geometry.positions,
      );
    }
    if (this.#viewportCull !== null) {
      setChunkGeometryVisible(
        chunk,
        chunkIntersectsViewport(chunk, this.#viewportCull),
        this.backgroundGeometryContainer,
        this.#viewportCull,
        this.#preciseViewportCull,
        this.#preciseViewportCull,
      );
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
    for (const binding of chunk.barBindings.values()) {
      this.#paintProbesByEntityId.delete(binding.entityId);
      chunk.paintEntityIds.delete(binding.entityId);
    }
    const built = buildAggregateBarLaneGeometry(
      store,
      chunk.barSlots,
      this.#projectionContext,
    );
    const delta = this.#syncGroups(
      this.relationContainer,
      chunk.barMeshes,
      built.groups,
      chunkIndex,
      'bar',
    );
    const graphicsChanged = this.#syncBarGraphics(
      chunk,
      built.styledBars,
      chunkIndex,
    );
    chunk.visibleBars = built.visibleBars;
    chunk.barBindings.clear();
    for (const [slot, binding] of built.bindings) {
      chunk.barBindings.set(slot, binding);
    }
    for (const [entityId, probe] of built.paintProbes) {
      chunk.paintEntityIds.add(entityId);
      this.#paintProbesByEntityId.set(entityId, probe);
    }
    for (const group of built.groups) {
      chunk.geometryBounds = includePositionBounds(chunk.geometryBounds, group.positions);
    }
    for (const primitive of built.styledBars) {
      chunk.geometryBounds = includePositionBounds(
        chunk.geometryBounds,
        primitive.quad.vertices,
      );
    }
    if (this.#viewportCull !== null) {
      setChunkGeometryVisible(
        chunk,
        chunkIntersectsViewport(chunk, this.#viewportCull),
        this.backgroundGeometryContainer,
        this.#viewportCull,
        this.#preciseViewportCull,
        true,
      );
    }
    return {
      bytes: delta.bytes,
      changed: delta.changed || graphicsChanged,
      visitedSlots: chunk.barSlots.length,
    };
  }

  #syncBackgroundGraphics(
    chunk: ChunkRecord,
    primitives: readonly StyledBackgroundPrimitive[],
    chunkIndex: number,
  ): boolean {
    if (primitives.length === 0) {
      if (chunk.backgroundGraphics === null) return false;
      chunk.backgroundGraphics.destroy({ context: false });
      chunk.backgroundGraphicsContext?.destroy();
      chunk.backgroundGraphics = null;
      chunk.backgroundGraphicsContext = null;
      return true;
    }

    const context = new GraphicsContext();
    context.batchMode = 'auto';
    for (const primitive of primitives) appendStyledBackground(context, primitive);

    if (chunk.backgroundGraphics === null) {
      const graphics = new Graphics({ context });
      graphics.label = `${this.#baseLabel}: styled background chunk ${chunkIndex}`;
      graphics.eventMode = 'none';
      graphics.zIndex = chunkIndex;
      this.backgroundGeometryContainer.addChild(graphics);
      chunk.backgroundGraphics = graphics;
    } else {
      chunk.backgroundGraphics.context = context;
    }
    chunk.backgroundGraphicsContext?.destroy();
    chunk.backgroundGraphicsContext = context;
    return true;
  }

  #syncRectGraphics(
    chunk: ChunkRecord,
    primitives: readonly StyledBackgroundPrimitive[],
    chunkIndex: number,
  ): boolean {
    const grouped = new Map<number, StyledBackgroundPrimitive[]>();
    for (const primitive of primitives) {
      const group = grouped.get(primitive.drawOrder);
      if (group === undefined) grouped.set(primitive.drawOrder, [primitive]);
      else group.push(primitive);
    }

    let changed = false;
    for (const [drawOrder, record] of chunk.rectGraphics) {
      if (grouped.has(drawOrder)) continue;
      record.graphics.destroy({ context: false });
      record.context.destroy();
      chunk.rectGraphics.delete(drawOrder);
      changed = true;
    }

    for (const [drawOrder, group] of grouped) {
      const context = new GraphicsContext();
      context.batchMode = 'auto';
      let bounds: AggregateViewportBounds | null = null;
      for (const primitive of group) {
        appendStyledBackground(context, primitive);
        bounds = includePositionBounds(bounds, primitive.quad.vertices);
      }
      const current = chunk.rectGraphics.get(drawOrder);
      if (current === undefined) {
        const graphics = new Graphics({ context });
        graphics.label =
          `${this.#baseLabel}: styled rect chunk ${chunkIndex} order ${drawOrder}`;
        graphics.eventMode = 'none';
        graphics.zIndex = drawOrder;
        this.ordinaryGeometryContainer.addChild(graphics);
        chunk.rectGraphics.set(drawOrder, {
          graphics,
          context,
          parent: this.ordinaryGeometryContainer,
          bounds,
          primitiveCount: group.length,
        });
      } else {
        current.graphics.context = context;
        current.graphics.zIndex = drawOrder;
        current.context.destroy();
        current.context = context;
        current.bounds = bounds;
        current.primitiveCount = group.length;
      }
      changed = true;
    }
    return changed;
  }

  #syncBarGraphics(
    chunk: ChunkRecord,
    primitives: readonly StyledBackgroundPrimitive[],
    chunkIndex: number,
  ): boolean {
    const grouped = new Map<number, StyledBackgroundPrimitive[]>();
    for (const primitive of primitives) {
      const group = grouped.get(primitive.drawOrder);
      if (group === undefined) grouped.set(primitive.drawOrder, [primitive]);
      else group.push(primitive);
    }

    let changed = false;
    for (const [drawOrder, record] of chunk.barGraphics) {
      if (grouped.has(drawOrder)) continue;
      record.graphics.destroy({ context: false });
      record.context.destroy();
      chunk.barGraphics.delete(drawOrder);
      changed = true;
    }

    for (const [drawOrder, group] of grouped) {
      const context = new GraphicsContext();
      context.batchMode = 'auto';
      let bounds: AggregateViewportBounds | null = null;
      for (const primitive of group) {
        appendStyledBackground(context, primitive);
        bounds = includePositionBounds(bounds, primitive.quad.vertices);
      }
      const current = chunk.barGraphics.get(drawOrder);
      if (current === undefined) {
        const graphics = new Graphics({ context });
        graphics.label =
          `${this.#baseLabel}: styled bar chunk ${chunkIndex} order ${drawOrder}`;
        graphics.eventMode = 'none';
        graphics.zIndex = drawOrder;
        this.relationsDynamicContainer.addChild(graphics);
        chunk.barGraphics.set(drawOrder, {
          graphics,
          context,
          parent: this.relationsDynamicContainer,
          bounds,
          primitiveCount: group.length,
        });
      } else {
        current.graphics.context = context;
        current.graphics.zIndex = drawOrder;
        current.context.destroy();
        current.context = context;
        current.bounds = bounds;
        current.primitiveCount = group.length;
      }
      changed = true;
    }
    return changed;
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
        current.bounds = includePositionBounds(null, group.positions);
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
      const mesh = new Mesh({ geometry, texture: Texture.WHITE, roundPixels: false });
      mesh.label = `${this.#baseLabel}: ${lane} chunk ${chunkIndex}`;
      mesh.eventMode = 'none';
      mesh.tint = group.tint;
      mesh.alpha = group.alpha;
      mesh.zIndex = group.drawOrder;
      parent.addChild(mesh);
      records.set(group.key, {
        mesh,
        geometry,
        parent,
        bounds: includePositionBounds(null, group.positions),
        primitiveCount: group.primitiveCount,
      });
      bytes += group.byteLength;
      changed = true;
    }
    return { bytes, changed };
  }

  #destroyChunk(chunkIndex: number): void {
    const chunk = this.#chunks.get(chunkIndex);
    if (chunk === undefined) return;
    for (const entityId of chunk.paintEntityIds) this.#paintProbesByEntityId.delete(entityId);
    for (const record of chunk.backgroundMeshes.values()) destroyMeshRecord(record);
    chunk.backgroundGraphics?.destroy({ context: false });
    chunk.backgroundGraphicsContext?.destroy();
    for (const record of chunk.rectMeshes.values()) destroyMeshRecord(record);
    for (const record of chunk.rectGraphics.values()) {
      record.graphics.destroy({ context: false });
      record.context.destroy();
    }
    for (const record of chunk.barMeshes.values()) destroyMeshRecord(record);
    for (const record of chunk.barGraphics.values()) {
      record.graphics.destroy({ context: false });
      record.context.destroy();
    }
    for (const record of chunk.relationMeshes.values()) destroyMeshRecord(record);
    this.#deferredBarChunks.delete(chunkIndex);
    this.#chunks.delete(chunkIndex);
  }
}
