export const ANGLE_SNAP_STEP = Math.PI / 12;
export const DEGREES_PER_RADIAN = 180 / Math.PI;
export const RADIANS_PER_DEGREE = Math.PI / 180;

export const getAngle = (center, point) =>
  Math.atan2(point.y - center.y, point.x - center.x);

export const normalizeAngleDelta = (angle) => {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += Math.PI * 2;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  return normalized;
};

export const snapAngle = (angle, step = ANGLE_SNAP_STEP) =>
  Math.round(angle / step) * step;

export const computeRotationDelta = ({
  center,
  startPoint,
  currentPoint,
  snap = false,
  snapStep = ANGLE_SNAP_STEP,
}) => {
  const delta = normalizeAngleDelta(
    getAngle(center, currentPoint) - getAngle(center, startPoint),
  );
  return snap ? snapAngle(delta, snapStep) : delta;
};

export const rotatePoint = (point, center, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};
