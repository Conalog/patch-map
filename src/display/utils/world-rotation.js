import { Point } from 'pixi.js';

const snapAngle = (angle) => Math.round(angle / 90) * 90;
const tempWorldPoint = new Point();
const tempParentPoint = new Point();

const getBoundsTopLeftInParent = (displayObject) => {
  if (!displayObject) {
    return { x: 0, y: 0 };
  }
  const bounds = displayObject.getBounds?.() ?? {
    x: displayObject.x ?? 0,
    y: displayObject.y ?? 0,
    width: 0,
    height: 0,
  };
  if (!displayObject.parent) {
    return { x: bounds.x, y: bounds.y };
  }
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const corner of corners) {
    tempWorldPoint.set(corner.x, corner.y);
    displayObject.parent.toLocal(tempWorldPoint, undefined, tempParentPoint);
    minX = Math.min(minX, tempParentPoint.x);
    minY = Math.min(minY, tempParentPoint.y);
  }
  return { x: minX, y: minY };
};

export const applyWorldRotation = (displayObject, view) => {
  if (!displayObject || !view) return;

  const viewAngle = Number(view.angle ?? 0);
  if (Number.isNaN(viewAngle)) return;

  const prevState = displayObject._rotationState ?? {
    compensation: 0,
    basePivotX: displayObject.pivot?.x ?? 0,
    basePivotY: displayObject.pivot?.y ?? 0,
  };
  const baseAngle = (displayObject.angle ?? 0) - (prevState.compensation ?? 0);
  const snapped = snapAngle(viewAngle);
  const compensation = -snapped;
  const hadComp = (prevState.compensation ?? 0) !== 0;
  const needsComp = compensation !== 0;
  if (!hadComp && !needsComp) {
    displayObject._rotationState = {
      compensation: 0,
      viewAngle,
      basePivotX: prevState.basePivotX ?? displayObject.pivot?.x ?? 0,
      basePivotY: prevState.basePivotY ?? displayObject.pivot?.y ?? 0,
    };
    return;
  }

  const prevTopLeft = getBoundsTopLeftInParent(displayObject);
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

  const nextTopLeft = getBoundsTopLeftInParent(displayObject);
  displayObject.position.set(
    displayObject.position.x + (prevTopLeft.x - nextTopLeft.x),
    displayObject.position.y + (prevTopLeft.y - nextTopLeft.y),
  );

  displayObject._rotationState = {
    baseAngle,
    compensation,
    viewAngle,
    pivotX,
    pivotY,
    basePivotX,
    basePivotY,
  };
};
