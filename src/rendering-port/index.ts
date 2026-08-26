import type { CoreView } from '../dense/contracts';
import type {
  PatchMapTextRenderRoute,
  PatchMapTextRenderRouteReason,
} from '../semantic/text-render-route';

export type PatchMapRendererStrategy = 'mesh' | 'particle';
export type PatchMapBackendPreference = 'webgl' | 'webgpu';

/** Sparse renderer-owned values projected over immutable dense columns. */
export interface PatchMapRendererEntityPresentationOverride {
  readonly kind?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly fill?: number;
  readonly stroke?: number;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly source?: string;
  readonly tint?: number;
  readonly trackFill?: number;
  readonly align?: number;
}

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
  /** Present on the product renderer; optional only for deterministic renderer adapters. */
  readonly displayMode?: 'all' | 'group-only' | 'element-only' | 'hidden';
  readonly strokeAlignment?: 'outside' | 'center' | 'inside';
  readonly strokeScale?: 'fixed' | 'viewport';
  readonly individualOutlineCount?: number;
  readonly groupOutline?: boolean;
  readonly outlineCount?: number;
  /** Renderer repaint count; optional only for deterministic renderer adapters. */
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
  /** Explicit dense entity ids eligible for resize handles. */
  readonly resizableEntityIds: readonly string[];
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

/** Concrete renderer text object kind attached to the aggregate text lane. */
export type PatchMapTextObjectKind = PatchMapTextRenderRoute | 'none';
export type PatchMapTextRouteDecisionReason = PatchMapTextRenderRouteReason | 'not-attached';
export type PatchMapTextPublicationStatus = 'pending' | 'current';

/** Semantic identities attached to one logical renderer text leaf. */
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

export interface RootContextMenuInput {
  readonly screenX: number;
  readonly screenY: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export interface RootInteractionHandlers {
  readonly pointer: (input: RootPointerInput) => void;
  /** True only when the package committed zoom and owns native consumption. */
  readonly wheel: (input: RootWheelInput) => boolean;
  readonly contextMenu: (input: RootContextMenuInput) => boolean;
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

/** Detached renderer public-surface facts; no live renderer object crosses this boundary. */
export interface PatchMapRendererPublicSurfaceProbe {
  readonly rendererLibrary: string;
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
export interface PatchMapRendererLossProbe {
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

export interface PatchMapRendererDebug {
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
  /** Fallback text objects; together with bitmapTextCount this is the text object total. */
  readonly fallbackTextCount: number;
  readonly imageCount: number;
  readonly loadedAssetCount: number;
  readonly unresolvedAssetCount: number;
  readonly view: CoreView;
  readonly lastInvalidation: string;
  readonly destroyed: boolean;
}
