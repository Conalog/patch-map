import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import {
  createPatchMapRenderComponentAssetsRuntime,
  type PatchMapRenderComponentAssetsRuntime,
} from '../../lab/patch-map/contract/render-component-assets-runtime';
import type { CoreView, SlotRange } from '../../src/patch-map/dense/contracts';
import type { RendererFlushResult, RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { PatchMapRuntime, type PatchMapRuntimeOptions } from '../../src/patch-map/core';
import {
  PatchMap,
  PixiEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';
import { AggregateLeafLayer } from '../../src/patch-map/renderers/leaf-layer';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type {
  PatchMapProjectionRenderContext,
  PatchMapRenderLaneProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
  PatchMapWorldOrientation,
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
} from '../../src/patch-map/renderers/types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';

type CaseId = 'REN-008' | 'REN-010';
type JsonRecord = Record<string, unknown>;

describe('PatchMap REN-008 / REN-010 local Pixi runtime adapter', () => {
  it('settles icon aliases through PatchMap, Pixi Texture/Sprite leases, and WebGL facts', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const runtime = createPatchMapRenderComponentAssetsRuntime();
    const { engine, renderer } = await createHarness(runtime, 'REN-010');

    try {
      expect(runtime.product.registerFixtureAssets(engine, { caseId: 'REN-010' })).toEqual({
        revision: 'core-v2-component-assets-registration/1',
        caseId: 'REN-010',
        registeredAliases: ['fixture-icon', 'fixture-icon-2'],
        duplicateAliases: [],
        transport: 'local-pixi-texture',
        networkRequestCount: 0,
      });
      engine.loadDataset(iconDataset());
      await expect(runtime.product.settleComponentAsset(engine, {
        caseId: 'REN-010',
        target: { ownerId: 'item-a', componentId: 'icon' },
      })).resolves.toMatchObject({
        settled: true,
        bindingKey: 'alias:fixture-icon',
        resourceState: 'resolved',
        pendingRequestCount: 0,
      });
      engine.publishFrame(0);

      const acquisition = await engine.acquireAsset('fixture-icon');
      expect(acquisition.resource).toBe(Texture.WHITE);
      await acquisition.release();
      const initial = runtime.product.resourceProbe({ caseId: 'REN-010' });
      expect(resourceCounts(initial)).toMatchObject({
        canvasCount: 1,
        bindingCount: 1,
        resourceCount: 1,
        leaseCount: 1,
        pendingSettlementCount: 0,
        rendererObjectCount: 1,
        cleanupFailureCount: 0,
      });
      expect(renderer.debugSnapshot()).toMatchObject({
        backend: 'webgl',
        imageCount: 1,
        destroyed: false,
      });

      expect(engine.patch(
        { kind: 'component', ownerId: 'item-a', id: 'icon' },
        { source: 'fixture-icon-2' },
      )).toMatchObject({ status: 'committed', changed: true });
      await runtime.product.settleComponentAsset(engine, {
        caseId: 'REN-010',
        target: { ownerId: 'item-a', componentId: 'icon' },
      });
      engine.publishFrame(20);
      await engine.settleSceneImages();
      const terminal = runtime.product.resourceProbe({ caseId: 'REN-010' });
      expect(resourceCounts(terminal)).toMatchObject({
        bindingCount: 1,
        resourceCount: 1,
        leaseCount: 1,
        pendingSettlementCount: 0,
        pendingReleaseCount: 0,
        rendererObjectCount: 1,
      });
      expect(journalOf(terminal).map(({ event }) => event)).toContain(
        'backend-texture-released',
      );
      expect(fetchSpy).not.toHaveBeenCalled();

      const terminalJournal = journalOf(terminal);
      await engine.destroy();
      const cleanup = runtime.postDestroyProductProbe();
      expect(cleanup).toMatchObject({
        revision: 'core-v2-component-assets-product-cleanup/1',
        caseId: 'REN-010',
        runtimeCounts: zeroRuntimeCounts(),
        backendCounts: {
          pendingRequestCount: 0,
          resolvedLiveResourceCount: 0,
          retainedLeaseCount: 0,
          pendingReleaseCount: 0,
        },
        controllerCounts: {
          targetCount: 0,
          bindingCount: 0,
          pendingSettlementCount: 0,
          pendingReleaseCount: 0,
          staleAttachmentCount: 0,
        },
      });
      expect(journalOf(cleanup).slice(0, terminalJournal.length)).toEqual(terminalJournal);
      expect(runtime.postDestroyProductProbe()).toBe(cleanup);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await engine.destroy();
      vi.unstubAllGlobals();
    }
  });

  it('keeps rect settlement resource-free and drains hide/show replacement generations', async () => {
    const runtime = createPatchMapRenderComponentAssetsRuntime();
    const { engine } = await createHarness(runtime, 'REN-008');

    try {
      runtime.product.registerFixtureAssets(engine, { caseId: 'REN-008' });
      engine.loadDataset(backgroundDataset());
      await expect(runtime.product.settleComponentAsset(engine, {
        caseId: 'REN-008',
        target: { ownerId: 'item', componentId: 'bg' },
      })).resolves.toMatchObject({
        settled: true,
        bindingKey: null,
        resourceState: 'not-applicable',
      });
      engine.publishFrame(0);
      expect(resourceCounts(runtime.product.resourceProbe({ caseId: 'REN-008' }))).toMatchObject({
        bindingCount: 0,
        resourceCount: 0,
        leaseCount: 0,
        rendererObjectCount: 0,
      });

      expect(engine.patch(
        { kind: 'component', ownerId: 'item', id: 'bg' },
        { source: 'fixture-image' },
      )).toMatchObject({ status: 'committed', changed: true });
      await runtime.product.settleComponentAsset(engine, {
        caseId: 'REN-008',
        target: { ownerId: 'item', componentId: 'bg' },
      });
      engine.publishFrame(20);
      expect(resourceCounts(runtime.product.resourceProbe({ caseId: 'REN-008' }))).toMatchObject({
        bindingCount: 1,
        resourceCount: 1,
        leaseCount: 1,
        rendererObjectCount: 1,
      });

      engine.patch(
        { kind: 'component', ownerId: 'item', id: 'bg' },
        { show: false },
      );
      engine.publishFrame(30);
      await engine.settleSceneImages();
      expect(resourceCounts(runtime.product.resourceProbe({ caseId: 'REN-008' }))).toMatchObject({
        bindingCount: 0,
        resourceCount: 0,
        leaseCount: 0,
        pendingReleaseCount: 0,
        rendererObjectCount: 0,
      });

      engine.patch(
        { kind: 'component', ownerId: 'item', id: 'bg' },
        { show: true },
      );
      await runtime.product.settleComponentAsset(engine, {
        caseId: 'REN-008',
        target: { ownerId: 'item', componentId: 'bg' },
      });
      engine.publishFrame(40);
      const shown = runtime.product.resourceProbe({ caseId: 'REN-008' });
      expect(resourceCounts(shown)).toMatchObject({
        bindingCount: 1,
        resourceCount: 1,
        leaseCount: 1,
        rendererObjectCount: 1,
      });
      expect(Object.isFrozen(shown)).toBe(true);
      expect(JSON.parse(JSON.stringify(shown))).toEqual(shown);

      await engine.destroy();
      expect(runtime.postDestroyProductProbe()).toMatchObject({
        runtimeCounts: zeroRuntimeCounts(),
        backendCounts: {
          pendingRequestCount: 0,
          resolvedLiveResourceCount: 0,
          retainedLeaseCount: 0,
          pendingReleaseCount: 0,
        },
      });
    } finally {
      await engine.destroy();
    }
  });
});

async function createHarness(
  runtime: PatchMapRenderComponentAssetsRuntime,
  caseId: CaseId,
): Promise<Readonly<{ engine: PatchMap; renderer: HeadlessPixiWebGLRenderer }>> {
  let renderer: HeadlessPixiWebGLRenderer | null = null;
  const surfaceFactory: PatchMapEngineSurfaceFactory = (options) => {
    renderer = new HeadlessPixiWebGLRenderer(options);
    const TestPatchMap = PatchMapRuntime as unknown as new (
      rendererValue: PatchMapPixiRenderer,
      optionsValue: PatchMapRuntimeOptions,
    ) => PatchMapRuntime;
    const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
      autoRender: false,
    });
    return Promise.resolve(new PixiEngineSurface(core));
  };
  const engine = new PatchMap({
    surfaceFactory,
    assetRuntime: runtime.assetRuntime,
    assetPolicy: runtime.assetPolicy,
  });
  await engine.initialize({
    instanceId: `${caseId.toLowerCase()}-component-assets-engine`,
    width: 320,
    height: 240,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
  });
  if (renderer === null) throw new Error('Pixi WebGL renderer was not allocated');
  return Object.freeze({ engine, renderer });
}

