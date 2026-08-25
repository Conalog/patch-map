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
import { PatchMap, PixiEngineSurface } from '../../src/patch-map/engine';
import type {
  PatchMapPixiInitializationMetrics,
  PatchMapPixiRenderer,
} from '../../src/patch-map/renderers/pixi-renderer';
import type {
  PatchMapEntityPaintProbe,
  PatchMapOverlayPaintProbe,
  PatchMapPixiRendererDebug,
  RootInteractionHandlers,
} from '../../src/patch-map/renderers/types';
import type {
  PatchMapSceneImageAssetBindingObservation,
  PatchMapSceneImageAssetBindingProbe,
  PatchMapSceneImageAssetBindingRequest,
  PatchMapSceneImageLeafProbe,
} from '../../src/patch-map/scene-images/contracts';

describe('PatchMap aggregate paint-order product seam', () => {
  const allocated: PatchMap[] = [];

  afterEach(async () => {
    await Promise.all(allocated.splice(0).map((engine) => engine.destroy()));
  });

  it('publishes exact stable sibling order through patch, undo, and redo', async () => {
    const renderer = new PaintRendererTestDouble();
    const TestPatchMap = PatchMapRuntime as unknown as new (
      renderer: PatchMapPixiRenderer,
      options: PatchMapRuntimeOptions,
    ) => PatchMapRuntime;
    const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
      autoRender: false,
    });
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    allocated.push(engine);
    await engine.initialize({ instanceId: 'paint-order', width: 800, height: 600 });
    engine.loadDataset(stacking());
    engine.select(['first']);
    engine.publishFrame(0);

    expectPaint(engine, ['low', 'first', 'second', 'high', 'selection', 'transformer'], {
      sceneRevision: 2,
      historyDepth: 0,
    });

    expect(engine.patch(
      { kind: 'element', id: 'low' },
      { attrs: { zIndex: 6 } },
    )).toMatchObject({ status: 'committed' });
    engine.publishFrame(1);
    expectPaint(engine, ['first', 'second', 'low', 'high', 'selection', 'transformer'], {
      sceneRevision: 3,
      historyDepth: 1,
    });

    expect(engine.undo()).toMatchObject({ status: 'committed' });
    engine.publishFrame(10);
    expectPaint(engine, ['low', 'first', 'second', 'high', 'selection', 'transformer'], {
      sceneRevision: 4,
      historyDepth: 0,
    });

    expect(engine.redo()).toMatchObject({ status: 'committed' });
    engine.publishFrame(20);
    expectPaint(engine, ['first', 'second', 'low', 'high', 'selection', 'transformer'], {
      sceneRevision: 5,
      historyDepth: 1,
    });
  });

  it('keeps component zIndex local to each overlapping item stacking unit', async () => {
    const renderer = new PaintRendererTestDouble();
    const TestPatchMap = PatchMapRuntime as unknown as new (
      renderer: PatchMapPixiRenderer,
      options: PatchMapRuntimeOptions,
    ) => PatchMapRuntime;
    const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
      autoRender: false,
    });
    const engine = new PatchMap({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    allocated.push(engine);
    await engine.initialize({ instanceId: 'item-paint-order', width: 800, height: 600 });
    engine.loadDataset(overlappingItems());
    engine.publishFrame(0);

    const componentOrder = engine.paintOrderProbe()?.plan.renderOrder.filter((id) =>
      id.includes('::')
    );
    expect(componentOrder).toEqual([
      'rear::background:rear-background',
      'rear::icon:rear-icon',
      'front::background:front-background',
      'front::icon:front-icon',
    ]);

    expect(engine.patch(
      { kind: 'element', id: 'rear' },
      { attrs: { zIndex: 2 } },
    )).toMatchObject({ status: 'committed' });
    engine.publishFrame(1);
    expect(componentPaintOrder(engine)).toEqual([
      'front::background:front-background',
      'front::icon:front-icon',
      'rear::background:rear-background',
      'rear::icon:rear-icon',
    ]);
  });

  it('preserves authored component order inside general items and grid cells', async () => {
    const engine = await createPaintEngine(allocated, 'component-authored-order');
    engine.loadDataset([
      componentStackItem('general'),
      {
        type: 'grid',
        id: 'grid',
        cells: [[1, 1]],
        item: {
          size: { width: 40, height: 40 },
          components: componentStack('cell'),
        },
        attrs: { zIndex: 1 },
      },
    ]);
    engine.publishFrame(0);

    expect(componentPaintOrder(engine)).toEqual([
      'general::background:general-background',
      'general::bar:general-bar',
      'general::icon:general-icon',
      'general::text:general-text',
      'grid.0.0::background:cell-background',
      'grid.0.0::bar:cell-bar',
      'grid.0.0::icon:cell-icon',
      'grid.0.0::text:cell-text',
      'grid.0.1::background:cell-background',
      'grid.0.1::bar:cell-bar',
      'grid.0.1::icon:cell-icon',
      'grid.0.1::text:cell-text',
    ]);
  });

  it('keeps nested groups atomic against sibling items', async () => {
    const engine = await createPaintEngine(allocated, 'nested-item-paint-order');
    engine.loadDataset([
      {
        type: 'group',
        id: 'rear-group',
        attrs: { zIndex: 0 },
        children: [item('nested-rear', 100)],
      },
      item('front-sibling', 1),
    ]);
    engine.publishFrame(0);

    expect(componentPaintOrder(engine)).toEqual([
      'nested-rear::background:nested-rear-background',
      'nested-rear::icon:nested-rear-icon',
      'front-sibling::background:front-sibling-background',
      'front-sibling::icon:front-sibling-icon',
    ]);
  });
});

