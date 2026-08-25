import type { MaterializedPatchMapDataset } from '../semantic/dataset';
import {
  PATCH_MAP_VIEWPORT_REVISION,
  normalizePatchMapViewportPadding,
  patchMapBoundsCenter,
  patchMapViewportFitScale,
  resolvePatchMapViewportContributors,
  type PatchMapViewportContributorResult,
  type PatchMapViewportGeometry,
} from '../viewport';
import type { PatchMapEngineSurface, PatchMapSurfaceViewportInput } from './contracts';
import type {
  PatchMapRevisionStamp,
} from './contracts/lifecycle';
import type {
  PatchMapSerializedViewportState,
  PatchMapViewportChangeResult,
  PatchMapViewportChangeSource,
  PatchMapViewportFitOptions,
  PatchMapViewportFitResult,
  PatchMapViewportFocusResult,
  PatchMapViewportPersistenceProbe,
  PatchMapViewportPolicyOperation,
  PatchMapViewportPolicyProbe,
  PatchMapViewportRestoreResult,
  PatchMapViewportSettleResult,
  PatchMapViewportState,
  PatchMapViewportTargetOptions,
  PatchMapViewportTransformProbe,
  PatchMapWorldTransformInput,
  PatchMapWorldTransformState,
} from './contracts/viewport';
import { finiteTuple, validatePositiveFinite } from './input-contracts';
import type {
  PatchMapViewportAuthority,
  PatchMapViewportAuthoritySnapshot,
  PatchMapViewportViewEffect,
} from './viewport-authority';

export interface PatchMapViewportRuntimePort {
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly liveSurface: () => PatchMapEngineSurface | null;
  readonly isSurfaceInputCurrent: (surface: PatchMapEngineSurface) => boolean;
  readonly materialized: () => MaterializedPatchMapDataset | null;
  readonly revisionStamp: () => PatchMapRevisionStamp;
  readonly viewRevision: () => number;
  readonly advanceView: () => void;
  readonly refreshAccessibilitySurface: (operation: string) => void;
  readonly emitViewChanged: (result: PatchMapViewportChangeResult) => void;
  readonly emitViewSettled: (result: PatchMapViewportSettleResult) => void;
  readonly emitViewportPolicyChanged: (probe: PatchMapViewportPolicyProbe) => void;
  readonly isDestroyingOrDestroyed: () => boolean;
  readonly unsupportedRuntimeError: (operation: string) => Error;
}

/**
 * Owns viewport runtime effects around the pure viewport authority. Surface,
 * publication, accessibility, and host event ordering are committed here so
 * the Engine only exposes delegating public methods.
 */
export class PatchMapViewportRuntimeCoordinator {
  private defaultContributorsCache: Readonly<{
    readonly dataset: MaterializedPatchMapDataset['dataset'];
    readonly geometry: PatchMapViewportGeometry;
    readonly result: PatchMapViewportContributorResult;
  }> | null = null;

  public constructor(
    private readonly authority: PatchMapViewportAuthority,
    private readonly port: PatchMapViewportRuntimePort,
  ) {}

