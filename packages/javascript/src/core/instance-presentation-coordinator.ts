import type { SlotRange } from '../dense/contracts';
import { RenderKind } from '../dense/renderer-types';
import type {
  ParsePatchMapOptions,
  ParsePatchMapResult,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import type { PatchMapRendererEntityPresentationOverride } from '../rendering-port';
import type { PatchMapSceneImageController } from '../scene-images';
import type { PatchMapStableRecordStrategy } from '../semantic/stable-record-overlay';
import type { PatchMapPresentationLayerAuthority } from './presentation-layers';
import {
  compactPatchMapProjectionStableRecords,
} from './projection-records';
import {
  applyPatchMapInstanceBarHeightStorageUpdates,
  instancePresentationRequestFromStored,
  isPatchMapInstanceBarHeightOnlyRequest,
  planPatchMapInstanceBarHeightOnlyOverlay,
  planPatchMapInstancePresentationOverlay,
  type PatchMapStoredInstancePresentation,
} from './instance-presentation-overlay';
import type {
  PatchMapInstanceBarHeightBatchRequest,
  PatchMapInstanceBarHeightBatchResult,
  PatchMapInstanceBarTarget,
  PatchMapReconcileOptions,
} from './contracts';
import type {
  PatchMapIndexedComponentTarget,
  PatchMapIndexedTextTarget,
  PatchMapPublishedSceneAuthority,
  PatchMapPublishedSceneState,
} from './published-scene-state';
import type { PatchMapBarPresentationAuthority } from './bar-presentation-authority';
import type { PatchMapFramePublicationAuthority } from './frame-publication-authority';
import type { PatchMapRuntimeRendererPort } from './runtime-renderer-port';
import type { PatchMapSpatialHitAuthority } from './spatial-hit-authority';
import { isLargePatchMapAnimatedBarBatch } from './spatial-hit-authority';
import { contiguousSlotRanges, mergeSlotRanges } from './slot-ranges';
import type { PatchMapReconcileCandidatePath } from './reconcile-candidate';

const EMPTY_RANGES: readonly SlotRange[] = Object.freeze([]);
const EMPTY_TARGETS: readonly PatchMapInstanceBarTarget[] = Object.freeze([]);

export interface PatchMapInstancePresentationCoordinatorPort {
  readonly assertAlive: () => void;
  readonly markTerminalMutationFailure: (cause: unknown) => void;
  readonly readSpatialHit: () => PatchMapSpatialHitAuthority;
  readonly readPointerListenerCount: () => number;
  readonly reapplyResolvedIntrinsicSizes: () => void;
  readonly applyPresentationPolicyToRenderer: () => void;
}

export interface PatchMapInstancePresentationReconcileReplay {
  readonly parse: ParsePatchMapResult;
  readonly previousProjection: PatchMapProjectionIndex | null;
  readonly componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>;
  readonly textTargets: ReadonlyMap<string, PatchMapIndexedTextTarget | null> | null;
  readonly retainedInputDataset: readonly unknown[] | null;
  readonly retainedParseOptionsKey: string | null;
  readonly basePresentationEntityIds: readonly string[] | undefined;
  readonly commitChangedRanges: readonly SlotRange[];
  readonly path: PatchMapReconcileCandidatePath;
  readonly animateBarChanges: boolean;
  readonly animatedBarTargets: PatchMapReconcileOptions['animatedBarTargets'];
  readonly reprojectPresentationLayers: boolean;
}

/**
 * Single owner for runtime-only instance presentation state and publication.
 *
 * Both public overlay updates and semantic-reconcile replay close the same
 * projection -> renderer -> image -> spatial-hit -> frame publication order.
 * The coordinator deliberately keeps the height-only path separate so an
 * all-bar update remains O(changed targets) and mutates its retained Map in
 * place instead of cloning the general overlay records.
 */
export class PatchMapInstancePresentationCoordinator {
  private presentations = new Map<string, PatchMapStoredInstancePresentation>();
  private rendererOverrides = new Map<
    string,
    PatchMapRendererEntityPresentationOverride
  >();

  public constructor(
    private readonly publishedScene: PatchMapPublishedSceneAuthority,
    private readonly barPresentation: PatchMapBarPresentationAuthority,
    private readonly presentationLayers: PatchMapPresentationLayerAuthority,
    private readonly sceneImages: PatchMapSceneImageController,
    private readonly renderer: PatchMapRuntimeRendererPort,
    private readonly framePublication: PatchMapFramePublicationAuthority,
    private readonly parseOptions: ParsePatchMapOptions,
    private readonly stableRecordStrategy: PatchMapStableRecordStrategy,
    private readonly port: PatchMapInstancePresentationCoordinatorPort,
  ) {}

  public clear(): void {
    this.presentations.clear();
    this.rendererOverrides.clear();
  }

  public update(
    request: PatchMapInstanceBarHeightBatchRequest,
  ): PatchMapInstanceBarHeightBatchResult {
    this.port.assertAlive();
    const published = this.publishedScene.current();
    const authored = published.parse?.projection;
    const current = published.projection;
    if (authored === undefined || current === null) {
      throw new Error('PatchMapRuntime.updateInstanceBarHeights requires a loaded dataset');
    }
    if (isPatchMapInstanceBarHeightOnlyRequest(request)) {
      return this.updateHeightOnly(request, current, authored);
    }
    return this.updateFull(request, current, authored);
  }

  public replayAfterReconcile(
    input: PatchMapInstancePresentationReconcileReplay,
  ): void {
    const published = this.publishedScene.current();
    const scene = published.scene;
    const animateBarChanges = !this.barPresentation.reducedMotion &&
      input.animateBarChanges;
    const overlayPlan = this.presentations.size === 0
      ? null
      : planPatchMapInstancePresentationOverlay(
          instancePresentationRequestFromStored(
            [...this.presentations.values()],
            animateBarChanges,
          ),
          input.parse.projection,
          input.parse.projection,
          input.componentTargets,
          input.retainedInputDataset,
          this.parseOptions,
          scene.renderStore,
          new Map(),
          new Map(),
          this.stableRecordStrategy,
          { strictMissing: false },
        );
    const effectiveProjection = overlayPlan?.projection ?? input.parse.projection;
    const presentationEntityIds = input.basePresentationEntityIds === undefined
      ? undefined
      : Object.freeze([...new Set([
          ...input.basePresentationEntityIds,
          ...(overlayPlan?.changedEntityIds ?? []),
        ])]);
    const presentation = this.barPresentation.reconcile(
      input.previousProjection,
      effectiveProjection,
      scene,
      animateBarChanges,
      input.animatedBarTargets,
      presentationEntityIds,
      input.parse.identity.entitySourceById,
    );
    const overlayDirtyRanges = this.dirtyRanges(overlayPlan?.changedEntityIds ?? []);
    const publicationRanges = mergeSlotRanges(
      input.commitChangedRanges,
      overlayDirtyRanges,
    );
    const presentationLayerUpdate = !input.reprojectPresentationLayers ||
      this.presentationLayers.snapshot().layerCount === 0
      ? null
      : this.presentationLayers.reproject(
          input.parse,
          input.componentTargets,
          scene,
        );

    this.publishedScene.update({
      parse: input.parse,
      transientIncrementalParse: null,
      projection: effectiveProjection,
      ownedInputDataset: input.retainedInputDataset,
      ownedParseOptionsKey: input.retainedParseOptionsKey,
    });
    const spatialHit = this.port.readSpatialHit();
    spatialHit.setDenseGeometryCompatible(true);
    spatialHit.clearStaleProjectionIds();
    this.renderer.setProjection(
      presentation,
      publicationRanges,
      spatialHit.staleProjectionIds,
      input.path === 'direct-text'
        ? 'text'
        : input.path === 'direct-bar'
          ? 'bar-presentation'
          : undefined,
    );
    const rendererOverrides = overlayPlan?.rendererOverrides ??
      new Map<string, PatchMapRendererEntityPresentationOverride>();
    this.renderer.setInstancePresentationOverrides(rendererOverrides, publicationRanges);
    if (presentationLayerUpdate !== null) {
      this.renderer.setPresentationLayerMultipliers(presentationLayerUpdate);
    }
    if (isLargePatchMapAnimatedBarBatch(this.barPresentation.activeCount)) {
      this.renderer.setAggregateCullPrecision(false);
    }

    const replayImages = input.path !== 'direct-bar' &&
      input.path !== 'direct-text' &&
      input.path !== 'direct-angle';
    if (replayImages) {
      this.sceneImages.reconcile(effectiveProjection, {
        activeEntityIds: activePatchMapSceneImageIds(
          this.publishedScene.current(),
          rendererOverrides,
        ),
      });
      this.port.reapplyResolvedIntrinsicSizes();
      if (input.textTargets !== null) {
        this.publishedScene.update({
          componentTargets: input.componentTargets,
          textTargets: input.textTargets,
        });
      }
      this.port.applyPresentationPolicyToRenderer();
    }

    spatialHit.clearSpatialAnimations();
    spatialHit.invalidate(
      input.path === 'direct-bar' && this.barPresentation.activeCount > 0,
    );
    spatialHit.primeAnimatedBarsIfNeeded(
      this.port.readPointerListenerCount(),
      scene,
      this.publishedScene.current().projection,
      this.barPresentation.visibleProjection,
      this.barPresentation,
    );
    if (this.barPresentation.activeCount > 0) {
      this.framePublication.invalidate('presentation');
    }
    this.presentations = new Map(overlayPlan?.presentations ?? []);
    this.rendererOverrides = new Map(rendererOverrides);
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(effectiveProjection);
    }
  }

  public activeSceneImageIds(
    projection: PatchMapProjectionIndex | null = this.publishedScene.current().projection,
  ): ReadonlySet<string> {
    return activePatchMapSceneImageIds(
      this.publishedScene.current(),
      this.rendererOverrides,
      projection,
    );
  }

  public activeSceneImageBindingKeys(): readonly string[] {
    const images = this.publishedScene.current().projection?.imagesByEntityId ?? {};
    const keys = new Set<string>();
    for (const entityId of this.activeSceneImageIds()) {
      const bindingKey = images[entityId]?.bindingKey;
      if (bindingKey !== undefined) keys.add(bindingKey);
    }
    return Object.freeze([...keys]);
  }

  private updateFull(
    request: PatchMapInstanceBarHeightBatchRequest,
    current: PatchMapProjectionIndex,
    authored: PatchMapProjectionIndex,
  ): PatchMapInstanceBarHeightBatchResult {
    const published = this.publishedScene.current();
    const plan = planPatchMapInstancePresentationOverlay(
      request,
      current,
      authored,
      published.componentTargets,
      published.ownedInputDataset,
      this.parseOptions,
      published.scene.renderStore,
      this.presentations,
      this.rendererOverrides,
      this.stableRecordStrategy,
    );
    if (plan.missingTargets.length > 0) {
      return this.result(
        false,
        EMPTY_RANGES,
        EMPTY_TARGETS,
        plan.missingTargets,
      );
    }
    if (plan.changedEntityIds.length === 0) {
      this.presentations = new Map(plan.presentations);
      this.rendererOverrides = new Map(plan.rendererOverrides);
      return this.result(
        plan.overlayStateChanged,
        EMPTY_RANGES,
        plan.appliedTargets,
        EMPTY_TARGETS,
      );
    }

    const dirtyRanges = this.dirtyRanges(plan.changedEntityIds);
    const imagePlan = this.sceneImages.prepareReconcile(plan.projection, {
      activeEntityIds: activePatchMapSceneImageIds(
        published,
        plan.rendererOverrides,
        plan.projection,
      ),
    });
    const presentation = this.barPresentation.reconcile(
      current,
      plan.projection,
      published.scene,
      !this.barPresentation.reducedMotion && request.animate !== false,
      request.animatedBarTargets,
      plan.changedEntityIds,
      published.parse?.identity.entitySourceById,
    );
    this.publishedScene.update({
      projection: plan.projection,
      transientIncrementalParse: null,
    });
    try {
      this.renderer.setProjection(
        presentation,
        dirtyRanges,
        this.port.readSpatialHit().staleProjectionIds,
        'bar-presentation',
      );
      this.renderer.setInstancePresentationOverrides(plan.rendererOverrides, dirtyRanges);
    } catch (error) {
      this.port.markTerminalMutationFailure(error);
      throw error;
    }
    try {
      this.sceneImages.commitReconcile(imagePlan);
    } catch (error) {
      this.port.markTerminalMutationFailure(error);
      throw error;
    }
    this.presentations = new Map(plan.presentations);
    this.rendererOverrides = new Map(plan.rendererOverrides);
    this.commitSpatialAndFrame('instance-presentation-overlay');
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(plan.projection);
    }
    return this.result(true, dirtyRanges, plan.appliedTargets, EMPTY_TARGETS);
  }

  private updateHeightOnly(
    request: PatchMapInstanceBarHeightBatchRequest,
    current: PatchMapProjectionIndex,
    authored: PatchMapProjectionIndex,
  ): PatchMapInstanceBarHeightBatchResult {
    const published = this.publishedScene.current();
    const plan = planPatchMapInstanceBarHeightOnlyOverlay(
      request,
      current,
      authored,
      published.componentTargets,
      this.presentations,
      this.stableRecordStrategy,
    );
    if (plan.missingTargets.length > 0) {
      return this.result(false, EMPTY_RANGES, EMPTY_TARGETS, plan.missingTargets);
    }
    if (plan.changedEntityIds.length === 0) {
      applyPatchMapInstanceBarHeightStorageUpdates(
        this.presentations,
        plan.storageUpdates,
      );
      return this.result(
        plan.overlayStateChanged,
        EMPTY_RANGES,
        plan.appliedTargets,
        EMPTY_TARGETS,
      );
    }

    const dirtyRanges = this.dirtyRanges(plan.changedEntityIds);
    const presentation = this.barPresentation.reconcile(
      current,
      plan.projection,
      published.scene,
      !this.barPresentation.reducedMotion && request.animate !== false,
      request.animatedBarTargets,
      plan.changedEntityIds,
      published.parse?.identity.entitySourceById,
    );
    this.publishedScene.update({
      projection: plan.projection,
      transientIncrementalParse: null,
    });
    try {
      this.renderer.setProjection(
        presentation,
        dirtyRanges,
        this.port.readSpatialHit().staleProjectionIds,
        'bar-presentation',
      );
    } catch (error) {
      this.port.markTerminalMutationFailure(error);
      throw error;
    }
    applyPatchMapInstanceBarHeightStorageUpdates(
      this.presentations,
      plan.storageUpdates,
    );
    this.commitSpatialAndFrame('instance-bar-height-overlay');
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(plan.projection);
    }
    return this.result(true, dirtyRanges, plan.appliedTargets, EMPTY_TARGETS);
  }

  private commitSpatialAndFrame(reason: string): void {
    this.framePublication.markProjectionFactsStale();
    const spatialHit = this.port.readSpatialHit();
    spatialHit.setDenseGeometryCompatible(false);
    spatialHit.clearSpatialAnimations();
    spatialHit.invalidate(this.barPresentation.activeCount > 0);
    spatialHit.primeAnimatedBarsIfNeeded(
      this.port.readPointerListenerCount(),
      this.publishedScene.current().scene,
      this.publishedScene.current().projection,
      this.barPresentation.visibleProjection,
      this.barPresentation,
    );
    if (isLargePatchMapAnimatedBarBatch(this.barPresentation.activeCount)) {
      this.renderer.setAggregateCullPrecision(false);
    }
    this.framePublication.invalidate(reason);
  }

  private dirtyRanges(entityIds: readonly string[]): readonly SlotRange[] {
    const scene = this.publishedScene.current().scene;
    return contiguousSlotRanges(entityIds.flatMap((entityId) => {
      const ref = scene.ref(entityId);
      return ref === null ? [] : [ref.slot];
    }));
  }

  private result(
    changed: boolean,
    dirtyRanges: readonly SlotRange[],
    appliedTargets: PatchMapInstanceBarHeightBatchResult['appliedTargets'],
    missingTargets: PatchMapInstanceBarHeightBatchResult['missingTargets'],
  ): PatchMapInstanceBarHeightBatchResult {
    return Object.freeze({
      changed,
      appliedTargets,
      missingTargets,
      dirtyRanges,
      activeAnimationCount: this.barPresentation.activeCount,
      overlayCount: this.presentations.size,
    });
  }
}

export function activePatchMapSceneImageIds(
  published: PatchMapPublishedSceneState,
  overrides?: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  projection: PatchMapProjectionIndex | null = published.projection,
): ReadonlySet<string> {
  const active = new Set<string>();
  const images = projection?.imagesByEntityId ?? {};
  for (const entityId of Object.keys(images)) {
    const entity = published.scene.get(entityId);
    const override = overrides?.get(entityId);
    if (
      entity !== null &&
      (override?.kind === RenderKind.Image ||
        (override?.kind === undefined && entity.kind === 'image')) &&
      (override?.visible ?? entity.visible)
    ) {
      active.add(entityId);
    }
  }
  return active;
}
