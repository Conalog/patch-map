import { afterEach, describe, expect, it } from 'vitest';

import type { CoreView, SlotRange } from '../../src/core-v1/contracts';
import type { RendererFlushResult, RenderStoreView } from '../../src/core-v1/renderer/types';
import { CoreV2, type CoreV2Options } from '../../src/core-v2/core';
import type { CoreV2ProjectionIndex } from '../../src/core-v2/contracts';
import {
  CoreV2Engine,
  CoreV2EngineError,
  PixiEngineSurface,
} from '../../src/core-v2/engine';
import { CoreV2PresentationError } from '../../src/core-v2/presentation';
import type {
  PixiCoreV2InitializationMetrics,
  PixiCoreV2Renderer,
} from '../../src/core-v2/renderers/pixi-renderer';
import type {
  PixiCoreV2RendererDebug,
  RootInteractionHandlers,
} from '../../src/core-v2/renderers/types';
import { applyCoreV2Affine } from '../../src/core-v2/semantic/geometry';

describe('Core v2 bar presentation integration', () => {
  const allocated: CoreV2[] = [];

  afterEach(async () => {
    await Promise.all(allocated.splice(0).map((core) => core.destroy()));
  });

  it('commits semantic height immediately and publishes deterministic bottom-anchored frames', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    const entityId = 'item-a::bar:level';
    const initialBottom = bottomLeft(core.visibleProjection!, entityId);

    const changed = core.reconcile(scene(40));
    expect(changed.status).toBe('committed');
    expect(core.get(entityId)?.bounds.height).toBe(40);
    expect(core.projection?.byEntityId[entityId]?.localBounds[3]).toBe(40);
    expect(core.visibleProjection?.byEntityId[entityId]?.localBounds[3]).toBe(10);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 10,
        active: true,
        startHeight: 10,
        destinationHeight: 40,
        startTimeMs: 0,
        ghostPublicationCount: 0,
        controller: { activeCount: 1, totalSettlementCount: 0 },
      });
    expect(bottomLeft(core.visibleProjection!, entityId)).toEqual(initialBottom);

    const presentationIndex = core.visibleProjection;
    core.publishFrame(100);
    expect(core.visibleProjection).toBe(presentationIndex);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 36.25, active: true });
    expect(bottomLeft(core.visibleProjection!, entityId)).toEqual(initialBottom);
    expect(renderer.projectionCalls.at(-1)).toMatchObject({ ranges: [{ start: 1, end: 2 }] });

    core.publishFrame(200);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 40,
        active: false,
        controller: { activeCount: 0, totalSettlementCount: 1 },
      });
  });

  it('rejects backward publication without poisoning a later atomic reconcile', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    core.reconcile(scene(40));
    core.publishFrame(100);
    core.reconcile(scene(20));

    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 20,
        presentationHeight: 36.25,
        startHeight: 36.25,
        destinationHeight: 20,
        controller: { totalSupersessionCount: 1, totalSettlementCount: 0 },
      });
    core.publishFrame(200);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 22.03125, active: true });
    const beforeSnapshot = core.snapshot();
    const beforeProjection = core.projection;
    const beforeVisibleProjection = core.visibleProjection;
    const beforeProbe = core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' });
    const beforeProjectionPublicationCount = renderer.projectionCalls.length;
    expect(() => core.publishFrame(199)).toThrow(CoreV2PresentationError);
    expect(core.snapshot()).toEqual(beforeSnapshot);
    expect(core.projection).toBe(beforeProjection);
    expect(core.visibleProjection).toBe(beforeVisibleProjection);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toEqual(beforeProbe);
    expect(renderer.projectionCalls).toHaveLength(beforeProjectionPublicationCount);

    const reconciled = core.reconcile(scene(30));
    expect(reconciled).toMatchObject({
      status: 'committed',
      facts: {
        revisionBefore: beforeSnapshot.revision,
        revisionAfter: beforeSnapshot.revision + 1,
      },
    });
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 30,
        presentationHeight: 22.03125,
        startHeight: 22.03125,
        destinationHeight: 30,
        startTimeMs: 200,
        active: true,
      });
    core.publishFrame(300);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 29.00390625, active: true });
    core.publishFrame(400);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 30,
        presentationHeight: 30,
        active: false,
        controller: { totalSettlementCount: 1, activeCount: 0 },
        ghostPublicationCount: 0,
      });
  });

  it('snaps bar presentation when reconciliation is an ancestor layout transaction', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);

    expect(core.reconcile(scene(40), { animateBarChanges: false }).status).toBe('committed');
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 40,
        active: false,
        controller: { activeCount: 0 },
      });
  });

  it('animates only explicitly targeted bars in a mixed semantic transaction', () => {
    const { core } = createTestCore(allocated);
    core.load(twoBarScene(10, 10));
    core.publishFrame(0);

    const result = core.reconcile(twoBarScene(40, 50), {
      animatedBarTargets: [{ ownerId: 'item-a', componentId: 'first' }],
    });

    expect(result.status).toBe('committed');
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'first' }))
      .toMatchObject({ semanticHeight: 40, presentationHeight: 10, active: true });
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'second' }))
      .toMatchObject({ semanticHeight: 50, presentationHeight: 50, active: false });
  });

  it('lands immediately when animation is disabled and releases controller ownership on load', () => {
    const { core } = createTestCore(allocated);
    core.load(scene(10));
    core.publishFrame(0);
    core.reconcile(scene(40));
    expect(core.activeAnimations).toBe(1);

    core.reconcile(scene(25, false));
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ semanticHeight: 25, presentationHeight: 25, active: false });
    expect(core.activeAnimations).toBe(0);

    core.reconcile(scene(50, true));
    expect(core.activeAnimations).toBe(1);
    core.load(scene(12));
    expect(core.activeAnimations).toBe(0);
    expect(core.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ semanticHeight: 12, presentationHeight: 12, active: false });
  });

  it('publishes direct dense animation staleness until JSON reconciliation replaces it', () => {
    const { core, renderer } = createTestCore(allocated);
    core.load(scene(10));
    core.flush('initial');
    const barRef = core.query({ kinds: ['bar'] })[0];
    if (!barRef) throw new Error('missing bar entity');
    const barId = core.get(barRef)?.id;
    if (!barId) throw new Error('missing bar identity');

    const scheduled = core.animateBarHeights({
      fraction: 1,
      seed: 0x51a1e,
      durationMs: 200,
      minScale: 0.5,
      maxScale: 0.5,
    });
    expect(scheduled.operationCount).toBe(1);
    expect(renderer.projectionCalls.at(-1)).toMatchObject({ staleIds: [barId] });

    core.advance(100);
    expect(core.get(barRef)?.bounds.height).toBeCloseTo(7.5, 8);

    expect(core.reconcile(scene(20), { animateBarChanges: false }).status).toBe('committed');
    expect(renderer.projectionCalls.at(-1)).toMatchObject({ staleIds: [] });
  });

  it('publishes through Engine and maps backward clock conflicts without advancing revisions', async () => {
    const { core } = createTestCore(allocated);
    const surface = new PixiEngineSurface(core);
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'presentation-engine', width: 800, height: 600 });
    engine.loadDataset(scene(10));
    engine.publishFrame(0);

    expect(engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'level' },
      { size: { width: 60, height: 40 } },
    )).toMatchObject({ status: 'committed', publication: 'pending' });
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 10,
        active: true,
        revisions: { sceneRevision: 2 },
        publishedTuple: { scene: 1 },
        frameRevision: 1,
      });
    engine.publishFrame(100);
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 36.25, frameRevision: 2 });
    const before = engine.snapshot();

    let failure: unknown;
    try {
      engine.publishFrame(99);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CoreV2EngineError);
    expect((failure as CoreV2EngineError).diagnostic).toMatchObject({
      code: 'CONFLICT',
      category: 'CONFLICT',
      operation: 'publishFrame',
      recoverable: true,
      retryable: true,
    });
    expect(engine.snapshot()).toEqual(before);
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({ presentationHeight: 36.25, ghostPublicationCount: 0 });
    await engine.destroy();
  });

  it('keeps Engine ancestor layout patches atomic while direct bar patches animate', async () => {
    const { core } = createTestCore(allocated);
    const engine = new CoreV2Engine({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({ instanceId: 'presentation-layout-engine', width: 800, height: 600 });
    engine.loadDataset(percentScene(80));
    engine.publishFrame(0);

    expect(engine.patch(
      { kind: 'element', id: 'item-a' },
      { size: { width: 100, height: 100 } },
    )).toMatchObject({ status: 'committed' });
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 25,
        presentationHeight: 25,
        active: false,
      });

    expect(engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'level' },
      { size: { width: 60, height: 40 } },
    )).toMatchObject({ status: 'committed' });
    expect(engine.barPresentationProbe({ ownerId: 'item-a', componentId: 'level' }))
      .toMatchObject({
        semanticHeight: 40,
        presentationHeight: 25,
        active: true,
      });
    await engine.destroy();
  });
});

class RendererTestDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 800;
  public readonly height = 600;
  public readonly pixelRatio = 1;
  public readonly projectionCalls: Array<Readonly<{
    index: CoreV2ProjectionIndex;
    ranges: readonly SlotRange[] | null;
    staleIds: readonly string[] | null;
  }>> = [];
  public destroyed = false;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public markChanges(): void {}
  public markOverlayChanges(): void {}

  public setProjection(
    index: CoreV2ProjectionIndex,
    ranges?: readonly SlotRange[],
    staleIds?: ReadonlySet<string>,
  ): boolean {
    this.projectionCalls.push(Object.freeze({
      index,
      ranges: ranges === undefined ? null : Object.freeze([...ranges]),
      staleIds: staleIds === undefined ? null : Object.freeze([...staleIds].sort()),
    }));
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
  public finalizeAssetUnloads(): Promise<void> { return Promise.resolve(); }
  public captureBase64(): Promise<string> { return Promise.resolve('data:image/png;base64,'); }
  public bindRootInteractions(_handlers: RootInteractionHandlers): () => void {
    return () => undefined;
  }
  public debugSnapshot(): PixiCoreV2RendererDebug {
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
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

function createTestCore(allocated: CoreV2[]): Readonly<{
  core: CoreV2;
  renderer: RendererTestDouble;
}> {
  const renderer = new RendererTestDouble();
  const TestCoreV2 = CoreV2 as unknown as new (
    renderer: PixiCoreV2Renderer,
    options: CoreV2Options,
  ) => CoreV2;
  const core = new TestCoreV2(renderer as unknown as PixiCoreV2Renderer, { autoRender: false });
  allocated.push(core);
  return { core, renderer };
}

function scene(height: number, animation = true): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height },
      placement: 'bottom',
      animation,
      animationDuration: 200,
    }],
  }];
}

function percentScene(itemHeight: number): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: itemHeight },
    components: [{
      type: 'bar',
      id: 'level',
      source: { type: 'rect', fill: '#336699' },
      size: { width: 60, height: '25%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 200,
    }],
  }];
}

function twoBarScene(firstHeight: number, secondHeight: number): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [
      {
        type: 'bar',
        id: 'first',
        source: { type: 'rect', fill: '#336699' },
        size: { width: 60, height: firstHeight },
        placement: 'bottom',
        animation: true,
        animationDuration: 200,
      },
      {
        type: 'bar',
        id: 'second',
        source: { type: 'rect', fill: '#663399' },
        size: { width: 60, height: secondHeight },
        placement: 'top',
        animation: true,
        animationDuration: 200,
      },
    ],
  }];
}

function bottomLeft(index: CoreV2ProjectionIndex, entityId: string): readonly [number, number] {
  const projection = index.byEntityId[entityId];
  if (projection === undefined) throw new Error(`missing ${entityId}`);
  return applyCoreV2Affine(projection.affine, [0, projection.localBounds[3]]);
}
