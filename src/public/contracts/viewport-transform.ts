import type {
  PatchMapEdgeAutoPanResult,
  PatchMapResizeHandle,
  PatchMapTransformerEditKind,
} from '../../selection-transformer/edit';
import type { PatchMapTargetsInput } from './interaction';
import type { PatchMapRevisionStamp } from './mutation-history-editor';

export interface PatchMapFitOptions {
  readonly padding?: number | readonly [number, number];
  readonly targets?: PatchMapTargetsInput;
}

/** Wheel modifier required before the package consumes and zooms a wheel event. */
export type PatchMapWheelActivationModifier = 'none' | 'control';

export interface PatchMapWheelOptions {
  /** `control` accepts either Ctrl or macOS Command on each wheel event. */
  readonly activationModifier?: PatchMapWheelActivationModifier;
}

/** Root-owned viewport gesture activation for one mounted instance. */
export interface PatchMapViewportOptions {
  readonly wheel?: PatchMapWheelOptions;
  /** Restored after initial data load and takes precedence over `fit`. */
  readonly initial?: PatchMapViewportSnapshot;
}

/** Persistable absolute viewport state in PatchMap world coordinates. */
export interface PatchMapViewportSnapshot {
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
}

export interface PatchMapViewportState extends PatchMapViewportSnapshot {
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
  | 'resize'
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

export interface PatchMapViewportContributor {
  readonly id: string;
  readonly worldBounds: readonly [number, number, number, number];
}

export interface PatchMapViewportFitResult {
  readonly status: 'applied' | 'empty';
  readonly changed: boolean;
  readonly paddingCssPx: readonly [number, number];
  readonly viewport: PatchMapViewportState;
  readonly contributors: readonly PatchMapViewportContributor[];
  readonly applied: readonly string[];
  readonly missing: readonly string[];
  readonly excluded: readonly string[];
  readonly duplicateCount: number;
  readonly worldBounds: readonly [number, number, number, number] | null;
}

export interface PatchMapViewportRestoreResult {
  readonly status: 'restored' | 'fallback:auto-fit';
  readonly changed: boolean;
  readonly viewport: PatchMapViewportState;
  readonly fit: PatchMapViewportFitResult | null;
}

/** Nested or dot-path PixiJS-compatible color values for one mounted instance. */
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
  /** Begin one previewable edit session. Only one session may be active per instance. */
  beginSession(input: PatchMapTransformSessionInput): PatchMapTransformSession;
}

export interface PatchMapTransformSessionInput {
  readonly targets: PatchMapTargetsInput;
  readonly kind: PatchMapTransformerEditKind;
  /** Required for resize; move and rotate use their canonical handles. */
  readonly handle?: PatchMapResizeHandle;
  readonly actionId: string;
}

export type PatchMapTransformSessionPreview =
  | Readonly<{
      readonly kind: 'move';
      readonly delta: readonly [number, number];
      readonly axisLock?: boolean;
    }>
  | Readonly<{
      readonly kind: 'resize';
      readonly delta: readonly [number, number];
      readonly lockAspectRatio?: boolean;
      readonly minSize?: number;
    }>
  | Readonly<{
      readonly kind: 'rotate';
      readonly degrees: number;
      readonly center?: readonly [number, number];
    }>;

export interface PatchMapTransformSessionPreviewResult {
  readonly status: 'previewed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
}

export interface PatchMapTransformSessionCompletionResult {
  readonly status: 'committed' | 'unchanged' | 'refused' | 'stale';
  readonly changed: boolean;
  readonly mutationCount: 0 | 1;
  readonly historyDepthDelta: 0 | 1;
}

export interface PatchMapTransformSessionCancelResult {
  readonly status: 'cancelled' | 'stale';
  readonly cancelled: boolean;
  readonly historyDepthDelta: 0;
}

export interface PatchMapTransformSession {
  preview(change: PatchMapTransformSessionPreview): PatchMapTransformSessionPreviewResult;
  edgePan(
    pointerScreen: readonly [number, number],
    deltaCss: readonly [number, number],
  ): PatchMapEdgeAutoPanResult;
  commit(): PatchMapTransformSessionCompletionResult;
  cancel(): PatchMapTransformSessionCancelResult;
}

export interface PatchMapTransformResult {
  readonly status: 'planned' | 'committed' | 'unchanged' | 'rejected' | 'refused';
  readonly changed: boolean;
  readonly historyDepthDelta: number;
}

export interface PatchMapViewportApi {
  fit(options?: PatchMapFitOptions): PatchMapViewportFitResult;
  reset(options?: PatchMapFitOptions): PatchMapViewportRestoreResult;
  panBy(delta: readonly [number, number]): PatchMapViewportChangeResult;
  zoomBy(factor: number, anchor?: readonly [number, number]): PatchMapViewportChangeResult;
  resize(width: number, height: number, pixelRatio?: number): boolean;
  snapshot(): PatchMapViewportSnapshot;
  restore(snapshot: PatchMapViewportSnapshot): PatchMapViewportChangeResult;
  /** Coalesced once after a burst of pointer, wheel, fit, restore, or resize changes. */
  onSettled(listener: (state: PatchMapViewportState) => void): () => void;
  readonly state: PatchMapViewportState;
}
