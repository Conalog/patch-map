import { describe, expect, it } from 'vitest';

import {
  PatchMap,
  type PatchMapEngineSurface,
  type PatchMapPoint,
  type PatchMapSurfaceDebug,
  type PatchMapSurfaceOptions,
  type PatchMapSurfaceView,
} from '../../src/patch-map/engine';
import { PatchMapOperationsAuthority } from '../../src/patch-map/operations';
import type { PatchMapPixiRendererLossProbe } from '../../src/patch-map/renderers/types';

class OperationsSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public rendererLost = false;
  private readonly canvas = {} as HTMLCanvasElement;
  private readonly options: PatchMapSurfaceOptions;

  public constructor(options: PatchMapSurfaceOptions) {
    this.options = options;
  }

  public canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  public captureBase64(): Promise<string> {
    return Promise.resolve('data:image/png;base64,cGl4aQ==');
  }

  public load(): void {}

  public publishFrame(): void {}

  public resize(): boolean {
    return false;
  }

  public setView(_view: PatchMapSurfaceView): void {}

  public select(): void {}

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return point;
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.options.width, this.options.height] as const),
      backingSize: Object.freeze([
        this.options.width * this.options.pixelRatio,
        this.options.height * this.options.pixelRatio,
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 2,
      visiblePrimitiveCount: 4,
    });
  }

  public rendererLossProbe(): PatchMapPixiRendererLossProbe {
    return Object.freeze({
      backend: 'webgl2',
      webGLVersion: 2,
      state: this.rendererLost ? 'lost' : 'healthy',
      contextLost: this.rendererLost,
      lossEventCount: this.rendererLost ? 1 : 0,
      restorationEventCount: 0,
      recoveredFrameCount: 0,
      listenerCount: this.destroyed ? 0 : 2,
      lastLossFrame: this.rendererLost ? 1 : null,
      lastRecoveryFrame: null,
      destroyed: this.destroyed,
    });
  }

  public forceRendererLoss(): boolean {
    this.rendererLost = true;
    return true;
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

describe('PatchMap production operations integration', () => {
  it('captures bounded lifecycle state and releases operational callbacks on destroy', async () => {
    let surface: OperationsSurface | null = null;
    const operations = new PatchMapOperationsAuthority({
      collectionEnabled: true,
      telemetryEnabled: true,
      capacity: 100,
      instanceId: 'ops-a',
    });
    const engine = new PatchMap({
      operations,
      surfaceFactory: (options) => {
        surface = new OperationsSurface(options);
        return Promise.resolve(surface);
      },
    });
    const states: string[] = [];
    states.push(engine.runtimeDiagnostics().current?.lifecycle ?? 'missing');
    await engine.initialize({
      instanceId: 'ops-a',
      width: 320,
      height: 180,
      pixelRatio: 1,
    });
    states.push(engine.runtimeDiagnostics().current?.lifecycle ?? 'missing');
    engine.loadDataset(scene());
    engine.publishFrame(1);
    states.push(engine.runtimeDiagnostics().current?.lifecycle ?? 'missing');

    const delivery: string[] = [];
    engine.subscribeOperationalEvent('A', (_event, control) => {
      delivery.push('A');
      control.enqueue('queued-action', () => delivery.push('queued-action'));
    });
    engine.subscribeOperationalEvent('B', () => {
      delivery.push('B');
      throw new Error('fixture-sensitive-value');
    });
    engine.subscribeOperationalEvent('C', () => delivery.push('C'));
    const dispatch = engine.emitOperationalEvent({
      type: 'update',
      operation: 'transact',
      revisionStamp: engine.snapshot().revisions,
      details: { token: 'fixture-sensitive-value' },
    });

    expect(delivery).toEqual(['A', 'B', 'C', 'queued-action']);
    expect(dispatch.callbackFailureCount).toBe(1);
    expect(engine.operationsProbe().lastCallbackFailure?.code).toBe(
      'HOST_CALLBACK_FAILURE',
    );
    expect(JSON.stringify(engine.operationsProbe())).not.toContain(
      'fixture-sensitive-value',
    );

    const lost = surface as OperationsSurface | null;
    if (lost === null) throw new Error('missing operations surface');
    lost.rendererLost = true;
    expect(engine.runtimeDiagnostics().current?.backend.lossState).toBe('lost');
    await engine.destroy();
    const terminal = engine.runtimeDiagnostics();
    states.push(terminal.current?.lifecycle ?? 'missing');

    expect(states).toEqual(['new', 'ready-empty', 'scene-ready', 'destroyed']);
    expect(terminal.records.length).toBeLessThanOrEqual(100);
    expect(terminal.current).toMatchObject({
      instanceId: 'ops-a',
      lifecycle: 'destroyed',
      resources: {
        canvases: 0,
        callbackRegistrations: 0,
      },
      cleanup: {
        destroyed: true,
        released: true,
      },
    });
    expect(engine.operationsProbe()).toMatchObject({
      callbackRegistrations: 0,
      queuedActionCount: 0,
      disposed: true,
    });
  });

  it('returns and observes only a sanitized diagnostic envelope', async () => {
    const operations = new PatchMapOperationsAuthority({
      collectionEnabled: true,
      telemetryEnabled: true,
      instanceId: 'ops-redaction',
    });
    const engine = new PatchMap({
      operations,
      surfaceFactory: (options) => Promise.resolve(new OperationsSurface(options)),
    });
    await engine.initialize({
      instanceId: 'ops-redaction',
      width: 100,
      height: 100,
    });
    const observed: unknown[] = [];
    engine.on('diagnostic', (diagnostic) => observed.push(diagnostic));
    const returned = engine.reportOperationalFailure({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'loadDataset',
      logicalId: 'rect-b',
      recoverable: true,
      details: {
        text: 'fixture-sensitive-value',
        url: 'https://customer.invalid/?token=fixture-sensitive-value',
      },
    });

    expect(observed).toEqual([returned]);
    expect(returned).toMatchObject({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'loadDataset',
      logicalId: 'rect-b',
    });
    expect(JSON.stringify({ observed, returned, evidence: operations.exportEvidence() }))
      .not.toContain('fixture-sensitive-value');
    await engine.destroy();
  });
});

function scene(): readonly unknown[] {
  return [{
    type: 'item',
    id: 'item-a',
    size: { width: 100, height: 80 },
    components: [{
      type: 'text',
      id: 'label',
      text: 'Alpha',
      placement: 'center',
      style: { fontSize: 16, fill: '#111111' },
    }],
  }, {
    type: 'relations',
    id: 'links',
    links: [{ source: 'item-a', target: 'item-a' }],
  }];
}
