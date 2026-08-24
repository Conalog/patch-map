import type { CoreView, SlotRange } from '../dense/contracts';
import type {
  ParsePatchMapResult,
  PatchMapProjectionIndex,
} from '../contracts';
import type { PatchMapScene } from '../scene';
import type {
  PatchMapSceneImageController,
  PatchMapSceneImageIntrinsicSize,
  PatchMapSceneImageReconcilePlan,
} from '../scene-images';
import type { PatchMapRendererEntityPresentationOverride } from '../renderers/presentation-store';
import type { PatchMapPresentationLayerAuthority } from '../presentation-layers';
import type {
  PatchMapBarPresentationAuthority,
  PatchMapBarPresentationLoadState,
} from './bar-presentation-authority';
import {
  indexPatchMapComponentProbeTargets,
  indexPatchMapTextProbeTargets,
} from './product-probe-reader';
import type {
  PatchMapPublishedSceneAuthority,
  PatchMapPublishedSceneCandidate,
  PatchMapPublishedScenePrevious,
  PatchMapPublishedSceneState,
} from './published-scene-state';
import { PatchMapSpatialHitAuthority } from './spatial-hit-authority';
import type {
  PatchMapRuntimeRendererPort,
  PatchMapRuntimeRendererPublicationCheckpoint,
} from './runtime-renderer-port';

export interface PatchMapLoadRuntimeState {
  readonly barPresentation: PatchMapBarPresentationLoadState;
  readonly spatialHit: PatchMapSpatialHitAuthority;
  readonly currentView: CoreView;
  readonly pendingIntrinsicImageSizes: Map<string, PatchMapSceneImageIntrinsicSize>;
  readonly automaticAnimationFramesActive: boolean;
}

export interface PatchMapCurrentLoadRuntimeState {
  readonly spatialHit: PatchMapSpatialHitAuthority;
  readonly currentView: CoreView;
  readonly pendingIntrinsicImageSizes: Map<string, PatchMapSceneImageIntrinsicSize>;
  readonly automaticAnimationFramesActive: boolean;
}

export type PatchMapLoadRendererCheckpoint =
  | Readonly<{
      readonly kind: 'exact';
      readonly state: PatchMapRuntimeRendererPublicationCheckpoint;
    }>
  | Readonly<{
      readonly kind: 'compatibility';
      readonly presentation: PatchMapProjectionIndex | null;
      readonly staleProjectionIds: ReadonlySet<string>;
    }>;

export interface PatchMapPreparedLoadPublication {
  readonly previousRuntime: PatchMapLoadRuntimeState;
  readonly nextRuntime: PatchMapLoadRuntimeState;
  readonly imagePlan: PatchMapSceneImageReconcilePlan;
  readonly rendererCheckpoint: PatchMapLoadRendererCheckpoint;
}

interface PatchMapLoadCandidateInput {
  readonly scene: PatchMapScene;
  readonly parse: ParsePatchMapResult;
  readonly projection: PatchMapProjectionIndex;
  readonly ownedInputDataset: readonly unknown[] | null;
  readonly ownedParseOptionsKey: string | null;
  readonly entityCount: number;
}

interface PatchMapLoadPublicationInput {
  readonly candidate: PatchMapPublishedSceneCandidate;
  readonly sourceProjection: PatchMapProjectionIndex;
  readonly view: CoreView | undefined;
  readonly activeImageEntityIds: ReadonlySet<string>;
  readonly currentRuntime: PatchMapCurrentLoadRuntimeState;
}

interface PatchMapLoadCommitInput extends PatchMapLoadPublicationInput {
  readonly changedRanges: readonly SlotRange[];
}

interface PatchMapLoadPublicationPort {
  readonly installRuntimeFields: (state: PatchMapLoadRuntimeState) => void;
  readonly applyPresentationPolicyToRenderer: () => void;
  readonly clearInstancePresentationState: () => void;
  readonly markTerminalLoadFailure: (cause: unknown) => void;
  readonly resetAdaptiveFrameBudget: () => void;
  readonly invalidateLoadFrame: () => void;
}

/**
 * Owns load freshness plus the reversible publication transaction. Published
 * scene, presentation, image, renderer, and runtime-field authorities remain
 * the sole writers of their state and are composed here in one fixed order.
 */
export class PatchMapLoadAuthority {
  private sequence = 0;
  private publicationSideEffectsInProgressValue = false;

