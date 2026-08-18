import type { CoreView } from '../dense/contracts';
import type { RenderStoreView } from '../dense/renderer-types';
import type { PatchMapEntityProjection, PatchMapProjectionIndex } from '../contracts';
import type {
  PatchMapTextRenderRoute,
  PatchMapTextRenderRouteReason,
} from '../semantic/text-render-route';
import {
  freezePatchMapAffine,
  writePatchMapReadableRect,
  type PatchMapAffineBasis,
  type PatchMapAffineMatrix,
  type PatchMapPointTuple,
} from '../semantic/geometry';

export type PatchMapRendererStrategy = 'mesh' | 'particle';
export type PatchMapBackendPreference = 'webgl' | 'webgpu';

/** Fixed, entity-count-independent paint order exposed to tooling and probes. */
export type PatchMapRenderLaneRole =
  | 'background-geometry'
  | 'background-assets'
  | 'ordinary-geometry'
  | 'relations-dynamic'
  | 'content-assets'
  | 'text'
  | 'interaction-overlay';

export interface PatchMapRenderLaneProbe {
  readonly role: PatchMapRenderLaneRole;
  readonly label: string;
  readonly renderObjectCount: number;
  readonly visiblePrimitiveCount: number;
}

export type PatchMapRenderLaneSnapshot = Readonly<
  Record<PatchMapRenderLaneRole, PatchMapRenderLaneProbe>
>;

export type PatchMapEntityRendererKind =
  | 'mesh'
  | 'graphics'
  | 'sprite'
  | 'text'
  | 'none';

/** Detached O(1) paint observation. Null paint values mean no paint is applied. */
export interface PatchMapEntityPaintProbe {
  readonly entityId: string;
  readonly lane: PatchMapRenderLaneRole;
  readonly rendererKind: PatchMapEntityRendererKind;
  readonly primitiveCount: number;
  readonly renderObjectCount: number;
  readonly packedTint: number | null;
  readonly rgbTint: number | null;
  readonly alpha: number | null;
}

/** Detached facts for the two aggregate interaction objects at the scene tail. */
export interface PatchMapOverlayPaintProbe {
  readonly order: readonly ['selection', 'transformer'];
  readonly selection: boolean;
  readonly transformer: boolean;
  readonly selectedEntityCount: number;
  readonly renderObjectCount: 0 | 2;
  /** Present on the product renderer; optional only for injected contract surfaces. */
  readonly displayMode?: 'all' | 'group-only' | 'element-only' | 'hidden';
  readonly strokeAlignment?: 'outside' | 'center' | 'inside';
  readonly strokeScale?: 'fixed' | 'viewport';
  readonly individualOutlineCount?: number;
  readonly groupOutline?: boolean;
  readonly outlineCount?: number;
  /** Renderer repaint count; optional only for injected contract surfaces. */
  readonly redrawCount?: number;
  /** Aggregate world scale used by the last interaction-overlay repaint. */
  readonly worldScale?: number | null;
  /** World-space width that projects to the configured persistent CSS width. */
  readonly selectionLocalStrokeWidth?: number;
  /** Effective persistent screen width at the last repaint. */
  readonly selectionScreenStrokeWidth?: number;
  /** World-space width that projects to the configured marquee CSS width. */
  readonly marqueeLocalStrokeWidth?: number;
}

