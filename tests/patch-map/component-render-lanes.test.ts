import { Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { EntityInput } from '../../src/patch-map/dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import {
  PatchMapAssetRuntime,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
} from '../../src/patch-map/assets';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import { parsePatchMap } from '../../src/patch-map/parser';
import { AggregateLeafLayer } from '../../src/patch-map/renderers/leaf-layer';
import {
  AggregateMeshLayer,
  appendPatchMapRoundedRectPath,
  fitPatchMapCornerRadii,
  multiplyPackedRgba,
  type PatchMapRoundedRectPathSink,
} from '../../src/patch-map/renderers/mesh-layer';
import { projectionChangedRanges } from '../../src/patch-map/renderers/pixi-renderer';
import type { PatchMapProjectionRenderContext } from '../../src/patch-map/renderers/types';

describe('PatchMap fixed component render lanes', () => {
  it('backs every production role with a fixed aggregate container in exact paint order', async () => {
    const parsed = parsePatchMap([
      {
        type: 'image',
        id: 'site-underlay',
        source: 'fixture-site-underlay',
        size: { width: 400, height: 300 },
      },
      {
        type: 'item',
        id: 'geometry-owner',
        size: { width: 100, height: 80 },
        components: [
          { type: 'background', id: 'geometry-bg', source: { type: 'rect', fill: '#123456' } },
          {
            type: 'bar',
            id: 'level',
            size: { width: 40, height: 8 },
            source: { type: 'rect', fill: '#224466' },
            tint: '#00cc66',
            value: 50,
            min: 0,
            max: 100,
          },
          { type: 'text', id: 'label', text: '42', style: { fontSize: 12 } },
        ],
      },
      {
        type: 'item',
        id: 'asset-owner',
        size: { width: 100, height: 80 },
        components: [
          { type: 'background', id: 'asset-bg', source: 'fixture-background' },
          { type: 'icon', id: 'icon', source: 'fixture-icon', size: 20 },
        ],
      },
    ]);
    const store = createRenderStore(parsed.document.entities);
    const context = projectionContext(parsed.projection, 1);
    const mesh = new AggregateMeshLayer({ chunkSize: 8 });
    const leaves = await createResolvedLeafLayer(parsed.projection, 'component-role-lanes');
    mesh.sync(store, { fullRebuildEpoch: 1, projectionContext: context });
    leaves.sync(store, { fullRebuildEpoch: 1, projectionContext: context });

    const world = new Container();
    const overlay = new Graphics();
    mesh.container.addChild(
      leaves.standaloneAssetContainer,
      mesh.ordinaryGeometryContainer,
      mesh.backgroundGeometryContainer,
      leaves.backgroundAssetContainer,
      mesh.relationsDynamicContainer,
      leaves.contentAssetContainer,
      leaves.textContainer,
    );
    world.addChild(mesh.container, overlay);

    expect(world.children).toEqual([
      mesh.container,
      overlay,
    ]);
    expect(mesh.container.children).toEqual([
      leaves.standaloneAssetContainer,
      mesh.ordinaryGeometryContainer,
      mesh.backgroundGeometryContainer,
      leaves.backgroundAssetContainer,
      mesh.relationsDynamicContainer,
      leaves.contentAssetContainer,
      leaves.textContainer,
    ]);
    expect(leaves.standaloneAssetContainer.children).toHaveLength(1);
    expect(leaves.backgroundAssetContainer.children).toHaveLength(1);
    expect(leaves.contentAssetContainer.children).toHaveLength(1);
    expect(leaves.imageContainer).toBe(leaves.standaloneAssetContainer);

    expect(mesh.entityPaintProbe('geometry-owner::background:geometry-bg')).toMatchObject({
      lane: 'background-geometry',
      rendererKind: 'mesh',
      primitiveCount: 1,
      renderObjectCount: 0,
    });
    expect(mesh.entityPaintProbe('geometry-owner::bar:level')).toMatchObject({
      lane: 'relations-dynamic',
      rendererKind: 'mesh',
      primitiveCount: 2,
    });
    expect(leaves.entityPaintProbe('asset-owner::background:asset-bg')).toMatchObject({
      lane: 'background-assets',
      rendererKind: 'sprite',
      renderObjectCount: 1,
    });
    expect(leaves.entityPaintProbe('asset-owner::icon:icon')).toMatchObject({
      lane: 'content-assets',
      rendererKind: 'sprite',
      renderObjectCount: 1,
    });
    expect(leaves.entityPaintProbe('site-underlay')).toMatchObject({
      lane: 'content-assets',
      rendererKind: 'sprite',
      renderObjectCount: 1,
    });
    expect(Object.isFrozen(mesh.renderLaneProbe().backgroundGeometry)).toBe(true);
    expect(Object.isFrozen(leaves.renderLaneProbe().contentAssets)).toBe(true);

    world.removeChildren();
    overlay.destroy();
    mesh.destroy();
    await leaves.destroy();
    world.destroy();
  });

  it('uses one chunk GraphicsContext for transparent-fill styled backgrounds and tints the border', () => {
    const parsed = parsePatchMap([{
      type: 'item',
      id: 'item',
      size: { width: 100, height: 80 },
      components: [{
        type: 'background',
        id: 'bg',
        source: {
          type: 'rect',
          fill: '#ff000000',
          borderWidth: 2,
          borderColor: '#ffffffff',
          radius: [4, 8, 12, 16],
        },
        tint: '#00ff00ff',
      }],
    }]);
    const store = createRenderStore(parsed.document.entities);
    const layer = new AggregateMeshLayer({ chunkSize: 512 });
    const debug = layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1),
    });
    const probe = layer.entityPaintProbe('item::background:bg');

    expect(debug.backgroundMeshCount).toBe(0);
    expect(debug.backgroundGraphicsObjectCount).toBe(1);
    expect(debug.visibleBackgroundPrimitives).toBe(1);
    expect(layer.backgroundGeometryContainer.children).toHaveLength(1);
    expect(layer.backgroundGeometryContainer.children[0]).toBeInstanceOf(Graphics);
    expect(probe).toEqual({
      entityId: 'item::background:bg',
      lane: 'background-geometry',
      rendererKind: 'graphics',
      primitiveCount: 1,
      renderObjectCount: 0,
      packedTint: 0x00000000,
      rgbTint: 0,
      alpha: 0,
    });
    expect(multiplyPackedRgba(0xffffffff, 0x00ff00ff)).toBe(0x00ff00ff);
    expect(layer.renderLaneProbe().backgroundGeometry).toMatchObject({
      renderObjectCount: 1,
      visiblePrimitiveCount: 1,
    });
    layer.destroy();
  });

  it('retains all four corner values and proportionally fits oversized adjacent radii', () => {
    const commands: Array<readonly [string, ...number[]]> = [];
    const sink: PatchMapRoundedRectPathSink = {
      moveTo: (x, y) => commands.push(['moveTo', x, y]),
      lineTo: (x, y) => commands.push(['lineTo', x, y]),
      arcTo: (x1, y1, x2, y2, radius) =>
        commands.push(['arcTo', x1, y1, x2, y2, radius]),
      closePath: () => commands.push(['closePath']),
    };

    appendPatchMapRoundedRectPath(sink, 100, 80, [4, 8, 12, 16]);
    expect(commands.filter(([name]) => name === 'arcTo').map((command) => command.at(-1)))
      .toEqual([8, 12, 16, 4]);

    const fitted = fitPatchMapCornerRadii(40, 20, [30, 10, 20, 40]);
    [60 / 7, 20 / 7, 40 / 7, 80 / 7].forEach((value, index) => {
      expect(fitted[index]).toBeCloseTo(value, 12);
    });
    expect(Object.isFrozen(fitted)).toBe(true);
  });

  it('removes a rect background lane before publishing its same-ID background Sprite', async () => {
    const initial = parsePatchMap([backgroundDataset({
      type: 'rect',
      fill: '#ff0000',
      borderWidth: 2,
      radius: 8,
    })]);
    const replacement = parsePatchMap([backgroundDataset('fixture-image')]);
    const hidden = parsePatchMap([backgroundDataset('fixture-image', false)]);
    const entityId = 'item::background:bg';
    const mesh = new AggregateMeshLayer({ chunkSize: 8 });
    const leaves = await createResolvedLeafLayer(replacement.projection, 'component-background-swap');

    mesh.sync(createRenderStore(initial.document.entities), {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(initial.projection, 1),
    });
    expect(mesh.renderLaneProbe().backgroundGeometry.visiblePrimitiveCount).toBe(1);

    const replacementStore = createRenderStore(replacement.document.entities);
    mesh.sync(replacementStore, {
      fullRebuildEpoch: 2,
      projectionContext: projectionContext(replacement.projection, 2),
    });
    expect(mesh.renderLaneProbe().backgroundGeometry).toMatchObject({
      renderObjectCount: 0,
      visiblePrimitiveCount: 0,
    });
    expect(mesh.entityPaintProbe(entityId)).toBeNull();

    leaves.sync(replacementStore, {
      fullRebuildEpoch: 2,
      projectionContext: projectionContext(replacement.projection, 2),
    });
    expect(leaves.renderLaneProbe().backgroundAssets).toMatchObject({
      renderObjectCount: 1,
      visiblePrimitiveCount: 1,
    });
    expect(leaves.renderLaneProbe().contentAssets.visiblePrimitiveCount).toBe(0);
    expect(leaves.entityPaintProbe(entityId)).toMatchObject({
      entityId,
      lane: 'background-assets',
      rendererKind: 'sprite',
      renderObjectCount: 1,
    });

    leaves.sync(createRenderStore(hidden.document.entities), {
      fullRebuildEpoch: 3,
      projectionContext: projectionContext(hidden.projection, 3),
    });
    expect(leaves.backgroundAssetContainer.children).toHaveLength(0);
    expect(leaves.entityPaintProbe(entityId)).toMatchObject({
      entityId,
      lane: 'background-assets',
      rendererKind: 'none',
      primitiveCount: 0,
      renderObjectCount: 0,
      rgbTint: null,
      alpha: null,
    });

    mesh.destroy();
    await leaves.destroy();
  });

  it('reports semantic packed tint and the applied Sprite tint without reacquiring', async () => {
    const parsed = parsePatchMap([{
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
    }]);
    const backend = new ImmediateTextureBackend();
    const runtime = new PatchMapAssetRuntime(backend);
    const session = runtime.createSession({ instanceId: 'component-lane-icon', policy: () => undefined });
    session.registerAssets([{
      alias: 'fixture-icon',
      descriptor: 'https://assets.example.test/fixture-icon.png',
    }]);
    const layer = new AggregateLeafLayer(session, true);
    const entityId = 'item-a::icon:icon';
    const bindingKey = parsed.projection.imagesByEntityId?.[entityId]?.bindingKey;
    if (!bindingKey) throw new Error('icon binding key missing');
    await layer.bindSceneAsset(bindingKey, { kind: 'alias', alias: 'fixture-icon' });
    const initialStore = createRenderStore(parsed.document.entities);
    layer.sync(initialStore, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1),
    });
    const generation = layer.sceneAssetBindingProbe(bindingKey)?.generation;
    const sprite = layer.contentAssetContainer.children[0];

    const tint = new Uint32Array(initialStore.tint);
    tint[initialStore.ids.indexOf(entityId)] = 0x00ff00ff;
    const tintedStore: RenderStoreView = { ...initialStore, revision: 2, tint };
    layer.sync(tintedStore, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: initialStore.ids.indexOf(entityId), end: initialStore.ids.indexOf(entityId) + 1 }],
      projectionContext: projectionContext(parsed.projection, 1),
    });

    expect(layer.contentAssetContainer.children[0]).toBe(sprite);
    expect(layer.sceneAssetBindingProbe(bindingKey)?.generation).toBe(generation);
    expect(backend.loadCount).toBe(1);
    expect(layer.entityPaintProbe(entityId)).toEqual({
      entityId,
      lane: 'content-assets',
      rendererKind: 'sprite',
      primitiveCount: 1,
      renderObjectCount: 1,
      packedTint: 0x00ff00ff,
      rgbTint: 0x00ff00,
      alpha: 1,
    });
    expect(Object.isFrozen(layer.entityPaintProbe(entityId))).toBe(true);
    await layer.destroy();
  });

  it('dirties the exact slot for component-role and background-paint-only projection changes', () => {
    const parsed = parsePatchMap([backgroundDataset({
      type: 'rect',
      fill: '#ff0000',
      radius: [1, 2, 3, 4],
    })]);
    const store = createRenderStore(parsed.document.entities);
    const entityId = 'item::background:bg';
    const component = parsed.projection.componentsByEntityId?.[entityId];
    const paint = parsed.projection.backgroundsByEntityId?.[entityId];
    if (!component || !paint) throw new Error('background projection missing');

    const roleChanged: PatchMapProjectionIndex = Object.freeze({
      ...parsed.projection,
      componentsByEntityId: Object.freeze({
        ...parsed.projection.componentsByEntityId,
        [entityId]: Object.freeze({ ...component, renderRole: 'background-asset' }),
      }),
    });
    expect(projectionChangedRanges(store, parsed.projection, roleChanged)).toEqual([
      { start: 1, end: 2 },
    ]);

    const paintChanged: PatchMapProjectionIndex = Object.freeze({
      ...parsed.projection,
      backgroundsByEntityId: Object.freeze({
        ...parsed.projection.backgroundsByEntityId,
        [entityId]: Object.freeze({
          ...paint,
          radius: Object.freeze([4, 3, 2, 1] as const),
        }),
      }),
    });
    expect(projectionChangedRanges(store, parsed.projection, paintChanged)).toEqual([
      { start: 1, end: 2 },
    ]);
  });
});

