import { describe, expect, it } from 'vitest';

import type { PatchMapEntityProjection, PatchMapProjectionIndex } from '../../src/patch-map/contracts';
import {
  PatchMapPresentationProjectionStore,
  projectPatchMapBarPresentationHeight,
} from '../../src/patch-map/presentation-projection';
import {
  applyPatchMapAffine,
  patchMapAffineBasis,
  patchMapAffineCenter,
  createPatchMapAffine,
  freezePatchMapBounds,
} from '../../src/patch-map/semantic/geometry';

describe('PatchMap presentation projection', () => {
  it('keeps the semantic bottom edge fixed while height changes under affine transforms', () => {
    const destination = projection(40, createPatchMapAffine(80, 25, 90, -2, 3));
    const animated = projectPatchMapBarPresentationHeight(destination, 10);
    const destinationBottomLeft = applyPatchMapAffine(destination.affine, [0, 40]);
    const animatedBottomLeft = applyPatchMapAffine(animated.affine, [0, 10]);
    const destinationBottomRight = applyPatchMapAffine(destination.affine, [20, 40]);
    const animatedBottomRight = applyPatchMapAffine(animated.affine, [20, 10]);

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
    const bar = projection(40, createPatchMapAffine(0, 0));
    const rect = projection(20, createPatchMapAffine(100, 0));
    const semantic = index({ bar, rect });
    const store = new PatchMapPresentationProjectionStore();
    const presented = store.replace(semantic, new Map([['bar', 10]]));
    const byEntityId = presented.byEntityId;

    expect(store.semantic).toBe(semantic);
    expect(presented).not.toBe(semantic);
    expect(presented.byEntityId).not.toBe(semantic.byEntityId);
    expect(presented.byEntityId.rect).toBe(rect);
    expect(presented.byEntityId.bar?.localBounds[3]).toBe(10);
    expect(semantic.byEntityId.bar?.localBounds[3]).toBe(40);
    const activeRecord = presented.byEntityId.bar;

    expect(store.applyBarHeight('bar', 36.25)).toBe(true);
    expect(store.presentation).toBe(presented);
    expect(store.presentation?.byEntityId).toBe(byEntityId);
    expect(store.presentation?.byEntityId.bar).toBe(activeRecord);
    expect(store.visibleHeight('bar')).toBe(36.25);
    expect(semantic.byEntityId.bar?.localBounds[3]).toBe(40);
    expect(store.applyBarHeight('bar', 36.25)).toBe(false);
    expect(store.applyBarHeight('missing', 1)).toBe(false);
    expect(store.applyBarHeight('bar', 40)).toBe(true);
    expect(store.presentation?.byEntityId.bar).toBe(bar);
  });

  it('replaces and clears ownership without retaining caller mutation aliases', () => {
    const semantic = index({ bar: projection(20, createPatchMapAffine(0, 0)) });
    const store = new PatchMapPresentationProjectionStore();
    const first = store.replace(semantic);
    const secondSemantic = index({ bar: projection(30, createPatchMapAffine(0, 0)) });
    const second = store.replace(secondSemantic, new Map([['bar', 12]]));

    expect(second).not.toBe(first);
    expect(first.byEntityId.bar?.localBounds[3]).toBe(20);
    expect(second.byEntityId.bar?.localBounds[3]).toBe(12);
    store.clear();
    expect(store.semantic).toBeNull();
    expect(store.presentation).toBeNull();
    expect(store.visibleHeight('bar')).toBeNull();
    expect(() => projectPatchMapBarPresentationHeight(secondSemantic.byEntityId.bar!, -1))
      .toThrow(RangeError);
  });

  it('updates only dirty projection records for same-identity previews', () => {
    const bar = projection(40, createPatchMapAffine(0, 0));
    const rect = projection(20, createPatchMapAffine(100, 0));
    const store = new PatchMapPresentationProjectionStore();
    const first = store.replace(index({ bar, rect }), new Map([['bar', 10]]));
    const byEntityId = first.byEntityId;
    const movedBar = projection(40, createPatchMapAffine(25, 15));
    const nextSemantic = index({ bar: movedBar, rect });

    const next = store.replaceIncremental(
      nextSemantic,
      ['bar'],
      new Map([['bar', 10]]),
    );

    expect(next).not.toBeNull();
    expect(next?.byEntityId).toBe(byEntityId);
    expect(next?.byEntityId.rect).toBe(rect);
    expect(next?.byEntityId.bar?.localBounds[3]).toBe(10);
    expect(next?.byEntityId.bar?.affine[4]).toBe(25);
    expect(next?.byEntityId.bar?.affine[5]).toBe(45);
    expect(nextSemantic.byEntityId.bar?.localBounds[3]).toBe(40);
  });

  it('applies and clears transient geometry without changing semantic authority', () => {
    const bar = projection(40, createPatchMapAffine(0, 0));
    const rect = projection(20, createPatchMapAffine(100, 0));
    const semantic = index({ bar, rect });
    const store = new PatchMapPresentationProjectionStore();
    const presented = store.replace(semantic, new Map([['bar', 10]]));
    const movedBar = projection(40, createPatchMapAffine(30, 20));

    expect(store.applyTransientEntityProjections(
      { bar: movedBar },
      ['bar'],
    )).toBe(presented);
    expect(store.semantic).toBe(semantic);
    expect(store.presentation?.byEntityId.bar?.localBounds[3]).toBe(10);
    expect(store.presentation?.byEntityId.bar?.affine[4]).toBe(30);
    expect(store.presentation?.byEntityId.bar?.affine[5]).toBe(50);

    expect(store.clearTransientEntityProjections()).toEqual(['bar']);
    expect(store.presentation?.byEntityId.bar?.localBounds[3]).toBe(10);
    expect(store.presentation?.byEntityId.bar?.affine[4]).toBe(0);
    expect(store.presentation?.byEntityId.bar?.affine[5]).toBe(30);
    expect(store.semantic).toBe(semantic);
    expect(store.presentation?.byEntityId.rect).toBe(rect);
  });
});

function projection(
  height: number,
  affine: PatchMapEntityProjection['affine'],
): PatchMapEntityProjection {
  const localBounds = freezePatchMapBounds(0, 0, 20, height);
  return Object.freeze({
    entityId: 'bar',
    localBounds,
    affine,
    worldBasis: patchMapAffineBasis(affine),
    visibleCenter: patchMapAffineCenter(affine, localBounds),
    rotationDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    contentOrientation: 'follow-item',
  });
}

function index(
  byEntityId: Readonly<Record<string, PatchMapEntityProjection>>,
): PatchMapProjectionIndex {
  return Object.freeze({ byEntityId: Object.freeze({ ...byEntityId }) });
}
