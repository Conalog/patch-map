import type { PatchMapAssetDescriptor, PatchMapAssetSource } from '../semantic/dataset';

export type PatchMapAssetDiagnosticCategory =
  | 'INVALID_INPUT'
  | 'CONFLICT'
  | 'ASSET_FAILURE'
  | 'CANCELLED'
  | 'INTERNAL_FAILURE';

export type PatchMapAssetDiagnosticCode =
  | 'INVALID_VALUE'
  | 'CONFLICT'
  | 'ASSET_POLICY_REJECTED'
  | 'ASSET_LOAD_FAILED'
  | 'ASSET_DECODE_FAILED'
  | 'ASSET_UPLOAD_FAILED'
  | 'CANCELLED'
  | 'INTERNAL_FAILURE';

export class PatchMapAssetError extends Error {
  public constructor(
    public readonly code: PatchMapAssetDiagnosticCode,
    public readonly category: PatchMapAssetDiagnosticCategory,
    public readonly retryable: boolean,
  ) {
    super(`${code}: asset`);
    this.name = 'PatchMapAssetError';
  }
}

export interface PatchMapAssetRegistration {
  readonly alias: string;
  readonly descriptor: PatchMapAssetSource;
  readonly kind?: 'image' | 'font';
  readonly fontWeight?: number;
}

export interface PatchMapNormalizedAssetRegistration {
  readonly alias: string;
  readonly descriptor: PatchMapAssetDescriptor;
  readonly kind: 'image' | 'font';
  readonly fontWeight?: number;
}

export interface PatchMapResolvedAssetPolicy {
  readonly maxEncodedBytes: number;
  readonly maxDecodedWidth: number;
  readonly maxDecodedHeight: number;
}

/**
 * Per-instance asset admission settings. New policy controls may be added here
 * without replacing the root `assetPolicy` option.
 */
export interface PatchMapAssetPolicy {
  readonly maxEncodedBytes?: number;
  readonly maxDecodedWidth?: number;
  readonly maxDecodedHeight?: number;
}

export interface PatchMapAssetBackendRequest {
  readonly key: string;
  readonly descriptor: PatchMapAssetDescriptor;
  readonly cacheIdentity: string;
  readonly packageOwned: boolean;
  /** Per-request host asset policy. Omitted values use package defaults. */
  readonly policy?: PatchMapAssetPolicy;
}

export interface PatchMapAssetBackend {
  readonly keyNamespace?: string;
  get(request: PatchMapAssetBackendRequest): unknown;
  load(request: PatchMapAssetBackendRequest): Promise<unknown>;
  describe?(
    request: PatchMapAssetBackendRequest,
    resource: unknown,
  ): Readonly<{
    /** Stable decoded-resource identity, independent from physical Pixi keys. */
    readonly normalizedResourceIdentity: string;
    /** Optional sanitized semantic identity reported by the decoder/fixture. */
    readonly cacheIdentity?: string;
  }>;
  unload(key: string): Promise<void>;
}

export interface PatchMapAssetResponseMetadata {
  readonly mediaType: string;
  readonly encodedBytes: number;
  readonly decodedWidth?: number;
  readonly decodedHeight?: number;
  readonly svgText?: string;
}

export interface PatchMapAssetIngestionDecision {
  readonly accepted: boolean;
  readonly code: 'ASSET_POLICY_REJECTED' | null;
  readonly stage:
    | 'accepted'
    | 'media-type'
    | 'encoded-bytes'
    | 'decoded-size'
    | 'svg-content';
}

export interface PatchMapAssetAcquisition {
  /** Internal coordinator identity used for sharing and ownership. */
  readonly cacheIdentity: string;
  readonly normalizedResourceIdentity: string;
  /** Optional backend-described semantic identity; never used as a coordinator key. */
  readonly describedCacheIdentity?: string;
  readonly resource: unknown;
  release(): Promise<void>;
}

export interface PatchMapAssetRegistrationResult {
  readonly registeredAliases: readonly string[];
  readonly duplicateAliases: readonly string[];
}

export interface PatchMapAssetResourceProbe {
  readonly cacheIdentity: string;
  readonly resourceCount: number;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly ownership: 'patch-map' | 'external' | null;
  readonly state: 'absent' | 'pending' | 'resolved' | 'releasing' | 'cleanup-failed';
  readonly cleanupPending: boolean;
  readonly cleanupRetryOwner: 'runtime' | null;
}

export interface PatchMapAssetRuntimeProbe {
  readonly builtins: Readonly<{ readonly aliases: readonly string[] }>;
  readonly fonts: Readonly<{ readonly weights: readonly number[] }>;
  readonly aliasCount: number;
  readonly resourceCount: number;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly cleanupPendingCount: number;
  readonly resource: PatchMapAssetResourceProbe | null;
}

export interface PatchMapAssetSessionProbe {
  readonly instanceId: string;
  readonly destroyed: boolean;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly acquisitionCount: number;
  readonly cleanupPendingCount: number;
}
