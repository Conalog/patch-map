import { describe, expect, it } from 'vitest';

import type { PatchMapElement, PatchMapRectElement } from '../../src/semantic/dataset';
import {
  applyPatchMapRelativeGeometryUpdate,
  resizePatchMapGeometryAroundOrigin,
} from '../../src/semantic/geometry-update';
import {
  applyPatchMapAffine,
  createPatchMapAffine,
  multiplyPatchMapAffine,
  type PatchMapAffineMatrix,
} from '../../src/semantic/geometry';

describe('PatchMap pure geometry updates', () => {
  it('composes a relative x/y/angle action from current absolute geometry', () => {
    const target = rect({
      attrs: { x: 200, y: 100, zIndex: 2 },
      size: { width: 40, height: 30 },
    });
    const snapshot = JSON.stringify(target);

    const result = applyPatchMapRelativeGeometryUpdate(target, {
      attrs: { x: 10, y: -5 },
      angle: 45,
    });

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') return;
    expect(result.candidate.attrs).toEqual({ x: 210, y: 95, zIndex: 2, angle: 45 });
    expect(result.candidate.size).toEqual({ width: 40, height: 30 });
    expect(JSON.stringify(target)).toBe(snapshot);
    expect(Object.isFrozen(result.candidate)).toBe(true);
    expect(Object.isFrozen(result.candidate.attrs)).toBe(true);
  });

  it('converts a degree delta into radians when the absolute record uses rotation', () => {
    const target = rect({
      attrs: { x: 8, y: 12, rotation: Math.PI / 6 },
    });

    const result = applyPatchMapRelativeGeometryUpdate(target, { angle: 45 });

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') return;
    expect(result.candidate.attrs?.rotation).toBeCloseTo(5 * Math.PI / 12, 12);
    expect(Object.prototype.hasOwnProperty.call(result.candidate.attrs, 'angle')).toBe(false);
    expect(target.attrs?.rotation).toBe(Math.PI / 6);
  });

  it('preserves the visible center while authoring the resized rect', () => {
    const relative = applyPatchMapRelativeGeometryUpdate(
      rect({ attrs: { x: 200, y: 100 }, size: { width: 40, height: 30 } }),
      { attrs: { x: 10, y: -5 }, angle: 45 },
    );
    expect(relative.status).toBe('changed');
    if (relative.status !== 'changed') return;

    const result = resizePatchMapGeometryAroundOrigin(relative.candidate, {
      origin: 'visible-center',
      size: { width: 80, height: 50 },
    });

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') return;
    expect(result.candidate.size).toEqual({ width: 80, height: 50 });
    expect(result.candidate.attrs?.x).toBeCloseTo(202.9289321881, 9);
    expect(result.candidate.attrs?.y).toBeCloseTo(73.7867965644, 9);
    expect(result.centerAfter[0]).toBeCloseTo(result.centerBefore[0], 12);
    expect(result.centerAfter[1]).toBeCloseTo(result.centerBefore[1], 12);
    expect(relative.candidate).toMatchObject({
      attrs: { x: 210, y: 95, angle: 45 },
      size: { width: 40, height: 30 },
    });
  });

  it('preserves center through parent rotation, scale, flip, and pivot translation', () => {
    const target = rect({
      attrs: {
        x: 23,
        y: -17,
        rotation: Math.PI / 6,
        scaleX: -1.75,
        scaleY: 0.6,
      },
      size: { width: 40, height: 30 },
    });
    const targetSnapshot = JSON.stringify(target);
    const parentAffine = parentWithPivot();
    const parentSnapshot = [...parentAffine];

    const result = resizePatchMapGeometryAroundOrigin(target, {
      origin: 'visible-center',
      size: { width: 96, height: 44 },
      parentAffine,
    });

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') return;
    const independentlyProjected = projectVisibleCenter(result.candidate, parentAffine);
    expect(result.centerAfter[0]).toBeCloseTo(result.centerBefore[0], 11);
    expect(result.centerAfter[1]).toBeCloseTo(result.centerBefore[1], 11);
    expect(independentlyProjected[0]).toBeCloseTo(result.centerBefore[0], 11);
    expect(independentlyProjected[1]).toBeCloseTo(result.centerBefore[1], 11);
    expect(result.candidate.attrs?.rotation).toBe(Math.PI / 6);
    expect(result.candidate.attrs?.scaleX).toBe(-1.75);
    expect(result.candidate.attrs?.scaleY).toBe(0.6);
    expect(JSON.stringify(target)).toBe(targetSnapshot);
    expect(parentAffine).toEqual(parentSnapshot);
  });

  it('returns structured unsupported results for other origins and target types', () => {
    const unsupportedOrigin = resizePatchMapGeometryAroundOrigin(rect(), {
      origin: 'top-left',
      size: { width: 80, height: 50 },
    });
    expect(unsupportedOrigin).toMatchObject({
      status: 'unsupported',
      changed: false,
      candidate: null,
      diagnostic: {
        code: 'UNSUPPORTED_GEOMETRY_ORIGIN',
        category: 'UNSUPPORTED_RUNTIME',
        path: '$.origin',
      },
    });

    const item = {
      type: 'item',
      id: 'item-a',
      show: true,
      locked: false,
      size: { width: 100, height: 80 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      components: [],
      contentOrientation: 'upright',
    } as const satisfies PatchMapElement;
    expect(applyPatchMapRelativeGeometryUpdate(item, { attrs: { x: 1 } })).toMatchObject({
      status: 'unsupported',
      diagnostic: {
        code: 'UNSUPPORTED_GEOMETRY_TARGET_TYPE',
        path: '$.target.type',
      },
    });
    expect(resizePatchMapGeometryAroundOrigin(item, {
      origin: 'visible-center',
      size: { width: 80, height: 50 },
    })).toMatchObject({
      status: 'unsupported',
      diagnostic: { code: 'UNSUPPORTED_GEOMETRY_TARGET_TYPE' },
    });
  });

  it('rejects non-finite authored, requested, and parent-affine geometry', () => {
    expect(applyPatchMapRelativeGeometryUpdate(rect(), {
      attrs: { x: Number.NaN },
    })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_GEOMETRY_VALUE', path: '$.changes.attrs.x' },
    });

    expect(resizePatchMapGeometryAroundOrigin(rect(), {
      origin: 'visible-center',
      size: { width: Number.POSITIVE_INFINITY, height: 50 },
    })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_GEOMETRY_VALUE', path: '$.size.width' },
    });

    expect(resizePatchMapGeometryAroundOrigin(rect(), {
      origin: 'visible-center',
      size: { width: 80, height: 50 },
      parentAffine: [1, 0, 0, 1, Number.NaN, 0],
    })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_GEOMETRY_VALUE', path: '$.parentAffine' },
    });

    const invalidTarget = rect({
      attrs: { angle: 45, rotation: Math.PI / 4 },
    });
    expect(applyPatchMapRelativeGeometryUpdate(invalidTarget, { angle: 1 })).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'INVALID_GEOMETRY_VALUE', path: '$.target.attrs' },
    });
  });
});