  public constructor(
    private readonly publishedScene: PatchMapPublishedSceneAuthority,
    private readonly barPresentation: PatchMapBarPresentationAuthority,
    private readonly sceneImages: PatchMapSceneImageController,
    private readonly renderer: PatchMapRuntimeRendererPort,
    private readonly presentationLayers: PatchMapPresentationLayerAuthority,
    private readonly port: PatchMapLoadPublicationPort,
  ) {}

  public get publicationSideEffectsInProgress(): boolean {
    return this.publicationSideEffectsInProgressValue;
  }

  public beginLoad(): number {
    this.sequence += 1;
    return this.sequence;
  }

  public assertCurrent(
    sequence: number,
    expectedSceneRevision: number,
    currentSceneRevision: number,
  ): void {
    if (
      this.sequence !== sequence ||
      currentSceneRevision !== expectedSceneRevision
    ) {
      throw new Error('PatchMapRuntime cooperative load was superseded');
    }
  }

  public prepareCandidate(
    input: PatchMapLoadCandidateInput,
  ): PatchMapPublishedSceneCandidate {
    return this.publishedScene.prepare({
      scene: input.scene,
      parse: input.parse,
      projection: input.projection,
      ownedInputDataset: input.ownedInputDataset,
      ownedParseOptionsKey: input.ownedParseOptionsKey,
      transientIncrementalParse: null,
      componentTargets: indexPatchMapComponentProbeTargets(input.parse),
      textTargets: indexPatchMapTextProbeTargets(input.parse),
      entityCount: input.entityCount,
    });
  }

  public preparePublication(
    input: PatchMapLoadPublicationInput,
  ): PatchMapPreparedLoadPublication {
    const loadedProjection = input.candidate.state.projection;
    if (loadedProjection === null) {
      throw new Error('PatchMap load candidate has no semantic projection');
    }
    const previousRuntime = this.captureRuntimeState(input.currentRuntime);
    const nextRuntime = this.prepareRuntimeState(loadedProjection, input.view);
    try {
      const imagePlan = this.sceneImages.prepareReconcile(input.sourceProjection, {
        activeEntityIds: input.activeImageEntityIds,
      });
      const rendererCheckpoint = this.captureRendererCheckpoint(
        input.candidate.expected,
        previousRuntime,
      );
      return Object.freeze({
        previousRuntime,
        nextRuntime,
        imagePlan,
        rendererCheckpoint,
      });
    } catch (error) {
      this.disposeRuntimeState(nextRuntime);
      throw error;
    }
  }

  public publish(input: PatchMapLoadCommitInput): void {
    const prepared = this.preparePublication(input);
    const {
      previousRuntime,
      nextRuntime,
      imagePlan,
      rendererCheckpoint,
    } = prepared;
    const presentationLayersCheckpoint = this.presentationLayers.capture();
    let previousPublished: PatchMapPublishedScenePrevious;
    try {
      previousPublished = this.publishedScene.publish(input.candidate);
    } catch (error) {
      this.disposeRuntimeState(nextRuntime);
      throw error;
    }

    this.installRuntimeState(nextRuntime);
    this.beginPublicationSideEffects();
    try {
      const clearedPresentationLayers = this.presentationLayers.clearAll();
      if (clearedPresentationLayers.changed) {
        this.renderer.setPresentationLayerMultipliers(clearedPresentationLayers.render);
      }
      const presentation = this.barPresentation.visibleProjection;
      if (presentation === null) {
        throw new Error('PatchMap load candidate has no presentation projection');
      }
      this.setRendererInstancePresentationOverrides(new Map());
      this.renderer.setProjection(
        presentation,
        undefined,
        nextRuntime.spatialHit.staleProjectionIds,
        undefined,
        input.candidate.state.scene.renderStore,
      );
      this.port.applyPresentationPolicyToRenderer();
      nextRuntime.spatialHit.clearSpatialAnimations();
      nextRuntime.spatialHit.invalidate();
      this.renderer.markChanges(input.changedRanges, 'load', { fullRebuild: true });
    } catch (error) {
      this.presentationLayers.restore(presentationLayersCheckpoint);
      const restored = this.rollbackPublication(
        previousPublished,
        previousRuntime,
        nextRuntime,
        input.candidate.state,
        rendererCheckpoint,
      );
      if (!restored) this.port.markTerminalLoadFailure(error);
      throw error;
    }

    try {
      this.sceneImages.commitReconcile(imagePlan);
    } catch (error) {
      this.presentationLayers.restore(presentationLayersCheckpoint);
      this.rollbackPublication(
        previousPublished,
        previousRuntime,
        nextRuntime,
        input.candidate.state,
        rendererCheckpoint,
      );
      // A valid prepared image plan is specified not to throw after mutation
      // begins. If that invariant is violated, controller state is no longer
      // provably reversible even when semantic and renderer state restore.
      this.port.markTerminalLoadFailure(error);
      throw error;
    }

    this.endPublicationSideEffects();
    this.disposeRuntimeState(previousRuntime);
    this.publishedScene.discard(previousPublished.previous);
    this.port.clearInstancePresentationState();
    this.port.resetAdaptiveFrameBudget();
    this.port.invalidateLoadFrame();
  }

