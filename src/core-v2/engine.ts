import { createCoreV2, type CoreV2, type CoreV2Options } from './core';
import type { SceneSnapshot } from '../core-v1/contracts';
import type { CoreV2ProjectionIndex } from './contracts';
import {
  coreV2AffineBasis,
  coreV2AffineCorners,
  createCoreV2Affine,
  invertCoreV2Affine,
  multiplyCoreV2Affine,
  type CoreV2AffineBasis,
} from './semantic/geometry';
import {
  relationPathHitScreen,
  resolveCoreV2RelationPath,
} from './semantic/relations';
import {
  CoreV2DatasetError,
  materializeCoreV2Dataset,
  type MaterializedCoreV2Dataset,
  type NormalizedCoreV2Element,
} from './semantic/dataset';
import {
  createCoreV2SemanticProbe,
  type CoreV2SemanticProductProbe,
  type CoreV2SemanticTarget,
} from './semantic/probe';
import {
  applyCoreV2SemanticPatch,
  removeCoreV2SemanticTarget,
  type CoreV2SemanticMutationDiagnostic,
} from './semantic/mutation';
import type { CoreV2ReconcileDiagnostic } from './semantic/reconcile';

export type CoreV2Lifecycle =
  | 'new'
  | 'initializing'
  | 'ready-empty'
  | 'scene-ready'
  | 'destroying'
  | 'destroyed';

export type CoreV2DiagnosticCategory =
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

export interface CoreV2EngineDiagnostic {
  readonly code: string;
  readonly category: CoreV2DiagnosticCategory;
  readonly operation: string;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly revisionStamp: CoreV2RevisionStamp;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly appliedCount: number;
  readonly missingCount: number;
  readonly unchangedCount: number;
  readonly datasetPath?: string;
}

export interface CoreV2RevisionStamp {
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly viewRevision: number;
  readonly interactionRevision: number;
}

export interface CoreV2PublishedTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export interface CoreV2SurfaceOptions {
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly antialias: boolean;
  readonly background: number;
  readonly strategy: 'mesh' | 'particle';
  readonly preference: 'webgl' | 'webgpu';
  readonly powerPreference: 'high-performance' | 'low-power';
}

export interface CoreV2Point {
  readonly x: number;
  readonly y: number;
}

export interface CoreV2ViewportState {
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
  readonly screenBounds: readonly [number, number, number, number];
}

export interface CoreV2WorldTransformInput {
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export type CoreV2WorldTransformState = CoreV2WorldTransformInput;

export interface CoreV2SurfaceView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
}

export interface CoreV2SurfaceDebug {
  readonly cssSize: readonly [number, number];
  readonly backingSize: readonly [number, number];
  readonly selectionIds: readonly string[];
  readonly activeAnimationCount: number;
  /** Public aggregate renderer facts. Injected legacy surfaces may omit them. */
  readonly activeGestureCount?: number;
  readonly renderCommandCount?: number;
  readonly visiblePrimitiveCount?: number;
}

export interface CoreV2SurfaceEntityGeometry {
  readonly id: string;
  readonly kind: string;
  readonly localBounds?: readonly [number, number, number, number];
  readonly worldBounds: readonly [number, number, number, number];
  readonly screenBounds: readonly [number, number, number, number];
  readonly visibleBounds?: readonly [number, number, number, number] | null;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly componentType?: string;
  readonly contentOrientation?: 'follow-item' | 'upright';
  readonly screenBasis?: CoreV2AffineBasis;
  readonly visibleCenter?: readonly [number, number];
  readonly screenAngle?: number;
}

export interface CoreV2SurfaceRelationGeometry {
  readonly id: string;
  readonly relationId?: string;
  readonly key?: string;
  readonly identityKey?: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind?: 'segment' | 'polyline';
  readonly localPoints?: readonly (readonly [number, number])[];
  readonly worldPoints?: readonly (readonly [number, number])[];
  readonly screenPoints?: readonly (readonly [number, number])[];
  readonly worldBounds?: readonly [number, number, number, number];
  readonly screenBounds?: readonly [number, number, number, number];
  readonly visible?: boolean;
  readonly style?: Readonly<{
    readonly color: number;
    readonly colorHex: string;
    readonly width: number;
    readonly opacity: number;
    readonly zIndex: number;
  }>;
  readonly visibleStrokeWidthsCssPx?: readonly number[];
  readonly worldEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  readonly screenEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
}

export interface CoreV2SurfaceOmittedRelationGeometry {
  readonly id: string;
  readonly relationId: string;
  readonly key: string;
  readonly identityKey: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly authoredIndex: number;
  readonly reason: 'missing-source' | 'missing-target' | 'missing-source-and-target';
}

export interface CoreV2SurfaceGeometrySnapshot {
  /** Dense scene revision used to derive the snapshot, when the surface can expose it. */
  readonly revision?: number;
  readonly entities: readonly CoreV2SurfaceEntityGeometry[];
  readonly relations: readonly CoreV2SurfaceRelationGeometry[];
  readonly omittedRelations?: readonly CoreV2SurfaceOmittedRelationGeometry[];
  readonly selectionOverlay: Readonly<{
    screenBounds: readonly [number, number, number, number];
  }> | null;
}

export type CoreV2EngineGeometryProbe = Readonly<
  Omit<CoreV2SurfaceGeometrySnapshot, 'revision'> & {
    /** Null means the injected surface does not publish a geometry revision. */
    readonly revision: number | null;
    /** Null means freshness cannot be established without a surface revision. */
    readonly revisionLag: number | null;
  }
>;

export interface CoreV2EngineRelationProbe {
  readonly revision: number | null;
  readonly revisionLag: number | null;
  readonly relations: readonly CoreV2SurfaceRelationGeometry[];
  readonly omittedRelations: readonly CoreV2SurfaceOmittedRelationGeometry[];
}

export interface CoreV2RelationHitOptions {
  readonly toleranceCssPx?: number;
}

export interface CoreV2RelationHit {
  readonly id: string;
  readonly relationId: string;
  readonly key: string;
  readonly identityKey: string;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface CoreV2RelationHitIndex {
  /** Screen-grid candidates in ascending scene order. */
  readonly cells: ReadonlyMap<string, readonly number[]>;
  /** Oversized paths tested for every query, also in ascending scene order. */
  readonly overflow: readonly number[];
}

export interface CoreV2SurfaceReconcileResult {
  readonly status: 'committed' | 'refused';
  readonly operationCount: number;
  readonly denseChanged: boolean;
  readonly diagnostics: readonly CoreV2ReconcileDiagnostic[];
}

export interface CoreV2EngineSurface {
  readonly canvasCount: number;
  readonly destroyed: boolean;
  load(input: unknown): void;
  /**
   * Atomically reconcile a detached PATCH MAP candidate without replacing the
   * whole dense scene. Older injected surfaces may omit this capability; the
   * Engine then refuses partial mutation instead of falling back to `load`.
   */
  reconcile?(input: unknown): CoreV2SurfaceReconcileResult;
  publishFrame(timeMs: number): void;
  resize(width: number, height: number, pixelRatio: number): boolean;
  setView(view: CoreV2SurfaceView): void;
  select(ids: readonly string[]): void;
  hitTestScreen(point: CoreV2Point): string | null;
  screenToWorld(point: CoreV2Point): CoreV2Point;
  debugSnapshot(): CoreV2SurfaceDebug;
  geometrySnapshot?(): CoreV2SurfaceGeometrySnapshot;
  relationHitTestScreen?(
    point: CoreV2Point,
    options?: CoreV2RelationHitOptions,
  ): CoreV2RelationHit | null;
  destroy(): Promise<boolean>;
}

export type CoreV2EngineSurfaceFactory = (
  options: CoreV2SurfaceOptions,
) => Promise<CoreV2EngineSurface>;

export interface CoreV2EngineOptions {
  readonly surfaceFactory?: CoreV2EngineSurfaceFactory;
}

export interface CoreV2InitializeOptions {
  readonly instanceId: string;
  readonly target?: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio?: number;
  readonly antialias?: boolean;
  readonly background?: number | string;
  readonly zoomLimits?: readonly [number, number];
  readonly strategy?: 'mesh' | 'particle';
  readonly preference?: 'webgl' | 'webgpu';
  readonly powerPreference?: 'high-performance' | 'low-power';
}

export interface CoreV2InitializeResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly instanceId: string;
  readonly revisions: CoreV2RevisionStamp;
  readonly facilities: readonly string[];
}

export interface CoreV2LoadOptions {
  readonly datasetRef?: string;
}

export interface CoreV2EngineLoadResult {
  readonly lifecycle: 'ready-empty' | 'scene-ready';
  readonly sceneRevision: number;
  readonly semanticHash: string;
  readonly rootIds: readonly string[];
}

