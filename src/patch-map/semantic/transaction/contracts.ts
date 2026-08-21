import type {
  MaterializedPatchMapDataset,
  PatchMapDatasetError,
  PatchMapTextStyle,
} from '../dataset';

export const PATCH_MAP_MUTATION_TRANSACTION_REVISION =
  'core-v2-mutation-transaction/1' as const;

export type PatchMapMutationConflictPolicy = 'reject' | 'cancel-active' | 'queue-after';
export type PatchMapMutationPathSegment = string | number;
export type PatchMapMutationTarget =
  | Readonly<{ readonly kind: 'element'; readonly id: string }>
  | Readonly<{
      readonly kind: 'component';
      readonly ownerId: string;
      readonly id: string;
    }>;

export type PatchMapMutationJsonValue =
  | null
  | string
  | number
  | boolean
  | readonly PatchMapMutationJsonValue[]
  | Readonly<{ readonly [key: string]: PatchMapMutationJsonValue }>;

export interface PatchMapMutationPathChange {
  readonly path: readonly PatchMapMutationPathSegment[];
  readonly value: PatchMapMutationJsonValue;
}

export type PatchMapMutationOperation =
  | Readonly<{
      readonly op: 'add';
      readonly parent: Extract<PatchMapMutationTarget, { readonly kind: 'element' }> | null;
      readonly collection: 'children';
      readonly index: number;
      readonly value: Readonly<Record<string, PatchMapMutationJsonValue>>;
    }>
  | Readonly<{
      readonly op: 'merge';
      readonly target: PatchMapMutationTarget;
      readonly changes: readonly PatchMapMutationPathChange[];
    }>
  | Readonly<{
      readonly op: 'replace';
      readonly target: PatchMapMutationTarget;
      readonly value: Readonly<Record<string, PatchMapMutationJsonValue>>;
    }>
  | Readonly<{
      readonly op: 'reconcile-components';
      readonly target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>;
      readonly components: readonly Readonly<Record<string, PatchMapMutationJsonValue>>[];
      readonly matchMode?: 'replace';
    }>
  | Readonly<{
      readonly op: 'remove';
      readonly target: PatchMapMutationTarget;
      readonly cascade: 'reject' | 'subtree';
    }>
  | Readonly<{
      readonly op: 'move';
      readonly target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>;
      readonly parent: Extract<PatchMapMutationTarget, { readonly kind: 'element' }> | null;
      readonly index: number;
    }>
  | Readonly<{
      readonly op: 'group';
      readonly targets: readonly Extract<
        PatchMapMutationTarget,
        { readonly kind: 'element' }
      >[];
      readonly value: Readonly<Record<string, PatchMapMutationJsonValue>>;
    }>
  | Readonly<{
      readonly op: 'ungroup';
      readonly target: Extract<PatchMapMutationTarget, { readonly kind: 'element' }>;
      readonly relationPolicy: 'reject' | 'remove';
    }>;

export interface PatchMapMutationTransactionRequest {
  readonly operations: readonly PatchMapMutationOperation[];
  readonly strict: boolean;
  readonly actionId?: string;
  readonly conflictPolicy?: PatchMapMutationConflictPolicy;
  readonly recordHistory?: boolean;
  readonly history?: PatchMapMutationJsonValue;
  /** Optional direct bar subset allowed to animate in this atomic transaction. */
  readonly animatedBarTargets?: readonly PatchMapBarHeightBatchTarget[];
}

/**
 * A target-set merge keeps the empty-set no-op distinct from a raw mutation
 * transaction, whose operations array remains intentionally non-empty.
 */
export interface PatchMapBulkPatchRequest {
  readonly targets: readonly PatchMapMutationTarget[];
  readonly changes: readonly PatchMapMutationPathChange[];
  readonly strict: boolean;
  readonly actionId?: string;
}

export interface PatchMapBarHeightBatchTarget {
  readonly ownerId: string;
  readonly componentId: string;
}

