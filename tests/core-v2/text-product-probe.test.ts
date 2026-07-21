import { afterEach, describe, expect, it } from 'vitest';

import type { CoreView, SlotRange } from '../../src/core-v1/contracts';
import {
  RenderFlags,
  RenderKind,
  type RendererFlushResult,
  type RenderStoreView,
} from '../../src/core-v1/renderer/types';
import {
  CoreV2,
  normalizeCoreV2TextTarget,
  type CoreV2Options,
  type CoreV2TextTarget,
} from '../../src/core-v2/core';
import type { CoreV2ProjectionIndex } from '../../src/core-v2/contracts';
import type {
  PixiCoreV2InitializationMetrics,
  PixiCoreV2Renderer,
} from '../../src/core-v2/renderers/pixi-renderer';
import type {
  CoreV2EntityPaintProbe,
  CoreV2RenderLaneRole,
  CoreV2RenderLaneSnapshot,
  CoreV2TextAttachedSignatures,
  CoreV2TextRendererProbe,
  PixiCoreV2RendererDebug,
  RootInteractionHandlers,
} from '../../src/core-v2/renderers/types';

describe('Core v2 O(1) text product probe', () => {
  const allocated: CoreV2[] = [];

  afterEach(async () => {
    await Promise.allSettled(allocated.splice(0).map(async (core) => core.destroy()));
  });

  it('strictly normalizes and freezes element and component targets', () => {
    const mutableElement = { kind: 'element' as const, id: 'text' };
    const mutableComponent = { kind: 'component' as const, ownerId: 'item', id: 'label' };
    const element = normalizeCoreV2TextTarget(mutableElement);
    const component = normalizeCoreV2TextTarget(mutableComponent);

    expect(element).toEqual(mutableElement);
    expect(component).toEqual(mutableComponent);
    expect(element).not.toBe(mutableElement);
    expect(component).not.toBe(mutableComponent);
    expect(Object.isFrozen(element)).toBe(true);
    expect(Object.isFrozen(component)).toBe(true);
    expect(() => normalizeCoreV2TextTarget({
      kind: 'element',
      id: 'text',
      extra: true,
    } as never)).toThrow('exactly kind, id');
    expect(() => normalizeCoreV2TextTarget({ kind: 'component', ownerId: '', id: 'x' }))
      .toThrow('ownerId must be a non-empty string');
    expect(() => normalizeCoreV2TextTarget({ kind: 'unknown', id: 'x' } as never))
      .toThrow('kind must be');
  });

  it('joins immutable semantic, geometry, paint, and correlated renderer facts', () => {
    const { core, renderer } = createTextCore(allocated);
    const input = directText('A\r\n中😀é');
    const before = structuredClone(input);
    core.load(input);

    const pending = core.textProbe(elementTarget());
    expect(input).toEqual(before);
    expect(pending).toMatchObject({
      target: { kind: 'element', id: 'text' },
      semanticOwnerId: 'text',
      entityId: 'text',
      semantic: {
        source: 'A\r\n中😀é',
        layoutSource: 'A\n中😀é',
        visibleText: 'A\n中😀é',
        lines: ['A', '中😀é'],
        authoredStyle: { fontFamily: 'Unifont', fontSize: 16, lineHeight: 20 },
        color: 0x33669980,
      },
      geometry: {
        localBounds: [0, 0, 40, 40],
        ownerLocalBounds: [0, 0, 40, 40],
      },
      state: { visible: true, interactive: true, zIndex: 4, opacity: 1 },
      transform: {
        rotationDegrees: 15,
        scaleX: 1,
        scaleY: 1,
        contentOrientation: 'follow-item',
      },
      renderer: {
        route: null,
        rendererKind: 'none',
        objectCount: 0,
        lastRenderedFrame: null,
        staleGlyphCount: 0,
      },
      rendererPaint: null,
      renderLanes: null,
      publication: { status: 'pending', renderedSceneRevision: null },
    });
    expect(pending?.geometry.hitBounds).toEqual(pending?.geometry.worldBounds);
    expect(pending?.geometry.worldBounds).toEqual(core.hitBounds('text'));

    core.flush('text-test');
    const current = core.textProbe(elementTarget());
    expect(current).toMatchObject({
      renderer: {
        route: 'fallback-text',
        rendererKind: 'fallback-text',
        routeReason: 'atlas-coverage-unproven',
        objectCount: 1,
        lastRenderedFrame: 1,
        staleGlyphCount: 0,
      },
      rendererPaint: {
        entityId: 'text',
        lane: 'text',
        rendererKind: 'text',
        primitiveCount: 1,
        renderObjectCount: 1,
        packedTint: 0x33669980,
      },
      publication: { status: 'current', rendererFrame: 1 },
    });
    expect(current?.publication.sceneRevision).toBe(current?.publication.renderedSceneRevision);
    expect(current?.renderer.semanticSignatures).toEqual({
      content: current?.semantic.contentSignature,
      style: current?.semantic.styleSignature,
      layout: current?.semantic.layoutSignature,
    });
    expect(current?.renderer.attachedSignatures).toEqual(current?.renderer.lastRenderedSignatures);
    expect(renderer.publishedVisibleTexts).toEqual(['A\n中😀é']);
    expect(Object.isFrozen(current)).toBe(true);
    expect(Object.isFrozen(current?.geometry)).toBe(true);
    expect(Object.isFrozen(current?.renderer.attachedSignatures)).toBe(true);
    expect(Object.isFrozen(current?.semantic.graphemes)).toBe(true);

    renderer.corruptPaint('text');
    expect(core.textProbe(elementTarget())?.publication.status).toBe('pending');
  });

  it('keeps stable identity while only the final rapid replacement reaches a frame', () => {
    const { core, renderer } = createTextCore(allocated);
    core.load(directText('old'));
    core.flush('initial');
    const initialRef = core.ref('text');
    const initial = core.textProbe(elementTarget());

    expect(core.reconcile(directText('intermediate')).status).toBe('committed');
    const intermediate = core.textProbe(elementTarget());
    expect(intermediate).toMatchObject({
      semantic: { source: 'intermediate' },
      publication: { status: 'pending' },
    });
    expect(core.reconcile(directText('final中')).status).toBe('committed');
    const finalPending = core.textProbe(elementTarget());
    expect(finalPending).toMatchObject({
      semantic: { source: 'final中', visibleText: 'final中' },
      publication: { status: 'pending' },
    });
    expect(core.ref('text')).toEqual(initialRef);
    expect(finalPending?.renderer.lastRenderedSignatures).toEqual(
      initial?.renderer.lastRenderedSignatures,
    );

    core.flush('rapid-final');
    const final = core.textProbe(elementTarget());
    expect(final).toMatchObject({
      semantic: { source: 'final中' },
      renderer: { staleGlyphCount: 0 },
      publication: { status: 'current' },
    });
    expect(renderer.publishedVisibleTexts).toEqual(['old', 'final中']);
    expect(renderer.publishedVisibleTexts).not.toContain('intermediate');
  });

  it('re-correlates style-only changes and preserves transformed hit geometry', () => {
    const { core } = createTextCore(allocated);
    core.load(directText('style', { fontWeight: 400 }));
    core.flush('initial');
    const before = core.textProbe(elementTarget());
    const stableRef = core.ref('text');

    expect(core.reconcile(directText('style', { fontWeight: 700 })).status).toBe('committed');
    const pending = core.textProbe(elementTarget());
    expect(pending?.semantic.contentSignature).toBe(before?.semantic.contentSignature);
    expect(pending?.semantic.styleSignature).toBe(before?.semantic.styleSignature);
    expect(pending?.semantic.authoredStyle).toMatchObject({ fontWeight: 700 });
    expect(pending?.publication.status).toBe('pending');
    expect(core.ref('text')).toEqual(stableRef);
    expect(pending?.geometry.worldBounds).toEqual(pending?.geometry.hitBounds);
    expect(pending?.geometry.worldBounds).toEqual(core.hitBounds('text'));
    expect(pending?.transform.affine).toEqual(core.projection?.byEntityId.text?.affine);

    core.flush('style');
    const current = core.textProbe(elementTarget());
    expect(current).toMatchObject({
      semantic: { source: 'style' },
      publication: { status: 'current' },
    });
    expect(current?.renderer.attachedSignatures?.renderer).not.toBe(
      before?.renderer.attachedSignatures?.renderer,
    );
  });

  it('keeps resize publication pending until a visible frame is rendered', () => {
    const { core } = createTextCore(allocated);
    core.load(directText('resize'));
    core.flush('initial');
    expect(core.textProbe(elementTarget())?.publication.status).toBe('current');

    expect(core.resize(640, 480, 1)).toBe(true);
    expect(core.textProbe(elementTarget())?.publication.status).toBe('pending');

    core.flush('resize');
    expect(core.textProbe(elementTarget())?.publication.status).toBe('current');
  });

  it('resolves direct and instance-qualified component targets while refusing an ambiguous grid template', () => {
    const { core } = createTextCore(allocated);
    core.load(itemTextDataset());
    expect(core.textProbe(componentTarget('item-a', 'label'))).toMatchObject({
      target: { kind: 'component', ownerId: 'item-a', id: 'label' },
      semanticOwnerId: 'item-a',
      entityId: 'item-a::text:label',
      semantic: { targetKind: 'component', ownerId: 'item-a', componentId: 'label' },
    });

    core.load(gridTextDataset());
    expect(core.textProbe(componentTarget('grid-a', 'label'))).toBeNull();
    expect(core.textProbe(componentTarget('grid-a.0.0', 'label'))).toMatchObject({
      semanticOwnerId: 'grid-a',
      entityId: 'grid-a.0.0::text:label',
      semantic: { ownerId: 'grid-a.0.0', componentId: 'label' },
    });
    expect(core.textProbe(componentTarget('grid-a.0.1', 'label'))).toMatchObject({
      semanticOwnerId: 'grid-a',
      entityId: 'grid-a.0.1::text:label',
    });
  });

  it('uses explicit absent state for hidden text and clears removed/destroyed targets', async () => {
    const { core } = createTextCore(allocated);
    core.load(directText('hidden', { show: false }));
    const hidden = core.textProbe(elementTarget());
    expect(hidden).toMatchObject({
      state: { visible: false },
      geometry: { visibleBounds: null },
      renderer: {
        route: null,
        rendererKind: 'none',
        objectCount: 0,
        attachedSignatures: null,
        lastRenderedSignatures: null,
        staleGlyphCount: 0,
      },
      rendererPaint: null,
      renderLanes: null,
      publication: { status: 'absent' },
    });
    core.flush('hidden');
    expect(core.textProbe(elementTarget())?.publication.status).toBe('absent');

    expect(core.reconcile([]).status).toBe('committed');
    expect(core.textProbe(elementTarget())).toBeNull();
    await core.destroy();
    expect(core.textProbe(elementTarget())).toBeNull();
  });

  it('keeps the public lookup body on fixed indexes without scene or Pixi traversal', () => {
    const source = CoreV2.prototype.textProbe.toString();

    expect(source).toContain('textTargets.get');
    expect(source).toContain('scene.get');
    expect(source).toContain('textRendererProbe');
    expect(source).not.toMatch(/\.snapshot\s*\(/u);
    expect(source).not.toMatch(/\.query\s*\(/u);
    expect(source).not.toContain('.children');
  });
});

class TextRendererDouble {
  public readonly strategy = 'mesh' as const;
  public readonly preference = 'webgl' as const;
  public readonly initializationMetrics: PixiCoreV2InitializationMetrics = Object.freeze({
    applicationInitMs: 0,
    rendererBuildMs: 0,
  });
  public readonly width = 320;
  public readonly height = 240;
  public readonly pixelRatio = 1;
  public readonly publishedVisibleTexts: string[] = [];

  private projection: CoreV2ProjectionIndex | null = null;
  private probes = new Map<string, CoreV2TextRendererProbe>();
  private paints = new Map<string, CoreV2EntityPaintProbe>();
  private lanes = emptyLaneSnapshot();
  private frame = 0;
  private view: CoreView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private destroyed = false;

  public markChanges(_ranges: readonly SlotRange[], _reason: string): void {}
  public markOverlayChanges(): void {}
  public setProjection(projection: CoreV2ProjectionIndex | null): boolean {
    this.projection = projection;
    return true;
  }
  public setWorldOrientation(): boolean { return true; }
  public resize(): boolean { return true; }
  public setView(view: CoreView): boolean {
    this.view = Object.freeze({ ...view });
    return true;
  }
  public flush(store: RenderStoreView): RendererFlushResult {
    this.frame += 1;
    const nextProbes = new Map<string, CoreV2TextRendererProbe>();
    const nextPaints = new Map<string, CoreV2EntityPaintProbe>();
    let textCount = 0;
    for (let slot = 0; slot < store.capacity; slot += 1) {
      if ((store.alive[slot] ?? 0) !== 1 || store.kind[slot] !== RenderKind.Text) continue;
      if (((store.flags[slot] ?? 0) & RenderFlags.Visible) === 0) continue;
      const entityId = store.ids[slot];
      if (!entityId) continue;
      const semantic = this.projection?.textsByEntityId?.[entityId];
      if (!semantic) continue;
      const signatures = Object.freeze({
        content: semantic.contentSignature,
        style: semantic.styleSignature,
        layout: semantic.layoutSignature,
      });
      const attached: CoreV2TextAttachedSignatures = Object.freeze({
        ...signatures,
        renderer: `test-renderer:${semantic.layoutSignature}:${semantic.color}:${JSON.stringify(semantic.authoredStyle)}`,
      });
      nextProbes.set(entityId, Object.freeze({
        entityId,
        route: 'fallback-text',
        rendererKind: 'fallback-text',
        routeReason: 'atlas-coverage-unproven',
        objectCount: 1,
        semanticSignatures: signatures,
        attachedSignatures: attached,
        lastRenderedSignatures: attached,
        publicationStatus: 'current',
        lastRenderedFrame: this.frame,
        staleGlyphCount: 0,
      }));
      nextPaints.set(entityId, Object.freeze({
        entityId,
        lane: 'text',
        rendererKind: 'text',
        primitiveCount: 1,
        renderObjectCount: 1,
        packedTint: semantic.color,
        rgbTint: semantic.color >>> 8,
        alpha: ((semantic.color & 0xff) / 255) * (store.opacity[slot] ?? 1),
      }));
      this.publishedVisibleTexts.push(semantic.visibleText);
      textCount += 1;
    }
    this.probes = nextProbes;
    this.paints = nextPaints;
    this.lanes = laneSnapshot(textCount);
    return Object.freeze({ rendered: true, commandCount: textCount });
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
  public textRendererProbe(entityId: string): CoreV2TextRendererProbe | null {
    return this.probes.get(entityId) ?? null;
  }
  public entityPaintProbe(entityId: string): CoreV2EntityPaintProbe | null {
    return this.paints.get(entityId) ?? null;
  }
  public corruptPaint(entityId: string): void {
    const paint = this.paints.get(entityId);
    if (!paint || paint.packedTint === null) throw new Error('current text paint required');
    this.paints.set(entityId, Object.freeze({
      ...paint,
      packedTint: (paint.packedTint ^ 0x0000ff00) >>> 0,
    }));
  }
  public renderLaneProbe(): CoreV2RenderLaneSnapshot { return this.lanes; }
  public debugSnapshot(): PixiCoreV2RendererDebug {
    return Object.freeze({
      strategy: this.strategy,
      backend: 'webgl',
      frame: this.frame,
      storeEpoch: 0,
      entityCount: this.probes.size,
      aggregateRenderObjects: this.probes.size,
      visiblePrimitives: this.probes.size,
      uploadedChunks: 0,
      uploadedBytes: 0,
      dynamicFullUploadCount: 0,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 0,
      uploadObservation: 'dirty-chunk-bytes',
      bitmapTextCount: 0,
      fallbackTextCount: this.probes.size,
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
    this.probes.clear();
    this.paints.clear();
    this.lanes = emptyLaneSnapshot();
    return true;
  }
  public whenDestroyed(): Promise<void> { return Promise.resolve(); }
}

function createTextCore(allocated: CoreV2[]): Readonly<{
  core: CoreV2;
  renderer: TextRendererDouble;
}> {
  const renderer = new TextRendererDouble();
  const TestCoreV2 = CoreV2 as unknown as new (
    renderer: PixiCoreV2Renderer,
    options: CoreV2Options,
  ) => CoreV2;
  const core = new TestCoreV2(renderer as unknown as PixiCoreV2Renderer, {
    autoRender: false,
  });
  allocated.push(core);
  return Object.freeze({ core, renderer });
}

function directText(
  source: string,
  options: Readonly<{ show?: boolean; fontWeight?: number }> = {},
): readonly Record<string, unknown>[] {
  return [{
    type: 'text',
    id: 'text',
    text: source,
    show: options.show ?? true,
    attrs: { x: 10, y: 20, angle: 15, zIndex: 4 },
    opacity: 0.5,
    size: { width: 100, height: 60 },
    style: {
      fontFamily: 'Unifont',
      fontSize: 16,
      lineHeight: 20,
      fill: '#33669980',
      ...(options.fontWeight === undefined ? {} : { fontWeight: options.fontWeight }),
    },
  }];
}

function itemTextDataset(): readonly Record<string, unknown>[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 120, height: 80 },
    components: [{
      type: 'text',
      id: 'label',
      text: 'item label',
      placement: 'center',
      style: { fontFamily: 'Unifont', fontSize: 16, lineHeight: 20 },
    }],
  }];
}

function gridTextDataset(): readonly Record<string, unknown>[] {
  return [{
    type: 'grid',
    id: 'grid-a',
    cells: [[1, 1]],
    item: {
      size: { width: 80, height: 40 },
      components: [{
        type: 'text',
        id: 'label',
        text: 'grid label',
        placement: 'center',
        style: { fontFamily: 'Unifont', fontSize: 16, lineHeight: 20 },
      }],
    },
  }];
}

function elementTarget(): CoreV2TextTarget {
  return { kind: 'element', id: 'text' };
}

function componentTarget(ownerId: string, id: string): CoreV2TextTarget {
  return { kind: 'component', ownerId, id };
}

function laneSnapshot(textCount: number): CoreV2RenderLaneSnapshot {
  const counts = new Map<CoreV2RenderLaneRole, number>([['text', textCount]]);
  const lane = (role: CoreV2RenderLaneRole) => Object.freeze({
    role,
    label: `test:${role}`,
    renderObjectCount: role === 'text' && textCount > 0 ? 1 : 0,
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
  return laneSnapshot(0);
}
