import type { CommitResult, TransactionBatch } from '../dense/contracts';
import type { ParsePatchMapOptions } from '../contracts';
import type { PatchMapRendererEntityPresentationOverride } from '../renderers/presentation-store';
import type { PatchMapSceneImageController } from '../scene-images';
import {
  compactPatchMapProjectionStableRecords,
  rollbackPatchMapProjectionStableRecords,
} from './projection-records';
import {
  freezeReconcileResult,
  reconcileFacts,
  reconcileFactStamp,
  retainedOwnedInputDataset,
} from './reconcile-planning';
import { preparePatchMapReconcileCandidate } from './reconcile-candidate';
import {
  indexPatchMapComponentProbeTargets,
  indexPatchMapTextProbeTargets,
} from './product-probe-reader';
import {
  instancePresentationRequestFromStored,
  planPatchMapInstancePresentationOverlay,
  type PatchMapStoredInstancePresentation,
} from './instance-presentation-overlay';
import { contiguousSlotRanges, mergeSlotRanges } from './slot-ranges';
import type { PatchMapPublishedSceneAuthority } from './published-scene-state';
import type { PatchMapSpatialHitAuthority } from './spatial-hit-authority';
import { isLargePatchMapAnimatedBarBatch } from './spatial-hit-authority';
import type { PatchMapBarPresentationAuthority } from './bar-presentation-authority';
import type { PatchMapFramePublicationAuthority } from './frame-publication-authority';
import type { PatchMapStableRecordStrategy } from '../semantic/stable-record-overlay';
import type { PatchMapPresentationLayerAuthority } from '../presentation-layers';
import type { PatchMapReconcileOptions, PatchMapReconcileResult } from './contracts';
import type { PatchMapRuntimeRendererPort } from './runtime-renderer-port';

type PatchMapReconcileRendererDomain = 'bar-only' | 'text-only' | undefined;

export interface PatchMapReconcilePublicationPort {
  readonly assertAlive: () => void;
  readonly commitDenseBatch: (
    batch: TransactionBatch,
    rendererDomain: PatchMapReconcileRendererDomain,
  ) => CommitResult;
  readonly markTerminalMutationFailure: (cause: unknown) => void;
  readonly readSpatialHit: () => PatchMapSpatialHitAuthority;
  readonly readPointerListenerCount: () => number;
  readonly readInstancePresentations: () => ReadonlyMap<
    string,
    PatchMapStoredInstancePresentation
  >;
  readonly replaceInstancePresentationState: (
    presentations: Map<string, PatchMapStoredInstancePresentation>,
    rendererOverrides: Map<string, PatchMapRendererEntityPresentationOverride>,
  ) => void;
  readonly setRendererInstancePresentationOverrides: (
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
    ranges: readonly Readonly<{ readonly start: number; readonly end: number }>[],
  ) => void;
  readonly activeSceneImageIds: (
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  ) => ReadonlySet<string>;
  readonly reapplyResolvedIntrinsicSizes: () => void;
  readonly applyPresentationPolicyToRenderer: () => void;
}

/**
 * Owns the ordered semantic-reconcile state machine from candidate preparation
 * through dense commit and terminal publication. The coordinator retains only
 * stable authorities; load-replaceable runtime state is read through its port.
 */
export class PatchMapReconcilePublicationCoordinator {
  public constructor(
    private readonly publishedScene: PatchMapPublishedSceneAuthority,
    private readonly barPresentation: PatchMapBarPresentationAuthority,
    private readonly presentationLayers: PatchMapPresentationLayerAuthority,
    private readonly sceneImages: PatchMapSceneImageController,
    private readonly renderer: PatchMapRuntimeRendererPort,
    private readonly framePublication: PatchMapFramePublicationAuthority,
    private readonly parseOptions: ParsePatchMapOptions,
    private readonly stableRecordStrategy: PatchMapStableRecordStrategy,
    private readonly port: PatchMapReconcilePublicationPort,
  ) {}

