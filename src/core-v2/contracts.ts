import type { EntityKind, SceneDocument } from '../core-v1/contracts';
import type {
  CoreV2AffineBasis,
  CoreV2AffineMatrix,
  CoreV2BoundsTuple,
  CoreV2PointTuple,
} from './semantic/geometry';
import type { CoreV2AssetSource } from './semantic/dataset';

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

/** Immutable numeric metadata that the Core v1-compatible dense rows omit. */
export interface CoreV2ProjectionIndex {
  readonly byEntityId: Readonly<Record<string, CoreV2EntityProjection>>;
  /** Present on parser-produced indexes; optional for older injected test surfaces. */
  readonly imagesByEntityId?: Readonly<Record<string, CoreV2ImageProjection>>;
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
