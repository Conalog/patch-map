import {
  createPatchMapRuntime,
  type PatchMapRuntime,
  type PatchMapBarPresentationProductProbe,
  type PatchMapComponentVisualTarget,
  type PatchMapInstanceBarHeightBatchRequest,
  type PatchMapInstanceBarHeightBatchResult,
  type PatchMapPresentationLifecycleResult,
  type PatchMapRootPointerInput,
  type PatchMapRuntimeOptions,
  type PatchMapSelectionMarqueeInput,
  type PatchMapSelectionOverlayPolicyInput,
  type PatchMapSemanticRefreshResult,
  type PatchMapTextProductProbe,
  type PatchMapTextTarget,
  type PatchMapTransientProjectionResult,
} from '../core';
import type {
  PatchMapPresentationPolicyInput,
  PatchMapPresentationPolicyProductProbe,
} from '../presentation-policy';
import type { PatchMapPaintOrderProductProbe } from '../paint-order-product';
import type { SceneSnapshot } from '../dense/contracts';
import type {
  PatchMapImageSourceKind,
  PatchMapProjectionIndex,
} from '../contracts';
import type {
  PatchMapPixiPublicSurfaceProbe,
  PatchMapPixiRendererLossProbe,
} from '../renderers/types';
import type {
  PatchMapSceneImageAttemptProbe,
  PatchMapSceneImageProductProbe,
  PatchMapSceneImageRetryResult,
} from '../scene-images';
import type { PatchMapAssetSource } from '../semantic/dataset';
import type { PatchMapSemanticTarget } from '../semantic/probe';
import type { PatchMapReconcileDiagnostic } from '../semantic/reconcile';
import {
  PatchMapScreenRegionIndex,
  type PatchMapScreenRegionBounds,
} from '../semantic/screen-region-index';
import type {
  PatchMapAccessibilityActivationInput,
  PatchMapAccessibilityRenderNode,
  PatchMapAccessibilitySurfaceProbe,
} from '../accessibility';
import type {
  PatchMapViewportGeometry,
  PatchMapViewportPolicy,
} from '../viewport';
import type {
  PatchMapEngineSceneImageAttemptProbe,
  PatchMapEngineSceneImageRecord,
  PatchMapEngineSceneImagesProbe,
  PatchMapEngineSurface,
  PatchMapInteractionOwnershipProbe,
  PatchMapSurfaceComponentVisualProbe,
  PatchMapSurfaceDebug,
  PatchMapSurfaceOptions,
  PatchMapSurfacePointerInput,
  PatchMapSurfacePrepareResult,
  PatchMapSurfaceReconcileOptions,
  PatchMapSurfaceReconcileResult,
  PatchMapSurfaceRendererPort,
  PatchMapSurfaceViewportInput,
} from './contracts';
import type {
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitOptions,
  PatchMapSurfaceEntityGeometry,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceRegionGeometryCandidates,
  PatchMapSurfaceRelationGeometry,
  PatchMapSurfaceView,
} from './surface-contract';
import {
  buildPatchMapRelationHitIndex,
  createPatchMapSurfaceEntityGeometry,
  createPatchMapSurfaceGeometrySnapshot,
  createPatchMapSurfaceWorldGeometrySnapshot,
  emptyPatchMapRelationHitIndex,
  hitTestPatchMapSurfaceRelations,
  queryPatchMapRelationHitIndex,
  selectionOverlayFromEntityGeometry,
} from './surface-geometry';

