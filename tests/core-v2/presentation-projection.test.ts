import { describe, expect, it } from 'vitest';

import type { CoreV2EntityProjection, CoreV2ProjectionIndex } from '../../src/core-v2/contracts';
import {
  CoreV2PresentationProjectionStore,
  projectCoreV2BarPresentationHeight,
} from '../../src/core-v2/presentation-projection';
import {
  applyCoreV2Affine,
  coreV2AffineBasis,
  coreV2AffineCenter,
  createCoreV2Affine,
  freezeCoreV2Bounds,
} from '../../src/core-v2/semantic/geometry';

describe('Core v2 presentation projection', () => {
  it('keeps the semantic bottom edge fixed while height changes under affine transforms', () => {
    const destination = projection(40, createCoreV2Affine(80, 25, 90, -2, 3));
    const animated = projectCoreV2BarPresentationHeight(destination, 10);
    const destinationBottomLeft = applyCoreV2Affine(destination.affine, [0, 40]);
    const animatedBottomLeft = applyCoreV2Affine(animated.affine, [0, 10]);
    const destinationBottomRight = applyCoreV2Affine(destination.affine, [20, 40]);
    const animatedBottomRight = applyCoreV2Affine(animated.affine, [20, 10]);

    expect(animated.localBounds).toEqual([0, 0, 20, 10]);
    expect(animatedBottomLeft[0]).toBeCloseTo(destinationBottomLeft[0], 12);
    expect(animatedBottomLeft[1]).toBeCloseTo(destinationBottomLeft[1], 12);
    expect(animatedBottomRight[0]).toBeCloseTo(destinationBottomRight[0], 12);
    expect(animatedBottomRight[1]).toBeCloseTo(destinationBottomRight[1], 12);
    expect(animated.worldBasis).toEqual(destination.worldBasis);
    expect(Object.isFrozen(animated)).toBe(true);
    expect(Object.isFrozen(animated.affine)).toBe(true);
  });

  it('copies once per semantic commit and mutates only internal active records per frame', () => {
    const bar = projection(40, createCoreV2Affine(0, 0));
    const rect = projection(20, createCoreV2Affine(100, 0));
    const semantic = index({ bar, rect });
    const store = new CoreV2PresentationProjectionStore();
    const presented = store.replace(semantic, new Map([['bar', 10]]));
    const byEntityId = presented.byEntityId;

    expect(store.semantic).toBe(semantic);
    expect(presented).not.toBe(semantic);
    expect(presented.byEntityId).not.toBe(semantic.byEntityId);
    expect(presented.byEntityId.rect).toBe(rect);
    expect(presented.byEntityId.bar?.localBounds[3]).toBe(10);
    expect(semantic.byEntityId.bar?.localBounds[3]).toBe(40);

    expect(store.applyBarHeight('bar', 36.25)).toBe(true);
    expect(store.presentation).toBe(presented);
    expect(store.presentation?.byEntityId).toBe(byEntityId);
    expect(store.visibleHeight('bar')).toBe(36.25);
    expect(semantic.byEntityId.bar?.localBounds[3]).toBe(40);
    expect(store.applyBarHeight('bar', 36.25)).toBe(false);
    expect(store.applyBarHeight('missing', 1)).toBe(false);
  });

  it('replaces and clears ownership without retaining caller mutation aliases', () => {
    const semantic = index({ bar: projection(20, createCoreV2Affine(0, 0)) });
    const store = new CoreV2PresentationProjectionStore();
    const first = store.replace(semantic);
    const secondSemantic = index({ bar: projection(30, createCoreV2Affine(0, 0)) });
    const second = store.replace(secondSemantic, new Map([['bar', 12]]));

    expect(second).not.toBe(first);
    expect(first.byEntityId.bar?.localBounds[3]).toBe(20);
    expect(second.byEntityId.bar?.localBounds[3]).toBe(12);
    store.clear();
    expect(store.semantic).toBeNull();
    expect(store.presentation).toBeNull();
    expect(store.visibleHeight('bar')).toBeNull();
    expect(() => projectCoreV2BarPresentationHeight(secondSemantic.byEntityId.bar!, -1))
      .toThrow(RangeError);
  });
});

function projection(
  height: number,
  affine: CoreV2EntityProjection['affine'],
): CoreV2EntityProjection {
  const localBounds = freezeCoreV2Bounds(0, 0, 20, height);
  return Object.freeze({
    entityId: 'bar',
    localBounds,
    affine,
    worldBasis: coreV2AffineBasis(affine),
    visibleCenter: coreV2AffineCenter(affine, localBounds),
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    contentOrientation: 'follow-item',
  });
}

function index(
  byEntityId: Readonly<Record<string, CoreV2EntityProjection>>,
): CoreV2ProjectionIndex {
  return Object.freeze({ byEntityId: Object.freeze({ ...byEntityId }) });
}
