import { describe, expect, it } from 'vitest';

import { PatchMap } from '../../src/engine';
import { PatchMapLogicalSceneIndex } from '../../src/query-selection';
import { applyPatchMapSelectionOperation } from '../../src/query-selection/selection-values';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import type {
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapSurfaceDebug,
} from '../../src/engine/contracts';
import type {
  PatchMapPoint,
  PatchMapSurfaceView,
} from '../../src/engine/surface-contract';

const QUERY_DATASET = [
  {
    type: 'item',
    id: 'item-a',
    label: 'Item A',
    size: { width: 100, height: 80 },
    components: [
      {
        type: 'bar',
        id: 'bar',
        source: { type: 'rect', fill: '#00aa66' },
        size: { width: 60, height: 10 },
      },
      { type: 'text', id: 'label', text: 'Alpha' },
    ],
    attrs: { x: 10, y: 20 },
  },
  {
    type: 'item',
    id: 'item-d',
    label: 'Item D',
    size: { width: 100, height: 80 },
    components: [
      {
        type: 'bar',
        id: 'bar',
        source: { type: 'rect', fill: '#4488ff' },
        size: { width: 60, height: 20 },
      },
    ],
    attrs: { x: 220, y: 20 },
  },
  {
    type: 'rect',
    id: 'rect-b',
    size: { width: 40, height: 30 },
    fill: '#ff8800',
    attrs: { x: 160, y: 40, zIndex: 2 },
  },
  {
    type: 'text',
    id: 'text-c',
    text: 'Bravo',
    size: { width: 80, height: 20 },
    attrs: { x: 40, y: 140 },
  },
  {
    type: 'relations',
    id: 'links',
    links: [{ source: 'item-a', target: 'rect-b' }],
    style: { color: '#222222', width: 2 },
  },
] as const;

const SELECTION_DATASET = [
  {
    type: 'group',
    id: 'group-a',
    children: [
      {
        type: 'item',
        id: 'item-a',
        label: 'Item A',
        size: { width: 100, height: 80 },
        components: [
          { type: 'text', id: 'label', text: 'Alpha' },
        ],
        attrs: { x: 10, y: 20, zIndex: 1 },
      },
      {
        type: 'rect',
        id: 'rect-b',
        size: { width: 40, height: 30 },
        attrs: { x: 160, y: 40, zIndex: 2 },
      },
    ],
    attrs: { x: 0, y: 0 },
  },
  {
    type: 'text',
    id: 'text-c',
    text: 'Bravo',
    size: { width: 80, height: 20 },
    attrs: { x: 40, y: 140 },
  },
] as const;

