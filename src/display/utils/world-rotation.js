import { ROTATION_THRESHOLD } from '../mixins/constants';

const ROTATION_STATE = Symbol('rotationState');

export const applyWorldRotation = (displayObject, view, options = {}) => {
  if (!displayObject || !view) return;

  const viewAngle = Number(view.angle ?? 0);
  if (Number.isNaN(viewAngle)) return;

  const prevState = displayObject[ROTATION_STATE] ?? {
    compensation: 0,
    basePivotX: displayObject.pivot?.x ?? 0,
    basePivotY: displayObject.pivot?.y ?? 0,
  };
  const baseAngle = (displayObject.angle ?? 0) - (prevState.compensation ?? 0);

  let compensation = 0;
  if (options.mode === 'readable') {
    const normalized = ((viewAngle % 360) + 360) % 360;
    if (
      normalized >= ROTATION_THRESHOLD.MIN &&
      normalized < ROTATION_THRESHOLD.MAX
    ) {
      compensation = 180;
    }
  } else {
    const isFlipped = view.flipX !== view.flipY;
    compensation = isFlipped ? viewAngle : -viewAngle;
  }

  const hadComp = (prevState.compensation ?? 0) !== 0;
  const needsComp = compensation !== 0;
  if (!hadComp && !needsComp) {
    displayObject[ROTATION_STATE] = {
      compensation: 0,
      viewAngle,
      basePivotX: prevState.basePivotX ?? displayObject.pivot?.x ?? 0,
      basePivotY: prevState.basePivotY ?? displayObject.pivot?.y ?? 0,
    };
    return;
  }

  const basePivotX = hadComp
    ? (prevState.basePivotX ?? 0)
    : (displayObject.pivot?.x ?? 0);
  const basePivotY = hadComp
    ? (prevState.basePivotY ?? 0)
    : (displayObject.pivot?.y ?? 0);

  const bounds = displayObject.getLocalBounds?.() ?? {
    x: 0,
    y: 0,
    width: displayObject.width ?? 0,
    height: displayObject.height ?? 0,
  };
  const pivotX = bounds.x + bounds.width / 2;
  const pivotY = bounds.y + bounds.height / 2;

  if (needsComp) {
    displayObject.pivot.set(pivotX, pivotY);
  } else {
    displayObject.pivot.set(basePivotX, basePivotY);
  }
  displayObject.angle = baseAngle + compensation;

  displayObject[ROTATION_STATE] = {
    baseAngle,
    compensation,
    viewAngle,
    pivotX,
    pivotY,
    basePivotX,
    basePivotY,
  };
};
