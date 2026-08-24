import { afterEach, describe, expect, it } from 'vitest';

import type { CoreView, SlotRange } from '../../src/patch-map/dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RendererFlushResult,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/patch-map/core';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import {
  PatchMap,
  PixiEngineSurface,
  type PatchMapEngineSurface,
  type PatchMapSurfaceReconcileResult,
} from '../../src/patch-map/engine';
import type {
  LeafAssetBindingObservation,
  LeafAssetBindingProbe,
  LeafAssetBindingRequest,
  LeafSceneImageProbe,
} from '../../src/patch-map/renderers/leaf-layer';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type {
  PatchMapEntityPaintProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
} from '../../src/patch-map/renderers/types';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

interface TestBinding {
  readonly key: string;
  readonly generation: number;
  readonly request: LeafAssetBindingRequest;
  readonly deferred: Deferred<LeafAssetBindingObservation>;
  state: 'pending' | 'resolved' | 'failed';
  retired: boolean;
  consumerCount: number;
  renderObjectCount: number;
  placeholderCount: number;
}

class ComponentAssetRendererDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 320;
  public readonly height = 240;
  public readonly pixelRatio = 1;
  public readonly operations: string[] = [];
  public finalizeCount = 0;
  public destroyed = false;

  private readonly currentBindings = new Map<string, TestBinding>();
  private readonly bindingHistory = new Map<string, TestBinding[]>();
  private imageProbes = new Map<string, LeafSceneImageProbe>();
  private paintProbes = new Map<string, PatchMapEntityPaintProbe>();
  private projection: PatchMapProjectionIndex | null = null;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private laneSnapshot = emptyLaneSnapshot();

  public get liveBindingCount(): number {
    return this.currentBindings.size;
  }

  public get paintProbeCount(): number {
    return this.paintProbes.size;
  }

  public bindSceneAsset(
    key: string,
    request: LeafAssetBindingRequest,
  ): Promise<LeafAssetBindingObservation> {
    const history = this.bindingHistory.get(key) ?? [];
    const binding: TestBinding = {
      key,
      generation: history.length + 1,
      request,
      deferred: deferred<LeafAssetBindingObservation>(),
      state: 'pending',
      retired: false,
      consumerCount: 0,
      renderObjectCount: 0,
      placeholderCount: 0,
    };
    history.push(binding);
    this.bindingHistory.set(key, history);
    this.currentBindings.set(key, binding);
    this.operations.push(`bind:${key}:${binding.generation}`);
    return binding.deferred.promise;
  }

  public unbindSceneAsset(key: string): Promise<boolean> {
    const binding = this.currentBindings.get(key);
    this.operations.push(`unbind:${key}`);
    if (!binding) return Promise.resolve(false);
    binding.retired = true;
    this.currentBindings.delete(key);
    return Promise.resolve(true);
  }

  public sceneAssetBindingProbe(key: string): LeafAssetBindingProbe | null {
    const binding = this.currentBindings.get(key);
    if (!binding) return null;
    return Object.freeze({
      key,
      generation: binding.generation,
      request: binding.request,
      sourceKind: binding.request.kind === 'alias' ? 'alias' : 'url',
      state: binding.state,
      attached: binding.state === 'resolved',
      cacheIdentity: binding.state === 'resolved' ? `cache:${key}` : null,
      normalizedResourceIdentity: binding.state === 'resolved' ? `decoded:${key}` : null,
      reusedResolvedResource: binding.consumerCount > 1,
      naturalSize: binding.state === 'resolved' ? Object.freeze([64, 32] as const) : null,
      consumerCount: binding.consumerCount,
      renderObjectCount: binding.renderObjectCount,
      placeholderCount: binding.placeholderCount,
      renderRole: binding.renderObjectCount === 0
        ? 'none'
        : binding.placeholderCount > 0
          ? 'asset-placeholder'
          : 'image',
      staleAttachCount: 0,
      staleCompletionCount: 0,
    });
  }

  public sceneImageProbe(entityId: string): LeafSceneImageProbe | null {
    return this.imageProbes.get(entityId) ?? null;
  }

  public entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null {
    return this.paintProbes.get(entityId) ?? null;
  }

  public renderLaneProbe(): PatchMapRenderLaneSnapshot {
    return this.laneSnapshot;
  }

  public resolve(key: string, generation?: number): void {
    const history = this.bindingHistory.get(key) ?? [];
    const binding = generation === undefined
      ? history.at(-1)
      : history.find((entry) => entry.generation === generation);
    if (!binding) throw new Error(`missing test binding ${key}`);
    binding.state = 'resolved';
    binding.deferred.resolve(Object.freeze({
      key,
      generation: binding.generation,
      status: binding.retired ? 'stale' : 'attached',
      cacheIdentity: `cache:${key}`,
      normalizedResourceIdentity: `decoded:${key}`,
      reusedResolvedResource: false,
      naturalSize: Object.freeze([64, 32] as const),
    }));
  }

  public markChanges(_ranges: readonly SlotRange[], _reason: string): void {}
  public markOverlayChanges(): void {}
  public setProjection(projection: PatchMapProjectionIndex | null): boolean {
    this.projection = projection;
    return true;
  }
  public setWorldOrientation(): boolean { return true; }
  public resize(): boolean { return false; }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(store: RenderStoreView): RendererFlushResult {
    this.synchronizeProbes(store);
    return Object.freeze({ rendered: true, commandCount: this.paintProbes.size });
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
  public debugSnapshot(): PatchMapPixiRendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: 0,
      storeEpoch: 0,
      entityCount: this.paintProbes.size,
      aggregateRenderObjects: this.paintProbes.size,
      visiblePrimitives: [...this.paintProbes.values()].reduce(
        (sum, probe) => sum + probe.primitiveCount,
        0,
      ),
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      pixiTextCount: 0,
      imageCount: [...this.imageProbes.values()].reduce(
        (sum, probe) => sum + probe.renderObjectCount,
        0,
      ),
      loadedAssetCount: [...this.currentBindings.values()].filter(
        ({ state }) => state === 'resolved',
      ).length,
      unresolvedAssetCount: [...this.currentBindings.values()].filter(
        ({ state }) => state !== 'resolved',
      ).length,
      view: this.view,
      lastInvalidation: 'test',
      destroyed: this.destroyed,
    });
  }
  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.currentBindings.clear();
    this.imageProbes.clear();
    this.paintProbes.clear();
    this.laneSnapshot = emptyLaneSnapshot();
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }

  private synchronizeProbes(store: RenderStoreView): void {
    this.imageProbes = new Map();
    this.paintProbes = new Map();
    for (const binding of this.currentBindings.values()) {
      binding.consumerCount = 0;
      binding.renderObjectCount = 0;
      binding.placeholderCount = 0;
    }
    const counts = new Map<PatchMapRenderLaneRole, number>();
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if ((store.alive[slot] ?? 0) !== 1) continue;
      const entityId = store.ids[slot];
      if (!entityId) continue;
      const component = this.projection?.componentsByEntityId?.[entityId];
      if (!component) continue;
      const lane = component.renderRole === 'background-asset'
        ? 'background-assets'
        : component.renderRole === 'content-asset'
          ? 'content-assets'
          : 'background-geometry';
      const visible = ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0;
      const packedTint = (store.tint[slot] ?? store.fill[slot] ?? 0xffffffff) >>> 0;
      const kind = store.kind[slot];
      if (kind === RenderKind.Image) {
        const bindingKey = this.projection?.imagesByEntityId?.[entityId]?.bindingKey ?? '';
        const binding = this.currentBindings.get(bindingKey);
        const renderObjectCount = visible ? 1 : 0;
        const role = renderObjectCount === 0
          ? 'none'
          : binding?.state === 'resolved'
            ? 'image'
            : 'asset-placeholder';
        if (binding && visible) {
          binding.consumerCount += 1;
          binding.renderObjectCount += 1;
          if (role === 'asset-placeholder') binding.placeholderCount += 1;
        }
        this.imageProbes.set(entityId, Object.freeze({
          entityId,
          renderObjectCount,
          role,
          bindingKey,
          bindingGeneration: binding?.generation ?? 0,
          staleAttachCount: 0,
          staleCompletionCount: 0,
        }));
        this.paintProbes.set(entityId, Object.freeze({
          entityId,
          lane,
          rendererKind: renderObjectCount === 0 ? 'none' : 'sprite',
          primitiveCount: renderObjectCount,
          renderObjectCount,
          packedTint,
          rgbTint: renderObjectCount === 0
            ? null
            : role === 'image'
              ? packedTint >>> 8
              : 0xc7ceda,
          alpha: renderObjectCount === 0
            ? null
            : ((packedTint & 0xff) / 255) * (store.opacity[slot] ?? 1),
        }));
        if (visible) counts.set(lane, (counts.get(lane) ?? 0) + 1);
        continue;
      }
      if (kind === RenderKind.Rect && component.renderRole === 'background-geometry') {
        this.paintProbes.set(entityId, Object.freeze({
          entityId,
          lane,
          rendererKind: visible ? 'mesh' : 'none',
          primitiveCount: visible ? 1 : 0,
          renderObjectCount: 0,
          packedTint: (store.fill[slot] ?? 0xffffffff) >>> 0,
          rgbTint: visible ? (store.fill[slot] ?? 0xffffffff) >>> 8 : null,
          alpha: visible ? ((store.fill[slot] ?? 0xffffffff) & 0xff) / 255 : null,
        }));
        if (visible) counts.set(lane, (counts.get(lane) ?? 0) + 1);
      }
    }
    this.laneSnapshot = laneSnapshot(counts);
  }
}

