import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CoreView,
  SlotRange,
} from '../../src/dense/contracts';
import type {
  RendererFlushResult,
  RenderStoreView,
} from '../../src/dense/renderer-types';
import {
  PatchMapRuntime,
  type PatchMapRuntimeOptions,
} from '../../src/core';
import type {
  PatchMapPublishedSceneAuthority,
  PatchMapPublishedSceneState,
} from '../../src/core/published-scene-state';
import type { PatchMapSpatialHitAuthority } from '../../src/core/spatial-hit-authority';
import type {
  PatchMapBarPresentationAuthority,
  PatchMapBarPresentationLoadState,
} from '../../src/core/bar-presentation-authority';
import type {
  LeafAssetBindingObservation,
  LeafAssetBindingProbe,
  LeafAssetBindingRequest,
  LeafSceneImageProbe,
} from '../../src/rendering/leaf-layer';
import type {
  PatchMapPixiRenderer,
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRendererPublicationCheckpoint,
} from '../../src/rendering/pixi-renderer';
import type {
  PatchMapRendererDebug,
  RootInteractionHandlers,
} from '../../src/rendering-port';
import type {
  PatchMapSceneImageController,
  PatchMapSceneImageIntrinsicSize,
} from '../../src/scene-images';

describe('PatchMap load and mutation publication atomicity', () => {
  const allocated: PatchMapRuntime[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(allocated.splice(0).map((core) => core.destroy()));
  });

  it('restores an active runtime after a synchronous projection boundary failure', () => {
    const { core, renderer } = createActiveCore(allocated);
    const before = captureRuntime(core, renderer);
    const boundaryError = new Error('projection boundary failed');
    renderer.nextProjectionFailure = boundaryError;

    let failure: unknown;
    try {
      core.load(runtimeScene(70, 'new-image'));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBe(boundaryError);
    expectRuntimeRestored(core, renderer, before);

    const loaded = core.load(runtimeScene(70, 'new-image'));
    expect(loaded.store.revision).toBe(before.snapshot.revision + 1);
    expect(core.ref(BAR_ID)?.generation).toBe(before.ref.generation + 1);
    expect(core.get(before.ref)).toBeNull();
  });

  it('forwards the renderer publication checkpoint through the runtime adapter rollback', () => {
    const { core, renderer } = createActiveCore(allocated);
    const before = captureRuntime(core, renderer);
    const boundaryError = new Error('exact projection boundary failed');
    renderer.capturedPublicationCheckpoint = null;
    renderer.restoredPublicationCheckpoint = null;
    renderer.nextProjectionFailure = boundaryError;

    expect(() => core.load(runtimeScene(70, 'new-image'))).toThrow(boundaryError);

    expect(renderer.capturedPublicationCheckpoint).not.toBeNull();
    expect(renderer.restoredPublicationCheckpoint)
      .toBe(renderer.capturedPublicationCheckpoint);
    expectRuntimeRestored(core, renderer, before);
  });

  it('keeps scene-image ownership exact when prepared reconciliation fails', () => {
    const { core, renderer } = createActiveCore(allocated);
    const before = captureRuntime(core, renderer);
    const internals = runtimeInternals(core);
    const boundaryError = new Error('image prepare boundary failed');
    vi.spyOn(internals.sceneImages, 'prepareReconcile').mockImplementationOnce(() => {
      throw boundaryError;
    });

    let failure: unknown;
    try {
      core.load(runtimeScene(70, 'new-image'));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBe(boundaryError);
    expectRuntimeRestored(core, renderer, before);
    expect(renderer.boundBindingKeys).toEqual(['alias:old-image']);
  });

  it('seals the runtime when renderer marking fails after a dense commit', () => {
    const onTerminalFailure = vi.fn();
    const { core, renderer } = createActiveCore(allocated, onTerminalFailure);
    const boundaryError = new Error('mutation mark boundary failed');
    renderer.nextMarkFailure = boundaryError;

    expect(() => core.reconcile(runtimeScene(55, 'old-image')))
      .toThrow(boundaryError);
    expect(onTerminalFailure).toHaveBeenCalledTimes(1);
    expect(onTerminalFailure).toHaveBeenCalledWith(expect.objectContaining({
      message: 'PatchMapRuntime entered a terminal state after mutation publication failed',
      cause: boundaryError,
    }));
    expect(() => core.snapshot())
      .toThrow('PatchMapRuntime entered a terminal state after mutation publication failed');
    expect(() => core.reconcile(runtimeScene(60, 'old-image')))
      .toThrow('PatchMapRuntime entered a terminal state after mutation publication failed');
    const leakedReads = [
      () => core.entityCount,
      () => core.frameWorkloadSize,
      () => core.frameTimeMs,
      () => core.presentationRevision,
      () => core.reducedMotion,
      () => core.view,
      () => core.diagnostics,
      () => core.identity,
      () => core.projection,
      () => core.ref(BAR_ID),
      () => core.get(BAR_ID),
      () => core.query(),
      () => core.selection(),
    ];
    for (const read of leakedReads) {
      expect(read)
        .toThrow('PatchMapRuntime entered a terminal state after mutation publication failed');
    }
    expect(core.activeAnimations).toBe(0);
    expect(core.viewportGestureActive).toBe(false);
  });

  it('seals the runtime when projection publication fails after reconcile commit', () => {
    const onTerminalFailure = vi.fn();
    const { core, renderer } = createActiveCore(allocated, onTerminalFailure);
    const boundaryError = new Error('mutation projection boundary failed');
    renderer.nextProjectionFailure = boundaryError;

    expect(() => core.reconcile(runtimeScene(55, 'old-image')))
      .toThrow(boundaryError);
    expect(onTerminalFailure).toHaveBeenCalledTimes(1);
    expect(onTerminalFailure).toHaveBeenCalledWith(expect.objectContaining({
      message: 'PatchMapRuntime entered a terminal state after mutation publication failed',
      cause: boundaryError,
    }));
    expect(() => core.visibleProjection)
      .toThrow('PatchMapRuntime entered a terminal state after mutation publication failed');
    expect(() => core.publishFrame(100))
      .toThrow('PatchMapRuntime entered a terminal state after mutation publication failed');
  });

  it('keeps a non-first async replacement private until the final publication', async () => {
    const { core } = createActiveCore(allocated);
    const authority = runtimeInternals(core).publishedScene;
    const before = authority.current();
    const beforeRevision = before.scene.snapshot().revision;
    const observed: PatchMapPublishedSceneState[] = [];

    const loaded = await core.loadAsync(
      runtimeScene(70, 'new-image'),
      undefined,
      {
        assertCurrent: () => {
          observed.push(authority.current());
        },
      },
    );
    const after = authority.current();

    expect(observed.length).toBeGreaterThan(1);
    expect(observed.every((state) => state === before)).toBe(true);
    expect(after).not.toBe(before);
    expect(after.scene).not.toBe(before.scene);
    expect(loaded.store.revision).toBe(beforeRevision + 1);
    expect(before.scene.destroy()).toBe(false);
  });
});

interface RuntimeInternals {
  readonly publishedScene: PatchMapPublishedSceneAuthority;
  readonly barPresentation: PatchMapBarPresentationAuthority;
  readonly spatialHit: PatchMapSpatialHitAuthority;
  readonly pendingIntrinsicImageSizes: Map<string, PatchMapSceneImageIntrinsicSize>;
  readonly automaticAnimationFramesActive: boolean;
  readonly framePublication: Readonly<{ suspended: boolean }>;
  readonly sceneImages: PatchMapSceneImageController;
}

interface RuntimeCapture {
  readonly published: PatchMapPublishedSceneState;
  readonly snapshot: ReturnType<PatchMapRuntime['snapshot']>;
  readonly identity: PatchMapRuntime['identity'];
  readonly projection: PatchMapRuntime['projection'];
  readonly visibleProjection: NonNullable<PatchMapRuntime['visibleProjection']>;
  readonly view: CoreView;
  readonly ref: NonNullable<ReturnType<PatchMapRuntime['ref']>>;
  readonly activeAnimations: number;
  readonly presentationProbe: ReturnType<PatchMapRuntime['barPresentationProbe']>;
  readonly sceneImagesProbe: ReturnType<PatchMapSceneImageController['probe']>;
  readonly boundBindingKeys: readonly string[];
  readonly barPresentation: PatchMapBarPresentationAuthority;
  readonly barPresentationState: PatchMapBarPresentationLoadState;
  readonly spatialHit: PatchMapSpatialHitAuthority;
  readonly pendingIntrinsicImageSizes: Map<string, PatchMapSceneImageIntrinsicSize>;
  readonly pendingIntrinsicEntries: readonly (
    readonly [string, PatchMapSceneImageIntrinsicSize]
  )[];
  readonly automaticAnimationFramesActive: boolean;
}

function captureRuntime(
  core: PatchMapRuntime,
  renderer: AtomicLoadRendererDouble,
): RuntimeCapture {
  const internals = runtimeInternals(core);
  const visibleProjection = core.visibleProjection;
  const ref = core.ref(BAR_ID);
  if (visibleProjection === null || ref === null) {
    throw new Error('active load fixture did not publish its bar');
  }
  expect(renderer.currentProjection).toBe(visibleProjection);
  return {
    published: internals.publishedScene.current(),
    snapshot: core.snapshot(),
    identity: core.identity,
    projection: core.projection,
    visibleProjection,
    view: core.view,
    ref,
    activeAnimations: core.activeAnimations,
    presentationProbe: core.barPresentationProbe({
      ownerId: 'item-a',
      componentId: 'level',
    }),
    sceneImagesProbe: internals.sceneImages.probe(),
    boundBindingKeys: renderer.boundBindingKeys,
    barPresentation: internals.barPresentation,
    barPresentationState: internals.barPresentation.captureLoadedState(),
    spatialHit: internals.spatialHit,
    pendingIntrinsicImageSizes: internals.pendingIntrinsicImageSizes,
    pendingIntrinsicEntries: Object.freeze([
      ...internals.pendingIntrinsicImageSizes.entries(),
    ]),
    automaticAnimationFramesActive: internals.automaticAnimationFramesActive,
  };
}

function expectRuntimeRestored(
  core: PatchMapRuntime,
  renderer: AtomicLoadRendererDouble,
  before: RuntimeCapture,
): void {
  const internals = runtimeInternals(core);
  expect(internals.publishedScene.current()).toBe(before.published);
  expect(core.snapshot()).toEqual(before.snapshot);
  expect(core.identity).toBe(before.identity);
  expect(core.projection).toBe(before.projection);
  expect(core.visibleProjection).toBe(before.visibleProjection);
  expect(core.view).toBe(before.view);
  expect(core.ref(BAR_ID)).toEqual(before.ref);
  expect(core.activeAnimations).toBe(before.activeAnimations);
  expect(core.barPresentationProbe({
    ownerId: 'item-a',
    componentId: 'level',
  })).toEqual(before.presentationProbe);
  expect(internals.sceneImages.probe()).toEqual(before.sceneImagesProbe);
  expect(renderer.boundBindingKeys).toEqual(before.boundBindingKeys);
  expect(internals.barPresentation).toBe(before.barPresentation);
  const restoredPresentation = internals.barPresentation.captureLoadedState();
  expect(restoredPresentation.controller).toBe(before.barPresentationState.controller);
  expect(restoredPresentation.generation).toBe(before.barPresentationState.generation);
  expect(restoredPresentation.projectionStore)
    .toBe(before.barPresentationState.projectionStore);
  expect(restoredPresentation.invalidEntityIds)
    .toBe(before.barPresentationState.invalidEntityIds);
  expect(restoredPresentation.clockMs).toBe(before.barPresentationState.clockMs);
  expect(internals.spatialHit).toBe(before.spatialHit);
  expect(internals.pendingIntrinsicImageSizes).toBe(before.pendingIntrinsicImageSizes);
  expect([...internals.pendingIntrinsicImageSizes.entries()])
    .toEqual(before.pendingIntrinsicEntries);
  expect(internals.automaticAnimationFramesActive)
    .toBe(before.automaticAnimationFramesActive);
  expect(renderer.currentProjection).toBe(before.visibleProjection);
}

function runtimeInternals(core: PatchMapRuntime): RuntimeInternals {
  return core as unknown as RuntimeInternals;
}

function createActiveCore(
  allocated: PatchMapRuntime[],
  onTerminalFailure?: (error: Error) => void,
): Readonly<{ core: PatchMapRuntime; renderer: AtomicLoadRendererDouble }> {
  const rendererDouble = new AtomicLoadRendererDouble();
  const TestPatchMap = PatchMapRuntime as unknown as new (
    renderer: PatchMapPixiRenderer,
    options: PatchMapRuntimeOptions,
  ) => PatchMapRuntime;
  const core = new TestPatchMap(
    rendererDouble as unknown as PatchMapPixiRenderer,
    {
      autoRender: false,
      ...(onTerminalFailure ? { onTerminalFailure } : {}),
    },
  );
  allocated.push(core);
  core.load(runtimeScene(10, 'old-image'));
  core.publishFrame(0);
  expect(core.reconcile(runtimeScene(40, 'old-image')).status).toBe('committed');
  core.setView({ x: 31, y: -17, scale: 1.25, rotation: 12 });
  runtimeInternals(core).pendingIntrinsicImageSizes.set('queued-image-size', Object.freeze({
    entityId: 'queued-image-size',
    bindingKey: 'alias:queued-image-size',
    generation: 1,
    naturalSize: Object.freeze([23, 17] as const),
  }));
  expect(core.activeAnimations).toBe(1);
  return { core, renderer: rendererDouble };
}

const BAR_ID = 'item-a::bar:level';

function runtimeScene(height: number, imageSource: string): readonly unknown[] {
  return [
    {
      type: 'item',
      id: 'item-a',
      size: { width: 100, height: 80 },
      components: [{
        type: 'bar',
        id: 'level',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height },
        placement: 'bottom',
        animation: true,
        animationDuration: 200,
      }],
    },
    {
      type: 'image',
      id: 'scene-image',
      source: imageSource,
      size: 16,
    },
  ];
}

