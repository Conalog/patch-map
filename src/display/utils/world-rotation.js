const snapAngle = (angle) => Math.round(angle / 90) * 90;

export const applyWorldRotation = (displayObject, view) => {
  if (!displayObject || !view) return;

  const viewAngle = Number(view.angle ?? 0);
  if (Number.isNaN(viewAngle)) return;

  const prevState = displayObject._rotationState ?? { compensation: 0 };
  const baseAngle = (displayObject.angle ?? 0) - (prevState.compensation ?? 0);
  const snapped = snapAngle(viewAngle);
  const compensation = -snapped;

  displayObject.angle = baseAngle + compensation;
  displayObject._rotationState = {
    baseAngle,
    compensation,
    viewAngle,
  };
};
