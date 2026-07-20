import { CoreScene } from '../core-v1/scene';
import type {
  AdvanceResult,
  CommitResult,
  CorePoint,
  CoreSceneOptions,
  CoreView,
  EntityPatch,
  EntityRef,
  EntitySnapshot,
  FrameReport,
  HitTestOptions,
  LoadResult,
  QueryFilter,
  SceneSnapshot,
  SelectionSnapshot,
  TransactionBatch,
} from '../core-v1/contracts';
import type {
  ParseDiagnostic,
  ParseIdentityIndex,
  ParsePatchMapOptions,
  ParsePatchMapResult,
  CoreV2ProjectionIndex,
} from './contracts';
import { parsePatchMapV010 } from './parser';
import { withRendererDegradationDiagnostics } from './renderers/degradation';
import { InvalidationScheduler, type FrameSchedulerDebug } from './scheduler';
import {
  planCoreV2SceneReconcile,
  type CoreV2DenseReconcilePlan,
  type CoreV2ReconcileOptions as CoreV2DenseReconcileOptions,
} from './semantic/reconcile';
import {
  PixiCoreV2Renderer,
  type PixiCoreV2InitializationMetrics,
  type PixiCoreV2RendererOptions,
} from './renderers/pixi-renderer';
import type { PixiCoreV2RendererDebug } from './renderers/types';
import type { CoreV2WorldOrientation } from './renderers/types';
import {
  boundsFor,
  fitView,
  panView,
  zoomViewAt,
} from './view';

export interface CoreV2Options extends PixiCoreV2RendererOptions, CoreSceneOptions {
  readonly parse?: ParsePatchMapOptions;
  /** Schedule one invalidation frame after mutations. Defaults to true. */
  readonly autoRender?: boolean;
}

export interface CoreV2LoadResult {
  readonly parse: ParsePatchMapResult;
  readonly store: LoadResult;
  readonly normalizeMs: number;
  readonly storeLoadMs: number;
}

export interface CoreV2PrepareResult {
  readonly storeSyncMs: number;
  readonly gpuPrepareMs: number;
  readonly frame: FrameReport;
}

export interface CoreV2WorldTransform extends CoreV2WorldOrientation {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface CoreV2ReconcileOptions extends CoreV2DenseReconcileOptions {
  /** Parser/color options for the candidate input. Defaults to the Core options. */
  readonly parse?: ParsePatchMapOptions;
}

export interface CoreV2ReconcileTimings {
  readonly parseMs: number;
  readonly planMs: number;
  readonly commitMs: number;
  readonly totalMs: number;
}

export interface CoreV2ReconcileFacts {
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

interface CoreV2ReconcileResultBase {
  readonly parse: ParsePatchMapResult;
  readonly plan: CoreV2DenseReconcilePlan;
  readonly timings: CoreV2ReconcileTimings;
  readonly facts: CoreV2ReconcileFacts;
}

export type CoreV2ReconcileResult =
  | Readonly<CoreV2ReconcileResultBase & {
      readonly status: 'committed';
      readonly commit: CommitResult;
    }>
  | Readonly<CoreV2ReconcileResultBase & {
      readonly status: 'refused';
      readonly commit: null;
    }>;

export interface CoreV2RuntimeDebug {
  readonly destroyed: boolean;
  readonly entityCount: number;
  readonly activeAnimations: number;
  readonly activeGestureCount: number;
  readonly selectionCount: number;
  readonly diagnostics: number;
  readonly renderer: PixiCoreV2RendererDebug;
  readonly scheduler: FrameSchedulerDebug;
}

export interface AnimateBarsOptions {
  readonly seed?: number;
  readonly fraction?: number;
  readonly durationMs?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
}

interface PanState {
  readonly pointerId: number;
  x: number;
  y: number;
}

export class CoreV2 {
  public readonly renderer: PixiCoreV2Renderer;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics;

  private readonly scene: CoreScene;
  private readonly scheduler: InvalidationScheduler;
  private readonly parseOptions: ParsePatchMapOptions;
  private readonly autoRender: boolean;
  private readonly unbindInteractions: () => void;
  private parseResultValue: ParsePatchMapResult | null = null;
  private currentView: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private worldFlipX = false;
  private worldFlipY = false;
  private animationClockMs = 0;
  private lastAnimationFrameTime: number | null = null;
  private lastFrameReport: FrameReport | null = null;
  private pan: PanState | null = null;
  private pointerSequence = 0;
  private entityCountValue = 0;
  private destroyedValue = false;

