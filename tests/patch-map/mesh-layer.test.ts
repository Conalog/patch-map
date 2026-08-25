import { describe, expect, it } from 'vitest';

import { createTestProjectionIndex } from './support/projection-index';
import { Graphics, Matrix, Mesh } from 'pixi.js';
import type { MeshGeometry } from 'pixi.js';

import type { RenderStoreView } from '../../src/patch-map/dense/renderer-types';
import { RenderFlags, RenderKind } from '../../src/patch-map/dense/renderer-types';
import type { PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import { createPatchMapAffine } from '../../src/patch-map/semantic/geometry';
import type { PatchMapProjectionRenderContext } from '../../src/patch-map/renderers/types';
import { expandPatchMapRelationDependencyRanges } from '../../src/patch-map/renderers/pixi-renderer';
import {
  AggregateMeshLayer,
  buildAggregateChunkGeometry,
  buildLineGeometry,
  buildQuadGeometry,
  dirtyChunkIndices,
  packedRgbaToMeshStyle,
} from '../../src/patch-map/renderers/mesh-layer';
import { PatchMapPresentationStoreView } from '../../src/patch-map/renderers/presentation-store';

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

  it('lets a transient presentation fill override win over authored background projection paint', () => {
    const base = createStore();
    const view = new PatchMapPresentationStoreView(base, Object.freeze({
      revision: 1,
      highlightedEntityIds: null,
      deEmphasisAlpha: 0.2,
      hiddenEntityIds: Object.freeze([]),
      fillOverrides: Object.freeze([
        Object.freeze({ id: 'rect', packedColor: 0x00aa66ff }),
      ]),
    }));
    const projection: PatchMapProjectionIndex = createTestProjectionIndex({
      byEntityId: Object.freeze({}),
      componentsByEntityId: Object.freeze({
        rect: Object.freeze({
          entityId: 'rect',
          ownerId: 'item-a',
          componentId: 'bg',
          componentType: 'background',
          logicalIdentity: 'item-a::background:bg',
          renderRole: 'background-geometry',
        }),
      }),
      backgroundsByEntityId: Object.freeze({
        rect: Object.freeze({
          entityId: 'rect',
          sourceKind: 'rect',
          fill: 0xff0000ff,
          borderWidth: 0,
          borderColor: 0x00000000,
          radius: Object.freeze([0, 0, 0, 0] as const),
          tint: 0xffffffff,
        }),
      }),
    });
    const context: PatchMapProjectionRenderContext = Object.freeze({
      index: projection,
      revision: 1,
      world: Object.freeze({ rotationDegrees: 0, flipX: false, flipY: false }),
    });

    const built = buildAggregateChunkGeometry(view, 0, view.capacity, context);

    expect(built.quadGroups.find(({ tint }) => tint === 0x00aa66)?.primitiveCount).toBe(1);
    expect(built.quadGroups.some(({ tint }) => tint === 0xff0000)).toBe(false);
    expect(base.fill[0]).not.toBe(0x00aa66ff);
  });

  it('expands one logical self relation into four aggregate Mesh segments', () => {
    const store = createStore();
    (store.relationTo as Int32Array)[3] = 0;
    const projection: PatchMapProjectionIndex = createTestProjectionIndex({
      byEntityId: Object.freeze({}),
      relationsByEntityId: Object.freeze({
        relation: Object.freeze({
          entityId: 'relation',
          relationId: 'links',
          sourceId: 'rect',
          targetId: 'rect',
          key: 'rect>rect',
          identityKey: '4:rect4:rect',
          authoredIndex: 0,
          affine: createPatchMapAffine(),
        }),
      }),
      omittedRelations: Object.freeze([]),
    });
    const context: PatchMapProjectionRenderContext = Object.freeze({
      index: projection,
      revision: 1,
      world: Object.freeze({ rotationDegrees: 0, flipX: false, flipY: false }),
    });
    const built = buildAggregateChunkGeometry(store, 0, store.capacity, context);

    expect(built.visibleRelations).toBe(1);
    expect(built.relationGroups).toHaveLength(1);
    expect(built.relationGroups[0]?.primitiveCount).toBe(4);
    expect(built.relationGroups[0]?.positions).toHaveLength(32);

    (store.flags as Uint8Array)[0] = 0;
    const hidden = buildAggregateChunkGeometry(store, 0, store.capacity, context);
    expect(hidden.visibleRelations).toBe(0);
    expect(hidden.relationGroups).toHaveLength(0);
  });

  it('uses relation-affine normal scale for aggregate Mesh stroke width', () => {
    const store = createStore();
    (store.flags as Uint8Array)[2] = RenderFlags.Visible;
    const projection: PatchMapProjectionIndex = createTestProjectionIndex({
      byEntityId: Object.freeze({}),
      relationsByEntityId: Object.freeze({
        relation: Object.freeze({
          entityId: 'relation',
          relationId: 'links',
          sourceId: 'rect',
          targetId: 'hidden-endpoint',
          key: 'rect>hidden-endpoint',
          identityKey: '4:rect15:hidden-endpoint',
          authoredIndex: 0,
          affine: createPatchMapAffine(0, 0, 0, 2, 3),
        }),
      }),
    });
    const context: PatchMapProjectionRenderContext = Object.freeze({
      index: projection,
      revision: 1,
      world: Object.freeze({ rotationDegrees: 0, flipX: false, flipY: false }),
    });
    const built = buildAggregateChunkGeometry(store, 0, store.capacity, context);
    expect([...(built.relationGroups[0]?.positions ?? [])]).toEqual([
      5, 8, 105, 8, 105, 2, 5, 2,
    ]);
  });
});