export class PixiEngineSurface implements PatchMapEngineSurface {
  private readonly core: PatchMapRuntime;
  private readonly renderer: PatchMapSurfaceRendererPort;
  private readonly unbindCoreViewportChanges: () => void;
  private readonly unbindCorePointerInputs: () => void;
  private viewportInputListener:
    | ((input: PatchMapSurfaceViewportInput) => void)
    | null = null;
  private pointerInputListener:
    | ((input: PatchMapSurfacePointerInput) => void)
    | null = null;
  private canvasPresent = true;
  private geometryRevision = 0;
  private worldGeometryCache: PatchMapViewportGeometry | null = null;
  private worldGeometryProjection: PatchMapProjectionIndex | null = null;
  private geometryCache: PatchMapSurfaceGeometrySnapshot | null = null;
  private geometryBaseCache: PatchMapSurfaceGeometrySnapshot | null = null;
  private geometryById = new Map<string, PatchMapSurfaceEntityGeometry>();
  private geometryProjection: PatchMapProjectionIndex | null = null;
  private geometryRevisionProjection: PatchMapProjectionIndex | null = null;
  private regionHitIndex: PatchMapScreenRegionIndex<
    PatchMapSurfaceEntityGeometry,
    PatchMapSurfaceRelationGeometry
  > | null = null;
  private relationHitIndex = emptyPatchMapRelationHitIndex();
  private surfaceView: PatchMapSurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(core: PatchMapRuntime) {
    this.core = core;
    this.renderer = core.renderer;
    this.unbindCoreViewportChanges = typeof core.bindRootViewportChanges === 'function'
      ? core.bindRootViewportChanges(({ source, view }) => {
          const orientationChanged = (
            view.rotation !== undefined &&
            view.rotation !== this.surfaceView.rotation
          );
          this.surfaceView = Object.freeze({
            ...this.surfaceView,
            x: view.x,
            y: view.y,
            scale: view.scale,
            rotation: view.rotation ?? this.surfaceView.rotation,
          });
          this.geometryRevision += 1;
          if (orientationChanged) this.invalidateGeometryCache();
          else this.invalidateScreenGeometryCache();
          const center = core.screenToWorld({
            x: core.renderer.width / 2,
            y: core.renderer.height / 2,
          });
          this.viewportInputListener?.(Object.freeze({
            source,
            centerWorld: Object.freeze([center.x, center.y] as const),
            scale: view.scale,
          }));
        })
      : () => {};
    this.unbindCorePointerInputs = typeof core.bindRootPointerInputs === 'function'
      ? core.bindRootPointerInputs((input) => {
          this.pointerInputListener?.(surfacePointerInput(input));
        })
      : () => {};
  }

  public get canvasCount(): number {
    return this.canvasPresent ? 1 : 0;
  }

  public get destroyed(): boolean {
    return this.core.destroyed;
  }

  public canvasElement(): HTMLCanvasElement {
    return this.core.renderer.canvas;
  }

  public captureBase64(): Promise<string> {
    return this.core.captureBase64();
  }

  public async prepare(): Promise<PatchMapSurfacePrepareResult> {
    const prepared = await this.core.prepare();
    return Object.freeze({
      storeSyncMs: prepared.storeSyncMs,
      gpuPrepareMs: prepared.gpuPrepareMs,
    });
  }

  public load(input: unknown): void {
    this.core.load(input);
    this.geometryRevision += 1;
    this.geometryRevisionProjection = this.core.visibleProjection;
    this.invalidateGeometryCache();
  }

  public async loadAsync(input: unknown, assertCurrent?: () => void): Promise<void> {
    await this.core.loadAsync(
      input,
      undefined,
      assertCurrent === undefined ? {} : { assertCurrent },
    );
    this.geometryRevision += 1;
    this.geometryRevisionProjection = this.core.visibleProjection;
    this.invalidateGeometryCache();
  }

  public reconcile(
    input: unknown,
    options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    const result = this.core.reconcile(input, {
      ...(options.animateBarChanges === undefined
        ? {}
        : { animateBarChanges: options.animateBarChanges }),
      ...(options.animatedBarTargets === undefined
        ? {}
        : { animatedBarTargets: options.animatedBarTargets }),
      ...(options.allowedComponentOrderOwners === undefined
        ? {}
        : { allowedComponentOrderOwners: options.allowedComponentOrderOwners }),
      ...(options.allowedElementOrderIds === undefined
        ? {}
        : { allowedElementOrderIds: options.allowedElementOrderIds }),
      ...(options.selectionIds === undefined
        ? {}
        : { selectionIds: options.selectionIds }),
      ...(options.incrementalRootIds === undefined
        ? {}
        : { incrementalRootIds: options.incrementalRootIds }),
      ...(options.structuralSharing === undefined
        ? {}
        : { structuralSharing: options.structuralSharing }),
      ...(options.directBarHeightUpdates === undefined
        ? {}
        : { directBarHeightUpdates: options.directBarHeightUpdates }),
      ...(options.directTextUpdates === undefined
        ? {}
        : { directTextUpdates: options.directTextUpdates }),
      ...(options.directElementAngleUpdates === undefined
        ? {}
        : { directElementAngleUpdates: options.directElementAngleUpdates }),
    });
    if (result.status === 'committed') {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = this.core.visibleProjection;
      this.invalidateGeometryCache();
    }
    return Object.freeze({
      status: result.status,
      operationCount: result.plan.summary.operationCount,
      denseChanged: result.facts.denseChanged,
      diagnostics: freezeReconcileDiagnostics(result.plan.diagnostics),
      timings: result.timings,
    });
  }

