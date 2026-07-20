export type CoreV2BoundsTuple = readonly [number, number, number, number];
export type CoreV2PointTuple = readonly [number, number];
export type CoreV2AffineBasis = readonly [number, number, number, number];
/**
 * Column-major 2D affine coefficients using the Pixi/DOM convention:
 * `x' = a*x + c*y + tx`, `y' = b*x + d*y + ty`.
 */
export type CoreV2AffineMatrix = readonly [number, number, number, number, number, number];

export const CORE_V2_IDENTITY_AFFINE: CoreV2AffineMatrix = Object.freeze([
  1, 0, 0, 1, 0, 0,
] as const);

export interface CoreV2SignedRectTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface CoreV2DenseRectProjection {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly localBounds: CoreV2BoundsTuple;
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * Convert the PATCH MAP top-left transform into the inherited dense renderer's
 * positive-size, center-pivot quad representation. A signed scale changes the
 * quad's handedness, but not its rectangular footprint, so the equivalent
 * dense quad shifts its authored top-left before center-pivot compensation.
 */
export function projectCoreV2SignedRect(
  transform: CoreV2SignedRectTransform,
  localWidth: number,
  localHeight: number,
): CoreV2DenseRectProjection {
  assertFiniteTransform(transform);
  if (!(localWidth >= 0) || !Number.isFinite(localWidth)) {
    throw new TypeError('localWidth must be finite and non-negative');
  }
  if (!(localHeight >= 0) || !Number.isFinite(localHeight)) {
    throw new TypeError('localHeight must be finite and non-negative');
  }

  const width = localWidth * Math.abs(transform.scaleX);
  const height = localHeight * Math.abs(transform.scaleY);
  const radians = transform.rotation * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const signedOffsetX = transform.scaleX < 0 ? -width : 0;
  const signedOffsetY = transform.scaleY < 0 ? -height : 0;
  const authoredX = transform.x + signedOffsetX * cosine - signedOffsetY * sine;
  const authoredY = transform.y + signedOffsetX * sine + signedOffsetY * cosine;
  const centerX = width / 2;
  const centerY = height / 2;

  return Object.freeze({
    x: authoredX - centerX + centerX * cosine - centerY * sine,
    y: authoredY - centerY + centerX * sine + centerY * cosine,
    width,
    height,
    rotation: transform.rotation,
    localBounds: freezeCoreV2Bounds(0, 0, localWidth, localHeight),
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
  });
}

export function freezeCoreV2Bounds(
  x: number,
  y: number,
  width: number,
  height: number,
): CoreV2BoundsTuple {
  return Object.freeze([x, y, width, height] as const);
}

export function createCoreV2Affine(
  x = 0,
  y = 0,
  rotationDegrees = 0,
  scaleX = 1,
  scaleY = 1,
): CoreV2AffineMatrix {
  for (const value of [x, y, rotationDegrees, scaleX, scaleY]) {
    if (!Number.isFinite(value)) throw new TypeError('affine transform values must be finite');
  }
  const radians = rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return freezeCoreV2Affine(
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    x,
    y,
  );
}

/** Return `parent * local`, so local points are transformed before parent points. */
export function multiplyCoreV2Affine(
  parent: CoreV2AffineMatrix,
  local: CoreV2AffineMatrix,
): CoreV2AffineMatrix {
  assertFiniteAffine(parent);
  assertFiniteAffine(local);
  const [pa, pb, pc, pd, ptx, pty] = parent;
  const [la, lb, lc, ld, ltx, lty] = local;
  return freezeCoreV2Affine(
    pa * la + pc * lb,
    pb * la + pd * lb,
    pa * lc + pc * ld,
    pb * lc + pd * ld,
    pa * ltx + pc * lty + ptx,
    pb * ltx + pd * lty + pty,
  );
}

export function invertCoreV2Affine(matrix: CoreV2AffineMatrix): CoreV2AffineMatrix {
  assertFiniteAffine(matrix);
  const [a, b, c, d, tx, ty] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) {
    throw new RangeError('affine transform must be invertible');
  }
  const inverse = 1 / determinant;
  return freezeCoreV2Affine(
    d * inverse,
    -b * inverse,
    -c * inverse,
    a * inverse,
    (c * ty - d * tx) * inverse,
    (b * tx - a * ty) * inverse,
  );
}

