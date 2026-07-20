import { describe, expect, it } from 'vitest';
import type { EntityInput } from '../../src/core-v1/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/core-v1/renderer/types';
import type { CoreV2ProjectionIndex } from '../../src/core-v2/contracts';
import { parsePatchMapV010 } from '../../src/core-v2/parser';
import { AggregateLeafLayer } from '../../src/core-v2/renderers/leaf-layer';
import {
  AggregateMeshLayer,
  buildAggregateChunkGeometry,
} from '../../src/core-v2/renderers/mesh-layer';
import {
  createCoreV2ResolvedRenderQuadScratch,
  resolveCoreV2SlotQuad,
  writeCoreV2SlotQuad,
  type CoreV2ProjectionRenderContext,
} from '../../src/core-v2/renderers/types';

describe('Core v2 orientation renderer lanes', () => {
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
    const scratch = createCoreV2ResolvedRenderQuadScratch();
    const center = scratch.center;
    const basis = scratch.basis;
    const vertices = scratch.vertices;

    expect(writeCoreV2SlotQuad(scratch, store, 0, context, 0.25)).toBe(scratch);
    const firstWidth = scratch.width;
    expect(writeCoreV2SlotQuad(scratch, store, 0, context, 0.75)).toBe(scratch);
    expect(scratch.center).toBe(center);
    expect(scratch.basis).toBe(basis);
    expect(scratch.vertices).toBe(vertices);
    expect(scratch.width).toBeCloseTo(firstWidth * 3, 8);
    expectBasisClose(scratch.basis, resolveCoreV2SlotQuad(store, 0, context, 0.75).basis);

    const denseStore = createRenderStore([{
      kind: 'rect',
      id: 'dense-fallback',
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      fill: 0xffffffff,
    }]);
    writeCoreV2SlotQuad(scratch, denseStore, 0, undefined, Number.NaN);
    expect(scratch.width).toBe(0);
    expect(scratch.vertices.every(Number.isFinite)).toBe(true);
    writeCoreV2SlotQuad(scratch, denseStore, 0, undefined, 2);
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
    const expectedTrack = resolveCoreV2SlotQuad(store, 0, context);
    const expectedFill = resolveCoreV2SlotQuad(store, 0, context, 0.5);

    expect([...track.positions]).toEqual(expectedTrack.vertices.map(Math.fround));
    expect([...fill.positions]).toEqual(expectedFill.vertices.map(Math.fround));
    expect(expectedFill.center).not.toEqual(expectedTrack.center);
  });

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

  it('applies signed follow basis and upright counter-basis to Sprite/Text leaves', async () => {
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
    const image = layer.imageContainer.children[0]!;
    const text = layer.textContainer.children[0]!;

    expectBasisClose(displayBasis(image), resolveCoreV2SlotQuad(store, imageSlot, context).basis);
    expectBasisClose(displayBasis(text), resolveCoreV2SlotQuad(store, textSlot, context).basis);
    expect(resolveCoreV2SlotQuad(store, textSlot, context).screenBasis).toEqual([1, 0, 0, 1]);
    expect([text.position.x, text.position.y]).toEqual(
      resolveCoreV2SlotQuad(store, textSlot, context).center,
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
    const expected = resolveCoreV2SlotQuad(store, 0, context).basis;
    const layer = new AggregateLeafLayer();
    layer.sync(store, { fullRebuildEpoch: 1, projectionContext: context });
    const image = layer.imageContainer.children[0];

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
  index: CoreV2ProjectionIndex,
  revision: number,
  rotationDegrees: number,
  flipX: boolean,
  flipY: boolean,
): CoreV2ProjectionRenderContext {
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
