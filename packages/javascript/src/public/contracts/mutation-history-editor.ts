import type {
  PatchMapHistoryDirection,
  PatchMapHistoryState,
} from '../../history';
import type {
  PatchMapEditorWorkflowAction,
  PatchMapEditorWorkflowFacts,
  PatchMapEditorWorkflowMode,
} from '../../editor-workflow';
import type {
  BaseComponentData,
  DrawableSource,
  ElementAttributes,
  Placement,
  Spacing,
  TextStyleInput,
} from '../input';
import type {
  PatchMapMutationConflictPolicy,
  PatchMapMutationJsonValue,
} from '../../semantic/transaction';
import type {
  PatchMapTarget,
  PatchMapTargetsInput,
} from './interaction';

export type {
  PatchMapEditorWorkflowAction,
  PatchMapEditorWorkflowMode,
} from '../../editor-workflow';

export type PatchMapUpdateRecord = Readonly<Record<string, PatchMapMutationJsonValue>>;

/** Recursive presentation merge; nested `null` restores the authored field. */
export type PatchMapPresentationPatch<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer U)[]
      ? readonly PatchMapPresentationPatch<U>[]
      : T extends object
        ? Readonly<{
            [K in keyof T]?: PatchMapPresentationPatch<T[K]> | null;
          }>
        : T;

export interface PatchMapMutationOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapUpdateOptions extends PatchMapMutationOptions {
  /** Applies to concrete grid-instance bar presentation updates. */
  readonly animate?: boolean;
}

export interface PatchMapUpdateBatchOptions extends PatchMapMutationOptions {
  /**
   * Uniform animation flag or one boolean per target. Mixed columns animate
   * only true bar-height destinations while companion fields commit at once.
   */
  readonly animate?: boolean | PatchMapUpdateColumn<boolean>;
}

export interface PatchMapComponentUpdate<
  TChanges extends object = PatchMapUpdateRecord,
> {
  /** Optional when the owner has exactly one component of this type. */
  readonly componentId?: string;
  /** PATCH MAP component fields merged recursively without changing identity. */
  readonly changes?: TChanges;
}

/**
 * Runtime presentation fields supported on concrete grid components.
 * `null` restores only that field from the authored template.
 */
export type PatchMapInstancePresentationChanges = PatchMapUpdateRecord & Readonly<{
  readonly show?: boolean | null;
  readonly source?: PatchMapMutationJsonValue | null;
  readonly tint?: PatchMapMutationJsonValue | null;
}>;

/** Renderer-visible current background fields accepted for one concrete grid cell. */
export interface PatchMapBackgroundPresentationChanges {
  readonly show?: boolean | null;
  readonly source?: PatchMapPresentationPatch<DrawableSource> | null;
  readonly tint?: BaseComponentData['tint'] | null;
  readonly attrs?: PatchMapPresentationPatch<ElementAttributes> | null;
}

/** Renderer-visible current text fields accepted for one concrete grid cell. */
export interface PatchMapTextPresentationChanges {
  readonly show?: boolean | null;
  readonly text?: string | null;
  readonly placement?: Placement | null;
  readonly margin?: PatchMapPresentationPatch<Spacing> | null;
  readonly tint?: BaseComponentData['tint'] | null;
  readonly style?: PatchMapPresentationPatch<TextStyleInput> | null;
  readonly split?: number | null;
  readonly attrs?: PatchMapPresentationPatch<ElementAttributes> | null;
}

export interface PatchMapBarUpdate
  extends PatchMapComponentUpdate<PatchMapInstancePresentationChanges> {
  /** Convenience alias for `size.height`. `null` restores an instance overlay. */
  readonly height?: number | null;
  readonly changes?: PatchMapInstancePresentationChanges;
}

export interface PatchMapIconUpdate
  extends PatchMapComponentUpdate<PatchMapInstancePresentationChanges> {
  readonly changes?: PatchMapInstancePresentationChanges;
}

export interface PatchMapBackgroundUpdate
  extends PatchMapComponentUpdate<
    PatchMapUpdateRecord | PatchMapBackgroundPresentationChanges
  > {
  readonly changes?: PatchMapUpdateRecord | PatchMapBackgroundPresentationChanges;
}

export interface PatchMapTextUpdate
  extends PatchMapComponentUpdate<PatchMapUpdateRecord | PatchMapTextPresentationChanges> {
  /** `null` restores concrete grid text from the current authored template. */
  readonly text?: string | null;
  /** `null` restores the complete authored style on a concrete grid text. */
  readonly style?: PatchMapPresentationPatch<TextStyleInput> | null;
  readonly changes?: PatchMapUpdateRecord | PatchMapTextPresentationChanges;
}

