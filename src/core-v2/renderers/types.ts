import type { Container } from 'pixi.js';

import type { CoreView, SlotRange } from '../../core-v1/contracts';
import type { RenderStoreView } from '../../core-v1/renderer/types';
import type { CoreV2EntityProjection, CoreV2ProjectionIndex } from '../contracts';
import type {
  CoreV2TextRenderRoute,
  CoreV2TextRenderRouteReason,
} from '../semantic/text-render-route';
import {
  freezeCoreV2Affine,
  resolveCoreV2UprightOwnerFrame,
  writeCoreV2UprightRect,
  type CoreV2AffineBasis,
  type CoreV2AffineMatrix,
  type CoreV2PointTuple,
  type CoreV2UprightOwnerFrame,
} from '../semantic/geometry';

export type CoreV2RendererStrategy = 'mesh' | 'particle';
export type CoreV2BackendPreference = 'webgl' | 'webgpu';

/** Fixed, entity-count-independent paint order exposed to tooling and probes. */
export type CoreV2RenderLaneRole =
  | 'background-geometry'
  | 'background-assets'
  | 'ordinary-geometry'
  | 'relations-dynamic'
  | 'content-assets'
  | 'text'
  | 'interaction-overlay';

export interface CoreV2RenderLaneProbe {
  readonly role: CoreV2RenderLaneRole;
  readonly label: string;
  readonly renderObjectCount: number;
  readonly visiblePrimitiveCount: number;
}

export type CoreV2RenderLaneSnapshot = Readonly<
  Record<CoreV2RenderLaneRole, CoreV2RenderLaneProbe>
>;

export type CoreV2EntityRendererKind =
  | 'mesh'
  | 'graphics'
  | 'sprite'
  | 'text'
  | 'none';

/** Detached O(1) paint observation. Null paint values mean no paint is applied. */
export interface CoreV2EntityPaintProbe {
  readonly entityId: string;
  readonly lane: CoreV2RenderLaneRole;
  readonly rendererKind: CoreV2EntityRendererKind;
  readonly primitiveCount: number;
  readonly renderObjectCount: number;
  readonly packedTint: number | null;
  readonly rgbTint: number | null;
  readonly alpha: number | null;
}

/** Detached facts for the two aggregate interaction objects at the scene tail. */
export interface CoreV2OverlayPaintProbe {
  readonly order: readonly ['selection', 'transformer'];
  readonly selection: boolean;
  readonly transformer: boolean;
  readonly selectedEntityCount: number;
  readonly renderObjectCount: 0 | 2;
}

export interface CoreV2InteractionOverlayPolicy {
  /** Null keeps every selected dense entity visible in the aggregate outline. */
  readonly visibleEntityIds: readonly string[] | null;
  /** Null keeps the transformer eligible wherever the selection outline is visible. */
  readonly transformableEntityIds: readonly string[] | null;
  /** Null preserves the legacy all-selected handle policy. */
  readonly resizableEntityIds: readonly string[] | null;
  readonly hidden: boolean;
  readonly handleCssPx: number;
  readonly strokeCssPx: number;
}

export type CoreV2TextRendererKind = CoreV2TextRenderRoute | 'none';
export type CoreV2TextRendererRouteReason = CoreV2TextRenderRouteReason | 'not-attached';
export type CoreV2TextPublicationStatus = 'pending' | 'current';

/** Semantic identities attached to one logical Pixi text leaf. */
export interface CoreV2TextSemanticSignatures {
  readonly content: string;
  readonly style: string;
  readonly layout: string;
}

/**
 * Semantic identities plus the exact route/content/style/paint signature
 * installed on a Pixi text leaf. The renderer signature deliberately excludes
 * native glyph metrics: Pixi is only the raster sink for semantic layout.
 */
export interface CoreV2TextAttachedSignatures extends CoreV2TextSemanticSignatures {
  readonly renderer: string;
}

/**
 * Detached constant-time text publication observation. `current` means the
 * semantic, attached, and last-rendered signatures correlate at a confirmed
 * render frame and the expected logical object count is attached.
 */
export interface CoreV2TextRendererProbe {
  readonly entityId: string;
  readonly route: CoreV2TextRendererKind;
  readonly rendererKind: CoreV2TextRendererKind;
  readonly routeReason: CoreV2TextRendererRouteReason;
  readonly objectCount: 0 | 1;
  readonly semanticSignatures: CoreV2TextSemanticSignatures;
  readonly attachedSignatures: CoreV2TextAttachedSignatures | null;
  readonly lastRenderedSignatures: CoreV2TextAttachedSignatures | null;
  readonly publicationStatus: CoreV2TextPublicationStatus;
  readonly lastRenderedFrame: number | null;
  /** Count of graphemes from a mismatched prior rendered signature, if any. */
  readonly staleGlyphCount: number;
}