  public initialize(input: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
    readonly zoomLimits: readonly [number, number];
    readonly viewRevision: number;
  }>): PatchMapViewportAuthoritySnapshot {
    this.defaultContributorsCache = null;
    return this.authority.initialize(input);
  }

  public snapshot(): PatchMapViewportAuthoritySnapshot {
    return this.authority.snapshot();
  }

  public get motionActive(): boolean {
    return this.authority.motionActive;
  }

  public orderedEnabledPolicies(): ReturnType<PatchMapViewportAuthority['orderedEnabledPolicies']> {
    return this.authority.orderedEnabledPolicies();
  }

  public invalidateContributors(): void {
    this.defaultContributorsCache = null;
  }

  public completePendingResizeFrame(surface: PatchMapEngineSurface): void {
    if (!this.authority.resizeFramePending) return;
    this.authority.completeResizeFrame(
      (this.port.materialized()?.rootIds.length ?? 0) > 0,
      surface.debugSnapshot().visiblePrimitiveCount,
    );
  }

  public resize(
    width: number,
    height: number,
    pixelRatio = globalThis.devicePixelRatio ?? 1,
  ): boolean {
    validatePositiveFinite('width', width);
    validatePositiveFinite('height', height);
    validatePositiveFinite('pixelRatio', pixelRatio);
    const surface = this.port.requireSurface('resize');
    const previous = this.authority.snapshot().viewport;
    const previousRevisions = this.port.revisionStamp();
    const effect = this.authority.planResize(width, height, pixelRatio);
    const changed = surface.resize(width, height, pixelRatio);
    if (!changed) return false;
    surface.setView(effect.surfaceView);
    const nextViewRevision = this.port.viewRevision() + 1;
    this.authority.commitResize(effect, nextViewRevision);
    this.port.advanceView();
    this.port.emitViewChanged(Object.freeze({
      changed: true,
      blocked: false,
      source: 'resize',
      previous,
      viewport: this.authority.snapshot().viewport,
      previousRevisions,
      revisions: this.port.revisionStamp(),
    } satisfies PatchMapViewportChangeResult));
    return true;
  }

  public viewportProbe(): PatchMapViewportState {
    return this.authority.snapshot().viewport;
  }

  public viewportTransformProbe(): PatchMapViewportTransformProbe {
    const surface = this.port.requireSurface('viewportTransformProbe');
    const debug = surface.debugSnapshot();
    const viewport = this.authority.snapshot();
    return Object.freeze({
      schemaRevision: PATCH_MAP_VIEWPORT_REVISION,
      world: viewport.world,
      ...this.authority.resizeProbe(),
      surface: Object.freeze({
        canvasCount: surface.canvasCount,
        cssSize: debug.cssSize,
        backingSize: debug.backingSize,
      }),
    });
  }

  public panViewport(
    deltaCss: readonly [number, number],
    source: PatchMapViewportChangeSource = 'pointer',
  ): PatchMapViewportChangeResult {
    const delta = finiteTuple(deltaCss, 'deltaCss');
    const surface = this.port.requireSurface('panViewport');
    const viewport = this.authority.snapshot();
    if (
      (source === 'pointer' || source === 'middle-pointer') &&
      !this.authority.hasPolicy('pan')
    ) {
      return this.blockedResult(source);
    }
    if (source === 'deceleration' && !this.authority.hasPolicy('deceleration')) {
      return this.blockedResult(source);
    }
    const center = surface.screenToWorld({
      x: viewport.width / 2 - delta[0],
      y: viewport.height / 2 - delta[1],
    });
    return this.commit([center.x, center.y], viewport.scale, source);
  }

  public zoomViewportAt(input: Readonly<{
    readonly factor: number;
    readonly anchorCss: readonly [number, number];
    readonly source?: 'wheel' | 'modifier-wheel' | 'pinch' | 'programmatic';
  }>): PatchMapViewportChangeResult {
    if (!Number.isFinite(input.factor) || !(input.factor > 0)) {
      throw new RangeError('zoom factor must be positive and finite');
    }
    const anchor = finiteTuple(input.anchorCss, 'anchorCss');
    const source = input.source ?? 'wheel';
    const policy = source === 'pinch'
      ? 'pinch'
      : source === 'programmatic' ? null : 'wheel';
    const surface = this.port.requireSurface('zoomViewportAt');
    if (policy !== null && !this.authority.hasPolicy(policy)) {
      return this.blockedResult(source);
    }
    const viewport = this.authority.snapshot();
    const worldUnderAnchor = surface.screenToWorld({ x: anchor[0], y: anchor[1] });
    const nextScale = Math.min(
      viewport.zoomLimits[1],
      Math.max(viewport.zoomLimits[0], viewport.scale * input.factor),
    );
    const ratio = viewport.scale / nextScale;
    const center: readonly [number, number] = Object.freeze([
      worldUnderAnchor.x -
        (worldUnderAnchor.x - viewport.centerWorld[0]) * ratio,
      worldUnderAnchor.y -
        (worldUnderAnchor.y - viewport.centerWorld[1]) * ratio,
    ]);
    return this.commit(center, nextScale, source);
  }

  public startDeceleration(velocityCssPxPerMs: readonly [number, number]): boolean {
    const velocity = finiteTuple(velocityCssPxPerMs, 'velocityCssPxPerMs');
    this.port.requireSurface('startViewportDeceleration');
    return this.authority.startMotion(velocity);
  }

  public advanceMotion(deltaMs: number): PatchMapViewportChangeResult {
    const effect = this.authority.planMotionAdvance(deltaMs);
    if (effect.blocked) {
      this.authority.commitMotion(effect);
      return this.blockedResult('deceleration');
    }
    const result = this.panViewport(effect.displacementCss, 'deceleration');
    this.authority.commitMotion(effect);
    return result;
  }

  public cancelMotion(): boolean {
    const changed = this.authority.cancelMotion();
    this.port.liveSurface()?.cancelViewportGestures?.();
    return changed;
  }

  public settle(): PatchMapViewportSettleResult {
    this.port.requireSurface('settleViewport');
    this.cancelMotion();
    const result = this.authority.settle();
    if (result.changed) this.port.emitViewSettled(result);
    return result;
  }

  public serialize(): PatchMapSerializedViewportState {
    this.port.requireSurface('serializeViewport');
    return this.authority.serialize();
  }

  public persistenceProbe(): PatchMapViewportPersistenceProbe {
    return this.authority.persistenceProbe();
  }

  public restore(
    input: unknown,
    fallback: PatchMapViewportFitOptions = {},
  ): PatchMapViewportRestoreResult {
    const restored = this.authority.normalizeSerialized(input);
    if (restored !== null) {
      const result = this.commit(restored.centerWorld, restored.scale, 'restore');
      return Object.freeze({
        status: 'restored',
        changed: result.changed,
        viewport: result.viewport,
        fit: null,
      });
    }
    const fit = this.fit(fallback, 'fallback-fit');
    return Object.freeze({
      status: 'fallback:auto-fit',
      changed: fit.changed,
      viewport: fit.viewport,
      fit,
    });
  }

  public focus(options: PatchMapViewportTargetOptions = {}): PatchMapViewportFocusResult {
    const contributors = this.resolveContributors(options);
    const viewport = this.authority.snapshot();
    if (contributors.worldBounds === null) {
      return Object.freeze({
        ...contributors,
        status: 'empty',
        changed: false,
        viewport: viewport.viewport,
      });
    }
    const change = this.commit(
      patchMapBoundsCenter(contributors.worldBounds),
      viewport.scale,
      'focus',
    );
    return Object.freeze({
      ...contributors,
      status: 'applied',
      changed: change.changed,
      viewport: change.viewport,
    });
  }

  public fit(
    options: PatchMapViewportFitOptions = {},
    source: 'fit' | 'fallback-fit' = 'fit',
  ): PatchMapViewportFitResult {
    const padding = normalizePatchMapViewportPadding(options.paddingCssPx);
    const contributors = this.resolveContributors(options);
    const viewport = this.authority.snapshot();
    const paddingCssPx = Object.freeze([padding.x, padding.y] as const);
    if (contributors.worldBounds === null) {
      return Object.freeze({
        ...contributors,
        status: 'empty',
        changed: false,
        paddingCssPx,
        viewport: viewport.viewport,
      });
    }
    const scale = patchMapViewportFitScale(
      contributors.worldBounds,
      [viewport.width, viewport.height],
      padding,
      viewport.world.rotationDegrees,
      viewport.zoomLimits,
    );
    const change = this.commit(
      patchMapBoundsCenter(contributors.worldBounds),
      scale,
      source,
    );
    return Object.freeze({
      ...contributors,
      status: 'applied',
      changed: change.changed,
      paddingCssPx,
      viewport: change.viewport,
    });
  }

  public configurePolicy(
    operation: PatchMapViewportPolicyOperation,
  ): PatchMapViewportPolicyProbe {
    const surface = this.port.requireSurface('configureViewportPolicy');
    const effect = this.authority.planPolicy(operation);
    if (effect.cancelGestures) surface.cancelViewportGestures?.();
    surface.setViewportGesturePolicies?.(effect.enabledPolicies);
    this.authority.commitPolicy(effect);
    const probe = this.policyProbe();
    this.port.emitViewportPolicyChanged(probe);
    return probe;
  }

  public policyProbe(): PatchMapViewportPolicyProbe {
    return this.authority.policyProbe(this.port.isDestroyingOrDestroyed());
  }

  public setViewport(input: Readonly<{
    readonly centerWorld: readonly [number, number];
    readonly scale: number;
  }>): PatchMapViewportState {
    return this.commit(input.centerWorld, input.scale, 'programmatic').viewport;
  }

  public setViewportAbsolute(input: Readonly<{
    readonly centerWorld: readonly [number, number];
    readonly scale: number;
  }>): PatchMapViewportChangeResult {
    return this.commit(input.centerWorld, input.scale, 'restore');
  }

  public setWorldTransform(input: PatchMapWorldTransformInput): PatchMapWorldTransformState {
    const effect = this.authority.planWorldTransform(input);
    const surface = this.port.requireSurface('setWorldTransform');
    if (!effect.changed) return effect.world;
    surface.setView(effect.surfaceView);
    const nextViewRevision = this.port.viewRevision() + 1;
    this.authority.commitWorldTransform(effect, nextViewRevision);
    this.port.advanceView();
    return effect.world;
  }

  public acceptSurfaceInput(
    surface: PatchMapEngineSurface,
    input: PatchMapSurfaceViewportInput,
  ): void {
    if (!this.port.isSurfaceInputCurrent(surface)) return;
    const effect = this.authority.planSurfaceAppliedView(input.centerWorld, input.scale);
    this.commitEffect(surface, effect, input.source);
  }

  public destroy(): void {
    this.defaultContributorsCache = null;
    this.authority.destroy();
  }

  private commit(
    centerWorld: readonly [number, number],
    scale: number,
    source: PatchMapViewportChangeSource,
  ): PatchMapViewportChangeResult {
    const effect = this.authority.planView(centerWorld, scale);
    const surface = this.port.requireSurface('setViewport');
    return this.commitEffect(surface, effect, source);
  }

  private commitEffect(
    surface: PatchMapEngineSurface,
    effect: PatchMapViewportViewEffect,
    source: PatchMapViewportChangeSource,
  ): PatchMapViewportChangeResult {
    const previousRevisions = this.port.revisionStamp();
    if (effect.changed) {
      if (!effect.surfaceAlreadyApplied) surface.setView(effect.surfaceView);
      const nextViewRevision = this.port.viewRevision() + 1;
      this.authority.commitView(effect, nextViewRevision);
      this.port.advanceView();
      this.port.refreshAccessibilitySurface('setViewport');
    }
    const result = Object.freeze({
      changed: effect.changed,
      blocked: false,
      source,
      previous: effect.previous,
      viewport: effect.viewport,
      previousRevisions,
      revisions: this.port.revisionStamp(),
    } satisfies PatchMapViewportChangeResult);
    if (effect.changed) this.port.emitViewChanged(result);
    return result;
  }

  private blockedResult(source: PatchMapViewportChangeSource): PatchMapViewportChangeResult {
    const viewport = this.authority.snapshot().viewport;
    const revisions = this.port.revisionStamp();
    return Object.freeze({
      changed: false,
      blocked: true,
      source,
      previous: viewport,
      viewport,
      previousRevisions: revisions,
      revisions,
    });
  }

  private resolveContributors(
    options: PatchMapViewportTargetOptions,
  ): PatchMapViewportContributorResult {
    const surface = this.port.requireSurface('resolveViewportContributors');
    const materialized = this.port.materialized();
    if (materialized === null) {
      return Object.freeze({
        contributors: Object.freeze([]),
        applied: Object.freeze([]),
        missing: Object.freeze([...(options.targets ?? [])]),
        excluded: Object.freeze([]),
        duplicateCount: 0,
        worldBounds: null,
      });
    }
    const geometry = surface.worldGeometrySnapshot?.() ?? surface.geometrySnapshot?.();
    if (!geometry) throw this.port.unsupportedRuntimeError('resolveViewportContributors');
    const defaultRequest =
      (options.targets === undefined || options.targets === null) &&
      options.rejectIds === undefined &&
      options.relationEndpointsAvailable === undefined;
    const cached = this.defaultContributorsCache;
    if (
      defaultRequest &&
      cached !== null &&
      cached.dataset === materialized.dataset &&
      cached.geometry === geometry
    ) {
      return cached.result;
    }
    const result = resolvePatchMapViewportContributors(materialized.dataset, geometry, {
      targets: options.targets ?? null,
      ...(options.rejectIds === undefined ? {} : { rejectIds: options.rejectIds }),
      ...(options.relationEndpointsAvailable === undefined
        ? {}
        : { relationEndpointsAvailable: options.relationEndpointsAvailable }),
    });
    if (defaultRequest) {
      this.defaultContributorsCache = Object.freeze({
        dataset: materialized.dataset,
        geometry,
        result,
      });
    }
    return result;
  }
}
