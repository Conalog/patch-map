import type {
  CommitResult,
  CoreSceneOptions,
  CoreView,
  FrameReport,
  LoadResult,
  SlotRange,
} from '../dense/contracts';
import type {
  ParsePatchMapOptions,
  ParsePatchMapResult,
  PatchMapComponentRenderRole,
  PatchMapEntityProjection,
  PatchMapTextProjection,
} from '../contracts';
import type { PatchMapDirectElementAngleParseUpdate } from '../incremental-parser';
import type { PatchMapPresentationSnapshot } from '../presentation';
import type {
  PatchMapPixiRendererOptions,
} from '../renderers/pixi-renderer';
import type {
  PatchMapEntityPaintProbe,
  PatchMapPixiRendererDebug,
  PatchMapRenderLaneSnapshot,
  PatchMapTextAttachedSignatures,
  PatchMapTextRendererKind,
  PatchMapTextRendererProbe,
  PatchMapTextSemanticSignatures,
  PatchMapWorldOrientation,
  RootPointerInput,
} from '../renderers/types';
import type {
  PatchMapSceneImageProductProbe,
} from '../scene-images';
import type { FrameSchedulerDebug } from '../scheduler';
import type { PatchMapBoundsTuple } from '../semantic/geometry';
import type {
  PatchMapDenseReconcilePlan,
  PatchMapReconcileOptions as PatchMapDenseReconcileOptions,
} from '../semantic/reconcile';

export interface PatchMapRuntimeOptions extends PatchMapPixiRendererOptions, CoreSceneOptions {
  readonly parse?: ParsePatchMapOptions;
  /** Schedule one invalidation frame after mutations. Defaults to true. */
  readonly autoRender?: boolean;
  /** Defer semantic selection to an Engine-owned click authority. */
  readonly rootSelectionMode?: 'immediate' | 'deferred';
  /**
   * Engine-owned surface optimization. Public Core/parser callers retain
   * deeply frozen plain projection records.
   */
  readonly internalStableRecordOverlays?: boolean;
  /** Product-owned frame-loop wake-up for async resource completion. */
  readonly requestFrame?: () => void;
  /** Internal owner notification when load publication can no longer be proven coherent. */
  readonly onTerminalFailure?: (error: Error) => void;
}

export type PatchMapRootViewportChangeSource =
  | 'pointer'
  | 'middle-pointer'
  | 'wheel';

export interface PatchMapRootViewportChange {
  readonly source: PatchMapRootViewportChangeSource;
  readonly view: CoreView;
}

export type PatchMapRootPointerInput = RootPointerInput;

export interface PatchMapSemanticRefreshResult {
  readonly changed: boolean;
  readonly recomputedTargets: readonly string[];
  readonly missingTargets: readonly string[];
  readonly dirtyRanges: readonly SlotRange[];
  readonly dataDiffCount: 0;
}

export interface PatchMapSemanticRefreshOptions {
  readonly strict?: boolean;
}

export interface PatchMapTransientProjectionResult {
  readonly changed: boolean;
  readonly entityIds: readonly string[];
  readonly dirtyRanges: readonly SlotRange[];
}

export interface PatchMapSelectionOverlayPolicyInput {
  readonly visibleIds: readonly string[] | null;
  readonly transformableIds: readonly string[] | null;
  readonly resizableIds: readonly string[] | null;
  readonly hidden: boolean;
  readonly handleCssPx: number;
  readonly strokeCssPx: number;
}

export interface PatchMapLoadResult {
  readonly parse: ParsePatchMapResult;
  readonly store: LoadResult;
  readonly normalizeMs: number;
  readonly storeLoadMs: number;
}

export interface PatchMapPrepareResult {
  readonly storeSyncMs: number;
  readonly gpuPrepareMs: number;
  readonly frame: FrameReport;
}