  public previewIncrementalRoots(
    input: unknown,
    dirtyRootIds: readonly string[],
  ): PatchMapTransientProjectionResult | null {
    const result = this.core.previewIncrementalRoots(input, dirtyRootIds);
    if (result?.changed) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = this.core.visibleProjection;
      this.invalidateGeometryCache();
    }
    return result;
  }

  public clearIncrementalPreview(): PatchMapTransientProjectionResult {
    const result = this.core.clearIncrementalPreview();
    if (result.changed) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = this.core.visibleProjection;
      this.invalidateGeometryCache();
    }
    return result;
  }

  public updateInstanceBarHeights(
    request: PatchMapInstanceBarHeightBatchRequest,
  ): PatchMapInstanceBarHeightBatchResult {
    const result = this.core.updateInstanceBarHeights(request);
    if (result.changed) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = this.core.visibleProjection;
      this.invalidateGeometryCache();
    }
    return result;
  }

  public publishFrame(timeMs: number): void {
    const projectionBefore = this.core.visibleProjection;
    const presentationRevisionBefore = this.core.presentationRevision;
    this.core.publishFrame(timeMs);
    const projectionAfter = this.core.visibleProjection;
    if (
      projectionAfter !== projectionBefore ||
      this.core.presentationRevision !== presentationRevisionBefore
    ) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = projectionAfter;
      this.invalidateGeometryCache();
    }
  }

  public suspendPresentation(
    timeMs: number,
  ): PatchMapPresentationLifecycleResult {
    const result = this.core.suspendPresentation(timeMs);
    this.geometryRevision += 1;
    this.geometryRevisionProjection = this.core.visibleProjection;
    this.invalidateGeometryCache();
    return result;
  }

  public resumePresentation(
    timeMs: number,
  ): PatchMapPresentationLifecycleResult {
    const result = this.core.resumePresentation(timeMs);
    this.geometryRevision += 1;
    this.geometryRevisionProjection = this.core.visibleProjection;
    this.invalidateGeometryCache();
    return result;
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = this.core.resize(width, height, pixelRatio);
    if (changed) {
      this.geometryRevision += 1;
      this.invalidateScreenGeometryCache();
    }
    return changed;
  }

  public setView(view: PatchMapSurfaceView): void {
    const nextView = Object.freeze({
      ...view,
      flipX: view.flipX ?? false,
      flipY: view.flipY ?? false,
    });
    const orientationChanged = (
      nextView.rotation !== this.surfaceView.rotation ||
      nextView.flipX !== this.surfaceView.flipX ||
      nextView.flipY !== this.surfaceView.flipY
    );
    this.core.setWorldTransform({
      x: nextView.x,
      y: nextView.y,
      scale: nextView.scale,
      rotationDegrees: nextView.rotation,
      flipX: nextView.flipX,
      flipY: nextView.flipY,
    });
    this.surfaceView = nextView;
    this.geometryRevision += 1;
    if (orientationChanged) this.invalidateGeometryCache();
    else this.invalidateScreenGeometryCache();
  }

  public setViewportGesturePolicies(
    policies: readonly PatchMapViewportPolicy[],
  ): void {
    this.core.setViewportGesturePolicies(policies);
  }

  public setViewportZoomLimits(limits: readonly [number, number]): void {
    this.core.setViewportZoomLimits(limits);
  }

  public bindViewportInput(
    listener: (input: PatchMapSurfaceViewportInput) => void,
  ): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('viewport input listener must be a function');
    }
    if (this.viewportInputListener !== null) {
      throw new Error('viewport input listener is already bound');
    }
    this.viewportInputListener = listener;
    return () => {
      if (this.viewportInputListener === listener) this.viewportInputListener = null;
    };
  }

  public bindPointerInput(
    listener: (input: PatchMapSurfacePointerInput) => void,
  ): () => void {
    if (typeof listener !== 'function') {
      throw new TypeError('pointer input listener must be a function');
    }
    if (this.pointerInputListener !== null) {
      throw new Error('pointer input listener is already bound');
    }
    this.pointerInputListener = listener;
    return () => {
      if (this.pointerInputListener === listener) this.pointerInputListener = null;
    };
  }

  public bindAccessibilityActivation(
    listener: (
      targetId: string,
      input: PatchMapAccessibilityActivationInput,
    ) => void,
  ): () => void {
    const bind = this.renderer.bindAccessibilityActivation;
    return bind === undefined
      ? () => undefined
      : bind.call(this.renderer, listener);
  }

  public cancelViewportGestures(): void {
    this.core.cancelViewportGestures();
  }

  public select(ids: readonly string[]): void {
    this.core.selectSemantic(ids);
    this.geometryRevision += 1;
    this.invalidateGeometrySelectionCache();
  }

  public setAccessibilityTree(
    nodes: readonly PatchMapAccessibilityRenderNode[],
  ): PatchMapAccessibilitySurfaceProbe | undefined {
    return this.renderer.setAccessibilityTree?.call(this.renderer, nodes);
  }

  public focusAccessibilityTarget(targetId: string): boolean {
    return this.renderer.focusAccessibilityTarget?.call(this.renderer, targetId) ?? false;
  }

  public accessibilitySurfaceProbe(): PatchMapAccessibilitySurfaceProbe | undefined {
    return this.renderer.accessibilitySurfaceProbe?.call(this.renderer);
  }

  public setReducedMotion(enabled: boolean): boolean {
    return this.core.setReducedMotion(enabled);
  }

  public setSelectionOverlayPolicy(input: PatchMapSelectionOverlayPolicyInput): boolean {
    return this.core.setSelectionOverlayPolicy(input);
  }

  public setSelectionMarquee(input: PatchMapSelectionMarqueeInput | null): boolean {
    return this.core.setSelectionMarquee(input);
  }

  public setPresentationPolicy(
    input: PatchMapPresentationPolicyInput,
  ): PatchMapPresentationPolicyProductProbe {
    return this.core.setPresentationPolicy(input);
  }

  public clearPresentationPolicy(): PatchMapPresentationPolicyProductProbe {
    return this.core.clearPresentationPolicy();
  }

  public presentationPolicyProbe(): PatchMapPresentationPolicyProductProbe {
    return this.core.presentationPolicyProbe();
  }

  public refreshSemanticTargets(
    targets: readonly PatchMapSemanticTarget[],
    options: Readonly<{ readonly strict?: boolean }> = {},
  ): PatchMapSemanticRefreshResult {
    const result = this.core.refreshSemanticTargets(targets, options);
    if (result.changed) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = this.core.visibleProjection;
      this.invalidateGeometryCache();
    }
    return result;
  }

  public hitTestScreen(point: PatchMapPoint): string | null {
    const ref = this.core.hitTestScreen(point, { interactiveOnly: true });
    return ref ? this.core.get(ref)?.id ?? null : null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return this.core.screenToWorld(point);
  }

  public frameLoopActiveAnimations(): number {
    return this.core.activeAnimations;
  }

  public frameLoopWorkloadSize(): number {
    return this.core.frameWorkloadSize;
  }

  public viewportGestureActive(): boolean {
    return this.core.viewportGestureActive;
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
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

  public worldGeometrySnapshot(): PatchMapViewportGeometry {
    const projection = this.core.visibleProjection;
    if (
      this.worldGeometryCache !== null &&
      this.worldGeometryProjection === projection
    ) {
      return this.worldGeometryCache;
    }
    const geometry = createPatchMapSurfaceWorldGeometrySnapshot(
      this.core.snapshot(),
      projection,
      this.surfaceView,
    );
    this.worldGeometryCache = geometry;
    this.worldGeometryProjection = projection;
    return geometry;
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    const projection = this.core.visibleProjection;
    if (this.geometryCache && this.geometryProjection === projection) return this.geometryCache;
    if (this.geometryRevisionProjection !== projection) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = projection;
    }
    if (this.geometryBaseCache !== null && this.geometryProjection === projection) {
      const selection = this.core.selection();
      const selectionOverlay = selectionOverlayFromEntityGeometry(
        selection.refs.flatMap((ref) => {
          const id = this.core.get(ref)?.id;
          const geometry = id === undefined ? undefined : this.geometryById.get(id);
          return geometry === undefined ? [] : [geometry];
        }),
      );
      const geometry = Object.freeze({
        ...this.geometryBaseCache,
        revision: this.geometryRevision,
        sceneRevision: selection.revision,
        selectionOverlay,
      });
      this.geometryCache = geometry;
      return geometry;
    }
    const geometry = Object.freeze({
      ...createPatchMapSurfaceGeometrySnapshot(
        this.core.snapshot(),
        projection,
        this.surfaceView,
      ),
      revision: this.geometryRevision,
    });
    this.geometryCache = geometry;
    this.geometryBaseCache = geometry;
    if (
      this.worldGeometryCache === null ||
      this.worldGeometryProjection !== projection
    ) {
      this.worldGeometryCache = Object.freeze({
        entities: geometry.entities,
        relations: geometry.relations,
      });
      this.worldGeometryProjection = projection;
    }
    this.geometryById = new Map(geometry.entities.map((entity) => [entity.id, entity]));
    this.geometryProjection = projection;
    this.regionHitIndex = PatchMapScreenRegionIndex.build(
      geometry.entities,
      geometry.relations,
    );
    this.relationHitIndex = buildPatchMapRelationHitIndex(geometry.relations);
    return geometry;
  }

  public selectionGeometries(
    selectionIds: readonly string[],
  ): readonly PatchMapSurfaceEntityGeometry[] {
    // Interaction mode and host probes are valid immediately after renderer
    // initialization, before a dataset is loaded. An empty selection has no
    // semantic identities to resolve and must not force the Core parser seam.
    if (selectionIds.length === 0) return Object.freeze([]);
    const projection = this.core.visibleProjection;
    const geometries = this.core.semanticSelectionEntityIds(selectionIds).flatMap((id) => {
      const entity = this.core.get(id);
      if (entity === null || entity.kind === 'relation') return [];
      return [createPatchMapSurfaceEntityGeometry(entity, projection, this.surfaceView)];
    });
    return Object.freeze(geometries);
  }

  public queryRegionGeometry(
    bounds: PatchMapScreenRegionBounds,
  ): PatchMapSurfaceRegionGeometryCandidates {
    const geometry = this.geometrySnapshot();
    this.regionHitIndex ??= PatchMapScreenRegionIndex.build(
      geometry.entities,
      geometry.relations,
    );
    return this.regionHitIndex.query(bounds);
  }

  public sceneImageProbe(): PatchMapEngineSceneImagesProbe {
    const controller = this.core.sceneImageProbe();
    const entities = new Map(
      this.core.snapshot().entities.map((entity) => [entity.id, entity] as const),
    );
    const images: Record<string, PatchMapEngineSceneImageRecord> = Object.create(null) as Record<
      string,
      PatchMapEngineSceneImageRecord
    >;
    for (const entityId of Object.keys(controller.images).sort()) {
      const image = controller.images[entityId]!;
      const entity = entities.get(entityId);
      const attempts = Object.freeze(image.attempts.map(projectEngineImageAttempt));
      images[entityId] = Object.freeze({
        ...withoutImageAuthoredSource(image),
        ...safeEngineImageSource(image.authoredSource, image.sourceKind),
        opacity: entity?.opacity ?? 0,
        zIndex: entity?.zIndex ?? 0,
        hitBounds: this.core.hitBounds(entityId),
        initial: attempts[0] ?? null,
        attempts,
      });
    }
    return Object.freeze({
      ...controller,
      images: Object.freeze(images),
    });
  }

  public retrySceneImage(entityId: string): PatchMapSceneImageRetryResult {
    return this.core.retrySceneImage(entityId);
  }

  public componentVisualProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapSurfaceComponentVisualProbe | null {
    const visual = this.core.componentVisualProbe(target);
    if (!visual) return null;
    const entity = this.core.get(visual.entityId);
    return Object.freeze({
      target: visual.target,
      semanticOwnerId: visual.semanticOwnerId,
      entityId: visual.entityId,
      logicalIdentity: visual.logicalIdentity,
      componentType: visual.componentType,
      renderRole: visual.renderRole,
      entityKind: visual.entityKind,
      geometry: visual.geometry,
      publication: visual.publication,
      sceneImage: visual.image
        ? projectEngineSceneImageRecord(visual.image, entity, visual.geometry.worldBounds)
        : null,
      rendererPaint: visual.rendererPaint,
      renderLanes: visual.renderLanes,
    });
  }

  public barPresentationProbe(
    target: PatchMapComponentVisualTarget,
  ): PatchMapBarPresentationProductProbe | null {
    return this.core.barPresentationProbe(target);
  }

  public paintOrderProbe(): PatchMapPaintOrderProductProbe {
    return this.core.paintOrderProbe();
  }

  public textProbe(target: PatchMapTextTarget): PatchMapTextProductProbe | null {
    return this.core.textProbe(target);
  }

  public settleSceneImages(): Promise<void> {
    return this.core.settleSceneImages();
  }

  public settleSceneImageBindings(bindingKeys: readonly string[]): Promise<void> {
    return this.core.settleSceneImageBindings(bindingKeys);
  }

  public relationHitTestScreen(
    point: PatchMapPoint,
    options: PatchMapRelationHitOptions = {},
  ): PatchMapRelationHit | null {
    const geometry = this.geometrySnapshot();
    const tolerance = options.toleranceCssPx ?? 4;
    const candidateIndices = tolerance <= 4
      ? queryPatchMapRelationHitIndex(this.relationHitIndex, point)
      : geometry.relations.map((_relation, index) => index);
    const candidates = candidateIndices.flatMap((index) => {
      const relation = geometry.relations[index];
      return relation ? [relation] : [];
    });
    return hitTestPatchMapSurfaceRelations(candidates, point, options);
  }

  public interactionOwnershipProbe(): PatchMapInteractionOwnershipProbe {
    return this.core.interactionOwnershipProbe();
  }

  public pixiPublicSurfaceProbe(): PatchMapPixiPublicSurfaceProbe {
    return this.core.renderer.publicSurfaceProbe();
  }

  public rendererLossProbe(): PatchMapPixiRendererLossProbe {
    const probe = this.renderer.rendererLossProbe;
    if (probe !== undefined) return probe.call(this.renderer);
    const debug = this.core.renderer.debugSnapshot();
    const backend = debug.backend === 'webgpu' ? 'webgpu' : 'webgl2';
    return Object.freeze({
      backend,
      webGLVersion: backend === 'webgl2' ? 2 : null,
      state: debug.destroyed ? 'destroyed' : 'healthy',
      contextLost: false,
      lossEventCount: 0,
      restorationEventCount: 0,
      recoveredFrameCount: 0,
      listenerCount: 0,
      lastLossFrame: null,
      lastRecoveryFrame: null,
      destroyed: debug.destroyed,
    });
  }

  public forceRendererLoss(): boolean {
    return this.renderer.forceRendererLoss?.call(this.renderer) ?? false;
  }

  public async destroy(): Promise<boolean> {
    this.viewportInputListener = null;
    this.pointerInputListener = null;
    this.unbindCorePointerInputs();
    this.unbindCoreViewportChanges();
    try {
      return await this.core.destroy();
    } finally {
      this.canvasPresent = false;
      this.geometryRevisionProjection = null;
      this.invalidateGeometryCache();
    }
  }

  private invalidateGeometryCache(): void {
    this.worldGeometryCache = null;
    this.worldGeometryProjection = null;
    this.invalidateScreenGeometryCache();
  }

  private invalidateScreenGeometryCache(): void {
    this.geometryCache = null;
    this.geometryBaseCache = null;
    this.geometryById.clear();
    this.geometryProjection = null;
    this.regionHitIndex = null;
    this.relationHitIndex = emptyPatchMapRelationHitIndex();
  }

  private invalidateGeometrySelectionCache(): void {
    this.geometryCache = null;
  }
}