export interface PatchMapBarHeightBatchRequest {
  readonly targets: readonly PatchMapBarHeightBatchTarget[];
  readonly heights: ArrayLike<number>;
  /** Uniform or target-aligned animation policy for direct bar destinations. */
  readonly animate?: boolean | ArrayLike<boolean>;
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapPlannedBarHeightUpdate extends PatchMapBarHeightBatchTarget {
  readonly height: number;
}

export interface PatchMapTextBatchTarget {
  readonly ownerId: string;
  readonly componentId: string;
}

export interface PatchMapTextBatchRequest {
  readonly targets: readonly PatchMapTextBatchTarget[];
  readonly texts: readonly string[];
  readonly styles?: readonly PatchMapTextStyle[];
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapPlannedTextUpdate extends PatchMapTextBatchTarget {
  readonly text: string;
}

export interface PatchMapPlannedElementAngleUpdate {
  readonly id: string;
  readonly angle: number;
}

export type PatchMapMutationDiagnosticCategory =
  | 'INVALID_INPUT'
  | 'MISSING_TARGET'
  | 'CONFLICT'
  | 'UNSUPPORTED_RUNTIME';

export type PatchMapMutationDiagnosticCode =
  | 'INVALID_SCHEMA_VERSION'
  | 'INVALID_RECORD_KIND'
  | 'UNKNOWN_FIELD'
  | 'INVALID_VALUE'
  | 'INVALID_PATH'
  | 'INVALID_MUTATION'
  | 'OVERLAPPING_PATH'
  | 'CONFLICTING_FIELDS'
  | 'DUPLICATE_ID'
  | 'NON_SERIALIZABLE_VALUE'
  | 'MISSING_TARGET'
  | 'CONFLICT'
  | 'UNSUPPORTED_RUNTIME';

export interface PatchMapMutationTransactionDiagnostic {
  readonly code: PatchMapMutationDiagnosticCode;
  readonly category: PatchMapMutationDiagnosticCategory;
  readonly path: string;
  readonly message: string;
  readonly operationIndex?: number;
  readonly target?: PatchMapMutationTarget;
  readonly datasetCode?: PatchMapDatasetError['code'];
}

export interface PatchMapMutationTransactionSummary {
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly unchangedCount: number;
}

export type PatchMapMutationTransactionPlan =
  | Readonly<{
      readonly status: 'planned';
      readonly changed: boolean;
      readonly schemaRevision: typeof PATCH_MAP_MUTATION_TRANSACTION_REVISION;
      readonly strict: boolean;
      readonly conflictPolicy: PatchMapMutationConflictPolicy;
      readonly operations: readonly PatchMapMutationOperation[];
      readonly actionId?: string;
      readonly recordHistory?: boolean;
      readonly history?: PatchMapMutationJsonValue;
      /** Direct bar destinations selected for animation by the caller policy. */
      readonly animatedBarTargets?: readonly PatchMapBarHeightBatchTarget[];
      /** Compact exact-height batch used by the aggregate bar hot path. */
      readonly directBarHeightUpdates?: readonly PatchMapPlannedBarHeightUpdate[];
      /** Compact owner-qualified text batch used by the editor text hot path. */
      readonly directTextUpdates?: readonly PatchMapPlannedTextUpdate[];
      /** Compact top-level angle batch used by viewport-scale authoring. */
      readonly directElementAngleUpdates?: readonly PatchMapPlannedElementAngleUpdate[];
      /** Logical selection replacement authored by group/ungroup. */
      readonly selectionIds?: readonly string[];
      /** Semantic hierarchy IDs whose aggregate retained order may change. */
      readonly allowedElementOrderIds?: readonly string[];
      readonly candidate: MaterializedPatchMapDataset;
      readonly applied: readonly PatchMapMutationTarget[];
      readonly missing: readonly PatchMapMutationTarget[];
      readonly unchanged: readonly PatchMapMutationTarget[];
      readonly summary: PatchMapMutationTransactionSummary;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly changed: false;
      readonly schemaRevision: typeof PATCH_MAP_MUTATION_TRANSACTION_REVISION;
      readonly actionId?: string;
      readonly candidate: null;
      readonly applied: readonly [];
      readonly missing: readonly [];
      readonly unchanged: readonly [];
      readonly summary: PatchMapMutationTransactionSummary;
      readonly diagnostic: PatchMapMutationTransactionDiagnostic;
    }>;
