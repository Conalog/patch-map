import type {
  PatchMapAssetPolicy,
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetRuntime,
  PatchMapAssetRuntimeProbe,
  PatchMapAssetSessionProbe,
} from '../../assets';
import type { PatchMapInteractionMode } from '../../host-interaction';
import type {
  PatchMapOneOrMany,
  PatchMapPointerApi,
  PatchMapPointerPolicy,
  PatchMapPresentationApi,
  PatchMapSelectionApi,
  PatchMapSelectionPolicy,
  PatchMapTargetsApi,
} from './interaction';
import type {
  PatchMapEditorApi,
  PatchMapHistoryApi,
  PatchMapRevisionStamp,
  PatchMapTransactionOperation,
  PatchMapTransactionOptions,
  PatchMapUpdate,
  PatchMapUpdateBatch,
  PatchMapUpdateBatchOptions,
  PatchMapUpdateOptions,
  PatchMapUpdateResult,
} from './mutation-history-editor';
import type {
  PatchMapFitOptions,
  PatchMapTransformApi,
  PatchMapViewportApi,
  PatchMapViewportOptions,
  PatchMapViewportState,
} from './viewport-transform';

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

export type PatchMapTheme = Readonly<Record<string, unknown>>;

export interface PatchMapOptions {
  readonly container: string | HTMLElement;
  readonly data?: unknown;
  /** Partial instance-local overrides of the canonical PatchMap color theme. */
  readonly theme?: PatchMapTheme;
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
  /** Root pointer selection policy; the package retains hit-test and gesture ownership. */
  readonly selection?: PatchMapSelectionPolicy;
  /** Root pointer projection policy; listeners and hit testing remain package-owned. */
  readonly pointer?: PatchMapPointerPolicy;
  /** Root viewport gesture activation; omitted wheel activation remains modifier-free. */
  readonly viewport?: PatchMapViewportOptions;
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

export interface PatchMapDebugSnapshot {
  readonly lifecycle:
    | 'new'
    | 'initializing'
    | 'ready-empty'
    | 'scene-ready'
    | 'destroying'
    | 'destroyed';
  readonly instanceId: string | null;
  readonly revisions: PatchMapRevisionStamp;
  readonly publishedTuple: Readonly<{
    readonly scene: number;
    readonly view: number;
    readonly interaction: number;
  }>;
  readonly frameRevision: number;
  readonly datasetRef: string | null;
  readonly semanticHash: string | null;
  readonly rootIds: readonly string[];
  readonly historyDepth: number;
  readonly pendingWork: number;
  readonly zoomLimits: readonly [number, number];
  readonly viewport: PatchMapViewportState;
  readonly selectionIds: readonly string[];
  readonly presentation: Readonly<{
    readonly revision: number;
    readonly layerCount: number;
  }>;
  readonly interaction: Readonly<{
    readonly mode: PatchMapInteractionMode;
    readonly staleGestureCount: number;
  }>;
  readonly facilities: readonly string[];
  readonly resources: Readonly<{
    readonly canvasCount: number;
    readonly canvas: Readonly<{
      readonly cssSize: readonly [number, number];
      readonly backingSize: readonly [number, number];
    }>;
    readonly renderer: Readonly<{
      readonly resolution: number;
      readonly antialias: boolean;
      readonly background: string;
      readonly backend: 'webgl' | 'webgpu';
    }> | null;
    readonly rendering: Readonly<{
      readonly commandCount: number | null;
      readonly visiblePrimitiveCount: number | null;
    }>;
    readonly assets: PatchMapAssetSessionProbe | null;
    readonly subscriptions: Readonly<{ readonly active: number; readonly duplicates: 0 }>;
  }>;
}

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
  updateBatch(input: PatchMapUpdateBatch, options?: PatchMapUpdateBatchOptions): PatchMapUpdateResult;
  transaction(
    operations: readonly PatchMapTransactionOperation[],
    options?: PatchMapTransactionOptions,
  ): PatchMapUpdateResult;
  readonly data: PatchMapDataApi;
  readonly targets: PatchMapTargetsApi;
  readonly pointer: PatchMapPointerApi;
  readonly selection: PatchMapSelectionApi;
  readonly presentation: PatchMapPresentationApi;
  readonly editor: PatchMapEditorApi;
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