/** One logical owner update. Component IDs are optional when unambiguous. */
export interface PatchMapUpdate {
  readonly id: string;
  /** PATCH MAP element fields merged recursively without changing identity. */
  readonly changes?: PatchMapUpdateRecord;
  readonly background?: PatchMapBackgroundUpdate;
  readonly bar?: PatchMapBarUpdate;
  readonly icon?: PatchMapIconUpdate;
  readonly text?: PatchMapTextUpdate;
}

export type PatchMapUpdateTargetsInput =
  | string
  | readonly string[]
  | PatchMapTargetsInput;

export type PatchMapUpdateColumn<T> = ArrayLike<T>;

export interface PatchMapComponentUpdateColumns<
  TChanges extends object = Readonly<
    Record<string, PatchMapUpdateColumn<PatchMapMutationJsonValue>>
  >,
> {
  /** Shared component ID; omit when every owner has exactly one matching component. */
  readonly componentId?: string;
  readonly changes?: TChanges;
}

export interface PatchMapBarUpdateColumns extends PatchMapComponentUpdateColumns {
  readonly height?: PatchMapUpdateColumn<number | null>;
  readonly changes?: PatchMapComponentUpdateColumns['changes'] & Readonly<{
    readonly show?: PatchMapUpdateColumn<boolean | null>;
    readonly source?: PatchMapUpdateColumn<PatchMapMutationJsonValue | null>;
    readonly tint?: PatchMapUpdateColumn<PatchMapMutationJsonValue | null>;
  }>;
}

export interface PatchMapIconUpdateColumns extends PatchMapComponentUpdateColumns {
  readonly changes?: PatchMapComponentUpdateColumns['changes'] & Readonly<{
    readonly show?: PatchMapUpdateColumn<boolean | null>;
    readonly source?: PatchMapUpdateColumn<PatchMapMutationJsonValue | null>;
    readonly tint?: PatchMapUpdateColumn<PatchMapMutationJsonValue | null>;
  }>;
}

export type PatchMapBackgroundPresentationColumns = Readonly<{
    readonly show?: PatchMapUpdateColumn<boolean | null>;
    readonly source?: PatchMapUpdateColumn<PatchMapPresentationPatch<DrawableSource> | null>;
    readonly tint?: PatchMapUpdateColumn<BaseComponentData['tint'] | null>;
    readonly attrs?: PatchMapUpdateColumn<PatchMapPresentationPatch<ElementAttributes> | null>;
  }>;

export interface PatchMapBackgroundUpdateColumns
  extends PatchMapComponentUpdateColumns<
    NonNullable<PatchMapComponentUpdateColumns['changes']> |
    PatchMapBackgroundPresentationColumns
  > {
  readonly changes?:
    NonNullable<PatchMapComponentUpdateColumns['changes']> |
    PatchMapBackgroundPresentationColumns;
}

export type PatchMapTextPresentationColumns = Readonly<{
    readonly show?: PatchMapUpdateColumn<boolean | null>;
    readonly text?: PatchMapUpdateColumn<string | null>;
    readonly placement?: PatchMapUpdateColumn<Placement | null>;
    readonly margin?: PatchMapUpdateColumn<PatchMapPresentationPatch<Spacing> | null>;
    readonly tint?: PatchMapUpdateColumn<BaseComponentData['tint'] | null>;
    readonly style?: PatchMapUpdateColumn<PatchMapPresentationPatch<TextStyleInput> | null>;
    readonly split?: PatchMapUpdateColumn<number | null>;
    readonly attrs?: PatchMapUpdateColumn<PatchMapPresentationPatch<ElementAttributes> | null>;
  }>;

export interface PatchMapTextUpdateColumns
  extends PatchMapComponentUpdateColumns<
    NonNullable<PatchMapComponentUpdateColumns['changes']> |
    PatchMapTextPresentationColumns
  > {
  readonly text?: PatchMapUpdateColumn<string | null>;
  readonly style?: PatchMapUpdateColumn<PatchMapPresentationPatch<TextStyleInput> | null>;
  readonly changes?:
    NonNullable<PatchMapComponentUpdateColumns['changes']> |
    PatchMapTextPresentationColumns;
}

/** Columnar, equal-length input for large homogeneous updates. */
export interface PatchMapUpdateBatch {
  readonly targets: PatchMapUpdateTargetsInput;
  readonly changes?: Readonly<Record<string, PatchMapUpdateColumn<PatchMapMutationJsonValue>>>;
  readonly background?: PatchMapBackgroundUpdateColumns;
  readonly bar?: PatchMapBarUpdateColumns;
  readonly icon?: PatchMapIconUpdateColumns;
  readonly text?: PatchMapTextUpdateColumns;
}