  private constructor(renderer: PixiCoreV2Renderer, options: CoreV2Options) {
    this.renderer = renderer;
    this.initializationMetrics = renderer.initializationMetrics;
    this.parseOptions = options.parse ?? {};
    this.autoRender = options.autoRender ?? true;
    this.scene = new CoreScene({
      renderer,
      ...(options.initialCapacity === undefined ? {} : { initialCapacity: options.initialCapacity }),
      ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
      ...(options.eventLimit === undefined ? {} : { eventLimit: options.eventLimit }),
    });
    this.scheduler = new InvalidationScheduler((timeMs) => this.renderScheduledFrame(timeMs));
    this.unbindInteractions = renderer.bindRootInteractions({
      pointerDown: (x, y, pointerId, button) => this.onPointerDown(x, y, pointerId, button),
      pointerMove: (x, y, pointerId) => this.onPointerMove(x, y, pointerId),
      pointerUp: (_x, _y, pointerId) => this.onPointerUp(pointerId),
      pointerCancel: (pointerId) => this.onPointerUp(pointerId),
      wheel: (x, y, deltaY) => this.zoomAt({ x, y }, Math.exp(-deltaY * 0.0015)),
    });
  }

  public static async create(options: CoreV2Options = {}): Promise<CoreV2> {
    const renderer = await PixiCoreV2Renderer.create(options);
    try {
      return new CoreV2(renderer, options);
    } catch (error) {
      renderer.destroy();
      await renderer.whenDestroyed();
      throw error;
    }
  }

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  public get entityCount(): number {
    return this.entityCountValue;
  }

  public get activeAnimations(): number {
    return this.destroyedValue ? 0 : this.scene.activeAnimations;
  }

  public get view(): CoreView {
    return this.currentView;
  }

  public get diagnostics(): readonly ParseDiagnostic[] {
    return this.parseResultValue?.diagnostics ?? [];
  }

  public get identity(): ParseIdentityIndex | null {
    return this.parseResultValue?.identity ?? null;
  }

  public get projection(): CoreV2ProjectionIndex | null {
    return this.parseResultValue?.projection ?? null;
  }

  public load(input: unknown, options: ParsePatchMapOptions = this.parseOptions): CoreV2LoadResult {
    this.assertAlive();
    const normalizeStarted = now();
    const parse = withRendererDegradationDiagnostics(
      parsePatchMapV010(input, options),
      this.renderer.strategy,
    );
    const normalizeMs = now() - normalizeStarted;
    const storeStarted = now();
    const store = this.scene.load(parse.document);
    const storeLoadMs = now() - storeStarted;
    this.parseResultValue = parse;
    this.entityCountValue = store.entityCount;
    this.currentView = parse.document.view ?? { x: 0, y: 0, scale: 1, rotation: 0 };
    this.animationClockMs = 0;
    this.lastAnimationFrameTime = null;
    this.renderer.setProjection(parse.projection);
    this.renderer.markChanges(store.changedRanges, 'load', { fullRebuild: true });
    this.invalidate('load');
    return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
  }

  /**
   * Incrementally reconcile a direct PATCH MAP v0.10 input into the current
   * dense store. Safe candidates commit exactly one batch; this method never
   * substitutes a scene load for a partial update.
   */
  public reconcile(
    input: unknown,
    options: CoreV2ReconcileOptions = {},
  ): CoreV2ReconcileResult {
    this.assertAlive();
    const currentParse = this.parseResultValue;
    if (currentParse === null) {
      throw new Error('CoreV2.reconcile requires a loaded PATCH MAP dataset');
    }

    const totalStarted = now();
    const before = this.scene.snapshot();
    const parseStarted = now();
    const parse = withRendererDegradationDiagnostics(
      parsePatchMapV010(input, options.parse ?? this.parseOptions),
      this.renderer.strategy,
    );
    const parseMs = now() - parseStarted;

    const planStarted = now();
    const plan = planCoreV2SceneReconcile(
      currentParse.document,
      parse.document,
      denseReconcileOptions(options),
    );
    const semanticChanged = !jsonEquivalent(currentParse, parse);
    const planMs = now() - planStarted;

    if (!plan.safeToCommit) {
      const after = this.scene.snapshot();
      return freezeReconcileResult({
        status: 'refused',
        parse,
        plan,
        commit: null,
        timings: {
          parseMs,
          planMs,
          commitMs: 0,
          totalMs: now() - totalStarted,
        },
        facts: reconcileFacts(plan, semanticChanged, before, after),
      });
    }

    const commitStarted = now();
    const commit = this.commit(plan.batch);
    const commitMs = now() - commitStarted;
    this.renderer.setProjection(parse.projection);
    this.parseResultValue = parse;
    const after = this.scene.snapshot();
    return freezeReconcileResult({
      status: 'committed',
      parse,
      plan,
      commit,
      timings: {
        parseMs,
        planMs,
        commitMs,
        totalMs: now() - totalStarted,
      },
      facts: reconcileFacts(plan, semanticChanged, before, after),
    });
  }

