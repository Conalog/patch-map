const normalizeScreenAngle = (angle) => {
  if (!Number.isFinite(angle)) return null;
  return ((angle % 360) + 360) % 360;
};

export const isUpsideDownScreenAngle = (angle) => {
  const normalized = normalizeScreenAngle(angle);
  if (normalized == null) return false;
  return normalized >= 90 && normalized < 270;
};

export const mapScreenDirection = (screen, direction) => {
  if (!screen) return direction;
  if (isUpsideDownScreenAngle(screen.angle ?? 0)) {
    if (direction === 'left') return 'right';
    if (direction === 'right') return 'left';
    if (direction === 'top') return 'bottom';
    if (direction === 'bottom') return 'top';
  }
  return direction;
};
