import { afterEach, describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { PatchMap } from '../../src/engine';
import { PatchMapScene } from '../../src/core/scene';
import { planPatchMapParsedSceneReconcile } from '../../src/core/reconcile';
import { PatchMapSurfaceGeometryAuthority } from '../../src/composition/surface-geometry-authority';
import { parsePatchMap } from '../../src/parsing';
import { parsePatchMapIncrementalStructure } from '../../src/parsing/incremental';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import { resolvePatchMapViewportContributors } from '../../src/viewport';
import { createViewportBoundsHarness, mainBounds } from '../support/viewport-bounds-harness';

const centers: Record<string, readonly [number, number]> = {
  a: [0, 0], b: [100, 0], alias: [100, 0], near: [100 + 5e-13, 0], c: [0, 10],
  far: [1000, 1000], farEnd: [1100, 1000], point: [500, 500], pointAlias: [500, 500],
};
const patterns: readonly [string, readonly (readonly [string, string])[]][] = [
  ['acute chain', [['a', 'b'], ['b', 'c']]],
  ['acute chain and distant subpath', [['a', 'b'], ['b', 'c'], ['far', 'farEnd']]],
  ['authored order breaks the chain', [['b', 'c'], ['a', 'b']]],
  ['different IDs share a join coordinate', [['a', 'b'], ['alias', 'c']]],
  ['nearby coordinates do not join', [['a', 'b'], ['near', 'c']]],
  ['degenerate link inside the chain', [['a', 'b'], ['b', 'alias'], ['alias', 'c']]],
  ['only degenerate links', [['point', 'pointAlias']]],
  ['degenerate subpath before the chain', [['point', 'pointAlias'], ['a', 'b'], ['b', 'c']]],
  ['degenerate subpath after the chain', [['a', 'b'], ['b', 'c'], ['point', 'pointAlias']]],
  ['open reversal', [['a', 'b'], ['b', 'a']]],
  ['open return to the first point', [['a', 'b'], ['b', 'c'], ['c', 'a']]],
  ['missing endpoint inside the chain', [['a', 'b'], ['missing', 'c'], ['b', 'c']]],
  ['duplicate directed link', [['a', 'b'], ['a', 'b'], ['b', 'c']]],
  ['self loop mixed with ordinary paths', [['a', 'b'], ['b', 'b'], ['b', 'c']]],
];
const transforms = [
  { name: 'identity', attrs: {}, pixi: {} },
  { name: 'nested reflection and rotation', attrs: { x: 100, y: 200, angle: 30, scaleX: -1, scaleY: 0.5 }, pixi: { x: 100, y: 200, angle: 30, scale: { x: -1, y: 0.5 } } },
] as const;

describe('relation owner stroke bounds through focus/fit', () => {
  const engines: PatchMap[] = [];
  afterEach(async () => { await Promise.all(engines.splice(0).map(engine => engine.destroy())); });
  for (const [name, links] of patterns) for (const width of [0, 8]) for (const transform of transforms) {
    it.each([false, true])(`${name}, width ${width}, ${transform.name}, screen-first %s`, async screenFirst => {
      const data = dataset(links, width, transform.attrs);
      const { api, engine, surface } = await createViewportBoundsHarness(data, screenFirst);
      engines.push(engine);
      const { root, relation } = oracle(links, width, transform.pixi);
      try {
        const expected = mainBounds(relation);
        api.viewport.restore({ centerWorld: [-80, -90], scale: 2 });
        const focus = api.viewport.focus({ targets: { id: 'relation-parent' } });
        expectBounds(focus.worldBounds, expected);
        expect(focus.viewport.scale).toBe(2);
        expectBounds(api.viewport.focus({ filter: ({ id }) => ['outer', 'relation-parent', 'links'].includes(id) }).worldBounds, expected);
        const fit = api.viewport.fit({ targets: api.targets.query({ id: 'relation-parent' }), padding: 16 });
        expectBounds(fit.worldBounds, expected);
        const scale = Math.min(8, Math.max(0.1, Math.min(expected[2] > 0 ? 288 / expected[2] : Infinity, expected[3] > 0 ? 968 / expected[3] : Infinity)));
        expect(fit.viewport.scale).toBeCloseTo(scale, 8);
        expectBounds(api.viewport.focus({ targets: [{ id: 'relation-parent' }, { id: 'relation-parent' }] }).worldBounds, expected);
        const geometry = surface.worldGeometrySnapshot();
        // Dense slots can retain their previous order after link reordering.
        const reversed = { ...geometry, relations: [...geometry.relations].reverse() };
        expectBounds(resolvePatchMapViewportContributors(materializePatchMapDataset(data).dataset, reversed, { targets: ['relation-parent'] }).worldBounds, expected);
        const before = api.viewport.snapshot();
        expect(api.viewport.focus({ targets: { id: 'relation-parent' }, filter: () => false }).status).toBe('empty');
        expect(api.viewport.snapshot()).toEqual(before);
      } finally { root.destroy({ children: true }); }
    });
  }

  it('reproduces the reported acute-chain bounds and preserves explicit endpoint targeting', async () => {
    const { api, engine } = await createViewportBoundsHarness(dataset([['a', 'b'], ['b', 'c']], 8, {}));
    engines.push(engine);
    expect(api.viewport.focus({ targets: { id: 'relation-parent' } }).worldBounds).toEqual([-40, -40, 180, 90]);
    expect(api.viewport.fit({ targets: { id: 'relation-parent' }, padding: 16 }).viewport.scale).toBe(1.6);
    expect(api.viewport.focus({ targets: { id: 'links' } }).worldBounds).toEqual([-5, -5, 110, 20]);
  });

  it.each([false, true])('refreshes authored order and empty paths after incremental dense reconciliation (screen-first %s)', screenFirst => {
    let current = materializePatchMapDataset(dataset([['b', 'c'], ['a', 'b']], 8, {})).dataset;
    let parsed = parsePatchMap(current);
    const scene = new PatchMapScene(); scene.load(parsed.document);
    const authority = new PatchMapSurfaceGeometryAuthority({
      get visibleProjection() { return parsed.projection; }, snapshot: () => scene.snapshot(), selection: () => scene.selection(),
    } as ConstructorParameters<typeof PatchMapSurfaceGeometryAuthority>[0]);
    const retained = scene.snapshot().entities.filter(entity => entity.kind === 'relation').map(entity => entity.id);
    try {
      if (screenFirst) authority.geometrySnapshot(); else authority.worldGeometrySnapshot();
      for (const [links, expected] of [
        [[['a', 'b'], ['b', 'c']], [-40, -40, 180, 90]],
        [[], [0, 0, 0, 0]],
      ] as const) {
        const next = materializePatchMapDataset(dataset(links, 8, {})).dataset;
        const incremental = parsePatchMapIncrementalStructure(next, current, parsed);
        expect(incremental).not.toBeNull();
        if (incremental === null) throw new Error('expected incremental relation parse');
        expect(incremental).toEqual(parsePatchMap(next));
        const plan = planPatchMapParsedSceneReconcile(parsed.document, incremental.document, { allowedRetainedOrderIds: retained });
        expect(plan.safeToCommit).toBe(true);
        scene.commit(plan.batch); current = next; parsed = incremental;
        authority.invalidateProjection(parsed.projection);
        if (links.length > 0) expect(scene.snapshot().entities.filter(entity => entity.kind === 'relation').map(entity => entity.id)).toEqual(retained);
        if (screenFirst) authority.geometrySnapshot();
        expectBounds(resolvePatchMapViewportContributors(current, authority.worldGeometrySnapshot(), { targets: ['relation-parent'] }).worldBounds, expected);
      }
    } finally { authority.invalidateProjection(null); scene.destroy(); }
  });
});

function dataset(links: readonly (readonly [string, string])[], width: number, attrs: object) {
  return [{ type: 'group', id: 'outer', attrs, show: false, children: [
    ...Object.entries(centers).map(([id, [x, y]]) => ({ type: 'rect', id, size: 10, fill: '#ffffff', attrs: { x: x - 5, y: y - 5 } })),
    { type: 'group', id: 'relation-parent', children: [{ type: 'relations', id: 'links', style: { width }, links: links.map(([source, target]) => ({ source, target })) }] },
  ] }];
}

function oracle(links: readonly (readonly [string, string])[], width: number, options: ConstructorParameters<typeof Container>[0]) {
  const root = new Container(options), relation = new Container(), path = new Graphics();
  root.addChild(relation); relation.addChild(path);
  const endpoints = new Map<string, Graphics>();
  for (const [id, [x, y]] of Object.entries(centers)) {
    const endpoint = new Graphics().rect(x - 5, y - 5, 10, 10).fill(0xffffff);
    root.addChild(endpoint); endpoints.set(id, endpoint);
  }
  let last: readonly [number, number] | undefined;
  const seen = new Set<string>();
  for (const [source, target] of links) {
    const key = JSON.stringify([source, target]);
    if (seen.has(key)) continue; seen.add(key);
    const from = endpoints.get(source), to = endpoints.get(target);
    if (from === undefined || to === undefined) continue;
    const center = (node: Container): readonly [number, number] => {
      const [x, y, width, height] = mainBounds(node); return [x + width / 2, y + height / 2];
    };
    let world: readonly (readonly [number, number])[] = [center(from), center(to)];
    // The current semantic self-link remains a five-point open loop.
    if (source === target) {
      const [x, y, width, height] = mainBounds(from), padding = Math.max(10, width / 2, height / 2);
      world = [[x + width / 2, y], [x + width + padding, y - padding], [x + width + padding * 2, y + height / 2], [x + width + padding, y + height + padding], [x + width / 2, y + height]];
    }
    const points = world.map(([x, y]) => relation.toLocal({ x, y }));
    const start = points[0]!;
    if (last === undefined || last[0] !== start.x || last[1] !== start.y) path.moveTo(start.x, start.y);
    for (const point of points.slice(1)) path.lineTo(point.x, point.y);
    const end = points.at(-1)!; last = [end.x, end.y];
  }
  path.stroke({ width, color: 0 });
  return { root, relation };
}

function expectBounds(actual: readonly number[] | null, expected: readonly number[]): void {
  expect(actual).not.toBeNull(); expected.forEach((value, index) => expect(actual![index]).toBeCloseTo(value, 8));
}