describe('AggregateMeshLayer', () => {
  it('renders rounded and stroked standalone rects through one aggregate Graphics lane', () => {
    const store = createStore();
    (store.stroke as Uint32Array)[0] = 0x331100ff;
    (store.strokeWidth as Float64Array)[0] = 3;
    (store.radius as Float64Array)[0] = 5;
    const layer = new AggregateMeshLayer({ chunkSize: 4, label: 'styled rects' });

    const initial = layer.sync(store, { fullRebuildEpoch: 1 });
    expect(initial.ordinaryGraphicsObjectCount).toBe(1);
    expect(layer.entityPaintProbe('rect')).toMatchObject({
      lane: 'ordinary-geometry',
      rendererKind: 'graphics',
      primitiveCount: 1,
    });
    const styled = layer.ordinaryGeometryContainer.children.find(
      (child): child is Graphics => (
        child instanceof Graphics && child.label.includes('styled rect chunk 0')
      ),
    );
    expect(styled).toBeDefined();

    (store.strokeWidth as Float64Array)[0] = 0;
    (store.radius as Float64Array)[0] = 0;
    (store as { revision: number }).revision = 2;
    const square = layer.sync(store, { changedRanges: [{ start: 0, end: 1 }] });
    expect(square.ordinaryGraphicsObjectCount).toBe(0);
    expect(layer.entityPaintProbe('rect')).toMatchObject({ rendererKind: 'mesh' });
    expect(styled?.destroyed).toBe(true);
    layer.destroy();
  });

  it('culls geometry chunks from retained bounds while preserving spanning relations', () => {
    const store = createStore();
    (store.flags as Uint8Array)[2] = RenderFlags.Visible;
    const layer = new AggregateMeshLayer({ chunkSize: 2, label: 'viewport chunks' });
    layer.sync(store, { fullRebuildEpoch: 1 });
    const firstRect = layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 0')
    );
    const secondRect = layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 1')
    );
    if (firstRect === undefined || secondRect === undefined) {
      throw new Error('expected two retained rect chunks');
    }

    expect(layer.cull(new Matrix(), 70, 40, 0)).toBe(1);
    expect(firstRect.visible).toBe(true);
    expect(firstRect.parent).toBe(layer.ordinaryGeometryContainer);
    expect(secondRect.visible).toBe(false);
    expect(secondRect.parent).toBeNull();
    expect(
      layer.relationsDynamicContainer.children.find(
        (child) => child.label.includes(': relation chunk 1'),
      )?.visible,
    ).toBe(true);

    expect(layer.cull(new Matrix(1, 0, 0, 1, -80, 0), 70, 40, 0)).toBe(1);
    expect(firstRect.visible).toBe(false);
    expect(firstRect.parent).toBeNull();
    expect(secondRect.visible).toBe(true);
    expect(secondRect.parent).toBe(layer.ordinaryGeometryContainer);
    layer.destroy();
  });

  it('switches between precise idle records and coarse animation chunks', () => {
    const store = createBarChunkStore();
    const layer = new AggregateMeshLayer({ chunkSize: 4, label: 'adaptive chunks' });
    layer.sync(store, { fullRebuildEpoch: 1 });
    const barMeshes = layer.relationsDynamicContainer.children.filter(
      (child): child is Mesh<MeshGeometry> =>
        child instanceof Mesh && child.label.includes(': bar chunk 0'),
    );
    const minimumX = (mesh: Mesh<MeshGeometry>): number => Math.min(
      ...mesh.geometry.positions.filter((_value, index) => index % 2 === 0),
    );
    const firstBar = barMeshes.find((mesh) => minimumX(mesh) < 20);
    const distantBar = barMeshes.find((mesh) => minimumX(mesh) >= 200);
    if (firstBar === undefined || distantBar === undefined) {
      throw new Error('expected near and distant bar records in one chunk');
    }

    expect(layer.preciseViewportCull).toBe(true);
    expect(layer.cull(new Matrix(), 70, 40, 0, true)).toBe(1);
    expect(layer.preciseViewportCull).toBe(true);
    expect(firstBar.parent).toBe(layer.relationsDynamicContainer);
    expect(distantBar.parent).toBeNull();

    expect(layer.cull(new Matrix(), 70, 40, 0, false)).toBe(1);
    expect(layer.preciseViewportCull).toBe(false);
    expect(firstBar.parent).toBe(layer.relationsDynamicContainer);
    expect(distantBar.parent).toBe(layer.relationsDynamicContainer);
    expect([...layer.barPresentationVisibility()!.visibleChunks.slice(0, 1)])
      .toEqual([1]);
    expect([...layer.barPresentationVisibility()!.visibleSlots.slice(0, 4)])
      .toEqual([1, 1, 0, 0]);
    layer.destroy();
  });

  it('shrinks retained chunk bounds after bars move away from an old viewport', () => {
    const store = createBarChunkStore();
    const layer = new AggregateMeshLayer({ chunkSize: 2, label: 'moving chunk bounds' });
    layer.sync(store, { fullRebuildEpoch: 1 });
    const oldViewport = new Matrix(1, 0, 0, 1, -190, 0);

    expect(layer.cull(oldViewport, 70, 40, 0, false)).toBe(1);

    (store.x as Float32Array).set([20, 40], 2);
    (store as { revision: number }).revision = 2;
    layer.sync(store, { changedRanges: [{ start: 2, end: 4 }] });

    expect(layer.cull(oldViewport, 70, 40, 0, false)).toBe(0);
    layer.destroy();
  });

  it('defers offscreen bar uploads and catches up before a chunk becomes visible', () => {
    const store = createBarChunkStore();
    const layer = new AggregateMeshLayer({ chunkSize: 2, label: 'deferred bars' });
    layer.sync(store, { fullRebuildEpoch: 1 });
    expect(layer.cull(new Matrix(), 80, 40, 0)).toBe(1);
    expect([...layer.barPresentationVisibility()!.visibleChunks.slice(0, 2)])
      .toEqual([1, 0]);
    expect([...layer.barPresentationVisibility()!.visibleSlots.slice(0, 4)])
      .toEqual([1, 1, 0, 0]);

    (store.value as Float32Array).set([80, 70, 60, 50]);
    (store as { revision: number }).revision = 2;
    const visibleOnly = layer.sync(store, {
      changedRanges: [{ start: 0, end: store.capacity }],
    });
    expect(visibleOnly.uploadedChunks).toBe(1);
    expect(visibleOnly.geometrySlotsVisited).toBe(2);
    expect(layer.hasVisibleDeferredBarUpdates()).toBe(false);

    expect(layer.cull(new Matrix(1, 0, 0, 1, -180, 0), 80, 40, 0)).toBe(1);
    expect([...layer.barPresentationVisibility()!.visibleChunks.slice(0, 2)])
      .toEqual([0, 1]);
    expect([...layer.barPresentationVisibility()!.visibleSlots.slice(0, 4)])
      .toEqual([0, 0, 1, 1]);
    expect(layer.hasVisibleDeferredBarUpdates()).toBe(true);
    const caughtUp = layer.sync(store, { changedRanges: [] });
    expect(caughtUp.uploadedChunks).toBe(1);
    expect(caughtUp.geometrySlotsVisited).toBe(2);
    expect(layer.hasVisibleDeferredBarUpdates()).toBe(false);
    layer.destroy();
  });

  it('expands endpoint-only dirtiness to a relation in another Mesh chunk', () => {
    const store = createStore();
    (store.flags as Uint8Array)[2] = RenderFlags.Visible;
    const projection: PatchMapProjectionIndex = createTestProjectionIndex({
      byEntityId: Object.freeze({}),
      relationsByEntityId: Object.freeze({
        relation: Object.freeze({
          entityId: 'relation',
          relationId: 'links',
          sourceId: 'rect',
          targetId: 'hidden-endpoint',
          key: 'rect>hidden-endpoint',
          identityKey: '4:rect15:hidden-endpoint',
          authoredIndex: 0,
          affine: createPatchMapAffine(),
        }),
      }),
      omittedRelations: Object.freeze([]),
    });
    const context: PatchMapProjectionRenderContext = Object.freeze({
      index: projection,
      revision: 1,
      world: Object.freeze({ rotationDegrees: 0, flipX: false, flipY: false }),
    });
    const layer = new AggregateMeshLayer({ chunkSize: 2, label: 'cross chunk relations' });
    expect(layer.sync(store, { fullRebuildEpoch: 1, projectionContext: context }).visibleRelations).toBe(1);

    (store.flags as Uint8Array)[0] = 0;
    (store as { revision: number }).revision = 2;
    const expanded = expandPatchMapRelationDependencyRanges(store, [{ start: 0, end: 1 }]);
    expect(expanded).toEqual([{ start: 0, end: 1 }, { start: 3, end: 4 }]);
    const hidden = layer.sync(store, { changedRanges: expanded, projectionContext: context });
    expect(hidden.visibleRelations).toBe(0);
    expect(hidden.uploadedChunks).toBe(2);
    expect(
      layer.relationsDynamicContainer.children.filter((child) =>
        child.label.includes(': relation chunk')
      ),
    ).toHaveLength(0);
    layer.destroy();
  });

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

  it('visits and updates only bar slots in a non-bar-heavy dirty chunk', () => {
    const store = createStore();
    const layer = new AggregateMeshLayer({ chunkSize: 4, label: 'mesh fast path' });
    const initial = layer.sync(store, { fullRebuildEpoch: 1 });
    const rectCandidate = layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 0'),
    );
    const barsBefore = layer.relationsDynamicContainer.children.filter(
      (child): child is Mesh<MeshGeometry> =>
        child instanceof Mesh && child.label.includes(': bar chunk 0'),
    );
    expect(barsBefore.every((mesh) => mesh.geometry.batchMode === 'auto')).toBe(true);
    const relationCandidate = layer.relationsDynamicContainer.children.find((child) =>
      child.label.includes(': relation chunk 0'),
    );
    if (!(rectCandidate instanceof Mesh) || !(relationCandidate instanceof Mesh)) {
      throw new Error('expected rect and relation mesh records');
    }
    const rectBefore = rectCandidate as Mesh<MeshGeometry>;
    const relationBefore = relationCandidate as Mesh<MeshGeometry>;
    const rectPositionsBefore = [...rectBefore.geometry.positions];
    const barPositionsBefore = barsBefore.map((mesh) => [...mesh.geometry.positions]);
    const barUvsBefore = barsBefore.map((mesh) => mesh.geometry.uvs);
    const barIndicesBefore = barsBefore.map((mesh) => mesh.geometry.indices);

    (store.value as Float32Array)[1] = 75;
    (store as { revision: number }).revision = 2;
    const updated = layer.sync(store, { changedRanges: [{ start: 1, end: 2 }] });

    const rectAfter = layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 0'),
    );
    const barsAfter = layer.relationsDynamicContainer.children.filter(
      (child): child is Mesh<MeshGeometry> =>
        child instanceof Mesh && child.label.includes(': bar chunk 0'),
    );
    const relationAfter = layer.relationsDynamicContainer.children.find((child) =>
      child.label.includes(': relation chunk 0'),
    );

    expect(updated.uploadedChunks).toBe(1);
    expect(updated.uploadedBytes).toBeGreaterThan(0);
    expect(updated.geometrySlotsVisited).toBe(1);
    expect(updated.geometrySlotsVisited).toBeLessThan(layer.chunkSize);
    expect(updated.meshCount).toBe(initial.meshCount);
    expect(updated.visibleQuads).toBe(initial.visibleQuads);
    expect(updated.visibleRelations).toBe(initial.visibleRelations);
    expect(rectAfter).toBe(rectBefore);
    expect(relationAfter).toBe(relationBefore);
    expect([...rectBefore.geometry.positions]).toEqual(rectPositionsBefore);
    expect(barsAfter).toHaveLength(barsBefore.length);
    expect(barsAfter.every((mesh) => barsBefore.includes(mesh))).toBe(true);
    expect(barsAfter.map((mesh) => mesh.geometry.uvs)).toEqual(barUvsBefore);
    expect(barsAfter.map((mesh) => mesh.geometry.indices)).toEqual(barIndicesBefore);
    expect(
      barsAfter.some((mesh, meshIndex) =>
        [...mesh.geometry.positions].some(
          (value, positionIndex) =>
            value !== barPositionsBefore[meshIndex]?.[positionIndex],
        ),
      ),
    ).toBe(true);

    const fillBefore = barsAfter.find((mesh) => mesh.zIndex === 6);
    if (fillBefore === undefined) throw new Error('expected initial bar fill mesh');
    (store.fill as Uint32Array)[1] = 0x8844ccff;
    (store as { revision: number }).revision = 3;
    const styleUpdated = layer.sync(store, { changedRanges: [{ start: 1, end: 2 }] });
    const fillAfter = layer.relationsDynamicContainer.children.find(
      (child) => child instanceof Mesh && child.zIndex === 6,
    );
    expect(styleUpdated.geometrySlotsVisited).toBe(1);
    expect(fillAfter).not.toBe(fillBefore);
    expect(fillBefore.destroyed).toBe(true);
    expect(
      layer.ordinaryGeometryContainer.children.find((child) =>
        child.label.includes(': rect chunk 0'),
      ),
    ).toBe(rectBefore);
    expect(
      layer.relationsDynamicContainer.children.find((child) =>
        child.label.includes(': relation chunk 0'),
      ),
    ).toBe(relationBefore);

    const barFlags = (store.flags as Uint8Array)[1] as number;
    (store.flags as Uint8Array)[1] = barFlags & ~RenderFlags.Visible;
    (store as { revision: number }).revision = 4;
    const hidden = layer.sync(store, { changedRanges: [{ start: 1, end: 2 }] });
    expect(hidden.geometrySlotsVisited).toBe(1);
    expect(layer.entityPaintProbe('bar')).toMatchObject({
      rendererKind: 'none',
      primitiveCount: 0,
      renderObjectCount: 0,
    });

    (store.flags as Uint8Array)[1] = barFlags;
    (store as { revision: number }).revision = 5;
    const shown = layer.sync(store, { changedRanges: [{ start: 1, end: 2 }] });
    expect(shown.geometrySlotsVisited).toBe(1);
    expect(layer.entityPaintProbe('bar')).toMatchObject({
      rendererKind: 'mesh',
      primitiveCount: 2,
      renderObjectCount: 0,
    });

    (store.value as Float32Array)[1] = 25;
    (store as { revision: number }).revision = 6;
    const forcedFull = layer.sync(store, {
      changedRanges: [{ start: 1, end: 2 }],
      force: true,
    });
    expect(updated.uploadedBytes).toBe(32);
    expect(forcedFull.uploadedBytes).toBe(128);
    expect(updated.uploadedBytes).toBeLessThan(forcedFull.uploadedBytes);

    layer.destroy();
  });

  it('keeps rounded bars on the aggregate Mesh hot path', () => {
    const store = createStore();
    (store.radius as Float64Array)[1] = 4;
    const layer = new AggregateMeshLayer({ chunkSize: 4, label: 'rounded bars' });

    const initial = layer.sync(store, { fullRebuildEpoch: 1 });
    const rounded = layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Graphics && child.label.includes(': styled bar chunk 0'),
    );
    const roundedMeshes = layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Mesh && child.label.includes(': bar chunk 0'),
    ) as Mesh<MeshGeometry>[];
    expect(rounded).toHaveLength(0);
    expect(roundedMeshes).toHaveLength(2);
    expect(roundedMeshes.every((mesh) =>
      mesh.geometry.positions.length > 8 &&
      mesh.geometry.indices.length > 6
    )).toBe(true);
    expect(initial.uploadedBytes).toBeGreaterThan(0);
    expect(initial.visibleQuads).toBe(3);
    expect(layer.entityPaintProbe('bar')).toMatchObject({
      rendererKind: 'mesh',
      primitiveCount: 2,
      renderObjectCount: 0,
    });
    const trackBefore = roundedMeshes.find((mesh) => mesh.zIndex === 5);
    const fillBefore = roundedMeshes.find((mesh) => mesh.zIndex === 6);
    if (trackBefore === undefined || fillBefore === undefined) {
      throw new Error('expected rounded track and fill meshes');
    }
    const trackPositionsBefore = [...trackBefore.geometry.positions];
    const fillPositionsBefore = [...fillBefore.geometry.positions];
    const fillUvsBefore = fillBefore.geometry.uvs;
    const fillIndicesBefore = fillBefore.geometry.indices;

    (store.value as Float32Array)[1] = 75;
    (store as { revision: number }).revision = 2;
    const animated = layer.sync(store, { changedRanges: [{ start: 1, end: 2 }] });
    const roundedMeshesAfter = layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Mesh && child.label.includes(': bar chunk 0'),
    ) as Mesh<MeshGeometry>[];
    const freshFill = buildAggregateChunkGeometry(
      store,
      0,
      store.capacity,
    ).quadGroups.find((group) => group.tint === 0x00cc66);
    expect(animated.geometrySlotsVisited).toBe(1);
    expect(animated.uploadedBytes).toBe(fillBefore.geometry.positions.byteLength);
    expect(animated.uploadedBytes).toBe(168);
    expect(roundedMeshesAfter).toEqual(roundedMeshes);
    expect([...trackBefore.geometry.positions]).toEqual(trackPositionsBefore);
    expect([...fillBefore.geometry.positions]).not.toEqual(fillPositionsBefore);
    expect(fillBefore.geometry.uvs).toBe(fillUvsBefore);
    expect(fillBefore.geometry.indices).toBe(fillIndicesBefore);
    expect([...fillBefore.geometry.positions]).toEqual([...(freshFill?.positions ?? [])]);
    expect(layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Graphics && child.label.includes(': styled bar chunk 0'),
    )).toHaveLength(0);

    (store.radius as Float64Array)[1] = 0;
    (store as { revision: number }).revision = 3;
    layer.sync(store, { changedRanges: [{ start: 1, end: 2 }] });
    expect(roundedMeshes.every((mesh) => mesh.destroyed)).toBe(true);
    expect(layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Graphics && child.label.includes(': styled bar chunk 0'),
    )).toHaveLength(0);
    expect(layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Mesh && child.label.includes(': bar chunk 0'),
    )).toHaveLength(2);
    expect(layer.entityPaintProbe('bar')).toMatchObject({
      rendererKind: 'mesh',
      primitiveCount: 2,
    });

    layer.destroy();
    expect(roundedMeshes.every((mesh) => mesh.destroyed)).toBe(true);
  });

  it('updates one rounded primitive in a retained multi-bar style group', () => {
    const store = createBarChunkStore();
    (store.radius as Float64Array).fill(4);
    const layer = new AggregateMeshLayer({ chunkSize: 4, label: 'rounded group' });
    layer.sync(store, { fullRebuildEpoch: 1 });
    const meshes = layer.relationsDynamicContainer.children.filter(
      (child): child is Mesh<MeshGeometry> =>
        child instanceof Mesh && child.label.includes(': bar chunk 0'),
    );
    const fill = meshes.find((mesh) => mesh.zIndex === 2);
    if (fill === undefined) throw new Error('expected grouped rounded fill mesh');
    const fillPositionsBefore = [...fill.geometry.positions];

    (store.value as Float32Array)[2] = 85;
    (store as { revision: number }).revision = 2;
    const updated = layer.sync(store, { changedRanges: [{ start: 2, end: 3 }] });
    const freshFill = buildAggregateChunkGeometry(
      store,
      0,
      store.capacity,
    ).quadGroups.find((group) => group.tint === 0x00cc66);

    expect(updated.geometrySlotsVisited).toBe(1);
    expect(updated.uploadedBytes).toBe(fill.geometry.positions.byteLength);
    expect(layer.relationsDynamicContainer.children).toContain(fill);
    expect([...fill.geometry.positions]).not.toEqual(fillPositionsBefore);
    expect([...fill.geometry.positions]).toEqual([...(freshFill?.positions ?? [])]);
    layer.destroy();
  });

  it('keeps interleaved stable leaf presentation ranges out of aggregate rebuilds', () => {
    const store = createStore();
    (store.kind as Uint8Array)[2] = RenderKind.Image;
    (store.flags as Uint8Array)[2] = RenderFlags.Visible;
    const layer = new AggregateMeshLayer({ chunkSize: 4, label: 'mixed presentation' });
    layer.sync(store, { fullRebuildEpoch: 1 });
    const rectBefore = layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 0'),
    );
    const barsBefore = layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Mesh && child.label.includes(': bar chunk 0'),
    );

    (store.value as Float32Array)[1] = 75;
    (store.tint as Uint32Array)[2] = 0xef4444ff;
    (store as { revision: number }).revision = 2;
    const mixed = layer.sync(store, { changedRanges: [{ start: 1, end: 3 }] });

    expect(mixed.geometrySlotsVisited).toBe(1);
    expect(mixed.uploadedChunks).toBe(1);
    expect(layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 0'),
    )).toBe(rectBefore);
    expect(layer.relationsDynamicContainer.children.filter((child) =>
      child instanceof Mesh && child.label.includes(': bar chunk 0'),
    )).toEqual(barsBefore);

    (store.tint as Uint32Array)[2] = 0x22c55eff;
    (store as { revision: number }).revision = 3;
    const leafOnly = layer.sync(store, { changedRanges: [{ start: 2, end: 3 }] });

    expect(leafOnly.geometrySlotsVisited).toBe(0);
    expect(leafOnly.uploadedChunks).toBe(0);
    expect(leafOnly.uploadedBytes).toBe(0);
    layer.destroy();
  });

  it('takes the structural path when a non-bar slot is replaced by a bar', () => {
    const store = createStore();
    const layer = new AggregateMeshLayer({ chunkSize: 4, label: 'mesh replacement' });
    layer.sync(store, { fullRebuildEpoch: 1 });
    const rectBefore = layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 0'),
    );
    const relationBefore = layer.relationsDynamicContainer.children.find((child) =>
      child.label.includes(': relation chunk 0'),
    );
    if (!(rectBefore instanceof Mesh) || !(relationBefore instanceof Mesh)) {
      throw new Error('expected initial rect and relation mesh records');
    }

    // Model Core's same-ID remove -> add replacement: the stable slot is
    // immediately reused, so the renderer observes only the final Bar kind.
    (store.kind as Uint8Array)[0] = RenderKind.Bar;
    (store.trackFill as Uint32Array)[0] = 0x223344ff;
    (store.fill as Uint32Array)[0] = 0x556677ff;
    (store.value as Float32Array)[0] = 50;
    (store.min as Float64Array)[0] = 0;
    (store.max as Float32Array)[0] = 100;
    (store as { revision: number }).revision = 2;

    const updated = layer.sync(store, { changedRanges: [{ start: 0, end: 1 }] });
    const rectAfter = layer.ordinaryGeometryContainer.children.find((child) =>
      child.label.includes(': rect chunk 0'),
    );
    const relationAfter = layer.relationsDynamicContainer.children.find((child) =>
      child.label.includes(': relation chunk 0'),
    );
    const barsAfter = layer.relationsDynamicContainer.children.filter((child) =>
      child.label.includes(': bar chunk 0'),
    );

    expect(rectAfter).toBeUndefined();
    expect(rectBefore.destroyed).toBe(true);
    expect(relationAfter).toBe(relationBefore);
    expect(barsAfter).toHaveLength(4);
    expect(updated.visibleQuads).toBe(4);
    expect(updated.visibleRelations).toBe(1);

    layer.destroy();
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

function createBarChunkStore(): RenderStoreView {
  const store = createStore();
  return {
    ...store,
    kind: new Uint8Array(store.capacity).fill(RenderKind.Bar),
    flags: new Uint8Array(store.capacity).fill(RenderFlags.Visible),
    x: Float32Array.from([0, 20, 200, 220]),
    y: new Float32Array(store.capacity).fill(10),
    width: new Float32Array(store.capacity).fill(10),
    height: new Float32Array(store.capacity).fill(10),
    opacity: new Float32Array(store.capacity).fill(1),
    fill: new Uint32Array(store.capacity).fill(0x00cc66ff),
    value: Float32Array.from([10, 20, 30, 40]),
    min: new Float64Array(store.capacity),
    max: new Float32Array(store.capacity).fill(100),
    trackFill: new Uint32Array(store.capacity).fill(0xddeeffff),
    relationFrom: new Int32Array(store.capacity).fill(-1),
    relationTo: new Int32Array(store.capacity).fill(-1),
    ids: ['bar-0', 'bar-1', 'bar-2', 'bar-3'],
    renderOrder: () => Uint32Array.from([0, 1, 2, 3]),
  };
}
