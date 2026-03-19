const RADIAN = Math.PI / 180;

export const normalizeAngle = (value) => ((value % 360) + 360) % 360;

export const resolveReadableAngle = (value) => {
  const normalized = normalizeAngle(value);
  const horizontal = Math.cos(normalized * RADIAN);

  if (horizontal < -1e-7) {
    return normalized >= 180 ? normalized - 180 : normalized + 180;
  }

  if (horizontal > 1e-7) {
    return normalized;
  }

  const vertical = Math.sin(normalized * RADIAN);
  return vertical >= 0
    ? normalized >= 180
      ? normalized - 180
      : normalized + 180
    : normalized;
};

export const getReadableRotationCompensation = (value) =>
  normalizeAngle(resolveReadableAngle(value) - normalizeAngle(value));