function backgroundDataset(source: unknown, show = true): Record<string, unknown> {
  return {
    type: 'item',
    id: 'item',
    size: { width: 100, height: 80 },
    components: [{ type: 'background', id: 'bg', source, show }],
  };
}

async function createResolvedLeafLayer(
  projection: PatchMapProjectionIndex,
  instanceId: string,
): Promise<AggregateLeafLayer> {
  const runtime = new PatchMapAssetRuntime(new ImmediateTextureBackend());
  const session = runtime.createSession({ instanceId, policy: () => undefined });
  const images = Object.values(projection.imagesByEntityId ?? {});
  const aliases = [...new Set(images.map(({ authoredSource }) => fixtureImageAlias(authoredSource)))];
  session.registerAssets(aliases.map((alias) => ({
    alias,
    descriptor: `https://assets.example.test/${alias}.png`,
  })));
  const layer = new AggregateLeafLayer(session, true);
  const bound = new Set<string>();
  for (const image of images) {
    if (bound.has(image.bindingKey)) continue;
    bound.add(image.bindingKey);
    await layer.bindSceneAsset(image.bindingKey, {
      kind: 'alias',
      alias: fixtureImageAlias(image.authoredSource),
    });
  }
  return layer;
}

function fixtureImageAlias(source: unknown): string {
  if (typeof source !== 'string') throw new Error('fixture image alias must be a string');
  return source;
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

function createRenderStore(entities: readonly EntityInput[]): RenderStoreView {
  const records = entities.map((entity) => entity as unknown as Record<string, unknown>);
  const capacity = entities.length;
  const numbers = (key: string, fallback = 0): Float64Array => Float64Array.from(
    records.map((record) => typeof record[key] === 'number' ? record[key] : fallback),
  );
  const packed = (key: string, fallback = 0): Uint32Array => Uint32Array.from(
    records.map((record) => typeof record[key] === 'number' ? record[key] : fallback),
  );
  const strings = (key: string): string[] => records.map((record) =>
    typeof record[key] === 'string' ? record[key] : ''
  );
  return {
    capacity,
    liveCount: capacity,
    revision: 1,
    alive: new Uint8Array(capacity).fill(1),
    kind: Uint8Array.from(entities.map((entity) => ({
      rect: RenderKind.Rect,
      text: RenderKind.Text,
      image: RenderKind.Image,
      bar: RenderKind.Bar,
      relation: RenderKind.Relation,
    })[entity.kind])),
    flags: Uint8Array.from(entities.map((entity) =>
      entity.visible === false ? 0 : RenderFlags.Visible
    )),
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
    align: new Uint8Array(capacity),
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

class ImmediateTextureBackend implements PatchMapAssetBackend {
  public readonly keyNamespace = 'component-render-lanes';
  public loadCount = 0;

  public get(): undefined {
    return undefined;
  }

  public load(): Promise<unknown> {
    this.loadCount += 1;
    return Promise.resolve(Texture.WHITE);
  }

  public describe(request: PatchMapAssetBackendRequest): Readonly<{
    normalizedResourceIdentity: string;
    cacheIdentity: string;
  }> {
    return Object.freeze({
      normalizedResourceIdentity: `decoded:${request.descriptor.src}`,
      cacheIdentity: `fixture:${request.descriptor.src}`,
    });
  }

  public unload(): Promise<void> {
    return Promise.resolve();
  }
}
