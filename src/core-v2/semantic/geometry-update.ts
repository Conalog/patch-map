import type {
  CoreV2Attrs,
  CoreV2Element,
  CoreV2FixedSize,
  CoreV2RectElement,
} from './dataset';
import {
  CORE_V2_IDENTITY_AFFINE,
  applyCoreV2Affine,
  createCoreV2Affine,
  multiplyCoreV2Affine,
  type CoreV2AffineMatrix,
  type CoreV2PointTuple,
} from './geometry';

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

export type CoreV2GeometryUpdateDiagnosticCode =
  | 'INVALID_GEOMETRY_TARGET'
  | 'INVALID_GEOMETRY_VALUE'
  | 'UNSUPPORTED_GEOMETRY_ORIGIN'
  | 'UNSUPPORTED_GEOMETRY_TARGET_TYPE';

export interface CoreV2GeometryUpdateDiagnostic {
  readonly code: CoreV2GeometryUpdateDiagnosticCode;
  readonly category: 'INVALID_INPUT' | 'UNSUPPORTED_RUNTIME';
  readonly path: string;
  readonly message: string;
}

export interface CoreV2RelativeGeometryChanges {
  readonly attrs?: Readonly<{
    readonly x?: number;
    readonly y?: number;
  }>;
  /** Relative authored rotation in degrees, regardless of the stored rotation channel. */
  readonly angle?: number;
}

export interface CoreV2VisibleCenterResize {
  readonly origin: string;
  readonly size: CoreV2FixedSize;
  /** Exact parent-local-to-world authority. It may include rotation, signed scale, and pivot. */
  readonly parentAffine?: CoreV2AffineMatrix;
}

export type CoreV2GeometryUpdateResult =
  | Readonly<{
      status: 'changed' | 'unchanged';
      changed: boolean;
      candidate: CoreV2RectElement;
    }>
  | CoreV2GeometryUpdateFailure;

export type CoreV2VisibleCenterResizeResult =
  | Readonly<{
      status: 'changed' | 'unchanged';
      changed: boolean;
      candidate: CoreV2RectElement;
      centerBefore: CoreV2PointTuple;
      centerAfter: CoreV2PointTuple;
    }>
  | CoreV2GeometryUpdateFailure;

export type CoreV2GeometryUpdateFailure = Readonly<{
  status: 'rejected' | 'unsupported';
  changed: false;
  candidate: null;
  diagnostic: CoreV2GeometryUpdateDiagnostic;
}>;

interface ValidatedRectGeometry {
  readonly record: CoreV2RectElement;
  readonly attrs: CoreV2Attrs;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationChannel: 'angle' | 'rotation' | 'none';
  readonly rotationDegrees: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * Compose a relative geometry action from the current absolute authored record.
 * The result remains in the caller's original angle channel: degrees in `angle`,
 * radians in `rotation`, and a new degree-valued `angle` when neither exists.
 */
export function applyCoreV2RelativeGeometryUpdate(
  target: CoreV2Element,
  changes: CoreV2RelativeGeometryChanges,
): CoreV2GeometryUpdateResult {
  try {
    const geometry = validateRectGeometry(target);
    const relative = validateRelativeChanges(changes);
    const nextAttrs = cloneAttrs(geometry.attrs);
    let changed = false;

    if (relative.x !== undefined && relative.x !== 0) {
      nextAttrs.x = finiteResult(geometry.x + relative.x, '$.candidate.attrs.x');
      changed = true;
    }
    if (relative.y !== undefined && relative.y !== 0) {
      nextAttrs.y = finiteResult(geometry.y + relative.y, '$.candidate.attrs.y');
      changed = true;
    }
    if (relative.angle !== undefined && relative.angle !== 0) {
      if (geometry.rotationChannel === 'rotation') {
        const current = geometry.rotationDegrees * DEGREES_TO_RADIANS;
        nextAttrs.rotation = finiteResult(
          current + relative.angle * DEGREES_TO_RADIANS,
          '$.candidate.attrs.rotation',
        );
      } else {
        nextAttrs.angle = finiteResult(
          geometry.rotationDegrees + relative.angle,
          '$.candidate.attrs.angle',
        );
      }
      changed = true;
    }

    if (!changed) {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        candidate: geometry.record,
      });
    }

