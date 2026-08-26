import type { PatchMapResolvedRenderQuad } from '../../geometry/render-quads';
import {
  finishGeometry,
  type AggregateGeometryData,
} from './geometry';

interface RoundedBarGeometryPrimitive {
  readonly quad: PatchMapResolvedRenderQuad;
  readonly radius: number;
  readonly widthFraction: number;
}

const ROUNDED_BAR_CORNER_SEGMENTS = 4;
const ROUNDED_BAR_PERIMETER_VERTICES = 4 * (ROUNDED_BAR_CORNER_SEGMENTS + 1);
const ROUNDED_BAR_VERTICES_PER_PRIMITIVE = ROUNDED_BAR_PERIMETER_VERTICES + 1;
const ROUNDED_BAR_INDICES_PER_PRIMITIVE = ROUNDED_BAR_PERIMETER_VERTICES * 3;
const ROUNDED_BAR_UNIT_CORNERS = Object.freeze(
  [-Math.PI / 2, 0, Math.PI / 2, Math.PI].flatMap((startAngle) =>
    Array.from(
      { length: ROUNDED_BAR_CORNER_SEGMENTS + 1 },
      (_, segment) => {
        const angle = startAngle +
          (segment / ROUNDED_BAR_CORNER_SEGMENTS) * (Math.PI / 2);
        return Object.freeze([Math.cos(angle), Math.sin(angle)] as const);
      },
    )),
);

export function buildRoundedBarGeometry(
  primitives: readonly RoundedBarGeometryPrimitive[],
): AggregateGeometryData {
  const positions = new Float32Array(
    primitives.length * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2,
  );
  const uvs = new Float32Array(
    primitives.length * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2,
  );
  const indices = new Uint32Array(
    primitives.length * ROUNDED_BAR_INDICES_PER_PRIMITIVE,
  );

  for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
    const primitive = primitives[primitiveIndex] as RoundedBarGeometryPrimitive;
    writeRoundedBarPositionValues(
      positions,
      primitiveIndex,
      primitive.quad,
      primitive.radius,
      primitive.widthFraction,
      uvs,
    );
    const vertexBase = primitiveIndex * ROUNDED_BAR_VERTICES_PER_PRIMITIVE;
    const indexBase = primitiveIndex * ROUNDED_BAR_INDICES_PER_PRIMITIVE;

    for (let edge = 0; edge < ROUNDED_BAR_PERIMETER_VERTICES; edge += 1) {
      const offset = indexBase + edge * 3;
      indices[offset] = vertexBase;
      indices[offset + 1] = vertexBase + 1 + edge;
      indices[offset + 2] =
        vertexBase + 1 + ((edge + 1) % ROUNDED_BAR_PERIMETER_VERTICES);
    }
  }

  return finishGeometry(positions, uvs, indices, primitives.length);
}

type RoundedBarQuad = PatchMapResolvedRenderQuad;

export function writeRoundedBarPositionValues(
  positions: Float32Array,
  primitiveIndex: number,
  quad: RoundedBarQuad,
  radius: number,
  widthFraction = 1,
  uvs?: Float32Array,
): boolean {
  const projection = quad.projection;
  const localWidth = projection === null
    ? quad.width
    : projection.localBounds[2] * widthFraction;
  const localHeight = projection?.localBounds[3] ?? quad.height;
  if (!(localWidth > 0) || !(localHeight > 0)) return false;

  const fittedRadius = Math.min(
    Math.max(0, radius),
    localWidth / 2,
    localHeight / 2,
  );
  const scaleX = quad.width / localWidth;
  const scaleY = quad.height / localHeight;
  const [basisA, basisB, basisC, basisD] = quad.basis;
  const [topLeftX, topLeftY] = quad.vertices;
  const positionBase = primitiveIndex * ROUNDED_BAR_VERTICES_PER_PRIMITIVE * 2;
  let changed = writeRoundedBarVertex(
    positions,
    uvs,
    positionBase,
    0,
    localWidth / 2,
    localHeight / 2,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  );
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    0,
    localWidth - fittedRadius,
    fittedRadius,
    fittedRadius,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    ROUNDED_BAR_CORNER_SEGMENTS + 1,
    localWidth - fittedRadius,
    localHeight - fittedRadius,
    fittedRadius,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    (ROUNDED_BAR_CORNER_SEGMENTS + 1) * 2,
    fittedRadius,
    localHeight - fittedRadius,
    fittedRadius,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  changed = writeRoundedBarCorner(
    positions,
    uvs,
    positionBase,
    (ROUNDED_BAR_CORNER_SEGMENTS + 1) * 3,
    fittedRadius,
    fittedRadius,
    fittedRadius,
    localWidth,
    localHeight,
    scaleX,
    scaleY,
    basisA,
    basisB,
    basisC,
    basisD,
    topLeftX,
    topLeftY,
  ) || changed;
  return changed;
}
function writeRoundedBarCorner(
  positions: Float32Array,
  uvs: Float32Array | undefined,
  positionBase: number,
  perimeterStart: number,
  centerX: number,
  centerY: number,
  radius: number,
  localWidth: number,
  localHeight: number,
  scaleX: number,
  scaleY: number,
  basisA: number,
  basisB: number,
  basisC: number,
  basisD: number,
  topLeftX: number,
  topLeftY: number,
): boolean {
  let changed = false;
  for (let segment = 0; segment <= ROUNDED_BAR_CORNER_SEGMENTS; segment += 1) {
    const [unitX, unitY] = ROUNDED_BAR_UNIT_CORNERS[perimeterStart + segment]!;
    changed = writeRoundedBarVertex(
      positions,
      uvs,
      positionBase,
      1 + perimeterStart + segment,
      centerX + unitX * radius,
      centerY + unitY * radius,
      localWidth,
      localHeight,
      scaleX,
      scaleY,
      basisA,
      basisB,
      basisC,
      basisD,
      topLeftX,
      topLeftY,
    ) || changed;
  }
  return changed;
}

function writeRoundedBarVertex(
  positions: Float32Array,
  uvs: Float32Array | undefined,
  positionBase: number,
  vertexIndex: number,
  localX: number,
  localY: number,
  localWidth: number,
  localHeight: number,
  scaleX: number,
  scaleY: number,
  basisA: number,
  basisB: number,
  basisC: number,
  basisD: number,
  topLeftX: number,
  topLeftY: number,
): boolean {
  const offset = positionBase + vertexIndex * 2;
  const nextX = Math.fround(
    topLeftX + basisA * scaleX * localX + basisC * scaleY * localY,
  );
  const nextY = Math.fround(
    topLeftY + basisB * scaleX * localX + basisD * scaleY * localY,
  );
  const changed = positions[offset] !== nextX || positions[offset + 1] !== nextY;
  positions[offset] = nextX;
  positions[offset + 1] = nextY;
  if (uvs !== undefined) {
    uvs[offset] = localX / localWidth;
    uvs[offset + 1] = localY / localHeight;
  }
  return changed;
}
