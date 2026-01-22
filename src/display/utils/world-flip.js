export const applyWorldFlip = (displayObject, view) => {
  if (!displayObject || !view) return;

  const prevState = displayObject._flipState ?? { x: false, y: false };
  const nextState = { x: !!view.flipX, y: !!view.flipY };
  if (prevState.x === nextState.x && prevState.y === nextState.y) {
    return;
  }
  const absScaleX = Math.abs(displayObject.scale?.x ?? 1);
  const absScaleY = Math.abs(displayObject.scale?.y ?? 1);

  displayObject.scale.set(
    absScaleX * (nextState.x ? -1 : 1),
    absScaleY * (nextState.y ? -1 : 1),
  );

  displayObject._flipState = {
    x: nextState.x,
    y: nextState.y,
  };
};