async function createPaintEngine(
  allocated: PatchMap[],
  instanceId: string,
): Promise<PatchMap> {
  const renderer = new PaintRendererTestDouble();
  const TestPatchMap = PatchMapRuntime as unknown as new (
    renderer: PatchMapPixiRenderer,
    options: PatchMapRuntimeOptions,
  ) => PatchMapRuntime;
  const core = new TestPatchMap(renderer as unknown as PatchMapPixiRenderer, {
    autoRender: false,
  });
  const engine = new PatchMap({
    surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
  });
  allocated.push(engine);
  await engine.initialize({ instanceId, width: 800, height: 600 });
  return engine;
}

function componentPaintOrder(engine: PatchMap): readonly string[] | undefined {
  return engine.paintOrderProbe()?.plan.renderOrder.filter((id) => id.includes('::'));
}

class PaintRendererTestDouble {
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
  private frame = 0;
  private selectedCount = 0;
  private entityCount = 0;
  private readonly paintById = new Map<string, PatchMapEntityPaintProbe>();
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public markChanges(): void {}
  public markOverlayChanges(): void {}
  public setProjection(
    _index: PatchMapProjectionIndex,
    _ranges?: readonly SlotRange[],
  ): boolean { return true; }
  public setWorldOrientation(): boolean { return true; }
  public resize(): boolean { return false; }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(store: RenderStoreView): RendererFlushResult {
    this.frame += 1;
    this.selectedCount = 0;
    this.entityCount = store.liveCount;
    this.paintById.clear();
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if (store.alive[slot] !== 1) continue;
      if (((store.flags[slot] ?? 0) & RenderFlags.Selected) !== 0) this.selectedCount += 1;
      const entityId = store.ids[slot];
      if (!entityId) continue;
      this.paintById.set(entityId, Object.freeze({
        entityId,
        lane: store.kind[slot] === RenderKind.Relation
          ? 'relations-dynamic'
          : 'ordinary-geometry',
        rendererKind: 'mesh',
        primitiveCount: 1,
        renderObjectCount: 1,
        packedTint: store.fill[slot] ?? null,
        rgbTint: null,
        alpha: store.opacity[slot] ?? null,
      }));
    }
    return Object.freeze({ rendered: true, commandCount: this.entityCount });
  }
  public entityPaintProbe(entityId: string): PatchMapEntityPaintProbe | null {
    return this.paintById.get(entityId) ?? null;
  }
  public overlayPaintProbe(): PatchMapOverlayPaintProbe {
    const visible = this.selectedCount > 0;
    return Object.freeze({
      order: Object.freeze(['selection', 'transformer'] as const),
      selection: visible,
      transformer: visible,
      selectedEntityCount: this.selectedCount,
      renderObjectCount: visible ? 2 : 0,
    });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public bindSceneAsset(
    key: string,
    _request: PatchMapSceneImageAssetBindingRequest,
  ): Promise<PatchMapSceneImageAssetBindingObservation> {
    return Promise.resolve(Object.freeze({
      key,
      generation: 1,
      status: 'attached',
      cacheIdentity: key,
      normalizedResourceIdentity: key,
      reusedResolvedResource: false,
      naturalSize: Object.freeze([16, 16] as const),
    }));
  }
  public unbindSceneAsset(_key: string): Promise<boolean> { return Promise.resolve(true); }
  public sceneAssetBindingProbe(_key: string): PatchMapSceneImageAssetBindingProbe | null {
    return null;
  }
  public sceneImageProbe(_entityId: string): PatchMapSceneImageLeafProbe | null { return null; }
  public loadAsset(): Promise<void> { return Promise.resolve(); }
  public unloadAsset(): Promise<boolean> { return Promise.resolve(false); }
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PatchMapPixiRendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 1,
      entityCount: this.entityCount,
      aggregateRenderObjects: this.entityCount + (this.selectedCount > 0 ? 2 : 0),
      visiblePrimitives: this.entityCount,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      pixiTextCount: 0,
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
    this.paintById.clear();
    this.selectedCount = 0;
    this.entityCount = 0;
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

function expectPaint(
  engine: PatchMap,
  order: readonly string[],
  expected: Readonly<{ sceneRevision: number; historyDepth: number }>,
): void {
  const probe = engine.paintOrderProbe();
  expect(probe).not.toBeNull();
  expect(probe).toMatchObject({
    sceneRevision: expected.sceneRevision,
    publication: 'current',
    hierarchyNodeCount: 4,
    overlays: {
      order: ['selection', 'transformer'],
      selection: true,
      transformer: true,
      selectedEntityCount: 1,
      renderObjectCount: 2,
    },
    history: { undoDepth: expected.historyDepth },
  });
  expect(probe?.plan.renderOrder).toEqual(order);
  expect(probe?.plan.visibleEntries
    .filter((entry) => entry.zIndex === 4)
    .map((entry) => entry.publicId)).toEqual(['first', 'second']);
}

function stacking(): readonly unknown[] {
  return [
    rect('low', -1, '#993333'),
    rect('first', 4, '#339933'),
    rect('second', 4, '#333399'),
    rect('high', 10, '#999933'),
  ];
}

function overlappingItems(): readonly unknown[] {
  return [
    item('rear', 0),
    item('front', 0),
  ];
}

function item(id: string, zIndex: number): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: 'item',
    id,
    size: Object.freeze({ width: 40, height: 40 }),
    components: Object.freeze([
      Object.freeze({
        type: 'background',
        id: `${id}-background`,
        source: Object.freeze({ type: 'rect', fill: '#ffffffff' }),
        attrs: Object.freeze({ zIndex: 0 }),
      }),
      Object.freeze({
        type: 'icon',
        id: `${id}-icon`,
        source: 'fixture-icon',
        size: 20,
        attrs: Object.freeze({ zIndex: 10 }),
      }),
    ]),
    attrs: Object.freeze({ x: 0, y: 0, zIndex }),
  });
}

