import type {
  PatchMapAssetPolicy,
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetRuntime,
  PatchMapAssetRuntimeProbe,
  PatchMapAssetSessionProbe,
} from '../assets';
import type { PatchMapEngineDiagnostic } from '../engine/public-contracts';
import type {
  PatchMapEngineHistoryClearResult,
  PatchMapEngineHistoryResult,
  PatchMapEngineTransformerEditResult,
  PatchMapEngineSnapshot,
  PatchMapViewportChangeResult,
  PatchMapViewportFitResult,
  PatchMapViewportRestoreResult,
  PatchMapViewportState,
} from '../engine/public-contracts';
import type { PatchMapHistoryState } from '../history';
import type { PatchMapTextStyle } from '../semantic/dataset';
import type {
  PatchMapMutationConflictPolicy,
  PatchMapMutationJsonValue,
} from '../semantic/transaction';
import type { PatchMapResizeHandle } from '../transformer-edit';

/** One public address shape for elements and their components. */
export interface PatchMapTarget {
  readonly id: string;
  readonly componentId?: string;
}

export type PatchMapTargetScope = 'all' | 'authored' | 'instances';

/**
 * A deliberately small semantic selector. It is not JSONPath: selectors are
 * resolved against PatchMap's stable logical index once, then reused by batch
 * APIs without reparsing the input dataset.
 */
export interface PatchMapTargetQuery {
  /** Element/instance ID. When componentId is present this is its owner ID. */
  readonly id?: string;
  /** Stable component ID such as `usage` or `label`. */
  readonly componentId?: string;
  /** PATCH MAP semantic type such as `item`, `bar`, or `text`. */
  readonly type?: string;
  /** Restrict matches to this element and its descendants. */
  readonly within?: string;
  /** Distinguish authored templates from expanded grid instances. */
  readonly scope?: PatchMapTargetScope;
}