export interface CoreV2WorldOrientation {
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export interface CoreV2ProjectionRenderContext {
  readonly index: CoreV2ProjectionIndex;
  readonly revision: number;
  readonly world: CoreV2WorldOrientation;
  /**
   * Dense entities whose geometry changed without a matching parser
   * projection replacement. Render and hit testing use the dense authority
   * until JSON reconciliation publishes a current projection again.
   */
  readonly staleEntityIds?: ReadonlySet<string>;
  /** Renderer-owned cache; cleared whenever projection/world identity changes. */
  readonly uprightFrameCache?: CoreV2UprightFrameCache;
}

export interface CoreV2UprightFrameCache {
  revision: number;
  index: CoreV2ProjectionIndex | null;
  rotationDegrees: number;
  flipX: boolean;
  flipY: boolean;
  readonly frames: Map<string, CoreV2UprightOwnerFrame | null>;
}

export function createCoreV2UprightFrameCache(): CoreV2UprightFrameCache {
  return {
    revision: -1,
    index: null,
    rotationDegrees: Number.NaN,
    flipX: false,
    flipY: false,
    frames: new Map(),
  };
}

export type CoreV2QuadVertices = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface CoreV2ResolvedRenderQuad {
  readonly entityId: string;
  readonly projection: CoreV2EntityProjection | null;
  /** Scene-space center after any owner-level upright content-frame mapping. */
  readonly center: CoreV2PointTuple;
  /** Scene-space basis consumed by Pixi objects before the world container. */
  readonly basis: CoreV2AffineBasis;
  /** Final normalized basis after the Pixi world rotation/reflection. */
  readonly screenBasis: CoreV2AffineBasis;
  readonly width: number;
  readonly height: number;
  readonly vertices: CoreV2QuadVertices;
}

/** Reusable numeric target for allocation-free aggregate hot paths. */
export interface CoreV2ResolvedRenderQuadScratch {
  entityId: string;
  projection: CoreV2EntityProjection | null;
  center: [number, number];
  basis: [number, number, number, number];
  screenBasis: [number, number, number, number];
  width: number;
  height: number;
  vertices: [number, number, number, number, number, number, number, number];
}

export interface AggregateLayerSyncOptions {
  readonly changedRanges?: readonly SlotRange[];
  readonly fullRebuildEpoch?: number;
  readonly projectionContext?: CoreV2ProjectionRenderContext;
  /** Recompute projection transforms only; semantic/style/topology is unchanged. */
  readonly projectionTransformOnly?: boolean;
}

export interface AggregateLayerDebug {
  readonly strategy: CoreV2RendererStrategy;
  readonly renderObjects: number;
  readonly visiblePrimitives: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
}

export interface AggregateLayerSyncResult {
  readonly renderObjects: number;
  readonly visiblePrimitives: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
}

export interface AggregateLayer {
  readonly container: Container;
  sync(store: RenderStoreView, options?: AggregateLayerSyncOptions): AggregateLayerSyncResult;
  destroy(): void;
}

export interface RootPointerInput {
  readonly type: 'down' | 'move' | 'up' | 'up-outside' | 'cancel' | 'leave';
  readonly screenX: number;
  readonly screenY: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly button: number;
  readonly buttons: number;
  readonly timeMs: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export interface RootInteractionHandlers {
  readonly pointer: (input: RootPointerInput) => void;
  readonly wheel: (screenX: number, screenY: number, deltaY: number) => void;
  readonly contextMenu: (screenX: number, screenY: number) => boolean;
}

export type CoreV2ActiveRendererBackend =
  | 'webgl1'
  | 'webgl2'
  | 'webgpu'
  | 'unknown';

export type CoreV2RendererLossState =
  | 'healthy'
  | 'lost'
  | 'restored-pending-frame'
  | 'destroyed';

/** Detached PixiJS public-surface facts; no live renderer object crosses this boundary. */
export interface PixiCoreV2PublicSurfaceProbe {
  readonly rendererLibrary: 'pixi.js-v8';
  readonly rendererVersion: string;
  readonly backend: CoreV2ActiveRendererBackend;
  readonly applicationInitialized: boolean;
  readonly manualRender: true;
  readonly canvas: Readonly<{
    readonly authoritative: boolean;
    readonly attached: boolean;
    readonly patchMapCore: 'v2' | null;
  }>;
  readonly stage: Readonly<{
    readonly label: string;
    readonly authoritative: boolean;
    readonly discoverableByDevTools: boolean;
    readonly worldAttached: boolean;
    readonly childCount: number;
  }>;
  readonly aggregateLayers: readonly Readonly<{
    readonly role: CoreV2RenderLaneRole;
    readonly label: string;
    readonly renderObjectCount: number;
    readonly visiblePrimitiveCount: number;
  }>[];
}

/** Public context/device-loss accounting owned by one renderer instance. */
export interface PixiCoreV2RendererLossProbe {
  readonly backend: CoreV2ActiveRendererBackend;
  readonly webGLVersion: 1 | 2 | null;
  readonly state: CoreV2RendererLossState;
  readonly contextLost: boolean;
  readonly lossEventCount: number;
  readonly restorationEventCount: number;
  readonly recoveredFrameCount: number;
  readonly listenerCount: 0 | 2;
  readonly lastLossFrame: number | null;
  readonly lastRecoveryFrame: number | null;
  readonly destroyed: boolean;
}

export interface PixiCoreV2RendererDebug {
  readonly strategy: CoreV2RendererStrategy;
  readonly backend: string;
  readonly frame: number;
  readonly storeEpoch: number;
  readonly entityCount: number;
  readonly aggregateRenderObjects: number;
  readonly visiblePrimitives: number;
  readonly uploadedChunks: number;
  readonly uploadedBytes: number;
  readonly dynamicFullUploadCount: number;
  readonly staticInvalidatedUploadCount: number;
  readonly particleFullUploadCount: number;
  readonly uploadObservation: 'dirty-chunk-bytes' | 'particle-full-upload-count';
  readonly bitmapTextCount: number;
  readonly fallbackTextCount: number;
  readonly imageCount: number;
  readonly loadedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly view: CoreView;
  readonly lastInvalidation: string;
  readonly destroyed: boolean;
}

export function createCoreV2WorldAffine(world: CoreV2WorldOrientation): CoreV2AffineMatrix {
  const radians = world.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const flipX = world.flipX ? -1 : 1;
  const flipY = world.flipY ? -1 : 1;
  // PATCH MAP flips are screen-axis operations: F * R, not Pixi's default R * S.
  return freezeCoreV2Affine(
    cosine * flipX,
    sine * flipY,
    -sine * flipX,
    cosine * flipY,
    0,
    0,
  );
}

/**
 * Resolve a dense slot through the parser's exact affine sidecar. Mesh,
 * Particle, Sprite/Text, relations, and selection all call this function.
 */
export function resolveCoreV2SlotQuad(
  store: RenderStoreView,
  slot: number,
  context?: CoreV2ProjectionRenderContext,
  widthFraction = 1,
): CoreV2ResolvedRenderQuad {
  const scratch = writeCoreV2SlotQuad(
    createCoreV2ResolvedRenderQuadScratch(),
    store,
    slot,
    context,
    widthFraction,
  );
  return Object.freeze({
    entityId: scratch.entityId,
    projection: scratch.projection,
    center: Object.freeze([...scratch.center] as [number, number]),
    basis: Object.freeze([...scratch.basis] as [number, number, number, number]),
    screenBasis: Object.freeze([...scratch.screenBasis] as [number, number, number, number]),
    width: scratch.width,
    height: scratch.height,
    vertices: Object.freeze([...scratch.vertices] as [
      number, number, number, number, number, number, number, number,
    ]),
  });
}

export function createCoreV2ResolvedRenderQuadScratch(): CoreV2ResolvedRenderQuadScratch {
  return {
    entityId: '',
    projection: null,
    center: [0, 0],
    basis: [1, 0, 0, 1],
    screenBasis: [1, 0, 0, 1],
    width: 0,
    height: 0,
    vertices: [0, 0, 0, 0, 0, 0, 0, 0],
  };
}

/** Write one exact quad without allocating matrices, points, corners, or result objects. */
export function writeCoreV2SlotQuad(
  output: CoreV2ResolvedRenderQuadScratch,
  store: RenderStoreView,
  slot: number,
  context?: CoreV2ProjectionRenderContext,
  widthFraction = 1,
): CoreV2ResolvedRenderQuadScratch {
  const fraction = Number.isFinite(widthFraction)
    ? Math.max(0, Math.min(1, widthFraction))
    : 0;
  const entityId = store.ids[slot] ?? `@slot:${slot}`;
  const projection = context?.staleEntityIds?.has(entityId) === true
    ? null
    : context?.index.byEntityId[entityId] ?? null;
  const radians = (context?.world.rotationDegrees ?? 0) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const flipX = context?.world.flipX === true ? -1 : 1;
  const flipY = context?.world.flipY === true ? -1 : 1;
  const worldA = cosine * flipX;
  const worldB = sine * flipY;
  const worldC = -sine * flipX;
  const worldD = cosine * flipY;

  output.entityId = entityId;
  output.projection = projection;
  if (projection) {
    writeProjectedQuad(
      output,
      projection,
      fraction,
      worldA,
      worldB,
      worldC,
      worldD,
      context,
    );
    return output;
  }

  const x = store.x[slot] ?? 0;
  const y = store.y[slot] ?? 0;
  const fullWidth = Math.max(0, store.width[slot] ?? 0);
  const width = fullWidth * fraction;
  const height = Math.max(0, store.height[slot] ?? 0);
  const rotation = store.rotation[slot] ?? 0;
  const localRadians = rotation * Math.PI / 180;
  const localCosine = Math.cos(localRadians);
  const localSine = Math.sin(localRadians);
  const fullCenterX = x + fullWidth / 2;
  const fullCenterY = y + height / 2;
  const centerOffset = (width - fullWidth) / 2;
  const centerX = fullCenterX + centerOffset * localCosine;
  const centerY = fullCenterY + centerOffset * localSine;
  writeQuadValues(
    output,
    centerX,
    centerY,
    localCosine,
    localSine,
    -localSine,
    localCosine,
    width,
    height,
    worldA,
    worldB,
    worldC,
    worldD,
  );
  return output;
}

function writeProjectedQuad(
  output: CoreV2ResolvedRenderQuadScratch,
  projection: CoreV2EntityProjection,
  fraction: number,
  worldA: number,
  worldB: number,
  worldC: number,
  worldD: number,
  context?: CoreV2ProjectionRenderContext,
): void {
  const [localX, localY, localWidth, localHeight] = projection.localBounds;
  const [a, b, c, d, tx, ty] = projection.affine;
  const xScale = Math.hypot(a, b);
  const yScale = Math.hypot(c, d);
  const width = localWidth * fraction * xScale;
  const height = localHeight * yScale;
  if (projection.contentOrientation === 'upright') {
    const ownerId = projection.ownerItemId;
    let ownerFrame: CoreV2UprightOwnerFrame | null = null;
    if (
      ownerId !== undefined &&
      context !== undefined &&
      context.staleEntityIds?.has(ownerId) !== true
    ) {
      const owner = context.index.byEntityId[ownerId];
      if (owner !== undefined) ownerFrame = uprightOwnerFrame(context, ownerId, owner);
    }
    if (ownerFrame !== null) {
      writeCoreV2UprightRect(output, projection, ownerFrame, fraction);
      writeQuadValues(
        output,
        output.center[0],
        output.center[1],
        output.basis[0],
        output.basis[1],
        output.basis[2],
        output.basis[3],
        output.width,
        output.height,
        worldA,
        worldB,
        worldC,
        worldD,
      );
      return;
    }
    const determinant = worldA * worldD - worldB * worldC;
    const basisA = worldD / determinant;
    const basisB = -worldB / determinant;
    const basisC = -worldC / determinant;
    const basisD = worldA / determinant;
    const centerOffset = (localWidth * fraction - localWidth) * xScale / 2;
    writeQuadValues(
      output,
      projection.visibleCenter[0] + basisA * centerOffset,
      projection.visibleCenter[1] + basisB * centerOffset,
      basisA,
      basisB,
      basisC,
      basisD,
      width,
      height,
      worldA,
      worldB,
      worldC,
      worldD,
    );
    return;
  }

  const partialWidth = localWidth * fraction;
  const topLeftX = a * localX + c * localY + tx;
  const topLeftY = b * localX + d * localY + ty;
  const topRightX = topLeftX + a * partialWidth;
  const topRightY = topLeftY + b * partialWidth;
  const bottomLeftX = topLeftX + c * localHeight;
  const bottomLeftY = topLeftY + d * localHeight;
  const bottomRightX = topRightX + c * localHeight;
  const bottomRightY = topRightY + d * localHeight;
  output.center[0] = (topLeftX + bottomRightX) / 2;
  output.center[1] = (topLeftY + bottomRightY) / 2;
  output.basis[0] = normalizeSignedZero(xScale === 0 ? 0 : a / xScale);
  output.basis[1] = normalizeSignedZero(xScale === 0 ? 0 : b / xScale);
  output.basis[2] = normalizeSignedZero(yScale === 0 ? 0 : c / yScale);
  output.basis[3] = normalizeSignedZero(yScale === 0 ? 0 : d / yScale);
  writeNormalizedScreenBasis(
    output.screenBasis,
    worldA * a + worldC * b,
    worldB * a + worldD * b,
    worldA * c + worldC * d,
    worldB * c + worldD * d,
  );
  output.width = width;
  output.height = height;
  const vertices = output.vertices;
  vertices[0] = topLeftX;
  vertices[1] = topLeftY;
  vertices[2] = topRightX;
  vertices[3] = topRightY;
  vertices[4] = bottomRightX;
  vertices[5] = bottomRightY;
  vertices[6] = bottomLeftX;
  vertices[7] = bottomLeftY;
}

function uprightOwnerFrame(
  context: CoreV2ProjectionRenderContext,
  ownerId: string,
  owner: CoreV2EntityProjection,
): CoreV2UprightOwnerFrame | null {
  const cache = context.uprightFrameCache;
  if (cache === undefined) {
    return resolveCoreV2UprightOwnerFrame(
      owner,
      createCoreV2WorldAffine(context.world),
      context.world.flipX,
      context.world.flipY,
    );
  }
  if (
    cache.revision !== context.revision ||
    cache.index !== context.index ||
    cache.rotationDegrees !== context.world.rotationDegrees ||
    cache.flipX !== context.world.flipX ||
    cache.flipY !== context.world.flipY
  ) {
    cache.frames.clear();
    cache.revision = context.revision;
    cache.index = context.index;
    cache.rotationDegrees = context.world.rotationDegrees;
    cache.flipX = context.world.flipX;
    cache.flipY = context.world.flipY;
  }
  if (cache.frames.has(ownerId)) return cache.frames.get(ownerId) ?? null;
  const frame = resolveCoreV2UprightOwnerFrame(
    owner,
    createCoreV2WorldAffine(context.world),
    context.world.flipX,
    context.world.flipY,
  );
  cache.frames.set(ownerId, frame);
  return frame;
}

function writeQuadValues(
  output: CoreV2ResolvedRenderQuadScratch,
  centerX: number,
  centerY: number,
  basisA: number,
  basisB: number,
  basisC: number,
  basisD: number,
  width: number,
  height: number,
  worldA: number,
  worldB: number,
  worldC: number,
  worldD: number,
): void {
  output.center[0] = centerX;
  output.center[1] = centerY;
  output.basis[0] = normalizeSignedZero(basisA);
  output.basis[1] = normalizeSignedZero(basisB);
  output.basis[2] = normalizeSignedZero(basisC);
  output.basis[3] = normalizeSignedZero(basisD);
  writeNormalizedScreenBasis(
    output.screenBasis,
    worldA * basisA + worldC * basisB,
    worldB * basisA + worldD * basisB,
    worldA * basisC + worldC * basisD,
    worldB * basisC + worldD * basisD,
  );
  output.width = width;
  output.height = height;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const xWidth = basisA * halfWidth;
  const yWidth = basisB * halfWidth;
  const xHeight = basisC * halfHeight;
  const yHeight = basisD * halfHeight;
  const vertices = output.vertices;
  vertices[0] = centerX - xWidth - xHeight;
  vertices[1] = centerY - yWidth - yHeight;
  vertices[2] = centerX + xWidth - xHeight;
  vertices[3] = centerY + yWidth - yHeight;
  vertices[4] = centerX + xWidth + xHeight;
  vertices[5] = centerY + yWidth + yHeight;
  vertices[6] = centerX - xWidth + xHeight;
  vertices[7] = centerY - yWidth + yHeight;
}

function writeNormalizedScreenBasis(
  output: [number, number, number, number],
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  const xLength = Math.hypot(a, b);
  const yLength = Math.hypot(c, d);
  output[0] = normalizeSignedZero(xLength === 0 ? 0 : a / xLength);
  output[1] = normalizeSignedZero(xLength === 0 ? 0 : b / xLength);
  output[2] = normalizeSignedZero(yLength === 0 ? 0 : c / yLength);
  output[3] = normalizeSignedZero(yLength === 0 ? 0 : d / yLength);
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
