export const PATCH_MAP_OPERATIONS_REVISION = 'patch-map-operations/1' as const;
export const PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION =
  'patch-map-runtime-diagnostics/1' as const;
export const PATCH_MAP_EXTRACTION_SECURITY_REVISION =
  'patch-map-extraction-security/1' as const;

export interface PatchMapOperationsRevisionStamp {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly viewRevision: number;
  readonly interactionRevision: number;
}

export interface PatchMapOperationalDiagnosticInput {
  readonly code: string;
  readonly category: string;
  readonly operation: string;
  readonly lifecycleGeneration?: number;
  readonly sceneRevision?: number;
  readonly revisionStamp?: PatchMapOperationsRevisionStamp;
  readonly logicalId?: string | null;
  readonly recoverable?: boolean;
  readonly retryable?: boolean;
  readonly appliedCount?: number;
  readonly missingCount?: number;
  readonly unchangedCount?: number;
  readonly details?: unknown;
}

export interface PatchMapSanitizedDiagnostic {
  readonly code: string;
  readonly category: string;
  readonly operation: string;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly revisionStamp: PatchMapOperationsRevisionStamp;
  readonly logicalId: string | null;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly unchangedCount: number;
  readonly sanitizedHash: string;
}

export interface PatchMapOperationalEventInput {
  readonly type: string;
  readonly operation: string;
  readonly revisionStamp: PatchMapOperationsRevisionStamp;
  readonly logicalId?: string | null;
  readonly counts?: Readonly<Record<string, number>>;
  readonly details?: unknown;
}

export interface PatchMapOperationalEvent {
  readonly type: string;
  readonly operation: string;
  readonly revisionStamp: PatchMapOperationsRevisionStamp;
  readonly logicalId: string | null;
  readonly counts: Readonly<Record<string, number>>;
  readonly sanitizedHash: string;
}

export interface PatchMapOperationalCallbackControl {
  enqueue(id: string, action: () => void): void;
}

export type PatchMapOperationalCallback = (
  event: PatchMapOperationalEvent,
  control: PatchMapOperationalCallbackControl,
) => void;

export interface PatchMapOperationalSubscription {
  readonly id: string;
  dispose(): boolean;
}

export interface PatchMapOperationalDispatchResult {
  readonly deliveredCount: number;
  readonly callbackFailureCount: number;
  readonly queuedActionCount: number;
  readonly queuedActionFailureCount: number;
}

export interface PatchMapRuntimeDiagnosticsState {
  readonly instanceId: string | null;
  readonly lifecycle: string;
  readonly backend: Readonly<{
    readonly kind: string | null;
    readonly lossState: string;
  }>;
  readonly revisions: PatchMapOperationsRevisionStamp;
  readonly counts: Readonly<{
    readonly roots: number;
    readonly elements: number;
    readonly components: number;
    readonly materialized: number;
    readonly text: number;
    readonly relations: number;
  }>;
  readonly activeWork: Readonly<{
    readonly gestures: number;
    readonly animations: number;
    readonly pendingAssets: number;
    readonly pendingWork: number;
  }>;
  readonly resources: Readonly<{
    readonly canvases: number;
    readonly listeners: number;
    readonly observers: number;
    readonly tickers: number;
    readonly textureLeases: number;
    readonly callbackRegistrations: number;
  }>;
  readonly cleanup: Readonly<{
    readonly destroyed: boolean;
    readonly released: boolean;
  }>;
}

export interface PatchMapRuntimeDiagnosticRecord extends PatchMapRuntimeDiagnosticsState {
  readonly package: Readonly<{
    readonly version: string;
    readonly digest: string | null;
  }>;
  readonly sequence: number;
  readonly lastAction: Readonly<{
    readonly operation: string;
    readonly status: 'completed' | 'failed';
  }> | null;
  readonly lastError: PatchMapSanitizedDiagnostic | null;
}

export interface PatchMapRuntimeDiagnosticsSnapshot {
  readonly revision: typeof PATCH_MAP_RUNTIME_DIAGNOSTICS_REVISION;
  readonly enabled: boolean;
  readonly capacity: number;
  readonly records: readonly PatchMapRuntimeDiagnosticRecord[];
  readonly current: PatchMapRuntimeDiagnosticRecord | null;
}

export interface PatchMapOperationsProbe {
  readonly revision: typeof PATCH_MAP_OPERATIONS_REVISION;
  readonly collectionEnabled: boolean;
  readonly telemetryEnabled: boolean;
  readonly capacity: number;
  readonly recordCount: number;
  readonly diagnosticObserverCount: number;
  readonly telemetryObserverCount: number;
  readonly callbackRegistrations: number;
  readonly queuedActionCount: number;
  readonly disposed: boolean;
  readonly lastCallbackFailure: PatchMapSanitizedDiagnostic | null;
}

export interface PatchMapOperationsAuthorityOptions {
  readonly collectionEnabled?: boolean;
  readonly telemetryEnabled?: boolean;
  readonly capacity?: number;
  readonly instanceId?: string;
  readonly packageVersion?: string;
  readonly packageDigest?: string | null;
  readonly logger?: (diagnostic: PatchMapSanitizedDiagnostic) => void;
}

export type PatchMapExtractionReadability =
  | 'readable'
  | 'tainted'
  | 'readback-failed';

export interface PatchMapExtractionSecurityProbe {
  readonly revision: typeof PATCH_MAP_EXTRACTION_SECURITY_REVISION;
  readonly trackedAssetCount: number;
  readonly unreadableAssetCount: number;
  readonly code: 'EXTRACTION_TAINTED' | 'EXTRACTION_READBACK_FAILED' | null;
  readonly sanitizedAssetId: string | null;
}
