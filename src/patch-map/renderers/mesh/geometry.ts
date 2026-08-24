import type { PatchMapQuadVertices } from '../types';

export interface AggregateQuad {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Clockwise degrees, matching the Core store contract. */
  readonly rotation?: number;
  /** Optional entity pivot; bar fill geometry rotates around the complete bar. */
  readonly pivotX?: number;
  readonly pivotY?: number;
  /** Exact scene-space corners from the shared affine projection sidecar. */
  readonly vertices?: PatchMapQuadVertices;
}

export interface AggregateLine {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly width: number;
}

export interface AggregateGeometryData {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly primitiveCount: number;
  readonly byteLength: number;
}

export interface PackedMeshStyle {
  readonly tint: number;
  readonly alpha: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function isFiniteQuad(quad: AggregateQuad): boolean {
  const verticesFinite = quad.vertices === undefined ||
    (quad.vertices.length === 8 && quad.vertices.every(Number.isFinite));
  return (
    Number.isFinite(quad.x) &&
    Number.isFinite(quad.y) &&
    Number.isFinite(quad.width) &&
    Number.isFinite(quad.height) &&
    quad.width > 0 &&
    quad.height > 0 &&
    Number.isFinite(quad.rotation ?? 0) &&
    Number.isFinite(quad.pivotX ?? quad.x + quad.width / 2) &&
    Number.isFinite(quad.pivotY ?? quad.y + quad.height / 2) &&
    verticesFinite
  );
}

export function isFiniteLine(line: AggregateLine): boolean {
  return (
    Number.isFinite(line.fromX) &&
    Number.isFinite(line.fromY) &&
    Number.isFinite(line.toX) &&
    Number.isFinite(line.toY) &&
    Number.isFinite(line.width) &&
    line.width > 0 &&
    (line.fromX !== line.toX || line.fromY !== line.toY)
  );
}

function writeUvsAndIndices(
  uvs: Float32Array,
  indices: Uint32Array,
  primitiveIndex: number,
): void {
  const positionOffset = primitiveIndex * 8;
  uvs.set([0, 0, 1, 0, 1, 1, 0, 1], positionOffset);
  const vertexOffset = primitiveIndex * 4;
  indices.set(
    [
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 3,
    ],
    primitiveIndex * 6,
  );
}

export function finishGeometry(
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
  primitiveCount: number,
): AggregateGeometryData {
  return {
    positions,
    uvs,
    indices,
    primitiveCount,
    byteLength: positions.byteLength + uvs.byteLength + indices.byteLength,
  };
}

function writeRotatedCorner(
  positions: Float32Array,
  offset: number,
  targetOffset: number,
  sourceX: number,
  sourceY: number,
  pivotX: number,
  pivotY: number,
  cos: number,
  sin: number,
): boolean {
  const deltaX = sourceX - pivotX;
  const deltaY = sourceY - pivotY;
  const nextX = Math.fround(pivotX + deltaX * cos - deltaY * sin);
  const nextY = Math.fround(pivotY + deltaX * sin + deltaY * cos);
  const changed =
    positions[offset + targetOffset] !== nextX ||
    positions[offset + targetOffset + 1] !== nextY;
  positions[offset + targetOffset] = nextX;
  positions[offset + targetOffset + 1] = nextY;
  return changed;
}

function writeQuadPositionValues(
  positions: Float32Array,
  primitiveIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  pivotX: number,
  pivotY: number,
): boolean {
  const right = x + width;
  const bottom = y + height;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const offset = primitiveIndex * 8;
  const corner0 = writeRotatedCorner(
    positions, offset, 0, x, y, pivotX, pivotY, cos, sin,
  );
  const corner1 = writeRotatedCorner(
    positions, offset, 2, right, y, pivotX, pivotY, cos, sin,
  );
  const corner2 = writeRotatedCorner(
    positions, offset, 4, right, bottom, pivotX, pivotY, cos, sin,
  );
  const corner3 = writeRotatedCorner(
    positions, offset, 6, x, bottom, pivotX, pivotY, cos, sin,
  );
  return corner0 || corner1 || corner2 || corner3;
}

export function writeExactQuadPositionValues(
  positions: Float32Array,
  primitiveIndex: number,
  vertices: PatchMapQuadVertices,
): boolean {
  const offset = primitiveIndex * 8;
  let changed = false;
  for (let index = 0; index < 8; index += 1) {
    const next = Math.fround(vertices[index]!);
    if (positions[offset + index] !== next) changed = true;
    positions[offset + index] = next;
  }
  return changed;
}

/** Convert Core's packed 0xRRGGBBAA color into Pixi's tint plus alpha. */
export function packedRgbaToMeshStyle(
  packed: number,
  opacity = 1,
): PackedMeshStyle {
  const normalized = packed >>> 0;
  return {
    tint: normalized >>> 8,
    alpha: ((normalized & 0xff) / 0xff) * clamp01(opacity),
  };
}

/** Component tint multiplication in the canonical packed 0xRRGGBBAA space. */
export function multiplyPackedRgba(left: number, right: number): number {
  const first = left >>> 0;
  const second = right >>> 0;
  const channel = (shift: number): number => Math.round(
    ((first >>> shift) & 0xff) * ((second >>> shift) & 0xff) / 255,
  );
  return (
    channel(24) * 0x1000000 +
    (channel(16) << 16) +
    (channel(8) << 8) +
    channel(0)
  ) >>> 0;
}

export interface PatchMapRoundedRectPathSink {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): unknown;
  closePath(): unknown;
}

