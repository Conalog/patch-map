import { createCoreV2, type CoreV2, type CoreV2Options } from './core';
import {
  CoreV2DatasetError,
  materializeCoreV2Dataset,
  type MaterializedCoreV2Dataset,
  type NormalizedCoreV2Element,
} from './semantic/dataset';
import {
  createCoreV2SemanticProbe,
  type CoreV2SemanticProductProbe,
} from './semantic/probe';

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

export interface CoreV2SurfaceDebug {
  readonly cssSize: readonly [number, number];
  readonly backingSize: readonly [number, number];
  readonly selectionIds: readonly string[];
  readonly activeAnimationCount: number;
}

export interface CoreV2EngineSurface {
  readonly canvasCount: number;
  readonly destroyed: boolean;
  load(input: unknown): void;
  publishFrame(timeMs: number): void;
  resize(width: number, height: number, pixelRatio: number): boolean;
  setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void;
  select(ids: readonly string[]): void;
  hitTestScreen(point: CoreV2Point): string | null;
  screenToWorld(point: CoreV2Point): CoreV2Point;
  debugSnapshot(): CoreV2SurfaceDebug;
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
  readonly diagnostic: CoreV2EngineDiagnostic;
  readonly destroyed: Readonly<{ lifecycleGeneration: number }>;
};

type CoreV2EngineEvent = keyof CoreV2EngineEventMap;
type CoreV2EngineListener<K extends CoreV2EngineEvent> = (event: CoreV2EngineEventMap[K]) => void;

const DEFAULT_ZOOM_LIMITS = Object.freeze([0.5, 30] as const);
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
      historyDepth: 0,
    });
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

  private subscriptionCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) count += listeners.size;
    return count;
  }

  private resolvedSurfaceView(): Readonly<{ x: number; y: number; scale: number; rotation: number }> {
    return Object.freeze({
      x: this.viewportWidth / 2 - this.viewportCenterWorld[0] * this.viewportScale,
      y: this.viewportHeight / 2 - this.viewportCenterWorld[1] * this.viewportScale,
      scale: this.viewportScale,
      rotation: 0,
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

class PixiEngineSurface implements CoreV2EngineSurface {
  private readonly core: CoreV2;
  private canvasPresent = true;

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
  }

  public publishFrame(_timeMs: number): void {
    this.core.flush('engine-publication');
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    return this.core.resize(width, height, pixelRatio);
  }

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.core.setView(view);
  }

  public select(ids: readonly string[]): void {
    this.core.commit({ operations: [{ type: 'selection', targets: ids, mode: 'replace' }] });
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
    });
  }

  public async destroy(): Promise<boolean> {
    const destroyed = await this.core.destroy();
    this.canvasPresent = false;
    return destroyed;
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

function emptySurfaceDebug(width: number, height: number, pixelRatio: number): CoreV2SurfaceDebug {
  return Object.freeze({
    cssSize: Object.freeze([width, height] as [number, number]),
    backingSize: Object.freeze([
      Math.round(width * pixelRatio),
      Math.round(height * pixelRatio),
    ] as [number, number]),
    selectionIds: Object.freeze([] as string[]),
    activeAnimationCount: 0,
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