    return Object.freeze({
      status: 'changed',
      changed: true,
      candidate: createCandidate(geometry.record, nextAttrs),
    });
  } catch (error) {
    return failureResult(error);
  }
}

/**
 * Resize an authored rectangle while preserving the center of its transformed
 * visible quad. The calculation uses semantic affine authority only; renderer
 * bounds are deliberately not an input.
 */
export function resizeCoreV2GeometryAroundOrigin(
  target: CoreV2Element,
  resize: CoreV2VisibleCenterResize,
): CoreV2VisibleCenterResizeResult {
  try {
    const request = validateResize(resize);
    if (request.origin !== 'visible-center') {
      unsupported(
        'UNSUPPORTED_GEOMETRY_ORIGIN',
        '$.origin',
        `geometry resize origin ${JSON.stringify(request.origin)} is outside the approved profile`,
      );
    }
    const geometry = validateRectGeometry(target);
    const parentAffine = validateAffine(request.parentAffine);
    const centerBefore = visibleCenter(
      geometry,
      parentAffine,
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
    );

    if (request.width === geometry.width && request.height === geometry.height) {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        candidate: geometry.record,
        centerBefore,
        centerAfter: centerBefore,
      });
    }

    const rotationScale = createCoreV2Affine(
      0,
      0,
      geometry.rotationDegrees,
      geometry.scaleX,
      geometry.scaleY,
    );
    const oldCenterOffset = applyCoreV2Affine(rotationScale, [
      geometry.width / 2,
      geometry.height / 2,
    ]);
    const newCenterOffset = applyCoreV2Affine(rotationScale, [
      request.width / 2,
      request.height / 2,
    ]);
    const nextX = finiteResult(
      geometry.x + oldCenterOffset[0] - newCenterOffset[0],
      '$.candidate.attrs.x',
    );
    const nextY = finiteResult(
      geometry.y + oldCenterOffset[1] - newCenterOffset[1],
      '$.candidate.attrs.y',
    );
    const nextAttrs = cloneAttrs(geometry.attrs);
    nextAttrs.x = nextX;
    nextAttrs.y = nextY;
    const candidate = createCandidate(
      geometry.record,
      nextAttrs,
      Object.freeze({ width: request.width, height: request.height }),
    );
    const centerAfter = visibleCenter(
      {
        ...geometry,
        record: candidate,
        attrs: candidate.attrs ?? Object.freeze({}),
        x: nextX,
        y: nextY,
        width: request.width,
        height: request.height,
      },
      parentAffine,
      nextX,
      nextY,
      request.width,
      request.height,
    );

    return Object.freeze({
      status: 'changed',
      changed: true,
      candidate,
      centerBefore,
      centerAfter,
    });
  } catch (error) {
    return failureResult(error);
  }
}

function visibleCenter(
  geometry: ValidatedRectGeometry,
  parentAffine: CoreV2AffineMatrix,
  x: number,
  y: number,
  width: number,
  height: number,
): CoreV2PointTuple {
  try {
    const localAffine = createCoreV2Affine(
      x,
      y,
      geometry.rotationDegrees,
      geometry.scaleX,
      geometry.scaleY,
    );
    return applyCoreV2Affine(
      multiplyCoreV2Affine(parentAffine, localAffine),
      [width / 2, height / 2],
    );
  } catch (error) {
    if (error instanceof GeometryUpdateFailure) throw error;
    invalid(
      'INVALID_GEOMETRY_VALUE',
      '$.geometry',
      'geometry transform overflowed the finite affine profile',
    );
  }
}

