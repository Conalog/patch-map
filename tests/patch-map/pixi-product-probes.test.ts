import catalogProfiles from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixture-profiles.v1.json';
import { describe, expect, it } from 'vitest';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapEngineSurfaceFactory,
  type PatchMapPoint,
  type PatchMapSurfaceComponentVisualProbe,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
} from '../../src/patch-map/engine';
import type {
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
  PatchMapPixiPublicSurfaceProbe,
  PatchMapPixiRendererLossProbe,
} from '../../src/patch-map/renderers/types';

const RENDER_LANE_ROLES: readonly PatchMapRenderLaneRole[] = [
  'background-geometry',
  'background-assets',
  'ordinary-geometry',
  'relations-dynamic',
  'content-assets',
  'text',
  'interaction-overlay',
];

function renderLanes(): PatchMapRenderLaneSnapshot {
  const lanes = Object.create(null) as Record<
    PatchMapRenderLaneRole,
    PatchMapRenderLaneSnapshot[PatchMapRenderLaneRole]
  >;
  for (const role of RENDER_LANE_ROLES) {
    lanes[role] = Object.freeze({
      role,
      label: `PatchMap / ${role}`,
      renderObjectCount: role === 'ordinary-geometry' ? 1 : 0,
      visiblePrimitiveCount: role === 'ordinary-geometry' ? 1 : 0,
    });
  }
  return Object.freeze(lanes);
}

class PixiProbeSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public lossState: PatchMapPixiRendererLossProbe['state'] = 'healthy';
  public forceLossCount = 0;
  private readonly lanes = renderLanes();

  public load(): void {}

  public publishFrame(): void {
    if (this.lossState === 'lost' || this.lossState === 'restored-pending-frame') {
      this.lossState = 'healthy';
    }
  }

  public resize(): boolean {
    return false;
  }

  public setView(): void {}

  public select(): void {}

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return point;
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([800, 600] as const),
      backingSize: Object.freeze([800, 600] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 1,
      visiblePrimitiveCount: 1,
    });
  }

  public componentVisualProbe(): PatchMapSurfaceComponentVisualProbe {
    return Object.freeze({
      target: Object.freeze({ ownerId: 'item-a', componentId: 'bar' }),
      semanticOwnerId: 'item-a',
      entityId: 'item-a/bar',
      logicalIdentity: 'component:item-a/bar',
      componentType: 'bar',
      renderRole: 'ordinary-geometry',
      entityKind: 'bar',
      geometry: Object.freeze({
        localBounds: Object.freeze([0, 0, 60, 10] as const),
        worldBounds: Object.freeze([10, 90, 60, 10] as const),
        visibleBounds: Object.freeze([10, 90, 60, 10] as const),
        visible: true,
        interactive: true,
      }),
      publication: Object.freeze({ rendererFacts: 'current' }),
      sceneImage: null,
      rendererPaint: Object.freeze({
        entityId: 'item-a/bar',
        lane: 'ordinary-geometry',
        rendererKind: 'mesh',
        primitiveCount: 1,
        renderObjectCount: 1,
        packedTint: 0x00aa66ff,
        rgbTint: 0x00aa66,
        alpha: 1,
      }),
      renderLanes: this.lanes,
    });
  }

  public pixiPublicSurfaceProbe(): PatchMapPixiPublicSurfaceProbe {
    return Object.freeze({
      rendererLibrary: 'pixi.js-v8',
      rendererVersion: '8.test',
      backend: 'webgl2',
      applicationInitialized: true,
      manualRender: true,
      canvas: Object.freeze({
        authoritative: true,
        attached: true,
        patchMapProduct: 'patch-map',
      }),
      stage: Object.freeze({
        label: 'PatchMap',
        authoritative: true,
        discoverableByDevTools: true,
        worldAttached: true,
        childCount: 1,
      }),
      aggregateLayers: Object.freeze(RENDER_LANE_ROLES.map((role) => this.lanes[role])),
    });
  }

  public rendererLossProbe(): PatchMapPixiRendererLossProbe {
    return Object.freeze({
      backend: 'webgl2',
      webGLVersion: 2,
      state: this.destroyed ? 'destroyed' : this.lossState,
      contextLost: this.lossState === 'lost',
      lossEventCount: this.forceLossCount,
      restorationEventCount: 0,
      recoveredFrameCount: 0,
      listenerCount: this.destroyed ? 0 : 2,
      lastLossFrame: this.forceLossCount === 0 ? null : 1,
      lastRecoveryFrame: null,
      destroyed: this.destroyed,
    });
  }

  public forceRendererLoss(): boolean {
    this.forceLossCount += 1;
    this.lossState = 'lost';
    return true;
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

function createProbeEngine(): Readonly<{
  engine: PatchMap;
  options: PatchMapSurfaceOptions[];
  surface: PixiProbeSurface;
}> {
  const options: PatchMapSurfaceOptions[] = [];
  const surface = new PixiProbeSurface();
  const factory: PatchMapEngineSurfaceFactory = (next) => {
    options.push(next);
    return Promise.resolve(surface);
  };
  return Object.freeze({
    engine: new PatchMap({ surfaceFactory: factory }),
    options,
    surface,
  });
}

describe('PatchMap public PixiJS product probes', () => {
  it('binds a normative WebGL2 request and exposes detached Application/stage facts', async () => {
    const { engine, options } = createProbeEngine();
    await engine.initialize({
      instanceId: 'pixi-public-probe',
      width: 800,
      height: 600,
      backend: 'webgl2',
      devtools: true,
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      backend: 'webgl2',
      preference: 'webgl',
      requireWebGL2: true,
      devtools: true,
    });
    expect(engine.pixiPublicSurfaceProbe()).toMatchObject({
      rendererLibrary: 'pixi.js-v8',
      backend: 'webgl2',
      applicationInitialized: true,
      manualRender: true,
      lifecycle: 'ready-empty',
      canvasCount: 1,
      canvas: { authoritative: true },
      stage: {
        authoritative: true,
        discoverableByDevTools: true,
        worldAttached: true,
      },
    });

    await engine.destroy();
  });

  it('rejects WebGL1 before allocating a surface', async () => {
    const { engine, options } = createProbeEngine();

    await expect(engine.initialize({
      instanceId: 'pixi-webgl1-rejected',
      width: 800,
      height: 600,
      backend: 'webgl1',
    })).rejects.toMatchObject({
      diagnostic: {
        code: 'UNSUPPORTED_RUNTIME',
        category: 'UNSUPPORTED_RUNTIME',
        operation: 'initialize',
      },
    });
    expect(options).toHaveLength(0);
    expect(engine.snapshot()).toMatchObject({
      lifecycle: 'new',
      resources: { canvasCount: 0 },
    });

    await engine.destroy();
  });

  it('maps a logical component to detached aggregate renderer ownership', async () => {
    const { engine } = createProbeEngine();
    await engine.initialize({
      instanceId: 'pixi-logical-owner',
      width: 800,
      height: 600,
      backend: 'webgl2',
    });
    engine.loadDataset(catalogProfiles.datasets['interactive-scene'], {
      datasetRef: 'interactive-scene',
    });

    expect(engine.aggregateRenderOwnerProbe({
      ownerId: 'item-a',
      componentId: 'bar',
    })).toMatchObject({
      target: { ownerId: 'item-a', componentId: 'bar' },
      logicalTarget: {
        id: 'bar',
        ownerId: 'item-a',
        type: 'bar',
        rendererObjectCount: 0,
      },
      entityId: 'item-a/bar',
      aggregateRenderOwnerId: 'render-owner:item-a/bar',
      rendererKind: 'mesh',
      renderLane: {
        role: 'ordinary-geometry',
        renderObjectCount: 1,
      },
      worldBounds: [10, 90, 60, 10],
      visible: true,
    });

    await engine.destroy();
  });

  it('owns a single loss fixture and publishes one recovered product frame', async () => {
    const { engine, surface } = createProbeEngine();
    await engine.initialize({
      instanceId: 'pixi-loss-probe',
      width: 800,
      height: 600,
      backend: 'webgl2',
    });

    expect(engine.rendererLossProbe()).toMatchObject({
      backend: 'webgl2',
      state: 'healthy',
      listenerCount: 2,
      canvasCount: 1,
    });
    expect(engine.forceRendererLoss()).toBe(true);
    expect(surface.forceLossCount).toBe(1);
    expect(engine.rendererLossProbe()).toMatchObject({
      state: 'lost',
      contextLost: true,
      lossEventCount: 1,
    });
    engine.publishFrame(16.666667);
    expect(engine.rendererLossProbe()).toMatchObject({
      state: 'healthy',
      contextLost: false,
    });

    await engine.destroy();
    expect(engine.rendererLossProbe()).toMatchObject({
      backend: 'webgl2',
      webGLVersion: 2,
      state: 'destroyed',
      listenerCount: 0,
      canvasCount: 0,
      destroyed: true,
    });
    expect(surface.rendererLossProbe()).toMatchObject({
      state: 'destroyed',
      listenerCount: 0,
      destroyed: true,
    });
  });
});
