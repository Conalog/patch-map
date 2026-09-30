import type {
  PatchMapImageDimensionMode,
  PatchMapImageSourceKind,
} from '../parsing/contracts';
import type { PatchMapAssetSource } from '../semantic/dataset';

export type PatchMapSceneImageAssetSourceKind =
  | 'alias'
  | 'url'
  | 'data-uri'
  | 'descriptor';

export type PatchMapSceneImageAssetBindingState =
  | 'pending'
  | 'resolved'
  | 'failed';

export type PatchMapSceneImageAssetRenderRole =
  | 'image'
  | 'asset-placeholder'
  | 'none';

export type PatchMapSceneImageAssetBindingRequest =
  | Readonly<{ readonly kind: 'alias'; readonly alias: string }>
  | Readonly<{ readonly kind: 'source'; readonly source: PatchMapAssetSource }>;

export interface PatchMapSceneImageAssetBindingObservation {
  readonly key: string;
  readonly generation: number;
  readonly status: 'attached' | 'stale';
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly reusedResolvedResource: boolean;
  readonly naturalSize: readonly [number, number] | null;
}

export interface PatchMapSceneImageAssetBindingProbe {
  readonly key: string;
  readonly generation: number;
  readonly request: PatchMapSceneImageAssetBindingRequest;
  readonly sourceKind: PatchMapSceneImageAssetSourceKind;
  readonly state: PatchMapSceneImageAssetBindingState;
  readonly attached: boolean;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly reusedResolvedResource: boolean;
  readonly naturalSize: readonly [number, number] | null;
  readonly consumerCount: number;
  readonly renderObjectCount: number;
  readonly placeholderCount: number;
  readonly renderRole: PatchMapSceneImageAssetRenderRole;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
}

export interface PatchMapSceneImageLeafProbe {
  readonly entityId: string;
  readonly renderObjectCount: 0 | 1;
  readonly role: PatchMapSceneImageAssetRenderRole;
  readonly bindingKey: string;
  readonly bindingGeneration: number;
  readonly staleAttachCount?: number;
  readonly staleCompletionCount?: number;
}

/**
 * Resource and publication boundary used by the scene-image controller.
 *
 * Implementations may use PixiJS, but no renderer-specific object crosses
 * this contract.
 */
export interface PatchMapSceneImageRendererBridge {
  bindSceneAsset(
    key: string,
    request: PatchMapSceneImageAssetBindingRequest,
  ): Promise<PatchMapSceneImageAssetBindingObservation>;
  unbindSceneAsset(key: string): Promise<boolean>;
  sceneAssetBindingProbe(key: string): PatchMapSceneImageAssetBindingProbe | null;
  sceneImageProbe(entityId: string): PatchMapSceneImageLeafProbe | null;
  finalizeAssetUnloads(): Promise<void>;
}

export type PatchMapSceneImageResourceState =
  | 'absent'
  | 'pending'
  | 'resolved'
  | 'failed';

export type PatchMapSceneImageAttachmentState = 'current' | 'unbound' | 'stale';

export interface PatchMapSceneImageControllerOptions {
  /** Schedules one aggregate frame; never creates an entity ticker or RAF. */
  readonly onInvalidate?: (reason: string) => void;
  /** Commits decoded logical size only for the still-current intrinsic target. */
  readonly onIntrinsicSize?: (resolution: PatchMapSceneImageIntrinsicSize) => void;
}

export interface PatchMapSceneImageIntrinsicSize {
  readonly entityId: string;
  readonly bindingKey: string;
  readonly generation: number;
  readonly naturalSize: readonly [number, number];
}

export interface PatchMapSceneImageReconcileOptions {
  /** Omit to acquire every image. Hidden images should be excluded by the Core. */
  readonly activeEntityIds?: ReadonlySet<string>;
}

/**
 * Opaque, single-use image ownership plan produced without touching renderer or
 * controller state. A plan is valid only for the controller and reconcile
 * revision that prepared it.
 */
export interface PatchMapSceneImageReconcilePlan {
  readonly kind: 'patch-map-scene-image-reconcile-plan';
  readonly imageCount: number;
  readonly activeImageCount: number;
}

export interface PatchMapSceneImageReconcileResult {
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  readonly activated: readonly string[];
  readonly deactivated: readonly string[];
  readonly bindingsStarted: readonly string[];
  readonly bindingsRetired: readonly string[];
}

export interface PatchMapSceneImageRetryResult {
  readonly status: 'started' | 'deduplicated' | 'unavailable';
  readonly entityId: string;
  readonly bindingKey: string | null;
  readonly generation: number;
}

export interface PatchMapSceneImageDiagnostic {
  readonly level: 'warning';
  readonly code: 'ASSET_LOAD_FAILED';
  readonly targetId: string;
  readonly bindingKey: string;
  readonly generation: number;
  readonly message: string;
}

export interface PatchMapSceneImageAttemptProbe {
  readonly generation: number;
  readonly bindingKey: string;
  readonly authoredSource: PatchMapAssetSource;
  readonly sourceKind: PatchMapImageSourceKind;
  readonly dimensionMode: PatchMapImageDimensionMode;
  readonly sourceCacheIdentity: string;
  readonly resourceState: PatchMapSceneImageResourceState;
  readonly attachmentState: PatchMapSceneImageAttachmentState;
  readonly rendererGeneration: number | null;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly naturalSize: readonly [number, number] | null;
  readonly reusedResolvedResource: boolean;
  readonly diagnosticCount: number;
}

export interface PatchMapSceneImageProductProbe {
  readonly entityId: string;
  readonly active: boolean;
  readonly generation: number;
  readonly authoredSource: PatchMapAssetSource;
  readonly sourceKind: PatchMapImageSourceKind;
  readonly dimensionMode: PatchMapImageDimensionMode;
  readonly bindingKey: string;
  readonly sourceCacheIdentity: string;
  readonly state: PatchMapSceneImageResourceState;
  readonly attachmentState: PatchMapSceneImageAttachmentState;
  readonly cacheIdentity: string | null;
  readonly normalizedResourceIdentity: string | null;
  readonly naturalSize: readonly [number, number] | null;
  readonly reusedResolvedResource: boolean;
  readonly publication: Readonly<{
    /** Physical Sprite facts are current only for the matching binding generation. */
    readonly rendererFacts: 'current' | 'pending';
  }>;
  readonly renderObjectCount: 0 | 1;
  readonly placeholderCount: 0 | 1;
  /** Current binding-wide semantic consumers; zero for inactive targets. */
  readonly bindingConsumerCount: number;
  readonly role: PatchMapSceneImageAssetRenderRole;
  readonly rendererGeneration: number | null;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
  readonly diagnosticCount: number;
  readonly attempts: readonly PatchMapSceneImageAttemptProbe[];
}

export interface PatchMapSceneImagesProbe {
  readonly destroyed: boolean;
  readonly targetCount: number;
  readonly activeTargetCount: number;
  readonly bindingCount: number;
  readonly pendingBindingCount: number;
  readonly pendingSettlementCount: number;
  readonly pendingReleaseCount: number;
  readonly diagnosticCount: number;
  readonly staleAttachCount: number;
  readonly staleCompletionCount: number;
  readonly images: Readonly<Record<string, PatchMapSceneImageProductProbe>>;
  readonly diagnostics: readonly PatchMapSceneImageDiagnostic[];
  readonly abandonedRequests: Readonly<{
    readonly pendingSettlementCount: number;
    readonly pendingReleaseCount: number;
    readonly staleAttachmentCount: number;
  }>;
}
