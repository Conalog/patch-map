import { describe, expect, it } from 'vitest';

import { PatchMapViewportAuthority } from '../../src/engine/viewport-authority';

describe('PatchMapViewportAuthority', () => {
  it('keeps planned view and resize candidates private until the facade commits them', () => {
    const authority = initializedAuthority();
    const before = authority.snapshot();
    const view = authority.planView([120, 80], 2);

    expect(view).toMatchObject({
      changed: true,
      previous: before.viewport,
      viewport: {
        centerWorld: [120, 80],
        scale: 2,
        screenBounds: [0, 0, 800, 600],
      },
      surfaceView: {
        x: 160,
        y: 140,
        scale: 2,
        rotation: 0,
      },
    });
    expect(authority.snapshot()).toBe(before);

    authority.commitView(view, 3);
    const committed = authority.snapshot();
    expect(committed).not.toBe(before);
    expect(authority.snapshot()).toBe(committed);
    expect(committed.viewport).toEqual(view.viewport);
    expect(authority.resizeProbe().pointerTransformRevision).toBe(3);

    const resize = authority.planResize(1024, 768, 2);
    expect(authority.snapshot()).toMatchObject({
      width: 800,
      height: 600,
      pixelRatio: 1,
    });
    authority.commitResize(resize, 4);
    expect(authority.snapshot()).toMatchObject({
      width: 1024,
      height: 768,
      pixelRatio: 2,
      viewport: {
        centerWorld: [120, 80],
        scale: 2,
        screenBounds: [0, 0, 1024, 768],
      },
    });
    expect(authority.resizeProbe()).toMatchObject({
      pointerTransformRevision: 4,
      resizePolicyApplicationCount: 1,
      blackFrameCount: 0,
      pendingResizeFrame: true,
    });
    authority.completeResizeFrame(true, 0);
    expect(authority.resizeProbe()).toMatchObject({
      blackFrameCount: 1,
      pendingResizeFrame: false,
    });
  });

  it('owns transform, policy, motion, persistence, and destroy cleanup state', () => {
    const authority = initializedAuthority();
    const world = authority.planWorldTransform({
      rotationDegrees: 90,
      flipX: true,
      flipY: false,
    });
    expect(authority.snapshot().world).toEqual({
      rotationDegrees: 0,
      flipX: false,
      flipY: false,
    });
    authority.commitWorldTransform(world, 1);
    expect(authority.snapshot().world).toEqual(world.world);

    const stopped = authority.planPolicy({ op: 'stop', policy: 'pan' });
    expect(authority.hasPolicy('pan')).toBe(true);
    authority.commitPolicy(stopped);
    expect(authority.hasPolicy('pan')).toBe(false);
    expect(authority.policyProbe().callbacksByPolicy.pan).toBe(1);
    expect(authority.policyProbe().enabledPolicies).not.toContain('pan');

    expect(authority.startMotion([0.5, -0.25])).toBe(true);
    const motion = authority.planMotionAdvance(16);
    expect(motion).toMatchObject({ blocked: false });
    expect(motion.blocked ? null : motion.displacementCss[0]).toBeGreaterThan(0);
    authority.commitMotion(motion);
    expect(authority.snapshot().motionActive).toBe(true);

    expect(authority.settle()).toMatchObject({
      changed: true,
      publicationCount: 1,
      persistence: { settled: true },
    });
    const serialized = authority.serialize();
    expect(authority.serialize()).toBe(serialized);
    expect(authority.persistenceProbe()).toMatchObject({
      settledPublicationCount: 1,
      persistenceWriteCount: 1,
      suppressedEquivalentSaveCount: 1,
    });

    authority.destroy();
    expect(authority.policyProbe()).toMatchObject({
      policies: [],
      enabledPolicies: [],
      destroyed: true,
      resources: { motions: 0 },
    });
    expect(authority.snapshot().motionActive).toBe(false);
  });

  it('accepts a surface-applied view without rebuilding a redundant surface transform', () => {
    const authority = initializedAuthority();
    const before = authority.snapshot();
    const effect = authority.planSurfaceAppliedView([410, 320], 1.25);

    expect(effect).toMatchObject({
      changed: true,
      previous: before.viewport,
      viewport: {
        centerWorld: [410, 320],
        scale: 1.25,
      },
      surfaceAlreadyApplied: true,
      surfaceView: null,
    });
    expect(effect.viewport.screenBounds).toBe(before.viewport.screenBounds);
    expect(authority.snapshot()).toBe(before);

    authority.commitView(effect, 2);
    expect(authority.snapshot().viewport).toEqual(effect.viewport);
  });
});

function initializedAuthority(): PatchMapViewportAuthority {
  const authority = new PatchMapViewportAuthority();
  authority.initialize({
    width: 800,
    height: 600,
    pixelRatio: 1,
    zoomLimits: [0.25, 4],
    viewRevision: 0,
  });
  return authority;
}