  public beginPublicationSideEffects(): void {
    this.publicationSideEffectsInProgressValue = true;
  }

  public endPublicationSideEffects(): void {
    this.publicationSideEffectsInProgressValue = false;
  }

  public disposeRuntimeState(state: PatchMapLoadRuntimeState): void {
    this.barPresentation.disposeLoadedState(state.barPresentation);
    state.spatialHit.destroy();
    state.pendingIntrinsicImageSizes.clear();
  }

  private installRuntimeState(state: PatchMapLoadRuntimeState): void {
    this.barPresentation.installLoadedState(state.barPresentation);
    this.port.installRuntimeFields(state);
  }

  private rollbackPublication(
    previousPublished: PatchMapPublishedScenePrevious,
    previousRuntime: PatchMapLoadRuntimeState,
    nextRuntime: PatchMapLoadRuntimeState,
    failedState: PatchMapPublishedSceneState,
    rendererCheckpoint: PatchMapLoadRendererCheckpoint,
  ): boolean {
    let restored = true;
    try {
      this.publishedScene.restore(previousPublished);
    } catch {
      restored = false;
    }
    this.installRuntimeState(previousRuntime);
    restored = this.restoreRendererCheckpoint(rendererCheckpoint) && restored;
    this.endPublicationSideEffects();
    try {
      this.disposeRuntimeState(nextRuntime);
    } catch {
      restored = false;
    }
    try {
      this.publishedScene.discard(failedState);
    } catch {
      restored = false;
    }
    return restored;
  }

  private restoreRendererCheckpoint(
    checkpoint: PatchMapLoadRendererCheckpoint,
  ): boolean {
    if (checkpoint.kind === 'exact') {
      const capability = this.renderer.publicationCheckpoint;
      if (capability === undefined) return false;
      capability.restore(checkpoint.state);
      return true;
    }
    if (checkpoint.presentation === null) return false;
    try {
      this.renderer.setProjection(
        checkpoint.presentation,
        undefined,
        checkpoint.staleProjectionIds,
      );
      this.port.applyPresentationPolicyToRenderer();
      return true;
    } catch {
      return false;
    }
  }

  private setRendererInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  ): void {
    this.renderer.setInstancePresentationOverrides?.(overrides);
  }

  private prepareRuntimeState(
    projection: PatchMapProjectionIndex,
    view: CoreView | undefined,
  ): PatchMapLoadRuntimeState {
    const spatialHit = new PatchMapSpatialHitAuthority();
    spatialHit.setDenseGeometryCompatible(true);
    spatialHit.clearStaleProjectionIds();
    return {
      barPresentation: this.barPresentation.prepareLoadedState(projection),
      spatialHit,
      currentView: view ?? Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 }),
      pendingIntrinsicImageSizes: new Map(),
      automaticAnimationFramesActive: false,
    };
  }

  private captureRuntimeState(
    current: PatchMapCurrentLoadRuntimeState,
  ): PatchMapLoadRuntimeState {
    return {
      barPresentation: this.barPresentation.captureLoadedState(),
      ...current,
    };
  }

  private captureRendererCheckpoint(
    published: PatchMapPublishedSceneState,
    runtime: PatchMapLoadRuntimeState,
  ): PatchMapLoadRendererCheckpoint {
    const capability = this.renderer.publicationCheckpoint;
    if (capability !== undefined) {
      return Object.freeze({
        kind: 'exact',
        state: capability.capture(),
      });
    }
    const presentation = runtime.barPresentation.projectionStore.presentation ??
      published.projection;
    return Object.freeze({
      kind: 'compatibility',
      presentation,
      staleProjectionIds: runtime.spatialHit.staleProjectionIds,
    });
  }
}
