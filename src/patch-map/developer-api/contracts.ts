import type { PatchMapAssetRegistration } from '../assets';
import type { PatchMapEngineDiagnostic } from '../engine/public-contracts';
import type {
  PatchMapEngineHistoryClearResult,
  PatchMapEngineHistoryResult,
  PatchMapEngineTransformerEditResult,
  PatchMapEngineSnapshot,
  PatchMapViewportChangeResult,
  PatchMapViewportFitResult,
  PatchMapViewportFocusResult,
  PatchMapViewportRestoreResult,
  PatchMapViewportState,
} from '../engine/public-contracts';
import type { PatchMapHistoryState } from '../history';
import type { PatchMapTextStyle } from '../semantic/dataset';
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
export interface PatchMapTargetSelector {
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

export interface PatchMapCompiledTargets {
  readonly selector: Readonly<PatchMapTargetSelector>;
  readonly targets: readonly PatchMapTargetMatch[];
  readonly count: number;
  readonly sceneRevision: number;
}

export type PatchMapOneOrMany<T> = T | readonly T[];

export type PatchMapTargets =
  | PatchMapTarget
  | readonly PatchMapTarget[]
  | PatchMapCompiledTargets;

export type PatchMapSelectionTargets =
  | string
  | readonly string[]
  | PatchMapTargets;

export interface PatchMapDataLoadOptions {
  readonly datasetRef?: string;
  readonly strict?: boolean;
  readonly fit?: boolean | PatchMapFitOptions;
}

export interface PatchMapDataLoadResult {
  readonly rootIds: readonly string[];
  readonly semanticHash: string;
  readonly sceneRevision: number;
}

export interface PatchMapBarUpdate extends PatchMapTarget {
  readonly componentId: string;
  readonly height: number;
}

export interface PatchMapInstanceBarUpdate extends PatchMapTarget {
  readonly componentId: string;
  /** `null` restores the authored/template value. */
  readonly height: number | null;
}

export interface PatchMapBarUpdateOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapInstanceBarUpdateOptions {
  readonly animate?: boolean;
}

export interface PatchMapTextUpdate extends PatchMapTarget {
  readonly componentId: string;
  readonly text: string;
  readonly style?: PatchMapTextStyle;
}

export interface PatchMapTextUpdateOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export type PatchMapUpdateStatus = 'committed' | 'unchanged' | 'rejected';

export interface PatchMapUpdateResult {
  readonly status: PatchMapUpdateStatus;
  readonly changed: boolean;
  readonly appliedCount: number;
  readonly missing: readonly PatchMapTarget[];
  readonly diagnostic: PatchMapEngineDiagnostic | null;
}

export interface PatchMapFitOptions {
  readonly padding?: number | readonly [number, number];
  readonly targets?: PatchMapTargets;
}

export interface PatchMapMountOptions {
  readonly target: string | HTMLElement;
  readonly data?: unknown;
  readonly instanceId?: string;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly antialias?: boolean;
  readonly background?: number | string;
  readonly zoomLimits?: readonly [number, number];
  readonly strategy?: 'mesh' | 'particle';
  readonly backend?: 'webgl' | 'webgpu';
  readonly devtools?: boolean;
  readonly powerPreference?: 'high-performance' | 'low-power';
  readonly assets?: readonly PatchMapAssetRegistration[];
  readonly historyLimit?: number;
  /** Observe the host's CSS size and coalesce it through ResizeObserver. */
  readonly resize?: 'observe' | 'manual';
  /** Auto-fit after the initial data load. Defaults to 24 CSS pixels. */
  readonly fit?: boolean | PatchMapFitOptions;
}

export interface PatchMapDataApi {
  load(input: unknown, options?: PatchMapDataLoadOptions): PatchMapDataLoadResult;
  loadAsync(input: unknown, options?: PatchMapDataLoadOptions): Promise<PatchMapDataLoadResult>;
  export(): readonly unknown[];
  serialize(strictReferences?: boolean): string;
}

export interface PatchMapTargetsApi {
  get(target: PatchMapTarget): PatchMapTargetMatch | null;
  compile(selector: PatchMapTargetSelector): PatchMapCompiledTargets;
}

export interface PatchMapBarsApi {
  set(updates: PatchMapOneOrMany<PatchMapBarUpdate>, options?: PatchMapBarUpdateOptions): PatchMapUpdateResult;
  setBatch(
    targets: PatchMapTargets,
    heights: ArrayLike<number>,
    options?: PatchMapBarUpdateOptions,
  ): PatchMapUpdateResult;
  setInstances(
    updates: PatchMapOneOrMany<PatchMapInstanceBarUpdate>,
    options?: PatchMapInstanceBarUpdateOptions,
  ): PatchMapUpdateResult;
  setInstanceBatch(
    targets: PatchMapTargets,
    heights: ArrayLike<number | null>,
    options?: PatchMapInstanceBarUpdateOptions,
  ): PatchMapUpdateResult;
}

export interface PatchMapTextsApi {
  set(updates: PatchMapOneOrMany<PatchMapTextUpdate>, options?: PatchMapTextUpdateOptions): PatchMapUpdateResult;
}

export interface PatchMapSelectionApi {
  readonly ids: readonly string[];
  set(targets: PatchMapSelectionTargets): readonly string[];
  add(targets: PatchMapSelectionTargets): readonly string[];
  remove(targets: PatchMapSelectionTargets): readonly string[];
  toggle(targets: PatchMapSelectionTargets): readonly string[];
  clear(): readonly string[];
  onChange(listener: (ids: readonly string[]) => void): () => void;
}

export interface PatchMapTransformOptions {
  readonly actionId?: string;
  readonly recordHistory?: boolean;
}

export interface PatchMapResizeOptions {
  readonly handle: PatchMapResizeHandle;
  readonly by: readonly [number, number];
  readonly lockAspectRatio?: boolean;
  readonly minSize?: number;
}

export interface PatchMapTransformApi {
  move(
    targets: PatchMapTargets,
    by: readonly [number, number],
    options?: PatchMapTransformOptions,
  ): PatchMapEngineTransformerEditResult;
  resize(
    targets: PatchMapTargets,
    resize: PatchMapResizeOptions,
    options?: PatchMapTransformOptions,
  ): PatchMapEngineTransformerEditResult;
  rotate(
    targets: PatchMapTargets,
    degrees: number,
    options?: PatchMapTransformOptions,
  ): PatchMapEngineTransformerEditResult;
}

export interface PatchMapViewportApi {
  fit(options?: PatchMapFitOptions): PatchMapViewportFitResult;
  focus(targets?: PatchMapTargets): PatchMapViewportFocusResult;
  reset(options?: PatchMapFitOptions): PatchMapViewportRestoreResult;
  pan(x: number, y: number): PatchMapViewportChangeResult;
  zoom(factor: number, anchor?: readonly [number, number]): PatchMapViewportChangeResult;
  resize(width: number, height: number, pixelRatio?: number): boolean;
  readonly state: PatchMapViewportState;
}

export interface PatchMapHistoryApi {
  readonly state: PatchMapHistoryState;
  undo(): PatchMapEngineHistoryResult;
  redo(): PatchMapEngineHistoryResult;
  clear(): PatchMapEngineHistoryClearResult;
}

export interface PatchMapAssetsApi {
  register(registrations: PatchMapOneOrMany<PatchMapAssetRegistration>): unknown;
  inspect(alias?: string): unknown;
}

export interface PatchMapDebugApi {
  snapshot(): PatchMapEngineSnapshot;
}

export interface PatchMapCaptureResult {
  readonly dataUrl: string;
  readonly mime: 'image/png';
  readonly size: readonly [number, number];
}

export interface PatchMapCaptureApi {
  png(): Promise<PatchMapCaptureResult>;
}

export interface PatchMapDeveloperApi {
  readonly data: PatchMapDataApi;
  readonly targets: PatchMapTargetsApi;
  readonly bars: PatchMapBarsApi;
  readonly texts: PatchMapTextsApi;
  readonly selection: PatchMapSelectionApi;
  readonly transform: PatchMapTransformApi;
  readonly viewport: PatchMapViewportApi;
  readonly history: PatchMapHistoryApi;
  readonly assets: PatchMapAssetsApi;
  readonly debug: PatchMapDebugApi;
  readonly capture: PatchMapCaptureApi;
}

/** The default package surface shown to application developers. */
export interface PatchMapPublic extends PatchMapDeveloperApi {
  readonly destroyed: boolean;
  destroy(): Promise<boolean>;
}

/** Async-only construction keeps partially initialized instances out of app code. */
export interface PatchMapConstructor {
  mount(options: PatchMapMountOptions): Promise<PatchMapPublic>;
}