export function applyCoreV2Affine(
  matrix: CoreV2AffineMatrix,
  point: CoreV2PointTuple,
): CoreV2PointTuple {
  assertFiniteAffine(matrix);
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new TypeError('affine point must contain finite coordinates');
  }
  return freezeCoreV2Point(
    matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
    matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
  );
}

export function coreV2AffineBasis(matrix: CoreV2AffineMatrix): CoreV2AffineBasis {
  assertFiniteAffine(matrix);
  const xLength = Math.hypot(matrix[0], matrix[1]);
  const yLength = Math.hypot(matrix[2], matrix[3]);
  return Object.freeze([
    normalizeSignedZero(xLength === 0 ? 0 : matrix[0] / xLength),
    normalizeSignedZero(xLength === 0 ? 0 : matrix[1] / xLength),
    normalizeSignedZero(yLength === 0 ? 0 : matrix[2] / yLength),
    normalizeSignedZero(yLength === 0 ? 0 : matrix[3] / yLength),
  ] as const);
}

export function coreV2AffineCenter(
  matrix: CoreV2AffineMatrix,
  bounds: CoreV2BoundsTuple,
): CoreV2PointTuple {
  return applyCoreV2Affine(matrix, [
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ]);
}

export function coreV2AffineCorners(
  matrix: CoreV2AffineMatrix,
  bounds: CoreV2BoundsTuple,
): readonly [
  CoreV2PointTuple,
  CoreV2PointTuple,
  CoreV2PointTuple,
  CoreV2PointTuple,
] {
  const [x, y, width, height] = bounds;
  return Object.freeze([
    applyCoreV2Affine(matrix, [x, y]),
    applyCoreV2Affine(matrix, [x + width, y]),
    applyCoreV2Affine(matrix, [x + width, y + height]),
    applyCoreV2Affine(matrix, [x, y + height]),
  ] as const);
}

export function coreV2AffineHasSkew(matrix: CoreV2AffineMatrix, epsilon = 1e-9): boolean {
  assertFiniteAffine(matrix);
  const xLength = Math.hypot(matrix[0], matrix[1]);
  const yLength = Math.hypot(matrix[2], matrix[3]);
  if (xLength === 0 || yLength === 0) return false;
  return Math.abs((matrix[0] * matrix[2] + matrix[1] * matrix[3]) / (xLength * yLength)) > epsilon;
}

export function freezeCoreV2Affine(
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
): CoreV2AffineMatrix {
  const matrix = [a, b, c, d, tx, ty] as const;
  assertFiniteAffine(matrix);
  return Object.freeze(matrix);
}

export function freezeCoreV2Point(x: number, y: number): CoreV2PointTuple {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('point values must be finite');
  }
  return Object.freeze([x, y] as const);
}

function assertFiniteTransform(transform: CoreV2SignedRectTransform): void {
  if (
    !Number.isFinite(transform.x) ||
    !Number.isFinite(transform.y) ||
    !Number.isFinite(transform.rotation) ||
    !Number.isFinite(transform.scaleX) ||
    !Number.isFinite(transform.scaleY)
  ) {
    throw new TypeError('transform must contain finite x, y, rotation, scaleX, and scaleY');
  }
}

function assertFiniteAffine(matrix: CoreV2AffineMatrix): void {
  if (matrix.length !== 6 || !matrix.every(Number.isFinite)) {
    throw new TypeError('affine matrix must contain six finite coefficients');
  }
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