function validateRectGeometry(target: CoreV2Element): ValidatedRectGeometry {
  if (!isPlainRecord(target)) {
    invalid('INVALID_GEOMETRY_TARGET', '$.target', 'target must be a plain logical element');
  }
  if (target.type !== 'rect') {
    unsupported(
      'UNSUPPORTED_GEOMETRY_TARGET_TYPE',
      '$.target.type',
      `geometry updates currently support the approved rect profile, received ${JSON.stringify(target.type)}`,
    );
  }
  if (typeof target.id !== 'string') {
    invalid('INVALID_GEOMETRY_TARGET', '$.target.id', 'target id must be a string');
  }
  if (!isPlainRecord(target.size)) {
    invalid('INVALID_GEOMETRY_VALUE', '$.target.size', 'rect size must be a width/height record');
  }

  const width = nonnegativeFinite(target.size.width, '$.target.size.width');
  const height = nonnegativeFinite(target.size.height, '$.target.size.height');
  const attrs: CoreV2Attrs = target.attrs === undefined
    ? Object.freeze({})
    : validateAttrs(target.attrs);
  const x = optionalFinite(attrs.x, '$.target.attrs.x', 0);
  const y = optionalFinite(attrs.y, '$.target.attrs.y', 0);
  const hasAngle = hasOwn(attrs, 'angle');
  const hasRotation = hasOwn(attrs, 'rotation');
  if (hasAngle && hasRotation) {
    invalid(
      'INVALID_GEOMETRY_VALUE',
      '$.target.attrs',
      'angle and rotation channels are mutually exclusive',
    );
  }
  const angle = hasAngle ? finite(attrs.angle, '$.target.attrs.angle') : 0;
  const rotation = hasRotation ? finite(attrs.rotation, '$.target.attrs.rotation') : 0;

  return Object.freeze({
    record: target,
    attrs,
    x,
    y,
    width,
    height,
    rotationChannel: hasAngle ? 'angle' : hasRotation ? 'rotation' : 'none',
    rotationDegrees: hasAngle ? angle : rotation * RADIANS_TO_DEGREES,
    scaleX: optionalFinite(attrs.scaleX, '$.target.attrs.scaleX', 1),
    scaleY: optionalFinite(attrs.scaleY, '$.target.attrs.scaleY', 1),
  });
}

function validateRelativeChanges(changes: CoreV2RelativeGeometryChanges): Readonly<{
  x?: number;
  y?: number;
  angle?: number;
}> {
  if (!isPlainRecord(changes)) {
    invalid('INVALID_GEOMETRY_VALUE', '$.changes', 'relative changes must be a plain record');
  }
  assertKnownKeys(changes, new Set(['attrs', 'angle']), '$.changes');
  let x: number | undefined;
  let y: number | undefined;
  if (changes.attrs !== undefined) {
    if (!isPlainRecord(changes.attrs)) {
      invalid('INVALID_GEOMETRY_VALUE', '$.changes.attrs', 'relative attrs must be a plain record');
    }
    assertKnownKeys(changes.attrs, new Set(['x', 'y']), '$.changes.attrs');
    if (hasOwn(changes.attrs, 'x')) x = finite(changes.attrs.x, '$.changes.attrs.x');
    if (hasOwn(changes.attrs, 'y')) y = finite(changes.attrs.y, '$.changes.attrs.y');
  }
  const angle = hasOwn(changes, 'angle')
    ? finite(changes.angle, '$.changes.angle')
    : undefined;
  return Object.freeze({
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(angle === undefined ? {} : { angle }),
  });
}

function validateResize(resize: CoreV2VisibleCenterResize): Readonly<{
  origin: string;
  width: number;
  height: number;
  parentAffine?: CoreV2AffineMatrix;
}> {
  if (!isPlainRecord(resize)) {
    invalid('INVALID_GEOMETRY_VALUE', '$', 'resize request must be a plain record');
  }
  assertKnownKeys(resize, new Set(['origin', 'size', 'parentAffine']), '$');
  if (typeof resize.origin !== 'string') {
    invalid('INVALID_GEOMETRY_VALUE', '$.origin', 'origin must be a string');
  }
  if (!isPlainRecord(resize.size)) {
    invalid('INVALID_GEOMETRY_VALUE', '$.size', 'size must be a width/height record');
  }
  return Object.freeze({
    origin: resize.origin,
    width: nonnegativeFinite(resize.size.width, '$.size.width'),
    height: nonnegativeFinite(resize.size.height, '$.size.height'),
    ...(resize.parentAffine === undefined ? {} : { parentAffine: resize.parentAffine }),
  });
}