describe('PatchMap component asset product/controller', () => {
  const engines: PatchMap[] = [];

  afterEach(async () => {
    await Promise.allSettled(engines.splice(0).map(async (engine) => engine.destroy()));
  });

  it('publishes rect-to-image and hide/show through one stable component identity', async () => {
    const { engine, renderer } = await createHarness(engines, 'background-lifecycle');
    const input = [{
      type: 'item',
      id: 'item',
      size: { width: 100, height: 80 },
      padding: 10,
      components: [{
        type: 'background',
        id: 'bg',
        source: { type: 'rect', fill: '#ff0000', borderWidth: 2, radius: 8 },
        size: { width: 20, height: 10 },
      }],
    }];
    const before = structuredClone(input);

    engine.loadDataset(input);
    expect(engine.componentVisualProbe({ ownerId: 'item', componentId: 'bg' })).toMatchObject({
      semantic: { source: { type: 'rect' } },
      renderRole: 'background-geometry',
      publication: { rendererFacts: 'pending' },
      sceneImage: null,
      rendererPaint: null,
      renderLanes: null,
      availability: {
        semantic: true,
        surface: true,
        rendererPaint: false,
        renderLanes: false,
      },
    });
    engine.publishFrame(0);
    expect(input).toEqual(before);
    const initial = engine.componentVisualProbe({ ownerId: 'item', componentId: 'bg' });
    expect(initial).toMatchObject({
      entityId: 'item::background:bg',
      logicalIdentity: 'item::background:bg',
      renderRole: 'background-geometry',
      semantic: {
        componentId: 'bg',
        componentType: 'background',
        authoredSize: { width: 20, height: 10 },
        show: true,
      },
      geometry: {
        localBounds: [0, 0, 100, 80],
        worldBounds: [0, 0, 100, 80],
        visibleBounds: [0, 0, 100, 80],
      },
      publication: { rendererFacts: 'current' },
      sceneImage: null,
      rendererPaint: { lane: 'background-geometry', primitiveCount: 1 },
    });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(engine.componentVisualProbe({ ownerId: 'other', componentId: 'bg' })).toBeNull();

    expect(engine.patch(
      { kind: 'component', ownerId: 'item', id: 'bg' },
      { source: 'fixture-image' },
    )).toMatchObject({ status: 'committed', denseChanged: true });
    expect(engine.componentVisualProbe({ ownerId: 'item', componentId: 'bg' })).toMatchObject({
      semantic: { source: 'fixture-image' },
      renderRole: 'background-asset',
      publication: { rendererFacts: 'pending' },
      sceneImage: null,
      rendererPaint: null,
      renderLanes: null,
    });
    renderer.resolve('alias:fixture-image');
    await engine.settleSceneImageBindings(['alias:fixture-image']);
    engine.publishFrame(20);
    const replaced = engine.componentVisualProbe({ ownerId: 'item', componentId: 'bg' });
    expect(replaced).toMatchObject({
      entityId: initial?.entityId,
      logicalIdentity: initial?.logicalIdentity,
      renderRole: 'background-asset',
      semantic: { source: 'fixture-image', show: true },
      publication: { rendererFacts: 'current' },
      geometry: { visibleBounds: [0, 0, 100, 80] },
      sceneImage: {
        active: true,
        generation: 1,
        bindingConsumerCount: 1,
        renderObjectCount: 1,
        placeholderCount: 0,
        attachmentState: 'current',
      },
      rendererPaint: { lane: 'background-assets', rendererKind: 'sprite' },
    });

    expect(engine.patch(
      { kind: 'component', ownerId: 'item', id: 'bg' },
      { show: false },
    )).toMatchObject({ status: 'committed' });
    expect(engine.sceneImageProbe()).toMatchObject({
      bindingCount: 0,
      pendingReleaseCount: 1,
    });
    engine.publishFrame(30);
    await engine.settleSceneImages();
    const hidden = engine.componentVisualProbe({ ownerId: 'item', componentId: 'bg' });
    expect(hidden).toMatchObject({
      entityId: initial?.entityId,
      logicalIdentity: initial?.logicalIdentity,
      semantic: { show: false, source: 'fixture-image' },
      geometry: { visibleBounds: null, visible: false },
      sceneImage: {
        active: false,
        bindingConsumerCount: 0,
        renderObjectCount: 0,
        placeholderCount: 0,
      },
      rendererPaint: {
        lane: 'background-assets',
        rendererKind: 'none',
        renderObjectCount: 0,
      },
    });
    expect(engine.sceneImageProbe()).toMatchObject({ pendingReleaseCount: 0 });

    expect(engine.patch(
      { kind: 'component', ownerId: 'item', id: 'bg' },
      { show: true },
    )).toMatchObject({ status: 'committed' });
    renderer.resolve('alias:fixture-image');
    await engine.settleSceneImageBindings(['alias:fixture-image']);
    engine.publishFrame(40);
    expect(engine.componentVisualProbe({ ownerId: 'item', componentId: 'bg' })).toMatchObject({
      entityId: initial?.entityId,
      logicalIdentity: initial?.logicalIdentity,
      semantic: { show: true, source: 'fixture-image' },
      sceneImage: {
        active: true,
        generation: 3,
        bindingConsumerCount: 1,
        renderObjectCount: 1,
      },
    });
    expect(input).toEqual(before);

    await engine.destroy();
    engines.splice(engines.indexOf(engine), 1);
    expect(renderer.liveBindingCount).toBe(0);
    expect(renderer.paintProbeCount).toBe(0);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'destroyed',
      pendingWork: 0,
      resources: { canvasCount: 0, subscriptions: { active: 0 } },
    });
  });

  it('rejects a late old icon source and retains acquisition generation for tint-only paint', async () => {
    const first = await createHarness(engines, 'icon-first');
    const firstActual = await runIconTrace(first.engine, first.renderer);
    expect(firstActual.probe).toMatchObject({
      entityId: 'item-a::icon:icon',
      logicalIdentity: 'item-a::icon:icon',
      renderRole: 'content-asset',
      semantic: {
        source: 'fixture-icon-2',
        tint: '#00ff00ff',
        authoredSize: { width: '50%', height: '25%' },
      },
      geometry: {
        localBounds: [0, 0, 40, 15],
        worldBounds: [47, 12, 40, 15],
      },
      sceneImage: {
        generation: 2,
        staleAttachCount: 0,
        staleCompletionCount: 1,
        bindingConsumerCount: 1,
        renderObjectCount: 1,
      },
      rendererPaint: {
        lane: 'content-assets',
        rendererKind: 'sprite',
        packedTint: 0x00ff00ff,
        rgbTint: 0x00ff00,
        alpha: 1,
      },
    });
    expect(firstActual.operationsAfterTint).toEqual(firstActual.operationsBeforeTint);
    expect(firstActual.generationAfterTint).toBe(firstActual.generationBeforeTint);
    expect(firstActual.rendererGenerationAfterTint).toBe(
      firstActual.rendererGenerationBeforeTint,
    );

    await first.engine.destroy();
    engines.splice(engines.indexOf(first.engine), 1);
    expect(first.renderer.liveBindingCount).toBe(0);
    expect(first.renderer.paintProbeCount).toBe(0);

    const second = await createHarness(engines, 'icon-second');
    const secondActual = await runIconTrace(second.engine, second.renderer);
    expect(stableIconActual(secondActual)).toEqual(stableIconActual(firstActual));
    await second.engine.destroy();
    engines.splice(engines.indexOf(second.engine), 1);
    expect(second.renderer.liveBindingCount).toBe(0);
    expect(second.renderer.paintProbeCount).toBe(0);
  });

  it('keeps missing legacy surface facts explicitly unavailable', async () => {
    const surface = new LegacySurface();
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    engines.push(engine);
    await engine.initialize({ instanceId: 'legacy-component-probe', width: 100, height: 80 });
    engine.loadDataset([{
      type: 'item',
      id: 'item',
      size: { width: 100, height: 80 },
      components: [{
        type: 'icon',
        id: 'icon',
        source: 'fixture-icon',
        size: 16,
      }],
    }]);

    expect(engine.componentVisualProbe({ ownerId: 'item', componentId: 'icon' })).toMatchObject({
      semantic: {
        componentId: 'icon',
        source: 'fixture-icon',
        authoredSize: 16,
      },
      entityId: null,
      logicalIdentity: null,
      renderRole: null,
      geometry: null,
      sceneImage: null,
      rendererPaint: null,
      renderLanes: null,
      publication: null,
      availability: {
        semantic: true,
        surface: false,
        rendererPaint: false,
        renderLanes: false,
      },
    });
  });
});

