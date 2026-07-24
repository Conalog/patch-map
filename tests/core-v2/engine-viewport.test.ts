import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceGeometrySnapshot,
  type CoreV2SurfaceOptions,
  type CoreV2SurfaceViewportInput,
  type CoreV2SurfaceView,
} from '../../src/core-v2/engine';
import type { CoreV2ViewportPolicy } from '../../src/core-v2/viewport';

describe('CoreV2Engine viewport authority', () => {
  const engines: CoreV2Engine[] = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.destroy()));
  });

  it('keeps cursor and pinch anchors stable while pan and deceleration use one view owner', async () => {
    const { engine } = await createEngine(engines, 'viewport-navigation');
    const anchor = { x: 520, y: 360 };

    const pan = engine.panViewport([40, -20], 'pointer');
    expect(pan).toMatchObject({
      changed: true,
      blocked: false,
      viewport: { centerWorld: [360, 320] },
    });

    const beforeWheel = engine.screenToWorld(anchor);
    const wheel = engine.zoomViewportAt({
      factor: 1.5,
      anchorCss: [anchor.x, anchor.y],
      source: 'modifier-wheel',
    });
    const afterWheel = engine.screenToWorld(anchor);
    expect(wheel.viewport.scale).toBe(1.5);
    expectPointClose(afterWheel, beforeWheel);

    const beforePinch = engine.screenToWorld(anchor);
    engine.zoomViewportAt({
      factor: 1.25,
      anchorCss: [anchor.x, anchor.y],
      source: 'pinch',
    });
    expectPointClose(engine.screenToWorld(anchor), beforePinch);

    expect(engine.startViewportDeceleration([0.5, -0.25])).toBe(true);
    engine.advanceViewportMotion(16);
    engine.advanceViewportMotion(32);
    engine.advanceViewportMotion(64);
    engine.advanceViewportMotion(128);
    engine.advanceViewportMotion(256);
    const settled = engine.settleViewport();
    expect(settled).toMatchObject({
      changed: true,
      publicationCount: 1,
      persistence: { settled: true },
    });
    expect(engine.viewportProbe().scale).toBeGreaterThanOrEqual(0.25);
    expect(engine.viewportProbe().scale).toBeLessThanOrEqual(4);
  });

  it('publishes root surface gestures through the same revision and persistence authority', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-root-input');
    const events: CoreV2SurfaceViewportInput[] = [];
    const unbind = engine.on('viewChanged', (event) => {
      if (
        event.source === 'pointer' ||
        event.source === 'middle-pointer' ||
        event.source === 'wheel'
      ) {
        events.push(Object.freeze({
          source: event.source,
          centerWorld: event.viewport.centerWorld,
          scale: event.viewport.scale,
        }));
      }
    });
    const before = engine.snapshot().revisions;

    surface.emitViewportInput({
      source: 'middle-pointer',
      centerWorld: [240, 180],
      scale: 2,
    });

    expect(engine.viewportProbe()).toMatchObject({
      centerWorld: [240, 180],
      scale: 2,
    });
    expect(engine.snapshot().revisions).toMatchObject({
      sceneRevision: before.sceneRevision,
      viewRevision: before.viewRevision + 1,
      interactionRevision: before.interactionRevision,
    });
    expect(engine.screenToWorld({ x: 400, y: 300 })).toEqual({ x: 240, y: 180 });
    expect(events).toEqual([{
      source: 'middle-pointer',
      centerWorld: [240, 180],
      scale: 2,
    }]);
    expect(engine.settleViewport().changed).toBe(true);
    expect(engine.serializeViewport()).toMatchObject({
      centerWorld: [240, 180],
      scale: 2,
    });
    expect(surface.viewportInputBindingCount).toBe(1);

    unbind();
    await engine.destroy();
    expect(surface.viewportInputBindingCount).toBe(0);
  });

  it('focuses and fits hierarchy-aware contributors without moving on empty or invalid input', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-targets');
    engine.loadDataset(catalogProfiles.datasets['all-kinds-scene']);
    engine.setViewport({ centerWorld: [0, 0], scale: 2 });

    const explicit = engine.focusViewport({ targets: ['rect-b'] });
    expect(explicit).toMatchObject({
      status: 'applied',
      contributors: [expect.objectContaining({ id: 'rect-b' })],
      viewport: { scale: 2 },
    });
    expect(screenBoundsCenter(surface.geometrySnapshot().entities, 'rect-b')).toEqual([400, 300]);
    expect(engine.focusViewport({ targets: ['links'] }).contributors.map(({ id }) => id))
      .toEqual(['item-a', 'rect-b']);
    expect(engine.focusViewport({
      targets: ['group-a'],
      rejectIds: ['rect-b'],
    }).contributors.map(({ id }) => id)).toEqual(['item-a']);

    const beforeEmpty = engine.viewportProbe();
    expect(engine.focusViewport({ targets: ['missing'] })).toMatchObject({
      status: 'empty',
      applied: [],
      missing: ['missing'],
    });
    expect(engine.viewportProbe()).toEqual(beforeEmpty);

    engine.setWorldTransform({ rotationDegrees: 90, flipX: true, flipY: false });
    const fit = engine.fitViewport({
      targets: ['item-a', 'rect-b'],
      paddingCssPx: [20, 30],
    });
    expect(fit).toMatchObject({
      status: 'applied',
      paddingCssPx: [20, 30],
    });
    expect(fit.viewport.scale).toBeGreaterThan(0);
    expect(targetsInsideViewport(
      surface.geometrySnapshot().entities,
      ['item-a', 'rect-b'],
      [800, 600],
    )).toBe(true);

    const beforeInvalid = engine.viewportProbe();
    expect(() => engine.fitViewport({
      targets: ['item-a'],
      paddingCssPx: [-1, 16],
    })).toThrow('viewport padding must contain two finite non-negative values');
    expect(engine.viewportProbe()).toEqual(beforeInvalid);

    expect(engine.resize(1024, 768, 1)).toBe(true);
    expect(targetsInsideViewport(
      surface.geometrySnapshot().entities,
      ['item-a', 'rect-b'],
      [1024, 768],
    )).toBe(true);
  });

  it('preserves authored world angles and correlates each changed resize to one current pointer transform', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-world-transform');
    engine.loadDataset(catalogProfiles.datasets['all-kinds-scene']);
    engine.setViewport({ centerWorld: [200, 150], scale: 1 });

    expect(engine.setWorldTransform({
      rotationDegrees: 90,
      flipX: false,
      flipY: false,
    })).toEqual({
      rotationDegrees: 90,
      flipX: false,
      flipY: false,
    });
    expect(engine.setWorldTransform({
      rotationDegrees: 45,
      flipX: true,
      flipY: false,
    })).toEqual({
      rotationDegrees: 45,
      flipX: true,
      flipY: false,
    });
    expect(engine.setWorldTransform({
      rotationDegrees: 450,
      flipX: true,
      flipY: true,
    })).toEqual({
      rotationDegrees: 450,
      flipX: true,
      flipY: true,
    });
    expect(engine.viewportProbe().centerWorld).toEqual([200, 150]);
    expect(engine.screenToWorld({ x: 400, y: 300 })).toEqual({ x: 200, y: 150 });

    const beforeInvalid = engine.viewportTransformProbe();
    expect(() => engine.setWorldTransform({
      rotationDegrees: Number.NaN,
      flipX: false,
      flipY: false,
    })).toThrow('rotationDegrees must be finite');
    expect(engine.viewportTransformProbe()).toEqual(beforeInvalid);

    const setViewCountBefore = surface.setViewCount;
    const resizeProbeBefore = engine.viewportTransformProbe();
    expect(engine.resize(1024, 768, 2)).toBe(true);
    expect(surface.setViewCount - setViewCountBefore).toBe(1);
    expect(engine.viewportTransformProbe()).toMatchObject({
      pointerTransformRevision: engine.snapshot().revisions.viewRevision,
      resizePolicyApplicationCount:
        resizeProbeBefore.resizePolicyApplicationCount + 1,
      blackFrameCount: 0,
      pendingResizeFrame: true,
      surface: {
        canvasCount: 1,
        cssSize: [1024, 768],
        backingSize: [2048, 1536],
      },
    });

    engine.publishFrame(1);
    expect(engine.viewportTransformProbe()).toMatchObject({
      pointerTransformRevision: engine.snapshot().revisions.viewRevision,
      blackFrameCount: 0,
      pendingResizeFrame: false,
    });
    const afterPublishedResize = engine.viewportTransformProbe();
    expect(engine.resize(1024, 768, 2)).toBe(false);
    expect(engine.viewportTransformProbe()).toEqual(afterPublishedResize);

    surface.visiblePrimitiveCount = 0;
    expect(engine.resize(900, 700, 1)).toBe(true);
    engine.publishFrame(2);
    expect(engine.viewportTransformProbe()).toMatchObject({
      blackFrameCount: 1,
      pendingResizeFrame: false,
    });
  });

  it('settles and serializes once, restores valid state, and falls back from invalid state', async () => {
    const first = await createEngine(engines, 'viewport-persist-1');
    first.engine.loadDataset(catalogProfiles.datasets['all-kinds-scene']);
    first.engine.setViewport({ centerWorld: [200, 150], scale: 1.5 });
    expect(first.engine.settleViewport().changed).toBe(true);
    expect(first.engine.settleViewport().changed).toBe(false);
    const saved = first.engine.serializeViewport();
    expect(first.engine.serializeViewport()).toBe(saved);
    expect(first.engine.viewportPersistenceProbe()).toMatchObject({
      settledPublicationCount: 1,
      persistenceWriteCount: 1,
      equivalentSaveCount: 0,
      suppressedEquivalentSaveCount: 1,
    });

    const second = await createEngine(engines, 'viewport-persist-2');
    second.engine.loadDataset(catalogProfiles.datasets['all-kinds-scene']);
    expect(second.engine.restoreViewport(saved)).toMatchObject({
      status: 'restored',
      viewport: { centerWorld: [200, 150], scale: 1.5 },
    });
    const fallback = second.engine.restoreViewport({
      centerWorld: [Number.NaN, 150],
      scale: 0,
    });
    expect(fallback).toMatchObject({
      status: 'fallback:auto-fit',
      fit: { status: 'applied' },
    });
    expect(Number.isFinite(fallback.viewport.scale)).toBe(true);
    expect(fallback.viewport.scale).toBeGreaterThan(0);
  });

  it('applies idempotent policy lifecycle and exposes zero owned resources after destroy', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-policy');
    const initial = engine.viewportPolicyProbe();

    engine.configureViewportPolicy({ op: 'stop', policy: 'pan' });
    expect(engine.panViewport([20, 10], 'pointer')).toMatchObject({
      changed: false,
      blocked: true,
    });
    engine.configureViewportPolicy({ op: 'start', policy: 'pan' });
    const doubleStart = engine.configureViewportPolicy({ op: 'start', policy: 'pan' });
    expect(doubleStart.callbacksByPolicy.pan).toBe(1);

    engine.configureViewportPolicy({ op: 'temporary', policy: 'edge-pan' });
    expect(engine.viewportPolicyProbe().enabledPolicies).toContain('edge-pan');
    engine.configureViewportPolicy({ op: 'restore-temporary' });
    expect(engine.viewportPolicyProbe().policies).toEqual(initial.policies);
    expect(engine.viewportPolicyProbe().enabledPolicies).toEqual(initial.enabledPolicies);

    engine.configureViewportPolicy({ op: 'remove', policy: 'pan' });
    expect(engine.panViewport([20, 10], 'pointer').blocked).toBe(true);
    engine.configureViewportPolicy({ op: 'cancel-all' });
    expect(surface.cancelCount).toBeGreaterThan(0);
    await engine.destroy();
    expect(engine.viewportPolicyProbe()).toMatchObject({
      policies: [],
      enabledPolicies: [],
      destroyed: true,
      resources: {
        tickers: 0,
        listeners: 0,
        captures: 0,
        motions: 0,
        cursors: 0,
      },
    });
  });

  it('rebinds a host lifecycle without rebuilding the GPU surface and invalidates old target authority', async () => {
    const { engine, surface } = await createEngine(engines, 'viewport-host-rebind');
    engine.loadDataset(catalogProfiles.datasets['all-kinds-scene']);
    const resolved = engine.resolveTarget({ kind: 'element', id: 'item-a' });
    expect(resolved).not.toBeNull();
    if (resolved === null) throw new Error('expected item-a target authority');
    engine.select(['item-a']);
    engine.startViewportDeceleration([0.5, -0.25]);
    const before = engine.snapshot();

    const rebound = engine.rebindHostLifecycle(2);

    expect(rebound).toMatchObject({
      lifecycleGeneration: 2,
      sceneRevision: before.revisions.sceneRevision,
      canvasCount: 1,
      selectionIds: [],
      revisions: {
        lifecycleGeneration: 2,
        sceneRevision: before.revisions.sceneRevision,
      },
    });
    expect(surface.destroyed).toBe(false);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'scene-ready',
      revisions: {
        lifecycleGeneration: 2,
        sceneRevision: before.revisions.sceneRevision,
      },
      selectionIds: [],
      resources: { canvasCount: 1 },
    });
    expect(engine.advanceViewportMotion(16)).toMatchObject({
      changed: false,
      blocked: true,
    });
    expect(engine.patchResolved(resolved, {})).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'STALE_TARGET' },
    });
    expect(() => engine.rebindHostLifecycle(4)).toThrow(
      'host lifecycle generation must advance by exactly one',
    );
  });

  it('cancels a cooperative load before surface publication when the host lifecycle advances', async () => {
    let releaseLoad!: () => void;
    let markLoadEntered!: () => void;
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const loadEntered = new Promise<void>((resolve) => {
      markLoadEntered = resolve;
    });
    let surface: CooperativeViewportSurface | null = null;
    const engine = new CoreV2Engine({
      surfaceFactory: (options) => {
        surface = new CooperativeViewportSurface(
          options,
          loadGate,
          markLoadEntered,
        );
        return Promise.resolve(surface);
      },
    });
    engines.push(engine);
    await engine.initialize({
      instanceId: 'viewport-cooperative-load',
      width: 800,
      height: 600,
      pixelRatio: 1,
    });

    const pending = engine.loadDatasetAsync(
      catalogProfiles.datasets['all-kinds-scene'],
    );
    await loadEntered;
    expect(engine.snapshot().pendingWork).toBe(1);
    engine.rebindHostLifecycle(2);
    releaseLoad();

    await expect(pending).rejects.toMatchObject({
      diagnostic: { code: 'SUPERSEDED', operation: 'loadDatasetAsync' },
    });
    const observedSurface = surface as CooperativeViewportSurface | null;
    if (observedSurface === null) throw new Error('cooperative surface was not created');
    expect(observedSurface.cooperativeCommitCount).toBe(0);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'ready-empty',
      rootIds: [],
      pendingWork: 0,
      revisions: {
        lifecycleGeneration: 2,
        sceneRevision: 0,
      },
    });
  });
});

class ViewportSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public cancelCount = 0;
  public setViewCount = 0;
  public visiblePrimitiveCount = WORLD_ENTITIES.length;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private view: CoreV2SurfaceView;
  private policies: readonly CoreV2ViewportPolicy[] = Object.freeze([]);
  private viewportInputListener:
    | ((input: CoreV2SurfaceViewportInput) => void)
    | null = null;
  private zoomLimits: readonly [number, number] = Object.freeze([0.01, 100]);

  public constructor(options: CoreV2SurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
    this.view = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
  }

  public load(): void {}
  public publishFrame(): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed =
      width !== this.width ||
      height !== this.height ||
      pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: CoreV2SurfaceView): void {
    this.view = Object.freeze({ ...view });
    this.setViewCount += 1;
  }

  public setViewportGesturePolicies(policies: readonly CoreV2ViewportPolicy[]): void {
    this.policies = Object.freeze([...policies]);
  }

  public setViewportZoomLimits(limits: readonly [number, number]): void {
    this.zoomLimits = Object.freeze([limits[0], limits[1]]);
  }

  public bindViewportInput(
    listener: (input: CoreV2SurfaceViewportInput) => void,
  ): () => void {
    if (this.viewportInputListener !== null) {
      throw new Error('viewport input listener already bound');
    }
    this.viewportInputListener = listener;
    return () => {
      if (this.viewportInputListener === listener) this.viewportInputListener = null;
    };
  }

  public get viewportInputBindingCount(): 0 | 1 {
    return this.viewportInputListener === null ? 0 : 1;
  }

  public emitViewportInput(input: CoreV2SurfaceViewportInput): void {
    if (input.scale < this.zoomLimits[0] || input.scale > this.zoomLimits[1]) {
      throw new RangeError('simulated viewport input exceeds zoom limits');
    }
    this.view = Object.freeze({
      ...this.view,
      x: this.width / 2 - input.centerWorld[0] * input.scale,
      y: this.height / 2 - input.centerWorld[1] * input.scale,
      scale: input.scale,
    });
    this.viewportInputListener?.(Object.freeze({
      source: input.source,
      centerWorld: Object.freeze([
        input.centerWorld[0],
        input.centerWorld[1],
      ] as const),
      scale: input.scale,
    }));
  }

  public cancelViewportGestures(): void {
    this.cancelCount += 1;
  }

  public select(): void {}

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    const radians = this.view.rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const orientedX = (point.x - this.view.x) * (this.view.flipX ? -1 : 1);
    const orientedY = (point.y - this.view.y) * (this.view.flipY ? -1 : 1);
    return Object.freeze({
      x: (orientedX * cosine + orientedY * sine) / this.view.scale,
      y: (-orientedX * sine + orientedY * cosine) / this.view.scale,
    });
  }

  public geometrySnapshot(): CoreV2SurfaceGeometrySnapshot {
    const entities = WORLD_ENTITIES.map((entity) => Object.freeze({
      ...entity,
      screenBounds: projectBounds(entity.worldBounds, this.view),
      visibleBounds: entity.worldBounds,
      interactive: true,
    }));
    return Object.freeze({
      revision: 1,
      sceneRevision: 1,
      entities: Object.freeze(entities),
      relations: Object.freeze([
        Object.freeze({
          id: 'links:0',
          relationId: 'links',
          sourceId: 'item-a',
          targetId: 'item-a',
          worldBounds: Object.freeze([10, 20, 100, 80] as const),
          screenBounds: projectBounds([10, 20, 100, 80], this.view),
          visible: true,
          worldEndpoints: Object.freeze([
            Object.freeze([60, 60] as const),
            Object.freeze([60, 60] as const),
          ] as const),
          screenEndpoints: Object.freeze([
            toScreen([60, 60], this.view),
            toScreen([60, 60], this.view),
          ] as const),
        }),
        Object.freeze({
          id: 'links:1',
          relationId: 'links',
          sourceId: 'item-a',
          targetId: 'rect-b',
          worldBounds: Object.freeze([10, 20, 190, 80] as const),
          screenBounds: projectBounds([10, 20, 190, 80], this.view),
          visible: true,
          worldEndpoints: Object.freeze([
            Object.freeze([60, 60] as const),
            Object.freeze([180, 55] as const),
          ] as const),
          screenEndpoints: Object.freeze([
            toScreen([60, 60], this.view),
            toScreen([180, 55], this.view),
          ] as const),
        }),
      ]),
      omittedRelations: Object.freeze([]),
      selectionOverlay: null,
    });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        this.width * this.pixelRatio,
        this.height * this.pixelRatio,
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 1,
      visiblePrimitiveCount: this.visiblePrimitiveCount,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.policies = Object.freeze([]);
    this.viewportInputListener = null;
    return Promise.resolve(true);
  }
}

