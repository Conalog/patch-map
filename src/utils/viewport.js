export const MIN_VIEWPORT_SCALE = 1e-6;

export const getSafeViewportScale = (viewport) => {
  const rawScale = viewport?.scale?.x ?? 1;
  const normalizedScale = Number.isFinite(rawScale) ? Math.abs(rawScale) : 1;
  return Math.max(MIN_VIEWPORT_SCALE, normalizedScale);
};