function componentStackItem(id: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: 'item',
    id,
    size: Object.freeze({ width: 40, height: 40 }),
    components: componentStack(id),
    attrs: Object.freeze({ zIndex: 0 }),
  });
}

function componentStack(id: string): readonly unknown[] {
  return Object.freeze([
    Object.freeze({
      type: 'icon',
      id: `${id}-icon`,
      source: 'fixture-icon',
      size: 20,
      attrs: Object.freeze({ zIndex: 10 }),
    }),
    Object.freeze({
      type: 'background',
      id: `${id}-background`,
      source: Object.freeze({ type: 'rect', fill: '#ffffffff' }),
      attrs: Object.freeze({ zIndex: 0 }),
    }),
    Object.freeze({
      type: 'text',
      id: `${id}-text`,
      text: id,
      attrs: Object.freeze({ zIndex: 10 }),
    }),
    Object.freeze({
      type: 'bar',
      id: `${id}-bar`,
      source: Object.freeze({ type: 'rect', fill: '#333333ff' }),
      size: Object.freeze({ width: 20, height: 4 }),
      attrs: Object.freeze({ zIndex: 5 }),
    }),
  ]);
}

function rect(id: string, zIndex: number, fill: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: 'rect',
    id,
    size: Object.freeze({ width: 40, height: 40 }),
    fill,
    attrs: Object.freeze({ x: 0, y: 0, zIndex }),
  });
}