export interface PatchMapTargetMatch extends PatchMapTarget {
  readonly kind: 'element' | 'component';
  readonly type: string;
  readonly label: string | null;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface PatchMapTargetSet {
  readonly matches: readonly PatchMapTargetMatch[];
  readonly count: number;
}

export type PatchMapOneOrMany<T> = T | readonly T[];

export type PatchMapTargetsInput =
  | PatchMapTarget
  | readonly PatchMapTarget[]
  | PatchMapTargetSet;

export type PatchMapSelectionInput =
  | string
  | readonly string[]
  | PatchMapTargetsInput;

export interface PatchMapDataReplaceOptions {
  readonly datasetRef?: string;
  readonly strict?: boolean;
  readonly fit?: boolean | PatchMapFitOptions;
}

export interface PatchMapDataReplaceResult {
  readonly rootIds: readonly string[];
  readonly semanticHash: string;
  readonly sceneRevision: number;
}

export type PatchMapUpdateRecord = Readonly<Record<string, PatchMapMutationJsonValue>>;

export interface PatchMapMutationOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapUpdateOptions extends PatchMapMutationOptions {
  /** Applies to concrete grid-instance bar presentation updates. */
  readonly animate?: boolean;
}

export interface PatchMapComponentUpdate {
  /** Optional when the owner has exactly one component of this type. */
  readonly componentId?: string;
  /** PATCH MAP component fields merged recursively without changing identity. */
  readonly changes?: PatchMapUpdateRecord;
}

export interface PatchMapBarUpdate extends PatchMapComponentUpdate {
  /** Convenience alias for `size.height`. `null` restores an instance overlay. */
  readonly height?: number | null;
}

export interface PatchMapTextUpdate extends PatchMapComponentUpdate {
  readonly text?: string;
  readonly style?: PatchMapTextStyle;
}

/** One logical owner update. Component IDs are optional when unambiguous. */
export interface PatchMapUpdate {
  readonly id: string;
  /** PATCH MAP element fields merged recursively without changing identity. */
  readonly changes?: PatchMapUpdateRecord;
  readonly background?: PatchMapComponentUpdate;
  readonly bar?: PatchMapBarUpdate;
  readonly icon?: PatchMapComponentUpdate;
  readonly text?: PatchMapTextUpdate;
}

export type PatchMapUpdateTargetsInput =
  | string
  | readonly string[]
  | PatchMapTargetsInput;

export type PatchMapUpdateColumn<T> = ArrayLike<T>;

export interface PatchMapComponentUpdateColumns {
  /** Shared component ID; omit when every owner has exactly one matching component. */
  readonly componentId?: string;
  readonly changes?: Readonly<Record<string, PatchMapUpdateColumn<PatchMapMutationJsonValue>>>;
}

export interface PatchMapBarUpdateColumns extends PatchMapComponentUpdateColumns {
  readonly height?: PatchMapUpdateColumn<number | null>;
}

export interface PatchMapTextUpdateColumns extends PatchMapComponentUpdateColumns {
  readonly text?: PatchMapUpdateColumn<string>;
  readonly style?: PatchMapUpdateColumn<PatchMapTextStyle>;
}

/** Columnar, equal-length input for large homogeneous updates. */
export interface PatchMapUpdateBatch {
  readonly targets: PatchMapUpdateTargetsInput;
  readonly changes?: Readonly<Record<string, PatchMapUpdateColumn<PatchMapMutationJsonValue>>>;
  readonly background?: PatchMapComponentUpdateColumns;
  readonly bar?: PatchMapBarUpdateColumns;
  readonly icon?: PatchMapComponentUpdateColumns;
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
  /** Selection published and restored atomically with the transaction history entry. */
  readonly selectedIds?: readonly string[];
}

export type PatchMapUpdateStatus = 'committed' | 'unchanged' | 'rejected' | 'refused';

export interface PatchMapUpdateResult {
  readonly status: PatchMapUpdateStatus;
  readonly changed: boolean;
  readonly appliedCount: number;
  readonly missing: readonly PatchMapTarget[];
  readonly diagnostic: PatchMapDiagnostic | null;
}

/** Structured public failure details without exposing Engine terminology. */
export type PatchMapDiagnostic = PatchMapEngineDiagnostic;

export interface PatchMapFitOptions {
  readonly padding?: number | readonly [number, number];
  readonly targets?: PatchMapTargetsInput;
}

export interface PatchMapOptions {
  readonly container: string | HTMLElement;
  readonly data?: unknown;
  readonly instanceId?: string;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly antialias?: boolean;
  readonly background?: number | string;
  readonly zoomLimits?: readonly [number, number];
  readonly backend?: 'webgl' | 'webgpu';
  readonly devtools?: boolean;
  readonly powerPreference?: 'high-performance' | 'low-power';
  readonly assets?: readonly PatchMapAssetRegistration[];
  /** Share decoded asset ownership across mounted PatchMap instances. */
  readonly assetRuntime?: PatchMapAssetRuntime;
  readonly assetPolicy?: PatchMapAssetPolicy;
  readonly historyLimit?: number;
  /** Observe the host's CSS size and coalesce it through ResizeObserver. */
  readonly resizeMode?: 'observe' | 'manual';
  /** Auto-fit after the initial data load. Defaults to 24 CSS pixels. */
  readonly fit?: boolean | PatchMapFitOptions;
}

export interface PatchMapDataApi {
  replace(input: unknown, options?: PatchMapDataReplaceOptions): PatchMapDataReplaceResult;
  replaceAsync(
    input: unknown,
    options?: PatchMapDataReplaceOptions,
  ): Promise<PatchMapDataReplaceResult>;
  snapshot(): readonly unknown[];
  serialize(strictReferences?: boolean): string;
}

export interface PatchMapTargetsApi {
  get(target: PatchMapTarget): PatchMapTargetMatch | null;
  query(query: PatchMapTargetQuery): PatchMapTargetSet;
}

export interface PatchMapSelectionApi {
  readonly ids: readonly string[];
  set(targets: PatchMapSelectionInput): readonly string[];
  add(targets: PatchMapSelectionInput): readonly string[];
  remove(targets: PatchMapSelectionInput): readonly string[];
  toggle(targets: PatchMapSelectionInput): readonly string[];
  clear(): readonly string[];
  onChange(listener: (ids: readonly string[]) => void): () => void;
}

export interface PatchMapTransformOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapResizeByOptions {
  readonly handle: PatchMapResizeHandle;
  readonly delta: readonly [number, number];
  readonly lockAspectRatio?: boolean;
  readonly minSize?: number;
}

export interface PatchMapTransformApi {
  moveBy(
    targets: PatchMapTargetsInput,
    delta: readonly [number, number],
    options?: PatchMapTransformOptions,
  ): PatchMapTransformResult;
  resizeBy(
    targets: PatchMapTargetsInput,
    resize: PatchMapResizeByOptions,
    options?: PatchMapTransformOptions,
  ): PatchMapTransformResult;
  rotateBy(
    targets: PatchMapTargetsInput,
    degrees: number,
    options?: PatchMapTransformOptions,
  ): PatchMapTransformResult;
}

export type PatchMapTransformResult = PatchMapEngineTransformerEditResult;

export interface PatchMapViewportApi {
  fit(options?: PatchMapFitOptions): PatchMapViewportFitResult;
  reset(options?: PatchMapFitOptions): PatchMapViewportRestoreResult;
  panBy(delta: readonly [number, number]): PatchMapViewportChangeResult;
  zoomBy(factor: number, anchor?: readonly [number, number]): PatchMapViewportChangeResult;
  resize(width: number, height: number, pixelRatio?: number): boolean;
  readonly state: PatchMapViewportState;
}

export interface PatchMapHistoryApi {
  readonly state: PatchMapHistoryState;
  undo(): PatchMapHistoryResult;
  redo(): PatchMapHistoryResult;
  clear(): PatchMapHistoryClearResult;
}

export type PatchMapHistoryResult = PatchMapEngineHistoryResult;
export type PatchMapHistoryClearResult = PatchMapEngineHistoryClearResult;

export interface PatchMapAssetsApi {
  register(
    registrations: PatchMapOneOrMany<PatchMapAssetRegistration>,
  ): PatchMapAssetRegistrationResult;
  status(alias?: string): PatchMapAssetStatus;
}

export interface PatchMapAssetStatus {
  readonly session: PatchMapAssetSessionProbe | null;
  readonly runtime: PatchMapAssetRuntimeProbe;
}

export interface PatchMapDebugApi {
  snapshot(): PatchMapDebugSnapshot;
}

export type PatchMapDebugSnapshot = PatchMapEngineSnapshot;

export interface PatchMapCaptureResult {
  readonly dataUrl: string;
  readonly mime: 'image/png';
  readonly size: readonly [number, number];
}

export interface PatchMapCaptureApi {
  png(): Promise<PatchMapCaptureResult>;
}

export interface PatchMapApi {
  update(input: PatchMapUpdate, options?: PatchMapUpdateOptions): PatchMapUpdateResult;
  updateBatch(input: PatchMapUpdateBatch, options?: PatchMapUpdateOptions): PatchMapUpdateResult;
  transaction(
    operations: readonly PatchMapTransactionOperation[],
    options?: PatchMapTransactionOptions,
  ): PatchMapUpdateResult;
  readonly data: PatchMapDataApi;
  readonly targets: PatchMapTargetsApi;
  readonly selection: PatchMapSelectionApi;
  readonly transform: PatchMapTransformApi;
  readonly viewport: PatchMapViewportApi;
  readonly history: PatchMapHistoryApi;
  readonly assets: PatchMapAssetsApi;
  readonly debug: PatchMapDebugApi;
  readonly capture: PatchMapCaptureApi;
}

/** The default package surface shown to application developers. */
export interface PatchMapInstance extends PatchMapApi {
  readonly destroyed: boolean;
  destroy(): Promise<boolean>;
}

/** Async-only construction keeps partially initialized instances out of app code. */
export interface PatchMapStatic {
  mount(options: PatchMapOptions): Promise<PatchMapInstance>;
}