interface RendererBinding {
  readonly key: string;
  readonly generation: number;
  readonly request: LeafAssetBindingRequest;
}

class AtomicLoadRendererDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 800;
  public readonly height = 600;
  public readonly pixelRatio = 1;
  public destroyed = false;
  public currentProjection: PatchMapRuntime['visibleProjection'] = null;
  public nextProjectionFailure: Error | null = null;
  public nextMarkFailure: Error | null = null;
  public capturedPublicationCheckpoint: PatchMapPixiRendererPublicationCheckpoint | null = null;
  public restoredPublicationCheckpoint: PatchMapPixiRendererPublicationCheckpoint | null = null;
  private readonly bindings = new Map<string, RendererBinding>();
  private readonly bindingGenerations = new Map<string, number>();
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public get boundBindingKeys(): readonly string[] {
    return Object.freeze([...this.bindings.keys()].sort());
  }

  public markChanges(
    _ranges: readonly SlotRange[],
    _reason: string,
  ): void {
    const failure = this.nextMarkFailure;
    this.nextMarkFailure = null;
    if (failure) throw failure;
  }

  public markOverlayChanges(): void {}

  public setInstancePresentationOverrides(): boolean { return false; }

  public setProjection(index: NonNullable<PatchMapRuntime['visibleProjection']>): boolean {
    this.currentProjection = index;
    const nextFailure = this.nextProjectionFailure;
    this.nextProjectionFailure = null;
    if (nextFailure) throw nextFailure;
    return true;
  }

  public capturePublicationCheckpoint(): PatchMapPixiRendererPublicationCheckpoint {
    const checkpoint = Object.freeze({
      currentProjection: this.currentProjection,
    }) as unknown as PatchMapPixiRendererPublicationCheckpoint;
    this.capturedPublicationCheckpoint = checkpoint;
    return checkpoint;
  }

  public restorePublicationCheckpoint(
    checkpoint: PatchMapPixiRendererPublicationCheckpoint,
  ): void {
    this.restoredPublicationCheckpoint = checkpoint;
    this.currentProjection = (
      checkpoint as unknown as Readonly<{
        currentProjection: PatchMapRuntime['visibleProjection'];
      }>
    ).currentProjection;
  }

  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    const generation = (this.bindingGenerations.get(key) ?? 0) + 1;
    this.bindingGenerations.set(key, generation);
    this.bindings.set(key, { key, generation, request });
    return new Promise<LeafAssetBindingObservation>(() => undefined);
  }

  public unbindSceneAsset(key: string): Promise<boolean> {
    return Promise.resolve(this.bindings.delete(key));
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    const binding = this.bindings.get(key);
    if (!binding) return null;
    return Object.freeze({
      key,
      generation: binding.generation,
      request: binding.request,
      sourceKind: binding.request.kind === 'alias' ? 'alias' : 'url',
      state: 'pending',
      attached: false,
      cacheIdentity: null,
      normalizedResourceIdentity: null,
      reusedResolvedResource: false,
      naturalSize: null,
      consumerCount: 1,
      renderObjectCount: 1,
      placeholderCount: 1,
      renderRole: 'asset-placeholder',
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe {
    const binding = [...this.bindings.values()].at(-1);
    return Object.freeze({
      entityId,
      renderObjectCount: binding ? 1 : 0,
      role: binding ? 'asset-placeholder' : 'none',
      bindingKey: binding?.key ?? '',
      bindingGeneration: binding?.generation ?? 0,
    });
  }

  public setWorldOrientation(): boolean { return true; }
  public resize(): boolean { return false; }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(_store: RenderStoreView): RendererFlushResult {
    return Object.freeze({ rendered: true, commandCount: 1 });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(): Promise<void> { return Promise.resolve(); }
  public unloadAsset(): Promise<boolean> { return Promise.resolve(false); }
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public captureBase64(): Promise<string> {
    return Promise.resolve('data:image/png;base64,');
  }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapRendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: 0,
      storeEpoch: 0,
      entityCount: 0,
      aggregateRenderObjects: 0,
      visiblePrimitives: 0,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      fallbackTextCount: 0,
      imageCount: this.bindings.size,
      loadedAssetCount: 0,
      unresolvedAssetCount: this.bindings.size,
      view: this.view,
      lastInvalidation: 'test',
      destroyed: this.destroyed,
    });
  }
  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}