interface CoreV2EnginePatchResultBase {
  readonly changed: boolean;
  readonly target: CoreV2SemanticTarget | null;
  readonly previousRevisions: CoreV2RevisionStamp;
  readonly revisions: CoreV2RevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly CoreV2SemanticTarget[];
  readonly missing: readonly CoreV2SemanticTarget[];
  readonly unchanged: readonly CoreV2SemanticTarget[];
}

export type CoreV2EnginePatchResult =
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: CoreV2SemanticTarget;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'unchanged';
      readonly changed: false;
      readonly target: CoreV2SemanticTarget;
    }>
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly mutationDiagnostic: CoreV2SemanticMutationDiagnostic;
    }>
  | Readonly<CoreV2EnginePatchResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: CoreV2SemanticTarget;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>;

interface CoreV2EngineDestroyTargetResultBase {
  readonly changed: boolean;
  readonly target: CoreV2SemanticTarget | null;
  readonly previousRevisions: CoreV2RevisionStamp;
  readonly revisions: CoreV2RevisionStamp;
  readonly semanticHash: string | null;
  readonly applied: readonly CoreV2SemanticTarget[];
  readonly missing: readonly CoreV2SemanticTarget[];
  readonly unchanged: readonly CoreV2SemanticTarget[];
}

export type CoreV2EngineDestroyTargetResult =
  | Readonly<CoreV2EngineDestroyTargetResultBase & {
      readonly status: 'committed';
      readonly changed: true;
      readonly target: Extract<CoreV2SemanticTarget, { readonly kind: 'element' }>;
      readonly publication: 'pending';
      readonly denseOperationCount: number;
      readonly denseChanged: boolean;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>
  | Readonly<CoreV2EngineDestroyTargetResultBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly mutationDiagnostic: CoreV2SemanticMutationDiagnostic;
    }>
  | Readonly<CoreV2EngineDestroyTargetResultBase & {
      readonly status: 'refused';
      readonly changed: false;
      readonly target: Extract<CoreV2SemanticTarget, { readonly kind: 'element' }>;
      readonly diagnostic: CoreV2EngineDiagnostic;
      readonly reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[];
    }>;

export interface CoreV2DatasetSubmission {
  readonly requestId: string;
  readonly datasetRef?: string;
  readonly input: Promise<unknown>;
}

export type CoreV2DatasetSubmissionResult =
  | Readonly<{
      status: 'committed';
      requestId: string;
      sceneRevision: number;
      semanticHash: string;
    }>
  | Readonly<{ status: 'superseded'; requestId: string; diagnostic: CoreV2EngineDiagnostic }>
  | Readonly<{ status: 'rejected'; requestId: string; diagnostic: CoreV2EngineDiagnostic }>;

export interface CoreV2EngineSnapshot {
  readonly lifecycle: CoreV2Lifecycle;
  readonly instanceId: string | null;
  readonly revisions: CoreV2RevisionStamp;
  readonly publishedTuple: CoreV2PublishedTuple;
  readonly frameRevision: number;
  readonly datasetRef: string | null;
  readonly semanticHash: string | null;
  readonly rootIds: readonly string[];
  readonly historyDepth: number;
  readonly pendingWork: number;
  readonly zoomLimits: readonly [number, number];
  readonly viewport: CoreV2ViewportState;
  readonly selectionIds: readonly string[];
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
    subscriptions: Readonly<{ active: number; duplicates: 0 }>;
  }>;
}

type CoreV2EngineEventMap = {
  readonly ready: CoreV2InitializeResult;
  readonly sceneCommitted: CoreV2EngineLoadResult;
  readonly drawComplete: Readonly<{
    requestId: string;
    sceneRevision: number;
    semanticHash: string;
    datasetRef: string | null;
  }>;
  readonly frame: Readonly<{
    frameRevision: number;
    publishedTuple: CoreV2PublishedTuple;
  }>;
  readonly change: Extract<CoreV2EnginePatchResult, { readonly status: 'committed' }>;
  readonly targetDestroyed: Extract<
    CoreV2EngineDestroyTargetResult,
    { readonly status: 'committed' }
  >;
  readonly diagnostic: CoreV2EngineDiagnostic;
  readonly destroyed: Readonly<{ lifecycleGeneration: number }>;
};

type CoreV2EngineEvent = keyof CoreV2EngineEventMap;
type CoreV2EngineListener<K extends CoreV2EngineEvent> = (event: CoreV2EngineEventMap[K]) => void;

const DEFAULT_ZOOM_LIMITS = Object.freeze([0.5, 30] as const);
const EMPTY_MATERIALIZED_DATASET = materializeCoreV2Dataset([]);
const FACILITIES = Object.freeze([
  'renderer',
  'viewport',
  'world',
  'state',
  'history',
  'resize',
  'assets',
] as const);

export class CoreV2Engine {
  private readonly surfaceFactory: CoreV2EngineSurfaceFactory;
  private readonly listeners = new Map<CoreV2EngineEvent, Set<(event: unknown) => void>>();
  private lifecycle: CoreV2Lifecycle = 'new';
  private surface: CoreV2EngineSurface | null = null;
  private initializePromise: Promise<CoreV2InitializeResult> | null = null;
  private instanceId: string | null = null;
  private materialized: MaterializedCoreV2Dataset | null = null;
  private datasetRef: string | null = null;
  private lifecycleGeneration = 0;
  private sceneRevision = 0;
  private viewRevision = 0;
  private interactionRevision = 0;
  private frameRevision = 0;
  private publishedTuple: CoreV2PublishedTuple = Object.freeze({ scene: 0, view: 0, interaction: 0 });
  private zoomLimits: readonly [number, number] = DEFAULT_ZOOM_LIMITS;
  private rendererConfiguration: Readonly<{
    resolution: number;
    antialias: boolean;
    background: string;
    backend: 'webgl' | 'webgpu';
  }> | null = null;
  private submissionSequence = 0;
  private pendingWork = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private viewportPixelRatio = 1;
  private viewportCenterWorld: readonly [number, number] = Object.freeze([0, 0]);
  private viewportScale = 1;
  private worldRotationDegrees = 0;
  private worldFlipX = false;
  private worldFlipY = false;

  public constructor(options: CoreV2EngineOptions = {}) {
    this.surfaceFactory = options.surfaceFactory ?? createPixiSurface;
  }

  public on<K extends CoreV2EngineEvent>(event: K, listener: CoreV2EngineListener<K>): () => void {
    const listeners = this.listeners.get(event) ?? new Set<(event: unknown) => void>();
    listeners.add(listener as (event: unknown) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as (event: unknown) => void);
  }

