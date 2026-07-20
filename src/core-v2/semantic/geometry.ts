export type CoreV2BoundsTuple = readonly [number, number, number, number];

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
