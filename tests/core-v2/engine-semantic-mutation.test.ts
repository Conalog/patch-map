import { describe, expect, it } from 'vitest';

import type { SceneSnapshot } from '../../src/core-v1/contracts';
import {
  CoreV2Engine,
  createCoreV2SurfaceGeometrySnapshot,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
  type CoreV2SurfaceReconcileResult,
} from '../../src/core-v2/engine';
import type { CoreV2ReconcileDiagnostic } from '../../src/core-v2/semantic/reconcile';

abstract class SurfaceBase implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public loadCount = 0;
  public frameCount = 0;
  public lastLoadedInput: unknown = null;
  public selectionIds: readonly string[] = Object.freeze([]);
  public view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  private width: number;
  private height: number;
  private pixelRatio: number;

  public constructor(options: Pick<CoreV2SurfaceOptions, 'width' | 'height' | 'pixelRatio'>) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.loadCount += 1;
    this.lastLoadedInput = input;
    this.selectionIds = Object.freeze([]);
  }

  public publishFrame(): void {
    this.frameCount += 1;
  }

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.view = Object.freeze({ ...view });
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as [number, number]),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as [number, number]),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

class MutationSurface extends SurfaceBase {
  public reconcileCount = 0;
  public lastReconcileInput: unknown = null;
  public mode: 'committed' | 'refused' = 'committed';
  public readonly diagnostics: CoreV2ReconcileDiagnostic[] = [];

  public reconcile(input: unknown): CoreV2SurfaceReconcileResult {
    this.reconcileCount += 1;
    this.lastReconcileInput = input;
    return {
      status: this.mode,
      operationCount: this.mode === 'committed' ? 1 : 0,
      denseChanged: this.mode === 'committed',
      diagnostics: this.diagnostics,
    };
  }
}

class LegacySurface extends SurfaceBase {}