  public initialize(options: CoreV2InitializeOptions): Promise<CoreV2InitializeResult> {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      return Promise.reject(this.operationError('DESTROYED', 'DESTROYED', 'initialize', false));
    }
    if (this.initializePromise) return this.initializePromise;
    if (this.surface) return Promise.resolve(this.initializeResult());
    validateInitializeOptions(options);
    this.lifecycle = 'initializing';
    this.instanceId = options.instanceId;
    this.zoomLimits = normalizeZoomLimits(options.zoomLimits ?? DEFAULT_ZOOM_LIMITS);
    const surfaceOptions: CoreV2SurfaceOptions = {
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio ?? globalThis.devicePixelRatio ?? 1,
      antialias: options.antialias ?? true,
      background: normalizeBackground(options.background ?? '#FAFAFA'),
      strategy: options.strategy ?? 'mesh',
      preference: options.preference ?? 'webgl',
      powerPreference: options.powerPreference ?? 'high-performance',
      ...(options.target ? { target: options.target } : {}),
      ...(options.canvas ? { canvas: options.canvas } : {}),
    };
    this.rendererConfiguration = Object.freeze({
      resolution: surfaceOptions.pixelRatio,
      antialias: surfaceOptions.antialias,
      background: packedColorToHex(surfaceOptions.background),
      backend: surfaceOptions.preference,
    });
    this.viewportWidth = surfaceOptions.width;
    this.viewportHeight = surfaceOptions.height;
    this.viewportPixelRatio = surfaceOptions.pixelRatio;
    this.viewportCenterWorld = Object.freeze([surfaceOptions.width / 2, surfaceOptions.height / 2]);
    this.viewportScale = 1;
    this.worldRotationDegrees = 0;
    this.worldFlipX = false;
    this.worldFlipY = false;
    this.initializePromise = this.surfaceFactory(surfaceOptions)
      .then((surface) => {
        if (this.lifecycle === 'destroying' || this.lifecycle === 'destroyed') {
          return surface.destroy().then(() => {
            throw this.operationError('DESTROYED', 'DESTROYED', 'initialize', false);
          });
        }
        this.surface = surface;
        this.lifecycleGeneration += 1;
        this.lifecycle = this.materialized?.rootIds.length ? 'scene-ready' : 'ready-empty';
        const result = this.initializeResult();
        this.emit('ready', result);
        return result;
      })
      .catch((error: unknown) => {
        this.surface = null;
        this.initializePromise = null;
        if (this.lifecycle !== 'destroyed') this.lifecycle = 'new';
        throw error;
      });
    return this.initializePromise;
  }

  public loadDataset(input: unknown, options: CoreV2LoadOptions = {}): CoreV2EngineLoadResult {
    const surface = this.requireSurface('loadDataset');
    const materialized = materializeCoreV2Dataset(input);
    const selectionBefore = surface.debugSnapshot().selectionIds;
    surface.load(materialized.dataset);
    if (selectionBefore.length > 0 && surface.debugSnapshot().selectionIds.length === 0) {
      this.interactionRevision += 1;
    }
    this.materialized = materialized;
    this.datasetRef = options.datasetRef ?? null;
    this.sceneRevision += 1;
    this.lifecycle = materialized.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    const result: CoreV2EngineLoadResult = Object.freeze({
      lifecycle: this.lifecycle,
      sceneRevision: this.sceneRevision,
      semanticHash: materialized.semanticHash,
      rootIds: materialized.rootIds,
    });
    this.emit('sceneCommitted', result);
    return result;
  }

  /**
   * Apply one strict partial merge against the current stable logical target.
   * Semantic authority advances only after the dense surface reports one
   * successful incremental reconcile; no failure path substitutes a full load.
   */
  public patch(target: CoreV2SemanticTarget, patch: unknown): CoreV2EnginePatchResult {
    const surface = this.requireSurface('patch');
    const previousRevisions = this.revisionStamp();
    const mutation = applyCoreV2SemanticPatch(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      target,
      patch,
    );

    if (mutation.status === 'rejected') {
      const diagnostic = this.semanticMutationDiagnostic(mutation.diagnostic, mutation.target);
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: mutation.diagnostic.reason === 'missing-target' && mutation.target
          ? freezeTargets([mutation.target])
          : EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        mutationDiagnostic: mutation.diagnostic,
      } satisfies CoreV2EnginePatchResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    if (mutation.status === 'unchanged') {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: freezeTargets([mutation.target]),
      } satisfies CoreV2EnginePatchResult);
    }

    if (!surface.reconcile) {
      return this.refusedPatchResult(
        mutation.target,
        previousRevisions,
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        false,
        EMPTY_RECONCILE_DIAGNOSTICS,
      );
    }

    let reconcile: CoreV2SurfaceReconcileResult;
    try {
      reconcile = surface.reconcile(mutation.candidate.dataset);
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'patch');
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
      } satisfies CoreV2EnginePatchResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    const reconcileDiagnostics = freezeReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      return this.refusedPatchResult(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        reconcileDiagnostics,
      );
    }

    this.materialized = mutation.candidate;
    this.sceneRevision += 1;
    this.lifecycle = mutation.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      target: mutation.target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: mutation.candidate.semanticHash,
      applied: freezeTargets([mutation.target]),
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    } satisfies CoreV2EnginePatchResult);
    this.emit('change', result);
    return result;
  }

  /**
   * Remove one stable logical element through the same incremental reconcile
   * authority as patch(). A missing reconcile seam or refused dense plan leaves
   * semantic authority, revisions, selection, and the current surface unchanged.
   */
  public destroyTarget(target: CoreV2SemanticTarget): CoreV2EngineDestroyTargetResult {
    const surface = this.requireSurface('destroyTarget');
    const previousRevisions = this.revisionStamp();
    const mutation = removeCoreV2SemanticTarget(
      this.materialized ?? EMPTY_MATERIALIZED_DATASET,
      target,
    );

    if (mutation.status === 'rejected') {
      const diagnostic = this.semanticMutationDiagnostic(
        mutation.diagnostic,
        mutation.target,
        'destroyTarget',
      );
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: mutation.diagnostic.reason === 'missing-target' && mutation.target
          ? freezeTargets([mutation.target])
          : EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        mutationDiagnostic: mutation.diagnostic,
      } satisfies CoreV2EngineDestroyTargetResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    if (!surface.reconcile) {
      return this.refusedDestroyTargetResult(
        mutation.target,
        previousRevisions,
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        false,
        EMPTY_RECONCILE_DIAGNOSTICS,
      );
    }

    const selectionBefore = surface.debugSnapshot().selectionIds;
    let reconcile: CoreV2SurfaceReconcileResult;
    try {
      reconcile = surface.reconcile(mutation.candidate.dataset);
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error, 'destroyTarget');
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.materialized?.semanticHash ?? null,
        applied: EMPTY_TARGETS,
        missing: EMPTY_TARGETS,
        unchanged: EMPTY_TARGETS,
        diagnostic,
        reconcileDiagnostics: EMPTY_RECONCILE_DIAGNOSTICS,
      } satisfies CoreV2EngineDestroyTargetResult);
      this.emit('diagnostic', diagnostic);
      return result;
    }

    const reconcileDiagnostics = freezeReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      return this.refusedDestroyTargetResult(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        reconcileDiagnostics,
      );
    }

    this.materialized = mutation.candidate;
    this.sceneRevision += 1;
    this.lifecycle = mutation.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    if (!sameStringArray(selectionBefore, surface.debugSnapshot().selectionIds)) {
      this.interactionRevision += 1;
    }
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      target: mutation.target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: mutation.candidate.semanticHash,
      applied: freezeTargets([mutation.target]),
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    } satisfies CoreV2EngineDestroyTargetResult);
    this.emit('targetDestroyed', result);
    return result;
  }

  public async submitDataset(submission: CoreV2DatasetSubmission): Promise<CoreV2DatasetSubmissionResult> {
    if (!this.surface) {
      return Object.freeze({
        status: 'rejected',
        requestId: submission.requestId,
        diagnostic: this.operationDiagnostic('NOT_READY', 'NOT_READY', 'loadDataset', true),
      });
    }
    const sequence = ++this.submissionSequence;
    this.pendingWork += 1;
    try {
      const input = await submission.input;
      if (sequence !== this.submissionSequence || this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
        return Object.freeze({
          status: 'superseded',
          requestId: submission.requestId,
          diagnostic: this.operationDiagnostic('SUPERSEDED', 'SUPERSEDED', 'loadDataset', true),
        });
      }
      try {
        const result = this.loadDataset(input, {
          ...(submission.datasetRef ? { datasetRef: submission.datasetRef } : {}),
        });
        this.emit('drawComplete', Object.freeze({
          requestId: submission.requestId,
          sceneRevision: result.sceneRevision,
          semanticHash: result.semanticHash,
          datasetRef: submission.datasetRef ?? null,
        }));
        return Object.freeze({
          status: 'committed',
          requestId: submission.requestId,
          sceneRevision: result.sceneRevision,
          semanticHash: result.semanticHash,
        });
      } catch (error) {
        const diagnostic = this.diagnosticFrom(error, 'loadDataset');
        this.emit('diagnostic', diagnostic);
        return Object.freeze({ status: 'rejected', requestId: submission.requestId, diagnostic });
      }
    } finally {
      this.pendingWork -= 1;
    }
  }

  public publishFrame(timeMs = globalThis.performance?.now() ?? Date.now()): void {
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs must be finite');
    const surface = this.requireSurface('publishFrame');
    surface.publishFrame(timeMs);
    this.frameRevision += 1;
    this.publishedTuple = Object.freeze({
      scene: this.sceneRevision,
      view: this.viewRevision,
      interaction: this.interactionRevision,
    });
    this.emit('frame', Object.freeze({ frameRevision: this.frameRevision, publishedTuple: this.publishedTuple }));
  }

  public resize(width: number, height: number, pixelRatio = globalThis.devicePixelRatio ?? 1): boolean {
    validatePositiveFinite('width', width);
    validatePositiveFinite('height', height);
    validatePositiveFinite('pixelRatio', pixelRatio);
    const surface = this.requireSurface('resize');
    const changed = surface.resize(width, height, pixelRatio);
    if (!changed) return false;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.viewportPixelRatio = pixelRatio;
    surface.setView(this.resolvedSurfaceView());
    this.viewRevision += 1;
    return true;
  }

  public setViewport(input: Readonly<{
    centerWorld: readonly [number, number];
    scale: number;
  }>): CoreV2ViewportState {
    const [centerX, centerY] = input.centerWorld;
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      throw new RangeError('centerWorld must contain finite coordinates');
    }
    if (!Number.isFinite(input.scale) || input.scale < this.zoomLimits[0] || input.scale > this.zoomLimits[1]) {
      throw new RangeError('scale must be within the configured zoom limits');
    }
    const surface = this.requireSurface('setViewport');
    this.viewportCenterWorld = Object.freeze([centerX, centerY]);
    this.viewportScale = input.scale;
    surface.setView(this.resolvedSurfaceView());
    this.viewRevision += 1;
    return this.viewportState();
  }

  public setWorldTransform(input: CoreV2WorldTransformInput): CoreV2WorldTransformState {
    if (!Number.isFinite(input.rotationDegrees)) {
      throw new RangeError('rotationDegrees must be finite');
    }
    if (typeof input.flipX !== 'boolean' || typeof input.flipY !== 'boolean') {
      throw new TypeError('flipX and flipY must be booleans');
    }
    const surface = this.requireSurface('setWorldTransform');
    const normalizedRotation = normalizeDegrees(input.rotationDegrees);
    if (
      normalizedRotation === this.worldRotationDegrees &&
      input.flipX === this.worldFlipX &&
      input.flipY === this.worldFlipY
    ) {
      return this.worldTransformState();
    }
    const next = Object.freeze({
      rotationDegrees: normalizedRotation,
      flipX: input.flipX,
      flipY: input.flipY,
    });
    surface.setView(this.resolvedSurfaceView(next));
    this.worldRotationDegrees = next.rotationDegrees;
    this.worldFlipX = next.flipX;
    this.worldFlipY = next.flipY;
    this.viewRevision += 1;
    return this.worldTransformState();
  }

  public select(ids: readonly string[]): readonly string[] {
    const unique = Object.freeze([...new Set(ids.map((id) => {
      if (typeof id !== 'string' || id.length === 0) throw new TypeError('selection IDs must be non-empty strings');
      return id;
    }))]);
    const surface = this.requireSurface('select');
    surface.select(unique);
    this.interactionRevision += 1;
    return surface.debugSnapshot().selectionIds;
  }

  public hitTest(point: CoreV2Point): string | null {
    validatePoint(point, 'hitTest');
    return this.requireSurface('hitTest').hitTestScreen(point);
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    validatePoint(point, 'screenToWorld');
    return this.requireSurface('screenToWorld').screenToWorld(point);
  }

  public query(target: { readonly id: string }): Readonly<Record<string, unknown>> | null {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      throw this.operationError('DESTROYED', 'DESTROYED', 'query', false);
    }
    if (!this.surface) throw this.operationError('NOT_READY', 'NOT_READY', 'query', true);
    const value = this.materialized ? findElement(this.materialized.dataset, target.id) : null;
    return value;
  }

  public snapshot(): CoreV2EngineSnapshot {
    const surfaceDebug = this.surface?.debugSnapshot() ?? emptySurfaceDebug(
      this.viewportWidth,
      this.viewportHeight,
      this.viewportPixelRatio,
    );
    return Object.freeze({
      lifecycle: this.lifecycle,
      instanceId: this.instanceId,
      revisions: this.revisionStamp(),
      publishedTuple: this.publishedTuple,
      frameRevision: this.frameRevision,
      datasetRef: this.datasetRef,
      semanticHash: this.materialized?.semanticHash ?? null,
      rootIds: this.materialized?.rootIds ?? Object.freeze([]),
      historyDepth: 0,
      pendingWork: this.pendingWork,
      zoomLimits: this.zoomLimits,
      viewport: this.viewportState(),
      selectionIds: surfaceDebug.selectionIds,
      facilities: FACILITIES,
      resources: Object.freeze({
        canvasCount: this.surface?.canvasCount ?? 0,
        canvas: Object.freeze({
          cssSize: surfaceDebug.cssSize,
          backingSize: surfaceDebug.backingSize,
        }),
        renderer: this.rendererConfiguration,
        rendering: Object.freeze({
          commandCount: surfaceDebug.renderCommandCount ?? null,
          visiblePrimitiveCount: surfaceDebug.visiblePrimitiveCount ?? null,
        }),
        subscriptions: Object.freeze({ active: this.subscriptionCount(), duplicates: 0 }),
      }),
    });
  }

  public semanticProbe(): CoreV2SemanticProductProbe {
    const surfaceDebug = this.surface?.debugSnapshot() ?? emptySurfaceDebug(
      this.viewportWidth,
      this.viewportHeight,
      this.viewportPixelRatio,
    );
    return createCoreV2SemanticProbe(this.materialized, {
      lifecycle: this.lifecycle,
      datasetRef: this.datasetRef,
      interactionMode: 'select',
      selectionIds: surfaceDebug.selectionIds,
      activeAnimationCount: surfaceDebug.activeAnimationCount,
      ...(surfaceDebug.activeGestureCount === undefined
        ? {}
        : { activeGestureCount: surfaceDebug.activeGestureCount }),
      historyDepth: 0,
    });
  }

  /**
   * Read renderer-aligned geometry without exposing the Pixi scene graph. The
   * aggregate renderer remains free to use a handful of display objects while
   * callers can still verify entity, relation, and selection alignment.
   */
  public geometryProbe(): CoreV2EngineGeometryProbe | null {
    const surface = this.requireSurface('geometryProbe');
    const geometry = surface.geometrySnapshot?.() ?? null;
    if (geometry === null) return null;
    const sourceRevision = geometry.revision ?? null;
    return Object.freeze({
      ...geometry,
      revision: sourceRevision,
      revisionLag: sourceRevision === null ? null : this.sceneRevision - sourceRevision,
    });
  }

  public relationProbe(): CoreV2EngineRelationProbe | null {
    const surface = this.requireSurface('relationProbe');
    const geometry = surface.geometrySnapshot?.() ?? null;
    if (geometry === null) return null;
    const sourceRevision = geometry.revision ?? null;
    return Object.freeze({
      revision: sourceRevision,
      revisionLag: sourceRevision === null ? null : this.sceneRevision - sourceRevision,
      relations: geometry.relations,
      omittedRelations: geometry.omittedRelations ?? Object.freeze([]),
    });
  }

  public relationHitTestScreen(
    point: CoreV2Point,
    options: CoreV2RelationHitOptions = {},
  ): CoreV2RelationHit | null {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError('relation hit point must contain finite coordinates');
    }
    if (
      options.toleranceCssPx !== undefined &&
      (!Number.isFinite(options.toleranceCssPx) || options.toleranceCssPx < 0)
    ) {
      throw new RangeError('toleranceCssPx must be finite and non-negative');
    }
    const surface = this.requireSurface('relationHitTestScreen');
    return surface.relationHitTestScreen?.(point, options) ?? null;
  }

  public exportDataset(): readonly NormalizedCoreV2Element[] {
    this.requireSurface('exportDataset');
    return this.materialized?.dataset ?? [];
  }

  public async destroy(): Promise<boolean> {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') return false;
    this.lifecycle = 'destroying';
    this.submissionSequence += 1;
    const surface = this.surface;
    const pendingInitialization = this.initializePromise;
    if (surface) {
      await surface.destroy();
    } else if (pendingInitialization) {
      // Initialization owns a renderer allocation that may not exist yet. Its
      // continuation observes `destroying`, disposes the late surface, and rejects;
      // waiting here makes the public destroy milestone a real resource boundary.
      await pendingInitialization.catch(() => undefined);
    }
    this.surface = null;
    this.materialized = null;
    this.datasetRef = null;
    this.rendererConfiguration = null;
    this.initializePromise = null;
    this.lifecycle = 'destroyed';
    this.emit('destroyed', Object.freeze({ lifecycleGeneration: this.lifecycleGeneration }));
    this.listeners.clear();
    return true;
  }

  private initializeResult(): CoreV2InitializeResult {
    const lifecycle = this.lifecycle === 'scene-ready' ? 'scene-ready' : 'ready-empty';
    return Object.freeze({
      lifecycle,
      instanceId: this.instanceId ?? '',
      revisions: this.revisionStamp(),
      facilities: FACILITIES,
    });
  }

  private revisionStamp(): CoreV2RevisionStamp {
    return Object.freeze({
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
      viewRevision: this.viewRevision,
      interactionRevision: this.interactionRevision,
    });
  }

  private requireSurface(operation: string): CoreV2EngineSurface {
    if (this.lifecycle === 'destroyed' || this.lifecycle === 'destroying') {
      throw this.operationError('DESTROYED', 'DESTROYED', operation, false);
    }
    if (!this.surface) throw this.operationError('NOT_READY', 'NOT_READY', operation, true);
    return this.surface;
  }

  private diagnosticFrom(error: unknown, operation: string): CoreV2EngineDiagnostic {
    if (error instanceof CoreV2DatasetError) {
      return this.operationDiagnostic(error.code, error.category, operation, true, error.datasetPath);
    }
    if (error instanceof CoreV2EngineError) return error.diagnostic;
    return this.operationDiagnostic('INTERNAL_FAILURE', 'INTERNAL_FAILURE', operation, false);
  }

  private semanticMutationDiagnostic(
    diagnostic: CoreV2SemanticMutationDiagnostic,
    target: CoreV2SemanticTarget | null,
    operation = 'patch',
  ): CoreV2EngineDiagnostic {
    const mapping = mutationDiagnosticMapping(diagnostic);
    const base = this.operationDiagnostic(
      mapping.code,
      mapping.category,
      operation,
      mapping.recoverable,
      diagnostic.path,
    );
    return Object.freeze({
      ...base,
      missingCount: diagnostic.reason === 'missing-target' && target ? 1 : 0,
    });
  }

  private refusedPatchResult(
    target: CoreV2SemanticTarget,
    previousRevisions: CoreV2RevisionStamp,
    code: string,
    category: CoreV2DiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[],
  ): Extract<CoreV2EnginePatchResult, { readonly status: 'refused' }> {
    const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
    const diagnostic = this.operationDiagnostic(
      code,
      category,
      'patch',
      recoverable,
      datasetPath,
    );
    const result = Object.freeze({
      status: 'refused',
      changed: false,
      target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.materialized?.semanticHash ?? null,
      applied: EMPTY_TARGETS,
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      diagnostic,
      reconcileDiagnostics,
    } satisfies CoreV2EnginePatchResult);
    this.emit('diagnostic', diagnostic);
    return result;
  }

  private refusedDestroyTargetResult(
    target: Extract<CoreV2SemanticTarget, { readonly kind: 'element' }>,
    previousRevisions: CoreV2RevisionStamp,
    code: string,
    category: CoreV2DiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly CoreV2ReconcileDiagnostic[],
  ): Extract<CoreV2EngineDestroyTargetResult, { readonly status: 'refused' }> {
    const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
    const diagnostic = this.operationDiagnostic(
      code,
      category,
      'destroyTarget',
      recoverable,
      datasetPath,
    );
    const result = Object.freeze({
      status: 'refused',
      changed: false,
      target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.materialized?.semanticHash ?? null,
      applied: EMPTY_TARGETS,
      missing: EMPTY_TARGETS,
      unchanged: EMPTY_TARGETS,
      diagnostic,
      reconcileDiagnostics,
    } satisfies CoreV2EngineDestroyTargetResult);
    this.emit('diagnostic', diagnostic);
    return result;
  }

  private subscriptionCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) count += listeners.size;
    return count;
  }

  private resolvedSurfaceView(
    world: CoreV2WorldTransformInput = this.worldTransformState(),
  ): CoreV2SurfaceView {
    const radians = world.rotationDegrees * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const scaledX = this.viewportCenterWorld[0] * this.viewportScale;
    const scaledY = this.viewportCenterWorld[1] * this.viewportScale;
    const transformedCenterX = (scaledX * cosine - scaledY * sine) * (world.flipX ? -1 : 1);
    const transformedCenterY = (scaledX * sine + scaledY * cosine) * (world.flipY ? -1 : 1);
    return Object.freeze({
      x: this.viewportWidth / 2 - transformedCenterX,
      y: this.viewportHeight / 2 - transformedCenterY,
      scale: this.viewportScale,
      rotation: world.rotationDegrees,
      ...(world.flipX ? { flipX: true } : {}),
      ...(world.flipY ? { flipY: true } : {}),
    });
  }

  private worldTransformState(): CoreV2WorldTransformState {
    return Object.freeze({
      rotationDegrees: this.worldRotationDegrees,
      flipX: this.worldFlipX,
      flipY: this.worldFlipY,
    });
  }

  private viewportState(): CoreV2ViewportState {
    return Object.freeze({
      centerWorld: this.viewportCenterWorld,
      scale: this.viewportScale,
      screenBounds: Object.freeze([
        0,
        0,
        this.viewportWidth,
        this.viewportHeight,
      ] as [number, number, number, number]),
    });
  }

  private operationError(
    code: string,
    category: CoreV2DiagnosticCategory,
    operation: string,
    recoverable: boolean,
  ): CoreV2EngineError {
    return new CoreV2EngineError(this.operationDiagnostic(code, category, operation, recoverable));
  }

  private operationDiagnostic(
    code: string,
    category: CoreV2DiagnosticCategory,
    operation: string,
    recoverable: boolean,
    datasetPath?: string,
  ): CoreV2EngineDiagnostic {
    return Object.freeze({
      code,
      category,
      operation,
      lifecycleGeneration: this.lifecycleGeneration,
      sceneRevision: this.sceneRevision,
      revisionStamp: this.revisionStamp(),
      recoverable,
      retryable: recoverable,
      appliedCount: 0,
      missingCount: 0,
      unchangedCount: 0,
      ...(datasetPath === undefined ? {} : { datasetPath }),
    });
  }

  private emit<K extends CoreV2EngineEvent>(event: K, value: CoreV2EngineEventMap[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        listener(value);
      } catch {
        // Host callback isolation is observable through the later diagnostics tranche;
        // a callback must never unwind an already committed engine transition.
      }
    }
  }
}