class CooperativeViewportSurface extends ViewportSurface {
  public cooperativeCommitCount = 0;

  public constructor(
    options: CoreV2SurfaceOptions,
    private readonly loadGate: Promise<void>,
    private readonly markLoadEntered: () => void,
  ) {
    super(options);
  }

  public async loadAsync(
    _input: unknown,
    assertCurrent?: () => void,
  ): Promise<void> {
    this.markLoadEntered();
    await this.loadGate;
    assertCurrent?.();
    this.cooperativeCommitCount += 1;
  }
}

const WORLD_ENTITIES = Object.freeze([
  worldEntity('item-a', 'rect', [10, 20, 100, 80]),
  worldEntity('rect-b', 'rect', [160, 40, 40, 30]),
  worldEntity('grid-a.0.0', 'rect', [300, 40, 48, 48]),
  worldEntity('grid-a.0.1', 'rect', [356, 40, 48, 48]),
  worldEntity('image-a', 'image', [-20, 200, 80, 40]),
  worldEntity('text-c', 'text', [40, 140, 80, 20]),
  worldEntity('zone-a', 'rect', [20, 320, 240, 120]),
]);

async function createEngine(
  engines: CoreV2Engine[],
  instanceId: string,
): Promise<Readonly<{ engine: CoreV2Engine; surface: ViewportSurface }>> {
  let surface: ViewportSurface | null = null;
  const engine = new CoreV2Engine({
    surfaceFactory: (options) => {
      surface = new ViewportSurface(options);
      return Promise.resolve(surface);
    },
  });
  engines.push(engine);
  await engine.initialize({
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
    zoomLimits: [0.25, 4],
  });
  if (surface === null) throw new Error('viewport surface was not created');
  return { engine, surface };
}

