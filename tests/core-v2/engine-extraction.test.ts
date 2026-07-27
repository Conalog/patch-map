import { describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  CoreV2EngineError,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceOptions,
  type CoreV2SurfaceView,
} from '../../src/core-v2/engine';
import type { PixiCoreV2RendererLossProbe } from '../../src/core-v2/renderers/types';
import { CoreV2ExtractionSecurityAuthority } from '../../src/core-v2/operations';

class ExtractionSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public captureCount = 0;
  public replaceCanvasAfterCapture = false;
  public rendererLost = false;

  private canvas = {} as HTMLCanvasElement;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);

  public constructor(options: CoreV2SurfaceOptions) {
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  public captureBase64(): Promise<string> {
    this.captureCount += 1;
    if (this.replaceCanvasAfterCapture) {
      this.canvas = {} as HTMLCanvasElement;
    }
    return Promise.resolve('data:image/png;base64,cGl4aQ==');
  }

  public rendererLossProbe(): PixiCoreV2RendererLossProbe {
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

  public load(): void {}

  public publishFrame(): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width ||
      height !== this.height ||
      pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(_view: CoreV2SurfaceView): void {}

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return point;
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 1,
      visiblePrimitiveCount: 1,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

describe('CoreV2Engine published scene extraction', () => {
  it('captures an exact published tuple while retaining the authoritative canvas', async () => {
    let surface: ExtractionSurface | null = null;
    const engine = new CoreV2Engine({
      surfaceFactory: (options) => {
        surface = new ExtractionSurface(options);
        return Promise.resolve(surface);
      },
    });
    await engine.initialize({
      instanceId: 'extract-current',
      width: 800,
      height: 600,
      pixelRatio: 2,
    });
    engine.loadDataset(scene());
    engine.publishFrame(1);
    const before = engine.canvasHandle();

    const extracted = await engine.extractPublishedScene({
      targetTuple: { scene: 1, view: 0, interaction: 0 },
      cssSize: [800, 600],
      mime: 'image/png',
    });

    expect(extracted).toMatchObject({
      capturedTuple: { scene: 1, view: 0, interaction: 0 },
      cssSize: [800, 600],
      backingSize: [1600, 1200],
      mime: 'image/png',
      canvasIdentity: 'initial-canvas',
      authoritativeCanvasRetained: true,
      temporaryImageCount: 0,
      renderTextureCount: 0,
    });
    expect(extracted.dataUrl).toMatch(/^data:image\/png;base64,/u);
    expect(engine.canvasHandle()).toMatchObject({
      element: before.element,
      identity: before.identity,
    });
    expect(surface).toMatchObject({ captureCount: 1 });
    expect(engine.snapshot().pendingWork).toBe(0);
    await engine.destroy();
  });

  it('rejects stale tuples before capture and detects a replaced canvas after capture', async () => {
    let surface: ExtractionSurface | null = null;
    const engine = new CoreV2Engine({
      surfaceFactory: (options) => {
        surface = new ExtractionSurface(options);
        return Promise.resolve(surface);
      },
    });
    await engine.initialize({
      instanceId: 'extract-guard',
      width: 320,
      height: 180,
      pixelRatio: 1,
    });
    engine.loadDataset(scene());
    engine.publishFrame(1);

    await expect(engine.extractPublishedScene({
      targetTuple: { scene: 0, view: 0, interaction: 0 },
      cssSize: [320, 180],
      mime: 'image/png',
    })).rejects.toMatchObject({
      diagnostic: {
        code: 'STALE_TARGET',
        category: 'STALE_TARGET',
        operation: 'extractPublishedScene',
      },
    });
    expect(surface).toMatchObject({ captureCount: 0 });

    const activeSurface = surface as ExtractionSurface | null;
    if (activeSurface === null) throw new Error('missing extraction surface');
    activeSurface.replaceCanvasAfterCapture = true;
    const diagnostics: unknown[] = [];
    engine.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));
    await expect(engine.extractPublishedScene({
      targetTuple: { scene: 1, view: 0, interaction: 0 },
      cssSize: [320, 180],
      mime: 'image/png',
    })).rejects.toBeInstanceOf(CoreV2EngineError);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'RENDERER_LOST',
        category: 'RENDERER_LOST',
        operation: 'extractPublishedScene',
      }),
    ]);
    expect(engine.snapshot().pendingWork).toBe(0);
    await engine.destroy();
  });

  it('rejects a lost renderer before asking PixiJS to capture', async () => {
    let surface: ExtractionSurface | null = null;
    const engine = new CoreV2Engine({
      surfaceFactory: (options) => {
        surface = new ExtractionSurface(options);
        return Promise.resolve(surface);
      },
    });
    await engine.initialize({
      instanceId: 'extract-renderer-loss',
      width: 320,
      height: 180,
      pixelRatio: 1,
    });
    engine.loadDataset(scene());
    engine.publishFrame(1);
    const activeSurface = surface as ExtractionSurface | null;
    if (activeSurface === null) throw new Error('missing extraction surface');
    activeSurface.rendererLost = true;

    await expect(engine.extractPublishedScene({
      targetTuple: { scene: 1, view: 0, interaction: 0 },
      cssSize: [320, 180],
      mime: 'image/png',
    })).rejects.toMatchObject({
      diagnostic: {
        code: 'RENDERER_LOST',
        category: 'RENDERER_LOST',
        operation: 'extractPublishedScene',
      },
    });
    expect(activeSurface.captureCount).toBe(0);
    expect(engine.snapshot().pendingWork).toBe(0);
    await engine.destroy();
  });

  it('fails tainted and unreadable assets during preflight while preserving the live canvas', async () => {
    let surface: ExtractionSurface | null = null;
    const extractionSecurity = new CoreV2ExtractionSecurityAuthority();
    const engine = new CoreV2Engine({
      extractionSecurity,
      surfaceFactory: (options) => {
        surface = new ExtractionSurface(options);
        return Promise.resolve(surface);
      },
    });
    await engine.initialize({
      instanceId: 'extract-security-preflight',
      width: 320,
      height: 180,
      pixelRatio: 1,
    });
    engine.loadDataset(scene());
    engine.publishFrame(1);
    const authoritativeCanvas = engine.canvasHandle().element;
    const request = {
      targetTuple: { scene: 1, view: 0, interaction: 0 },
      cssSize: [320, 180],
      mime: 'image/png',
    } as const;

    extractionSecurity.setAssetReadability('tainted-image', 'tainted');
    await expect(engine.extractPublishedScene(request)).rejects.toMatchObject({
      diagnostic: {
        code: 'EXTRACTION_TAINTED',
        category: 'EXTRACTION_FAILURE',
      },
    });
    expect(surface).toMatchObject({ captureCount: 0 });
    expect(engine.canvasHandle().element).toBe(authoritativeCanvas);
    engine.publishFrame(2);

    extractionSecurity.setAssetReadability('tainted-image', 'readable');
    extractionSecurity.setAssetReadability('failed-image', 'readback-failed');
    await expect(engine.extractPublishedScene(request)).rejects.toMatchObject({
      diagnostic: {
        code: 'EXTRACTION_READBACK_FAILED',
        category: 'EXTRACTION_FAILURE',
      },
    });
    expect(surface).toMatchObject({ captureCount: 0 });
    expect(engine.snapshot().pendingWork).toBe(0);
    expect(engine.canvasHandle().element).toBe(authoritativeCanvas);

    extractionSecurity.clear();
    await expect(engine.extractPublishedScene(request)).resolves.toMatchObject({
      capturedTuple: request.targetTuple,
      authoritativeCanvasRetained: true,
      temporaryImageCount: 0,
      renderTextureCount: 0,
    });
    expect(surface).toMatchObject({ captureCount: 1 });
    await engine.destroy();
  });
});

function scene(): readonly unknown[] {
  return Object.freeze([{
    type: 'rect',
    id: 'rect-b',
    size: { width: 40, height: 30 },
    fill: '#ff8800',
    attrs: { x: 160, y: 40 },
  }]);
}