export class CoreV2EngineError extends Error {
  public readonly diagnostic: CoreV2EngineDiagnostic;

  public constructor(diagnostic: CoreV2EngineDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.operation}`);
    this.name = 'CoreV2EngineError';
    this.diagnostic = diagnostic;
  }
}

export class PixiEngineSurface implements CoreV2EngineSurface {
  private readonly core: CoreV2;
  private canvasPresent = true;
  private geometryRevision = 0;
  private geometryCache: CoreV2SurfaceGeometrySnapshot | null = null;
  private relationHitIndex = emptyCoreV2RelationHitIndex();
  private surfaceView: CoreV2SurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(core: CoreV2) {
    this.core = core;
  }

  public get canvasCount(): number {
    return this.canvasPresent ? 1 : 0;
  }

  public get destroyed(): boolean {
    return this.core.destroyed;
  }

  public load(input: unknown): void {
    this.core.load(input);
    this.geometryRevision += 1;
    this.invalidateGeometryCache();
  }

  public reconcile(input: unknown): CoreV2SurfaceReconcileResult {
    const result = this.core.reconcile(input);
    if (result.status === 'committed') {
      this.geometryRevision += 1;
      this.invalidateGeometryCache();
    }
    return Object.freeze({
      status: result.status,
      operationCount: result.plan.summary.operationCount,
      denseChanged: result.facts.denseChanged,
      diagnostics: freezeReconcileDiagnostics(result.plan.diagnostics),
    });
  }

  public publishFrame(_timeMs: number): void {
    this.core.flush('engine-publication');
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = this.core.resize(width, height, pixelRatio);
    if (changed) this.invalidateGeometryCache();
    return changed;
  }

  public setView(view: CoreV2SurfaceView): void {
    const nextView = Object.freeze({
      ...view,
      flipX: view.flipX ?? false,
      flipY: view.flipY ?? false,
    });
    this.core.setWorldTransform({
      x: nextView.x,
      y: nextView.y,
      scale: nextView.scale,
      rotationDegrees: nextView.rotation,
      flipX: nextView.flipX,
      flipY: nextView.flipY,
    });
    this.surfaceView = nextView;
    this.invalidateGeometryCache();
  }

  public select(ids: readonly string[]): void {
    this.core.commit({ operations: [{ type: 'selection', targets: ids, mode: 'replace' }] });
    this.invalidateGeometryCache();
  }

  public hitTestScreen(point: CoreV2Point): string | null {
    const ref = this.core.hitTestScreen(point, { interactiveOnly: true });
    return ref ? this.core.get(ref)?.id ?? null : null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return this.core.screenToWorld(point);
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    const renderer = this.core.renderer;
    const runtime = this.core.debugSnapshot();
    const selectionIds = Object.freeze(
      this.core.selection().refs.flatMap((ref) => {
        const entity = this.core.get(ref);
        return entity ? [entity.id] : [];
      }),
    );
    return Object.freeze({
      cssSize: Object.freeze([renderer.width, renderer.height] as [number, number]),
      backingSize: Object.freeze([
        Math.round(renderer.width * renderer.pixelRatio),
        Math.round(renderer.height * renderer.pixelRatio),
      ] as [number, number]),
      selectionIds,
      activeAnimationCount: this.core.activeAnimations,
      activeGestureCount: runtime.activeGestureCount,
      renderCommandCount: runtime.renderer.aggregateRenderObjects,
      visiblePrimitiveCount: runtime.renderer.visiblePrimitives,
    });
  }

  public geometrySnapshot(): CoreV2SurfaceGeometrySnapshot {
    if (this.geometryCache) return this.geometryCache;
    const geometry = Object.freeze({
      ...createCoreV2SurfaceGeometrySnapshot(
        this.core.snapshot(),
        this.core.projection,
        this.surfaceView,
      ),
      revision: this.geometryRevision,
    });
    this.geometryCache = geometry;
    this.relationHitIndex = buildCoreV2RelationHitIndex(geometry.relations);
    return geometry;
  }

  public relationHitTestScreen(
    point: CoreV2Point,
    options: CoreV2RelationHitOptions = {},
  ): CoreV2RelationHit | null {
    const geometry = this.geometrySnapshot();
    const tolerance = options.toleranceCssPx ?? 4;
    const candidateIndices = tolerance <= 4
      ? queryCoreV2RelationHitIndex(this.relationHitIndex, point)
      : geometry.relations.map((_relation, index) => index);
    const candidates = candidateIndices.flatMap((index) => {
      const relation = geometry.relations[index];
      return relation ? [relation] : [];
    });
    return hitTestCoreV2SurfaceRelations(candidates, point, options);
  }

  public async destroy(): Promise<boolean> {
    const destroyed = await this.core.destroy();
    this.canvasPresent = false;
    this.invalidateGeometryCache();
    return destroyed;
  }

  private invalidateGeometryCache(): void {
    this.geometryCache = null;
    this.relationHitIndex = emptyCoreV2RelationHitIndex();
  }
}

async function createPixiSurface(options: CoreV2SurfaceOptions): Promise<CoreV2EngineSurface> {
  const coreOptions: CoreV2Options = {
    width: options.width,
    height: options.height,
    pixelRatio: options.pixelRatio,
    antialias: options.antialias,
    background: options.background,
    strategy: options.strategy,
    preference: options.preference,
    powerPreference: options.powerPreference,
    autoRender: false,
    ...(options.target ? { target: options.target } : {}),
    ...(options.canvas ? { canvas: options.canvas } : {}),
  };
  return new PixiEngineSurface(await createCoreV2(coreOptions));
}

function validateInitializeOptions(options: CoreV2InitializeOptions): void {
  if (!options.instanceId) throw new TypeError('instanceId must be a non-empty string');
  for (const [name, value] of [['width', options.width], ['height', options.height]] as const) {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
  }
  if (options.pixelRatio !== undefined && (!(options.pixelRatio > 0) || !Number.isFinite(options.pixelRatio))) {
    throw new RangeError('pixelRatio must be positive and finite');
  }
}

function validatePositiveFinite(name: string, value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be positive and finite`);
}