class HeadlessPixiWebGLRenderer {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PatchMapPixiInitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public width: number;
  public height: number;
  public pixelRatio: number;

  private readonly leaves: AggregateLeafLayer;
  private projection: PatchMapProjectionIndex = Object.freeze({ byEntityId: Object.freeze({}) });
  private projectionRevision = 0;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private world: PatchMapWorldOrientation = Object.freeze({
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
  });
  private cleanup: Promise<void> = Promise.resolve();
  private destroyedValue = false;
  private frame = 0;

  public constructor(options: PatchMapSurfaceOptions) {
    if (!options.assetSession) throw new Error('component asset surface requires an asset session');
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    this.leaves = new AggregateLeafLayer(options.assetSession, false);
  }

  public markChanges(_ranges: readonly SlotRange[], _reason: string): void {}
  public markOverlayChanges(): void {}
  public setProjection(projection: PatchMapProjectionIndex): boolean {
    if (projection === this.projection) return false;
    this.projection = projection;
    this.projectionRevision += 1;
    return true;
  }
  public setWorldOrientation(world: PatchMapWorldOrientation): boolean {
    this.world = Object.freeze({ ...world });
    return true;
  }
  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(store: RenderStoreView): RendererFlushResult {
    const debug = this.leaves.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: this.projectionContext(),
    });
    this.leaves.confirmRenderedFrame();
    this.frame += 1;
    return Object.freeze({
      rendered: true,
      commandCount: debug.imageCount + debug.bitmapTextCount + debug.pixiTextCount,
    });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(alias: string, url: string): Promise<void> {
    return this.leaves.loadAsset(alias, url);
  }
  public unloadAsset(alias: string): Promise<boolean> { return this.leaves.unloadAsset(alias); }
  public finalizeAssetUnloads(): Promise<void> { return this.leaves.finalizeAssetUnloads(); }
  public bindSceneAsset = this.bindLeafAsset.bind(this);
  public unbindSceneAsset(key: string) { return this.leaves.unbindSceneAsset(key); }
  public sceneAssetBindingProbe(key: string) { return this.leaves.sceneAssetBindingProbe(key); }
  public sceneImageProbe(entityId: string) { return this.leaves.sceneImageProbe(entityId); }
  public entityPaintProbe(entityId: string) { return this.leaves.entityPaintProbe(entityId); }
  public renderLaneProbe(): PatchMapRenderLaneSnapshot {
    const leaves = this.leaves.renderLaneProbe();
    return Object.freeze({
      'background-geometry': emptyLane('background-geometry'),
      'background-assets': leaves.backgroundAssets,
      'ordinary-geometry': emptyLane('ordinary-geometry'),
      'relations-dynamic': emptyLane('relations-dynamic'),
      'content-assets': leaves.contentAssets,
      text: leaves.text,
      'interaction-overlay': emptyLane('interaction-overlay'),
    });
  }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapPixiRendererDebug {
    const leaves = this.leaves.debugSnapshot();
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 1,
      entityCount: 0,
      aggregateRenderObjects: leaves.imageCount + leaves.bitmapTextCount + leaves.pixiTextCount,
      visiblePrimitives: leaves.imageCount,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: leaves.bitmapTextCount,
      pixiTextCount: leaves.pixiTextCount,
      imageCount: leaves.imageCount,
      loadedAssetCount: leaves.loadedAssetCount,
      unresolvedAssetCount: leaves.unresolvedAssetCount,
      view: this.view,
      lastInvalidation: 'component-assets-headless-webgl',
      destroyed: this.destroyedValue,
    });
  }
  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    this.cleanup = this.leaves.destroy();
    return true;
  }
  public whenDestroyed(): Promise<void> { return this.cleanup; }

  private bindLeafAsset(
    key: Parameters<AggregateLeafLayer['bindSceneAsset']>[0],
    request: Parameters<AggregateLeafLayer['bindSceneAsset']>[1],
  ) {
    return this.leaves.bindSceneAsset(key, request);
  }

  private projectionContext(): PatchMapProjectionRenderContext {
    return Object.freeze({
      index: this.projection,
      revision: this.projectionRevision,
      world: this.world,
    });
  }
}

function emptyLane(role: PatchMapRenderLaneRole): PatchMapRenderLaneProbe {
  return Object.freeze({
    role,
    label: `core-v2:${role}`,
    renderObjectCount: 0,
    visiblePrimitiveCount: 0,
  });
}

function iconDataset(): JsonRecord[] {
  return [{
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
}

function backgroundDataset(): JsonRecord[] {
  return [{
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
}

function resourceCounts(value: Readonly<Record<string, unknown>>): JsonRecord {
  return requireRecord(value.counts, 'resource counts');
}

function journalOf(value: Readonly<Record<string, unknown>>): readonly JsonRecord[] {
  const journal = value.journal;
  if (!Array.isArray(journal)) throw new Error('Missing component asset resource journal');
  return journal.map((entry) => requireRecord(entry, 'resource journal entry'));
}

function zeroRuntimeCounts(): JsonRecord {
  return {
    canvasCount: 0,
    subscriptionCount: 0,
    pendingWorkCount: 0,
    bindingCount: 0,
    resourceCount: 0,
    leaseCount: 0,
    pendingSettlementCount: 0,
    pendingReleaseCount: 0,
    staleAttachmentCount: 0,
    rendererObjectCount: 0,
    cleanupFailureCount: 0,
  };
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}
