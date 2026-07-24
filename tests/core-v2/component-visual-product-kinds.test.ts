import { afterEach, describe, expect, it } from 'vitest';

import type { CoreView, SlotRange } from '../../src/core-v1/contracts';
import {
  RenderFlags,
  RenderKind,
  type RendererFlushResult,
  type RenderStoreView,
} from '../../src/core-v1/renderer/types';
import { CoreV2, type CoreV2Options } from '../../src/core-v2/core';
import type { CoreV2ProjectionIndex } from '../../src/core-v2/contracts';
import type {
  PixiCoreV2InitializationMetrics,
  PixiCoreV2Renderer,
} from '../../src/core-v2/renderers/pixi-renderer';
import type {
  CoreV2EntityPaintProbe,
  CoreV2RenderLaneRole,
  CoreV2RenderLaneSnapshot,
  PixiCoreV2RendererDebug,
  RootInteractionHandlers,
} from '../../src/core-v2/renderers/types';

describe('Core v2 component visual product kinds', () => {
  const allocated: CoreV2[] = [];

  afterEach(async () => {
    await Promise.allSettled(allocated.splice(0).map(async (core) => core.destroy()));
  });

  it('joins background, icon, bar, and text identity to detached renderer facts', () => {
    const { core } = createComponentVisualCore(allocated);
    const input = componentKindsDataset(false);
    const before = structuredClone(input);

    core.load(input);
    core.flush('initial-component-kinds');

    expect(input).toEqual(before);
    expect(core.componentVisualProbe({ ownerId: 'item', componentId: 'background' }))
      .toMatchObject({
        entityId: 'item::background:background',
        logicalIdentity: 'item::background:background',
        componentType: 'background',
        renderRole: 'background-geometry',
        entityKind: 'rect',
        geometry: { visible: true },
        rendererPaint: {
          lane: 'background-geometry',
          rendererKind: 'mesh',
          primitiveCount: 1,
          renderObjectCount: 0,
        },
      });
    expect(core.componentVisualProbe({ ownerId: 'item', componentId: 'icon' }))
      .toMatchObject({
        entityId: 'item::icon:icon',
        logicalIdentity: 'item::icon:icon',
        componentType: 'icon',
        renderRole: 'content-asset',
        entityKind: 'image',
        geometry: { visible: false, visibleBounds: null },
        rendererPaint: {
          lane: 'content-assets',
          rendererKind: 'none',
          primitiveCount: 0,
          renderObjectCount: 0,
        },
      });
    const hiddenBar = core.componentVisualProbe({ ownerId: 'item', componentId: 'bar' });
    expect(hiddenBar).toMatchObject({
      entityId: 'item::bar:bar',
      logicalIdentity: 'item::bar:bar',
      componentType: 'bar',
      renderRole: 'ordinary-geometry',
      entityKind: 'bar',
      geometry: { visible: false, visibleBounds: null },
      rendererPaint: {
        lane: 'relations-dynamic',
        rendererKind: 'none',
        primitiveCount: 0,
        renderObjectCount: 0,
      },
    });
    expect(core.componentVisualProbe({ ownerId: 'item', componentId: 'label' }))
      .toMatchObject({
        entityId: 'item::text:label',
        logicalIdentity: 'item::text:label',
        componentType: 'text',
        renderRole: 'text',
        entityKind: 'text',
        geometry: { visible: true },
        rendererPaint: {
          lane: 'text',
          rendererKind: 'text',
          primitiveCount: 1,
          renderObjectCount: 1,
        },
      });
    expect(core.componentVisualProbe({ ownerId: 'item', componentId: 'missing' })).toBeNull();

    core.selectSemantic(['item::bar:bar']);
    expect(core.selection().refs.map((ref) => core.get(ref)?.id)).toEqual([
      'item::bar:bar',
    ]);
    core.selectSemantic(['item/bar']);
    expect(core.selection().refs.map((ref) => core.get(ref)?.id)).toEqual([
      'item::bar:bar',
    ]);

    const barRef = core.ref('item::bar:bar');
    const textRef = core.ref('item::text:label');
    expect(core.reconcile(componentKindsDataset(true), { animateBarChanges: false }).status)
      .toBe('committed');
    expect(core.componentVisualProbe({ ownerId: 'item', componentId: 'bar' }))
      .toMatchObject({
        entityId: hiddenBar?.entityId,
        logicalIdentity: hiddenBar?.logicalIdentity,
        geometry: { visible: true },
        publication: { rendererFacts: 'pending' },
        rendererPaint: null,
      });

    core.flush('shown-bar');
    expect(core.ref('item::bar:bar')).toEqual(barRef);
    expect(core.ref('item::text:label')).toEqual(textRef);
    expect(core.componentVisualProbe({ ownerId: 'item', componentId: 'bar' }))
      .toMatchObject({
        entityId: hiddenBar?.entityId,
        logicalIdentity: hiddenBar?.logicalIdentity,
        geometry: { visible: true },
        rendererPaint: {
          lane: 'relations-dynamic',
          rendererKind: 'mesh',
          primitiveCount: 1,
          renderObjectCount: 0,
        },
      });
    expect(input).toEqual(before);
  });
});

class ComponentVisualRendererDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 320;
  public readonly height = 240;
  public readonly pixelRatio = 1;

  private projection: CoreV2ProjectionIndex | null = null;
  private paints = new Map<string, CoreV2EntityPaintProbe>();
  private lanes = emptyLaneSnapshot();
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private destroyed = false;

  public bindSceneAsset(): Promise<never> {
    return Promise.reject(new Error('hidden test assets must not be bound'));
  }
  public unbindSceneAsset(): Promise<boolean> { return Promise.resolve(false); }
  public sceneAssetBindingProbe(): null { return null; }
  public sceneImageProbe(): null { return null; }
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public markChanges(_ranges: readonly SlotRange[], _reason: string): void {}
  public markOverlayChanges(): void {}
  public setProjection(projection: CoreV2ProjectionIndex | null): boolean {
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
    const paints = new Map<string, CoreV2EntityPaintProbe>();
    const counts = new Map<CoreV2RenderLaneRole, number>();
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if ((store.alive[slot] ?? 0) !== 1) continue;
      const entityId = store.ids[slot];
      if (!entityId) continue;
      const role = componentRole(this.projection, entityId);
      if (role === null) continue;
      const visible = ((store.flags[slot] ?? 0) & RenderFlags.Visible) !== 0;
      const kind = store.kind[slot];
      const lane = componentLane(role);
      const aggregate = kind === RenderKind.Rect || kind === RenderKind.Bar;
      const primitiveCount = visible ? 1 : 0;
      const rendererKind = visible
        ? aggregate
          ? 'mesh'
          : kind === RenderKind.Image
            ? 'sprite'
            : 'text'
        : 'none';
      paints.set(entityId, Object.freeze({
        entityId,
        lane,
        rendererKind,
        primitiveCount,
        renderObjectCount: aggregate ? 0 : primitiveCount,
        packedTint: null,
        rgbTint: null,
        alpha: null,
      }));
      if (visible) counts.set(lane, (counts.get(lane) ?? 0) + 1);
    }
    this.paints = paints;
    this.lanes = laneSnapshot(counts);
    return Object.freeze({ rendered: true, commandCount: paints.size });
  }
  public synchronizeNextFlush(): void {}
  public prepareGpu(): Promise<void> { return Promise.resolve(); }
  public loadAsset(): Promise<void> { return Promise.resolve(); }
  public unloadAsset(): Promise<boolean> { return Promise.resolve(false); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public entityPaintProbe(entityId: string): CoreV2EntityPaintProbe | null {
    return this.paints.get(entityId) ?? null;
  }
  public renderLaneProbe(): CoreV2RenderLaneSnapshot { return this.lanes; }
  public debugSnapshot(): PixiCoreV2RendererDebug {
    const visiblePrimitives = [...this.paints.values()].reduce(
      (sum, paint) => sum + paint.primitiveCount,
      0,
    );
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: 0,
      storeEpoch: 0,
      entityCount: this.paints.size,
      aggregateRenderObjects: 0,
      visiblePrimitives,
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
    this.paints.clear();
    this.lanes = emptyLaneSnapshot();
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

function createComponentVisualCore(allocated: CoreV2[]): Readonly<{ core: CoreV2 }> {
  const renderer = new ComponentVisualRendererDouble();
  const TestCoreV2 = CoreV2 as unknown as new (
    renderer: PixiCoreV2Renderer,
    options: CoreV2Options,
  ) => CoreV2;
  const core = new TestCoreV2(renderer as unknown as PixiCoreV2Renderer, {
    autoRender: false,
  });
  allocated.push(core);
  return Object.freeze({ core });
}

function componentKindsDataset(barShow: boolean): readonly Record<string, unknown>[] {
  return [{
    type: 'item',
    id: 'item',
    size: { width: 120, height: 80 },
    padding: 8,
    components: [
      {
        type: 'background',
        id: 'background',
        source: { type: 'rect', fill: '#334455' },
      },
      {
        type: 'icon',
        id: 'icon',
        source: 'hidden-icon',
        size: 16,
        show: false,
      },
      {
        type: 'bar',
        id: 'bar',
        source: { type: 'rect', fill: '#33aa66' },
        size: { width: 20, height: 30 },
        placement: 'left',
        show: barShow,
      },
      {
        type: 'text',
        id: 'label',
        text: 'Stable label',
        placement: 'right',
        style: { fontFamily: 'Unifont', fontSize: 14, lineHeight: 18 },
      },
    ],
  }];
}

function componentRole(
  projection: CoreV2ProjectionIndex | null,
  entityId: string,
): 'background-geometry' | 'content-asset' | 'ordinary-geometry' | 'text' | null {
  const component = projection?.componentsByEntityId?.[entityId];
  if (component?.renderRole === 'background-geometry') return component.renderRole;
  if (component?.renderRole === 'content-asset') return component.renderRole;
  if (projection?.barsByEntityId?.[entityId] !== undefined) return 'ordinary-geometry';
  const text = projection?.textsByEntityId?.[entityId];
  return text?.targetKind === 'component' ? 'text' : null;
}

function componentLane(
  role: 'background-geometry' | 'content-asset' | 'ordinary-geometry' | 'text',
): CoreV2RenderLaneRole {
  if (role === 'content-asset') return 'content-assets';
  if (role === 'ordinary-geometry') return 'relations-dynamic';
  return role;
}

function laneSnapshot(
  counts: ReadonlyMap<CoreV2RenderLaneRole, number>,
): CoreV2RenderLaneSnapshot {
  const lane = (role: CoreV2RenderLaneRole) => Object.freeze({
    role,
    label: `test:${role}`,
    renderObjectCount: role === 'ordinary-geometry' || role === 'relations-dynamic' ? 1 : 0,
    visiblePrimitiveCount: counts.get(role) ?? 0,
  });
  return Object.freeze({
    'background-geometry': lane('background-geometry'),
    'background-assets': lane('background-assets'),
    'ordinary-geometry': lane('ordinary-geometry'),
    'relations-dynamic': lane('relations-dynamic'),
    'content-assets': lane('content-assets'),
    text: lane('text'),
    'interaction-overlay': lane('interaction-overlay'),
  });
}

function emptyLaneSnapshot(): CoreV2RenderLaneSnapshot {
  return laneSnapshot(new Map());
}
