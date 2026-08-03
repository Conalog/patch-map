import { describe, expect, it } from 'vitest';
import { Mesh, type MeshGeometry } from 'pixi.js';
import type { EntityInput } from '../../src/patch-map/dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import { projectPatchMapBarPresentationHeight } from '../../src/patch-map/presentation-projection';
import { AggregateLeafLayer } from '../../src/patch-map/renderers/leaf-layer';
import {
  AggregateMeshLayer,
  buildAggregateChunkGeometry,
} from '../../src/patch-map/renderers/mesh-layer';
import {
  applyPatchMapAffine,
  invertPatchMapAffine,
  multiplyPatchMapAffine,
} from '../../src/patch-map/semantic/geometry';
import {
  createPatchMapProjectionQuadCache,
  createPatchMapWorldAffine,
  createPatchMapResolvedRenderQuadScratch,
  resolvePatchMapSlotQuad,
  writePatchMapSlotQuad,
  type PatchMapProjectionRenderContext,
} from '../../src/patch-map/renderers/types';

describe('PatchMap orientation renderer lanes', () => {
  it('caches readable bases across animation frames and invalidates on world revision', () => {
    const parsed = parsePatchMapV010([item('cache-meter', 'upright', [{
      type: 'bar',
      id: 'cache-level',
      size: { width: 18, height: 6 },
      source: { type: 'rect', fill: '#223344' },
    }], { angle: 37 })]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'bar');
    if (!entity) throw new Error('cache bar entity was not projected');
    const store = createRenderStore([entity]);
    const cache = createPatchMapProjectionQuadCache();
    const initialContext = Object.freeze({
      ...projectionContext(parsed.projection, 1, 0, false, false),
      quadCache: cache,
    });
    const scratch = createPatchMapResolvedRenderQuadScratch();

    writePatchMapSlotQuad(scratch, store, 0, initialContext, 0.25);
    const initialFrame = cache.readableFrames.get(entity.id);
    expect(initialFrame).toBeDefined();
    expect(cache.readableFrames.size).toBe(1);
    expect(cache.worldA).toBe(1);
    expect(cache.worldD).toBe(1);

    writePatchMapSlotQuad(scratch, store, 0, initialContext, 0.75);
    expect(cache.readableFrames.get(entity.id)).toBe(initialFrame);
    expect(scratch.width).toBeCloseTo((initialFrame?.fullWidth ?? 0) * 0.75, 8);

    const rotatedContext = Object.freeze({
      ...projectionContext(parsed.projection, 2, 90, false, false),
      quadCache: cache,
    });
    writePatchMapSlotQuad(scratch, store, 0, rotatedContext, 0.75);
    expect(cache.readableFrames.size).toBe(1);
    expect(cache.readableFrames.get(entity.id)).not.toBe(initialFrame);
    expectBasisClose(scratch.screenBasis, rotationBasis(307));
  });

  it('reuses one numeric quad target across animated width writes', () => {
    const parsed = parsePatchMapV010([item('scratch-meter', 'follow-item', [{
      type: 'bar',
      id: 'scratch-level',
      size: { width: 18, height: 6 },
      source: { type: 'rect', fill: '#223344' },
    }], { angle: 37, scaleX: -1, scaleY: 1 })]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'bar');
    if (!entity) throw new Error('scratch bar entity was not projected');
    const store = createRenderStore([entity]);
    const context = projectionContext(parsed.projection, 1, 90, true, false);
    const scratch = createPatchMapResolvedRenderQuadScratch();
    const center = scratch.center;
    const basis = scratch.basis;
    const vertices = scratch.vertices;

    expect(writePatchMapSlotQuad(scratch, store, 0, context, 0.25)).toBe(scratch);
    const firstWidth = scratch.width;
    expect(writePatchMapSlotQuad(scratch, store, 0, context, 0.75)).toBe(scratch);
    expect(scratch.center).toBe(center);
    expect(scratch.basis).toBe(basis);
    expect(scratch.vertices).toBe(vertices);
    expect(scratch.width).toBeCloseTo(firstWidth * 3, 8);
    expectBasisClose(scratch.basis, resolvePatchMapSlotQuad(store, 0, context, 0.75).basis);

    const denseStore = createRenderStore([{
      kind: 'rect',
      id: 'dense-fallback',
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fill: 0xffffffff,
    }]);
    writePatchMapSlotQuad(scratch, denseStore, 0, undefined, Number.NaN);
    expect(scratch.width).toBe(0);
    expect(scratch.vertices.every(Number.isFinite)).toBe(true);
    writePatchMapSlotQuad(scratch, denseStore, 0, undefined, 2);
    expect(scratch.width).toBe(20);
  });

  it('feeds exact affine vertices and reflected leading-edge fill to Mesh', () => {
    const parsed = parsePatchMapV010([{
      type: 'item',
      id: 'meter',
      size: { width: 20, height: 20 },
      attrs: { x: 60, y: 30, angle: 37, scaleX: -1, scaleY: 1 },
      contentOrientation: 'follow-item',
      components: [{
        type: 'bar',
        id: 'level',
        size: { width: 20, height: 8 },
        placement: 'center',
        source: { type: 'rect', fill: '#223344' },
        tint: '#33aa55',
      }],
    }]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'bar')!;
    const store = createRenderStore([entity], { value: 0.5 });
    const context = projectionContext(parsed.projection, 1, 0, false, false);
    const geometry = buildAggregateChunkGeometry(store, 0, 1, context);
    const track = geometry.quadGroups.find((group) => group.tint === 0x223344)!;
    const fill = geometry.quadGroups.find((group) => group !== track)!;
    const expectedTrack = resolvePatchMapSlotQuad(store, 0, context);
    const expectedFill = resolvePatchMapSlotQuad(store, 0, context, 0.5);

    expect([...track.positions]).toEqual(expectedTrack.vertices.map(Math.fround));
    expect([...fill.positions]).toEqual(expectedFill.vertices.map(Math.fround));
    expect(expectedFill.center).not.toEqual(expectedTrack.center);
  });

  it('keeps projected rounded bar radii stable across partial build and update', () => {
    const parsed = parsePatchMapV010([item('rounded-meter', 'follow-item', [{
      type: 'bar',
      id: 'rounded-level',
      size: { width: 20, height: 8 },
      source: { type: 'rect', fill: '#223344', radius: 4 },
      tint: '#33aa55',
    }])]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'bar');
    if (!entity) throw new Error('rounded bar entity was not projected');
    const store = createRenderStore([entity], { value: 0.5 });
    const context = projectionContext(parsed.projection, 1, 0, false, false);
    const initial = buildAggregateChunkGeometry(store, 0, 1, context);
    const initialFill = initial.quadGroups.reduce((latest, group) =>
      latest === null || group.drawOrder > latest.drawOrder ? group : latest,
    null as (typeof initial.quadGroups)[number] | null);
    if (!initialFill) throw new Error('rounded bar fill geometry was not created');

    expect(initialFill.positions[10]! - initialFill.positions[2]!).toBeCloseTo(4, 6);

    const layer = new AggregateMeshLayer({ chunkSize: 8 });
    layer.sync(store, { fullRebuildEpoch: 1, projectionContext: context });
    const fillMesh = layer.relationContainer.children.reduce<Mesh<MeshGeometry> | null>(
      (latest, child) => child instanceof Mesh &&
        (latest === null || child.zIndex > latest.zIndex)
        ? child as Mesh<MeshGeometry>
        : latest,
      null,
    );
    if (!fillMesh) throw new Error('rounded bar fill mesh was not created');

    (store.value as Float64Array)[0] = 0.75;
    (store as { revision: number }).revision = 2;
    layer.sync(store, {
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: context,
    });

    expect(fillMesh.geometry.positions[10]! - fillMesh.geometry.positions[2]!)
      .toBeCloseTo(4, 6);
    layer.destroy();
  });

  it.each([
    {
      rotationDegrees: 45,
      flipX: false,
      flipY: false,
      expectedAngle: 45,
    },
    {
      rotationDegrees: 180,
      flipX: false,
      flipY: false,
      expectedAngle: 0,
    },
    {
      rotationDegrees: 90,
      flipX: false,
      flipY: false,
      expectedAngle: 270,
    },
    {
      rotationDegrees: 45,
      flipX: true,
      flipY: false,
      expectedAngle: 315,
    },
    {
      rotationDegrees: 0,
      flipX: false,
      flipY: true,
      expectedAngle: 0,
    },
    {
      rotationDegrees: 45,
      flipX: false,
      flipY: true,
      expectedAngle: 315,
    },
    {
      rotationDegrees: 45,
      flipX: true,
      flipY: true,
      expectedAngle: 45,
    },
  ])(
    'keeps readable content inside its background at $rotationDegrees° [$flipX,$flipY]',
    ({ rotationDegrees, flipX, flipY, expectedAngle }) => {
      const parsed = parsePatchMapV010([{
        type: 'item',
        id: 'contained-meter',
        size: { width: 120, height: 80 },
        padding: 8,
        contentOrientation: 'upright',
        components: [
          {
            type: 'background',
            id: 'surface',
            source: { type: 'rect', fill: '#e2e8f0' },
          },
          {
            type: 'bar',
            id: 'level',
            size: { width: 100, height: 16 },
            placement: 'bottom',
            source: { type: 'rect', fill: '#22c55e' },
          },
          {
            type: 'text',
            id: 'label',
            text: '42',
            placement: 'center',
            style: { fontSize: 12 },
          },
        ],
      }]);
      const entities = parsed.document.entities.filter((candidate) =>
        candidate.kind === 'bar' || candidate.kind === 'text'
      );
      const store = createRenderStore(entities);
      const context = projectionContext(
        parsed.projection,
        1,
        rotationDegrees,
        flipX,
        flipY,
      );
      const world = createPatchMapWorldAffine(context.world);
      const owner = parsed.projection.byEntityId['contained-meter'];
      if (!owner) throw new Error('contained meter owner projection was not created');
      const ownerScreenInverse = invertPatchMapAffine(
        multiplyPatchMapAffine(world, owner.affine),
      );

      for (let slot = 0; slot < entities.length; slot += 1) {
        const quad = resolvePatchMapSlotQuad(store, slot, context);
        expectBasisClose(quad.screenBasis, rotationBasis(expectedAngle));
        for (let index = 0; index < quad.vertices.length; index += 2) {
          const screenPoint = applyPatchMapAffine(world, [
            quad.vertices[index] as number,
            quad.vertices[index + 1] as number,
          ]);
          const ownerLocal = applyPatchMapAffine(ownerScreenInverse, screenPoint);
          expect(ownerLocal[0]).toBeGreaterThanOrEqual(-1e-8);
          expect(ownerLocal[0]).toBeLessThanOrEqual(120 + 1e-8);
          expect(ownerLocal[1]).toBeGreaterThanOrEqual(-1e-8);
          expect(ownerLocal[1]).toBeLessThanOrEqual(80 + 1e-8);
        }
      }

      const bar = resolvePatchMapSlotQuad(store, 0, context);
      const ownerScreenCenter = applyPatchMapAffine(world, owner.visibleCenter);
      const barScreenCenter = applyPatchMapAffine(world, bar.center);
      const relativeX = barScreenCenter[0] - ownerScreenCenter[0];
      const relativeY = barScreenCenter[1] - ownerScreenCenter[1];
      const readableHorizontalOffset =
        relativeX * bar.screenBasis[0] + relativeY * bar.screenBasis[1];
      const readableBottomOffset =
        relativeX * bar.screenBasis[2]
        + relativeY * bar.screenBasis[3]
        + bar.height / 2;
      expect(readableHorizontalOffset).toBeCloseTo(0, 8);
      expect(readableBottomOffset).toBeCloseTo(32, 8);
    },
  );

  it('keeps the readable bottom edge fixed during a vertically flipped bar animation', () => {
    const parsed = parsePatchMapV010([{
      type: 'item',
      id: 'animated-meter',
      size: { width: 120, height: 80 },
      padding: 8,
      contentOrientation: 'upright',
      components: [{
        type: 'bar',
        id: 'level',
        size: { width: 100, height: 16 },
        placement: 'bottom',
        source: { type: 'rect', fill: '#22c55e' },
      }],
    }]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'bar');
    const destination = parsed.projection.byEntityId['animated-meter::bar:level'];
    if (!entity || !destination) throw new Error('animated bar was not projected');
    const store = createRenderStore([entity]);
    const short = projectPatchMapBarPresentationHeight(destination, 4);
    const shortIndex = Object.freeze({
      ...parsed.projection,
      byEntityId: Object.freeze({
        ...parsed.projection.byEntityId,
        [entity.id]: short,
      }),
    });
    const world = createPatchMapWorldAffine({
      rotationDegrees: 0,
      flipX: false,
      flipY: true,
    });
    const fullQuad = resolvePatchMapSlotQuad(
      store,
      0,
      projectionContext(parsed.projection, 1, 0, false, true),
    );
    const shortQuad = resolvePatchMapSlotQuad(
      store,
      0,
      projectionContext(shortIndex, 2, 0, false, true),
    );
    const fullBottom = readableBottomPoint(fullQuad, world);
    const shortBottom = readableBottomPoint(shortQuad, world);
    const fullTop = readableTopPoint(fullQuad, world);
    const shortTop = readableTopPoint(shortQuad, world);

    expect(shortBottom[0]).toBeCloseTo(fullBottom[0], 8);
    expect(shortBottom[1]).toBeCloseTo(fullBottom[1], 8);
    expect(shortTop[1]).toBeGreaterThan(fullTop[1]);
  });

  it.each([
    { angle: 0, expectedAngle: 0 },
    { angle: 89, expectedAngle: 89 },
    { angle: 90, expectedAngle: 270 },
    { angle: 131, expectedAngle: 311 },
    { angle: 180, expectedAngle: 0 },
    { angle: 229, expectedAngle: 49 },
    { angle: 269, expectedAngle: 89 },
    { angle: 270, expectedAngle: 270 },
    { angle: 315, expectedAngle: 315 },
  ])(
    'chooses the readable half-plane for an authored $angle° item',
    ({ angle, expectedAngle }) => {
      const parsed = parsePatchMapV010([item('readable-meter', 'upright', [{
        type: 'text',
        id: 'readable-label',
        text: '42',
        style: { fontSize: 10 },
      }], { angle })]);
      const entity = parsed.document.entities.find((candidate) => candidate.kind === 'text');
      if (!entity) throw new Error('readable text entity was not projected');
      const quad = resolvePatchMapSlotQuad(
        createRenderStore([entity]),
        0,
        projectionContext(parsed.projection, 1, 0, false, false),
      );

      expectBasisClose(quad.screenBasis, rotationBasis(expectedAngle));
    },
  );

  it('breaks Mesh same-store early return when upright projection revision changes', () => {
    const parsed = parsePatchMapV010([item('upright-meter', 'upright', [{
      type: 'bar',
      id: 'upright-level',
      size: { width: 16, height: 6 },
      source: { type: 'rect', fill: '#334455' },
    }])]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'bar')!;
    const store = createRenderStore([entity]);
    const layer = new AggregateMeshLayer({ chunkSize: 8 });
    layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1, 0, false, false),
    });
    const changed = layer.sync(store, {
      changedRanges: [{ start: 0, end: 1 }],
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 2, 90, true, false),
    });

    expect(changed.uploadedChunks).toBe(1);
    expect(changed.geometrySlotsVisited).toBe(1);
    layer.destroy();
  });

  it('limits a projection-transform-only Mesh sync to upright bar slots', () => {
    const parsed = parsePatchMapV010([item('upright-mixed', 'upright', [
      {
        type: 'bar',
        id: 'upright-level',
        size: { width: 16, height: 6 },
        source: { type: 'rect', fill: '#334455' },
      },
      {
        type: 'text',
        id: 'upright-label',
        text: '42',
        style: { fontSize: 10 },
      },
    ])]);
    const entities = parsed.document.entities.filter((candidate) =>
      candidate.kind === 'bar' || candidate.kind === 'text'
    );
    const store = createRenderStore(entities);
    const layer = new AggregateMeshLayer({ chunkSize: 8 });
    layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1, 0, false, false),
    });
    const changed = layer.sync(store, {
      changedRanges: [{ start: 0, end: store.capacity }],
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 2, 90, true, false),
      projectionTransformOnly: true,
    });

    expect(entities.map(({ kind }) => kind)).toEqual(['bar', 'text']);
    expect(changed.uploadedChunks).toBe(1);
    expect(changed.geometrySlotsVisited).toBe(1);
    layer.destroy();
  });

  it('uploads direct dense bar geometry while its parser projection is stale', () => {
    const parsed = parsePatchMapV010([item('direct-meter', 'follow-item', [{
      type: 'bar',
      id: 'direct-level',
      size: { width: 16, height: 8 },
      source: { type: 'rect', fill: '#334455' },
    }])]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'bar')!;
    const store = createRenderStore([entity]);
    const layer = new AggregateMeshLayer({ chunkSize: 8 });
    layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1, 0, false, false),
    });

    const mutableHeight = store.height as Float64Array;
    mutableHeight[0] = (mutableHeight[0] ?? 0) / 2;
    const staleContext = Object.freeze({
      ...projectionContext(parsed.projection, 2, 0, false, false),
      staleEntityIds: new Set([entity.id]),
    });
    const changed = layer.sync(store, {
      changedRanges: [{ start: 0, end: 1 }],
      fullRebuildEpoch: 1,
      projectionContext: staleContext,
    });

    expect(resolvePatchMapSlotQuad(store, 0, staleContext).projection).toBeNull();
    expect(changed.uploadedChunks).toBe(1);
    expect(changed.uploadedBytes).toBeGreaterThan(0);
    expect(changed.geometrySlotsVisited).toBe(1);
    layer.destroy();
  });

  it('applies signed follow basis and readable upright basis to Sprite/Text leaves', async () => {
    const parsed = parsePatchMapV010([
      item('follow-icon-item', 'follow-item', [{
        type: 'icon',
        id: 'follow-icon',
        source: 'missing-icon',
        size: 10,
      }], { angle: 37, scaleX: -1, scaleY: 1 }),
      item('upright-text-item', 'upright', [{
        type: 'text',
        id: 'upright-text',
        text: '42',
        style: { fontSize: 10 },
      }]),
    ]);
    const entities = parsed.document.entities.filter((entity) =>
      entity.kind === 'image' || entity.kind === 'text'
    );
    const store = createRenderStore(entities);
    const context = projectionContext(parsed.projection, 1, 90, true, false);
    const layer = new AggregateLeafLayer();
    layer.sync(store, { fullRebuildEpoch: 1, projectionContext: context });
    const imageSlot = entities.findIndex((entity) => entity.kind === 'image');
    const textSlot = entities.findIndex((entity) => entity.kind === 'text');
    const image = layer.contentAssetContainer.children[0]!;
    const text = layer.textContainer.children[0]!;

    expectBasisClose(displayBasis(image), resolvePatchMapSlotQuad(store, imageSlot, context).basis);
    expectBasisClose(displayBasis(text), resolvePatchMapSlotQuad(store, textSlot, context).basis);
    expectBasisClose(
      resolvePatchMapSlotQuad(store, textSlot, context).screenBasis,
      rotationBasis(270),
    );
    expect([text.position.x, text.position.y]).toEqual(
      resolvePatchMapSlotQuad(store, textSlot, context).center,
    );
    await layer.destroy();
  });

  it('repositions an existing upright Text leaf without rebuilding it', async () => {
    const parsed = parsePatchMapV010([item('upright-text-item', 'upright', [{
      type: 'text',
      id: 'upright-text',
      text: '42',
      style: { fontSize: 10 },
    }])]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'text');
    if (!entity) throw new Error('upright text entity was not projected');
    const store = createRenderStore([entity]);
    const layer = new AggregateLeafLayer();
    layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(parsed.projection, 1, 0, false, false),
    });
    const text = layer.textContainer.children[0];
    if (!text) throw new Error('upright text leaf was not rendered');
    const before = displayBasis(text);
    const nextContext = projectionContext(parsed.projection, 2, 90, true, false);

    layer.sync(store, {
      changedRanges: [{ start: 0, end: 1 }],
      fullRebuildEpoch: 1,
      projectionContext: nextContext,
      projectionTransformOnly: true,
    });

    expect(layer.textContainer.children[0]).toBe(text);
    expect(displayBasis(text)).not.toEqual(before);
    expectBasisClose(displayBasis(text), resolvePatchMapSlotQuad(store, 0, nextContext).basis);
    expect([text.position.x, text.position.y]).toEqual(
      resolvePatchMapSlotQuad(store, 0, nextContext).center,
    );
    await layer.destroy();
  });

  it('preserves the exact Leaf shear induced by nested non-uniform affine transforms', async () => {
    const parsed = parsePatchMapV010([{
      type: 'group',
      id: 'scaled-parent',
      attrs: { scaleX: 2, scaleY: 1 },
      children: [item('nested-icon-item', 'follow-item', [{
        type: 'icon',
        id: 'nested-icon',
        source: 'missing-icon',
        size: 10,
      }], { angle: 37 })],
    }]);
    const entity = parsed.document.entities.find((candidate) => candidate.kind === 'image');
    if (!entity) throw new Error('nested image entity was not projected');
    const store = createRenderStore([entity]);
    const context = projectionContext(parsed.projection, 1, 0, false, false);
    const expected = resolvePatchMapSlotQuad(store, 0, context).basis;
    const layer = new AggregateLeafLayer();
    layer.sync(store, { fullRebuildEpoch: 1, projectionContext: context });
    const image = layer.contentAssetContainer.children[0];

    if (!image) throw new Error('nested image leaf was not rendered');
    expect(Math.abs(expected[0] * expected[2] + expected[1] * expected[3])).toBeGreaterThan(0.1);
    expectBasisClose(displayBasis(image), expected);
    await layer.destroy();
  });
});

