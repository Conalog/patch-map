import { describe, expect, it } from 'vitest';

import {
  PARTICLE_GRAPHICS_LIMITATIONS,
  ParticleGraphicsLayer,
  buildParticleGraphicsDescriptors,
} from '../../src/core-v2/renderers/particle-layer';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/core-v1/renderer/types';
import type {
  CoreV2EntityProjection,
  CoreV2ProjectionIndex,
} from '../../src/core-v2/contracts';
import {
  coreV2AffineBasis,
  coreV2AffineCenter,
  createCoreV2Affine,
  type CoreV2AffineMatrix,
} from '../../src/core-v2/semantic/geometry';
import type { CoreV2ProjectionRenderContext } from '../../src/core-v2/renderers/types';

describe('buildParticleGraphicsDescriptors', () => {
  it('builds deterministic particles with packed color alpha and center rotation', () => {
    const store = createStore();
    const first = buildParticleGraphicsDescriptors(store);
    const second = buildParticleGraphicsDescriptors(store);

    expect(second).toEqual(first);
    expect(first.staticParticles).toHaveLength(1);
    expect(first.staticParticles[0]).toMatchObject({
      key: 'rect:0',
      slot: 0,
      role: 'rect',
      centerX: 20,
      centerY: 25,
      width: 20,
      height: 10,
      rotation: Math.PI / 2,
      tint: 0x123456,
      alpha: (128 / 255) * 0.5,
    });
    expect(first.staticParticles[0]?.basis[0]).toBeCloseTo(0, 12);
    expect(first.staticParticles[0]?.basis[1]).toBeCloseTo(1, 12);
    expect(first.staticParticles[0]?.basis[2]).toBeCloseTo(-1, 12);
    expect(first.staticParticles[0]?.basis[3]).toBeCloseTo(0, 12);
    expect(first.staticBounds.x).toBeCloseTo(15);
    expect(first.staticBounds.y).toBeCloseTo(15);
    expect(first.staticBounds.width).toBeCloseTo(10);
    expect(first.staticBounds.height).toBeCloseTo(20);
  });

  it('keeps square bar topology stable at zero progress and clamps progress', () => {
    const store = createStore();
    const descriptors = buildParticleGraphicsDescriptors(store);

    expect(descriptors.dynamicParticles).toHaveLength(2);
    expect(descriptors.dynamicParticles[0]).toMatchObject({
      key: 'bar-track:1',
      role: 'bar-track',
      centerX: 50,
      width: 40,
      tint: 0xabcdef,
      alpha: 1,
    });
    expect(descriptors.dynamicParticles[1]).toMatchObject({
      key: 'bar-fill:1',
      role: 'bar-fill',
      centerX: 30,
      width: 0,
      tint: 0x00aa44,
      alpha: 128 / 255,
    });

    const progressed = createStore({ value: 150 });
    const fill = buildParticleGraphicsDescriptors(progressed).dynamicParticles[1];
    expect(fill).toMatchObject({ centerX: 50, width: 40 });
  });

  it('routes rounded and stroked quads to retained Graphics fallback', () => {
    const descriptors = buildParticleGraphicsDescriptors(createStore({ roundedBar: true }));

    expect(descriptors.dynamicParticles).toHaveLength(0);
    expect(descriptors.fallbackGraphics.map((shape) => shape.key)).toEqual([
      'bar-track:1',
      'bar-fill:1',
      'rect:2',
    ]);
    expect(descriptors.fallbackGraphics[2]).toMatchObject({
      radius: 3,
      strokeTint: 0xff6600,
      strokeAlpha: 1,
      strokeWidth: 2,
    });
    expect(descriptors.fallbackGraphics[0]?.radius).toBe(4);
    expect(descriptors.fallbackGraphics[1]?.radius).toBe(0);
  });

  it('aggregates resolved relation centers and retains invisible topology', () => {
    const visible = buildParticleGraphicsDescriptors(createStore());
    expect(visible.relations).toEqual([
      {
        key: 'relation:3:0',
        relationId: 'relation',
        segmentIndex: 0,
        slot: 3,
        fromX: 20,
        fromY: 25,
        toX: 50,
        toY: 55,
        tint: 0x334455,
        alpha: 128 / 255,
        lineWidth: 2,
        resolved: true,
      },
    ]);

    const invisible = buildParticleGraphicsDescriptors(createStore({ hideRect: true }));
    expect(invisible.staticParticles).toHaveLength(1);
    expect(invisible.staticParticles[0]?.alpha).toBe(0);
    expect(invisible.staticParticles[0]?.key).toBe('rect:0');
  });

  it('keeps self-link segments aggregate while reporting one logical relation', () => {
    const store = createStore();
    (store.relationTo as Int32Array)[3] = 0;
    const index: CoreV2ProjectionIndex = Object.freeze({
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
          affine: createCoreV2Affine(),
        }),
      }),
      omittedRelations: Object.freeze([]),
    });
    const descriptors = buildParticleGraphicsDescriptors(
      store,
      projectionContext(index, 1, 0, false, false),
    );
    expect(descriptors.relations).toHaveLength(4);
    expect(new Set(descriptors.relations.map((relation) => relation.slot))).toEqual(new Set([3]));

    const layer = new ParticleGraphicsLayer({ label: 'self relation' });
    const debug = layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(index, 1, 0, false, false),
    });
    expect(debug.relationSegmentCount).toBe(1);
    layer.destroy();
  });

  it('uses relation-affine normal scale in aggregate Graphics stroke descriptors', () => {
    const store = createStore();
    (store.flags as Uint8Array)[2] = RenderFlags.Visible;
    (store.y as Float64Array)[2] = 15;
    (store.relationTo as Int32Array)[3] = 2;
    const index: CoreV2ProjectionIndex = Object.freeze({
      byEntityId: Object.freeze({}),
      relationsByEntityId: Object.freeze({
        relation: Object.freeze({
          entityId: 'relation',
          relationId: 'links',
          sourceId: 'rect',
          targetId: 'rounded',
          key: 'rect>rounded',
          identityKey: '4:rect7:rounded',
          authoredIndex: 0,
          affine: createCoreV2Affine(0, 0, 0, 2, 3),
        }),
      }),
    });
    const descriptors = buildParticleGraphicsDescriptors(
      store,
      projectionContext(index, 1, 0, false, false),
    );
    expect(descriptors.relations).toHaveLength(1);
    expect(descriptors.relations[0]?.lineWidth).toBe(6);
    const layer = new ParticleGraphicsLayer({ label: 'relation parity' });
    expect(layer.container.children[0]).toBe(layer.relationGraphics);
    layer.destroy();
  });

  it('surfaces delegated entities, selections, and unresolved relations', () => {
    const store = createStore({ unresolvedRelation: true });
    const descriptors = buildParticleGraphicsDescriptors(store);

    expect(descriptors.unsupportedCount).toBe(2);
    expect(descriptors.selectedCount).toBe(1);
    expect(descriptors.relations[0]).toMatchObject({ resolved: false, alpha: 128 / 255 });
    expect(PARTICLE_GRAPHICS_LIMITATIONS).toContain(
      'text and image entities are intentionally delegated to their dedicated Core v2 layers',
    );
  });
});

