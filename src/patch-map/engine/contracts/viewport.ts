import type {
  PatchMapViewportContributorResult,
  PatchMapViewportPolicy,
  PATCH_MAP_VIEWPORT_REVISION,
} from '../../viewport';
import type { PatchMapRevisionStamp } from './lifecycle';

export interface PatchMapViewportState {
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
  readonly screenBounds: readonly [number, number, number, number];
}

export type PatchMapViewportChangeSource =
  | 'programmatic'
  | 'pointer'
  | 'middle-pointer'
  | 'modifier-wheel'
  | 'wheel'
  | 'pinch'
  | 'deceleration'
  | 'focus'
  | 'fit'
  | 'restore'
  | 'fallback-fit';

export interface PatchMapViewportChangeResult {
  readonly changed: boolean;
  readonly blocked: boolean;
  readonly source: PatchMapViewportChangeSource;
  readonly previous: PatchMapViewportState;
  readonly viewport: PatchMapViewportState;
  readonly previousRevisions: PatchMapRevisionStamp;
  readonly revisions: PatchMapRevisionStamp;
}

export interface PatchMapSerializedViewportState {
  readonly schemaRevision: typeof PATCH_MAP_VIEWPORT_REVISION;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
}

export interface PatchMapViewportPersistenceProbe {
  readonly settledPublicationCount: number;
  readonly persistenceWriteCount: number;
  readonly equivalentSaveCount: 0;
  readonly suppressedEquivalentSaveCount: number;
  readonly settled: boolean;
  readonly serialized: PatchMapSerializedViewportState | null;
}

export interface PatchMapViewportSettleResult {
  readonly changed: boolean;
  readonly viewport: PatchMapViewportState;
  readonly publicationCount: number;
  readonly persistence: PatchMapViewportPersistenceProbe;
}

export interface PatchMapViewportRestoreResult {
  readonly status: 'restored' | 'fallback:auto-fit';
  readonly changed: boolean;
  readonly viewport: PatchMapViewportState;
  readonly fit: PatchMapViewportFitResult | null;
}

export interface PatchMapViewportTargetOptions {
  readonly targets?: readonly string[] | null;
  readonly rejectIds?: readonly string[];
  readonly relationEndpointsAvailable?: boolean;
}

export interface PatchMapViewportFocusResult extends PatchMapViewportContributorResult {
  readonly status: 'applied' | 'empty';
  readonly changed: boolean;
  readonly viewport: PatchMapViewportState;
}

export interface PatchMapViewportFitOptions extends PatchMapViewportTargetOptions {
  readonly paddingCssPx?: number | readonly [number, number];
}

export interface PatchMapViewportFitResult extends PatchMapViewportContributorResult {
  readonly status: 'applied' | 'empty';
  readonly changed: boolean;
  readonly paddingCssPx: readonly [number, number];
  readonly viewport: PatchMapViewportState;
}

export type PatchMapViewportPolicyOperation =
  | Readonly<{
      readonly op: 'add' | 'start' | 'stop' | 'remove';
      readonly policy: PatchMapViewportPolicy;
    }>
  | Readonly<{ readonly op: 'temporary'; readonly policy: PatchMapViewportPolicy }>
  | Readonly<{ readonly op: 'restore-temporary' | 'cancel-all' | 'redraw' }>;

export interface PatchMapViewportPolicyProbe {
  readonly schemaRevision: typeof PATCH_MAP_VIEWPORT_REVISION;
  readonly policies: readonly PatchMapViewportPolicy[];
  readonly enabledPolicies: readonly PatchMapViewportPolicy[];
  readonly temporary: boolean;
  readonly callbacksByPolicy: Readonly<Record<PatchMapViewportPolicy, 0 | 1>>;
  readonly resources: Readonly<{
    readonly tickers: 0;
    readonly listeners: 0;
    readonly captures: 0;
    readonly motions: 0 | 1;
    readonly cursors: 0;
  }>;
  readonly destroyed: boolean;
}

export interface PatchMapWorldTransformInput {
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export type PatchMapWorldTransformState = PatchMapWorldTransformInput;

export interface PatchMapViewportTransformProbe {
  readonly schemaRevision: typeof PATCH_MAP_VIEWPORT_REVISION;
  readonly world: PatchMapWorldTransformState;
  readonly pointerTransformRevision: number;
  readonly resizePolicyApplicationCount: number;
  readonly blackFrameCount: number;
  readonly pendingResizeFrame: boolean;
  readonly surface: Readonly<{
    readonly canvasCount: number;
    readonly cssSize: readonly [number, number];
    readonly backingSize: readonly [number, number];
  }>;
}