export interface PatchMapInteractionOverlayPolicy {
  /** Null keeps every selected dense entity visible in the aggregate outline. */
  readonly visibleEntityIds: readonly string[] | null;
  /** Null keeps the transformer eligible wherever the selection outline is visible. */
  readonly transformableEntityIds: readonly string[] | null;
  /** Null preserves the legacy all-selected handle policy. */
  readonly resizableEntityIds: readonly string[] | null;
  readonly hidden: boolean;
  readonly handleCssPx: number;
  readonly strokeCssPx: number;
  /** Fixed CSS width or viewport-linked low-zoom LOD. */
  readonly strokeScale: 'fixed' | 'viewport';
  /** CSS-pixel floor used only by viewport-linked persistent strokes. */
  readonly minStrokeCssPx: number;
  /** Persistent selection placement; converted to Pixi alignment only at paint. */
  readonly strokeAlignment: 'outside' | 'center' | 'inside';
  /** Normalized 0xRRGGBB used by persistent selection and transformer paint. */
  readonly color: number;
  /** Individual/group bounds composition; never a semantic target filter. */
  readonly displayMode: 'all' | 'group-only' | 'element-only' | 'hidden';
  /** Transient marquee paint, kept separate from persistent selection bounds. */
  readonly marqueeColor: number;
  readonly marqueeStrokeCssPx: number;
  readonly marqueeFillAlpha: number;
}

/** Concrete Pixi text object kind attached to the aggregate text lane. */
export type PatchMapTextObjectKind = PatchMapTextRenderRoute | 'none';
export type PatchMapTextRouteDecisionReason = PatchMapTextRenderRouteReason | 'not-attached';
export type PatchMapTextPublicationStatus = 'pending' | 'current';

/** Semantic identities attached to one logical Pixi text leaf. */
export interface PatchMapTextSemanticSignatures {
  readonly content: string;
  readonly style: string;
  readonly layout: string;
}

/**
 * Semantic identities plus the exact route/content/style/paint signature
 * installed on a Pixi text leaf. The renderer signature deliberately excludes
 * native glyph metrics: Pixi is only the raster sink for semantic layout.
 */
export interface PatchMapTextAttachedSignatures extends PatchMapTextSemanticSignatures {
  readonly renderer: string;
}

/**
 * Detached constant-time text publication observation. `current` means the
 * semantic, attached, and last-rendered signatures correlate at a confirmed
 * render frame and the expected logical object count is attached.
 */
export interface PatchMapTextRendererProbe {
  readonly entityId: string;
  readonly attachedRoute: PatchMapTextObjectKind;
  readonly objectKind: PatchMapTextObjectKind;
  readonly routeDecisionReason: PatchMapTextRouteDecisionReason;
  readonly objectCount: 0 | 1;
  readonly semanticSignatures: PatchMapTextSemanticSignatures;
  readonly attachedSignatures: PatchMapTextAttachedSignatures | null;
  readonly lastRenderedSignatures: PatchMapTextAttachedSignatures | null;
  readonly publicationStatus: PatchMapTextPublicationStatus;
  readonly lastRenderedFrame: number | null;
  /** Count of graphemes from a mismatched prior rendered signature, if any. */
  readonly staleGlyphCount: number;
}