describe('ParticleGraphicsLayer', () => {
  it('syncs in place, prunes stale particles on epoch reload, and destroys idempotently', () => {
    const layer = new ParticleGraphicsLayer();
    const store = createStore();

    const initial = layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 6 }],
    });
    expect(initial).toMatchObject({
      changed: true,
      fullRebuild: true,
      fullRebuilds: 1,
      inPlaceSyncs: 0,
      changedRangeCount: 1,
      staticParticleCount: 1,
      dynamicParticleCount: 2,
      fallbackShapeCount: 1,
      relationSegmentCount: 1,
      unsupportedCount: 2,
      dynamicFullUploadCount: 2,
      staticInvalidatedUploadCount: 1,
      particleFullUploadCount: 3,
      aggregateDisplayObjectCount: 4,
    });
    expect(layer.staticParticles.particleChildren).toHaveLength(1);
    expect(layer.dynamicParticles.particleChildren).toHaveLength(2);
    expect(layer.sync(store, { fullRebuildEpoch: 1 }).changed).toBe(false);

    const mutable = store as RenderStoreView & {
      revision: number;
      value: Float64Array;
      alive: Uint8Array;
    };
    mutable.revision = 2;
    mutable.value[1] = 50;
    const updated = layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 1, end: 2 }],
    });
    expect(updated).toMatchObject({
      fullRebuild: false,
      inPlaceSyncs: 1,
      dynamicFullUploadCount: 2,
      staticInvalidatedUploadCount: 0,
      particleFullUploadCount: 2,
    });

    mutable.revision = 1;
    mutable.alive[0] = 0;
    const reloaded = layer.sync(store, { fullRebuildEpoch: 2 });
    expect(reloaded).toMatchObject({ fullRebuild: true, fullRebuilds: 2 });
    expect(layer.staticParticles.particleChildren).toHaveLength(0);

    expect(layer.destroy()).toBe(true);
    expect(layer.destroy()).toBe(false);
    expect(layer.destroyed).toBe(true);
    expect(() => layer.sync(store)).toThrow('ParticleGraphicsLayer is destroyed');
  });

  it('breaks the early return for projection-only upright rotation and preserves reflection', () => {
    const layer = new ParticleGraphicsLayer();
    const store = createStore();
    const index = projectionIndex('upright', createCoreV2Affine(10, 20));
    const initialContext = projectionContext(index, 1, 0, false, false);

    layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 6 }],
      projectionContext: initialContext,
    });
    const particle = layer.staticParticles.particleChildren[0];
    expect(particle).toMatchObject({ x: 20, y: 25, rotation: 0 });
    expect(particle?.scaleY).toBeGreaterThan(0);

    const transformed = layer.sync(store, {
      fullRebuildEpoch: 1,
      changedRanges: [{ start: 0, end: 1 }],
      projectionContext: projectionContext(index, 2, 90, true, false),
    });

    expect(transformed).toMatchObject({
      changed: true,
      fullRebuild: false,
      inPlaceSyncs: 1,
      staticInvalidatedUploadCount: 1,
    });
    expect(particle).toMatchObject({ x: 20, y: 25 });
    expect(particle?.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(particle?.scaleY).toBeLessThan(0);
    expect(layer.sync(store, {
      fullRebuildEpoch: 1,
      projectionContext: projectionContext(index, 2, 90, true, false),
    }).changed).toBe(false);

    layer.destroy();
  });
});

