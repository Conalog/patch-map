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
  RenderKind,
  type RenderStoreView,
} from '../dense/renderer-types';
import {
  createPatchMapResolvedRenderQuadScratch,
  writePatchMapSlotQuad,
  type PatchMapEntityPaintProbe,
  type PatchMapProjectionRenderContext,
  type PatchMapRenderLaneProbe,
} from './types';
import {
  appendPatchMapRoundedRectPath,
  packedRgbaToMeshStyle,
} from './mesh/geometry';
import {
  buildAggregateBarLaneGeometry,
  buildAggregateChunkLaneGeometry,
  type AggregateGeometryGroup,
  type BarSlotBinding,
  type StyledBackgroundPrimitive,
} from './mesh/chunk-geometry';
import {
  barOnlyDirtyChunkSlots,
  barSlotBindingMatches,
  dirtyBarSlotsByChunk,
  dirtyChunkIndices,
  updateBoundBarSlotPositions,
} from './mesh/update-planning';
import {
  aggregateLaneGeometryBounds,
  boundsIntersectsViewport,
  chunkIntersectsViewport,
  includePositionBounds,
  type AggregateViewportBounds,
  type AggregateViewportCull,
} from './mesh/viewport-culling';

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

export {
  buildAggregateChunkGeometry,
  type AggregateChunkGeometry,
  type AggregateGeometryGroup,
} from './mesh/chunk-geometry';

export { dirtyChunkIndices } from './mesh/update-planning';

const DEFAULT_AGGREGATE_MESH_CHUNK_SIZE = 512;

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

function destroyMeshRecord(record: MeshRecord): void {
  record.mesh.destroy();
  record.geometry.destroy(true);
}

function destroyGraphicsRecord(record: GraphicsRecord): void {
  record.graphics.destroy({ context: false });
  record.context.destroy();
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
  for (const records of [chunk.rectGraphics, chunk.barGraphics]) {
    for (const record of records.values()) {
      const recordVisible =
        visible && (!precise || boundsIntersectsViewport(record.bounds, viewport));
      record.graphics.visible = recordVisible;
      if (recordVisible) {
        if (record.graphics.parent !== record.parent) record.parent.addChild(record.graphics);
      } else if (record.graphics.parent === record.parent) {
        record.parent.removeChild(record.graphics);
      }
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
    const rectGraphicsChanged = this.#syncStyledGraphics(
      chunk.rectGraphics,
      this.ordinaryGeometryContainer,
      built.styledRects,
      chunkIndex,
      'rect',
    );
    const barDelta = this.#syncGroups(
      this.relationContainer,
      chunk.barMeshes,
      built.barGroups,
      chunkIndex,
      'bar',
    );
    const barGraphicsChanged = this.#syncStyledGraphics(
      chunk.barGraphics,
      this.relationsDynamicContainer,
      built.styledBars,
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
    const graphicsChanged = this.#syncStyledGraphics(
      chunk.barGraphics,
      this.relationsDynamicContainer,
      built.styledBars,
      chunkIndex,
      'bar',
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

  #syncStyledGraphics(
    records: Map<number, GraphicsRecord>,
    parent: Container,
    primitives: readonly StyledBackgroundPrimitive[],
    chunkIndex: number,
    lane: 'rect' | 'bar',
  ): boolean {
    const grouped = new Map<number, StyledBackgroundPrimitive[]>();
    for (const primitive of primitives) {
      const group = grouped.get(primitive.drawOrder);
      if (group === undefined) grouped.set(primitive.drawOrder, [primitive]);
      else group.push(primitive);
    }

    let changed = false;
    for (const [drawOrder, record] of records) {
      if (grouped.has(drawOrder)) continue;
      destroyGraphicsRecord(record);
      records.delete(drawOrder);
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
      const current = records.get(drawOrder);
      if (current === undefined) {
        const graphics = new Graphics({ context });
        graphics.label =
          `${this.#baseLabel}: styled ${lane} chunk ${chunkIndex} order ${drawOrder}`;
        graphics.eventMode = 'none';
        graphics.zIndex = drawOrder;
        parent.addChild(graphics);
        records.set(drawOrder, {
          graphics,
          context,
          parent,
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
    for (const record of chunk.rectGraphics.values()) destroyGraphicsRecord(record);
    for (const record of chunk.barMeshes.values()) destroyMeshRecord(record);
    for (const record of chunk.barGraphics.values()) destroyGraphicsRecord(record);
    for (const record of chunk.relationMeshes.values()) destroyMeshRecord(record);
    this.#deferredBarChunks.delete(chunkIndex);
    this.#chunks.delete(chunkIndex);
  }
}
