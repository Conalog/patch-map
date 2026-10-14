import { afterEach, describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { PatchMap } from '../../src/engine';
import { createViewportBoundsHarness, mainBounds } from '../support/viewport-bounds-harness';

interface Fixture {
  name: string;
  data: readonly unknown[];
  target: string;
  oracle: () => { root: Container; contributors: Container[]; prepare?: () => void };
}

const background = { type: 'background', id: 'bg', source: { type: 'rect', fill: '#ffffff' } };
const zeroBars = [
  { type: 'bar', id: 'left', size: 0, placement: 'left', margin: { left: -100 }, attrs: { y: -110 }, source: { type: 'rect', fill: '#ffffff' } },
  { type: 'bar', id: 'right', size: 0, placement: 'right', margin: { right: -100 }, attrs: { y: 130 }, source: { type: 'rect', fill: '#ffffff' } },
];
const fixtures: Fixture[] = [
  leaf('empty group', { type: 'group', children: [] }, () => new Container()),
  leaf('empty relations', { type: 'relations', links: [] }, () => container(new Graphics())),
  leaf('unresolved relations', { type: 'relations', links: [{ source: 'absent-a', target: 'absent-b' }] }, () => container(new Graphics())),
  leaf('empty item', { type: 'item', size: 100, components: [] }, () => new Container()),
  leaf('rect', { type: 'rect', size: { width: 100, height: 40 }, fill: '#ffffff' }, () => rect(100, 40)),
  leaf('stroked rect', { type: 'rect', size: { width: 100, height: 40 }, fill: '#ffffff', stroke: { width: 12, color: '#000000' } }, () => rect(100, 40, 12)),
  leaf('zero-width rect', { type: 'rect', size: { width: 0, height: 40 }, stroke: { width: 12, color: '#000000' } }, () => new Graphics()),
  leaf('zero-height rect', { type: 'rect', size: { width: 100, height: 0 } }, () => new Graphics()),
  leaf('authored image', { type: 'image', size: { width: 40, height: 20 }, source: 'object' }, () => container(rect(40, 20))),
  // Semantic geometry remains live before asset readiness, as documented.
  leaf('intrinsic image initial geometry', { type: 'image', source: 'object' }, () => container(rect(32, 32))),
  // These dimensions are the independent Unicode semantic layout contract.
  leaf('text semantic frame', { type: 'text', text: 'ASCII', style: { fontSize: 16 } }, () => container(rect(40, 20))),
  leaf('empty text semantic frame', { type: 'text', text: '', style: { fontSize: 16 } }, () => container(rect(0, 20))),
  leaf('background border', { type: 'item', size: 100, components: [{ ...background, source: { ...background.source, borderWidth: 8 } }] }, () => container(rect(100, 100, 8))),
  leaf('icon component outset', { type: 'item', size: 100, components: [{ type: 'icon', id: 'icon', source: 'object', size: 20, placement: 'left', margin: { left: -30 } }] }, () => container(position(rect(20, 20), -30, 40))),
  leaf('text component', { type: 'item', size: 100, components: [{ type: 'text', id: 'label', text: 'ASCII', placement: 'left-top', style: { fontSize: 16 } }] }, () => container(rect(40, 20))),
  leaf('zero-area components at separate offsets', { type: 'item', size: 100, components: zeroBars }, () => emptyBarItem()),
  leaf('empty component outside a nonempty item', { type: 'item', size: 100, components: [background, zeroBars[1]] }, () => container(rect(100, 100), position(new Container(), 200, 180))),
  gridFixture('empty grid with retained cells', [[0, 1, 0], [0, 0, 1]], [], false),
  gridFixture('empty grid with hidden inactive cells', [[0, 1, 0]], [], true),
  gridFixture('grid with no retained cells', [[0, 0]], [background], false),
  gridFixture('stroked sparse grid', [[1, 0, 1], [0, 0, 1]], [{ ...background, source: { ...background.source, borderWidth: 8 } }], false),
  gridFixture('zero-area component grid', [[1, 0, 1]], zeroBars, false),
  relationFixture(0),
  relationFixture(8),
  selfRelationFixture(),
];

const transforms = [
  { name: 'translated', attrs: { x: 100, y: 200 }, options: { x: 100, y: 200 } },
  { name: 'nested reflected rotation', attrs: { x: 100, y: 200, angle: 30, scaleX: -1, scaleY: 0.5 }, options: { x: 100, y: 200, angle: 30, scale: { x: -1, y: 0.5 } } },
] as const;

describe('all managed viewport bounds through the public API', () => {
  const engines: PatchMap[] = [];
  afterEach(async () => { await Promise.all(engines.splice(0).map((engine) => engine.destroy())); });

  for (const fixture of fixtures) for (const transform of transforms) {
    it.each([false, true])(`${fixture.name}, ${transform.name}, screen-first: %s`, async (screenFirst) => {
      const data = [{ type: 'group', id: 'outer', attrs: transform.attrs, show: false, children: fixture.data }];
      const { api, engine } = await createViewportBoundsHarness(data, screenFirst);
      engines.push(engine);
      const oracle = fixture.oracle();
      const outer = new Container(transform.options);
      outer.renderable = false;
      outer.addChild(oracle.root);
      oracle.prepare?.();
      try {
        const expected = union(oracle.contributors.map(mainBounds));
        api.viewport.restore({ centerWorld: [-80, -90], scale: 2 });
        const focus = api.viewport.focus({ targets: { id: fixture.target } });
        expect(focus.status).toBe('applied');
        expectBounds(focus.worldBounds, expected);
        expect(focus.viewport.scale).toBe(2);
        expect(focus.viewport.centerWorld[0]).toBeCloseTo(expected[0] + expected[2] / 2, 8);
        expect(focus.viewport.centerWorld[1]).toBeCloseTo(expected[1] + expected[3] / 2, 8);
        const fit = api.viewport.fit({ targets: api.targets.query({ id: fixture.target }), padding: [16, 16] });
        expect(fit.status).toBe('applied');
        expectBounds(fit.worldBounds, expected);
        const scale = Math.min(8, Math.max(0.1, Math.min(expected[2] > 0 ? 288 / expected[2] : Infinity, expected[3] > 0 ? 968 / expected[3] : Infinity)));
        expect(fit.viewport.scale).toBeCloseTo(scale, 8);
        const accepted = new Set(['outer', fixture.target, 'relation']);
        expectBounds(api.viewport.focus({ filter: ({ id }) => accepted.has(id) }).worldBounds, expected);
        const duplicate = api.viewport.focus({ targets: [{ id: fixture.target }, { id: fixture.target }] });
        expectBounds(duplicate.worldBounds, expected);
        expect(duplicate.duplicateCount).toBe(1);
        const previous = api.viewport.snapshot();
        expect(api.viewport.focus({ targets: [{ id: fixture.target }], filter: () => false }).status).toBe('empty');
        expect(api.viewport.snapshot()).toEqual(previous);
      } finally { outer.destroy({ children: true }); }
    });
  }

  it('does not use a group origin after its existing descendants are filtered out', async () => {
    const { api, engine } = await createViewportBoundsHarness([{ type: 'group', id: 'parent', attrs: { x: 100, y: 200 }, children: [{ type: 'group', id: 'empty', children: [] }] }]);
    engines.push(engine);
    api.viewport.restore({ centerWorld: [1, 2], scale: 2 });
    expect(api.viewport.focus({ targets: { id: 'parent' }, filter: ({ id }) => id !== 'empty' })).toMatchObject({ status: 'empty', excluded: ['empty'] });
    expect(api.viewport.snapshot()).toEqual({ centerWorld: [1, 2], scale: 2 });
  });

  it.each(['item', 'grid', 'rect'] as const)('keeps collapsed %s transforms finite', async (type) => {
    const data = type === 'item' ? { type, size: 100, components: [background] }
      : type === 'grid' ? { type, cells: [[1, 0, 1]], item: { size: 100, components: [background] } }
        : { type, size: 100 };
    const { api, engine } = await createViewportBoundsHarness([{ ...data, id: 'target', attrs: { x: 70, y: 80, scaleX: 0 } }]);
    engines.push(engine);
    expect(api.viewport.focus().worldBounds).toEqual([70, 80, 0, 100]);
  });
});

function leaf(name: string, data: Record<string, unknown>, object: () => Container): Fixture {
  return { name, data: [{ ...data, ...(data.type === 'item' ? { contentOrientation: 'follow-item' } : {}), id: 'target', attrs: { x: 20, y: 30, angle: 15 } }], target: 'target', oracle: () => {
    const child = object(); child.position.set(20, 30); child.angle = 15;
    return { root: child, contributors: [child] };
  } };
}

function gridFixture(name: string, cells: number[][], components: unknown[], hide: boolean): Fixture {
  return leaf(name, { type: 'grid', cells, ...(hide ? { inactiveCellStrategy: 'hide' } : {}), item: { size: 100, contentOrientation: 'follow-item', components } }, () => {
    const grid = new Container();
    cells.forEach((row, y) => row.forEach((cell, x) => {
      if (cell === 0 && !hide) return;
      const item = components === zeroBars ? emptyBarItem() : new Container();
      if (components.length > 0 && components !== zeroBars) item.addChild(rect(100, 100, name === 'stroked sparse grid' ? 8 : 0));
      item.position.set(x * 100, y * 100); item.renderable = cell !== 0; grid.addChild(item);
    }));
    return grid;
  });
}

function relationFixture(width: number): Fixture {
  return { name: `grouped relation stroke ${width}`, target: 'relation-parent', data: [
    { type: 'item', id: 'a', size: 100, components: [background] },
    { type: 'item', id: 'b', attrs: { x: 200, y: 100 }, size: 100, components: [background] },
    { type: 'group', id: 'relation-parent', attrs: { x: 20, y: 30, angle: 15 }, children: [{ type: 'relations', id: 'relation', style: { width }, links: [{ source: 'a', target: 'b' }] }] },
  ], oracle: () => {
    const root = new Container();
    const relation = new Container({ x: 20, y: 30, angle: 15 }); root.addChild(relation);
    const from = relation.toLocal({ x: 50, y: 50 }); const to = relation.toLocal({ x: 250, y: 150 });
    relation.addChild(new Graphics().moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width, color: 0 }));
    return { root, contributors: [relation] };
  } };
}