async function createHarness(
  engines: PatchMap[],
  instanceId: string,
): Promise<Readonly<{ engine: PatchMap; renderer: ComponentAssetRendererDouble }>> {
  const renderer = new ComponentAssetRendererDouble();
  const engine = new PatchMap({
    surfaceFactory: () => {
      const TestPatchMap = PatchMapRuntime as unknown as new (
        renderer: PatchMapPixiRenderer,
        options: PatchMapRuntimeOptions,
      ) => PatchMapRuntime;
      const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
        autoRender: false,
      });
      return Promise.resolve(new PixiEngineSurface(core));
    },
  });
  engines.push(engine);
  await engine.initialize({ instanceId, width: 320, height: 240 });
  return Object.freeze({ engine, renderer });
}

async function runIconTrace(
  engine: PatchMap,
  renderer: ComponentAssetRendererDouble,
): Promise<Readonly<{
  probe: ReturnType<PatchMap['componentVisualProbe']>;
  operationsBeforeTint: readonly string[];
  operationsAfterTint: readonly string[];
  generationBeforeTint: number | undefined;
  generationAfterTint: number | undefined;
  rendererGenerationBeforeTint: number | null | undefined;
  rendererGenerationAfterTint: number | null | undefined;
}>> {
  const input = [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    padding: 10,
    components: [{
      type: 'icon',
      id: 'icon',
      source: 'fixture-icon',
      size: { width: '50%', height: '25%' },
      placement: 'right-top',
      margin: { top: 2, right: 3 },
    }],
  }];
  const before = structuredClone(input);
  engine.loadDataset(input);
  engine.publishFrame(0);

  expect(engine.patch(
    { kind: 'component', ownerId: 'item-a', id: 'icon' },
    { source: 'fixture-icon-2' },
  )).toMatchObject({ status: 'committed' });
  expect(engine.sceneImageProbe()?.images['item-a::icon:icon']).toMatchObject({
    authoredSource: 'fixture-icon-2',
    publication: { rendererFacts: 'pending' },
    renderObjectCount: 0,
    placeholderCount: 0,
    role: 'none',
  });
  renderer.resolve('alias:fixture-icon-2');
  await engine.settleSceneImageBindings(['alias:fixture-icon-2']);
  engine.publishFrame(20);
  renderer.resolve('alias:fixture-icon', 1);
  await engine.settleSceneImages();

  const beforeTint = engine.componentVisualProbe({ ownerId: 'item-a', componentId: 'icon' });
  const operationsBeforeTint = Object.freeze([...renderer.operations]);
  expect(engine.patch(
    { kind: 'component', ownerId: 'item-a', id: 'icon' },
    { tint: '#00ff00ff' },
  )).toMatchObject({ status: 'committed' });
  engine.publishFrame(30);
  const probe = engine.componentVisualProbe({ ownerId: 'item-a', componentId: 'icon' });
  expect(input).toEqual(before);
  return Object.freeze({
    probe,
    operationsBeforeTint,
    operationsAfterTint: Object.freeze([...renderer.operations]),
    generationBeforeTint: beforeTint?.sceneImage?.generation,
    generationAfterTint: probe?.sceneImage?.generation,
    rendererGenerationBeforeTint: beforeTint?.sceneImage?.rendererGeneration,
    rendererGenerationAfterTint: probe?.sceneImage?.rendererGeneration,
  });
}

