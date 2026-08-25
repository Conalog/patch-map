import type { EntityKind, SceneDocument } from '../dense/contracts';
import type {
  PatchMapAffineBasis,
  PatchMapAffineMatrix,
  PatchMapBoundsTuple,
  PatchMapPointTuple,
} from '../semantic/geometry';
import type {
  PatchMapAssetSource,
  PatchMapComponentSize,
  PatchMapComponentType,
  PatchMapEdges,
  PatchMapPlacement,
  PatchMapTextStyle,
} from '../semantic/dataset';
import type { PatchMapTextLayout } from '../semantic/text-layout';

export type PatchMapContentOrientation = 'follow-item' | 'upright';

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

export interface PatchMapEntityProjection {
  readonly entityId: string;
  readonly localBounds: PatchMapBoundsTuple;
  /** Exact authored local-to-world transform used by every Pixi render lane. */
  readonly affine: PatchMapAffineMatrix;
  readonly worldBasis: PatchMapAffineBasis;
  readonly visibleCenter: PatchMapPointTuple;
  /** Authored rotation channel, kept separate from ambiguous reflected-matrix decomposition. */
  readonly rotationDegrees: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly contentOrientation: PatchMapContentOrientation;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly componentType?: string;
}

export interface PatchMapRelationProjection {
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
  readonly affine: PatchMapAffineMatrix;
}

export type PatchMapOmittedRelationReason =
  | 'missing-source'
  | 'missing-target'
  | 'missing-source-and-target';

export interface PatchMapOmittedRelationProjection extends PatchMapRelationProjection {
  readonly reason: PatchMapOmittedRelationReason;
}

export type PatchMapImageSourceKind = 'alias' | 'url' | 'data-uri' | 'descriptor';
export type PatchMapImageDimensionMode = 'authored' | 'intrinsic' | 'layout';

export interface PatchMapImageIntrinsicTransform {
  /** Exact ancestor-to-world authority before the standalone image's attrs. */
  readonly parentAffine: PatchMapAffineMatrix;
  /** Exact authored local translation, kept separate for size-dependent pivot placement. */
  readonly localTranslationAffine: PatchMapAffineMatrix;
  /** Exact authored local rotation and signed scale. */
  readonly localRotationScaleAffine: PatchMapAffineMatrix;
  /** Signed scale before local rotation, which positions the Sprite center pivot. */
  readonly localPivotScaleAffine: PatchMapAffineMatrix;
}

/**
 * Lossless, immutable image-source data kept outside the hot dense arrays.
 * `bindingKey` is the canonical equality key used by reconciliation, while
 * `cacheIdentity` is the stable source-form identity exposed to resource probes.
 */
export interface PatchMapImageProjection {
  readonly entityId: string;
  readonly authoredSource: PatchMapAssetSource;
  readonly bindingKey: string;
  readonly cacheIdentity: string;
  readonly sourceKind: PatchMapImageSourceKind;
  readonly authoredSize: boolean;
  /** Standalone unsized images adopt decoded logical size after resolution. */
  readonly dimensionMode: PatchMapImageDimensionMode;
  /** Required parser authority for recomputing an intrinsic image's center pivot. */
  readonly intrinsicTransform?: PatchMapImageIntrinsicTransform;
}

export type PatchMapComponentRenderRole =
  | 'background-geometry'
  | 'background-asset'
  | 'content-asset'
  | 'ordinary-geometry'
  | 'text';

/**
 * Stable semantic ownership and render classification for a projected item
 * component. The record deliberately excludes asset source data, whose sole
 * lossless authority remains `imagesByEntityId`.
 */
export interface PatchMapComponentVisualProjection {
  readonly entityId: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly componentType: PatchMapComponentType;
  readonly logicalIdentity: string;
  readonly renderRole: PatchMapComponentRenderRole;
  readonly authoredSize?: PatchMapComponentSize;
}

export type PatchMapBackgroundSourceKind = 'rect' | 'asset';

/** Packed RGBA paint intent retained outside the scalar dense row. */
export interface PatchMapBackgroundPaintProjection {
  readonly entityId: string;
  readonly sourceKind: PatchMapBackgroundSourceKind;
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
export interface PatchMapTextProjection extends PatchMapTextLayout {
  readonly entityId: string;
  readonly targetKind: 'element' | 'component';
  readonly ownerId?: string;
  readonly componentId?: string;
  readonly authoredStyle: PatchMapTextStyle;
  readonly color: number;
  readonly placement: PatchMapPlacement | null;
  readonly margin: PatchMapEdges;
  readonly contentOrientation: PatchMapContentOrientation;
}

/**
 * Immutable authored animation policy and resolved semantic destination for a
 * bar component. Presentation state is intentionally absent: the runtime owns
 * that transient state separately from the parser's semantic authority.
 */
export interface PatchMapBarProjection {
  readonly entityId: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly placement: PatchMapPlacement;
  readonly margin: PatchMapEdges;
  readonly contentOrientation: PatchMapContentOrientation;
  readonly animation: boolean;
  readonly animationDuration: number;
  readonly destinationHeight: number;
  /** Parser-owned reference used to resolve an authored percentage height. */
  readonly percentageReferenceHeight: number;
}

/** Immutable numeric metadata omitted by the compact dense rows. */
export interface PatchMapProjectionIndex {
  readonly byEntityId: Readonly<Record<string, PatchMapEntityProjection>>;
  /** Stable component ownership and fixed render-role classification. */
  readonly componentsByEntityId: Readonly<Record<string, PatchMapComponentVisualProjection>>;
  /** Lossless item-background paint intent, including all four radii. */
  readonly backgroundsByEntityId: Readonly<Record<string, PatchMapBackgroundPaintProjection>>;
  /** Stable image source and binding metadata for every image entity. */
  readonly imagesByEntityId: Readonly<Record<string, PatchMapImageProjection>>;
  /** Deterministic semantic layout and stable target identity for every text entity. */
  readonly textsByEntityId: Readonly<Record<string, PatchMapTextProjection>>;
  /** Authored animation policy and semantic destination for every bar entity. */
  readonly barsByEntityId: Readonly<Record<string, PatchMapBarProjection>>;
  /** Stable endpoint and path semantics for every relation entity. */
  readonly relationsByEntityId: Readonly<Record<string, PatchMapRelationProjection>>;
  /** Syntactically valid links with unresolved endpoints are explicit, not fatal. */
  readonly omittedRelations: readonly PatchMapOmittedRelationProjection[];
}

export interface ParsePatchMapOptions {
  /** Theme aliases are Pixi-style RGB/RGBA numbers or CSS color strings. */
  readonly colors?: Readonly<Record<string, unknown>>;
}

export interface ParsePatchMapResult {
  readonly document: SceneDocument;
  readonly diagnostics: readonly ParseDiagnostic[];
  readonly identity: ParseIdentityIndex;
  readonly projection: PatchMapProjectionIndex;
}

export class PatchMapParseError extends Error {
  readonly diagnostics: readonly ParseDiagnostic[];

  constructor(message: string, diagnostics: readonly ParseDiagnostic[]) {
    super(message);
    this.name = 'PatchMapParseError';
    this.diagnostics = diagnostics;
  }
}
