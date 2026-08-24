import { describe, expect, it } from 'vitest';

import type { EntityInput, EntitySnapshot, SceneSnapshot } from '../../src/patch-map/dense/contracts';
import type { ParsePatchMapResult } from '../../src/patch-map/contracts';
import {
  buildPatchMapRelationHitIndex,
  createPatchMapSurfaceGeometrySnapshot,
  hitTestPatchMapSurfaceRelations,
  queryPatchMapRelationHitIndex,
  type PatchMapSurfaceRelationGeometry,
} from '../../src/patch-map/engine';
import { parsePatchMapV010 } from '../../src/patch-map/parser';
import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { applyPatchMapSemanticPatch } from '../../src/patch-map/semantic/mutation';
import {
  relationPathHitScreen,
  selfLinkWorldPoints,
} from '../../src/patch-map/semantic/relations';

describe('PatchMap aggregate relation paths', () => {
  it('deduplicates ordered pairs, preserves reverse links, and builds a finite self loop', () => {
    const parse = parsePatchMapV010([
      { type: 'rect', id: 'a', size: 20, fill: '#ff0000', attrs: { x: 0, y: 0 } },
      { type: 'rect', id: 'b', size: 20, fill: '#00ff00', attrs: { x: 100, y: 40 } },
      {
        type: 'relations',
        id: 'links',
        links: [
          { source: 'a', target: 'a' },
          { source: 'a', target: 'b' },
          { source: 'a', target: 'b' },
          { source: 'b', target: 'a' },
        ],
      },
    ]);
    const geometry = createPatchMapSurfaceGeometrySnapshot(snapshotFromParse(parse), parse.projection);

    expect(parse.identity.counts.relationLinks).toBe(3);
    expect(geometry.relations.map((relation) => relation.key)).toEqual([
      'a>a',
      'a>b',
      'b>a',
    ]);
    const self = geometry.relations[0];
    expect(self?.kind).toBe('polyline');
    expect(self?.worldPoints).toEqual([
      [10, 0],
      [30, -10],
      [40, 10],
      [30, 30],
      [10, 20],
    ]);
    expect(self?.worldBounds).toEqual([10, -10, 30, 40]);
    expect(relationPathHitScreen(self?.screenPoints ?? [], [39, 10], 1, 3)).toBe(true);
    expect(relationPathHitScreen(self?.screenPoints ?? [], [60, 60], 1, 3)).toBe(false);
    expect(selfLinkWorldPoints([0, 0, 20, 20]).every((point) => point.every(Number.isFinite))).toBe(true);
  });

  it('keeps collision-safe pair identity separate from ambiguous display keys', () => {
    const parse = parsePatchMapV010([
      { type: 'rect', id: 'a>b', size: 10 },
      { type: 'rect', id: 'c', size: 10, attrs: { x: 20 } },
      { type: 'rect', id: 'a', size: 10, attrs: { x: 40 } },
      { type: 'rect', id: 'b>c', size: 10, attrs: { x: 60 } },
      {
        type: 'relations',
        id: 'links',
        links: [
          { source: 'a>b', target: 'c' },
          { source: 'a', target: 'b>c' },
        ],
      },
    ]);
    const relations = Object.values(parse.projection.relationsByEntityId ?? {});
    expect(relations.map((relation) => relation.key)).toEqual(['a>b>c', 'a>b>c']);
    expect(new Set(relations.map((relation) => relation.identityKey)).size).toBe(2);
    expect(new Set(relations.map((relation) => relation.entityId)).size).toBe(2);
  });

  it('projects nested endpoint centers through relation-local inverse and F*R screen space', () => {
    const parse = parsePatchMapV010(relationMatrixDataset());
    const view = {
      x: 10,
      y: 20,
      scale: 2,
      rotation: 90,
      flipX: true,
      flipY: false,
    } as const;
    const geometry = createPatchMapSurfaceGeometrySnapshot(
      snapshotFromParse(parse, { x: 10, y: 20, scale: 2, rotation: 90 }),
      parse.projection,
      view,
    );

    expect(geometry.relations.map((relation) => relation.key)).toEqual([
      'nested-item>grid.0.0',
      'grid.0.0>nested-item',
    ]);
    expect(geometry.relations[0]).toMatchObject({
      relationId: 'nested-links',
      localPoints: [[90, -90], [120, -180]],
      worldPoints: [[120, 80], [210, 110]],
      screenPoints: [[170, 260], [230, 440]],
      visible: true,
      style: {
        color: 0x123456ff,
        colorHex: '#123456ff',
        width: 3,
        opacity: 0.75,
        zIndex: -4,
      },
    });
    expect(hitTestPatchMapSurfaceRelations(geometry.relations, { x: 200, y: 350 })).toMatchObject({
      relationId: 'nested-links',
      key: 'grid.0.0>nested-item',
    });
    expect(() => hitTestPatchMapSurfaceRelations(
      geometry.relations,
      { x: Number.NaN, y: 0 },
    )).toThrow('relation hit point must contain finite coordinates');
  });

  it('scales stroke normals once, applies zoom in CSS space, and preserves the 4 CSS px floor', () => {
    const parse = parsePatchMapV010([
      { type: 'rect', id: 'a', size: 10 },
      { type: 'rect', id: 'b', size: 10, attrs: { x: 100 } },
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'a', target: 'b' }],
        style: { width: 2 },
        attrs: { scaleX: 2, scaleY: 3 },
      },
    ]);
    const geometry = createPatchMapSurfaceGeometrySnapshot(
      snapshotFromParse(parse, { x: 0, y: 0, scale: 2, rotation: 0 }),
      parse.projection,
      { x: 0, y: 0, scale: 2, rotation: 0 },
    );
    expect(geometry.relations[0]?.visibleStrokeWidthsCssPx).toEqual([12]);
    expect(hitTestPatchMapSurfaceRelations(geometry.relations, { x: 100, y: 15.5 })).not.toBeNull();
    expect(hitTestPatchMapSurfaceRelations(geometry.relations, { x: 100, y: 16.5 })).toBeNull();

    const thinParse = parsePatchMapV010([
      { type: 'rect', id: 'a', size: 10 },
      { type: 'rect', id: 'b', size: 10, attrs: { x: 100 } },
      { type: 'relations', id: 'thin', links: [{ source: 'a', target: 'b' }], style: { width: 0 } },
    ]);
    const thin = createPatchMapSurfaceGeometrySnapshot(snapshotFromParse(thinParse), thinParse.projection);
    expect(hitTestPatchMapSurfaceRelations(thin.relations, { x: 50, y: 8.5 })).not.toBeNull();
    expect(hitTestPatchMapSurfaceRelations(
      thin.relations,
      { x: 50, y: 8.5 },
      { toleranceCssPx: 3 },
    )).not.toBeNull();
    expect(hitTestPatchMapSurfaceRelations(
      thin.relations,
      { x: 50, y: 9.5 },
      { toleranceCssPx: 3 },
    )).toBeNull();
  });

  it('bounds long-path indexing and merges overflow candidates in scene order', () => {
    const local = relationGeometry('local', [[0, 0], [4_096, 4_096]]);
    const oversized = relationGeometry('oversized', [[0, 0], [1_000_000_000_000_000, 1_000_000_000_000_000]]);
    const relations = Object.freeze([local, oversized]);
    const index = buildPatchMapRelationHitIndex(relations);

    expect(index.cells.size).toBeLessThan(1_000);
    expect(index.overflow).toEqual([1]);
    const candidates = queryPatchMapRelationHitIndex(index, { x: 32, y: 32 });
    expect(candidates).toEqual([0, 1]);
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(hitTestPatchMapSurfaceRelations(
      candidates.map((candidate) => relations[candidate] as PatchMapSurfaceRelationGeometry),
      { x: 32, y: 32 },
    )).toMatchObject({ id: 'oversized' });
  });

  it('hides incident paths with retained endpoint geometry and surfaces omitted links', () => {
    const parse = parsePatchMapV010([
      {
        type: 'grid',
        id: 'grid',
        cells: [[0]],
        inactiveCellStrategy: 'hide',
        item: { size: 20, components: [] },
      },
      { type: 'rect', id: 'target', size: 20, attrs: { x: 100 } },
      {
        type: 'relations',
        id: 'links',
        links: [
          { source: 'grid.0.0', target: 'target' },
          { source: 'target', target: 'missing' },
        ],
      },
    ]);
    const geometry = createPatchMapSurfaceGeometrySnapshot(snapshotFromParse(parse), parse.projection);

    expect(geometry.relations).toHaveLength(1);
    expect(geometry.relations[0]).toMatchObject({ key: 'grid.0.0>target', visible: false });
    expect(geometry.omittedRelations).toEqual([
      expect.objectContaining({
        relationId: 'links',
        key: 'target>missing',
        reason: 'missing-target',
      }),
    ]);
    expect(hitTestPatchMapSurfaceRelations(geometry.relations, { x: 50, y: 10 })).toBeNull();
  });

  it('normalizes compatibility opacity and atomically stages structural relation links', () => {
    const initial = materializePatchMapDataset(relationMatrixDataset());
    const mutation = applyPatchMapSemanticPatch(
      initial,
      { kind: 'element', id: 'nested-links' },
      {
        links: [
          { source: 'nested-item', target: 'grid.0.0' },
          { source: 'nested-item', target: 'missing-endpoint' },
        ],
      },
    );

    expect(initial.dataset[2]).toMatchObject({ style: { alpha: 0.75 } });
    expect(mutation.status).toBe('changed');
    if (mutation.status !== 'changed') throw new Error('expected changed relation candidate');
    expect(mutation.candidate.dataset[2]).toMatchObject({
      links: [
        { source: 'nested-item', target: 'grid.0.0' },
        { source: 'nested-item', target: 'missing-endpoint' },
      ],
    });
    expect(() => materializePatchMapDataset([
      {
        type: 'relations',
        id: 'conflict',
        links: [],
        style: { alpha: 0.5, opacity: 0.5 },
      },
    ])).toThrow('alpha and compatibility opacity are mutually exclusive');
    expect(() => parsePatchMapV010([
      { type: 'rect', id: 'a', size: 10 },
      {
        type: 'relations',
        id: 'style-conflict',
        links: [{ source: 'a', target: 'a' }],
        style: { alpha: 0.5, opacity: 0.5 },
      },
    ])).toThrow('alpha and opacity cannot both be authored');
    try {
      parsePatchMapV010([
        { type: 'rect', id: 'a', size: 10 },
        {
          type: 'relations',
          id: 'singular',
          attrs: { scaleX: 0 },
          links: [{ source: 'a', target: 'a' }],
        },
      ]);
      throw new Error('expected singular relation parse failure');
    } catch (error) {
      expect(error).toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'non-invertible-relation-transform' })],
      });
    }
  });
});

