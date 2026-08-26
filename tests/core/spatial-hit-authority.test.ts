import { describe, expect, it, vi } from 'vitest';

import {
  PatchMapSpatialHitAuthority,
  isLargePatchMapAnimatedBarBatch,
} from '../../src/core/spatial-hit-authority';
import type {
  SceneDocument,
  TransactionBatch,
} from '../../src/dense/contracts';
import { NoopRenderer } from '../../src/dense/noop-renderer';
import { PatchMapScene } from '../../src/core/scene';

const IDLE_PRESENTATION = Object.freeze({
  activeCount: 0,
  probe: (_entityId: string): null => null,
});

describe('PatchMap spatial hit authority', () => {
  it('keeps dense hits allocation-light and builds the exact fallback lazily', () => {
    const scene = loadedScene();
    const authority = new PatchMapSpatialHitAuthority();
    const snapshotSpy = vi.spyOn(scene, 'snapshot');

    expect(authority.hitTest(
      { x: 5, y: 5 },
      {},
      scene,
      null,
      null,
      IDLE_PRESENTATION,
    )?.slot).toBe(0);
    expect(snapshotSpy).not.toHaveBeenCalled();

    authority.setDenseGeometryCompatible(false);
    expect(authority.hitTest(
      { x: 5, y: 5 },
      {},
      scene,
      null,
      null,
      IDLE_PRESENTATION,
    )?.slot).toBe(0);
    expect(authority.hitTest(
      { x: 5, y: 5 },
      {},
      scene,
      null,
      null,
      IDLE_PRESENTATION,
    )?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(1);

    authority.invalidate();
    expect(authority.hitTest(
      { x: 5, y: 5 },
      {},
      scene,
      null,
      null,
      IDLE_PRESENTATION,
    )?.slot).toBe(0);
    expect(snapshotSpy).toHaveBeenCalledTimes(2);
    expect(scene.destroy()).toBe(true);
  });

  it('owns commit staleness and spatial-animation expiry without changing the commit order', () => {
    const scene = loadedScene();
    const authority = new PatchMapSpatialHitAuthority();
    const animation = Object.freeze({
      operations: Object.freeze([{
        type: 'animate',
        target: 'target',
        property: 'x',
        to: 50,
        durationMs: 100,
        easing: 'linear',
      }]),
    } satisfies TransactionBatch);

    const impact = authority.planCommit(animation, scene, 10);
    scene.commit(animation);
    authority.invalidateFromCommit(impact, false);
    expect(authority.applyCommitProjectionStaleness(impact, scene)).toBe(true);
    authority.retainCommitAnimations(impact);

    expect(authority.debugSnapshot()).toMatchObject({
      staleProjectionIds: ['target'],
      spatialAnimationCount: 1,
    });
    authority.pruneCompletedSpatialAnimations(109);
    expect(authority.debugSnapshot().spatialAnimationCount).toBe(1);
    authority.pruneCompletedSpatialAnimations(110);
    expect(authority.debugSnapshot().spatialAnimationCount).toBe(0);

    const removal = Object.freeze({
      operations: Object.freeze([{ type: 'remove', target: 'target' }]),
    } satisfies TransactionBatch);
    const removalImpact = authority.planCommit(removal, scene, 110);
    scene.commit(removal);
    expect(authority.applyCommitProjectionStaleness(removalImpact, scene)).toBe(true);
    expect(authority.debugSnapshot().staleProjectionIds).toEqual([]);
    expect(scene.destroy()).toBe(true);
  });

  it('keeps the animated-bar prime threshold at the established 1,024 entities', () => {
    expect(isLargePatchMapAnimatedBarBatch(1_023)).toBe(false);
    expect(isLargePatchMapAnimatedBarBatch(1_024)).toBe(true);
  });
});

function loadedScene(): PatchMapScene {
  const scene = new PatchMapScene({ renderer: new NoopRenderer() });
  scene.load(Object.freeze({
    version: 1,
    entities: Object.freeze([{
      kind: 'rect',
      id: 'target',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fill: 0xffffffff,
    }]),
  } satisfies SceneDocument));
  return scene;
}
