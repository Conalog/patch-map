import type { EntityKind, SceneDocument } from '../core-v1/contracts';
import type {
  CoreV2AffineBasis,
  CoreV2AffineMatrix,
  CoreV2BoundsTuple,
  CoreV2PointTuple,
} from './semantic/geometry';

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

/** Immutable numeric metadata that the Core v1-compatible dense rows omit. */
export interface CoreV2ProjectionIndex {
  readonly byEntityId: Readonly<Record<string, CoreV2EntityProjection>>;
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