export type PatchMapTransactionOperation =
  | (PatchMapUpdate & Readonly<{ readonly type: 'update' }>)
  | Readonly<{
      readonly type: 'add';
      readonly parentId: string | null;
      readonly index: number;
      readonly value: PatchMapUpdateRecord;
    }>
  | Readonly<{
      readonly type: 'replace';
      readonly id: string;
      readonly componentId?: string;
      readonly value: PatchMapUpdateRecord;
    }>
  | Readonly<{
      readonly type: 'remove';
      readonly id: string;
      readonly componentId?: string;
      readonly cascade?: 'reject' | 'subtree';
    }>
  | Readonly<{
      readonly type: 'move';
      readonly id: string;
      readonly parentId: string | null;
      readonly index: number;
    }>
  | Readonly<{
      readonly type: 'group';
      readonly ids: readonly string[];
      readonly value: PatchMapUpdateRecord;
    }>
  | Readonly<{
      readonly type: 'ungroup';
      readonly id: string;
      readonly relationPolicy?: 'reject' | 'remove';
    }>;

export interface PatchMapTransactionOptions extends PatchMapMutationOptions {
  readonly conflictPolicy?: PatchMapMutationConflictPolicy;
  /** Uniform flag or one boolean per transaction operation for bar-height animation. */
  readonly animate?: boolean | PatchMapUpdateColumn<boolean>;
  /** Selection published and restored atomically with the transaction history entry. */
  readonly selectedIds?: readonly string[];
  /** Detached JSON state restored atomically with semantic history. */
  readonly companion?: PatchMapMutationJsonValue;
}

export type PatchMapUpdateStatus = 'committed' | 'unchanged' | 'rejected' | 'refused';

export interface PatchMapUpdateResult {
  readonly status: PatchMapUpdateStatus;
  readonly changed: boolean;
  readonly appliedCount: number;
  readonly missing: readonly PatchMapTarget[];
  readonly diagnostic: PatchMapDiagnostic | null;
}

export type PatchMapDiagnosticCategory =
  | 'INVALID_INPUT'
  | 'MISSING_TARGET'
  | 'STALE_TARGET'
  | 'NOT_READY'
  | 'DESTROYED'
  | 'CANCELLED'
  | 'SUPERSEDED'
  | 'CONFLICT'
  | 'ASSET_FAILURE'
  | 'EXTRACTION_FAILURE'
  | 'UNSUPPORTED_RUNTIME'
  | 'RENDERER_LOST'
  | 'HOST_CALLBACK_FAILURE'
  | 'INTERNAL_FAILURE';

export interface PatchMapRevisionStamp {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly viewRevision: number;
  readonly interactionRevision: number;
}

/** Structured public failure details independent of Engine implementation types. */
export interface PatchMapDiagnostic {
  readonly code: string;
  readonly category: PatchMapDiagnosticCategory;
  readonly operation: string;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly revisionStamp: PatchMapRevisionStamp;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly unchangedCount: number;
  readonly datasetPath?: string;
  readonly logicalId?: string | null;
  readonly sanitizedAssetId?: string;
  readonly sanitizedHash?: string;
}

export interface PatchMapHistoryApi {
  readonly state: PatchMapHistoryState;
  undo(): PatchMapHistoryResult;
  redo(): PatchMapHistoryResult;
  clear(): PatchMapHistoryClearResult;
  onChange(listener: (state: PatchMapHistoryState) => void): () => void;
}

export interface PatchMapHistoryResult {
  readonly status: 'committed' | 'unavailable' | 'refused';
  readonly changed: boolean;
  readonly direction: PatchMapHistoryDirection;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly sceneRevision: number;
  readonly semanticHash: string | null;
  readonly history: PatchMapHistoryState;
  /** Host state restored with the selected history boundary, or null when absent. */
  readonly companion: PatchMapMutationJsonValue | null;
}

export interface PatchMapEditorResult {
  readonly status: 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly code: string | null;
  readonly facts: PatchMapEditorWorkflowFacts;
  readonly selectionIds: readonly string[];
  readonly state: PatchMapEditorState;
}

export interface PatchMapEditorState {
  readonly mode: PatchMapEditorWorkflowMode;
  readonly activeTargetId: string | null;
  readonly inactiveCellsVisible: boolean;
  readonly pendingDeleteCount: number;
}

export interface PatchMapEditorApi {
  execute(action: PatchMapEditorWorkflowAction): PatchMapEditorResult;
  readonly state: PatchMapEditorState;
}

export interface PatchMapHistoryClearResult {
  readonly changed: boolean;
  readonly reason: 'host' | 'replace' | 'destroy';
  readonly history: PatchMapHistoryState;
}