  /** Build aggregate CPU/GPU resources without presenting a visible frame. */
  public async prepare(): Promise<CoreV2PrepareResult> {
    this.assertAlive();
    this.renderer.synchronizeNextFlush();
    this.scheduler.cancelPending();
    const syncStarted = now();
    this.lastFrameReport = this.scene.flush();
    const storeSyncMs = now() - syncStarted;
    const frame = this.requireFrameReport();
    const prepareStarted = now();
    await this.renderer.prepareGpu();
    const gpuPrepareMs = now() - prepareStarted;
    return Object.freeze({ storeSyncMs, gpuPrepareMs, frame });
  }

  public flush(reason = 'manual'): FrameReport {
    this.assertAlive();
    this.scheduler.cancelPending();
    this.lastFrameReport = this.scene.flush();
    if (this.autoRender && this.scene.activeAnimations > 0) this.scheduler.invalidate(reason);
    return this.requireFrameReport();
  }

  public commit(batch: TransactionBatch): CommitResult {
    this.assertAlive();
    const result = this.scene.commit(batch);
    const hasGeometryChange = batch.operations.some(
      (operation) => operation.type !== 'view' && operation.type !== 'selection',
    );
    const hasSelection = batch.operations.some((operation) => operation.type === 'selection');
    const lastView = [...batch.operations].reverse().find((operation) => operation.type === 'view');
    if (lastView?.type === 'view') this.currentView = Object.freeze({ ...lastView.view });
    this.renderer.markChanges(hasGeometryChange ? result.changedRanges : [], 'commit');
    if (hasSelection) this.renderer.markOverlayChanges(result.changedRanges, 'selection');
    if (this.scene.activeAnimations > 0) this.lastAnimationFrameTime = null;
    this.invalidate(this.scene.activeAnimations > 0 ? 'animation' : 'commit');
    this.entityCountValue += result.added - result.removed;
    return result;
  }

  public advance(timeMs: number): AdvanceResult {
    this.assertAlive();
    const result = this.scene.advance(timeMs);
    this.animationClockMs = timeMs;
    this.renderer.markChanges(result.changedRanges, 'animation');
    return result;
  }

  public setView(view: CoreView): CommitResult {
    return this.commit({ operations: [{ type: 'view', view }] });
  }

  public setWorldTransform(view: CoreV2WorldTransform): CommitResult {
    this.assertAlive();
    validateWorldTransform(view);
    this.worldFlipX = view.flipX;
    this.worldFlipY = view.flipY;
    this.renderer.setWorldOrientation({
      rotationDegrees: view.rotationDegrees,
      flipX: view.flipX,
      flipY: view.flipY,
    });
    return this.setView({
      x: view.x,
      y: view.y,
      scale: view.scale,
      rotation: view.rotationDegrees,
    });
  }

  public panBy(delta: CorePoint): CommitResult {
    return this.setView(panView(this.currentView, delta));
  }

  public zoomAt(screenPoint: CorePoint, factor: number): CommitResult {
    if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError('zoom factor must be positive');
    return this.setView(zoomViewAt(this.currentView, screenPoint, this.currentView.scale * factor));
  }

  public resetView(): CommitResult {
    return this.setView({ x: 0, y: 0, scale: 1, rotation: 0 });
  }

  public fit(padding = 24): CommitResult | null {
    this.assertAlive();
    const snapshot = this.scene.snapshot();
    const bounds = boundsFor(snapshot.entities);
    if (!bounds) return null;
    return this.setView(fitView(bounds, { width: this.renderer.width, height: this.renderer.height }, padding));
  }

  public screenToWorld(point: CorePoint): CorePoint {
    this.assertAlive();
    return screenToWorldWithFlips(point, this.currentView, this.worldFlipX, this.worldFlipY);
  }

  public hitTestScreen(point: CorePoint, options: HitTestOptions = {}): EntityRef | null {
    this.assertAlive();
    return this.scene.hitTest(
      screenToWorldWithFlips(point, this.currentView, this.worldFlipX, this.worldFlipY),
      options,
    );
  }

