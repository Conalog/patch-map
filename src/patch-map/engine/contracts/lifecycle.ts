import type {
  PatchMapPresentationLifecycleResult,
} from '../../core/contracts';
import type {
  PatchMapDocumentVisibilityState,
  PatchMapPageLifecycleProbe,
  PatchMapPageLifecycleTransition,
  PatchMapPageLifecycleWorkKind,
  PATCH_MAP_PAGE_LIFECYCLE_REVISION,
} from '../../page-lifecycle';

export type PatchMapLifecycle =
  | 'new'
  | 'initializing'
  | 'ready-empty'
  | 'scene-ready'
  | 'destroying'
  | 'destroyed';

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

export interface PatchMapEngineDiagnostic {
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

export interface PatchMapRevisionStamp {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly viewRevision: number;
  readonly interactionRevision: number;
}

export interface PatchMapPublishedTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export interface PatchMapEnginePageLifecycleWorkInput {
  readonly kind: PatchMapPageLifecycleWorkKind;
  readonly requestId: string;
}

export interface PatchMapEngineDocumentVisibilityInput {
  readonly state: PatchMapDocumentVisibilityState;
  readonly timeMs: number;
}

export interface PatchMapEnginePageLifecycleProbe extends PatchMapPageLifecycleProbe {
  readonly activeAnimationCount: number;
  readonly decelerationActive: boolean;
  readonly activeGestureCount: number;
  readonly pointerCaptureCount: number;
}

export interface PatchMapEngineDocumentVisibilityResult {
  readonly schemaRevision: typeof PATCH_MAP_PAGE_LIFECYCLE_REVISION;
  readonly transition: PatchMapPageLifecycleTransition;
  readonly presentation: PatchMapPresentationLifecycleResult | null;
  readonly probe: PatchMapEnginePageLifecycleProbe;
}