interface StoreOptions {
  readonly value?: number;
  readonly roundedBar?: boolean;
  readonly hideRect?: boolean;
  readonly unresolvedRelation?: boolean;
}

function createStore(options: StoreOptions = {}): RenderStoreView {
  const capacity = 6;
  const alive = Uint8Array.from([1, 1, 1, 1, 1, 1]);
  const zeros = (): Float64Array => new Float64Array(capacity);
  return {
    capacity,
    liveCount: capacity,
    revision: 1,
    alive,
    kind: Uint8Array.from([
      RenderKind.Rect,
      RenderKind.Bar,
      RenderKind.Rect,
      RenderKind.Relation,
      RenderKind.Text,
      RenderKind.Image,
    ]),
    flags: Uint8Array.from([
      options.hideRect ? 0 : RenderFlags.Visible,
      RenderFlags.Visible | RenderFlags.Selected,
      RenderFlags.Visible,
      RenderFlags.Visible,
      RenderFlags.Visible,
      RenderFlags.Visible,
    ]),
    zIndex: Int32Array.from([0, 1, 2, 3, 4, 5]),
    x: Float64Array.from([10, 30, 80, 0, 0, 0]),
    y: Float64Array.from([20, 50, 20, 0, 0, 0]),
    width: Float64Array.from([20, 40, 20, 0, 20, 20]),
    height: Float64Array.from([10, 10, 20, 0, 10, 10]),
    rotation: Float64Array.from([90, 0, 0, 0, 0, 0]),
    opacity: Float64Array.from([0.5, 1, 1, 1, 1, 1]),
    fill: Uint32Array.from([0x12345680, 0x00aa4480, 0x111111ff, 0, 0, 0]),
    stroke: Uint32Array.from([0, 0, 0xff6600ff, 0, 0, 0]),
    strokeWidth: Float64Array.from([0, 0, 2, 0, 0, 0]),
    radius: Float64Array.from([0, options.roundedBar ? 4 : 0, 3, 0, 0, 0]),
    text: ['', '', '', '', 'text', ''],
    color: Uint32Array.from([0, 0, 0, 0x33445580, 0xffffffff, 0]),
    fontSize: zeros(),
    fontFamily: new Array<string>(capacity).fill(''),
    fontWeight: zeros(),
    align: zeros(),
    maxLines: zeros(),
    source: ['', '', '', '', '', '/asset.png'],
    tint: new Uint32Array(capacity),
    fit: zeros(),
    value: Float64Array.from([0, options.value ?? 0, 0, 0, 0, 0]),
    min: zeros(),
    max: Float64Array.from([0, 100, 0, 0, 0, 0]),
    trackFill: Uint32Array.from([0, 0xabcdefff, 0, 0, 0, 0]),
    relationFrom: Int32Array.from([-1, -1, -1, 0, -1, -1]),
    relationTo: Int32Array.from([
      -1,
      -1,
      -1,
      options.unresolvedRelation ? 99 : 1,
      -1,
      -1,
    ]),
    lineWidth: Float64Array.from([0, 0, 0, 2, 0, 0]),
    ids: ['rect', 'bar', 'rounded', 'relation', 'text', 'image'],
    view: { x: 0, y: 0, scale: 1 },
    background: 0,
    renderOrder: () => Uint32Array.from([0, 1, 2, 3, 4, 5]),
  };
}

function projectionIndex(
  contentOrientation: CoreV2EntityProjection['contentOrientation'],
  affine: CoreV2AffineMatrix,
): CoreV2ProjectionIndex {
  const localBounds = Object.freeze([0, 0, 20, 10] as const);
  const projection: CoreV2EntityProjection = Object.freeze({
    entityId: 'rect',
    localBounds,
    affine,
    worldBasis: coreV2AffineBasis(affine),
    visibleCenter: coreV2AffineCenter(affine, localBounds),
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    contentOrientation,
  });
  return Object.freeze({
    byEntityId: Object.freeze({ rect: projection }),
  });
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
