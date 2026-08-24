import { BitmapText, Matrix, Text } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import type { EntityInput } from '../../src/patch-map/dense/contracts';
import {
  RenderAlign,
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import { AggregateLeafLayer } from '../../src/patch-map/renderers/leaf-layer';
import {
  PatchMapPixiRenderer,
  projectionChangedRanges,
} from '../../src/patch-map/renderers/pixi-renderer';
import type {
  PatchMapProjectionRenderContext,
  PatchMapTextRendererProbe,
} from '../../src/patch-map/renderers/types';
import type { PatchMapBitmapTextCapabilityProof } from '../../src/patch-map/semantic/text-render-route';

describe('PatchMap text render publication', () => {
  it.each([
    { angle: 0, label: 'unrotated', scaleX: 1, scaleY: 1 },
    { angle: 37, label: 'rotated', scaleX: 1, scaleY: 1 },
    { angle: 19, label: 'reflected', scaleX: -1, scaleY: 1 },
  ])('anchors $label standalone text visual bounds at the authored top-left', async ({
    angle,
    scaleX,
    scaleY,
  }) => {
    const parsed = parsePatchMapV010([{
      type: 'text',
      id: 'text',
      text: '구조물 높이\n0.8~3.2m',
      attrs: { x: 219, y: 135, angle, scaleX, scaleY },
      style: {
        fontFamily: 'FiraCode',
        fontSize: 100,
        fontWeight: 400,
      },
    }]);
    const layer = new AggregateLeafLayer();

    layer.sync(createRenderStore(parsed.document.entities), {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1),
    });

    const object = layer.textContainer.children[0];
    if (!(object instanceof Text)) throw new Error('expected guarded Pixi Text');
    expect([object.anchor.x, object.anchor.y]).toEqual([0, 0]);
    expect([object.position.x, object.position.y]).toEqual([
      expect.closeTo(219, 6),
      expect.closeTo(135, 6),
    ]);

    await layer.destroy();
  });

  it('measures a standalone Pixi local origin only on text rebuild and leaves components centered', async () => {
    vi.stubGlobal('document', {});
    const localBounds = vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({
      minX: -2,
      minY: -3,
    } as never);
    const scene = (text: string) => [{
      type: 'text',
      id: 'standalone',
      text,
      attrs: { x: 219, y: 135 },
      style: { fontFamily: 'FiraCode', fontSize: 100 },
    }, {
      type: 'item',
      id: 'owner',
      attrs: { x: 400, y: 200 },
      size: { width: 100, height: 60 },
      components: [{
        type: 'text',
        id: 'label',
        text: 'component',
        style: { fontFamily: 'FiraCode', fontSize: 16 },
      }],
    }];
    const initial = parsePatchMapV010(scene('first'));
    const changed = parsePatchMapV010(scene('second'));
    const layer = new AggregateLeafLayer();

    try {
      layer.sync(createRenderStore(initial.document.entities, 1), {
        fullRebuildEpoch: 1,
        projectionContext: projectionContext(initial.projection, 1),
      });
      expect(localBounds).toHaveBeenCalledTimes(1);
      const standalone = layer.textContainer.children.find(
        (child) => child instanceof Text && child.text === 'first',
      ) as Text | undefined;
      const component = layer.textContainer.children.find(
        (child) => child instanceof Text && child.text === 'component',
      ) as Text | undefined;
      expect(standalone).toBeDefined();
      expect(component).toBeDefined();
      expect([standalone?.anchor.x, standalone?.anchor.y]).toEqual([0, 0]);
      expect([
        (standalone?.position.x ?? 0) - 2,
        (standalone?.position.y ?? 0) - 3,
      ]).toEqual([219, 135]);
      expect([component?.anchor.x, component?.anchor.y]).toEqual([0.5, 0.5]);

      layer.sync(createRenderStore(initial.document.entities, 1), {
        fullRebuildEpoch: 1,
        changedRanges: [],
        projectionContext: projectionContext(initial.projection, 1),
      });
      expect(localBounds).toHaveBeenCalledTimes(1);

      layer.sync(createRenderStore(changed.document.entities, 2), {
        fullRebuildEpoch: 1,
        changedRanges: [{ start: 0, end: 1 }],
        projectionContext: projectionContext(changed.projection, 2),
      });
      expect(localBounds).toHaveBeenCalledTimes(2);
      expect(layer.textContainer.children.find(
        (child) => child instanceof Text && child.text === 'component',
      )).toBe(component);
    } finally {
      await layer.destroy();
      localBounds.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('contains autoFont raster bounds in the semantic component quad and raises visible Text resolution', async () => {
    vi.stubGlobal('document', {});
    const localBounds = vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({
      minX: 0,
      minY: 0,
      maxX: 33,
      maxY: 62,
    } as never);
    const parsed = parsePatchMapV010([{
      type: 'grid',
      id: 'quality-grid',
      attrs: { x: 80, y: 80 },
      cells: [[1]],
      item: {
        size: { width: 40, height: 80 },
        components: [{
          type: 'text',
          id: 'value',
          text: 'INV2\nDC2\nMPPT4\nSTR4\n7',
          margin: 4,
          style: {
            fontFamily: 'FiraCode',
            fontWeight: '600',
            fontSize: 'auto',
            autoFont: { min: 8, max: 14 },
            align: 'center',
            wordWrap: true,
            breakWords: false,
            wordWrapWidth: 'auto',
          },
        }],
      },
    }]);
    const layer = new AggregateLeafLayer();

    try {
      layer.sync(createRenderStore(parsed.document.entities), {
        fullRebuildEpoch: 1,
        projectionContext: projectionContext(parsed.projection, 1),
      });
      const object = layer.textContainer.children[0];
      if (!(object instanceof Text)) throw new Error('expected guarded Pixi Text');
      expect([object.anchor.x, object.anchor.y]).toEqual([0, 0]);
      expect(object.scale.x).toBeCloseTo(27.5 / 33, 6);
      expect(object.scale.y).toBeCloseTo(27.5 / 33, 6);
      expect(object.position.x).toBeCloseTo(86.25, 6);
      expect(object.position.y).toBeCloseTo(94.17, 2);

      layer.cull(new Matrix(), 1_000, 1_000, 32, 10);
      expect(object.resolution).toBe(10);
      expect(object.scale.x).toBeCloseTo(27.5 / 33, 6);
      expect(object.scale.y).toBeCloseTo(27.5 / 33, 6);

      layer.cull(new Matrix().translate(10_000, 10_000), 1_000, 1_000, 32, 20);
      expect(object.resolution).toBe(10);
      layer.cull(new Matrix(), 1_000, 1_000, 32, 20);
      expect(object.resolution).toBe(20);
    } finally {
      await layer.destroy();
      localBounds.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('uses the prewrapped semantic payload and defaults unclear atlas capability to guarded Text', async () => {
    const parsed = parsePatchMapV010([standaloneText('ABCDEFGHIJ', {
      wordWrap: true,
      breakWords: true,
      wordWrapWidth: 32,
    })]);
    const projection = requireTextProjection(parsed.projection, 'text');
    const layer = new AggregateLeafLayer();

    layer.sync(createRenderStore(parsed.document.entities), {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1),
    });

    expect(projection.visibleText).toBe('ABCD\nEFGH\nIJ');
    expect(layer.textContainer.children).toHaveLength(1);
    expect(layer.textContainer.children[0]).toBeInstanceOf(Text);
    expect(layer.textContainer.children[0]).not.toBeInstanceOf(BitmapText);
    expect((layer.textContainer.children[0] as Text).text).toBe(projection.visibleText);
    expect(layer.debugSnapshot()).toMatchObject({
      bitmapTextCount: 0,
      pixiTextCount: 1,
    });

    const pending = layer.textRendererProbe('text');
    expect(pending).toMatchObject({
      entityId: 'text',
      attachedRoute: 'pixi-text',
      objectKind: 'pixi-text',
      routeDecisionReason: 'atlas-coverage-unproven',
      objectCount: 1,
      semanticSignatures: {
        content: projection.contentSignature,
        style: projection.styleSignature,
        layout: projection.layoutSignature,
      },
      publicationStatus: 'pending',
      lastRenderedSignatures: null,
      lastRenderedFrame: null,
      staleGlyphCount: 0,
    });
    expectDeepFrozen(pending);

    layer.confirmRenderedFrame(3);
    const current = layer.textRendererProbe('text');
    expect(current).toMatchObject({
      publicationStatus: 'current',
      lastRenderedFrame: 3,
      staleGlyphCount: 0,
    });
    expect(current?.lastRenderedSignatures).toEqual(current?.attachedSignatures);
    expectDeepFrozen(current);

    await layer.destroy();
  });

  it('constructs BitmapText only from an explicit exact finite proof and still rejects CJK', async () => {
    const ascii = parsePatchMapV010([standaloneText('CPU 42', { fontWeight: '600' })]);
    const cjk = parsePatchMapV010([standaloneText('CPU 中', { fontWeight: '600' })]);
    const requests: string[] = [];
    const layer = new AggregateLeafLayer(undefined, true, {
      resolveBitmapTextCapability: (request) => {
        requests.push(request.entityId);
        return bitmapProof(request.text, request.style.fontWeight);
      },
    });

    const asciiStore = createRenderStore(ascii.document.entities);
    layer.sync(asciiStore, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(ascii.projection, 1),
    });
    expect(layer.textContainer.children).toHaveLength(1);
    expect(layer.textContainer.children[0]).toBeInstanceOf(BitmapText);
    expect(layer.textRendererProbe('text')).toMatchObject({
      attachedRoute: 'bitmap-text',
      objectKind: 'bitmap-text',
      routeDecisionReason: 'bitmap-capability-proven',
      objectCount: 1,
    });
    const bitmapObject = layer.textContainer.children[0];
    const bitmapProbe = layer.textRendererProbe('text');
    layer.sync(asciiStore, {
      fullRebuildEpoch: 1,
      changedRanges: [],
      projectionContext: projectionContext(ascii.projection, 1),
    });
    expect(requests).toEqual(['text']);
    expect(layer.textContainer.children[0]).toBe(bitmapObject);
    expect(layer.textRendererProbe('text')).toBe(bitmapProbe);

    layer.sync(createRenderStore(cjk.document.entities), {
      fullRebuildEpoch: 2,
      projectionContext: projectionContext(cjk.projection, 2),
    });
    expect(layer.textContainer.children).toHaveLength(1);
    expect(layer.textContainer.children[0]).toBeInstanceOf(Text);
    expect(layer.textRendererProbe('text')).toMatchObject({
      attachedRoute: 'pixi-text',
      objectKind: 'pixi-text',
      routeDecisionReason: 'cjk-content',
    });
    expect(requests).toEqual(['text', 'text']);

    await layer.destroy();
  });

  it('treats italic and oblique as exact bitmap style fields while unproven atlases stay guarded', async () => {
    for (const fontStyle of ['italic', 'oblique'] as const) {
      const parsed = parsePatchMapV010([standaloneText('CPU 42', { fontStyle })]);
      const proven = new AggregateLeafLayer(undefined, true, {
        resolveBitmapTextCapability: (request) => bitmapProof(
          request.text,
          request.style.fontWeight,
          request.style.fontStyle,
        ),
      });

      proven.sync(createRenderStore(parsed.document.entities), {
        fullRebuildEpoch: 1,
        projectionContext: projectionContext(parsed.projection, 1),
      });
      expect(proven.textContainer.children[0]).toBeInstanceOf(BitmapText);
      expect(proven.textRendererProbe('text')).toMatchObject({
        attachedRoute: 'bitmap-text',
        routeDecisionReason: 'bitmap-capability-proven',
      });
      await proven.destroy();
    }

    const unproven = parsePatchMapV010([standaloneText('CPU 42', { fontStyle: 'oblique' })]);
    const guarded = new AggregateLeafLayer();
    guarded.sync(createRenderStore(unproven.document.entities), {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(unproven.projection, 1),
    });
    expect(guarded.textContainer.children[0]).toBeInstanceOf(Text);
    expect(guarded.textRendererProbe('text')).toMatchObject({
      attachedRoute: 'pixi-text',
      routeDecisionReason: 'atlas-coverage-unproven',
    });
    await guarded.destroy();
  });

  it('publishes only the final rapid replacement after a confirmed render frame', async () => {
    const initial = parsePatchMapV010([standaloneText('old')]);
    const intermediate = parsePatchMapV010([standaloneText('intermediate')]);
    const final = parsePatchMapV010([standaloneText('final中')]);
    const layer = new AggregateLeafLayer();

    layer.sync(createRenderStore(initial.document.entities, 1), {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(initial.projection, 1),
    });
    layer.confirmRenderedFrame(7);
    const initiallyRendered = layer.textRendererProbe('text');
    expect(initiallyRendered?.publicationStatus).toBe('current');

    layer.sync(createRenderStore(intermediate.document.entities, 2), {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: projectionContext(intermediate.projection, 2),
    });
    const intermediatePending = layer.textRendererProbe('text');
    expect(intermediatePending).toMatchObject({
      publicationStatus: 'pending',
      lastRenderedFrame: 7,
      staleGlyphCount: 3,
    });
    expect(intermediatePending?.lastRenderedSignatures).toEqual(
      initiallyRendered?.lastRenderedSignatures,
    );

    layer.sync(createRenderStore(final.document.entities, 3), {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: projectionContext(final.projection, 3),
    });
    const finalPending = layer.textRendererProbe('text');
    expect(finalPending).toMatchObject({
      publicationStatus: 'pending',
      lastRenderedFrame: 7,
      staleGlyphCount: 3,
    });
    expect(finalPending?.semanticSignatures.layout).toBe(
      requireTextProjection(final.projection, 'text').layoutSignature,
    );
    expect(finalPending?.attachedSignatures?.renderer).not.toBe(
      intermediatePending?.attachedSignatures?.renderer,
    );
    expect(finalPending?.lastRenderedSignatures).toEqual(
      initiallyRendered?.lastRenderedSignatures,
    );

    layer.confirmRenderedFrame(8);
    const finalRendered = layer.textRendererProbe('text');
    expect(finalRendered).toMatchObject({
      publicationStatus: 'current',
      lastRenderedFrame: 8,
      staleGlyphCount: 0,
    });
    expect(finalRendered?.lastRenderedSignatures).toEqual(finalRendered?.attachedSignatures);

    await layer.destroy();
  });

  it('updates 400→600→700 face intent without reconstructing unrelated text', async () => {
    const scene = (fontWeight: number) => [
      standaloneText('0.8~3.2m', { fontFamily: 'FiraCode', fontWeight }),
      { ...standaloneText('stable'), id: 'stable' },
    ];
    const regular = parsePatchMapV010(scene(400));
    const semibold = parsePatchMapV010(scene(600));
    const bold = parsePatchMapV010(scene(700));
    const layer = new AggregateLeafLayer();

    layer.sync(createRenderStore(regular.document.entities, 1), {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(regular.projection, 1),
    });
    const textObject = (text: string) => layer.textContainer.children.find(
      (child) => child instanceof Text && child.text === text,
    ) as Text | undefined;
    const stableTextObject = textObject('stable');
    const regularSignature = layer.textRendererProbe('text')?.attachedSignatures?.renderer;
    expect(textObject('0.8~3.2m')?.style).toMatchObject({
      fontFamily: 'FiraCode',
      fontWeight: 'normal',
    });

    layer.sync(createRenderStore(semibold.document.entities, 2), {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: projectionContext(semibold.projection, 2),
    });
    const semiboldSignature = layer.textRendererProbe('text')?.attachedSignatures?.renderer;
    expect(textObject('stable')).toBe(stableTextObject);
    expect(textObject('0.8~3.2m')?.style).toMatchObject({
      fontFamily: 'FiraCode',
      fontWeight: '600',
    });
    expect(semiboldSignature).not.toBe(regularSignature);

    layer.sync(createRenderStore(bold.document.entities, 3), {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: projectionContext(bold.projection, 3),
    });
    expect(textObject('stable')).toBe(stableTextObject);
    expect(textObject('0.8~3.2m')?.style).toMatchObject({
      fontFamily: 'FiraCode',
      fontWeight: 'bold',
    });
    expect(layer.textRendererProbe('text')?.attachedSignatures?.renderer).not.toBe(
      semiboldSignature,
    );
    expect(layer.debugSnapshot()).toMatchObject({ pixiTextCount: 2 });

    await layer.destroy();
  });

  it('includes exact paint intent in the renderer signature when semantic layout is unchanged', async () => {
    const initial = parsePatchMapV010([standaloneText('paint', { fill: '#222222' })]);
    const changed = parsePatchMapV010([standaloneText('paint', { fill: '#ff0000' })]);
    const layer = new AggregateLeafLayer();
    layer.sync(createRenderStore(initial.document.entities, 1), {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(initial.projection, 1),
    });
    layer.confirmRenderedFrame(1);
    const before = layer.textRendererProbe('text');

    layer.sync(createRenderStore(changed.document.entities, 2), {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: projectionContext(changed.projection, 2),
    });
    const pending = layer.textRendererProbe('text');
    expect(pending?.semanticSignatures).toEqual(before?.semanticSignatures);
    expect(pending?.attachedSignatures?.renderer).not.toBe(
      before?.lastRenderedSignatures?.renderer,
    );
    expect(pending).toMatchObject({
      publicationStatus: 'pending',
      staleGlyphCount: 5,
    });
    expect(layer.entityPaintProbe('text')).toMatchObject({
      packedTint: 0xff0000ff,
      rgbTint: 0xff0000,
      alpha: 1,
    });

    layer.confirmRenderedFrame(2);
    expect(layer.textRendererProbe('text')).toMatchObject({
      publicationStatus: 'current',
      staleGlyphCount: 0,
      lastRenderedFrame: 2,
    });
    await layer.destroy();
  });

  it('retains hidden text leaves for visibility-only reuse and clears them on destroy', async () => {
    const parsed = parsePatchMapV010([standaloneText('visible')]);
    const visible = createRenderStore(parsed.document.entities, 1);
    const layer = new AggregateLeafLayer();
    const context = projectionContext(parsed.projection, 1);
    layer.sync(visible, { fullRebuildEpoch: 1, projectionContext: context });
    layer.confirmRenderedFrame(1);
    const retained = layer.textContainer.children[0];

    const hidden: RenderStoreView = {
      ...visible,
      revision: 2,
      flags: new Uint8Array(visible.capacity),
    };
    layer.sync(hidden, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: context,
    });
    expect(layer.textContainer.children).toEqual([retained]);
    expect(retained?.visible).toBe(false);
    expect(layer.textRendererProbe('text')).toMatchObject({
      publicationStatus: 'current',
      lastRenderedFrame: 1,
    });

    const shown: RenderStoreView = {
      ...visible,
      revision: 3,
      flags: new Uint8Array(visible.capacity).fill(RenderFlags.Visible),
    };
    layer.sync(shown, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: context,
    });
    expect(layer.textContainer.children).toEqual([retained]);
    expect(retained?.visible).toBe(true);
    expect(layer.textRendererProbe('text')).toMatchObject({
      publicationStatus: 'current',
      lastRenderedFrame: 1,
      staleGlyphCount: 0,
    });

    await layer.destroy();
    expect(layer.textRendererProbe('text')).toBeNull();
    expect(layer.lastRenderedTextGraphemeCount('text')).toBe(0);
    expect(layer.textContainer.destroyed).toBe(true);
  });

  it('dirties only the text slot when the semantic text sidecar changes', () => {
    const parsed = parsePatchMapV010([standaloneText('stable')]);
    const store = createRenderStore(parsed.document.entities);
    const projection = requireTextProjection(parsed.projection, 'text');
    const changed: PatchMapProjectionIndex = Object.freeze({
      ...parsed.projection,
      textsByEntityId: Object.freeze({
        ...parsed.projection.textsByEntityId,
        text: Object.freeze({ ...projection, layoutSignature: 'text-layout/test-changed' }),
      }),
    });

    expect(projectionChangedRanges(store, parsed.projection, changed)).toEqual([
      { start: 0, end: 1 },
    ]);
  });

  it('joins current semantic and attached renderer facts without scanning Pixi children', async () => {
    const initial = parsePatchMapV010([standaloneText('old')]);
    const changed = parsePatchMapV010([standaloneText('final中')]);
    const initialStore = createRenderStore(initial.document.entities, 1);
    const layer = new AggregateLeafLayer();
    layer.sync(initialStore, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(initial.projection, 1),
    });
    layer.confirmRenderedFrame(4);
    const renderer = rendererProbeHarness(layer, initial.projection, initialStore, 1);

    expect(renderer.textRendererProbe('text')).toMatchObject({
      publicationStatus: 'current',
      objectCount: 1,
      staleGlyphCount: 0,
    });

    renderer.lastRenderedTextStoreRevision = 0;
    expect(renderer.textRendererProbe('text')).toMatchObject({
      publicationStatus: 'pending',
      objectCount: 1,
      staleGlyphCount: 0,
    });
    renderer.lastRenderedTextStoreRevision = initialStore.revision;

    renderer.projectionIndex = changed.projection;
    renderer.projectionRevision = 2;
    const pending = renderer.textRendererProbe('text');
    expect(pending).toMatchObject({
      publicationStatus: 'pending',
      objectCount: 1,
      staleGlyphCount: 3,
      semanticSignatures: {
        layout: requireTextProjection(changed.projection, 'text').layoutSignature,
      },
    });
    expect(pending?.attachedSignatures?.layout).toBe(
      requireTextProjection(initial.projection, 'text').layoutSignature,
    );
    expectDeepFrozen(pending);

    const hiddenStore: RenderStoreView = {
      ...createRenderStore(changed.document.entities, 2),
      flags: new Uint8Array(1),
    };
    layer.sync(hiddenStore, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: projectionContext(changed.projection, 2),
    });
    renderer.textVisibilityByEntityId.set('text', false);
    renderer.textProjectionSynchronizedRevision = 2;
    renderer.lastRenderedTextProjectionRevision = 2;
    renderer.lastRenderedTextStoreRevision = 2;
    renderer.lastStore = hiddenStore;
    renderer.frame = 5;
    expect(renderer.textRendererProbe('text')).toMatchObject({
      attachedRoute: 'none',
      objectKind: 'none',
      routeDecisionReason: 'not-attached',
      objectCount: 0,
      attachedSignatures: null,
      lastRenderedSignatures: null,
      publicationStatus: 'current',
      lastRenderedFrame: 5,
      staleGlyphCount: 0,
    });

    await layer.destroy();
    renderer.destroyedValue = true;
    expect(renderer.textRendererProbe('text')).toBeNull();
  });
});

