import { describe, expect, it } from 'vitest';

import { PatchMap } from '../../src/engine';
import { createPatchMapSemanticProbe } from '../../src/semantic/probe';
import { materializePatchMapDataset } from '../../src/semantic/dataset';
import type {
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapSurfaceDebug,
  PatchMapSurfaceOptions,
} from '../../src/engine/contracts';
import type { PatchMapPoint } from '../../src/engine/surface-contract';

class ProbeSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public selectionIds: readonly string[] = Object.freeze([]);
  public activeAnimationCount = 0;
  private width: number;
  private height: number;
  private pixelRatio: number;

  public constructor(options: PatchMapSurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(): void {
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

  public publishFrame(): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(): void {}

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return Object.freeze({ ...point });
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as [number, number]),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as [number, number]),
      selectionIds: this.selectionIds,
      activeAnimationCount: this.activeAnimationCount,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

function createSurfaceFactory(): Readonly<{
  factory: PatchMapEngineSurfaceFactory;
  surfaces: ProbeSurface[];
}> {
  const surfaces: ProbeSurface[] = [];
  const factory: PatchMapEngineSurfaceFactory = (options) => {
    const surface = new ProbeSurface(options);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
  return { factory, surfaces };
}

function freezeRecursively<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) freezeRecursively(Reflect.get(value, key), seen);
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value)
    && Reflect.ownKeys(value).every((key) => isDeepFrozen(Reflect.get(value, key), seen));
}