function worldEntity(
  id: string,
  kind: string,
  worldBounds: readonly [number, number, number, number],
) {
  return Object.freeze({
    id,
    kind,
    worldBounds: Object.freeze([...worldBounds] as [
      number,
      number,
      number,
      number,
    ]),
    visible: true,
  });
}

function toScreen(
  point: readonly [number, number],
  view: CoreV2SurfaceView,
): readonly [number, number] {
  const scaledX = point[0] * view.scale;
  const scaledY = point[1] * view.scale;
  const radians = view.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze([
    view.x + (scaledX * cosine - scaledY * sine) * (view.flipX ? -1 : 1),
    view.y + (scaledX * sine + scaledY * cosine) * (view.flipY ? -1 : 1),
  ]);
}

function projectBounds(
  bounds: readonly [number, number, number, number],
  view: CoreV2SurfaceView,
): readonly [number, number, number, number] {
  const corners = [
    toScreen([bounds[0], bounds[1]], view),
    toScreen([bounds[0] + bounds[2], bounds[1]], view),
    toScreen([bounds[0] + bounds[2], bounds[1] + bounds[3]], view),
    toScreen([bounds[0], bounds[1] + bounds[3]], view),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return Object.freeze([
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ]);
}

function screenBoundsCenter(
  entities: CoreV2SurfaceGeometrySnapshot['entities'],
  id: string,
): readonly [number, number] {
  const entity = entities.find((candidate) => candidate.id === id);
  if (!entity) throw new Error(`missing geometry ${id}`);
  return Object.freeze([
    entity.screenBounds[0] + entity.screenBounds[2] / 2,
    entity.screenBounds[1] + entity.screenBounds[3] / 2,
  ]);
}

function targetsInsideViewport(
  entities: CoreV2SurfaceGeometrySnapshot['entities'],
  ids: readonly string[],
  viewport: readonly [number, number],
): boolean {
  return ids.every((id) => {
    const entity = entities.find((candidate) => candidate.id === id);
    if (!entity) return false;
    const [left, top, width, height] = entity.screenBounds;
    const right = left + width;
    const bottom = top + height;
    return left >= -1e-9 && top >= -1e-9 &&
      right <= viewport[0] + 1e-9 && bottom <= viewport[1] + 1e-9;
  });
}

function expectPointClose(actual: CoreV2Point, expected: CoreV2Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}
