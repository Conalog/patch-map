export type PatchMapBoundsTuple = readonly [number, number, number, number];
export type PatchMapPointTuple = readonly [number, number];
export type PatchMapAffineBasis = readonly [number, number, number, number];
/**
 * Column-major 2D affine coefficients using the Pixi/DOM convention:
 * `x' = a*x + c*y + tx`, `y' = b*x + d*y + ty`.
 */
export type PatchMapAffineMatrix = readonly [number, number, number, number, number, number];

export const PATCH_MAP_IDENTITY_AFFINE: PatchMapAffineMatrix = Object.freeze([
  1, 0, 0, 1, 0, 0,
] as const);

export interface PatchMapSignedRectTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface PatchMapDenseRectProjection {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly localBounds: PatchMapBoundsTuple;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** Structural projection input shared by parser sidecars and render probes. */
export interface PatchMapReadableRectInput {
  readonly affine: PatchMapAffineMatrix;
  readonly localBounds: PatchMapBoundsTuple;
  readonly visibleCenter: PatchMapPointTuple;
}

/**
 * Allocation-free target for readable content. `basis` is written in scene
 * space so the shared Pixi world container produces the intended screen pose.
 */
export interface PatchMapReadableRectTarget {
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
export function projectPatchMapSignedRect(
  transform: PatchMapSignedRectTransform,
  localWidth: number,
  localHeight: number,
): PatchMapDenseRectProjection {
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
    localBounds: freezePatchMapBounds(0, 0, localWidth, localHeight),
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
  });
}

export function freezePatchMapBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): PatchMapBoundsTuple {
  return Object.freeze([x, y, width, height] as const);
}

export function createPatchMapAffine(
  x = 0,
  y = 0,
  rotationDegrees = 0,
  scaleX = 1,
  scaleY = 1,
): PatchMapAffineMatrix {
  for (const value of [x, y, rotationDegrees, scaleX, scaleY]) {
    if (!Number.isFinite(value)) throw new TypeError('affine transform values must be finite');
  }
  const radians = rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return freezePatchMapAffine(
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    x,
    y,
  );
}

/** Return `parent * local`, so local points are transformed before parent points. */
export function multiplyPatchMapAffine(
  parent: PatchMapAffineMatrix,
  local: PatchMapAffineMatrix,
): PatchMapAffineMatrix {
  assertFiniteAffine(parent);
  assertFiniteAffine(local);
  const [pa, pb, pc, pd, ptx, pty] = parent;
  const [la, lb, lc, ld, ltx, lty] = local;
  return freezePatchMapAffine(
    pa * la + pc * lb,
    pb * la + pd * lb,
    pa * lc + pc * ld,
    pb * lc + pd * ld,
    pa * ltx + pc * lty + ptx,
    pb * ltx + pd * lty + pty,
  );
}

export function invertPatchMapAffine(matrix: PatchMapAffineMatrix): PatchMapAffineMatrix {
  assertFiniteAffine(matrix);
  const [a, b, c, d, tx, ty] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) {
    throw new RangeError('affine transform must be invertible');
  }
  const inverse = 1 / determinant;
  return freezePatchMapAffine(
    d * inverse,
    -b * inverse,
    -c * inverse,
    a * inverse,
    (c * ty - d * tx) * inverse,
    (b * tx - a * ty) * inverse,
  );
}

export function applyPatchMapAffine(
  matrix: PatchMapAffineMatrix,
  point: PatchMapPointTuple,
): PatchMapPointTuple {
  assertFiniteAffine(matrix);
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new TypeError('affine point must contain finite coordinates');
  }
  return freezePatchMapPoint(
    matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
    matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
  );
}