describe('PatchMap logical query and selection substrate', () => {
  it('queries elements and owner-qualified components in deterministic logical order', () => {
    const fingerprint = JSON.stringify(QUERY_DATASET);
    const index = new PatchMapLogicalSceneIndex(
      materializePatchMapDataset(QUERY_DATASET).dataset,
    );

    expect(keys(index.query({ where: { id: 'rect-b' } }))).toEqual([
      'element:rect-b',
    ]);
    expect(keys(index.query({ where: { type: 'text' } }))).toEqual([
      'element:text-c',
      'component:item-a/label',
    ]);
    expect(keys(index.query({ where: { label: 'Item A' } }))).toEqual([
      'element:item-a',
    ]);
    expect(keys(index.query({ where: { ownerId: 'item-a', id: 'bar' } }))).toEqual([
      'component:item-a/bar',
    ]);
    expect(index.target('item-a/bar')).toMatchObject({
      key: 'component:item-a/bar',
      ownerId: 'item-a',
      id: 'bar',
    });
    expect(keys(index.query({
      recursive: true,
      where: { type: 'bar' },
    }))).toEqual([
      'component:item-a/bar',
    ]);
    expect(keys(index.query({
      where: { type: 'item' },
      predicate: ({ label }) => label?.startsWith('Item') ?? false,
    }))).toEqual([
      'element:item-a',
      'element:item-d',
    ]);
    expect(keys(index.query({
      where: { type: 'bar' },
      predicate: ({ value }) => componentHeight(value) >= 10,
    }))).toEqual([
      'component:item-a/bar',
      'component:item-d/bar',
    ]);

    const ambiguous = index.query({ where: { id: 'bar' } });
    expect(ambiguous).toMatchObject({
      status: 'rejected',
      code: 'CONFLICT',
      targets: [],
    });
    expect(keys(index.query({
      recursive: false,
      where: { type: 'text' },
    }))).toEqual(['element:text-c']);
    expect(index.query({ where: { type: 'bar' } }).targets.every(
      ({ rendererObjectCount }) => rendererObjectCount === 0,
    )).toBe(true);
    expect(Object.isFrozen(index.query({ where: { id: 'rect-b' } }).targets[0]?.value))
      .toBe(true);
    expect(JSON.stringify(QUERY_DATASET)).toBe(fingerprint);
  });

  it('resolves top-level spatial targets before materializing the complete catalog', () => {
    const materialized = materializePatchMapDataset(
      Array.from({ length: 5_000 }, (_, index) => ({
        type: 'item',
        id: `node-${index}`,
        size: { width: 80, height: 40 },
        components: [
          {
            type: 'bar',
            id: 'bar',
            source: { type: 'rect', fill: '#00aa66' },
            size: { width: 60, height: 10 },
          },
          { type: 'text', id: 'label', text: `${index}` },
        ],
      })),
    );
    const index = new PatchMapLogicalSceneIndex(materialized.dataset);

    expect(index.hitFromTarget('node-4999')).toMatchObject({
      target: {
        key: 'element:node-4999',
        sceneOrder: 14_997,
        value: { id: 'node-4999' },
      },
      candidates: [{ key: 'element:node-4999' }],
    });
    expect(index.query({ where: { ownerId: 'node-4999', id: 'label' } }))
      .toMatchObject({
        status: 'matched',
        targets: [{ key: 'component:node-4999/label' }],
      });
  });

  it('reduces replace, add, remove, toggle, and clear to ordered unique snapshots', () => {
    const valid = new Set(['item-a', 'rect-b', 'text-c']);
    const operations = [
      { op: 'replace', ids: ['item-a', 'rect-b', 'item-a'] },
      { op: 'add', ids: ['text-c', 'rect-b'] },
      { op: 'remove', ids: ['rect-b', 'missing'] },
      { op: 'toggle', ids: ['item-a', 'rect-b'] },
      { op: 'clear' },
    ] as const;
    let current: readonly string[] = Object.freeze([]);
    const changes = operations.map((operation) => {
      const change = applyPatchMapSelectionOperation(
        current,
        operation,
        (id) => valid.has(id),
      );
      current = change.current;
      return change;
    });

    expect(changes.map(({ current: ids }) => ids)).toEqual([
      ['item-a', 'rect-b'],
      ['item-a', 'rect-b', 'text-c'],
      ['item-a', 'text-c'],
      ['text-c', 'rect-b'],
      [],
    ]);
    expect(changes.map(({ added, removed }) => ({ added, removed }))).toEqual([
      { added: ['item-a', 'rect-b'], removed: [] },
      { added: ['text-c'], removed: [] },
      { added: [], removed: ['rect-b'] },
      { added: ['rect-b'], removed: ['item-a'] },
      { added: [], removed: ['text-c', 'rect-b'] },
    ]);
  });

  it('shares hierarchy, lock, predicate, and paint-order facts across selection modes', () => {
    const index = new PatchMapLogicalSceneIndex(
      materializePatchMapDataset(SELECTION_DATASET).dataset,
    );
    const componentId = 'item-a::text:label';

    expect(index.resolveSelectionUnit(componentId, 'entity')?.key)
      .toBe('component:item-a/label');
    expect(index.resolveSelectionUnit(componentId, 'grid')?.key)
      .toBe('element:item-a');
    expect(index.resolveSelectionUnit(componentId, 'closest-group')?.key)
      .toBe('element:item-a');
    expect(index.resolveSelectionUnit(componentId, 'highest-group')?.key)
      .toBe('element:group-a');
    expect(index.resolveSelectionUnit(componentId, 'grid-cell')?.key)
      .toBe('component:item-a/label');
    expect(index.resolveSelectionInteraction(componentId, {
      unit: 'highest-group',
      clickCount: 2,
    })).toMatchObject({
      clickType: 'double',
      resolved: { key: 'component:item-a/label' },
      engineDrillDelta: 1,
    });
    expect(index.resolveSelectionInteraction(componentId, {
      unit: 'highest-group',
      clickCount: 3,
    })).toMatchObject({
      clickType: 'multi-click',
      clickCount: 3,
      resolved: { key: 'element:group-a' },
      engineDrillDelta: 0,
    });
    expect(index.hitFromTarget(componentId).candidates.map(({ key }) => key)).toEqual([
      'component:item-a/label',
      'element:item-a',
      'element:group-a',
    ]);

    expect(index.filterSelection([componentId], { lockedIds: ['item-a'] })).toEqual([]);
    expect(index.filterSelection(['text-c'], {
      predicate: ({ id }) => id !== 'text-c',
    })).toEqual([]);
    const overlap = index.hitTest([
      {
        id: 'group-a',
        screenBounds: [0, 0, 220, 100],
        visible: true,
      },
      {
        id: 'item-a',
        screenBounds: [10, 20, 100, 80],
        visible: true,
      },
      {
        id: 'item-a::text:label',
        ownerItemId: 'item-a',
        componentId: 'label',
        screenBounds: [30, 40, 60, 20],
        visible: true,
      },
    ], { x: 20, y: 30 }, {
      candidateIds: ['group-a', 'item-a'],
    });
    expect(overlap.candidates.map(({ id }) => id)).toEqual(['item-a', 'group-a']);
    expect(overlap.target?.id).toBe('item-a');
  });

  it('binds query handles to one engine scene revision and publishes real selection events', async () => {
    const surfaces: TestSurface[] = [];
    const engine = new PatchMap({
      surfaceFactory: createTestSurfaceFactory(surfaces),
    });
    await engine.initialize({
      instanceId: 'query-selection',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });
    engine.loadDataset(QUERY_DATASET);

    const oldResult = engine.queryScene({ where: { id: 'rect-b' } });
    expect(oldResult).toMatchObject({
      status: 'matched',
      lifecycleGeneration: 1,
      sceneRevision: 1,
      targets: [{ key: 'element:rect-b' }],
    });
    for (const operation of [
      'update',
      'event-bind',
      'focus',
      'transform',
      'select',
    ] as const) {
      expect(engine.reuseQueryResult(oldResult, operation)).toMatchObject({
        status: 'accepted',
        operation,
        appliedCount: 1,
      });
    }
    surfaces[0]!.hitId = 'rect-b';
    expect(engine.selectionHitTestScreen({ x: 170, y: 50 })).toMatchObject({
      target: { key: 'element:rect-b' },
      candidates: [{ key: 'element:rect-b' }],
      worldPoint: { x: 170, y: 50 },
    });

    const changes: unknown[] = [];
    engine.on('selectionChanged', (change) => changes.push(change));
    engine.applySelection({ op: 'replace', ids: ['item-a', 'rect-b', 'item-a'] });
    engine.applySelection({ op: 'add', ids: ['text-c', 'rect-b'] });
    engine.applySelection({ op: 'remove', ids: ['rect-b', 'missing'] });
    engine.applySelection({ op: 'toggle', ids: ['item-a', 'rect-b'] });
    engine.applySelection({ op: 'clear', source: 'external' });
    expect(changes).toHaveLength(5);
    expect(surfaces[0]?.selectionIds).toEqual([]);

    engine.applySelection({ op: 'replace', ids: ['rect-b'] });
    expect(() => engine.applySelection({
      op: 'clear-all',
    } as never)).toThrow('unsupported selection operation');
    expect(() => engine.applySelection({
      op: 'clear',
      source: 'unknown',
    } as never)).toThrow('unsupported selection source');
    let accessorReads = 0;
    const accessorOperation = Object.defineProperty({
      op: 'replace',
      ids: ['item-a'],
    }, 'source', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'external';
      },
    });
    expect(() => engine.applySelection(accessorOperation as never)).toThrow('data-only');
    expect(() => engine.applySelection({ op: 'clear', ids: [] } as never)).toThrow('unknown field');
    expect(accessorReads).toBe(0);
    expect(engine.selectionIds).toEqual(['rect-b']);

    engine.loadDataset(QUERY_DATASET);
    expect(engine.applySelection({
      op: 'replace',
      ids: ['item-a/bar'],
      source: 'canvas',
    })).toMatchObject({
      changed: true,
      current: ['item-a/bar'],
    });
    expect(surfaces[0]?.selectionIds).toEqual(['item-a/bar']);
    expect(engine.reuseQueryResult(oldResult, 'select')).toMatchObject({
      status: 'rejected',
      code: 'STALE_TARGET',
      appliedCount: 0,
    });
    expect(engine.resolveTarget({ kind: 'element', id: 'rect-b' })).toMatchObject({
      target: { kind: 'element', id: 'rect-b' },
      sceneRevision: 2,
    });

    await expect(engine.destroy()).resolves.toBe(true);
    expect(surfaces[0]).toMatchObject({ canvasCount: 0, destroyed: true });
  });
});

