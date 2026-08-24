import type { BitmapText, Matrix, Sprite, Text } from 'pixi.js';

import type {
  PatchMapQuadVertices,
  PatchMapResolvedRenderQuad,
} from './types';

type PatchMapLeafProjectionObject = Sprite | BitmapText | Text;

export function applyLeafProjection(
  object: PatchMapLeafProjectionObject,
  quad: PatchMapResolvedRenderQuad,
  matrix: Matrix,
  naturalWidth?: number,
  naturalHeight?: number,
): void {
  object.anchor.set(0.5);

  // Never assign DisplayObject.width/height: those accessors include current
  // scale, erase reflection signs, and force text raster measurement. Feed the
  // exact signed/sheared affine through Pixi's public Matrix API instead.
  const localWidth = naturalWidth ?? quad.projection?.localBounds[2] ?? quad.width;
  const localHeight = naturalHeight ?? quad.projection?.localBounds[3] ?? quad.height;
  const resolvedWidth = Math.max(Number.EPSILON, Math.abs(localWidth));
  const resolvedHeight = Math.max(Number.EPSILON, Math.abs(localHeight));
  const xScale = quad.width / resolvedWidth;
  const yScale = quad.height / resolvedHeight;
  object.setFromMatrix(matrix.set(
    quad.basis[0] * xScale,
    quad.basis[1] * xScale,
    quad.basis[2] * yScale,
    quad.basis[3] * yScale,
    quad.center[0],
    quad.center[1],
  ));
}

export function quadIntersectsViewport(
  vertices: PatchMapQuadVertices,
  matrix: Matrix,
  width: number,
  height: number,
  padding: number,
): boolean {
  return quadViewportCoverage(
    vertices,
    matrix,
    width,
    height,
    padding,
  ) !== 'outside';
}

export function quadViewportCoverage(
  vertices: PatchMapQuadVertices,
  matrix: Matrix,
  width: number,
  height: number,
  padding: number,
): 'outside' | 'partial' | 'inside' {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index]!;
    const y = vertices[index + 1]!;
    const screenX = matrix.a * x + matrix.c * y + matrix.tx;
    const screenY = matrix.b * x + matrix.d * y + matrix.ty;
    minX = Math.min(minX, screenX);
    minY = Math.min(minY, screenY);
    maxX = Math.max(maxX, screenX);
    maxY = Math.max(maxY, screenY);
  }
  if (
    maxX < -padding ||
    minX > width + padding ||
    maxY < -padding ||
    minY > height + padding
  ) {
    return 'outside';
  }
  return (
    minX >= -padding &&
    maxX <= width + padding &&
    minY >= -padding &&
    maxY <= height + padding
  )
    ? 'inside'
    : 'partial';
}
