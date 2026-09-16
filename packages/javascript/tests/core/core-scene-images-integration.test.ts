import { afterEach, describe, expect, it } from 'vitest';

import type { CoreView, SlotRange } from '../../src/dense/contracts';
import type { RendererFlushResult, RenderStoreView } from '../../src/dense/renderer-types';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/core';
import type { PatchMapPresentationLayerRenderUpdate } from '../../src/presentation/layer-contracts';
import type {
  LeafAssetBindingObservation,
  LeafAssetBindingProbe,
  LeafAssetBindingRequest,
  LeafSceneImageProbe,
} from '../../src/rendering/leaf-layer';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/rendering/pixi-renderer';
import type { PatchMapRendererEntityPresentationOverride } from '../../src/rendering/contracts/presentation-store';
import type {
  PatchMapRendererDebug,
  RootInteractionHandlers,
} from '../../src/rendering-port';
import {
  patchMapAffineCorners,
  patchMapAffineHasSkew,
  createPatchMapAffine,
  multiplyPatchMapAffine,
} from '../../src/semantic/geometry';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

interface Binding {
  readonly key: string;
  readonly generation: number;
  readonly request: LeafAssetBindingRequest;
  readonly deferred: Deferred<LeafAssetBindingObservation>;
  state: 'pending' | 'resolved' | 'failed';
  retired: boolean;
  naturalSize: readonly [number, number] | null;
  cacheIdentity: string | null;
  normalizedResourceIdentity: string | null;
}

class SceneImageRendererDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 800;
  public readonly height = 600;
  public readonly pixelRatio = 1;
  public readonly operations: string[] = [];
  public readonly projections: unknown[] = [];
  public finalizeCount = 0;
  public destroyed = false;
  public unbindFailure: Error | null = null;
  public whenDestroyedFailure: Error | null = null;

  private readonly current = new Map<string, Binding>();
  private readonly history = new Map<string, Binding[]>();
  private presentationOverrides: ReadonlyMap<
    string,
    PatchMapRendererEntityPresentationOverride
  > = new Map();
  private presentationLayerUpdate: PatchMapPresentationLayerRenderUpdate | null = null;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    const binding: Binding = {
      key,
      generation: (this.history.get(key)?.length ?? 0) + 1,
      request,
      deferred: deferred<LeafAssetBindingObservation>(),
      state: 'pending',
      retired: false,
      naturalSize: null,
      cacheIdentity: null,
      normalizedResourceIdentity: null,
    };
    this.current.set(key, binding);
    this.history.set(key, [...(this.history.get(key) ?? []), binding]);
    this.operations.push(`bind:${key}`);
    return binding.deferred.promise;
  }

  public unbindSceneAsset(key: string): Promise<boolean> {
    const binding = this.current.get(key);
    this.operations.push(`unbind:${key}`);
    if (!binding) return Promise.resolve(false);
    binding.retired = true;
    this.current.delete(key);
    return this.unbindFailure ? Promise.reject(this.unbindFailure) : Promise.resolve(true);
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    const binding = this.current.get(key);
    if (!binding) return null;
    return Object.freeze({
      key,
      generation: binding.generation,
      request: binding.request,
      sourceKind: binding.request.kind === 'alias' ? 'alias' : 'url',
      state: binding.state,
      attached: binding.state === 'resolved',
      cacheIdentity: binding.cacheIdentity,
      normalizedResourceIdentity: binding.normalizedResourceIdentity,
      reusedResolvedResource: false,
      naturalSize: binding.naturalSize,
      consumerCount: 1,
      renderObjectCount: 1,
      placeholderCount: binding.state === 'resolved' ? 0 : 1,
      renderRole: binding.state === 'resolved' ? 'image' : 'asset-placeholder',
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    const binding = [...this.current.values()].at(-1);
    return binding
      ? Object.freeze({
          entityId,
          renderObjectCount: 1,
          role: binding.state === 'resolved' ? 'image' : 'asset-placeholder',
          bindingKey: binding.key,
          bindingGeneration: binding.generation,
        })
      : Object.freeze({
          entityId,
          renderObjectCount: 0,
          role: 'none',
          bindingKey: '',
          bindingGeneration: 0,
        });
  }

  public resolve(
    key: string,
    options: Readonly<{
      generation?: number;
      naturalSize?: readonly [number, number];
      cacheIdentity?: string;
      normalizedResourceIdentity?: string;
    }> = {},
  ): void {
    const bindings = this.history.get(key) ?? [];
    const binding = options.generation === undefined
      ? bindings.at(-1)
      : bindings.find((candidate) => candidate.generation === options.generation);
    if (!binding) throw new Error(`missing fixture binding ${key}`);
    binding.state = 'resolved';
    binding.naturalSize = options.naturalSize ?? [64, 32];
    binding.cacheIdentity = options.cacheIdentity ?? `cache:${key}`;
    binding.normalizedResourceIdentity = options.normalizedResourceIdentity ?? `decoded:${key}`;
    binding.deferred.resolve(Object.freeze({
      key,
      generation: binding.generation,
      status: binding.retired ? 'stale' : 'attached',
      cacheIdentity: binding.cacheIdentity,
      normalizedResourceIdentity: binding.normalizedResourceIdentity,
      reusedResolvedResource: false,
      naturalSize: binding.naturalSize,
    }));
  }

  public markChanges(_ranges: readonly SlotRange[], _reason: string): void {}
  public markOverlayChanges(): void {}
  public capturePublicationCheckpoint(): Readonly<{
    projectionCount: number;
    presentationOverrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>;
    presentationLayerUpdate: PatchMapPresentationLayerRenderUpdate | null;
  }> {
    return Object.freeze({
      projectionCount: this.projections.length,
      presentationOverrides: this.presentationOverrides,
      presentationLayerUpdate: this.presentationLayerUpdate,
    });
  }
  public restorePublicationCheckpoint(checkpoint: Readonly<{
    projectionCount: number;
    presentationOverrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>;
    presentationLayerUpdate: PatchMapPresentationLayerRenderUpdate | null;
  }>): void {
    this.projections.length = checkpoint.projectionCount;
    this.presentationOverrides = checkpoint.presentationOverrides;
    this.presentationLayerUpdate = checkpoint.presentationLayerUpdate;
  }
  public setProjection(value: unknown): boolean {
    this.projections.push(value);
    return true;
  }
  public setInstancePresentationOverrides(
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>,
  ): boolean {
    this.presentationOverrides = overrides;
    return true;
  }
  public setPresentationLayerMultipliers(
    update: PatchMapPresentationLayerRenderUpdate,
  ): boolean {
    this.presentationLayerUpdate = update;
    return true;
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
  public finalizeAssetUnloads(): Promise<void> {
    this.finalizeCount += 1;
    return Promise.resolve();
  }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
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
      imageCount: 0,
      loadedAssetCount: 0,
      unresolvedAssetCount: 0,
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
  public whenDestroyed(): Promise<void> {
    return this.whenDestroyedFailure
      ? Promise.reject(this.whenDestroyedFailure)
      : Promise.resolve();
  }
}

describe('PatchMap scene image integration', () => {
  const allocated: PatchMapRuntime[] = [];

  afterEach(async () => {
    await Promise.allSettled(allocated.splice(0).map((core) => core.destroy()));
  });

  it('publishes decoded intrinsic size through render projection and hit geometry', async () => {
    const { core, renderer } = createCore(allocated);
    const dataset = [{
      type: 'image',
      id: 'intrinsic',
      source: 'fixture-image',
      attrs: { x: 10, y: 20 },
    }] as const;
    core.load(dataset);
    expect(core.projection?.byEntityId.intrinsic?.localBounds).toEqual([0, 0, 32, 32]);

    renderer.resolve('alias:fixture-image', { naturalSize: [80, 40] });
    await core.settleSceneImages();

    expect(core.get('intrinsic')?.bounds).toMatchObject({ width: 32, height: 32 });
    expect(core.projection?.byEntityId.intrinsic?.localBounds).toEqual([0, 0, 80, 40]);
    expect(core.hitBounds('intrinsic')).toEqual([10, 20, 80, 40]);
    expect(core.hitTestScreen({ x: 89, y: 59 })?.slot).toBe(core.ref('intrinsic')?.slot);
    expect(renderer.projections.at(-1)).toBe(core.visibleProjection);

    core.load(dataset);
    expect(core.projection?.byEntityId.intrinsic?.localBounds).toEqual([0, 0, 80, 40]);
    expect(core.hitBounds('intrinsic')).toEqual([10, 20, 80, 40]);
    expect(core.sceneImageProbe().images.intrinsic).toMatchObject({
      generation: 1,
      naturalSize: [80, 40],
      attachmentState: 'current',
    });
  });

  it('publishes a replacement target with an already-decoded shared intrinsic size', async () => {
    const { core, renderer } = createCore(allocated);
    core.load([{
      type: 'image',
      id: 'old-target',
      source: 'fixture-image',
      attrs: { x: 10, y: 20 },
    }]);
    renderer.resolve('alias:fixture-image', { naturalSize: [80, 40] });
    await core.settleSceneImages();

    core.load([{
      type: 'image',
      id: 'replacement-target',
      source: 'fixture-image',
      attrs: { x: 30, y: 50 },
    }]);

    expect(core.projection?.byEntityId['replacement-target']?.localBounds)
      .toEqual([0, 0, 80, 40]);
    expect(core.visibleProjection?.byEntityId['replacement-target']?.localBounds)
      .toEqual([0, 0, 80, 40]);
    expect(core.hitBounds('replacement-target')).toEqual([30, 50, 80, 40]);
    expect(core.sceneImageProbe().images['replacement-target']).toMatchObject({
      generation: 1,
      naturalSize: [80, 40],
      attachmentState: 'current',
    });
  });

  it('batches shared intrinsic sizes and preserves rotated reflected top-left pivots', async () => {
    const { core, renderer } = createCore(allocated);
    core.load([
      {
        type: 'image',
        id: 'plain',
        source: 'fixture-image',
        attrs: { x: 10, y: 20 },
      },
      {
        type: 'image',
        id: 'rotated-reflected',
        source: 'fixture-image',
        attrs: { x: 100, y: 50, angle: 90, scaleX: -2, scaleY: 1 },
      },
    ]);
    expect(renderer.projections).toHaveLength(1);

    renderer.resolve('alias:fixture-image', { naturalSize: [20, 10] });
    await core.settleSceneImages();

    expect(renderer.projections).toHaveLength(2);
    expect(core.projection?.byEntityId.plain).toMatchObject({
      localBounds: [0, 0, 20, 10],
      visibleCenter: [20, 25],
    });
    expect(core.hitBounds('plain')).toEqual([10, 20, 20, 10]);
    expect(core.projection?.byEntityId['rotated-reflected']).toMatchObject({
      localBounds: [0, 0, 20, 10],
      visibleCenter: [95, 30],
      scaleX: -2,
      scaleY: 1,
    });
    expect(core.hitBounds('rotated-reflected')).toEqual([90, 10, 10, 40]);
  });

  it('preserves nested affine authority when intrinsic size resolves and on reload', async () => {
    const { core, renderer } = createCore(allocated);
    const dataset = [{
      type: 'group',
      id: 'parent',
      attrs: { x: 30, y: 20, angle: 25, scaleX: 2, scaleY: 0.5 },
      children: [{
        type: 'image',
        id: 'intrinsic-child',
        source: 'fixture-image',
        attrs: { x: 12, y: 8, angle: 40, scaleX: -1.5, scaleY: 0.75 },
      }],
    }] as const;
    core.load(dataset);

    const fallback = nestedImageAffine();
    expectAffineClose(core.projection?.byEntityId['intrinsic-child']?.affine, fallback);
    expect(patchMapAffineHasSkew(fallback)).toBe(true);

    renderer.resolve('alias:fixture-image', { naturalSize: [48, 20] });
    await core.settleSceneImages();

    const resolved = nestedImageAffine();
    expect(core.projection?.byEntityId['intrinsic-child']?.localBounds).toEqual([0, 0, 48, 20]);
    expectAffineClose(core.projection?.byEntityId['intrinsic-child']?.affine, resolved);
    expectBoundsClose(core.hitBounds('intrinsic-child'), affineAabb(resolved, 48, 20));

    core.load(dataset);
    expect(core.projection?.byEntityId['intrinsic-child']?.localBounds).toEqual([0, 0, 48, 20]);
    expectAffineClose(core.projection?.byEntityId['intrinsic-child']?.affine, resolved);
    expectBoundsClose(core.hitBounds('intrinsic-child'), affineAabb(resolved, 48, 20));
    expect(core.sceneImageProbe().images['intrinsic-child']).toMatchObject({
      generation: 1,
      naturalSize: [48, 20],
      attachmentState: 'current',
    });
  });

  it('atomically rejects direct image mutations that cannot update the parser sidecar', () => {
    const { core } = createCore(allocated);
    core.load([
      { type: 'rect', id: 'box', size: 10 },
      { type: 'image', id: 'image', source: 'fixture-image', size: 16 },
    ]);
    const before = core.snapshot();
    const beforeProjection = core.projection;
    const beforeProbe = core.sceneImageProbe();
    const unsafeBatches = [
      { operations: [{ type: 'remove' as const, target: 'image' }] },
      {
        operations: [{
          type: 'patch' as const,
          target: 'image',
          changes: { source: 'replacement' },
        }],
      },
      {
        operations: [{
          type: 'patch' as const,
          target: 'image',
          changes: { x: 99 },
        }],
      },
      {
        operations: [{
          type: 'animate' as const,
          target: 'image',
          property: 'rotation' as const,
          to: 90,
          durationMs: 100,
        }],
      },
      {
        operations: [{
          type: 'add' as const,
          entity: {
            kind: 'image' as const,
            id: 'added',
            x: 0,
            y: 0,
            width: 8,
            height: 8,
            source: 'fixture-image',
          },
        }],
      },
      {
        operations: [
          { type: 'patch' as const, target: 'box', changes: { x: 50 } },
          { type: 'patch' as const, target: 'image', changes: { width: 32 } },
        ],
      },
    ];

    for (const batch of unsafeBatches) {
      expect(() => core.commit(batch)).toThrow(/PatchMapRuntime\.reconcile/u);
      expect(core.snapshot()).toEqual(before);
      expect(core.projection).toBe(beforeProjection);
      expect(core.sceneImageProbe()).toEqual(beforeProbe);
    }

    expect(core.commit({
      operations: [{ type: 'visibility', target: 'image', visible: false }],
    })).toMatchObject({ changed: 1, added: 0, removed: 0 });
    expect(core.sceneImageProbe().images.image).toMatchObject({ active: false });
  });

  it('keeps direct image visibility in normalized authority for later reconcile', () => {
    const { core } = createCore(allocated);
    const dataset = [{
      type: 'image',
      id: 'image',
      source: 'fixture-image',
      size: 16,
    }] as const;
    const inputBefore = JSON.stringify(dataset);
    core.load(dataset);
    const identity = core.identity;
    const projection = core.projection;

    expect(core.commit({
      operations: [{ type: 'visibility', target: 'image', visible: false }],
    })).toMatchObject({ changed: 1 });
    expect(core.get('image')?.visible).toBe(false);
    expect(core.sceneImageProbe().images.image).toMatchObject({ active: false });
    expect(core.identity).toBe(identity);
    expect(core.projection).toBe(projection);
    expect(JSON.stringify(dataset)).toBe(inputBefore);

    const reconciled = core.reconcile(dataset);
    expect(reconciled).toMatchObject({
      status: 'committed',
      commit: { changed: 1 },
      facts: { denseChanged: true },
    });
    expect(core.get('image')?.visible).toBe(true);
    expect(core.sceneImageProbe().images.image).toMatchObject({ active: true });
    expect(JSON.stringify(dataset)).toBe(inputBefore);

    const reconciledIdentity = core.identity;
    const reconciledProjection = core.projection;
    expect(core.commit({
      operations: [{ type: 'patch', target: 'image', changes: { visible: false } }],
    })).toMatchObject({ changed: 1 });
    expect(core.get('image')?.visible).toBe(false);
    expect(core.identity).toBe(reconciledIdentity);
    expect(core.projection).toBe(reconciledProjection);
    expect(core.reconcile(dataset)).toMatchObject({
      status: 'committed',
      commit: { changed: 1 },
      facts: { denseChanged: true },
    });
    expect(core.get('image')?.visible).toBe(true);
    expect(JSON.stringify(dataset)).toBe(inputBefore);
  });

  it('retires before source replacement, discards the late completion, and releases after a frame', async () => {
    const { core, renderer } = createCore(allocated);
    const oldKey = 'descriptor:{"data":{"resolution":2},"src":"fixture://old.svg"}';
    core.load([{
      type: 'image',
      id: 'descriptor',
      source: { src: 'fixture://old.svg', data: { resolution: 2 } },
      size: { width: 32, height: 32 },
    }]);

    const replacement = core.reconcile([{
      type: 'image',
      id: 'descriptor',
      source: 'fixture-image',
      size: { width: 32, height: 32 },
    }]);
    expect(replacement.status).toBe('committed');
    expect(renderer.operations.slice(0, 3)).toEqual([
      `bind:${oldKey}`,
      `unbind:${oldKey}`,
      'bind:alias:fixture-image',
    ]);

    renderer.resolve('alias:fixture-image');
    await core.settleSceneImageBindings(['alias:fixture-image']);
    renderer.resolve(oldKey, { generation: 1 });
    await core.settleSceneImages();

    expect(core.sceneImageProbe().images.descriptor).toMatchObject({
      authoredSource: 'fixture-image',
      state: 'resolved',
      staleAttachCount: 0,
      staleCompletionCount: 1,
      attempts: [
        expect.objectContaining({ resourceState: 'resolved', attachmentState: 'stale' }),
        expect.objectContaining({ resourceState: 'resolved', attachmentState: 'current' }),
      ],
    });

    const hidden = core.reconcile([{
      type: 'image',
      id: 'descriptor',
      source: 'fixture-image',
      size: { width: 32, height: 32 },
      show: false,
    }]);
    expect(hidden.status).toBe('committed');
    expect(core.sceneImageProbe().images.descriptor).toMatchObject({
      active: false,
      renderObjectCount: 0,
    });
    expect(renderer.finalizeCount).toBe(0);

    core.flush('hidden-replacement');
    await core.settleSceneImages();
    expect(renderer.finalizeCount).toBe(1);
  });

  it('destroys without waiting on a pending decoder', async () => {
    const { core, renderer } = createCore(allocated);
    core.load([{ type: 'image', id: 'pending', source: 'fixture://pending.svg', size: 16 }]);

    await expect(core.destroy()).resolves.toBe(true);

    allocated.splice(allocated.indexOf(core), 1);
    expect(renderer.destroyed).toBe(true);
    expect(renderer.operations).toContain('unbind:url:fixture://pending.svg');
  });

  it('preserves both scene-image and renderer cleanup failures', async () => {
    const { core, renderer } = createCore(allocated);
    core.load([{ type: 'image', id: 'image', source: 'fixture-image', size: 16 }]);
    renderer.unbindFailure = new Error('fixture image unbind failure');
    renderer.whenDestroyedFailure = new Error('fixture renderer destroy failure');

    let failure: unknown;
    try {
      await core.destroy();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    const failures = (failure as AggregateError).errors;
    expect(failures).toHaveLength(2);
    expect(failures[0]).toBeInstanceOf(AggregateError);
    expect((failures[0] as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'fixture image unbind failure' }),
    ]);
    expect(failures[1]).toEqual(
      expect.objectContaining({ message: 'fixture renderer destroy failure' }),
    );
    expect(await core.destroy()).toBe(false);
    allocated.splice(allocated.indexOf(core), 1);
  });
});

function createCore(allocated: PatchMapRuntime[]): Readonly<{
  core: PatchMapRuntime;
  renderer: SceneImageRendererDouble;
}> {
  const renderer = new SceneImageRendererDouble();
  const TestPatchMap = PatchMapRuntime as unknown as new (
    renderer: PatchMapPixiRenderer,
    options: PatchMapRuntimeOptions,
  ) => PatchMapRuntime;
  const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
    autoRender: false,
  });
  allocated.push(core);
  return { core, renderer };
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function nestedImageAffine() {
  return multiplyPatchMapAffine(
    createPatchMapAffine(30, 20, 25, 2, 0.5),
    multiplyPatchMapAffine(
      createPatchMapAffine(12, 8),
      createPatchMapAffine(0, 0, 40, -1.5, 0.75),
    ),
  );
}

function affineAabb(
  affine: readonly [number, number, number, number, number, number],
  width: number,
  height: number,
): readonly [number, number, number, number] {
  const corners = patchMapAffineCorners(affine, [0, 0, width, height]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];
}

function expectAffineClose(
  actual: readonly number[] | undefined,
  expected: readonly number[],
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual?.[index]).toBeCloseTo(value, 12));
}

function expectBoundsClose(
  actual: readonly number[] | null,
  expected: readonly number[],
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual?.[index]).toBeCloseTo(value, 10));
}
