import { Point } from 'pixi.js';

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

export const applyWorldFlip = (displayObject, view) => {
  if (!displayObject || !view) return;

  const prevState = displayObject._flipState ?? { x: false, y: false };
  const nextState = { x: !!view.flipX, y: !!view.flipY };
  if (prevState.x === nextState.x && prevState.y === nextState.y) {
    return;
  }
  const absScaleX = Math.abs(displayObject.scale?.x ?? 1);
  const absScaleY = Math.abs(displayObject.scale?.y ?? 1);
  const prevAnchor = getBoundsTopLeftInParent(displayObject);

  displayObject.scale.set(
    absScaleX * (nextState.x ? -1 : 1),
    absScaleY * (nextState.y ? -1 : 1),
  );

  const nextAnchor = getBoundsTopLeftInParent(displayObject);
  displayObject.position.set(
    displayObject.position.x + (prevAnchor.x - nextAnchor.x),
    displayObject.position.y + (prevAnchor.y - nextAnchor.y),
  );

  displayObject._flipState = {
    x: nextState.x,
    y: nextState.y,
  };
};