export interface PatchMapWorldOrientation {
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export interface PatchMapProjectionRenderContext {
  readonly index: PatchMapProjectionIndex;
  readonly revision: number;
  readonly world: PatchMapWorldOrientation;
  /**
   * Dense entities whose geometry changed without a matching parser
   * projection replacement. Render and hit testing use the dense authority
   * until JSON reconciliation publishes a current projection again.
   */
  readonly staleEntityIds?: ReadonlySet<string>;
  /** Renderer-owned world/readable basis cache, invalidated by identity or world changes. */
  readonly quadCache?: PatchMapProjectionQuadCache;
}

export interface PatchMapReadableQuadFrame {
  readonly centerX: number;
  readonly centerY: number;
  readonly basisA: number;
  readonly basisB: number;
  readonly basisC: number;
  readonly basisD: number;
  readonly screenA: number;
  readonly screenB: number;
  readonly screenC: number;
  readonly screenD: number;
  readonly fullWidth: number;
  readonly height: number;
}

export interface PatchMapProjectionQuadCache {
  revision: number;
  index: PatchMapProjectionIndex | null;
  rotationDegrees: number;
  flipX: boolean;
  flipY: boolean;
  worldA: number;
  worldB: number;
  worldC: number;
  worldD: number;
  readonly readableFrames: Map<string, PatchMapReadableQuadFrame>;
}

export function createPatchMapProjectionQuadCache(): PatchMapProjectionQuadCache {
  return {
    revision: -1,
    index: null,
    rotationDegrees: Number.NaN,
    flipX: false,
    flipY: false,
    worldA: 1,
    worldB: 0,
    worldC: 0,
    worldD: 1,
    readableFrames: new Map(),
  };
}

export type PatchMapQuadVertices = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface PatchMapResolvedRenderQuad {
  readonly entityId: string;
  readonly projection: PatchMapEntityProjection | null;
  /** Scene-space center after any readable-orientation partial-width offset. */
  readonly center: PatchMapPointTuple;
  /** Scene-space basis consumed by Pixi objects before the world container. */
  readonly basis: PatchMapAffineBasis;
  /** Final normalized basis after the Pixi world rotation/reflection. */
  readonly screenBasis: PatchMapAffineBasis;
  readonly width: number;
  readonly height: number;
  readonly vertices: PatchMapQuadVertices;
}

/** Reusable numeric target for allocation-free aggregate hot paths. */
export interface PatchMapResolvedRenderQuadScratch {
  entityId: string;
  projection: PatchMapEntityProjection | null;
  center: [number, number];
  basis: [number, number, number, number];
  screenBasis: [number, number, number, number];
  width: number;
  height: number;
  vertices: [number, number, number, number, number, number, number, number];
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

export interface RootWheelInput {
  readonly screenX: number;
  readonly screenY: number;
  readonly deltaY: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export interface RootInteractionHandlers {
  readonly pointer: (input: RootPointerInput) => void;
  /** True only when the package committed zoom and owns native consumption. */
  readonly wheel: (input: RootWheelInput) => boolean;
  readonly contextMenu: (screenX: number, screenY: number) => boolean;
}

export type PatchMapActiveRendererBackend =
  | 'webgl1'
  | 'webgl2'
  | 'webgpu'
  | 'unknown';

export type PatchMapRendererLossState =
  | 'healthy'
  | 'lost'
  | 'restored-pending-frame'
  | 'destroyed';

/** Detached PixiJS public-surface facts; no live renderer object crosses this boundary. */
export interface PatchMapPixiPublicSurfaceProbe {
  readonly rendererLibrary: 'pixi.js-v8';
  readonly rendererVersion: string;
  readonly backend: PatchMapActiveRendererBackend;
  readonly applicationInitialized: boolean;
  readonly manualRender: true;
  readonly canvas: Readonly<{
    readonly authoritative: boolean;
    readonly attached: boolean;
    readonly patchMapProduct: 'patch-map' | null;
  }>;
  readonly stage: Readonly<{
    readonly label: string;
    readonly authoritative: boolean;
    readonly discoverableByDevTools: boolean;
    readonly worldAttached: boolean;
    readonly childCount: number;
  }>;
  readonly aggregateLayers: readonly Readonly<{
    readonly role: PatchMapRenderLaneRole;
    readonly label: string;
    readonly renderObjectCount: number;
    readonly visiblePrimitiveCount: number;
  }>[];
}

/** Public context/device-loss accounting owned by one renderer instance. */
export interface PatchMapPixiRendererLossProbe {
  readonly backend: PatchMapActiveRendererBackend;
  readonly webGLVersion: 1 | 2 | null;
  readonly state: PatchMapRendererLossState;
  readonly contextLost: boolean;
  readonly lossEventCount: number;
  readonly restorationEventCount: number;
  readonly recoveredFrameCount: number;
  readonly listenerCount: 0 | 2;
  readonly lastLossFrame: number | null;
  readonly lastRecoveryFrame: number | null;
  readonly destroyed: boolean;
}

export interface PatchMapPixiRendererDebug {
  readonly strategy: PatchMapRendererStrategy;
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
  /** Pixi Text objects; together with bitmapTextCount this is the text object total. */
  readonly pixiTextCount: number;
  readonly imageCount: number;
  readonly loadedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly view: CoreView;
  readonly lastInvalidation: string;
  readonly destroyed: boolean;
}

export function createPatchMapWorldAffine(world: PatchMapWorldOrientation): PatchMapAffineMatrix {
  const radians = world.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const flipX = world.flipX ? -1 : 1;
  const flipY = world.flipY ? -1 : 1;
  // PATCH MAP flips are screen-axis operations: F * R, not Pixi's default R * S.
  return freezePatchMapAffine(
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
export function resolvePatchMapSlotQuad(
  store: RenderStoreView,
  slot: number,
  context?: PatchMapProjectionRenderContext,
  widthFraction = 1,
): PatchMapResolvedRenderQuad {
  const scratch = writePatchMapSlotQuad(
    createPatchMapResolvedRenderQuadScratch(),
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

export function createPatchMapResolvedRenderQuadScratch(): PatchMapResolvedRenderQuadScratch {
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
export function writePatchMapSlotQuad(
  output: PatchMapResolvedRenderQuadScratch,
  store: RenderStoreView,
  slot: number,
  context?: PatchMapProjectionRenderContext,
  widthFraction = 1,
): PatchMapResolvedRenderQuadScratch {
  const fraction = Number.isFinite(widthFraction)
    ? Math.max(0, Math.min(1, widthFraction))
    : 0;
  const entityId = store.ids[slot] ?? `@slot:${slot}`;
  const projection = context?.staleEntityIds?.has(entityId) === true
    ? null
    : context?.index.byEntityId[entityId] ?? null;
  const cachedWorld = context?.quadCache === undefined
    ? null
    : synchronizeProjectionQuadCache(context, context.quadCache);
  const radians = cachedWorld === null
    ? (context?.world.rotationDegrees ?? 0) * Math.PI / 180
    : 0;
  const cosine = cachedWorld === null ? Math.cos(radians) : 0;
  const sine = cachedWorld === null ? Math.sin(radians) : 0;
  const flipX = context?.world.flipX === true ? -1 : 1;
  const flipY = context?.world.flipY === true ? -1 : 1;
  const worldA = cachedWorld?.worldA ?? cosine * flipX;
  const worldB = cachedWorld?.worldB ?? sine * flipY;
  const worldC = cachedWorld?.worldC ?? -sine * flipX;
  const worldD = cachedWorld?.worldD ?? cosine * flipY;

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
  output: PatchMapResolvedRenderQuadScratch,
  projection: PatchMapEntityProjection,
  fraction: number,
  worldA: number,
  worldB: number,
  worldC: number,
  worldD: number,
  context?: PatchMapProjectionRenderContext,
): void {
  const [localX, localY, localWidth, localHeight] = projection.localBounds;
  const [a, b, c, d, tx, ty] = projection.affine;
  if (projection.contentOrientation === 'upright') {
    const placementAnchor = readableBarPlacementAnchor(projection, context?.index);
    const cache = context?.quadCache;
    if (cache !== undefined) {
      const frame = readableQuadFrame(
        output,
        projection,
        cache,
        worldA,
        worldB,
        worldC,
        worldD,
        placementAnchor,
      );
      writeCachedReadableQuad(output, frame, fraction);
      return;
    }
    writePatchMapReadableRect(
      output,
      projection,
      worldA,
      worldB,
      worldC,
      worldD,
      fraction,
      placementAnchor,
    );
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

  const xScale = Math.hypot(a, b);
  const yScale = Math.hypot(c, d);
  const width = localWidth * fraction * xScale;
  const height = localHeight * yScale;
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

function synchronizeProjectionQuadCache(
  context: PatchMapProjectionRenderContext,
  cache: PatchMapProjectionQuadCache,
): PatchMapProjectionQuadCache {
  if (
    cache.revision === context.revision
    && cache.index === context.index
    && cache.rotationDegrees === context.world.rotationDegrees
    && cache.flipX === context.world.flipX
    && cache.flipY === context.world.flipY
  ) {
    return cache;
  }
  const radians = context.world.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const flipX = context.world.flipX ? -1 : 1;
  const flipY = context.world.flipY ? -1 : 1;
  cache.revision = context.revision;
  cache.index = context.index;
  cache.rotationDegrees = context.world.rotationDegrees;
  cache.flipX = context.world.flipX;
  cache.flipY = context.world.flipY;
  cache.worldA = cosine * flipX;
  cache.worldB = sine * flipY;
  cache.worldC = -sine * flipX;
  cache.worldD = cosine * flipY;
  cache.readableFrames.clear();
  return cache;
}

function readableQuadFrame(
  output: PatchMapResolvedRenderQuadScratch,
  projection: PatchMapEntityProjection,
  cache: PatchMapProjectionQuadCache,
  worldA: number,
  worldB: number,
  worldC: number,
  worldD: number,
  placementAnchor?: PatchMapPointTuple,
): PatchMapReadableQuadFrame {
  const cached = cache.readableFrames.get(projection.entityId);
  if (cached !== undefined) return cached;
  writePatchMapReadableRect(
    output,
    projection,
    worldA,
    worldB,
    worldC,
    worldD,
    1,
    placementAnchor,
  );
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
  const frame = Object.freeze({
    centerX: output.center[0],
    centerY: output.center[1],
    basisA: output.basis[0],
    basisB: output.basis[1],
    basisC: output.basis[2],
    basisD: output.basis[3],
    screenA: output.screenBasis[0],
    screenB: output.screenBasis[1],
    screenC: output.screenBasis[2],
    screenD: output.screenBasis[3],
    fullWidth: output.width,
    height: output.height,
  });
  cache.readableFrames.set(projection.entityId, frame);
  return frame;
}

function readableBarPlacementAnchor(
  projection: PatchMapEntityProjection,
  index?: PatchMapProjectionIndex,
): PatchMapPointTuple | undefined {
  if (
    projection.componentType !== 'bar'
    || projection.ownerItemId === undefined
  ) {
    return undefined;
  }
  return index?.byEntityId[projection.ownerItemId]?.visibleCenter;
}

function writeCachedReadableQuad(
  output: PatchMapResolvedRenderQuadScratch,
  frame: PatchMapReadableQuadFrame,
  fraction: number,
): void {
  const width = frame.fullWidth * fraction;
  const centerOffset = (width - frame.fullWidth) / 2;
  const centerX = frame.centerX + frame.basisA * centerOffset;
  const centerY = frame.centerY + frame.basisB * centerOffset;
  output.center[0] = centerX;
  output.center[1] = centerY;
  output.basis[0] = frame.basisA;
  output.basis[1] = frame.basisB;
  output.basis[2] = frame.basisC;
  output.basis[3] = frame.basisD;
  output.screenBasis[0] = frame.screenA;
  output.screenBasis[1] = frame.screenB;
  output.screenBasis[2] = frame.screenC;
  output.screenBasis[3] = frame.screenD;
  output.width = width;
  output.height = frame.height;
  writeQuadVertices(
    output.vertices,
    centerX,
    centerY,
    frame.basisA,
    frame.basisB,
    frame.basisC,
    frame.basisD,
    width,
    frame.height,
  );
}

function writeQuadValues(
  output: PatchMapResolvedRenderQuadScratch,
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
  writeQuadVertices(
    output.vertices,
    centerX,
    centerY,
    basisA,
    basisB,
    basisC,
    basisD,
    width,
    height,
  );
}

function writeQuadVertices(
  vertices: [number, number, number, number, number, number, number, number],
  centerX: number,
  centerY: number,
  basisA: number,
  basisB: number,
  basisC: number,
  basisD: number,
  width: number,
  height: number,
): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const xWidth = basisA * halfWidth;
  const yWidth = basisB * halfWidth;
  const xHeight = basisC * halfHeight;
  const yHeight = basisD * halfHeight;
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