describe('PatchMap actual-only semantic product probe', () => {
  it('reports deterministic preorder hierarchy, text integrity, and converted paint intent', () => {
    const input = freezeRecursively([
      {
        type: 'group',
        id: 'root',
        attrs: { x: 5, scaleX: 1, scaleY: 1 },
        children: [
          {
            type: 'item',
            id: 'item-a',
            locked: true,
            size: { width: 100, height: 80 },
            padding: 2,
            components: [
              {
                type: 'text',
                id: 'label',
                show: false,
                text: `broken\ud800`,
                // Dotted semantic paths remain valid paint intent even when a
                // theme cannot resolve them; arbitrary color-like strings are
                // rejected earlier by the strict dataset boundary.
                tint: 'brand.missing',
                style: { fill: '#336699' },
              },
              {
                type: 'bar',
                id: 'level',
                source: { type: 'rect', fill: 'red' },
                size: { width: '50%', height: 20 },
              },
            ],
          },
          {
            type: 'text',
            id: 'standalone',
            text: '\ud83d\ude00',
            style: { fill: 'rgb(1,2,3)' },
            size: { width: 40, height: 20 },
          },
        ],
      },
      {
        type: 'rect',
        id: 'rect-a',
        size: 10,
        fill: [1, 0, 0, 0.5],
      },
    ]);
    const callerBefore = JSON.stringify(input);
    const firstMaterialized = materializePatchMapDataset(input);
    const secondMaterialized = materializePatchMapDataset(input);

    const first = createPatchMapSemanticProbe(firstMaterialized, {
      lifecycle: 'scene-ready',
      datasetRef: 'probe-scene',
      interactionMode: 'select',
      selectionIds: ['item-a'],
      activeAnimationCount: 1,
      historyDepth: 0,
    });
    const second = createPatchMapSemanticProbe(secondMaterialized, {
      lifecycle: 'scene-ready',
      datasetRef: 'probe-scene',
      interactionMode: 'select',
      selectionIds: ['item-a'],
      activeAnimationCount: 1,
      historyDepth: 0,
    });

    expect(first.dataset).toMatchObject({
      state: 'loaded',
      ref: 'probe-scene',
      semanticHash: firstMaterialized.semanticHash,
      rootIds: ['root', 'rect-a'],
      graphDeepFrozen: true,
    });
    expect(first.scene.nodes.map((node) => node.target)).toEqual([
      { kind: 'element', id: 'root' },
      { kind: 'element', id: 'item-a' },
      { kind: 'component', ownerId: 'item-a', id: 'label' },
      { kind: 'component', ownerId: 'item-a', id: 'level' },
      { kind: 'element', id: 'standalone' },
      { kind: 'element', id: 'rect-a' },
    ]);
    expect(first.scene).toMatchObject({
      elementTypes: ['group', 'item', 'text', 'rect'],
      componentTypes: ['bar', 'text'],
      counts: {
        rootElements: 2,
        elements: 4,
        components: 2,
        hierarchyEdges: 4,
        maxDepth: 2,
        hiddenLogicalComponents: 1,
      },
    });
    expect(first.scene.nodes[2]).toMatchObject({
      authoredShow: false,
      visible: false,
      locked: true,
      parent: { kind: 'element', id: 'item-a' },
    });
    expect(first.geometry).toMatchObject({ allFinite: true, nonFiniteValueCount: 0 });
    expect(first.geometry.finiteValueCount).toBeGreaterThan(0);
    expect(first.text).toEqual({
      sourceCount: 2,
      codeUnitCount: 9,
      sourcesWithUnpairedSurrogate: 1,
      unpairedSurrogateCount: 1,
    });
    expect(first.paint).toMatchObject({ intentCount: 7, resolvedCount: 6, unresolvedCount: 1 });
    expect(first.paint.intents).toContainEqual({
      path: '$[0].children[0].components[0].tint',
      role: 'tint',
      resolved: false,
    });
    expect(first.paint.intents).toContainEqual({
      path: '$[1].fill',
      role: 'fill',
      resolved: true,
      rgba: [255, 0, 0, 128],
    });
    expect(first.interaction).toEqual({
      mode: 'select',
      selectionIds: ['item-a'],
      activeAnimationCount: 1,
    });
    expect(first.history).toEqual({ depth: 0 });
    expect('corruptCount' in first.history).toBe(false);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(input)).toBe(callerBefore);
    expect(isDeepFrozen(first)).toBe(true);
  });

  it('preserves generated defaults and owner-qualifies item and grid-template components', () => {
    const materialized = materializePatchMapDataset([
      {
        type: 'item',
        size: 10,
        components: [{ type: 'text' }],
      },
      {
        type: 'grid',
        id: 'grid-a',
        cells: [[1]],
        item: {
          size: 10,
          components: [{ type: 'icon', source: 'fixture-icon', size: 4 }],
        },
      },
    ]);

    const probe = createPatchMapSemanticProbe(materialized, { lifecycle: 'scene-ready' });

    expect(probe.scene.nodes.map((node) => node.target)).toEqual([
      { kind: 'element', id: '@element:$[0]' },
      { kind: 'component', ownerId: '@element:$[0]', id: '@component:0' },
      { kind: 'element', id: 'grid-a' },
      { kind: 'component', ownerId: 'grid-a', id: '@component:0' },
    ]);
    expect(probe.scene.nodes.every((node) => node.authoredShow && node.visible && !node.locked)).toBe(true);
    expect(probe.scene).toMatchObject({
      elementTypes: ['grid', 'item'],
      componentTypes: ['icon', 'text'],
      counts: { rootElements: 2, elements: 2, components: 2, hierarchyEdges: 2 },
    });
    expect(probe.paint).toMatchObject({ intentCount: 3, resolvedCount: 3, unresolvedCount: 0 });
  });

  it('exposes only interaction and history facts the engine currently owns', async () => {
    const { factory, surfaces } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });

    expect(engine.semanticProbe()).toMatchObject({
      lifecycle: 'new',
      dataset: { state: 'absent', ref: null, semanticHash: null },
      interaction: { mode: 'select', selectionIds: [], activeAnimationCount: 0 },
      history: { depth: 0 },
    });

    await engine.initialize({ instanceId: 'probe-engine', width: 320, height: 200 });
    engine.loadDataset([{ type: 'rect', id: 'selected', size: 10 }], { datasetRef: 'selected-scene' });
    engine.select(['selected']);
    surfaces[0]!.activeAnimationCount = 2;

    const loaded = engine.semanticProbe();
    expect(loaded).toMatchObject({
      lifecycle: 'scene-ready',
      dataset: { state: 'loaded', ref: 'selected-scene' },
      interaction: { mode: 'select', selectionIds: ['selected'], activeAnimationCount: 2 },
      history: { depth: 0 },
    });
    expect('activeGestureCount' in loaded.interaction).toBe(false);
    expect('corruptCount' in loaded.history).toBe(false);
  });

  it('distinguishes an authoritative empty dataset from destroyed state', async () => {
    const { factory } = createSurfaceFactory();
    const engine = new PatchMap({ surfaceFactory: factory });
    await engine.initialize({ instanceId: 'probe-empty', width: 320, height: 200 });

    const load = engine.loadDataset([], { datasetRef: 'empty-scene' });
    const empty = engine.semanticProbe();
    expect(empty).toMatchObject({
      lifecycle: 'ready-empty',
      dataset: {
        state: 'empty',
        ref: 'empty-scene',
        semanticHash: load.semanticHash,
        rootIds: [],
      },
      scene: { counts: { rootElements: 0, elements: 0, components: 0, hierarchyEdges: 0 } },
    });

    expect(await engine.destroy()).toBe(true);
    const destroyed = engine.semanticProbe();
    expect(destroyed).toMatchObject({
      lifecycle: 'destroyed',
      dataset: { state: 'destroyed', ref: null, semanticHash: null, rootIds: [] },
      interaction: { selectionIds: [], activeAnimationCount: 0 },
      scene: { counts: { rootElements: 0, elements: 0, components: 0, hierarchyEdges: 0 } },
    });
    expect(isDeepFrozen(destroyed)).toBe(true);
  });
});