function relationMatrixDataset(): readonly unknown[] {
  return [
    {
      type: 'group',
      id: 'nested-group',
      attrs: { x: 100, y: 50 },
      children: [{
        type: 'rect',
        id: 'nested-item',
        size: { width: 20, height: 20 },
        fill: '#336699',
        attrs: { x: 10, y: 20 },
      }],
    },
    {
      type: 'grid',
      id: 'grid',
      cells: [[1]],
      item: { size: 20, components: [] },
      attrs: { x: 200, y: 100 },
    },
    {
      type: 'relations',
      id: 'nested-links',
      links: [
        { source: 'nested-item', target: 'grid.0.0' },
        { source: 'grid.0.0', target: 'nested-item' },
      ],
      style: { color: '#123456', width: 3, opacity: 0.75 },
      attrs: { x: 30, y: -10, angle: 90, zIndex: -4 },
    },
  ];
}

function snapshotFromParse(
  parse: ParsePatchMapResult,
  view: SceneSnapshot['view'] = { x: 0, y: 0, scale: 1, rotation: 0 },
): SceneSnapshot {
  const entities = parse.document.entities.map((entity, slot) => inputSnapshot(entity, slot));
  return Object.freeze({
    revision: 1,
    view,
    entityCount: entities.length,
    entities: Object.freeze(entities),
    selection: Object.freeze({ revision: 1, refs: Object.freeze([]) }),
  });
}