function validatePoint(point: CoreV2Point, operation: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${operation} point must contain finite coordinates`);
  }
}

function normalizeDegrees(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function emptySurfaceDebug(width: number, height: number, pixelRatio: number): CoreV2SurfaceDebug {
  return Object.freeze({
    cssSize: Object.freeze([width, height] as [number, number]),
    backingSize: Object.freeze([
      Math.round(width * pixelRatio),
      Math.round(height * pixelRatio),
    ] as [number, number]),
    selectionIds: Object.freeze([] as string[]),
    activeAnimationCount: 0,
    activeGestureCount: 0,
    renderCommandCount: 0,
    visiblePrimitiveCount: 0,
  });
}

function normalizeZoomLimits(value: readonly [number, number]): readonly [number, number] {
  const [min, max] = value;
  if (!(min > 0) || !(max >= min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError('zoomLimits must contain positive finite min/max values');
  }
  return Object.freeze([min, max]);
}

function normalizeBackground(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new TypeError('invalid background color');
    return value >>> 0;
  }
  const match = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (!match) throw new TypeError('background must be #rrggbb or #rrggbbaa');
  const body = match[1]!;
  return Number.parseInt(body.length === 6 ? `${body}ff` : body, 16) >>> 0;
}

function packedColorToHex(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(8, '0')}`;
}