function rect(
  overrides: Partial<Pick<PatchMapRectElement, 'attrs' | 'size'>> = {},
): PatchMapRectElement {
  return {
    type: 'rect',
    id: 'rect-b',
    show: true,
    locked: false,
    fill: '#ff8800',
    radius: 0,
    attrs: overrides.attrs ?? { x: 160, y: 40, zIndex: 2 },
    size: overrides.size ?? { width: 40, height: 30 },
  };
}

function parentWithPivot(): PatchMapAffineMatrix {
  return multiplyPatchMapAffine(
    createPatchMapAffine(320, -40, 27, -1.5, 0.75),
    createPatchMapAffine(-18, 11),
  );
}

function projectVisibleCenter(
  target: PatchMapRectElement,
  parentAffine: PatchMapAffineMatrix,
): readonly [number, number] {
  const attrs = target.attrs ?? {};
  const rotationDegrees = typeof attrs.angle === 'number'
    ? attrs.angle
    : typeof attrs.rotation === 'number'
      ? attrs.rotation * 180 / Math.PI
      : 0;
  const localAffine = createPatchMapAffine(
    typeof attrs.x === 'number' ? attrs.x : 0,
    typeof attrs.y === 'number' ? attrs.y : 0,
    rotationDegrees,
    typeof attrs.scaleX === 'number' ? attrs.scaleX : 1,
    typeof attrs.scaleY === 'number' ? attrs.scaleY : 1,
  );
  return applyPatchMapAffine(
    multiplyPatchMapAffine(parentAffine, localAffine),
    [target.size.width / 2, target.size.height / 2],
  );
}