  public selectAtScreen(point: CorePoint): EntityRef | null {
    this.assertAlive();
    const target = this.hitTestScreen(point, { interactiveOnly: true });
    const result = this.scene.commit({
      operations: [{ type: 'selection', targets: target ? [target] : [], mode: 'replace' }],
    });
    this.renderer.markChanges([], 'selection');
    this.renderer.markOverlayChanges(result.changedRanges, 'selection');
    this.invalidate('selection');
    return target;
  }

  public animateBarHeights(options: AnimateBarsOptions = {}): CommitResult {
    this.assertAlive();
    const fraction = clampFraction(options.fraction ?? 1);
    const minScale = options.minScale ?? 0.25;
    const maxScale = options.maxScale ?? 1.1;
    if (!(minScale > 0) || !(maxScale >= minScale)) throw new RangeError('invalid bar scale range');
    const random = seededRandom(options.seed ?? 0x5eedc0de);
    const bars = this.scene.query({ kinds: ['bar'] });
    const operations: TransactionBatch['operations'][number][] = [];
    for (const ref of bars) {
      if (random() > fraction) continue;
      const bar = this.scene.get(ref);
      if (!bar) continue;
      operations.push({
        type: 'animate',
        target: ref,
        property: 'height',
        to: Math.max(1, bar.bounds.height * (minScale + random() * (maxScale - minScale))),
        durationMs: options.durationMs ?? 240,
        easing: 'easeInOut',
      });
    }
    return this.commit({ operations });
  }

  public updateTexts(updates: Readonly<Record<string, string>>): CommitResult {
    const operations: TransactionBatch['operations'][number][] = [];
    for (const [id, text] of Object.entries(updates)) {
      operations.push({ type: 'patch', target: id, changes: { text } });
    }
    return this.commit({ operations });
  }

  public randomizeTexts(seed = 0x7e57, fraction = 0.1): CommitResult {
    this.assertAlive();
    const resolvedFraction = clampFraction(fraction);
    const random = seededRandom(seed);
    const updates: Record<string, string> = {};
    for (const ref of this.scene.query({ kinds: ['text'] })) {
      if (random() > resolvedFraction) continue;
      const entity = this.scene.get(ref);
      if (!entity) continue;
      updates[entity.id] = String(Math.floor(random() * 100_000));
    }
    return this.updateTexts(updates);
  }

  public resize(width: number, height: number, pixelRatio = this.renderer.pixelRatio): boolean {
    this.assertAlive();
    const changed = this.scene.resize(width, height, pixelRatio);
    if (changed) {
      this.renderer.markChanges([], 'resize');
      this.invalidate('resize');
    }
    return changed;
  }

  public async loadAsset(alias: string, url: string): Promise<void> {
    this.assertAlive();
    await this.renderer.loadAsset(alias, url);
    this.flush('asset-load-bind');
    await this.renderer.finalizeAssetUnloads();
  }

  public async unloadAsset(alias: string): Promise<boolean> {
    this.assertAlive();
    const unloaded = await this.renderer.unloadAsset(alias);
    if (unloaded) {
      // Render the fallback binding before releasing the prior texture source;
      // cached Pixi render instructions must never point at a destroyed source.
      this.flush('asset-unload-detach');
      await this.renderer.finalizeAssetUnloads();
    }
    return unloaded;
  }

  public async captureBase64(): Promise<string> {
    this.assertAlive();
    this.flush('capture');
    return this.renderer.captureBase64();
  }

  public ref(id: string): EntityRef | null {
    return this.scene.ref(id);
  }

  public get(target: string | EntityRef): EntitySnapshot | null {
    return this.scene.get(target);
  }

  public query(filter: QueryFilter = {}): readonly EntityRef[] {
    return this.scene.query(filter);
  }

  public selection(): SelectionSnapshot {
    return this.scene.selection();
  }

  public snapshot(): SceneSnapshot {
    return this.scene.snapshot();
  }

  public debugSnapshot(): CoreV2RuntimeDebug {
    const selectionCount = this.destroyedValue ? 0 : this.scene.selection().refs.length;
    return Object.freeze({
      destroyed: this.destroyedValue,
      entityCount: this.entityCountValue,
      activeAnimations: this.destroyedValue ? 0 : this.scene.activeAnimations,
      activeGestureCount: this.destroyedValue || this.pan === null ? 0 : 1,
      selectionCount,
      diagnostics: this.diagnostics.length,
      renderer: this.renderer.debugSnapshot(),
      scheduler: this.scheduler.debugSnapshot(),
    });
  }

  public async destroy(): Promise<boolean> {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.pan = null;
    this.scheduler.destroy();
    this.unbindInteractions();
    this.scene.destroy();
    await this.renderer.whenDestroyed();
    return true;
  }