const EMPTY_TARGETS = Object.freeze([] as CoreV2SemanticTarget[]);
const EMPTY_RECONCILE_DIAGNOSTICS = Object.freeze([] as CoreV2ReconcileDiagnostic[]);

function freezeTargets(values: readonly CoreV2SemanticTarget[]): readonly CoreV2SemanticTarget[] {
  return Object.freeze([...values]);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function freezeReconcileDiagnostics(
  values: readonly CoreV2ReconcileDiagnostic[],
): readonly CoreV2ReconcileDiagnostic[] {
  return Object.freeze(values.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

function mutationDiagnosticMapping(
  diagnostic: CoreV2SemanticMutationDiagnostic,
): Readonly<{
  code: string;
  category: CoreV2DiagnosticCategory;
  recoverable: boolean;
}> {
  switch (diagnostic.reason) {
    case 'missing-target':
      return { code: 'MISSING_TARGET', category: 'MISSING_TARGET', recoverable: true };
    case 'ambiguous-target':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'unsupported-structure':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'invalid-candidate':
      return {
        code: diagnostic.datasetCode ?? 'INVALID_MUTATION',
        category: 'INVALID_INPUT',
        recoverable: true,
      };
    case 'invalid-target':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'invalid-value':
      return { code: 'INVALID_VALUE', category: 'INVALID_INPUT', recoverable: true };
  }
}

export function createCoreV2SurfaceGeometrySnapshot(
  snapshot: SceneSnapshot,
  projection: CoreV2ProjectionIndex | null = null,
  surfaceView: CoreV2SurfaceView = Object.freeze({
    ...snapshot.view,
    rotation: snapshot.view.rotation ?? 0,
  }),
): CoreV2SurfaceGeometrySnapshot {
  const entityGeometries = snapshot.entities
    .filter((entity) => entity.kind !== 'relation')
    .map((entity) => {
      const entityProjection = projection?.byEntityId[entity.id];
      const geometry = entityProjection
        ? resolveProjectedEntityGeometry(entityProjection, surfaceView)
        : resolveDenseEntityGeometry(entity.bounds, entity.rotation, surfaceView);
      return Object.freeze<CoreV2SurfaceEntityGeometry>({
        id: entity.id,
        kind: entity.kind,
        localBounds: entityProjection?.localBounds ?? freezeBounds(
          0,
          0,
          entity.bounds.width,
          entity.bounds.height,
        ),
        worldBounds: geometry.worldBounds,
        screenBounds: geometry.screenBounds,
        visibleBounds: entity.visible ? geometry.worldBounds : null,
        visible: entity.visible,
        interactive: entity.interactive,
        scaleX: entityProjection?.scaleX ?? 1,
        scaleY: entityProjection?.scaleY ?? 1,
        ...(entityProjection?.ownerItemId ? { ownerItemId: entityProjection.ownerItemId } : {}),
        ...(entityProjection?.componentId ? { componentId: entityProjection.componentId } : {}),
        ...(entityProjection?.componentType ? { componentType: entityProjection.componentType } : {}),
        ...(entityProjection
          ? {
              contentOrientation: entityProjection.contentOrientation,
              screenBasis: geometry.screenBasis,
              visibleCenter: entityProjection.visibleCenter,
              screenAngle: entityProjection.contentOrientation === 'upright'
                ? 0
                : normalizeDegrees(entityProjection.rotationDegrees + surfaceView.rotation),
            }
          : {}),
      });
    });
  const geometryById = new Map(entityGeometries.map((entity) => [entity.id, entity]));
  const relations = snapshot.entities.flatMap((entity) => {
    if (entity.kind !== 'relation') return [];
    const sourceId = entity.data.from;
    const targetId = entity.data.to;
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') return [];
    const source = geometryById.get(sourceId);
    const target = geometryById.get(targetId);
    if (!source || !target) return [];
    const relationProjection = projection?.relationsByEntityId?.[entity.id];
    const fallbackProjection = Object.freeze({
      entityId: entity.id,
      relationId: relationSourceId(entity),
      sourceId,
      targetId,
      key: `${sourceId}>${targetId}`,
      identityKey: `${sourceId.length}:${sourceId}${targetId.length}:${targetId}`,
      authoredIndex: 0,
      affine: createCoreV2Affine(),
    });
    const resolved = resolveCoreV2RelationPath(
      relationProjection ?? fallbackProjection,
      {
        id: sourceId,
        center: source.visibleCenter ?? boundsCenter(source.worldBounds),
        worldBounds: source.worldBounds,
        visible: source.visible,
      },
      {
        id: targetId,
        center: target.visibleCenter ?? boundsCenter(target.worldBounds),
        worldBounds: target.worldBounds,
        visible: target.visible,
      },
      {
        color: typeof entity.data.color === 'number' ? entity.data.color : 0x000000ff,
        width: typeof entity.data.lineWidth === 'number' ? entity.data.lineWidth : 1,
        opacity: entity.opacity,
        zIndex: entity.zIndex,
        visible: entity.visible,
      },
    );
    const screenPoints = Object.freeze(
      resolved.worldPoints.map((point) => surfacePointToScreen(point, surfaceView)),
    );
    const sourceWorld = resolved.worldPoints[0] ?? source.visibleCenter ?? boundsCenter(source.worldBounds);
    const targetWorld = resolved.worldPoints[resolved.worldPoints.length - 1] ?? target.visibleCenter ?? boundsCenter(target.worldBounds);
    const sourceScreen = screenPoints[0] ?? surfacePointToScreen(sourceWorld, surfaceView);
    const targetScreen = screenPoints[screenPoints.length - 1] ?? surfacePointToScreen(targetWorld, surfaceView);
    return [Object.freeze<CoreV2SurfaceRelationGeometry>({
      id: entity.id,
      relationId: resolved.relationId,
      key: resolved.key,
      identityKey: (relationProjection ?? fallbackProjection).identityKey,
      sourceId,
      targetId,
      kind: resolved.kind,
      localPoints: resolved.localPoints,
      worldPoints: resolved.worldPoints,
      screenPoints,
      worldBounds: resolved.worldBounds,
      screenBounds: boundsForTuplePoints(screenPoints),
      visible: resolved.visible,
      style: Object.freeze({
        color: resolved.style.color,
        colorHex: packedColorToHex(resolved.style.color),
        width: resolved.style.width,
        opacity: resolved.style.opacity,
        zIndex: resolved.style.zIndex,
      }),
      visibleStrokeWidthsCssPx: Object.freeze(
        resolved.worldStrokeWidths.map((width) => width * surfaceView.scale),
      ),
      worldEndpoints: Object.freeze([sourceWorld, targetWorld] as const),
      screenEndpoints: Object.freeze([
        sourceScreen,
        targetScreen,
      ] as const),
    })];
  });
  const selectedRefs = new Set(snapshot.selection.refs.map((ref) => `${ref.slot}:${ref.generation}`));
  const selectedBounds = snapshot.entities.flatMap((entity) => {
    if (entity.kind === 'relation' || !selectedRefs.has(`${entity.ref.slot}:${entity.ref.generation}`)) return [];
    const geometry = geometryById.get(entity.id);
    return geometry ? [geometry.screenBounds] : [];
  });
  const selectionOverlay = unionBounds(selectedBounds);

  return Object.freeze({
    revision: snapshot.revision,
    entities: Object.freeze(entityGeometries),
    relations: Object.freeze(relations),
    omittedRelations: Object.freeze((projection?.omittedRelations ?? []).map((relation) =>
      Object.freeze({
        id: relation.entityId,
        relationId: relation.relationId,
        key: relation.key,
        identityKey: relation.identityKey,
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        authoredIndex: relation.authoredIndex,
        reason: relation.reason,
      }))),
    selectionOverlay: selectionOverlay === null
      ? null
      : Object.freeze({ screenBounds: selectionOverlay }),
  });
}

export function hitTestCoreV2SurfaceRelations(
  relations: readonly CoreV2SurfaceRelationGeometry[],
  point: CoreV2Point,
  options: CoreV2RelationHitOptions = {},
): CoreV2RelationHit | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('relation hit point must contain finite coordinates');
  }
  const tolerance = options.toleranceCssPx ?? 4;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('toleranceCssPx must be finite and non-negative');
  }
  const screenPoint = Object.freeze([point.x, point.y] as const);
  for (let relationIndex = relations.length - 1; relationIndex >= 0; relationIndex -= 1) {
    const relation = relations[relationIndex];
    if (!relation?.visible || !relation.screenPoints || !relation.style) continue;
    for (let segmentIndex = relation.screenPoints.length - 1; segmentIndex >= 1; segmentIndex -= 1) {
      const from = relation.screenPoints[segmentIndex - 1];
      const to = relation.screenPoints[segmentIndex];
      if (!from || !to) continue;
      if (relationPathHitScreen(
        Object.freeze([from, to]),
        screenPoint,
        relation.visibleStrokeWidthsCssPx?.[segmentIndex - 1] ?? relation.style.width,
        tolerance,
      )) {
        return Object.freeze({
          id: relation.id,
          relationId: relation.relationId ?? relation.id,
          key: relation.key ?? `${relation.sourceId}>${relation.targetId}`,
          identityKey: relation.identityKey ??
            `${relation.sourceId.length}:${relation.sourceId}${relation.targetId.length}:${relation.targetId}`,
          sourceId: relation.sourceId,
          targetId: relation.targetId,
        });
      }
    }
  }
  return null;
}

