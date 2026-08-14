import type {
  PatchMapAssetPolicy,
  PatchMapAssetRegistration,
  PatchMapAssetRuntime,
  PatchMapAssetSessionProbe,
} from '../../assets';
import type {
  PatchMapExtractionSecurityAuthority,
  PatchMapOperationsAuthority,
} from '../../operations';
import type { PatchMapPresentationPolicyProductProbe } from '../../presentation-policy';
import type { PatchMapInteractionMode } from '../../host-interaction';
import type { PatchMapEngineSurfaceFactory } from '../contracts';
import type {
  PatchMapEngineDiagnostic,
  PatchMapLifecycle,
  PatchMapPublishedTuple,
  PatchMapRevisionStamp,
} from './lifecycle';
import type { PatchMapViewportState } from './viewport';
import type { PatchMapColorTheme } from '../../semantic/color';

export interface PatchMapEngineOptions {
  readonly surfaceFactory?: PatchMapEngineSurfaceFactory;
  readonly assetRuntime?: PatchMapAssetRuntime;
  readonly assetPolicy?: PatchMapAssetPolicy;
  readonly historyLimit?: number;
  readonly operations?: PatchMapOperationsAuthority;
  readonly extractionSecurity?: PatchMapExtractionSecurityAuthority;
}

export interface PatchMapInitializeOptions {
  readonly instanceId: string;
  readonly theme?: PatchMapColorTheme;
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio?: number;
  readonly antialias?: boolean;
  readonly background?: number | string;
  readonly zoomLimits?: readonly [number, number];
  readonly wheelActivationModifier?: 'none' | 'control';
  readonly strategy?: 'mesh' | 'particle';
  readonly preference?: 'webgl' | 'webgpu';
  /** Normative backend request. WebGL1 is an explicit unsupported fixture. */
  readonly backend?: 'webgl2' | 'webgpu' | 'webgl1';
  /** Opt-in official PixiJS DevTools Application registration. */
  readonly devtools?: boolean;
  readonly powerPreference?: 'high-performance' | 'low-power';
  readonly requiredAssets?: readonly PatchMapAssetRegistration[];
}

export interface PatchMapInitializeResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly instanceId: string;
  readonly revisions: PatchMapRevisionStamp;
  readonly facilities: readonly string[];
}

export interface PatchMapLoadOptions {
  readonly datasetRef?: string;
  /**
   * Reject dangling relation endpoints before publication. Omitted/false keeps
   * compatibility projection behavior and reports dangling paths as omitted.
   */
  readonly strict?: boolean;
}

export interface PatchMapEngineLoadResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly sceneRevision: number;
  readonly semanticHash: string;
  readonly rootIds: readonly string[];
}

export type PatchMapEnginePrepareResult = Readonly<
  | {
      readonly status: 'prepared';
      readonly storeSyncMs: number;
      readonly gpuPrepareMs: number;
      readonly revisions: PatchMapRevisionStamp;
      readonly publishedTuple: PatchMapPublishedTuple;
    }
  | {
      readonly status: 'unsupported';
      readonly storeSyncMs: null;
      readonly gpuPrepareMs: null;
      readonly revisions: PatchMapRevisionStamp;
      readonly publishedTuple: PatchMapPublishedTuple;
    }
>;

export interface PatchMapDatasetSubmission {
  readonly requestId: string;
  readonly datasetRef?: string;
  readonly sourceRevision?: number;
  readonly input: Promise<unknown>;
  /** Per-request temporary-resource disposer; invoked exactly once. */
  readonly release?: (
    result: PatchMapDatasetSubmissionResult,
  ) => void | Promise<void>;
}

export type PatchMapDatasetSubmissionResult =
  | Readonly<{
      status: 'committed';
      requestId: string;
      sourceRevision?: number;
      sceneRevision: number;
      semanticHash: string;
    }>
  | Readonly<{
      status: 'superseded';
      requestId: string;
      sourceRevision?: number;
      diagnostic: PatchMapEngineDiagnostic;
    }>
  | Readonly<{
      status: 'rejected';
      requestId: string;
      sourceRevision?: number;
      diagnostic: PatchMapEngineDiagnostic;
    }>;

export interface PatchMapEnginePresentationResult {
  readonly changed: boolean;
  readonly publication: 'pending' | 'current';
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
  readonly policy: PatchMapPresentationPolicyProductProbe;
}

export interface PatchMapExternalDependencyResult {
  readonly changed: boolean;
  readonly dependencyId: string;
  readonly previousRevision: string | null;
  readonly revision: string;
}

export interface PatchMapEngineSnapshot {
  readonly lifecycle: PatchMapLifecycle;
  readonly instanceId: string | null;
  readonly revisions: PatchMapRevisionStamp;
  readonly publishedTuple: PatchMapPublishedTuple;
  readonly frameRevision: number;
  readonly datasetRef: string | null;
  readonly semanticHash: string | null;
  readonly rootIds: readonly string[];
  readonly historyDepth: number;
  readonly pendingWork: number;
  readonly zoomLimits: readonly [number, number];
  readonly viewport: PatchMapViewportState;
  readonly selectionIds: readonly string[];
  readonly interaction: Readonly<{
    readonly mode: PatchMapInteractionMode;
    readonly staleGestureCount: number;
  }>;
  readonly facilities: readonly string[];
  readonly resources: Readonly<{
    canvasCount: number;
    canvas: Readonly<{
      cssSize: readonly [number, number];
      backingSize: readonly [number, number];
    }>;
    renderer: Readonly<{
      resolution: number;
      antialias: boolean;
      background: string;
      backend: 'webgl' | 'webgpu';
    }> | null;
    rendering: Readonly<{
      commandCount: number | null;
      visiblePrimitiveCount: number | null;
    }>;
    assets: PatchMapAssetSessionProbe | null;
    subscriptions: Readonly<{ active: number; duplicates: 0 }>;
  }>;
}
