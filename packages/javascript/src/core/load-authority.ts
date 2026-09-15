import type { CoreView, LoadResult, SlotRange } from '../dense/contracts';
import type {
  ParsePatchMapResult,
  ParsePatchMapOptions,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import { parsePatchMap, parsePatchMapAsync } from '../parsing';
import { primePatchMapIncrementalFlat } from '../parsing/incremental';
import { primePatchMapParsedSceneReconcileIncremental } from './reconcile';
import type { PatchMapScene } from './scene';
import type {
  PatchMapSceneImageController,
  PatchMapSceneImageIntrinsicSize,
  PatchMapSceneImageReconcilePlan,
} from '../scene-images';
import type { PatchMapRendererEntityPresentationOverride } from '../rendering-port';
import type { PatchMapPresentationLayerAuthority } from './presentation-layers';
import type { PatchMapLoadResult } from './contracts';
import { projectionWithResolvedIntrinsicSizes } from './intrinsic-image-projection';
import { retainedOwnedInputDataset } from './reconcile-planning';
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

export interface PatchMapCooperativeLoadHooks {
  readonly assertCurrent?: () => void;
}

export type PatchMapLoadRendererCheckpoint =
  Readonly<{
    readonly state: PatchMapRuntimeRendererPublicationCheckpoint;
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

interface PatchMapLoadExecutionPort {
  readonly assertAlive: () => void;
  readonly createScene: (minimumCapacity: number) => PatchMapScene;
  readonly readScene: () => PatchMapScene;
  readonly readEntityCount: () => number;
  readonly readCurrentRuntime: () => PatchMapCurrentLoadRuntimeState;
  readonly activeImageEntityIds: (
    candidate: PatchMapPublishedSceneState,
  ) => ReadonlySet<string>;
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
    private readonly execution: PatchMapLoadExecutionPort,
  ) {}

  public get publicationSideEffectsInProgress(): boolean {
    return this.publicationSideEffectsInProgressValue;
  }

  public beginLoad(): number {
    this.sequence += 1;
    return this.sequence;
  }

  public load(
    input: unknown,
    options: ParsePatchMapOptions,
  ): PatchMapLoadResult {
    this.execution.assertAlive();
    this.beginLoad();
    const normalizeStarted = now();
    const parse = parsePatchMap(input, options);
    const normalizeMs = now() - normalizeStarted;
    let candidateScene: PatchMapScene | null = this.execution.createScene(
      parse.document.entities.length,
    );
    try {
      candidateScene.seedReplacementFrom(this.execution.readScene());
      const storeStarted = now();
      const store = candidateScene.load(parse.document);
      const storeLoadMs = now() - storeStarted;
      this.primeCandidate(parse);
      const candidate = this.prepareLoadedCandidate(input, options, parse, candidateScene, store);
      this.publishLoadedCandidate(candidate, parse, store);
      candidateScene = null;
      return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
    } finally {
      candidateScene?.destroy();
    }
  }

  public async loadAsync(
    input: unknown,
    options: ParsePatchMapOptions,
    hooks: PatchMapCooperativeLoadHooks = {},
  ): Promise<PatchMapLoadResult> {
    this.execution.assertAlive();
    const sequence = this.beginLoad();
    const sceneRevision = this.execution.readScene().revision;
    const assertCurrent = (): void => {
      this.execution.assertAlive();
      this.assertCurrent(sequence, sceneRevision, this.execution.readScene().revision);
      hooks.assertCurrent?.();
    };
    assertCurrent();
    const normalizeStarted = now();
    const parse = await parsePatchMapAsync(input, options);
    const normalizeMs = now() - normalizeStarted;
    await yieldPatchMapMainTask();
    assertCurrent();

    let candidateScene: PatchMapScene | null = this.execution.createScene(
      parse.document.entities.length,
    );
    try {
      candidateScene.seedReplacementFrom(this.execution.readScene());
      const storeStarted = now();
      const cooperativeFirstLoad = sceneRevision === 0 && this.execution.readEntityCount() === 0;
      const store = cooperativeFirstLoad
        ? await candidateScene.loadCooperatively(parse.document, assertCurrent)
        : candidateScene.load(parse.document);
      const storeLoadMs = now() - storeStarted;
      if (cooperativeFirstLoad) {
        await yieldPatchMapMainTask();
        assertCurrent();
      }

      this.primeCandidate(parse);
      const candidate = this.prepareLoadedCandidate(input, options, parse, candidateScene, store);
      assertCurrent();
      this.publishLoadedCandidate(candidate, parse, store);
      candidateScene = null;
      return Object.freeze({ parse, store, normalizeMs, storeLoadMs });
    } finally {
      candidateScene?.destroy();
    }
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

  private primeCandidate(parse: ParsePatchMapResult): void {
    primePatchMapIncrementalFlat(parse);
    primePatchMapParsedSceneReconcileIncremental(parse.document);
  }

  private prepareLoadedCandidate(
    input: unknown,
    options: ParsePatchMapOptions,
    parse: ParsePatchMapResult,
    scene: PatchMapScene,
    store: LoadResult,
  ): PatchMapPublishedSceneCandidate {
    const retainedInput = retainedOwnedInputDataset(input, options);
    return this.prepareCandidate({
      scene,
      parse,
      projection: projectionWithResolvedIntrinsicSizes(parse.projection, this.sceneImages),
      ownedInputDataset: retainedInput.dataset,
      ownedParseOptionsKey: retainedInput.optionsKey,
      entityCount: store.entityCount,
    });
  }

  private publishLoadedCandidate(
    candidate: PatchMapPublishedSceneCandidate,
    parse: ParsePatchMapResult,
    store: LoadResult,
  ): void {
    this.publish({
      candidate,
      sourceProjection: parse.projection,
      view: parse.document.view,
      activeImageEntityIds: this.execution.activeImageEntityIds(candidate.state),
      changedRanges: store.changedRanges,
      currentRuntime: this.execution.readCurrentRuntime(),
    });
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
    try {
      this.renderer.publicationCheckpoint.restore(checkpoint.state);
      return true;
    } catch {
      return false;
    }
  }

  private setRendererInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  ): void {
    this.renderer.setInstancePresentationOverrides(overrides);
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
    _published: PatchMapPublishedSceneState,
    _runtime: PatchMapLoadRuntimeState,
  ): PatchMapLoadRendererCheckpoint {
    return Object.freeze({
      state: this.renderer.publicationCheckpoint.capture(),
    });
  }
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function yieldPatchMapMainTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}