function standaloneText(
  text: string,
  style: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    type: 'text',
    id: 'text',
    text,
    style: {
      fontFamily: 'Unifont',
      fontSize: 16,
      lineHeight: 20,
      letterSpacing: 0,
      ...style,
    },
  };
}

function bitmapProof(
  text: string,
  fontWeight = 400,
  fontStyle: 'normal' | 'italic' | 'oblique' = 'normal',
): PatchMapBitmapTextCapabilityProof {
  return Object.freeze({
    coverage: 'proven',
    atlasId: 'test-unifont-ascii',
    glyphs: Object.freeze([...new Set([...text].filter((glyph) => glyph !== '\n'))]),
    style: Object.freeze({
      fontFamily: 'Unifont',
      fontSize: 16,
      fontWeight,
      fontStyle,
      lineHeight: 20,
      letterSpacing: 0,
    }),
    multiline: true,
  });
}

function requireTextProjection(index: PatchMapProjectionIndex, entityId: string) {
  const projection = index.textsByEntityId?.[entityId];
  if (projection === undefined) throw new Error(`missing text projection for ${entityId}`);
  return projection;
}

function projectionContext(
  index: PatchMapProjectionIndex,
  revision: number,
): PatchMapProjectionRenderContext {
  return Object.freeze({
    index,
    revision,
    world: Object.freeze({ rotationDegrees: 0, flipX: false, flipY: false }),
  });
}

