import type { CoreView } from '../dense/contracts';
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
import {
  PatchMapPixiRenderer,
  type PatchMapPixiRendererPublicationCheckpoint,
} from '../renderers/pixi-renderer';
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
  PatchMapPublishedSceneState,
} from './published-scene-state';
import { PatchMapSpatialHitAuthority } from './spatial-hit-authority';

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
      readonly kind: 'pixi';
      readonly state: PatchMapPixiRendererPublicationCheckpoint;
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

/**
 * Owns only private load candidates and reversible publication checkpoints.
 * The Core facade remains the sole writer for published and live runtime state.
 */
export class PatchMapLoadAuthority {
  private sequence = 0;
  private publicationSideEffectsInProgressValue = false;

  public constructor(
    private readonly publishedScene: PatchMapPublishedSceneAuthority,
    private readonly barPresentation: PatchMapBarPresentationAuthority,
    private readonly sceneImages: PatchMapSceneImageController,
    private readonly renderer: PatchMapPixiRenderer,
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
    if (this.renderer instanceof PatchMapPixiRenderer) {
      return Object.freeze({
        kind: 'pixi',
        state: this.renderer.capturePublicationCheckpoint(),
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