function validateAffine(value: CoreV2AffineMatrix | undefined): CoreV2AffineMatrix {
  if (value === undefined) return CORE_V2_IDENTITY_AFFINE;
  if (!Array.isArray(value) || value.length !== 6 || !value.every(Number.isFinite)) {
    invalid(
      'INVALID_GEOMETRY_VALUE',
      '$.parentAffine',
      'parentAffine must contain six finite coefficients',
    );
  }
  return Object.freeze([...value]) as unknown as CoreV2AffineMatrix;
}

function validateAttrs(value: unknown): CoreV2Attrs {
  if (!isPlainRecord(value)) {
    invalid('INVALID_GEOMETRY_VALUE', '$.target.attrs', 'attrs must be a plain record');
  }
  return value;
}

function createCandidate(
  record: CoreV2RectElement,
  attrs: Record<string, unknown>,
  size = record.size,
): CoreV2RectElement {
  return Object.freeze({
    ...record,
    attrs: Object.freeze(attrs),
    size,
  });
}

function cloneAttrs(attrs: CoreV2Attrs): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: attrs[key],
      writable: true,
    });
  }
  return clone;
}

function optionalFinite(value: unknown, path: string, fallback: number): number {
  return value === undefined ? fallback : finite(value, path);
}

function nonnegativeFinite(value: unknown, path: string): number {
  const result = finite(value, path);
  if (result < 0) {
    invalid('INVALID_GEOMETRY_VALUE', path, 'value must be non-negative');
  }
  return result;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid('INVALID_GEOMETRY_VALUE', path, 'value must be finite');
  }
  return normalizeSignedZero(value);
}

function finiteResult(value: number, path: string): number {
  if (!Number.isFinite(value)) {
    invalid('INVALID_GEOMETRY_VALUE', path, 'computed value must remain finite');
  }
  return normalizeSignedZero(value);
}

function assertKnownKeys(
  record: Readonly<Record<string, unknown>>,
  keys: ReadonlySet<string>,
  path: string,
): void {
  const unknownKey = Object.keys(record).find((key) => !keys.has(key));
  if (unknownKey !== undefined) {
    invalid('INVALID_GEOMETRY_VALUE', `${path}.${unknownKey}`, 'field is not supported');
  }
}

function failureResult(error: unknown): CoreV2GeometryUpdateFailure {
  if (!(error instanceof GeometryUpdateFailure)) throw error;
  return Object.freeze({
    status: error.status,
    changed: false,
    candidate: null,
    diagnostic: error.diagnostic,
  });
}

function invalid(
  code: Extract<
    CoreV2GeometryUpdateDiagnosticCode,
    'INVALID_GEOMETRY_TARGET' | 'INVALID_GEOMETRY_VALUE'
  >,
  path: string,
  message: string,
): never {
  throw new GeometryUpdateFailure(
    'rejected',
    Object.freeze({ code, category: 'INVALID_INPUT', path, message }),
  );
}

function unsupported(
  code: Extract<
    CoreV2GeometryUpdateDiagnosticCode,
    'UNSUPPORTED_GEOMETRY_ORIGIN' | 'UNSUPPORTED_GEOMETRY_TARGET_TYPE'
  >,
  path: string,
  message: string,
): never {
  throw new GeometryUpdateFailure(
    'unsupported',
    Object.freeze({ code, category: 'UNSUPPORTED_RUNTIME', path, message }),
  );
}

class GeometryUpdateFailure extends Error {
  public constructor(
    public readonly status: 'rejected' | 'unsupported',
    public readonly diagnostic: CoreV2GeometryUpdateDiagnostic,
  ) {
    super(diagnostic.message);
    this.name = 'GeometryUpdateFailure';
  }
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