function item(
  id: string,
  contentOrientation: 'follow-item' | 'upright',
  components: readonly Record<string, unknown>[],
  attrs: Record<string, unknown> = {},
) {
  return {
    type: 'item',
    id,
    size: { width: 20, height: 20 },
    attrs: { x: 40, y: 30, ...attrs },
    contentOrientation,
    components,
  };
}

function projectionContext(
  index: PatchMapProjectionIndex,
  revision: number,
  rotationDegrees: number,
  flipX: boolean,
  flipY: boolean,
): PatchMapProjectionRenderContext {
  return Object.freeze({
    index,
    revision,
    world: Object.freeze({ rotationDegrees, flipX, flipY }),
  });
}

function createRenderStore(
  entities: readonly EntityInput[],
  override: { readonly value?: number } = {},
): RenderStoreView {
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
  const kind = Uint8Array.from(entities.map((entity) => ({
    rect: RenderKind.Rect,
    text: RenderKind.Text,
    image: RenderKind.Image,
    bar: RenderKind.Bar,
    relation: RenderKind.Relation,
  })[entity.kind]));
  return {
    capacity,
    liveCount: capacity,
    revision: 1,
    alive: Uint8Array.from({ length: capacity }, () => 1),
    kind,
    flags: Uint8Array.from(entities.map((entity) => entity.visible === false ? 0 : RenderFlags.Visible)),
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
    value: Float64Array.from(records.map((record) => override.value ?? Number(record.value ?? 0))),
    min: numbers('min'),
    max: numbers('max', 1),
    trackFill: packed('trackFill'),
    relationFrom: Int32Array.from({ length: capacity }, () => -1),
    relationTo: Int32Array.from({ length: capacity }, () => -1),
    lineWidth: numbers('lineWidth'),
    ids: entities.map((entity) => entity.id),
    view: { x: 0, y: 0, scale: 1, rotation: 0 },
    background: 0xffffffff,
    renderOrder: () => Uint32Array.from({ length: capacity }, (_, index) => index),
  };
}

