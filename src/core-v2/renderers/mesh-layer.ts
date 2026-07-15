import { Container, Mesh, MeshGeometry, Texture } from 'pixi.js';

import type { CoreView, SlotRange } from '../../core-v1/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../core-v1/renderer/types';

export const DEFAULT_AGGREGATE_MESH_CHUNK_SIZE = 256;

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

interface ChunkRecord {
  readonly rectMeshes: Map<string, MeshRecord>;
  readonly barMeshes: Map<string, MeshRecord>;
  readonly relationMeshes: Map<string, MeshRecord>;
  visibleRects: number;
  visibleBars: number;
  visibleRelations: number;
}

interface AggregateChunkLaneGeometry {
  readonly rectGroups: readonly AggregateGeometryGroup[];
  readonly barGroups: readonly AggregateGeometryGroup[];
  readonly relationGroups: readonly AggregateGeometryGroup[];
  readonly visibleRects: number;
  readonly visibleBars: number;
  readonly visibleRelations: number;
}

interface UploadDelta {
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
  return (
    Number.isFinite(quad.x) &&
    Number.isFinite(quad.y) &&
    Number.isFinite(quad.width) &&
    Number.isFinite(quad.height) &&
    quad.width > 0 &&
    quad.height > 0 &&
    Number.isFinite(quad.rotation ?? 0) &&
    Number.isFinite(quad.pivotX ?? quad.x + quad.width / 2) &&
    Number.isFinite(quad.pivotY ?? quad.y + quad.height / 2)
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
    const left = quad.x;
    const top = quad.y;
    const right = left + quad.width;
    const bottom = top + quad.height;
    const pivotX = quad.pivotX ?? left + quad.width / 2;
    const pivotY = quad.pivotY ?? top + quad.height / 2;
    const radians = ((quad.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const corners = [left, top, right, top, right, bottom, left, bottom] as const;
    const offset = primitiveIndex * 8;

    for (let corner = 0; corner < 4; corner += 1) {
      const sourceOffset = corner * 2;
      const x = corners[sourceOffset] as number;
      const y = corners[sourceOffset + 1] as number;
      const deltaX = x - pivotX;
      const deltaY = y - pivotY;
      positions[offset + sourceOffset] = pivotX + deltaX * cos - deltaY * sin;
      positions[offset + sourceOffset + 1] = pivotY + deltaX * sin + deltaY * cos;
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

function barOnlyDirtyChunkIndices(
  store: RenderStoreView,
  chunkSize: number,
  changedRanges: readonly SlotRange[],
  previousAlive: Uint8Array,
  previousKind: Uint8Array,
): ReadonlySet<number> {
  const classifications = new Map<
    number,
    { hasLiveBar: boolean; barOnly: boolean }
  >();

  for (const range of changedRanges) {
    const start = Math.max(0, Math.min(store.capacity, Math.floor(range.start)));
    const end = Math.max(start, Math.min(store.capacity, Math.ceil(range.end)));
    for (let slot = start; slot < end; slot += 1) {
      const chunkIndex = Math.floor(slot / chunkSize);
      let classification = classifications.get(chunkIndex);
      if (classification === undefined) {
        classification = { hasLiveBar: false, barOnly: true };
        classifications.set(chunkIndex, classification);
      }
      if (
        (store.alive[slot] as number) !== 0 &&
        (store.kind[slot] as number) === RenderKind.Bar &&
        (previousAlive[slot] ?? 0) !== 0 &&
        (previousKind[slot] ?? -1) === RenderKind.Bar
      ) {
        classification.hasLiveBar = true;
      } else {
        // A dead slot can represent a removal, and a newly live Bar can reuse
        // a slot that previously held another kind. Both must take the full
        // structural path so obsolete lane meshes are pruned.
        classification.barOnly = false;
      }
    }
  }

  return new Set(
    [...classifications.entries()]
      .filter(([, value]) => value.hasLiveBar && value.barOnly)
      .map(([chunkIndex]) => chunkIndex),
  );
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

function buildAggregateChunkLaneGeometry(
  store: RenderStoreView,
  start: number,
  end: number,
  barOnly = false,
): AggregateChunkLaneGeometry {
  const rectGroups = new Map<string, MutableQuadGroup>();
  const barGroups = new Map<string, MutableQuadGroup>();
  const relationGroups = new Map<string, MutableLineGroup>();
  const resolvedStart = Math.max(0, Math.min(store.capacity, Math.floor(start)));
  const resolvedEnd = Math.max(resolvedStart, Math.min(store.capacity, Math.ceil(end)));
  let visibleRects = 0;
  let visibleBars = 0;
  let visibleRelations = 0;

  for (let slot = resolvedStart; slot < resolvedEnd; slot += 1) {
    if (!isDrawable(store, slot)) continue;
    const kind = store.kind[slot] as number;
    if (barOnly && kind !== RenderKind.Bar) continue;
    const opacity = store.opacity[slot] as number;
    const zIndex = store.zIndex[slot] as number;

    if (kind === RenderKind.Rect) {
      const width = store.width[slot] as number;
      const height = store.height[slot] as number;
      const group = width > 0 && height > 0
        ? getQuadGroup(rectGroups, store.fill[slot] as number, opacity, zIndex, RECT_PASS)
        : null;
      if (group !== null) {
        group.primitives.push({
          x: store.x[slot] as number,
          y: store.y[slot] as number,
          width,
          height,
          rotation: store.rotation[slot] as number,
        });
        visibleRects += 1;
      }
      continue;
    }

    if (kind === RenderKind.Bar) {
      const x = store.x[slot] as number;
      const y = store.y[slot] as number;
      const width = store.width[slot] as number;
      const height = store.height[slot] as number;
      if (width <= 0 || height <= 0) continue;
      const rotation = store.rotation[slot] as number;
      const pivotX = x + width / 2;
      const pivotY = y + height / 2;
      const track = getQuadGroup(
        barGroups,
        store.trackFill[slot] as number,
        opacity,
        zIndex,
        BAR_TRACK_PASS,
      );
      if (track !== null) {
        track.primitives.push({ x, y, width, height, rotation, pivotX, pivotY });
        visibleBars += 1;
      }

      const min = store.min[slot] as number;
      const max = store.max[slot] as number;
      const progress = max > min
        ? clamp01(((store.value[slot] as number) - min) / (max - min))
        : 0;
      const fillWidth = width * progress;
      const fill = fillWidth > 0
        ? getQuadGroup(barGroups, store.fill[slot] as number, opacity, zIndex, BAR_FILL_PASS)
        : null;
      if (fill !== null) {
        fill.primitives.push({ x, y, width: fillWidth, height, rotation, pivotX, pivotY });
        visibleBars += 1;
      }
      continue;
    }

    if (kind !== RenderKind.Relation) continue;
    const from = store.relationFrom[slot] as number;
    const to = store.relationTo[slot] as number;
    const width = store.lineWidth[slot] as number;
    if (!isEndpoint(store, from) || !isEndpoint(store, to) || width <= 0) continue;
    const group = getLineGroup(
      relationGroups,
      store.color[slot] as number,
      opacity,
      zIndex,
    );
    if (group === null) continue;
    const line = {
      fromX: (store.x[from] as number) + (store.width[from] as number) / 2,
      fromY: (store.y[from] as number) + (store.height[from] as number) / 2,
      toX: (store.x[to] as number) + (store.width[to] as number) / 2,
      toY: (store.y[to] as number) + (store.height[to] as number) / 2,
      width,
    };
    if (!isFiniteLine(line)) continue;
    group.primitives.push(line);
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
    visibleRects,
    visibleBars,
    visibleRelations,
  };
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
): AggregateChunkGeometry {
  const built = buildAggregateChunkLaneGeometry(store, start, end);
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
      ? new Set<number>()
      : barOnlyDirtyChunkIndices(
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
    for (const chunk of dirtyChunks) {
      const delta = barOnlyChunks.has(chunk)
        ? this.#syncBarChunk(store, chunk)
        : this.#syncChunk(store, chunk);
      if (delta.changed) uploadedChunks += 1;
      uploadedBytes += delta.bytes;
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
    const built = buildAggregateChunkLaneGeometry(store, start, end);
    let chunk = this.#chunks.get(chunkIndex);
    if (
      built.rectGroups.length === 0 &&
      built.barGroups.length === 0 &&
      built.relationGroups.length === 0
    ) {
      const changed = chunk !== undefined;
      if (changed) this.#destroyChunk(chunkIndex);
      return { bytes: 0, changed };
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
    return {
      bytes: rectDelta.bytes + barDelta.bytes + relationDelta.bytes,
      changed: rectDelta.changed || barDelta.changed || relationDelta.changed,
    };
  }

  #syncBarChunk(store: RenderStoreView, chunkIndex: number): UploadDelta {
    const start = chunkIndex * this.chunkSize;
    const end = Math.min(store.capacity, start + this.chunkSize);
    const built = buildAggregateChunkLaneGeometry(store, start, end, true);
    let chunk = this.#chunks.get(chunkIndex);
    if (chunk === undefined && built.barGroups.length === 0) {
      return { bytes: 0, changed: false };
    }
    if (chunk === undefined) {
      chunk = createChunkRecord();
      this.#chunks.set(chunkIndex, chunk);
    }

    const barDelta = this.#syncGroups(
      this.quadContainer,
      chunk.barMeshes,
      built.barGroups,
      chunkIndex,
      'bar',
    );
    chunk.visibleBars = built.visibleBars;

    if (
      chunk.rectMeshes.size === 0 &&
      chunk.barMeshes.size === 0 &&
      chunk.relationMeshes.size === 0
    ) {
      this.#chunks.delete(chunkIndex);
    }
    return barDelta;
  }

  #syncGroups(
    parent: Container,
    records: Map<string, MeshRecord>,
    groups: readonly AggregateGeometryGroup[],
    chunkIndex: number,
    lane: string,
  ): UploadDelta {
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
