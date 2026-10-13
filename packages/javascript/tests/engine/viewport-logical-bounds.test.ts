import { afterEach, describe, expect, it } from 'vitest';
import { Container, Graphics, Matrix } from 'pixi.js';
import { PatchMapScene } from '../../src/core/scene';
import { PatchMap } from '../../src/engine';
import { createPatchMapSurfaceWorldGeometrySnapshot } from '../../src/engine/surface-geometry';
import { parsePatchMap } from '../../src/parsing';
import type { ParsePatchMapResult } from '../../src/parsing/contracts';
import { parsePatchMapIncrementalStructure } from '../../src/parsing/incremental';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import { resolvePatchMapViewportContributors } from '../../src/viewport';
import { createPatchMapApi } from '../../src/public';
import { TransactionSurface } from '../support/engine-update-transaction-surface';
import { PatchMapSurfaceGeometryAuthority } from '../../src/composition/surface-geometry-authority';

const background = { type: 'background', id: 'bg', source: { type: 'rect', fill: '#ffffff' } };
const overflowItem = {
  type: 'item', id: 'overflow', size: { width: 100, height: 100 },
  contentOrientation: 'follow-item',
  components: [background, {
    type: 'bar', id: 'extra', source: { type: 'rect', fill: '#ff0000' },
    size: { width: 300, height: 20 }, placement: 'right',
  }],
};
const sparseGrid = {
  type: 'grid', id: 'g', attrs: { angle: 45 }, cells: [[1, 0, 1], [0, 0, 1]],
  item: { size: { width: 100, height: 100 }, contentOrientation: 'follow-item', components: [background] },
};

describe('viewport logical bounds through parser and dense geometry', () => {
  const engines: PatchMap[] = [];
  afterEach(async () => { await Promise.all(engines.splice(0).map((engine) => engine.destroy())); });

  it.each([
    ['follow-item', false], ['follow-item', true], ['upright', false], ['upright', true],
  ] as const)('focuses and fits the overflowing item (%s, screen geometry first: %s)', async (contentOrientation, screenFirst) => {
    const map = await mount([{ ...overflowItem, contentOrientation }], screenFirst);
    const item = new Container();
    item.addChild(rect(0, 0, 100, 100), rect(-200, 40, 300, 20));
    try {
      const expected = mainBounds(item);
      expect(expected).toEqual([-200, 0, 300, 100]);
      map.viewport.restore({ centerWorld: [0, 0], scale: 2 });
      const focus = map.viewport.focus({ targets: { id: 'overflow' } });
      expectBounds(focus.worldBounds, expected);
      expect(focus.viewport).toMatchObject({ centerWorld: [-50, 50], scale: 2 });
      const fit = map.viewport.fit({ targets: { id: 'overflow' }, padding: 16 });
      expectBounds(fit.worldBounds, expected);
      expect(fit.viewport.scale).toBeCloseTo(288 / 300, 9);
      expect(fit.contributors.map(({ id }) => id)).toEqual(['overflow']);
    } finally { item.destroy({ children: true }); }
  });

  it.each([false, true])('uses the rotated sparse grid frame (screen geometry first: %s)', async (screenFirst) => {
    const map = await mount([sparseGrid], screenFirst);
    const grid = new Container({ angle: 45 });
    grid.addChild(rect(0, 0, 100, 100), rect(200, 0, 100, 100), rect(200, 100, 100, 100));
    try {
      const expected = mainBounds(grid);
      const focus = map.viewport.focus({ targets: { id: 'g' } });
      expectBounds(focus.worldBounds, expected);
      expect(focus.viewport.centerWorld[0]).toBeCloseTo(25 * Math.SQRT2, 9);
      expect(focus.viewport.centerWorld[1]).toBeCloseTo(125 * Math.SQRT2, 9);
      const fit = map.viewport.fit({ targets: { id: 'g' }, padding: [16, 16] });
      expectBounds(fit.worldBounds, expected);
      expect(fit.viewport.scale).toBeCloseTo(288 / (250 * Math.SQRT2), 9);
      expect(fit.contributors.map(({ id }) => id)).toEqual(['g']);
    } finally { grid.destroy({ children: true }); }
  });

  it('measures overflowing items in their own frame through nested rotation and reflection', async () => {
    const map = await mount([{
      type: 'group', id: 'parent', attrs: { x: 40, y: 60, angle: 15, scaleX: -1 },
      children: [{ ...overflowItem, attrs: { x: 20, y: 30, angle: 25, scaleY: 0.5 } }],
    }]);
    const parent = new Container({ x: 40, y: 60, angle: 15, scale: { x: -1, y: 1 } });
    const item = new Container({ x: 20, y: 30, angle: 25, scale: { x: 1, y: 0.5 } });
    parent.addChild(item);
    item.addChild(rect(0, 0, 100, 100), rect(-200, 40, 300, 20));
    try {
      const focus = map.viewport.focus({ targets: { id: 'parent' } });
      expectBounds(focus.worldBounds, mainBounds(item));
      expect(focus.contributors.map(({ id }) => id)).toEqual(['overflow']);
    } finally { parent.destroy({ children: true }); }
  });

  it('includes component overflow when an expanded grid instance is explicitly selected', async () => {
    const map = await mount([{
      ...sparseGrid, cells: [[1]],
      item: { size: overflowItem.size, contentOrientation: 'follow-item', components: overflowItem.components },
    }]);
    const grid = new Container({ angle: 45 });
    const item = new Container();
    grid.addChild(item);
    item.addChild(rect(0, 0, 100, 100), rect(-200, 40, 300, 20));
    try {
      const focus = map.viewport.focus({ targets: map.targets.query({ id: 'g.0.0' }) });
      expectBounds(focus.worldBounds, mainBounds(item));
      expect(focus.contributors.map(({ id }) => id)).toEqual(['g.0.0']);
    } finally { grid.destroy({ children: true }); }
  });

  it('keeps bounds valid for collapsed axes and empty item containers', async () => {
    const map = await mount([{ ...overflowItem, attrs: { x: 20, y: 30, scaleX: 0 } }]);
    const item = new Container({ x: 20, y: 30, scale: { x: 0, y: 1 } });
    item.addChild(rect(0, 0, 100, 100), rect(-200, 40, 300, 20));
    try {
      expectBounds(map.viewport.focus({ targets: { id: 'overflow' } }).worldBounds, mainBounds(item));
      map.data.replace([{ type: 'item', id: 'empty', attrs: { x: 70, y: 80 }, size: 100, components: [] }], { fit: false });
      expect(map.viewport.focus({ targets: { id: 'empty' } }).worldBounds).toEqual([70, 80, 0, 0]);
    } finally { item.destroy({ children: true }); }
  });

  it('retains the updated grid frame through incremental projection replacement', () => {
    const previous = materializePatchMapDataset([sparseGrid]).dataset;
    const parsed = parsePatchMap(previous);
    const next = materializePatchMapDataset([{ ...sparseGrid, attrs: { angle: 30 } }]).dataset;
    const incremental = parsePatchMapIncrementalStructure(next, previous, parsed);
    expect(incremental).not.toBeNull();
    if (incremental === null) throw new Error('incremental grid parse was refused');
    const scene = new PatchMapScene();
    const grid = new Container({ angle: 30 });
    grid.addChild(rect(0, 0, 100, 100), rect(200, 0, 100, 100), rect(200, 100, 100, 100));
    try {
      scene.load(incremental.document);
      const geometry = createPatchMapSurfaceWorldGeometrySnapshot(scene.snapshot(), incremental.projection);
      expectBounds(resolvePatchMapViewportContributors(next, geometry, { targets: ['g'] }).worldBounds, mainBounds(grid));
    } finally { scene.destroy(); grid.destroy({ children: true }); }
  });

  async function mount(data: unknown, screenFirst = false) {
    const surface = new ParsedViewportSurface({ width: 320, height: 1000, pixelRatio: 1 });
    const engine = new PatchMap({ surfaceFactory: () => Promise.resolve(surface) });
    engines.push(engine);
    await engine.initialize({ instanceId: 'logical-bounds', width: 320, height: 1000 });
    engine.loadDataset(data);
    if (screenFirst) surface.geometrySnapshot();
    return createPatchMapApi(engine);
  }
});