function keys(
  result: ReturnType<PatchMapLogicalSceneIndex['query']>,
): readonly string[] {
  return result.targets.map(({ key }) => key);
}

function componentHeight(value: Readonly<Record<string, unknown>>): number {
  const size = value.size;
  if (typeof size === 'number') return size;
  if (size === null || typeof size !== 'object' || Array.isArray(size)) return 0;
  const height = (size as Readonly<Record<string, unknown>>).height;
  return typeof height === 'number' ? height : 0;
}

function createTestSurfaceFactory(surfaces: TestSurface[]): PatchMapEngineSurfaceFactory {
  return () => {
    const surface = new TestSurface();
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
}

class TestSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public hitId: string | null = null;
  public selectionIds: readonly string[] = Object.freeze([]);

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(_input: unknown) {
    return Object.freeze({
      status: 'committed' as const,
      operationCount: 0,
      denseChanged: false,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(_timeMs: number): void {}

  public resize(_width: number, _height: number, _pixelRatio: number): boolean {
    return false;
  }

  public setView(_view: PatchMapSurfaceView): void {}

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(_point: PatchMapPoint): string | null {
    return this.hitId;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({ ...point });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([800, 600] as const),
      backingSize: Object.freeze([800, 600] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.selectionIds = Object.freeze([]);
    return Promise.resolve(true);
  }
}
