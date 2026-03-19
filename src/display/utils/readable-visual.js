import { Matrix } from 'pixi.js';
import { resolveReadableAngle } from './readable-rotation';

const DEGREE = 180 / Math.PI;
const RADIAN = Math.PI / 180;

export const resetReadableVisual = (visual) => {
  visual.position.set(0, 0);
  visual.rotation = 0;
  visual.scale.set(1, 1);
  visual.skew?.set?.(0, 0);
  visual.pivot.set(0, 0);
};

export const decomposeReadableVisualMatrix = (matrix) => {
  const transform = {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    skew: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    rotation: 0,
  };

  matrix.decompose(transform);
  return transform;
};

export const buildReadableVisualGlobalMatrix = (matrix) => {
  const angle = Math.atan2(matrix.b, matrix.a) * DEGREE;
  const readableAngle = resolveReadableAngle(angle);
  const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
  const scaleY = Math.hypot(matrix.c, matrix.d) || 1;
  const readableMatrix = new Matrix();

  readableMatrix.setTransform(
    matrix.tx,
    matrix.ty,
    0,
    0,
    scaleX,
    scaleY,
    readableAngle * RADIAN,
    0,
    0,
  );

  return readableMatrix;
};

export const readBoundsCenter = (bounds) => ({
  x: (bounds.x ?? 0) + (bounds.width ?? 0) / 2,
  y: (bounds.y ?? 0) + (bounds.height ?? 0) / 2,
});

export const applyMatrixToPoint = (matrix, x, y) => ({
  x: matrix.a * x + matrix.c * y + matrix.tx,
  y: matrix.b * x + matrix.d * y + matrix.ty,
});

export const applyLinearMatrixToPoint = (matrix, x, y) => ({
  x: matrix.a * x + matrix.c * y,
  y: matrix.b * x + matrix.d * y,
});

export const resolveReadableVisualTransform = (outerGlobal) => {
  const outerLinear = outerGlobal.clone();
  outerLinear.tx = 0;
  outerLinear.ty = 0;

  const localCompensation = outerLinear.clone().invert();
  localCompensation.append(buildReadableVisualGlobalMatrix(outerLinear));

  return decomposeReadableVisualMatrix(localCompensation);
};

export const resolveReadableVisualCenterDelta = (
  baseBounds,
  transformedBounds,
  outerGlobal,
) => {
  const baseCenter = readBoundsCenter(baseBounds);
  const expectedCenter = applyMatrixToPoint(
    outerGlobal,
    baseCenter.x,
    baseCenter.y,
  );
  const actualCenter = readBoundsCenter(transformedBounds);
  const outerLinear = outerGlobal.clone();
  outerLinear.tx = 0;
  outerLinear.ty = 0;

  return applyLinearMatrixToPoint(
    outerLinear.clone().invert(),
    expectedCenter.x - actualCenter.x,
    expectedCenter.y - actualCenter.y,
  );
};