class ParsedViewportSurface extends TransactionSurface {
  private readonly scene = new PatchMapScene();
  private parsed: ParsePatchMapResult | null = null;
  private readonly geometry: PatchMapSurfaceGeometryAuthority;
  public constructor(options: ConstructorParameters<typeof TransactionSurface>[0]) {
    super(options);
    const projection = () => this.parsed?.projection ?? null;
    this.geometry = new PatchMapSurfaceGeometryAuthority({
      get visibleProjection() { return projection(); },
      snapshot: () => this.scene.snapshot(),
      selection: () => this.scene.selection(),
    } as ConstructorParameters<typeof PatchMapSurfaceGeometryAuthority>[0]);
  }
  public override load(input: unknown): void {
    super.load(input);
    this.parsed = parsePatchMap(input);
    this.scene.load(this.parsed.document);
    this.geometry.invalidateProjection(this.parsed.projection);
  }
  public override setView(view: Parameters<TransactionSurface['setView']>[0]): void {
    super.setView(view);
    this.geometry.updateRootView(view);
  }
  public geometrySnapshot() { return this.geometry.geometrySnapshot(); }
  public worldGeometrySnapshot() {
    return this.geometry.worldGeometrySnapshot();
  }
  public override destroy(): Promise<boolean> {
    this.geometry.invalidateProjection(null);
    this.parsed = null;
    this.scene.destroy();
    return super.destroy();
  }
}

function rect(x: number, y: number, width: number, height: number): Graphics {
  return new Graphics().rect(x, y, width, height).fill(0xffffff);
}

// main's getObjectWorldCorners: take the container's local bounds, then
// transform all four corners. This oracle uses Pixi rather than the new helper.
function mainBounds(container: Container): readonly [number, number, number, number] {
  const bounds = container.getLocalBounds();
  const matrix = container.getGlobalTransform(new Matrix(), false);
  const points = [
    [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height], [bounds.x, bounds.y + bounds.height],
  ].map(([x, y]) => matrix.apply({ x: x!, y: y! }));
  const left = Math.min(...points.map(({ x }) => x));
  const top = Math.min(...points.map(({ y }) => y));
  return [left, top, Math.max(...points.map(({ x }) => x)) - left, Math.max(...points.map(({ y }) => y)) - top];
}

function expectBounds(actual: readonly number[] | null, expected: readonly number[]): void {
  expect(actual).not.toBeNull();
  expected.forEach((value, index) => { expect(actual?.[index]).toBeCloseTo(value, 9); });
}