export function patchMapAffineBasis(matrix: PatchMapAffineMatrix): PatchMapAffineBasis {
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

export function patchMapAffineCenter(
  matrix: PatchMapAffineMatrix,
  bounds: PatchMapBoundsTuple,
): PatchMapPointTuple {
  return applyPatchMapAffine(matrix, [
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ]);
}

export function patchMapAffineCorners(
  matrix: PatchMapAffineMatrix,
  bounds: PatchMapBoundsTuple,
): readonly [
  PatchMapPointTuple,
  PatchMapPointTuple,
  PatchMapPointTuple,
  PatchMapPointTuple,
] {
  const [x, y, width, height] = bounds;
  return Object.freeze([
    applyPatchMapAffine(matrix, [x, y]),
    applyPatchMapAffine(matrix, [x + width, y]),
    applyPatchMapAffine(matrix, [x + width, y + height]),
    applyPatchMapAffine(matrix, [x, y + height]),
  ] as const);
}

/**
 * Keep content attached to its authored item frame while preventing mirrored
 * or upside-down screen output. The final screen basis follows the authored
 * rotation, removes reflection, and adds 180° only while its x-axis lies in
 * the unreadable half-plane [90°, 270°). This matches PATCH MAP's readable
 * orientation rather than pinning every component to the screen axes.
 */
export function writePatchMapReadableRect(
  output: PatchMapReadableRectTarget,
  child: PatchMapReadableRectInput,
  worldA: number,
  worldB: number,
  worldC: number,
  worldD: number,
  widthFraction = 1,
  placementAnchor?: PatchMapPointTuple,
): PatchMapReadableRectTarget {
  const fraction = Number.isFinite(widthFraction)
    ? Math.max(0, Math.min(1, widthFraction))
    : 0;
  const [a, b, c, d] = child.affine;
  const xScale = Math.hypot(a, b);
  const yScale = Math.hypot(c, d);
  const screenXA = worldA * a + worldC * b;
  const screenXB = worldB * a + worldD * b;
  const screenYA = worldA * c + worldC * d;
  const screenYB = worldB * c + worldD * d;
  const screenXLength = Math.hypot(screenXA, screenXB);
  const screenYLength = Math.hypot(screenYA, screenYB);

  let readableA = screenXLength === 0 ? 1 : screenXA / screenXLength;
  let readableB = screenXLength === 0 ? 0 : screenXB / screenXLength;
  let readableC = screenYLength === 0 ? -readableB : screenYA / screenYLength;
  let readableD = screenYLength === 0 ? readableA : screenYB / screenYLength;
  const screenDeterminant = readableA * readableD - readableB * readableC;
  if (screenDeterminant < 0) {
    readableC = -readableC;
    readableD = -readableD;
  } else if (Math.abs(screenDeterminant) <= Number.EPSILON) {
    readableC = -readableB;
    readableD = readableA;
  }
  if (needsReadableHalfTurn(readableA, readableB)) {
    readableA = -readableA;
    readableB = -readableB;
    readableC = -readableC;
    readableD = -readableD;
  }

  const worldDeterminant = worldA * worldD - worldB * worldC;
  const inverseWorldA = worldD / worldDeterminant;
  const inverseWorldB = -worldB / worldDeterminant;
  const inverseWorldC = -worldC / worldDeterminant;
  const inverseWorldD = worldA / worldDeterminant;
  const basisA = inverseWorldA * readableA + inverseWorldC * readableB;
  const basisB = inverseWorldB * readableA + inverseWorldD * readableB;
  const basisC = inverseWorldA * readableC + inverseWorldC * readableD;
  const basisD = inverseWorldB * readableC + inverseWorldD * readableD;
  const fullWidth = child.localBounds[2] * xScale;
  const width = fullWidth * fraction;
  const height = child.localBounds[3] * yScale;
  const partialCenterOffset = (width - fullWidth) / 2;
  let centerX = child.visibleCenter[0];
  let centerY = child.visibleCenter[1];

  /*
   * Readable orientation is a component transform, not only a glyph/quad
   * basis transform. Bars opt into an owner-center anchor so a bottom-placed
   * bar stays on the readable bottom after reflection or the half-plane's
   * 180° correction. Text deliberately omits the anchor and keeps its authored
   * center. The inverse original basis preserves the exact authored offset,
   * including signed scale and skew, without allocating matrices per entity.
   */
  if (placementAnchor !== undefined && xScale > 0 && yScale > 0) {
    const originalA = a / xScale;
    const originalB = b / xScale;
    const originalC = c / yScale;
    const originalD = d / yScale;
    const originalDeterminant = originalA * originalD - originalB * originalC;
    if (Math.abs(originalDeterminant) > Number.EPSILON) {
      const offsetX = child.visibleCenter[0] - placementAnchor[0];
      const offsetY = child.visibleCenter[1] - placementAnchor[1];
      const inverseOriginal = 1 / originalDeterminant;
      const localOffsetX =
        (originalD * offsetX - originalC * offsetY) * inverseOriginal;
      const localOffsetY =
        (-originalB * offsetX + originalA * offsetY) * inverseOriginal;
      centerX =
        placementAnchor[0] + basisA * localOffsetX + basisC * localOffsetY;
      centerY =
        placementAnchor[1] + basisB * localOffsetX + basisD * localOffsetY;
    }
  }

  output.center[0] = centerX + basisA * partialCenterOffset;
  output.center[1] = centerY + basisB * partialCenterOffset;
  output.basis[0] = normalizeSignedZero(basisA);
  output.basis[1] = normalizeSignedZero(basisB);
  output.basis[2] = normalizeSignedZero(basisC);
  output.basis[3] = normalizeSignedZero(basisD);
  output.width = width;
  output.height = height;
  return output;
}

export function patchMapAffineHasSkew(matrix: PatchMapAffineMatrix, epsilon = 1e-9): boolean {
  assertFiniteAffine(matrix);
  const xLength = Math.hypot(matrix[0], matrix[1]);
  const yLength = Math.hypot(matrix[2], matrix[3]);
  if (xLength === 0 || yLength === 0) return false;
  return Math.abs((matrix[0] * matrix[2] + matrix[1] * matrix[3]) / (xLength * yLength)) > epsilon;
}

export function freezePatchMapAffine(
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
): PatchMapAffineMatrix {
  const matrix = [a, b, c, d, tx, ty] as const;
  assertFiniteAffine(matrix);
  return Object.freeze(matrix);
}

function freezePatchMapPoint(x: number, y: number): PatchMapPointTuple {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('point values must be finite');
  }
  return Object.freeze([x, y] as const);
}

function assertFiniteTransform(transform: PatchMapSignedRectTransform): void {
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

function assertFiniteAffine(matrix: PatchMapAffineMatrix): void {
  if (matrix.length !== 6 || !matrix.every(Number.isFinite)) {
    throw new TypeError('affine matrix must contain six finite coefficients');
  }
}

function needsReadableHalfTurn(x: number, y: number): boolean {
  if (x < -1e-7) return true;
  if (x > 1e-7) return false;
  return y >= 0;
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