function selfRelationFixture(): Fixture {
  return { name: 'grouped self-relation stroke', target: 'relation-parent', data: [
    { type: 'item', id: 'a', size: 100, components: [background] },
    { type: 'group', id: 'relation-parent', attrs: { x: 20, y: 30, angle: 15 }, children: [{ type: 'relations', id: 'relation', style: { width: 8 }, links: [{ source: 'a', target: 'a' }] }] },
  ], oracle: () => {
    const root = new Container(), endpoint = rect(100, 100);
    const relation = new Container({ x: 20, y: 30, angle: 15 }), path = new Graphics();
    root.addChild(endpoint, relation); relation.addChild(path);
    return { root, contributors: [relation], prepare: () => {
      const [x, y, width, height] = mainBounds(endpoint), padding = Math.max(10, width / 2, height / 2);
      const points = [[x + width / 2, y], [x + width + padding, y - padding],
        [x + width + padding * 2, y + height / 2], [x + width + padding, y + height + padding], [x + width / 2, y + height]];
      points.forEach(([x, y], index) => { const point = relation.toLocal({ x: x!, y: y! });
        if (index === 0) path.moveTo(point.x, point.y); else path.lineTo(point.x, point.y); });
      path.stroke({ width: 8, color: 0 });
    } };
  } };
}

function rect(width: number, height: number, stroke = 0): Graphics {
  const graphics = new Graphics().rect(0, 0, width, height).fill(0xffffff);
  if (stroke > 0) graphics.stroke({ width: stroke, color: 0 });
  return graphics;
}
function container(...children: Container[]): Container { const value = new Container(); value.addChild(...children); return value; }
function position<T extends Container>(object: T, x: number, y: number): T { object.position.set(x, y); return object; }
function emptyBarItem(): Container { return container(position(new Container(), -100, -60), position(new Container(), 200, 180)); }
function union(values: readonly (readonly number[])[]): readonly [number, number, number, number] {
  const left = Math.min(...values.map(([x]) => x!)); const top = Math.min(...values.map(([, y]) => y!));
  return [left, top, Math.max(...values.map(([x, , w]) => x! + w!)) - left, Math.max(...values.map(([, y, , h]) => y! + h!)) - top];
}
function expectBounds(actual: readonly number[] | null, expected: readonly number[]): void {
  expect(actual).not.toBeNull(); expected.forEach((value, index) => expect(actual?.[index]).toBeCloseTo(value, 8));
}
