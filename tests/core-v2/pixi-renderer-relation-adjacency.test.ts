import { describe, expect, it } from 'vitest';

import type { RenderStoreView } from '../../src/core-v1/renderer/types';
import { RenderKind } from '../../src/core-v1/renderer/types';
import {
  buildCoreV2RelationAdjacency,
  expandCoreV2RelationDependencyRanges,
  projectionChangedRanges,
} from '../../src/core-v2/renderers/pixi-renderer';
import { parsePatchMapV010 } from '../../src/core-v2/parser';

describe('Core v2 Pixi relation adjacency', () => {
  it('dirties an image slot when only descriptor options change', () => {
    const before = parsePatchMapV010([{
      type: 'image',
      id: 'image',
      source: { src: 'fixture.svg', data: { resolution: 1 } },
      size: 16,
    }]);
    const after = parsePatchMapV010([{
      type: 'image',
      id: 'image',
      source: { src: 'fixture.svg', data: { resolution: 2 } },
      size: 16,
    }]);
    const baseStore = createRelationStore(1, []);
    const store: RenderStoreView = {
      ...baseStore,
      ids: ['image'],
      kind: Uint8Array.of(RenderKind.Image),
    };
    const beforeEntity = before.document.entities[0];
    const afterEntity = after.document.entities[0];
    if (beforeEntity?.kind !== 'image' || afterEntity?.kind !== 'image') {
      throw new Error('expected descriptor image rows');
    }

    expect(beforeEntity.source).toBe(afterEntity.source);
    expect(projectionChangedRanges(store, before.projection, after.projection)).toEqual([
      { start: 0, end: 1 },
    ]);
  });

  it('registers a self-link once while preserving deterministic relation order', () => {
    const store = createRelationStore(2, [
      [0, 0],
      [0, 1],
      [1, 0],
    ]);

    const adjacency = buildCoreV2RelationAdjacency(store);

    expect(adjacency.byEndpoint.get(0)).toEqual([2, 3, 4]);
    expect(adjacency.byEndpoint.get(1)).toEqual([3, 4]);
    expect([...adjacency.relationSlots]).toEqual([2, 3, 4]);
    expect(adjacency.endpointsByRelation.get(2)).toEqual([0, 0]);
  });

  it('reuses adjacency to expand endpoint dirtiness across distant chunks', () => {
    const store = createRelationStore(6, [
      [0, 5],
      [2, 4],
    ]);
    const adjacency = buildCoreV2RelationAdjacency(store);

    expect(expandCoreV2RelationDependencyRanges(
      store,
      [{ start: 0, end: 1 }],
      adjacency.byEndpoint,
    )).toEqual([
      { start: 0, end: 1 },
      { start: 6, end: 7 },
    ]);
    expect(expandCoreV2RelationDependencyRanges(
      store,
      [{ start: 4, end: 5 }],
      adjacency.byEndpoint,
    )).toEqual([
      { start: 4, end: 5 },
      { start: 7, end: 8 },
    ]);
  });

  it('builds exact memberships for a 5k high-degree star without duplicate scans', () => {
    const relationCount = 5_000;
    const endpointCount = relationCount + 1;
    const pairs = Array.from(
      { length: relationCount },
      (_value, index) => [0, index + 1] as const,
    );
    const store = createRelationStore(endpointCount, pairs);
    const firstRelationSlot = endpointCount;
    const finalRelationSlot = endpointCount + relationCount - 1;

    const adjacency = buildCoreV2RelationAdjacency(store);
    const hubRelations = adjacency.byEndpoint.get(0);

    expect(hubRelations).toHaveLength(relationCount);
    expect(hubRelations?.[0]).toBe(firstRelationSlot);
    expect(hubRelations?.at(-1)).toBe(finalRelationSlot);
    expect(new Set(hubRelations).size).toBe(relationCount);
    expect(adjacency.byEndpoint.size).toBe(endpointCount);
    expect(adjacency.byEndpoint.get(1)).toEqual([firstRelationSlot]);
    expect(adjacency.byEndpoint.get(relationCount)).toEqual([finalRelationSlot]);
    expect(adjacency.relationSlots.size).toBe(relationCount);
    expect(adjacency.endpointsByRelation.size).toBe(relationCount);
    expect(expandCoreV2RelationDependencyRanges(
      store,
      [{ start: 0, end: 1 }],
      adjacency.byEndpoint,
    )).toEqual([
      { start: 0, end: 1 },
      { start: firstRelationSlot, end: finalRelationSlot + 1 },
    ]);
  });
});

function createRelationStore(
  endpointCount: number,
  pairs: readonly (readonly [number, number])[],
): RenderStoreView {
  const capacity = endpointCount + pairs.length;
  const alive = new Uint8Array(capacity);
  const kind = new Uint8Array(capacity);
  const relationFrom = new Int32Array(capacity);
  const relationTo = new Int32Array(capacity);
  alive.fill(1);
  relationFrom.fill(-1);
  relationTo.fill(-1);
  pairs.forEach(([source, target], index) => {
    const slot = endpointCount + index;
    kind[slot] = RenderKind.Relation;
    relationFrom[slot] = source;
    relationTo[slot] = target;
  });
  const numeric = new Float64Array(capacity);
  const strings = Array.from({ length: capacity }, () => '');
  return {
    capacity,
    liveCount: capacity,
    revision: 1,
    alive,
    kind,
    flags: numeric,
    zIndex: numeric,
    x: numeric,
    y: numeric,
    width: numeric,
    height: numeric,
    rotation: numeric,
    opacity: numeric,
    fill: numeric,
    stroke: numeric,
    strokeWidth: numeric,
    radius: numeric,
    text: strings,
    color: numeric,
    fontSize: numeric,
    fontFamily: strings,
    fontWeight: numeric,
    align: numeric,
    maxLines: numeric,
    source: strings,
    tint: numeric,
    fit: numeric,
    value: numeric,
    min: numeric,
    max: numeric,
    trackFill: numeric,
    relationFrom,
    relationTo,
    lineWidth: numeric,
    ids: strings,
    view: { x: 0, y: 0, scale: 1 },
    background: 0xffffffff,
    renderOrder: () => new Uint32Array(capacity),
  };
}