function createRenderStore(
  entities: readonly EntityInput[],
  revision = 1,
): RenderStoreView {
  const records = entities.map((entity) => entity as unknown as Record<string, unknown>);
  const capacity = entities.length;
  const numbers = (key: string, fallback = 0): Float64Array => Float64Array.from(
    records.map((record) => typeof record[key] === 'number' ? record[key] : fallback),
  );
  const packed = (key: string, fallback = 0): Uint32Array => Uint32Array.from(
    records.map((record) => typeof record[key] === 'number' ? record[key] : fallback),
  );
  const strings = (key: string): string[] => records.map((record) => (
    typeof record[key] === 'string' ? record[key] : ''
  ));
  return {
    capacity,
    liveCount: capacity,
    revision,
    alive: new Uint8Array(capacity).fill(1),
    kind: Uint8Array.from(entities.map((entity) => ({
      rect: RenderKind.Rect,
      text: RenderKind.Text,
      image: RenderKind.Image,
      bar: RenderKind.Bar,
      relation: RenderKind.Relation,
    })[entity.kind])),
    flags: Uint8Array.from(entities.map((entity) => (
      entity.visible === false ? 0 : RenderFlags.Visible
    ))),
    zIndex: Int32Array.from(numbers('zIndex')),
    x: numbers('x'),
    y: numbers('y'),
    width: numbers('width'),
    height: numbers('height'),
    rotation: numbers('rotation'),
    opacity: numbers('opacity', 1),
    fill: packed('fill'),
    stroke: packed('stroke'),
    strokeWidth: numbers('strokeWidth'),
    radius: numbers('radius'),
    text: strings('text'),
    color: packed('color', 0xffffffff),
    fontSize: numbers('fontSize', 16),
    fontFamily: strings('fontFamily'),
    fontWeight: Uint16Array.from(numbers('fontWeight', 400)),
    align: Uint8Array.from(records.map((record) => (
      record.align === 'center'
        ? RenderAlign.Center
        : record.align === 'right'
          ? RenderAlign.Right
          : RenderAlign.Left
    ))),
    maxLines: new Uint16Array(capacity),
    source: strings('source'),
    tint: packed('tint', 0xffffffff),
    fit: new Uint8Array(capacity),
    value: numbers('value'),
    min: numbers('min'),
    max: numbers('max', 1),
    trackFill: packed('trackFill'),
    relationFrom: new Int32Array(capacity).fill(-1),
    relationTo: new Int32Array(capacity).fill(-1),
    lineWidth: numbers('lineWidth'),
    ids: entities.map((entity) => entity.id),
    view: { x: 0, y: 0, scale: 1, rotation: 0 },
    background: 0xffffffff,
    renderOrder: () => Uint32Array.from({ length: capacity }, (_value, index) => index),
  };
}