describe('CoreV2Engine authoritative semantic mutation', () => {
  it('validates relation hit operands before delegating to an injected surface', async () => {
    const surface = new MutationSurface({ width: 320, height: 240, pixelRatio: 1 });
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'relation-hit-validation', width: 320, height: 240 });
    expect(() => engine.relationHitTestScreen({ x: Number.NaN, y: 0 })).toThrow(
      'relation hit point must contain finite coordinates',
    );
    expect(() => engine.relationHitTestScreen(
      { x: 0, y: 0 },
      { toleranceCssPx: -1 },
    )).toThrow('toleranceCssPx must be finite and non-negative');
    expect(engine.relationHitTestScreen({ x: 0, y: 0 })).toBeNull();
    await engine.destroy();
  });

  it('reconciles endpoint geometry, visibility, and structural links through Engine.patch only', async () => {
    const surface = new MutationSurface({ width: 800, height: 600, pixelRatio: 1 });
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'relations', width: 800, height: 600 });
    engine.loadDataset(relationScene());

    const resized = engine.patch(
      { kind: 'element', id: 'nested-item' },
      { size: { width: 40, height: 20 } },
    );
    const hidden = engine.patch({ kind: 'element', id: 'grid' }, { show: false });
    const shown = engine.patch({ kind: 'element', id: 'grid' }, { show: true });
    const links = engine.patch(
      { kind: 'element', id: 'nested-links' },
      {
        links: [
          { source: 'nested-item', target: 'grid.0.0' },
          { source: 'nested-item', target: 'missing-endpoint' },
        ],
      },
    );

    expect([resized.status, hidden.status, shown.status, links.status]).toEqual([
      'committed',
      'committed',
      'committed',
      'committed',
    ]);
    expect(surface).toMatchObject({ loadCount: 1, reconcileCount: 4 });
    expect(engine.snapshot().revisions.sceneRevision).toBe(5);
    const exported = engine.exportDataset();
    const group = exported[0];
    const grid = exported[1];
    const relations = exported[2];
    expect(group?.type).toBe('group');
    if (group?.type !== 'group') throw new Error('expected relation group');
    expect(group.children[0]).toMatchObject({ id: 'nested-item', size: { width: 40, height: 20 } });
    expect(grid).toMatchObject({ id: 'grid', show: true });
    expect(relations).toMatchObject({
      id: 'nested-links',
      links: [
        { source: 'nested-item', target: 'grid.0.0' },
        { source: 'nested-item', target: 'missing-endpoint' },
      ],
    });
    expect(surface.lastReconcileInput).toBe(exported);
    await engine.destroy();
  });

  it('publishes one incremental component patch only after the surface commit', async () => {
    const surface = new MutationSurface({ width: 800, height: 600, pixelRatio: 1 });
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'mutation', width: 800, height: 600 });
    engine.loadDataset(scene('Before'), { datasetRef: 'semantic-scene' });
    engine.select(['item-a']);
    engine.publishFrame(1);
    const events: unknown[] = [];
    const eventOrder: string[] = [];
    engine.on('change', (event) => {
      events.push(event);
      eventOrder.push('change');
      expect(readCaption(engine)).toMatchObject({ id: 'caption', text: 'After' });
      expect(engine.snapshot().revisions.sceneRevision).toBe(2);
    });
    const patch = { text: 'After', style: { fontSize: 18 } };

    const result = engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'caption' },
      patch,
    );
    eventOrder.push('return');

    expect(result).toMatchObject({
      status: 'committed',
      changed: true,
      target: { kind: 'component', ownerId: 'item-a', id: 'caption' },
      previousRevisions: { sceneRevision: 1, interactionRevision: 1 },
      revisions: { sceneRevision: 2, interactionRevision: 1 },
      applied: [{ kind: 'component', ownerId: 'item-a', id: 'caption' }],
      missing: [],
      unchanged: [],
      publication: 'pending',
      denseOperationCount: 1,
      denseChanged: true,
    });
    expect(events).toEqual([result]);
    expect(eventOrder).toEqual(['change', 'return']);
    expect(surface).toMatchObject({ loadCount: 1, reconcileCount: 1, frameCount: 1 });
    expect(surface.lastReconcileInput).not.toBe(surface.lastLoadedInput);
    expect(engine.snapshot()).toMatchObject({
      datasetRef: 'semantic-scene',
      historyDepth: 0,
      selectionIds: ['item-a'],
      revisions: { sceneRevision: 2, interactionRevision: 1 },
      publishedTuple: { scene: 1, view: 0, interaction: 1 },
    });

    patch.text = 'caller-mutated';
    patch.style.fontSize = 99;
    expect(readCaption(engine)).toMatchObject({ id: 'caption', text: 'After' });
    expect(readCaption(engine).style).toMatchObject({ fontSize: 18 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.applied)).toBe(true);

    engine.publishFrame(2);
    expect(engine.snapshot().publishedTuple).toEqual({ scene: 2, view: 0, interaction: 1 });
    await engine.destroy();
  });

  it('does not reconcile or advance revision for no-op and rejected patches', async () => {
    const surface = new MutationSurface({ width: 640, height: 480, pixelRatio: 1 });
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'validation', width: 640, height: 480 });
    engine.loadDataset(scene('Before'));
    const changes: unknown[] = [];
    const diagnostics: unknown[] = [];
    engine.on('change', (event) => changes.push(event));
    engine.on('diagnostic', (event) => diagnostics.push(event));

    const noOp = engine.patch({ kind: 'element', id: 'item-a' }, {});
    const missing = engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'missing' },
      { show: false },
    );
    const invalid = engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'caption' },
      { text: undefined },
    );
    const structural = engine.patch(
      { kind: 'element', id: 'item-a' },
      { components: [] },
    );

    expect(noOp).toMatchObject({
      status: 'unchanged',
      changed: false,
      revisions: { sceneRevision: 1 },
      unchanged: [{ kind: 'element', id: 'item-a' }],
    });
    expect(missing).toMatchObject({
      status: 'rejected',
      changed: false,
      revisions: { sceneRevision: 1 },
      missing: [{ kind: 'component', ownerId: 'item-a', id: 'missing' }],
      diagnostic: { code: 'MISSING_TARGET', category: 'MISSING_TARGET', missingCount: 1 },
      mutationDiagnostic: { reason: 'missing-target', path: '$.target' },
    });
    expect(invalid).toMatchObject({
      status: 'rejected',
      changed: false,
      revisions: { sceneRevision: 1 },
      diagnostic: { code: 'INVALID_VALUE', category: 'INVALID_INPUT' },
      mutationDiagnostic: { reason: 'invalid-value' },
    });
    expect(structural).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_MUTATION', category: 'INVALID_INPUT' },
      mutationDiagnostic: { reason: 'unsupported-structure' },
    });
    expect(surface).toMatchObject({ loadCount: 1, reconcileCount: 0 });
    expect(engine.snapshot().revisions.sceneRevision).toBe(1);
    expect(changes).toEqual([]);
    expect(diagnostics).toHaveLength(3);
    await engine.destroy();
  });

  it('keeps the previous authority when incremental reconcile refuses the candidate', async () => {
    const surface = new MutationSurface({ width: 640, height: 480, pixelRatio: 1 });
    surface.mode = 'refused';
    surface.diagnostics.push({
      severity: 'error',
      code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED',
      message: 'test refusal',
      path: '$.entities',
    });
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'refusal', width: 640, height: 480 });
    engine.loadDataset(scene('Before'));
    const authorityBefore = engine.exportDataset();
    const changes: unknown[] = [];
    const diagnostics: unknown[] = [];
    engine.on('change', (event) => changes.push(event));
    engine.on('diagnostic', (event) => diagnostics.push(event));
    const snapshotBefore = engine.snapshot();

    const result = engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'caption' },
      { text: 'Refused' },
    );
    surface.diagnostics.push({
      severity: 'warning',
      code: 'UNPROJECTED_SEMANTIC_DELTA',
      message: 'later mutation',
    });

    expect(result).toMatchObject({
      status: 'refused',
      changed: false,
      previousRevisions: { sceneRevision: 1 },
      revisions: { sceneRevision: 1 },
      diagnostic: {
        code: 'CONFLICT',
        category: 'CONFLICT',
        datasetPath: '$.entities',
      },
      reconcileDiagnostics: [{ code: 'ENTITY_ORDER_CHANGE_UNSUPPORTED' }],
    });
    if (result.status !== 'refused') throw new Error('Expected incremental refusal');
    expect(result.reconcileDiagnostics).toHaveLength(1);
    expect(Object.isFrozen(result.reconcileDiagnostics)).toBe(true);
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(engine.snapshot()).toEqual(snapshotBefore);
    expect(readCaption(engine).text).toBe('Before');
    expect(surface).toMatchObject({ loadCount: 1, reconcileCount: 1 });
    expect(changes).toEqual([]);
    expect(diagnostics).toEqual([result.diagnostic]);
    await engine.destroy();
  });

  it('refuses a legacy surface without replacing the scene through load', async () => {
    const surface = new LegacySurface({ width: 640, height: 480, pixelRatio: 1 });
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'legacy', width: 640, height: 480 });
    engine.loadDataset(scene('Before'));
    const authorityBefore = engine.exportDataset();

    const result = engine.patch(
      { kind: 'component', ownerId: 'item-a', id: 'caption' },
      { text: 'No fallback' },
    );

    expect(result).toMatchObject({
      status: 'refused',
      changed: false,
      revisions: { sceneRevision: 1 },
      diagnostic: {
        code: 'UNSUPPORTED_RUNTIME',
        category: 'UNSUPPORTED_RUNTIME',
      },
    });
    expect(surface.loadCount).toBe(1);
    expect(engine.exportDataset()).toBe(authorityBefore);
    expect(readCaption(engine).text).toBe('Before');
    await engine.destroy();
  });

  it('reports the rendered rotated AABB in world and screen geometry', () => {
    const snapshot: SceneSnapshot = {
      revision: 1,
      view: { x: 100, y: 50, scale: 2, rotation: 0 },
      entityCount: 1,
      entities: [{
        ref: { slot: 0, generation: 1 },
        id: 'rotated',
        kind: 'rect',
        bounds: { x: 10, y: 20, width: 40, height: 20 },
        rotation: 90,
        opacity: 1,
        visible: true,
        interactive: true,
        zIndex: 0,
        tags: [],
        data: {},
      }],
      selection: { revision: 1, refs: [{ slot: 0, generation: 1 }] },
    };

    const geometry = createCoreV2SurfaceGeometrySnapshot(snapshot);

    expect(geometry.entities[0]?.worldBounds).toEqual([20, 10, 20, 40]);
    expect(geometry.entities[0]?.screenBounds).toEqual([140, 70, 40, 80]);
    expect(geometry.selectionOverlay?.screenBounds).toEqual([140, 70, 40, 80]);
  });
});

function scene(text: string): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    label: 'Stable item',
    size: { width: 120, height: 80 },
    attrs: { position: { x: 10, y: 20 } },
    components: [{
      type: 'text',
      id: 'caption',
      text,
      style: { fontFamily: 'Inter', fontSize: 14, fill: '#f9fafbff' },
    }],
  }];
}

function relationScene(): readonly unknown[] {
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

function readCaption(engine: CoreV2Engine) {
  const item = engine.exportDataset()[0];
  if (item?.type !== 'item') throw new Error('Expected item-a');
  const caption = item.components.find((component) => component.id === 'caption');
  if (caption?.type !== 'text') throw new Error('Expected item-a/caption');
  return caption;
}