function withoutImageAuthoredSource(
  image: PatchMapSceneImageProductProbe,
): Omit<PatchMapSceneImageProductProbe, 'authoredSource' | 'attempts'> {
  const { authoredSource: _authoredSource, attempts: _attempts, ...rest } = image;
  return rest;
}

function safeEngineImageSource(
  authoredSource: PatchMapAssetSource,
  sourceKind: PatchMapImageSourceKind,
): Readonly<{
  authoredSource?: PatchMapAssetSource;
  authoredSourceKind?: PatchMapImageSourceKind;
}> {
  return sourceKind === 'data-uri'
    ? Object.freeze({ authoredSourceKind: sourceKind })
    : Object.freeze({ authoredSource });
}

function projectEngineImageAttempt(
  attempt: PatchMapSceneImageAttemptProbe,
): PatchMapEngineSceneImageAttemptProbe {
  const {
    authoredSource,
    sourceKind,
    resourceState,
    ...rest
  } = attempt;
  return Object.freeze({
    ...rest,
    ...safeEngineImageSource(authoredSource, sourceKind),
    state: resourceState,
  });
}

function projectEngineSceneImageRecord(
  image: PatchMapSceneImageProductProbe,
  entity: SceneSnapshot['entities'][number] | null,
  hitBounds: readonly [number, number, number, number] | null,
): PatchMapEngineSceneImageRecord {
  const attempts = Object.freeze(image.attempts.map(projectEngineImageAttempt));
  return Object.freeze({
    ...withoutImageAuthoredSource(image),
    ...safeEngineImageSource(image.authoredSource, image.sourceKind),
    opacity: entity?.opacity ?? 0,
    zIndex: entity?.zIndex ?? 0,
    hitBounds,
    initial: attempts[0] ?? null,
    attempts,
  });
}