  public reconcile(
    input: unknown,
    options: PatchMapReconcileOptions = {},
  ): PatchMapReconcileResult {
    this.port.assertAlive();
    const published = this.publishedScene.current();
    const currentParse = published.parse;
    if (currentParse === null) {
      throw new Error('PatchMapRuntime.reconcile requires a loaded PATCH MAP dataset');
    }

    const totalStarted = now();
    const before = reconcileFactStamp(published.scene);
    const candidate = preparePatchMapReconcileCandidate(
      input,
      options,
      this.parseOptions,
      currentParse,
      published,
      published.scene,
      this.stableRecordStrategy,
      this.renderer.strategy,
    );
    const {
      parse,
      plan,
      path,
      semanticChanged,
      parseMs,
      planMs,
    } = candidate;

    if (!plan.safeToCommit) {
      if (this.stableRecordStrategy === 'internal-overlay') {
        rollbackPatchMapProjectionStableRecords(
          parse.projection,
          currentParse.projection,
        );
      }
      const after = reconcileFactStamp(this.publishedScene.current().scene);
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
    let commit: CommitResult;
    try {
      commit = this.port.commitDenseBatch(
        plan.batch,
        path === 'direct-text'
          ? 'text-only'
          : path === 'direct-bar'
            ? 'bar-only'
            : undefined,
      );
    } catch (error) {
      if (this.stableRecordStrategy === 'internal-overlay') {
        rollbackPatchMapProjectionStableRecords(
          parse.projection,
          currentParse.projection,
        );
      }
      throw error;
    }
    const commitMs = now() - commitStarted;
    try {
      this.publishCandidate(input, options, candidate, commit);
    } catch (error) {
      // Dense identity has committed and cannot be reconstructed exactly.
      // Seal the runtime instead of exposing a partially published scene.
      this.port.markTerminalMutationFailure(error);
      throw error;
    }
    const after = reconcileFactStamp(this.publishedScene.current().scene);
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

  private publishCandidate(
    input: unknown,
    options: PatchMapReconcileOptions,
    candidate: ReturnType<typeof preparePatchMapReconcileCandidate>,
    commit: CommitResult,
  ): void {
    const {
      parse,
      path,
      incrementalEntityIds,
      hierarchyOnlyTargetMapping,
      structuralPresentationEntityIds,
      parseOptions,
    } = candidate;
    const published = this.publishedScene.current();
    const scene = published.scene;
    const previousProjection = published.projection;
    const mappingReusable =
      path === 'direct-bar' ||
      path === 'direct-text' ||
      path === 'direct-angle' ||
      hierarchyOnlyTargetMapping;
    const candidateComponentTargets = mappingReusable
      ? published.componentTargets
      : indexPatchMapComponentProbeTargets(parse);
    const retainedInput = retainedOwnedInputDataset(input, parseOptions);
    const storedPresentations = this.port.readInstancePresentations();
    const overlayPlan = storedPresentations.size === 0
      ? null
      : planPatchMapInstancePresentationOverlay(
          instancePresentationRequestFromStored(
            [...storedPresentations.values()],
            !this.barPresentation.reducedMotion && options.animateBarChanges !== false,
          ),
          parse.projection,
          parse.projection,
          candidateComponentTargets,
          retainedInput.dataset,
          this.parseOptions,
          scene.renderStore,
          new Map(),
          new Map(),
          this.stableRecordStrategy,
          { strictMissing: false },
        );
    const effectiveProjection = overlayPlan?.projection ?? parse.projection;
    const basePresentationEntityIds = incrementalEntityIds ??
      (hierarchyOnlyTargetMapping
        ? Object.freeze([])
        : structuralPresentationEntityIds);
    const presentationEntityIds = basePresentationEntityIds === undefined
      ? undefined
      : Object.freeze([...new Set([
          ...basePresentationEntityIds,
          ...(overlayPlan?.changedEntityIds ?? []),
        ])]);
    const presentation = this.barPresentation.reconcile(
      previousProjection,
      effectiveProjection,
      scene,
      !this.barPresentation.reducedMotion && options.animateBarChanges !== false,
      options.animatedBarTargets,
      presentationEntityIds,
      parse.identity.entitySourceById,
    );
    const overlayDirtyRanges = contiguousSlotRanges(
      (overlayPlan?.changedEntityIds ?? []).flatMap((entityId) => {
        const ref = scene.ref(entityId);
        return ref === null ? [] : [ref.slot];
      }),
    );
    const publicationRanges = mergeSlotRanges(commit.changedRanges, overlayDirtyRanges);
    const presentationLayerUpdate = mappingReusable ||
      this.presentationLayers.snapshot().layerCount === 0
      ? null
      : this.presentationLayers.reproject(
          parse,
          candidateComponentTargets,
          scene,
        );

    this.publishedScene.update({
      parse,
      transientIncrementalParse: null,
      projection: effectiveProjection,
      ownedInputDataset: retainedInput.dataset,
      ownedParseOptionsKey: retainedInput.optionsKey,
    });
    const spatialHit = this.port.readSpatialHit();
    spatialHit.setDenseGeometryCompatible(true);
    spatialHit.clearStaleProjectionIds();
    this.renderer.setProjection(
      presentation,
      publicationRanges,
      spatialHit.staleProjectionIds,
      path === 'direct-text'
        ? 'text'
        : path === 'direct-bar'
          ? 'bar-presentation'
          : undefined,
    );
    const rendererOverrides: ReadonlyMap<
      string,
      PatchMapRendererEntityPresentationOverride
    > = overlayPlan?.rendererOverrides ??
      new Map<string, PatchMapRendererEntityPresentationOverride>();
    this.port.setRendererInstancePresentationOverrides(
      rendererOverrides,
      publicationRanges,
    );
    if (presentationLayerUpdate !== null) {
      this.renderer.setPresentationLayerMultipliers(presentationLayerUpdate);
    }
    if (isLargePatchMapAnimatedBarBatch(this.barPresentation.activeCount)) {
      this.renderer.setAggregateCullPrecision(false);
    }
    if (
      path !== 'direct-bar' &&
      path !== 'direct-text' &&
      path !== 'direct-angle'
    ) {
      this.sceneImages.reconcile(effectiveProjection, {
        activeEntityIds: this.port.activeSceneImageIds(rendererOverrides),
      });
      this.port.reapplyResolvedIntrinsicSizes();
      if (path !== 'incremental' && !hierarchyOnlyTargetMapping) {
        this.publishedScene.update({
          componentTargets: candidateComponentTargets,
          textTargets: indexPatchMapTextProbeTargets(parse),
        });
      }
      this.port.applyPresentationPolicyToRenderer();
    }
    spatialHit.clearSpatialAnimations();
    spatialHit.invalidate(
      path === 'direct-bar' && this.barPresentation.activeCount > 0,
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
    this.port.replaceInstancePresentationState(
      new Map(overlayPlan?.presentations ?? []),
      new Map(rendererOverrides),
    );
    if (this.stableRecordStrategy === 'internal-overlay') {
      compactPatchMapProjectionStableRecords(effectiveProjection);
    }
  }
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
