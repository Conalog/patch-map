import type { EntityKind, SceneDocument } from '../core-v1/contracts';
import type {
  CoreV2AffineBasis,
  CoreV2AffineMatrix,
  CoreV2BoundsTuple,
  CoreV2PointTuple,
} from './semantic/geometry';
import type {
  CoreV2AssetSource,
  CoreV2ComponentSize,
  CoreV2ComponentType,
  CoreV2Edges,
  CoreV2Placement,
  CoreV2TextStyle,
} from './semantic/dataset';
import type { CoreV2TextLayout } from './semantic/text-layout';

export type CoreV2ContentOrientation = 'follow-item' | 'upright';

export type ParseDiagnosticLevel = 'warning' | 'error';

export interface ParseDiagnostic {
  readonly level: ParseDiagnosticLevel;
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly sourceId?: string;
  readonly entityId?: string;
}

export interface ElementIdentity {
  readonly sourceId: string;
  readonly sourcePath: string;
  readonly type: string;
  readonly label?: string;
  readonly entityIds: readonly string[];
  readonly rawAttrs?: Readonly<Record<string, unknown>>;
  readonly rawMetadata?: unknown;
}

export interface ComponentIdentity {
  readonly componentId: string;
  readonly componentPath: string;
  readonly type: string;
  readonly label?: string;
  readonly sourceElementId: string;
  readonly entityIds: readonly string[];
  readonly rawAttrs?: Readonly<Record<string, unknown>>;
  readonly rawMetadata?: unknown;
}

export interface ExpandedItemIdentity {
  readonly instanceId: string;
  readonly sourceElementId: string;
  readonly sourcePath: string;
  readonly entityIds: readonly string[];
  readonly grid?: Readonly<{
    row: number;
    column: number;
    cell: 0 | 1 | string;
  }>;
}

export interface EntitySourceIdentity {
  readonly entityId: string;
  readonly sourceElementId: string;
  readonly sourceElementPath: string;
  readonly instanceId?: string;
  readonly componentId?: string;
  readonly componentPath?: string;
}

export interface ParseIdentityCounts {
  readonly sourceElements: number;
  readonly sourceComponents: number;
  readonly expandedItems: number;
  readonly gridCells: number;
  readonly relationLinks: number;
  readonly entities: number;
  readonly kinds: Readonly<Record<EntityKind, number>>;
}

/** JSON-serializable identity data; no caller-owned references are retained. */
export interface ParseIdentityIndex {
  readonly counts: ParseIdentityCounts;
  readonly entityIds: readonly string[];
  readonly entityIdsBySourceId: Readonly<Record<string, readonly string[]>>;
  readonly entityIdsByComponentId: Readonly<Record<string, readonly string[]>>;
  readonly entitySourceById: Readonly<Record<string, EntitySourceIdentity>>;
  readonly elements: readonly ElementIdentity[];
  readonly components: readonly ComponentIdentity[];
  readonly expandedItems: readonly ExpandedItemIdentity[];
}

export interface CoreV2EntityProjection {
  readonly entityId: string;
  readonly localBounds: CoreV2BoundsTuple;
  /** Exact authored local-to-world transform used by every Pixi render lane. */
  readonly affine: CoreV2AffineMatrix;
  readonly worldBasis: CoreV2AffineBasis;
  readonly visibleCenter: CoreV2PointTuple;
  /** Authored rotation channel, kept separate from ambiguous reflected-matrix decomposition. */
  readonly rotationDegrees: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly contentOrientation: CoreV2ContentOrientation;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly componentType?: string;
}

export interface CoreV2RelationProjection {
  /** Stable dense relation entity ID derived from the first authored ordered pair. */
  readonly entityId: string;
  /** Stable owning PATCH MAP relations element ID. */
  readonly relationId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly key: string;
  readonly identityKey: string;
  readonly authoredIndex: number;
  /** Exact relations-local to world transform. */
  readonly affine: CoreV2AffineMatrix;
}

export type CoreV2OmittedRelationReason =
  | 'missing-source'
  | 'missing-target'
  | 'missing-source-and-target';

export interface CoreV2OmittedRelationProjection extends CoreV2RelationProjection {
  readonly reason: CoreV2OmittedRelationReason;
}

export type CoreV2ImageSourceKind = 'alias' | 'url' | 'data-uri' | 'descriptor';
export type CoreV2ImageDimensionMode = 'authored' | 'intrinsic' | 'layout';

export interface CoreV2ImageIntrinsicTransform {
  /** Exact ancestor-to-world authority before the standalone image's attrs. */
  readonly parentAffine: CoreV2AffineMatrix;
  /** Exact authored local translation, kept separate for size-dependent pivot placement. */
  readonly localTranslationAffine: CoreV2AffineMatrix;
  /** Exact authored local rotation and signed scale. */
  readonly localRotationScaleAffine: CoreV2AffineMatrix;
  /** Signed scale before local rotation, which positions the Sprite center pivot. */
  readonly localPivotScaleAffine: CoreV2AffineMatrix;
}

