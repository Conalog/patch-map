import { describe, expect, it, vi } from 'vitest';

import type {
  EntityKind,
  EntityRef,
  EntitySnapshot,
  SceneSnapshot,
} from '../../src/core-v1/contracts';
import type {
  CoreV2EntityProjection,
  CoreV2ProjectionIndex,
} from '../../src/core-v2/contracts';
import { CoreV2 } from '../../src/core-v2/core';
import {
  CoreV2EntityHitIndex,
  coreV2EntityContainsWorldPoint,
  hitTestCoreV2EntityIndex,
} from '../../src/core-v2/semantic/entity-hit-index';
import {
  applyCoreV2Affine,
  freezeCoreV2Affine,
} from '../../src/core-v2/semantic/geometry';

describe('Core v2 bounded entity hit index', () => {
  it('bounds huge finite AABBs in overflow and merges candidates in topmost order', () => {
    const hugeWidth = Number.MAX_VALUE;
    const entities = [
      entity(0, 'overflow-low', -hugeWidth / 2, -64, hugeWidth, 128, 0),
      entity(1, 'local-middle', 0, 0, 20, 20, 1),
      entity(2, 'overflow-top', -hugeWidth / 2, -32, hugeWidth, 64, 2),
    ];
    const index = CoreV2EntityHitIndex.build(snapshot(entities), null, new Set(), {
      cellSize: 64,
      maxCellsPerEntity: 4,
    });

    expect(index.candidates({ x: 10, y: 10 }).map((ref) => ref.slot)).toEqual([2, 1, 0]);
    expect(index.debugSnapshot()).toMatchObject({
      indexedEntityCount: 3,
      overflowCount: 2,
      bucketMembershipCount: 1,
      cellSize: 64,
      maxCellsPerEntity: 4,
    });
    expect(index.candidates({ x: Number.MAX_VALUE, y: Number.MAX_VALUE }).map(
      (ref) => ref.slot,
    )).toEqual([2, 0]);
  });

  it('preserves exact skewed negative-scale containment and stale-projection fallback', () => {
    const dense = entity(0, 'affine', 0, 0, 20, 10, 0);
    const affine = freezeCoreV2Affine(-1, 0.5, 0.75, 1, 100, 50);
    const projection: CoreV2EntityProjection = Object.freeze({
      entityId: dense.id,
      localBounds: Object.freeze([0, 0, 20, 10] as const),
      affine,
      worldBasis: Object.freeze([-1, 0.5, 0.75, 1] as const),
      visibleCenter: applyCoreV2Affine(affine, [10, 5]),
      rotationDegrees: 0,
      scaleX: -1,
      scaleY: 1,
      contentOrientation: 'follow-item',
    });
    const projectedPoint = applyCoreV2Affine(affine, [5, 5]);

    expect(coreV2EntityContainsWorldPoint(
      dense,
      { x: projectedPoint[0], y: projectedPoint[1] },
      projection,
    )).toBe(true);
    expect(coreV2EntityContainsWorldPoint(dense, { x: 5, y: 5 }, projection)).toBe(false);

    const projectionIndex: CoreV2ProjectionIndex = Object.freeze({
      byEntityId: Object.freeze({ affine: projection }),
    });
    const projectedIndex = CoreV2EntityHitIndex.build(snapshot([dense]), projectionIndex);
    expect(hitTestCoreV2EntityIndex(
      projectedIndex,
      { x: projectedPoint[0], y: projectedPoint[1] },
      {},
      () => dense,
      projectionIndex,
    )).toEqual(dense.ref);

    const stale = new Set(['affine']);
    const denseIndex = CoreV2EntityHitIndex.build(snapshot([dense]), projectionIndex, stale);
    expect(hitTestCoreV2EntityIndex(
      denseIndex,
      { x: 5, y: 5 },
      {},
      () => dense,
      projectionIndex,
      stale,
    )).toEqual(dense.ref);
    expect(hitTestCoreV2EntityIndex(
      denseIndex,
      { x: projectedPoint[0], y: projectedPoint[1] },
      {},
      () => dense,
      projectionIndex,
      stale,
    )).toBeNull();
  });

  it('keeps interpolation endpoints in stable broad-phase buckets', () => {
    const bar = entity(0, 'bar', 0, 90, 20, 10, 0, 'bar');
    const liveProjection = projectionIndex(
      bar,
      freezeCoreV2Affine(1, 0, 0, 1, 0, 90),
      [0, 0, 20, 10],
    );
    const destinationProjection = projectionIndex(
      bar,
      freezeCoreV2Affine(1, 0, 0, 1, 0, 20),
      [0, 0, 20, 80],
    );
    const index = CoreV2EntityHitIndex.build(
      snapshot([bar]),
      liveProjection,
      new Set(),
      { envelopeProjection: destinationProjection },
    );

    expect(index.candidates({ x: 10, y: 25 })).toEqual([bar.ref]);
    expect(hitTestCoreV2EntityIndex(
      index,
      { x: 10, y: 25 },
      {},
      () => bar,
      liveProjection,
    )).toBeNull();
    expect(hitTestCoreV2EntityIndex(
      index,
      { x: 10, y: 25 },
      {},
      () => bar,
      destinationProjection,
    )).toEqual(bar.ref);
  });

  it('applies visible, interactive, kind, and topmost filters after the broad phase', () => {
    const bottom = entity(0, 'bottom', 0, 0, 20, 20, 0, 'rect');
    const hidden = { ...entity(1, 'hidden', 0, 0, 20, 20, 1, 'image'), visible: false };
    const passive = { ...entity(2, 'passive', 0, 0, 20, 20, 2, 'text'), interactive: false };
    const entities = [bottom, hidden, passive].map((value) => Object.freeze(value));
    const bySlot = new Map(entities.map((value) => [value.ref.slot, value]));
    const index = CoreV2EntityHitIndex.build(snapshot(entities), null);
    const getEntity = (ref: EntityRef): EntitySnapshot | null => bySlot.get(ref.slot) ?? null;

    expect(hitTestCoreV2EntityIndex(index, { x: 10, y: 10 }, {}, getEntity, null)).toEqual(
      bottom.ref,
    );
    expect(hitTestCoreV2EntityIndex(
      index,
      { x: 10, y: 10 },
      { interactiveOnly: false },
      getEntity,
      null,
    )).toEqual(passive.ref);
    expect(hitTestCoreV2EntityIndex(
      index,
      { x: 10, y: 10 },
      { interactiveOnly: false, kinds: ['image'] },
      getEntity,
      null,
    )).toBeNull();
  });

  it('uses dense spatial buckets for orthogonal scenes and keeps the exact fallback lazy', async () => {
    const renderer = fakeRenderer();
    type UnsafeCoreV2Constructor = new (rendererValue: unknown, options: unknown) => CoreV2;
    const UnsafeCoreV2 = CoreV2 as unknown as UnsafeCoreV2Constructor;
    const core = new UnsafeCoreV2(renderer, { autoRender: false });
    core.load([{ type: 'rect', id: 'target', size: 10 }]);
    const internals = core as unknown as {
      scene: {
        snapshot(): SceneSnapshot;
        query(): readonly EntityRef[];
        ref(id: string): EntityRef | null;
      };
      entityHitIndexValue: CoreV2EntityHitIndex | null;
      denseHitGeometryCompatible: boolean;
      staleHitProjectionIds: Set<string>;
      spatialHitAnimationEnds: Map<string, number>;
    };
    const snapshotSpy = vi.spyOn(internals.scene, 'snapshot');
    const querySpy = vi.spyOn(internals.scene, 'query');

    for (let index = 0; index < 20; index += 1) {
      const id = `churn-${index}`;
      core.commit({ operations: [{
        type: 'add',
        entity: {
          kind: 'rect',
          id,
          x: 512,
          y: 512,
          width: 1,
          height: 1,
          fill: 0xffffffff,
        },
      }] });
      core.commit({ operations: [{ type: 'remove', target: id }] });
    }
    expect(internals.staleHitProjectionIds.size).toBe(0);

    expect(core.hitTestScreen({ x: 5, y: 5 })?.slot).toBe(0);
    expect(core.hitTestScreen({ x: 5, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).not.toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalled();

    core.commit({ operations: [{ type: 'selection', targets: ['target'], mode: 'replace' }] });
    core.setView({ x: 10, y: 0, scale: 1, rotation: 0 });
    expect(core.hitTestScreen({ x: 15, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).not.toHaveBeenCalled();

    core.resetView();
    core.commit({ operations: [{
      type: 'add',
      entity: {
        kind: 'bar',
        id: 'value-bar',
        x: 32,
        y: 0,
        width: 10,
        height: 10,
        value: 0,
        min: 0,
        max: 100,
        fill: 0x336699ff,
      },
    }] });
    expect(core.hitTestScreen({ x: 35, y: 5 })).not.toBeNull();
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    core.commit({ operations: [{
      type: 'animate',
      target: 'value-bar',
      property: 'value',
      to: 100,
      durationMs: 100,
      easing: 'linear',
    }] });
    core.advance(25);
    expect(core.hitTestScreen({ x: 35, y: 5 })).not.toBeNull();
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(internals.spatialHitAnimationEnds.size).toBe(0);
    core.commit({ operations: [{ type: 'remove', target: 'value-bar' }] });
    expect([...internals.staleHitProjectionIds].some((id) => id.startsWith('churn-'))).toBe(false);

    core.commit({ operations: [{ type: 'patch', target: 'target', changes: { x: 128 } }] });
    expect(core.hitTestScreen({ x: 133, y: 5 })?.slot).toBe(0);
    expect(core.hitTestScreen({ x: 5, y: 5 })).toBeNull();
    expect(snapshotSpy).toHaveBeenCalledTimes(2);
    const refSpy = vi.spyOn(internals.scene, 'ref');
    core.commit({ operations: [{ type: 'selection', targets: ['target'], mode: 'replace' }] });
    expect(refSpy).not.toHaveBeenCalled();

    core.commit({
      operations: [{
        type: 'animate',
        target: 'target',
        property: 'x',
        to: 256,
        durationMs: 100,
        easing: 'linear',
      }],
    });
    expect(core.hitTestScreen({ x: 133, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(3);
    core.advance(75);
    expect(core.hitTestScreen({ x: 197, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(4);
    core.advance(125);
    expect(core.hitTestScreen({ x: 261, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(5);
    expect(internals.spatialHitAnimationEnds.size).toBe(0);

    core.reconcile([{ type: 'rect', id: 'target', size: 10, attrs: { x: 300 } }]);
    expect(core.hitTestScreen({ x: 305, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(5);
    expect(core.hitTestScreen({ x: 305, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(5);
    expect(querySpy).not.toHaveBeenCalled();

    internals.denseHitGeometryCompatible = false;
    expect(core.hitTestScreen({ x: 305, y: 5 })?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(6);
    expect(internals.entityHitIndexValue).not.toBeNull();

    expect(await core.destroy()).toBe(true);
    expect(internals.entityHitIndexValue).toBeNull();
    expect(internals.staleHitProjectionIds.size).toBe(0);
  });
});

function entity(
  slot: number,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  kind: EntityKind = 'rect',
): EntitySnapshot {
  return Object.freeze({
    ref: Object.freeze({ slot, generation: 1 }),
    id,
    kind,
    bounds: Object.freeze({ x, y, width, height }),
    rotation: 0,
    opacity: 1,
    visible: true,
    interactive: true,
    zIndex,
    tags: Object.freeze([]),
    data: Object.freeze({}),
  });
}

function snapshot(entities: readonly EntitySnapshot[]): SceneSnapshot {
  return Object.freeze({
    revision: 1,
    view: Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 }),
    entityCount: entities.length,
    entities: Object.freeze([...entities]),
    selection: Object.freeze({ revision: 1, refs: Object.freeze([]) }),
  });
}

function projectionIndex(
  source: EntitySnapshot,
  affine: ReturnType<typeof freezeCoreV2Affine>,
  localBounds: readonly [number, number, number, number],
): CoreV2ProjectionIndex {
  const projection: CoreV2EntityProjection = Object.freeze({
    entityId: source.id,
    localBounds: Object.freeze(localBounds),
    affine,
    worldBasis: Object.freeze([
      affine[0],
      affine[1],
      affine[2],
      affine[3],
    ] as const),
    visibleCenter: applyCoreV2Affine(affine, [
      localBounds[0] + localBounds[2] / 2,
      localBounds[1] + localBounds[3] / 2,
    ]),
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    contentOrientation: 'follow-item',
  });
  return Object.freeze({
    byEntityId: Object.freeze({ [source.id]: projection }),
    barsByEntityId: Object.freeze({}),
    textsByEntityId: Object.freeze({}),
    imagesByEntityId: Object.freeze({}),
    relationsByEntityId: Object.freeze({}),
  });
}

function fakeRenderer(): object {
  let destroyed = false;
  return {
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
    initializationMetrics: Object.freeze({ applicationInitMs: 0, rendererBuildMs: 0 }),
    get destroyed() {
      return destroyed;
    },
    bindRootInteractions: () => () => {},
    setProjection: () => {},
    setWorldOrientation: () => {},
    markChanges: () => {},
    markOverlayChanges: () => {},
    resize: () => false,
    setView: () => false,
    flush: () => ({ rendered: false, commandCount: 0 }),
    destroy: () => {
      if (destroyed) return false;
      destroyed = true;
      return true;
    },
    whenDestroyed: () => Promise.resolve(),
  };
}
