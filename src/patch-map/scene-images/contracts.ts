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
