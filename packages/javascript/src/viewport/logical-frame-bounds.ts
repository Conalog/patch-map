import {
  invertPatchMapAffine,
  PATCH_MAP_IDENTITY_AFFINE,
  type PatchMapAffineMatrix,
  type PatchMapBoundsTuple,
} from '../semantic/geometry';

interface LogicalFrameVisual {
  readonly worldBounds: PatchMapBoundsTuple;
  readonly worldQuad?: Readonly<{ affine: PatchMapAffineMatrix; localBounds: PatchMapBoundsTuple }>;
}

/** Measure visual descendants in their container's frame, then transform its rectangle. */
export function logicalFrameBounds(
  affine: PatchMapAffineMatrix,
  visuals: Iterable<LogicalFrameVisual>,
): PatchMapBoundsTuple {
  const determinant = affine[0] * affine[3] - affine[1] * affine[2];
  // A collapsed transform has no inverse; retain the remaining world extent.
  const inverse = Number.isFinite(determinant) && Math.abs(determinant) > Number.EPSILON
    ? invertPatchMapAffine(affine) : null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let emptyLeft = Infinity;
  let emptyTop = Infinity;
  let emptyRight = -Infinity;
  let emptyBottom = -Infinity;
  for (const visual of visuals) {
    const child = visual.worldQuad?.affine ?? PATCH_MAP_IDENTITY_AFFINE;
    const [x, y, width, height] = visual.worldQuad?.localBounds ?? visual.worldBounds;
    // Compose scalars without allocating a matrix or four points per visual.
    const a = inverse === null ? child[0] : inverse[0] * child[0] + inverse[2] * child[1];
    const b = inverse === null ? child[1] : inverse[1] * child[0] + inverse[3] * child[1];
    const c = inverse === null ? child[2] : inverse[0] * child[2] + inverse[2] * child[3];
    const d = inverse === null ? child[3] : inverse[1] * child[2] + inverse[3] * child[3];
    const tx = inverse === null ? child[4] : inverse[0] * child[4] + inverse[2] * child[5] + inverse[4];
    const ty = inverse === null ? child[5] : inverse[1] * child[4] + inverse[3] * child[5] + inverse[5];
    const originX = a * x + c * y + tx;
    const originY = b * x + d * y + ty;
    const edgeXx = a * width, edgeXy = b * width;
    const edgeYx = c * height, edgeYy = d * height;
    if (edgeXx === 0 && edgeXy === 0 && edgeYx === 0 && edgeYy === 0) {
      // Empty children do not enlarge a nonempty local rectangle. When every
      // child is empty, main unions their world corners without retransforming.
      const worldX = child[0] * x + child[2] * y + child[4];
      const worldY = child[1] * x + child[3] * y + child[5];
      emptyLeft = Math.min(emptyLeft, worldX); emptyTop = Math.min(emptyTop, worldY);
      emptyRight = Math.max(emptyRight, worldX); emptyBottom = Math.max(emptyBottom, worldY);
      continue;
    }
    left = Math.min(left, originX + Math.min(0, edgeXx) + Math.min(0, edgeYx));
    top = Math.min(top, originY + Math.min(0, edgeXy) + Math.min(0, edgeYy));
    right = Math.max(right, originX + Math.max(0, edgeXx) + Math.max(0, edgeYx));
    bottom = Math.max(bottom, originY + Math.max(0, edgeXy) + Math.max(0, edgeYy));
  }
  if (!Number.isFinite(left)) {
    return Number.isFinite(emptyLeft)
      ? Object.freeze([emptyLeft, emptyTop, emptyRight - emptyLeft, emptyBottom - emptyTop])
      : Object.freeze([affine[4], affine[5], 0, 0]);
  }
  if (inverse === null) return Object.freeze([left, top, right - left, bottom - top]);
  const originX = affine[0] * left + affine[2] * top + affine[4];
  const originY = affine[1] * left + affine[3] * top + affine[5];
  const width = right - left;
  const height = bottom - top;
  const worldLeft = originX + Math.min(0, affine[0] * width) + Math.min(0, affine[2] * height);
  const worldTop = originY + Math.min(0, affine[1] * width) + Math.min(0, affine[3] * height);
  const worldRight = originX + Math.max(0, affine[0] * width) + Math.max(0, affine[2] * height);
  const worldBottom = originY + Math.max(0, affine[1] * width) + Math.max(0, affine[3] * height);
  return Object.freeze([worldLeft, worldTop, worldRight - worldLeft, worldBottom - worldTop]);
}
