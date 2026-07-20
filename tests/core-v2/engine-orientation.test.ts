import { describe, expect, it } from 'vitest';

import {
  CoreV2Engine,
  type CoreV2EngineSurface,
  type CoreV2Point,
  type CoreV2SurfaceDebug,
  type CoreV2SurfaceView,
} from '../../src/core-v2/engine';

describe('CoreV2Engine world orientation API', () => {
  it('keeps the viewport center stable and revisions only effective changes', async () => {
    const surface = new OrientationSurface();
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'orientation', width: 200, height: 100 });
    engine.setViewport({ centerWorld: [50, 40], scale: 2 });
    const before = engine.snapshot().revisions.viewRevision;

    expect(engine.setWorldTransform({ rotationDegrees: 90, flipX: true, flipY: false })).toEqual({
      rotationDegrees: 90,
      flipX: true,
      flipY: false,
    });
    expect(surface.view).toMatchObject({ rotation: 90, flipX: true, scale: 2 });
    expect(toScreen([50, 40], surface.view)).toEqual([100, 50]);
    expect(toScreen([60, 40], surface.view)).toEqual([100, 70]);
    expect(engine.snapshot().revisions.viewRevision).toBe(before + 1);

    engine.setWorldTransform({ rotationDegrees: 450, flipX: true, flipY: false });
    expect(engine.snapshot().revisions.viewRevision).toBe(before + 1);
    await engine.destroy();
  });

  it('rejects invalid values without mutating view truth', async () => {
    const surface = new OrientationSurface();
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'orientation-invalid', width: 100, height: 100 });
    const before = engine.snapshot().revisions;

    expect(() => engine.setWorldTransform({ rotationDegrees: Number.NaN, flipX: false, flipY: false }))
      .toThrow('rotationDegrees must be finite');
    expect(engine.snapshot().revisions).toEqual(before);
    await engine.destroy();
  });

  it('does not publish candidate world state when the surface rejects the transform', async () => {
    const surface = new OrientationSurface();
    const engine = new CoreV2Engine({ surfaceFactory: () => Promise.resolve(surface) });
    await engine.initialize({ instanceId: 'orientation-atomic', width: 100, height: 100 });
    const before = engine.snapshot().revisions;
    const viewBefore = surface.view;
    surface.failSetView = true;

    expect(() => engine.setWorldTransform({ rotationDegrees: 90, flipX: true, flipY: true }))
      .toThrow('surface rejected view');
    expect(engine.snapshot().revisions).toEqual(before);
    expect(surface.view).toBe(viewBefore);

    surface.failSetView = false;
    expect(engine.setWorldTransform({ rotationDegrees: 90, flipX: true, flipY: true }))
      .toEqual({ rotationDegrees: 90, flipX: true, flipY: true });
    expect(surface.setViewCalls).toBe(2);
    expect(engine.snapshot().revisions.viewRevision).toBe(before.viewRevision + 1);
    await engine.destroy();
  });
});

class OrientationSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public failSetView = false;
  public setViewCalls = 0;
  public view: CoreV2SurfaceView = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public load(): void {}
  public publishFrame(): void {}
  public resize(): boolean { return false; }
  public setView(view: CoreV2SurfaceView): void {
    this.setViewCalls += 1;
    if (this.failSetView) throw new Error('surface rejected view');
    this.view = Object.freeze({ ...view });
  }
  public select(): void {}
  public hitTestScreen(): string | null { return null; }
  public screenToWorld(point: CoreV2Point): CoreV2Point { return point; }
  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([200, 100] as const),
      backingSize: Object.freeze([200, 100] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
    });
  }
  public destroy(): Promise<boolean> {
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}

function toScreen(point: readonly [number, number], view: CoreV2SurfaceView): readonly [number, number] {
  const x = point[0] * view.scale;
  const y = point[1] * view.scale;
  const radians = view.rotation * Math.PI / 180;
  return Object.freeze([
    Math.round(view.x + (x * Math.cos(radians) - y * Math.sin(radians)) * (view.flipX ? -1 : 1)),
    Math.round(view.y + (x * Math.sin(radians) + y * Math.cos(radians)) * (view.flipY ? -1 : 1)),
  ] as const);
}