export interface PatchMapWorldTransform extends PatchMapWorldOrientation {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface PatchMapReconcileOptions extends PatchMapDenseReconcileOptions {
  /** Parser/color options for the candidate input. Defaults to the Core options. */
  readonly parse?: ParsePatchMapOptions;
  /**
   * Animate changed bar destinations. Engine callers disable this for
   * ancestor/layout transactions so dependent geometry publishes atomically.
   * Direct Core callers retain the animated default.
   */
  readonly animateBarChanges?: boolean;
  /** Limit animation to direct owner-qualified bar mutations. */
  readonly animatedBarTargets?: readonly PatchMapComponentVisualTarget[];
  /** Permit authoritative component order changes for these semantic item owners. */
  readonly allowedComponentOrderOwners?: readonly string[];
  /** Permit explicit hierarchy operations to reorder these semantic element subtrees. */
  readonly allowedElementOrderIds?: readonly string[];
  /**
   * Engine-owned flat top-level roots changed by one already-staged immutable
   * transaction. Unsupported shapes fall back to the canonical full parser.
   */
  readonly incrementalRootIds?: readonly string[];
  /**
   * The Engine has staged an owned top-level structural edit whose unchanged
   * roots retain identity. The guarded parser may reuse those roots; any
   * hierarchy, relation, diagnostic, or ownership ambiguity falls back to the
   * canonical full parser.
   */
  readonly structuralSharing?: boolean;
  /**
   * Engine-validated numeric height-only bar mutations. This is an internal
   * parse acceleration hint; unsupported ownership or geometry falls back to
   * the canonical parser before any dense state is published.
   */
  readonly directBarHeightUpdates?: readonly PatchMapDirectBarHeightUpdate[];
  /**
   * Engine-validated component text replacements. The guarded parser updates
   * only those text entities and falls back whenever exact diagnostics or
   * identity cannot be preserved.
   */
  readonly directTextUpdates?: readonly PatchMapDirectTextUpdate[];
  /**
   * Engine-validated absolute angles on flat top-level roots. The guarded
   * projection path applies one affine delta to already canonical component
   * geometry and falls back before publication on any ambiguity.
   */
  readonly directElementAngleUpdates?: readonly PatchMapDirectElementAngleUpdate[];
}

export interface PatchMapDirectBarHeightUpdate extends PatchMapComponentVisualTarget {
  readonly height: number;
}

export interface PatchMapDirectTextUpdate extends PatchMapComponentVisualTarget {
  readonly text: string;
}

export type PatchMapDirectElementAngleUpdate =
  PatchMapDirectElementAngleParseUpdate;

export interface PatchMapReconcileTimings {
  readonly parseMs: number;
  readonly planMs: number;
  readonly commitMs: number;
  readonly totalMs: number;
}

export interface PatchMapReconcileFacts {
  /** The parser-visible PATCH MAP authority changed, including retained-only identity data. */
  readonly semanticChanged: boolean;
  /** At least one dense entity, visibility, or view operation was planned. */
  readonly denseChanged: boolean;
  readonly structuralChanged: boolean;
  readonly structuralReplacement: boolean;
  /** The current aggregate renderer consumes structural changed ranges without a full rebuild. */
  readonly fullRebuild: false;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly entityCountBefore: number;
  readonly entityCountAfter: number;
  readonly selectionCountBefore: number;
  readonly selectionCountAfter: number;
}

interface PatchMapReconcileResultBase {
  readonly parse: ParsePatchMapResult;
  readonly plan: PatchMapDenseReconcilePlan;
  readonly timings: PatchMapReconcileTimings;
  readonly facts: PatchMapReconcileFacts;
}

export type PatchMapReconcileResult =
  | Readonly<PatchMapReconcileResultBase & {
      readonly status: 'committed';
      readonly commit: CommitResult;
    }>
  | Readonly<PatchMapReconcileResultBase & {
      readonly status: 'refused';
      readonly commit: null;
    }>;

export interface PatchMapRuntimeDebug {
  readonly destroyed: boolean;
  readonly suspended: boolean;
  readonly entityCount: number;
  readonly activeAnimations: number;
  readonly activeGestureCount: number;
  readonly selectionCount: number;
  readonly diagnostics: number;
  readonly renderer: PatchMapPixiRendererDebug;
  readonly scheduler: FrameSchedulerDebug;
}

export interface PatchMapPresentationLifecycleResult {
  readonly state: 'suspended' | 'running';
  readonly timeMs: number;
  readonly settledCount: number;
  readonly activeAnimationCount: number;
}

export interface PatchMapComponentVisualTarget {
  readonly ownerId: string;
  readonly componentId: string;
}

/** A concrete item or expanded grid-cell component address. */
export interface PatchMapInstanceBarTarget {
  readonly id: string;
  readonly componentId: string;
}

export type PatchMapInstancePresentationComponentType = 'bar' | 'icon';

export interface PatchMapInstancePresentationColumns {
  readonly targets: readonly PatchMapInstanceBarTarget[];
  /** `null` restores the authored field. */
  readonly tint?: ArrayLike<unknown>;
  /** `null` restores the authored field. */
  readonly source?: ArrayLike<unknown>;
  /** `null` restores the authored field. */
  readonly show?: ArrayLike<boolean | null>;
}

export interface PatchMapInstanceBarPresentationColumns
  extends PatchMapInstancePresentationColumns {
  /** `null` restores the authored height. */
  readonly height?: ArrayLike<number | null>;
}

/**
 * Runtime-only bar destinations for concrete item instances. Numeric entries
 * replace the renderer-visible destination; `null` restores the authored
 * template value. The caller's PATCH MAP dataset and semantic history remain
 * untouched.
 */
export interface PatchMapInstanceBarHeightBatchRequest {
  /** Legacy internal height-only shape retained for existing verification tools. */
  readonly targets?: readonly PatchMapInstanceBarTarget[];
  readonly heights?: ArrayLike<number | null>;
  readonly bar?: PatchMapInstanceBarPresentationColumns;
  readonly icon?: PatchMapInstancePresentationColumns;
  readonly animate?: boolean;
}

export interface PatchMapInstanceBarHeightBatchResult {
  readonly changed: boolean;
  readonly appliedTargets: readonly PatchMapInstanceBarTarget[];
  readonly missingTargets: readonly PatchMapInstanceBarTarget[];
  readonly dirtyRanges: readonly SlotRange[];
  readonly activeAnimationCount: number;
  readonly overlayCount: number;
}

export interface PatchMapComponentVisualGeometryProbe {
  readonly localBounds: PatchMapBoundsTuple;
  readonly worldBounds: PatchMapBoundsTuple;
  readonly visibleBounds: PatchMapBoundsTuple | null;
  readonly visible: boolean;
  readonly interactive: boolean;
}

/**
 * O(1), Pixi-object-free component observation assembled from the parser,
 * dense store, scene-image controller, and fixed renderer probe indexes.
 */
export interface PatchMapComponentVisualProductProbe {
  readonly target: PatchMapComponentVisualTarget;
  /** Semantic owner in the detached PATCH MAP graph (differs for expanded grids). */
  readonly semanticOwnerId: string;
  readonly entityId: string;
  readonly logicalIdentity: string;
  readonly componentType: string;
  readonly renderRole: PatchMapComponentRenderRole;
  readonly entityKind: string;
  readonly geometry: PatchMapComponentVisualGeometryProbe;
  readonly publication: Readonly<{
    /** Renderer/image facts are withheld until one successful aggregate flush. */
    readonly rendererFacts: 'current' | 'pending';
  }>;
  readonly image: PatchMapSceneImageProductProbe | null;
  readonly rendererPaint: PatchMapEntityPaintProbe | null;
  readonly renderLanes: PatchMapRenderLaneSnapshot | null;
}

export interface PatchMapBarPresentationProductProbe {
  readonly target: PatchMapComponentVisualTarget;
  readonly entityId: string;
  readonly policy: Readonly<{
    readonly enabled: boolean;
    readonly durationMs: number;
  }>;
  readonly semanticHeight: number;
  readonly presentationHeight: number;
  readonly active: boolean;
  readonly startHeight: number;
  readonly destinationHeight: number;
  readonly startTimeMs: number | null;
  readonly controller: PatchMapPresentationSnapshot;
  readonly ghostPublicationCount: number;
}

export type PatchMapTextTarget =
  | Readonly<{ readonly kind: 'element'; readonly id: string }>
  | Readonly<{
      readonly kind: 'component';
      readonly ownerId: string;
      readonly id: string;
    }>;

export interface PatchMapTextGeometryProbe {
  readonly localBounds: PatchMapBoundsTuple;
  readonly ownerLocalBounds: PatchMapBoundsTuple;
  readonly worldBounds: PatchMapBoundsTuple;
  /** Same affine geometry authority consumed by transformed hit testing. */
  readonly hitBounds: PatchMapBoundsTuple;
  readonly visibleBounds: PatchMapBoundsTuple | null;
}

export interface PatchMapTextStateProbe {
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly zIndex: number;
  readonly opacity: number;
}

export interface PatchMapTextTransformProbe {
  readonly affine: PatchMapEntityProjection['affine'];
  readonly worldBasis: PatchMapEntityProjection['worldBasis'];
  readonly visibleCenter: PatchMapEntityProjection['visibleCenter'];
  readonly rotationDegrees: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly contentOrientation: PatchMapEntityProjection['contentOrientation'];
}

export type PatchMapTextProductPublicationStatus = 'absent' | 'pending' | 'current';

/** Pixi-object-free renderer facts correlated against the current text sidecar. */
export interface PatchMapTextRendererProductProbe {
  readonly semanticRoute: PatchMapTextProjection['rendererRoute'];
  readonly route: PatchMapTextRendererProbe['route'] | null;
  readonly rendererKind: PatchMapTextRendererKind;
  readonly routeReason: PatchMapTextRendererProbe['routeReason'];
  readonly objectCount: 0 | 1;
  readonly semanticSignatures: PatchMapTextSemanticSignatures;
  readonly attachedSignatures: PatchMapTextAttachedSignatures | null;
  readonly lastRenderedSignatures: PatchMapTextAttachedSignatures | null;
  readonly lastRenderedFrame: number | null;
  readonly staleGlyphCount: number;
}

/**
 * Constant-time text observation assembled from immutable parser projections,
 * the dense ID index, and the renderer's detached entity probe index.
 */
export interface PatchMapTextProductProbe {
  readonly target: PatchMapTextTarget;
  /** Source item/grid owner; differs from an expanded grid instance target. */
  readonly semanticOwnerId: string;
  readonly entityId: string;
  readonly semantic: PatchMapTextProjection;
  readonly geometry: PatchMapTextGeometryProbe;
  readonly state: PatchMapTextStateProbe;
  readonly transform: PatchMapTextTransformProbe;
  readonly renderer: PatchMapTextRendererProductProbe;
  readonly rendererPaint: PatchMapEntityPaintProbe | null;
  readonly renderLanes: PatchMapRenderLaneSnapshot | null;
  readonly publication: Readonly<{
    readonly status: PatchMapTextProductPublicationStatus;
    readonly sceneRevision: number;
    readonly renderedSceneRevision: number | null;
    readonly rendererFrame: number | null;
  }>;
}

export interface AnimateBarsOptions {
  readonly seed?: number;
  readonly fraction?: number;
  readonly durationMs?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
  /**
   * Absolute authored percentage range, resolved against each bar's own
   * parser-owned percentage reference. Cannot be mixed with scale options.
   */
  readonly minPercent?: number;
  readonly maxPercent?: number;
}

export function normalizePatchMapComponentVisualTarget(
  target: unknown,
): PatchMapComponentVisualTarget {
  if (target === null || typeof target !== 'object') {
    throw new TypeError('component visual target must be an object');
  }
  const record = target as Readonly<Record<string, unknown>>;
  if (typeof record.ownerId !== 'string' || record.ownerId.length === 0) {
    throw new TypeError('component visual target ownerId must be a non-empty string');
  }
  if (typeof record.componentId !== 'string' || record.componentId.length === 0) {
    throw new TypeError('component visual target componentId must be a non-empty string');
  }
  return Object.freeze({ ownerId: record.ownerId, componentId: record.componentId });
}

export function normalizePatchMapInstanceBarTarget(
  target: unknown,
): PatchMapInstanceBarTarget {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('instance bar target must be an object');
  }
  const record = target as Readonly<Record<string, unknown>>;
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new TypeError('instance bar target id must be a non-empty string');
  }
  if (typeof record.componentId !== 'string' || record.componentId.length === 0) {
    throw new TypeError('instance bar target componentId must be a non-empty string');
  }
  return Object.freeze({ id: record.id, componentId: record.componentId });
}

export function normalizePatchMapTextTarget(target: PatchMapTextTarget): PatchMapTextTarget {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('text target must be an object');
  }
  if (target.kind === 'element') {
    assertExactTextTargetKeys(target, ['kind', 'id']);
    assertTextTargetId(target.id, 'text target id');
    return Object.freeze({ kind: 'element', id: target.id });
  }
  if (target.kind === 'component') {
    assertExactTextTargetKeys(target, ['kind', 'ownerId', 'id']);
    assertTextTargetId(target.ownerId, 'text target ownerId');
    assertTextTargetId(target.id, 'text target id');
    return Object.freeze({ kind: 'component', ownerId: target.ownerId, id: target.id });
  }
  throw new TypeError('text target kind must be "element" or "component"');
}

function assertExactTextTargetKeys(
  target: object,
  expected: readonly string[],
): void {
  const keys = Reflect.ownKeys(target);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string' || !expected.includes(key))
  ) {
    throw new TypeError(`text target must contain exactly ${expected.join(', ')}`);
  }
}

function assertTextTargetId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}