/** Append one public Pixi path while retaining every authored corner independently. */
export function appendPatchMapRoundedRectPath(
  sink: PatchMapRoundedRectPathSink,
  width: number,
  height: number,
  radius: readonly [number, number, number, number],
): void {
  const [topLeft, topRight, bottomRight, bottomLeft] = fitPatchMapCornerRadii(
    width,
    height,
    radius,
  );
  sink.moveTo(topLeft, 0);
  sink.lineTo(width - topRight, 0);
  appendRoundedCorner(sink, width, 0, width, topRight, topRight);
  sink.lineTo(width, height - bottomRight);
  appendRoundedCorner(sink, width, height, width - bottomRight, height, bottomRight);
  sink.lineTo(bottomLeft, height);
  appendRoundedCorner(sink, 0, height, 0, height - bottomLeft, bottomLeft);
  sink.lineTo(0, topLeft);
  appendRoundedCorner(sink, 0, 0, topLeft, 0, topLeft);
  sink.closePath();
}

/** CSS-compatible proportional fit: all four authored corners retain their ratio. */
export function fitPatchMapCornerRadii(
  width: number,
  height: number,
  radius: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const [topLeft, topRight, bottomRight, bottomLeft] = radius;
  const scale = Math.min(
    1,
    ratioOrOne(width, topLeft + topRight),
    ratioOrOne(width, bottomLeft + bottomRight),
    ratioOrOne(height, topLeft + bottomLeft),
    ratioOrOne(height, topRight + bottomRight),
  );
  return Object.freeze([
    topLeft * scale,
    topRight * scale,
    bottomRight * scale,
    bottomLeft * scale,
  ] as const);
}

function ratioOrOne(available: number, requested: number): number {
  return requested > 0 ? Math.max(0, available) / requested : 1;
}

function appendRoundedCorner(
  sink: PatchMapRoundedRectPathSink,
  cornerX: number,
  cornerY: number,
  nextX: number,
  nextY: number,
  radius: number,
): void {
  if (radius > 0) sink.arcTo(cornerX, cornerY, nextX, nextY, radius);
  else sink.lineTo(cornerX, cornerY);
}

/** Build top-left-addressed quads, rotating around each supplied entity pivot. */
export function buildQuadGeometry(
  quads: readonly AggregateQuad[],
): AggregateGeometryData {
  const drawable = quads.filter(isFiniteQuad);
  const positions = new Float32Array(drawable.length * 8);
  const uvs = new Float32Array(drawable.length * 8);
  const indices = new Uint32Array(drawable.length * 6);

  for (let primitiveIndex = 0; primitiveIndex < drawable.length; primitiveIndex += 1) {
    const quad = drawable[primitiveIndex] as AggregateQuad;
    const pivotX = quad.pivotX ?? quad.x + quad.width / 2;
    const pivotY = quad.pivotY ?? quad.y + quad.height / 2;
    if (quad.vertices) {
      writeExactQuadPositionValues(positions, primitiveIndex, quad.vertices);
    } else {
      writeQuadPositionValues(
        positions,
        primitiveIndex,
        quad.x,
        quad.y,
        quad.width,
        quad.height,
        quad.rotation ?? 0,
        pivotX,
        pivotY,
      );
    }
    writeUvsAndIndices(uvs, indices, primitiveIndex);
  }

  return finishGeometry(positions, uvs, indices, drawable.length);
}

/** Build butt-capped relation segments as triangle quads. */
export function buildLineGeometry(
  lines: readonly AggregateLine[],
): AggregateGeometryData {
  const drawable = lines.filter(isFiniteLine);
  const positions = new Float32Array(drawable.length * 8);
  const uvs = new Float32Array(drawable.length * 8);
  const indices = new Uint32Array(drawable.length * 6);

  for (let primitiveIndex = 0; primitiveIndex < drawable.length; primitiveIndex += 1) {
    const line = drawable[primitiveIndex] as AggregateLine;
    const deltaX = line.toX - line.fromX;
    const deltaY = line.toY - line.fromY;
    const length = Math.hypot(deltaX, deltaY);
    const normalX = (-deltaY / length) * (line.width / 2);
    const normalY = (deltaX / length) * (line.width / 2);
    const offset = primitiveIndex * 8;
    positions.set(
      [
        line.fromX + normalX,
        line.fromY + normalY,
        line.toX + normalX,
        line.toY + normalY,
        line.toX - normalX,
        line.toY - normalY,
        line.fromX - normalX,
        line.fromY - normalY,
      ],
      offset,
    );
    writeUvsAndIndices(uvs, indices, primitiveIndex);
  }

  return finishGeometry(positions, uvs, indices, drawable.length);
}