function stableIconActual(
  value: Awaited<ReturnType<typeof runIconTrace>>,
): unknown {
  return Object.freeze({
    entityId: value.probe?.entityId,
    logicalIdentity: value.probe?.logicalIdentity,
    semantic: value.probe?.semantic,
    geometry: value.probe?.geometry,
    sceneImage: value.probe?.sceneImage,
    rendererPaint: value.probe?.rendererPaint,
    operations: value.operationsAfterTint,
  });
}

class LegacySurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public load(): void {}
  public reconcile(): PatchMapSurfaceReconcileResult {
    return Object.freeze({
      status: 'committed',
      operationCount: 0,
      denseChanged: false,
      diagnostics: Object.freeze([]),
    });
  }
  public publishFrame(): void {}
  public resize(): boolean { return false; }
  public setView(): void {}
  public select(): void {}
  public hitTestScreen(): string | null { return null; }
  public screenToWorld(point: Readonly<{ x: number; y: number }>): Readonly<{ x: number; y: number }> {
    return point;
  }
  public debugSnapshot() {
    return Object.freeze({
      cssSize: Object.freeze([100, 80] as const),
      backingSize: Object.freeze([100, 80] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
    });
  }
  public destroy(): Promise<boolean> {
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function laneSnapshot(
  counts: ReadonlyMap<PatchMapRenderLaneRole, number>,
): PatchMapRenderLaneSnapshot {
  return Object.freeze({
    'background-geometry': lane('background-geometry', counts),
    'background-assets': lane('background-assets', counts),
    'ordinary-geometry': lane('ordinary-geometry', counts),
    'relations-dynamic': lane('relations-dynamic', counts),
    'content-assets': lane('content-assets', counts),
    text: lane('text', counts),
    'interaction-overlay': lane('interaction-overlay', counts),
  });
}

function emptyLaneSnapshot(): PatchMapRenderLaneSnapshot {
  return laneSnapshot(new Map());
}

function lane(
  role: PatchMapRenderLaneRole,
  counts: ReadonlyMap<PatchMapRenderLaneRole, number>,
) {
  const count = counts.get(role) ?? 0;
  return Object.freeze({
    role,
    label: `core-v2:${role}`,
    renderObjectCount: count,
    visiblePrimitiveCount: count,
  });
}
