import { describe, expect, it } from 'vitest';

import type { RenderStoreView } from '../../src/core-v1/renderer/types';
import { RenderFlags, RenderKind } from '../../src/core-v1/renderer/types';
import {
  AggregateMeshLayer,
  buildAggregateChunkGeometry,
  buildLineGeometry,
  buildQuadGeometry,
  dirtyChunkIndices,
  packedRgbaToMeshStyle,
} from '../../src/core-v2/renderers/mesh-layer';

describe('aggregate mesh geometry builders', () => {
  it('converts packed 0xRRGGBBAA into a Pixi tint and composed alpha', () => {
    expect(packedRgbaToMeshStyle(0x12345680, 0.5)).toEqual({
      tint: 0x123456,
      alpha: (0x80 / 0xff) * 0.5,
    });
    expect(packedRgbaToMeshStyle(0xffeedd00, 1)).toEqual({
      tint: 0xffeedd,
      alpha: 0,
    });
  });

  it('builds top-left quads and rotates them around the entity center', () => {
    const geometry = buildQuadGeometry([
      { x: 10, y: 20, width: 4, height: 2 },
      { x: 10, y: 20, width: 4, height: 2, rotation: 90 },
    ]);

    expect(geometry.primitiveCount).toBe(2);
    expect([...geometry.positions.slice(0, 8)]).toEqual([
      10, 20, 14, 20, 14, 22, 10, 22,
    ]);
    const rotated = [...geometry.positions.slice(8)];
    expect(rotated[0]).toBeCloseTo(13);
    expect(rotated[1]).toBeCloseTo(19);
    expect(rotated[2]).toBeCloseTo(13);
    expect(rotated[3]).toBeCloseTo(23);
    expect(rotated[4]).toBeCloseTo(11);
    expect(rotated[5]).toBeCloseTo(23);
    expect(rotated[6]).toBeCloseTo(11);
    expect(rotated[7]).toBeCloseTo(19);
    expect([...geometry.indices.slice(0, 6)]).toEqual([0, 1, 2, 0, 2, 3]);
    expect(geometry.byteLength).toBe(
      geometry.positions.byteLength + geometry.uvs.byteLength + geometry.indices.byteLength,
    );
  });

  it('builds relation widths as butt-capped triangle quads', () => {
    const geometry = buildLineGeometry([
      { fromX: 5, fromY: 5, toX: 105, toY: 5, width: 2 },
    ]);

    expect(geometry.primitiveCount).toBe(1);
    expect([...geometry.positions]).toEqual([5, 6, 105, 6, 105, 4, 5, 4]);
    expect([...geometry.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('maps exclusive dirty ranges to stable fixed-capacity chunks', () => {
    expect(
      dirtyChunkIndices(512, 256, [
        { start: 1, end: 3 },
        { start: 255, end: 261 },
        { start: 512, end: 520 },
      ]),
    ).toEqual([0, 1]);
  });

  it('aggregates visible rect/bar fills and relation endpoint geometry', () => {
    const store = createStore();
    const built = buildAggregateChunkGeometry(store, 0, store.capacity);

    expect(built.visibleQuads).toBe(3);
    expect(built.visibleRelations).toBe(1);
    expect(built.quadGroups).toHaveLength(3);
    expect(built.relationGroups).toHaveLength(1);

    const barFill = built.quadGroups.find((group) => group.tint === 0x00cc66);
    expect(barFill?.primitiveCount).toBe(1);
    expect([...(barFill?.positions ?? [])]).toEqual([
      20, 10, 30, 10, 30, 18, 20, 18,
    ]);
    expect([...built.relationGroups[0]!.positions]).toEqual([
      5, 6, 105, 6, 105, 4, 5, 4,
    ]);
  });
});

describe('AggregateMeshLayer', () => {
  it('updates only dirty chunks, exposes world transforms, and prunes empty chunks', () => {
    const store = createStore();
    const layer = new AggregateMeshLayer({ chunkSize: 2, label: 'mesh spike' });

    const initial = layer.sync(store, { fullRebuildEpoch: 1 });
    expect(initial.chunkCount).toBe(2);
    expect(initial.visibleQuads).toBe(3);
    expect(initial.visibleRelations).toBe(1);
    expect(initial.uploadedChunks).toBe(2);
    expect(initial.uploadedBytes).toBeGreaterThan(0);
    expect(layer.container.label).toContain('meshes');

    expect(layer.setView({ x: 12, y: -4, scale: 2, rotation: 15 })).toBe(true);
    expect(layer.container.position.x).toBe(12);
    expect(layer.container.position.y).toBe(-4);
    expect(layer.container.scale.x).toBe(2);
    expect(layer.container.angle).toBeCloseTo(15);

    expect(layer.sync(store, { changedRanges: [] }).uploadedChunks).toBe(0);

    (store.alive as Uint8Array)[2] = 0;
    (store.alive as Uint8Array)[3] = 0;
    const pruned = layer.sync(store, { changedRanges: [{ start: 2, end: 4 }] });
    expect(pruned.chunkCount).toBe(1);
    expect(pruned.visibleRelations).toBe(0);
    expect(pruned.uploadedChunks).toBe(1);

    expect(layer.destroy()).toBe(true);
    expect(layer.destroy()).toBe(false);
    expect(() => layer.sync(store)).toThrow('AggregateMeshLayer is destroyed');
  });
});

function createStore(): RenderStoreView {
  const capacity = 4;
  const zeros = (): Float64Array => new Float64Array(capacity);
  return {
    capacity,
    liveCount: capacity,
    revision: 1,
    alive: Uint8Array.from([1, 1, 1, 1]),
    kind: Uint8Array.from([
      RenderKind.Rect,
      RenderKind.Bar,
      RenderKind.Rect,
      RenderKind.Relation,
    ]),
    flags: Uint8Array.from([
      RenderFlags.Visible,
      RenderFlags.Visible,
      0,
      RenderFlags.Visible,
    ]),
    zIndex: Int32Array.from([0, 1, 0, 2]),
    x: Float32Array.from([0, 20, 100, 0]),
    y: Float32Array.from([0, 10, 0, 0]),
    width: Float32Array.from([10, 40, 10, 0]),
    height: Float32Array.from([10, 8, 10, 0]),
    rotation: zeros(),
    opacity: Float32Array.from([1, 1, 1, 1]),
    fill: Uint32Array.from([0xff0000ff, 0x00cc66ff, 0x0000ffff, 0]),
    stroke: new Uint32Array(capacity),
    strokeWidth: zeros(),
    radius: zeros(),
    text: ['', '', '', ''],
    color: Uint32Array.from([0, 0, 0, 0x334455ff]),
    fontSize: zeros(),
    fontFamily: ['', '', '', ''],
    fontWeight: new Uint16Array(capacity),
    align: new Uint8Array(capacity),
    maxLines: new Uint16Array(capacity),
    source: ['', '', '', ''],
    tint: new Uint32Array(capacity),
    fit: new Uint8Array(capacity),
    value: Float32Array.from([0, 25, 0, 0]),
    min: zeros(),
    max: Float32Array.from([1, 100, 1, 1]),
    trackFill: Uint32Array.from([0, 0xddeeffff, 0, 0]),
    relationFrom: Int32Array.from([-1, -1, -1, 0]),
    relationTo: Int32Array.from([-1, -1, -1, 2]),
    lineWidth: Float32Array.from([0, 0, 0, 2]),
    ids: ['rect', 'bar', 'hidden-endpoint', 'relation'],
    view: { x: 0, y: 0, scale: 1 },
    background: 0xffffffff,
    renderOrder: () => Uint32Array.from([0, 2, 1, 3]),
  };
}