function inputSnapshot(entity: EntityInput, slot: number): EntitySnapshot {
  const common = {
    ref: Object.freeze({ slot, generation: 1 }),
    id: entity.id,
    kind: entity.kind,
    opacity: entity.opacity ?? 1,
    visible: entity.visible ?? true,
    interactive: entity.interactive ?? false,
    zIndex: entity.zIndex ?? 0,
    tags: Object.freeze([...(entity.tags ?? [])]),
  };
  if (entity.kind === 'relation') {
    return Object.freeze({
      ...common,
      bounds: Object.freeze({ x: 0, y: 0, width: 0, height: 0 }),
      rotation: 0,
      data: Object.freeze({
        from: entity.from,
        to: entity.to,
        color: entity.color,
        lineWidth: entity.lineWidth ?? 1,
      }),
    });
  }
  return Object.freeze({
    ...common,
    bounds: Object.freeze({ x: entity.x, y: entity.y, width: entity.width, height: entity.height }),
    rotation: entity.rotation ?? 0,
    data: Object.freeze({}),
  });
}

function relationGeometry(
  id: string,
  points: readonly (readonly [number, number])[],
): PatchMapSurfaceRelationGeometry {
  const start = points[0] ?? [0, 0];
  const end = points.at(-1) ?? start;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return Object.freeze({
    id,
    relationId: 'links',
    key: `${id}>${id}`,
    identityKey: `${id.length}:${id}${id.length}:${id}`,
    sourceId: id,
    targetId: id,
    kind: 'segment',
    screenPoints: Object.freeze(points.map((point) => Object.freeze([...point] as [number, number]))),
    screenBounds: Object.freeze([
      minX,
      minY,
      Math.max(...xs) - minX,
      Math.max(...ys) - minY,
    ] as const),
    visible: true,
    style: Object.freeze({ color: 0xffffffff, colorHex: '#ffffffff', width: 1, opacity: 1, zIndex: 0 }),
    visibleStrokeWidthsCssPx: Object.freeze([1]),
    worldEndpoints: Object.freeze([start, end] as const),
    screenEndpoints: Object.freeze([start, end] as const),
  });
}