function displayBasis(object: Readonly<{
  rotation: number;
  scale: Readonly<{ x: number; y: number }>;
  skew: Readonly<{ x: number; y: number }>;
}>): readonly number[] {
  const a = Math.cos(object.rotation + object.skew.y) * object.scale.x;
  const b = Math.sin(object.rotation + object.skew.y) * object.scale.x;
  const c = -Math.sin(object.rotation - object.skew.x) * object.scale.y;
  const d = Math.cos(object.rotation - object.skew.x) * object.scale.y;
  const xLength = Math.hypot(a, b);
  const yLength = Math.hypot(c, d);
  return [
    a / xLength,
    b / xLength,
    c / yLength,
    d / yLength,
  ];
}

function expectBasisClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 8));
}

function rotationBasis(angle: number): readonly number[] {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [cosine, sine, -sine, cosine];
}

function readableBottomPoint(
  quad: Readonly<{
    center: readonly [number, number];
    screenBasis: readonly [number, number, number, number];
    height: number;
  }>,
  world: ReturnType<typeof createPatchMapWorldAffine>,
): readonly [number, number] {
  const center = applyPatchMapAffine(world, quad.center);
  return [
    center[0] + quad.screenBasis[2] * quad.height / 2,
    center[1] + quad.screenBasis[3] * quad.height / 2,
  ];
}

function readableTopPoint(
  quad: Readonly<{
    center: readonly [number, number];
    screenBasis: readonly [number, number, number, number];
    height: number;
  }>,
  world: ReturnType<typeof createPatchMapWorldAffine>,
): readonly [number, number] {
  const center = applyPatchMapAffine(world, quad.center);
  return [
    center[0] - quad.screenBasis[2] * quad.height / 2,
    center[1] - quad.screenBasis[3] * quad.height / 2,
  ];
}