  private renderScheduledFrame(timeMs: number): boolean {
    if (this.destroyedValue) return false;
    if (this.scene.activeAnimations > 0) {
      if (this.lastAnimationFrameTime === null) this.lastAnimationFrameTime = timeMs;
      const delta = Math.max(0, timeMs - this.lastAnimationFrameTime);
      this.lastAnimationFrameTime = timeMs;
      this.animationClockMs += delta;
      const advanced = this.scene.advance(this.animationClockMs);
      this.renderer.markChanges(advanced.changedRanges, 'animation');
    }
    this.lastFrameReport = this.scene.flush();
    const active = this.scene.activeAnimations > 0;
    if (!active) this.lastAnimationFrameTime = null;
    return active;
  }

  private invalidate(reason: string): void {
    if (this.autoRender) this.scheduler.invalidate(reason);
  }

  private onPointerDown(x: number, y: number, pointerId: number, button: number): void {
    if (this.destroyedValue) return;
    const target = this.selectAtScreen({ x, y });
    if (!target && (button === 0 || button === 1)) {
      this.pan = { pointerId, x, y };
      this.scheduler.setContinuous(true, 'gesture');
    }
  }

  private onPointerMove(x: number, y: number, pointerId: number): void {
    const pan = this.pan;
    if (!pan || pan.pointerId !== pointerId || this.destroyedValue) return;
    const delta = { x: x - pan.x, y: y - pan.y };
    pan.x = x;
    pan.y = y;
    this.panBy(delta);
  }

  private onPointerUp(pointerId: number): void {
    if (this.pan?.pointerId !== pointerId) return;
    this.pan = null;
    this.scheduler.setContinuous(false, 'gesture-end');
  }

  private requireFrameReport(): FrameReport {
    const report = this.lastFrameReport;
    if (!report) throw new Error('Core v2 has not produced a frame report');
    return report;
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('CoreV2 is destroyed');
  }
}

export function createCoreV2(options: CoreV2Options = {}): Promise<CoreV2> {
  return CoreV2.create(options);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('fraction must be between zero and one');
  }
  return value;
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function screenToWorldWithFlips(
  point: CorePoint,
  view: CoreView,
  flipX: boolean,
  flipY: boolean,
): CorePoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('screen point must contain finite coordinates');
  }
  const scale = view.scale;
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new RangeError('view scale must be positive and finite');
  }
  const dx = point.x - view.x;
  const dy = point.y - view.y;
  const unflippedX = dx * (flipX ? -1 : 1);
  const unflippedY = dy * (flipY ? -1 : 1);
  const radians = -(view.rotation ?? 0) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotatedX = unflippedX * cosine - unflippedY * sine;
  const rotatedY = unflippedX * sine + unflippedY * cosine;
  return Object.freeze({
    x: rotatedX / scale,
    y: rotatedY / scale,
  });
}

function validateWorldTransform(view: CoreV2WorldTransform): void {
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.rotationDegrees)
  ) {
    throw new RangeError('world transform position and rotation must be finite');
  }
  if (!(view.scale > 0) || !Number.isFinite(view.scale)) {
    throw new RangeError('world transform scale must be positive and finite');
  }
  if (typeof view.flipX !== 'boolean' || typeof view.flipY !== 'boolean') {
    throw new TypeError('world transform flips must be booleans');
  }
}

function denseReconcileOptions(
  options: CoreV2ReconcileOptions,
): CoreV2DenseReconcileOptions {
  return Object.freeze({
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  });
}

function reconcileFacts(
  plan: CoreV2DenseReconcilePlan,
  semanticChanged: boolean,
  before: SceneSnapshot,
  after: SceneSnapshot,
): CoreV2ReconcileFacts {
  return Object.freeze({
    semanticChanged,
    denseChanged: plan.batch.operations.length > 0,
    structuralChanged: plan.summary.added > 0 || plan.summary.removed > 0,
    structuralReplacement: plan.summary.replaced > 0,
    fullRebuild: false,
    revisionBefore: before.revision,
    revisionAfter: after.revision,
    entityCountBefore: before.entityCount,
    entityCountAfter: after.entityCount,
    selectionCountBefore: before.selection.refs.length,
    selectionCountAfter: after.selection.refs.length,
  });
}

function freezeReconcileResult<T extends CoreV2ReconcileResult>(result: T): T {
  return Object.freeze({
    ...result,
    timings: Object.freeze(result.timings),
    facts: Object.freeze(result.facts),
  }) as T;
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquivalent(value, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && jsonEquivalent(left[key], right[key]),
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object') return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export type { EntityPatch };