/**
 * Lossless, immutable image-source data kept outside the hot dense arrays.
 * `bindingKey` is the canonical equality key used by reconciliation, while
 * `cacheIdentity` is the stable source-form identity exposed to resource probes.
 */
export interface CoreV2ImageProjection {
  readonly entityId: string;
  readonly authoredSource: CoreV2AssetSource;
  readonly bindingKey: string;
  readonly cacheIdentity: string;
  readonly sourceKind: CoreV2ImageSourceKind;
  readonly authoredSize: boolean;
  /** Standalone unsized images adopt decoded logical size after resolution. */
  readonly dimensionMode: CoreV2ImageDimensionMode;
  /** Required parser authority for recomputing an intrinsic image's center pivot. */
  readonly intrinsicTransform?: CoreV2ImageIntrinsicTransform;
}

export type CoreV2ComponentRenderRole =
  | 'background-geometry'
  | 'background-asset'
  | 'content-asset';

/**
 * Stable semantic ownership and render classification for a projected item
 * component. The record deliberately excludes asset source data, whose sole
 * lossless authority remains `imagesByEntityId`.
 */
export interface CoreV2ComponentVisualProjection {
  readonly entityId: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly componentType: CoreV2ComponentType;
  readonly logicalIdentity: string;
  readonly renderRole: CoreV2ComponentRenderRole;
  readonly authoredSize?: CoreV2ComponentSize;
}

export type CoreV2BackgroundSourceKind = 'rect' | 'asset';

/** Packed RGBA paint intent retained outside the scalar dense row. */
export interface CoreV2BackgroundPaintProjection {
  readonly entityId: string;
  readonly sourceKind: CoreV2BackgroundSourceKind;
  readonly fill: number;
  readonly borderWidth: number;
  readonly borderColor: number;
  /** Top-left, top-right, bottom-right, bottom-left. */
  readonly radius: readonly [number, number, number, number];
  readonly tint: number;
}

/**
 * Browser-independent text semantics joined to stable PATCH MAP identity.
 * Pixi consumes this record as raster input; it does not measure or reflow it.
 */
export interface CoreV2TextProjection extends CoreV2TextLayout {
  readonly entityId: string;
  readonly targetKind: 'element' | 'component';
  readonly ownerId?: string;
  readonly componentId?: string;
  readonly authoredStyle: CoreV2TextStyle;
  readonly color: number;
  readonly placement: CoreV2Placement | null;
  readonly margin: CoreV2Edges;
  readonly contentOrientation: CoreV2ContentOrientation;
}

/**
 * Immutable authored animation policy and resolved semantic destination for a
 * bar component. Presentation state is intentionally absent: the runtime owns
 * that transient state separately from the parser's semantic authority.
 */
export interface CoreV2BarProjection {
  readonly entityId: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly placement: CoreV2Placement;
  readonly margin: CoreV2Edges;
  readonly contentOrientation: CoreV2ContentOrientation;
  readonly animation: boolean;
  readonly animationDuration: number;
  readonly destinationHeight: number;
}

/** Immutable numeric metadata that the Core v1-compatible dense rows omit. */
export interface CoreV2ProjectionIndex {
  readonly byEntityId: Readonly<Record<string, CoreV2EntityProjection>>;
  /** Stable component ownership and fixed render-role classification. */
  readonly componentsByEntityId?: Readonly<Record<string, CoreV2ComponentVisualProjection>>;
  /** Lossless item-background paint intent, including all four radii. */
  readonly backgroundsByEntityId?: Readonly<Record<string, CoreV2BackgroundPaintProjection>>;
  /** Present on parser-produced indexes; optional for older injected test surfaces. */
  readonly imagesByEntityId?: Readonly<Record<string, CoreV2ImageProjection>>;
  /** Deterministic semantic layout and stable target identity for every text entity. */
  readonly textsByEntityId?: Readonly<Record<string, CoreV2TextProjection>>;
  /** Authored animation policy and semantic destination for every bar entity. */
  readonly barsByEntityId?: Readonly<Record<string, CoreV2BarProjection>>;
  /** Present on parser-produced indexes; optional for older injected test surfaces. */
  readonly relationsByEntityId?: Readonly<Record<string, CoreV2RelationProjection>>;
  /** Syntactically valid links with unresolved endpoints are explicit, not fatal. */
  readonly omittedRelations?: readonly CoreV2OmittedRelationProjection[];
}

export interface ParsePatchMapOptions {
  /** Theme aliases are Pixi-style RGB/RGBA numbers or CSS color strings. */
  readonly colors?: Readonly<Record<string, unknown>>;
}

export interface ParsePatchMapResult {
  readonly document: SceneDocument;
  readonly diagnostics: readonly ParseDiagnostic[];
  readonly identity: ParseIdentityIndex;
  readonly projection: CoreV2ProjectionIndex;
}

export class PatchMapParseError extends Error {
  readonly diagnostics: readonly ParseDiagnostic[];

  constructor(message: string, diagnostics: readonly ParseDiagnostic[]) {
    super(message);
    this.name = 'PatchMapParseError';
    this.diagnostics = diagnostics;
  }
}
