import { describe, expect, it } from 'vitest';

import {
  projectPatchMapIntrinsicImageAffine as publicIntrinsicImageAffine,
} from '../../src/patch-map/parser';
import {
  composePatchMapParserTransform,
  projectPatchMapIntrinsicImageAffine,
  projectPatchMapParserImage,
  projectPatchMapParserTopLeft,
  type PatchMapParserTransform,
} from '../../src/patch-map/parser/transform-projection';
import {
  createPatchMapAffine,
  multiplyPatchMapAffine,
  projectPatchMapSignedRect,
} from '../../src/patch-map/semantic/geometry';

describe('PatchMap parser transform projection', () => {
  it('composes inherited translation, handed rotation, scale, and affine state once', () => {
    const parent = transform(10, 20, 90, -2, 3);
    const child = composePatchMapParserTransform(parent, 4, 5, 30, -1, 2);

    expect(child).toMatchObject({
      x: -5,
      rotation: 60,
      scaleX: 2,
      scaleY: 6,
    });
    expect(child.y).toBeCloseTo(12, 12);
    expect(child.affine).toEqual(multiplyPatchMapAffine(
      parent.affine,
      createPatchMapAffine(4, 5, 30, -1, 2),
    ));
    expect(child.imageIntrinsicTransform.parentAffine).toBe(parent.affine);
    expect(Object.isFrozen(child.imageIntrinsicTransform)).toBe(true);
  });

  it('keeps top-left authored rectangles equivalent to signed dense projection', () => {
    const value = transform(8, -3, 35, -1.5, 0.75);
    const projected = projectPatchMapParserTopLeft(
      value,
      { width: 40, height: 24 },
      'upright',
    );

    expect(projected).toEqual({
      ...projectPatchMapSignedRect(value, 40, 24),
      affine: value.affine,
      rotationDegrees: 35,
      contentOrientation: 'upright',
    });
    expect(Object.isFrozen(projected)).toBe(true);
  });

  it('keeps standalone image center-pivot geometry and public intrinsic affine validation', () => {
    const value = composePatchMapParserTransform(transform(0, 0, 0, 1, 1), 10, 20, 90, -1, 2);
    const projected = projectPatchMapParserImage(value, { width: 4, height: 6 });

    expect(projected).toMatchObject({
      x: 6,
      y: 20,
      width: 4,
      height: 12,
      rotation: 90,
      localBounds: [0, 0, 4, 6],
      scaleX: -1,
      scaleY: 2,
      contentOrientation: 'follow-item',
    });
    expect(projected.affine).toEqual(projectPatchMapIntrinsicImageAffine(
      value.imageIntrinsicTransform,
      4,
      6,
    ));
    expect(publicIntrinsicImageAffine).toBe(projectPatchMapIntrinsicImageAffine);
    expect(() => projectPatchMapIntrinsicImageAffine(
      value.imageIntrinsicTransform,
      -1,
      6,
    )).toThrow('intrinsic image dimensions must be finite and non-negative');
  });
});

function transform(
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
): PatchMapParserTransform {
  const affine = createPatchMapAffine(x, y, rotation, scaleX, scaleY);
  const identity = createPatchMapAffine();
  return {
    x,
    y,
    rotation,
    scaleX,
    scaleY,
    affine,
    imageIntrinsicTransform: Object.freeze({
      parentAffine: identity,
      localTranslationAffine: identity,
      localRotationScaleAffine: identity,
      localPivotScaleAffine: identity,
    }),
  };
}