const CORE_V2_RELATION_HIT_CELL_SIZE = 64;
const CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH = 1_024;

export function buildCoreV2RelationHitIndex(
  relations: readonly CoreV2SurfaceRelationGeometry[],
): CoreV2RelationHitIndex {
  const mutable = new Map<string, number[]>();
  const overflow: number[] = [];
  relations.forEach((relation, index) => {
    if (
      !relation.visible || !relation.style ||
      !relation.screenPoints || relation.screenPoints.length < 2
    ) return;
    const strokeRadius = Math.max(
      4,
      ...(relation.visibleStrokeWidthsCssPx ?? [relation.style?.width ?? 0]).map(
        (width) => width / 2,
      ),
    );
    const cellKeys = relationHitPathCellKeys(relation.screenPoints, strokeRadius);
    if (cellKeys === null) {
      overflow.push(index);
      return;
    }
    for (const key of cellKeys) {
      const indices = mutable.get(key) ?? [];
      indices.push(index);
      mutable.set(key, indices);
    }
  });
  return Object.freeze({
    cells: new Map(
      [...mutable].map(([key, indices]) => [key, Object.freeze(indices)] as const),
    ),
    overflow: Object.freeze(overflow),
  });
}

export function queryCoreV2RelationHitIndex(
  index: CoreV2RelationHitIndex,
  point: CoreV2Point,
): readonly number[] {
  const local = index.cells.get(relationHitCellKey(point.x, point.y)) ?? [];
  return mergeOrderedRelationIndices(local, index.overflow);
}

function relationHitCellKey(x: number, y: number): string {
  return `${Math.floor(x / CORE_V2_RELATION_HIT_CELL_SIZE)}:${Math.floor(y / CORE_V2_RELATION_HIT_CELL_SIZE)}`;
}

function relationHitPathCellKeys(
  points: readonly (readonly [number, number])[],
  radius: number,
): ReadonlySet<string> | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  const halo = Math.ceil(radius / CORE_V2_RELATION_HIT_CELL_SIZE);
  const haloWidth = halo * 2 + 1;
  const cellsPerStep = haloWidth * haloWidth;
  if (
    !Number.isSafeInteger(halo) ||
    !Number.isSafeInteger(cellsPerStep) ||
    cellsPerStep > CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH
  ) {
    return null;
  }

  const keys = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    const startColumn = relationHitCellCoordinate(from[0]);
    const startRow = relationHitCellCoordinate(from[1]);
    const endColumn = relationHitCellCoordinate(to[0]);
    const endRow = relationHitCellCoordinate(to[1]);
    if (
      startColumn === null || startRow === null ||
      endColumn === null || endRow === null
    ) {
      return null;
    }
    const stepBudget = Math.abs(endColumn - startColumn) +
      Math.abs(endRow - startRow) + 1;
    if (
      !Number.isSafeInteger(stepBudget) ||
      stepBudget > CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH
    ) {
      return null;
    }
    if (!addRelationSegmentCells(
      keys,
      from,
      to,
      startColumn,
      startRow,
      endColumn,
      endRow,
      halo,
    )) {
      return null;
    }
  }
  return keys;
}

