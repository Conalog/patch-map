import type {
  PatchMapContentOrientation,
  PatchMapImageIntrinsicTransform,
} from './contracts';
import {
  createPatchMapAffine,
  multiplyPatchMapAffine,
  projectPatchMapSignedRect,
  type PatchMapAffineMatrix,
  type PatchMapDenseRectProjection,
} from '../semantic/geometry';

export interface PatchMapParserTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly affine: PatchMapAffineMatrix;
  readonly imageIntrinsicTransform: PatchMapImageIntrinsicTransform;
}

export interface PatchMapParserSize {
  readonly width: number;
  readonly height: number;
}

export interface PatchMapEntityProjectionDraft extends PatchMapDenseRectProjection {
  readonly affine: PatchMapAffineMatrix;
  readonly rotationDegrees: number;
  readonly contentOrientation: PatchMapContentOrientation;
}

export function composePatchMapParserTransform(
  parent: PatchMapParserTransform,
  x: number,
  y: number,
  rotation: number,
  scaleX = 1,
  scaleY = 1,
): PatchMapParserTransform {
  const radians = parent.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = x * parent.scaleX;
  const localY = y * parent.scaleY;
  const handedness = Math.sign(parent.scaleX * parent.scaleY) || 1;
  const localTranslationAffine = createPatchMapAffine(x, y);
  const localRotationScaleAffine = createPatchMapAffine(0, 0, rotation, scaleX, scaleY);
  return {
    x: parent.x + localX * cos - localY * sin,
    y: parent.y + localX * sin + localY * cos,
    rotation: parent.rotation + rotation * handedness,
    scaleX: parent.scaleX * scaleX,
    scaleY: parent.scaleY * scaleY,
    affine: multiplyPatchMapAffine(
      parent.affine,
      multiplyPatchMapAffine(localTranslationAffine, localRotationScaleAffine),
    ),
    imageIntrinsicTransform: Object.freeze({
      parentAffine: parent.affine,
      localTranslationAffine,
      localRotationScaleAffine,
    }),
  };
}

/**
 * PATCH MAP authors local rectangles from their top-left, while the dense
 * renderer rotates quads around their center. This projection keeps those
 * representations geometrically equivalent.
 */
export function projectPatchMapParserTopLeft(
  transform: PatchMapParserTransform,
  size: PatchMapParserSize,
  contentOrientation: PatchMapContentOrientation = 'follow-item',
): PatchMapEntityProjectionDraft {
  return Object.freeze({
    ...projectPatchMapSignedRect(transform, size.width, size.height),
    affine: transform.affine,
    rotationDegrees: transform.rotation,
    contentOrientation,
  });
}

/** Standalone images share the authored top-left transform contract. */
export function projectPatchMapParserImage(
  transform: PatchMapParserTransform,
  size: PatchMapParserSize,
): PatchMapEntityProjectionDraft {
  return projectPatchMapParserTopLeft(transform, size);
}

/**
 * Preserve exact nested affine authority when decoded intrinsic dimensions
 * replace the parser fallback bounds. Image dimensions do not move the
 * authored top-left transform origin.
 */
export function projectPatchMapIntrinsicImageAffine(
  transform: PatchMapImageIntrinsicTransform,
  width: number,
  height: number,
): PatchMapAffineMatrix {
  if (!(width >= 0) || !Number.isFinite(width) || !(height >= 0) || !Number.isFinite(height)) {
    throw new TypeError('intrinsic image dimensions must be finite and non-negative');
  }
  const local = multiplyPatchMapAffine(
    transform.localTranslationAffine,
    transform.localRotationScaleAffine,
  );
  return multiplyPatchMapAffine(transform.parentAffine, local);
}
