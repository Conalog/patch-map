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

/** Structural projection input shared by parser sidecars and render probes. */
export interface CoreV2UprightRectInput {
  readonly affine: CoreV2AffineMatrix;
  readonly localBounds: CoreV2BoundsTuple;
  readonly visibleCenter: CoreV2PointTuple;
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * One owner-level counter-oriented content frame. The frame maps owner-local
 * placement into scene space while its children remain positive and upright
 * after the runtime world orientation is applied.
 */
export interface CoreV2UprightOwnerFrame {
  readonly ownerCenterX: number;
  readonly ownerCenterY: number;
  readonly ownerLocalCenterX: number;
  readonly ownerLocalCenterY: number;
  readonly inverseOwner: CoreV2AffineMatrix;
  readonly basisA: number;
  readonly basisB: number;
  readonly basisC: number;
  readonly basisD: number;
  readonly contentA: number;
  readonly contentB: number;
  readonly contentC: number;
  readonly contentD: number;
  readonly fit: number;
}

/** Allocation-free target used by aggregate renderer and semantic geometry. */
export interface CoreV2UprightRectTarget {
  center: [number, number];
  basis: [number, number, number, number];
  width: number;
  height: number;
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

/**
 * Build the largest homothetic, screen-upright owner content frame contained
 * by the transformed owner rectangle. Returning null keeps degenerate authored
 * transforms explicit without making the renderer throw during a frame.
 */
export function resolveCoreV2UprightOwnerFrame(
  owner: CoreV2UprightRectInput,
  world: CoreV2AffineMatrix,
  worldFlipX: boolean,
  worldFlipY: boolean,
): CoreV2UprightOwnerFrame | null {
  const ownerDeterminant =
    owner.affine[0] * owner.affine[3] - owner.affine[1] * owner.affine[2];
  const worldDeterminant = world[0] * world[3] - world[1] * world[2];
  if (
    !Number.isFinite(ownerDeterminant) ||
    !Number.isFinite(worldDeterminant) ||
    Math.abs(ownerDeterminant) <= Number.EPSILON ||
    Math.abs(worldDeterminant) <= Number.EPSILON
  ) {
    return null;
  }

  const inverseOwner = invertCoreV2Affine(owner.affine);
  const inverseWorld = invertCoreV2Affine(world);
  const ownerScaleX = Math.hypot(owner.affine[0], owner.affine[1]);
  const ownerScaleY = Math.hypot(owner.affine[2], owner.affine[3]);
  const positionSignX =
    (owner.scaleX < 0 ? -1 : 1) * (worldFlipX ? -1 : 1);
  const positionSignY =
    (owner.scaleY < 0 ? -1 : 1) * (worldFlipY ? -1 : 1);

  // W^-1 × signed owner scale: W restores readable screen orientation while
  // the signs preserve authored/world placement parity without mirroring text.
  const candidateA = inverseWorld[0] * positionSignX * ownerScaleX;
  const candidateB = inverseWorld[1] * positionSignX * ownerScaleX;
  const candidateC = inverseWorld[2] * positionSignY * ownerScaleY;
  const candidateD = inverseWorld[3] * positionSignY * ownerScaleY;

  // Express the candidate frame in owner-local coordinates. Its rectangular
  // support must stay inside both owner half extents.
  const localA = inverseOwner[0] * candidateA + inverseOwner[2] * candidateB;
  const localB = inverseOwner[1] * candidateA + inverseOwner[3] * candidateB;
  const localC = inverseOwner[0] * candidateC + inverseOwner[2] * candidateD;
  const localD = inverseOwner[1] * candidateC + inverseOwner[3] * candidateD;
  const halfWidth = owner.localBounds[2] / 2;
  const halfHeight = owner.localBounds[3] / 2;
  const supportX = Math.abs(localA) * halfWidth + Math.abs(localC) * halfHeight;
  const supportY = Math.abs(localB) * halfWidth + Math.abs(localD) * halfHeight;
  const fitX = containedAxisFit(halfWidth, supportX);
  const fitY = containedAxisFit(halfHeight, supportY);
  const fit = Math.max(0, Math.min(1, fitX, fitY));
  const basisXLength = Math.hypot(inverseWorld[0], inverseWorld[1]);
  const basisYLength = Math.hypot(inverseWorld[2], inverseWorld[3]);

  return Object.freeze({
    ownerCenterX: owner.visibleCenter[0],
    ownerCenterY: owner.visibleCenter[1],
    ownerLocalCenterX: owner.localBounds[0] + halfWidth,
    ownerLocalCenterY: owner.localBounds[1] + halfHeight,
    inverseOwner,
    basisA: normalizeSignedZero(
      basisXLength === 0 ? 0 : inverseWorld[0] / basisXLength,
    ),
    basisB: normalizeSignedZero(
      basisXLength === 0 ? 0 : inverseWorld[1] / basisXLength,
    ),
    basisC: normalizeSignedZero(
      basisYLength === 0 ? 0 : inverseWorld[2] / basisYLength,
    ),
    basisD: normalizeSignedZero(
      basisYLength === 0 ? 0 : inverseWorld[3] / basisYLength,
    ),
    contentA: candidateA * fit,
    contentB: candidateB * fit,
    contentC: candidateC * fit,
    contentD: candidateD * fit,
    fit,
  });
}

/**
 * Resolve one child through its owner's shared upright content frame. Partial
 * widths preserve the same left-to-right screen-space fill used by bars.
 */
export function writeCoreV2UprightRect(
  output: CoreV2UprightRectTarget,
  child: CoreV2UprightRectInput,
  frame: CoreV2UprightOwnerFrame,
  widthFraction = 1,
): CoreV2UprightRectTarget {
  const fraction = Number.isFinite(widthFraction)
    ? Math.max(0, Math.min(1, widthFraction))
    : 0;
  const inverse = frame.inverseOwner;
  const childCenterX =
    inverse[0] * child.visibleCenter[0] +
    inverse[2] * child.visibleCenter[1] +
    inverse[4];
  const childCenterY =
    inverse[1] * child.visibleCenter[0] +
    inverse[3] * child.visibleCenter[1] +
    inverse[5];
  const localOffsetX = childCenterX - frame.ownerLocalCenterX;
  const localOffsetY = childCenterY - frame.ownerLocalCenterY;
  const fullWidth =
    child.localBounds[2] * Math.hypot(child.affine[0], child.affine[1]) * frame.fit;
  const width = fullWidth * fraction;
  const height =
    child.localBounds[3] * Math.hypot(child.affine[2], child.affine[3]) * frame.fit;
  const partialCenterOffset = (width - fullWidth) / 2;

  output.center[0] =
    frame.ownerCenterX +
    frame.contentA * localOffsetX +
    frame.contentC * localOffsetY +
    frame.basisA * partialCenterOffset;
  output.center[1] =
    frame.ownerCenterY +
    frame.contentB * localOffsetX +
    frame.contentD * localOffsetY +
    frame.basisB * partialCenterOffset;
  output.basis[0] = frame.basisA;
  output.basis[1] = frame.basisB;
  output.basis[2] = frame.basisC;
  output.basis[3] = frame.basisD;
  output.width = width;
  output.height = height;
  return output;
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

function containedAxisFit(halfExtent: number, support: number): number {
  if (halfExtent === 0) return support <= Number.EPSILON ? 1 : 0;
  if (!(support > 0) || !Number.isFinite(support)) return 0;
  return halfExtent / support;
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