export async function createPixiSurface(options: PatchMapSurfaceOptions): Promise<PatchMapEngineSurface> {
  const coreOptions: PatchMapRuntimeOptions = {
    width: options.width,
    height: options.height,
    pixelRatio: options.pixelRatio,
    antialias: options.antialias,
    background: options.background,
    strategy: options.strategy,
    preference: options.preference,
    requireWebGL2: options.requireWebGL2 ?? options.preference === 'webgl',
    devtools: options.devtools ?? false,
    powerPreference: options.powerPreference,
    autoRender: false,
    rootSelectionMode: 'deferred',
    internalStableRecordOverlays: true,
    ...(options.parse ? { parse: options.parse } : {}),
    ...(options.requestFrame ? { requestFrame: options.requestFrame } : {}),
    ...(options.onTerminalFailure
      ? { onTerminalFailure: options.onTerminalFailure }
      : {}),
    ...(options.assetSession ? { assetSession: options.assetSession } : {}),
    ...(options.target ? { target: options.target } : {}),
    ...(options.canvas ? { canvas: options.canvas } : {}),
  };
  return new PixiEngineSurface(await createPatchMapRuntime(coreOptions));
}

function surfacePointerInput(input: PatchMapRootPointerInput): PatchMapSurfacePointerInput {
  return Object.freeze({
    type: input.type,
    pointerId: input.pointerId,
    pointerType: input.pointerType,
    button: input.button,
    buttons: input.buttons,
    screen: Object.freeze([input.screenX, input.screenY] as const),
    timeMs: input.timeMs,
    modifiers: Object.freeze({
      shift: input.shiftKey,
      ctrl: input.ctrlKey,
      alt: input.altKey,
      meta: input.metaKey,
    }),
  });
}


function freezeReconcileDiagnostics(
  values: readonly PatchMapReconcileDiagnostic[],
): readonly PatchMapReconcileDiagnostic[] {
  return Object.freeze(values.map((diagnostic) => Object.freeze({ ...diagnostic })));
}
