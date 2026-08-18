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
});

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

function rect(id: string, zIndex: number, fill: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: 'rect',
    id,
    size: Object.freeze({ width: 40, height: 40 }),
    fill,
    attrs: Object.freeze({ x: 0, y: 0, zIndex }),
  });
}