function addRelationSegmentCells(
  keys: Set<string>,
  from: readonly [number, number],
  to: readonly [number, number],
  startColumn: number,
  startRow: number,
  endColumn: number,
  endRow: number,
  halo: number,
): boolean {
  let column = startColumn;
  let row = startRow;
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const stepX = Math.sign(deltaX);
  const stepY = Math.sign(deltaY);
  const tDeltaX = stepX === 0
    ? Number.POSITIVE_INFINITY
    : CORE_V2_RELATION_HIT_CELL_SIZE / Math.abs(deltaX);
  const tDeltaY = stepY === 0
    ? Number.POSITIVE_INFINITY
    : CORE_V2_RELATION_HIT_CELL_SIZE / Math.abs(deltaY);
  let tMaxX = stepX === 0
    ? Number.POSITIVE_INFINITY
    : ((stepX > 0 ? column + 1 : column) * CORE_V2_RELATION_HIT_CELL_SIZE - from[0]) /
      deltaX;
  let tMaxY = stepY === 0
    ? Number.POSITIVE_INFINITY
    : ((stepY > 0 ? row + 1 : row) * CORE_V2_RELATION_HIT_CELL_SIZE - from[1]) /
      deltaY;

  while (true) {
    for (let rowOffset = -halo; rowOffset <= halo; rowOffset += 1) {
      for (let columnOffset = -halo; columnOffset <= halo; columnOffset += 1) {
        const candidateColumn = column + columnOffset;
        const candidateRow = row + rowOffset;
        if (!Number.isSafeInteger(candidateColumn) || !Number.isSafeInteger(candidateRow)) {
          return false;
        }
        keys.add(`${candidateColumn}:${candidateRow}`);
        if (keys.size > CORE_V2_RELATION_HIT_MAX_CELLS_PER_PATH) return false;
      }
    }
    if (column === endColumn && row === endRow) return true;
    if (tMaxX < tMaxY) {
      column += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      row += stepY;
      tMaxY += tDeltaY;
    } else {
      column += stepX;
      row += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
  }
}

function relationHitCellCoordinate(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const coordinate = Math.floor(value / CORE_V2_RELATION_HIT_CELL_SIZE);
  return Number.isSafeInteger(coordinate) ? coordinate : null;
}

function mergeOrderedRelationIndices(
  local: readonly number[],
  overflow: readonly number[],
): readonly number[] {
  if (local.length === 0) return overflow;
  if (overflow.length === 0) return local;
  const merged: number[] = [];
  let localIndex = 0;
  let overflowIndex = 0;
  while (localIndex < local.length || overflowIndex < overflow.length) {
    const localValue = local[localIndex];
    const overflowValue = overflow[overflowIndex];
    if (overflowValue === undefined || (localValue !== undefined && localValue < overflowValue)) {
      merged.push(localValue as number);
      localIndex += 1;
    } else if (localValue === undefined || overflowValue < localValue) {
      merged.push(overflowValue);
      overflowIndex += 1;
    } else {
      merged.push(localValue);
      localIndex += 1;
      overflowIndex += 1;
    }
  }
  return Object.freeze(merged);
}

function emptyCoreV2RelationHitIndex(): CoreV2RelationHitIndex {
  return Object.freeze({ cells: new Map(), overflow: Object.freeze([]) });
}

function relationSourceId(entity: SceneSnapshot['entities'][number]): string {
  const tag = entity.tags.find((entry) => entry.startsWith('source:'));
  return tag?.slice('source:'.length) || entity.id;
}

interface ResolvedEntityGeometry {
  readonly worldBounds: readonly [number, number, number, number];
  readonly screenBounds: readonly [number, number, number, number];
  readonly screenBasis: CoreV2AffineBasis;
}

function resolveProjectedEntityGeometry(
  projection: NonNullable<CoreV2ProjectionIndex['byEntityId'][string]>,
  view: CoreV2SurfaceView,
): ResolvedEntityGeometry {
  const orientedWorldAffine = multiplyCoreV2Affine(
    createCoreV2Affine(0, 0, 0, view.flipX ? -1 : 1, view.flipY ? -1 : 1),
    createCoreV2Affine(0, 0, view.rotation),
  );
  let worldCorners: readonly (readonly [number, number])[];
  let screenBasis: CoreV2AffineBasis;
  if (projection.contentOrientation === 'upright') {
    const inverseWorld = invertCoreV2Affine(orientedWorldAffine);
    const width = projection.localBounds[2] * Math.hypot(
      projection.affine[0],
      projection.affine[1],
    );
    const height = projection.localBounds[3] * Math.hypot(
      projection.affine[2],
      projection.affine[3],
    );
    const xAxis = Object.freeze([inverseWorld[0], inverseWorld[1]] as const);
    const yAxis = Object.freeze([inverseWorld[2], inverseWorld[3]] as const);
    const [centerX, centerY] = projection.visibleCenter;
    worldCorners = Object.freeze([
      Object.freeze([centerX - xAxis[0] * width / 2 - yAxis[0] * height / 2, centerY - xAxis[1] * width / 2 - yAxis[1] * height / 2] as const),
      Object.freeze([centerX + xAxis[0] * width / 2 - yAxis[0] * height / 2, centerY + xAxis[1] * width / 2 - yAxis[1] * height / 2] as const),
      Object.freeze([centerX + xAxis[0] * width / 2 + yAxis[0] * height / 2, centerY + xAxis[1] * width / 2 + yAxis[1] * height / 2] as const),
      Object.freeze([centerX - xAxis[0] * width / 2 + yAxis[0] * height / 2, centerY - xAxis[1] * width / 2 + yAxis[1] * height / 2] as const),
    ]);
    screenBasis = Object.freeze([1, 0, 0, 1] as const);
  } else {
    worldCorners = coreV2AffineCorners(projection.affine, projection.localBounds);
    screenBasis = coreV2AffineBasis(multiplyCoreV2Affine(orientedWorldAffine, projection.affine));
  }
  const screenCorners = worldCorners.map((point) => surfacePointToScreen(point, view));
  return Object.freeze({
    worldBounds: boundsForTuplePoints(worldCorners),
    screenBounds: boundsForTuplePoints(screenCorners),
    screenBasis,
  });
}

function resolveDenseEntityGeometry(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
  view: CoreV2SurfaceView,
): ResolvedEntityGeometry {
  const worldCorners = rotatedWorldCorners(bounds, rotation).map((point) => freezePoint(point.x, point.y));
  const screenCorners = worldCorners.map((point) => surfacePointToScreen(point, view));
  const worldAffine = multiplyCoreV2Affine(
    createCoreV2Affine(0, 0, 0, view.flipX ? -1 : 1, view.flipY ? -1 : 1),
    createCoreV2Affine(0, 0, view.rotation + rotation),
  );
  return Object.freeze({
    worldBounds: boundsForTuplePoints(worldCorners),
    screenBounds: boundsForTuplePoints(screenCorners),
    screenBasis: coreV2AffineBasis(worldAffine),
  });
}

function surfacePointToScreen(
  point: readonly [number, number],
  view: CoreV2SurfaceView,
): readonly [number, number] {
  const scaledX = point[0] * view.scale;
  const scaledY = point[1] * view.scale;
  const radians = view.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return freezePoint(
    view.x + (scaledX * cosine - scaledY * sine) * (view.flipX ? -1 : 1),
    view.y + (scaledX * sine + scaledY * cosine) * (view.flipY ? -1 : 1),
  );
}

function boundsForTuplePoints(
  points: readonly (readonly [number, number])[],
): readonly [number, number, number, number] {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return freezeBounds(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY);
}

function rotatedWorldCorners(
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  rotation: number,
): readonly CoreV2Point[] {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radians = rotation * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [-bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, bounds.height / 2],
    [-bounds.width / 2, bounds.height / 2],
  ] as const;
  return corners.map(([localX, localY]) => Object.freeze({
    x: centerX + localX * cosine - localY * sine,
    y: centerY + localX * sine + localY * cosine,
  }));
}

function unionBounds(
  bounds: readonly (readonly [number, number, number, number])[],
): readonly [number, number, number, number] | null {
  if (bounds.length === 0) return null;
  const minX = Math.min(...bounds.map((entry) => entry[0]));
  const minY = Math.min(...bounds.map((entry) => entry[1]));
  const maxX = Math.max(...bounds.map((entry) => entry[0] + entry[2]));
  const maxY = Math.max(...bounds.map((entry) => entry[1] + entry[3]));
  return freezeBounds(minX, minY, maxX - minX, maxY - minY);
}

function boundsCenter(
  bounds: readonly [number, number, number, number],
): readonly [number, number] {
  return freezePoint(bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2);
}

function freezeBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  return Object.freeze([
    snapGeometryScalar(x),
    snapGeometryScalar(y),
    snapGeometryScalar(width),
    snapGeometryScalar(height),
  ] as const);
}

function freezePoint(x: number, y: number): readonly [number, number] {
  return Object.freeze([snapGeometryScalar(x), snapGeometryScalar(y)] as const);
}

function snapGeometryScalar(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= 1e-12 ? integer : value;
}

function findElement(
  values: readonly NormalizedCoreV2Element[],
  id: string,
): Readonly<Record<string, unknown>> | null {
  for (const value of values) {
    if (value.id === id) return value;
    if (value.type === 'group') {
      const nested = findElement(value.children, id);
      if (nested) return nested;
    }
  }
  return null;
}
