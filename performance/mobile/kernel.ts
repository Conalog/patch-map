import { writeRoundedBarPositionValues } from '../../src/rendering/mesh/rounded-bar-geometry';
import type { PatchMapResolvedRenderQuadScratch } from '../../src/geometry/render-quads';

// The benchmark imports the shipped implementation, not a rewritten JS facsimile.
export function project(heights: ArrayLike<number>, stride: number): Float32Array {
  const positions = new Float32Array(heights.length * 42);
  const quad: PatchMapResolvedRenderQuadScratch = {
    entityId: '', projection: null, center: [0, 0], basis: [1, 0, 0, 1],
    screenBasis: [1, 0, 0, 1], width: 8, height: 20,
    vertices: [0, 0, 0, 0, 0, 0, 0, 0],
  };
  for (let ordinal = 0; ordinal < heights.length; ordinal += 1) {
    const index = ordinal * stride;
    const grid = Math.floor(index / 100);
    const cell = index % 100;
    const x = (grid % 5) * 270 + (cell % 25) * 10;
    const y = Math.floor(grid / 5) * 110 + Math.floor(cell / 25) * 24 + 20;
    const height = heights[ordinal]!;
    if (!Number.isFinite(height) || height <= 0 || height > 20) {
      throw new RangeError('benchmark height must be in (0, 20]');
    }
    quad.height = height;
    quad.vertices[0] = x;
    quad.vertices[1] = y - height;
    writeRoundedBarPositionValues(positions, ordinal, quad, 3);
  }
  return positions;
}

Object.assign(globalThis, {
  projectJson: (heights: number[], stride: number) => JSON.stringify(Array.from(project(heights, stride))),
  projectBinary: (input: ArrayBuffer, stride: number) => project(new Float64Array(input), stride).buffer,
  projectBuffer: (heights: number[], stride: number) => project(heights, stride).buffer,
});