interface RendererProbeHarness {
  projectionIndex: PatchMapProjectionIndex;
  projectionRevision: number;
  textProjectionSynchronizedRevision: number;
  lastRenderedTextProjectionRevision: number | null;
  lastRenderedTextStoreRevision: number | null;
  textVisibilityByEntityId: Map<string, boolean>;
  lastStore: RenderStoreView | null;
  frame: number;
  destroyedValue: boolean;
  textRendererProbe(entityId: string): PatchMapTextRendererProbe | null;
}

function rendererProbeHarness(
  leaves: AggregateLeafLayer,
  projectionIndex: PatchMapProjectionIndex,
  store: RenderStoreView,
  revision: number,
): RendererProbeHarness {
  const renderer = Object.create(PatchMapPixiRenderer.prototype) as RendererProbeHarness & {
    leaves: AggregateLeafLayer;
  };
  Object.assign(renderer, {
    leaves,
    projectionIndex,
    projectionRevision: revision,
    textProjectionSynchronizedRevision: revision,
    lastRenderedTextProjectionRevision: revision,
    lastRenderedTextStoreRevision: store.revision,
    textVisibilityByEntityId: new Map([['text', true]]),
    lastStore: store,
    frame: 4,
    destroyedValue: false,
  });
  return renderer;
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
