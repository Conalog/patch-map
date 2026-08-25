import { describe, expect, it } from 'vitest';

import type { EntityInput } from '../../src/patch-map/dense/contracts';
import {
  RenderFlags,
  RenderKind,
  type RenderStoreView,
} from '../../src/patch-map/dense/renderer-types';
import { parsePatchMap } from '../../src/patch-map/parser';
import {
  indexOverlayPaintBounds,
  resolveOverlayPathPlan,
} from '../../src/patch-map/renderers/pixi-renderer/interaction-overlay';
import {
  resolvePatchMapSlotQuad,
  type PatchMapProjectionRenderContext,
} from '../../src/patch-map/renderers/types';

describe('PatchMap selection visual paint bounds', () => {
  it('expands all four straight edges beyond a concrete grid background centered stroke', () => {
    const fixture = parseFixture([[1]]);
    const store = createRenderStore(fixture.document.entities);
    const ownerId = 'selectable-grid.0.0';
    const ownerSlot = requireSlot(store, ownerId);
    const semantic = resolvePatchMapSlotQuad(store, ownerSlot, context(fixture.projection));
    const plan = resolveOverlayPathPlan(
      store,
      [ownerSlot],
      context(fixture.projection),
      'element-only',
      paintContext(store, fixture.projection),
    );

    expect(semantic.vertices).toEqual([100, 100, 180, 100, 180, 160, 100, 160]);
    expect(plan.individualVertices).toEqual([
      [99, 99, 181, 99, 181, 161, 99, 161],
    ]);
    expect(plan.selectionPaths[0]).toEqual(plan.individualVertices[0]);
  });

  it('preserves an authored rotated/scaled owner frame while including paint outset', () => {
    const fixture = parsePatchMap([{
      type: 'item',
      id: 'rotated-item',
      attrs: { x: 20, y: 30, angle: 30, scaleX: 2, scaleY: 1.5 },
      size: { width: 80, height: 60 },
      components: [{
        type: 'background',
        id: 'surface',
        source: {
          type: 'rect',
          fill: 'white',
          borderWidth: 2,
          borderColor: '#063559',
          radius: 6,
        },
      }],
    }]);
    const store = createRenderStore(fixture.document.entities);
    const slot = requireSlot(store, 'rotated-item');
    const projectionContext = context(fixture.projection);
    const semantic = resolvePatchMapSlotQuad(store, slot, projectionContext);
    const visual = resolveOverlayPathPlan(
      store,
      [slot],
      projectionContext,
      'element-only',
      paintContext(store, fixture.projection),
    ).individualVertices[0]!;
    const [basisXx, basisXy, basisYx, basisYy] = semantic.basis;

    expect(visual[0]).toBeCloseTo(semantic.vertices[0] - basisXx * 2 - basisYx * 1.5, 10);
    expect(visual[1]).toBeCloseTo(semantic.vertices[1] - basisXy * 2 - basisYy * 1.5, 10);
    expect(visual[2]).toBeCloseTo(semantic.vertices[2] + basisXx * 2 - basisYx * 1.5, 10);
    expect(visual[3]).toBeCloseTo(semantic.vertices[3] + basisXy * 2 - basisYy * 1.5, 10);
    expect(visual[4]).toBeCloseTo(semantic.vertices[4] + basisXx * 2 + basisYx * 1.5, 10);
    expect(visual[5]).toBeCloseTo(semantic.vertices[5] + basisXy * 2 + basisYy * 1.5, 10);
    expect(visual[6]).toBeCloseTo(semantic.vertices[6] - basisXx * 2 + basisYx * 1.5, 10);
    expect(visual[7]).toBeCloseTo(semantic.vertices[7] - basisXy * 2 + basisYy * 1.5, 10);
  });

  it.each([
    ['element-only', 2],
    ['group-only', 1],
    ['all', 3],
  ] as const)('composes %s from visual bounds for two concrete cells', (displayMode, count) => {
    const fixture = parseFixture([[1, 1]]);
    const store = createRenderStore(fixture.document.entities);
    const slots = [
      requireSlot(store, 'selectable-grid.0.0'),
      requireSlot(store, 'selectable-grid.0.1'),
    ];
    const plan = resolveOverlayPathPlan(
      store,
      slots,
      context(fixture.projection),
      displayMode,
      paintContext(store, fixture.projection),
    );

    expect(plan.individualVertices[0]).toEqual([99, 99, 181, 99, 181, 161, 99, 161]);
    expect(plan.individualVertices[1]).toEqual([179, 99, 261, 99, 261, 161, 179, 161]);
    expect(plan.aggregateVertices).toEqual([99, 99, 261, 99, 261, 161, 99, 161]);
    expect(plan.selectionPaths).toHaveLength(count);
  });

  it('includes a selected authored rect own centered stroke without component traversal', () => {
    const fixture = parsePatchMap([{
      type: 'rect',
      id: 'authored-rect',
      attrs: { x: 10, y: 20 },
      size: { width: 40, height: 30 },
      fill: 'white',
      stroke: { color: '#063559', width: 4 },
    }]);
    const store = createRenderStore(fixture.document.entities);
    const slot = requireSlot(store, 'authored-rect');
    const plan = resolveOverlayPathPlan(
      store,
      [slot],
      context(fixture.projection),
      'element-only',
      paintContext(store, fixture.projection),
    );

    expect(plan.individualVertices).toEqual([[
      8, 18, 52, 18, 52, 52, 8, 52,
    ]]);
  });

  it('rejects negative component margins before paint-bound projection', () => {
    expect(() => parsePatchMap([{
      type: 'item',
      id: 'content-owner',
      attrs: { x: 40, y: 50 },
      size: { width: 80, height: 60 },
      components: [
        {
          type: 'icon',
          id: 'overflow-icon',
          source: 'fixture-icon',
          size: 20,
          placement: 'left-top',
          margin: { left: -8, top: -5 },
        },
        {
          type: 'bar',
          id: 'level',
          source: { type: 'rect', fill: 'blue' },
          size: { width: 30, height: 10 },
          placement: 'bottom',
        },
        {
          type: 'text',
          id: 'label',
          text: 'A',
          placement: 'center',
          style: { fontSize: 12 },
        },
      ],
    }])).toThrow('Spacing must be a nonnegative finite number');
  });
});

function parseFixture(cells: readonly (readonly number[])[]) {
  return parsePatchMap([{
    type: 'grid',
    id: 'selectable-grid',
    attrs: { x: 100, y: 100, display: 'panelGroup' },
    cells,
    item: {
      size: { width: 80, height: 60 },
      padding: 3,
      components: [
        {
          type: 'background',
          id: 'surface',
          source: {
            type: 'rect',
            fill: 'white',
            borderWidth: 2,
            borderColor: '#063559',
            radius: 6,
          },
        },
      ],
    },
  }]);
}

function context(
  projection: ReturnType<typeof parsePatchMap>['projection'],
): PatchMapProjectionRenderContext {
  return {
    index: projection,
    revision: 1,
    world: { rotationDegrees: 0, flipX: false, flipY: false },
  };
}

function paintContext(
  store: RenderStoreView,
  projection: ReturnType<typeof parsePatchMap>['projection'],
) {
  return {
    entityIdsByOwnerId: indexOverlayPaintBounds(projection),
    slotByEntityId: new Map(store.ids.map((id, slot) => [id, slot])),
  };
}

function requireSlot(store: RenderStoreView, id: string): number {
  const slot = store.ids.indexOf(id);
  if (slot < 0) throw new Error(`missing slot ${id}`);
  return slot;
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
